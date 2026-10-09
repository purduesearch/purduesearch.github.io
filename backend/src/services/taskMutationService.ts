import type { TaskStatus, TaskProgress, Priority, NotificationType } from "@prisma/client";
import { prisma as prismaClient } from "../db/prisma.js";
import { getTaskPermissions } from "../middleware/taskAccess.js";
import { getTask, createTask, updateTask, assertCanComplete, assertNotCategoryBlocked } from "./taskService.js";
import { assertCiGatePasses, applyCompletionSideEffects } from "./taskCompletionService.js";
import { logAuditEvent, diffObjects } from "./activityService.js";
import { createNotification } from "./notificationCrud.js";
import { recordTimeLog } from "./timeLogService.js";
import { parseMentionHandles } from "./mentionService.js";
import type { ActorRewardSummary } from "./rewardService.js";
import type { ProgressMilestone } from "./challengeService.js";

export type MutationSource = "WEB" | "SLACK" | "AI";

export class TaskMutationError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface TaskPatch {
  title?: string;
  description?: string;
  status?: TaskStatus;
  progress?: TaskProgress;
  priority?: Priority;
  dueDate?: string | null;
  assigneeIds?: string[];
  tags?: string[];
  attachments?: { url: string; label?: string }[];
  parentTaskId?: string | null;
  blockingTaskIds?: string[];
  blockingTaskReasons?: Record<string, string | null>;
}

export interface AchievementUnlock {
  memberAchievementId: string;
  name: string;
  description: string | null;
  iconClass: string | null;
  tier: string | null;
  xpReward: number;
  doubloonReward: number;
}

export interface MutationResult {
  task: any;
  actorReward: ActorRewardSummary | null;
  progressMilestones: ProgressMilestone[];
  achievementUnlocks: AchievementUnlock[];
}

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

export function normaliseAttachments(input: unknown): Attachment[] | undefined {
  if (input === undefined) return undefined;
  if (!Array.isArray(input)) return [];
  return input
    .map(normaliseAttachment)
    .filter((a): a is Attachment => a !== null);
}

export async function updateTaskAsMember(
  actorId: string,
  taskId: string,
  patch: TaskPatch,
  source: MutationSource,
): Promise<MutationResult> {
  const requestStartedAt = new Date();
  // The existing audit schema distinguishes web and Slack writes only.
  const auditSource = source === "AI" ? "WEB" : source;
  try {
    const { title, description, status, progress, priority, dueDate, assigneeIds, tags, attachments, parentTaskId, blockingTaskIds, blockingTaskReasons } = patch;
    const normalisedAttachments = normaliseAttachments(attachments);

    const existingTask = await getTask(taskId);
    if (!existingTask) {
      throw new TaskMutationError(404, "Task not found");
    }

    const { canEdit } = await getTaskPermissions(actorId, taskId);
    if (!canEdit) {
      throw new TaskMutationError(403, "Only assignees, the creator, a project lead, or an admin can edit this task");
    }

    if (status && status !== existingTask.status) {
      const lockError = assertNotCategoryBlocked(existingTask as any, status);
      if (lockError) {
        throw new TaskMutationError(400, lockError);
      }
    }

    if (status === "DONE" && existingTask.status !== "DONE") {
      const blockerError = assertCanComplete(existingTask as any);
      if (blockerError) {
        throw new TaskMutationError(400, blockerError);
      }

      // CI gating (Phase 3): if the project requires passing CI and the most
      // recent CI activity for the task is a failure, block the transition.
      const ciError = await assertCiGatePasses(taskId, existingTask.projectId);
      if (ciError) {
        throw new TaskMutationError(409, ciError);
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

    const isNowDone = existingTask.status !== "DONE" && task.status === "DONE";

    // Audit log — fire-and-forget, never block the response
    (() => {
      const memberId = actorId;
      const assigneesBefore = (existingTask.assignees ?? []).map((a: any) => a.id).sort().join(",");
      const assigneesAfter  = (task.assignees ?? []).map((a: any) => a.id).sort().join(",");
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
          // Dragging a fixture card across the training board is the very first
          // thing a walkthrough asks for. It must not keep a streak alive.
          const { isTrainingTask } = await import("./trainingSandboxService.js");
          if (await isTrainingTask(taskId)) return;
          const { recordActivity } = await import("./streakService.js");
          await recordActivity(memberId!, "TASK_ADVANCE");
        })().catch(err => console.error("[streak] task advance:", err));
      }

      if (isNowDone) {
        // TASK_COMPLETED audit event + engagement grant are handled by
        // applyCompletionSideEffects (called below, awaited so the response
        // can carry the reward deltas).
      } else if (assigneesChanged && task.status === existingTask.status) {
        logAuditEvent({
          taskId: taskId, memberId: memberId ?? null, source: auditSource,
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
            taskId: taskId, memberId: memberId ?? null, source: auditSource,
            eventType: "TASK_UPDATED",
            payload: { taskTitle: task.title, changes },
          }).catch(console.error);
        }
      }
    })();

    // Assignment notifications retain the PATCH path's fire-and-forget behavior.
    const previousAssigneeIds = (existingTask.assignees ?? []).map(a => a.id);
    const addedAssigneeIds = (task.assignees ?? []).map(a => a.id)
      .filter(id => !previousAssigneeIds.includes(id));
    notifyAddedAssignees({ taskId, actorId, addedAssigneeIds }).catch(console.error);

    // If task is linked to a milestone, refresh its health (fire-and-forget).
    // The DONE-transition refresh is handled by applyCompletionSideEffects
    // below, so this only needs to fire for non-completion updates.
    if (!isNowDone && (task as any).milestoneId) {
      const { refreshMilestoneHealth } = await import("./milestoneService.js");
      refreshMilestoneHealth((task as any).milestoneId).catch(console.error);
    }

    // Engagement grant + per-assignee challenge hooks for the DONE
    // transition are shared with PATCH /bulk via applyCompletionSideEffects —
    // awaited so the response can surface reward deltas to the frontend
    // dispatcher (sidebar XP bar, +XP particles, rank-up modal, progress toasts).
    let actorReward: import("./rewardService.js").ActorRewardSummary | null = null;
    let progressMilestones: import("./challengeService.js").ProgressMilestone[] = [];
    if (isNowDone) {
      const result = await applyCompletionSideEffects({
        taskId,
        actorId: actorId,
        existingTask,
        updatedTask: task,
      });
      actorReward = result.actorReward;
      progressMilestones = result.progressMilestones;
    }

    // Remaining challenge hooks — awaited so we can surface progress
    // milestones in the response (frontend toasts at 25/50/75% bands).
    {
      if (actorId) {
        const prevStatus = existingTask.status;
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
          const { recordEvent } = await import("./challengeService.js");

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

    let achievementUnlocks: AchievementUnlock[] = [];

    // Surface any achievements auto-unlocked during recordEvent so the client
    // can fire RewardFlux + a celebration modal. Looks for unlocks since the
    // task update started — recordEvent → evaluateAchievements → claimAchievement
    // writes MemberAchievement rows with unlockedAt = now().
    try {
      if (actorId) {
        const recentUnlocks = await prismaClient.memberAchievement.findMany({
          where: { memberId: actorId, unlockedAt: { gte: requestStartedAt } },
          include: { challenge: { select: { name: true, description: true, iconClass: true, tier: true, xpReward: true, doubloonReward: true } } },
        });
        if (recentUnlocks.length > 0) {
          achievementUnlocks = recentUnlocks.map(u => ({
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

    return { task, actorReward, progressMilestones, achievementUnlocks };
  } catch (error: any) {
    if (error instanceof TaskMutationError) throw error;
    if (error?.message?.includes("circular")) {
      throw new TaskMutationError(400, error.message);
    }
    throw error;
  }
}

export interface CreateTaskInput {
  projectId: string;
  title: string;
  description?: string;
  priority?: Priority;
  status?: TaskStatus;
  dueDate?: Date;
  assigneeIds?: string[];
  parentTaskId?: string;
  milestoneId?: string;
  tagIds?: string[];
  estimatedHours?: number;
  storyPoints?: number;
  isRecurring?: boolean;
  recurrencePattern?: string;
  recurrenceEndDate?: Date;
  attachments?: { url: string; label?: string }[];
}

export async function notifyAddedAssignees(opts: {
  taskId: string;
  actorId: string | null;
  addedAssigneeIds: string[];
}): Promise<void> {
  const recipients = [...new Set(opts.addedAssigneeIds)].filter(id => id !== opts.actorId);
  if (recipients.length === 0) return;
  const task = await getTask(opts.taskId);
  if (!task) return;
  const [actor, project] = await Promise.all([
    opts.actorId ? prismaClient.member.findUnique({ where: { id: opts.actorId }, select: { displayName: true } }) : null,
    prismaClient.project.findUnique({ where: { id: task.projectId }, select: { name: true } }),
  ]);
  for (const recipientId of recipients) {
    await createNotification({
      type: "TASK_ASSIGNED", recipientId, actorId: opts.actorId ?? undefined, projectId: task.projectId, taskId: opts.taskId,
      slackCard: { entityType: "TASK", entityId: opts.taskId, reason: "ASSIGNED" },
      message: `${actor?.displayName ?? "Someone"} assigned you to "${task.title}" in ${project?.name ?? "a project"}`,
      slackText: `📋 *${actor?.displayName ?? "Someone"}* assigned you to *${task.title}* in ${project?.name ?? "a project"}`,
    });
  }
}

export async function createTaskAsMember(
  actorId: string | null,
  input: CreateTaskInput,
  source: MutationSource,
): Promise<any> {
  const { attachments, ...taskInput } = input;
  let task = await createTask({ ...taskInput, createdById: actorId ?? undefined });
  const normalisedAttachments = normaliseAttachments(attachments);
  if (normalisedAttachments !== undefined) {
    task = await updateTask(task.id, { attachments: normalisedAttachments });
  }
  if (task.milestoneId) {
    const { refreshMilestoneHealth } = await import("./milestoneService.js");
    refreshMilestoneHealth(task.milestoneId).catch(console.error);
  }
  logAuditEvent({
    projectId: input.projectId, taskId: task.id, memberId: actorId, source: source === "AI" ? "WEB" : source,
    eventType: "TASK_CREATED",
    payload: { taskTitle: task.title, priority: task.priority, assigneeNames: task.assignees.map(a => a.displayName),
      ...(source === "AI" ? { viaAiPlan: true } : {}), },
  }).catch(console.error);
  await notifyAddedAssignees({ taskId: task.id, actorId, addedAssigneeIds: task.assignees.map(a => a.id) }).catch(console.error);
  return task;
}

export async function logTimeAsMember(
  actorId: string,
  taskId: string,
  minutes: number,
  note: string | undefined,
  source: Exclude<MutationSource, "AI">,
): Promise<any> {
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0) throw new TaskMutationError(400, "minutes must be a positive number");
  const { canEdit } = await getTaskPermissions(actorId, taskId);
  if (!canEdit) throw new TaskMutationError(403, "Only assignees, the creator, a project lead, or an admin can edit this task");
  return recordTimeLog({ taskId, memberId: actorId, minutes, note, source });
}

export async function addCommentAsMember(
  actorId: string,
  taskId: string,
  content: string,
  opts: { parentId?: string | null; source: MutationSource },
): Promise<any> {
  if (!content) throw new TaskMutationError(400, "Content is required");
  const memberId = actorId;
  const { parentId } = opts;
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
        slackText: `↩️ *${populatedComment.author.displayName}* replied to your comment on *${populatedComment.task.title}*`,
      }).catch(console.error);
    }
  }

  // Handle @mentions
  const mentions = parseMentionHandles(content);

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
        slackText: `💬 *${author?.displayName ?? "Someone"}* commented on *${taskForNotif.title}* (${(taskForNotif as any).project.name}):\n> ${content.slice(0, 200)}`,
      }).catch(console.error);
    }
  }

  logAuditEvent({
    taskId, memberId: memberId ?? null, source: opts.source === "AI" ? "WEB" : opts.source,
    eventType: "COMMENT_ADDED",
    payload: { commentId: comment.id, excerpt: content.slice(0, 120) },
  }).catch(console.error);

  // Challenge hooks
  (async () => {
    const { recordEvent } = await import("./challengeService.js");
    const wordCount = content.trim().split(/\s+/).length;
    await recordEvent(memberId, "COMMENT_WRITTEN", 1, { taskId });
    if (wordCount >= 10) await recordEvent(memberId, "COMMENT_LONG", 1, { taskId });
    await recordEvent(memberId, "STATUS_COMMENT", 1, { taskId });
  })().catch(err => console.error("[challenge] comment hooks:", err));
  return populatedComment || comment;
}
