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
      isTemplate,
      placeholders,
    } = req.body as {
      title: string;
      type: SubmissionType;
      content?: string;
      mediaUrls?: string[];
      platform?: string[];
      projectId?: string;
      eventId?: string;
      scheduledAt?: string;
      isTemplate?: boolean;
      placeholders?: unknown;
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
      authorId: req.memberId!,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
      isTemplate,
      placeholders,
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
    if (submission.authorId !== req.memberId) {
      const member = await prisma.member.findUnique({
        where: { id: req.memberId },
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
      isTemplate,
      placeholders,
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
      isTemplate?: boolean;
      placeholders?: unknown;
    };

    // Approval gate: block status transition to APPROVED if campaign has
    // requiredApprovers and not all have signed off (admin override via
    // ?override=1 query bypasses this).
    if (status === "APPROVED" && submission.status !== "APPROVED" && submission.campaignId) {
      const campaign = await prisma.campaign.findUnique({
        where:  { id: submission.campaignId },
        select: { requiredApprovers: true },
      });
      const required = campaign?.requiredApprovers ?? [];
      if (required.length > 0) {
        const approvals = await prisma.approvalRecord.findMany({
          where:  { submissionId: submission.id },
          select: { approverId: true },
        });
        const approvedIds = new Set(approvals.map(a => a.approverId));
        const missing = required.filter(id => !approvedIds.has(id));
        if (missing.length > 0 && req.query.override !== "1") {
          res.status(409).json({
            error: "Approval workflow incomplete",
            missingApproverIds: missing,
          });
          return;
        }
      }
    }

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
      isTemplate,
      placeholders,
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
    if (submission.authorId !== req.memberId) {
      const member = await prisma.member.findUnique({
        where: { id: req.memberId },
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
        where: { id: req.memberId },
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
        req.memberId!,
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
      where: { id: req.memberId },
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
      req.memberId!,
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

// ── Standalone AI routes (no submission ID — for Composer) ───

// POST /ai/draft
outreachRouter.post("/ai/draft", async (req: Request, res: Response) => {
  try {
    const { content, platform, voiceName } = req.body as {
      content: string;
      platform?: string;
      voiceName?: string;
    };
    if (!content?.trim()) {
      res.status(400).json({ error: "content is required" });
      return;
    }
    const variants = await aiOutreachService.generateCaptionVariants(content, platform, voiceName);
    res.json({ variants });
  } catch (error) {
    console.error("POST /ai/draft error:", error);
    res.status(500).json({ error: "Failed to generate caption variants" });
  }
});

// POST /ai/hashtags
outreachRouter.post("/ai/hashtags", async (req: Request, res: Response) => {
  try {
    const { content } = req.body as { content: string };
    if (!content?.trim()) {
      res.status(400).json({ error: "content is required" });
      return;
    }
    const topHashtagStats = await outreachService.listHashtags();
    const topTags = topHashtagStats.slice(0, 20).map((h) => h.tag);
    const hashtags = await aiOutreachService.suggestHashtags(content, topTags);
    res.json({ hashtags });
  } catch (error) {
    console.error("POST /ai/hashtags error:", error);
    res.status(500).json({ error: "Failed to suggest hashtags" });
  }
});

// POST /ai/voice
outreachRouter.post("/ai/voice", async (req: Request, res: Response) => {
  try {
    const { content, voiceName } = req.body as { content: string; voiceName: string };
    if (!content?.trim() || !voiceName) {
      res.status(400).json({ error: "content and voiceName are required" });
      return;
    }
    const brandVoice = await prisma.brandVoice.findFirst({ where: { name: voiceName } });
    if (!brandVoice) {
      res.status(404).json({ error: `Brand voice "${voiceName}" not found` });
      return;
    }
    const rewritten = await aiOutreachService.rewriteInVoice(content, brandVoice.name, brandVoice.examples);
    res.json({ content: rewritten });
  } catch (error) {
    console.error("POST /ai/voice error:", error);
    res.status(500).json({ error: "Failed to rewrite in voice" });
  }
});

// POST /ai/calendar-autofill
outreachRouter.post("/ai/calendar-autofill", async (req: Request, res: Response) => {
  try {
    const { from, to } = req.body as { from: string; to: string };
    if (!from || !to) {
      res.status(400).json({ error: "from and to are required" });
      return;
    }
    const fromDate = new Date(from);
    const toDate   = new Date(to);

    // Fetch events in range — exclude MEETING and recurring events
    const events = await prisma.event.findMany({
      where: {
        startTime: { gte: fromDate, lte: toDate },
        type:       { not: "MEETING" },
        isRecurring: false,
      },
      select: { title: true, startTime: true, type: true },
    });

    // Fetch recent milestones with no outreach submission
    const recentMilestones = await prisma.milestone.findMany({
      where: {
        status: "COMPLETED",
        completedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      select: { title: true, project: { select: { name: true } }, completedAt: true },
      take: 10,
    });

    const drafts = await aiOutreachService.generateCalendarAutofill(
      fromDate,
      toDate,
      events.map(e => ({ title: e.title, startTime: e.startTime?.toISOString() ?? null, type: e.type })),
      recentMilestones.map(m => ({ title: m.title, projectName: m.project?.name ?? null, completedAt: m.completedAt?.toISOString() ?? null })),
    );

    res.json({ drafts });
  } catch (error) {
    console.error("POST /ai/calendar-autofill error:", error);
    res.status(500).json({ error: "Failed to generate auto-fill suggestions" });
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

// ── POST /submissions/:id/metrics ─────────────────────────────

outreachRouter.post("/submissions/:id/metrics", async (req: Request, res: Response) => {
  try {
    const submission = await outreachService.getSubmission(req.params.id as string);
    if (!submission) {
      res.status(404).json({ error: "Submission not found" });
      return;
    }

    const { platform, impressions, likes, comments, shares, clicks } = req.body as {
      platform: string;
      impressions?: number | null;
      likes?: number | null;
      comments?: number | null;
      shares?: number | null;
      clicks?: number | null;
    };

    if (!platform) {
      res.status(400).json({ error: "platform is required" });
      return;
    }

    const metric = await prisma.postMetric.create({
      data: {
        submissionId: req.params.id as string,
        platform,
        impressions:  impressions  ?? null,
        likes:        likes        ?? null,
        comments:     comments     ?? null,
        shares:       shares       ?? null,
        clicks:       clicks       ?? null,
        recordedById: req.session.memberId!,
      },
      include: { recordedBy: { select: { id: true, displayName: true } } },
    });

    // Sync HashtagStat useCount for hashtags in the submission content
    if (submission.content) {
      const tags = (submission.content.match(/#(\w+)/g) ?? []).map((t: string) => t.slice(1).toLowerCase());
      for (const tag of tags) {
        await prisma.hashtagStat.upsert({
          where: { tag },
          create: { tag, useCount: 1, lastUsedAt: new Date() },
          update: { useCount: { increment: 1 }, lastUsedAt: new Date() },
        });
      }
    }

    res.status(201).json(metric);
  } catch (error) {
    console.error("POST /submissions/:id/metrics error:", error);
    res.status(500).json({ error: "Failed to record metric" });
  }
});

// ── GET /submissions/:id/metrics ──────────────────────────────

outreachRouter.get("/submissions/:id/metrics", async (req: Request, res: Response) => {
  try {
    const metrics = await prisma.postMetric.findMany({
      where: { submissionId: req.params.id as string },
      orderBy: { recordedAt: "desc" },
      include: { recordedBy: { select: { id: true, displayName: true } } },
    });
    res.json(metrics);
  } catch (error) {
    console.error("GET /submissions/:id/metrics error:", error);
    res.status(500).json({ error: "Failed to load metrics" });
  }
});

// ── POST /ai/spotlight — member spotlight post draft ──────────

outreachRouter.post("/ai/spotlight", async (req: Request, res: Response) => {
  try {
    const { memberId } = req.body as { memberId: string };
    if (!memberId) {
      res.status(400).json({ error: "memberId is required" });
      return;
    }

    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { displayName: true, title: true, team: true, bio: true },
    });
    if (!member) {
      res.status(404).json({ error: "Member not found" });
      return;
    }

    // Grab their recent completed milestones
    const milestones = await prisma.milestone.findMany({
      where:   { status: "COMPLETED", project: { members: { some: { memberId } } } },
      orderBy: { completedAt: "desc" },
      take:    3,
      select:  { title: true },
    });

    const draft = await aiOutreachService.generateMemberSpotlight(
      member.displayName,
      member.title ?? undefined,
      member.team  ?? undefined,
      member.bio   ?? undefined,
      milestones.map(m => m.title)
    );

    res.json({ draft, member: { displayName: member.displayName, title: member.title } });
  } catch (error) {
    console.error("POST /ai/spotlight error:", error);
    res.status(500).json({ error: "Failed to generate spotlight" });
  }
});

// ── POST /ai/syndicate — cross-program syndication posts ──────

outreachRouter.post("/ai/syndicate", async (req: Request, res: Response) => {
  try {
    const { milestoneId } = req.body as { milestoneId: string };
    if (!milestoneId) {
      res.status(400).json({ error: "milestoneId is required" });
      return;
    }

    const milestone = await prisma.milestone.findUnique({
      where:   { id: milestoneId },
      include: { project: { select: { name: true } } },
    });
    if (!milestone) {
      res.status(404).json({ error: "Milestone not found" });
      return;
    }

    const posts = await aiOutreachService.generateSyndicationPosts(
      milestone.title,
      milestone.project?.name ?? undefined,
      milestone.description  ?? undefined
    );

    res.json({ posts, milestone: { title: milestone.title, projectName: milestone.project?.name } });
  } catch (error) {
    console.error("POST /ai/syndicate error:", error);
    res.status(500).json({ error: "Failed to generate syndication posts" });
  }
});

// ── GET /activity — recent outreach activity feed ─────────────

outreachRouter.get("/activity", async (_req: Request, res: Response) => {
  try {
    const since = new Date(Date.now() - 14 * 86_400_000); // last 14 days

    const [recentSubmissions, recentComments, recentContacts] = await Promise.all([
      prisma.outreachSubmission.findMany({
        where:   { updatedAt: { gte: since } },
        orderBy: { updatedAt: "desc" },
        take:    20,
        select: {
          id: true, title: true, status: true, type: true, updatedAt: true,
          author: { select: { id: true, displayName: true, avatarUrl: true } },
        },
      }),
      prisma.outreachComment.findMany({
        where:   { createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        take:    15,
        include: {
          author:     { select: { id: true, displayName: true, avatarUrl: true } },
          submission: { select: { id: true, title: true } },
        },
      }),
      prisma.outreachContact.findMany({
        where:   { createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        take:    10,
        select: {
          id: true, name: true, contactType: true, stage: true, createdAt: true,
          owner: { select: { id: true, displayName: true, avatarUrl: true } },
        },
      }),
    ]);

    // Merge into a unified feed sorted by timestamp
    type FeedItem =
      | { kind: "submission"; ts: Date; data: (typeof recentSubmissions)[number] }
      | { kind: "comment";    ts: Date; data: (typeof recentComments)[number] }
      | { kind: "contact";    ts: Date; data: (typeof recentContacts)[number] };

    const feed: FeedItem[] = [
      ...recentSubmissions.map(s => ({ kind: "submission" as const, ts: s.updatedAt, data: s })),
      ...recentComments.map(c    => ({ kind: "comment"    as const, ts: c.createdAt, data: c })),
      ...recentContacts.map(c    => ({ kind: "contact"    as const, ts: c.createdAt, data: c })),
    ];

    feed.sort((a, b) => b.ts.getTime() - a.ts.getTime());

    res.json(feed.slice(0, 30));
  } catch (error) {
    console.error("GET /activity error:", error);
    res.status(500).json({ error: "Failed to load activity feed" });
  }
});

// ── Approvals ────────────────────────────────────────────────

outreachRouter.get("/submissions/:id/approvals", async (req: Request, res: Response) => {
  try {
    const submission = await prisma.outreachSubmission.findUnique({
      where: { id: req.params.id as string },
      include: { campaign: { select: { requiredApprovers: true } } },
    });
    if (!submission) {
      res.status(404).json({ error: "Submission not found" });
      return;
    }

    const required = submission.campaign?.requiredApprovers ?? [];
    const approvals = await prisma.approvalRecord.findMany({
      where:   { submissionId: req.params.id as string },
      include: { approver: { select: { id: true, displayName: true, avatarUrl: true } } },
      orderBy: { approvedAt: "asc" },
    });

    const approvedIds = new Set(approvals.map(a => a.approverId));
    const remaining = required.filter(id => !approvedIds.has(id));

    // Resolve remaining approver display info
    const remainingMembers = remaining.length > 0
      ? await prisma.member.findMany({
          where:  { id: { in: remaining } },
          select: { id: true, displayName: true, avatarUrl: true },
        })
      : [];

    res.json({
      required,
      approvals,
      remaining: remainingMembers,
      complete: required.length > 0 && remaining.length === 0,
    });
  } catch (error) {
    console.error("GET /submissions/:id/approvals error:", error);
    res.status(500).json({ error: "Failed to load approvals" });
  }
});

outreachRouter.post("/submissions/:id/approvals", async (req: Request, res: Response) => {
  try {
    const submission = await prisma.outreachSubmission.findUnique({
      where: { id: req.params.id as string },
      include: { campaign: { select: { requiredApprovers: true } } },
    });
    if (!submission) {
      res.status(404).json({ error: "Submission not found" });
      return;
    }

    const required = submission.campaign?.requiredApprovers ?? [];
    const memberId = req.session.memberId!;

    // Only required approvers (or admins) can approve
    const isRequired = required.includes(memberId);
    let isAdminOverride = false;
    if (!isRequired) {
      const me = await prisma.member.findUnique({
        where: { id: memberId },
        select: { isAdmin: true },
      });
      if (!me?.isAdmin) {
        res.status(403).json({ error: "Not a required approver for this submission" });
        return;
      }
      isAdminOverride = true;
    }

    const { comment } = (req.body as { comment?: string }) ?? {};

    // Upsert approval (one per approver)
    const record = await prisma.approvalRecord.upsert({
      where:  { submissionId_approverId: { submissionId: submission.id, approverId: memberId } },
      create: { submissionId: submission.id, approverId: memberId, comment: comment?.trim() || null },
      update: { approvedAt: new Date(), comment: comment?.trim() || null },
      include: { approver: { select: { id: true, displayName: true, avatarUrl: true } } },
    });

    // If all required approvers (or admin override) have approved, advance status
    const approvals = await prisma.approvalRecord.findMany({
      where:  { submissionId: submission.id },
      select: { approverId: true },
    });
    const approvedIds = new Set(approvals.map(a => a.approverId));
    const complete = required.length > 0 && required.every(id => approvedIds.has(id));

    let advanced = false;
    if ((complete || (isAdminOverride && required.length === 0)) && submission.status !== "APPROVED" && submission.status !== "PUBLISHED") {
      await prisma.outreachSubmission.update({
        where: { id: submission.id },
        data:  { status: "APPROVED", reviewerId: memberId },
      });
      advanced = true;
    }

    res.status(201).json({ record, complete, advanced });
  } catch (error) {
    console.error("POST /submissions/:id/approvals error:", error);
    res.status(500).json({ error: "Failed to record approval" });
  }
});

outreachRouter.delete("/submissions/:id/approvals/:approverId", async (req: Request, res: Response) => {
  try {
    const memberId = req.session.memberId!;
    if (memberId !== req.params.approverId) {
      const me = await prisma.member.findUnique({
        where: { id: memberId },
        select: { isAdmin: true },
      });
      if (!me?.isAdmin) {
        res.status(403).json({ error: "Can only retract your own approval" });
        return;
      }
    }
    await prisma.approvalRecord.deleteMany({
      where: {
        submissionId: req.params.id as string,
        approverId:   req.params.approverId as string,
      },
    });
    res.json({ ok: true });
  } catch (error) {
    console.error("DELETE /submissions/:id/approvals/:approverId error:", error);
    res.status(500).json({ error: "Failed to retract approval" });
  }
});

// ── POST /submissions/:id/ai/expand-blog ─────────────────────

outreachRouter.post("/submissions/:id/ai/expand-blog", async (req: Request, res: Response) => {
  try {
    const submission = await prisma.outreachSubmission.findUnique({
      where:  { id: req.params.id as string },
      include: { project: { select: { name: true } } },
    });
    if (!submission) {
      res.status(404).json({ error: "Submission not found" });
      return;
    }
    if (!submission.content?.trim()) {
      res.status(400).json({ error: "Submission has no content to expand" });
      return;
    }

    const markdown = await aiOutreachService.expandToBlog(
      submission.title,
      submission.content,
      submission.project?.name ?? undefined
    );

    // Auto-generate slug if missing
    let slug = submission.blogSlug;
    if (!slug) {
      const baseSlug = submission.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "post";
      slug = baseSlug;
      let suffix = 1;
      while (await prisma.outreachSubmission.findFirst({ where: { blogSlug: slug, NOT: { id: submission.id } }, select: { id: true } })) {
        suffix += 1;
        slug = `${baseSlug}-${suffix}`;
      }
    }

    const updated = await prisma.outreachSubmission.update({
      where: { id: req.params.id as string },
      data:  { blogMarkdown: markdown, blogSlug: slug },
      select: { id: true, blogMarkdown: true, blogSlug: true },
    });

    res.json(updated);
  } catch (error) {
    console.error("POST /submissions/:id/ai/expand-blog error:", error);
    res.status(500).json({ error: "Failed to expand to blog" });
  }
});

// ── POST /ai/video-script ────────────────────────────────────

outreachRouter.post("/ai/video-script", async (req: Request, res: Response) => {
  try {
    const { topic, durationSec, platform, submissionId } = req.body as {
      topic: string;
      durationSec?: number;
      platform?: string;
      submissionId?: string;
    };
    if (!topic?.trim()) {
      res.status(400).json({ error: "topic is required" });
      return;
    }

    const script = await aiOutreachService.generateVideoScript(
      topic.trim(),
      durationSec ?? 30,
      platform ?? "instagram"
    );

    // Optionally persist to a submission
    if (submissionId) {
      await prisma.outreachSubmission.update({
        where: { id: submissionId },
        data:  { videoScript: script as never },
      }).catch(() => { /* ignore — script still returned */ });
    }

    res.json(script);
  } catch (error) {
    console.error("POST /ai/video-script error:", error);
    res.status(500).json({ error: "Failed to generate video script" });
  }
});

outreachRouter.patch("/submissions/:id/video-script", async (req: Request, res: Response) => {
  try {
    const { script } = req.body as { script: unknown };
    const updated = await prisma.outreachSubmission.update({
      where: { id: req.params.id as string },
      data:  { videoScript: (script ?? null) as never },
      select: { id: true, videoScript: true },
    });
    res.json(updated);
  } catch (error) {
    console.error("PATCH /submissions/:id/video-script error:", error);
    res.status(500).json({ error: "Failed to save video script" });
  }
});

// ── POST /ai/generate-image ──────────────────────────────────

outreachRouter.post("/ai/generate-image", async (req: Request, res: Response) => {
  try {
    const memberId = req.session.memberId!;
    const { generateImage, checkMemberRateLimit } = await import("../services/imageGenService.js");
    const { uploadImageToDrive } = await import("../services/driveService.js");

    // Per-member burst limit (3/min)
    const rl = checkMemberRateLimit(memberId);
    if (!rl.allowed) {
      res.status(429).json({ error: `Rate limited — try again in ${rl.retryAfterSec}s` });
      return;
    }

    const { prompt, aspectRatio, quality } = req.body as {
      prompt:       string;
      aspectRatio?: "square" | "portrait" | "landscape";
      quality?:     "fast" | "standard" | "ultra";
    };
    if (!prompt?.trim()) {
      res.status(400).json({ error: "prompt is required" });
      return;
    }

    // Generate via Imagen 4
    const generated = await generateImage({ prompt, aspectRatio, quality });

    // Upload the base64 PNG to Google Drive and get a stable public URL
    const folderId  = process.env.DRIVE_AI_IMAGES_FOLDER_ID || undefined;
    const filename  = `ai-${Date.now()}.png`;
    const driveFile = await uploadImageToDrive(generated.base64, generated.mimeType, filename, folderId);

    const imageUrl = driveFile?.url ?? `data:${generated.mimeType};base64,${generated.base64}`;

    // Persist as an OutreachAsset so it shows up in the AssetPicker library
    const asset = await prisma.outreachAsset.create({
      data: {
        name:         prompt.slice(0, 80),
        kind:         "IMAGE",
        url:          imageUrl,
        thumbnailUrl: imageUrl,
        altText:      prompt,
        tags:         ["ai-generated", `imagen-${generated.quality}`],
        uploadedById: memberId,
      },
    });

    res.status(201).json({ asset, generated: { ...generated, url: imageUrl, base64: undefined } });
  } catch (error: any) {
    console.error("POST /ai/generate-image error:", error);
    const msg = error?.message ?? "Failed to generate image";
    res.status(msg.includes("quota") ? 429 : 500).json({ error: msg });
  }
});

// ── Newsletter ───────────────────────────────────────────────

outreachRouter.get("/subscribers", async (_req: Request, res: Response) => {
  try {
    const subs = await prisma.newsletterSubscriber.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json(subs);
  } catch (error) {
    console.error("GET /subscribers error:", error);
    res.status(500).json({ error: "Failed to list subscribers" });
  }
});

outreachRouter.post("/subscribers", async (req: Request, res: Response) => {
  try {
    const { randomBytes } = await import("node:crypto");
    const { subscribers } = req.body as {
      subscribers?: { email: string; name?: string }[];
    };
    if (!Array.isArray(subscribers) || subscribers.length === 0) {
      res.status(400).json({ error: "subscribers array required" });
      return;
    }
    let created = 0, skipped = 0;
    for (const s of subscribers) {
      if (!s.email?.trim()) { skipped++; continue; }
      try {
        await prisma.newsletterSubscriber.create({
          data: {
            email:            s.email.trim().toLowerCase(),
            name:             s.name?.trim() ?? null,
            unsubscribeToken: randomBytes(16).toString("hex"),
            source:           "import",
            confirmedAt:      new Date(),
          },
        });
        created++;
      } catch {
        skipped++;
      }
    }
    res.status(201).json({ created, skipped });
  } catch (error) {
    console.error("POST /subscribers error:", error);
    res.status(500).json({ error: "Failed to import subscribers" });
  }
});

outreachRouter.delete("/subscribers/:id", async (req: Request, res: Response) => {
  try {
    await prisma.newsletterSubscriber.delete({ where: { id: req.params.id as string } });
    res.json({ ok: true });
  } catch (error) {
    console.error("DELETE /subscribers/:id error:", error);
    res.status(500).json({ error: "Failed to delete subscriber" });
  }
});

outreachRouter.post("/submissions/:id/newsletter/send", async (req: Request, res: Response) => {
  try {
    const submission = await prisma.outreachSubmission.findUnique({
      where: { id: req.params.id as string },
    });
    if (!submission) {
      res.status(404).json({ error: "Submission not found" });
      return;
    }
    if (submission.type !== "NEWSLETTER") {
      res.status(400).json({ error: "Submission is not type NEWSLETTER" });
      return;
    }
    if (!submission.newsletterHtml?.trim()) {
      res.status(400).json({ error: "Newsletter HTML is empty" });
      return;
    }

    // Admin gate
    const me = await prisma.member.findUnique({
      where: { id: req.session.memberId },
      select: { isAdmin: true },
    });
    if (!me?.isAdmin) {
      res.status(403).json({ error: "Admin only" });
      return;
    }

    const subscribers = await prisma.newsletterSubscriber.findMany({
      where: { confirmedAt: { not: null }, unsubscribedAt: null },
      select: { email: true, unsubscribeToken: true },
    });

    if (subscribers.length === 0) {
      res.status(400).json({ error: "No confirmed subscribers" });
      return;
    }

    // Create the NewsletterSend up-front so the tracking pixel can reference it
    const send = await prisma.newsletterSend.create({
      data: {
        submissionId:   submission.id,
        recipientCount: subscribers.length,
      },
    });

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const pixelUrl = (sendId: string) => `${baseUrl}/api/public/newsletter/track/open/${sendId}.png`;
    const wrap = (innerHtml: string, unsubscribeToken: string) => `
<!DOCTYPE html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1a1d29;">
${innerHtml}
<hr style="margin-top: 36px; border: none; border-top: 1px solid #ddd;" />
<p style="font-size: 11px; color: #888; margin-top: 16px;">
  You're receiving this because you subscribed to Purdue SEARCH updates.
  <a href="${baseUrl}/api/public/newsletter/unsubscribe/${unsubscribeToken}" style="color: #0096a8;">Unsubscribe</a>.
</p>
<img src="${pixelUrl(send.id)}" width="1" height="1" alt="" style="display: block;" />
</body></html>`;

    const { sendBatch } = await import("../services/emailService.js");
    const result = await sendBatch(
      subscribers.map(s => s.email),
      submission.title,
      (email) => {
        const s = subscribers.find(x => x.email === email)!;
        return wrap(submission.newsletterHtml!, s.unsubscribeToken);
      }
    );

    // Advance status to PUBLISHED
    await prisma.outreachSubmission.update({
      where: { id: submission.id },
      data:  { status: "PUBLISHED", publishedAt: new Date() },
    });

    res.json({ send, result });
  } catch (error) {
    console.error("POST /submissions/:id/newsletter/send error:", error);
    res.status(500).json({ error: "Failed to send newsletter" });
  }
});

outreachRouter.patch("/submissions/:id/newsletter-html", async (req: Request, res: Response) => {
  try {
    const { html } = req.body as { html?: string };
    const updated = await prisma.outreachSubmission.update({
      where: { id: req.params.id as string },
      data:  { newsletterHtml: html ?? null },
      select: { id: true, newsletterHtml: true },
    });
    res.json(updated);
  } catch (error) {
    console.error("PATCH /submissions/:id/newsletter-html error:", error);
    res.status(500).json({ error: "Failed to save newsletter HTML" });
  }
});

// ── POST /press-kit/:projectId — mint / return token ────────

outreachRouter.post("/press-kit/:projectId", async (req: Request, res: Response) => {
  try {
    const { ensurePressKitToken } = await import("../services/pressKitService.js");
    const token = await ensurePressKitToken(req.params.projectId as string);
    const url = `${req.protocol}://${req.get("host")}/api/public/press-kit/${req.params.projectId}/${token}`;
    res.json({ token, url });
  } catch (error) {
    console.error("POST /press-kit/:projectId error:", error);
    res.status(500).json({ error: "Failed to generate press kit token" });
  }
});

// ── POST /submissions/:id/ai/safety-check ────────────────────

outreachRouter.post("/submissions/:id/ai/safety-check", async (req: Request, res: Response) => {
  try {
    const submission = await prisma.outreachSubmission.findUnique({
      where: { id: req.params.id as string },
    });
    if (!submission) {
      res.status(404).json({ error: "Submission not found" });
      return;
    }

    if (!submission.content?.trim()) {
      res.status(400).json({ error: "Submission has no content to check" });
      return;
    }

    // Look up default brand voice (if any)
    const defaultVoice = await prisma.brandVoice.findFirst({
      where: { isDefault: true },
      select: { name: true, description: true },
    });

    const report = await aiOutreachService.checkSafety(
      submission.content,
      submission.platformContent as Record<string, { caption?: string }> | null,
      defaultVoice
    );

    const updated = await prisma.outreachSubmission.update({
      where: { id: req.params.id as string },
      data: {
        safetyReport:    report as never,
        safetyCheckedAt: new Date(),
      },
      select: { id: true, safetyReport: true, safetyCheckedAt: true },
    });

    res.json(updated);
  } catch (error) {
    console.error("POST /submissions/:id/ai/safety-check error:", error);
    res.status(500).json({ error: "Failed to run safety check" });
  }
});

// ── GET /conflicts ───────────────────────────────────────────

outreachRouter.get("/conflicts", async (req: Request, res: Response) => {
  try {
    const { at, platforms, excludeId, eventId, projectId } = req.query as {
      at?: string;
      platforms?: string;
      excludeId?: string;
      eventId?: string;
      projectId?: string;
    };

    if (!at) {
      res.status(400).json({ error: "at (ISO datetime) is required" });
      return;
    }

    const targetAt = new Date(at);
    if (isNaN(targetAt.getTime())) {
      res.status(400).json({ error: "Invalid 'at' datetime" });
      return;
    }

    const platformList = (platforms ?? "").split(",").map(p => p.trim()).filter(Boolean);

    // ±24h window for same-platform conflicts
    const dayWindowStart = new Date(targetAt.getTime() - 24 * 60 * 60 * 1000);
    const dayWindowEnd   = new Date(targetAt.getTime() + 24 * 60 * 60 * 1000);

    // Same calendar day window
    const startOfDay = new Date(targetAt);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetAt);
    endOfDay.setHours(23, 59, 59, 999);

    // ±7d for events, ±3d for projects (per plan)
    const eventWindowStart   = new Date(targetAt.getTime() - 7 * 86_400_000);
    const eventWindowEnd     = new Date(targetAt.getTime() + 7 * 86_400_000);
    const projectWindowStart = new Date(targetAt.getTime() - 3 * 86_400_000);
    const projectWindowEnd   = new Date(targetAt.getTime() + 3 * 86_400_000);

    const baseWhere = {
      isTemplate: false,
      status:     { in: ["SUBMITTED", "IN_REVIEW", "APPROVED", "PUBLISHED"] as SubmissionStatus[] },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    };

    const [samePlatform24h, sameDayAll, sameEvent7d, sameProject3d] = await Promise.all([
      platformList.length > 0
        ? prisma.outreachSubmission.findMany({
            where: {
              ...baseWhere,
              scheduledAt: { gte: dayWindowStart, lte: dayWindowEnd },
              platform:    { hasSome: platformList },
            },
            select: { id: true, title: true, scheduledAt: true, platform: true },
          })
        : [],
      prisma.outreachSubmission.count({
        where: { ...baseWhere, scheduledAt: { gte: startOfDay, lte: endOfDay } },
      }),
      eventId
        ? prisma.outreachSubmission.findMany({
            where: {
              ...baseWhere,
              eventId,
              scheduledAt: { gte: eventWindowStart, lte: eventWindowEnd },
            },
            select: { id: true, title: true, scheduledAt: true },
          })
        : [],
      projectId
        ? prisma.outreachSubmission.findMany({
            where: {
              ...baseWhere,
              projectId,
              scheduledAt: { gte: projectWindowStart, lte: projectWindowEnd },
            },
            select: { id: true, title: true, scheduledAt: true },
          })
        : [],
    ]);

    res.json({
      samePlatformIn24h: samePlatform24h.length,
      samePlatformItems: samePlatform24h,
      sameDayCount:      sameDayAll,
      sameEventItems:    sameEvent7d,
      sameProjectItems:  sameProject3d,
    });
  } catch (error) {
    console.error("GET /conflicts error:", error);
    res.status(500).json({ error: "Failed to compute conflicts" });
  }
});

// ── Templates ────────────────────────────────────────────────

function substitutePlaceholders(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_m, key) => values[key] ?? `{{${key}}}`);
}

outreachRouter.get("/templates", async (_req: Request, res: Response) => {
  try {
    const templates = await prisma.outreachSubmission.findMany({
      where:   { isTemplate: true },
      orderBy: { updatedAt: "desc" },
      include: {
        author:     { select: { id: true, displayName: true } },
        recurrences: { select: { id: true, cronExpression: true, active: true, nextRunAt: true } },
      },
    });
    res.json(templates);
  } catch (error) {
    console.error("GET /templates error:", error);
    res.status(500).json({ error: "Failed to list templates" });
  }
});

outreachRouter.post("/templates/:id/instantiate", async (req: Request, res: Response) => {
  try {
    const template = await prisma.outreachSubmission.findUnique({
      where: { id: req.params.id as string },
    });
    if (!template || !template.isTemplate) {
      res.status(404).json({ error: "Template not found" });
      return;
    }

    const { values } = (req.body as { values?: Record<string, string> }) ?? {};
    const vals = values ?? {};

    const created = await prisma.outreachSubmission.create({
      data: {
        title:           substitutePlaceholders(template.title, vals),
        content:         template.content ? substitutePlaceholders(template.content, vals) : null,
        type:            template.type,
        status:          "DRAFT",
        platform:        template.platform,
        mediaUrls:       template.mediaUrls,
        platformContent: template.platformContent ?? undefined,
        campaignId:      template.campaignId,
        projectId:       template.projectId,
        authorId:        req.session.memberId!,
        isTemplate:      false,
      },
      include: {
        author:  { select: { id: true, displayName: true, avatarUrl: true } },
        project: { select: { id: true, name: true } },
        campaign: { select: { id: true, name: true, color: true } },
      },
    });

    res.status(201).json(created);
  } catch (error) {
    console.error("POST /templates/:id/instantiate error:", error);
    res.status(500).json({ error: "Failed to instantiate template" });
  }
});

outreachRouter.post("/templates/:id/recurrence", async (req: Request, res: Response) => {
  try {
    const { CronExpressionParser } = await import("cron-parser");
    const template = await prisma.outreachSubmission.findUnique({
      where: { id: req.params.id as string },
    });
    if (!template || !template.isTemplate) {
      res.status(404).json({ error: "Template not found" });
      return;
    }

    const { cronExpression, active, defaultValues } = req.body as {
      cronExpression: string;
      active?: boolean;
      defaultValues?: Record<string, string>;
    };

    if (!cronExpression) {
      res.status(400).json({ error: "cronExpression is required" });
      return;
    }

    let nextRunAt: Date;
    try {
      nextRunAt = CronExpressionParser.parse(cronExpression).next().toDate();
    } catch {
      res.status(400).json({ error: "Invalid cronExpression" });
      return;
    }

    // Upsert by templateSubmissionId — one recurrence per template for simplicity
    const existing = await prisma.recurringTemplate.findFirst({
      where: { templateSubmissionId: template.id },
    });

    const data = {
      templateSubmissionId: template.id,
      cronExpression,
      defaultValues: defaultValues ?? undefined,
      active: active ?? true,
      nextRunAt,
      ownerId: req.session.memberId!,
    };

    const recurrence = existing
      ? await prisma.recurringTemplate.update({ where: { id: existing.id }, data })
      : await prisma.recurringTemplate.create({ data });

    res.json(recurrence);
  } catch (error) {
    console.error("POST /templates/:id/recurrence error:", error);
    res.status(500).json({ error: "Failed to set recurrence" });
  }
});

outreachRouter.delete("/templates/:id/recurrence", async (req: Request, res: Response) => {
  try {
    await prisma.recurringTemplate.deleteMany({
      where: { templateSubmissionId: req.params.id as string },
    });
    res.json({ ok: true });
  } catch (error) {
    console.error("DELETE /templates/:id/recurrence error:", error);
    res.status(500).json({ error: "Failed to delete recurrence" });
  }
});
