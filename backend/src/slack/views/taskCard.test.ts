// Run: cd backend && npx tsx src/slack/views/taskCard.test.ts
import assert from "node:assert/strict";
import { buildTaskBundle, buildTaskCardBlocks, type CardTask } from "./taskCard.js";
import { LIMITS, assertBlockBudget, loadingView, memberRef, progressBar, relativeDue, taskUrl, trunc } from "./common.js";

let passed = 0;
function check(name: string, run: () => void) { run(); passed++; console.log(`✓ ${name}`); }
const now = new Date("2026-10-09T12:00:00Z");
const task: CardTask = { id: "t1", title: "Build the prototype", status: "TODO", priority: "HIGH",
  dueDate: new Date("2026-10-06T23:00:00Z"), projectId: "p1", project: { name: "SEARCH" },
  assignees: [{ id: "m1", slackId: "U123", displayName: "Henry" }],
  milestone: { title: "CDR", dueDate: new Date("2026-11-14T12:00:00Z") },
  subtaskCounts: { done: 1, total: 3 }, blockedByOpen: 2, categoryBlockers: ["Order delays"], loggedMinutes: 150 };
const viewer = { memberId: "m2", isAssignee: false, canEdit: true };
function actionIds(blocks: ReturnType<typeof buildTaskCardBlocks>) {
  return blocks.flatMap(b => b.type === "actions" ? b.elements.map(e => "action_id" in e ? e.action_id : "") : []);
}

check("TODO includes each unique action and actionable status", () => {
  const blocks = buildTaskCardBlocks(task, viewer, now);
  assertBlockBudget(blocks, LIMITS.messageBlocks);
  const ids = actionIds(blocks);
  assert.deepEqual(ids, ["tc_status", "tc_done", "tc_assign_me", "tc_log_time", "tc_more"]);
  assert.equal(new Set(ids).size, ids.length);
  const actions = blocks.find(b => b.type === "actions");
  assert(actions?.type === "actions");
  const status = actions.elements[0];
  assert(status.type === "static_select");
  assert.deepEqual(JSON.parse(status.initial_option!.value), { t: "t1", s: "TODO" });
  const more = actions.elements.at(-1)!;
  assert(more.type === "static_select");
  assert.equal(more.options?.length, 8);
  for (const element of actions.elements) {
    if (element.type === "button") assert.deepEqual(JSON.parse(element.value!), { t: "t1" });
    if (element.type === "static_select") for (const option of element.options ?? []) assert.equal(JSON.parse(option.value).t, "t1");
  }
});
check("DONE omits Mark done", () => {
  const blocks = buildTaskCardBlocks({ ...task, status: "DONE" }, viewer, now);
  assertBlockBudget(blocks, LIMITS.messageBlocks);
  assert(!actionIds(blocks).includes("tc_done"));
  assert(JSON.stringify(blocks).includes(":large_green_circle: Done"));
});
check("assignees do not see Assign me", () => {
  const blocks = buildTaskCardBlocks(task, { ...viewer, isAssignee: true }, now);
  assertBlockBudget(blocks, LIMITS.messageBlocks);
  assert(!actionIds(blocks).includes("tc_assign_me"));
});
check("read-only viewers have no mutation controls", () => {
  const blocks = buildTaskCardBlocks(task, { ...viewer, canEdit: false }, now);
  assertBlockBudget(blocks, LIMITS.messageBlocks);
  assert.equal(actionIds(blocks).length, 0);
});
check("card renders overdue date, blockers and logged hours", () => {
  const blocks = buildTaskCardBlocks(task, viewer, now);
  assertBlockBudget(blocks, LIMITS.messageBlocks);
  const text = JSON.stringify(blocks);
  for (const phrase of ["3 days overdue", "Blocked by 2 tasks", "Order delays", "2h 30m logged", "<@U123>", "CDR", "1 of 3"]) assert(text.includes(phrase));
});
check("120-character titles truncate in headers", () => {
  const blocks = buildTaskCardBlocks({ ...task, title: "x".repeat(120) }, viewer, now);
  assertBlockBudget(blocks, LIMITS.messageBlocks);
  const header = blocks[0];
  assert(header.type === "header");
  assert.equal(header.text.text.length, 100);
  assert(header.text.text.endsWith("…"));
});
check("seven tasks yield five cards and two compact lines", () => {
  const tasks = Array.from({ length: 7 }, (_, i) => ({ ...task, id: `t${i}`, title: `Task ${i}` }));
  const bundle = buildTaskBundle("Henry", ["Ada", "Ada"], tasks, () => viewer, now);
  assertBlockBudget(bundle.blocks, LIMITS.messageBlocks);
  assert.equal(bundle.blocks.filter(b => b.type === "header").length, 5);
  assert(bundle.blocks.some(b => b.type === "section" && b.text?.text.includes("• Task 5") && b.text.text.includes("• Task 6")));
  assert(JSON.stringify(bundle).includes("Ada assigned you 7 tasks"));
  assert.equal(bundle.text, "7 new tasks assigned to you");
});
check("large bundles keep compact text within Slack limits", () => {
  const tasks = Array.from({ length: 100 }, (_, i) => ({ ...task, id: `t${i}`, title: "x".repeat(100) }));
  const bundle = buildTaskBundle("Henry", ["Ada", "Grace"], tasks, () => viewer, now);
  assertBlockBudget(bundle.blocks, LIMITS.messageBlocks);
  for (const block of bundle.blocks) if (block.type === "section" && block.text) assert(block.text.text.length <= LIMITS.sectionText);
  assert(JSON.stringify(bundle).includes("You have 100 new tasks"));
});
check("relative due dates use calendar days", () => {
  assert.equal(relativeDue("2026-10-17T00:00:00Z", now), "in 8 days");
  assert.equal(relativeDue("2026-10-09T23:59:00Z", now), "today");
  assert.equal(relativeDue("2026-10-08T23:59:00Z", now), "1 day overdue");
});
check("helper truncation, budget, member fallback and progress", () => {
  assert.equal(trunc("abcd", 3), "ab…");
  assert.equal(trunc("abcd", 0), "");
  assert.throws(() => assertBlockBudget([{}, {}], 1));
  assert.equal(memberRef({ displayName: "A & B" }), "A &amp; B");
  assert.equal(progressBar(1, 3), "■■□□□□ 1 of 3");
  assert.equal(progressBar(0, 0), "□□□□□□ 0 of 0");
  assert(taskUrl("project space", "task?").includes("project%20space?task=task%3F"));
});
check("loading view obeys modal limits", () => {
  const view = loadingView("x".repeat(50));
  assertBlockBudget(view.blocks, LIMITS.viewBlocks);
  assert.equal(view.title.text.length, LIMITS.modalTitle);
  assert.equal(view.blocks.length, 1);
});
console.log(`${passed} tests passed`);
