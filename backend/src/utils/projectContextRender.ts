import type { ProjectContext, ProjectContextTask } from "../services/projectContextService.js";

// Pure text rendering of a ProjectContext for AI prompts. Shared by action plans,
// Drive parsing, risk analysis, sprint planning and capacity so they all describe
// the same single project the same way. Nothing here touches the DB.

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RenderOptions {
  /** Prefix tasks, members, milestones and blockers with their ids so the model can cite them. */
  ids?: boolean;
  /** Max characters of each task description. 0 omits descriptions. Default 200. */
  descChars?: number;
  /** Which tasks to list. Default "all". */
  tasks?: "all" | "open";
  /** Include the recent audit trail. Default false. */
  activity?: boolean;
  /** Add each member's strongest evidence-backed skills to their line. Default false so other prompts are unchanged. */
  skills?: boolean;
}

const BAND_WORD = { LOW: "low", MEDIUM: "med", HIGH: "high" } as const;

/** "CAD L4 (high conf, last 2026-09), PCB Design L3 (med conf)": advisory estimates, level and confidence kept apart. */
export function renderMemberSkills(skills: NonNullable<ProjectContext["members"][number]["topSkills"]>): string {
  return skills
    .map((s) => `${s.name} L${s.level} (${BAND_WORD[s.confidence]} conf${s.provenance === "MANAGER_VERIFIED" ? ", lead-verified" : s.provenance === "PEER_ENDORSED" ? ", peer-endorsed" : ""}${s.lastDemonstrated ? `, last ${s.lastDemonstrated.slice(0, 7)}` : ""})`)
    .join(", ");
}

const idTag = (id: string, on: boolean) => (on ? `id="${id}" ` : "");

function estimateLabel(t: { storyPoints: number | null; estimatedHours: number | null; loggedHours?: number }): string {
  const parts: string[] = [];
  if (t.storyPoints != null) parts.push(`${t.storyPoints}pts`);
  if (t.estimatedHours != null) parts.push(`est ${t.estimatedHours}h`);
  if (t.loggedHours) parts.push(`logged ${t.loggedHours}h`);
  return parts.length ? parts.join(" ") : "unestimated";
}

export function renderTaskLine(t: ProjectContextTask, ids: boolean, descChars: number): string {
  const flags = [
    t.blockedByTitles.length ? `waiting-on:${t.blockedByTitles.map((x) => `"${x}"`).join("/")}` : null,
    t.activeCategoryBlockers.length ? `blocked-by:${t.activeCategoryBlockers.join("/")}` : null,
    t.subtaskCounts.total ? `subtasks:${t.subtaskCounts.done}/${t.subtaskCounts.total}` : null,
    t.parentTitle ? `subtask-of:"${t.parentTitle}"` : null,
    t.status !== "DONE" && t.daysSinceUpdate >= 7 ? `untouched:${t.daysSinceUpdate}d` : null,
  ].filter(Boolean).join(" ");
  const desc = descChars > 0 && t.description ? `\n  ${t.description.slice(0, descChars)}` : "";
  return `- ${idTag(t.id, ids)}[${t.status}] ${t.projectName ? `[${t.projectName}] ` : ""}"${t.title}" | ${t.priority} | ${estimateLabel(t)} | due: ${t.dueDate ?? "none"} | assignees: ${t.assignees.join(", ") || "none"}${t.milestoneTitle ? ` | milestone: ${t.milestoneTitle}` : ""}${flags ? ` | ${flags}` : ""}${desc}`;
}

export function renderProjectContext(context: ProjectContext, today: string, opts: RenderOptions = {}): string {
  const ids = opts.ids ?? false;
  const descChars = opts.descChars ?? 200;
  const { project, members, milestones, activeBlockers, velocity, unassignedOpen } = context;

  const shown = opts.tasks === "open" ? context.tasks.filter((t) => t.status !== "DONE") : context.tasks;
  const taskLines = shown.map((t) => renderTaskLine(t, ids, descChars)).join("\n") || "none";

  const memberLines = members.map((m) =>
    `- ${idTag(m.id, ids)}${m.displayName} (${m.projectRole}${m.isLead ? ", lead" : ""}): ${m.openTaskCount} open ` +
    `(${m.openHighPriorityCount} high/critical, ${m.openOverdueCount} overdue), ` +
    `${m.openStoryPoints}pts + ${m.openEstimatedHours}h estimated` +
    `${m.openUnestimatedCount ? `, ${m.openUnestimatedCount} unestimated` : ""}; ` +
    `last 14d: ${m.completedLast14d} done, ${m.loggedHoursLast14d}h logged` +
    (opts.skills && m.topSkills?.length ? `; skills (advisory): ${renderMemberSkills(m.topSkills)}` : "")
  ).join("\n") || "none";

  const milestoneLines = milestones.map((m) =>
    `- ${idTag(m.id, ids)}"${m.title}" (${m.status}, due ${m.targetDate ?? "no date"}, ${m.taskCounts.done}/${m.taskCounts.total} tasks done` +
    `${m.ownerName ? `, owner ${m.ownerName}` : ""})${m.description ? ` — ${m.description.slice(0, 120)}` : ""}`
  ).join("\n") || "none";

  const blockerLines = activeBlockers.map((b) =>
    `- ${idTag(b.id, ids)}"${b.label}"${b.assigneeName ? ` (owner: ${b.assigneeName})` : ""} — affects: ${b.attachedTaskTitles.join(", ") || "no tasks"}`
  ).join("\n") || "none";

  const out = [
    `Project: "${project.name}" (${project.type}). Today: ${today}. Target: ${project.targetDate ?? "TBD"}.`,
    `Description: ${project.description ?? "none"}`,
    "",
    `Team (${members.length}; only these people belong to this project):`,
    memberLines,
    "",
    `Unassigned open work: ${unassignedOpen.tasks} tasks (${unassignedOpen.highPriority} high/critical), ${unassignedOpen.storyPoints}pts, ${unassignedOpen.estimatedHours}h estimated.`,
    `Velocity, last ${velocity.windowDays} days: ${velocity.tasksCompleted} tasks and ${velocity.pointsCompleted}pts completed (${velocity.tasksPerWeek} tasks/week, ${velocity.pointsPerWeek}pts/week).`,
    "",
    ...(context.rollupProjects?.length
      ? [`Tasks marked [Name] come from sub-projects of this project (${context.rollupProjects!.map((p) => p.name).join(", ")}); unmarked tasks belong to this project. Team, milestones, blockers and velocity below describe this project only.`]
      : []),
    `Tasks (${shown.length}${context.truncated ? ", truncated to the most relevant" : ""}):`,
    taskLines,
    "",
    "Milestones:",
    milestoneLines,
    "",
    "Active category blockers:",
    blockerLines,
  ];

  if (opts.activity) {
    const activityLines = context.recentActivity.map((a) =>
      `${a.createdAt.split("T")[0]}: ${a.eventType}${a.actorName ? ` by ${a.actorName}` : ""}${a.taskTitle ? ` on "${a.taskTitle}"` : ""}`
    ).join("\n") || "none";
    out.push("", "Recent activity:", activityLines);
  }

  return out.join("\n");
}

// ── Deterministic signals ─────────────────────────────────────
// Facts the model should not have to compute (and could get wrong): overdue work,
// stale in-progress tasks, milestones about to slip. Computed in code, handed to the
// model as ground truth to reason about.

export interface ProjectSignals {
  overdue: Array<{ title: string; dueDate: string; daysLate: number; assignees: string[] }>;
  dueWithin7Days: Array<{ title: string; dueDate: string; assignees: string[] }>;
  unassignedHighPriority: string[];
  staleInProgress: Array<{ title: string; daysSinceUpdate: number }>;
  blocked: Array<{ title: string; reason: string }>;
  milestonesAtRisk: Array<{ title: string; reason: string }>;
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / DAY_MS);
}

export function computeProjectSignals(context: ProjectContext, today: string): ProjectSignals {
  const open = context.tasks.filter((t) => t.status !== "DONE");

  const overdue = open
    .filter((t) => t.dueDate && t.dueDate < today)
    .map((t) => ({ title: t.title, dueDate: t.dueDate!, daysLate: daysBetween(t.dueDate!, today), assignees: t.assignees }))
    .sort((a, b) => b.daysLate - a.daysLate);

  const dueWithin7Days = open
    .filter((t) => t.dueDate && t.dueDate >= today && daysBetween(today, t.dueDate) <= 7)
    .map((t) => ({ title: t.title, dueDate: t.dueDate!, assignees: t.assignees }));

  const unassignedHighPriority = open
    .filter((t) => t.assignees.length === 0 && (t.priority === "HIGH" || t.priority === "CRITICAL"))
    .map((t) => t.title);

  const staleInProgress = open
    .filter((t) => t.status === "IN_PROGRESS" && t.daysSinceUpdate >= 14)
    .map((t) => ({ title: t.title, daysSinceUpdate: t.daysSinceUpdate }));

  const blocked = open
    .filter((t) => t.status === "BLOCKED" || t.blockedByTitles.length || t.activeCategoryBlockers.length)
    .map((t) => ({
      title: t.title,
      reason: [
        t.blockedByTitles.length ? `waiting on ${t.blockedByTitles.join(", ")}` : null,
        t.activeCategoryBlockers.length ? `blocker ${t.activeCategoryBlockers.join(", ")}` : null,
      ].filter(Boolean).join("; ") || "status BLOCKED",
    }));

  const milestonesAtRisk = context.milestones
    .filter((m) => m.status !== "COMPLETED" && m.status !== "CANCELLED")
    .flatMap((m) => {
      const remaining = m.taskCounts.total - m.taskCounts.done;
      if (remaining <= 0) return [];
      if (m.targetDate && m.targetDate < today) return [{ title: m.title, reason: `due ${m.targetDate}, already past, ${remaining} tasks left` }];
      if (m.targetDate && daysBetween(today, m.targetDate) <= 7) return [{ title: m.title, reason: `due ${m.targetDate}, ${remaining} of ${m.taskCounts.total} tasks left` }];
      if (m.status === "AT_RISK" || m.status === "BEHIND") return [{ title: m.title, reason: `marked ${m.status}, ${remaining} tasks left` }];
      return [];
    });

  return { overdue, dueWithin7Days, unassignedHighPriority, staleInProgress, blocked, milestonesAtRisk };
}

export function renderSignals(s: ProjectSignals): string {
  const list = (items: string[]) => (items.length ? items.map((i) => `  - ${i}`).join("\n") : "  none");
  return [
    "Computed signals (exact, calculated from the data; treat as ground truth):",
    `Overdue open tasks (${s.overdue.length}):`,
    list(s.overdue.map((o) => `"${o.title}" ${o.daysLate}d late (due ${o.dueDate}; ${o.assignees.join(", ") || "unassigned"})`)),
    `Due within 7 days (${s.dueWithin7Days.length}):`,
    list(s.dueWithin7Days.map((o) => `"${o.title}" due ${o.dueDate} (${o.assignees.join(", ") || "unassigned"})`)),
    `Unassigned high/critical tasks (${s.unassignedHighPriority.length}):`,
    list(s.unassignedHighPriority.map((t) => `"${t}"`)),
    `In progress but untouched 14+ days (${s.staleInProgress.length}):`,
    list(s.staleInProgress.map((t) => `"${t.title}" (${t.daysSinceUpdate}d)`)),
    `Blocked or waiting (${s.blocked.length}):`,
    list(s.blocked.map((b) => `"${b.title}" — ${b.reason}`)),
    `Milestones at risk (${s.milestonesAtRisk.length}):`,
    list(s.milestonesAtRisk.map((m) => `"${m.title}" — ${m.reason}`)),
  ].join("\n");
}
