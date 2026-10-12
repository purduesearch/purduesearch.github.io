// Privacy shaping: grouping, visible disagreement, and the public allow-list.
// No DB, no network. Run: cd backend && npx tsx src/services/skillView.test.ts

import {
  buildPublicPortfolio, disagreementOf, groupBy, normalizeSlug, shapeSkills, PUBLIC_EVIDENCE_PER_SKILL, PUBLIC_MAX_SKILLS,
  type AssessmentRow, type PortfolioInput, type SkillNode,
} from "./skillViewCore.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`, detail ?? ""); }
}

const nodes: SkillNode[] = [
  { id: "me", slug: "mechanical-engineering", name: "Mechanical Engineering", type: "DOMAIN", parentIds: [] },
  { id: "mfg", slug: "manufacturing", name: "Manufacturing", type: "DOMAIN", parentIds: [] },
  { id: "cad", slug: "cad", name: "CAD", type: "TECHNIQUE", parentIds: ["me"] },
  { id: "sw", slug: "solidworks", name: "SolidWorks", type: "TOOL", parentIds: ["cad"] },
  { id: "sheet", slug: "sheet-metal", name: "Sheet Metal Design", type: "TECHNIQUE", parentIds: ["cad", "mfg"] },
  { id: "lead", slug: "team-leadership", name: "Team Leadership", type: "SOFT_SKILL", parentIds: [] },
];
const row = (over: Partial<AssessmentRow> & { skillId: string; provenance: AssessmentRow["provenance"] }): AssessmentRow => ({
  level: 3, confidence: 0.6, confidenceBand: "MEDIUM", firstSeen: new Date("2026-01-01"), lastDemonstrated: new Date("2026-09-15"), trend: "STABLE",
  rationale: "3 evidence items across 2 sources", evidenceCount: 3, assertedById: "", note: null, computedAt: new Date("2026-10-01"), ...over,
});

// ── grouping ──
const g = groupBy(nodes);
check("tool groups under root domain through chain", g.get("sw")!.groupName === "Mechanical Engineering");
check("multi-parent skill: first root by name, other listed", g.get("sheet")!.groupName === "Manufacturing" && g.get("sheet")!.alsoUnder.includes("Mechanical Engineering"), g.get("sheet"));
check("root groups under itself", g.get("lead")!.groupId === "lead");
check("cycle in bad data does not hang", groupBy([{ id: "a", slug: "a", name: "A", type: "TOOL", parentIds: ["b"] }, { id: "b", slug: "b", name: "B", type: "TOOL", parentIds: ["a"] }]).size === 2);

// ── disagreement ──
check("self-only claim flagged", disagreementOf([{ provenance: "SELF_CLAIMED", level: 4, confidenceBand: "LOW" }])?.kind === "claim_without_evidence");
check("self 5 vs AI 2 flagged", disagreementOf([{ provenance: "SELF_CLAIMED", level: 5, confidenceBand: "LOW" }, { provenance: "AI_INFERRED", level: 2, confidenceBand: "MEDIUM" }])?.detail === "self claimed says 5, ai inferred says 2.");
check("one level apart is not a disagreement", disagreementOf([{ provenance: "SELF_CLAIMED", level: 3, confidenceBand: "LOW" }, { provenance: "AI_INFERRED", level: 2, confidenceBand: "MEDIUM" }]) === null);
check("AI only: nothing to compare", disagreementOf([{ provenance: "AI_INFERRED", level: 4, confidenceBand: "HIGH" }]) === null);
check("verified vs AI compared too", disagreementOf([{ provenance: "MANAGER_VERIFIED", level: 5, confidenceBand: "HIGH" }, { provenance: "AI_INFERRED", level: 2, confidenceBand: "LOW" }])?.spread === 3);

// ── shaped (member/admin) view ──
{
  const shaped = shapeSkills([
    row({ skillId: "sw", provenance: "AI_INFERRED", level: 2 }),
    row({ skillId: "sw", provenance: "SELF_CLAIMED", level: 5, confidenceBand: "LOW", confidence: 0, assertedById: "m1" }),
    row({ skillId: "sw", provenance: "MANAGER_VERIFIED", level: 4, assertedById: "admin1" }),
    row({ skillId: "lead", provenance: "AI_INFERRED" }),
    row({ skillId: "ghost", provenance: "AI_INFERRED" }),
  ], nodes);
  const mech = shaped.find((x) => x.groupName === "Mechanical Engineering")!;
  const sw = mech.skills.find((s) => s.name === "SolidWorks")!;
  check("rows for unknown skills ignored", !shaped.some((x) => x.skills.some((s) => s.skillId === "ghost")));
  check("every provenance kept separate, none merged", sw.provenances.length === 3 && new Set(sw.provenances.map((p) => p.provenance)).size === 3);
  check("verified leads, ordered by trust", sw.lead === "MANAGER_VERIFIED" && sw.provenances.map((p) => p.provenance).join() === "MANAGER_VERIFIED,AI_INFERRED,SELF_CLAIMED");
  check("levels not averaged", sw.provenances.map((p) => p.level).join() === "4,2,5");
  check("disagreement surfaced", sw.disagreement?.kind === "levels_differ");
  check("self row carries asserter, AI row does not", sw.provenances.find((p) => p.provenance === "SELF_CLAIMED")!.assertedById === "m1" && sw.provenances.find((p) => p.provenance === "AI_INFERRED")!.assertedById === null);
  check("groups sorted", shaped.map((x) => x.groupName).join() === "Mechanical Engineering,Team Leadership");
}

// ── public portfolio ──
const base = (): PortfolioInput => ({
  member: { displayName: "Alice Example", avatarUrl: "a.png", title: "Structures Lead", bio: "Builds rovers" },
  portfolio: { slug: "alice", enabled: true, headline: "Mechanical + CAD" },
  skills: nodes,
  assessments: [
    row({ skillId: "sw", provenance: "AI_INFERRED", level: 4, confidenceBand: "HIGH", rationale: "INTERNAL RATIONALE", assertedById: "" }),
    row({ skillId: "cad", provenance: "AI_INFERRED", level: 3, confidenceBand: "LOW" }),
    row({ skillId: "lead", provenance: "SELF_CLAIMED", level: 5, confidenceBand: "LOW", assertedById: "m1" }),
    row({ skillId: "sheet", provenance: "AI_INFERRED", level: 3, confidenceBand: "MEDIUM" }),
  ],
  skillVisibility: new Map(), projectVisibility: new Map(), disputedSkillIds: new Set(),
  evidence: [
    { id: "e1", skillIds: ["sw"], source: "CAD", summary: "Modelled the antenna bracket.", sourceUrl: "https://internal/vault/1", occurredAt: new Date("2026-09-10"), projectId: "p1", projectName: "Rover" },
    { id: "e2", skillIds: ["sw"], source: "GITHUB", summary: "Scripted a SolidWorks macro.", sourceUrl: "https://github.com/club/app/pull/9", occurredAt: new Date("2026-09-12"), projectId: "p1", projectName: "Rover" },
    { id: "e3", skillIds: ["sw"], source: "TASK", summary: "Secret project task.", sourceUrl: null, occurredAt: new Date("2026-09-01"), projectId: "p-secret", projectName: "Classified Thing" },
    { id: "e4", skillIds: ["sheet"], source: "TASK", summary: "Formed a sheet-metal cover.", sourceUrl: null, occurredAt: new Date("2026-08-01"), projectId: null, projectName: null },
  ],
});
{
  const p = buildPublicPortfolio(base())!;
  const all = p.groups.flatMap((x) => x.skills);
  check("opted-out portfolio is null (route answers 404)", buildPublicPortfolio({ ...base(), portfolio: { slug: "alice", enabled: false, headline: null } }) === null);
  check("high-confidence AI skill shown", all.some((s) => s.name === "SolidWorks" && s.level === 4 && s.confidence === "HIGH"));
  check("LOW-confidence AI skill withheld", !all.some((s) => s.name === "CAD"));
  check("bare self-claim withheld", !all.some((s) => s.name === "Team Leadership"));
  check("medium-confidence skill shown", all.some((s) => s.name === "Sheet Metal Design"));
  const json = JSON.stringify(p);
  check("no internal rationale", !json.includes("INTERNAL RATIONALE") && !json.includes("rationale"));
  check("no numeric confidence, ids, or evidence ids", !/"confidence":\s*0\.|evidenceIds|assertedById|"id"|computedAt/.test(json));
  check("no email/slack/xp style fields exist on the type", !/email|slack|xp|rank|isAdmin/i.test(json));
  const sw = all.find((s) => s.name === "SolidWorks")!;
  check("private project evidence hidden only when member hides it", sw.evidence.some((e) => e.project === "Classified Thing"));
  const hidden = buildPublicPortfolio({ ...base(), projectVisibility: new Map([["p-secret", false]]) })!.groups.flatMap((x) => x.skills).find((s) => s.name === "SolidWorks")!;
  check("hidden project's evidence removed", !hidden.evidence.some((e) => e.project === "Classified Thing") && hidden.evidence.length === 2);
  check("GitHub link kept, internal CAD link dropped", sw.evidence.find((e) => e.source === "github")!.link?.includes("github.com") === true && sw.evidence.find((e) => e.source === "cad")!.link === null);
  check("evidence newest first", sw.evidence[0].date >= sw.evidence[sw.evidence.length - 1].date);
  check("last used is month precision", sw.lastDemonstrated === "2026-09");
  check("advisory note present", p.generatedNote.includes("advisory"));
  const noSw = buildPublicPortfolio({ ...base(), skillVisibility: new Map([["sw", false]]) })!.groups.flatMap((x) => x.skills);
  check("member-hidden skill removed", !noSw.some((s) => s.name === "SolidWorks"));
  const disputed = buildPublicPortfolio({ ...base(), disputedSkillIds: new Set(["sw"]) })!.groups.flatMap((x) => x.skills);
  check("disputed skill withheld while under review", !disputed.some((s) => s.name === "SolidWorks"));
}
{
  const withVerified = base();
  withVerified.assessments.push(row({ skillId: "lead", provenance: "MANAGER_VERIFIED", level: 4, assertedById: "admin1" }));
  const lead = buildPublicPortfolio(withVerified)!.groups.flatMap((x) => x.skills).find((s) => s.name === "Team Leadership")!;
  check("lead-verified skill shown without needing evidence, and says so", !!lead && lead.verifiedByLead && lead.level === 4);
  const aiNoEvidence = base();
  aiNoEvidence.evidence = [];
  const names = buildPublicPortfolio(aiNoEvidence)!.groups.flatMap((x) => x.skills).map((s) => s.name);
  check("AI-only skill with nothing showable is withheld", !names.includes("SolidWorks") && !names.includes("Sheet Metal Design"));
}
{
  const many = base();
  many.skills = Array.from({ length: 60 }, (_, i) => ({ id: `s${i}`, slug: `s${i}`, name: `Skill ${String(i).padStart(2, "0")}`, type: "TOOL", parentIds: [] }));
  many.assessments = many.skills.map((s) => row({ skillId: s.id, provenance: "AI_INFERRED", confidenceBand: "HIGH" }));
  many.evidence = many.skills.flatMap((s) => Array.from({ length: 9 }, (_, j) => ({ id: `${s.id}-${j}`, skillIds: [s.id], source: "GITHUB", summary: "x", sourceUrl: null, occurredAt: new Date(2026, 0, j + 1), projectId: null, projectName: null })));
  const p = buildPublicPortfolio(many)!;
  const all = p.groups.flatMap((x) => x.skills);
  check("skills capped", all.length === PUBLIC_MAX_SKILLS);
  check("evidence per skill capped", all.every((s) => s.evidence.length === PUBLIC_EVIDENCE_PER_SKILL));
}

// ── slugs ──
check("slug normalised", normalizeSlug("  Alice Example!! ") === "alice-example");
check("short slug rejected", normalizeSlug("ab") === null);
check("reserved slug rejected", normalizeSlug("Admin") === null && normalizeSlug("api") === null);
check("long slug rejected", normalizeSlug("x".repeat(41)) === null);

console.log(`skillView: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
