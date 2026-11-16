// Deterministic opportunity ingestion and self-only matching. No member data leaves this service.
import { randomUUID } from "node:crypto";
import type { OpportunitySourceKind, Prisma } from "@prisma/client";
import { parseUsajobs, parseGreenhouse, parseLever, parseAshby, stripHtml, type ParsedOpportunity } from "./opportunityParseCore.js";
import { buildTitleIndex, matchOccupations, matchSkills, isInternship } from "./opportunityMatchCore.js";
import { buildAliasIndex, type SkillLite } from "./skillMatchCore.js";
import { canonicalMap } from "./skillCatalogCore.js";
import type { SponsorUserRow } from "./sponsorAuthService.js";

export const OPPORTUNITY_STATUS = { INVALID: 400, NOT_FOUND: 404, UNAVAILABLE: 503 } as const;
export class OpportunityError extends Error {
  constructor(public code: keyof typeof OPPORTUNITY_STATUS, message: string) { super(message); }
}
export const FETCH_TIMEOUT_MS = 15_000;
export const MAX_JOBS = 500;
export const FETCH_HOSTS = new Set(["data.usajobs.gov", "boards-api.greenhouse.io", "api.lever.co", "api.eu.lever.co", "api.ashbyhq.com"]);
const TOKEN = /^[A-Za-z0-9_-]{1,80}$/;
type Config = Record<string, string>;
export interface SourceRow { id: string; kind: OpportunitySourceKind; label: string; companyName: string | null; config: unknown; enabled: boolean }
export interface JobData extends Omit<ParsedOpportunity, "company"> { company: string | null; onetCodes: string[]; skillIds: string[]; isInternship: boolean }
export interface JobRow extends JobData { id: string; sourceId: string; expiredAt: Date | null }
export interface Catalog { titles: { occupationCode: string; titleNorm: string }[]; occupations: { code: string; title: string }[]; skills: (SkillLite & { canonicalId: string | null; status: string })[] }
export interface OpportunityStore {
  sources(): Promise<SourceRow[]>;
  source(id: string): Promise<SourceRow | null>;
  createSource(data: Omit<SourceRow, "id">): Promise<SourceRow>;
  updateSource(id: string, data: Omit<SourceRow, "id">): Promise<SourceRow>;
  deleteSource(id: string): Promise<void>;
  catalog(): Promise<Catalog>;
  /** Atomically upsert, expire missing and mark success; reject results older than lastFetchedAt. */
  publish(id: string, rows: JobData[], started: Date, expectedSource: SourceRow): Promise<void>;
  fetchError(id: string, message: string): Promise<void>;
  prune(before: Date, now: Date): Promise<number>;
  targets(memberId: string): Promise<string[]>;
  related(codes: string[]): Promise<string[]>;
  assessments(memberId: string): Promise<{ skillId: string; provenance: string; level: number }[]>;
  disputes(memberId: string): Promise<string[]>;
  jobs(codes: string[], now: Date): Promise<JobRow[]>;
  job(id: string): Promise<JobRow | null>;
  saved(memberId: string): Promise<string[]>;
  save(memberId: string, id: string): Promise<void>;
  unsave(memberId: string, id: string): Promise<void>;
  sponsorSource(orgId: string, name: string): Promise<SourceRow>;
  createPosting(sourceId: string, data: JobData, now: Date): Promise<JobRow>;
  updatePosting(id: string, sourceId: string, data: JobData, now: Date): Promise<JobRow | null>;
  deletePosting(id: string, sourceId: string): Promise<boolean>;
}
const record = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
function text(v: unknown, max: number, required = false): string | null {
  if (v == null || v === "") { if (required) throw new OpportunityError("INVALID", "A required field is missing."); return null; }
  if (typeof v !== "string" || v.trim().length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)) throw new OpportunityError("INVALID", "Invalid field.");
  const value = v.trim();
  if (required && !value) throw new OpportunityError("INVALID", "A required field is missing.");
  return value || null;
}
function sourceData(body: unknown): Omit<SourceRow, "id"> {
  const b = record(body), c = record(b.config), kind = b.kind;
  if (!["USAJOBS", "GREENHOUSE", "LEVER", "ASHBY"].includes(String(kind))) throw new OpportunityError("INVALID", "Choose a supported external source.");
  const config: Config = {};
  if (kind === "USAJOBS") {
    config.keyword = text(c.keyword, 200, true)!;
    if (c.hiringPath != null) config.hiringPath = text(c.hiringPath, 80, true)!;
  } else {
    const key = kind === "GREENHOUSE" ? "boardToken" : kind === "LEVER" ? "site" : "jobBoardName";
    if (typeof c[key] !== "string" || !TOKEN.test(c[key])) throw new OpportunityError("INVALID", "Invalid board token.");
    config[key] = c[key];
    if (kind === "LEVER" && c.region != null) {
      if (c.region !== "us" && c.region !== "eu") throw new OpportunityError("INVALID", "Lever region must be us or eu.");
      config.region = c.region;
    }
  }
  if (b.enabled !== undefined && typeof b.enabled !== "boolean") throw new OpportunityError("INVALID", "enabled must be a boolean.");
  return { kind: kind as OpportunitySourceKind, label: text(b.label, 200, true)!, companyName: text(b.companyName, 200), config, enabled: b.enabled !== false };
}

export function sourceRequest(source: SourceRow, env: Record<string, string | undefined>): { url: URL; headers: Record<string, string> } {
  const data = sourceData(source), c = data.config as Config;
  let url: URL;
  const headers: Record<string, string> = { Accept: "application/json" };
  switch (data.kind) {
    case "USAJOBS":
      if (!env.USAJOBS_API_KEY || !env.USAJOBS_USER_AGENT_EMAIL) throw new OpportunityError("UNAVAILABLE", "USAJOBS credentials are not configured.");
      url = new URL("https://data.usajobs.gov/api/search");
      url.searchParams.set("Keyword", c.keyword); url.searchParams.set("ResultsPerPage", "500");
      if (c.hiringPath) url.searchParams.set("HiringPath", c.hiringPath);
      headers.Host = "data.usajobs.gov"; headers["User-Agent"] = env.USAJOBS_USER_AGENT_EMAIL; headers["Authorization-Key"] = env.USAJOBS_API_KEY;
      break;
    case "GREENHOUSE": url = new URL(`https://boards-api.greenhouse.io/v1/boards/${c.boardToken}/jobs?content=true`); break;
    case "LEVER": url = new URL(`https://${c.region === "eu" ? "api.eu.lever.co" : "api.lever.co"}/v0/postings/${c.site}?mode=json&limit=500`); break;
    case "ASHBY": url = new URL(`https://api.ashbyhq.com/posting-api/job-board/${c.jobBoardName}?includeCompensation=true`); break;
    default: throw new OpportunityError("INVALID", "This source cannot be fetched.");
  }
  if (url.protocol !== "https:" || !FETCH_HOSTS.has(url.hostname) || url.port || url.username || url.password) throw new OpportunityError("INVALID", "Disallowed source host.");
  return { url, headers };
}

export interface OpportunityDeps { store: OpportunityStore; fetch?: typeof fetch; now?: () => number; env?: Record<string, string | undefined>; timeoutMs?: number }
export function createOpportunityService(d: OpportunityDeps) {
  const store = d.store, now = d.now ?? Date.now;
  const catalog = async () => {
    const c = await store.catalog(), canonical = canonicalMap(c.skills);
    const active = new Set(c.skills.filter(s => s.status === "ACTIVE").map(s => s.id));
    const skills = c.skills.filter(s => active.has(canonical.get(s.id) ?? s.id)).map(s => ({ ...s, id: canonical.get(s.id) ?? s.id }));
    const index = buildAliasIndex(skills);
    // Ambiguous aliases cannot provide deterministic skill credit.
    for (const collision of index.collisions) index.byNorm.delete(collision.norm);
    return { c, canonical, index, titles: buildTitleIndex(c.titles, c.occupations) };
  };
  const enrich = (p: ParsedOpportunity, c: Awaited<ReturnType<typeof catalog>>): JobData => ({ ...p, onetCodes: matchOccupations(p.title, c.titles), skillIds: matchSkills(`${p.title}\n${p.description}`, c.index), isInternship: isInternship(`${p.title}\n${p.employmentType ?? ""}`) });
  async function fetchSource(id: string) {
    const source = await store.source(id);
    if (!source) throw new OpportunityError("NOT_FOUND", "Source not found.");
    if (source.kind === "SPONSOR" || !source.enabled) throw new OpportunityError("INVALID", "This source is not enabled for fetching.");
    const started = new Date(now());
    try {
      const { url, headers } = sourceRequest(source, d.env ?? process.env);
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const task = async () => {
        const response = await (d.fetch ?? fetch)(url, { headers, redirect: "error", signal: controller.signal });
        if (!response.ok || response.redirected || (response.url && new URL(response.url).href !== url.href)) throw new Error("Source request failed");
        const json: unknown = await response.json();
        const root = record(json);
        const raw = source.kind === "LEVER" ? json : source.kind === "USAJOBS" ? record(root.SearchResult).SearchResultItems : root.jobs;
        if (!Array.isArray(raw)) throw new Error("Invalid source response");
        const limited = (source.kind === "ASHBY" ? raw.filter(item => record(item).isListed !== false) : raw).slice(0, MAX_JOBS);
        const input = source.kind === "LEVER" ? limited : source.kind === "USAJOBS" ? { SearchResult: { SearchResultItems: limited } } : { jobs: limited };
        const company = source.companyName ?? source.label;
        const parsed = source.kind === "USAJOBS" ? parseUsajobs(input) : source.kind === "GREENHOUSE" ? parseGreenhouse(input, company) : source.kind === "LEVER" ? parseLever(input, company) : parseAshby(input, company);
        // Partial malformed results cannot authoritatively expire jobs either.
        if (parsed.length !== limited.length) throw new Error("Malformed source postings");
        return parsed;
      };
      const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("Source timed out")); }, d.timeoutMs ?? FETCH_TIMEOUT_MS); });
      let parsed: ParsedOpportunity[];
      try { parsed = await Promise.race([task(), timeout]); } finally { clearTimeout(timer); }
      const c = await catalog();
      await store.publish(id, [...new Map(parsed.map(p => [p.externalId, enrich(p, c)])).values()], started, source);
      return { ok: true, fetched: parsed.length };
    } catch {
      // Fixed message: never persist provider errors, headers, URLs or secrets.
      const missing = source.kind === "USAJOBS" && (!(d.env ?? process.env).USAJOBS_API_KEY || !(d.env ?? process.env).USAJOBS_USER_AGENT_EMAIL);
      const error = missing ? "USAJOBS credentials are not configured." : "Source fetch failed; previous listings were kept.";
      await store.fetchError(id, error);
      return { ok: false, fetched: 0, error };
    }
  }
  async function allowedCodes(memberId: string) { const targets = await store.targets(memberId); return targets.length ? [...new Set([...targets, ...await store.related(targets)])] : []; }
  async function visibleJob(memberId: string, id: string) {
    const job = await store.job(id), codes = new Set(await allowedCodes(memberId));
    if (!job || job.expiredAt || (job.closesAt && job.closesAt.getTime() <= now()) || !job.onetCodes.some(c => codes.has(c))) throw new OpportunityError("NOT_FOUND", "Opportunity not found.");
    return job;
  }
  async function postingData(body: unknown, company: string, previous?: JobRow): Promise<JobData> {
    const b: Record<string, unknown> = { ...(previous ?? {}), ...record(body) };
    const rawUrl = text(b.url, 2000, true)!;
    let url: URL;
    try { url = new URL(rawUrl); } catch { throw new OpportunityError("INVALID", "Enter an https posting URL."); }
    if (url.protocol !== "https:" || url.username || url.password) throw new OpportunityError("INVALID", "Enter an https posting URL.");
    const closes = b.closesAt === "" || b.closesAt == null ? null : new Date(String(b.closesAt));
    if (closes && (!Number.isFinite(closes.getTime()) || closes.getTime() <= now())) throw new OpportunityError("INVALID", "Closing date must be in the future.");
    const p: ParsedOpportunity = { externalId: previous?.externalId ?? randomUUID(), title: text(b.title, 200, true)!, company, location: text(b.location, 200), url: url.href, postedAt: previous?.postedAt ?? new Date(now()), closesAt: closes, employmentType: text(b.employmentType, 100), description: stripHtml(text(b.description, 20_000) ?? "") };
    return enrich(p, await catalog());
  }
  async function ownedPosting(sponsor: SponsorUserRow, id: string) {
    const job = await store.job(id), source = job && await store.source(job.sourceId);
    if (!job || !source || source.kind !== "SPONSOR" || record(source.config).sponsorOrgId !== sponsor.org.id) throw new OpportunityError("NOT_FOUND", "Posting not found.");
    return job;
  }
  return {
    sources: () => store.sources(),
    createSource: (body: unknown) => store.createSource(sourceData(body)),
    async updateSource(id: string, body: unknown) {
      const previous = await store.source(id);
      if (!previous || previous.kind === "SPONSOR") throw new OpportunityError("NOT_FOUND", "External source not found.");
      return store.updateSource(id, sourceData({ ...previous, ...record(body) }));
    },
    async deleteSource(id: string) {
      const previous = await store.source(id);
      if (!previous || previous.kind === "SPONSOR") throw new OpportunityError("NOT_FOUND", "External source not found.");
      await store.deleteSource(id); return { ok: true };
    },
    fetchSource,
    async refresh() {
      const results = [];
      for (const source of await store.sources()) if (source.enabled && source.kind !== "SPONSOR") results.push(await fetchSource(source.id));
      await store.prune(new Date(now() - 60 * 24 * 60 * 60 * 1000), new Date(now()));
      return results;
    },
    async feed(memberId: string) {
      const codes = await allowedCodes(memberId);
      if (!codes.length) return { opportunities: [] };
      const [jobs, assessments, disputes, saved, c] = await Promise.all([store.jobs(codes, new Date(now())), store.assessments(memberId), store.disputes(memberId), store.saved(memberId), catalog()]);
      const root = (id: string) => c.canonical.get(id) ?? id;
      const disputed = new Set(disputes.map(root));
      const active = new Set(c.c.skills.filter(s => s.status === "ACTIVE").map(s => s.id));
      const demonstrated = new Set(assessments.filter(a => active.has(root(a.skillId)) && !disputed.has(root(a.skillId)) && (a.provenance === "MANAGER_VERIFIED" || (a.provenance === "AI_INFERRED" && a.level >= 3))).map(a => root(a.skillId)));
      const names = new Map(c.c.skills.map(s => [s.id, s.name])), titles = new Map(c.c.occupations.map(o => [o.code, o.title]));
      const allowed = new Set(codes), savedSet = new Set(saved);
      const result = jobs.filter(j => !j.expiredAt && (!j.closesAt || j.closesAt.getTime() > now()) && j.onetCodes.some(code => allowed.has(code))).map(j => {
        const skillIds = [...new Set(j.skillIds.map(root))].filter(id => active.has(id));
        const have = skillIds.filter(id => demonstrated.has(id)), gaps = skillIds.filter(id => !demonstrated.has(id));
        return { id: j.id, title: j.title, company: j.company, location: j.location, url: j.url, postedAt: j.postedAt, closesAt: j.closesAt, employmentType: j.employmentType, description: j.description, isInternship: j.isInternship, saved: savedSet.has(j.id), why: { occupations: j.onetCodes.filter(code => allowed.has(code)).map(code => ({ code, title: titles.get(code) ?? code })), haveSkills: have.map(id => ({ id, name: names.get(id) ?? id })), gapSkills: gaps.map(id => ({ id, name: names.get(id) ?? id })) } };
      }).sort((a, b) => b.why.haveSkills.length - a.why.haveSkills.length || (b.postedAt?.getTime() ?? 0) - (a.postedAt?.getTime() ?? 0) || a.id.localeCompare(b.id));
      return { opportunities: result };
    },
    async save(memberId: string, id: string) { await visibleJob(memberId, id); await store.save(memberId, id); return { saved: true }; },
    async unsave(memberId: string, id: string) { await store.unsave(memberId, id); return { saved: false }; },
    async createPosting(sponsor: SponsorUserRow, body: unknown) {
      const data = await postingData(body, sponsor.org.name);
      const source = await store.sponsorSource(sponsor.org.id, sponsor.org.name);
      return store.createPosting(source.id, data, new Date(now()));
    },
    async updatePosting(sponsor: SponsorUserRow, id: string, body: unknown) {
      const previous = await ownedPosting(sponsor, id);
      const updated = await store.updatePosting(id, previous.sourceId, await postingData(body, sponsor.org.name, previous), new Date(now()));
      if (!updated) throw new OpportunityError("NOT_FOUND", "Posting not found."); return updated;
    },
    async deletePosting(sponsor: SponsorUserRow, id: string) {
      const previous = await ownedPosting(sponsor, id);
      if (!await store.deletePosting(id, previous.sourceId)) throw new OpportunityError("NOT_FOUND", "Posting not found.");
      return { ok: true };
    },
  };
}
export type OpportunityService = ReturnType<typeof createOpportunityService>;

let defaultStore: Promise<OpportunityStore> | undefined;
export function getDefaultOpportunityStore(): Promise<OpportunityStore> {
  return defaultStore ??= import("../db/prisma.js").then(({ prisma }): OpportunityStore => ({
    sources: () => prisma.opportunitySource.findMany({ orderBy: { createdAt: "asc" } }),
    source: id => prisma.opportunitySource.findUnique({ where: { id } }),
    createSource: data => prisma.opportunitySource.create({ data: { ...data, config: data.config as Prisma.InputJsonValue } }),
    updateSource: (id, data) => prisma.opportunitySource.update({ where: { id }, data: { ...data, config: data.config as Prisma.InputJsonValue } }),
    deleteSource: async id => { await prisma.opportunitySource.delete({ where: { id } }); },
    catalog: async () => {
      const [titles, occupations, skills] = await Promise.all([
        prisma.onetJobTitle.findMany({ select: { occupationCode: true, titleNorm: true } }),
        prisma.onetOccupation.findMany({ select: { code: true, title: true } }),
        prisma.skill.findMany({ select: { id: true, name: true, canonicalId: true, status: true, aliases: { select: { alias: true } } } }),
      ]);
      return { titles, occupations, skills: skills.map(s => ({ ...s, aliases: s.aliases.map(a => a.alias) })) };
    },
    publish: (id, rows, started, expected) => prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`opportunity-fetch:${id}`}))`;
      // Admin edits use ordinary row writes; hold this row while checking configuration
      // and publishing so an edit cannot race between that check and the upserts.
      await tx.$queryRaw`SELECT id FROM "OpportunitySource" WHERE id = ${id} FOR UPDATE`;
      const source = await tx.opportunitySource.findUnique({ where: { id } });
      if (!source || !source.enabled || (source.lastFetchedAt && source.lastFetchedAt > started)) return;
      // An admin may have changed the board configuration while the request was in flight.
      const configKey = (config: unknown) => JSON.stringify(Object.entries(record(config)).sort(([a], [b]) => a.localeCompare(b)));
      if (source.kind !== expected.kind || source.label !== expected.label || source.companyName !== expected.companyName || configKey(source.config) !== configKey(expected.config)) return;
      for (const row of rows) await tx.opportunity.upsert({ where: { sourceId_externalId: { sourceId: id, externalId: row.externalId } }, create: { ...row, sourceId: id, firstSeenAt: started, lastSeenAt: started, expiredAt: null }, update: { ...row, lastSeenAt: started, expiredAt: null } });
      await tx.opportunity.updateMany({ where: { sourceId: id, externalId: { notIn: rows.map(r => r.externalId) }, expiredAt: null }, data: { expiredAt: started } });
      await tx.opportunitySource.update({ where: { id }, data: { lastFetchedAt: started, lastError: null } });
    }, { timeout: 30_000 }),
    fetchError: async (id, message) => { await prisma.opportunitySource.updateMany({ where: { id }, data: { lastError: message } }); },
    prune: async (before, now) => {
      await prisma.opportunity.updateMany({ where: { expiredAt: null, closesAt: { lte: now } }, data: { expiredAt: now } });
      return (await prisma.opportunity.deleteMany({ where: { expiredAt: { lt: before } } })).count;
    },
    targets: async memberId => (await prisma.careerTarget.findMany({ where: { memberId }, select: { onetCode: true } })).map(t => t.onetCode),
    related: async codes => (await prisma.onetRelatedOccupation.findMany({ where: { occupationCode: { in: codes }, tier: { startsWith: "Primary" } }, select: { relatedCode: true } })).map(r => r.relatedCode),
    assessments: memberId => prisma.skillAssessment.findMany({ where: { memberId }, select: { skillId: true, provenance: true, level: true } }),
    disputes: async memberId => (await prisma.skillDispute.findMany({ where: { memberId, status: { in: ["OPEN", "UPHELD"] } }, select: { skillId: true } })).map(d => d.skillId),
    jobs: (codes, now) => prisma.opportunity.findMany({ where: { expiredAt: null, OR: [{ closesAt: null }, { closesAt: { gt: now } }], onetCodes: { hasSome: codes }, source: { enabled: true } } }),
    job: id => prisma.opportunity.findFirst({ where: { id, source: { enabled: true } } }),
    saved: async memberId => (await prisma.opportunitySave.findMany({ where: { memberId }, select: { opportunityId: true } })).map(s => s.opportunityId),
    save: async (memberId, opportunityId) => { await prisma.opportunitySave.upsert({ where: { memberId_opportunityId: { memberId, opportunityId } }, create: { memberId, opportunityId }, update: {} }); },
    unsave: async (memberId, opportunityId) => { await prisma.opportunitySave.deleteMany({ where: { memberId, opportunityId } }); },
    sponsorSource: (orgId, name) => prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sponsor-opportunity:${orgId}`}))`;
      const existing = await tx.opportunitySource.findFirst({ where: { kind: "SPONSOR", config: { path: ["sponsorOrgId"], equals: orgId } } });
      return existing ?? tx.opportunitySource.create({ data: { kind: "SPONSOR", label: name, companyName: name, config: { sponsorOrgId: orgId } } });
    }),
    createPosting: (sourceId, data, now) => prisma.opportunity.create({ data: { ...data, sourceId, firstSeenAt: now, lastSeenAt: now } }),
    updatePosting: (id, sourceId, data, now) => prisma.$transaction(async tx => {
      const changed = await tx.opportunity.updateMany({ where: { id, sourceId }, data: { ...data, lastSeenAt: now, expiredAt: null } });
      return changed.count ? tx.opportunity.findUnique({ where: { id } }) : null;
    }),
    deletePosting: async (id, sourceId) => (await prisma.opportunity.deleteMany({ where: { id, sourceId } })).count === 1,
  }));
}

/** Cron boundary: data maintenance only, opt-in and never throws. */
export async function refreshOpportunities(deps?: OpportunityDeps): Promise<void> {
  if ((deps?.env ?? process.env).CAREERS_FEED_ENABLED !== "1") return;
  try { await createOpportunityService(deps ?? { store: await getDefaultOpportunityStore() }).refresh(); }
  catch { console.error("[careers] Opportunity refresh could not finish."); }
}
