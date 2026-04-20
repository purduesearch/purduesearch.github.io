import { Router, type Request, type Response } from "express";
import { requireAuth } from "./auth.js";
import { updateTask, deleteTask, getTask } from "../services/taskService.js";
import type { TaskStatus, Priority } from "@prisma/client";

export const tasksRouter = Router();

// All routes require authentication
tasksRouter.use(requireAuth);

// ── PATCH /api/tasks/:id ─────────────────────────────────────

tasksRouter.patch("/:id", async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id as string;
    const { title, description, status, priority, dueDate, assigneeId } =
      req.body as {
        title?: string;
        description?: string;
        status?: TaskStatus;
        priority?: Priority;
        dueDate?: string | null;
        assigneeId?: string | null;
      };

    const existingTask = await getTask(taskId);
    if (!existingTask) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    const task = await updateTask(taskId, {
      title,
      description,
      status,
      priority,
      dueDate: dueDate === null ? undefined : dueDate ? new Date(dueDate) : undefined,
      assigneeId: assigneeId === null ? null : assigneeId,
    });

    res.json(task);
  } catch (error) {
    console.error("Update task error:", error);
    res.status(500).json({ error: "Failed to update task" });
  }
});

// ── DELETE /api/tasks/:id ────────────────────────────────────

tasksRouter.delete("/:id", async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id as string;
    const existingTask = await getTask(taskId);
    if (!existingTask) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    await deleteTask(taskId);
    res.json({ ok: true });
  } catch (error) {
    console.error("Delete task error:", error);
    res.status(500).json({ error: "Failed to delete task" });
  }
});
