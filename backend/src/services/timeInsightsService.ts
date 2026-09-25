/**
 * Project time insights: where logged time went, manual vs lab check-in, and
 * which tasks have soaked up the most time. Plan decisions 7 and 12.
 *
 * buildTimeInsights() is pure; getProjectTimeInsights() does the queries.
 */
import { prisma } from "../db/prisma.js";
import { mondayOf, type Ymd } from "./labScheduleCore.js";

const DAY_MS = 86_400_000;
export const DEFAULT_INSIGHT_WEEKS = 12;

export interface InsightPerson { id: string; displayName: string; avatarUrl: string | null; }
export interface InsightLog {
  taskId: string; memberId: string; minutes: number; loggedAt: Date; labVisitId: string | null;
  member: { displayName: string; avatarUrl: string | null };
}
export interface InsightTask {
  id: string; title: string; status: string; completedAt: Date | null;
  /** First TimeLog ever on the task, not just inside the range. */
  firstLoggedAt: Date | null;
  assignees: InsightPerson[];
}

export interface TimeInsights {
  from: string; to: string;
  totals: { minutes: number; manualMinutes: number; labMinutes: number; unallocatedLabMinutes: number };
  byWeek: { weekStart: Ymd; manualMinutes: number; labMinutes: number }[];
  byMember: { memberId: string; displayName: string; avatarUrl: string | null; minutes: number; labMinutes: number }[];
  tasks: {
    id: string; title: string; status: string; minutes: number; labMinutes: number;
    firstLoggedAt: string | null; completedAt: string | null; activeDays: number | null;
    assignees: InsightPerson[];
  }[];
}

const ymdOf = (d: Date): Ymd => d.toISOString().slice(0, 10);

/** Days from first log to completion (or `now`), rounded up, minimum 1. */
export function activeDays(firstLoggedAt: Date | null, completedAt: Date | null, now: Date): number | null {
  if (!firstLoggedAt) return null;
  const end = completedAt ?? now;
  return Math.max(1, Math.ceil((end.getTime() - firstLoggedAt.getTime()) / DAY_MS));
}

export function buildTimeInsights(input: {
  logs: InsightLog[]; tasks: InsightTask[]; unallocated: number; from: Date; to: Date; now?: Date;
}): TimeInsights {
  const { logs, tasks, unallocated, from, to } = input;
  const now = input.now ?? new Date();
  const inRange = logs.filter(l => l.loggedAt >= from && l.loggedAt <= to);

  const weeks = new Map<Ymd, { manualMinutes: number; labMinutes: number }>();
  for (let w = mondayOf(ymdOf(from)); w <= ymdOf(to); w = ymdOf(new Date(Date.parse(`${w}T00:00:00Z`) + 7 * DAY_MS))) {
    weeks.set(w, { manualMinutes: 0, labMinutes: 0 });
  }
  const members = new Map<string, TimeInsights["byMember"][number]>();
  const perTask = new Map<string, { minutes: number; labMinutes: number }>();
  let manual = 0, lab = 0;

  for (const l of inRange) {
    const isLab = l.labVisitId != null;
    if (isLab) lab += l.minutes; else manual += l.minutes;

    const wk = weeks.get(mondayOf(ymdOf(l.loggedAt)));
    if (wk) { if (isLab) wk.labMinutes += l.minutes; else wk.manualMinutes += l.minutes; }

    const m = members.get(l.memberId) ?? {
      memberId: l.memberId, displayName: l.member.displayName, avatarUrl: l.member.avatarUrl, minutes: 0, labMinutes: 0,
    };
    m.minutes += l.minutes;
    if (isLab) m.labMinutes += l.minutes;
    members.set(l.memberId, m);

    const t = perTask.get(l.taskId) ?? { minutes: 0, labMinutes: 0 };
    t.minutes += l.minutes;
    if (isLab) t.labMinutes += l.minutes;
    perTask.set(l.taskId, t);
  }

  const taskRows = tasks
    .filter(t => perTask.has(t.id))
    .map(t => ({
      id: t.id, title: t.title, status: t.status,
      ...perTask.get(t.id)!,
      firstLoggedAt: t.firstLoggedAt?.toISOString() ?? null,
      completedAt: t.completedAt?.toISOString() ?? null,
      activeDays: activeDays(t.firstLoggedAt, t.completedAt, now),
      assignees: t.assignees,
    }))
    .sort((a, b) => b.minutes - a.minutes || a.title.localeCompare(b.title));

  return {
    from: from.toISOString(), to: to.toISOString(),
    totals: { minutes: manual + lab, manualMinutes: manual, labMinutes: lab, unallocatedLabMinutes: unallocated },
    byWeek: [...weeks].map(([weekStart, v]) => ({ weekStart, ...v })),
    byMember: [...members.values()].sort((a, b) => b.minutes - a.minutes || a.displayName.localeCompare(b.displayName)),
    tasks: taskRows,
  };
}

export async function getProjectTimeInsights(projectId: string, opts: { from?: Date; to?: Date } = {}, now = new Date()) {
  const to = opts.to ?? now;
  const from = opts.from ?? new Date(to.getTime() - DEFAULT_INSIGHT_WEEKS * 7 * DAY_MS);

  const logs = await prisma.timeLog.findMany({
    where: { task: { projectId }, loggedAt: { gte: from, lte: to } },
    select: {
      taskId: true, memberId: true, minutes: true, loggedAt: true, labVisitId: true,
      member: { select: { displayName: true, avatarUrl: true } },
    },
  });
  const taskIds = [...new Set(logs.map(l => l.taskId))];

  const [taskRows, firsts, spaces] = await Promise.all([
    prisma.task.findMany({
      where: { id: { in: taskIds } },
      select: {
        id: true, title: true, status: true, completedAt: true,
        assignees: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    }),
    prisma.timeLog.groupBy({ by: ["taskId"], where: { taskId: { in: taskIds } }, _min: { loggedAt: true } }),
    // Unallocated lab minutes belong to a project only when the space links to exactly that one project.
    prisma.workspace.findMany({
      where: { projects: { some: { projectId } } },
      select: { id: true, _count: { select: { projects: true } } },
    }),
  ]);
  const firstBy = new Map(firsts.map(f => [f.taskId, f._min.loggedAt]));
  const soleSpaceIds = spaces.filter(s => s._count.projects === 1).map(s => s.id);
  const unallocated = soleSpaceIds.length
    ? (await prisma.labVisit.aggregate({
        where: { workspaceId: { in: soleSpaceIds }, status: "CLOSED", checkedInAt: { gte: from, lte: to } },
        _sum: { unallocatedMinutes: true },
      }))._sum.unallocatedMinutes ?? 0
    : 0;

  return buildTimeInsights({
    logs,
    tasks: taskRows.map(t => ({ ...t, firstLoggedAt: firstBy.get(t.id) ?? null })),
    unallocated, from, to, now,
  });
}
