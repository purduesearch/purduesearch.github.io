// Streak read endpoints + same-day milestone-celebration claim.

import { Router, type Request, type Response } from "express";
import { requireAuth } from "./auth.js";
import {
  getMemberStreak,
  getActivityHistory,
  consumePendingCelebration,
} from "../services/streakService.js";

export const streakRouter = Router();

// GET /api/members/:id/streak
streakRouter.get("/members/:id/streak", requireAuth, async (req: Request, res: Response) => {
  try {
    const memberId = req.params.id as string;
    const data = await getMemberStreak(memberId);
    res.json(data);
  } catch (err) {
    console.error("[streak] get streak error:", err);
    res.status(500).json({ error: "Failed to load streak" });
  }
});

// GET /api/members/:id/activity?days=30
streakRouter.get("/members/:id/activity", requireAuth, async (req: Request, res: Response) => {
  try {
    const memberId = req.params.id as string;
    const days = Math.min(365, Math.max(1, parseInt((req.query.days as string) ?? "30", 10) || 30));
    const rows = await getActivityHistory(memberId, days);
    res.json({ days, activity: rows });
  } catch (err) {
    console.error("[streak] get activity error:", err);
    res.status(500).json({ error: "Failed to load activity" });
  }
});

// GET /api/members/me/celebration — one-shot, same-day only.
streakRouter.get("/members/me/celebration", requireAuth, async (req: Request, res: Response) => {
  try {
    const memberId = req.memberId!;
    const celebration = await consumePendingCelebration(memberId);
    res.json(celebration);
  } catch (err) {
    console.error("[streak] celebration error:", err);
    res.status(500).json({ error: "Failed to read celebration" });
  }
});
