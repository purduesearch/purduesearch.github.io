import { prisma } from "../db/prisma.js";
import type { Task, TaskStatus, Priority, Prisma, Member, Project, RecurringInterval } from "@prisma/client";

// ── Types ────────────────────────────────────────────────────

interface CreateTaskInput {
  title: string;
  description?: string;
  priority?: Priority;
  dueDate?: Date;
  projectId: string;
  assigneeIds?: string[];
  slackMsgTs?: string;
  parentTaskId?: string;
  milestoneId?: string;
  recurringInterval?: RecurringInterval;
}

interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: Priority;
  dueDate?: Date | null;
  assigneeIds?: string[];
  tags?: string[];
  attachments?: string[];
  parentTaskId?: string | null;
  milestoneId?: string | null;
  blockedByIds?: string[];
  blockingIds?: string[];
  recurringInterval?: RecurringInterval | null;
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

  return prisma.task.create({
    data: {
      title: data.title,
      description: data.description,
      priority: data.priority,
      dueDate: data.dueDate,
      projectId: data.projectId,
      slackMsgTs: data.slackMsgTs,
      parentTaskId: data.parentTaskId,
      milestoneId: data.milestoneId,
      recurringInterval: data.recurringInterval,
      ...(data.assigneeIds && data.assigneeIds.length > 0
        ? { assignees: { connect: data.assigneeIds.map(id => ({ id })) } }
        : {}),
    },
    include: { assignees: true, project: true, subtasks: true, blockedBy: true, blocking: true },
  });
}

export async function updateTask(
  id: string,
  data: UpdateTaskInput
): Promise<Task & { assignees: Member[]; project: Project }> {
  const updateData: Prisma.TaskUpdateInput = {};

  // Copy simple scalar fields
  if (data.title !== undefined) updateData.title = data.title;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.priority !== undefined) updateData.priority = data.priority;
  if (data.dueDate !== undefined) updateData.dueDate = data.dueDate;
  if (data.tags !== undefined) updateData.tags = data.tags;
  if (data.attachments !== undefined) updateData.attachments = data.attachments;
  if (data.recurringInterval !== undefined) updateData.recurringInterval = data.recurringInterval;

  // M:N relations
  if (data.assigneeIds !== undefined) {
    updateData.assignees = { set: data.assigneeIds.map(aid => ({ id: aid })) };
  }
  if (data.blockedByIds !== undefined) {
    updateData.blockedBy = { set: data.blockedByIds.map(bid => ({ id: bid })) };
  }
  if (data.blockingIds !== undefined) {
    updateData.blocking = { set: data.blockingIds.map(bid => ({ id: bid })) };
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

  const updated = await prisma.task.update({
    where: { id },
    data: updateData,
    include: { assignees: true, project: true, subtasks: true, blockedBy: true, blocking: true },
  });

  // ── Recurring task spawn on DONE ──
  if (data.status === "DONE" && updated.recurringInterval) {
    await spawnRecurringTask(updated);
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
      comments: { include: { author: true }, orderBy: { createdAt: "asc" } },
      subtasks: { include: { assignees: true }, orderBy: { createdAt: "asc" } },
      blockedBy: { select: { id: true, title: true, status: true } },
      blocking: { select: { id: true, title: true, status: true } },
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
    include: { assignees: true },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
  });
}

export async function getTasksForMember(memberId: string) {
  return prisma.task.findMany({
    where: { assignees: { some: { id: memberId } } },
    include: { project: true, assignees: true },
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

  return prisma.task.create({
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
}

// ── Dependency Helpers ──────────────────────────────────────

export async function addDependency(taskId: string, blockedById: string) {
  // Prevent self-dependency
  if (taskId === blockedById) throw new Error("A task cannot depend on itself");

  // Check for circular dependency
  const hasCycle = await checkDependencyCycle(blockedById, taskId);
  if (hasCycle) throw new Error("Adding this dependency would create a circular chain");

  return prisma.task.update({
    where: { id: taskId },
    data: { blockedBy: { connect: { id: blockedById } } },
    include: { blockedBy: true, blocking: true },
  });
}

export async function removeDependency(taskId: string, blockedById: string) {
  return prisma.task.update({
    where: { id: taskId },
    data: { blockedBy: { disconnect: { id: blockedById } } },
    include: { blockedBy: true, blocking: true },
  });
}

async function checkDependencyCycle(fromId: string, targetId: string): Promise<boolean> {
  // BFS: starting from fromId, walk the blockedBy chain. If we reach targetId, it's a cycle.
  const visited = new Set<string>();
  const queue = [fromId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (currentId === targetId) return true;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const task = await prisma.task.findUnique({
      where: { id: currentId },
      include: { blockedBy: { select: { id: true } } },
    });
    if (task) {
      for (const dep of task.blockedBy) {
        queue.push(dep.id);
      }
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

export type { CreateTaskInput, UpdateTaskInput, TaskFilters };
