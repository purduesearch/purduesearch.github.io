import { Router, type Request, type Response } from "express";
import multer from "multer";
import sharp from "sharp";
import { requireAuth } from "./auth.js";
import { prisma } from "../db/prisma.js";
import * as blogService from "../services/blogService.js";
import { uploadImageToDrive } from "../services/driveService.js";
import type { BlogStatus } from "@prisma/client";
import type { PMDoc } from "../services/blogRender.js";

export const blogRouter = Router();
blogRouter.use(requireAuth);

// In-memory upload; images are recompressed with sharp before hitting Drive.
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype.startsWith("image/"));
  },
});

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

// POST /posts/generate — AI-generate a section-based DRAFT from raw text.
// Body: { text (required), title? (optional override), guidance? (tone/angle) }.
blogRouter.post("/posts/generate", async (req: Request, res: Response) => {
  try {
    const { text, title, guidance } = req.body as { text?: string; title?: string; guidance?: string };
    if (!text?.trim()) {
      res.status(400).json({ error: "text is required" });
      return;
    }
    const { generateBlogFromText } = await import("../services/aiOutreachService.js");
    const { buildDocFromPlan } = await import("../services/sectionPlan.js");

    const plan = await generateBlogFromText(
      text.trim(),
      title?.trim() || undefined,
      guidance?.trim() || undefined,
    );
    const doc = buildDocFromPlan(plan);
    const heroHeading = plan.sections.find((s) => s.type === "hero")?.heading?.trim();
    const finalTitle = (title?.trim() || heroHeading || "Untitled post").slice(0, 200);

    const post = await blogService.createPost({
      title: finalTitle,
      contentJson: doc,
      createdById: req.memberId!,
    });
    res.status(201).json(post);
  } catch (error) {
    console.error("POST /blog/posts/generate error:", error);
    res.status(500).json({ error: "Failed to generate post" });
  }
});

// POST /posts/generate-doc — same AI pipeline as /posts/generate, but returns
// the section doc instead of persisting a new post, so the editor's AI panel can
// drop a generated article into the post the author already has open.
blogRouter.post("/posts/generate-doc", async (req: Request, res: Response) => {
  try {
    const { text, title, guidance } = req.body as { text?: string; title?: string; guidance?: string };
    if (!text?.trim()) {
      res.status(400).json({ error: "text is required" });
      return;
    }
    const { generateBlogFromText } = await import("../services/aiOutreachService.js");
    const { buildDocFromPlan } = await import("../services/sectionPlan.js");

    const plan = await generateBlogFromText(
      text.trim(),
      title?.trim() || undefined,
      guidance?.trim() || undefined,
    );
    const doc = buildDocFromPlan(plan);
    const heroHeading = plan.sections.find((s) => s.type === "hero")?.heading?.trim();
    const suggestedTitle = (title?.trim() || heroHeading || "").slice(0, 200);

    res.json({ title: suggestedTitle, doc });
  } catch (error) {
    console.error("POST /blog/posts/generate-doc error:", error);
    res.status(500).json({ error: "Failed to generate post" });
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

// Render the current (possibly unsaved) document exactly as publish would.
// Preview MUST go through renderJsonToHtml so it cannot drift from the
// published page — this is the whole point of the endpoint existing.
blogRouter.post("/posts/:id/preview", async (req: Request, res: Response) => {
  try {
    const post = await requirePostAccess(req, res);
    if (!post) return;

    const { contentJson } = req.body as { contentJson?: PMDoc };
    const doc = (contentJson ?? post.contentJson) as PMDoc;
    const origin = `${req.protocol}://${req.get("host")}`;
    const { renderJsonToHtml } = await import("../services/blogRender.js");

    res.json({
      html: renderJsonToHtml(doc, origin),
      meta: {
        title: post.title,
        coverImageUrl: post.coverImageUrl,
        authorName: post.authorName,
        publishedAt: post.publishedAt,
        readingTimeMin: post.readingTimeMin,
        theme: post.theme,
      },
    });
  } catch (error) {
    console.error("POST /blog/posts/:id/preview error:", error);
    res.status(500).json({ error: "Failed to render preview" });
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

// ── Media upload ─────────────────────────────────────────────
// Multipart field `image`; recompresses to webp (max 1600px wide) and stores on
// Google Drive. Returns { url, width, height } for the editor image node.

blogRouter.post(
  "/upload",
  imageUpload.single("image"),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "image file is required" });
        return;
      }
      const { data, info } = await sharp(req.file.buffer)
        .rotate() // honor EXIF orientation before stripping metadata
        .resize({ width: 1600, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer({ resolveWithObject: true });

      const folderId =
        process.env.DRIVE_BLOG_IMAGES_FOLDER_ID ||
        process.env.DRIVE_AI_IMAGES_FOLDER_ID ||
        undefined;
      const filename = `blog-${Date.now()}.webp`;
      const uploaded = await uploadImageToDrive(
        data.toString("base64"),
        "image/webp",
        filename,
        folderId
      );
      if (!uploaded) {
        res.status(502).json({ error: "Failed to upload image" });
        return;
      }
      const origin = `${req.protocol}://${req.get("host")}`;
      res.json({
        url: `${origin}/api/public/blog-image/${uploaded.fileId}`,
        width: info.width,
        height: info.height,
      });
    } catch (error) {
      console.error("POST /blog/upload error:", error);
      res.status(500).json({ error: "Failed to process image" });
    }
  }
);

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

// ── Draft annotations ───────────────────────────────────────────

blogRouter.get("/posts/:id/annotations", async (req: Request, res: Response) => {
  try {
    res.json(await blogService.listAnnotations(req.params.id as string));
  } catch (error) {
    console.error("GET /blog/posts/:id/annotations error:", error);
    res.status(500).json({ error: "Failed to list annotations" });
  }
});

blogRouter.post("/posts/:id/annotations", async (req: Request, res: Response) => {
  try {
    const { body, mentions, parentId } = req.body as {
      body?: string;
      mentions?: string[];
      parentId?: string;
    };
    if (!body?.trim()) {
      res.status(400).json({ error: "body is required" });
      return;
    }
    const annotation = await blogService.addAnnotation(
      req.params.id as string,
      req.memberId!,
      body,
      mentions,
      parentId
    );
    res.status(201).json(annotation);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Invalid parentId")) {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error("POST /blog/posts/:id/annotations error:", error);
    res.status(500).json({ error: "Failed to add annotation" });
  }
});
