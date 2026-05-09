import { Router, type Request, type Response } from "express";
import { requireAuth } from "./auth.js";
import { updateTask, deleteTask, getTask, createSubtask, getSubtasks, addDependency, removeDependency } from "../services/taskService.js";
import type { TaskStatus, Priority } from "@prisma/client";

export const tasksRouter = Router();

// All routes require authentication
tasksRouter.use(requireAuth);

// ── GET /api/tasks/search ────────────────────────────────────

tasksRouter.get("/search", async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;
    if (!query) {
      res.json([]);
      return;
    }

    const { prisma } = await import("../db/prisma.js");
    const tasks = await prisma.task.findMany({
      where: {
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          { description: { contains: query, mode: "insensitive" } },
          { tags: { hasSome: [query] } },
          { assignees: { some: { displayName: { contains: query, mode: "insensitive" } } } },
        ],
      },
      include: { assignees: true, project: true },
      take: 20,
    });

    res.json(tasks);
  } catch (error) {
    console.error("Search tasks error:", error);
    res.status(500).json({ error: "Failed to search tasks" });
  }
});

// ── PATCH /api/tasks/:id ─────────────────────────────────────

tasksRouter.patch("/:id", async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id as string;
    const { title, description, status, priority, dueDate, assigneeIds, tags, attachments } =
      req.body as {
        title?: string;
        description?: string;
        status?: TaskStatus;
        priority?: Priority;
        dueDate?: string | null;
        assigneeIds?: string[];
        tags?: string[];
        attachments?: string[];
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
      assigneeIds,
      tags,
      attachments,
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

// ── POST /api/tasks/:id/comments ─────────────────────────────

tasksRouter.post("/:id/comments", async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id as string;
    const { content } = req.body as { content: string };
    const memberId = (req.session as any).memberId as string;

    if (!content) {
      res.status(400).json({ error: "Content is required" });
      return;
    }

    const { prisma } = await import("../db/prisma.js");
    const comment = await prisma.taskComment.create({
      data: {
        content,
        taskId,
        authorId: memberId,
      },
    });

    const populatedComment = await prisma.taskComment.findUnique({
      where: { id: comment.id },
      include: { author: true, task: { include: { project: true } } },
    });

    // Handle @mentions
    const mentionRegex = /@([a-zA-Z0-9_-]+)/g;
    const mentions = [...content.matchAll(mentionRegex)].map(m => m[1]);

    if (mentions.length > 0) {
      const mentionedMembers = await prisma.member.findMany({
        where: { slackHandle: { in: mentions } }
      });

      console.log(`[mentions] Found ${mentionedMembers.length} members matching handles: ${mentions.join(", ")}`);

      for (const m of mentionedMembers) {
        if (!m.slackId) {
          console.log(`[mentions] Skipping member ${m.displayName}: no slackId`);
          continue;
        }
        if (!populatedComment) {
          console.log(`[mentions] Skipping member ${m.displayName}: populatedComment is null`);
          continue;
        }

        try {
          // Lazy import to avoid circular dependency at module load time
          const { boltApp } = await import("../slack/bolt.js");
          await boltApp.client.chat.postMessage({
            channel: m.slackId,
            text: `🔔 *${populatedComment.author.displayName}* mentioned you in a comment on task *${populatedComment.task.title}* (${populatedComment.task.project.name}):\n\n> ${content}\n\n<${process.env.FRONTEND_URL}/clubpm/projects/${populatedComment.task.projectId}|View Task>`
          });
          console.log(`[mentions] Sent DM to Slack user ${m.slackId} (${m.displayName})`);
        } catch (dmErr) {
          console.error(`[mentions] Failed to DM ${m.slackId} (${m.displayName}):`, dmErr);
        }
      }
    }

    res.status(201).json(populatedComment || comment);
  } catch (error) {
    console.error("Create comment error:", error);
    res.status(500).json({ error: "Failed to create comment" });
  }
});

// ── GET /api/tasks/:id/subtasks ──────────────────────────────

tasksRouter.get("/:id/subtasks", async (req: Request, res: Response) => {
  try {
    const subtasks = await getSubtasks(req.params.id as string);
    res.json(subtasks);
  } catch (error) {
    console.error("Get subtasks error:", error);
    res.status(500).json({ error: "Failed to get subtasks" });
  }
});

// ── POST /api/tasks/:id/subtasks ─────────────────────────────

tasksRouter.post("/:id/subtasks", async (req: Request, res: Response) => {
  try {
    const { title, assigneeIds } = req.body as {
      title: string;
      assigneeIds?: string[];
    };
    if (!title) {
      res.status(400).json({ error: "title is required" });
      return;
    }
    const subtask = await createSubtask(req.params.id as string, { title, assigneeIds });
    res.status(201).json(subtask);
  } catch (error) {
    console.error("Create subtask error:", error);
    res.status(500).json({ error: "Failed to create subtask" });
  }
});

// ── POST /api/tasks/:id/dependencies ─────────────────────────

tasksRouter.post("/:id/dependencies", async (req: Request, res: Response) => {
  try {
    const { blockedById } = req.body as { blockedById: string };
    if (!blockedById) {
      res.status(400).json({ error: "blockedById is required" });
      return;
    }
    const result = await addDependency(req.params.id as string, blockedById);
    res.json(result);
  } catch (error: any) {
    if (error.message?.includes("circular") || error.message?.includes("itself")) {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error("Add dependency error:", error);
    res.status(500).json({ error: "Failed to add dependency" });
  }
});

// ── DELETE /api/tasks/:id/dependencies/:depId ────────────────

tasksRouter.delete("/:id/dependencies/:depId", async (req: Request, res: Response) => {
  try {
    const result = await removeDependency(req.params.id as string, req.params.depId as string);
    res.json(result);
  } catch (error) {
    console.error("Remove dependency error:", error);
    res.status(500).json({ error: "Failed to remove dependency" });
  }
});
