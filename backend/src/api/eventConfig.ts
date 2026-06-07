// Admin-editable RewardEventConfig — controls XP / doubloon amounts per event type
// and whether each event auto-grants or queues for admin approval.

import { Router, type Request, type Response } from "express";
import { prisma } from "../db/prisma.js";
import { requireAuth, requireAdmin } from "./auth.js";
import { RewardEventType } from "@prisma/client";

export const eventConfigRouter = Router();

// ── GET /api/event-config ────────────────────────────────────
// Any authenticated member can read (so member-facing UI can show "this gives X XP").

eventConfigRouter.get("/", requireAuth, async (_req: Request, res: Response) => {
  const rows = await prisma.rewardEventConfig.findMany({ orderBy: { eventType: "asc" } });
  res.json(rows);
});

// ── PUT /api/event-config/:eventType ─────────────────────────

eventConfigRouter.put("/:eventType", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const eventType = req.params.eventType as RewardEventType;
  if (!Object.values(RewardEventType).includes(eventType)) {
    res.status(400).json({ error: "Unknown event type" });
    return;
  }
  const { autoApprove, xpAmount, doubloonAmount } = req.body as {
    autoApprove?: boolean;
    xpAmount?: number;
    doubloonAmount?: number;
  };

  const updated = await prisma.rewardEventConfig.upsert({
    where:  { eventType },
    update: {
      ...(autoApprove    !== undefined ? { autoApprove } : {}),
      ...(xpAmount       !== undefined ? { xpAmount } : {}),
      ...(doubloonAmount !== undefined ? { doubloonAmount } : {}),
    },
    create: {
      eventType,
      autoApprove:    autoApprove    ?? true,
      xpAmount:       xpAmount       ?? 0,
      doubloonAmount: doubloonAmount ?? 0,
    },
  });
  res.json(updated);
});
