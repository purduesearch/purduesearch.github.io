import { Router, type Request, type Response } from "express";
import { requireAuth } from "./auth.js";
import { requireTaskEdit } from "../middleware/taskAccess.js";
import { prisma } from "../db/prisma.js";

export const blockersRouter = Router();
blockersRouter.use(requireAuth);

// ── GET /api/projects/:projectId/blockers ────────────────────
// Active categories only (resolvedAt null).

blockersRouter.get("/projects/:projectId/blockers", async (req: Request, res: Response) => {
  try {
    const projectId = req.params.projectId as string;
    const blockers = await prisma.blocker.findMany({
      where: { projectId, resolvedAt: null },
      orderBy: { createdAt: "desc" },
    });
    res.json(blockers);
  } catch (error) {
    console.error("Get blockers error:", error);
    res.status(500).json({ error: "Failed to get blockers" });
  }
});

// ── POST /api/projects/:projectId/blockers ───────────────────

blockersRouter.post("/projects/:projectId/blockers", async (req: Request, res: Response) => {
  try {
    const projectId = req.params.projectId as string;
    const { label, color } = req.body as { label: string; color?: string };
    if (!label) {
      res.status(400).json({ error: "label is required" });
      return;
    }
    const blocker = await prisma.blocker.create({
      data: { projectId, label, color: color ?? null },
    });
    res.status(201).json(blocker);
  } catch (error) {
    console.error("Create blocker error:", error);
    res.status(500).json({ error: "Failed to create blocker" });
  }
});

// ── POST /api/blockers/:id/resolve ────────────────────────────
// Resolves the category and detaches it from every task, recomputing
// BLOCKED status for tasks that have no remaining open blockers/deps.

blockersRouter.post("/blockers/:id/resolve", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const blocker = await prisma.blocker.findUnique({
      where: { id },
      include: { tasks: { select: { taskId: true } } },
    });
    if (!blocker) {
      res.status(404).json({ error: "Blocker not found" });
      return;
    }

    const affectedTaskIds = blocker.tasks.map((t) => t.taskId);

    await prisma.$transaction([
      prisma.blocker.update({ where: { id }, data: { resolvedAt: new Date() } }),
      prisma.taskBlocker.deleteMany({ where: { blockerId: id } }),
    ]);

    await recomputeBlockedStatus(affectedTaskIds);

    res.json({ ok: true });
  } catch (error) {
    console.error("Resolve blocker error:", error);
    res.status(500).json({ error: "Failed to resolve blocker" });
  }
});

// ── PATCH /api/blockers/:id ───────────────────────────────────
// Rename / recolor a category blocker.

blockersRouter.patch("/blockers/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { label, color } = req.body as { label?: string; color?: string | null };
    const data: { label?: string; color?: string | null } = {};
    if (typeof label === "string") {
      if (!label.trim()) {
        res.status(400).json({ error: "label cannot be empty" });
        return;
      }
      data.label = label.trim();
    }
    if (color !== undefined) data.color = color;
    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: "Nothing to update" });
      return;
    }
    const blocker = await prisma.blocker.update({ where: { id }, data });
    res.json(blocker);
  } catch (error) {
    console.error("Update blocker error:", error);
    res.status(500).json({ error: "Failed to update blocker" });
  }
});

// ── POST /api/tasks/:id/blockers ──────────────────────────────
// Attach an existing category blocker to a task; sets task BLOCKED.

blockersRouter.post("/tasks/:id/blockers", requireTaskEdit, async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id as string;
    const { blockerId, reason } = req.body as { blockerId: string; reason?: string | null };
    if (!blockerId) {
      res.status(400).json({ error: "blockerId is required" });
      return;
    }

    const blocker = await prisma.blocker.findUnique({ where: { id: blockerId } });
    if (!blocker || blocker.resolvedAt) {
      res.status(400).json({ error: "Blocker not found or already resolved" });
      return;
    }

    await prisma.taskBlocker.upsert({
      where: { taskId_blockerId: { taskId, blockerId } },
      create: { taskId, blockerId, reason: reason ?? null },
      update: { reason: reason ?? null },
    });

    await prisma.task.update({ where: { id: taskId }, data: { status: "BLOCKED" } });

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { blockers: { include: { blocker: true } } },
    });
    res.json(task);
  } catch (error) {
    console.error("Attach blocker error:", error);
    res.status(500).json({ error: "Failed to attach blocker" });
  }
});

// ── DELETE /api/tasks/:id/blockers/:blockerId ─────────────────
// Detach; clears BLOCKED if no remaining open blockers/dependencies.

blockersRouter.delete("/tasks/:id/blockers/:blockerId", requireTaskEdit, async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id as string;
    const blockerId = req.params.blockerId as string;

    await prisma.taskBlocker.delete({
      where: { taskId_blockerId: { taskId, blockerId } },
    });

    await recomputeBlockedStatus([taskId]);

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { blockers: { include: { blocker: true } } },
    });
    res.json(task);
  } catch (error) {
    console.error("Detach blocker error:", error);
    res.status(500).json({ error: "Failed to detach blocker" });
  }
});

// ── Helper ─────────────────────────────────────────────────────
// Clears a task's BLOCKED status once it has no open category blockers and
// no open (non-DONE) task dependencies. Leaves non-BLOCKED tasks untouched.

async function recomputeBlockedStatus(taskIds: string[]): Promise<void> {
  for (const taskId of taskIds) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        status: true,
        blockedBy: { include: { blockingTask: { select: { status: true } } } },
        blockers: { include: { blocker: { select: { resolvedAt: true } } } },
      },
    });
    if (!task || task.status !== "BLOCKED") continue;

    const hasOpenDep = task.blockedBy.some((d) => d.blockingTask.status !== "DONE");
    const hasOpenCategory = task.blockers.some((b) => b.blocker.resolvedAt === null);
    if (!hasOpenDep && !hasOpenCategory) {
      await prisma.task.update({ where: { id: taskId }, data: { status: "TODO" } });
    }
  }
}
