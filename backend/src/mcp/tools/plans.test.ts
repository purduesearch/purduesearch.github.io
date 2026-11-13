import assert from "node:assert/strict";
import { registerPlanTools, planContentHash, MAX_PLAN_ACTIONS, PROJECT_SCOPED_ACTION_TYPES, type PlanDraftRow } from "./plans.js";
import { fakeContext, fakeServer, type FakeAccessOptions } from "./testHarness.js";
import { describeAction } from "../../services/aiActionDescribe.js";
import type { ProjectContext } from "../../services/projectContextService.js";
import type { ActionPlanAction } from "../../services/aiActionService.js";
import type { AuditOrigin } from "../../services/taskMutationService.js";

let passed = 0;
async function test(name: string, run: () => unknown) { await run(); passed++; console.log(`PASS ${name}`); }
let NOW = new Date("2026-11-13T12:00:00Z");
const PLAN = ["constellation.read", "constellation.plan"];

const snapshot = (projectId: string) => ({
  project: { id: projectId, name: "Rover", description: null, type: "TEAM", targetDate: null },
  velocity: { windowDays: 28, tasksCompleted: 0, pointsCompleted: 0, tasksPerWeek: 0, pointsPerWeek: 0 },
  unassignedOpen: { tasks: 0, highPriority: 0, storyPoints: 0, estimatedHours: 0 },
  tasks: [{ id: "t1", title: "Mount bracket v2", status: "TODO", priority: "MEDIUM", assignees: ["Sam"], dueDate: "2026-11-21" }],
  members: [{ id: "m2", displayName: "Priya" }], milestones: [{ id: "ms1", title: "Design review" }],
  activeBlockers: [{ id: "b1", label: "Order delays" }], recentActivity: [], rollupProjects: [], truncated: false,
}) as unknown as ProjectContext;

function world(options: Partial<FakeAccessOptions> = {}, edit: { canEdit?: boolean } = {}) {
  const drafts = new Map<string, PlanDraftRow>();
  const executed: { projectId: string; memberId: string; actions: ActionPlanAction[]; origin: AuditOrigin }[] = [];
  const editChecks: { memberId: string; projectId: string }[] = [];
  let claims = 0;
  let seq = 0;
  const register = (opts: Partial<FakeAccessOptions>) => {
    const { server, call } = fakeServer();
    registerPlanTools(server, fakeContext({ now: NOW, admin: true, scopes: PLAN, current: ["p1", "p2"], granted: ["p1"], ...opts }), {
      buildContext: async id => snapshot(id),
      normalize: (raw, _ctx, dropped) => (raw as ActionPlanAction[]).filter((a, index) => {
        if (a.targetTaskId === "ghost") { dropped.push({ index, type: a.type, reason: "gone" }); return false; }
        return true;
      }),
      execute: async (projectId, memberId, actions, origin) => { executed.push({ projectId, memberId, actions, origin }); return actions.map((a, index) => ({ index, type: a.type, ok: true })); },
      createDraft: async data => { const row = { ...data, id: `d${++seq}`, executedAt: null }; drafts.set(row.id, row); return row; },
      findDraft: async id => drafts.get(id) ?? null,
      canEditProject: async (memberId, projectId) => { editChecks.push({ memberId, projectId }); return edit.canEdit ?? true; },
      claimDraft: async (id, at) => { claims++; const row = drafts.get(id); if (!row || row.executedAt || row.expiresAt <= at) return false; row.executedAt = at; return true; },
      now: () => NOW,
    });
    return call;
  };
  return { call: register(options), as: register, drafts, executed, editChecks, claims: () => claims };
}
const due = { type: "SET_DUE", targetTaskId: "t1", params: { dueDate: "2026-11-28" }, rationale: "slipped" };

await test("preview stores a hashed draft, writes nothing, and describes the real change", async () => {
  const w = world();
  const { body } = await w.call("preview_action_plan", { projectId: "p1", actions: [due] });
  assert.equal(w.executed.length, 0);
  const draft = w.drafts.get(body.planId)!;
  assert.equal(draft.contentHash, planContentHash("p1", draft.actionsJson));
  assert.equal(draft.expiresAt.getTime() - NOW.getTime(), 3_600_000);
  assert.equal(body.changes[0].untrusted.content.change, "Set *Mount bracket v2* due Sat, Nov 21 → Sat, Nov 28");
});
await test("execute runs a draft once, as AGENT with the client name", async () => {
  const w = world();
  const { body } = await w.call("preview_action_plan", { projectId: "p1", actions: [due] });
  const run = await w.call("execute_action_plan", { planId: body.planId });
  assert.equal(run.body.succeeded, 1);
  assert.deepEqual(w.executed[0].origin, { source: "AGENT", client: "Claude" });
  const again = await w.call("execute_action_plan", { planId: body.planId });
  assert.equal(again.result.isError, true); assert.equal(again.body.error.status, 409);
  assert.equal(w.executed.length, 1);
});
await test("expired drafts are refused", async () => {
  const w = world();
  const { body } = await w.call("preview_action_plan", { projectId: "p1", actions: [due] });
  const saved = NOW; NOW = new Date(NOW.getTime() + 3_600_001);
  try {
    const late = await w.as({})("execute_action_plan", { planId: body.planId });
    assert.equal(late.body.error.status, 410);
  } finally { NOW = saved; }
  assert.equal(w.executed.length, 0);
});
await test("another grant's draft looks missing", async () => {
  const w = world();
  const { body } = await w.call("preview_action_plan", { projectId: "p1", actions: [due] });
  const other = await w.as({ grantId: "other" })("execute_action_plan", { planId: body.planId });
  assert.equal(other.body.error.status, 404);
  assert.deepEqual(other.body, (await w.call("execute_action_plan", { planId: "nope" })).body);
  assert.equal(w.executed.length, 0);
});
await test("a tampered draft is refused", async () => {
  const w = world();
  const { body } = await w.call("preview_action_plan", { projectId: "p1", actions: [due] });
  w.drafts.get(body.planId)!.actionsJson = JSON.stringify([{ ...due, type: "DELETE_TASK" }]);
  assert.equal((await w.call("execute_action_plan", { planId: body.planId })).body.error.status, 409);
  assert.equal(w.executed.length, 0);
});
await test("DELETE_TASK needs the delete scope at preview and again at execute", async () => {
  const del = { type: "DELETE_TASK", targetTaskId: "t1", params: {}, rationale: "dupe" };
  const w = world();
  const preview = await w.call("preview_action_plan", { projectId: "p1", actions: [due, del] });
  assert.equal(preview.body.actionCount, 1);
  assert.deepEqual(preview.body.dropped.map((x: { index: number }) => x.index), [1]);

  const withScope = world({ scopes: [...PLAN, "constellation.plan.delete"] });
  const allowed = await withScope.call("preview_action_plan", { projectId: "p1", actions: [del] });
  assert.equal(allowed.body.actionCount, 1);
  const narrowed = await withScope.as({ scopes: PLAN })("execute_action_plan", { planId: allowed.body.planId });
  assert.equal(narrowed.body.error.status, 403);
  assert.equal(withScope.executed.length, 0); assert.equal(withScope.claims(), 0);
});
await test("plans are capped and need plan scope and a granted project", async () => {
  const w = world();
  const big = await w.call("preview_action_plan", { projectId: "p1", actions: Array(MAX_PLAN_ACTIONS + 1).fill(due) });
  assert.equal(big.body.error.status, 400);
  for (const [opts, projectId] of [[{ scopes: ["constellation.read"] }, "p1"], [{ admin: false, scopes: ["constellation.read"] }, "p1"], [{ admin: false }, "p2"], [{}, "p2"]] as const) {
    const res = await w.as(opts)("preview_action_plan", { projectId, actions: [due] });
    assert.equal(res.result.isError, true);
  }
  assert.equal(w.drafts.size, 0);
});
await test("dropped indexes map back to the caller's list", async () => {
  const del = { type: "DELETE_TASK", targetTaskId: "t1", params: {}, rationale: "" };
  const ghost = { ...due, targetTaskId: "ghost" };
  const { body } = await world().call("preview_action_plan", { projectId: "p1", actions: [del, due, ghost] });
  assert.deepEqual(body.dropped.map((x: { index: number }) => x.index), [0, 2]);
});
const createTask = { type: "CREATE_TASK", targetTaskId: null, params: { title: "Order bolts" }, rationale: "" };
const resolveBlocker = { type: "RESOLVE_BLOCKER", targetTaskId: null, params: { blockerId: "b1" }, rationale: "" };
const del = { type: "DELETE_TASK", targetTaskId: "t1", params: {}, rationale: "dupe" };

await test("a non-admin with plan scope previews and executes their own task and project actions", async () => {
  const w = world({ admin: false });
  const preview = await w.call("preview_action_plan", { projectId: "p1", actions: [due, createTask] });
  assert.equal(preview.body.actionCount, 2); assert.deepEqual(preview.body.dropped, []);
  const run = await w.call("execute_action_plan", { planId: preview.body.planId });
  assert.equal(run.body.succeeded, 2); assert.equal(run.body.failed, 0);
  assert.equal(w.executed.length, 1);
  assert.equal(w.executed[0].memberId, "m");
  assert.deepEqual(w.executed[0].actions.map(a => a.type), ["SET_DUE", "CREATE_TASK"]);
  // One project-edit lookup per tool call: once at preview, once at execute.
  assert.deepEqual(w.editChecks, [{ memberId: "m", projectId: "p1" }, { memberId: "m", projectId: "p1" }]);
});
await test("without project edit, preview drops project-scoped actions with the caller's indexes", async () => {
  const w = world({ admin: false }, { canEdit: false });
  const ghost = { ...due, targetTaskId: "ghost" };
  const { body } = await w.call("preview_action_plan", { projectId: "p1", actions: [createTask, due, resolveBlocker, ghost, due] });
  assert.equal(body.actionCount, 2);
  assert.deepEqual(body.dropped.map((x: { index: number; reason: string }) => [x.index, x.reason]),
    [[0, "You cannot edit this project."], [2, "You cannot edit this project."], [3, "gone"]]);
  assert.equal(w.editChecks.length, 1);
});
await test("execute re-checks project edit: refused actions fail, the rest run, indexes stay the stored plan's", async () => {
  const w = world({ admin: false });
  const preview = await w.call("preview_action_plan", { projectId: "p1", actions: [due, createTask, due, resolveBlocker, due] });
  assert.equal(preview.body.actionCount, 5);
  const revoked = world({ admin: false }, { canEdit: false });
  for (const [id, row] of w.drafts) revoked.drafts.set(id, row);
  const run = await revoked.call("execute_action_plan", { planId: preview.body.planId });
  assert.equal(revoked.claims(), 1);
  assert.deepEqual(run.body.results.map((r: { index: number; type: string; ok: boolean }) => [r.index, r.type, r.ok]),
    [[0, "SET_DUE", true], [1, "CREATE_TASK", false], [2, "SET_DUE", true], [3, "RESOLVE_BLOCKER", false], [4, "SET_DUE", true]]);
  assert.equal(run.body.results[1].error.content, "You cannot edit this project.");
  assert.equal(run.body.succeeded, 3); assert.equal(run.body.failed, 2);
  assert.equal(revoked.executed.length, 1);
  assert.deepEqual(revoked.executed[0].actions.map(a => a.type), ["SET_DUE", "SET_DUE", "SET_DUE"]);
  assert.equal(revoked.editChecks.length, 1);
});
await test("a plan of only refused project actions claims the draft and runs nothing", async () => {
  const w = world({ admin: false });
  const preview = await w.call("preview_action_plan", { projectId: "p1", actions: [createTask] });
  const revoked = world({ admin: false }, { canEdit: false });
  for (const [id, row] of w.drafts) revoked.drafts.set(id, row);
  const run = await revoked.call("execute_action_plan", { planId: preview.body.planId });
  assert.equal(run.body.failed, 1); assert.equal(revoked.executed.length, 0); assert.equal(revoked.claims(), 1);
  assert.equal((await revoked.call("execute_action_plan", { planId: preview.body.planId })).body.error.status, 409);
});
await test("admins are never sent through the project-edit lookup", async () => {
  const w = world({ admin: true }, { canEdit: false });
  const preview = await w.call("preview_action_plan", { projectId: "p1", actions: [createTask, resolveBlocker] });
  assert.equal(preview.body.actionCount, 2);
  const run = await w.call("execute_action_plan", { planId: preview.body.planId });
  assert.equal(run.body.succeeded, 2);
  assert.equal(w.editChecks.length, 0);
});
await test("a non-admin holding the delete scope still cannot delete tasks", async () => {
  const scopes = [...PLAN, "constellation.plan.delete"];
  const w = world({ admin: false, scopes });
  const preview = await w.call("preview_action_plan", { projectId: "p1", actions: [del, due] });
  assert.equal(preview.body.actionCount, 1);
  assert.deepEqual(preview.body.dropped, [{ index: 0, type: "DELETE_TASK", reason: "Deleting tasks requires an administrator." }]);
  // An admin's delete draft, later executed after the member lost admin, is refused before the claim.
  const admin = world({ admin: true, scopes });
  const draft = await admin.call("preview_action_plan", { projectId: "p1", actions: [del, due] });
  assert.equal(draft.body.actionCount, 2);
  const demoted = await admin.as({ admin: false, scopes })("execute_action_plan", { planId: draft.body.planId });
  assert.equal(demoted.body.error.status, 403);
  assert.equal(admin.claims(), 0); assert.equal(admin.executed.length, 0);
  assert.equal(admin.drafts.get(draft.body.planId)!.executedAt, null);
});
await test("the project-scoped action list is exported for reuse", () => {
  assert.deepEqual([...PROJECT_SCOPED_ACTION_TYPES], ["CREATE_TASK", "CREATE_MILESTONE", "LINK_MILESTONE", "ATTACH_BLOCKER", "RESOLVE_BLOCKER"]);
});
await test("describeAction renders assignment and milestone changes with names", () => {
  const ctx = snapshot("p1");
  assert.equal(describeAction({ type: "ASSIGN", targetTaskId: "t1", params: { assigneeIds: ["m2"] } }, ctx), "Assign *Mount bracket v2*: Sam → Priya");
  assert.equal(describeAction({ type: "LINK_MILESTONE", targetTaskId: "t1", params: { milestoneId: "ms1", taskIds: ["t1"] } }, ctx), "Link *Mount bracket v2* to milestone *Design review*");
  assert.equal(describeAction({ type: "SET_STATUS", targetTaskId: "t1", params: { status: "DONE" } }, ctx), "Set *Mount bracket v2* status To do → Done");
});

console.log(`\n${passed} passed`);
