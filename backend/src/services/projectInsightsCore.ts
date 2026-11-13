// Pure project-insights math for the Claude connector. No I/O, no Prisma.
// Ported from src/components/clubpm/analytics/useAnalyticsData.js so Claude sees
// the same numbers members see on Insights -> Charts. Burndown and cumulative
// flow are intentionally not ported.

export type InsightStatus = "TODO" | "IN_PROGRESS" | "BLOCKED" | "DONE";
export type InsightPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface InsightTaskRow {
  id: string;
  status: InsightStatus;
  priority: InsightPriority;
  createdAt: Date;
  completedAt: Date | null;
  dueDate: Date | null;
  updatedAt: Date;
  storyPoints: number | null;
  estimatedHours: number | null;
  assigneeIds: string[];
}
export interface InsightRosterMember { id: string }

export interface ProjectInsights {
  kpis: {
    open: number; done: number; overdue: number; blocked: number;
    completedInWindow: number; meanCycleDays: number | null;
  };
  workload: Array<{
    memberId: string; openTasks: number; openHours: number; openPoints: number;
    overdue: number; inProgress: number;
  }>;
  weekly: Array<{ weekStart: string; completed: number; completedPoints: number }>;
  aging: Array<{ bucket: string; priority: InsightPriority; count: number }>;
  rosterMedianOpenHours: number;
}

// Same values as AGING_BUCKETS in useAnalyticsData.js.
export const AGING_BUCKETS: ReadonlyArray<{ key: string; maxDays: number }> = [
  { key: "<1w", maxDays: 7 },
  { key: "1-2w", maxDays: 14 },
  { key: "2-4w", maxDays: 28 },
  { key: ">1mo", maxDays: Infinity },
];

export const PRIORITY_ORDER: ReadonlyArray<InsightPriority> = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

/** Hours assumed for an open task with neither an estimate nor story points. */
export const HOURS_FALLBACK = 2;
/** Hours per story point when only points are known. */
export const HOURS_PER_POINT = 2;

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/**
 * Open hours for one task: estimatedHours if > 0, else storyPoints x 2 if > 0,
 * else 2. A task with several assignees contributes its FULL hours to each
 * assignee (not split), so per-member sums can exceed the project total.
 */
export function openHoursFor(task: Pick<InsightTaskRow, "estimatedHours" | "storyPoints">): number {
  const est = Number(task.estimatedHours);
  if (Number.isFinite(est) && est > 0) return est;
  const pts = Number(task.storyPoints);
  if (Number.isFinite(pts) && pts > 0) return pts * HOURS_PER_POINT;
  return HOURS_FALLBACK;
}

const isOpen = (t: InsightTaskRow) => t.status !== "DONE";
const isOverdue = (t: InsightTaskRow, now: Date) => isOpen(t) && !!t.dueDate && t.dueDate < now;
const points = (t: InsightTaskRow) => Number(t.storyPoints) || 0;

function round1(n: number): number { return Math.round(n * 10) / 10; }

/** Monday 00:00 UTC of the week containing d. */
export function weekStartUtc(d: Date): Date {
  const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (day.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(day.getTime() - dow * DAY_MS);
}

/** Mean days createdAt -> completedAt, clamped at 0; null when nothing qualifies (as meanCycleDays in the JS). */
function meanCycleDays(done: InsightTaskRow[]): number | null {
  const spans = done
    .filter((t) => t.completedAt)
    .map((t) => Math.max(0, (t.completedAt!.getTime() - t.createdAt.getTime()) / DAY_MS));
  if (!spans.length) return null;
  return spans.reduce((a, b) => a + b, 0) / spans.length;
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function utcCalendarDays(a: Date, b: Date): number {
  const da = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const db = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((da - db) / DAY_MS);
}

export function computeProjectInsights(input: {
  tasks: InsightTaskRow[]; roster: InsightRosterMember[]; now: Date; weeks: number;
}): ProjectInsights {
  const { tasks, roster, now } = input;
  const weeks = Math.max(1, Math.floor(input.weeks));

  // kpis ------------------------------------------------------------------
  const windowStart = new Date(now.getTime() - weeks * WEEK_MS);
  const doneInWindow = tasks.filter((t) => t.completedAt && t.completedAt >= windowStart && t.completedAt <= now);
  const cycle = meanCycleDays(doneInWindow);
  const kpis = {
    open: tasks.filter(isOpen).length,
    done: tasks.filter((t) => t.status === "DONE").length,
    overdue: tasks.filter((t) => isOverdue(t, now)).length,
    blocked: tasks.filter((t) => t.status === "BLOCKED").length,
    completedInWindow: doneInWindow.length,
    meanCycleDays: cycle === null ? null : round1(cycle),
  };

  // workload --------------------------------------------------------------
  const rows = new Map<string, ProjectInsights["workload"][number]>();
  const rowFor = (id: string) => {
    let r = rows.get(id);
    if (!r) { r = { memberId: id, openTasks: 0, openHours: 0, openPoints: 0, overdue: 0, inProgress: 0 }; rows.set(id, r); }
    return r;
  };
  for (const m of roster) rowFor(m.id);
  for (const t of tasks) {
    if (!isOpen(t)) continue;
    const hours = openHoursFor(t);
    for (const id of new Set(t.assigneeIds)) {
      const r = rowFor(id);
      r.openTasks += 1;
      r.openHours += hours; // full hours to every assignee
      r.openPoints += points(t);
      if (isOverdue(t, now)) r.overdue += 1;
      if (t.status === "IN_PROGRESS") r.inProgress += 1;
    }
  }
  const workload = [...rows.values()].sort((a, b) => b.openHours - a.openHours || (a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0));
  const rosterIds = new Set(roster.map((m) => m.id));
  const rosterMedianOpenHours = median(workload.filter((r) => rosterIds.has(r.memberId)).map((r) => r.openHours));

  // weekly (Monday 00:00 UTC buckets, oldest first, last = week containing now)
  const thisWeek = weekStartUtc(now).getTime();
  const weekly: ProjectInsights["weekly"] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = thisWeek - i * WEEK_MS;
    const end = start + WEEK_MS;
    const done = tasks.filter((t) => t.completedAt && t.completedAt.getTime() >= start && t.completedAt.getTime() < end);
    weekly.push({
      weekStart: new Date(start).toISOString().slice(0, 10),
      completed: done.length,
      completedPoints: done.reduce((s, t) => s + points(t), 0),
    });
  }

  // aging -----------------------------------------------------------------
  const counts = new Map<string, number>();
  for (const t of tasks) {
    if (!isOpen(t)) continue;
    const age = Math.max(0, utcCalendarDays(now, t.createdAt));
    let idx = AGING_BUCKETS.findIndex((b) => age < b.maxDays);
    if (idx === -1) idx = AGING_BUCKETS.length - 1;
    const pr = PRIORITY_ORDER.includes(t.priority) ? t.priority : "MEDIUM";
    const k = `${idx}|${pr}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const aging: ProjectInsights["aging"] = [];
  AGING_BUCKETS.forEach((b, i) => {
    for (const p of PRIORITY_ORDER) {
      const count = counts.get(`${i}|${p}`) ?? 0;
      if (count > 0) aging.push({ bucket: b.key, priority: p, count });
    }
  });

  return { kpis, workload, weekly, aging, rosterMedianOpenHours };
}
