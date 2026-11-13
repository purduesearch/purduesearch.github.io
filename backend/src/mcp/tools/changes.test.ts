import assert from "node:assert/strict";
import { registerChangeTools, parseCursor, serializeCursor, CHANGE_PAGE_SIZE, type ChangeCursor, type ChangeEventRow } from "./changes.js";
import { fakeContext, fakeServer, type FakeAccessOptions } from "./testHarness.js";

let passed = 0;
async function test(name: string, run: () => unknown) { await run(); passed++; console.log(`PASS ${name}`); }
const NOW = new Date("2026-11-13T12:00:00Z");
const ago = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000);

function event(id: string, projectId: string, at: Date, extra: Partial<ChangeEventRow> = {}): ChangeEventRow {
  return { id, projectId, taskId: null, source: "WEB", eventType: "TASK_UPDATED", payload: {}, createdAt: at,
    member: { displayName: "Priya" }, task: null, ...extra } as ChangeEventRow;
}

function world(events: ChangeEventRow[], options: Partial<FakeAccessOptions> = {}) {
  const queries: { projectIds: string[]; after: ChangeCursor }[] = [];
  const saves: { expected: string | null; next: string }[] = [];
  const { server, call } = fakeServer();
  registerChangeTools(server, fakeContext({ now: NOW, ...options }), {
    loadEvents: async (projectIds, after) => {
      queries.push({ projectIds, after });
      return events.filter(e => projectIds.includes(e.projectId)
        && (e.createdAt > after.at || (e.createdAt.getTime() === after.at.getTime() && e.id > after.id)))
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id)).slice(0, CHANGE_PAGE_SIZE + 1);
    },
    saveCursor: async (_grant, expected, next) => { saves.push({ expected, next }); return true; },
    now: () => NOW,
  });
  return { call, queries, saves };
}

await test("cursor round-trips and rejects garbage", () => {
  const cursor = { at: ago(1), id: "e1" };
  assert.deepEqual(parseCursor(serializeCursor(cursor)), cursor);
  assert.deepEqual(parseCursor(serializeCursor({ at: NOW, id: "" })), { at: NOW, id: "" });
  for (const bad of [null, "", "nonsense", "not-a-date|e1"]) assert.equal(parseCursor(bad), null);
});
await test("default call returns events after the stored cursor and advances it to the last one", async () => {
  const stored = serializeCursor({ at: ago(5), id: "e0" });
  const w = world([event("e0", "p1", ago(5)), event("e1", "p1", ago(4)), event("e2", "p1", ago(2))], { changeCursor: stored });
  const { body } = await w.call("get_changes_since_last_check");
  assert.deepEqual(body.projects[0].events.map((e: { id: string }) => e.id), ["e1", "e2"]);
  assert.equal(body.cursorAdvanced, true);
  assert.deepEqual(w.saves, [{ expected: stored, next: serializeCursor({ at: ago(2), id: "e2" }) }]);
  assert.equal(body.projects[0].events[0].action, "task updated");
});
await test("projectId or since reads never move the cursor", async () => {
  const w = world([event("e1", "p1", ago(4))], { changeCursor: serializeCursor({ at: ago(10), id: "x" }) });
  await w.call("get_changes_since_last_check", { projectId: "p1" });
  await w.call("get_changes_since_last_check", { since: ago(6).toISOString() });
  assert.deepEqual(w.saves, []);
  assert.deepEqual(w.queries[1].after, { at: ago(6), id: "" });
});
await test("events outside granted, currently accessible projects never appear", async () => {
  const w = world([event("e1", "p1", ago(3)), event("e2", "p2", ago(2)), event("e3", "p3", ago(1))], { current: ["p1", "p2"], granted: ["p1", "p3"] });
  const { body } = await w.call("get_changes_since_last_check");
  assert.deepEqual(w.queries[0].projectIds, ["p1"]);
  assert.deepEqual(body.projects.map((p: { projectId: string }) => p.projectId), ["p1"]);
  for (const projectId of ["p2", "p3"]) {
    const { result } = await w.call("get_changes_since_last_check", { projectId });
    assert.equal(result.isError, true);
  }
});
await test("first check looks back seven days and an old since is clamped to fourteen", async () => {
  const w = world([]);
  await w.call("get_changes_since_last_check");
  assert.equal(w.queries[0].after.at.getTime(), ago(7 * 24).getTime());
  assert.deepEqual(w.saves, [{ expected: null, next: serializeCursor({ at: NOW, id: "" }) }]);
  await w.call("get_changes_since_last_check", { since: ago(90 * 24).toISOString() });
  assert.equal(w.queries[1].after.at.getTime(), ago(14 * 24).getTime());
});
await test("a full page reports more and leaves the cursor on the last returned event", async () => {
  const events = Array.from({ length: CHANGE_PAGE_SIZE + 5 }, (_, i) => event(`e${String(i).padStart(4, "0")}`, "p1", ago(10 - i / 100)));
  const w = world(events);
  const { body } = await w.call("get_changes_since_last_check");
  assert.equal(body.more, true);
  assert.equal(body.eventCount, CHANGE_PAGE_SIZE);
  const last = events[CHANGE_PAGE_SIZE - 1];
  assert.equal(w.saves[0].next, serializeCursor({ at: last.createdAt, id: last.id }));
});
await test("task titles from another project and oversized payloads are not passed through", async () => {
  const w = world([event("e1", "p1", ago(1), { taskId: "t9", task: { title: "Elsewhere", projectId: "p2" }, payload: { blob: "x".repeat(5000) } })]);
  const { body } = await w.call("get_changes_since_last_check");
  const e = body.projects[0].events[0];
  assert.equal(e.taskId, null); assert.equal(e.untrusted.content.taskTitle, null);
  assert.equal(e.untrusted.content.payload.truncated, true);
  assert.equal(e.untrusted.kind, "untrusted_member_data");
});

console.log(`\n${passed} passed`);
