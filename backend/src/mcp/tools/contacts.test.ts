import assert from "node:assert/strict";
import { registerContactsTools, ROSTER_WHERE, type ContactRow, type ExternalActionRecord } from "./contacts.js";
import { fakeContext, fakeServer } from "./testHarness.js";

let passed = 0;
async function test(name: string, run: () => unknown) { await run(); passed++; console.log(`PASS ${name}`); }

const NOW = new Date("2026-11-13T12:00:00Z");
const roster: ContactRow[] = [
  { memberId: "m9", isLead: false, displayName: "Zed Zulu", email: null, slackId: "U9", slackHandle: "zed", projectRole: "Contributor" },
  { memberId: "m2", isLead: true, displayName: "Ann Alpha", email: "ann@example.test", slackId: "U2", slackHandle: "ann", projectRole: "Captain" },
  { memberId: "m1", isLead: false, displayName: "Ann Alpha", email: "ann2@example.test", slackId: null, slackHandle: null, projectRole: null },
];

function setup(access: { scopes?: string[]; granted?: string[] } = {}, overrides = {}) {
  const calls: string[] = [], written: ExternalActionRecord[] = [];
  const { server, call } = fakeServer();
  registerContactsTools(server, fakeContext({ now: NOW, scopes: ["constellation.read", "constellation.contacts", "constellation.plan"], ...access }), {
    loadRoster: async () => { calls.push("roster"); return roster; },
    loadTask: async (projectId, id) => { calls.push("task"); return id === "t1" ? { id, projectId } : id === "tx" ? { id, projectId: "other" } : null; },
    recordAction: async r => { written.push(r); },
    ...overrides });
  return { call, calls, written };
}

await test("contacts require the contacts scope and run no loader", async () => {
  const w = setup({ scopes: ["constellation.read", "constellation.plan"] });
  const { result, body } = await w.call("get_project_contacts", { projectId: "p1" });
  assert.equal(result.isError, true); assert.equal(body.error.code, "insufficient_scope"); assert.equal(body.error.status, 403);
  assert.deepEqual(w.calls, []);
});
await test("contacts: ungranted project is 403", async () => {
  const w = setup();
  const { result, body } = await w.call("get_project_contacts", { projectId: "p2" });
  assert.equal(result.isError, true); assert.equal(body.error.status, 403); assert.deepEqual(w.calls, []);
});
await test("contacts: shape, ordering, null email, names only inside untrusted", async () => {
  const { result, body } = await setup().call("get_project_contacts", { projectId: "p1" });
  assert.ok(!result.isError);
  assert.deepEqual(body.contacts.map((c: { memberId: string }) => c.memberId), ["m1", "m2", "m9"]);
  assert.equal(body.contacts[2].untrusted.content.email, null);
  assert.equal(body.contacts[1].isLead, true);
  assert.equal(body.contacts[1].untrusted.kind, "untrusted_member_data");
  assert.equal(body.contacts[1].untrusted.content.email, "ann@example.test");
  const outside = JSON.stringify(body.contacts.map(({ untrusted, ...r }: { untrusted: unknown }) => r));
  for (const s of ["Ann", "Zed", "example.test", "U2", "Captain"]) assert.ok(!outside.includes(s), `${s} leaked`);
});
await test("default roster query excludes bots/deactivated and is project-scoped", async () => {
  assert.deepEqual(ROSTER_WHERE("p1"), { projectId: "p1", member: { isBot: false, deactivatedAt: null } });
});
await test("record requires plan scope", async () => {
  const w = setup({ scopes: ["constellation.read", "constellation.contacts"] });
  const { result, body } = await w.call("record_external_action", { projectId: "p1", app: "email", kind: "draft", summary: "x" });
  assert.equal(result.isError, true); assert.equal(body.error.status, 403); assert.deepEqual(w.written, []);
});
await test("record uses the log rate (20/hour)", async () => {
  const w = setup();
  for (let i = 0; i < 20; i++) assert.ok(!(await w.call("record_external_action", { projectId: "p1", app: "slack", kind: "dm", summary: "s" })).result.isError);
  const over = await w.call("record_external_action", { projectId: "p1", app: "slack", kind: "dm", summary: "s" });
  assert.equal(over.result.isError, true); assert.equal(w.written.length, 20);
  // read bucket is separate from log bucket
  assert.ok(!(await w.call("get_project_contacts", { projectId: "p1" })).result.isError);
});
await test("record: non-roster recipient is 400, nothing written", async () => {
  const w = setup();
  const { result, body } = await w.call("record_external_action", { projectId: "p1", app: "email", kind: "draft", summary: "s", recipientMemberIds: ["m1", "outsider"] });
  assert.equal(result.isError, true); assert.equal(body.error.status, 400);
  assert.equal(body.error.message, "Recipients must be members of this project."); assert.deepEqual(w.written, []);
});
await test("record: foreign or missing taskId is 404", async () => {
  const w = setup();
  for (const taskId of ["tx", "nope"]) {
    const { result, body } = await w.call("record_external_action", { projectId: "p1", taskId, app: "docs", kind: "k", summary: "s" });
    assert.equal(result.isError, true); assert.equal(body.error.status, 404);
    assert.equal(body.error.message, "Task is unavailable to this connection");
  }
  assert.deepEqual(w.written, []);
});
await test("record: exact payload, deduped recipients, actor from access", async () => {
  const w = setup();
  const { result, body } = await w.call("record_external_action", { projectId: "p1", taskId: "t1", app: "email", kind: "draft", summary: "Drafted update", recipientMemberIds: ["m1", "m2", "m1"] });
  assert.ok(!result.isError);
  assert.deepEqual(body, { recorded: true, projectId: "p1", taskId: "t1", app: "email" });
  assert.deepEqual(w.written, [{ projectId: "p1", taskId: "t1", memberId: "m", source: "AGENT", eventType: "AGENT_EXTERNAL_ACTION",
    payload: { client: "Claude", app: "email", kind: "draft", summary: "Drafted update", recipientMemberIds: ["m1", "m2"] } }]);
  const r2 = await w.call("record_external_action", { projectId: "p1", app: "other", kind: "k", summary: "s" });
  assert.equal(r2.body.taskId, null); assert.equal(w.written[1].taskId, undefined); assert.deepEqual(w.written[1].payload.recipientMemberIds, []);
});
await test("record: invalid input is 400 and writes nothing", async () => {
  const w = setup();
  const bad: Array<Record<string, unknown>> = [
    { app: "email", kind: "k", summary: "x".repeat(501) }, { app: "sms", kind: "k", summary: "s" },
    { app: "email", kind: "", summary: "s" }, { app: "email", kind: "k".repeat(41), summary: "s" },
    { app: "email", kind: "k", summary: "" },
    { app: "email", kind: "k", summary: "s", recipientMemberIds: Array.from({ length: 51 }, (_, i) => `m${i}`) },
    { app: "email", kind: "k", summary: "s", recipientMemberIds: [5] },
  ];
  for (const b of bad) {
    const { result, body } = await w.call("record_external_action", { projectId: "p1", ...b });
    assert.equal(result.isError, true); assert.equal(body.error.status, 400);
  }
  assert.deepEqual(w.written, []); assert.deepEqual(w.calls, []);
});
console.log(`${passed} tests passed`);
