import { prisma } from "../db/prisma.js";
import type { Task, TaskStatus, TaskProgress, Priority, Prisma, Member, Project, RecurringInterval, Tag } from "@prisma/client";
import { logActivity } from "./activityService.js";

// ── Helpers ──────────────────────────────────────────────────

function safeParseDate(input: unknown, fieldName: string): Date | undefined {
  if (input == null || input === "") return undefined;
  const d = new Date(input as string);
  if (isNaN(d.getTime())) throw new Error(`Invalid ${fieldName}: ${String(input)}`);
  const year = d.getUTCFullYear();
  if (year < 1970 || year > 9999) throw new Error(`${fieldName} year out of range (1970–9999): got ${year}`);
  return d;
}

// ── Types ────────────────────────────────────────────────────

interface CreateTaskInput {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: Priority;
  dueDate?: Date | string;
  projectId: string;
  assigneeIds?: string[];
  slackMsgTs?: string;
  parentTaskId?: string;
  milestoneId?: string;
  createdById?: string;
  recurringInterval?: RecurringInterval;
  tagIds?:            string[];
  estimatedHours?:    number;
  storyPoints?:       number;
  isRecurring?:       boolean;
  recurrencePattern?: string;
  recurrenceEndDate?: Date | string;
  recurringParentId?: string;
}

interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: TaskStatus;
  progress?: TaskProgress;
  priority?: Priority;
  dueDate?: Date | null;
  assigneeIds?: string[];
  tags?: string[];
  attachments?: (string | { url: string; label?: string })[];
  parentTaskId?: string | null;
  milestoneId?: string | null;
  blockedByIds?: string[];
  /** Optional per-blocker reason, keyed by blocking task id (used with blockedByIds). */
  blockedByReasons?: Record<string, string | null>;
  blockingIds?: string[];
  recurringInterval?: RecurringInterval | null;
  estimatedHours?:    number | null;
  storyPoints?:       number | null;
  isRecurring?:       boolean;
  recurrencePattern?: string | null;
  recurrenceEndDate?: Date | null;
  recurringParentId?: string | null;
}

interface TaskFilters {
  status?: TaskStatus;
  assigneeId?: string;
  priority?: Priority;
}

// ── Service ──────────────────────────────────────────────────

export async function createTask(
  data: CreateTaskInput
): Promise<Task & { assignees: Member[]; project: Project }> {
  // Idempotency check: if slackMsgTs is provided, check for duplicates
  if (data.slackMsgTs) {
    const existing = await prisma.task.findFirst({
      where: { slackMsgTs: data.slackMsgTs },
      include: { assignees: true, project: true },
    });
    if (existing) {
      return existing;
    }
  }

  const task = await prisma.task.create({
    data: {
      title: data.title,
      description: data.description,
      status: data.status,
      priority: data.priority,
      dueDate: safeParseDate(data.dueDate, "dueDate"),
      projectId: data.projectId,
      slackMsgTs: data.slackMsgTs,
      parentTaskId: data.parentTaskId,
      milestoneId: data.milestoneId,
      createdById: data.createdById,
      recurringInterval: data.recurringInterval,
      estimatedHours: data.estimatedHours,
      storyPoints: data.storyPoints,
      isRecurring: data.isRecurring,
      recurrencePattern: data.recurrencePattern,
      recurrenceEndDate: safeParseDate(data.recurrenceEndDate, "recurrenceEndDate"),
      recurringParentId: data.recurringParentId,
      ...(data.assigneeIds && data.assigneeIds.length > 0
        ? { assignees: { connect: data.assigneeIds.map(id => ({ id })) } }
        : {}),
      ...(data.tagIds?.length
        ? { tags: { connect: data.tagIds.map(id => ({ id })) } }
        : {}),
    },
    include: { assignees: true, project: true, subtasks: true },
  });
  await logActivity({
    type: "TASK_CREATED",
    entityId: task.id,
    entityType: "Task",
    projectId: task.projectId,
  });

  // Challenge hook: TASK_CREATED_WITH_DETAILS (title + description + dueDate required)
  if (data.createdById && data.title && data.description && data.dueDate) {
    import("./challengeService.js").then(({ recordEvent }) =>
      recordEvent(data.createdById!, "TASK_CREATED_WITH_DETAILS", 1, { taskId: task.id })
    ).catch(err => console.error("[challenge] TASK_CREATED_WITH_DETAILS:", err));
  }

  return task;
}

export async function updateTask(
  id: string,
  data: UpdateTaskInput
): Promise<Task & { assignees: Member[]; project: Project }> {
  // ── Airtight completion gate ──
  // Enforce the open-blocker check at the data-mutation layer so EVERY
  // completion path (web single/bulk PATCH, Slack completion, future callers)
  // is gated, not just the HTTP routes. Only fires on the →DONE transition.
  if (data.status === "DONE") {
    const current = await prisma.task.findUnique({
      where: { id },
      select: {
        status: true,
        blockedBy: { include: { blockingTask: { select: { title: true, status: true } } } },
        blockers: { include: { blocker: { select: { label: true, resolvedAt: true } } } },
      },
    });
    if (current && current.status !== "DONE") {
      const blockerError = assertCanComplete(current);
      if (blockerError) throw new Error(blockerError);
    }
  }

  const updateData: Prisma.TaskUpdateInput = {};

  // Copy simple scalar fields
  if (data.title !== undefined) updateData.title = data.title;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.progress !== undefined) updateData.progress = data.progress;
  if (data.priority !== undefined) updateData.priority = data.priority;
  if (data.dueDate !== undefined) updateData.dueDate = safeParseDate(data.dueDate, "dueDate") ?? null;
  if (data.tags !== undefined) updateData.tags = { set: data.tags.map(id => ({ id })) };
  if (data.estimatedHours !== undefined) updateData.estimatedHours = data.estimatedHours;
  if (data.storyPoints !== undefined) updateData.storyPoints = data.storyPoints;
  if (data.isRecurring !== undefined) updateData.isRecurring = data.isRecurring;
  if (data.recurrencePattern !== undefined) updateData.recurrencePattern = data.recurrencePattern;
  if (data.recurrenceEndDate !== undefined) updateData.recurrenceEndDate = safeParseDate(data.recurrenceEndDate, "recurrenceEndDate") ?? null;
  if (data.recurringParentId !== undefined) updateData.recurringParentId = data.recurringParentId;
  if (data.attachments !== undefined) {
    // attachments is now Json — store the structured shape directly. Tolerate
    // legacy strings from older callers by upgrading them on the way in.
    updateData.attachments = data.attachments.map(a =>
      typeof a === "string" ? { url: a, label: a } : a
    ) as unknown as Prisma.InputJsonValue;
  }
  if (data.recurringInterval !== undefined) updateData.recurringInterval = data.recurringInterval;

  // M:N relations
  if (data.assigneeIds !== undefined) {
    updateData.assignees = { set: data.assigneeIds.map(aid => ({ id: aid })) };
  }

  // FK relations
  if (data.parentTaskId !== undefined) {
    updateData.parentTask = data.parentTaskId
      ? { connect: { id: data.parentTaskId } }
      : { disconnect: true };
  }
  if (data.milestoneId !== undefined) {
    updateData.milestone = data.milestoneId
      ? { connect: { id: data.milestoneId } }
      : { disconnect: true };
  }

  let updated = await prisma.task.update({
    where: { id },
    data: updateData,
    include: { assignees: true, project: true, subtasks: true, tags: true },
  });

  // Dep set operations (explicit join table — cannot use Prisma connect/disconnect)
  if (data.blockedByIds !== undefined) {
    await prisma.taskDependency.deleteMany({ where: { blockedTaskId: id } });
    if (data.blockedByIds.length > 0) {
      await prisma.taskDependency.createMany({
        data: data.blockedByIds.map(bid => ({
          blockingTaskId: bid,
          blockedTaskId: id,
          reason: data.blockedByReasons?.[bid] ?? null,
        })),
        skipDuplicates: true,
      });
    }
  }
  if (data.blockingIds !== undefined) {
    await prisma.taskDependency.deleteMany({ where: { blockingTaskId: id } });
    if (data.blockingIds.length > 0) {
      await prisma.taskDependency.createMany({
        data: data.blockingIds.map(bid => ({ blockingTaskId: id, blockedTaskId: bid })),
        skipDuplicates: true,
      });
    }
  }

  if (data.status !== undefined) {
    await logActivity({
      type: "STATUS_CHANGED",
      entityId: updated.id,
      entityType: "Task",
      projectId: updated.projectId,
      metadata: { status: updated.status },
    });
  }

  // ── Recurring task spawn on DONE ──
  if (data.status === "DONE" && updated.recurringInterval) {
    await spawnRecurringTask(updated);
  }
  if (data.status === "DONE" && updated.isRecurring && updated.recurrencePattern) {
    await spawnNextOccurrence(updated as Task & { assignees: Member[]; tags: Tag[] });
  }

  // Challenge hook: Mission Briefing (TASK_CREATED_WITH_DETAILS) — also fire
  // when an edit brings a task up to title + description + dueDate, so users
  // get credit for tasks they detail incrementally. DISTINCT_METRICS dedupes
  // by taskId, so re-edits don't double-count.
  if (updated.createdById && updated.title && updated.description && updated.dueDate) {
    import("./challengeService.js").then(({ recordEvent }) =>
      recordEvent(updated.createdById!, "TASK_CREATED_WITH_DETAILS", 1, { taskId: updated.id })
    ).catch(err => console.error("[challenge] TASK_CREATED_WITH_DETAILS (update):", err));
  }

  return updated;
}

export async function deleteTask(id: string): Promise<Task> {
  return prisma.task.delete({ where: { id } });
}

export async function getTask(id: string) {
  return prisma.task.findUnique({
    where: { id },
    include: {
      assignees: true,
      project: true,
      createdBy: { select: { id: true, displayName: true, avatarUrl: true } },
      comments: { include: { author: true }, orderBy: { createdAt: "asc" } },
      subtasks: {
        include: {
          assignees: true,
          createdBy: { select: { id: true, displayName: true, avatarUrl: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      blockedBy: { include: { blockingTask: { select: { id: true, title: true, status: true } } } },
      blocks:    { include: { blockedTask:  { select: { id: true, title: true, status: true } } } },
      blockers:  { include: { blocker: true } },
      timeLogs:  { include: { member: { select: { id: true, displayName: true } } } },
      tags:      true,
      milestone: true,
      parentTask: { select: { id: true, title: true } },
    },
  });
}

export async function getTasksForProject(
  projectId: string,
  filters?: TaskFilters
) {
  const where: any = { projectId };
  if (filters?.status) where.status = filters.status;
  if (filters?.assigneeId) where.assignees = { some: { id: filters.assigneeId } };
  if (filters?.priority) where.priority = filters.priority;

  return prisma.task.findMany({
    where,
    include: {
      assignees: true,
      tags: true,
      // Lightweight GitHub link summary (Phase 2). Kanban cards use this to
      // render a small PR-state pill without an extra round-trip per card.
      githubLinks: {
        select: { id: true, kind: true, state: true, refNumber: true, url: true },
      },
      // Board/list payload must carry blockers so the kanban completion guard
      // has data (the backend gate is authoritative, but this drives the UX).
      // `reason` is a scalar on TaskDependency and is returned automatically.
      blockedBy: { include: { blockingTask: { select: { id: true, title: true, status: true } } } },
    },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
  });
}

export async function getTasksForMember(memberId: string) {
  return prisma.task.findMany({
    where: { assignees: { some: { id: memberId } } },
    include: { project: true, assignees: true, tags: true },
    orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
  });
}

export async function getOverdueTasks() {
  const now = new Date();
  return prisma.task.findMany({
    where: {
      dueDate: { lt: now },
      status: { notIn: ["DONE"] },
    },
    include: { assignees: true, project: true },
  });
}

export async function getTasksDueToday() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  return prisma.task.findMany({
    where: {
      dueDate: { gte: startOfDay, lte: endOfDay },
      status: { notIn: ["DONE"] },
    },
    include: { assignees: true, project: true },
  });
}

export async function getTasksDueThisWeek(memberId?: string) {
  const now = new Date();
  const endOfWeek = new Date();
  endOfWeek.setDate(now.getDate() + (7 - now.getDay()));
  endOfWeek.setHours(23, 59, 59, 999);

  const where: any = {
    dueDate: { gte: now, lte: endOfWeek },
    status: { notIn: ["DONE"] },
  };
  if (memberId) where.assignees = { some: { id: memberId } };

  return prisma.task.findMany({
    where,
    include: { assignees: true, project: true },
    orderBy: { dueDate: "asc" },
  });
}

// ── Subtask Helpers ─────────────────────────────────────────

export async function getSubtasks(taskId: string) {
  return prisma.task.findMany({
    where: { parentTaskId: taskId },
    include: { assignees: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function createSubtask(
  parentTaskId: string,
  data: { title: string; assigneeIds?: string[] }
) {
  const parent = await prisma.task.findUnique({ where: { id: parentTaskId } });
  if (!parent) throw new Error("Parent task not found");

  const subtask = await prisma.task.create({
    data: {
      title: data.title,
      projectId: parent.projectId,
      parentTaskId,
      ...(data.assigneeIds && data.assigneeIds.length > 0
        ? { assignees: { connect: data.assigneeIds.map(id => ({ id })) } }
        : {}),
    },
    include: { assignees: true, project: true },
  });
  await logActivity({
    type: "SUBTASK_ADDED",
    entityId: subtask.id,
    entityType: "Task",
    projectId: subtask.projectId,
    metadata: { parentTaskId },
  });
  return subtask;
}

// ── Dependency Helpers ──────────────────────────────────────

export async function addDependency(taskId: string, blockedById: string, reason?: string | null) {
  if (taskId === blockedById) throw new Error("A task cannot depend on itself");

  const hasCycle = await checkDependencyCycle(blockedById, taskId);
  if (hasCycle) throw new Error("Adding this dependency would create a circular chain");

  await prisma.taskDependency.upsert({
    where: { blockingTaskId_blockedTaskId: { blockingTaskId: blockedById, blockedTaskId: taskId } },
    create: { blockingTaskId: blockedById, blockedTaskId: taskId, reason: reason ?? null },
    update: reason !== undefined ? { reason: reason ?? null } : {},
  });

  return prisma.task.findUnique({
    where: { id: taskId },
    include: {
      blockedBy: { include: { blockingTask: true } },
      blocks:    { include: { blockedTask: true } },
    },
  });
}

export async function removeDependency(taskId: string, blockedById: string) {
  await prisma.taskDependency.delete({
    where: { blockingTaskId_blockedTaskId: { blockingTaskId: blockedById, blockedTaskId: taskId } },
  });

  return prisma.task.findUnique({
    where: { id: taskId },
    include: {
      blockedBy: { include: { blockingTask: true } },
      blocks:    { include: { blockedTask: true } },
    },
  });
}

async function checkDependencyCycle(fromId: string, targetId: string): Promise<boolean> {
  // BFS: walk the blockedBy chain upward; if we reach targetId it's a cycle.
  const visited = new Set<string>();
  const queue = [fromId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (currentId === targetId) return true;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const deps = await prisma.taskDependency.findMany({
      where: { blockedTaskId: currentId },
      select: { blockingTaskId: true },
    });
    for (const dep of deps) {
      queue.push(dep.blockingTaskId);
    }
  }
  return false;
}

// ── Recurring Task Spawn ────────────────────────────────────

async function spawnRecurringTask(completedTask: Task & { assignees: Member[] }) {
  // Only spawn if no un-done child of the same source already exists
  const sourceId = completedTask.sourceTaskId ?? completedTask.id;

  const existingOpen = await prisma.task.findFirst({
    where: {
      sourceTaskId: sourceId,
      status: { not: "DONE" },
    },
  });
  if (existingOpen) return; // prevent duplicates

  const nextDueDate = computeNextDueDate(
    completedTask.dueDate ?? new Date(),
    completedTask.recurringInterval!
  );

  await prisma.task.create({
    data: {
      title: completedTask.title,
      description: completedTask.description,
      priority: completedTask.priority,
      projectId: completedTask.projectId,
      recurringInterval: completedTask.recurringInterval,
      sourceTaskId: sourceId,
      dueDate: nextDueDate,
      milestoneId: completedTask.milestoneId,
      assignees: {
        connect: completedTask.assignees.map(a => ({ id: a.id })),
      },
    },
  });

  // Mark the completed task's lastSpawnedAt
  await prisma.task.update({
    where: { id: completedTask.id },
    data: { lastSpawnedAt: new Date() },
  });
}

function computeNextDueDate(currentDue: Date, interval: string): Date {
  const next = new Date(currentDue);
  switch (interval) {
    case "DAILY":
      next.setDate(next.getDate() + 1);
      break;
    case "WEEKLY":
      next.setDate(next.getDate() + 7);
      break;
    case "BIWEEKLY":
      next.setDate(next.getDate() + 14);
      break;
    case "MONTHLY":
      next.setMonth(next.getMonth() + 1);
      break;
  }
  return next;
}

// ── Time Logging ────────────────────────────────────────────

export async function logTime(taskId: string, memberId: string, minutes: number, note?: string) {
  return prisma.timeLog.create({ data: { taskId, memberId, minutes, note } });
}

// ── spawnNextOccurrence (recurrencePattern-based) ───────────

export async function spawnNextOccurrence(task: Task & { assignees: Member[]; tags: Tag[] }) {
  if (!task.isRecurring || !task.recurrencePattern || !task.dueDate) return;
  const next = new Date(task.dueDate);
  const patterns: Record<string, () => void> = {
    DAILY:    () => next.setDate(next.getDate() + 1),
    WEEKLY:   () => next.setDate(next.getDate() + 7),
    BIWEEKLY: () => next.setDate(next.getDate() + 14),
    MONTHLY:  () => next.setMonth(next.getMonth() + 1),
  };
  patterns[task.recurrencePattern]?.();
  if (task.recurrenceEndDate && next > task.recurrenceEndDate) return;
  await prisma.task.create({
    data: {
      title: task.title, description: task.description, priority: task.priority,
      projectId: task.projectId, dueDate: next, status: "TODO",
      isRecurring: true, recurrencePattern: task.recurrencePattern,
      recurrenceEndDate: task.recurrenceEndDate,
      recurringParentId: task.recurringParentId ?? task.id,
      estimatedHours: task.estimatedHours, storyPoints: task.storyPoints,
      assignees: { connect: task.assignees.map(a => ({ id: a.id })) },
      tags:      { connect: task.tags.map(t => ({ id: t.id })) },
    },
  });
}

// ── Slack-Oriented Helpers ──────────────────────────────────

export async function completeTaskFromSlack(taskId: string): Promise<Task & { assignees: Member[]; project: Project }> {
  return updateTask(taskId, { status: "DONE" });
}

export async function claimTaskFromSlack(
  taskId: string,
  memberId: string
): Promise<Task & { assignees: Member[]; project: Project }> {
  const task = await getTask(taskId);
  const existingIds = task?.assignees.map(a => a.id) ?? [];
  if (!existingIds.includes(memberId)) existingIds.push(memberId);
  return updateTask(taskId, { assigneeIds: existingIds });
}

export async function createTaskFromSlackMessage(data: {
  title: string;
  projectId: string;
  assigneeIds?: string[];
  slackMsgTs?: string;
}): Promise<Task & { assignees: Member[]; project: Project }> {
  return createTask(data);
}

export async function reassignTaskFromSlack(
  taskId: string,
  memberId: string
): Promise<Task & { assignees: Member[]; project: Project }> {
  return updateTask(taskId, { assigneeIds: [memberId] });
}

// ── Completion Guard ─────────────────────────────────────────

/**
 * Returns an error message string if the task has open blockers that prevent
 * it from being marked DONE, or null if completion is allowed.
 * Expects the task to have `blockedBy` included with `blockingTask`.
 */
export function assertCanComplete(
  task: {
    status: string;
    blockedBy?: { blockingTask: { title: string; status: string } }[];
    blockers?: { blocker: { label: string; resolvedAt: Date | null } }[];
  }
): string | null {
  const openDeps = (task.blockedBy ?? []).filter(
    (d) => d.blockingTask.status !== "DONE"
  );
  const openCategories = (task.blockers ?? []).filter(
    (b) => b.blocker.resolvedAt === null
  );
  if (openDeps.length === 0 && openCategories.length === 0) return null;

  const names = [
    ...openDeps.map((d) => `"${d.blockingTask.title}"`),
    ...openCategories.map((b) => `"${b.blocker.label}"`),
  ].join(", ");
  const count = openDeps.length + openCategories.length;
  return `Cannot mark as done: ${count} blocker${count > 1 ? "s" : ""} not yet completed — ${names}`;
}

// Returns an error string if `newStatus` would move a task that still has an
// open category blocker out of BLOCKED. A category-blocked task is locked: the
// only way out is to resolve or detach the blocker (which recomputes status).
// Task *dependencies* are intentionally NOT checked here — they only gate DONE
// (see assertCanComplete). BLOCKED → BLOCKED is always allowed.
export function assertNotCategoryBlocked(
  task: { blockers?: { blocker: { label: string; resolvedAt: Date | null } }[] },
  newStatus: string
): string | null {
  if (newStatus === "BLOCKED") return null;
  const open = (task.blockers ?? []).filter((b) => b.blocker.resolvedAt === null);
  if (open.length === 0) return null;
  const names = open.map((b) => `"${b.blocker.label}"`).join(", ");
  return `This task is blocked by ${open.length} blocker${open.length > 1 ? "s" : ""} — resolve or remove ${names} before changing its status.`;
}

export type { CreateTaskInput, UpdateTaskInput, TaskFilters };
