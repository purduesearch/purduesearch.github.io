// Skill scoring: monotonicity, recency decay, level vs confidence separation,
// supersession, trend. No DB, no network.
// Run: cd backend && npx tsx src/services/skillScoringCore.test.ts

import {
  assessMember,
  assessSkill,
  bandFor,
  baseWeight,
  recencyDecay,
  type EvidenceInput,
} from "./skillScoringCore.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}

const NOW = new Date("2026-10-12T00:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
let n = 0;
function ev(over: Partial<EvidenceInput> & { ago?: number; fit?: number } = {}): EvidenceInput {
  const { ago = 10, fit = 1, ...rest } = over;
  return {
    id: `e${++n}`,
    source: "GITHUB",
    projectId: "p1",
    occurredAt: daysAgo(ago),
    contribution: "AUTHORED",
    complexity: 3,
    outcome: "MERGED",
    skills: [{ skillId: "s", fit }],
    ...rest,
  };
}

// ── weights ──
check("authored > reviewed > assisted", baseWeight({ contribution: "AUTHORED", complexity: 3, outcome: "MERGED" }, 1) > baseWeight({ contribution: "REVIEWED", complexity: 3, outcome: "MERGED" }, 1)
  && baseWeight({ contribution: "REVIEWED", complexity: 3, outcome: "MERGED" }, 1) > baseWeight({ contribution: "ASSISTED", complexity: 3, outcome: "MERGED" }, 1));
check("abandoned barely counts", baseWeight({ contribution: "AUTHORED", complexity: 5, outcome: "ABANDONED" }, 1) < baseWeight({ contribution: "AUTHORED", complexity: 1, outcome: "MERGED" }, 1));
check("fit scales weight", baseWeight({ contribution: "AUTHORED", complexity: 3, outcome: "MERGED" }, 0.5) === baseWeight({ contribution: "AUTHORED", complexity: 3, outcome: "MERGED" }, 1) / 2);
check("complexity clamped", baseWeight({ contribution: "AUTHORED", complexity: 99, outcome: "MERGED" }, 1) === baseWeight({ contribution: "AUTHORED", complexity: 5, outcome: "MERGED" }, 1));

// ── decay ──
check("fresh = 1", recencyDecay(0) === 1);
check("half-life halves", Math.abs(recencyDecay(270) - 0.5) < 1e-9);
check("decay floored", recencyDecay(5000) === 0.25);
check("decay monotone", recencyDecay(30) > recencyDecay(300));

// ── no evidence ──
check("no evidence -> null", assessSkill("s", [], NOW) === null);
check("other skill's evidence -> null", assessSkill("zzz", [ev()], NOW) === null);
check("superseded ignored", assessSkill("s", [{ ...ev(), superseded: true }], NOW) === null);

// ── level vs confidence separation ──
const one = assessSkill("s", [ev({ ago: 5, complexity: 4 })], NOW)!;
check("single item: level >= 1", one.level >= 1);
check("single item: LOW confidence", one.confidenceBand === "LOW");
check("single item: cannot reach level 3+", one.level <= 2);

const many = assessSkill("s", [
  ev({ ago: 5, complexity: 4, source: "GITHUB", projectId: "p1" }),
  ev({ ago: 20, complexity: 4, source: "CAD", projectId: "p2" }),
  ev({ ago: 40, complexity: 3, source: "TASK", projectId: "p3" }),
  ev({ ago: 60, complexity: 4, source: "GITHUB", projectId: "p2" }),
  ev({ ago: 80, complexity: 3, source: "CAD", projectId: "p1" }),
  ev({ ago: 90, complexity: 5, source: "GITHUB", projectId: "p3" }),
], NOW)!;
check("many diverse items: HIGH confidence", many.confidenceBand === "HIGH");
check("many diverse items: level >= 4", many.level >= 4);
check("level never exceeds 5", many.level <= 5);
check("evidence ids strongest first", many.evidenceIds.length === 6);
check("source diversity counted", many.sourceDiversity === 3 && many.projectDiversity === 3);
check("rationale mentions count", many.rationale.startsWith("6 evidence items across 3 sources"));

// Same level, different confidence: same weight mass, one source/project vs spread.
const narrow = assessSkill("s", [ev({ ago: 5, complexity: 4 }), ev({ ago: 6, complexity: 4 })], NOW)!;
const wide = assessSkill("s", [
  ev({ ago: 5, complexity: 4, source: "CAD", projectId: "p2" }),
  ev({ ago: 6, complexity: 4, source: "TASK", projectId: "p3" }),
], NOW)!;
check("same level when same weights", narrow.level === wide.level);
check("diversity raises confidence only", wide.confidence > narrow.confidence);

// ── monotonic in evidence ──
let prevMass = -1, monotone = true;
const pile: EvidenceInput[] = [];
for (let i = 0; i < 8; i++) {
  pile.push(ev({ ago: 10 + i, complexity: 3 }));
  const a = assessSkill("s", pile, NOW)!;
  const key = a.level * 10 + a.confidence;
  if (key < prevMass) monotone = false;
  prevMass = key;
}
check("more evidence never lowers level/confidence", monotone);

// ── gates ──
const manyTrivial = assessSkill("s", Array.from({ length: 12 }, (_, i) => ev({ ago: 3 + i, complexity: 1, contribution: "ASSISTED" })), NOW)!;
check("pile of trivial assists capped (needs complexity for L3+)", manyTrivial.level <= 2);
const abandoned = assessSkill("s", Array.from({ length: 6 }, (_, i) => ev({ ago: 3 + i, complexity: 5, outcome: "ABANDONED" })), NOW)!;
check("abandoned work stays low", abandoned.level <= 2 && abandoned.confidenceBand === "LOW");

// ── recency ──
const stale = assessSkill("s", [ev({ ago: 700 }), ev({ ago: 710 }), ev({ ago: 720 })], NOW)!;
const fresh = assessSkill("s", [ev({ ago: 7 }), ev({ ago: 8 }), ev({ ago: 9 })], NOW)!;
check("stale evidence has lower confidence", stale.confidence < fresh.confidence);
check("stale evidence fades", stale.trend === "FADING");
check("last demonstrated tracked", stale.lastDemonstrated.getTime() === daysAgo(700).getTime());
check("first seen tracked", stale.firstSeen.getTime() === daysAgo(720).getTime());

// ── trend ──
check("new skill is growing", assessSkill("s", [ev({ ago: 10 })], NOW)!.trend === "GROWING");
check("steady cadence is stable", assessSkill("s", [20, 60, 100, 140, 180, 220, 260].map((d) => ev({ ago: d })), NOW)!.trend === "STABLE");
check("activity burst is growing", assessSkill("s", [ev({ ago: 5 }), ev({ ago: 15 }), ev({ ago: 25 }), ev({ ago: 35 }), ev({ ago: 200 })], NOW)!.trend === "GROWING");
check("recent drought is fading", assessSkill("s", [ev({ ago: 100 }), ev({ ago: 120 }), ev({ ago: 140 }), ev({ ago: 160 })], NOW)!.trend === "FADING");

// ── determinism + multi-skill ──
const mixed = [ev({ skills: [{ skillId: "a", fit: 1 }, { skillId: "b", fit: 0.4 }] }), ev({ skills: [{ skillId: "a", fit: 1 }] })];
const m1 = assessMember(mixed, NOW), m2 = assessMember(mixed, NOW);
check("assessMember covers each skill once", m1.size === 2 && m1.has("a") && m1.has("b"));
check("assessMember deterministic", JSON.stringify([...m1]) === JSON.stringify([...m2]));
check("low-fit skill scores lower", m1.get("b")!.level <= m1.get("a")!.level);

// ── bands ──
check("band edges", bandFor(0.39) === "LOW" && bandFor(0.4) === "MEDIUM" && bandFor(0.69) === "MEDIUM" && bandFor(0.7) === "HIGH");

console.log(`skillScoringCore: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
