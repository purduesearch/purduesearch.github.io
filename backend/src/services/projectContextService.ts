import { prisma } from "../db/prisma.js";
import { getProjectAuditLog } from "./activityService.js";
import { getRollupChildren } from "./subProjectRollupService.js";
import type { Prisma, TaskStatus, Priority, MilestoneStatus } from "@prisma/client";

// ── Project Context Service ──────────────────────────────────
// Assembles a rich, typed snapshot of ONE project for AI prompts (Q&A, action
// planning, risk analysis, sprint planning, capacity, Drive parsing). Every query
// below is filtered by projectId (or, for task rows, by the project id set: this
// project plus sub-projects that opted into AI roll-up), so the model never sees
// an unrelated project's tasks, time logs or people. Centralizes what was
// previously assembled inline in each feature so they all see the same picture.

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
  /** Titles of the open (non-DONE) tasks this one waits on. */
  blockedByTitles: string[];
  activeCategoryBlockers: string[];
  subtaskCounts: { total: number; done: number };
  storyPoints: number | null;
  estimatedHours: number | null;
  /** All time logged on this task, in hours (rounded to 0.1). */
  loggedHours: number;
  /** Title of the parent task when this is a subtask. */
  parentTitle: string | null;
  /** Whole days since the task last changed. */
  daysSinceUpdate: number;
  /** Set only on tasks rolled up from a sub-project; absent on this project's own tasks. */
  projectName?: string;
}

export interface ProjectContextMilestone {
  id: string;
  title: string;
  status: MilestoneStatus;
  targetDate: string | null;
  description: string | null;
  ownerName: string | null;
  /** Counts over every non-archived task linked to the milestone, not just the truncated task list. */
  taskCounts: { total: number; done: number };
}

export interface ProjectContextMember {
  id: string;
  displayName: string;
  projectRole: string;
  isLead: boolean;
  openTaskCount: number;
  openHighPriorityCount: number;
  openOverdueCount: number;
  openStoryPoints: number;
  openEstimatedHours: number;
  /** Open tasks with neither points nor hours, so the two totals above are lower bounds. */
  openUnestimatedCount: number;
  completedLast14d: number;
  /** Hours this member logged on THIS project's tasks in the last 14 days. */
  loggedHoursLast14d: number;
  /**
   * Strongest evidence-backed skills (advisory estimates; AI-inferred, lead-verified
   * or peer-endorsed rows only, never bare self-claims). Absent when the skills
   * tables hold nothing for this member.
   */
  topSkills?: ProjectContextSkill[];
}

export interface ProjectContextSkill {
  name: string;
  level: number;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  provenance: "AI_INFERRED" | "PEER_ENDORSED" | "MANAGER_VERIFIED";
  /** ISO date of the most recent supporting work, when known. */
  lastDemonstrated: string | null;
}

export interface ProjectContextVelocity {
  windowDays: number;
  tasksCompleted: number;
  pointsCompleted: number;
  tasksPerWeek: number;
  pointsPerWeek: number;
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
  /** Completion rate over the last 28 days, from this project's DONE tasks only. */
  velocity: ProjectContextVelocity;
  /** Open work nobody on the project owns. Counted over all open tasks, not just the truncated list. */
  unassignedOpen: { tasks: number; highPriority: number; storyPoints: number; estimatedHours: number };
  tasks: ProjectContextTask[];
  milestones: ProjectContextMilestone[];
  members: ProjectContextMember[];
  recentActivity: ProjectContextAuditEvent[];
  activeBlockers: ProjectContextBlocker[];
  /** Sub-projects whose tasks are merged into `tasks` (empty unless `includeRollup`). */
  rollupProjects: { id: string; name: string }[];
  /** true if `tasks` was cut off by `taskLimit` before the project's real task count */
  truncated: boolean;
}

export interface BuildProjectContextOptions {
  /** Max tasks to include (open tasks first, then most recently updated). Default 300. */
  taskLimit?: number;
  /** Max recent ActivityLog rows to include. Default 30. */
  activityLimit?: number;
  /**
   * Merge in tasks from sub-projects that have "AI context" roll-up on. Default true.
   * Slack's legacy askProject passes false. Members, milestones, blockers, velocity
   * and activity always stay this project's own.
   */
  includeRollup?: boolean;
}

function isoDate(d: Date | null | undefined): string | null {
  return d ? d.toISOString().split("T")[0] : null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const VELOCITY_WINDOW_DAYS = 28;
const MEMBER_WINDOW_DAYS = 14;

const round1 = (n: number) => Math.round(n * 10) / 10;

type Load = { open: number; high: number; overdue: number; points: number; hours: number; unestimated: number };
const emptyLoad = (): Load => ({ open: 0, high: 0, overdue: 0, points: 0, hours: 0, unestimated: 0 });

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

  const rollupProjects = opts.includeRollup === false
    ? []
    : (await getRollupChildren(projectId, "aiContext")).map((c) => ({ id: c.id, name: c.name }));
  const rollupIds = rollupProjects.map((c) => c.id);
  const rollupNames = new Map(rollupProjects.map((c) => [c.id, c.name]));
  const taskScope = { projectId: { in: [projectId, ...rollupIds] } };

  const now = new Date();
  const todayIso = isoDate(now)!;
  const velocitySince = new Date(now.getTime() - VELOCITY_WINDOW_DAYS * DAY_MS);
  const memberSince = new Date(now.getTime() - MEMBER_WINDOW_DAYS * DAY_MS);
  const projectMemberIds = new Set(project.members.map((pm) => pm.memberId));

  const taskOrder: Prisma.TaskOrderByWithRelationInput[] = [{ status: "asc" }, { priority: "desc" }, { updatedAt: "desc" }];
  const taskInclude = {
    assignees: { select: { displayName: true } },
    milestone: { select: { title: true } },
    parentTask: { select: { title: true } },
    blockedBy: { include: { blockingTask: { select: { title: true, status: true } } } },
    blockers: { where: { blocker: { resolvedAt: null } }, include: { blocker: { select: { label: true } } } },
    subtasks: { select: { status: true } },
  } as const;

  const [
    totalTaskCount, localTasksRaw, milestonesRaw, activeBlockersRaw, auditLog,
    openRows, doneRows, loggedByTask, loggedByMember, milestoneTaskRows,
  ] = await Promise.all([
    prisma.task.count({ where: { ...taskScope, archivedAt: null } }),
    prisma.task.findMany({
      where: { projectId, archivedAt: null },
      orderBy: taskOrder,
      take: taskLimit,
      include: taskInclude,
    }),
    prisma.milestone.findMany({
      where: { projectId },
      orderBy: { dueDate: "asc" },
      select: {
        id: true, title: true, status: true, dueDate: true, description: true,
        owner: { select: { displayName: true } },
      },
    }),
    prisma.blocker.findMany({
      where: { projectId, resolvedAt: null },
      include: {
        assignee: { select: { displayName: true } },
        tasks: { include: { task: { select: { title: true } } } },
      },
    }),
    getProjectAuditLog(projectId, { limit: activityLimit }),
    // Unbounded but narrow: per-member workload must not depend on taskLimit.
    prisma.task.findMany({
      where: { projectId, archivedAt: null, status: { not: "DONE" } },
      select: { priority: true, dueDate: true, storyPoints: true, estimatedHours: true, assignees: { select: { id: true } } },
    }),
    prisma.task.findMany({
      where: { projectId, archivedAt: null, status: "DONE", completedAt: { gte: velocitySince } },
      select: { storyPoints: true, completedAt: true, assignees: { select: { id: true } } },
    }),
    prisma.timeLog.groupBy({ by: ["taskId"], where: { task: taskScope }, _sum: { minutes: true } }),
    prisma.timeLog.groupBy({
      by: ["memberId"],
      where: { task: { projectId }, loggedAt: { gte: memberSince } },
      _sum: { minutes: true },
    }),
    prisma.task.findMany({
      where: { projectId, archivedAt: null, milestoneId: { not: null } },
      select: { milestoneId: true, status: true },
    }),
  ]);

  // taskLimit applies to the merged list, own tasks first: rolled-up work only fills what is left.
  const rolledTasksRaw = rollupIds.length && taskLimit > localTasksRaw.length
    ? await prisma.task.findMany({
        where: { projectId: { in: rollupIds }, archivedAt: null },
        orderBy: taskOrder,
        take: taskLimit - localTasksRaw.length,
        include: taskInclude,
      })
    : [];
  const tasksRaw = [...localTasksRaw, ...rolledTasksRaw];

  const loggedMinutesByTask = new Map(loggedByTask.map((r) => [r.taskId, r._sum.minutes ?? 0]));
  const loggedMinutesByMember = new Map(loggedByMember.map((r) => [r.memberId, r._sum.minutes ?? 0]));

  const milestoneCounts = new Map<string, { total: number; done: number }>();
  for (const r of milestoneTaskRows) {
    const c = milestoneCounts.get(r.milestoneId!) ?? { total: 0, done: 0 };
    c.total++;
    if (r.status === "DONE") c.done++;
    milestoneCounts.set(r.milestoneId!, c);
  }

  // Workload per member in one pass. A task nobody on the project owns counts as unassigned.
  const loadByMember = new Map<string, Load>();
  const unassigned = emptyLoad();
  for (const t of openRows) {
    const isHigh = t.priority === "HIGH" || t.priority === "CRITICAL";
    const isOverdue = !!t.dueDate && isoDate(t.dueDate)! < todayIso;
    const owners = t.assignees.map((a) => a.id).filter((id) => projectMemberIds.has(id));
    const loads = owners.length
      ? owners.map((id) => {
          let l = loadByMember.get(id);
          if (!l) { l = emptyLoad(); loadByMember.set(id, l); }
          return l;
        })
      : [unassigned];
    for (const l of loads) {
      l.open++;
      if (isHigh) l.high++;
      if (isOverdue) l.overdue++;
      l.points += t.storyPoints ?? 0;
      l.hours += t.estimatedHours ?? 0;
      if (t.storyPoints == null && t.estimatedHours == null) l.unestimated++;
    }
  }

  const doneByMember = new Map<string, number>();
  let pointsCompleted = 0;
  for (const t of doneRows) {
    pointsCompleted += t.storyPoints ?? 0;
    if (t.completedAt && t.completedAt >= memberSince) {
      for (const a of t.assignees) doneByMember.set(a.id, (doneByMember.get(a.id) ?? 0) + 1);
    }
  }
  const weeks = VELOCITY_WINDOW_DAYS / 7;
  const velocity: ProjectContextVelocity = {
    windowDays: VELOCITY_WINDOW_DAYS,
    tasksCompleted: doneRows.length,
    pointsCompleted,
    tasksPerWeek: round1(doneRows.length / weeks),
    pointsPerWeek: round1(pointsCompleted / weeks),
  };

  const tasks: ProjectContextTask[] = tasksRaw.map((t) => {
    const openDeps = t.blockedBy.filter((d) => d.blockingTask.status !== "DONE");
    return {
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      assignees: t.assignees.map((a) => a.displayName),
      dueDate: isoDate(t.dueDate),
      milestoneTitle: t.milestone?.title ?? null,
      blockedByOpenDependencies: openDeps.length > 0,
      blockedByTitles: openDeps.map((d) => d.blockingTask.title),
      activeCategoryBlockers: t.blockers.map((b) => b.blocker.label),
      subtaskCounts: {
        total: t.subtasks.length,
        done: t.subtasks.filter((s) => s.status === "DONE").length,
      },
      storyPoints: t.storyPoints,
      estimatedHours: t.estimatedHours,
      loggedHours: round1((loggedMinutesByTask.get(t.id) ?? 0) / 60),
      parentTitle: t.parentTask?.title ?? null,
      daysSinceUpdate: Math.max(0, Math.floor((now.getTime() - t.updatedAt.getTime()) / DAY_MS)),
      ...(t.projectId !== projectId ? { projectName: rollupNames.get(t.projectId) } : {}),
    };
  });

  const milestones: ProjectContextMilestone[] = milestonesRaw.map((m) => ({
    id: m.id,
    title: m.title,
    status: m.status,
    targetDate: isoDate(m.dueDate),
    description: m.description,
    ownerName: m.owner?.displayName ?? null,
    taskCounts: milestoneCounts.get(m.id) ?? { total: 0, done: 0 },
  }));

  const skillRows = await prisma.skillAssessment.findMany({
    where: { memberId: { in: [...projectMemberIds] }, provenance: { in: ["AI_INFERRED", "PEER_ENDORSED", "MANAGER_VERIFIED"] } },
    select: { memberId: true, level: true, confidenceBand: true, provenance: true, lastDemonstrated: true, skill: { select: { name: true } } },
  });
  const bandRank = { LOW: 0, MEDIUM: 1, HIGH: 2 } as const;
  const skillsByMember = new Map<string, ProjectContextSkill[]>();
  for (const r of skillRows.sort((a, b) => b.level - a.level || bandRank[b.confidenceBand] - bandRank[a.confidenceBand] || a.skill.name.localeCompare(b.skill.name))) {
    if (r.provenance === "AI_INFERRED" && r.confidenceBand === "LOW" && r.level < 3) continue; // thin signal, not worth the tokens
    const list = skillsByMember.get(r.memberId) ?? [];
    if (list.length < 5 && !list.some((x) => x.name === r.skill.name)) {
      list.push({ name: r.skill.name, level: r.level, confidence: r.confidenceBand, provenance: r.provenance as ProjectContextSkill["provenance"], lastDemonstrated: isoDate(r.lastDemonstrated) });
      skillsByMember.set(r.memberId, list);
    }
  }

  const members: ProjectContextMember[] = project.members.map((pm) => {
    const l = loadByMember.get(pm.memberId) ?? emptyLoad();
    return {
      id: pm.memberId,
      displayName: pm.member.displayName,
      projectRole: pm.projectRole,
      isLead: pm.isLead,
      openTaskCount: l.open,
      openHighPriorityCount: l.high,
      openOverdueCount: l.overdue,
      openStoryPoints: l.points,
      openEstimatedHours: round1(l.hours),
      openUnestimatedCount: l.unestimated,
      completedLast14d: doneByMember.get(pm.memberId) ?? 0,
      loggedHoursLast14d: round1((loggedMinutesByMember.get(pm.memberId) ?? 0) / 60),
      ...(skillsByMember.has(pm.memberId) ? { topSkills: skillsByMember.get(pm.memberId) } : {}),
    };
  });

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
    velocity,
    unassignedOpen: {
      tasks: unassigned.open,
      highPriority: unassigned.high,
      storyPoints: unassigned.points,
      estimatedHours: round1(unassigned.hours),
    },
    tasks,
    milestones,
    members,
    recentActivity,
    activeBlockers,
    rollupProjects,
    truncated: totalTaskCount > tasks.length,
  };
}
