// Offline integration fixtures: no credentials, external requests, or database.
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { createOpportunityService, refreshOpportunities, sourceRequest, OpportunityError, FETCH_TIMEOUT_MS, MAX_JOBS, type OpportunityStore, type SourceRow, type JobRow, type JobData, type Catalog } from "./opportunityService.js";
import { createCareerRouter } from "../api/career.js";
import { createCareerAdminRouter } from "../api/careerAdmin.js";
import { createSponsorRouter } from "../api/sponsor.js";
import { signSponsorToken, type SponsorUserRow, type SponsorAuthStore } from "./sponsorAuthService.js";

let passed = 0;
const check = (name: string, fn: () => void) => { fn(); passed++; console.log(`✓ ${name}`); };
const date = new Date("2026-11-15T12:00:00Z"), now = () => date.getTime();
const sponsor: SponsorUserRow = { id: "sponsor1", email: "s@example.test", name: "Sam", tokenVersion: 0, disabledAt: null, org: { id: "org1", name: "Space Co", active: true, accessUntil: null } };
const catalog: Catalog = {
  titles: [{ occupationCode: "17-2011.00", titleNorm: "aerospace engineer" }],
  occupations: [{ code: "17-2011.00", title: "Aerospace Engineers" }, { code: "17-2141.00", title: "Mechanical Engineers" }],
  skills: [
    { id: "python", name: "Python", aliases: [], canonicalId: null, status: "ACTIVE" },
    { id: "py-old", name: "Python coding", aliases: [], canonicalId: "python", status: "ARCHIVED" },
    { id: "cad", name: "SolidWorks", aliases: [], canonicalId: null, status: "ACTIVE" },
    { id: "java", name: "Java", aliases: [], canonicalId: null, status: "ACTIVE" },
  ],
};
const source = (kind: SourceRow["kind"] = "GREENHOUSE"): SourceRow => ({ id: "source1", kind, label: "Space", companyName: "Space Co", config: kind === "USAJOBS" ? { keyword: "aerospace" } : kind === "LEVER" ? { site: "space", region: "eu" } : kind === "ASHBY" ? { jobBoardName: "space" } : { boardToken: "space" }, enabled: true });
const job = (id: string, patch: Partial<JobRow> = {}): JobRow => ({ id, sourceId: "source1", externalId: id, title: "Aerospace Engineer", company: "Space Co", location: "West Lafayette", url: "https://example.test/job", description: "Python SolidWorks", postedAt: date, closesAt: null, employmentType: "INTERNSHIP", isInternship: true, onetCodes: ["17-2011.00"], skillIds: ["python", "cad"], expiredAt: null, ...patch });

function fixture() {
  const sources = [source()];
  const jobs: JobRow[] = [job("old")];
  const saved = new Map<string, Set<string>>([["other", new Set(["old"])]]);
  const calls = { errors: [] as string[], publications: [] as JobData[][], prunes: 0, fetches: 0 };
  let disputes: string[] = [];
  const store: OpportunityStore = {
    sources: async () => sources,
    source: async id => sources.find(s => s.id === id) ?? null,
    createSource: async data => { const s = { ...data, id: `source${sources.length + 1}` }; sources.push(s); return s; },
    updateSource: async (id, data) => { const s = sources.find(s => s.id === id)!; Object.assign(s, data); return s; },
    deleteSource: async id => { sources.splice(sources.findIndex(s => s.id === id), 1); },
    catalog: async () => catalog,
    publish: async (id, rows, started) => {
      calls.publications.push(rows);
      for (const j of jobs) if (j.sourceId === id && !rows.some(r => r.externalId === j.externalId)) j.expiredAt = started;
      for (const row of rows) {
        const existing = jobs.find(j => j.sourceId === id && j.externalId === row.externalId);
        if (existing) Object.assign(existing, row, { expiredAt: null });
        else jobs.push({ ...row, id: row.externalId, sourceId: id, expiredAt: null });
      }
    },
    fetchError: async (_id, error) => { calls.errors.push(error); }, prune: async () => { calls.prunes++; return 0; },
    targets: async id => id === "m1" ? ["17-2011.00"] : [], related: async () => ["17-2141.00"],
    assessments: async () => [{ skillId: "py-old", provenance: "AI_INFERRED", level: 3 }, { skillId: "cad", provenance: "SELF_CLAIMED", level: 5 }, { skillId: "java", provenance: "MANAGER_VERIFIED", level: 1 }],
    disputes: async () => disputes,
    jobs: async () => jobs,
    job: async id => jobs.find(j => j.id === id) ?? null,
    saved: async id => [...(saved.get(id) ?? [])],
    save: async (id, jobId) => { const set = saved.get(id) ?? new Set(); set.add(jobId); saved.set(id, set); },
    unsave: async (id, jobId) => { saved.get(id)?.delete(jobId); },
    sponsorSource: async (orgId, name) => { const old = sources.find(s => s.kind === "SPONSOR" && (s.config as { sponsorOrgId: string }).sponsorOrgId === orgId); if (old) return old; const s: SourceRow = { id: "sponsor-source", kind: "SPONSOR", label: name, companyName: name, config: { sponsorOrgId: orgId }, enabled: true }; sources.push(s); return s; },
    createPosting: async (sourceId, data) => { const j: JobRow = { ...data, id: `post${jobs.length}`, sourceId, expiredAt: null }; jobs.push(j); return j; },
    updatePosting: async (id, sourceId, data) => { const j = jobs.find(j => j.id === id && j.sourceId === sourceId); if (!j) return null; Object.assign(j, data); return j; },
    deletePosting: async (id, sourceId) => { const i = jobs.findIndex(j => j.id === id && j.sourceId === sourceId); if (i < 0) return false; jobs.splice(i, 1); return true; },
  };
  return { store, sources, jobs, saved, calls, dispute: (ids: string[]) => { disputes = ids; } };
}
const greenhouse = (id = 1) => ({ id, title: "Aerospace Engineer intern", absolute_url: "https://example.test/job", location: { name: "Indiana" }, updated_at: date.toISOString(), content: "<p>Python SolidWorks</p>" });
const jsonFetch = (data: unknown) => (async () => new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } })) as typeof fetch;
const invalid = async (fn: () => Promise<unknown>) => assert.rejects(async () => fn(), e => e instanceof OpportunityError && e.code === "INVALID");
const missing = async (fn: () => Promise<unknown>) => assert.rejects(async () => fn(), e => e instanceof OpportunityError && e.code === "NOT_FOUND");

check("fixed timeout and cap", () => { assert.equal(FETCH_TIMEOUT_MS, 15000); assert.equal(MAX_JOBS, 500); });
for (const token of ["../evil", "foo/bar", "evil?x=y", "foo@127.0.0.1", "https://evil.test", "a".repeat(81)]) {
  check(`reject unsafe token ${token.slice(0, 20)}`, () => assert.throws(() => sourceRequest({ ...source(), config: { boardToken: token } }, {}), OpportunityError));
}
check("fixed endpoints and credential headers", () => {
  assert.equal(sourceRequest(source("LEVER"), {}).url.hostname, "api.eu.lever.co");
  const r = sourceRequest(source("USAJOBS"), { USAJOBS_API_KEY: "secret", USAJOBS_USER_AGENT_EMAIL: "registered@example.test" });
  assert.equal(r.url.hostname, "data.usajobs.gov"); assert.equal(r.headers["Authorization-Key"], "secret"); assert.equal(r.url.searchParams.get("ResultsPerPage"), "500");
  assert.throws(() => sourceRequest({ ...source("LEVER"), config: { site: "space", region: "https://evil.test" } }, {}));
});

{
  const f = fixture(); let init: RequestInit | undefined;
  const svc = createOpportunityService({ store: f.store, now, fetch: (async (_url, opts) => { init = opts; return jsonFetch({ jobs: [greenhouse()] })(_url, opts); }) as typeof fetch });
  const result = await svc.fetchSource("source1");
  check("fetch enriches and expires missing only on success", () => { assert.equal(result.ok, true); assert.deepEqual(f.calls.publications[0][0].onetCodes, ["17-2011.00"]); assert.deepEqual(f.calls.publications[0][0].skillIds, ["python", "cad"]); assert.deepEqual(f.jobs[0].expiredAt, date); });
  check("fetch refuses redirects and carries abort signal", () => { assert.equal(init?.redirect, "error"); assert.ok(init?.signal); assert.equal(JSON.stringify(init).includes("m1"), false); });
  await svc.fetchSource("source1");
  check("repeat fetch upserts instead of duplicates", () => assert.equal(f.jobs.filter(j => j.externalId === "1").length, 1));
}
for (const response of [new Response("{}", { status: 302 }), new Response("{}"), new Response(JSON.stringify({ jobs: [{}] })), new Response(JSON.stringify({ jobs: [greenhouse(), {}] }))]) {
  const f = fixture(), svc = createOpportunityService({ store: f.store, now, fetch: (async () => response) as typeof fetch });
  const result = await svc.fetchSource("source1");
  check("bad response preserves prior listings", () => { assert.equal(result.ok, false); assert.equal(f.calls.publications.length, 0); assert.equal(f.jobs[0].expiredAt, null); assert.equal(f.calls.errors.length, 1); });
}
{
  const f = fixture(); f.sources[0] = source("USAJOBS");
  const svc = createOpportunityService({ store: f.store, env: {}, fetch: (async () => { throw new Error("should not run"); }) as typeof fetch });
  await svc.fetchSource("source1");
  check("missing USAJOBS key skips without expiring and records safe error", () => { assert.match(f.calls.errors[0], /credentials/); assert.equal(f.calls.publications.length, 0); });
}
{
  const f = fixture(); let aborted = false;
  const svc = createOpportunityService({ store: f.store, timeoutMs: 5, fetch: (async (_url, opts) => { opts?.signal?.addEventListener("abort", () => { aborted = true; }); return new Promise<Response>(() => {}); }) as typeof fetch });
  const r = await svc.fetchSource("source1");
  check("timeout aborts a hanging fetch and preserves listings", () => { assert.equal(r.ok, false); assert.equal(aborted, true); assert.equal(f.calls.publications.length, 0); });
}
{
  const f = fixture(); const r = await createOpportunityService({ store: f.store, fetch: jsonFetch({ jobs: Array.from({ length: 510 }, (_, i) => greenhouse(i + 1)) }) }).fetchSource("source1");
  check("at most500 source postings processed", () => { assert.equal(r.fetched, 500); assert.equal(f.calls.publications[0].length, 500); });
}
{
  const f = fixture(); f.sources[0] = source("ASHBY");
  const r = await createOpportunityService({ store: f.store, fetch: jsonFetch({ jobs: [{ title: "Aerospace Engineer", jobUrl: "https://example.test/ashby", descriptionPlain: "Python", isListed: true }, { isListed: false }] }) }).fetchSource("source1");
  check("documented Ashby shape and unlisted omission succeed", () => assert.equal(r.ok, true));
}
{
  const f = fixture(); const svc = createOpportunityService({ store: f.store, now });
  await invalid(() => svc.createSource({ ...source(), config: { boardToken: "../private" } }));
  await invalid(() => svc.createSource({ ...source(), kind: "SPONSOR", config: { sponsorOrgId: "org2" } }));
  const created = await svc.createSource({ ...source(), config: { boardToken: "safe", url: "https://evil.test" } });
  check("source writes accept only sanitized config", () => assert.deepEqual(created.config, { boardToken: "safe" }));
  await svc.updateSource(created.id, { enabled: false });
  check("partial source update preserves config", () => assert.equal(created.enabled, false));
  await svc.deleteSource(created.id);
  check("source delete works", () => assert.equal(f.sources.length, 1));
}
{
  const f = fixture();
  f.jobs.push(job("stronger", { postedAt: new Date(1), skillIds: ["python", "java"] }), job("related", { onetCodes: ["17-2141.00"], skillIds: [] }), job("unrelated", { onetCodes: ["other"] }), job("expired", { expiredAt: date }), job("closed", { closesAt: date }));
  const svc = createOpportunityService({ store: f.store, now });
  const feed = await svc.feed("m1");
  check("feed ranks jobs by demonstrated skills then date", () => assert.deepEqual(feed.opportunities.map(j => j.id), ["stronger", "old", "related"]));
  check("self-claims are gaps and canonical inferred skill is demonstrated", () => { const old = feed.opportunities.find(j => j.id === "old")!; assert.deepEqual(old.why.haveSkills.map(s => s.id), ["python"]); assert.deepEqual(old.why.gapSkills.map(s => s.id), ["cad"]); assert.equal(old.saved, false); assert.equal("sourceId" in old, false); });
  f.dispute(["py-old"]);
  check("canonical disputes suppress demonstration", () => {});
  assert.equal((await svc.feed("m1")).opportunities.find(j => j.id === "old")!.why.haveSkills.length, 0);
  await svc.save("m1", "old"); await svc.unsave("m1", "old");
  check("save is own-only and idempotent; unsave preserves others", () => { assert.equal(f.saved.get("m1")!.size, 0); assert.equal(f.saved.get("other")!.has("old"), true); });
  await missing(() => svc.save("m1", "unrelated")); await missing(() => svc.save("m1", "expired")); await missing(() => svc.save("m1", "closed"));
  check("inaccessible or expired opportunities cannot be saved", () => assert.equal(f.saved.get("m1")!.size, 0));
}
{
  const f = fixture(), svc = createOpportunityService({ store: f.store, now });
  const body = { title: "Aerospace Engineer intern", url: "https://example.test/post", location: "Indiana", employmentType: "INTERNSHIP", description: "<p>Python</p>", closesAt: "2026-12-01", company: "spoofed", sourceId: "source1", onetCodes: ["spoofed"] };
  const posting = await svc.createPosting(sponsor, body);
  check("sponsor posting company and matches derived, not client controlled", () => { assert.equal(posting.company, sponsor.org.name); assert.deepEqual(posting.onetCodes, ["17-2011.00"]); assert.equal(posting.description, "Python"); });
  await svc.createPosting(sponsor, body);
  check("one sponsor source per organization", () => assert.equal(f.sources.filter(s => s.kind === "SPONSOR").length, 1));
  const other = { ...sponsor, org: { ...sponsor.org, id: "org2" } };
  await missing(() => svc.updatePosting(other, posting.id, { title: "stolen" }));
  await missing(() => svc.deletePosting(other, posting.id));
  await missing(() => svc.updatePosting(sponsor, "old", { title: "external edit" }));
  check("cross-org and external posting mutations rejected", () => assert.equal(posting.title, body.title));
  await svc.updatePosting(sponsor, posting.id, { description: "Updated Python" });
  check("owner partial patch preserves other fields", () => { assert.equal(posting.description, "Updated Python"); assert.equal(posting.title, body.title); });
  await svc.deletePosting(sponsor, posting.id);
  check("owner can delete posting", () => assert.equal(f.jobs.includes(posting), false));
  await invalid(() => svc.createPosting(sponsor, { ...body, url: "javascript:alert(1)" }));
  await invalid(() => svc.createPosting(sponsor, { ...body, closesAt: "2020-01-01" }));
}
{
  const f = fixture(); await refreshOpportunities({ store: f.store, env: {}, fetch: jsonFetch({ jobs: [] }) });
  check("cron off by default", () => assert.equal(f.calls.prunes, 0));
  await refreshOpportunities({ store: f.store, env: { CAREERS_FEED_ENABLED: "1" }, fetch: jsonFetch({ jobs: [] }) });
  check("enabled maintenance fetches and prunes", () => { assert.equal(f.calls.prunes, 1); assert.equal(f.calls.publications.length, 1); });
  const bad = { ...f.store, sources: async () => { throw new Error("db failed"); } };
  await refreshOpportunities({ store: bad, env: { CAREERS_FEED_ENABLED: "1" } });
  check("cron never throws on store failure", () => {});
}

// Router integration: auth, identity and ownership through actual HTTP over loopback.
{
  const f = fixture();
  const app = express(); app.use(express.json());
  const auth: express.RequestHandler = (req, _res, next) => { req.memberId = "m1"; next(); };
  app.use("/career", createCareerRouter({ auth, opportunityStore: f.store, now }));
  app.use("/admin", createCareerAdminRouter({ auth: [auth], opportunityStore: f.store, opportunityFetch: jsonFetch({ jobs: [greenhouse()] }), now }));
  const authStore: SponsorAuthStore = { findUserById: async id => id === sponsor.id ? sponsor : null, findUserByEmail: async () => sponsor, invalidateUnusedTokens: async () => {}, createLoginToken: async () => {}, consumeLoginToken: async () => null, touchLogin: async () => {}, bumpTokenVersion: async () => {}, deleteStaleTokens: async () => 0 };
  const secret = "x".repeat(40), token = signSponsorToken(secret, sponsor.id, 0, now()).token;
  app.use("/sponsor", createSponsorRouter({ store: authStore, opportunityStore: f.store, secret, now }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = (path: string, method = "GET", body?: unknown, bearer?: string) => fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  try {
    let res = await request("/career/me/opportunities");
    check("member feed route works without public exposure", () => assert.equal(res.status, 200));
    res = await request("/career/me/opportunities/old/save", "PUT", { memberId: "other" });
    check("save route uses authenticated member identity", () => { assert.equal(res.status, 200); assert.equal(f.saved.get("m1")!.has("old"), true); });
    res = await request("/career/me/opportunities/old/save", "DELETE"); assert.equal(res.status, 200);
    res = await request("/admin/sources", "POST", { ...source(), config: { boardToken: "../evil" } });
    check("admin invalid source mapped400", () => assert.equal(res.status, 400));
    res = await request("/admin/sources"); check("admin source list route", () => assert.equal(res.status, 200));
    res = await request("/admin/sources/source1/fetch", "POST"); check("manual fetch route", () => assert.equal(res.status, 200));
    res = await request("/sponsor/postings", "POST", { title: "Aerospace Engineer", url: "https://example.test/new" });
    check("posting route requires sponsor auth", () => assert.equal(res.status, 401));
    res = await request("/sponsor/me", "GET", undefined, token);
    const me = await res.json() as { features: { postings: boolean } };
    check("sponsor me enables existing posting form", () => assert.equal(me.features.postings, true));
    res = await request("/sponsor/postings", "POST", { title: "Aerospace Engineer", url: "https://example.test/new", description: "Python" }, token);
    const created = await res.json() as { posting: JobRow };
    check("sponsor posting endpoint creates", () => assert.equal(res.status, 201));
    res = await request(`/sponsor/postings/${created.posting.id}`, "PATCH", { title: "Aerospace Engineer intern" }, token);
    check("sponsor posting endpoint patches", () => assert.equal(res.status, 200));
    res = await request(`/sponsor/postings/${created.posting.id}`, "DELETE", undefined, token);
    check("sponsor posting endpoint deletes", () => assert.equal(res.status, 200));
  } finally { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
}
console.log(`opportunityService: ${passed} checks passed`);
