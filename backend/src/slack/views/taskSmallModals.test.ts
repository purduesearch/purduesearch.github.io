import assert from "node:assert/strict";
import { assertBlockBudget } from "./common.js";
import { buildLogTimeModal, buildCommentModal, buildSubtaskModal, buildBlockerModal, buildDependencyModal, buildArchiveModal, parseLogTime } from "./taskSmallModals.js";
for (const view of [buildLogTimeModal("t"), buildCommentModal("t"), buildSubtaskModal("t"), buildBlockerModal("t", []), buildBlockerModal("t", Array.from({ length: 120 }, (_, i) => ({ id: `${i}`, label: "x".repeat(100) }))), buildDependencyModal("t"), buildArchiveModal("t")]) {
  assertBlockBudget(view.blocks, 100);
  assert.equal(view.private_metadata, '{"t":"t"}');
  assert.ok(view.title.text.length <= 24);
}
assert.equal(parseLogTime("1h 30m"), 90);
assert.equal(parseLogTime("90"), 90);
assert.equal(parseLogTime("1.5h"), 90);
for (const value of ["", "0", "-1", "no", "1h garbage"]) assert.throws(() => parseLogTime(value));
const block = buildBlockerModal("t", Array.from({ length: 120 }, (_, i) => ({ id: `${i}`, label: "x".repeat(100) }))).blocks[0] as any;
assert.equal(block.element.options.length, 100);
assert.equal(block.element.options[0].text.text.length, 75);
assert.equal((buildDependencyModal("t").blocks[0] as any).element.action_id, "ts_dep_task");
console.log("taskSmallModals: modal budgets, metadata, limits and duration parsing passed");
