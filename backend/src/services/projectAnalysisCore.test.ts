// Pure-logic tests for the project-scoped AI report post-processing. No DB, no network.
// Run: cd backend && npx tsx src/services/projectAnalysisCore.test.ts

import {
  normalizeRisk, normalizeSprintPlan, normalizeCapacity, normalizeDriveTasks,
  resolveSprintCapacity, resolveMemberByName,
} from "./projectAnalysisCore.js";
import { computeProjectSignals, renderProjectContext } from "../utils/projectContextRender.js";
import type { ProjectContext, ProjectContextTask } from "./projectContextService.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}

const task = (over: Partial<ProjectContextTask>): ProjectContextTask => ({
  id: "t?", title: "Task", description: null, status: "TODO", priority: "MEDIUM", assignees: [],
  dueDate: null, milestoneTitle: null, blockedByOpenDependencies: false, blockedByTitles: [],
  activeCategoryBlockers: [], subtaskCounts: { total: 0, done: 0 }, storyPoints: null,
  estimatedHours: null, loggedHours: 0, parentTitle: null, daysSinceUpdate: 0, ...over,
});

const member = (id: string, displayName: string) => ({
  id, displayName, projectRole: "Contributor", isLead: false, openTaskCount: 0, openHighPriorityCount: 0,
  openOverdueCount: 0, openStoryPoints: 0, openEstimatedHours: 0, openUnestimatedCount: 0,
  completedLast14d: 0, loggedHoursLast14d: 0,
});

const ctx: ProjectContext = {
  project: { id: "p1", name: "Rover", description: "d", type: "ENGINEERING", targetDate: "2026-12-01" },
  velocity: { windowDays: 28, tasksCompleted: 8, pointsCompleted: 20, tasksPerWeek: 2, pointsPerWeek: 5 },
  unassignedOpen: { tasks: 1, highPriority: 1, storyPoints: 3, estimatedHours: 0 },
  tasks: [
    task({ id: "t1", title: "Build chassis", status: "IN_PROGRESS", priority: "HIGH", assignees: ["Ada Lovelace"], storyPoints: 5, dueDate: "2026-10-01", daysSinceUpdate: 20 }),
    task({ id: "t2", title: "Wire motors", priority: "CRITICAL", storyPoints: 3, dueDate: "2026-10-15", blockedByTitles: ["Build chassis"], blockedByOpenDependencies: true }),
    task({ id: "t3", title: "Write report", assignees: ["Grace Hopper"] }),
    task({ id: "t4", title: "Old thing", status: "DONE" }),
  ],
  milestones: [{ id: "m1", title: "Prototype", status: "AT_RISK", targetDate: "2026-10-14", description: null, ownerName: null, taskCounts: { total: 4, done: 1 } }],
  members: [member("u1", "Ada Lovelace"), member("u2", "Grace Hopper"), member("u3", "Alan Turing")],
  recentActivity: [], activeBlockers: [], truncated: false,
};

console.log("resolveSprintCapacity — the project's own pace beats a flat default");
{
  check("explicit value wins", resolveSprintCapacity(ctx, 30, 14).capacitySource === "requested");
  const v = resolveSprintCapacity(ctx, undefined, 14);
  check("velocity scaled to sprint length", v.capacityPoints === 10 && v.capacitySource === "velocity");
  const none = resolveSprintCapacity({ ...ctx, velocity: { ...ctx.velocity, pointsPerWeek: 0 } }, undefined, 14);
  check("no history falls back to 40 and says so", none.capacityPoints === 40 && none.capacitySource === "default");
  check("zero/negative request is ignored", resolveSprintCapacity(ctx, 0, 14).capacitySource === "velocity");
}

console.log("normalizeSprintPlan — invented ids never reach the plan");
{
  const cap = { capacityPoints: 6, capacitySource: "requested" as const };
  const plan = normalizeSprintPlan({
    sprintTasks: [
      { taskId: "t1", reason: "overdue" },
      { taskId: "t1", reason: "dup" },
      { taskId: "t4", reason: "already done" },
      { taskId: "other-project-task", reason: "hallucinated" },
      { taskId: "t2", reason: "critical", suggestedAssigneeId: "u3" },
      { taskId: "t3", reason: "x", suggestedAssigneeId: "u3" },
    ],
    totalPoints: 999, focusTheme: "Chassis", risksInPlan: ["tight"],
  }, ctx, cap)!;
  check("only real open tasks, deduped", plan.sprintTasks.map(t => t.taskId).join() === "t1,t2,t3");
  check("total recomputed from real points", plan.totalPoints === 8);
  check("over-capacity flagged", plan.risksInPlan.some(r => r.includes("8pts against a capacity of 6pts")));
  check("unestimated flagged", plan.unestimatedCount === 1 && plan.risksInPlan.some(r => r.includes("no story points")));
  check("assignee suggestion kept for unassigned task on the team", plan.sprintTasks[1].suggestedAssigneeId === "u3");
  check("assignee suggestion dropped when task already owned", plan.sprintTasks[2].suggestedAssigneeId === null);
  check("garbage input returns null", normalizeSprintPlan("nope", ctx, cap) === null);
}

console.log("normalizeRisk — ids resolve to titles, enums are clamped");
{
  const r = normalizeRisk({
    overallRisk: "catastrophic", riskScore: 400,
    risks: [
      { category: "Schedule", description: "Chassis late", affectedTaskIds: ["t1", "bogus"], owner: "Ada Lovelace", severity: "high", mitigation: "Swap scope" },
      { category: "Empty", description: "" },
    ],
    topRecommendation: "Fix chassis",
  }, ctx)!;
  check("unknown overall level falls back", r.overallRisk === "MEDIUM");
  check("score clamped", r.riskScore === 100);
  check("empty risk dropped", r.risks.length === 1);
  check("bogus task id dropped, title filled", r.risks[0].affectedTaskIds.join() === "t1" && r.risks[0].affectedTasks.join() === "Build chassis");
  check("owner must be on the team", r.risks[0].owner === "Ada Lovelace");
  check("severity upper-cased", r.risks[0].severity === "HIGH");
  const stranger = normalizeRisk({ risks: [{ description: "x", owner: "Someone Else" }] }, ctx)!;
  check("owner outside the team is dropped", stranger.risks[0].owner === null);
}

console.log("normalizeCapacity — reassignments only between this project's people and open tasks");
{
  const c = normalizeCapacity({
    overloaded: [{ member: "Ada Lovelace", recommendation: "offload" }, { member: "Nobody", recommendation: "x" }],
    underloaded: [{ member: "Alan Turing", suggestion: "take work" }],
    reassignments: [
      { taskId: "t1", toMemberId: "u3", reason: "ok" },
      { taskId: "t1", toMemberId: "u2", reason: "second move of same task" },
      { taskId: "t3", toMemberId: "u2", reason: "already owns it" },
      { taskId: "t4", toMemberId: "u3", reason: "done task" },
      { taskId: "t2", toMemberId: "outsider", reason: "not on team" },
    ],
    balanceScore: -5, summary: "uneven",
  }, ctx)!;
  check("unknown member dropped from overloaded", c.overloaded.length === 1);
  check("exactly one valid reassignment", c.reassignments.length === 1 && c.reassignments[0].toMemberName === "Alan Turing");
  check("score clamped", c.balanceScore === 0);
  check("real workload table covers idle members", c.members.length === 3 && c.members.some(m => m.name === "Alan Turing"));
}

console.log("normalizeDriveTasks — duplicates, ids and sizing are checked against the project");
{
  const out = normalizeDriveTasks({
    tasks: [
      { title: "Wire motors", priority: "HIGH" },
      { title: "Wire motors!", priority: "HIGH" },
      { title: "Order bearings", priority: "urgent", dueDate: "2026-11-02T00:00:00Z", suggestedAssigneeName: "grace", suggestedMilestoneId: "m1", storyPoints: 4, estimatedHours: 3.14159, dependsOn: ["Build chassis", 7] },
      { title: "Order bearings", priority: "LOW" },
      { title: "Calibrate", suggestedAssigneeId: "stranger", suggestedMilestoneId: "m9", dueDate: "tomorrow", storyPoints: 5, estimatedHours: 9999 },
      { title: "" },
    ],
  }, ctx);
  check("duplicates of open work and within the batch are skipped", out.tasks.length === 2 && out.skippedDuplicates === 3);
  const [a, b] = out.tasks;
  check("name resolves to a team member id", a.suggestedAssigneeId === "u2" && a.suggestedAssigneeName === "Grace Hopper");
  check("bad priority defaults", a.priority === "MEDIUM");
  check("date normalised to a day", a.dueDate === "2026-11-02");
  check("milestone kept when real", a.suggestedMilestoneId === "m1");
  check("points off the scale dropped, hours rounded", a.storyPoints === null && a.estimatedHours === 3.1);
  check("non-string dependsOn entries dropped", a.dependsOn.join() === "Build chassis");
  check("foreign assignee/milestone/date/hours dropped", b.suggestedAssigneeId === null && b.suggestedMilestoneId === null && b.dueDate === null && b.estimatedHours === null && b.storyPoints === 5);
  check("garbage input yields no tasks", normalizeDriveTasks(null, ctx).tasks.length === 0);
}

console.log("resolveMemberByName — ambiguity resolves to nobody");
{
  const two = { ...ctx, members: [member("a", "Sam Lee"), member("b", "Sam Park")] };
  check("ambiguous first name is not guessed", resolveMemberByName(two, "Sam") === null);
  check("full name resolves", resolveMemberByName(two, "sam park") === "b");
}

console.log("computeProjectSignals / renderProjectContext — exact facts for the prompt");
{
  const s = computeProjectSignals(ctx, "2026-10-12");
  check("overdue found with days late", s.overdue.length === 1 && s.overdue[0].title === "Build chassis" && s.overdue[0].daysLate === 11);
  check("due within 7 days", s.dueWithin7Days.map(t => t.title).join() === "Wire motors");
  check("unassigned high priority", s.unassignedHighPriority.join() === "Wire motors");
  check("stale in-progress", s.staleInProgress.length === 1 && s.staleInProgress[0].daysSinceUpdate === 20);
  check("blocked task explained", s.blocked.length === 1 && s.blocked[0].reason.includes("Build chassis"));
  check("milestone at risk", s.milestonesAtRisk.length === 1 && s.milestonesAtRisk[0].reason.includes("3 of 4"));

  const text = renderProjectContext(ctx, "2026-10-12", { ids: true, tasks: "open" });
  check("ids rendered when asked", text.includes('id="t1"') && text.includes('id="u3"') && text.includes('id="m1"'));
  check("open filter hides done tasks", !text.includes("Old thing"));
  check("idle member listed", text.includes("Alan Turing"));
  check("velocity rendered", text.includes("5pts/week"));
  check("ids omitted by default", !renderProjectContext(ctx, "2026-10-12").includes('id="t1"'));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
