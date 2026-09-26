import assert from "node:assert/strict";
import { buildReviewItems, canSignoff, matchesRule, proposalFingerprint, reviewGate, shouldAuditHead, type PrSnapshot } from "./vaultReviewPolicy.js";

const item = { itemId: "part", versionId: "v1", subsystem: "PROP/VALVE", parentIds: ["assembly"] };
const rule = { id: "rule", scope: "SUBSYSTEM", value: "PROP", reviewerId: "owner" };
const pr: PrSnapshot = { title: "Valve", state: "open", draft: false, headSha: "a".repeat(40), author: "author", reviews: [{ login: "reviewer", state: "APPROVED", submittedAt: "2026-09-25", headSha: "a".repeat(40) }], checks: [{ name: "build", status: "completed", conclusion: "success" }], timeline: [] };
const signed = { memberId: "owner", fingerprint: proposalFingerprint([item]), prHeadSha: pr.headSha };
const gate = (overrides: Partial<Parameters<typeof reviewGate>[0]> = {}) => reviewGate({ items: [item], rules: [rule], signoffs: [signed], pr, prLinked: true, requiredChecks: ["build"], ...overrides });

assert.equal(matchesRule(rule, item), true);
assert.equal(matchesRule({ ...rule, value: "PRO" }, item), false);
assert.equal(matchesRule({ ...rule, scope: "BOM_PARENT", value: "assembly" }, item), true);
assert.equal(matchesRule({ ...rule, scope: "BOM_PARENT", value: "other" }, item), false);
assert.equal(canSignoff("intruder", [rule], [item]), false);
assert.equal(canSignoff("owner", [rule], [item]), true);
assert.equal(shouldAuditHead(pr, pr), false); // duplicate/delayed webhook refetches the same head
assert.equal(shouldAuditHead({ ...pr, headSha: "b".repeat(40) }, pr), true);
assert.equal(gate().state, "approved");
assert.equal(gate({ items: [{ ...item, versionId: "v2" }] }).state, "stale");
assert.equal(gate({ pr: { ...pr, headSha: "b".repeat(40) } }).state, "stale");
assert.equal(gate({ pr: { ...pr, checks: [{ name: "build", status: "completed", conclusion: "failure" }] } }).state, "failing");
assert.equal(gate({ pr: { ...pr, checks: [] } }).state, "pending");
assert.equal(gate({ signoffs: [] }).state, "pending");
assert.equal(gate({ pr: { ...pr, reviews: [{ ...pr.reviews[0], state: "CHANGES_REQUESTED" }] } }).state, "failing");
assert.equal(gate({ pr: { ...pr, reviews: [{ ...pr.reviews[0], headSha: "b".repeat(40) }] } }).state, "pending");
assert.equal(gate({ pr: { ...pr, error: "permission lost" } }).state, "pending");
// Rules on a grandparent assembly apply in every caller, including the approval transaction.
const nested = buildReviewItems([{ itemId: "bolt", versionId: "v9" }], [{ id: "bolt", partNumber: "PROP/VALVE/BOLT" }], [{ childId: "bolt", parentId: "valve" }, { childId: "valve", parentId: "engine" }]);
assert.deepEqual(nested[0].parentIds?.sort(), ["engine", "valve"]);
assert.equal(nested[0].subsystem, "PROP/VALVE/BOLT");
assert.equal(reviewGate({ items: nested, rules: [{ ...rule, scope: "BOM_PARENT", value: "engine" }], signoffs: [], pr: null, prLinked: false, requiredChecks: [] }).state, "pending");
// A required reviewer who lost project access blocks approval with an actionable reason, and
// their old sign-off no longer counts.
const lost = gate({ activeReviewerIds: new Set(["someone-else"]) });
assert.equal(lost.state, "failing");
assert.equal(lost.required[0].state, "unauthorized");
assert.match(lost.reasons.join(" "), /reviewer rules/);
assert.equal(gate({ activeReviewerIds: new Set(["owner"]) }).state, "approved");
console.log("vault review policy passed");
