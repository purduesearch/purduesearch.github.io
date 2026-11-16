// Pure talent-directory rules (locked decisions 5-7). No I/O, no Prisma, no model calls.
// Every card is built field by field from an allow-list; an input row is never spread, so a key added to a
// store row (email, Slack id, avatar, level, confidence) cannot reach a sponsor or the public page.
// Bullets are only the ones the member picked AND that are shareable (records, verified confirmations,
// verified claims). Filters narrow; nothing is scored or ranked. Sort is alphabetical or by graduation term.
import { ACHIEVEMENTS, METRICS } from "./impactMetricCore.js";
import {
  buildBullets, sharedBullets,
  type AttestationInput, type BulletRowInput, type ResumeBulletOut, type SnapshotInput,
} from "./resumeCore.js";

export const OPEN_TO_VALUES = ["INTERNSHIP", "COOP", "FULL_TIME", "RESEARCH"] as const;

/** "Ada Lovelace" → "Ada L."; single word → the word. Never the full name. */
export function cardName(displayName: string | null | undefined): string {
  const parts = String(displayName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Member";
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  const initial = Array.from(last)[0]?.toUpperCase() ?? "";
  return `${parts[0]} ${initial}.`;
}

export interface CardProfileInput {
  major?: string | null; gradTerm?: string | null; openTo?: readonly string[] | null;
  availableFrom?: string | null; headline?: string | null;
}
export interface CardSource {
  memberId: string;
  displayName: string;
  profile: CardProfileInput | null;
  targets: readonly { code: string; title: string }[];
  snapshots: readonly SnapshotInput[];
  attestations: readonly AttestationInput[];
  bulletRows: readonly BulletRowInput[];
  certifications: readonly { name: string; issuer?: string | null }[];
  /** Non-revoked awards only (the store filters revokedAt). */
  badges: readonly { id: string; achievementId: string }[];
  /** Public (SkillVisibility.isPublic), canonical, non-disputed skill names with level >= 1. Tool filter only; never on a card. */
  skillNames?: readonly string[];
}

export interface SponsorCard {
  memberId: string;
  name: string;
  major: string | null;
  gradTerm: string | null;
  openTo: string[];
  availableFrom: string | null;
  headline: string | null;
  targets: { code: string; title: string }[];
  bullets: string[];
  certifications: { name: string; provider: string | null }[];
  badges: { name: string; verifyUrl: string }[];
}
export interface PublicCard {
  name: string;
  major: string | null;
  gradTerm: string | null;
  targets: { code: string; title: string }[];
  bullets: string[];
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * The bullets the member picked that may leave their own view; disabled metrics never appear. `text` is the
 * canonical wording (registry template / verified claim), never the member's custom template.
 */
export function pickedBullets(src: CardSource, disabledMetrics: ReadonlySet<string> | readonly string[]): ResumeBulletOut[] {
  return sharedBullets(buildBullets(src.snapshots, src.attestations, src.bulletRows, METRICS, disabledMetrics));
}

function targetsOf(src: CardSource) {
  return src.targets.map(t => ({ code: String(t.code), title: String(t.title) }));
}

export function buildSponsorCard(src: CardSource, opts: { disabledMetrics: ReadonlySet<string> | readonly string[]; frontendUrl: string }): SponsorCard {
  const disabled = new Set(opts.disabledMetrics);
  const base = opts.frontendUrl.replace(/\/+$/, "");
  const p = src.profile;
  const openTo = Array.isArray(p?.openTo) ? p!.openTo!.filter(v => (OPEN_TO_VALUES as readonly string[]).includes(v)).map(String) : [];
  return {
    memberId: String(src.memberId),
    name: cardName(src.displayName),
    major: str(p?.major),
    gradTerm: str(p?.gradTerm),
    openTo,
    availableFrom: str(p?.availableFrom),
    headline: str(p?.headline),
    targets: targetsOf(src),
    bullets: pickedBullets(src, disabled).map(b => String(b.text)),
    certifications: src.certifications.map(c => ({ name: String(c.name), provider: str(c.issuer) })),
    badges: src.badges.flatMap(b => {
      const a = ACHIEVEMENTS.find(x => x.id === b.achievementId);
      if (!a || disabled.has(a.metricId)) return [];
      const metric = METRICS.find(m => m.id === a.metricId);
      if (!metric) return [];
      return [{ name: String(metric.label), verifyUrl: `${base}/badges/${encodeURIComponent(String(b.id))}` }];
    }),
  };
}

/** Decision 5: first name + last initial, major, graduation term, target roles, picked bullets. Nothing else. */
export function buildPublicCard(src: CardSource, opts: { disabledMetrics: ReadonlySet<string> | readonly string[] }): PublicCard {
  return {
    name: cardName(src.displayName),
    major: str(src.profile?.major),
    gradTerm: str(src.profile?.gradTerm),
    targets: targetsOf(src),
    bullets: pickedBullets(src, opts.disabledMetrics).map(b => String(b.text)),
  };
}

// ── Filters + sort ───────────────────────────────────────────

export interface DirectoryFilters {
  role: string | null;
  tool: string | null;
  gradTerm: string | null;
  openTo: string | null;
  sort: "name" | "gradTerm";
}

export class DirectoryQueryError extends Error {}

const one = (v: unknown): string | null => {
  const x = Array.isArray(v) ? v[0] : v;
  return typeof x === "string" && x.trim() ? x.trim() : null;
};

export function parseDirectoryQuery(q: Record<string, unknown>): DirectoryFilters {
  const role = one(q.role), tool = one(q.tool), gradTerm = one(q.gradTerm), openTo = one(q.openTo), sort = one(q.sort);
  if (role && (role.length > 20 || !/^[0-9A-Za-z.-]+$/.test(role))) throw new DirectoryQueryError("role must be an O*NET occupation code.");
  if (tool && tool.length > 60) throw new DirectoryQueryError("tool must be at most 60 characters.");
  if (gradTerm && !/^\d{4}(-(0[1-9]|1[0-2]))?$/.test(gradTerm)) throw new DirectoryQueryError("gradTerm must look like YYYY or YYYY-MM.");
  if (openTo && !(OPEN_TO_VALUES as readonly string[]).includes(openTo)) throw new DirectoryQueryError(`openTo must be one of ${OPEN_TO_VALUES.join(", ")}.`);
  if (sort && sort !== "name" && sort !== "gradTerm") throw new DirectoryQueryError("sort must be name or gradTerm.");
  return { role, tool, gradTerm, openTo, sort: sort === "gradTerm" ? "gradTerm" : "name" };
}

/** Boolean narrowing only. `skillNames` are consulted for the tool filter but never returned. */
export function matchesFilters(card: SponsorCard, skillNames: readonly string[], f: DirectoryFilters): boolean {
  if (f.role && !card.targets.some(t => t.code === f.role)) return false;
  if (f.openTo && !card.openTo.includes(f.openTo)) return false;
  if (f.gradTerm) {
    if (!card.gradTerm) return false;
    if (f.gradTerm.length === 4 ? card.gradTerm.slice(0, 4) !== f.gradTerm : card.gradTerm !== f.gradTerm) return false;
  }
  if (f.tool) {
    const needle = f.tool.toLowerCase();
    const hay = [...skillNames, ...card.bullets, ...card.certifications.map(c => c.name)];
    if (!hay.some(h => h.toLowerCase().includes(needle))) return false;
  }
  return true;
}

const cmp = (a: string, b: string) => {
  const x = a.localeCompare(b, "en", { sensitivity: "base" });
  return x !== 0 ? x : a < b ? -1 : a > b ? 1 : 0;
};

/** Alphabetical by card name (then memberId), or by graduation term (unknown last) then name. Never by any score. */
export function sortCards<T extends { name: string; gradTerm: string | null; memberId: string }>(cards: readonly T[], sort: "name" | "gradTerm" = "name"): T[] {
  return [...cards].sort((a, b) => {
    if (sort === "gradTerm" && a.gradTerm !== b.gradTerm) {
      if (!a.gradTerm) return 1;
      if (!b.gradTerm) return -1;
      return a.gradTerm < b.gradTerm ? -1 : 1;
    }
    return cmp(a.name, b.name) || (a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0);
  });
}
