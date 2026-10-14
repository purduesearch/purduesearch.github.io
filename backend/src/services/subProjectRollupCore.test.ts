import assert from "node:assert/strict";
import {
  ROLLUP_FLAGS,
  ROLLUP_OFF,
  DEFAULT_ROLLUP_COLOR,
  settingsFromRow,
  normalizeRollupPatch,
  rollupBadge,
  contributingChildren,
  canEditProjectRule,
} from "./subProjectRollupCore.js";

// settingsFromRow
assert.deepEqual(settingsFromRow(null), ROLLUP_OFF);
for (const f of ROLLUP_FLAGS) assert.equal(settingsFromRow(null)[f], false);
const merged = settingsFromRow({ tasks: true, tagEnabled: true, tagLabel: "Leaf" });
assert.equal(merged.tasks, true);
assert.equal(merged.github, false);
assert.equal(merged.tagLabel, "Leaf");
assert.equal(merged.tagColor, null);

// normalizeRollupPatch
const bad = (body: unknown) => {
  const r = normalizeRollupPatch(body);
  assert.equal(r.ok, false);
};
bad(null);
bad([]);
bad({ tasks: "yes" });
bad({ tagEnabled: 1 });
bad({ tagColor: "red" });
bad({ tagColor: "#12345" });
bad({ tagLabel: "x".repeat(41) });
bad({ tagLabel: 5 });
const okEmpty = normalizeRollupPatch({ tagLabel: "" });
assert.ok(okEmpty.ok && okEmpty.patch.tagLabel === null);
const okFull = normalizeRollupPatch({ tasks: true, tagLabel: "  Leaf  ", tagColor: "#2ECC71", bogus: 1 });
assert.ok(okFull.ok);
if (okFull.ok) assert.deepEqual(okFull.patch, { tasks: true, tagLabel: "Leaf", tagColor: "#2ECC71" });
const okNull = normalizeRollupPatch({ tagColor: null });
assert.ok(okNull.ok && okNull.patch.tagColor === null);
const ok40 = normalizeRollupPatch({ tagLabel: "x".repeat(40) });
assert.ok(ok40.ok);

// rollupBadge
const child = { id: "c1", name: "Leaf Replicas" };
assert.deepEqual(rollupBadge(child, ROLLUP_OFF), {
  projectId: "c1",
  projectName: "Leaf Replicas",
  label: "Leaf Replicas",
  color: DEFAULT_ROLLUP_COLOR,
  tagEnabled: false,
});
const custom = rollupBadge(child, { ...ROLLUP_OFF, tagEnabled: true, tagLabel: "Leaves", tagColor: "#2ecc71" });
assert.equal(custom.label, "Leaves");
assert.equal(custom.color, "#2ecc71");
assert.equal(custom.tagEnabled, true);

// contributingChildren
const kids = [
  { id: "a", status: "ACTIVE", rollup: { tasks: true } },
  { id: "b", status: "ARCHIVED", rollup: { tasks: true } },
  { id: "c", status: "ACTIVE", rollup: { tasks: false } },
  { id: "d", status: "ACTIVE", rollup: null },
];
assert.deepEqual(contributingChildren(kids, "tasks").map((k) => k.id), ["a"]);
assert.deepEqual(contributingChildren(kids, "vault"), []);

// canEditProjectRule truth table
for (const slackChannelId of [null, "C1"]) {
  for (const inChannel of [false, true]) {
    for (const addedManually of [false, true]) {
      for (const viaParent of [false, true]) {
        const expected = !slackChannelId || inChannel || addedManually || viaParent;
        assert.equal(
          canEditProjectRule({ slackChannelId, inChannel, addedManually, viaParent }),
          expected,
        );
      }
    }
  }
}
assert.equal(canEditProjectRule({ slackChannelId: "C1", inChannel: false, addedManually: false, viaParent: false }), false);

console.log("Sub-project roll-up core tests passed");
