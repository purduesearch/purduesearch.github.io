// Pure recommendation core: project state in, staged recommendation drafts out.
// No I/O, no Prisma, no AI. Phase 8 loads data, permission-filters and stores drafts.
// Task titles and member names are member-authored: they may be READ for scoring
// but are never copied into rationale, action params or evidence.
import type { ActionPlanAction } from "./aiActionService.js";
import { openHoursFor } from "./projectInsightsCore.js";

export type RuleId =
  | "UNASSIGNED_DUE_SOON" | "OVERLOADED_MEMBER" | "STALE_IN_PROGRESS" | "BLOCKED_WITHOUT_CAUSE"
  | "OVERDUE_NO_OWNER_ACTIVITY" | "MILESTONE_EMPTY" | "MILESTONE_UNASSIGNED_WORK";
export type Severity = "high" | "medium" | "low";

export interface RecTask {
  id: string; title: string;
  status: "TODO" | "IN_PROGRESS" | "BLOCKED" | "DONE";
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  assigneeIds: string[];
  dueDate: Date | null; daysSinceUpdate: number;
  storyPoints: number | null; estimatedHours: number | null;
  blockedByOpenDependencies: boolean; activeCategoryBlockerCount: number;
  milestoneId: string | null;
}
export interface RecMilestone { id: string; title: string; dueDate: Date | null; status: string; taskIds: string[] }
export interface RecMember { id: string; displayName: string; isBot: boolean; recentMinutes: number; skillNames: string[] }
export interface RecInput {
  tasks: RecTask[]; milestones: RecMilestone[]; roster: RecMember[]; now: Date;
  dismissedKeys: ReadonlySet<string> | string[];
}

export interface Recommendation {
  key: string; rule: RuleId; severity: Severity;
  actions: ActionPlanAction[]; findingCode: string;
  evidence: Record<string, number | string | null>;
  taskIds: string[];
}

export interface CandidateReasons { openHours: number; openTasks: number; overdue: number; recentHours: number; skillMatch: boolean }
export interface Candidate { memberId: string; score: number; reasons: CandidateReasons }

export interface MemberStats { openHours: number; openTasks: number; overdue: number }
export interface RecContext { stats: Map<string, MemberStats>; medianOpenHours: number; overloaded: Set<string> }

/** Every threshold used by the rules. Tests and docs cite these. */
export const RULE_DEFAULTS = {
  UNASSIGNED_DUE_SOON: { dueWithinDays: 7, severityOverdueOrHighPriority: "high", severityOtherwise: "medium" },
  OVERLOADED_MEMBER: { hoursMultipleOfMedian: 1.5, minOpenTasks: 3, minOverdueTasks: 3, severity: "medium" },
  STALE_IN_PROGRESS: { minDaysSinceUpdate: 14, severity: "low" },
  BLOCKED_WITHOUT_CAUSE: { severity: "medium" },
  OVERDUE_NO_OWNER_ACTIVITY: { minDaysOverdue: 7, minDaysSinceUpdate: 7, severity: "high" },
  MILESTONE_EMPTY: { dueWithinDays: 21, includesOverdue: true, severity: "medium" },
  MILESTONE_UNASSIGNED_WORK: { dueWithinDays: 14, includesOverdue: true, severity: "medium" },
  CANDIDATE: {
    overdueWeight: 4, recentHoursCap: 10, skillBonus: 3, minTokenLength: 3,
  },
  /** Closed milestones (MilestoneStatus COMPLETED or CANCELLED; DONE kept for safety) never trigger milestone rules. */
  COMPLETED_MILESTONE_STATUSES: ["COMPLETED", "CANCELLED", "DONE"],
} as const;

const DAY_MS = 86_400_000;
const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
const PRIORITY_RANK: Record<RecTask["priority"], number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

const isOpen = (t: RecTask) => t.status !== "DONE";
const isOverdue = (t: RecTask, now: Date) => isOpen(t) && !!t.dueDate && t.dueDate.getTime() < now.getTime();
const round1 = (n: number) => Math.round(n * 10) / 10;
const iso = (d: Date | null) => (d ? d.toISOString() : null);

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function tokens(text: string, minLen: number): Set<string> {
  return new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length >= minLen));
}

export function buildContext(input: RecInput): RecContext {
  const stats = new Map<string, MemberStats>();
  for (const m of input.roster) stats.set(m.id, { openHours: 0, openTasks: 0, overdue: 0 });
  for (const t of input.tasks) {
    if (!isOpen(t)) continue;
    const hours = openHoursFor(t);
    const od = isOverdue(t, input.now);
    for (const id of new Set(t.assigneeIds)) {
      const s = stats.get(id);
      if (!s) continue;
      s.openHours += hours; s.openTasks += 1; if (od) s.overdue += 1;
    }
  }
  const humans = input.roster.filter(m => !m.isBot);
  const med = median(humans.map(m => stats.get(m.id)!.openHours));
  const overloaded = new Set<string>();
  const D = RULE_DEFAULTS.OVERLOADED_MEMBER;
  for (const m of humans) {
    const s = stats.get(m.id)!;
    if ((s.openHours >= D.hoursMultipleOfMedian * med && s.openTasks >= D.minOpenTasks) || s.overdue >= D.minOverdueTasks) {
      overloaded.add(m.id);
    }
  }
  return { stats, medianOpenHours: med, overloaded };
}

export function rankCandidates(task: RecTask, input: RecInput, ctx: RecContext = buildContext(input)): Candidate[] {
  const C = RULE_DEFAULTS.CANDIDATE;
  const current = new Set(task.assigneeIds);
  const titleTokens = tokens(task.title, C.minTokenLength);
  const out: Candidate[] = [];
  const names = new Map<string, string>();
  for (const m of input.roster) {
    if (m.isBot || current.has(m.id) || ctx.overloaded.has(m.id)) continue;
    const s = ctx.stats.get(m.id) ?? { openHours: 0, openTasks: 0, overdue: 0 };
    let skillMatch = false;
    for (const sk of m.skillNames) {
      for (const tok of tokens(sk, C.minTokenLength)) if (titleTokens.has(tok)) { skillMatch = true; break; }
      if (skillMatch) break;
    }
    const recentHours = m.recentMinutes / 60;
    const score = -s.openHours - C.overdueWeight * s.overdue + Math.min(recentHours, C.recentHoursCap) + (skillMatch ? C.skillBonus : 0);
    names.set(m.id, m.displayName);
    out.push({ memberId: m.id, score, reasons: { openHours: round1(s.openHours), openTasks: s.openTasks, overdue: s.overdue, recentHours: round1(recentHours), skillMatch } });
  }
  out.sort((a, b) =>
    b.score - a.score ||
    a.reasons.openTasks - b.reasons.openTasks ||
    names.get(a.memberId)!.localeCompare(names.get(b.memberId)!) ||
    (a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0));
  return out;
}

interface Entry { rec: Recommendation; due: Date | null }

export function buildRecommendations(input: RecInput): Recommendation[] {
  const { now } = input;
  const dismissed = input.dismissedKeys instanceof Set ? input.dismissedKeys : new Set(input.dismissedKeys);
  const ctx = buildContext(input);
  const entries: Entry[] = [];
  const nowMs = now.getTime();
  const push = (rec: Recommendation, due: Date | null) => { if (!dismissed.has(rec.key)) entries.push({ rec, due }); };
  const taskById = new Map(input.tasks.map(t => [t.id, t]));

  for (const t of input.tasks) {
    if (isOpen(t) && t.assigneeIds.length === 0 && t.dueDate) {
      const D = RULE_DEFAULTS.UNASSIGNED_DUE_SOON;
      const untilMs = t.dueDate.getTime() - nowMs;
      if (untilMs <= D.dueWithinDays * DAY_MS) {
        const cand = rankCandidates(t, input, ctx)[0];
        const overdue = untilMs < 0;
        const days = Math.floor(untilMs / DAY_MS);
        const actions: ActionPlanAction[] = cand ? [{
          type: "ASSIGN", targetTaskId: t.id, params: { assigneeIds: [cand.memberId] },
          rationale: `Unassigned and ${overdue ? `overdue by ${-days} days` : `due in ${days} days`}; candidate has ${cand.reasons.openHours.toFixed(1)} open hours.`,
        }] : [];
        push({
          key: `UNASSIGNED_DUE_SOON:${t.id}`, rule: "UNASSIGNED_DUE_SOON",
          severity: overdue || t.priority === "HIGH" || t.priority === "CRITICAL" ? D.severityOverdueOrHighPriority : D.severityOtherwise,
          actions, findingCode: "UNASSIGNED_DUE_SOON",
          evidence: { taskId: t.id, dueDate: iso(t.dueDate), daysUntilDue: days, priority: t.priority, candidateId: cand ? cand.memberId : null },
          taskIds: [t.id],
        }, t.dueDate);
      }
    }
    if (t.status === "IN_PROGRESS" && t.daysSinceUpdate >= RULE_DEFAULTS.STALE_IN_PROGRESS.minDaysSinceUpdate) {
      const n = t.daysSinceUpdate;
      push({
        key: `STALE_IN_PROGRESS:${t.id}`, rule: "STALE_IN_PROGRESS", severity: RULE_DEFAULTS.STALE_IN_PROGRESS.severity,
        actions: [{
          type: "ADD_COMMENT", targetTaskId: t.id,
          params: { content: `Status check: this task has had no updates for ${n} days. Is it still on track?` },
          rationale: `In progress with no updates for ${n} days.`,
        }],
        findingCode: "STALE_IN_PROGRESS",
        evidence: { taskId: t.id, daysSinceUpdate: n }, taskIds: [t.id],
      }, t.dueDate);
    }
    if (t.status === "BLOCKED" && !t.blockedByOpenDependencies && t.activeCategoryBlockerCount === 0) {
      push({
        key: `BLOCKED_WITHOUT_CAUSE:${t.id}`, rule: "BLOCKED_WITHOUT_CAUSE", severity: RULE_DEFAULTS.BLOCKED_WITHOUT_CAUSE.severity,
        actions: [{
          type: "SET_STATUS", targetTaskId: t.id, params: { status: "TODO" },
          rationale: "Marked blocked but has no open dependencies and no active blockers.",
        }],
        findingCode: "BLOCKED_WITHOUT_CAUSE",
        evidence: { taskId: t.id, openDependencies: 0, activeBlockers: 0 }, taskIds: [t.id],
      }, t.dueDate);
    }
    if (isOverdue(t, now) && t.assigneeIds.length > 0) {
      const D = RULE_DEFAULTS.OVERDUE_NO_OWNER_ACTIVITY;
      const daysOverdue = Math.floor((nowMs - t.dueDate!.getTime()) / DAY_MS);
      if (daysOverdue >= D.minDaysOverdue && t.daysSinceUpdate >= D.minDaysSinceUpdate) {
        push({
          key: `OVERDUE_NO_OWNER_ACTIVITY:${t.id}`, rule: "OVERDUE_NO_OWNER_ACTIVITY", severity: D.severity,
          actions: [], findingCode: "OVERDUE_NO_OWNER_ACTIVITY",
          evidence: { taskId: t.id, daysOverdue, daysSinceUpdate: t.daysSinceUpdate, assigneeCount: t.assigneeIds.length },
          taskIds: [t.id],
        }, t.dueDate);
      }
    }
  }

  // Overloaded members (one recommendation each).
  const OV = RULE_DEFAULTS.OVERLOADED_MEMBER;
  for (const m of input.roster) {
    if (!ctx.overloaded.has(m.id)) continue;
    const s = ctx.stats.get(m.id)!;
    const todo = input.tasks.filter(t => t.status === "TODO" && t.assigneeIds.includes(m.id));
    todo.sort((a, b) =>
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      (b.dueDate ? b.dueDate.getTime() : Infinity) - (a.dueDate ? a.dueDate.getTime() : Infinity) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const pick = todo[0];
    const cand = pick ? rankCandidates(pick, input, ctx)[0] : undefined;
    const actions: ActionPlanAction[] = [];
    if (pick && cand) {
      actions.push({
        type: "ASSIGN", targetTaskId: pick.id,
        params: { assigneeIds: [...new Set([...pick.assigneeIds.filter(id => id !== m.id), cand.memberId])] },
        rationale: `Member has ${s.openHours.toFixed(1)} open hours across ${s.openTasks} tasks (${s.overdue} overdue; roster median ${ctx.medianOpenHours.toFixed(1)}); candidate has ${cand.reasons.openHours.toFixed(1)} open hours.`,
      });
    }
    push({
      key: `OVERLOADED_MEMBER:${m.id}`, rule: "OVERLOADED_MEMBER", severity: OV.severity,
      actions, findingCode: "OVERLOADED_MEMBER",
      evidence: {
        memberId: m.id, openHours: round1(s.openHours), openTasks: s.openTasks, overdueTasks: s.overdue,
        medianOpenHours: round1(ctx.medianOpenHours), taskId: pick ? pick.id : null, candidateId: cand ? cand.memberId : null,
      },
      taskIds: pick ? [pick.id] : [],
    }, pick ? pick.dueDate : null);
  }

  // Milestones.
  const completed: readonly string[] = RULE_DEFAULTS.COMPLETED_MILESTONE_STATUSES;
  for (const ms of input.milestones) {
    if (!ms.dueDate || completed.includes(ms.status.toUpperCase())) continue;
    const untilMs = ms.dueDate.getTime() - nowMs;
    const days = Math.floor(untilMs / DAY_MS);
    if (ms.taskIds.length === 0 && untilMs <= RULE_DEFAULTS.MILESTONE_EMPTY.dueWithinDays * DAY_MS) {
      push({
        key: `MILESTONE_EMPTY:${ms.id}`, rule: "MILESTONE_EMPTY", severity: RULE_DEFAULTS.MILESTONE_EMPTY.severity,
        actions: [], findingCode: "MILESTONE_EMPTY",
        evidence: { milestoneId: ms.id, dueDate: iso(ms.dueDate), daysUntilDue: days, taskCount: 0 }, taskIds: [],
      }, ms.dueDate);
    }
    if (untilMs <= RULE_DEFAULTS.MILESTONE_UNASSIGNED_WORK.dueWithinDays * DAY_MS) {
      const ids = [...new Set(ms.taskIds)].filter(id => {
        const t = taskById.get(id);
        return !!t && isOpen(t) && t.assigneeIds.length === 0;
      }).sort();
      if (ids.length > 0) {
        push({
          key: `MILESTONE_UNASSIGNED_WORK:${ms.id}`, rule: "MILESTONE_UNASSIGNED_WORK", severity: RULE_DEFAULTS.MILESTONE_UNASSIGNED_WORK.severity,
          actions: [], findingCode: "MILESTONE_UNASSIGNED_WORK",
          evidence: { milestoneId: ms.id, dueDate: iso(ms.dueDate), daysUntilDue: days, unassignedOpenTasks: ids.length }, taskIds: ids,
        }, ms.dueDate);
      }
    }
  }

  entries.sort((a, b) =>
    SEVERITY_RANK[a.rec.severity] - SEVERITY_RANK[b.rec.severity] ||
    (a.due ? a.due.getTime() : Infinity) - (b.due ? b.due.getTime() : Infinity) ||
    (a.rec.key < b.rec.key ? -1 : a.rec.key > b.rec.key ? 1 : 0));
  return entries.map(e => e.rec);
}
