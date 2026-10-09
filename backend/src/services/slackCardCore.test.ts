import assert from "node:assert/strict";
import { bundleIsDue, planBundles, BUNDLE_QUIET_MS, BUNDLE_MAX_WAIT_MS, type QueueRow } from "./slackCardCore.js";

let passed = 0;
function test(name: string, fn: () => void) {
  fn(); passed++; console.log(`PASS ${name}`);
}
const now = new Date("2026-10-09T12:00:00Z");
const row = (id: string, age: number, recipientId = "m1", entityId = id, entityType = "TASK"): QueueRow =>
  ({ id, queuedAt: new Date(now.getTime() - age), recipientId, entityId, entityType });

test("empty queue is not due", () => assert.equal(bundleIsDue([], now), false));
test("quiet window waits until exactly ten minutes", () => {
  assert.equal(bundleIsDue([row("a", BUNDLE_QUIET_MS - 1)], now), false);
  assert.equal(bundleIsDue([row("a", BUNDLE_QUIET_MS)], now), true);
});
test("new arrival resets quiet window", () => assert.equal(bundleIsDue([row("a", 11 * 60_000), row("b", 1)], now), false));
test("hard cap wins over new arrival at fifteen minutes", () => {
  assert.equal(bundleIsDue([row("a", BUNDLE_MAX_WAIT_MS - 1), row("b", 1)], now), false);
  assert.equal(bundleIsDue([row("a", BUNDLE_MAX_WAIT_MS), row("b", 1)], now), true);
});
test("dedupe entities but retain every queue row in time order", () => {
  const rows = [row("b", 11 * 60_000, "m1", "t1"), row("a", 12 * 60_000, "m1", "t1"), row("c", 10 * 60_000, "m1", "t2")];
  assert.deepEqual(planBundles(rows, now), [{ recipientId: "m1", rowIds: ["a", "b", "c"], entityIds: ["t1", "t2"] }]);
  assert.deepEqual(rows.map(r => r.id), ["b", "a", "c"]);
});
test("recipients have independent quiet windows", () => {
  assert.deepEqual(planBundles([row("a", BUNDLE_QUIET_MS), row("b", 1, "m2")], now),
    [{ recipientId: "m1", rowIds: ["a"], entityIds: ["a"] }]);
});
test("different entity kinds never share bundles or deduplication", () => {
  const bundles = planBundles([row("a", BUNDLE_QUIET_MS), row("b", BUNDLE_QUIET_MS, "m1", "a", "MEETING_POLL")], now);
  assert.equal(bundles.length, 2);
  assert.deepEqual(bundles.map(b => b.rowIds), [["a"], ["b"]]);
});
test("tied timestamps retain queue order", () => assert.deepEqual(planBundles([row("b", BUNDLE_QUIET_MS), row("a", BUNDLE_QUIET_MS)], now)[0].entityIds, ["b", "a"]));
console.log(`slackCardCore: ${passed} passed, 0 failed`);
