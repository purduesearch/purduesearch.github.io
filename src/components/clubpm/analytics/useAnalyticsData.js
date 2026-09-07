import { useMemo } from 'react';
import {
  parseISO,
  isValid,
  startOfDay,
  startOfISOWeek,
  startOfMonth,
  addDays,
  addWeeks,
  addMonths,
  differenceInCalendarDays,
  format,
} from 'date-fns';

/**
 * useAnalyticsData — the single derivation layer behind the Reports charts.
 *
 * Everything the analytics cards render is computed here and nowhere else. The
 * hook is a thin `useMemo` around `computeAnalytics`; every step it composes is
 * exported individually so it can be tested without React.
 *
 * Two data-shape facts drive the design:
 *
 *  1. `projectService.getProject` fetches `tasks: { where: { parentTaskId: null } }`,
 *     so `project.tasks` is TOP-LEVEL ONLY. Subtasks arrive nested at
 *     `task.subtasks` carrying status/priority/createdAt/completedAt/assignees —
 *     everything the charts read. We flatten client-side; no backend change is
 *     needed or wanted.
 *  2. `Task.completedAt` is a real column (Part B). Anything time-based keys off
 *     it rather than guessing from `updatedAt`.
 */

// ── constants ────────────────────────────────────────────────────────────────

// Colors live here because they are part of the returned rows. `analyticsTheme.js`
// re-exports them; it stays the only file the *cards* read colors from.
export const STATUS_META = [
  { key: 'TODO', label: 'To Do', color: '#8892a4' },
  { key: 'IN_PROGRESS', label: 'In Progress', color: '#f5a623' },
  { key: 'BLOCKED', label: 'Blocked', color: '#ff6b6b' },
  { key: 'DONE', label: 'Done', color: '#00e5cc' },
];

export const PRIORITY_META = [
  { key: 'LOW', label: 'Low', color: '#8892a4' },
  { key: 'MEDIUM', label: 'Medium', color: '#00e5cc' },
  { key: 'HIGH', label: 'High', color: '#f5a623' },
  { key: 'CRITICAL', label: 'Critical', color: '#ff6b6b' },
];

export const CATEGORICAL_COLORS = [
  '#00e5cc', '#f5a623', '#ff6b6b', '#a78bfa', '#4dabf7',
  '#63e6be', '#ffd43b', '#ff922b', '#e599f7', '#8892a4',
];

const STATUS_KEYS = STATUS_META.map(s => s.key);
const PRIORITY_KEYS = PRIORITY_META.map(p => p.key);

export const AGING_BUCKETS = [
  { key: '<1w', maxDays: 7 },
  { key: '1-2w', maxDays: 14 },
  { key: '2-4w', maxDays: 28 },
  { key: '>1mo', maxDays: Infinity },
];

export const RISK_FACTORS = [
  { id: 'blocked', label: 'Blocked work', weight: 20 },
  { id: 'overdue', label: 'Past due', weight: 20 },
  { id: 'aging', label: 'Aging tasks', weight: 15 },
  { id: 'stale', label: 'Stale in progress', weight: 15 },
  { id: 'unassigned', label: 'Unassigned work', weight: 10 },
  { id: 'dependencies', label: 'Blocked by dependencies', weight: 10 },
  { id: 'velocityTrend', label: 'Velocity trend', weight: 10 },
];

const RISK_WEIGHT_TOTAL = RISK_FACTORS.reduce((s, f) => s + f.weight, 0);

const DEFAULT_OPTIONS = {
  range: 30,          // 30 | 60 | 90 | 0 (0 = all time)
  bucket: 'week',     // 'week' | 'month'
  includeSubtasks: true,
  includeArchived: false,
  assigneeId: null,
};

// ── small helpers ────────────────────────────────────────────────────────────

function toDate(val) {
  if (!val) return null;
  const d = typeof val === 'string' ? parseISO(val) : new Date(val);
  return isValid(d) ? d : null;
}

function dayKey(d) {
  return format(d, 'yyyy-MM-dd');
}

function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function round(n, places = 0) {
  if (!Number.isFinite(n)) return 0;
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

function assigneesOf(task) {
  const raw = Array.isArray(task?.assignees) ? task.assignees : [];
  // getProject returns Member[]; the tasks API returns TaskAssignee[] with a
  // nested `member`. Accept either.
  return raw.map(a => (a && a.member ? a.member : a)).filter(Boolean);
}

function memberLabel(member) {
  return member.displayName || member.name || 'Member';
}

function isOpen(task) {
  return task.status !== 'DONE';
}

function minutesLogged(task, from, to) {
  const logs = Array.isArray(task?.timeLogs) ? task.timeLogs : [];
  return logs.reduce((sum, l) => {
    const at = toDate(l.loggedAt ?? l.createdAt);
    if (!at) return sum;
    if (from && at < from) return sum;
    if (to && at > to) return sum;
    return sum + (Number(l.minutes) || 0);
  }, 0);
}

// ── 1. flatten ───────────────────────────────────────────────────────────────

/**
 * A subtask counts as a FULL task — no weighting. Reports that treated subtasks
 * as invisible under-reported every project that used them.
 */
export function flattenTasks(tasks, includeSubtasks = true) {
  const list = Array.isArray(tasks) ? tasks : [];
  return list
    .flatMap(t => (includeSubtasks ? [t, ...(Array.isArray(t?.subtasks) ? t.subtasks : [])] : [t]))
    .filter(Boolean);
}

// ── 2. filter ────────────────────────────────────────────────────────────────

/**
 * Archive + assignee filtering only. The date range deliberately does NOT drop
 * tasks here: burndown and cumulative flow need tasks created before the window
 * in order to draw the window at all.
 */
export function filterTasks(tasks, options = {}) {
  const { includeArchived = false, assigneeId = null } = options;
  const list = Array.isArray(tasks) ? tasks : [];
  return list.filter(t => {
    if (!includeArchived && t.archivedAt) return false;
    if (assigneeId && !assigneesOf(t).some(m => m.id === assigneeId)) return false;
    return true;
  });
}

// ── 3. buckets ───────────────────────────────────────────────────────────────

/**
 * Buckets are keyed on the bucket START DATE, never on an (ISO week, ISO week
 * year) pair. Keying on the start date removes the whole ISO-week-year boundary
 * bug class: Dec 29 2025 and Jan 2 2026 are the same ISO week and produce the
 * same key without anyone having to reason about year rollovers.
 *
 * Every bucket in the range is generated up front, so a quiet week renders as a
 * zero bar instead of vanishing from the axis.
 */
export function buildBuckets(start, end, bucket = 'week') {
  const from = toDate(start);
  const to = toDate(end);
  if (!from || !to || to < from) return [];

  const isMonth = bucket === 'month';
  const floor = isMonth ? startOfMonth : startOfISOWeek;
  const advance = isMonth ? addMonths : addWeeks;

  const buckets = [];
  let cursor = floor(from);
  const last = floor(to);
  // Hard stop: a nonsense range must not produce an unbounded loop.
  let guard = 0;
  while (cursor <= last && guard < 1000) {
    const next = advance(cursor, 1);
    buckets.push({
      key: dayKey(cursor),
      start: cursor,
      end: next,
      label: isMonth ? format(cursor, 'MMM yyyy') : format(cursor, 'MMM d'),
      index: buckets.length,
    });
    cursor = next;
    guard += 1;
  }
  return buckets;
}

// ── window ───────────────────────────────────────────────────────────────────

function resolveWindow(tasks, range, now) {
  const today = startOfDay(now);
  if (range && range > 0) {
    return { windowStart: addDays(today, -(range - 1)), windowEnd: today, lengthDays: range };
  }
  const created = tasks.map(t => toDate(t.createdAt)).filter(Boolean).sort((a, b) => a - b);
  const earliest = created.length ? startOfDay(created[0]) : addDays(today, -29);
  const start = earliest > today ? addDays(today, -29) : earliest;
  return {
    windowStart: start,
    windowEnd: today,
    lengthDays: differenceInCalendarDays(today, start) + 1,
  };
}

function eachDay(start, end) {
  const days = [];
  let cursor = startOfDay(start);
  const last = startOfDay(end);
  let guard = 0;
  while (cursor <= last && guard < 2000) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
    guard += 1;
  }
  return days;
}

// ── 4. KPIs ──────────────────────────────────────────────────────────────────

function snapshotAt(tasks, date) {
  let total = 0;
  let done = 0;
  tasks.forEach(t => {
    const created = toDate(t.createdAt);
    if (created && created > date) return;
    total += 1;
    const completed = toDate(t.completedAt);
    if (completed && completed <= date) done += 1;
  });
  return { total, done };
}

function completedBetween(tasks, from, to) {
  return tasks.filter(t => {
    const c = toDate(t.completedAt);
    return !!c && c >= from && c <= to;
  });
}

/** Mean days from createdAt to completedAt. `null` — never NaN — when nothing qualifies. */
function meanCycleDays(completedTasks) {
  const spans = completedTasks
    .map(t => {
      const created = toDate(t.createdAt);
      const completed = toDate(t.completedAt);
      if (!created || !completed) return null;
      return Math.max(0, (completed - created) / 86400000);
    })
    .filter(n => n !== null);
  if (!spans.length) return null;
  return spans.reduce((a, b) => a + b, 0) / spans.length;
}

function overdueAsOf(tasks, date) {
  return tasks.filter(t => {
    const created = toDate(t.createdAt);
    if (created && created > date) return false;
    const completed = toDate(t.completedAt);
    if (completed && completed <= date) return false;
    const due = toDate(t.dueDate);
    return !!due && due < date;
  });
}

function activeBlockerIds(tasks, asOf) {
  const ids = new Set();
  tasks.forEach(t => {
    (Array.isArray(t.blockers) ? t.blockers : []).forEach(tb => {
      const b = tb?.blocker ?? tb;
      if (!b || !b.id) return;
      const resolved = toDate(b.resolvedAt);
      if (asOf) {
        const created = toDate(b.createdAt);
        if (created && created > asOf) return;
        if (resolved && resolved <= asOf) return;
      } else if (resolved) {
        return;
      }
      ids.add(b.id);
    });
  });
  return ids;
}

const kpi = (value, delta) => ({ value, delta });

/**
 * Every KPI is `{ value, delta }`; `delta` compares the current window against
 * the immediately preceding window of equal length, and is `null` when there is
 * no prior window's worth of data to compare against.
 */
export function computeKpis(tasks, { now = new Date(), windowStart, windowEnd, lengthDays } = {}) {
  const today = startOfDay(now);
  const start = toDate(windowStart) || addDays(today, -29);
  const end = toDate(windowEnd) || today;
  const len = lengthDays || differenceInCalendarDays(end, start) + 1;
  const prevStart = addDays(start, -len);
  const prevEnd = addDays(start, -1);

  const hasPrior = tasks.some(t => {
    const c = toDate(t.createdAt);
    return !!c && c < start;
  });

  const total = tasks.length;
  const doneNow = tasks.filter(t => t.status === 'DONE').length;
  const completionPct = total ? round((doneNow / total) * 100) : 0;
  const prevSnap = snapshotAt(tasks, prevEnd);
  const prevPct = prevSnap.total ? round((prevSnap.done / prevSnap.total) * 100) : null;

  const doneThis = completedBetween(tasks, start, end);
  const donePrev = completedBetween(tasks, prevStart, prevEnd);

  const cycleThis = meanCycleDays(doneThis);
  const cyclePrev = meanCycleDays(donePrev);

  const overdueNow = tasks.filter(t => {
    if (!isOpen(t)) return false;
    const due = toDate(t.dueDate);
    return !!due && due < now;
  });
  const overduePrev = overdueAsOf(tasks, prevEnd);

  const hoursThis = tasks.reduce((s, t) => s + minutesLogged(t, start, end), 0) / 60;
  const hoursPrev = tasks.reduce((s, t) => s + minutesLogged(t, prevStart, prevEnd), 0) / 60;

  const blockersNow = activeBlockerIds(tasks).size;
  const blockersPrev = activeBlockerIds(tasks, prevEnd).size;

  return {
    completionPct: kpi(
      completionPct,
      hasPrior && prevPct !== null ? round(completionPct - prevPct) : null
    ),
    doneThisPeriod: kpi(doneThis.length, hasPrior ? doneThis.length - donePrev.length : null),
    avgCycleDays: kpi(
      cycleThis === null ? 0 : round(cycleThis, 1),
      cycleThis !== null && cyclePrev !== null ? round(cycleThis - cyclePrev, 1) : null
    ),
    overdue: kpi(overdueNow.length, hasPrior ? overdueNow.length - overduePrev.length : null),
    hoursLogged: kpi(round(hoursThis, 1), hasPrior ? round(hoursThis - hoursPrev, 1) : null),
    activeBlockers: kpi(blockersNow, hasPrior ? blockersNow - blockersPrev : null),
  };
}

// ── 5. burndown ──────────────────────────────────────────────────────────────

function resolveIdealSpan(project, tasks, { today }) {
  const start = toDate(project?.startDate);
  const target = toDate(project?.targetDate);
  if (start && target && target > start) {
    return { idealStart: startOfDay(start), idealEnd: startOfDay(target) };
  }

  const created = tasks.map(t => toDate(t.createdAt)).filter(Boolean).sort((a, b) => a - b);
  const firstTask = created.length ? startOfDay(created[0]) : null;

  const milestoneDates = (Array.isArray(project?.milestones) ? project.milestones : [])
    .map(m => toDate(m.dueDate))
    .filter(Boolean)
    .sort((a, b) => b - a);
  const lastMilestone = milestoneDates.length ? startOfDay(milestoneDates[0]) : null;

  const idealStart = start ? startOfDay(start) : (firstTask || addDays(today, -29));
  let idealEnd = target ? startOfDay(target) : lastMilestone;
  if (!idealEnd || idealEnd <= idealStart) idealEnd = addDays(today, 30);
  if (idealEnd <= idealStart) idealEnd = addDays(idealStart, 30);
  return { idealStart, idealEnd };
}

/**
 * The ideal line is anchored to the project's real schedule
 * (`startDate` → `targetDate`), falling back in order to first task `createdAt`
 * → latest milestone `dueDate` → today + 30d. The previous implementation drew
 * a fixed 30-day linear ramp regardless of the project; that is the bug this
 * fixes.
 *
 * `actual` is null for days in the future; `projected` is null for days in the
 * past, so the two hand off cleanly at today.
 */
export function computeBurndown(tasks, { project, now = new Date(), windowStart, windowEnd } = {}) {
  const today = startOfDay(now);
  const start = toDate(windowStart) || addDays(today, -29);
  const end = toDate(windowEnd) || today;
  const { idealStart, idealEnd } = resolveIdealSpan(project, tasks, { today });

  const seriesEnd = idealEnd > end ? idealEnd : end;
  const days = eachDay(start, seriesEnd);
  const total = tasks.length;
  const span = Math.max(1, differenceInCalendarDays(idealEnd, idealStart));

  // Projection rate: completions per day over the trailing 14 days.
  const recent = completedBetween(tasks, addDays(today, -13), today).length;
  const rate = recent / 14;

  const remainingOn = day =>
    tasks.filter(t => {
      const created = toDate(t.createdAt);
      if (created && startOfDay(created) > day) return false;
      const completed = toDate(t.completedAt);
      if (completed && startOfDay(completed) <= day) return false;
      return true;
    }).length;

  const remainingToday = remainingOn(today);

  return days.map(day => {
    const elapsed = differenceInCalendarDays(day, idealStart);
    const ideal = round(Math.min(total, Math.max(0, total * (1 - elapsed / span))));
    const ahead = differenceInCalendarDays(day, today);

    return {
      date: dayKey(day),
      label: format(day, 'MMM d'),
      actual: ahead > 0 ? null : remainingOn(day),
      ideal,
      projected: ahead < 0 ? null : round(Math.max(0, remainingToday - rate * ahead), 1),
    };
  });
}

// ── 6. cumulative flow ───────────────────────────────────────────────────────

/**
 * DELIBERATE APPROXIMATION: true historical status transitions live in
 * `ActivityLog`, which this hook does not fetch. Each day is therefore
 * reconstructed from `createdAt` / `completedAt` only — a task counts as DONE
 * from its `completedAt` onward, and every non-DONE task is attributed to its
 * CURRENT status for the whole window. The DONE band is exact; the
 * TODO / IN_PROGRESS / BLOCKED split is a present-tense snapshot projected
 * backwards. Fetching ActivityLog transitions is the upgrade path.
 */
export function computeCumulativeFlow(tasks, { now = new Date(), windowStart, windowEnd } = {}) {
  const today = startOfDay(now);
  const start = toDate(windowStart) || addDays(today, -29);
  const end = toDate(windowEnd) || today;

  return eachDay(start, end).map(day => {
    const row = {
      date: dayKey(day),
      label: format(day, 'MMM d'),
      TODO: 0,
      IN_PROGRESS: 0,
      BLOCKED: 0,
      DONE: 0,
    };
    tasks.forEach(t => {
      const created = toDate(t.createdAt);
      if (created && startOfDay(created) > day) return;
      const completed = toDate(t.completedAt);
      if (completed && startOfDay(completed) <= day) {
        row.DONE += 1;
        return;
      }
      // Not yet complete on this day. A task marked DONE with no usable
      // completedAt cannot be placed in time, so it falls back to TODO.
      const status = STATUS_KEYS.includes(t.status) && t.status !== 'DONE' ? t.status : 'TODO';
      row[status] += 1;
    });
    return row;
  });
}

// ── 7. velocity ──────────────────────────────────────────────────────────────

export function computeVelocity(tasks, buckets = []) {
  const rows = buckets.map(b => {
    const completed = tasks.filter(t => {
      const c = toDate(t.completedAt);
      return !!c && c >= b.start && c < b.end;
    });
    return {
      label: b.label,
      start: b.key,
      count: completed.length,
      points: completed.reduce((s, t) => s + (Number(t.storyPoints) || 0), 0),
      hours: round(tasks.reduce((s, t) => s + minutesLogged(t, b.start, b.end), 0) / 60, 1),
      rolling: 0,
    };
  });

  // 3-bucket trailing mean, inclusive of the current bucket.
  rows.forEach((row, i) => {
    const window = rows.slice(Math.max(0, i - 2), i + 1);
    row.rolling = round(window.reduce((s, r) => s + r.count, 0) / window.length, 2);
  });

  return rows;
}

// ── 8. throughput ────────────────────────────────────────────────────────────

export function computeThroughput(tasks, buckets = []) {
  return buckets.map(b => {
    const inBucket = (task, field) => {
      const d = toDate(task[field]);
      return !!d && d >= b.start && d < b.end;
    };
    const created = tasks.filter(t => inBucket(t, 'createdAt')).length;
    const completed = tasks.filter(t => inBucket(t, 'completedAt')).length;
    return { label: b.label, start: b.key, created, completed, net: created - completed };
  });
}

// ── 9. breakdowns ────────────────────────────────────────────────────────────

export function computeBreakdowns(tasks) {
  const statusOf = t => (STATUS_KEYS.includes(t.status) ? t.status : 'TODO');
  const priorityOf = t => (PRIORITY_KEYS.includes(t.priority) ? t.priority : 'MEDIUM');

  const statusBreakdown = STATUS_META.map(s => ({
    key: s.key,
    label: s.label,
    color: s.color,
    value: tasks.filter(t => statusOf(t) === s.key).length,
  }));

  const priorityBreakdown = PRIORITY_META.map(p => ({
    key: p.key,
    label: p.label,
    color: p.color,
    value: tasks.filter(t => priorityOf(t) === p.key).length,
  }));

  const byAssignee = new Map();
  const bump = (key, label) => {
    const row = byAssignee.get(key) || { key, label, value: 0 };
    row.value += 1;
    byAssignee.set(key, row);
  };
  tasks.forEach(t => {
    const members = assigneesOf(t);
    if (!members.length) bump('__unassigned__', 'Unassigned');
    else members.forEach(m => bump(m.id, memberLabel(m)));
  });

  const assigneeBreakdown = Array.from(byAssignee.values())
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    .map((row, i) => ({ ...row, color: CATEGORICAL_COLORS[i % CATEGORICAL_COLORS.length] }));

  return { statusBreakdown, priorityBreakdown, assigneeBreakdown };
}

// ── 10. workload ─────────────────────────────────────────────────────────────

/** Work per assignee, with a synthetic "Unassigned" row. Sorted by open work. */
export function computeWorkload(tasks) {
  const rows = new Map();

  tasks.forEach(t => {
    const status = STATUS_KEYS.includes(t.status) ? t.status : 'TODO';
    const members = assigneesOf(t);
    const targets = members.length
      ? members.map(m => [m.id, memberLabel(m)])
      : [['__unassigned__', 'Unassigned']];

    targets.forEach(([id, label]) => {
      const row = rows.get(id) || {
        memberId: id, member: label, TODO: 0, IN_PROGRESS: 0, BLOCKED: 0, DONE: 0, total: 0,
      };
      row[status] += 1;
      row.total += 1;
      rows.set(id, row);
    });
  });

  return Array.from(rows.values()).sort((a, b) => {
    const openA = a.TODO + a.IN_PROGRESS + a.BLOCKED;
    const openB = b.TODO + b.IN_PROGRESS + b.BLOCKED;
    return openB - openA || b.total - a.total || a.member.localeCompare(b.member);
  });
}

// ── 11. aging ────────────────────────────────────────────────────────────────

/** Open tasks by age × priority. All four buckets are always present. */
export function computeAging(tasks, { now = new Date() } = {}) {
  const rows = AGING_BUCKETS.map(b => ({
    bucket: b.key, LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0, total: 0,
  }));

  tasks.filter(isOpen).forEach(t => {
    const created = toDate(t.createdAt);
    const ageDays = created ? Math.max(0, differenceInCalendarDays(now, created)) : 0;
    const idx = AGING_BUCKETS.findIndex(b => ageDays < b.maxDays);
    const row = rows[idx === -1 ? rows.length - 1 : idx];
    row[PRIORITY_KEYS.includes(t.priority) ? t.priority : 'MEDIUM'] += 1;
    row.total += 1;
  });

  return rows;
}

// ── 12. risk ─────────────────────────────────────────────────────────────────

function severityFor(contribution) {
  if (contribution <= 0) return 'none';
  if (contribution < 0.25) return 'low';
  if (contribution < 0.5) return 'medium';
  if (contribution < 0.75) return 'high';
  return 'critical';
}

export function bandFor(score) {
  if (score < 25) return 'healthy';
  if (score < 50) return 'watch';
  if (score < 75) return 'at-risk';
  return 'critical';
}

/**
 * Seven weighted factors, each producing a normalized 0..1 contribution:
 * score = round(100 * Σ(contribution × weight) / Σ weight) — 0 is clean, 100 is
 * maximally at risk. Every factor is returned even when it contributes 0 (the
 * card greys it rather than hiding it, so the height is stable and the reader
 * can see what *was* checked), and each carries its offending task list.
 */
export function computeRisk(tasks, { now = new Date(), velocity = [] } = {}) {
  const open = tasks.filter(isOpen);
  const openCount = open.length;
  const share = list => (openCount ? list.length / openCount : 0);

  const blocked = open.filter(t => t.status === 'BLOCKED');

  const overdue = open.filter(t => {
    const due = toDate(t.dueDate);
    return !!due && due < now;
  });

  const aging = open.filter(t => {
    const created = toDate(t.createdAt);
    return !!created && differenceInCalendarDays(now, created) > 30;
  });

  const inProgress = open.filter(t => t.status === 'IN_PROGRESS');
  const stale = inProgress.filter(t => {
    const touched = toDate(t.updatedAt) || toDate(t.createdAt);
    return !!touched && differenceInCalendarDays(now, touched) > 14;
  });

  const unassigned = open.filter(t => assigneesOf(t).length === 0);

  const dependent = open.filter(t =>
    (Array.isArray(t.blockedBy) ? t.blockedBy : []).some(d => {
      const blocking = d?.blockingTask ?? d;
      return !!blocking && !!blocking.status && blocking.status !== 'DONE';
    })
  );

  // Velocity trend: how far the latest bucket has fallen below the trailing
  // mean it inherited. A flat or rising trend contributes nothing.
  let velocityContribution = 0;
  if (velocity.length >= 2) {
    const latest = velocity[velocity.length - 1];
    const baseline = velocity[velocity.length - 2].rolling;
    if (baseline > 0) velocityContribution = clamp01((baseline - latest.count) / baseline);
  }

  const raw = {
    blocked: { contribution: clamp01(share(blocked)), tasks: blocked },
    overdue: { contribution: clamp01(share(overdue)), tasks: overdue },
    aging: { contribution: clamp01(share(aging)), tasks: aging },
    stale: {
      contribution: inProgress.length ? clamp01(stale.length / inProgress.length) : 0,
      tasks: stale,
    },
    unassigned: { contribution: clamp01(share(unassigned)), tasks: unassigned },
    dependencies: { contribution: clamp01(share(dependent)), tasks: dependent },
    velocityTrend: { contribution: velocityContribution, tasks: [] },
  };

  const factors = RISK_FACTORS.map(f => ({
    id: f.id,
    label: f.label,
    weight: f.weight,
    contribution: round(raw[f.id].contribution, 4),
    severity: severityFor(raw[f.id].contribution),
    tasks: raw[f.id].tasks,
  }));

  const weighted = factors.reduce((s, f) => s + f.contribution * f.weight, 0);
  const score = round((100 * weighted) / RISK_WEIGHT_TOTAL);

  return { score, band: bandFor(score), factors };
}

// ── composition ──────────────────────────────────────────────────────────────

/**
 * The whole derivation, without React — the hook is a `useMemo` around this and
 * the tests call it directly. `options.now` exists so results are deterministic
 * under test; production callers omit it.
 */
export function computeAnalytics(project, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const now = toDate(opts.now) || new Date();

  const tasks = filterTasks(flattenTasks(project?.tasks, opts.includeSubtasks), opts);
  const { windowStart, windowEnd, lengthDays } = resolveWindow(tasks, opts.range, now);
  const buckets = buildBuckets(windowStart, windowEnd, opts.bucket);

  const velocity = computeVelocity(tasks, buckets);
  const { statusBreakdown, priorityBreakdown, assigneeBreakdown } = computeBreakdowns(tasks);

  return {
    tasks,
    kpis: computeKpis(tasks, { now, windowStart, windowEnd, lengthDays }),
    burndown: computeBurndown(tasks, { project, now, windowStart, windowEnd }),
    cumulativeFlow: computeCumulativeFlow(tasks, { now, windowStart, windowEnd }),
    velocity,
    throughput: computeThroughput(tasks, buckets),
    statusBreakdown,
    priorityBreakdown,
    assigneeBreakdown,
    workload: computeWorkload(tasks),
    aging: computeAging(tasks, { now }),
    risk: computeRisk(tasks, { now, velocity }),
  };
}

export default function useAnalyticsData(project, options = {}) {
  const {
    range = DEFAULT_OPTIONS.range,
    bucket = DEFAULT_OPTIONS.bucket,
    includeSubtasks = DEFAULT_OPTIONS.includeSubtasks,
    includeArchived = DEFAULT_OPTIONS.includeArchived,
    assigneeId = DEFAULT_OPTIONS.assigneeId,
    now,
  } = options;

  return useMemo(
    () => computeAnalytics(project, {
      range, bucket, includeSubtasks, includeArchived, assigneeId, now,
    }),
    [project, range, bucket, includeSubtasks, includeArchived, assigneeId, now]
  );
}
