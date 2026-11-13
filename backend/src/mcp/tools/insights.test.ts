import assert from "node:assert/strict";
import { registerInsightsTools, type InsightsToolsDependencies, type SkillCoverage } from "./insights.js";
import { fakeContext, fakeServer } from "./testHarness.js";
import { TaxonomyError } from "../../services/skillTaxonomyService.js";
import type { InsightTaskRow } from "../../services/projectInsightsCore.js";
import type { TimeInsights } from "../../services/timeInsightsService.js";

let passed = 0;
async function test(name: string, run: () => unknown) { await run(); passed++; console.log(`PASS ${name}`); }

const NOW = new Date("2026-11-13T12:00:00Z");
const row = (id: string, extra: Partial<InsightTaskRow> = {}): InsightTaskRow => ({
  id, status: "TODO", priority: "MEDIUM", createdAt: new Date("2026-11-01T00:00:00Z"), completedAt: null, dueDate: null,
  updatedAt: NOW, storyPoints: null, estimatedHours: null, assigneeIds: [], ...extra });
const rows = [
  row("t1", { assigneeIds: ["m1"], estimatedHours: 4, dueDate: new Date("2026-11-10T00:00:00Z") }),
  row("t2", { assigneeIds: ["m1", "m2"], status: "BLOCKED" }),
  row("t3", { status: "DONE", completedAt: new Date("2026-11-11T00:00:00Z"), storyPoints: 3 }),
];
const time: TimeInsights = { from: "2026-09-18", to: "2026-11-13",
  totals: { minutes: 150, manualMinutes: 100, labMinutes: 50, unallocatedLabMinutes: 0 },
  byWeek: [{ weekStart: "2026-11-09", manualMinutes: 100, labMinutes: 50 }],
  byMember: [{ memberId: "m1", displayName: "Zed Secret", avatarUrl: null, minutes: 150, labMinutes: 50 }], byProject: [],
  tasks: [{ id: "t1", title: "TASKTITLE", status: "TODO", minutes: 150, labMinutes: 50, firstLoggedAt: null, completedAt: null, activeDays: null, assignees: [] }] };
const coverage = (): SkillCoverage => ({ members: [{ id: "m1", displayName: "Ann Alpha", groups: [{ skills: Array.from({ length: 4 }, (_, i) => ({
  skillId: `s${i}`, name: `Skill${i}`, level: 3, confidence: "HIGH", evidence: [{ summary: `ev${i}a` }, { summary: `ev${i}b` }] })) },
  { skills: [{ skillId: "s9", name: "Skill9", level: 2, confidence: "LOW", evidence: [] }, { skillId: "s10", name: "Skill10", level: 2, confidence: "LOW", evidence: [] }] }] }] });

function setup(overrides: Partial<InsightsToolsDependencies> = {}, access = {}) {
  const calls: string[] = [];
  const { server, call } = fakeServer();
  registerInsightsTools(server, fakeContext({ now: NOW, ...access }), {
    loadRows: async () => { calls.push("rows"); return rows; },
    loadRoster: async () => { calls.push("roster"); return [{ id: "m1", displayName: "Ann Alpha" }, { id: "m2", displayName: "Bob Beta" }]; },
    loadTime: async () => { calls.push("time"); return time; },
    loadSkills: async () => { calls.push("skills"); return coverage(); },
    now: () => NOW, ...overrides });
  return { call, calls };
}

await test("ungranted project is 403 and no loader runs", async () => {
  const w = setup();
  const { result, body } = await w.call("get_project_insights", { projectId: "p2" });
  assert.equal(result.isError, true); assert.equal(body.error.status, 403); assert.deepEqual(w.calls, []);
});
await test("numbers pass through from injected rows", async () => {
  const { result, body } = await setup().call("get_project_insights", { projectId: "p1" });
  assert.ok(!result.isError);
  assert.equal(body.weeks, 8); assert.equal(body.projectId, "p1");
  assert.equal(body.kpis.open, 2); assert.equal(body.kpis.done, 1); assert.equal(body.kpis.overdue, 1); assert.equal(body.kpis.blocked, 1);
  assert.equal(body.workload.find((w: { memberId: string }) => w.memberId === "m1").openTasks, 2);
  assert.equal(body.time.totals.minutes, 150);
  assert.equal(body.time.byMember[0].manualMinutes, 100);
  assert.equal(body.weekly.length, 8);
});
await test("weeks out of range is rejected, in-range honored", async () => {
  const w = setup();
  for (const weeks of [0, 27, 1.5]) {
    const { result, body } = await w.call("get_project_insights", { projectId: "p1", weeks });
    assert.equal(result.isError, true); assert.equal(body.error.status, 400);
  }
  assert.deepEqual(w.calls, []);
  const { body } = await w.call("get_project_insights", { projectId: "p1", weeks: 26 });
  assert.equal(body.weekly.length, 26);
});
await test("skill loader FORBIDDEN -> not_a_member; other error -> unavailable; tool succeeds", async () => {
  const a = await setup({ loadSkills: async () => { throw new TaxonomyError("FORBIDDEN", "x"); } }).call("get_project_insights", { projectId: "p1" });
  assert.ok(!a.result.isError); assert.deepEqual(a.body.skills, { available: false, reason: "not_a_member" });
  const b = await setup({ loadSkills: async () => { throw new Error("boom"); } }).call("get_project_insights", { projectId: "p1" });
  assert.ok(!b.result.isError); assert.deepEqual(b.body.skills, { available: false, reason: "unavailable" });
});
await test("display names, skill names, evidence and task titles only inside untrusted", async () => {
  const { body } = await setup().call("get_project_insights", { projectId: "p1" });
  const { untrusted: top, ...rest } = body; const { untrusted: sk, ...skillsRest } = body.skills;
  const outside = JSON.stringify({ ...rest, skills: skillsRest });
  for (const s of ["Ann Alpha", "Bob Beta", "Zed Secret", "Skill0", "ev0a", "TASKTITLE"]) assert.ok(!outside.includes(s), `${s} leaked`);
  assert.equal(top.kind, "untrusted_member_data");
  assert.equal(top.content.members.m1, "Ann Alpha"); assert.equal(top.content.members.m2, "Bob Beta");
  assert.equal(sk.kind, "untrusted_member_data");
});
await test("skills capped at 5 per member and 1 evidence per skill", async () => {
  const { body } = await setup().call("get_project_insights", { projectId: "p1" });
  assert.equal(body.skills.available, true);
  assert.equal(body.skills.members.m1.length, 5);
  const named = body.skills.untrusted.content.members.m1;
  assert.equal(named.length, 5);
  assert.ok(named.every((s: { evidence: string[] }) => s.evidence.length <= 1));
  assert.deepEqual(named[0].evidence, ["ev0a"]);
});
console.log(`${passed} tests passed`);
