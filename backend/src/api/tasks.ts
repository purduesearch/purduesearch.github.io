import { Router, type Request, type Response } from "express";
import { updateTaskAsMember, addCommentAsMember, logTimeAsMember, TaskMutationError, type TaskPatch } from "../services/taskMutationService.js";
import { requireAuth } from "./auth.js";
import { channelAuth } from "../middleware/channelAuth.js";
import { getTaskPermissions, requireTaskEdit } from "../middleware/taskAccess.js";
import { aiRateLimit } from "../middleware/aiRateLimit.js";
import { updateTask, deleteTask, getTask, createSubtask, getSubtasks, addDependency, removeDependency, createTask, assertCanComplete, assertNotCategoryBlocked } from "../services/taskService.js";
import { assertCiGatePasses, applyCompletionSideEffects } from "../services/taskCompletionService.js";
import { logAuditEvent, getTaskAuditLog } from "../services/activityService.js";
import type { TaskStatus, Priority } from "@prisma/client";
import { GeminiRateLimitError } from "../services/geminiService.js";
import { runJson } from "../services/ai/aiRouter.js";
import {
  duplicateDetectionPrompt, enrichTaskPrompt, deadlineSuggestionPrompt, nlToTaskPrompt, imageToTaskPrompt,
} from "../utils/aiPrompts.js";
import { prisma as prismaClient } from "../db/prisma.js";
import { EXCLUDE_TRAINING } from "../services/trainingSandboxService.js";
import { emitTaskChanged } from "../services/taskChangeBus.js";

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
    const projectId = req.query.projectId as string | undefined;

    const { prisma } = await import("../db/prisma.js");
    const tasks = await prisma.task.findMany({
      where: {
        archivedAt: null,
        // Global search must not turn up someone's practice tasks.
        ...(projectId ? { projectId } : { project: { is: EXCLUDE_TRAINING } }),
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          { description: { contains: query, mode: "insensitive" } },
          { tags: { some: { name: { contains: query, mode: "insensitive" } } } },
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

// ── POST /api/tasks/check-duplicates ────────────────────────

tasksRouter.post("/check-duplicates", requireAuth, aiRateLimit, async (req: Request, res: Response) => {
  try {
    const { title, description, projectId } = req.body as {
      title: string;
      description?: string;
      projectId: string;
    };

    if (!title || !projectId) {
      res.status(400).json({ error: "title and projectId are required" });
      return;
    }

    const existingTasks = await prismaClient.task.findMany({
      where: { projectId, status: { not: "DONE" } },
      select: { id: true, title: true, description: true },
    });

    const result = await runJson({ memberId: req.memberId }, "medium", {
      prompt: duplicateDetectionPrompt(title, description ?? "", existingTasks),
      json: true,
    });
    res.json(result);
  } catch (error) {
    if (error instanceof GeminiRateLimitError) { res.status(429).json({ error: "AI service busy — try again shortly" }); return; }
    console.error("Check duplicates error:", error);
    res.status(500).json({ error: "Failed to check for duplicates" });
  }
});

// ── POST /api/tasks/create-from-nl ──────────────────────────

tasksRouter.post("/create-from-nl", requireAuth, aiRateLimit, async (req: Request, res: Response) => {
  try {
    const { input, projectId } = req.body as { input: string; projectId: string };

    if (!input || !projectId) {
      res.status(400).json({ error: "input and projectId are required" });
      return;
    }

    const project = await prismaClient.project.findUnique({
      where: { id: projectId },
      include: { members: { include: { member: true } } },
    });
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const memberNames = project.members.map((pm: any) => pm.member.displayName as string);
    const today = new Date().toISOString().split("T")[0];

    const parsed = await runJson<{
      title: string;
      description?: string | null;
      priority?: Priority;
      dueDate?: string | null;
      assigneeName?: string | null;
    }>({ memberId: req.memberId }, "medium", {
      prompt: nlToTaskPrompt(input, project.name, memberNames, today),
      json: true,
    });

    if (!parsed) {
      res.status(500).json({ error: "AI failed to parse task" });
      return;
    }

    let assigneeId: string | undefined;
    if (parsed.assigneeName) {
      const nameLower = parsed.assigneeName.toLowerCase();
      const match = project.members.find(
        (pm: any) =>
          pm.member.displayName.toLowerCase().includes(nameLower) ||
          nameLower.includes(pm.member.displayName.toLowerCase()),
      );
      if (match) assigneeId = (match as any).member.id;
    }

    const task = await createTask({
      title: parsed.title,
      description: parsed.description ?? undefined,
      priority: parsed.priority,
      dueDate: parsed.dueDate ? new Date(parsed.dueDate) : undefined,
      projectId,
      assigneeIds: assigneeId ? [assigneeId] : [],
      createdById: req.memberId,
    });

    res.status(201).json(task);
  } catch (error) {
    if (error instanceof GeminiRateLimitError) { res.status(429).json({ error: "AI service busy — try again shortly" }); return; }
    console.error("Create from NL error:", error);
    res.status(500).json({ error: "Failed to create task from natural language" });
  }
});

// ── POST /api/tasks/create-from-image ───────────────────────

tasksRouter.post("/create-from-image", requireAuth, aiRateLimit, async (req: Request, res: Response) => {
  try {
    const { imageBase64, mimeType, projectId, userNote } = req.body as {
      imageBase64: string;
      mimeType: "image/png" | "image/jpeg" | "image/webp";
      projectId: string;
      userNote?: string;
    };

    if (!imageBase64 || !mimeType || !projectId) {
      res.status(400).json({ error: "imageBase64, mimeType, and projectId are required" });
      return;
    }

    const project = await prismaClient.project.findUnique({ where: { id: projectId } });
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const result = await runJson<{
      hasTask: boolean;
      title: string;
      description: string;
      priority: Priority;
      screenshotDescription: string;
    }>({ memberId: req.memberId }, "medium", {
      prompt: imageToTaskPrompt(project.name, userNote ?? ""),
      json: true,
      image: { base64: imageBase64, mimeType },
    });

    if (!result) {
      res.status(500).json({ error: "AI failed to analyze image" });
      return;
    }

    let createdTask = null;
    if (result.hasTask) {
      createdTask = await createTask({
        title: result.title,
        description: result.description,
        priority: result.priority,
        projectId,
        assigneeIds: [],
        createdById: req.memberId,
      });
    }

    res.json({ task: createdTask, screenshotDescription: result.screenshotDescription });
  } catch (error) {
    if (error instanceof GeminiRateLimitError) { res.status(429).json({ error: "AI service busy — try again shortly" }); return; }
    console.error("Create from image error:", error);
    res.status(500).json({ error: "Failed to create task from image" });
  }
});

// ── PATCH /api/tasks/bulk ────────────────────────────────────
// Must be above /:id routes so "bulk" is not captured as an id param.

tasksRouter.patch("/bulk", async (req: Request, res: Response) => {
  try {
    const { ids, patch } = req.body as {
      ids: string[];
      patch: {
        status?: TaskStatus;
        priority?: Priority;
        dueDate?: string | null;
        assigneeIds?: string[];
      };
    };

    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: "ids must be a non-empty array" });
      return;
    }

    const memberId = req.memberId!;
    const updated: any[] = [];
    const skipped: { id: string; reason: string }[] = [];
    let actorReward: import("../services/rewardService.js").ActorRewardSummary | null = null;
    let progressMilestones: import("../services/challengeService.js").ProgressMilestone[] = [];

    for (const id of ids) {
      const existingTask = await getTask(id);
      if (!existingTask) {
        skipped.push({ id, reason: "Task not found" });
        continue;
      }

      const { canEdit } = await getTaskPermissions(memberId, id);
      if (!canEdit) {
        skipped.push({ id, reason: "Permission denied" });
        continue;
      }

      if (patch.status && patch.status !== existingTask.status) {
        const lockError = assertNotCategoryBlocked(existingTask as any, patch.status);
        if (lockError) {
          skipped.push({ id, reason: lockError });
          continue;
        }
      }

      const isCompletion = patch.status === "DONE" && existingTask.status !== "DONE";

      if (isCompletion) {
        const blockerError = assertCanComplete(existingTask as any);
        if (blockerError) {
          skipped.push({ id, reason: blockerError });
          continue;
        }

        const ciError = await assertCiGatePasses(id, existingTask.projectId);
        if (ciError) {
          skipped.push({ id, reason: ciError });
          continue;
        }
      }

      try {
        const task = await updateTask(id, {
          status: patch.status,
          priority: patch.priority,
          dueDate: patch.dueDate === null ? undefined : patch.dueDate ? new Date(patch.dueDate) : undefined,
          assigneeIds: patch.assigneeIds,
        });
        updated.push(task);

        if (isCompletion) {
          try {
            const result = await applyCompletionSideEffects({
              taskId: id,
              actorId: memberId,
              existingTask,
              updatedTask: task,
            });
            if (result.actorReward) actorReward = result.actorReward;
            if (result.progressMilestones.length > 0) {
              progressMilestones = progressMilestones.concat(result.progressMilestones);
            }
          } catch (err) {
            console.error("[reward] bulk applyCompletionSideEffects:", err);
          }
        }
      } catch (err) {
        skipped.push({ id, reason: (err as Error).message ?? "Update failed" });
      }
    }

    const responseBody: any = { updated, skipped };
    if (actorReward) Object.assign(responseBody, actorReward);
    if (progressMilestones.length > 0) responseBody.progressMilestones = progressMilestones;

    res.json(responseBody);
  } catch (error) {
    console.error("Bulk update error:", error);
    res.status(500).json({ error: "Failed to bulk update tasks" });
  }
});

// ── POST /api/tasks/bulk-delete ──────────────────────────────

tasksRouter.post("/bulk-delete", async (req: Request, res: Response) => {
  try {
    const { ids } = req.body as { ids: string[] };

    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: "ids must be a non-empty array" });
      return;
    }

    const memberId = req.memberId!;
    const deleted: string[] = [];
    const skipped: { id: string; reason: string }[] = [];

    for (const id of ids) {
      const existingTask = await getTask(id);
      if (!existingTask) {
        skipped.push({ id, reason: "Task not found" });
        continue;
      }

      const { canDelete } = await getTaskPermissions(memberId, id);
      if (!canDelete) {
        skipped.push({ id, reason: "Permission denied" });
        continue;
      }

      try {
        await deleteTask(id);
        logAuditEvent({
          projectId: existingTask.projectId,
          memberId: memberId ?? null,
          source: "WEB",
          eventType: "TASK_DELETED",
          payload: { taskTitle: existingTask.title },
        }).catch(console.error);
        deleted.push(id);
      } catch (err) {
        skipped.push({ id, reason: (err as Error).message ?? "Delete failed" });
      }
    }

    res.json({ deleted, skipped });
  } catch (error) {
    console.error("Bulk delete error:", error);
    res.status(500).json({ error: "Failed to bulk delete tasks" });
  }
});

// ── POST /api/tasks/bulk-archive ─────────────────────────────
// Must be above /:id routes so "bulk-archive" is not captured as an id param.

tasksRouter.post("/bulk-archive", async (req: Request, res: Response) => {
  try {
    const { ids, archived } = req.body as { ids: string[]; archived: boolean };

    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: "ids must be a non-empty array" });
      return;
    }

    const memberId = req.memberId!;
    const updated: any[] = [];
    const skipped: { id: string; reason: string }[] = [];

    for (const id of ids) {
      const existingTask = await getTask(id);
      if (!existingTask) {
        skipped.push({ id, reason: "Task not found" });
        continue;
      }

      const { canArchive } = await getTaskPermissions(memberId, id);
      if (!canArchive) {
        skipped.push({ id, reason: "Permission denied" });
        continue;
      }

      try {
        const task = await prismaClient.task.update({
          where: { id },
          data: archived
            ? { archivedAt: new Date(), archivedById: memberId }
            : { archivedAt: null, archivedById: null },
        });
        emitTaskChanged(id);

        logAuditEvent({
          projectId: existingTask.projectId,
          taskId: id,
          memberId,
          source: "WEB",
          eventType: archived ? "TASK_ARCHIVED" : "TASK_UNARCHIVED",
          payload: { taskTitle: existingTask.title },
        }).catch(console.error);

        updated.push(task);
      } catch (err) {
        skipped.push({ id, reason: (err as Error).message ?? "Update failed" });
      }
    }

    res.json({ updated, skipped });
  } catch (error) {
    console.error("Bulk archive error:", error);
    res.status(500).json({ error: "Failed to bulk archive tasks" });
  }
});

// ── PATCH /api/tasks/:id ─────────────────────────────────────

tasksRouter.patch("/:id", channelAuth, async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id as string;
    const { task, actorReward, progressMilestones, achievementUnlocks } =
      await updateTaskAsMember(req.memberId!, taskId, req.body as TaskPatch, "WEB");
    const responseBody: any = { ...task };
    if (actorReward) Object.assign(responseBody, actorReward);
    if (progressMilestones.length > 0) responseBody.progressMilestones = progressMilestones;
    if (achievementUnlocks.length > 0) responseBody.achievementUnlocks = achievementUnlocks;
    res.json(responseBody);
  } catch (error: any) {
    if (error instanceof TaskMutationError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error("Update task error:", error);
    res.status(500).json({ error: "Failed to update task" });
  }
});

// ── GET /api/tasks/:id ──────────────────────────────────────

tasksRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const task = await getTask(req.params.id as string);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    res.json(task);
  } catch (error) {
    console.error("Get task error:", error);
    res.status(500).json({ error: "Failed to get task" });
  }
});

// ── DELETE /api/tasks/:id ────────────────────────────────────

tasksRouter.delete("/:id", channelAuth, async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id as string;
    const existingTask = await getTask(taskId);
    if (!existingTask) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    const { canDelete } = await getTaskPermissions(req.memberId!, taskId);
    if (!canDelete) {
      res.status(403).json({ error: "Only the creator, a project lead, or an admin can delete this task" });
      return;
    }

    const memberId = req.memberId;
    await deleteTask(taskId);

    logAuditEvent({
      projectId: existingTask.projectId,
      memberId:  memberId ?? null,
      source:    "WEB",
      eventType: "TASK_DELETED",
      payload:   { taskTitle: existingTask.title },
    }).catch(console.error);

    res.json({ ok: true });
  } catch (error) {
    console.error("Delete task error:", error);
    res.status(500).json({ error: "Failed to delete task" });
  }
});

// ── POST /api/tasks/:id/archive ──────────────────────────────

tasksRouter.post("/:id/archive", async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id as string;
    const memberId = req.memberId!;

    const existingTask = await getTask(taskId);
    if (!existingTask) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    const { canArchive } = await getTaskPermissions(memberId, taskId);
    if (!canArchive) {
      res.status(403).json({ error: "Only the creator, an admin, or a completed task's team can archive it" });
      return;
    }

    const task = await prismaClient.task.update({
      where: { id: taskId },
      data: { archivedAt: new Date(), archivedById: memberId },
    });
    emitTaskChanged(taskId);

    logAuditEvent({
      projectId: existingTask.projectId,
      taskId,
      memberId,
      source: "WEB",
      eventType: "TASK_ARCHIVED",
      payload: { taskTitle: existingTask.title },
    }).catch(console.error);

    const blockedDeps = await prismaClient.taskDependency.findMany({
      where: { blockingTaskId: taskId },
      include: { blockedTask: { select: { id: true, title: true, status: true, archivedAt: true } } },
    });
    const dependencyWarnings = blockedDeps
      .map((dep) => dep.blockedTask)
      .filter((t) => t.status !== "DONE" && !t.archivedAt);

    res.json({ task, dependencyWarnings });
  } catch (error) {
    console.error("Archive task error:", error);
    res.status(500).json({ error: "Failed to archive task" });
  }
});

// ── POST /api/tasks/:id/unarchive ────────────────────────────

tasksRouter.post("/:id/unarchive", async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id as string;
    const memberId = req.memberId!;

    const existingTask = await getTask(taskId);
    if (!existingTask) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    const { canArchive } = await getTaskPermissions(memberId, taskId);
    if (!canArchive) {
      res.status(403).json({ error: "Only the creator, an admin, or a completed task's team can unarchive it" });
      return;
    }

    const task = await prismaClient.task.update({
      where: { id: taskId },
      data: { archivedAt: null, archivedById: null },
    });
    emitTaskChanged(taskId);

    logAuditEvent({
      projectId: existingTask.projectId,
      taskId,
      memberId,
      source: "WEB",
      eventType: "TASK_UNARCHIVED",
      payload: { taskTitle: existingTask.title },
    }).catch(console.error);

    res.json({ task });
  } catch (error) {
    console.error("Unarchive task error:", error);
    res.status(500).json({ error: "Failed to unarchive task" });
  }
});

// ── GET /api/tasks/:id/comments ──────────────────────────────

tasksRouter.get("/:id/comments", async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id as string;
    const { prisma } = await import("../db/prisma.js");
    const comments = await prisma.taskComment.findMany({
      where: { taskId, parentId: null },
      include: {
        author: true,
        replies: {
          include: { author: true },
          orderBy: { createdAt: "asc" },
          take: 200,
        },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    res.json(comments);
  } catch (error) {
    console.error("Get comments error:", error);
    res.status(500).json({ error: "Failed to get comments" });
  }
});

// ── GET /api/tasks/:id/history ────────────────────────────────

tasksRouter.get("/:id/history", async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id as string;
    const events = await getTaskAuditLog(taskId);
    // Normalize to the shape TaskModal expects: { actor, action, at, metadata }
    const history = events.map(e => ({
      id: e.id,
      actor: e.member,
      action: e.eventType.toLowerCase().replace(/_/g, " "),
      at: e.createdAt,
      metadata: e.payload,
    }));
    res.json(history);
  } catch (error) {
    console.error("Get history error:", error);
    res.status(500).json({ error: "Failed to get history" });
  }
});

// ── POST /api/tasks/:id/comments ─────────────────────────────

tasksRouter.post("/:id/comments", requireAuth, channelAuth, async (req: Request, res: Response) => {
  try {
    const { content, parentId } = req.body as { content: string; parentId?: string };
    const comment = await addCommentAsMember(req.memberId!, req.params.id as string, content, { parentId, source: "WEB" });
    res.status(201).json(comment);
  } catch (error) {
    if (error instanceof TaskMutationError) { res.status(error.status).json({ error: error.message }); return; }
    console.error("Create comment error:", error);
    res.status(500).json({ error: "Failed to create comment" });
  }
});

// ── PATCH /api/tasks/:id/comments/:commentId ─────────────────

tasksRouter.patch("/:id/comments/:commentId", async (req: Request, res: Response) => {
  try {
    const commentId = req.params.commentId as string;
    const memberId = req.memberId!;
    const { content } = req.body as { content: string };

    if (!content) {
      res.status(400).json({ error: "Content is required" });
      return;
    }

    const { prisma } = await import("../db/prisma.js");
    const comment = await prisma.taskComment.findUnique({ where: { id: commentId } });

    if (!comment) {
      res.status(404).json({ error: "Comment not found" });
      return;
    }
    if (comment.authorId !== memberId) {
      res.status(403).json({ error: "Forbidden: only the author can edit this comment" });
      return;
    }

    const updated = await prisma.taskComment.update({
      where: { id: commentId },
      data: { content, editedAt: new Date() },
      include: { author: true },
    });
    emitTaskChanged(comment.taskId);

    logAuditEvent({
      taskId: comment.taskId, memberId: memberId ?? null, source: "WEB",
      eventType: "COMMENT_EDITED",
      payload: { commentId, excerpt: content.slice(0, 120) },
    }).catch(console.error);

    res.json(updated);
  } catch (error) {
    console.error("Edit comment error:", error);
    res.status(500).json({ error: "Failed to edit comment" });
  }
});

// ── DELETE /api/tasks/:id/comments/:commentId ─────────────────

tasksRouter.delete("/:id/comments/:commentId", async (req: Request, res: Response) => {
  try {
    const commentId = req.params.commentId as string;
    const memberId = req.memberId!;

    const { prisma } = await import("../db/prisma.js");
    const comment = await prisma.taskComment.findUnique({ where: { id: commentId } });

    if (!comment) {
      res.status(404).json({ error: "Comment not found" });
      return;
    }

    const isAuthor = comment.authorId === memberId;
    if (!isAuthor) {
      const { isAdmin, isLead } = await getTaskPermissions(memberId, comment.taskId);
      if (!isAdmin && !isLead) {
        res.status(403).json({ error: "Forbidden: only the author, a project lead, or an admin can delete this comment" });
        return;
      }
    }

    await prisma.taskComment.delete({ where: { id: commentId } });
    emitTaskChanged(comment.taskId);

    logAuditEvent({
      taskId: comment.taskId, memberId: memberId ?? null, source: "WEB",
      eventType: "COMMENT_DELETED",
      payload: { commentId, excerpt: comment.content.slice(0, 120) },
    }).catch(console.error);

    res.json({ ok: true });
  } catch (error) {
    console.error("Delete comment error:", error);
    res.status(500).json({ error: "Failed to delete comment" });
  }
});

// ── POST /api/tasks/:id/comments/:commentId/reactions ────────

tasksRouter.post("/:id/comments/:commentId/reactions", async (req: Request, res: Response) => {
  try {
    const commentId = req.params.commentId as string;
    const memberId = req.memberId!;
    const { emoji } = req.body as { emoji: string };

    if (!emoji) {
      res.status(400).json({ error: "emoji is required" });
      return;
    }

    const { prisma } = await import("../db/prisma.js");
    const comment = await prisma.taskComment.findUnique({ where: { id: commentId } });

    if (!comment) {
      res.status(404).json({ error: "Comment not found" });
      return;
    }

    // reactions shape: { "👍": ["memberId1", "memberId2"], ... }
    const reactions = (comment.reactions as Record<string, string[]> | null) ?? {};
    const current = reactions[emoji] ?? [];

    if (current.includes(memberId)) {
      // Toggle off — remove the member from the array
      reactions[emoji] = current.filter(id => id !== memberId);
      if (reactions[emoji].length === 0) {
        delete reactions[emoji];
      }
    } else {
      // Toggle on — add the member to the array
      reactions[emoji] = [...current, memberId];
    }

    const wasOff = !current.includes(memberId);

    const updated = await prisma.taskComment.update({
      where: { id: commentId },
      data: { reactions },
      include: { author: true },
    });

    res.json(updated);

    // Challenge hook: only fire when toggling ON a reaction to someone else's comment
    if (wasOff && comment.authorId !== memberId) {
      (async () => {
        const { recordEvent } = await import("../services/challengeService.js");
        await recordEvent(memberId, "COMMENT_REACTION", 1, { teammateId: comment.authorId });
      })().catch(err => console.error("[challenge] reaction hook:", err));
    }
  } catch (error) {
    console.error("Toggle reaction error:", error);
    res.status(500).json({ error: "Failed to toggle reaction" });
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

tasksRouter.post("/:id/subtasks", requireAuth, requireTaskEdit, async (req: Request, res: Response) => {
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

tasksRouter.post("/:id/dependencies", requireAuth, requireTaskEdit, async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id as string;
    const { blockedById, reason } = req.body as { blockedById: string; reason?: string | null };
    if (!blockedById) {
      res.status(400).json({ error: "blockedById is required" });
      return;
    }
    const result = await addDependency(taskId, blockedById, reason);

    const memberId = req.memberId;
    const blockingTask = (result as any)?.blockedBy?.find(
      (d: any) => d.blockingTaskId === blockedById
    )?.blockingTask;
    logAuditEvent({
      taskId, memberId: memberId ?? null, source: "WEB",
      eventType: "TASK_DEPENDENCY_ADDED",
      payload: { taskTitle: result?.title, dependsOnTitle: blockingTask?.title ?? null, reason: reason ?? null },
    }).catch(console.error);

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

tasksRouter.delete("/:id/dependencies/:depId", requireAuth, requireTaskEdit, async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id as string;
    const depId = req.params.depId as string;
    const blockingTask = await prismaClient.task.findUnique({ where: { id: depId }, select: { title: true } });
    const result = await removeDependency(taskId, depId);

    const memberId = req.memberId;
    logAuditEvent({
      taskId, memberId: memberId ?? null, source: "WEB",
      eventType: "TASK_DEPENDENCY_REMOVED",
      payload: { taskTitle: result?.title, dependsOnTitle: blockingTask?.title ?? null },
    }).catch(console.error);

    res.json(result);
  } catch (error) {
    console.error("Remove dependency error:", error);
    res.status(500).json({ error: "Failed to remove dependency" });
  }
});

// ── POST /api/tasks/:id/time-logs ────────────────────────────

tasksRouter.post("/:id/time-logs", requireAuth, requireTaskEdit, async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id as string;
    const memberId = req.memberId!;
    const { minutes, note } = req.body as { minutes: number; note?: string };
    if (!minutes || typeof minutes !== "number" || minutes <= 0) {
      res.status(400).json({ error: "minutes must be a positive number" });
      return;
    }
    const log = await logTimeAsMember(memberId, taskId, minutes, note, "WEB");

    res.status(201).json(log);
  } catch (error) {
    if (error instanceof TaskMutationError) { res.status(error.status).json({ error: error.message }); return; }
    console.error("Log time error:", error);
    res.status(500).json({ error: "Failed to log time" });
  }
});

// ── GET /api/tasks/:id/time-logs ─────────────────────────────

tasksRouter.get("/:id/time-logs", async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id as string;
    const { prisma } = await import("../db/prisma.js");
    const timeLogs = await prisma.timeLog.findMany({
      where: { taskId },
      include: { member: { select: { id: true, displayName: true } } },
      orderBy: { loggedAt: "desc" },
      take: 200,
    });
    const totalMinutes = timeLogs.reduce((sum, l) => sum + l.minutes, 0);
    res.json({ timeLogs, totalMinutes });
  } catch (error) {
    console.error("Get time logs error:", error);
    res.status(500).json({ error: "Failed to get time logs" });
  }
});

// ── POST /api/tasks/:id/ai-enrich ───────────────────────────

tasksRouter.post("/:id/ai-enrich", requireAuth, requireTaskEdit, aiRateLimit, async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id as string;
    const { projectType } = req.body as { projectType?: string };

    const task = await getTask(taskId);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    const enriched = await runJson<{
      description: string;
      acceptanceCriteria: string[];
      technicalNotes: string | null;
      definitionOfDone: string;
    }>({ memberId: req.memberId }, "medium", {
      prompt: enrichTaskPrompt((task as any).title, (task as any).description ?? "", projectType ?? "engineering"),
      json: true,
    });

    if (!enriched) {
      res.status(500).json({ error: "AI enrichment failed" });
      return;
    }

    const updated = await updateTask(taskId, { description: enriched.description });

    res.json({ ...updated, ...enriched });
  } catch (error) {
    if (error instanceof GeminiRateLimitError) { res.status(429).json({ error: "AI service busy — try again shortly" }); return; }
    console.error("AI enrich error:", error);
    res.status(500).json({ error: "Failed to enrich task" });
  }
});

// ── POST /api/tasks/:id/suggest-deadline ────────────────────

tasksRouter.post("/:id/suggest-deadline", requireAuth, aiRateLimit, async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id as string;
    const { sprintDays: _sprintDays } = req.body as { sprintDays?: number };

    const task = await getTask(taskId);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    const project = await prismaClient.project.findUnique({
      where: { id: (task as any).projectId },
      select: { targetDate: true },
    });

    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

    const timeLogs = await prismaClient.timeLog.findMany({
      where: {
        task: { projectId: (task as any).projectId },
        loggedAt: { gte: fourWeeksAgo },
      },
      select: { minutes: true },
    });

    const totalMinutes = timeLogs.reduce((sum, l) => sum + l.minutes, 0);
    // Approximate velocity: total hours logged over 4 weeks → points per week (rough proxy)
    const velocity = totalMinutes > 0 ? Math.round(totalMinutes / (4 * 60)) : 10;

    const today = new Date().toISOString().split("T")[0];

    const result = await runJson<{ suggestedDueDate: string; reasoning: string }>(
      { memberId: req.memberId },
      "medium",
      {
        prompt: deadlineSuggestionPrompt(
          (task as any).title,
          (task as any).description ?? "",
          (task as any).storyPoints ?? null,
          velocity,
          (project as any)?.targetDate?.toISOString().split("T")[0] ?? null,
          today,
        ),
        json: true,
      },
    );

    if (!result) {
      res.status(500).json({ error: "AI deadline suggestion failed" });
      return;
    }

    res.json(result);
  } catch (error) {
    if (error instanceof GeminiRateLimitError) { res.status(429).json({ error: "AI service busy — try again shortly" }); return; }
    console.error("Suggest deadline error:", error);
    res.status(500).json({ error: "Failed to suggest deadline" });
  }
});
