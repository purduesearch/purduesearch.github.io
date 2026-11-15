import assert from "node:assert/strict";
import { test } from "node:test";
import { getPathway, type PathwayStore } from "./pathwayService.js";

const task = (id: string, over: Record<string, unknown> = {}) => ({
  id, title: "Flight control firmware", projectId: "p1", projectName: "P1", status: "TODO", archivedAt: null as Date | null, assigneeCount: 0, ...over,
});
function store(over: Partial<PathwayStore> = {}): PathwayStore {
  return {
    occupation: async code => code === "17-2011.00" ? { code, title: "Aerospace Engineers" } : null,
    software: async () => [{ example: "SolidWorks", exampleNorm: "solidworks", categoryId: "2.E.1", hot: true, inDemand: true }],
    ratings: async () => [{ elementId: "2.A.1", scale: "IM", value: 4 }],
    elements: async ids => [{ id: "2.A.1", name: "Critical Thinking", domain: "ESSENTIAL_SKILL" }, { id: "4.A.2.b.2.o.18", name: "Create models", domain: "DWA" }].filter(e => ids.includes(e.id)),
    occupationDwas: async () => ["4.A.2.b.2.o.18"],
    emerging: async () => [{ id: 1, task: "Program flight control firmware", category: "New" }],
    related: async () => [{ code: "17-2051.00", tier: "Primary-Short", rank: 1 }, { code: "gone", tier: "Primary-Short", rank: 2 }],
    occupationTitles: async codes => codes.filter(c => c === "17-2051.00").map(code => ({ code, title: "Civil Engineers" })),
    skillNodes: async () => [{ id: "cad", canonicalId: null }, { id: "cad2", canonicalId: "cad" }],
    allLinks: async kind => kind === "SOFTWARE" ? [{ skillId: "cad2", ref: "solidworks" }] : [],
    assessments: async () => [{ skillId: "cad", provenance: "AI_INFERRED", level: 3 }],
    openDisputes: async () => [], goals: async () => [],
    snapshots: async () => [{ metricId: "cad_revisions", value: 4 }],
    memberProjectIds: async () => ["p1"],
    tasksInProjects: async () => [task("ok")],
    ...over,
  };
}

test("unknown code returns null", async () => {
  assert.equal(await getPathway("m", "00-0000.00", { store: store() }), null);
});

test("assembles pathway for a member", async () => {
  const p = (await getPathway("m", "17-2011.00", { store: store() }))!;
  assert.equal(p.tools[0].status, "demonstrated");
  assert.equal(p.skills[0].notInferred, true);
  assert.deepEqual(p.activities.map(a => a.dwaId), ["4.A.2.b.2.o.18"]);
  assert.deepEqual(p.related.map(r => r.code), ["17-2051.00"]);
  assert.deepEqual(p.emerging[0].tasks.map(t => t.id), ["ok"]);
});

test("only open, unassigned, unarchived tasks in the member projects", async () => {
  const p = (await getPathway("m", "17-2011.00", { store: store({ tasksInProjects: async () => [
    task("ok"), task("other-project", { projectId: "p2" }), task("assigned", { assigneeCount: 1 }),
    task("done", { status: "DONE" }), task("archived", { archivedAt: new Date() }), task("blocked", { status: "BLOCKED" }),
  ] }) }))!;
  assert.deepEqual(p.emerging[0].tasks.map(t => t.id), ["ok"]);
});

test("member with no projects gets no suggested tasks", async () => {
  const p = (await getPathway("m", "17-2011.00", { store: store({ memberProjectIds: async () => [] }) }))!;
  assert.deepEqual(p.emerging[0].tasks, []);
});
