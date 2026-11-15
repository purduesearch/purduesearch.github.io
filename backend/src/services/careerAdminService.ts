// Career admin logic (/api/admin/career). Pure of Prisma: everything goes through the injected CareerAdminStore.
// No model calls. Reviewer identity is always the caller's req.memberId, passed in by the router.
import { METRICS } from "./impactMetricCore.js";

export type AdminErrorCode = "INVALID" | "NOT_FOUND" | "CONFLICT" | "FORBIDDEN";
export class CareerAdminError extends Error {
  constructor(public code: AdminErrorCode, message: string) { super(message); }
}
export const ADMIN_STATUS: Record<AdminErrorCode, number> = { INVALID: 400, NOT_FOUND: 404, CONFLICT: 409, FORBIDDEN: 403 };
const bad = (m: string) => new CareerAdminError("INVALID", m);

export const REVIEW_STATUSES = ["VERIFIED", "DECLINED", "NEEDS_PROOF"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
export const ATTESTATION_STATUSES = ["PENDING", "VERIFIED", "DECLINED", "NEEDS_PROOF"] as const;
export const OPEN_STATUSES = ["PENDING", "NEEDS_PROOF"] as const;

export interface AdminAttestation {
  id: string; memberId: string; kind: "CLAIM" | "CONFIRM"; status: string; metricId: string | null;
  label: string | null; value: number; unit: string | null; evidenceUrl: string | null; note: string | null;
  reviewNote: string | null; reviewerId?: string | null; reviewedAt?: Date | null; createdAt: Date;
}
export interface DemandSignalRow {
  id: string; title: string; summary: string; sourceName: string; sourceUrl: string; publishedOn: string;
  onetElementIds: string[]; skillIds: string[]; metricIds: string[]; active: boolean;
}
export type DemandSignalInput = Omit<DemandSignalRow, "id">;
type Actor = { id: string; isAdmin: boolean };

export interface CareerAdminStore {
  onetStatus(): Promise<{ release: unknown | null; counts: unknown; danglingLinks: unknown[] }>;
  unlinked(): Promise<unknown[]>;
  setLink(actor: Actor, input: { skillId: string; kind: string; ref: string; relation: string }): Promise<unknown>;
  removeLink(actor: Actor, input: { skillId: string; kind: string; ref: string }): Promise<{ count: number }>;
  applyCurated(): Promise<{ applied: number; skipped: number }>;
  disabledMetrics(): Promise<string[]>;
  setDisabledMetrics(ids: string[]): Promise<void>;
  listAttestations(status?: string): Promise<(AdminAttestation & { memberName?: string | null })[]>;
  attestation(id: string): Promise<AdminAttestation | null>;
  /** Atomic: only flips a CLAIM that is still PENDING or NEEDS_PROOF. Returns false when it lost the race. */
  reviewClaim(id: string, data: { status: ReviewStatus; reviewNote: string | null; reviewerId: string; reviewedAt: Date }): Promise<boolean>;
  member(id: string): Promise<{ id: string; isBot: boolean } | null>;
  snapshotValue(memberId: string, metricId: string): Promise<number | null>;
  /** Idempotent per (member, metric): refreshes the existing CONFIRM row instead of stacking another. */
  confirmMetric(data: { memberId: string; metricId: string; value: number; reviewerId: string; reviewedAt: Date }): Promise<AdminAttestation>;
  listSignals(): Promise<DemandSignalRow[]>;
  countSignals(): Promise<number>;
  /** Insert-if-empty, atomic against a concurrent first GET. Returns true when it seeded. */
  seedSignals(rows: DemandSignalInput[]): Promise<boolean>;
  createSignal(data: DemandSignalInput): Promise<DemandSignalRow>;
  updateSignal(id: string, data: Partial<DemandSignalInput>): Promise<DemandSignalRow | null>;
  deleteSignal(id: string): Promise<boolean>;
}

export type ReviewNotify = (n: { recipientId: string; actorId: string; message: string; slackText: string; metadata: Record<string, unknown> }) => Promise<unknown>;

// Titles and sources come from the plan's research basis (verified 2026-11-15). The plan gives no deep links, so the URLs
// are the publishers' own pages; an admin can replace any of them through PUT /demand-signals/:id.
export const SEED_SIGNALS: readonly DemandSignalInput[] = [
  {
    title: "Employers want examples, not lists, and most hire on skills",
    summary: "NACE Job Outlook 2026: teamwork, problem-solving and communication lead what employers want. They look for examples rather than lists of skills, and 70% use skills-based hiring.",
    sourceName: "NACE Job Outlook 2026", sourceUrl: "https://www.naceweb.org/", publishedOn: "2026-01",
    onetElementIds: [], skillIds: [], metricIds: [], active: true,
  },
  {
    title: "AI, cybersecurity and technology literacy grow fastest to 2030",
    summary: "WEF Future of Jobs 2025: AI and big data, networks and cybersecurity, and technological literacy are the fastest-growing skills through 2030.",
    sourceName: "World Economic Forum, Future of Jobs Report 2025", sourceUrl: "https://www.weforum.org/publications/the-future-of-jobs-report-2025/", publishedOn: "2025-01",
    onetElementIds: [], skillIds: [], metricIds: [], active: true,
  },
  {
    title: "Mentorship, cross-functional collaboration and AI skills are on the rise",
    summary: "LinkedIn Skills on the Rise 2026: mentorship, cross-functional collaboration and AI skills are among the skills growing fastest in demand.",
    sourceName: "LinkedIn Skills on the Rise 2026", sourceUrl: "https://www.linkedin.com/", publishedOn: "2026-01",
    onetElementIds: [], skillIds: [], metricIds: [], active: true,
  },
];

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
function str(v: unknown, name: string, max: number, required = true): string {
  if (typeof v !== "string") { if (required) throw bad(`${name} is required.`); return ""; }
  const t = v.trim();
  if (required && !t) throw bad(`${name} is required.`);
  if (t.length > max) throw bad(`${name} must be ${max} characters or fewer.`);
  return t;
}
function httpsUrl(v: unknown, name: string): string {
  const raw = str(v, name, 500);
  let u: URL;
  try { u = new URL(raw); } catch { throw bad(`${name} must be a valid https link.`); }
  if (u.protocol !== "https:" || u.username || u.password) throw bad(`${name} must be a valid https link.`);
  return u.toString();
}
function idList(v: unknown, name: string, max = 50): string[] {
  if (!Array.isArray(v) || v.length > max || v.some(x => typeof x !== "string" || !x.trim() || x.length > 100)) throw bad(`${name} must be a list of up to ${max} ids.`);
  return [...new Set((v as string[]).map(x => x.trim()))];
}

export function parseSignal(body: unknown, partial: boolean): Partial<DemandSignalInput> {
  if (!isObj(body)) throw bad("Body must be an object.");
  const out: Partial<DemandSignalInput> = {};
  const has = (k: string) => k in body;
  const need = (k: string) => { if (!partial && !has(k)) throw bad(`${k} is required.`); return has(k); };
  if (need("title")) out.title = str(body.title, "title", 160);
  if (need("summary")) out.summary = str(body.summary, "summary", 500);
  if (need("sourceName")) out.sourceName = str(body.sourceName, "sourceName", 120);
  if (need("sourceUrl")) out.sourceUrl = httpsUrl(body.sourceUrl, "sourceUrl");
  if (need("publishedOn")) {
    const p = str(body.publishedOn, "publishedOn", 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(p)) throw bad("publishedOn must look like 2026-04.");
    out.publishedOn = p;
  }
  if (has("onetElementIds")) out.onetElementIds = idList(body.onetElementIds, "onetElementIds");
  if (has("skillIds")) out.skillIds = idList(body.skillIds, "skillIds");
  if (has("metricIds")) {
    const ids = idList(body.metricIds, "metricIds");
    if (ids.some(i => !METRICS.some(m => m.id === i))) throw bad("metricIds contains an unknown metric.");
    out.metricIds = ids;
  }
  if (has("active")) { if (typeof body.active !== "boolean") throw bad("active must be true or false."); out.active = body.active; }
  if (!partial) { out.onetElementIds ??= []; out.skillIds ??= []; out.metricIds ??= []; out.active ??= true; }
  if (partial && !Object.keys(out).length) throw bad("Nothing to update.");
  return out;
}

export function createCareerAdminService(store: CareerAdminStore, deps: { now?: () => number; notify: ReviewNotify }) {
  const now = deps.now ?? Date.now;
  const actorOf = (id: string): Actor => ({ id, isAdmin: true });
  const cleanLink = (body: unknown, needRelation: boolean) => {
    if (!isObj(body)) throw bad("Body must be an object.");
    const kind = typeof body.kind === "string" ? body.kind : "";
    const ref = typeof body.ref === "string" ? body.ref.trim() : "";
    if (!["SOFTWARE", "ELEMENT", "DWA"].includes(kind)) throw bad("kind must be SOFTWARE, ELEMENT or DWA.");
    if (!ref || ref.length > 200) throw bad("ref is required.");
    if (!needRelation) return { kind, ref };
    const relation = body.relation === undefined ? "EXACT" : body.relation;
    if (typeof relation !== "string" || !["EXACT", "BROADER", "RELATED"].includes(relation)) throw bad("relation must be EXACT, BROADER or RELATED.");
    return { kind, ref, relation };
  };

  const metrics = async () => {
    const disabled = new Set(await store.disabledMetrics());
    // A disabled metric is still computed; consumers hide it and never share it.
    return { metrics: METRICS.map(m => ({ id: m.id, label: m.label, proof: m.proof, disabled: disabled.has(m.id) })) };
  };

  return {
    onetStatus: () => store.onetStatus(),
    unlinked: async () => ({ skills: await store.unlinked() }),
    async setLink(adminId: string, skillId: string, body: unknown) {
      const l = cleanLink(body, true);
      return { link: await store.setLink(actorOf(adminId), { skillId, kind: l.kind, ref: l.ref, relation: l.relation! }) };
    },
    async removeLink(adminId: string, skillId: string, body: unknown) {
      const l = cleanLink(body, false);
      return { removed: (await store.removeLink(actorOf(adminId), { skillId, ...l })).count };
    },
    applyCurated: () => store.applyCurated(),

    metrics,
    async setMetrics(body: unknown) {
      const raw = Array.isArray(body) ? body : isObj(body) ? body.disabledMetrics : undefined;
      if (!Array.isArray(raw) || raw.length > METRICS.length * 2) throw bad("Send a list of metric ids.");
      const known = new Set(METRICS.map(m => m.id));
      if (raw.some(x => typeof x !== "string" || !known.has(x))) throw bad("Unknown metric id.");
      await store.setDisabledMetrics([...new Set(raw as string[])]);
      return metrics();
    },

    async attestations(status: unknown) {
      if (status !== undefined && status !== "") {
        if (typeof status !== "string" || !(ATTESTATION_STATUSES as readonly string[]).includes(status)) throw bad(`status must be one of ${ATTESTATION_STATUSES.join(", ")}.`);
      }
      return { attestations: await store.listAttestations(status ? String(status) : undefined) };
    },

    /** Only CLAIM rows still PENDING or NEEDS_PROOF. A reviewer cannot review their own claim. */
    async review(adminId: string, id: string, body: unknown) {
      if (!isObj(body)) throw bad("Body must be an object.");
      if (typeof body.status !== "string" || !(REVIEW_STATUSES as readonly string[]).includes(body.status)) throw bad(`status must be one of ${REVIEW_STATUSES.join(", ")}.`);
      const status = body.status as ReviewStatus;
      let note: string | null = null;
      if (body.note != null) { note = str(body.note, "note", 1000, false) || null; }
      const a = await store.attestation(id);
      if (!a) throw new CareerAdminError("NOT_FOUND", "Attestation not found.");
      if (a.kind !== "CLAIM") throw new CareerAdminError("CONFLICT", "Only member claims are reviewed; confirmations are admin-made.");
      if (a.memberId === adminId) throw new CareerAdminError("FORBIDDEN", "You cannot review your own claim.");
      if (!(OPEN_STATUSES as readonly string[]).includes(a.status)) throw new CareerAdminError("CONFLICT", "This claim has already been reviewed.");
      const ok = await store.reviewClaim(id, { status, reviewNote: note, reviewerId: adminId, reviewedAt: new Date(now()) });
      if (!ok) throw new CareerAdminError("CONFLICT", "This claim has already been reviewed.");
      const verb = status === "VERIFIED" ? "verified" : status === "DECLINED" ? "declined" : "needs more proof";
      const title = a.label ?? "impact claim";
      try {
        await deps.notify({
          recipientId: a.memberId, actorId: adminId,
          message: `Your impact claim "${title}" was ${verb}.${note ? ` Note: ${note}` : ""}`,
          slackText: `Your impact claim "${title}" was ${verb}.`,
          metadata: { attestationId: id, status },
        });
      } catch (e) { console.error("[career-admin] review notification failed:", e instanceof Error ? e.message : e); }
      return { attestation: { ...a, status, reviewNote: note, reviewerId: adminId } };
    },

    /** team_led confirmation: a VERIFIED CONFIRM at the current snapshot value. */
    async confirm(adminId: string, body: unknown) {
      if (!isObj(body)) throw bad("Body must be an object.");
      const memberId = typeof body.memberId === "string" ? body.memberId.trim() : "";
      const metricId = typeof body.metricId === "string" ? body.metricId : "";
      if (!memberId) throw bad("memberId is required.");
      const metric = METRICS.find(m => m.id === metricId);
      if (!metric || metric.proof !== "CONFIRMED") throw bad("metricId must be a metric that needs confirmation.");
      if (memberId === adminId) throw new CareerAdminError("FORBIDDEN", "You cannot confirm your own metric.");
      const member = await store.member(memberId);
      if (!member || member.isBot) throw new CareerAdminError("NOT_FOUND", "Member not found.");
      const value = await store.snapshotValue(memberId, metricId);
      if (value === null || !(value > 0)) throw new CareerAdminError("CONFLICT", "This member has no recorded value for that metric yet.");
      return { attestation: await store.confirmMetric({ memberId, metricId, value, reviewerId: adminId, reviewedAt: new Date(now()) }) };
    },

    async signals() {
      if (await store.countSignals() === 0) await store.seedSignals(SEED_SIGNALS.map(s => ({ ...s })));
      return { signals: await store.listSignals() };
    },
    async createSignal(body: unknown) { return { signal: await store.createSignal(parseSignal(body, false) as DemandSignalInput) }; },
    async updateSignal(id: string, body: unknown) {
      const row = await store.updateSignal(id, parseSignal(body, true));
      if (!row) throw new CareerAdminError("NOT_FOUND", "Demand signal not found.");
      return { signal: row };
    },
    async deleteSignal(id: string) {
      if (!await store.deleteSignal(id)) throw new CareerAdminError("NOT_FOUND", "Demand signal not found.");
      return { deleted: true };
    },
  };
}
export type CareerAdminService = ReturnType<typeof createCareerAdminService>;

export async function getDefaultAdminDeps(): Promise<{ store: CareerAdminStore; notify: ReviewNotify }> {
  const [{ prismaCareerAdminStore }, { createNotification }] = await Promise.all([
    import("./careerAdminStore.js"), import("./notificationCrud.js"),
  ]);
  return { store: prismaCareerAdminStore, notify: n => createNotification({ type: "CAREER_ATTESTATION_REVIEWED", ...n } as Parameters<typeof createNotification>[0]) };
}
