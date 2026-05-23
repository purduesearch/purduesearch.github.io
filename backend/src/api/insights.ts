import { Router, type Request, type Response } from "express";
import { requireAuth } from "./auth.js";
import { prisma } from "../db/prisma.js";
import * as aiOutreachService from "../services/aiOutreachService.js";

export const insightsRouter = Router();
insightsRouter.use(requireAuth);

// ── GET /insights/summary — KPI dashboard ─────────────────────

insightsRouter.get("/summary", async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    const [
      publishedThisMonth,
      publishedLastMonth,
      allMetrics,
      platformCounts,
      crmStages,
      recentDrafts,
    ] = await Promise.all([
      // Posts published this month
      prisma.outreachSubmission.count({
        where: { status: "PUBLISHED", publishedAt: { gte: startOfMonth } },
      }),
      // Posts published last month (for delta)
      prisma.outreachSubmission.count({
        where: { status: "PUBLISHED", publishedAt: { gte: startOfLastMonth, lte: endOfLastMonth } },
      }),
      // All metrics for engagement averages
      prisma.postMetric.findMany({
        select: { platform: true, impressions: true, likes: true, comments: true, shares: true, clicks: true },
      }),
      // Platform distribution of published posts
      prisma.outreachSubmission.findMany({
        where: { status: "PUBLISHED" },
        select: { platform: true },
      }),
      // CRM pipeline stage counts
      prisma.outreachContact.groupBy({
        by: ["stage"],
        _count: { id: true },
      }),
      // Upcoming drafts with no scheduledAt or past due
      prisma.outreachSubmission.count({
        where: {
          status: { in: ["DRAFT", "SUBMITTED", "IN_REVIEW"] },
          OR: [
            { scheduledAt: null },
            { scheduledAt: { lt: now } },
          ],
        },
      }),
    ]);

    // Compute avg engagement across all logged metrics
    let totalEngagement = 0;
    let metricCount = 0;
    const platformEngagement: Record<string, { total: number; count: number }> = {};
    for (const m of allMetrics) {
      const eng = (m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0);
      totalEngagement += eng;
      metricCount++;
      if (!platformEngagement[m.platform]) platformEngagement[m.platform] = { total: 0, count: 0 };
      platformEngagement[m.platform].total += eng;
      platformEngagement[m.platform].count++;
    }
    const avgEngagement = metricCount > 0 ? Math.round(totalEngagement / metricCount) : 0;

    // Top platform by published post count
    const pCounts: Record<string, number> = {};
    for (const s of platformCounts) {
      for (const p of s.platform) {
        pCounts[p] = (pCounts[p] ?? 0) + 1;
      }
    }
    const topPlatform = Object.entries(pCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    // Best platform by avg engagement
    let bestEngPlatform: string | null = null;
    let bestEngScore = -1;
    for (const [plat, { total, count }] of Object.entries(platformEngagement)) {
      const avg = count > 0 ? total / count : 0;
      if (avg > bestEngScore) { bestEngScore = avg; bestEngPlatform = plat; }
    }

    // CRM funnel
    const funnel: Record<string, number> = {};
    for (const g of crmStages) {
      funnel[g.stage] = g._count.id;
    }

    res.json({
      publishedThisMonth,
      publishedLastMonth,
      publishedDelta: publishedThisMonth - publishedLastMonth,
      avgEngagement,
      topPlatform,
      bestEngagementPlatform: bestEngPlatform,
      atRiskDrafts: recentDrafts,
      crmFunnel: funnel,
      platformCounts: pCounts,
    });
  } catch (error) {
    console.error("GET /insights/summary error:", error);
    res.status(500).json({ error: "Failed to load insights summary" });
  }
});

// ── GET /insights/best-times — best posting times by platform ─

insightsRouter.get("/best-times", async (_req: Request, res: Response) => {
  try {
    const metrics = await prisma.postMetric.findMany({
      select: {
        platform: true,
        recordedAt: true,
        impressions: true,
        likes: true,
        comments: true,
        shares: true,
      },
    });

    // Build a heatmap: platform → dayOfWeek (0-6) → hourOfDay (0-23) → { total, count }
    type Cell = { total: number; count: number };
    const heatmap: Record<string, Record<string, Cell>> = {};

    for (const m of metrics) {
      const d = new Date(m.recordedAt);
      const key = `${d.getDay()}-${d.getHours()}`;
      const eng = (m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0) + (m.impressions ?? 0) * 0.01;
      if (!heatmap[m.platform]) heatmap[m.platform] = {};
      if (!heatmap[m.platform][key]) heatmap[m.platform][key] = { total: 0, count: 0 };
      heatmap[m.platform][key].total += eng;
      heatmap[m.platform][key].count++;
    }

    // Convert to array form for the frontend
    const result: Record<string, { day: number; hour: number; avgEngagement: number }[]> = {};
    for (const [platform, cells] of Object.entries(heatmap)) {
      result[platform] = Object.entries(cells).map(([key, { total, count }]) => {
        const [day, hour] = key.split("-").map(Number);
        return { day, hour, avgEngagement: count > 0 ? Math.round(total / count) : 0 };
      });
    }

    res.json(result);
  } catch (error) {
    console.error("GET /insights/best-times error:", error);
    res.status(500).json({ error: "Failed to load best times" });
  }
});

// ── GET /insights/hashtags — top hashtag stats ────────────────

insightsRouter.get("/hashtags", async (_req: Request, res: Response) => {
  try {
    const tags = await prisma.hashtagStat.findMany({
      orderBy: [{ useCount: "desc" }, { lastUsedAt: "desc" }],
    });
    res.json(tags);
  } catch (error) {
    console.error("GET /insights/hashtags error:", error);
    res.status(500).json({ error: "Failed to load hashtags" });
  }
});

// ── PATCH /insights/hashtags/:id — update category (admin) ───

insightsRouter.patch("/hashtags/:id", async (req: Request, res: Response) => {
  try {
    const member = await prisma.member.findUnique({
      where: { id: req.session.memberId },
      select: { isAdmin: true },
    });
    if (!member?.isAdmin) {
      res.status(403).json({ error: "Admin only" });
      return;
    }
    const { category } = req.body as { category?: string | null };
    const updated = await prisma.hashtagStat.update({
      where: { id: req.params.id as string },
      data: { category: category ?? null },
    });
    res.json(updated);
  } catch (error) {
    console.error("PATCH /insights/hashtags/:id error:", error);
    res.status(500).json({ error: "Failed to update hashtag" });
  }
});

// ── DELETE /insights/hashtags/:id — delete (admin) ───────────

insightsRouter.delete("/hashtags/:id", async (req: Request, res: Response) => {
  try {
    const member = await prisma.member.findUnique({
      where: { id: req.session.memberId },
      select: { isAdmin: true },
    });
    if (!member?.isAdmin) {
      res.status(403).json({ error: "Admin only" });
      return;
    }
    await prisma.hashtagStat.delete({ where: { id: req.params.id as string } });
    res.json({ ok: true });
  } catch (error) {
    console.error("DELETE /insights/hashtags/:id error:", error);
    res.status(500).json({ error: "Failed to delete hashtag" });
  }
});

// ── GET /insights/source-mix — content source breakdown ───────

insightsRouter.get("/source-mix", async (_req: Request, res: Response) => {
  try {
    const submissions = await prisma.outreachSubmission.findMany({
      where: { status: "PUBLISHED" },
      select: { eventId: true, projectId: true, isTemplate: true },
    });

    let events = 0, milestones = 0, manual = 0;
    for (const s of submissions) {
      if (s.eventId) events++;
      else if (s.projectId) milestones++;
      else manual++;
    }

    res.json({ events, milestones, manual, total: submissions.length });
  } catch (error) {
    console.error("GET /insights/source-mix error:", error);
    res.status(500).json({ error: "Failed to load source mix" });
  }
});

// ── GET /insights/gaps — AI content gap analysis ──────────────

insightsRouter.get("/gaps", async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const thirtyDaysOut = new Date(now.getTime() + 30 * 86_400_000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);

    const [upcomingEvents, recentMilestones] = await Promise.all([
      prisma.event.findMany({
        where: {
          startTime:   { gte: now, lte: thirtyDaysOut },
          type:        { not: "MEETING" },
          isRecurring: false,
        },
        select: { id: true, title: true, startTime: true, type: true },
      }),
      prisma.milestone.findMany({
        where: {
          status:      "COMPLETED",
          completedAt: { gte: thirtyDaysAgo },
        },
        include: { project: { select: { name: true } } },
      }),
    ]);

    // Filter to events / milestones with no existing submission
    const eventIds = upcomingEvents.map(e => e.id);
    const existingForEvents = await prisma.outreachSubmission.findMany({
      where: { eventId: { in: eventIds } },
      select: { eventId: true },
    });
    const coveredEventIds = new Set(existingForEvents.map(s => s.eventId));

    const uncoveredEvents = upcomingEvents.filter(e => !coveredEventIds.has(e.id));
    const uncoveredMilestones = recentMilestones;

    const gaps = await aiOutreachService.generateGapAnalysis(
      uncoveredEvents.map(e => ({ title: e.title, startTime: e.startTime?.toISOString() ?? null, type: e.type })),
      uncoveredMilestones.map(m => ({ title: m.title, projectName: m.project?.name ?? null, completedAt: m.completedAt?.toISOString() ?? null }))
    );

    res.json({ gaps, uncoveredEventCount: uncoveredEvents.length, uncoveredMilestoneCount: uncoveredMilestones.length });
  } catch (error) {
    console.error("GET /insights/gaps error:", error);
    res.status(500).json({ error: "Failed to generate gap analysis" });
  }
});

// ── GET /insights/digest — AI weekly digest narrative ─────────

insightsRouter.get("/digest", async (_req: Request, res: Response) => {
  try {
    const oneWeekAgo = new Date(Date.now() - 7 * 86_400_000);

    const [published, metrics, contacts] = await Promise.all([
      prisma.outreachSubmission.findMany({
        where: { status: "PUBLISHED", publishedAt: { gte: oneWeekAgo } },
        select: { title: true, type: true, platform: true },
      }),
      prisma.postMetric.findMany({
        where: { recordedAt: { gte: oneWeekAgo } },
        select: { platform: true, impressions: true, likes: true, comments: true, shares: true },
      }),
      prisma.outreachContact.groupBy({ by: ["stage"], _count: { id: true } }),
    ]);

    const digest = await aiOutreachService.generateWeeklyDigest(
      published.map(s => ({ title: s.title, type: s.type, platforms: s.platform })),
      metrics.map(m => ({
        platform: m.platform,
        impressions: m.impressions ?? 0,
        likes: m.likes ?? 0,
        comments: m.comments ?? 0,
        shares: m.shares ?? 0,
      })),
      contacts.reduce((acc, g) => ({ ...acc, [g.stage]: g._count.id }), {} as Record<string, number>)
    );

    res.json({ digest });
  } catch (error) {
    console.error("GET /insights/digest error:", error);
    res.status(500).json({ error: "Failed to generate digest" });
  }
});
