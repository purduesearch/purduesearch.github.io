import assert from "node:assert/strict";
import { assertBlockBudget } from "./common.js";
import { actionLabel, buildPlanEditModal, buildPlanModal, parsePlanEdit, summarizeAction, type PlanEditValues } from "./planModal.js";
import type { ActionPlanAction } from "../../services/aiActionService.js";

let passed = 0;
function test(name: string, run: () => void) { run(); passed++; console.log(`✓ ${name}`); }
const taskTitles = new Map([["t1", "Swap pump driver"]]);
const action: ActionPlanAction = { type: "SET_DUE", targetTaskId: "t1", params: { dueDate: "2026-10-15" }, rationale: "Finish before testing" };
const base = { sessionId: "session", goal: "Get ready", taskTitles };

test("mixed decisions style the chosen buttons and count edited actions", () => {
  const view = buildPlanModal({ ...base, actions: Array.from({ length: 6 }, () => action), decisions: { 0: "ACCEPTED", 1: "SKIPPED", 2: "EDITED", 3: "ACCEPTED", 4: "SKIPPED", 5: "EDITED" } });
  assertBlockBudget(view.blocks, 100);
  assert.equal(view.submit?.text, "Run 4 accepted");
  const rows = view.blocks.filter((b: any) => b.type === "actions" && b.block_id?.startsWith("plan_row_")) as any[];
  assert.deepEqual(rows.map(row => row.elements.find((e: any) => e.style === "primary").action_id), ["plan_accept", "plan_skip", "plan_edit", "plan_accept", "plan_skip", "plan_edit"]);
  assert.deepEqual(JSON.parse(rows[2].elements[0].value), { s: "session", i: 2 });
  assert.equal(view.private_metadata, "session");
  const discard = (view.blocks.at(-1) as any).elements[1];
  assert.equal(discard.style, "danger");
  assert.ok(discard.confirm);
});

test("no accepted actions has no submit", () => {
  const view = buildPlanModal({ ...base, actions: [action], decisions: { 0: "SKIPPED" } });
  assertBlockBudget(view.blocks, 100);
  assert.equal(view.submit, undefined);
});

test("35 actions cap at 30 and fit the modal budget", () => {
  const view = buildPlanModal({ ...base, actions: Array.from({ length: 35 }, () => action), decisions: {} });
  assertBlockBudget(view.blocks, 100);
  assert.equal(view.blocks.filter((b: any) => b.type === "section").length, 30);
  assert.ok(JSON.stringify(view.blocks).includes("+5 more — open in Constellation"));
});

test("results replace all row buttons and leave completed plans without submit", () => {
  const view = buildPlanModal({ ...base, actions: [action, action, action], decisions: { 0: "ACCEPTED", 1: "ACCEPTED", 2: "SKIPPED" }, results: [{ index: 0, type: "SET_DUE", ok: true }, { index: 1, type: "SET_DUE", ok: false, error: "Access denied" }] });
  assertBlockBudget(view.blocks, 100);
  assert.equal(view.blocks.filter((b: any) => b.type === "actions").length, 0);
  const rows = view.blocks.filter((b: any) => b.type === "context").slice(1) as any[];
  assert.deepEqual(rows.map(row => row.elements[0].text), ["✓ Done", "✕ Access denied", "Skipped"]);
  assert.equal(view.submit, undefined);
});

test("summaries use task titles and UTC dates", () => {
  assert.equal(summarizeAction(action, taskTitles), "Swap pump driver → Oct 15");
  assert.equal(actionLabel("CREATE_TASK"), "Create task");
  assert.equal(summarizeAction({ ...action, params: { dueDate: null } }, taskTitles), "Swap pump driver → No due date");
});

const samples: ActionPlanAction[] = [
  { type: "CREATE_TASK", params: { title: "Pump", description: "A\nB", priority: "HIGH", dueDate: "2026-10-15", assigneeIds: ["m1", "m2"], milestoneId: "ms", subtasks: ["Check, test", "Install"] }, rationale: "" },
  { type: "UPDATE_TASK", params: { title: "Pump", description: "Revised", priority: "LOW", dueDate: null, assigneeIds: ["m1"], milestoneId: "ms" }, rationale: "" },
  { type: "DELETE_TASK", params: {}, rationale: "" },
  { type: "SET_STATUS", params: { status: "IN_PROGRESS" }, rationale: "" },
  { type: "SET_PRIORITY", params: { priority: "CRITICAL" }, rationale: "" },
  { type: "SET_DUE", params: { dueDate: null }, rationale: "" },
  { type: "ASSIGN", params: { assigneeIds: [] }, rationale: "" },
  { type: "CREATE_SUBTASK", params: { title: "Test", assigneeIds: ["m2"] }, rationale: "" },
  { type: "ADD_DEPENDENCY", params: { blockingTaskId: "t2", reason: "Needs motor" }, rationale: "" },
  { type: "ATTACH_BLOCKER", params: { blockerId: "b1", reason: "Awaiting parts" }, rationale: "" },
  { type: "RESOLVE_BLOCKER", params: { blockerId: "b1", reason: "Delivered" }, rationale: "" },
  { type: "ADD_COMMENT", params: { content: "Ready\nNow" }, rationale: "" },
  { type: "CREATE_MILESTONE", params: { title: "Demo", dueDate: "2026-10-15", description: "Tested", ownerId: "m1" }, rationale: "" },
  { type: "LINK_MILESTONE", params: { milestoneId: "ms", taskIds: ["t1", "t2"] }, rationale: "" },
];
for (const sample of samples) test(`${sample.type} edit fields round-trip`, () => {
  const view = buildPlanEditModal(2, sample, { sessionId: "session", taskTitles });
  assertBlockBudget(view.blocks, 100);
  assert.equal(view.callback_id, "plan_edit_submit");
  assert.deepEqual(JSON.parse(view.private_metadata!), { s: "session", i: 2 });
  const state: PlanEditValues = {};
  for (const block of view.blocks as any[]) {
    if (block.type !== "input") continue;
    const element = block.element;
    state[block.block_id] = { [element.action_id]: element.type === "static_select" ? { selected_option: element.initial_option ?? null } : { value: element.initial_value ?? null } };
  }
  assert.deepEqual(parsePlanEdit(sample.type, state), sample.params);
  assert.ok(view.title.text.length <= 24);
});

test("unchanged optional fields do not add task mutations", () => {
  assert.deepEqual(parsePlanEdit("UPDATE_TASK", { pe_title: { title: { value: "New" } }, pe_dueDate: { dueDate: { value: null } }, pe_assigneeIds: { assigneeIds: { value: null } } }), { title: "New" });
});

test("parser rejects invalid dates and enumerations", () => {
  assert.throws(() => parsePlanEdit("SET_DUE", { pe_dueDate: { dueDate: { value: "tomorrow maybe" } } }), /valid due date/);
  assert.throws(() => parsePlanEdit("SET_STATUS", { pe_status: { status: { selected_option: { value: "WRONG" } } } }), /Invalid status/);
});

test("long source text stays within Slack section and context limits", () => {
  const view = buildPlanModal({ ...base, goal: "<".repeat(5000), actions: [{ ...action, rationale: "<".repeat(5000), params: { dueDate: null }, targetTaskId: "<".repeat(5000) }], decisions: {} });
  assertBlockBudget(view.blocks, 100);
  for (const block of view.blocks as any[]) {
    if (block.type === "section") assert.ok(block.text.text.length <= 3000);
    if (block.type === "context") assert.ok(block.elements[0].text.length <= 3000);
  }
});
console.log(`${passed} tests passed`);
