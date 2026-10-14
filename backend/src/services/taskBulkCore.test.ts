import assert from "node:assert/strict";
import { normalizeBulkPatch, planTaskPatch, moveRoots, dependencyNeighbors, matchByName, type BulkTaskState, type BulkProjectScope } from "./taskBulkCore.js";

let passed = 0;
function test(name: string, fn: () => void) {
  fn(); passed++; console.log(`PASS ${name}`);
}

const task = (over: Partial<BulkTaskState> = {}): BulkTaskState => ({
  id: "t1", projectId: "p1", parentTaskId: null, subtaskCount: 0, dueDate: new Date("2026-10-10T00:00:00Z"),
  assigneeIds: ["a"], tagIds: ["tag1"], blockerIds: [], ...over,
});
const scope: BulkProjectScope = {
  tagIds: new Set(["tag1", "tag2"]), milestoneIds: new Set(["ms1"]),
  openBlockerIds: new Set(["b1"]), parentCandidateIds: new Set(["parent"]),
};

test("normalize drops unknown keys and bad enums", () => {
  assert.equal(normalizeBulkPatch({ status: "NOPE", evil: 1 }), null);
  assert.deepEqual(normalizeBulkPatch({ priority: "HIGH", storyPoints: 2.6, estimatedHours: -1 }), { priority: "HIGH", storyPoints: 3 });
  assert.deepEqual(normalizeBulkPatch({ addTagIds: ["x", "x", 5, ""] }), { addTagIds: ["x"] });
  assert.deepEqual(normalizeBulkPatch({ dueDate: null, milestoneId: null }), { dueDate: null, milestoneId: null });
  assert.equal(normalizeBulkPatch({ dueShiftDays: 1.5 }), null);
});

test("add and remove assignees are relative to each task", () => {
  const plan = planTaskPatch(task(), { addAssigneeIds: ["b"], removeAssigneeIds: ["a"] }, scope);
  assert.ok(plan.ok); assert.deepEqual(plan.patch.assigneeIds, ["b"]);
});

test("an add that changes nothing is a no-op", () => {
  const plan = planTaskPatch(task(), { addAssigneeIds: ["a"] }, scope);
  assert.deepEqual(plan, { ok: false, reason: "No change" });
});

test("tags from another project are not applied", () => {
  const plan = planTaskPatch(task(), { addTagIds: ["foreign", "tag2"] }, scope);
  assert.ok(plan.ok); assert.deepEqual(plan.patch.tagIds, ["tag1", "tag2"]);
});

test("remove tag", () => {
  const plan = planTaskPatch(task(), { removeTagIds: ["tag1"] }, scope);
  assert.ok(plan.ok); assert.deepEqual(plan.patch.tagIds, []);
});

test("due date shift moves only tasks with a due date", () => {
  const plan = planTaskPatch(task(), { dueShiftDays: 7 }, scope);
  assert.ok(plan.ok); assert.equal(plan.patch.dueDate, "2026-10-17T00:00:00.000Z");
  assert.equal(planTaskPatch(task({ dueDate: null }), { dueShiftDays: 7 }, scope).ok, false);
});

test("clearing a due date is flagged separately", () => {
  const plan = planTaskPatch(task(), { dueDate: null }, scope);
  assert.ok(plan.ok); assert.equal(plan.clearDueDate, true); assert.equal(plan.patch.dueDate, undefined);
});

test("milestone must belong to the project", () => {
  assert.equal(planTaskPatch(task(), { milestoneId: "other" }, scope).ok, false);
  const plan = planTaskPatch(task(), { milestoneId: null }, scope);
  assert.ok(plan.ok); assert.equal(plan.patch.milestoneId, null);
});

test("blockers attach and detach against the current set", () => {
  const add = planTaskPatch(task(), { addBlockerIds: ["b1"] }, scope);
  assert.ok(add.ok); assert.deepEqual(add.patch.blockerIds, ["b1"]);
  const remove = planTaskPatch(task({ blockerIds: ["b1", "b9"] }), { removeBlockerIds: ["b1"] }, scope);
  assert.ok(remove.ok); assert.deepEqual(remove.patch.blockerIds, ["b9"]);
  assert.equal(planTaskPatch(task(), { addBlockerIds: ["resolved"] }, scope).ok, false);
});

test("nesting rules stay one level deep", () => {
  assert.equal(planTaskPatch(task({ subtaskCount: 2 }), { parentTaskId: "parent" }, scope).ok, false);
  assert.equal(planTaskPatch(task(), { parentTaskId: "t1" }, scope).ok, false);
  assert.equal(planTaskPatch(task(), { parentTaskId: "elsewhere" }, scope).ok, false);
  const nest = planTaskPatch(task(), { parentTaskId: "parent" }, scope);
  assert.ok(nest.ok); assert.equal(nest.patch.parentTaskId, "parent");
  const promote = planTaskPatch(task({ parentTaskId: "parent" }), { parentTaskId: null }, scope);
  assert.ok(promote.ok); assert.equal(promote.patch.parentTaskId, null);
});

test("subtasks of a selected parent move with it", () => {
  assert.deepEqual(moveRoots([
    { id: "p", parentTaskId: null }, { id: "c", parentTaskId: "p" }, { id: "lone", parentTaskId: "other" },
  ]), ["p", "lone"]);
});

test("dependency neighbors are the outside ends of crossing edges", () => {
  const edges = [
    { blockingTaskId: "a", blockedTaskId: "b" },
    { blockingTaskId: "a", blockedTaskId: "x" },
    { blockingTaskId: "y", blockedTaskId: "b" },
    { blockingTaskId: "x", blockedTaskId: "y" },
  ];
  assert.deepEqual(dependencyNeighbors(edges, new Set(["a", "b"])), [
    { id: "x", relation: "blocked-by" },
    { id: "y", relation: "blocks" },
  ]);
});

test("names match across projects ignoring case and spacing", () => {
  const matches = matchByName(
    [{ id: "s1", name: "  Hardware " }, { id: "s2", name: "Urgent" }, { id: "s1", name: "Hardware" }],
    [{ id: "t1", name: "hardware" }],
  );
  assert.deepEqual(matches, [
    { sourceId: "s1", name: "Hardware", targetId: "t1" },
    { sourceId: "s2", name: "Urgent", targetId: null },
  ]);
});

console.log(`\n${passed} passed`);
