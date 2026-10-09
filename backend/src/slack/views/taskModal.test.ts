import assert from "node:assert/strict";
import { buildTaskModal, parseTaskModal, type TaskModalState, type TaskModalMetadata, type ViewStateValues } from "./taskModal.js";
import { assertBlockBudget } from "./common.js";

let passed = 0;
function test(name: string, run: () => void) { run(); passed++; console.log(`ok ${name}`); }
const opt = (value: string) => ({ value, text: { type: "plain_text" as const, text: value } });
const base: TaskModalState = { mode: "create", projectLocked: false, sections: [], subtaskRows: 1,
  initial: { projectId: "project" }, options: { projects: [opt("project")], tags: [], milestones: [], blockers: [] } };
const metadata = (state: TaskModalState): TaskModalMetadata => JSON.parse(buildTaskModal(state).private_metadata!);
const field = (value: string) => ({ type: "plain_text_input", value });
const select = (value: string) => ({ type: "static_select", selected_option: opt(value) });
const valid: ViewStateValues = { title_block: { title: field("Build pump") }, project_block: { project: select("project") } };

test("basic create modal has fewer than 30 blocks", () => {
  const view = buildTaskModal(base);
  assertBlockBudget(view.blocks, 29);
  assert.equal(view.callback_id, "task_modal_submit");
  assert(!view.blocks.some(b => "block_id" in b && b.block_id === "status_block"));
  const project = view.blocks.find(b => "block_id" in b && b.block_id === "project_block");
  assert(project?.type === "input" && project.dispatch_action);
  assert.equal(view.blocks.filter(b => b.type === "actions" && b.elements.some(e => "action_id" in e && e.action_id === "tm_section")).length, 5);
});
test("all sections and ten subtasks fit the modal budget", () => {
  const state: TaskModalState = { ...base, mode: "edit", sections: ["subtasks", "deps", "links", "meta", "estimate"], subtaskRows: 10 };
  const view = buildTaskModal(state);
  assertBlockBudget(view.blocks, 100);
  assert.equal(view.blocks.filter(b => "block_id" in b && /^tm_sub_\d+$/.test(b.block_id ?? "")).length, 10);
  assert(!view.blocks.some(b => b.type === "actions" && b.elements.some(e => "action_id" in e && e.action_id === "tm_add_sub")));
  assert(view.blocks.some(b => "block_id" in b && b.block_id === "status_block"));
  assert.equal(metadata(state).subtaskRows, 10);
});
test("basics retain stable IDs when sections expand", () => {
  const ids = buildTaskModal(base).blocks.filter(b => b.type === "input").map(b => b.block_id);
  const expanded = buildTaskModal({ ...base, sections: ["deps", "subtasks"], subtaskRows: 3 });
  assert.deepEqual(expanded.blocks.filter(b => b.type === "input" && ids.includes(b.block_id)).map(b => b.block_id), ids);
  assertBlockBudget(expanded.blocks, 100);
});
test("title and project are required", () => {
  assert.equal(parseTaskModal({}, metadata(base)).errors.title_block, "Enter a title.");
  assert.equal(parseTaskModal({ ...valid, title_block: { title: field(" ") } }, metadata(base)).errors.title_block, "Enter a title.");
  assert(parseTaskModal({ ...valid, title_block: { title: field("x".repeat(201)) } }, metadata(base)).errors.title_block);
  assert(parseTaskModal({ ...valid, project_block: { project: select("none") } }, metadata(base)).errors.project_block);
});
test("parser reads both link formats", () => {
  const result = parseTaskModal({ ...valid, links_block: { links: field("https://example.com/a\nPump manual | https://example.com/b\n") } }, metadata(base));
  assert.deepEqual(result.input.attachments, [{ url: "https://example.com/a" }, { label: "Pump manual", url: "https://example.com/b" }]);
  assert.deepEqual(result.errors, {});
  assert(parseTaskModal({ ...valid, links_block: { links: field("broken") } }, metadata(base)).errors.links_block);
});
test("none placeholders disappear and non-numeric hours are ignored", () => {
  const values: ViewStateValues = { ...valid, estimated_hours_block: { estimated_hours: field("4 hours") },
    tags_block: { tags: { type: "multi_static_select", selected_options: [opt("none"), opt("tag")] } },
    milestone_block: { milestone: select("none") }, recurrence_block: { recurrence: select("NONE") },
    parent_task_block: { tm_parent: select("none") }, blockers_block: { blockers: { type: "multi_static_select", selected_options: [opt("none")] } } };
  const input = parseTaskModal(values, metadata(base)).input;
  assert.equal(input.estimatedHours, undefined);
  assert.deepEqual(input.tagIds, ["tag"]);
  assert.deepEqual(input.blockerIds, []);
  assert.equal(input.milestoneId, undefined);
  assert.equal(input.parentTaskId, undefined);
  assert.equal(input.recurrence, undefined);
  assert.equal(parseTaskModal({ ...valid, estimated_hours_block: { estimated_hours: field("0") } }, metadata(base)).input.estimatedHours, 0);
});
test("locked project comes from metadata and subtasks cap at ten", () => {
  const state: TaskModalState = { ...base, projectLocked: true, sections: ["subtasks"], subtaskRows: 99 };
  const values: ViewStateValues = { ...valid, project_block: { project: select("wrong") } };
  for (let n = 0; n < 11; n++) values[`tm_sub_${n}`] = { tm_subtask: field(`Sub ${n}`) };
  const parsed = parseTaskModal(values, metadata(state));
  assert.equal(parsed.input.projectId, "project");
  assert.equal(parsed.input.subtasks.length, 10);
  assert.deepEqual(parsed.errors, {});
  assertBlockBudget(buildTaskModal(state).blocks, 100);
});
console.log(`taskModal: ${passed} passed, 0 failed`);
