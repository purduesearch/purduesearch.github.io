import assert from "node:assert/strict";
import { parentAssignmentError, deleteBlockedReason, deleteConfirmationMatches } from "./projectHierarchyCore.js";

const top = { id: "p1", parentId: null, trainingForMemberId: null };
assert.equal(parentAssignmentError({ projectId: null, parent: top, childCount: 0 }), null);
assert.equal(parentAssignmentError({ projectId: "c1", parent: top, childCount: 0 }), null);
assert.match(parentAssignmentError({ projectId: null, parent: null, childCount: 0 })!, /not found/);
assert.match(parentAssignmentError({ projectId: "p1", parent: top, childCount: 0 })!, /own parent/);
assert.match(parentAssignmentError({ projectId: "c1", parent: { ...top, id: "p2", parentId: "p1" }, childCount: 0 })!, /own sub-projects/);
assert.match(parentAssignmentError({ projectId: "c1", parent: top, childCount: 2 })!, /cannot become a sub-project/);
assert.match(parentAssignmentError({ projectId: null, parent: { ...top, trainingForMemberId: "m" }, childCount: 0 })!, /training/);

assert.equal(deleteBlockedReason([]), null);
assert.match(deleteBlockedReason(["A", "B"])!, /A, B/);
assert.ok(deleteBlockedReason(["1", "2", "3", "4", "5", "6"])!.endsWith("…"));

assert.equal(deleteConfirmationMatches("Lunar Rover", " Lunar Rover "), true);
assert.equal(deleteConfirmationMatches("Lunar Rover", "lunar rover"), false);
assert.equal(deleteConfirmationMatches("Lunar Rover", undefined), false);
console.log("Project hierarchy tests passed");
