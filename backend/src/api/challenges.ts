import { Router } from "express";
import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { requireAuth } from "./auth.js";
import {
  getActiveChallenges,
  claimChallenge,
} from "../services/challengeService.js";

export const challengesRouter = Router();
challengesRouter.use(requireAuth);

// GET /api/challenges/active — returns all active quests for the current member
challengesRouter.get("/active", async (req: Request, res: Response) => {
  try {
    const memberId = req.memberId!;
    const result = await getActiveChallenges(memberId);
    res.json(result);
  } catch (err) {
    console.error("[challenges] GET /active:", err);
    res.status(500).json({ error: "Failed to load challenges" });
  }
});

// POST /api/challenges/:id/claim — explicitly claim a completed quest
challengesRouter.post("/:id/claim", async (req: Request, res: Response) => {
  try {
    const memberId = req.memberId!;
    const payload = await claimChallenge(memberId, req.params.id as string);
    res.json(payload);
  } catch (err: any) {
    const msg = err?.message ?? "Failed to claim challenge";
    const status = msg === "Already claimed" ? 409
      : msg === "Challenge not completed" ? 422
      : msg === "Not found" ? 404
      : 500;
    console.error("[challenges] POST /:id/claim:", err);
    res.status(status).json({ error: msg });
  }
});

// GET /api/challenges/achievements — all achievements + member's unlock status
challengesRouter.get("/achievements", async (req: Request, res: Response) => {
  try {
    const memberId = req.memberId!;
    const [all, unlocked] = await Promise.all([
      prisma.challenge.findMany({
        where: { type: "ACHIEVEMENT", active: true },
        orderBy: [{ tier: "asc" }, { name: "asc" }],
      }),
      prisma.memberAchievement.findMany({
        where: { memberId },
        select: { challengeId: true, unlockedAt: true, rolledItems: true },
      }),
    ]);
    const unlockedMap = new Map(unlocked.map(u => [u.challengeId, u]));
    const result = all.map(a => ({
      ...a,
      unlocked: unlockedMap.has(a.id),
      unlockedAt: unlockedMap.get(a.id)?.unlockedAt ?? null,
      rolledItems: unlockedMap.get(a.id)?.rolledItems ?? null,
    }));
    res.json(result);
  } catch (err) {
    console.error("[challenges] GET /achievements:", err);
    res.status(500).json({ error: "Failed to load achievements" });
  }
});

// GET /api/challenges/history?days=30 — recent completed challenges + rolls
challengesRouter.get("/history", async (req: Request, res: Response) => {
  try {
    const memberId = req.memberId!;
    const days = Math.min(parseInt((req.query.days as string) ?? "30", 10) || 30, 90);
    const since = new Date(Date.now() - days * 86_400_000);

    const [challenges, rolls] = await Promise.all([
      prisma.memberChallenge.findMany({
        where: { memberId, claimedAt: { gte: since } },
        include: { challenge: { select: { name: true, type: true, xpReward: true, doubloonReward: true } } },
        orderBy: { claimedAt: "desc" },
      }),
      prisma.rewardRoll.findMany({
        where: { memberId, createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    res.json({ challenges, rolls });
  } catch (err) {
    console.error("[challenges] GET /history:", err);
    res.status(500).json({ error: "Failed to load history" });
  }
});

// GET /api/challenges/catalog — admin only; full catalog with active toggle
challengesRouter.get("/catalog", async (req: Request, res: Response) => {
  try {
    const member = await prisma.member.findUnique({
      where: { id: req.memberId! },
      select: { isAdmin: true },
    });
    if (!member?.isAdmin) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const catalog = await prisma.challenge.findMany({ orderBy: [{ type: "asc" }, { name: "asc" }] });
    res.json(catalog);
  } catch (err) {
    console.error("[challenges] GET /catalog:", err);
    res.status(500).json({ error: "Failed to load catalog" });
  }
});

// PATCH /api/challenges/catalog/:id — admin only; toggle active, edit reward amounts
challengesRouter.patch("/catalog/:id", async (req: Request, res: Response) => {
  try {
    const member = await prisma.member.findUnique({
      where: { id: req.memberId! },
      select: { isAdmin: true },
    });
    if (!member?.isAdmin) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const { active, xpReward, doubloonReward } = req.body;
    const updated = await prisma.challenge.update({
      where: { id: req.params.id as string },
      data: {
        ...(active        !== undefined ? { active }        : {}),
        ...(xpReward      !== undefined ? { xpReward }      : {}),
        ...(doubloonReward !== undefined ? { doubloonReward } : {}),
      },
    });
    res.json(updated);
  } catch (err) {
    console.error("[challenges] PATCH /catalog/:id:", err);
    res.status(500).json({ error: "Failed to update challenge" });
  }
});
