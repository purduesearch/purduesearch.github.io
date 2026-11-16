// Public impact tests: in-memory store, no DB, no network.
// Run: cd backend && npx tsx src/services/publicImpactService.test.ts
import { METRICS } from "./impactMetricCore.js";
import type { CardSource } from "./talentDirectoryCore.js";
import { readFileSync } from "node:fs";
import { buildPublicImpact, createPublicImpactMemo, PUBLIC_IMPACT_TTL_MS, type PublicImpactStore } from "./publicImpactService.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) { if (cond) passed++; else { failed++; console.error(`  FAIL ${name}`); } }

const records = METRICS.filter(m => m.proof === "RECORDS");
const m1 = records[0], m2 = records[1];
const confirmed = METRICS.find(m => m.proof === "CONFIRMED");

function source(id: string, name: string): CardSource {
  return {
    memberId: id, displayName: name,
    profile: { major: "ME", gradTerm: "2028-05", openTo: ["INTERNSHIP"], availableFrom: null, headline: "secret headline" },
    targets: [{ code: "17-2141.00", title: "Mechanical Engineers" }],
    snapshots: [{ metricId: m1.id, value: 7, detail: null }],
    attestations: [], bulletRows: [], certifications: [], badges: [{ id: "b1", achievementId: "x" }],
  };
}

function store(over: Partial<PublicImpactStore> = {}): PublicImpactStore {
  return {
    snapshots: async () => [], disabledMetrics: async () => [], assessments: async () => [], disputes: async () => [],
    visibility: async () => [], skillTools: async () => [], featuredSources: async () => [], ...over,
  };
}
const total = (p: Awaited<ReturnType<typeof buildPublicImpact>>, id: string) => p.totals.find(t => t.id === id);

async function main() {
  // floor
  let p = await buildPublicImpact(store({ snapshots: async () => [
    { memberId: "a", metricId: m1.id, value: 5 }, { memberId: "b", metricId: m1.id, value: 5 },
    { memberId: "a", metricId: m2.id, value: 1 }, { memberId: "b", metricId: m2.id, value: 2 }, { memberId: "c", metricId: m2.id, value: 3 },
  ] }));
  check("2 contributors -> null", total(p, m1.id)?.total === null && total(p, m1.id)?.contributors === null);
  check("3 contributors -> shown", total(p, m2.id)?.total === 6 && total(p, m2.id)?.contributors === 3);
  check("no metric without data shows 0", p.totals.every(t => t.total === null || t.total > 0));
  if (confirmed) check("CONFIRMED metric never totalled", !total(p, confirmed.id));
  check("no per-member keys in payload", !JSON.stringify(p).includes("\"memberId\""));

  // disabled metric omitted
  p = await buildPublicImpact(store({ disabledMetrics: async () => [m2.id] }));
  check("disabled metric omitted", !total(p, m2.id) && !!total(p, m1.id));

  // tools
  const tools = [{ skillId: "s1", toolKey: "solidworks", toolName: "Dassault Systemes SolidWorks" }];
  const base = {
    skillTools: async () => tools,
    assessments: async () => ["a", "b", "c"].map((memberId, i) => ({ memberId, skillId: "s1", level: 3, provenance: i === 1 ? "MANAGER_VERIFIED" : "AI_INFERRED" })),
    visibility: async () => [
      { memberId: "a", skillId: "s1", isPublic: true },
      { memberId: "b", skillId: "s1", isPublic: true },
      { memberId: "c", skillId: "s1", isPublic: true },
    ],
  };
  p = await buildPublicImpact(store(base));
  check("tool shown at 3 members", p.tools.length === 1 && p.tools[0].members === 3 && p.tools[0].name.includes("SolidWorks"));
  p = await buildPublicImpact(store({ ...base, disputes: async () => [{ memberId: "a", skillId: "s1" }] }));
  check("disputed member dropped -> below floor", p.tools.length === 0);
  p = await buildPublicImpact(store({ ...base, assessments: async () => ["a", "b", "c"].map((memberId, i) => ({ memberId, skillId: "s1", level: i === 0 ? 2 : 4, provenance: "AI_INFERRED" })) }));
  check("level < 3 not demonstrated", p.tools.length === 0);
  p = await buildPublicImpact(store({ ...base, visibility: async () => [
    { memberId: "a", skillId: "s1", isPublic: true }, { memberId: "b", skillId: "s1", isPublic: false },
    { memberId: "c", skillId: "s1", isPublic: true },
  ] }));
  check("private skill not counted", p.tools.length === 0);
  // Teammate-only consent (showToTeam) is not public consent.
  p = await buildPublicImpact(store({ ...base, visibility: async () => [
    { memberId: "a", skillId: "s1", isPublic: true }, { memberId: "b", skillId: "s1", isPublic: true },
    { memberId: "c", skillId: "s1", isPublic: false, showToTeam: true } as { memberId: string; skillId: string; isPublic: boolean },
  ] }));
  check("showToTeam-only skill not counted publicly", p.tools.length === 0);
  for (const provenance of ["SELF_CLAIMED", "PEER_ENDORSED"]) {
    p = await buildPublicImpact(store({ ...base, assessments: async () => ["a", "b", "c"].map((memberId, i) => ({ memberId, skillId: "s1", level: 5, provenance: i === 2 ? provenance : "AI_INFERRED" })) }));
    check(`${provenance} assessment is not demonstrated`, p.tools.length === 0);
  }
  p = await buildPublicImpact(store({ ...base, assessments: async () => ["a", "b", "c"].map(memberId => ({ memberId, skillId: "s1", level: 4, provenance: "MANAGER_VERIFIED" })) }));
  check("manager-verified assessments count", p.tools[0]?.members === 3);
  p = await buildPublicImpact(store({ ...base, assessments: async () => ["a", "a", "b", "c"].map(memberId => ({ memberId, skillId: "s1", level: 5, provenance: "AI_INFERRED" })) }));
  check("members counted once", p.tools[0]?.members === 3);

  // featured cards
  p = await buildPublicImpact(store({ featuredSources: async () => [source("m2", "Zed Zimmer"), source("m1", "Ada Lovelace")] }));
  check("alphabetical", p.featured.map(c => c.name).join("|") === "Ada L.|Zed Z.");
  const json = JSON.stringify(p.featured);
  check("card allow-list keys", Object.keys(p.featured[0]).sort().join(",") === "bullets,gradTerm,major,name,targets");
  check("no ids/email/headline/badges/level", !/m1|m2|secret|email|level|badge|Lovelace/i.test(json));
  p = await buildPublicImpact(store());
  check("empty -> no featured", p.featured.length === 0);
  check("attribution present", /O\*NET/.test(p.attribution));

  // active, non-bot filter lives in the Prisma store: guard it by source inspection.
  const src = readFileSync(new URL("./publicImpactService.ts", import.meta.url), "utf8");
  check("store reads only public visibility", /visibility: \(\) => prisma\.skillVisibility\.findMany\(\{\s*where: \{ isPublic: true \}/.test(src) && !/showToTeam: true/.test(src));
  check("store reads only demonstrated provenances", /provenance: \{ in: \[\.\.\.DEMONSTRATED_PROVENANCES\] \}/.test(src)
    && /DEMONSTRATED_PROVENANCES = \["AI_INFERRED", "MANAGER_VERIFIED"\]/.test(src));
  check("store filters bots and deactivated members", /isBot: false, deactivatedAt: null/.test(src) && /member: active/.test(src) && /showOnPublicPage: true/.test(src));

  // memo: one build per 10 minutes, shared in-flight build, failures not cached.
  check("memo TTL is 10 minutes", PUBLIC_IMPACT_TTL_MS === 10 * 60_000);
  let clock = 0, builds = 0, fail = false;
  const memo = createPublicImpactMemo(async () => {
    builds++;
    if (fail) throw new Error("db down");
    return buildPublicImpact(store());
  }, { now: () => clock });
  const [x, y] = await Promise.all([memo(), memo()]);
  check("concurrent misses share one build", builds === 1 && x === y);
  clock += PUBLIC_IMPACT_TTL_MS - 1;
  await memo();
  check("served from memo within TTL", builds === 1);
  clock += 1;
  fail = true;
  let threw = false;
  try { await memo(); } catch { threw = true; }
  check("expired memo rebuilds and surfaces failure", threw && builds === 2);
  fail = false;
  await memo();
  check("failure not cached", builds === 3);
  await memo();
  check("fresh payload cached again", builds === 3);
  check("route reaches the memoized getter", /getPublicImpact\(\)/.test(readFileSync(new URL("../api/public.ts", import.meta.url), "utf8"))
    && /export function getPublicImpact\(\)[^{]*\{\s*return memoizedPublicImpact\(\)/.test(src));

  console.log(`publicImpactService: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}
main();
