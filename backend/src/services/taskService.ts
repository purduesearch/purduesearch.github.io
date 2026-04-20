import { prisma } from "../db/prisma.js";
import type { Task, TaskStatus, Priority } from "@prisma/client";

// ── Types ────────────────────────────────────────────────────

interface CreateTaskInput {
  title: string;
  description?: string;
  priority?: Priority;
  dueDate?: Date;
  projectId: string;
  assigneeId?: string;
  slackMsgTs?: string;
}

interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: Priority;
  dueDate?: Date;
  assigneeId?: string | null;
}

interface TaskFilters {
  status?: TaskStatus;
  assigneeId?: string;
  priority?: Priority;
}

// ── Service ──────────────────────────────────────────────────

export async function createTask(data: CreateTaskInput): Promise<Task> {
  // Idempotency check: if slackMsgTs is provided, check for duplicates
  if (data.slackMsgTs) {
    const existing = await prisma.task.findFirst({
      where: { slackMsgTs: data.slackMsgTs },
    });
    if (existing) {
      return existing;
    }
  }

  return prisma.task.create({
    data,
    include: { assignee: true, project: true },
  });
}

export async function updateTask(
  id: string,
  data: UpdateTaskInput
): Promise<Task> {
  return prisma.task.update({
    where: { id },
    data,
    include: { assignee: true, project: true },
  });
}

export async function deleteTask(id: string): Promise<Task> {
  return prisma.task.delete({ where: { id } });
}

export async function getTask(id: string) {
  return prisma.task.findUnique({
    where: { id },
    include: { assignee: true, project: true },
  });
}

export async function getTasksForProject(
  projectId: string,
  filters?: TaskFilters
) {
  const where: Record<string, unknown> = { projectId };
  if (filters?.status) where.status = filters.status;
  if (filters?.assigneeId) where.assigneeId = filters.assigneeId;
  if (filters?.priority) where.priority = filters.priority;

  return prisma.task.findMany({
    where,
    include: { assignee: true },
    orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
  });
}

export async function getTasksForMember(memberId: string) {
  return prisma.task.findMany({
    where: { assigneeId: memberId },
    include: { project: true, assignee: true },
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
    include: { assignee: true, project: true },
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
    include: { assignee: true, project: true },
  });
}

export async function getTasksDueThisWeek(memberId?: string) {
  const now = new Date();
  const endOfWeek = new Date();
  endOfWeek.setDate(now.getDate() + (7 - now.getDay()));
  endOfWeek.setHours(23, 59, 59, 999);

  const where: Record<string, unknown> = {
    dueDate: { gte: now, lte: endOfWeek },
    status: { notIn: ["DONE"] },
  };
  if (memberId) where.assigneeId = memberId;

  return prisma.task.findMany({
    where,
    include: { assignee: true, project: true },
    orderBy: { dueDate: "asc" },
  });
}
