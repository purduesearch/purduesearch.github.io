// File-type signals, the Gemini lane's config/schema fallback, the admin matrix and
// the teammate profile view. Pure: no DB, no network.
// Run: cd backend && npx tsx src/services/skillSignal.test.ts

import { applySignalFloor, detectSignals, filesOf, SIGNAL_FLOOR_FIT } from "./skillSignalCore.js";
import { buildAliasIndex } from "./skillMatchCore.js";
import { prepareAnalysis, type TaxonomySkill } from "./skillAnalysisService.js";
import { isLegacyModel, isShapeUnsupported, skillsLlmConfig, toOpenApiSchema } from "./ai/skillsGemini.js";
import { ANALYSIS_JSON_SCHEMA, type SkillArtifact } from "./skillPrompts.js";
import { buildMatrix, buildProfileSkills, type AssessmentRow, type SkillNode } from "./skillViewCore.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`, detail ?? ""); }
}

const skills: TaxonomySkill[] = [
  { id: "cad", name: "CAD", type: "DOMAIN", aliases: [], parentIds: [] },
  { id: "sw", name: "SolidWorks", type: "TOOL", aliases: ["SW"], parentIds: ["cad"] },
  { id: "asm", name: "Assembly Design", type: "TECHNIQUE", aliases: [], parentIds: ["cad"] },
  { id: "py", name: "Python", type: "TOOL", aliases: [], parentIds: [] },
  { id: "ts", name: "TypeScript", type: "TOOL", aliases: [], parentIds: [] },
  { id: "react", name: "React", type: "TOOL", aliases: ["ReactJS"], parentIds: [] },
  { id: "kicad", name: "KiCad", type: "TOOL", aliases: [], parentIds: [] },
  { id: "pcb", name: "PCB Design", type: "TECHNIQUE", aliases: [], parentIds: [] },
  { id: "test", name: "Software Testing", type: "TECHNIQUE", aliases: [], parentIds: [] },
];
const index = buildAliasIndex(skills);

const base: SkillArtifact = {
  memberId: "m1", source: "GITHUB", sourceRef: "o/r#1", occurredAt: new Date("2026-10-01"), title: "Add telemetry parser",
  memberRole: "opened this pull request and it was merged", facts: {}, contentHash: "h",
  body: "Description:\nParse frames.\n\nLargest changed files:\nsrc/parser.py (+180/-20)\nsrc/ui/Panel.tsx (+12/-3)\ntests/test_parser.py (+30/-0)",
};

// ── detectSignals ──
{
  check("files parsed from body", filesOf(base).length === 3 && filesOf(base)[0].lines === 200);
  const sig = detectSignals(base, index, skills);
  const by = new Map(sig.map((s) => [s.skillId, s]));
  check("python is strong (authored, many lines)", by.get("py")?.strong === true);
  check("typescript under threshold is a hint", by.has("ts") && by.get("ts")!.strong === false);
  check("tsx also hints React, never strong", by.has("react") && !by.get("react")!.strong);
  check("test folder hints testing", by.has("test") && !by.get("test")!.strong);
  const review = detectSignals({ ...base, source: "REVIEW" }, index, skills);
  check("reviews only produce hints", review.length > 0 && review.every((s) => !s.strong));
  const cad = detectSignals({ ...base, source: "CAD", body: "No check-in note.", facts: { file_name: "Bracket.SLDASM" } }, index, skills);
  const cadBy = new Map(cad.map((s) => [s.skillId, s]));
  check("native CAD file is strong for the tool", cadBy.get("sw")?.strong === true);
  check("secondary concept (assembly) is a hint", cadBy.has("asm") && !cadBy.get("asm")!.strong);
  const unknown = detectSignals({ ...base, body: "Largest changed files:\nboard.kicad_pcb (+0/-0)", facts: {} }, buildAliasIndex(skills.filter((s) => s.id !== "kicad")), skills.filter((s) => s.id !== "kicad"));
  check("a concept missing from the taxonomy yields no signal", !unknown.some((s) => s.skillId === "kicad") && unknown.some((s) => s.skillId === "pcb"));
  const task = detectSignals({ ...base, source: "TASK", body: "Wire up the ReactJS dashboard", title: "Dashboard" }, index, skills);
  check("task text names produce hints", task.some((s) => s.skillId === "react" && !s.strong));
}

// ── floor ──
{
  const a = { skills: [{ skillId: "ts", fit: 0.8 }], warnings: [] as string[] };
  const out = applySignalFloor(a, [{ skillId: "py", reason: "x", strong: true }, { skillId: "react", reason: "x", strong: false }, { skillId: "ts", reason: "x", strong: true }], 8);
  check("strong missing signal added at floor fit", out.skills.some((s) => s.skillId === "py" && s.fit === SIGNAL_FLOOR_FIT));
  check("hints never added", !out.skills.some((s) => s.skillId === "react"));
  check("model fit never lowered", out.skills.find((s) => s.skillId === "ts")!.fit === 0.8);
  check("floor noted in warnings", out.warnings.length === 1);
  check("no change returns same object", applySignalFloor(a, [], 8) === a);
}

// ── prompt ──
{
  const prep = prepareAnalysis(base, { skills, index });
  check("prompt lists detected signals by key", /Detected signals:\ns\d+: Python \(200 changed lines in \.py files\)/.test(prep.prompt) || /s\d+: Python \(/.test(prep.prompt));
  check("candidates show their parent area", /SolidWorks \(tool, under CAD\)/.test(prep.prompt));
  check("signals carried for the floor", prep.signals.some((s) => s.skillId === "py" && s.strong));
}

// ── Gemini config ──
{
  check("2.0 models are legacy", isLegacyModel("gemini-2.0-flash-lite") && isLegacyModel("gemini-1.5-pro") && !isLegacyModel("gemini-2.5-flash") && !isLegacyModel("gemini-3-flash"));
  const legacy = skillsLlmConfig({ GEMINI_API_KEY: "k", GEMINI_MODEL: "gemini-2.0-flash-lite" });
  check("legacy model uses OpenAPI schema and no thinking", legacy.schemaMode === "openapi" && legacy.thinkingBudget === null && legacy.problems.length === 0);
  const flash25 = skillsLlmConfig({ GEMINI_API_KEY: "k", SKILLS_MODEL: "gemini-2.5-flash" });
  check("2.5 gets a bounded thinking budget and room to answer", flash25.schemaMode === "json" && flash25.thinkingBudget === 512 && flash25.maxOutputTokens >= 4096);
  check("explicit thinking budget wins", skillsLlmConfig({ GEMINI_API_KEY: "k", SKILLS_MODEL: "gemini-2.5-flash", SKILLS_THINKING_BUDGET: "0" }).thinkingBudget === 0);
  const missing = skillsLlmConfig({});
  check("missing key and model are reported, not thrown", missing.problems.length === 2 && missing.keySet === false);
  const oa = toOpenApiSchema(ANALYSIS_JSON_SCHEMA) as { type: string; properties: { skills: { type: string; items: { type: string; properties: { key: { type: string } } } } } };
  check("schema converted to upper-case types recursively", oa.type === "OBJECT" && oa.properties.skills.type === "ARRAY" && oa.properties.skills.items.properties.key.type === "STRING");
  check("schema rejection detected", isShapeUnsupported({ status: 400, message: "Invalid JSON payload received. Unknown name \"responseJsonSchema\"" }));
  check("quota error is not a shape error", !isShapeUnsupported({ status: 429, message: "RESOURCE_EXHAUSTED" }));
}

// ── matrix ──
const nodes: SkillNode[] = [
  { id: "cad", slug: "cad", name: "CAD", type: "DOMAIN", parentIds: [] },
  { id: "sw", slug: "sw", name: "SolidWorks", type: "TOOL", parentIds: ["cad"] },
  { id: "py", slug: "py", name: "Python", type: "TOOL", parentIds: [] },
];
const row = (memberId: string, skillId: string, provenance: AssessmentRow["provenance"], level: number, over: Partial<AssessmentRow> = {}): AssessmentRow & { memberId: string } => ({
  memberId, skillId, provenance, level, confidence: 0.5, confidenceBand: "MEDIUM", firstSeen: null, lastDemonstrated: new Date("2026-09-01"),
  trend: "STABLE", rationale: "r", evidenceCount: 2, assertedById: provenance === "AI_INFERRED" ? "" : "x", note: "secret note", computedAt: new Date(), ...over,
});
{
  const members = [{ id: "a", displayName: "Ana", avatarUrl: null, title: null }, { id: "b", displayName: "Bo", avatarUrl: null, title: null }];
  const m = buildMatrix([
    row("a", "sw", "AI_INFERRED", 4), row("a", "sw", "MANAGER_VERIFIED", 3), row("b", "sw", "AI_INFERRED", 2),
    row("b", "py", "SELF_CLAIMED", 5), row("a", "py", "AI_INFERRED", 3),
  ], nodes, members, "advisory");
  const cellA = m.members.find((x) => x.id === "a")!.cells.sw;
  check("cell shows the highest-trust row", cellA.provenance === "MANAGER_VERIFIED" && cellA.level === 3);
  check("columns grouped under taxonomy root", m.groups.some((g) => g.name === "CAD" && g.skills.some((s) => s.id === "sw" && s.holders === 2)));
  check("self-claims do not count as strong", m.groups.find((g) => g.name === "Python")!.skills[0].strong === 1);
  check("single points of knowledge listed", m.singlePoints.some((p) => p.skillId === "sw" && p.memberId === "a") && m.singlePoints.some((p) => p.skillId === "py" && p.memberId === "a"));
  check("members alphabetical, no score field", m.members.map((x) => x.displayName).join() === "Ana,Bo" && !JSON.stringify(m).includes("score"));
  check("matrix never carries notes or rationale", !JSON.stringify(m).includes("secret note") && !JSON.stringify(m).includes("rationale"));
}

// ── teammate profile view ──
{
  const evidence = [
    { id: "e1", skillIds: ["sw"], source: "CAD", summary: "Designed bracket", sourceUrl: null, occurredAt: new Date("2026-09-01"), projectId: "p1", projectName: "Rover" },
    { id: "e2", skillIds: ["sw"], source: "GITHUB", summary: "Private repo work", sourceUrl: "https://github.com/x/y/pull/1", occurredAt: new Date("2026-09-02"), projectId: "p2", projectName: "Secret" },
  ];
  const input = {
    viewerId: "v", viewerProjectIds: new Set(["p1"]), showOnProfile: true, skills: nodes,
    assessments: [row("a", "sw", "AI_INFERRED", 3, { confidenceBand: "LOW" }), row("a", "sw", "PEER_ENDORSED", 4, { assertedById: "v" }), row("a", "py", "AI_INFERRED", 2)],
    skillVisibility: new Map([["py", false]]), disputedSkillIds: new Set<string>(), evidence,
  };
  const g = buildProfileSkills(input);
  const sw = g.flatMap((x) => x.skills).find((s) => s.skillId === "sw")!;
  check("hidden skills left out", !g.flatMap((x) => x.skills).some((s) => s.skillId === "py"));
  check("peer row leads over analysis; confidence still shown", sw.lead === "PEER_ENDORSED" && sw.level === 4 && sw.confidence === "LOW");
  check("viewer's own endorsement exposed", sw.myEndorsement === 4 && sw.endorsements === 1);
  check("only shared-project evidence shown", sw.evidence.length === 1 && sw.evidence[0].summary === "Designed bracket");
  check("no notes or rationale leak", !JSON.stringify(g).includes("secret note") && !JSON.stringify(g).includes("rationale"));
  check("admin (null projects) sees all evidence", buildProfileSkills({ ...input, viewerProjectIds: null }).flatMap((x) => x.skills)[0].evidence.length === 2);
  check("turned off shows nothing", buildProfileSkills({ ...input, showOnProfile: false }).length === 0);
  check("disputed skills withheld", buildProfileSkills({ ...input, disputedSkillIds: new Set(["sw"]) }).length === 0);
}

console.log(`skillSignal: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
