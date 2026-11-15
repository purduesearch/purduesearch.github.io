import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPathway, statusOf, tokens, SKILL_LIMIT, type PathwayInput } from "./pathwayCore.js";

const base = (over: Partial<PathwayInput> = {}): PathwayInput => ({
  occupation: { code: "17-2011.00", title: "Aerospace Engineers" },
  software: [], ratings: [], elements: [], softwareLinks: [], elementLinks: [], assessments: [],
  goalSkillIds: [], disputedSkillIds: [], metrics: [], dwas: [], emergingTasks: [], candidateTasks: [], related: [],
  ...over,
});
const sw = (example: string, hot = false, inDemand = false) => ({ example, exampleNorm: example.toLowerCase(), categoryId: "2.E.1", hot, inDemand });

test("statusOf covers every branch", () => {
  assert.equal(statusOf([{ provenance: "AI_INFERRED", level: 3 }], false, false), "demonstrated");
  assert.equal(statusOf([{ provenance: "MANAGER_VERIFIED", level: 1 }], false, false), "demonstrated");
  assert.equal(statusOf([{ provenance: "AI_INFERRED", level: 2 }], false, false), "learning");
  assert.equal(statusOf([], true, false), "learning");
  assert.equal(statusOf([{ provenance: "SELF_CLAIMED", level: 4 }], false, false), "claimed");
  assert.equal(statusOf([{ provenance: "SELF_CLAIMED", level: 4 }, { provenance: "AI_INFERRED", level: 1 }], false, false), "learning");
  assert.equal(statusOf([{ provenance: "AI_INFERRED", level: 5 }], false, true), "none");
  assert.equal(statusOf([{ provenance: "AI_INFERRED", level: 5 }], true, true), "learning");
  assert.equal(statusOf([], false, false), "none");
});

test("tools: only inDemand or hot, mapped through links with canonical identities", () => {
  const out = buildPathway(base({
    software: [sw("SolidWorks", true), sw("Excel", false, true), sw("Obscure"), sw("Matlab", false, true)],
    softwareLinks: [{ skillId: "cad-old", ref: "solidworks" }, { skillId: "xl", ref: "excel" }, { skillId: "ml", ref: "matlab" }],
    canonical: new Map([["cad-old", "cad"]]),
    assessments: [{ skillId: "cad", provenance: "AI_INFERRED", level: 3 }, { skillId: "xl", provenance: "SELF_CLAIMED", level: 4 }],
    goalSkillIds: ["ml"],
  }));
  assert.deepEqual(out.tools.map(t => [t.example, t.status]), [["SolidWorks", "demonstrated"], ["Excel", "claimed"], ["Matlab", "learning"]]);
});

test("disputed skill is not demonstrated, even through another identity", () => {
  const out = buildPathway(base({
    software: [sw("Python", true)], softwareLinks: [{ skillId: "py", ref: "python" }],
    canonical: new Map([["py-alias", "py"]]), assessments: [{ skillId: "py", provenance: "AI_INFERRED", level: 4 }],
    disputedSkillIds: ["py-alias"],
  }));
  assert.equal(out.tools[0].status, "none");
});

test("skills: top 7 by IM with deterministic ties, notInferred, status", () => {
  const ids = Array.from({ length: 10 }, (_, i) => `2.A.${i}`);
  const elements = ids.map((id, i) => ({ id, name: `Skill ${String.fromCharCode(74 - i)}`, domain: i % 2 ? "TRANSFERABLE_SKILL" : "ESSENTIAL_SKILL" }));
  elements.push({ id: "2.C.1", name: "Knowledge", domain: "KNOWLEDGE" });
  const ratings = [
    ...ids.map((id, i) => ({ elementId: id, scale: "IM", value: i < 4 ? 4 : 3 })),
    { elementId: "2.C.1", scale: "IM", value: 5 },
    { elementId: "2.A.0", scale: "LV", value: 7 },
    { elementId: "2.A.9", scale: "IM", value: 5, suppress: true },
  ];
  const input = base({ elements, ratings, elementLinks: [{ skillId: "c", ref: "2.A.0" }], assessments: [{ skillId: "c", provenance: "MANAGER_VERIFIED", level: 1 }] });
  const out = buildPathway(input);
  assert.equal(out.skills.length, SKILL_LIMIT);
  // 2.A.0..3 are IM 4 named J,I,H,G -> G,H,I,J; then IM 3 named F,E,D,C,B,A -> A,B,C
  assert.deepEqual(out.skills.map(s => s.name), ["Skill G", "Skill H", "Skill I", "Skill J", "Skill A", "Skill B", "Skill C"]);
  const first = out.skills.find(s => s.elementId === "2.A.0")!;
  assert.equal(first.status, "demonstrated"); assert.equal(first.notInferred, false);
  assert.equal(out.skills.find(s => s.elementId === "2.A.1")!.notInferred, true);
  const shuffled = buildPathway({ ...input, ratings: [...ratings].reverse(), elements: [...elements].reverse() });
  assert.deepEqual(shuffled, out);
});

test("activities: DWA intersection with nonzero metrics only", () => {
  const out = buildPathway(base({
    dwas: [{ dwaId: "d1", name: "Design" }, { dwaId: "d2", name: "Review" }, { dwaId: "d3", name: "Train" }],
    metrics: [{ metricId: "cad", dwaId: "d1", value: 2 }, { metricId: "rev", dwaId: "d2", value: 0 }, { metricId: "x", dwaId: null, value: 9 }, { metricId: "cad2", dwaId: "d1", value: 1 }],
  }));
  assert.deepEqual(out.activities, [{ dwaId: "d1", name: "Design", metricIds: ["cad", "cad2"] }]);
});

test("emerging: needs two shared normalized tokens; capped", () => {
  const e = [{ id: 1, task: "Develop machine learning models for flight control", category: "New" }];
  const mk = (id: string, title: string) => ({ id, title, projectId: "p", projectName: "P" });
  const out = buildPathway(base({ emergingTasks: e, candidateTasks: [
    mk("a", "Flight control tuning"), mk("b", "Flight schedule"), mk("c", "The and for"), mk("d", "Machine learning intro"),
  ] }));
  assert.deepEqual(out.emerging[0].tasks.map(t => t.id), ["a", "d"]);
  const many = Array.from({ length: 9 }, (_, i) => mk(`t${i}`, "machine learning"));
  assert.equal(buildPathway(base({ emergingTasks: e, candidateTasks: many })).emerging[0].tasks.length, 5);
  assert.deepEqual([...tokens("The AI of C++ 3D models")].sort(), ["models"]);
});

test("related: Primary tiers only, by rank", () => {
  const out = buildPathway(base({ related: [
    { code: "c", title: "C", tier: "Supplemental", rank: 1 }, { code: "b", title: "B", tier: "Primary-Long", rank: 2 }, { code: "a", title: "A", tier: "Primary-Short", rank: 1 },
  ] }));
  assert.deepEqual(out.related.map(r => r.code), ["a", "b"]);
});

test("no overall score field", () => {
  assert.deepEqual(Object.keys(buildPathway(base())).sort(), ["activities", "emerging", "occupation", "related", "skills", "tools"]);
});
