import { Router, type Request, type Response } from "express";
import { requireAuth } from "./auth.js";
import { prisma } from "../db/prisma.js";
import * as ai from "../services/blogAiService.js";
import { isDocEditor, type DocRef, type DocType } from "../services/blogThreadService.js";
import { GeminiRateLimitError } from "../services/geminiService.js";

export const blogAiRouter = Router();
blogAiRouter.use(requireAuth);

const DOC_TYPES: DocType[] = ["BLOG_POST", "PRESS_KIT"];

/** Loads the doc's title + content, but only for members who may edit it. */
async function loadDoc(req: Request, res: Response): Promise<{ title: string; doc: unknown } | null> {
  const docType = req.body?.docType as DocType;
  const docId = req.body?.docId as string;
  if (!DOC_TYPES.includes(docType) || typeof docId !== "string" || !docId) {
    res.status(400).json({ error: "docType and docId are required" });
    return null;
  }
  const ref: DocRef = { docType, docId };
  if (!(await isDocEditor(ref, req.memberId!))) {
    // Covers both "not found" and "not yours" — no reason to distinguish.
    res.status(403).json({ error: "Only the post's authors can use AI here" });
    return null;
  }
  if (docType === "BLOG_POST") {
    const post = await prisma.blogPost.findUnique({
      where: { id: docId }, select: { title: true, contentJson: true },
    });
    if (!post) { res.status(404).json({ error: "Post not found" }); return null; }
    return { title: post.title, doc: post.contentJson };
  }
  const kit = await prisma.projectPressKit.findUnique({
    where: { id: docId },
    select: { contentJson: true, project: { select: { name: true } } },
  });
  if (!kit) { res.status(404).json({ error: "Press kit not found" }); return null; }
  return { title: `${kit.project?.name ?? "Project"} press kit`, doc: kit.contentJson };
}

function handleErr(res: Response, err: unknown, label: string) {
  if (err instanceof GeminiRateLimitError) {
    res.status(429).json({ error: "AI is busy right now — try again in a minute" });
    return;
  }
  console.error(`[blogAi] ${label} error:`, err);
  res.status(500).json({ error: "AI request failed" });
}

blogAiRouter.post("/ai/ask", async (req: Request, res: Response) => {
  try {
    const ctx = await loadDoc(req, res);
    if (!ctx) return;
    const question = req.body?.question;
    if (typeof question !== "string" || !question.trim()) {
      res.status(400).json({ error: "question is required" });
      return;
    }
    const answer = await ai.askAboutDoc({ title: ctx.title, doc: ctx.doc, question });
    res.json({ answer });
  } catch (err) { handleErr(res, err, "ask"); }
});

blogAiRouter.post("/ai/edit", async (req: Request, res: Response) => {
  try {
    const ctx = await loadDoc(req, res);
    if (!ctx) return;
    const { instruction, scope, selection } = req.body ?? {};
    if (typeof instruction !== "string" || !instruction.trim()) {
      res.status(400).json({ error: "instruction is required" });
      return;
    }
    if (scope !== "selection" && scope !== "document") {
      res.status(400).json({ error: "scope must be 'selection' or 'document'" });
      return;
    }
    if (scope === "selection" && (typeof selection !== "string" || !selection.trim())) {
      res.status(400).json({ error: "selection is required when scope is 'selection'" });
      return;
    }
    const edits = await ai.suggestEdits({
      title: ctx.title, doc: ctx.doc, instruction, scope,
      selection: typeof selection === "string" ? selection : undefined,
    });
    res.json({ edits });
  } catch (err) { handleErr(res, err, "edit"); }
});

blogAiRouter.post("/ai/complete", async (req: Request, res: Response) => {
  try {
    const ctx = await loadDoc(req, res);
    if (!ctx) return;
    const before = req.body?.before;
    if (typeof before !== "string" || before.trim().length < 3) {
      res.json({ completion: "" });
      return;
    }
    // Only the tail matters, and a short prompt is what keeps this lane cheap.
    const completion = await ai.completeText({ title: ctx.title, before: before.slice(-1500) });
    res.json({ completion });
  } catch (err) { handleErr(res, err, "complete"); }
});
