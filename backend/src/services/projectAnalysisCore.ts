import type { ProjectContext } from "./projectContextService.js";

// Pure post-processing for the project-scoped AI reports (risk, sprint plan,
// capacity, Drive parsing). A model's JSON is advice, not data: every id it returns
// is checked against the one project's context, every number is clamped, and
// anything that does not resolve is dropped instead of reaching the UI or the DB.

const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const SEVERITIES = ["LOW", "MEDIUM", "HIGH"] as const;
const PRIORITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
const STORY_POINT_SCALE = [1, 2, 3, 5, 8];

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, max = 500): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const strOrNull = (v: unknown, max = 500): string | null => str(v, max) || null;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const clamp = (n: unknown, lo: number, hi: number, fallback: number): number => {
  const x = typeof n === "number" ? n : Number(n);
  return Number.isFinite(x) ? Math.min(hi, Math.max(lo, Math.round(x))) : fallback;
};
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === "string" && (allowed as readonly string[]).includes(v.toUpperCase()) ? (v.toUpperCase() as T) : fallback;

export function normalizeTitle(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function jaccard(a: string, b: string): number {
  const A = new Set(a.split(" ").filter(Boolean));
  const B = new Set(b.split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return shared / (A.size + B.size - shared);
}

/** Resolve a free-text name to a member of THIS project; ambiguous matches resolve to nothing. */
export function resolveMemberByName(context: ProjectContext, name: string | null | undefined): string | null {
  const n = normalizeTitle(name ?? "");
  if (!n) return null;
  const exact = context.members.filter((m) => normalizeTitle(m.displayName) === n);
  if (exact.length === 1) return exact[0].id;
  const partial = context.members.filter((m) => {
    const d = normalizeTitle(m.displayName);
    return d && (d.includes(n) || n.includes(d));
  });
  return partial.length === 1 ? partial[0].id : null;
}

// ── Risk ──────────────────────────────────────────────────────

export function normalizeRisk(raw: unknown, context: ProjectContext) {
  if (!isObj(raw)) return null;
  const byId = new Map(context.tasks.map((t) => [t.id, t.title]));
  const memberNames = new Set(context.members.map((m) => m.displayName));
  const risks = arr(raw.risks).filter(isObj).slice(0, 12).map((r) => {
    const affectedTaskIds = [...new Set(arr(r.affectedTaskIds).filter((id): id is string => typeof id === "string" && byId.has(id)))];
    // Older prompt shape returned titles; keep honouring titles that match a real task.
    const titleHits = arr(r.affectedTasks).filter((t): t is string => typeof t === "string")
      .filter((t) => [...byId.values()].includes(t));
    const owner = str(r.owner, 80);
    return {
      category: str(r.category, 60) || "General",
      description: str(r.description, 600),
      affectedTaskIds,
      affectedTasks: [...new Set([...affectedTaskIds.map((id) => byId.get(id)!), ...titleHits])],
      owner: memberNames.has(owner) ? owner : null,
      mitigation: strOrNull(r.mitigation, 400),
      severity: oneOf(r.severity, SEVERITIES, "MEDIUM"),
    };
  }).filter((r) => r.description);
  return {
    overallRisk: oneOf(raw.overallRisk, RISK_LEVELS, "MEDIUM"),
    riskScore: clamp(raw.riskScore, 0, 100, 50),
    risks,
    topRecommendation: str(raw.topRecommendation, 500),
  };
}

// ── Sprint plan ───────────────────────────────────────────────

/**
 * Capacity when the caller gave none: the project's own recent pace over the sprint,
 * falling back to a flat 40 only when there is no completed-points history at all.
 */
export function resolveSprintCapacity(
  context: ProjectContext, requested: number | undefined, sprintDays: number
): { capacityPoints: number; capacitySource: "requested" | "velocity" | "default" } {
  if (typeof requested === "number" && Number.isFinite(requested) && requested > 0) {
    return { capacityPoints: Math.round(requested), capacitySource: "requested" };
  }
  const fromVelocity = Math.round((context.velocity.pointsPerWeek * sprintDays) / 7);
  if (fromVelocity > 0) return { capacityPoints: fromVelocity, capacitySource: "velocity" };
  return { capacityPoints: 40, capacitySource: "default" };
}

export function normalizeSprintPlan(
  raw: unknown, context: ProjectContext,
  capacity: { capacityPoints: number; capacitySource: "requested" | "velocity" | "default" }
) {
  if (!isObj(raw)) return null;
  const open = new Map(context.tasks.filter((t) => t.status !== "DONE").map((t) => [t.id, t]));
  const memberIds = new Set(context.members.map((m) => m.id));
  const seen = new Set<string>();
  const sprintTasks: Array<{ taskId: string; title: string; reason: string; points: number | null; suggestedAssigneeId: string | null }> = [];
  for (const entry of arr(raw.sprintTasks).filter(isObj)) {
    const id = entry.taskId;
    if (typeof id !== "string" || !open.has(id) || seen.has(id)) continue;
    seen.add(id);
    const t = open.get(id)!;
    const suggested = typeof entry.suggestedAssigneeId === "string" && memberIds.has(entry.suggestedAssigneeId) && t.assignees.length === 0
      ? entry.suggestedAssigneeId : null;
    sprintTasks.push({ taskId: id, title: t.title, reason: str(entry.reason, 300), points: t.storyPoints, suggestedAssigneeId: suggested });
  }
  // The model's own sum is not trusted; recompute from the real estimates.
  const totalPoints = sprintTasks.reduce((sum, t) => sum + (t.points ?? 0), 0);
  const unestimated = sprintTasks.filter((t) => t.points == null).length;
  const risksInPlan = arr(raw.risksInPlan).filter((r): r is string => typeof r === "string" && !!r.trim()).map((r) => r.trim().slice(0, 300));
  if (totalPoints > capacity.capacityPoints * 1.1) {
    risksInPlan.push(`Selected work is ${totalPoints}pts against a capacity of ${capacity.capacityPoints}pts.`);
  }
  if (unestimated > 0) risksInPlan.push(`${unestimated} selected task${unestimated === 1 ? " has" : "s have"} no story points, so the total is a lower bound.`);
  return {
    sprintTasks,
    totalPoints,
    unestimatedCount: unestimated,
    capacityPoints: capacity.capacityPoints,
    capacitySource: capacity.capacitySource,
    focusTheme: str(raw.focusTheme, 300),
    risksInPlan,
  };
}

// ── Capacity ──────────────────────────────────────────────────

/** Real per-member numbers, so the UI never has to trust the model for them. */
export function memberWorkloadTable(context: ProjectContext) {
  return context.members.map((m) => ({
    memberId: m.id,
    name: m.displayName,
    openTasks: m.openTaskCount,
    highPriority: m.openHighPriorityCount,
    overdue: m.openOverdueCount,
    storyPoints: m.openStoryPoints,
    estimatedHours: m.openEstimatedHours,
    unestimatedTasks: m.openUnestimatedCount,
    completedLast14d: m.completedLast14d,
    loggedHoursLast14d: m.loggedHoursLast14d,
  }));
}

export function normalizeCapacity(raw: unknown, context: ProjectContext) {
  if (!isObj(raw)) return null;
  const memberByName = new Map(context.members.map((m) => [m.displayName, m]));
  const memberById = new Map(context.members.map((m) => [m.id, m]));
  const open = new Map(context.tasks.filter((t) => t.status !== "DONE").map((t) => [t.id, t]));

  const named = (list: unknown, field: "recommendation" | "suggestion") =>
    arr(list).filter(isObj)
      .filter((e) => typeof e.member === "string" && memberByName.has(e.member))
      .map((e) => ({ member: e.member as string, [field]: str(e[field], 400) })) as Array<{ member: string } & Record<string, string>>;

  const reassignments: Array<{ taskId: string; taskTitle: string; toMemberId: string; toMemberName: string; reason: string }> = [];
  const seenTasks = new Set<string>();
  for (const e of arr(raw.reassignments).filter(isObj)) {
    const t = typeof e.taskId === "string" ? open.get(e.taskId) : undefined;
    const to = typeof e.toMemberId === "string" ? memberById.get(e.toMemberId) : undefined;
    if (!t || !to || seenTasks.has(t.id) || t.assignees.includes(to.displayName)) continue;
    seenTasks.add(t.id);
    reassignments.push({ taskId: t.id, taskTitle: t.title, toMemberId: to.id, toMemberName: to.displayName, reason: str(e.reason, 300) });
  }

  return {
    overloaded: named(raw.overloaded, "recommendation") as Array<{ member: string; recommendation: string }>,
    underloaded: named(raw.underloaded, "suggestion") as Array<{ member: string; suggestion: string }>,
    reassignments,
    unassignedWork: strOrNull(raw.unassignedWork, 400),
    balanceScore: clamp(raw.balanceScore, 0, 100, 50),
    summary: str(raw.summary, 600),
    members: memberWorkloadTable(context),
  };
}

// ── Drive document → tasks ────────────────────────────────────

export function isIsoDate(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(v)) return false;
  return !Number.isNaN(Date.parse(v.slice(0, 10)));
}

export interface DriveTask {
  title: string;
  description: string | null;
  priority: (typeof PRIORITIES)[number];
  dueDate: string | null;
  suggestedAssigneeId: string | null;
  suggestedAssigneeName: string | null;
  suggestedMilestoneId: string | null;
  storyPoints: number | null;
  estimatedHours: number | null;
  dependsOn: string[];
  sourceContext: string | null;
}

export function normalizeDriveTasks(raw: unknown, context: ProjectContext) {
  const rawTasks = isObj(raw) ? arr(raw.tasks) : [];
  const openTitles = context.tasks.filter((t) => t.status !== "DONE").map((t) => normalizeTitle(t.title));
  const milestoneIds = new Set(context.milestones.map((m) => m.id));
  const memberIds = new Set(context.members.map((m) => m.id));
  const memberById = new Map(context.members.map((m) => [m.id, m]));

  const isDuplicate = (title: string) => {
    const n = normalizeTitle(title);
    return openTitles.some((o) => o === n || jaccard(o, n) >= 0.8);
  };

  const tasks: DriveTask[] = [];
  const seen: string[] = [];
  let skippedDuplicates = 0;
  for (const t of rawTasks.filter(isObj)) {
    const title = str(t.title, 120);
    if (!title) continue;
    const n = normalizeTitle(title);
    if (isDuplicate(title) || seen.includes(n)) { skippedDuplicates++; continue; }
    seen.push(n);

    // Prefer the id the model cited, but only if it is on this project; else resolve the name.
    let assigneeId: string | null = typeof t.suggestedAssigneeId === "string" && memberIds.has(t.suggestedAssigneeId) ? t.suggestedAssigneeId : null;
    if (!assigneeId) assigneeId = resolveMemberByName(context, typeof t.suggestedAssigneeName === "string" ? t.suggestedAssigneeName : null);

    const points = typeof t.storyPoints === "number" && STORY_POINT_SCALE.includes(t.storyPoints) ? t.storyPoints : null;
    const hours = typeof t.estimatedHours === "number" && t.estimatedHours > 0 && t.estimatedHours <= 200 ? Math.round(t.estimatedHours * 10) / 10 : null;

    tasks.push({
      title,
      description: strOrNull(t.description, 1000),
      priority: oneOf(t.priority, PRIORITIES, "MEDIUM"),
      dueDate: isIsoDate(t.dueDate) ? t.dueDate.slice(0, 10) : null,
      suggestedAssigneeId: assigneeId,
      suggestedAssigneeName: assigneeId ? memberById.get(assigneeId)!.displayName : null,
      suggestedMilestoneId: typeof t.suggestedMilestoneId === "string" && milestoneIds.has(t.suggestedMilestoneId) ? t.suggestedMilestoneId : null,
      storyPoints: points,
      estimatedHours: hours,
      dependsOn: arr(t.dependsOn).filter((d): d is string => typeof d === "string").map((d) => d.trim().slice(0, 120)).filter(Boolean).slice(0, 5),
      sourceContext: strOrNull(t.sourceContext, 160),
    });
  }
  return { tasks, skippedDuplicates };
}
