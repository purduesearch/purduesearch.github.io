// Natural-language skill questions: parsing, fusion, citation validation. No DB, no network.
// Run: cd backend && npx tsx src/services/skillQuery.test.ts

import { buildAliasIndex } from "./skillMatchCore.js";
import {
  buildAskPrompt, dot, fuseRanks, isSkillIntent, parseStructuredQuery, topBySimilarity, validateAskAnswer, ASK_JSON_SCHEMA,
  type AskPerson,
} from "./skillQueryCore.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`, detail ?? ""); }
}

const index = buildAliasIndex([
  { id: "pcb", name: "PCB Design", aliases: ["Printed circuit board layout", "PCB Layout"] },
  { id: "thermal", name: "Thermal Analysis", aliases: ["Heat Transfer Analysis"] },
  { id: "cad", name: "CAD", aliases: ["Computer-Aided Design"] },
  { id: "sw", name: "SolidWorks", aliases: ["SW"] },
  { id: "cpp", name: "C++", aliases: ["cpp"] },
  { id: "c", name: "C", aliases: [] },
  { id: "fea", name: "Finite Element Analysis", aliases: ["FEA"] },
]);

// ── structured parse ──
{
  const q = parseStructuredQuery("PCB design, level >= 3, active in the last 6 months", index);
  check("skill found from multi-word name", q.skillIds.join() === "pcb", q);
  check("level >= 3 parsed", q.minLevel === 3);
  check("6 months -> 180 days", q.activeWithinDays === 180);
}
check("alias phrase found", parseStructuredQuery("who knows printed circuit board layout?", index).skillIds.join() === "pcb");
check("two skills in one question", parseStructuredQuery("someone with CAD and thermal analysis experience", index).skillIds.sort().join() === "cad,thermal");
check("short ambiguous alias ignored inside a sentence", parseStructuredQuery("who has SW time on the rover", index).skillIds.length === 0);
check("C++ is not C", parseStructuredQuery("any C++ people?", index).skillIds.join() === "cpp");
check("lone C is too ambiguous to match", parseStructuredQuery("who can do C", index).skillIds.length === 0);
check("FEA found (3 letters ok)", parseStructuredQuery("who can run FEA on the bracket", index).skillIds.join() === "fea");
check("no skill -> empty", parseStructuredQuery("who is good with a soldering iron", index).skillIds.length === 0);
check("expert word -> level 5", parseStructuredQuery("expert in thermal analysis", index).minLevel === 5);
check("advanced word -> level 4", parseStructuredQuery("advanced CAD", index).minLevel === 4);
check("at least level 4", parseStructuredQuery("CAD at least level 4", index).minLevel === 4);
check("l3+ shorthand", parseStructuredQuery("CAD L3+", index).minLevel === 3);
check("no level mentioned -> null", parseStructuredQuery("who knows CAD", index).minLevel === null);
check("past year -> 365", parseStructuredQuery("CAD in the past year", index).activeWithinDays === 365);
check("last 3 weeks -> 21", parseStructuredQuery("CAD within the last 3 weeks", index).activeWithinDays === 21);
check("'recently' -> 180", parseStructuredQuery("who has recently done thermal analysis", index).activeWithinDays === 180);
check("handles empty/odd input", parseStructuredQuery("", index).skillIds.length === 0 && parseStructuredQuery("???", index).minLevel === null);

// ── intent ──
for (const q of ["who could take over thermal analysis on this enclosure?", "Who is good at PCB design?", "which experts do we have", "who should we staff on the rover", "what skills does the team have"]) check(`staffing intent: ${q}`, isSkillIntent(q));
for (const q of ["what is overdue this week?", "summarize the blockers", "when is the next milestone"]) check(`not staffing intent: ${q}`, !isSkillIntent(q));

// ── vectors ──
check("dot basics", dot([1, 0], [1, 0]) === 1 && dot([1, 0], [0, 1]) === 0);
check("size mismatch scores 0", dot([1, 0], [1, 0, 0]) === 0 && dot([], []) === 0);
{
  const items = [{ id: "a", embedding: [1, 0] }, { id: "b", embedding: [0.8, 0.6] }, { id: "c", embedding: [0, 1] }];
  const top = topBySimilarity([1, 0], items, 2, 0.35);
  check("top-k by similarity, threshold applied", top.map((t) => t.id).join() === "a,b" && top[0].similarity === 1);
  check("below threshold dropped", !topBySimilarity([1, 0], items, 5, 0.35).some((t) => t.id === "c"));
}
{
  const fused = fuseRanks([["a", "b", "c"], ["c", "a", "d"]]);
  check("fusion rewards agreement", fused[0] === "a" && fused.indexOf("c") < fused.indexOf("b"), fused);
  check("fusion keeps every id once", new Set(fused).size === 4 && fused.length === 4);
  check("single list keeps order", fuseRanks([["x", "y"], []]).join() === "x,y");
}

// ── prompt ──
const people: AskPerson[] = [
  {
    key: "p1", displayName: "Alice", title: "Structures", skills: [{ name: "Thermal Analysis", provenance: "AI_INFERRED", level: 4, confidence: "HIGH", lastDemonstrated: "2026-09-10", trend: "STABLE" }],
    evidence: [{ key: "e1", summary: "Ran thermal sim of the enclosure.", source: "task", date: "2026-09-10", project: "Rover", contribution: "AUTHORED", complexity: 4 }, { key: "e2", summary: "Reviewed a heat sink design.", source: "review", date: "2026-08-01", project: "Rover", contribution: "REVIEWED", complexity: 3 }],
  },
  {
    key: "p2", displayName: "Bob", title: null, skills: [{ name: "Thermal Analysis", provenance: "SELF_CLAIMED", level: 5, confidence: "LOW", lastDemonstrated: null, trend: "STABLE" }],
    evidence: [{ key: "e3", summary: "Wrote a thermal note.", source: "manual", date: "2026-07-01", project: null, contribution: "ASSISTED", complexity: 2 }],
  },
];
{
  const prompt = buildAskPrompt('who could take over "thermal analysis"?', "Today is X.", people, "Scope.");
  check("prompt carries evidence ids and provenance", prompt.includes("[e1]") && prompt.includes("self claimed") && prompt.includes("ai inferred"));
  check("prompt forbids ranking people", /Never rank people by overall worth/.test(prompt));
  check("prompt keeps the question quoted safely", !prompt.includes('"thermal analysis"?"'));
  check("prompt says advisory", /advisory/.test(prompt));
  check("schema requires answer + people", ASK_JSON_SCHEMA.required.join() === "answer,people");
}

// ── answer validation ──
{
  const good = validateAskAnswer({ answer: "Alice [e1] has run thermal sims; Bob's claim [e9] has little backing.", people: [{ person: "p1", why: "Ran the enclosure sim.", evidence: ["e1", "e2"] }] }, people);
  check("valid answer kept", !good.usedFallback && good.people.length === 1 && good.people[0].evidenceKeys.join() === "e1,e2");
  check("invented citation stripped from prose", !good.answer.includes("e9") && good.answer.includes("[e1]"), good.answer);
}
{
  const r = validateAskAnswer({ answer: "Pick p3.", people: [{ person: "p3", why: "x", evidence: ["e1"] }] }, people);
  check("unknown person dropped -> plain fallback", r.usedFallback && r.people.length === 2 && r.people[0].person === "p1");
}
{
  const r = validateAskAnswer({ answer: "Alice is great.", people: [{ person: "p1", why: "x", evidence: ["e3"] }] }, people);
  check("evidence from another person is not accepted", r.usedFallback, r);
}
{
  const r = validateAskAnswer({ answer: "Alice is great.", people: [{ person: "p1", why: "x", evidence: [] }] }, people);
  check("naming someone with no citation falls back", r.usedFallback);
}
{
  const r = validateAskAnswer({ answer: "No one has clear evidence for this.", people: [] }, people);
  check("honest 'no one' answer accepted", !r.usedFallback && r.people.length === 0);
}
check("garbage / null falls back", validateAskAnswer(null, people).usedFallback && validateAskAnswer({ answer: 5 }, people).usedFallback && validateAskAnswer("x", people).usedFallback);
check("fallback with nobody says so", validateAskAnswer(null, []).answer.startsWith("No one") && validateAskAnswer(null, []).people.length === 0);
{
  const many = validateAskAnswer({ answer: "ok", people: [{ person: "p1", why: "x".repeat(900), evidence: ["e1"] }, { person: "p1", why: "dup", evidence: ["e1"] }] }, people);
  check("duplicates dropped, why truncated", many.people.length === 1 && many.people[0].why.length <= 300);
}
{
  const r = validateAskAnswer({ answer: "x".repeat(5000) + " [e1]", people: [{ person: "p1", why: "ok", evidence: ["e1"] }] }, people);
  check("answer length capped", r.answer.length <= 1200);
}

console.log(`skillQuery: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
