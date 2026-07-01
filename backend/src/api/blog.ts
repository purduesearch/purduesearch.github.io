import { Router, type Request, type Response } from "express";
import { requireAuth } from "./auth.js";
import { prisma } from "../db/prisma.js";
import * as blogService from "../services/blogService.js";
import type { BlogStatus } from "@prisma/client";
import type { PMDoc } from "../services/blogRender.js";

export const blogRouter = Router();
blogRouter.use(requireAuth);

async function isAdmin(memberId?: string): Promise<boolean> {
  if (!memberId) return false;
  const m = await prisma.member.findUnique({ where: { id: memberId }, select: { isAdmin: true } });
  return !!m?.isAdmin;
}

// Author-or-admin guard for a post; returns the post or null (and sends the response).
async function requirePostAccess(req: Request, res: Response) {
  const post = await prisma.blogPost.findUnique({ where: { id: req.params.id as string } });
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return null;
  }
  if (post.createdById !== req.memberId && !(await isAdmin(req.memberId))) {
    // Co-authors may also edit.
    const isAuthor = await prisma.blogAuthor.findUnique({
      where: { postId_memberId: { postId: post.id, memberId: req.memberId! } },
      select: { id: true },
    });
    if (!isAuthor) {
      res.status(403).json({ error: "Forbidden" });
      return null;
    }
  }
  return post;
}

// ── Posts ────────────────────────────────────────────────────

blogRouter.get("/posts", async (req: Request, res: Response) => {
  try {
    const { status, mine, q } = req.query as { status?: string; mine?: string; q?: string };
    const posts = await blogService.listPosts({
      status: status as BlogStatus | undefined,
      createdById: mine === "1" ? req.memberId : undefined,
      q: typeof q === "string" ? q : undefined,
    });
    res.json(posts);
  } catch (error) {
    console.error("GET /blog/posts error:", error);
    res.status(500).json({ error: "Failed to list posts" });
  }
});

blogRouter.post("/posts", async (req: Request, res: Response) => {
  try {
    const { title, contentJson, excerpt, slug, coverImageUrl } = req.body as {
      title?: string;
      contentJson?: PMDoc;
      excerpt?: string;
      slug?: string;
      coverImageUrl?: string;
    };
    if (!title?.trim()) {
      res.status(400).json({ error: "title is required" });
      return;
    }
    const post = await blogService.createPost({
      title: title.trim(),
      contentJson,
      excerpt,
      slug,
      coverImageUrl,
      createdById: req.memberId!,
    });
    res.status(201).json(post);
  } catch (error) {
    console.error("POST /blog/posts error:", error);
    res.status(500).json({ error: "Failed to create post" });
  }
});

blogRouter.get("/posts/:id", async (req: Request, res: Response) => {
  try {
    const post = await blogService.getPost(req.params.id as string);
    if (!post) {
      res.status(404).json({ error: "Post not found" });
      return;
    }
    res.json(post);
  } catch (error) {
    console.error("GET /blog/posts/:id error:", error);
    res.status(500).json({ error: "Failed to get post" });
  }
});

blogRouter.patch("/posts/:id", async (req: Request, res: Response) => {
  try {
    if (!(await requirePostAccess(req, res))) return;
    const updated = await blogService.updatePost(req.params.id as string, req.body);
    res.json(updated);
  } catch (error) {
    console.error("PATCH /blog/posts/:id error:", error);
    res.status(500).json({ error: "Failed to update post" });
  }
});

blogRouter.delete("/posts/:id", async (req: Request, res: Response) => {
  try {
    if (!(await requirePostAccess(req, res))) return;
    await blogService.deletePost(req.params.id as string);
    res.json({ ok: true });
  } catch (error) {
    console.error("DELETE /blog/posts/:id error:", error);
    res.status(500).json({ error: "Failed to delete post" });
  }
});

// ── Workflow ─────────────────────────────────────────────────

blogRouter.post("/posts/:id/publish", async (req: Request, res: Response) => {
  try {
    if (!(await requirePostAccess(req, res))) return;
    const post = await blogService.publishPost(req.params.id as string, req.memberId!);
    res.json(post);
  } catch (error) {
    console.error("POST /blog/posts/:id/publish error:", error);
    res.status(500).json({ error: "Failed to publish post" });
  }
});

blogRouter.post("/posts/:id/schedule", async (req: Request, res: Response) => {
  try {
    if (!(await requirePostAccess(req, res))) return;
    const { scheduledAt } = req.body as { scheduledAt?: string };
    const when = scheduledAt ? new Date(scheduledAt) : null;
    if (!when || isNaN(when.getTime())) {
      res.status(400).json({ error: "valid scheduledAt is required" });
      return;
    }
    const post = await blogService.schedulePost(req.params.id as string, when);
    res.json(post);
  } catch (error) {
    console.error("POST /blog/posts/:id/schedule error:", error);
    res.status(500).json({ error: "Failed to schedule post" });
  }
});

blogRouter.post("/posts/:id/unpublish", async (req: Request, res: Response) => {
  try {
    if (!(await requirePostAccess(req, res))) return;
    res.json(await blogService.unpublishPost(req.params.id as string));
  } catch (error) {
    console.error("POST /blog/posts/:id/unpublish error:", error);
    res.status(500).json({ error: "Failed to unpublish post" });
  }
});

blogRouter.post("/posts/:id/archive", async (req: Request, res: Response) => {
  try {
    if (!(await requirePostAccess(req, res))) return;
    res.json(await blogService.archivePost(req.params.id as string));
  } catch (error) {
    console.error("POST /blog/posts/:id/archive error:", error);
    res.status(500).json({ error: "Failed to archive post" });
  }
});

// ── Revisions ────────────────────────────────────────────────

blogRouter.get("/posts/:id/revisions", async (req: Request, res: Response) => {
  try {
    res.json(await blogService.listRevisions(req.params.id as string));
  } catch (error) {
    console.error("GET /blog/posts/:id/revisions error:", error);
    res.status(500).json({ error: "Failed to list revisions" });
  }
});

blogRouter.post("/posts/:id/revisions/:revId/rollback", async (req: Request, res: Response) => {
  try {
    if (!(await requirePostAccess(req, res))) return;
    const post = await blogService.rollbackRevision(
      req.params.id as string,
      req.params.revId as string,
      req.memberId!
    );
    res.json(post);
  } catch (error) {
    if (error instanceof Error && error.message === "Revision not found") {
      res.status(404).json({ error: error.message });
      return;
    }
    console.error("POST /blog/posts/:id/revisions/:revId/rollback error:", error);
    res.status(500).json({ error: "Failed to roll back" });
  }
});

// ── Taxonomy ─────────────────────────────────────────────────

blogRouter.get("/tags", async (_req: Request, res: Response) => {
  res.json(await blogService.listTags());
});

blogRouter.post("/tags", async (req: Request, res: Response) => {
  try {
    const { name } = req.body as { name?: string };
    if (!name?.trim()) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    res.status(201).json(await blogService.createTag(name.trim()));
  } catch (error) {
    console.error("POST /blog/tags error:", error);
    res.status(500).json({ error: "Failed to create tag" });
  }
});

blogRouter.get("/categories", async (_req: Request, res: Response) => {
  res.json(await blogService.listCategories());
});

blogRouter.post("/categories", async (req: Request, res: Response) => {
  try {
    const { name } = req.body as { name?: string };
    if (!name?.trim()) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    res.status(201).json(await blogService.createCategory(name.trim()));
  } catch (error) {
    console.error("POST /blog/categories error:", error);
    res.status(500).json({ error: "Failed to create category" });
  }
});

blogRouter.put("/posts/:id/taxonomy", async (req: Request, res: Response) => {
  try {
    if (!(await requirePostAccess(req, res))) return;
    const { tagIds, categoryIds } = req.body as { tagIds?: string[]; categoryIds?: string[] };
    res.json(await blogService.setPostTaxonomy(req.params.id as string, tagIds, categoryIds));
  } catch (error) {
    console.error("PUT /blog/posts/:id/taxonomy error:", error);
    res.status(500).json({ error: "Failed to set taxonomy" });
  }
});

// ── Snippets ─────────────────────────────────────────────────

blogRouter.get("/snippets", async (_req: Request, res: Response) => {
  res.json(await blogService.listSnippets());
});

blogRouter.post("/snippets", async (req: Request, res: Response) => {
  try {
    const { name, contentJson } = req.body as { name?: string; contentJson?: PMDoc };
    if (!name?.trim() || !contentJson) {
      res.status(400).json({ error: "name and contentJson are required" });
      return;
    }
    res.status(201).json(await blogService.createSnippet(name.trim(), contentJson, req.memberId!));
  } catch (error) {
    console.error("POST /blog/snippets error:", error);
    res.status(500).json({ error: "Failed to create snippet" });
  }
});

blogRouter.patch("/snippets/:id", async (req: Request, res: Response) => {
  try {
    const { name, contentJson } = req.body as { name?: string; contentJson?: PMDoc };
    res.json(await blogService.updateSnippet(req.params.id as string, { name, contentJson }));
  } catch (error) {
    console.error("PATCH /blog/snippets/:id error:", error);
    res.status(500).json({ error: "Failed to update snippet" });
  }
});

blogRouter.delete("/snippets/:id", async (req: Request, res: Response) => {
  try {
    await blogService.deleteSnippet(req.params.id as string);
    res.json({ ok: true });
  } catch (error) {
    console.error("DELETE /blog/snippets/:id error:", error);
    res.status(500).json({ error: "Failed to delete snippet" });
  }
});

// ── Authors ──────────────────────────────────────────────────

blogRouter.post("/posts/:id/authors", async (req: Request, res: Response) => {
  try {
    if (!(await requirePostAccess(req, res))) return;
    const { memberId, role } = req.body as { memberId?: string; role?: string };
    if (!memberId) {
      res.status(400).json({ error: "memberId is required" });
      return;
    }
    res.status(201).json(await blogService.addAuthor(req.params.id as string, memberId, role));
  } catch (error) {
    console.error("POST /blog/posts/:id/authors error:", error);
    res.status(500).json({ error: "Failed to add author" });
  }
});

blogRouter.delete("/posts/:id/authors/:memberId", async (req: Request, res: Response) => {
  try {
    if (!(await requirePostAccess(req, res))) return;
    await blogService.removeAuthor(req.params.id as string, req.params.memberId as string);
    res.json({ ok: true });
  } catch (error) {
    console.error("DELETE /blog/posts/:id/authors/:memberId error:", error);
    res.status(500).json({ error: "Failed to remove author" });
  }
});
