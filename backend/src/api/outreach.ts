import { Router, type Request, type Response } from "express";
import { requireAuth } from "./auth.js";
import { prisma } from "../db/prisma.js";
import * as outreachService from "../services/outreachService.js";
import * as aiOutreachService from "../services/aiOutreachService.js";
import * as utmService from "../services/utmService.js";
import { queueDm } from "../services/dmBatcher.js";
import type { SubmissionStatus, SubmissionType } from "@prisma/client";

export const outreachRouter = Router();
outreachRouter.use(requireAuth);

// ── GET /submissions ─────────────────────────────────────────

outreachRouter.get("/submissions", async (req: Request, res: Response) => {
  try {
    const { status, type, projectId, platform, from, to } = req.query;

    const filters: outreachService.ListSubmissionsFilters = {};
    if (status) filters.status = status as SubmissionStatus;
    if (type) filters.type = type as SubmissionType;
    if (projectId && typeof projectId === "string") filters.projectId = projectId;
    if (from && typeof from === "string") filters.from = new Date(from);
    if (to && typeof to === "string") filters.to = new Date(to);

    // platform filter: comma-separated list → filter by any matching platform
    // (applied post-query since Prisma array contains is per-element)
    let submissions = await outreachService.listSubmissions(filters);

    if (platform && typeof platform === "string") {
      const platforms = platform.split(",").map((p) => p.trim()).filter(Boolean);
      if (platforms.length > 0) {
        submissions = submissions.filter((s) =>
          platforms.some((p) => s.platform.includes(p))
        );
      }
    }

    res.json(submissions);
  } catch (error) {
    console.error("GET /submissions error:", error);
    res.status(500).json({ error: "Failed to list submissions" });
  }
});

// ── GET /submissions/:id ─────────────────────────────────────

outreachRouter.get("/submissions/:id", async (req: Request, res: Response) => {
  try {
    const submission = await outreachService.getSubmission(req.params.id as string);
    if (!submission) {
      res.status(404).json({ error: "Submission not found" });
      return;
    }
    res.json(submission);
  } catch (error) {
    console.error("GET /submissions/:id error:", error);
    res.status(500).json({ error: "Failed to get submission" });
  }
});

// ── POST /submissions ────────────────────────────────────────

outreachRouter.post("/submissions", async (req: Request, res: Response) => {
  try {
    const {
      title,
      type,
      content,
      mediaUrls,
      platform,
      projectId,
      eventId,
      scheduledAt,
    } = req.body as {
      title: string;
      type: SubmissionType;
      content?: string;
      mediaUrls?: string[];
      platform?: string[];
      projectId?: string;
      eventId?: string;
      scheduledAt?: string;
    };

    if (!title || !type) {
      res.status(400).json({ error: "title and type are required" });
      return;
    }

    const submission = await outreachService.createSubmission({
      title,
      type,
      content,
      mediaUrls,
      platform,
      projectId,
      eventId,
      authorId: req.session.memberId!,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
    });

    res.status(201).json(submission);
  } catch (error) {
    console.error("POST /submissions error:", error);
    res.status(500).json({ error: "Failed to create submission" });
  }
});

// ── PATCH /submissions/:id ───────────────────────────────────

outreachRouter.patch("/submissions/:id", async (req: Request, res: Response) => {
  try {
    const submission = await outreachService.getSubmission(req.params.id as string);
    if (!submission) {
      res.status(404).json({ error: "Submission not found" });
      return;
    }

    // Check: author or admin
    if (submission.authorId !== req.session.memberId) {
      const member = await prisma.member.findUnique({
        where: { id: req.session.memberId },
        select: { isAdmin: true },
      });
      if (!member?.isAdmin) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }

    const {
      title,
      type,
      status,
      content,
      mediaUrls,
      platform,
      projectId,
      eventId,
      reviewNote,
      scheduledAt,
    } = req.body as {
      title?: string;
      type?: SubmissionType;
      status?: SubmissionStatus;
      content?: string;
      mediaUrls?: string[];
      platform?: string[];
      projectId?: string | null;
      eventId?: string | null;
      reviewNote?: string | null;
      scheduledAt?: string | null;
    };

    const updated = await outreachService.updateSubmission(req.params.id as string, {
      title,
      type,
      status,
      content,
      mediaUrls,
      platform,
      projectId,
      eventId,
      reviewNote,
      scheduledAt: scheduledAt != null ? new Date(scheduledAt) : scheduledAt,
    });

    res.json(updated);
  } catch (error) {
    console.error("PATCH /submissions/:id error:", error);
    res.status(500).json({ error: "Failed to update submission" });
  }
});

// ── DELETE /submissions/:id ──────────────────────────────────

outreachRouter.delete("/submissions/:id", async (req: Request, res: Response) => {
  try {
    const submission = await outreachService.getSubmission(req.params.id as string);
    if (!submission) {
      res.status(404).json({ error: "Submission not found" });
      return;
    }

    // Check: author or admin
    if (submission.authorId !== req.session.memberId) {
      const member = await prisma.member.findUnique({
        where: { id: req.session.memberId },
        select: { isAdmin: true },
      });
      if (!member?.isAdmin) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }

    await outreachService.deleteSubmission(req.params.id as string);
    res.json({ ok: true });
  } catch (error) {
    console.error("DELETE /submissions/:id error:", error);
    res.status(500).json({ error: "Failed to delete submission" });
  }
});

// ── POST /submissions/:id/review ─────────────────────────────

outreachRouter.post(
  "/submissions/:id/review",
  async (req: Request, res: Response) => {
    try {
      // Admin only
      const member = await prisma.member.findUnique({
        where: { id: req.session.memberId },
        select: { isAdmin: true },
      });
      if (!member?.isAdmin) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      const { status, note } = req.body as {
        status: "APPROVED" | "REJECTED" | "IN_REVIEW";
        note?: string;
      };

      if (!status || !["APPROVED", "REJECTED", "IN_REVIEW"].includes(status)) {
        res.status(400).json({ error: "status must be APPROVED, REJECTED, or IN_REVIEW" });
        return;
      }

      const submission = await outreachService.getSubmission(req.params.id as string);
      if (!submission) {
        res.status(404).json({ error: "Submission not found" });
        return;
      }

      const updated = await outreachService.reviewSubmission(
        req.params.id as string,
        req.session.memberId!,
        status,
        note
      );

      // Notify the submission author via Slack DM (fire-and-forget)
      const authorSlackId = updated.author?.slackId;
      if (authorSlackId) {
        let dmText: string;
        if (status === "APPROVED") {
          dmText = `✅ Your submission "*${updated.title}*" has been approved! It's ready to be published.`;
        } else if (status === "REJECTED") {
          dmText = `❌ Your submission "*${updated.title}*" was not approved.${note ? `\nReviewer note: ${note}` : ""}`;
        } else {
          // IN_REVIEW
          dmText = `👀 Your submission "*${updated.title}*" is now under review.`;
        }
        Promise.resolve(queueDm(authorSlackId, dmText)).catch(console.error);
      }

      res.json(updated);
    } catch (error) {
      console.error("POST /submissions/:id/review error:", error);
      res.status(500).json({ error: "Failed to review submission" });
    }
  }
);

// ── GET /recommendations ─────────────────────────────────────

outreachRouter.get("/recommendations", async (_req: Request, res: Response) => {
  try {
    const digest = await outreachService.getOutreachDigest();
    res.json(digest);
  } catch (error) {
    console.error("GET /recommendations error:", error);
    res.status(500).json({ error: "Failed to get recommendations" });
  }
});

// ── GET /calendar ────────────────────────────────────────────

outreachRouter.get("/calendar", async (req: Request, res: Response) => {
  try {
    const { from, to } = req.query;

    if (!from || typeof from !== "string" || !to || typeof to !== "string") {
      res.status(400).json({ error: "from and to query params (ISO dates) are required" });
      return;
    }

    const fromDate = new Date(from);
    const toDate = new Date(to);

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      res.status(400).json({ error: "from and to must be valid ISO dates" });
      return;
    }

    const calendar = await outreachService.getContentCalendar(fromDate, toDate);
    res.json(calendar);
  } catch (error) {
    console.error("GET /calendar error:", error);
    res.status(500).json({ error: "Failed to get content calendar" });
  }
});

// ── GET /submissions/:id/comments ──────────────────────────────

outreachRouter.get("/submissions/:id/comments", async (req: Request, res: Response) => {
  try {
    const submission = await outreachService.getSubmission(req.params.id as string);
    if (!submission) {
      res.status(404).json({ error: "Submission not found" });
      return;
    }
    const comments = await outreachService.listComments(req.params.id as string);
    res.json(comments);
  } catch (error) {
    console.error("GET /submissions/:id/comments error:", error);
    res.status(500).json({ error: "Failed to list comments" });
  }
});

// ── GET /hashtags ────────────────────────────────────────────

outreachRouter.get("/hashtags", async (req: Request, res: Response) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    const hashtags = await outreachService.listHashtags(q);
    res.json(hashtags);
  } catch (error) {
    console.error("GET /hashtags error:", error);
    res.status(500).json({ error: "Failed to list hashtags" });
  }
});

// ── POST /hashtags/seed ──────────────────────────────────────

outreachRouter.post("/hashtags/seed", async (req: Request, res: Response) => {
  try {
    // Admin only
    const member = await prisma.member.findUnique({
      where: { id: req.session.memberId },
      select: { isAdmin: true },
    });
    if (!member?.isAdmin) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const count = await outreachService.seedHashtagsFromSubmissions();
    res.json({ seeded: count });
  } catch (error) {
    console.error("POST /hashtags/seed error:", error);
    res.status(500).json({ error: "Failed to seed hashtags" });
  }
});

// ── POST /submissions/:id/comments ─────────────────────────────

outreachRouter.post("/submissions/:id/comments", async (req: Request, res: Response) => {
  try {
    const submission = await outreachService.getSubmission(req.params.id as string);
    if (!submission) {
      res.status(404).json({ error: "Submission not found" });
      return;
    }
    const { body, mentions, parentId } = req.body as {
      body: string;
      mentions?: string[];
      parentId?: string;
    };
    if (!body?.trim()) {
      res.status(400).json({ error: "body is required" });
      return;
    }
    const comment = await outreachService.addComment(
      req.params.id as string,
      req.session.memberId!,
      body,
      mentions,
      parentId
    );
    res.status(201).json(comment);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Invalid parentId")) {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error("POST /submissions/:id/comments error:", error);
    res.status(500).json({ error: "Failed to add comment" });
  }
});

// ── AI routes ────────────────────────────────────────────────

// POST /submissions/:id/ai/draft
outreachRouter.post("/submissions/:id/ai/draft", async (req: Request, res: Response) => {
  try {
    const submission = await outreachService.getSubmission(req.params.id as string);
    if (!submission) {
      res.status(404).json({ error: "Submission not found" });
      return;
    }

    const { platform, voiceName } = req.body as {
      platform?: string;
      voiceName?: string;
    };

    const brief = submission.content ?? submission.title;
    const variants = await aiOutreachService.generateCaptionVariants(
      brief,
      platform,
      voiceName
    );
    res.json({ variants });
  } catch (error) {
    console.error("POST /submissions/:id/ai/draft error:", error);
    res.status(500).json({ error: "Failed to generate caption variants" });
  }
});

// POST /submissions/:id/ai/hashtags
outreachRouter.post("/submissions/:id/ai/hashtags", async (req: Request, res: Response) => {
  try {
    const submission = await outreachService.getSubmission(req.params.id as string);
    if (!submission) {
      res.status(404).json({ error: "Submission not found" });
      return;
    }

    const topHashtagStats = await outreachService.listHashtags();
    const topTags = topHashtagStats.slice(0, 20).map((h) => h.tag);

    const content = submission.content ?? submission.title;
    const hashtags = await aiOutreachService.suggestHashtags(content, topTags);
    res.json({ hashtags });
  } catch (error) {
    console.error("POST /submissions/:id/ai/hashtags error:", error);
    res.status(500).json({ error: "Failed to suggest hashtags" });
  }
});

// POST /submissions/:id/ai/alt-text
outreachRouter.post("/submissions/:id/ai/alt-text", async (req: Request, res: Response) => {
  try {
    const { imageUrl } = req.body as { imageUrl: string };
    if (!imageUrl) {
      res.status(400).json({ error: "imageUrl is required" });
      return;
    }

    const altText = await aiOutreachService.generateAltText(imageUrl);
    res.json({ altText });
  } catch (error) {
    console.error("POST /submissions/:id/ai/alt-text error:", error);
    res.status(500).json({ error: "Failed to generate alt text" });
  }
});

// POST /submissions/:id/ai/voice
outreachRouter.post("/submissions/:id/ai/voice", async (req: Request, res: Response) => {
  try {
    const submission = await outreachService.getSubmission(req.params.id as string);
    if (!submission) {
      res.status(404).json({ error: "Submission not found" });
      return;
    }

    const { voiceName } = req.body as { voiceName: string };
    if (!voiceName) {
      res.status(400).json({ error: "voiceName is required" });
      return;
    }

    const brandVoice = await prisma.brandVoice.findFirst({
      where: { name: voiceName },
    });
    if (!brandVoice) {
      res.status(404).json({ error: `Brand voice "${voiceName}" not found` });
      return;
    }

    const content = submission.content ?? submission.title;
    const rewritten = await aiOutreachService.rewriteInVoice(
      content,
      brandVoice.name,
      brandVoice.examples
    );
    res.json({ content: rewritten });
  } catch (error) {
    console.error("POST /submissions/:id/ai/voice error:", error);
    res.status(500).json({ error: "Failed to rewrite in voice" });
  }
});

// ── UTM link routes ──────────────────────────────────────────

// GET /submissions/:id/utm-links
outreachRouter.get("/submissions/:id/utm-links", async (req: Request, res: Response) => {
  try {
    const submission = await outreachService.getSubmission(req.params.id as string);
    if (!submission) {
      res.status(404).json({ error: "Submission not found" });
      return;
    }
    const links = await utmService.getLinksForSubmission(req.params.id as string);
    res.json(links);
  } catch (error) {
    console.error("GET /submissions/:id/utm-links error:", error);
    res.status(500).json({ error: "Failed to get UTM links" });
  }
});

// POST /submissions/:id/utm-links
outreachRouter.post("/submissions/:id/utm-links", async (req: Request, res: Response) => {
  try {
    const submission = await outreachService.getSubmission(req.params.id as string);
    if (!submission) {
      res.status(404).json({ error: "Submission not found" });
      return;
    }

    const { targetUrl, platform } = req.body as {
      targetUrl: string;
      platform?: string;
    };

    if (!targetUrl?.trim()) {
      res.status(400).json({ error: "targetUrl is required" });
      return;
    }

    const link = await utmService.createUtmLink(
      targetUrl,
      req.params.id as string,
      platform
    );
    res.status(201).json(link);
  } catch (error) {
    console.error("POST /submissions/:id/utm-links error:", error);
    res.status(500).json({ error: "Failed to create UTM link" });
  }
});

// DELETE /submissions/:id/utm-links/:code
outreachRouter.delete("/submissions/:id/utm-links/:code", async (req: Request, res: Response) => {
  try {
    const submission = await outreachService.getSubmission(req.params.id as string);
    if (!submission) {
      res.status(404).json({ error: "Submission not found" });
      return;
    }
    await utmService.deleteLink(req.params.code as string);
    res.json({ ok: true });
  } catch (error) {
    console.error("DELETE /submissions/:id/utm-links/:code error:", error);
    res.status(500).json({ error: "Failed to delete UTM link" });
  }
});
