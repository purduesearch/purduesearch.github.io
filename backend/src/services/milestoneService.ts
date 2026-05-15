import { prisma } from "../db/prisma.js";
import type { MilestoneStatus } from "@prisma/client";

// ── Milestone Service ────────────────────────────────────────

export async function createMilestone(data: {
  title: string;
  projectId: string;
  dueDate?: Date;
}) {
  return prisma.milestone.create({
    data: {
      title: data.title,
      projectId: data.projectId,
      dueDate: data.dueDate,
    },
    include: { tasks: { select: { id: true, status: true } } },
  });
}

export async function updateMilestone(
  id: string,
  data: { title?: string; dueDate?: Date | null }
) {
  return prisma.milestone.update({
    where: { id },
    data,
    include: { tasks: { select: { id: true, status: true } } },
  });
}

export async function deleteMilestone(id: string) {
  return prisma.milestone.delete({ where: { id } });
}

export async function getMilestone(id: string) {
  return prisma.milestone.findUnique({
    where: { id },
    include: {
      tasks: {
        include: { assignees: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

export async function getMilestonesForProject(projectId: string) {
  const milestones = await prisma.milestone.findMany({
    where: { projectId },
    include: {
      tasks: { select: { id: true, status: true } },
    },
    orderBy: { dueDate: "asc" },
  });

  return milestones.map((m) => {
    const total = m.tasks.length;
    const done = m.tasks.filter((t) => t.status === "DONE").length;
    return {
      ...m,
      completionPct: total > 0 ? Math.round((done / total) * 100) : 0,
      taskCounts: { total, done },
    };
  });
}

// ── Health Computation ───────────────────────────────────────

export function computeHealth(
  tasks: { status: string }[],
  dueDate: Date,
  currentStatus: MilestoneStatus
): MilestoneStatus {
  if (currentStatus === "CANCELLED") return "CANCELLED";

  const total = tasks.length;
  const done  = tasks.filter(t => t.status === "DONE").length;
  const pct   = total > 0 ? done / total : 1; // no tasks → assume on track until overdue
  const daysLeft = Math.ceil((dueDate.getTime() - Date.now()) / 86_400_000);

  if (pct === 1 || (total === 0 && daysLeft < 0)) return "COMPLETED";
  if (daysLeft < 0)                                return "BEHIND";
  if (pct < 0.5 && daysLeft <= 3)                  return "BEHIND";
  if (pct < 0.75 && daysLeft <= 7)                 return "AT_RISK";
  return "ON_TRACK";
}

export async function refreshMilestoneHealth(milestoneId: string): Promise<void> {
  const milestone = await prisma.milestone.findUnique({
    where: { id: milestoneId },
    include: { tasks: { select: { status: true } } },
  });
  if (!milestone || !milestone.dueDate) return;

  const newStatus = computeHealth(milestone.tasks, milestone.dueDate, milestone.status);

  // Set completedAt only on first COMPLETED transition
  const completedAt =
    newStatus === "COMPLETED" && milestone.status !== "COMPLETED"
      ? new Date()
      : milestone.completedAt;

  if (newStatus !== milestone.status) {
    await prisma.milestone.update({
      where: { id: milestoneId },
      data: { status: newStatus, completedAt: completedAt ?? null },
    });
  }
}

export async function refreshAllMilestoneHealth(): Promise<
  { id: string; title: string; projectId: string; status: MilestoneStatus; prevStatus: MilestoneStatus }[]
> {
  const milestones = await prisma.milestone.findMany({
    where: { status: { notIn: ["COMPLETED", "CANCELLED"] }, dueDate: { not: null } },
    include: {
      tasks:   { select: { status: true } },
      project: { select: { id: true, name: true } },
    },
  });

  const changed: { id: string; title: string; projectId: string; status: MilestoneStatus; prevStatus: MilestoneStatus }[] = [];

  await Promise.all(milestones.map(async (m) => {
    if (!m.dueDate) return;
    const newStatus = computeHealth(m.tasks, m.dueDate, m.status);
    if (newStatus === m.status) return;

    const completedAt = newStatus === "COMPLETED" ? new Date() : undefined;
    await prisma.milestone.update({
      where: { id: m.id },
      data: { status: newStatus, ...(completedAt ? { completedAt } : {}) },
    });
    changed.push({ id: m.id, title: m.title, projectId: m.projectId,
      status: newStatus, prevStatus: m.status });
  }));

  return changed;
}

export async function getMilestoneWithProgress(milestoneId: string) {
  const m = await prisma.milestone.findUnique({
    where: { id: milestoneId },
    include: {
      tasks:  { select: { id: true, title: true, status: true, priority: true, assignees: { select: { id: true, displayName: true } } } },
      owner:  { select: { id: true, displayName: true, avatarUrl: true } },
    },
  });
  if (!m) return null;

  const total = m.tasks.length;
  const done  = m.tasks.filter(t => t.status === "DONE").length;
  return { ...m, progress: total > 0 ? Math.round((done / total) * 100) : 0, taskCount: total };
}
