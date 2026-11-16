// Career API tests: in-process Express with an in-memory store and stub auth. No DB, no network.
// Run: cd backend && npx tsx src/api/career.test.ts
import express from "express";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { createCareerRouter } from "./career.js";
import { METRICS } from "../services/impactMetricCore.js";
import type { AttestationRow, CareerStore, ProfileRow } from "../services/careerService.js";
import type { IntroRow, IntroStore } from "../services/introService.js";
import type { SponsorUserRow } from "../services/sponsorAuthService.js";
import { exportJWK, generateKeyPair } from "jose";
import type { AwardRow, BadgeStore } from "../services/badgeService.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) { if (cond) passed++; else { failed++; console.error(`  FAIL ${name}`); } }

const src = readFileSync(fileURLToPath(new URL("./career.ts", import.meta.url)), "utf8");
check("never reads req.session", !/req\.session/.test(src));
check("uses requireAuth by default", /requireAuth/.test(src));
check("no model imports", !/gemini|aiRouter/i.test(src));
check("member intro routes never use sponsor auth", !/requireSponsor|sponsorUserId/.test(src));

function makeIntroStore() {
  const sponsor: SponsorUserRow = { id: "s1", email: "sam@acme.test", name: "Sam", tokenVersion: 0, disabledAt: null, org: { id: "o1", name: "Acme", active: true, accessUntil: null } };
  const intros: IntroRow[] = [
    { id: "i1", sponsorUserId: "s1", memberId: "m1", opportunityId: null, message: "Hello", status: "PENDING", respondedAt: null, expiresAt: new Date(10_000_000_000_000), createdAt: new Date(1) },
    { id: "i2", sponsorUserId: "s1", memberId: "m2", opportunityId: null, message: "Hi", status: "PENDING", respondedAt: null, expiresAt: new Date(10_000_000_000_000), createdAt: new Date(1) },
  ];
  const store: IntroStore = {
    // m1 shares with sponsors; m2 does not.
    sharedMemberIds: async () => ["m1"], sharedMember: async id => (id === "m1" ? { id, displayName: "Ada Lovelace", email: "ada@example.com" } : null),
    member: async id => ({ id, displayName: "Ada Lovelace", email: "ada@example.com" }),
    cardSource: async () => null, disabledMetrics: async () => [],
    createIntro: async () => "DUPLICATE",
    listForSponsor: async () => [],
    listForMember: async id => intros.filter(i => i.memberId === id).map(i => ({ ...i, sponsor })),
    find: async id => { const i = intros.find(x => x.id === id); return i ? { ...i, sponsor } : null; },
    respond: async (id, memberId, status, now) => {
      const i = intros.find(x => x.id === id && x.memberId === memberId && x.status === "PENDING");
      if (!i) return false;
      i.status = status; i.respondedAt = now; return true;
    },
    expireDue: async () => 0,
  };
  return { store, intros };
}


const records = METRICS.find(m => m.proof === "RECORDS")!;
const confirmed = METRICS.find(m => m.proof === "CONFIRMED")!;
const cadItems = METRICS.find(m => m.id === "cad_items_released")!;
const cadRevs = METRICS.find(m => m.id === "cad_revisions")!;
const prs = METRICS.find(m => m.id === "prs_merged")!;
const at = (d: Partial<AttestationRow> & { id: string; memberId: string }): AttestationRow & { memberId: string } => ({
  kind: "CLAIM", status: "PENDING", metricId: null, label: "Saved money", value: 5, unit: "USD",
  evidenceUrl: "https://example.com/e", note: null, reviewNote: null, createdAt: new Date(0), ...d,
});

function makeStore() {
  const atts: (AttestationRow & { memberId: string })[] = [
    at({ id: "a-pending", memberId: "m1" }),
    at({ id: "a-verified", memberId: "m1", status: "VERIFIED", label: "Verified claim", value: 7 }),
    at({ id: "a-other", memberId: "m2" }),
  ];
  const bullets: { memberId: string; sourceKind: string; sourceId: string; template?: string | null; included?: boolean; position?: number }[] = [];
  let targets: string[] = [];
  const calls = { recompute: 0 };
  const profile: ProfileRow = { major: "ME", gradTerm: "2028-05", openTo: [], availableFrom: null, headline: "Hi", shareWithSponsors: false, showOnPublicPage: false };
  let disabled: string[] = [];
  const skills: Record<string, { id: string; name: string; status: string; canonicalId: string | null }> = {
    "s-sw": { id: "s-sw", name: "SolidWorks", status: "ACTIVE", canonicalId: null },
    "s-alias": { id: "s-alias", name: "Solidworks CAD", status: "ACTIVE", canonicalId: "s-sw" },
    "s-none": { id: "s-none", name: "Welding", status: "ACTIVE", canonicalId: null },
    "s-old": { id: "s-old", name: "Old", status: "ARCHIVED", canonicalId: null },
  };
  const links: Record<string, { kind: string; ref: string; relation: string }[]> = {
    "s-sw": [{ kind: "SOFTWARE", ref: "solidworks", relation: "EXACT" }, { kind: "DWA", ref: "4.A.2.b.2.b.1", relation: "RELATED" }],
  };
  const elements: Record<string, { name: string; parentId: string | null }> = {
    "2": { name: "Skills", parentId: null }, "2.E": { name: "Technology Skills", parentId: "2" },
    "2.E.9": { name: "Engineering software", parentId: "2.E" }, "2.E.9.c": { name: "Computer aided design software", parentId: "2.E.9" },
    "4.A.3.b.2.d.1": { name: "Design CAD items", parentId: null }, "4.A.2.b.2.b.1": { name: "Develop software", parentId: null },
  };
  const store: CareerStore = {
    member: async id => ({ id, displayName: "Ada", email: "ada@example.com" }),
    profile: async () => profile,
    upsertProfile: async (_id, d) => ({ ...profile, ...d }),
    targets: async () => targets.map((code, position) => ({ code, title: `T ${code}`, position })),
    existingOccupations: async codes => codes.filter(c => c.startsWith("11-")),
    replaceTargets: async (_id, codes) => { targets = codes; },
    searchOccupations: async () => [{ code: "11-1", title: "A" }, { code: "11-1", title: "A" }, { code: "11-2", title: "B" }],
    snapshots: async () => [
      { metricId: records.id, value: 4, detail: { tool: null, projects: [] }, computedAt: new Date(1) },
      { metricId: confirmed.id, value: 3, detail: { tool: null, projects: [] }, computedAt: new Date(2) },
      { metricId: cadItems.id, value: 5, detail: { tool: null, projects: [] }, computedAt: new Date(3) },
      { metricId: cadRevs.id, value: 0, detail: { tool: null, projects: [] }, computedAt: new Date(3) },
      { metricId: prs.id, value: 9, detail: { tool: null, projects: [] }, computedAt: new Date(3) },
    ],
    attestations: async id => atts.filter(a => a.memberId === id),
    bulletRows: async id => bullets.filter(b => b.memberId === id).map(b => ({ sourceKind: b.sourceKind, sourceId: b.sourceId, template: b.template, included: b.included ?? true, position: b.position ?? 0 })),
    upsertBullet: async (memberId, sourceKind, sourceId, data) => { bullets.push({ memberId, sourceKind, sourceId, ...data }); },
    deleteBullet: async () => {},
    disabledMetrics: async () => disabled,
    certifications: async () => [{ name: "Safety", issuer: "CITI", date: "2026-01-01" }],
    badges: async () => [],
    skills: async () => [{ name: "CAD", area: "TOOL" }],
    elementNames: async (ids: string[]) => ids.filter(i => i === "4.A.4.b.3.d.1").map(id => ({ id, name: "Train personnel to enhance job skills" })),
    countOpenClaims: async id => atts.filter(a => a.memberId === id && a.status === "PENDING").length,
    createClaim: async (memberId, d) => { const a = at({ id: `new${atts.length}`, memberId, ...d }); atts.push(a); return a; },
    attestation: async id => atts.find(a => a.id === id) ?? null,
    deleteAttestation: async id => { atts.splice(atts.findIndex(a => a.id === id), 1); },
    demandSignals: async () => [],
    recompute: async () => { calls.recompute++; return 2; },
    skill: async id => skills[id] ?? null,
    skillLinks: async id => links[id] ?? [],
    softwareByNorm: async refs => refs.includes("solidworks") ? [{ exampleNorm: "solidworks", example: "SolidWorks", categoryId: "2.E.9.c" }] : [],
    elements: async ids => ids.flatMap(i => (elements[i] ? [{ id: i, ...elements[i] }] : [])),
    skillDemand: async id => (id === "s-sw" ? { software: { hot: true, inDemandOccupations: 2, occupationsListed: 4, examples: ["SolidWorks"] },
      topOccupations: ["a", "b", "c", "d"].map(x => ({ occupationCode: x, title: "T" + x, importance: 4, elementId: "e" })) } : null),
  };
  return { store, atts, bullets, calls, setDisabled: (d: string[]) => { disabled = d; } };
}

function makeBadgeStore() {
  const awards: AwardRow[] = [];
  const snaps: Record<string, Record<string, number>> = { m1: { members_trained: 6, team_led: 5 }, m2: { members_trained: 8 } };
  const store: BadgeStore = {
    member: async id => ({ id, email: `${id}@example.com` }),
    snapshotValue: async (m, metric) => snaps[m]?.[metric] ?? null,
    snapshotValues: async m => Object.entries(snaps[m] ?? {}).map(([metricId, value]) => ({ metricId, value })),
    confirmations: async () => [],
    disabledMetrics: async () => [],
    awardsForMember: async m => awards.filter(a => a.memberId === m),
    award: async id => awards.find(a => a.id === id) ?? null,
    createAward: async row => { const r = { ...row, revokedAt: null, revokedReason: null }; awards.push(r); return r; },
    revokeAward: async (id, memberId, at, reason) => { const a = awards.find(x => x.id === id && x.memberId === memberId && !x.revokedAt); if (!a) return false; a.revokedAt = at; a.revokedReason = reason; return true; },
  };
  return { store, awards };
}

async function main() {
  const h = makeStore();
  const bh = makeBadgeStore();
  const badgeKey = JSON.stringify(await exportJWK((await generateKeyPair("EdDSA", { extractable: true })).privateKey));
  const ih = makeIntroStore();
  const mails: { to: string; html: string }[] = [];
  let clock = 1_000_000;
  const app = express();
  app.use(express.json());
  app.use("/api/career", createCareerRouter({
    // Stub auth: identity comes from a header and lands on req.memberId, like requireAuth.
    auth: (req, res, next) => { const id = req.header("x-test-member"); if (!id) { res.status(401).json({ error: "Unauthorized" }); return; } req.memberId = id; next(); },
    store: h.store, now: () => clock,
    introStore: ih.store, mailer: async m => { mails.push(m); }, frontendUrl: "https://front.test",
    pathway: async (_m, code) => (code === "11-1" ? { occupation: { code, title: "A" } } : null),
    badgeStore: bh.store, badgeSigningJwk: badgeKey, apiUrl: "https://api.test",
  }));
  app.use("/api/career-nokey", createCareerRouter({
    auth: (req, _res, next) => { req.memberId = "m2"; next(); },
    store: h.store, now: () => clock, introStore: ih.store, frontendUrl: "https://front.test",
    badgeStore: bh.store, badgeSigningJwk: null, apiUrl: "https://api.test",
  }));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/career`;
  const call = async (method: string, path: string, body?: unknown, member: string | null = "m1") => {
    const r = await fetch(base + path, { method, headers: { "content-type": "application/json", ...(member ? { "x-test-member": member } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text();
    let json: any = null; try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: r.status, json, text, headers: r.headers };
  };

  try {
    check("unauthenticated GET /me is 401", (await call("GET", "/me", undefined, null)).status === 401);
    check("unauthenticated POST claim is 401", (await call("POST", "/me/claims", {}, null)).status === 401);

    // GET /me
    let r = await call("GET", "/me");
    check("GET /me 200 with attribution", r.status === 200 && /O\*NET 31\.0/.test(r.json.attribution));
    check("records metric shareable", r.json.snapshots.find((s: any) => s.metricId === records.id)?.shareable === true);
    check("unconfirmed metric is pending, not shareable", r.json.snapshots.find((s: any) => s.metricId === confirmed.id)?.pending === true);
    { const rs = r.json.snapshots.find((s: any) => s.metricId === records.id);
      check("snapshot carries registry dwaId and DWA title when loaded", rs?.dwaId === records.dwaId && (records.dwaId === "4.A.4.b.3.d.1" ? rs?.dwaTitle === "Train personnel to enhance job skills" : true)); }
    check("skills are names only, no level", Array.isArray(r.json.skills) && r.json.skills.every((x: unknown) => typeof x === "string"));
    check("own pending claim visible + flagged", r.json.attestations.find((a: any) => a.id === "a-pending")?.pending === true);
    check("other member's claim not visible", !r.json.attestations.some((a: any) => a.id === "a-other"));
    check("own pending claim bullet flagged pending", r.json.bullets.find((b: any) => b.claimId === "a-pending")?.pending === true);
    h.setDisabled([records.id]);
    r = await call("GET", "/me");
    check("disabled metric excluded from snapshots", !r.json.snapshots.some((s: any) => s.metricId === records.id));
    check("disabled metric excluded from bullets", !r.json.bullets.some((b: any) => b.metricId === records.id));

    // export
    r = await call("GET", "/me/export.json");
    check("export is attachment", /attachment/.test(r.headers.get("content-disposition") ?? ""));
    check("export excludes pending claim", !r.text.includes("Saved money"));
    check("export includes verified claim", r.text.includes("Verified claim"));
    check("export excludes disabled metric", !r.text.includes(records.label) && !r.json.work[0].highlights.some((t: string) => t.length === 0));
    check("export has no level or email", !/"level"/.test(r.text) && !r.text.includes("ada@example.com"));
    check("export has certification", r.json.certificates.some((c: any) => c.name === "Safety"));
    h.setDisabled([]);

    // targets
    r = await call("PUT", "/me/targets", { codes: ["11-1", "11-2", "11-3", "11-4"] });
    check("targets >3 rejected", r.status === 400);
    r = await call("PUT", "/me/targets", { codes: ["99-9"] });
    check("unknown code rejected", r.status === 400 && typeof r.json.error === "string");
    r = await call("PUT", "/me/targets", { codes: ["11-1", "11-1"] });
    check("duplicate codes rejected", r.status === 400);
    r = await call("PUT", "/me/targets", { codes: ["11-1", "11-2"] });
    check("valid targets saved", r.status === 200 && r.json.targets.length === 2);

    // profile
    r = await call("PUT", "/me/profile", { shareWithSponsors: "yes" });
    check("non-boolean sharing flag rejected", r.status === 400);
    r = await call("PUT", "/me/profile", { gradTerm: "May 2028" });
    check("bad gradTerm rejected", r.status === 400);
    r = await call("PUT", "/me/profile", { headline: "x".repeat(200) });
    check("long headline rejected", r.status === 400);
    r = await call("PUT", "/me/profile", { headline: "Builder", openTo: ["INTERNSHIP"], shareWithSponsors: true, memberId: "m2" });
    check("profile saved, unknown fields ignored", r.status === 200 && r.json.profile.headline === "Builder" && r.json.profile.shareWithSponsors === true && r.json.profile.memberId === undefined);

    // occupations
    check("occupation search needs 2 chars", (await call("GET", "/occupations?q=a")).status === 400);
    r = await call("GET", "/occupations?q=eng");
    check("occupation search dedupes by code", r.status === 200 && r.json.results.length === 2);

    // pathway
    check("known pathway 200", (await call("GET", "/pathway/11-1")).status === 200);
    check("unknown pathway 404", (await call("GET", "/pathway/00-0")).status === 404);

    // claims
    const good = { label: "Cut costs", value: 10, unit: "USD", evidenceUrl: "https://example.com/proof" };
    check("http evidence rejected", (await call("POST", "/me/claims", { ...good, evidenceUrl: "http://example.com/x" })).status === 400);
    check("javascript evidence rejected", (await call("POST", "/me/claims", { ...good, evidenceUrl: "javascript:alert(1)" })).status === 400);
    check("negative value rejected", (await call("POST", "/me/claims", { ...good, value: -1 })).status === 400);
    check("string value rejected", (await call("POST", "/me/claims", { ...good, value: "5" })).status === 400);
    check("bad unit rejected", (await call("POST", "/me/claims", { ...good, unit: "bananas" })).status === 400);
    r = await call("POST", "/me/claims", good);
    check("valid claim 201, pending", r.status === 201 && r.json.claim.status === "PENDING" && r.json.claim.pending === true);
    const newId = r.json.claim.id;
    check("delete other member's claim is 404", (await call("DELETE", "/me/claims/a-other")).status === 404);
    check("delete verified claim refused (409)", (await call("DELETE", "/me/claims/a-verified")).status === 409);
    check("delete own pending claim ok", (await call("DELETE", `/me/claims/${newId}`)).status === 200 && !h.atts.some(a => a.id === newId));
    for (let i = 0; i < 25; i++) h.atts.push(at({ id: `fill${i}`, memberId: "m3" }));
    check("pending claim cap enforced", (await call("POST", "/me/claims", good, "m3")).status === 409);

    // bullets
    check("unknown metric bullet 404", (await call("PUT", "/me/bullets/METRIC/nope", { included: false })).status === 404);
    check("bad sourceKind 400", (await call("PUT", `/me/bullets/OTHER/${records.id}`, {})).status === 400);
    check("template without {n} rejected", (await call("PUT", `/me/bullets/METRIC/${records.id}`, { template: "no number" })).status === 400);
    check("template with extra braces rejected", (await call("PUT", `/me/bullets/METRIC/${records.id}`, { template: "{n} {tool}" })).status === 400);
    check("negative position rejected", (await call("PUT", `/me/bullets/METRIC/${records.id}`, { position: -1 })).status === 400);
    check("non-boolean included rejected", (await call("PUT", `/me/bullets/METRIC/${records.id}`, { included: "no" })).status === 400);
    check("other member's claim bullet 404", (await call("PUT", "/me/bullets/ATTESTATION/a-other", { included: false })).status === 404);
    check("valid bullet saved", (await call("PUT", `/me/bullets/METRIC/${records.id}`, { template: "Did {n} things", included: true, position: 2 })).status === 200 && h.bullets.length === 1);
    check("null template clears", (await call("PUT", `/me/bullets/METRIC/${records.id}`, { template: null })).status === 200 && h.bullets[1].template === null);

    // recompute rate limit
    check("first recompute ok", (await call("POST", "/me/recompute")).status === 200);
    check("second recompute 429", (await call("POST", "/me/recompute")).status === 429 && h.calls.recompute === 1);
    check("other member not limited", (await call("POST", "/me/recompute", undefined, "m2")).status === 200);
    clock += 61_000;
    check("recompute allowed after a minute", (await call("POST", "/me/recompute")).status === 200);

    // skill O*NET detail
    check("unauthenticated skill onet is 401", (await call("GET", "/skills/s-sw/onet", undefined, null)).status === 401);
    check("unknown skill 404", (await call("GET", "/skills/nope/onet")).status === 404);
    check("archived skill 404", (await call("GET", "/skills/s-old/onet")).status === 404);
    r = await call("GET", "/skills/s-alias/onet");
    check("canonical resolution", r.status === 200 && r.json.skill.id === "s-sw");
    r = await call("GET", "/skills/s-sw/onet");
    check("skill onet 200 with attribution", r.status === 200 && /O*NET 31.0/.test(r.json.attribution));
    check("placement root-first ending in example", JSON.stringify(r.json.placement.map((p: any) => p.name)) === JSON.stringify(["Skills", "Technology Skills", "Engineering software", "Computer aided design software", "SolidWorks"]) && r.json.placement.at(-1).id === null);
    check("links display names", r.json.links.some((l: any) => l.kind === "SOFTWARE" && l.name === "SolidWorks") && r.json.links.some((l: any) => l.kind === "DWA" && l.name === "Develop software"));
    check("demand reused, top 3", r.json.demand?.hot === true && r.json.demand.topOccupations.length === 3 && r.json.demand.occupationsListed === 4);
    check("numbers match category", r.json.numbers.some((n: any) => n.metricId === cadItems.id && n.value === 5));
    check("numbers include dwa-link match", r.json.numbers.some((n: any) => n.metricId === prs.id && n.value === 9));
    check("numbers exclude non-matching and zero", !r.json.numbers.some((n: any) => n.metricId === records.id || n.metricId === confirmed.id || n.metricId === cadRevs.id));
    check("numbers in METRICS order", r.json.numbers[0].metricId === cadItems.id);
    check("suggested bullet from first number", r.json.suggestedBullet?.metricId === cadItems.id && typeof r.json.suggestedBullet.text === "string" && r.json.suggestedBullet.pending === false && r.json.suggestedBullet.shareable === true);
    check("activities include metric dwa and link dwa", r.json.activities.some((a: any) => a.dwaId === cadItems.dwaId && a.name === "Design CAD items") && r.json.activities.some((a: any) => a.dwaId === "4.A.2.b.2.b.1"));
    check("activities deduped", new Set(r.json.activities.map((a: any) => a.dwaId)).size === r.json.activities.length);
    check("no level/confidence/score keys", !/"(level|confidence|score)"/i.test(r.text));
    h.setDisabled([cadItems.id]);
    r = await call("GET", "/skills/s-sw/onet");
    check("disabled metric excluded from skill numbers", !r.json.numbers.some((n: any) => n.metricId === cadItems.id) && r.json.suggestedBullet?.metricId === prs.id);
    h.setDisabled([]);
    r = await call("GET", "/skills/s-none/onet");
    check("no-link skill is empty", r.status === 200 && r.json.placement.length === 0 && r.json.links.length === 0 && r.json.demand === null && r.json.numbers.length === 0 && r.json.suggestedBullet === null);

    check("demand signals 200", (await call("GET", "/demand-signals")).status === 200);

    // Intro inbox
    check("intro inbox needs member auth", (await call("GET", "/me/intros", undefined, null)).status === 401);
    check("intro respond needs member auth", (await call("POST", "/me/intros/i1", { accept: true }, null)).status === 401);
    { const rs = await fetch(base + "/me/intros", { headers: { authorization: "Bearer sponsor-token.sig" } });
      check("sponsor bearer alone cannot read member inbox", rs.status === 401); }
    r = await call("GET", "/me/intros");
    check("inbox lists own requests only", r.status === 200 && r.json.intros.length === 1 && r.json.intros[0].id === "i1" && r.json.intros[0].sponsor.org === "Acme");
    check("inbox hides sponsor email before accept", !r.text.includes("sam@acme.test"));
    check("respond to another member's request 404", (await call("POST", "/me/intros/i2", { accept: true })).status === 404);
    check("respond needs boolean", (await call("POST", "/me/intros/i1", { accept: "yes" })).status === 400);
    r = await call("POST", "/me/intros/i1", { accept: true });
    check("accept 200 + emails sponsor", r.status === 200 && r.json.status === "ACCEPTED" && mails.length === 1 && mails[0].to === "sam@acme.test" && mails[0].html.includes("ada@example.com"));
    check("second response 409", (await call("POST", "/me/intros/i1", { accept: false })).status === 409);
    r = await call("GET", "/me/intros");
    check("inbox shows sponsor email after accept", r.json.intros[0].status === "ACCEPTED" && r.json.intros[0].sponsor.email === "sam@acme.test");

    // Badges (member-claimed; owner-only revoke)
    check("badges need auth", (await call("GET", "/me/badges", undefined, null)).status === 401);
    check("claim needs auth", (await call("POST", "/me/badges/trainer/claim", undefined, null)).status === 401);
    r = await call("GET", "/me/badges");
    { const tb = r.json.badges.find((b: any) => b.id === "trainer");
      check("badge list: canIssue + trainer eligible", r.status === 200 && r.json.canIssue === true && tb.eligible === true && tb.value === 6 && tb.threshold === 5 && tb.award === null);
      check("badge list: team-lead needs confirmation", r.json.badges.find((b: any) => b.id === "team-lead").needsConfirmation === true); }
    check("claim unknown badge 404", (await call("POST", "/me/badges/nope/claim")).status === 404);
    check("claim unconfirmed team-lead 409", (await call("POST", "/me/badges/team-lead/claim")).status === 409);
    check("claim below threshold 409", (await call("POST", "/me/badges/lab-practitioner/claim")).status === 409);
    r = await call("POST", "/me/badges/trainer/claim");
    check("claim 201 for req.memberId", r.status === 201 && bh.awards.length === 1 && bh.awards[0].memberId === "m1" && r.json.award.verifyUrl === `https://front.test/badges/${r.json.award.id}`);
    check("claim response has no jwt or email", !r.text.includes("m1@example.com") && !/eyJ/.test(r.text));
    const awardId = r.json.award.id;
    check("duplicate claim 409", (await call("POST", "/me/badges/trainer/claim")).status === 409);
    r = await call("GET", "/me/badges");
    check("list shows award with linkedin url", r.json.badges.find((b: any) => b.id === "trainer").award?.linkedInUrl?.startsWith("https://www.linkedin.com/profile/add?"));
    check("other member cannot revoke (404)", (await call("POST", `/me/badge-awards/${awardId}/revoke`, {}, "m2")).status === 404 && bh.awards[0].revokedAt === null);
    check("revoke bad reason 400", (await call("POST", `/me/badge-awards/${awardId}/revoke`, { reason: 1 })).status === 400);
    r = await call("POST", `/me/badge-awards/${awardId}/revoke`, { reason: "no longer accurate" });
    check("owner revoke 200 sets revokedAt only", r.status === 200 && bh.awards.length === 1 && bh.awards[0].revokedAt !== null && typeof bh.awards[0].credentialJwt === "string");
    check("revoked badge cannot be re-claimed (409 REVOKED)", (await call("POST", "/me/badges/trainer/claim")).json?.code === "REVOKED");
    { const nk = await fetch(base.replace("/api/career", "/api/career-nokey") + "/me/badges/trainer/claim", { method: "POST" });
      const body = await nk.json() as { code?: string };
      check("claim with key unset is 503 NOT_CONFIGURED", nk.status === 503 && body.code === "NOT_CONFIGURED" && !bh.awards.some(a => a.memberId === "m2"));
      const nl = await (await fetch(base.replace("/api/career", "/api/career-nokey") + "/me/badges")).json() as { canIssue: boolean };
      check("list with key unset: canIssue false", nl.canIssue === false); }
  } finally {
    server.close();
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}
main().then(() => process.exit(0), e => { console.error(e); process.exit(1); });
