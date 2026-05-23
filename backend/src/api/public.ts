import { Router, type Request, type Response } from "express";
import { prisma } from "../db/prisma.js";

export const publicRouter = Router();

// ── Simple in-memory IP rate limiter (token-bucket) ──────────

const RATE_WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;
const ipLog = new Map<string, number[]>();

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const log = ipLog.get(ip) ?? [];
  const recent = log.filter(t => now - t < RATE_WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    ipLog.set(ip, recent);
    return false;
  }
  recent.push(now);
  ipLog.set(ip, recent);
  return true;
}

// ── GET /public/campaigns/:slug ──────────────────────────────

publicRouter.get("/campaigns/:slug", async (req: Request, res: Response) => {
  try {
    const slug = req.params.slug as string;
    const campaign = await prisma.campaign.findUnique({
      where: { slug },
      include: {
        owner: { select: { displayName: true, avatarUrl: true } },
        submissions: {
          where:   { status: "PUBLISHED" },
          orderBy: { publishedAt: "desc" },
          take:    20,
          select: {
            id: true, title: true, content: true, mediaUrls: true,
            type: true, platform: true, publishedAt: true,
          },
        },
      },
    });

    if (!campaign || !campaign.isPublic) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    res.json({
      id:          campaign.id,
      name:        campaign.name,
      description: campaign.description,
      startDate:   campaign.startDate,
      endDate:     campaign.endDate,
      goalType:    campaign.goalType,
      goalTarget:  campaign.goalTarget,
      goalProgress: campaign.goalProgress,
      color:       campaign.color,
      owner:       campaign.owner ? { displayName: campaign.owner.displayName, avatarUrl: campaign.owner.avatarUrl } : null,
      submissions: campaign.submissions,
    });
  } catch (error) {
    console.error("GET /public/campaigns/:slug error:", error);
    res.status(500).json({ error: "Failed to load campaign" });
  }
});

// ── GET /public/outreach/published ───────────────────────────

publicRouter.get("/outreach/published", async (req: Request, res: Response) => {
  try {
    const { program, limit } = req.query as { program?: string; limit?: string };
    const take = Math.min(50, parseInt(limit ?? "20", 10) || 20);

    const submissions = await prisma.outreachSubmission.findMany({
      where: {
        status: "PUBLISHED",
        ...(program ? { project: { programTag: program } } : {}),
      },
      orderBy: { publishedAt: "desc" },
      take,
      select: {
        id: true, title: true, content: true, mediaUrls: true,
        type: true, platform: true, publishedAt: true,
        project: { select: { name: true, programTag: true } },
      },
    });

    res.json(submissions);
  } catch (error) {
    console.error("GET /public/outreach/published error:", error);
    res.status(500).json({ error: "Failed to load published outreach" });
  }
});

// ── GET /public/press-kit/:projectId/:token ──────────────────

publicRouter.get("/press-kit/:projectId/:token", async (req: Request, res: Response) => {
  try {
    const project = await prisma.project.findUnique({
      where:  { id: req.params.projectId as string },
      select: { pressKitToken: true },
    });
    if (!project || !project.pressKitToken || project.pressKitToken !== req.params.token) {
      res.status(404).send("Not found");
      return;
    }
    const { buildPressKitHtml } = await import("../services/pressKitService.js");
    const html = await buildPressKitHtml(req.params.projectId as string);
    if (!html) {
      res.status(404).send("Not found");
      return;
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (error) {
    console.error("GET /public/press-kit error:", error);
    res.status(500).send("Server error");
  }
});

// ── POST /public/campaigns/:slug/signup ──────────────────────

publicRouter.post("/campaigns/:slug/signup", async (req: Request, res: Response) => {
  try {
    const ip = (req.ip ?? req.socket.remoteAddress ?? "unknown").toString();
    if (!rateLimit(ip)) {
      res.status(429).json({ error: "Too many requests — try again in a minute" });
      return;
    }

    const slug = req.params.slug as string;
    const campaign = await prisma.campaign.findUnique({
      where:  { slug },
      select: { id: true, isPublic: true },
    });
    if (!campaign || !campaign.isPublic) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const { name, email, role } = req.body as { name?: string; email?: string; role?: string };
    if (!name?.trim() || !email?.trim()) {
      res.status(400).json({ error: "Name and email are required" });
      return;
    }

    await prisma.outreachContact.create({
      data: {
        name:        name.trim(),
        email:       email.trim(),
        role:        role?.trim() ?? null,
        contactType: "PROSPECT",
        stage:       "COLD",
        campaignId:  campaign.id,
        tags:        ["self-signup"],
      },
    });

    res.status(201).json({ ok: true });
  } catch (error) {
    console.error("POST /public/campaigns/:slug/signup error:", error);
    res.status(500).json({ error: "Failed to record signup" });
  }
});
