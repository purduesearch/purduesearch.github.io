import { Router, type Request, type Response } from "express";
import { requireAuth } from "./auth.js";
import { channelAuth } from "../middleware/channelAuth.js";
import { getTaskPermissions, requireTaskEdit } from "../middleware/taskAccess.js";
import { aiRateLimit } from "../middleware/aiRateLimit.js";
import { updateTask, deleteTask, getTask, createSubtask, getSubtasks, addDependency, removeDependency, logTime, createTask, assertCanComplete, assertNotCategoryBlocked } from "../services/taskService.js";
import { logAuditEvent, diffObjects, getTaskAuditLog } from "../services/activityService.js";
import type { TaskStatus, TaskProgress, Priority, NotificationType } from "@prisma/client";
import { generateJson, generateJsonFromImage, GeminiRateLimitError } from "../services/geminiService.js";
import {
  duplicateDetectionPrompt, enrichTaskPrompt, deadlineSuggestionPrompt, nlToTaskPrompt, imageToTaskPrompt,
} from "../utils/aiPrompts.js";
import { prisma as prismaClient } from "../db/prisma.js";
import { createNotification } from "../services/notificationCrud.js";
import { queueDm } from "../services/dmBatcher.js";

// ── Attachment helpers ──────────────────────────────────────
//
// Frontend sends attachments as { url, label? } objects. We normalise them
// before writing so every stored row has a guaranteed-clickable absolute URL
// and a non-empty label. Strings (from older clients) are tolerated.

type AttachmentInput = string | { url?: string; label?: string };
type Attachment = { url: string; label: string };

function hostOf(url: string): string {
  try { return new URL(url).host; } catch { return url; }
}

function normaliseAttachment(att: AttachmentInput): Attachment | null {
  const raw = typeof att === "string" ? { url: att, label: att } : att ?? {};
  const url = typeof raw.url === "string" ? raw.url.trim() : "";
  if (!url) return null;
  const absoluteUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  const label =
    (typeof raw.label === "string" ? raw.label.trim() : "") ||
    hostOf(absoluteUrl);
  return { url: absoluteUrl, label };
}

function normaliseAttachments(input: unknown): Attachment[] | undefined {
  if (input === undefined) return undefined;
  if (!Array.isArray(input)) return [];
  return input
    .map(normaliseAttachment)
    .filter((a): a is Attachment => a !== null);
}

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

    const result = await generateJson(duplicateDetectionPrompt(title, description ?? "", existingTasks));
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

      if (patch.status === "DONE" && existingTask.status !== "DONE") {
        const blockerError = assertCanComplete(existingTask as any);
        if (blockerError) {
          skipped.push({ id, reason: blockerError });
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
      } catch (err) {
        skipped.push({ id, reason: (err as Error).message ?? "Update failed" });
      }
    }

    res.json({ updated, skipped });
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
  const requestStartedAt = new Date();
  try {
    const taskId = req.params.id as string;
    const { title, description, status, progress, priority, dueDate, assigneeIds, tags, attachments, parentTaskId, blockingTaskIds, blockingTaskReasons } =
      req.body as {
        title?: string;
        description?: string;
        status?: TaskStatus;
        progress?: TaskProgress;
        priority?: Priority;
        dueDate?: string | null;
        assigneeIds?: string[];
        tags?: string[];
        attachments?: AttachmentInput[];
        parentTaskId?: string | null;
        blockingTaskIds?: string[];
        blockingTaskReasons?: Record<string, string | null>;
      };

    const normalisedAttachments = normaliseAttachments(attachments);

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

    if (status && status !== existingTask.status) {
      const lockError = assertNotCategoryBlocked(existingTask as any, status);
      if (lockError) {
        res.status(400).json({ error: lockError });
        return;
      }
    }

    if (status === "DONE" && existingTask.status !== "DONE") {
      const blockerError = assertCanComplete(existingTask as any);
      if (blockerError) {
        res.status(400).json({ error: blockerError });
        return;
      }

      // CI gating (Phase 3): if the project requires passing CI and the most
      // recent CI activity for the task is a failure, block the transition.
      const project = await prismaClient.project.findUnique({
        where: { id: existingTask.projectId },
        select: { githubBlockDoneOnCiFail: true },
      });
      if (project?.githubBlockDoneOnCiFail) {
        const openPr = await prismaClient.gitHubLink.findFirst({
          where: { taskId, kind: "PR", state: { in: ["open", "draft"] } },
        });
        if (openPr) {
          const lastCi = await prismaClient.activityLog.findFirst({
            where: {
              taskId,
              eventType: { in: ["GITHUB_CI_PASSED", "GITHUB_CI_FAILED"] },
            },
            orderBy: { createdAt: "desc" },
          });
          if (lastCi?.eventType === "GITHUB_CI_FAILED") {
            res.status(409).json({
              error: "Cannot mark as done: a linked PR has failing CI checks. Resolve them or disable CI gating in project settings.",
            });
            return;
          }
        }
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
      attachments: normalisedAttachments,
      parentTaskId,
      blockedByIds: blockingTaskIds,
      blockedByReasons: blockingTaskReasons,
    });

    // Audit log — fire-and-forget, never block the response
    (() => {
      const memberId = (req.session as any).memberId as string | undefined;
      const assigneesBefore = (existingTask.assignees ?? []).map((a: any) => a.id).sort().join(",");
      const assigneesAfter  = (task.assignees ?? []).map((a: any) => a.id).sort().join(",");
      const isNowDone        = existingTask.status !== "DONE" && task.status === "DONE";
      const assigneesChanged = assigneesBefore !== assigneesAfter;

      // Engagement: streak ticks on any forward status transition that isn't
      // the DONE transition (DONE is handled by handleTaskComplete below).
      // Forward order: TODO < IN_PROGRESS < DONE; BLOCKED is a side channel.
      const STATUS_RANK: Record<string, number> = { TODO: 0, BLOCKED: 0, IN_PROGRESS: 1, DONE: 2 };
      const beforeRank = STATUS_RANK[existingTask.status] ?? 0;
      const afterRank  = STATUS_RANK[task.status]         ?? 0;
      const isForwardAdvance = !isNowDone && afterRank > beforeRank && memberId;
      if (isForwardAdvance) {
        (async () => {
          const { recordActivity } = await import("../services/streakService.js");
          await recordActivity(memberId!, "TASK_ADVANCE");
        })().catch(err => console.error("[streak] task advance:", err));
      }

      if (isNowDone) {
        logAuditEvent({
          taskId: taskId, memberId: memberId ?? null, source: "WEB",
          eventType: "TASK_COMPLETED", payload: { taskTitle: task.title },
        }).catch(console.error);
        // Engagement grant happens below (awaited) so the response can carry the deltas.
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

    // Engagement grant — awaited so the response can surface reward deltas to
    // the frontend dispatcher (sidebar XP bar, +XP particles, rank-up modal).
    let actorReward: import("../services/rewardService.js").ActorRewardSummary | null = null;
    const isNowDone = existingTask.status !== "DONE" && task.status === "DONE";
    if (isNowDone) {
      try {
        const { handleTaskComplete } = await import("../services/rewardService.js");
        const full = await prismaClient.task.findUnique({
          where: { id: taskId },
          select: {
            id: true, title: true, dueDate: true, createdById: true,
            assignees: { select: { id: true } },
          },
        });
        const actorId = (req.session as any).memberId as string | undefined;
        if (full) actorReward = await handleTaskComplete(full, actorId ?? "");
      } catch (err) {
        console.error("[reward] handleTaskComplete:", err);
      }
    }

    // Challenge hooks — awaited so we can surface progress milestones in the
    // response (frontend toasts at 25/50/75% bands).
    let progressMilestones: import("../services/challengeService.js").ProgressMilestone[] = [];
    {
      const actorId = (req.session as any).memberId as string | undefined;
      if (actorId) {
        const prevStatus = existingTask.status;
        const nowDone    = prevStatus !== "DONE" && task.status === "DONE";
        const toInProgress = prevStatus !== "IN_PROGRESS" && task.status === "IN_PROGRESS";
        const prevAssignees = ((existingTask.assignees ?? []) as any[]).map((a: any) => a.id as string);
        const nextAssignees = ((task.assignees ?? []) as any[]).map((a: any) => a.id as string);
        const addedAssignees = nextAssignees.filter((id: string) => !prevAssignees.includes(id));
        const prevTagCount = ((existingTask.tags ?? []) as any[]).length;
        const nextTagCount = (((task as any).tags ?? []) as any[]).length;
        const tagsAdded = nextTagCount > prevTagCount;
        const prevAttCount = (existingTask.attachments as any[] | null)?.length ?? 0;
        const nextAttCount = (task.attachments as any[] | null)?.length ?? 0;
        const newAttachments = nextAttCount - prevAttCount;

        try {
          const { recordEvent } = await import("../services/challengeService.js");

          if (nowDone) {
            for (const assignee of ((task.assignees ?? []) as any[])) {
              progressMilestones = progressMilestones.concat(
                await recordEvent(assignee.id, "TASK_COMPLETED", 1, { taskId })
              );
              if (prevStatus === "IN_PROGRESS") {
                progressMilestones = progressMilestones.concat(
                  await recordEvent(assignee.id, "TASK_MOVED_INPROGRESS_TO_DONE", 1)
                );
              }
            }
          }

          if (toInProgress) {
            progressMilestones = progressMilestones.concat(
              await recordEvent(actorId, "TASK_MOVED_BACKLOG_TO_INPROGRESS", 1)
            );
          }

          if (addedAssignees.length > 0) {
            for (const aid of addedAssignees) {
              if (aid !== actorId) {
                progressMilestones = progressMilestones.concat(
                  await recordEvent(actorId, "TASK_ASSIGNED_TO_TEAMMATE", 1, { teammateId: aid })
                );
                progressMilestones = progressMilestones.concat(
                  await recordEvent(actorId, "UNIQUE_ASSIGNEES", 1, { teammateId: aid })
                );
              }
            }
          }

          if (tagsAdded) {
            progressMilestones = progressMilestones.concat(
              await recordEvent(actorId, "TASK_LABELED", 1, { taskId })
            );
          }

          if (newAttachments > 0) {
            for (let i = 0; i < newAttachments; i++) {
              progressMilestones = progressMilestones.concat(
                await recordEvent(actorId, "FILE_ATTACHED", 1, { taskId })
              );
            }
          }
        } catch (err) {
          console.error("[challenge] task update hooks:", err);
        }
      }
    }

    const responseBody: any = { ...task };
    if (actorReward) Object.assign(responseBody, actorReward);
    if (progressMilestones.length > 0) responseBody.progressMilestones = progressMilestones;

    // Surface any achievements auto-unlocked during recordEvent so the client
    // can fire RewardFlux + a celebration modal. Looks for unlocks since the
    // task update started — recordEvent → evaluateAchievements → claimAchievement
    // writes MemberAchievement rows with unlockedAt = now().
    try {
      const actorId = (req.session as any).memberId as string | undefined;
      if (actorId) {
        const recentUnlocks = await prismaClient.memberAchievement.findMany({
          where: { memberId: actorId, unlockedAt: { gte: requestStartedAt } },
          include: { challenge: { select: { name: true, description: true, iconClass: true, tier: true, xpReward: true, doubloonReward: true } } },
        });
        if (recentUnlocks.length > 0) {
          responseBody.achievementUnlocks = recentUnlocks.map(u => ({
            memberAchievementId: u.id,
            name: u.challenge.name,
            description: u.challenge.description,
            iconClass: u.challenge.iconClass,
            tier: u.challenge.tier,
            xpReward: u.challenge.xpReward,
            doubloonReward: u.challenge.doubloonReward,
          }));
        }
      }
    } catch (err) {
      console.error("[challenge] achievement unlock surface:", err);
    }

    res.json(responseBody);
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

    logAuditEvent({
      taskId, memberId: memberId ?? null, source: "WEB",
      eventType: "COMMENT_ADDED",
      payload: { commentId: comment.id, excerpt: content.slice(0, 120) },
    }).catch(console.error);

    res.status(201).json(populatedComment || comment);

    // Challenge hooks
    (async () => {
      const { recordEvent } = await import("../services/challengeService.js");
      const wordCount = content.trim().split(/\s+/).length;
      await recordEvent(memberId, "COMMENT_WRITTEN", 1, { taskId });
      if (wordCount >= 10) await recordEvent(memberId, "COMMENT_LONG", 1, { taskId });
      await recordEvent(memberId, "STATUS_COMMENT", 1, { taskId });
    })().catch(err => console.error("[challenge] comment hooks:", err));
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

    const memberId = (req.session as any).memberId as string | undefined;
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

    const memberId = (req.session as any).memberId as string | undefined;
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
    const memberId = (req.session as any).memberId as string;
    const { minutes, note } = req.body as { minutes: number; note?: string };
    if (!minutes || typeof minutes !== "number" || minutes <= 0) {
      res.status(400).json({ error: "minutes must be a positive number" });
      return;
    }
    const log = await logTime(taskId, memberId, minutes, note);

    logAuditEvent({
      taskId, memberId: memberId ?? null, source: "WEB",
      eventType: "TIME_LOGGED",
      payload: { minutes, note: note ?? null },
    }).catch(console.error);

    // Engagement: award XP / doubloons proportional to hours logged (fire-and-forget)
    (async () => {
      const { handleTimeLog } = await import("../services/rewardService.js");
      await handleTimeLog(taskId, memberId, minutes);
    })().catch(err => console.error("[reward] handleTimeLog:", err));

    // Challenge hooks
    (async () => {
      const { recordEvent } = await import("../services/challengeService.js");
      await recordEvent(memberId, "TIME_LOG_ENTRY", 1, { taskId });
      await recordEvent(memberId, "TIME_LOG_HOURS", minutes, { taskId });
      await recordEvent(memberId, "TIME_LOG_UNIQUE_TASKS", 1, { taskId });
      // TIME_LOG_WEEKDAY: tracked via DAILY_ACTIVE (streakService fires first action of day)
    })().catch(err => console.error("[challenge] timelog hooks:", err));

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
    if (error instanceof GeminiRateLimitError) { res.status(429).json({ error: "AI service busy — try again shortly" }); return; }
    console.error("Suggest deadline error:", error);
    res.status(500).json({ error: "Failed to suggest deadline" });
  }
});
