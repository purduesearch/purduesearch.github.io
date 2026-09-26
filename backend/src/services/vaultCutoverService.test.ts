import assert from "node:assert/strict";
import test from "node:test";
import { branchStatus, cutoverBlockers, cutoverTransition, hasCutoverAuthority, repairMessages } from "./vaultCutoverService.js";

const zero = { driveVersions: 0, driveThumbnails: 0, driveItems: 0 };

test("failed cutover stays blocked until baseline, jobs, and remote head agree", () => {
  assert.deepEqual(cutoverBlockers(null, zero, 0, true), ["LEGACY_BYTES"]);
  assert.deepEqual(cutoverBlockers(zero, { ...zero, driveThumbnails: 1 }, 1, false), ["LEGACY_BYTES", "PENDING_JOBS", "BRANCH_DRIFT"]);
  assert.deepEqual(cutoverBlockers(zero, zero, 0, true), []);
});

test("an external branch push is drift until the expected head is deliberately reconciled", () => {
  assert.equal(branchStatus("old", "external"), "BRANCH_DRIFT");
  assert.equal(branchStatus("external", "external"), "READY");
});

test("rollback closes new GitHub writes while preserving provider-pinned reads", () => {
  assert.deepEqual(cutoverTransition("rollback", "GITHUB_ACTIVE"), { migrationState: "DRIVE_ROLLBACK", writeEnabled: false });
  assert.equal(cutoverTransition("freeze", "GITHUB_ACTIVE"), null);
  assert.deepEqual(cutoverTransition("freeze", "DRIVE_ROLLBACK"), { migrationState: "FROZEN", writeEnabled: false });
});

test("cutover authority defaults closed and repair messages are distinct", () => {
  assert.equal(hasCutoverAuthority(undefined), false);
  assert.equal(hasCutoverAuthority(""), false);
  assert.equal(new Set(["AUTH", "PERMISSION", "GIT_ERROR", "LFS_QUOTA", "LFS_MISSING", "BRANCH_DRIFT"].map(code => repairMessages[code])).size, 6);
});
