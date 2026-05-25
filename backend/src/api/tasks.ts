import { Router, type Request, type Response } from "express";
import { requireAuth } from "./auth.js";
import { channelAuth } from "../middleware/channelAuth.js";
import { getTaskPermissions } from "../middleware/taskAccess.js";
import { updateTask, deleteTask, getTask, createSubtask, getSubtasks, addDependency, removeDependency, logTime, createTask } from "../services/taskService.js";
import { logAuditEvent, diffObjects } from "../services/activityService.js";
import type { TaskStatus, TaskProgress, Priority, NotificationType } from "@prisma/client";
import { generateJson, generateJsonFromImage } from "../services/geminiService.js";
import {
  duplicateDetectionPrompt, enrichTaskPrompt, deadlineSuggestionPrompt, nlToTaskPrompt, imageToTaskPrompt,
} from "../utils/aiPrompts.js";
import { prisma as prismaClient } from "../db/prisma.js";
import { createNotification } from "../services/notificationCrud.js";
import { queueDm } from "../services/dmBatcher.js";

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

tasksRouter.post("/check-duplicates", async (req: Request, res: Response) => {
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

    const result = await generateJson(duplicateDetectionPrompt(title, description ?? "", existingTasks));
    res.json(result);
  } catch (error) {
    console.error("Check duplicates error:", error);
    res.status(500).json({ error: "Failed to check for duplicates" });
  }
});

// ── POST /api/tasks/create-from-nl ──────────────────────────

tasksRouter.post("/create-from-nl", async (req: Request, res: Response) => {
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

    const parsed = await generateJson<{
      title: string;
      description?: string | null;
      priority?: Priority;
      dueDate?: string | null;
      assigneeName?: string | null;
    }>(nlToTaskPrompt(input, project.name, memberNames, today));

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
    console.error("Create from NL error:", error);
    res.status(500).json({ error: "Failed to create task from natural language" });
  }
});

// ── POST /api/tasks/create-from-image ───────────────────────

tasksRouter.post("/create-from-image", async (req: Request, res: Response) => {
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

    const result = await generateJsonFromImage<{
      hasTask: boolean;
      title: string;
      description: string;
      priority: Priority;
      screenshotDescription: string;
    }>(imageBase64, mimeType, imageToTaskPrompt(project.name, userNote ?? ""));

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
    console.error("Create from image error:", error);
    res.status(500).json({ error: "Failed to create task from image" });
  }
});

// ── PATCH /api/tasks/:id ─────────────────────────────────────

tasksRouter.patch("/:id", channelAuth, async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id as string;
    const { title, description, status, progress, priority, dueDate, assigneeIds, tags, attachments, parentTaskId, blockingTaskIds } =
      req.body as {
        title?: string;
        description?: string;
        status?: TaskStatus;
        progress?: TaskProgress;
        priority?: Priority;
        dueDate?: string | null;
        assigneeIds?: string[];
        tags?: string[];
        attachments?: string[];
        parentTaskId?: string | null;
        blockingTaskIds?: string[];
      };

    const existingTask = await getTask(taskId);
    if (!existingTask) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    const { canEdit } = await getTaskPermissions(req.memberId!, taskId);
    if (!canEdit) {
      res.status(403).json({ error: "Only assignees, the creator, or an admin can edit this task" });
      return;
    }

    if (status === "DONE" && existingTask.status !== "DONE") {
      const openBlockers = ((existingTask as any).blockedBy ?? []).filter(
        (d: any) => d.blockingTask.status !== "DONE"
      );
      if (openBlockers.length > 0) {
        const names = openBlockers.map((d: any) => `"${d.blockingTask.title}"`).join(", ");
        const count = openBlockers.length;
        res.status(400).json({
          error: `Cannot mark as done: ${count} blocker${count > 1 ? "s" : ""} not yet completed — ${names}`,
        });
        return;
      }
    }

    if (parentTaskId !== undefined) {
      console.log(`[updateTask] id=${taskId} parentTaskId=${parentTaskId ?? "null (removing parent)"}`);
    }

    const task = await updateTask(taskId, {
      title,
      description,
      status,
      progress,
      priority,
      dueDate: dueDate === null ? undefined : dueDate ? new Date(dueDate) : undefined,
      assigneeIds,
      tags,
      attachments,
      parentTaskId,
      blockedByIds: blockingTaskIds,
    });

    // Audit log — fire-and-forget, never block the response
    (() => {
      const memberId = (req.session as any).memberId as string | undefined;
      const assigneesBefore = (existingTask.assignees ?? []).map((a: any) => a.id).sort().join(",");
      const assigneesAfter  = (task.assignees ?? []).map((a: any) => a.id).sort().join(",");
      const isNowDone        = existingTask.status !== "DONE" && task.status === "DONE";
      const assigneesChanged = assigneesBefore !== assigneesAfter;

      if (isNowDone) {
        logAuditEvent({
          taskId: taskId, memberId: memberId ?? null, source: "WEB",
          eventType: "TASK_COMPLETED", payload: { taskTitle: task.title },
        }).catch(console.error);
      } else if (assigneesChanged && task.status === existingTask.status) {
        logAuditEvent({
          taskId: taskId, memberId: memberId ?? null, source: "WEB",
          eventType: "TASK_ASSIGNED",
          payload: {
            taskTitle:     task.title,
            assigneeNames: (task.assignees ?? []).map((a: any) => a.displayName),
          },
        }).catch(console.error);
      } else {
        const WATCHED = ["status", "priority", "dueDate", "title", "description"];
        const changes = diffObjects(existingTask as any, task as any, WATCHED);
        if (changes.length > 0) {
          logAuditEvent({
            taskId: taskId, memberId: memberId ?? null, source: "WEB",
            eventType: "TASK_UPDATED",
            payload: { taskTitle: task.title, changes },
          }).catch(console.error);
        }
      }
    })();

    // Notification emitters (fire-and-forget)
    (() => {
      const actorId = (req.session as any).memberId as string | undefined;
      if (!actorId) return Promise.resolve();

      const assigneesBefore = (existingTask.assignees ?? []).map((a: any) => a.id);
      const assigneesAfter  = (task.assignees ?? []).map((a: any) => a.id);
      const assigneesChanged = assigneesBefore.sort().join(",") !== assigneesAfter.sort().join(",");
      const addedAssigneeIds = assigneesAfter.filter((id: string) => !assigneesBefore.includes(id));
      const isNowDone        = existingTask.status !== "DONE" && task.status === "DONE";

      return (async () => {
        const [actor, proj] = await Promise.all([
          prismaClient.member.findUnique({ where: { id: actorId }, select: { displayName: true } }),
          prismaClient.project.findUnique({ where: { id: task.projectId }, select: { name: true } }),
        ]);

        if (assigneesChanged && addedAssigneeIds.length > 0) {
          const addedAssignees = (task.assignees ?? []).filter(
            (a: any) => addedAssigneeIds.includes(a.id)
          );
          for (const assignee of addedAssignees) {
            if (assignee.id === actorId) continue;
            await createNotification({
              type: "TASK_ASSIGNED" as NotificationType,
              recipientId: assignee.id,
              actorId,
              projectId: task.projectId,
              taskId,
              message: `${actor?.displayName ?? "Someone"} assigned you to "${task.title}" in ${proj?.name ?? "a project"}`,
            });
            if (assignee.slackId) queueDm(assignee.slackId, `📋 *${actor?.displayName ?? "Someone"}* assigned you to *${task.title}* in ${proj?.name ?? "a project"}`);
          }
        }

        if (isNowDone) {
          for (const assignee of (task.assignees ?? [])) {
            if ((assignee as any).id === actorId) continue;
            await createNotification({
              type: "TASK_COMPLETED" as NotificationType,
              recipientId: (assignee as any).id,
              actorId,
              projectId: task.projectId,
              taskId,
              message: `Task "${task.title}" was marked done`,
            });
            if ((assignee as any).slackId) queueDm((assignee as any).slackId, `✅ Task *${task.title}* was marked done`);
          }
        }
      })();
    })().catch(console.error);

    // If task is linked to a milestone, refresh its health (fire-and-forget)
    if ((task as any).milestoneId) {
      const { refreshMilestoneHealth } = await import("../services/milestoneService.js");
      refreshMilestoneHealth((task as any).milestoneId).catch(console.error);
    }

    res.json(task);
  } catch (error) {
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
      res.status(403).json({ error: "Only the creator or an admin can delete this task" });
      return;
    }

    const memberId = (req.session as any).memberId as string | undefined;
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
        },
      },
      orderBy: { createdAt: "asc" },
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
    const { prisma } = await import("../db/prisma.js");
    const activities = await prisma.activity.findMany({
      where: { entityId: taskId, entityType: "Task" },
      include: { member: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    // Normalize to the shape TaskModal expects: { actor, action, at }
    const history = activities.map(a => ({
      id: a.id,
      actor: a.member,
      action: a.type.toLowerCase().replace(/_/g, " "),
      at: a.createdAt,
      metadata: a.metadata,
    }));
    res.json(history);
  } catch (error) {
    console.error("Get history error:", error);
    res.status(500).json({ error: "Failed to get history" });
  }
});

// ── POST /api/tasks/:id/comments ─────────────────────────────

tasksRouter.post("/:id/comments", async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id as string;
    const { content, parentId } = req.body as { content: string; parentId?: string };
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
        ...(parentId ? { parentId } : {}),
      },
    });

    const populatedComment = await prisma.taskComment.findUnique({
      where: { id: comment.id },
      include: { author: true, task: { include: { project: true } } },
    });

    // If this is a reply, notify the parent comment's author
    if (parentId && populatedComment) {
      const parentComment = await prisma.taskComment.findUnique({
        where: { id: parentId },
        select: { authorId: true },
      });
      if (parentComment && parentComment.authorId !== memberId) {
        createNotification({
          type: "COMMENT_REPLY" as NotificationType,
          recipientId: parentComment.authorId,
          actorId: memberId,
          taskId,
          commentId: comment.id,
          message: `${populatedComment.author.displayName} replied to your comment on task "${populatedComment.task.title}"`,
        }).catch(console.error);
      }
    }

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

    // Notify task assignees of new comment (exclude author)
    const taskForNotif = await prismaClient.task.findUnique({
      where: { id: taskId },
      include: { assignees: true, project: true },
    });
    if (taskForNotif) {
      const author = await prismaClient.member.findUnique({
        where: { id: memberId },
        select: { displayName: true },
      });
      for (const assignee of taskForNotif.assignees) {
        if (assignee.id === memberId) continue; // skip actor
        createNotification({
          type: "TASK_COMMENTED" as NotificationType,
          recipientId: assignee.id,
          actorId: memberId,
          projectId: taskForNotif.projectId,
          taskId,
          message: `${author?.displayName ?? "Someone"} commented on "${taskForNotif.title}"`,
        }).catch(console.error);
        if ((assignee as any).slackId) queueDm((assignee as any).slackId, `💬 *${author?.displayName ?? "Someone"}* commented on *${taskForNotif.title}* (${(taskForNotif as any).project.name}):\n> ${content.slice(0, 200)}`);
      }
    }

    // Sync comment to Slack thread (if task has a Slack announcement)
    if (populatedComment?.task?.slackMsgTs) {
      (async () => {
        try {
          const { boltApp } = await import("../slack/bolt.js");
          const { prisma: db } = await import("../db/prisma.js");
          const target = await db.projectNotificationTarget.findFirst({
            where: { projectId: populatedComment.task.projectId },
            select: { slackChannelId: true },
          });
          const channelId = target?.slackChannelId ?? populatedComment.task.project?.slackChannel;
          if (!channelId) return;

          const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";
          await boltApp.client.chat.postMessage({
            channel: channelId,
            thread_ts: populatedComment.task.slackMsgTs!,
            text: `💬 *${populatedComment.author.displayName}* commented: ${content.slice(0, 300)}${content.length > 300 ? "…" : ""}\n<${frontendUrl}/clubpm/projects/${populatedComment.task.projectId}|View on Dashboard>`,
          });
        } catch (err) {
          console.error("Comment Slack thread sync error:", err);
        }
      })();
    }

    res.status(201).json(populatedComment || comment);
  } catch (error) {
    console.error("Create comment error:", error);
    res.status(500).json({ error: "Failed to create comment" });
  }
});

// ── PATCH /api/tasks/:id/comments/:commentId ─────────────────

tasksRouter.patch("/:id/comments/:commentId", async (req: Request, res: Response) => {
  try {
    const commentId = req.params.commentId as string;
    const memberId = (req.session as any).memberId as string;
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
    const memberId = (req.session as any).memberId as string;

    const { prisma } = await import("../db/prisma.js");
    const comment = await prisma.taskComment.findUnique({ where: { id: commentId } });

    if (!comment) {
      res.status(404).json({ error: "Comment not found" });
      return;
    }

    const isAuthor = comment.authorId === memberId;
    if (!isAuthor) {
      const member = await prismaClient.member.findUnique({
        where: { id: memberId },
        select: { isAdmin: true },
      });
      if (!member?.isAdmin) {
        res.status(403).json({ error: "Forbidden: only the author or an admin can delete this comment" });
        return;
      }
    }

    await prisma.taskComment.delete({ where: { id: commentId } });

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
    const memberId = (req.session as any).memberId as string;
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

    const updated = await prisma.taskComment.update({
      where: { id: commentId },
      data: { reactions },
      include: { author: true },
    });

    res.json(updated);
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

// ── POST /api/tasks/:id/time-logs ────────────────────────────

tasksRouter.post("/:id/time-logs", async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id as string;
    const memberId = (req.session as any).memberId as string;
    const { minutes, note } = req.body as { minutes: number; note?: string };
    if (!minutes || typeof minutes !== "number" || minutes <= 0) {
      res.status(400).json({ error: "minutes must be a positive number" });
      return;
    }
    const log = await logTime(taskId, memberId, minutes, note);
    res.status(201).json(log);
  } catch (error) {
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
    });
    const totalMinutes = timeLogs.reduce((sum, l) => sum + l.minutes, 0);
    res.json({ timeLogs, totalMinutes });
  } catch (error) {
    console.error("Get time logs error:", error);
    res.status(500).json({ error: "Failed to get time logs" });
  }
});

// ── POST /api/tasks/:id/ai-enrich ───────────────────────────

tasksRouter.post("/:id/ai-enrich", async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id as string;
    const { projectType } = req.body as { projectType?: string };

    const task = await getTask(taskId);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    const enriched = await generateJson<{
      description: string;
      acceptanceCriteria: string[];
      technicalNotes: string | null;
      definitionOfDone: string;
    }>(enrichTaskPrompt((task as any).title, (task as any).description ?? "", projectType ?? "engineering"));

    if (!enriched) {
      res.status(500).json({ error: "AI enrichment failed" });
      return;
    }

    const updated = await updateTask(taskId, { description: enriched.description });

    res.json({ ...updated, ...enriched });
  } catch (error) {
    console.error("AI enrich error:", error);
    res.status(500).json({ error: "Failed to enrich task" });
  }
});

// ── POST /api/tasks/:id/suggest-deadline ────────────────────

tasksRouter.post("/:id/suggest-deadline", async (req: Request, res: Response) => {
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

    const result = await generateJson<{ suggestedDueDate: string; reasoning: string }>(
      deadlineSuggestionPrompt(
        (task as any).title,
        (task as any).description ?? "",
        (task as any).storyPoints ?? null,
        velocity,
        (project as any)?.targetDate?.toISOString().split("T")[0] ?? null,
        today,
      ),
    );

    if (!result) {
      res.status(500).json({ error: "AI deadline suggestion failed" });
      return;
    }

    res.json(result);
  } catch (error) {
    console.error("Suggest deadline error:", error);
    res.status(500).json({ error: "Failed to suggest deadline" });
  }
});
