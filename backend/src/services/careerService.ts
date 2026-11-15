// Member-facing career service: own-data reads/writes only. No model calls; numbers come from
// impact snapshots (records) and member claims that an admin has verified.
import { ACHIEVEMENTS, METRICS, shareable, validateMemberTemplate } from "./impactMetricCore.js";
import type { SkillDemand } from "./onetLinkService.js";
import {
  buildBullets, buildJsonResume, exportable,
  type AttestationInput, type BulletRowInput, type JsonResume, type SnapshotInput,
} from "./resumeCore.js";

export const ONET_ATTRIBUTION =
  "O*NET 31.0 Database by U.S. Department of Labor, Employment and Training Administration (USDOL/ETA), licensed under CC BY 4.0 " +
  "(https://creativecommons.org/licenses/by/4.0/). Source: https://www.onetcenter.org/database.html. " +
  "This derivative has been modified (selected columns and files) and is not endorsed by USDOL/ETA.";

export type CareerErrorCode = "INVALID" | "NOT_FOUND" | "CONFLICT" | "RATE_LIMITED";
export class CareerError extends Error {
  constructor(public code: CareerErrorCode, message: string) { super(message); }
}
export const CAREER_STATUS: Record<CareerErrorCode, number> = { INVALID: 400, NOT_FOUND: 404, CONFLICT: 409, RATE_LIMITED: 429 };

/** Max claims a member can have waiting on review (PENDING or NEEDS_PROOF) at once. */
export const MAX_PENDING_CLAIMS = 20;
export const MAX_TARGETS = 3;
export const OPEN_TO = ["INTERNSHIP", "COOP", "FULL_TIME", "RESEARCH"] as const;
export const CLAIM_UNITS = ["USD", "people", "hours", "items"] as const;
const TERM = /^\d{4}-(0[1-9]|1[0-2])$/;

export interface AttestationRow extends AttestationInput {
  evidenceUrl: string | null; note: string | null; reviewNote: string | null; createdAt: Date;
}
export interface ProfileRow {
  major: string | null; gradTerm: string | null; openTo: string[]; availableFrom: string | null;
  headline: string | null; shareWithSponsors: boolean; showOnPublicPage: boolean;
}
export interface CertRow { name: string; issuer: string | null; date: string | null }

export interface CareerStore {
  member(id: string): Promise<{ id: string; displayName: string; email: string | null } | null>;
  profile(id: string): Promise<ProfileRow | null>;
  upsertProfile(id: string, data: Partial<ProfileRow>): Promise<ProfileRow>;
  targets(id: string): Promise<{ code: string; title: string; position: number }[]>;
  existingOccupations(codes: string[]): Promise<string[]>;
  replaceTargets(id: string, codes: string[]): Promise<void>;
  searchOccupations(q: string, limit: number): Promise<{ code: string; title: string }[]>;
  snapshots(id: string): Promise<(SnapshotInput & { computedAt: Date })[]>;
  attestations(id: string): Promise<AttestationRow[]>;
  bulletRows(id: string): Promise<BulletRowInput[]>;
  upsertBullet(id: string, kind: string, sourceId: string, data: { template?: string | null; included?: boolean; position?: number }): Promise<void>;
  deleteBullet(id: string, kind: string, sourceId: string): Promise<void>;
  disabledMetrics(): Promise<string[]>;
  certifications(id: string): Promise<CertRow[]>;
  badges(id: string): Promise<{ achievementId: string; issuedAt: Date }[]>;
  skills(id: string): Promise<{ name: string; area: string }[]>;
  elementNames(ids: string[]): Promise<{ id: string; name: string }[]>;
  countOpenClaims(id: string): Promise<number>;
  createClaim(id: string, data: { label: string; value: number; unit: string | null; evidenceUrl: string }): Promise<AttestationRow>;
  attestation(attId: string): Promise<(AttestationRow & { memberId: string }) | null>;
  deleteAttestation(attId: string): Promise<void>;
  demandSignals(): Promise<{ id: string; title: string; summary: string; sourceName: string; sourceUrl: string; publishedOn: string; onetElementIds: string[]; skillIds: string[]; metricIds: string[] }[]>;
  recompute(id: string): Promise<number>;
  skill(id: string): Promise<{ id: string; name: string; status: string; canonicalId: string | null } | null>;
  skillLinks(skillId: string): Promise<{ kind: string; ref: string; relation: string }[]>;
  softwareByNorm(refs: string[]): Promise<{ exampleNorm: string; example: string; categoryId: string }[]>;
  elements(ids: string[]): Promise<{ id: string; name: string; parentId: string | null }[]>;
  skillDemand(skillId: string): Promise<SkillDemand | null>;
}

let defaultStoreP: Promise<CareerStore> | null = null;
export function getDefaultStore(): Promise<CareerStore> {
  defaultStoreP ??= import("./careerStore.js").then(m => m.prismaCareerStore);
  return defaultStoreP;
}

const bad = (m: string) => new CareerError("INVALID", m);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function optString(v: unknown, field: string, max: number): string | null {
  if (v === null) return null;
  if (typeof v !== "string") throw bad(`${field} must be text or null.`);
  const t = v.trim();
  if (t.length > max) throw bad(`${field} must be at most ${max} characters.`);
  return t === "" ? null : t;
}
function optTerm(v: unknown, field: string): string | null {
  const t = optString(v, field, 7);
  if (t !== null && !TERM.test(t)) throw bad(`${field} must look like YYYY-MM.`);
  return t;
}

/** Whitelist + validate. Sharing flags are strict booleans and only change when supplied. */
export function parseProfileInput(body: unknown): Partial<ProfileRow> {
  if (!isObj(body)) throw bad("Body must be an object.");
  const out: Partial<ProfileRow> = {};
  if ("major" in body) out.major = optString(body.major, "major", 100);
  if ("headline" in body) out.headline = optString(body.headline, "headline", 160);
  if ("gradTerm" in body) out.gradTerm = optTerm(body.gradTerm, "gradTerm");
  if ("availableFrom" in body) out.availableFrom = optTerm(body.availableFrom, "availableFrom");
  if ("openTo" in body) {
    const v = body.openTo;
    if (!Array.isArray(v) || v.length > OPEN_TO.length || v.some(x => !(OPEN_TO as readonly unknown[]).includes(x))) {
      throw bad(`openTo must be a list of ${OPEN_TO.join(", ")}.`);
    }
    out.openTo = [...new Set(v as string[])];
  }
  for (const f of ["shareWithSponsors", "showOnPublicPage"] as const) {
    if (f in body) { if (typeof body[f] !== "boolean") throw bad(`${f} must be true or false.`); out[f] = body[f] as boolean; }
  }
  return out;
}

export function parseClaimInput(body: unknown): { label: string; value: number; unit: string | null; evidenceUrl: string } {
  if (!isObj(body)) throw bad("Body must be an object.");
  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (!label || label.length > 80) throw bad("label is required (80 characters max).");
  const value = body.value;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1e9) throw bad("value must be a finite number of at least 0.");
  let unit: string | null = null;
  if (body.unit != null) {
    if (typeof body.unit !== "string" || !(CLAIM_UNITS as readonly string[]).includes(body.unit)) throw bad(`unit must be one of ${CLAIM_UNITS.join(", ")}.`);
    unit = body.unit;
  }
  const raw = typeof body.evidenceUrl === "string" ? body.evidenceUrl.trim() : "";
  if (!raw || raw.length > 500) throw bad("evidenceUrl is required (500 characters max).");
  let u: URL;
  try { u = new URL(raw); } catch { throw bad("evidenceUrl must be a valid https link."); }
  if (u.protocol !== "https:" || u.username || u.password) throw bad("evidenceUrl must be a valid https link.");
  return { label, value, unit, evidenceUrl: u.toString() };
}

async function inputs(store: CareerStore, memberId: string) {
  const [snaps, atts, rows, disabled] = await Promise.all([
    store.snapshots(memberId), store.attestations(memberId), store.bulletRows(memberId), store.disabledMetrics(),
  ]);
  return { snaps, atts, rows, disabled: new Set(disabled) };
}

export function createCareerService(store: CareerStore, opts: { now?: () => number } = {}) {
  const now = opts.now ?? Date.now;
  const lastRecompute = new Map<string, number>();

  async function me(memberId: string) {
    const dwaIds = [...new Set(METRICS.flatMap(m => (m.dwaId ? [m.dwaId] : [])))];
    const [profile, targets, inp, certifications, badgeRows, skillRows, dwaRows] = await Promise.all([
      store.profile(memberId), store.targets(memberId), inputs(store, memberId),
      store.certifications(memberId), store.badges(memberId), store.skills(memberId), store.elementNames(dwaIds),
    ]);
    const dwaTitle = new Map(dwaRows.map(r => [r.id, r.name]));
    const snapshots = METRICS.filter(m => !inp.disabled.has(m.id)).flatMap(m => {
      const s = inp.snaps.find(x => x.metricId === m.id);
      if (!s) return [];
      const ok = m.proof === "RECORDS" || inp.atts.some(a => a.kind === "CONFIRM" && shareable("CONFIRMED", a, { metricId: m.id, value: s.value }));
      return [{ metricId: m.id, label: m.label, value: s.value, unit: s.value === 1 ? m.unitSingular : m.unitPlural, proof: m.proof, shareable: ok, pending: !ok, dwaId: m.dwaId, dwaTitle: m.dwaId ? dwaTitle.get(m.dwaId) ?? null : null }];
    });
    const items = badgeRows.flatMap(b => {
      const a = ACHIEVEMENTS.find(x => x.id === b.achievementId);
      if (a && inp.disabled.has(a.metricId)) return [];
      return [{ achievementId: b.achievementId, name: a ? METRICS.find(m => m.id === a.metricId)!.label : b.achievementId, issuedAt: b.issuedAt }];
    });
    return {
      profile: profile ?? { major: null, gradTerm: null, openTo: [], availableFrom: null, headline: null, shareWithSponsors: false, showOnPublicPage: false },
      targets,
      snapshots,
      computedAt: inp.snaps.reduce<Date | null>((m, s) => (!m || s.computedAt > m ? s.computedAt : m), null),
      // buildBullets drops disabled metrics. Pending items stay visible here, flagged `pending`.
      bullets: buildBullets(inp.snaps, inp.atts, inp.rows, METRICS, inp.disabled),
      attestations: inp.atts.map(a => ({ ...a, pending: a.status === "PENDING" || a.status === "NEEDS_PROOF" })),
      certifications,
      // Names only, same filter as the export: no level or confidence.
      skills: [...new Set(skillRows.map(r => r.name))].sort((a, b) => a.localeCompare(b)),
      badges: { count: items.length, items },
      attribution: ONET_ATTRIBUTION,
    };
  }

  /** The member's own JSON Resume. Email is omitted unless the caller opts in. */
  async function exportResume(memberId: string, options: { includeEmail?: boolean } = {}): Promise<JsonResume> {
    const member = await store.member(memberId);
    if (!member) throw new CareerError("NOT_FOUND", "Member not found.");
    const [profile, targets, inp, certs, badgeRows, skills] = await Promise.all([
      store.profile(memberId), store.targets(memberId), inputs(store, memberId),
      store.certifications(memberId), store.badges(memberId), store.skills(memberId),
    ]);
    const bullets = buildBullets(inp.snaps, inp.atts, inp.rows, METRICS, inp.disabled).filter(exportable);
    const badges = badgeRows.flatMap(b => {
      const a = ACHIEVEMENTS.find(x => x.id === b.achievementId);
      if (!a || inp.disabled.has(a.metricId)) return [];
      return [{ name: METRICS.find(m => m.id === a.metricId)!.label, issuer: "Purdue SEARCH", date: b.issuedAt.toISOString().slice(0, 10) }];
    });
    // Skill names only: no level, confidence or evidence ever enters the export.
    return buildJsonResume(
      { major: profile?.major, gradTerm: profile?.gradTerm, headline: profile?.headline, targetRoles: targets.map(t => t.title) },
      { name: member.displayName, email: member.email }, bullets, skills, certs, badges, options,
    );
  }

  /** Everything the skill drawer needs from O*NET for one skill. Deterministic; never exposes level, confidence or score. */
  async function skillOnet(memberId: string, skillId: string) {
    let skill = await store.skill(skillId);
    if (skill?.canonicalId) skill = await store.skill(skill.canonicalId);
    if (!skill || skill.status !== "ACTIVE") throw new CareerError("NOT_FOUND", "Skill not found.");
    const rawLinks = await store.skillLinks(skill.id);
    const kindRank: Record<string, number> = { SOFTWARE: 0, ELEMENT: 1, DWA: 2 };
    const sorted = [...rawLinks].sort((a, b) =>
      (a.relation === "EXACT" ? 0 : 1) - (b.relation === "EXACT" ? 0 : 1) || (kindRank[a.kind] ?? 9) - (kindRank[b.kind] ?? 9) || (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0));
    const swRows = await store.softwareByNorm([...new Set(sorted.filter(l => l.kind === "SOFTWARE").map(l => l.ref))]);
    const exampleOf = new Map<string, string>();
    const categoriesOf = new Map<string, Set<string>>();
    for (const r of swRows) {
      if (!exampleOf.has(r.exampleNorm)) exampleOf.set(r.exampleNorm, r.example);
      (categoriesOf.get(r.exampleNorm) ?? categoriesOf.set(r.exampleNorm, new Set()).get(r.exampleNorm)!).add(r.categoryId);
    }
    const swCategories = new Set([...categoriesOf.values()].flatMap(c => [...c]));
    const dwaLinks = new Set(sorted.filter(l => l.kind === "DWA").map(l => l.ref));

    const inp = await inputs(store, memberId);
    const matching = METRICS.filter(m => !inp.disabled.has(m.id) && (m.softwareCategories.some(c => swCategories.has(c)) || (m.dwaId !== null && dwaLinks.has(m.dwaId))))
      .flatMap(m => { const s = inp.snaps.find(x => x.metricId === m.id); return s && Number.isFinite(s.value) && s.value > 0 ? [{ m, value: s.value }] : []; });
    const bullets = buildBullets(inp.snaps, inp.atts, inp.rows, METRICS, inp.disabled);
    const first = matching[0];
    const b = first ? bullets.find(x => x.metricId === first.m.id) : undefined;

    // Element names + ancestry in as few reads as possible: breadth-first up the parent chain.
    const wanted = new Set<string>([...sorted.filter(l => l.kind !== "SOFTWARE").map(l => l.ref), ...matching.flatMap(x => (x.m.dwaId ? [x.m.dwaId] : [])), ...swCategories]);
    const el = new Map<string, { id: string; name: string; parentId: string | null }>();
    let frontier = [...wanted];
    for (let depth = 0; depth < 10 && frontier.length; depth++) {
      const rows = await store.elements(frontier.filter(id => !el.has(id)));
      frontier = [];
      for (const r of rows) { el.set(r.id, r); if (r.parentId && !el.has(r.parentId)) frontier.push(r.parentId); }
    }
    const chain = (id: string): { id: string; name: string }[] => {
      const out: { id: string; name: string }[] = [];
      const seen = new Set<string>();
      for (let cur: string | null = id; cur && !seen.has(cur); ) {
        seen.add(cur);
        const e = el.get(cur);
        if (!e) break;
        out.unshift({ id: e.id, name: e.name });
        cur = e.parentId;
      }
      return out;
    };

    const links = sorted.map(l => ({
      kind: l.kind as "SOFTWARE" | "ELEMENT" | "DWA", ref: l.ref, relation: l.relation,
      name: l.kind === "SOFTWARE" ? exampleOf.get(l.ref) ?? l.ref : el.get(l.ref)?.name ?? l.ref,
    }));
    let placement: { id: string | null; name: string }[] = [];
    const best = sorted[0];
    if (best) {
      if (best.kind === "SOFTWARE") {
        const cat = [...(categoriesOf.get(best.ref) ?? [])].sort()[0];
        placement = [...(cat ? chain(cat) : []), { id: null, name: exampleOf.get(best.ref) ?? best.ref }];
      } else placement = chain(best.ref);
    }
    const dwaIds = [...new Set([...sorted.filter(l => l.kind === "DWA").map(l => l.ref), ...matching.flatMap(x => (x.m.dwaId ? [x.m.dwaId] : []))])];
    const demandRaw = rawLinks.length ? await store.skillDemand(skill.id) : null;
    return {
      skill: { id: skill.id, name: skill.name },
      placement,
      links,
      demand: demandRaw ? {
        hot: demandRaw.software.hot, inDemandOccupations: demandRaw.software.inDemandOccupations, occupationsListed: demandRaw.software.occupationsListed,
        topOccupations: demandRaw.topOccupations.slice(0, 3).map(o => ({ code: o.occupationCode, title: o.title })),
      } : null,
      numbers: matching.map(({ m, value }) => ({ metricId: m.id, label: m.label, value, unit: value === 1 ? m.unitSingular : m.unitPlural })),
      suggestedBullet: b ? { metricId: first!.m.id, text: b.text, proof: b.proof, shareable: b.shareable, pending: b.pending } : null,
      activities: dwaIds.map(id => ({ dwaId: id, name: el.get(id)?.name ?? id })),
      attribution: ONET_ATTRIBUTION,
    };
  }

  return {
    me, exportResume, skillOnet,

    updateProfile: (memberId: string, body: unknown) => store.upsertProfile(memberId, parseProfileInput(body)),

    async setTargets(memberId: string, body: unknown) {
      const codes = isObj(body) ? body.codes : undefined;
      if (!Array.isArray(codes) || codes.some(c => typeof c !== "string" || !c.trim())) throw bad("codes must be a list of occupation codes.");
      const uniq = [...new Set((codes as string[]).map(c => c.trim()))];
      if (uniq.length !== codes.length) throw bad("codes must be distinct.");
      if (uniq.length > MAX_TARGETS) throw bad(`Pick at most ${MAX_TARGETS} target occupations.`);
      const found = new Set(await store.existingOccupations(uniq));
      const missing = uniq.find(c => !found.has(c));
      if (missing) throw bad(`Unknown occupation code: ${missing}.`);
      await store.replaceTargets(memberId, uniq);
      return { targets: await store.targets(memberId) };
    },

    async searchOccupations(q: unknown) {
      const s = typeof q === "string" ? q.trim() : "";
      if (s.length < 2) throw bad("q must be at least 2 characters.");
      if (s.length > 80) throw bad("q must be at most 80 characters.");
      const seen = new Set<string>();
      const results = (await store.searchOccupations(s, 40)).filter(r => !seen.has(r.code) && seen.add(r.code)).slice(0, 20);
      return { results };
    },

    async recompute(memberId: string) {
      const last = lastRecompute.get(memberId);
      if (last !== undefined && now() - last < 60_000) throw new CareerError("RATE_LIMITED", "Recompute is limited to once a minute.");
      lastRecompute.set(memberId, now());
      return { ok: true, snapshots: await store.recompute(memberId) };
    },

    async setBullet(memberId: string, sourceKind: string, sourceId: string, body: unknown) {
      if (sourceKind !== "METRIC" && sourceKind !== "ATTESTATION") throw bad("sourceKind must be METRIC or ATTESTATION.");
      if (!isObj(body)) throw bad("Body must be an object.");
      if (sourceKind === "METRIC") {
        if (!METRICS.some(m => m.id === sourceId)) throw new CareerError("NOT_FOUND", "Unknown metric.");
      } else {
        const a = await store.attestation(sourceId);
        if (!a || a.memberId !== memberId || a.kind !== "CLAIM") throw new CareerError("NOT_FOUND", "Claim not found.");
      }
      const data: { template?: string | null; included?: boolean; position?: number } = {};
      if ("template" in body) {
        if (body.template === null) data.template = null;
        else { const v = validateMemberTemplate(body.template); if (!v.valid) throw bad(v.error); data.template = body.template as string; }
      }
      if ("included" in body) { if (typeof body.included !== "boolean") throw bad("included must be true or false."); data.included = body.included; }
      if ("position" in body) {
        if (typeof body.position !== "number" || !Number.isInteger(body.position) || body.position < 0 || body.position > 1000) throw bad("position must be an integer from 0 to 1000.");
        data.position = body.position;
      }
      await store.upsertBullet(memberId, sourceKind, sourceId, data);
      return { ok: true };
    },

    async createClaim(memberId: string, body: unknown) {
      const data = parseClaimInput(body);
      if ((await store.countOpenClaims(memberId)) >= MAX_PENDING_CLAIMS) throw new CareerError("CONFLICT", `You already have ${MAX_PENDING_CLAIMS} claims awaiting review.`);
      const claim = await store.createClaim(memberId, data);
      return { claim: { ...claim, pending: true } };
    },

    /** Own CLAIM rows still awaiting review (PENDING or NEEDS_PROOF) only; anything else is 409, someone else's is 404. */
    async deleteClaim(memberId: string, id: string) {
      const a = await store.attestation(id);
      if (!a || a.memberId !== memberId || a.kind !== "CLAIM") throw new CareerError("NOT_FOUND", "Claim not found.");
      if (a.status !== "PENDING" && a.status !== "NEEDS_PROOF") throw new CareerError("CONFLICT", "Only claims awaiting review can be deleted.");
      await store.deleteBullet(memberId, "ATTESTATION", id);
      await store.deleteAttestation(id);
      return { ok: true };
    },

    async demandSignals() { return { signals: await store.demandSignals(), attribution: ONET_ATTRIBUTION }; },
  };
}
export type CareerService = ReturnType<typeof createCareerService>;
