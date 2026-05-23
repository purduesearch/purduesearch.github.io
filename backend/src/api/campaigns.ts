import { Router, type Request, type Response } from "express";
import { requireAuth } from "./auth.js";
import { prisma } from "../db/prisma.js";

export const campaignsRouter = Router();
campaignsRouter.use(requireAuth);

const CAMPAIGN_INCLUDE = {
  owner: { select: { id: true, displayName: true, avatarUrl: true } },
  _count: { select: { submissions: true } },
} as const;

// ── GET /campaigns ────────────────────────────────────────────

campaignsRouter.get("/", async (_req: Request, res: Response) => {
  try {
    const campaigns = await prisma.campaign.findMany({
      orderBy: { startDate: "desc" },
      include: CAMPAIGN_INCLUDE,
    });
    res.json(campaigns);
  } catch (error) {
    console.error("GET /campaigns error:", error);
    res.status(500).json({ error: "Failed to list campaigns" });
  }
});

// ── GET /campaigns/:id ────────────────────────────────────────

campaignsRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: req.params.id as string },
      include: {
        ...CAMPAIGN_INCLUDE,
        submissions: {
          orderBy: { createdAt: "desc" },
          include: { author: { select: { id: true, displayName: true, avatarUrl: true } } },
        },
      },
    });
    if (!campaign) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }
    res.json(campaign);
  } catch (error) {
    console.error("GET /campaigns/:id error:", error);
    res.status(500).json({ error: "Failed to get campaign" });
  }
});

// ── GET /campaigns/:id/progress ───────────────────────────────

campaignsRouter.get("/:id/progress", async (req: Request, res: Response) => {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: req.params.id as string },
      select: {
        id: true, goalType: true, goalTarget: true, goalProgress: true,
        _count: { select: { submissions: true } },
        submissions: {
          select: { status: true },
        },
      },
    });
    if (!campaign) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }

    const statusCounts: Record<string, number> = {};
    for (const s of campaign.submissions) {
      statusCounts[s.status] = (statusCounts[s.status] ?? 0) + 1;
    }

    res.json({
      goalType:    campaign.goalType,
      goalTarget:  campaign.goalTarget,
      goalProgress: campaign.goalProgress,
      pct: campaign.goalTarget
        ? Math.min(100, Math.round((campaign.goalProgress / campaign.goalTarget) * 100))
        : null,
      submissionCount: campaign._count.submissions,
      statusCounts,
    });
  } catch (error) {
    console.error("GET /campaigns/:id/progress error:", error);
    res.status(500).json({ error: "Failed to get campaign progress" });
  }
});

// ── POST /campaigns ───────────────────────────────────────────

campaignsRouter.post("/", async (req: Request, res: Response) => {
  try {
    const { name, description, startDate, endDate, goalType, goalTarget, color } = req.body as {
      name: string;
      description?: string;
      startDate: string;
      endDate?: string;
      goalType?: string;
      goalTarget?: number;
      color?: string;
    };

    if (!name?.trim() || !startDate) {
      res.status(400).json({ error: "name and startDate are required" });
      return;
    }

    const campaign = await prisma.campaign.create({
      data: {
        name: name.trim(),
        description: description?.trim() ?? null,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        goalType: goalType ?? null,
        goalTarget: goalTarget ?? null,
        color: color ?? null,
        ownerId: req.session.memberId!,
      },
      include: CAMPAIGN_INCLUDE,
    });
    res.status(201).json(campaign);
  } catch (error) {
    console.error("POST /campaigns error:", error);
    res.status(500).json({ error: "Failed to create campaign" });
  }
});

// ── PATCH /campaigns/:id ──────────────────────────────────────

campaignsRouter.patch("/:id", async (req: Request, res: Response) => {
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id as string } });
    if (!campaign) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }

    // Owner or admin
    if (campaign.ownerId !== req.session.memberId) {
      const member = await prisma.member.findUnique({
        where: { id: req.session.memberId },
        select: { isAdmin: true },
      });
      if (!member?.isAdmin) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }

    const { name, description, startDate, endDate, goalType, goalTarget, goalProgress, color } = req.body as {
      name?: string;
      description?: string | null;
      startDate?: string;
      endDate?: string | null;
      goalType?: string | null;
      goalTarget?: number | null;
      goalProgress?: number;
      color?: string | null;
    };

    const updated = await prisma.campaign.update({
      where: { id: req.params.id as string },
      data: {
        ...(name != null ? { name: name.trim() } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(startDate != null ? { startDate: new Date(startDate) } : {}),
        ...(endDate !== undefined ? { endDate: endDate ? new Date(endDate) : null } : {}),
        ...(goalType !== undefined ? { goalType } : {}),
        ...(goalTarget !== undefined ? { goalTarget } : {}),
        ...(goalProgress != null ? { goalProgress } : {}),
        ...(color !== undefined ? { color } : {}),
      },
      include: CAMPAIGN_INCLUDE,
    });
    res.json(updated);
  } catch (error) {
    console.error("PATCH /campaigns/:id error:", error);
    res.status(500).json({ error: "Failed to update campaign" });
  }
});

// ── DELETE /campaigns/:id ─────────────────────────────────────

campaignsRouter.delete("/:id", async (req: Request, res: Response) => {
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id as string } });
    if (!campaign) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }

    if (campaign.ownerId !== req.session.memberId) {
      const member = await prisma.member.findUnique({
        where: { id: req.session.memberId },
        select: { isAdmin: true },
      });
      if (!member?.isAdmin) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }

    // Detach submissions before delete (SetNull handled by Prisma cascade)
    await prisma.campaign.delete({ where: { id: req.params.id as string } });
    res.json({ ok: true });
  } catch (error) {
    console.error("DELETE /campaigns/:id error:", error);
    res.status(500).json({ error: "Failed to delete campaign" });
  }
});
