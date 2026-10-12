// Skill taxonomy matching: alias dedupe, cycle guard, candidate prefilter.
// No DB, no network. Run: cd backend && npx tsx src/services/skillMatchCore.test.ts

import {
  boundedLevenshtein,
  buildAliasIndex,
  nearSkillMatches,
  normalizeSkillName,
  rankSkillCandidates,
  resolveSkillName,
  wouldCreateCycle,
  type SkillLite,
} from "./skillMatchCore.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}

const skills: SkillLite[] = [
  { id: "react", name: "React", aliases: ["ReactJS", "React.js"] },
  { id: "cpp", name: "C++", aliases: ["cpp", "C plus plus"] },
  { id: "csharp", name: "C#", aliases: [] },
  { id: "sw", name: "SolidWorks", aliases: ["Solid Works", "SW"] },
  { id: "pcb", name: "PCB Design", aliases: ["Printed circuit board layout"] },
  { id: "js", name: "JavaScript", aliases: ["JS"] },
  { id: "fea", name: "Finite Element Analysis", aliases: ["FEA", "Structural simulation"] },
];
const index = buildAliasIndex(skills);

// ── normalisation ──
check("React variants collapse", normalizeSkillName("React") === normalizeSkillName("ReactJS") && normalizeSkillName("React.js") === normalizeSkillName("react"));
check("c++ not equal c#", normalizeSkillName("C++") !== normalizeSkillName("C#"));
check("c++ not equal c", normalizeSkillName("C++") !== normalizeSkillName("C"));
check("js itself survives", normalizeSkillName("JS") === "js");
check("diacritics + punctuation stripped", normalizeSkillName("  Électro-Magnétics ") === "electromagnetics");
check("empty stays empty", normalizeSkillName("  ...  ") === "");

// ── resolve ──
check("alias resolves", resolveSkillName("React.js", index) === "react");
check("case/space insensitive", resolveSkillName("solid  WORKS", index) === "sw");
check("c plus plus alias", resolveSkillName("C plus plus", index) === "cpp");
check("unknown name is null", resolveSkillName("Kubernetes", index) === null);
check("blank is null", resolveSkillName("   ", index) === null);
check("no collisions in clean taxonomy", index.collisions.length === 0);

const dirty = buildAliasIndex([
  { id: "a", name: "Python", aliases: [] },
  { id: "b", name: "Scripting", aliases: ["python"] },
]);
check("collision reported", dirty.collisions.length === 1 && dirty.collisions[0].skillIds.length === 2);
check("first skill wins a collision", resolveSkillName("python", dirty) === "a");

// ── near matches (admin hint only) ──
check("levenshtein basic", boundedLevenshtein("kitten", "sitten", 1) === 1);
check("levenshtein bound", boundedLevenshtein("abcdef", "uvwxyz", 1) === 2);
check("typo near-matches", nearSkillMatches("Solidwork", index).includes("sw"));
check("short names never near-match", nearSkillMatches("Go", index).length === 0);
check("exact-different not near", nearSkillMatches("Thermodynamics", index).length === 0);

// ── cycles ──
const edges = [{ fromId: "a", toId: "b" }, { fromId: "b", toId: "c" }];
check("self edge is a cycle", wouldCreateCycle(edges, "a", "a"));
check("closing edge is a cycle", wouldCreateCycle(edges, "c", "a"));
check("transitive cycle", wouldCreateCycle(edges, "c", "b"));
check("diamond (two parents) is fine", !wouldCreateCycle(edges, "a", "c"));
check("unrelated edge fine", !wouldCreateCycle(edges, "d", "a"));

// ── candidate prefilter ──
const ranked = rankSkillCandidates("Rebuilt the bracket in SolidWorks and ran FEA on the mount", skills, 3);
check("SolidWorks ranked", ranked.some((r) => r.id === "sw"));
check("FEA ranked via alias", ranked.some((r) => r.id === "fea"));
check("limit respected", ranked.length <= 3);
check("irrelevant skills absent", !rankSkillCandidates("Ordered pizza", skills, 5).length);
check("deterministic order", JSON.stringify(rankSkillCandidates("PCB design in solidworks", skills, 5)) === JSON.stringify(rankSkillCandidates("PCB design in solidworks", skills, 5)));

console.log(`skillMatchCore: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
