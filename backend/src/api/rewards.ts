// Admin queue for member-created task rewards that need approval.

import { Router, type Request, type Response } from "express";
import { prisma } from "../db/prisma.js";
import { requireAuth, requireAdmin } from "./auth.js";
import { approveReward, rejectReward } from "../services/rewardService.js";

export const rewardsRouter = Router();

// ── GET /api/rewards/pending/count ───────────────────────────

rewardsRouter.get("/pending/count", requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  const count = await prisma.pendingReward.count({
    where: { status: "PENDING" },
  });
  res.json({ count });
});

// ── GET /api/rewards/pending ─────────────────────────────────

rewardsRouter.get("/pending", requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  const pending = await prisma.pendingReward.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "desc" },
    include: {
      member: { select: { id: true, displayName: true, avatarUrl: true, slackHandle: true } },
    },
  });

  const taskIds = pending.map(p => p.taskId).filter((id): id is string => !!id);

  if (taskIds.length > 0) {
    const tasks = await prisma.task.findMany({
      where: { id: { in: taskIds } },
      include: {
        assignees: { select: { id: true, displayName: true, avatarUrl: true } },
        timeLogs: {
          include: {
            member: { select: { id: true, displayName: true } }
          },
          orderBy: { loggedAt: "desc" }
        }
      }
    });

    const activities = await prisma.activity.findMany({
      where: {
        entityId: { in: taskIds },
        entityType: "Task"
      },
      include: {
        member: { select: { id: true, displayName: true } }
      },
      orderBy: { createdAt: "desc" }
    });

    const pendingWithTaskDetails = pending.map(p => {
      if (!p.taskId) return p;
      const task = tasks.find(t => t.id === p.taskId);
      if (!task) return p;

      const taskActivities = activities.filter(a => a.entityId === p.taskId);
      return {
        ...p,
        task: {
          ...task,
          activities: taskActivities
        }
      };
    });

    res.json(pendingWithTaskDetails);
  } else {
    res.json(pending);
  }
});

// ── PUT /api/rewards/pending/:id ─────────────────────────────
// Body: { action: "approve" | "reject", adjustedXp?: number, adjustedDoubloons?: number }

rewardsRouter.put("/pending/:id", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { action, adjustedXp, adjustedDoubloons } = req.body as {
    action: "approve" | "reject";
    adjustedXp?: number;
    adjustedDoubloons?: number;
  };

  try {
    if (action === "approve") {
      if (adjustedXp !== undefined && (adjustedXp < 0 || adjustedXp > 100)) {
        res.status(400).json({ error: "Adjusted XP must be between 0 and 100" });
        return;
      }
      if (adjustedDoubloons !== undefined && (adjustedDoubloons < 0 || adjustedDoubloons > 100)) {
        res.status(400).json({ error: "Adjusted Doubloons must be between 0 and 100" });
        return;
      }
      await approveReward(id, req.memberId!, { adjustedXp, adjustedDoubloons });
    } else if (action === "reject") {
      await rejectReward(id, req.memberId!);
    } else {
      res.status(400).json({ error: "action must be 'approve' or 'reject'" });
      return;
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message ?? "Failed to process reward" });
  }
});
