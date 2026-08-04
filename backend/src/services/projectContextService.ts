import { prisma } from "../db/prisma.js";
import { getProjectAuditLog } from "./activityService.js";
import type { TaskStatus, Priority, MilestoneStatus } from "@prisma/client";

// ── Project Context Service ──────────────────────────────────
// Assembles a rich, typed snapshot of a project for AI prompts (Q&A, action
// planning). Centralizes what was previously assembled inline in
// projects.ts `/ask` so every AI feature sees the same, fuller picture.

export interface ProjectContextTask {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  assignees: string[];
  dueDate: string | null;
  milestoneTitle: string | null;
  blockedByOpenDependencies: boolean;
  activeCategoryBlockers: string[];
  subtaskCounts: { total: number; done: number };
}

export interface ProjectContextMilestone {
  id: string;
  title: string;
  status: MilestoneStatus;
  targetDate: string | null;
}

export interface ProjectContextMember {
  id: string;
  displayName: string;
  projectRole: string;
  openTaskCount: number;
}

export interface ProjectContextAuditEvent {
  eventType: string;
  actorName: string | null;
  taskTitle: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

export interface ProjectContextBlocker {
  id: string;
  label: string;
  assigneeName: string | null;
  attachedTaskTitles: string[];
}

export interface ProjectContext {
  project: {
    id: string;
    name: string;
    description: string | null;
    type: string;
    targetDate: string | null;
  };
  tasks: ProjectContextTask[];
  milestones: ProjectContextMilestone[];
  members: ProjectContextMember[];
  recentActivity: ProjectContextAuditEvent[];
  activeBlockers: ProjectContextBlocker[];
  /** true if `tasks` was cut off by `taskLimit` before the project's real task count */
  truncated: boolean;
}

export interface BuildProjectContextOptions {
  /** Max tasks to include (open tasks first, then most recently updated). Default 300. */
  taskLimit?: number;
  /** Max recent ActivityLog rows to include. Default 30. */
  activityLimit?: number;
}

function isoDate(d: Date | null | undefined): string | null {
  return d ? d.toISOString().split("T")[0] : null;
}

export async function buildProjectContext(
  projectId: string,
  opts: BuildProjectContextOptions = {}
): Promise<ProjectContext | null> {
  const taskLimit = opts.taskLimit ?? 300;
  const activityLimit = opts.activityLimit ?? 30;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      members: { include: { member: { select: { id: true, displayName: true } } } },
    },
  });
  if (!project) return null;
  // A training project is fixture data. Letting the AI reason over it would put
  // invented practice tasks into risk reports, capacity analyses and action
  // plans as though they were real club work. Same "absent" answer as a
  // project that does not exist — every caller already handles null.
  if (project.trainingForMemberId) return null;

  const [totalTaskCount, tasksRaw, milestonesRaw, activeBlockersRaw, auditLog] = await Promise.all([
    prisma.task.count({ where: { projectId, archivedAt: null } }),
    prisma.task.findMany({
      where: { projectId, archivedAt: null },
      orderBy: [{ status: "asc" }, { priority: "desc" }, { updatedAt: "desc" }],
      take: taskLimit,
      include: {
        assignees: { select: { displayName: true } },
        milestone: { select: { title: true } },
        blockedBy: { include: { blockingTask: { select: { status: true } } } },
        blockers: { where: { blocker: { resolvedAt: null } }, include: { blocker: { select: { label: true } } } },
        subtasks: { select: { status: true } },
      },
    }),
    prisma.milestone.findMany({
      where: { projectId },
      orderBy: { dueDate: "asc" },
      select: { id: true, title: true, status: true, dueDate: true },
    }),
    prisma.blocker.findMany({
      where: { projectId, resolvedAt: null },
      include: {
        assignee: { select: { displayName: true } },
        tasks: { include: { task: { select: { title: true } } } },
      },
    }),
    getProjectAuditLog(projectId, undefined, activityLimit),
  ]);

  const openTaskCounts = await Promise.all(
    project.members.map((pm) =>
      prisma.task.count({
        where: {
          projectId,
          archivedAt: null,
          status: { not: "DONE" },
          assignees: { some: { id: pm.memberId } },
        },
      })
    )
  );

  const tasks: ProjectContextTask[] = tasksRaw.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    assignees: t.assignees.map((a) => a.displayName),
    dueDate: isoDate(t.dueDate),
    milestoneTitle: t.milestone?.title ?? null,
    blockedByOpenDependencies: t.blockedBy.some((d) => d.blockingTask.status !== "DONE"),
    activeCategoryBlockers: t.blockers.map((b) => b.blocker.label),
    subtaskCounts: {
      total: t.subtasks.length,
      done: t.subtasks.filter((s) => s.status === "DONE").length,
    },
  }));

  const milestones: ProjectContextMilestone[] = milestonesRaw.map((m) => ({
    id: m.id,
    title: m.title,
    status: m.status,
    targetDate: isoDate(m.dueDate),
  }));

  const members: ProjectContextMember[] = project.members.map((pm, i) => ({
    id: pm.memberId,
    displayName: pm.member.displayName,
    projectRole: pm.projectRole,
    openTaskCount: openTaskCounts[i],
  }));

  const recentActivity: ProjectContextAuditEvent[] = auditLog.items.map((a) => ({
    eventType: a.eventType,
    actorName: a.member?.displayName ?? null,
    taskTitle: a.task?.title ?? null,
    payload: (a.payload as Record<string, unknown> | null) ?? null,
    createdAt: a.createdAt.toISOString(),
  }));

  const activeBlockers: ProjectContextBlocker[] = activeBlockersRaw.map((b) => ({
    id: b.id,
    label: b.label,
    assigneeName: b.assignee?.displayName ?? null,
    attachedTaskTitles: b.tasks.map((tb) => tb.task.title),
  }));

  return {
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      type: project.type,
      targetDate: isoDate(project.targetDate),
    },
    tasks,
    milestones,
    members,
    recentActivity,
    activeBlockers,
    truncated: totalTaskCount > tasks.length,
  };
}
