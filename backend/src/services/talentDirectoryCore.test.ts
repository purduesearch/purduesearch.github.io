// Pure talent-directory rules. Run: cd backend && npx tsx src/services/talentDirectoryCore.test.ts
import { METRICS, ACHIEVEMENTS } from "./impactMetricCore.js";
import {
  buildPublicCard, buildSponsorCard, cardName, matchesFilters, parseDirectoryQuery, sortCards,
  type CardSource, type SponsorCard,
} from "./talentDirectoryCore.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) { if (cond) passed++; else { failed++; console.error(`  FAIL ${name}`); } }
function throws(fn: () => unknown) { try { fn(); return false; } catch { return true; } }

const records = METRICS.find(m => m.proof === "RECORDS" && m.achievement)!;
const confirmed = METRICS.find(m => m.proof === "CONFIRMED")!;
const ach = ACHIEVEMENTS.find(a => a.metricId === records.id)!;
const FRONT = "https://front.test/";

function src(over: Partial<CardSource> = {}): CardSource {
  return {
    memberId: "m1", displayName: "Ada Lovelace",
    profile: { major: "ME", gradTerm: "2028-05", openTo: ["INTERNSHIP"], availableFrom: "2027-05", headline: "Builder" },
    targets: [{ code: "17-2141.00", title: "Mechanical Engineers" }],
    snapshots: [
      { metricId: records.id, value: 6, detail: { tool: "SolidWorks", projects: [{ name: "Rover" }] } },
      { metricId: confirmed.id, value: 3, detail: null },
    ],
    attestations: [
      { id: "c-pending", kind: "CLAIM", status: "PENDING", label: "Pending secret claim", value: 9, unit: "USD" },
      { id: "c-verified", kind: "CLAIM", status: "VERIFIED", label: "Verified claim", value: 4, unit: "people" },
      { id: "c-needs", kind: "CLAIM", status: "NEEDS_PROOF", label: "Needs proof claim", value: 2, unit: null },
    ],
    bulletRows: [],
    certifications: [{ name: "Safety", issuer: "CITI" }],
    badges: [{ id: "b1", achievementId: ach.id }, { id: "b2", achievementId: "unknown-achievement" }],
    skillNames: ["SolidWorks", "Python"],
    ...over,
  };
}
const opts = { disabledMetrics: [] as string[], frontendUrl: FRONT };

// Names
check("first + last initial", cardName("Ada Lovelace") === "Ada L.");
check("middle names skipped", cardName("  Grace  Brewster   hopper ") === "Grace H.");
check("single word stays", cardName("Cher") === "Cher");
check("empty name fallback", cardName("") === "Member" && cardName(null) === "Member");

// Allow-list
const leaky = src() as CardSource & Record<string, unknown>;
Object.assign(leaky, { email: "ada@secret.test", slackUserId: "U123SECRET", avatarUrl: "https://img.test/a.png", level: 4, confidence: 0.9 });
Object.assign(leaky.profile!, { email: "ada@secret.test", shareWithSponsors: true, level: 5 });
(leaky.targets[0] as Record<string, unknown>).confidence = 0.77;
(leaky.certifications[0] as Record<string, unknown>).driveFileId = "DRIVE_SECRET";
(leaky.badges[0] as Record<string, unknown>).credentialJwt = "JWT_SECRET";
const sc = buildSponsorCard(leaky, opts);
const pc = buildPublicCard(leaky, opts);
const sj = JSON.stringify(sc), pj = JSON.stringify(pc);
for (const bad of ["ada@secret.test", "U123SECRET", "img.test", "\"level\"", "\"confidence\"", "DRIVE_SECRET", "JWT_SECRET", "shareWithSponsors", "Lovelace", "0.77"]) {
  check(`sponsor card never leaks ${bad}`, !sj.includes(bad));
  check(`public card never leaks ${bad}`, !pj.includes(bad));
}
check("sponsor card exact keys", JSON.stringify(Object.keys(sc)) === JSON.stringify(["memberId", "name", "major", "gradTerm", "openTo", "availableFrom", "headline", "targets", "bullets", "certifications", "badges"]));
check("public card exact keys", JSON.stringify(Object.keys(pc)) === JSON.stringify(["name", "major", "gradTerm", "targets", "bullets"]));
check("public card has no memberId/openTo", !pj.includes("m1") && !pj.includes("INTERNSHIP"));
check("target keys only code+title", JSON.stringify(Object.keys(sc.targets[0])) === JSON.stringify(["code", "title"]));
check("skill names are not on the card", !sj.includes("Python"));
check("certification name + provider", sc.certifications.length === 1 && sc.certifications[0].name === "Safety" && sc.certifications[0].provider === "CITI");
check("badge name + verify url, unknown dropped", sc.badges.length === 1 && sc.badges[0].name === records.label && sc.badges[0].verifyUrl === "https://front.test/badges/b1");

// Bullets: shareable + picked only
check("records bullet present", sc.bullets.some(b => b.includes("6")));
check("pending claim never in a card", !sj.includes("Pending secret claim") && !pj.includes("Pending secret claim"));
check("needs-proof claim excluded", !sj.includes("Needs proof claim"));
check("verified claim included", sc.bullets.includes("Verified claim: 4 people"));
check("unverified CONFIRMED metric excluded", sc.bullets.length === 2);
const withConfirm = buildSponsorCard(src({ attestations: [{ id: "k", kind: "CONFIRM", status: "VERIFIED", metricId: confirmed.id, value: 3 }] }), opts);
check("verified CONFIRMED metric included", withConfirm.bullets.length === 2);
const wrongConfirm = buildSponsorCard(src({ attestations: [{ id: "k", kind: "CONFIRM", status: "PENDING", metricId: confirmed.id, value: 3 }] }), opts);
check("pending CONFIRM attestation excluded", wrongConfirm.bullets.length === 1);
const hidden = buildSponsorCard(src({ bulletRows: [{ sourceKind: "METRIC", sourceId: records.id, included: false, position: 0 }] }), opts);
check("member-hidden bullet excluded", hidden.bullets.length === 1 && hidden.bullets[0] === "Verified claim: 4 people");
const disabled = buildSponsorCard(src(), { ...opts, disabledMetrics: [records.id] });
check("disabled metric excluded from bullets and badges", disabled.bullets.length === 1 && disabled.badges.length === 0);
check("disabled metric excluded from public card", buildPublicCard(src(), { disabledMetrics: [records.id] }).bullets.length === 1);
// Member custom templates (unreviewed text) never leave the member's view: canonical wording only.
const custom = src({ bulletRows: [
  { sourceKind: "METRIC", sourceId: records.id, included: true, position: 0, template: "Merged {n} PRs as lead of a 30-person team" },
  { sourceKind: "ATTESTATION", sourceId: "c-verified", included: true, position: 0, template: "Raised $50,000 and led 40 engineers ({n} people verified)" },
] });
for (const [label, card] of [["sponsor", buildSponsorCard(custom, opts)], ["public", buildPublicCard(custom, opts)]] as const) {
  const j = JSON.stringify(card);
  check(`${label} card never shows a custom metric template`, !j.includes("30-person") && !j.includes("Merged 6 PRs"));
  check(`${label} card never shows a custom claim template`, !j.includes("50,000") && !j.includes("40 engineers"));
  check(`${label} card uses the claim's verified wording`, card.bullets.includes("Verified claim: 4 people"));
  check(`${label} card uses the registry wording`, card.bullets.some(b => b.includes("6") && !b.includes("Merged")) && card.bullets.length === 2);
}
check("null profile ok", (() => { const c = buildSponsorCard(src({ profile: null }), opts); return c.major === null && c.openTo.length === 0; })());

// Query parsing
check("defaults", JSON.stringify(parseDirectoryQuery({})) === JSON.stringify({ role: null, tool: null, gradTerm: null, openTo: null, sort: "name" }));
check("bad gradTerm rejected", throws(() => parseDirectoryQuery({ gradTerm: "May 2028" })));
check("bad openTo rejected", throws(() => parseDirectoryQuery({ openTo: "GIG" })));
check("bad sort rejected", throws(() => parseDirectoryQuery({ sort: "score" })));
check("bad role rejected", throws(() => parseDirectoryQuery({ role: "<script>" })));
check("year gradTerm ok", parseDirectoryQuery({ gradTerm: "2028" }).gradTerm === "2028");

// Filters narrow only
const mk = (id: string, name: string, gradTerm: string | null, extra: Partial<SponsorCard> = {}): SponsorCard => ({
  memberId: id, name, major: null, gradTerm, openTo: [], availableFrom: null, headline: null, targets: [], bullets: [], certifications: [], badges: [], ...extra,
});
const f = (q: Record<string, unknown>) => parseDirectoryQuery(q);
const a = mk("1", "Ada L.", "2028-05", { targets: [{ code: "17-2141.00", title: "ME" }], openTo: ["INTERNSHIP"] });
check("no filter matches", matchesFilters(a, [], f({})));
check("role exact", matchesFilters(a, [], f({ role: "17-2141.00" })) && !matchesFilters(a, [], f({ role: "17-2141" })));
check("openTo", matchesFilters(a, [], f({ openTo: "INTERNSHIP" })) && !matchesFilters(a, [], f({ openTo: "COOP" })));
check("gradTerm exact + year", matchesFilters(a, [], f({ gradTerm: "2028-05" })) && matchesFilters(a, [], f({ gradTerm: "2028" })) && !matchesFilters(a, [], f({ gradTerm: "2028-12" })) && !matchesFilters(a, [], f({ gradTerm: "2027" })));
check("missing gradTerm never matches a term filter", !matchesFilters(mk("2", "B", null), [], f({ gradTerm: "2028" })));
check("tool matches skill names case-insensitively", matchesFilters(a, ["SolidWorks"], f({ tool: "solidworks" })) && !matchesFilters(a, ["Python"], f({ tool: "solidworks" })));
check("tool matches certification name", matchesFilters(mk("4", "D", null, { certifications: [{ name: "OSHA 10", provider: null }] }), [], f({ tool: "osha" })));
check("tool matches bullet text", matchesFilters(mk("3", "C", null, { bullets: ["Used MATLAB daily"] }), [], f({ tool: "matlab" })));
check("filter result is boolean only", typeof matchesFilters(a, [], f({})) === "boolean");

// Sort
const cards = [mk("z", "zed A.", "2027-05"), mk("b", "Bea C.", null), mk("a2", "Ada L.", "2029-05"), mk("a1", "Ada L.", "2028-05"), mk("c", "ada b.", "2027-05")];
check("alphabetical, case-insensitive, then memberId", JSON.stringify(sortCards(cards).map(c => c.memberId)) === JSON.stringify(["c", "a1", "a2", "b", "z"]));
check("gradTerm sort, unknown last, then name", JSON.stringify(sortCards(cards, "gradTerm").map(c => c.memberId)) === JSON.stringify(["c", "z", "a1", "a2", "b"]));
check("sort does not mutate", cards[0].memberId === "z");

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
