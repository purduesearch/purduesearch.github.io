// Skill taxonomy: seed data integrity + proposal decisions. No DB, no network.
// Run: cd backend && npx tsx src/services/skillTaxonomy.test.ts

import { SEED_SKILLS } from "./skillSeedData.js";
import { buildAliasIndex, normalizeSkillName, wouldCreateCycle } from "./skillMatchCore.js";
import { decideProposal, slugify } from "./skillTaxonomyService.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`, detail ?? ""); }
}

// ── seed integrity ──
const slugs = SEED_SKILLS.map((x) => x.slug);
check("slugs unique", new Set(slugs).size === slugs.length, slugs.filter((x, i) => slugs.indexOf(x) !== i));
check("slugs well-formed", slugs.every((x) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(x)));
const known = new Set(slugs);
const dangling = SEED_SKILLS.flatMap((x) => [...x.parents, ...(x.related ?? []), ...(x.prerequisites ?? [])].filter((t) => !known.has(t)).map((t) => `${x.slug}->${t}`));
check("every link target exists", dangling.length === 0, dangling);
check("no self links", SEED_SKILLS.every((x) => ![...x.parents, ...(x.related ?? []), ...(x.prerequisites ?? [])].includes(x.slug)));

for (const kind of ["parents", "prerequisites"] as const) {
  const edges: { fromId: string; toId: string }[] = [];
  let cyclic = false;
  for (const sk of SEED_SKILLS) {
    for (const t of sk[kind] ?? []) {
      if (wouldCreateCycle(edges, sk.slug, t)) cyclic = true;
      edges.push({ fromId: sk.slug, toId: t });
    }
  }
  check(`${kind} graph is acyclic`, !cyclic);
}

const index = buildAliasIndex(SEED_SKILLS.map((x) => ({ id: x.slug, name: x.name, aliases: x.aliases })));
check("no name/alias collisions across skills", index.collisions.length === 0, index.collisions);
check("covers all four types", new Set(SEED_SKILLS.map((x) => x.type)).size === 4);
check("covers CAD, electronics, software", ["cad", "pcb-design", "python"].every((x) => known.has(x)));
check("every non-domain skill has a parent or is a root-type skill", SEED_SKILLS.filter((x) => x.type === "TOOL").every((x) => x.parents.length > 0));
check("tools never appear as parents of domains", SEED_SKILLS.filter((x) => x.type === "DOMAIN").every((x) => x.parents.every((p) => SEED_SKILLS.find((y) => y.slug === p)!.type !== "TOOL")));

// ── the motivating duplicates ──
const none = new Set<string>();
check("ReactJS maps", JSON.stringify(decideProposal("ReactJS", index, none)) === JSON.stringify({ action: "MAP", skillId: "react" }));
check("React.js maps", (decideProposal("React.js", index, none) as { skillId?: string }).skillId === "react");
check("Node maps", (decideProposal("Node.js", index, none) as { skillId?: string }).skillId === "nodejs");
check("C++ and C# stay distinct", (decideProposal("C++", index, none) as { skillId?: string }).skillId === "cpp" && (decideProposal("C#", index, none) as { action: string }).action === "QUEUE");
check("FEA alias maps", (decideProposal("FEA", index, none) as { skillId?: string }).skillId === "fea");

// ── proposal decisions ──
const queued = decideProposal("Kubernetes", index, none);
check("new name queues", queued.action === "QUEUE");
check("rejected name suppressed", decideProposal("Kubernetes", index, new Set([normalizeSkillName("Kubernetes")])).action === "SUPPRESS");
check("existing skill beats suppression", decideProposal("React", index, new Set([normalizeSkillName("React")])).action === "MAP");
const typo = decideProposal("Solidwork", index, none);
check("typo queues with near-match hint", typo.action === "QUEUE" && typo.nearSkillIds.includes("solidworks"), typo);
check("blank invalid", decideProposal("  ", index, none).action === "INVALID");
check("one char invalid", decideProposal("x", index, none).action === "INVALID");
check("novel-length name invalid", decideProposal("a".repeat(120), index, none).action === "INVALID");

// ── slugify ──
check("slugify", slugify("Finite Element Analysis") === "finite-element-analysis" && slugify("C++") === "cpp" && slugify("C#") === "csharp" && slugify("  !!  ") === "skill");

console.log(`skillTaxonomy: ${passed} passed, ${failed} failed (${SEED_SKILLS.length} seed skills)`);
if (failed) process.exit(1);
