import { Router, type Request, type Response } from "express";
import { requireAuth } from "./auth.js";
import * as threads from "../services/blogThreadService.js";
import type { DocRef, DocType } from "../services/blogThreadService.js";
import type { BlogThreadStatus } from "@prisma/client";

export const blogThreadsRouter = Router();
blogThreadsRouter.use(requireAuth);

const DOC_TYPES: DocType[] = ["BLOG_POST", "PRESS_KIT"];

/**
 * Any authenticated member may read and comment on a draft — that is what makes
 * review useful. Resolves the doc and returns whether this member is also an
 * editor (which gates accept/reject), or null after sending an error response.
 */
async function resolveDoc(req: Request, res: Response): Promise<{ ref: DocRef; editor: boolean } | null> {
  const docType = req.params.docType as DocType;
  if (!DOC_TYPES.includes(docType)) {
    res.status(400).json({ error: "Unknown docType" });
    return null;
  }
  const ref: DocRef = { docType, docId: req.params.docId as string };
  if (!(await threads.docExists(ref))) {
    res.status(404).json({ error: "Document not found" });
    return null;
  }
  return { ref, editor: await threads.isDocEditor(ref, req.memberId!) };
}

/**
 * Confirms `:cid` is a comment of the `:id` thread. Permissions are derived from
 * the thread named in the URL, so acting on a comment that lives under a
 * different thread would evaluate it against the wrong document's editor set.
 * Returns false after sending a 404 — a mismatched id is indistinguishable from
 * a nonexistent one from the caller's point of view, and deliberately so.
 */
async function requireCommentInThread(req: Request, res: Response): Promise<boolean> {
  const threadId = await threads.getCommentThreadId(req.params.cid as string);
  if (threadId !== (req.params.id as string)) {
    res.status(404).json({ error: "Comment not found" });
    return false;
  }
  return true;
}

/** Same, for routes addressed by thread id rather than doc. */
async function resolveThreadDoc(req: Request, res: Response): Promise<{ ref: DocRef; editor: boolean } | null> {
  const ref = await threads.getThreadDocRef(req.params.id as string);
  if (!ref) {
    res.status(404).json({ error: "Thread not found" });
    return null;
  }
  return { ref, editor: await threads.isDocEditor(ref, req.memberId!) };
}

blogThreadsRouter.get("/docs/:docType/:docId/threads", async (req: Request, res: Response) => {
  try {
    const ctx = await resolveDoc(req, res);
    if (!ctx) return;
    res.json(await threads.listThreads(ctx.ref));
  } catch (err) {
    console.error("[blogThreads] list error:", err);
    res.status(500).json({ error: "Failed to load threads" });
  }
});

blogThreadsRouter.post("/docs/:docType/:docId/threads", async (req: Request, res: Response) => {
  try {
    const ctx = await resolveDoc(req, res);
    if (!ctx) return;
    const { kind, anchorText, body, replaceWith, rationale, origin } = req.body ?? {};
    if (kind !== "COMMENT" && kind !== "SUGGESTION") {
      res.status(400).json({ error: "kind must be COMMENT or SUGGESTION" });
      return;
    }
    if (typeof anchorText !== "string" || !anchorText.trim()) {
      res.status(400).json({ error: "anchorText is required" });
      return;
    }
    if (kind === "COMMENT" && (typeof body !== "string" || !body.trim())) {
      res.status(400).json({ error: "A comment needs a body" });
      return;
    }
    // AI-origin threads are only creatable by document editors, since the AI
    // panel itself is editor-only.
    if (origin === "AI" && !ctx.editor) {
      res.status(403).json({ error: "Only authors can record AI suggestions" });
      return;
    }
    const thread = await threads.createThread(ctx.ref, req.memberId!, {
      kind,
      anchorText,
      body: typeof body === "string" ? body : "",
      replaceWith: typeof replaceWith === "string" ? replaceWith : undefined,
      rationale: typeof rationale === "string" ? rationale : undefined,
      origin: origin === "AI" ? "AI" : "HUMAN",
    });
    res.status(201).json(thread);
  } catch (err) {
    console.error("[blogThreads] create error:", err);
    res.status(500).json({ error: "Failed to create thread" });
  }
});

blogThreadsRouter.patch("/threads/:id", async (req: Request, res: Response) => {
  try {
    const ctx = await resolveThreadDoc(req, res);
    if (!ctx) return;
    const status = req.body?.status as BlogThreadStatus;
    const updated = await threads.setThreadStatus(
      req.params.id as string, req.memberId!, status, ctx.editor,
    );
    if (!updated) {
      res.status(403).json({ error: "Not allowed to set that status" });
      return;
    }
    res.json(updated);
  } catch (err) {
    console.error("[blogThreads] status error:", err);
    res.status(500).json({ error: "Failed to update thread" });
  }
});

blogThreadsRouter.post("/threads/:id/comments", async (req: Request, res: Response) => {
  try {
    const ctx = await resolveThreadDoc(req, res);
    if (!ctx) return;
    const body = req.body?.body;
    if (typeof body !== "string" || !body.trim()) {
      res.status(400).json({ error: "body is required" });
      return;
    }
    res.status(201).json(await threads.addComment(req.params.id as string, req.memberId!, body));
  } catch (err) {
    console.error("[blogThreads] comment error:", err);
    res.status(500).json({ error: "Failed to add comment" });
  }
});

blogThreadsRouter.patch("/threads/:id/comments/:cid", async (req: Request, res: Response) => {
  try {
    const ctx = await resolveThreadDoc(req, res);
    if (!ctx) return;
    if (!(await requireCommentInThread(req, res))) return;
    const body = req.body?.body;
    if (typeof body !== "string" || !body.trim()) {
      res.status(400).json({ error: "body is required" });
      return;
    }
    const updated = await threads.updateComment(req.params.cid as string, req.memberId!, body);
    if (!updated) {
      res.status(403).json({ error: "Only the author can edit a comment" });
      return;
    }
    res.json(updated);
  } catch (err) {
    console.error("[blogThreads] comment edit error:", err);
    res.status(500).json({ error: "Failed to edit comment" });
  }
});

blogThreadsRouter.delete("/threads/:id/comments/:cid", async (req: Request, res: Response) => {
  try {
    const ctx = await resolveThreadDoc(req, res);
    if (!ctx) return;
    if (!(await requireCommentInThread(req, res))) return;
    const updated = await threads.deleteComment(req.params.cid as string, req.memberId!, ctx.editor);
    if (!updated) {
      res.status(403).json({ error: "Not allowed to delete that comment" });
      return;
    }
    res.json(updated);
  } catch (err) {
    console.error("[blogThreads] comment delete error:", err);
    res.status(500).json({ error: "Failed to delete comment" });
  }
});
