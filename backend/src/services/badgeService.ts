// Member-claimed Open Badges 3.0 credentials, signed as VC-JWT (EdDSA / Ed25519) with `jose`.
// Deterministic: values come from stored impact snapshots, never from a model (decision 3). A member claims a badge
// once its threshold holds; the signed JWT is stored once and never rewritten; revocation sets revokedAt only
// (decision 9). No notifications, crons or digests (decision 8). Public reads never expose email, name or member id.
import { randomBytes, randomUUID } from "node:crypto";
import { SignJWT, calculateJwkThumbprint, decodeJwt, decodeProtectedHeader, importJWK, jwtVerify, type JWK } from "jose";
import { shareable, type ImpactAttestationInput } from "./impactMetricCore.js";
import {
  BADGE_ACHIEVEMENTS, CREDENTIAL_CONTEXTS, JWT_ALG, JWT_TYP, badgeUrls, buildAchievement, buildCredential, buildIssuerProfile,
  findAchievement, jwtPayload, linkedInAddUrl, payloadMismatch, resultText, sha256Hex, toPublicJwk, verifyPageUrl,
  type BadgeAchievement, type IssuerConfig,
} from "./badgeCore.js";

export type BadgeErrorCode = "INVALID" | "NOT_FOUND" | "NOT_ELIGIBLE" | "ALREADY_CLAIMED" | "REVOKED" | "NOT_CONFIGURED";
export class BadgeError extends Error {
  constructor(public code: BadgeErrorCode, message: string) { super(message); }
}
export const BADGE_STATUS: Record<BadgeErrorCode, number> = {
  INVALID: 400, NOT_FOUND: 404, NOT_ELIGIBLE: 409, ALREADY_CLAIMED: 409, REVOKED: 409, NOT_CONFIGURED: 503,
};
export const BADGE_NOT_CONFIGURED = "Badge signing is not set up yet. Ask a club admin to configure it.";
export const MAX_REVOKE_REASON = 200;

export interface AwardRow {
  id: string; memberId: string; achievementId: string; value: number; issuedAt: Date;
  credentialJwt: string; credentialSha256: string; revokedAt: Date | null; revokedReason: string | null;
}

export interface BadgeStore {
  member(id: string): Promise<{ id: string; email: string | null } | null>;
  /** Current stored ImpactSnapshot.value for one metric, or null when none has been computed. */
  snapshotValue(memberId: string, metricId: string): Promise<number | null>;
  snapshotValues(memberId: string): Promise<{ metricId: string; value: number }[]>;
  /** The member's CONFIRM attestations (any status); shareable() picks the VERIFIED one that matches. */
  confirmations(memberId: string): Promise<ImpactAttestationInput[]>;
  disabledMetrics(): Promise<string[]>;
  awardsForMember(memberId: string): Promise<AwardRow[]>;
  award(id: string): Promise<AwardRow | null>;
  /** Single insert of the award with its JWT and hash. Throws `{ code: "P2002" }` on the member+achievement unique. */
  createAward(row: Omit<AwardRow, "revokedAt" | "revokedReason">): Promise<AwardRow>;
  /** Sets revokedAt/revokedReason only when the row belongs to memberId and is not revoked yet. */
  revokeAward(id: string, memberId: string, at: Date, reason: string | null): Promise<boolean>;
}

let defaultStoreP: Promise<BadgeStore> | null = null;
/** Prisma-backed store, imported lazily so tests never load the database client. */
export function getDefaultBadgeStore(): Promise<BadgeStore> {
  defaultStoreP ??= import("../db/prisma.js").then(({ prisma }): BadgeStore => {
    const awardSelect = {
      id: true, memberId: true, achievementId: true, value: true, issuedAt: true,
      credentialJwt: true, credentialSha256: true, revokedAt: true, revokedReason: true,
    } as const;
    return {
      member: id => prisma.member.findUnique({ where: { id }, select: { id: true, email: true } }),
      async snapshotValue(memberId, metricId) {
        return (await prisma.impactSnapshot.findUnique({ where: { memberId_metricId: { memberId, metricId } }, select: { value: true } }))?.value ?? null;
      },
      snapshotValues: memberId => prisma.impactSnapshot.findMany({ where: { memberId }, select: { metricId: true, value: true } }),
      confirmations: memberId => prisma.impactAttestation.findMany({
        where: { memberId, kind: "CONFIRM" }, select: { kind: true, status: true, metricId: true, value: true },
      }),
      async disabledMetrics() { return (await prisma.careerSettings.findUnique({ where: { id: "default" } }))?.disabledMetrics ?? []; },
      awardsForMember: memberId => prisma.badgeAward.findMany({ where: { memberId }, select: awardSelect, orderBy: { issuedAt: "asc" } }),
      award: id => prisma.badgeAward.findUnique({ where: { id }, select: awardSelect }),
      createAward: row => prisma.badgeAward.create({ data: row, select: awardSelect }),
      async revokeAward(id, memberId, at, reason) {
        const r = await prisma.badgeAward.updateMany({ where: { id, memberId, revokedAt: null }, data: { revokedAt: at, revokedReason: reason } });
        return r.count === 1;
      },
    };
  });
  return defaultStoreP;
}

export function apiBase(raw: string | undefined = process.env.BACKEND_URL): string {
  return (raw ?? "http://localhost:3001").replace(/\/+$/, "");
}
export function siteBase(raw: string | undefined = process.env.FRONTEND_URL): string {
  return (raw ?? "http://localhost:3000").replace(/\/+$/, "");
}
export function readSigningJwk(raw: string | undefined | null = process.env.BADGE_SIGNING_JWK): string | null {
  const t = raw?.trim();
  return t ? t : null;
}

type JoseKey = Awaited<ReturnType<typeof importJWK>>;
type LoadedKey = { privateKey: JoseKey; publicKey: JoseKey; publicJwk: Record<string, unknown>; kid: string };
type KeyResult = { ok: true; key: LoadedKey } | { ok: false; reason: "UNSET" | "INVALID" };

/** Parses an Ed25519 private JWK, derives the public JWK by dropping `d`, and proves the pair with a probe signature. */
export async function loadSigningKey(raw: string | null, base: string): Promise<KeyResult> {
  if (!raw) return { ok: false, reason: "UNSET" };
  try {
    const jwk = JSON.parse(raw) as JWK;
    if (jwk.kty !== "OKP" || jwk.crv !== "Ed25519" || typeof jwk.d !== "string" || typeof jwk.x !== "string") return { ok: false, reason: "INVALID" };
    const thumb = await calculateJwkThumbprint({ kty: "OKP", crv: "Ed25519", x: jwk.x });
    const kid = `${badgeUrls(base).jwks}#${thumb}`;
    const publicJwk = toPublicJwk({ kty: "OKP", crv: "Ed25519", x: jwk.x }, kid);
    const privateKey = await importJWK({ kty: "OKP", crv: "Ed25519", x: jwk.x, d: jwk.d }, JWT_ALG);
    const publicKey = await importJWK({ kty: "OKP", crv: "Ed25519", x: jwk.x }, JWT_ALG);
    const probe = await new SignJWT({ probe: true }).setProtectedHeader({ alg: JWT_ALG }).sign(privateKey);
    await jwtVerify(probe, publicKey, { algorithms: [JWT_ALG] });
    return { ok: true, key: { privateKey, publicKey, publicJwk, kid } };
  } catch {
    return { ok: false, reason: "INVALID" };
  }
}

export interface BadgeServiceDeps {
  store: BadgeStore;
  now?: () => number;
  /** Raw BADGE_SIGNING_JWK (private Ed25519 JWK JSON) or null when unset. Read on each call so rotation needs no restart. */
  signingJwk?: () => string | null;
  apiUrl?: () => string;
  siteUrl?: () => string;
  newId?: () => string;
  newSalt?: () => string;
}

const isConfirmedOk = (a: BadgeAchievement, value: number, confirmations: ImpactAttestationInput[]) =>
  a.proof === "RECORDS" || confirmations.some(c => shareable("CONFIRMED", c, { metricId: a.metricId, value }));

export function createBadgeService(d: BadgeServiceDeps) {
  const { store } = d;
  const now = d.now ?? Date.now;
  const signingJwk = d.signingJwk ?? (() => readSigningJwk());
  const api = () => apiBase(d.apiUrl?.());
  const site = () => siteBase(d.siteUrl?.());
  const issuer = (): IssuerConfig => ({ apiBase: api(), siteUrl: site() });
  const newId = d.newId ?? (() => randomUUID());
  const newSalt = d.newSalt ?? (() => randomBytes(16).toString("hex"));

  let cached: { raw: string | null; base: string; result: Promise<KeyResult> } | null = null;
  function key(): Promise<KeyResult> {
    const raw = signingJwk(); const base = api();
    if (!cached || cached.raw !== raw || cached.base !== base) cached = { raw, base, result: loadSigningKey(raw, base) };
    return cached.result;
  }

  function awardView(row: AwardRow) {
    const a = findAchievement(row.achievementId);
    const verifyUrl = verifyPageUrl(site(), row.id);
    return {
      id: row.id, value: row.value, issuedAt: row.issuedAt, revokedAt: row.revokedAt, revokedReason: row.revokedReason,
      verifyUrl,
      credentialUrl: badgeUrls(api()).credential(row.id),
      linkedInUrl: a ? linkedInAddUrl({ id: row.id, issuedAt: row.issuedAt, name: a.name, certUrl: verifyUrl }) : null,
    };
  }

  /** Member view: every enabled achievement with its current value, eligibility and award. */
  async function list(memberId: string) {
    const [snaps, confirmations, disabled, awards, k] = await Promise.all([
      store.snapshotValues(memberId), store.confirmations(memberId), store.disabledMetrics(), store.awardsForMember(memberId), key(),
    ]);
    const off = new Set(disabled);
    const badges = BADGE_ACHIEVEMENTS.filter(a => !off.has(a.metricId)).map(a => {
      const value = snaps.find(s => s.metricId === a.metricId)?.value ?? 0;
      const award = awards.find(w => w.achievementId === a.id) ?? null;
      const meetsThreshold = value >= a.threshold;
      const confirmed = isConfirmedOk(a, value, confirmations);
      return {
        id: a.id, name: a.name, description: a.description, metricId: a.metricId, threshold: a.threshold, proof: a.proof,
        value, resultText: resultText(a, value), meetsThreshold,
        needsConfirmation: meetsThreshold && !confirmed,
        eligible: !award && meetsThreshold && confirmed,
        award: award ? awardView(award) : null,
      };
    });
    return { canIssue: k.ok, badges };
  }

  async function claim(memberId: string, achievementId: string) {
    const a = findAchievement(achievementId);
    if (!a) throw new BadgeError("NOT_FOUND", "Unknown badge.");
    if ((await store.disabledMetrics()).includes(a.metricId)) throw new BadgeError("NOT_FOUND", "This badge is turned off.");
    const k = await key();
    if (!k.ok) throw new BadgeError("NOT_CONFIGURED", BADGE_NOT_CONFIGURED);
    const existing = (await store.awardsForMember(memberId)).find(w => w.achievementId === a.id);
    if (existing?.revokedAt) throw new BadgeError("REVOKED", "You revoked this badge. A revoked badge cannot be issued again.");
    if (existing) throw new BadgeError("ALREADY_CLAIMED", "You already claimed this badge.");
    const member = await store.member(memberId);
    if (!member) throw new BadgeError("NOT_FOUND", "Member not found.");
    const value = await store.snapshotValue(memberId, a.metricId);
    if (value === null || !Number.isFinite(value) || value < a.threshold) {
      throw new BadgeError("NOT_ELIGIBLE", `This badge needs ${a.threshold} or more; your current count is ${value ?? 0}.`);
    }
    if (!isConfirmedOk(a, value, await store.confirmations(memberId))) {
      throw new BadgeError("NOT_ELIGIBLE", "A project lead or admin needs to confirm this count before you can claim the badge.");
    }

    const id = newId();
    const issuedAt = new Date(Math.floor(now() / 1000) * 1000);
    const credential = buildCredential({ id, value, issuedAt, salt: newSalt(), subjectId: `urn:uuid:${randomUUID()}` }, member, a, issuer());
    const jwt = await new SignJWT(jwtPayload(credential))
      .setProtectedHeader({ alg: JWT_ALG, typ: JWT_TYP, kid: k.key.kid })
      .sign(k.key.privateKey);
    try {
      const row = await store.createAward({
        id, memberId, achievementId: a.id, value, issuedAt, credentialJwt: jwt, credentialSha256: sha256Hex(jwt),
      });
      return { award: awardView(row) };
    } catch (e) {
      if ((e as { code?: unknown })?.code === "P2002") throw new BadgeError("ALREADY_CLAIMED", "You already claimed this badge.");
      throw e;
    }
  }

  /** Owner only. Sets revokedAt (and an optional private reason); never deletes or rewrites the credential. */
  async function revoke(memberId: string, awardId: string, body: unknown) {
    const raw = (body && typeof body === "object" ? (body as { reason?: unknown }).reason : undefined);
    if (raw !== undefined && raw !== null && typeof raw !== "string") throw new BadgeError("INVALID", "reason must be text.");
    const reason = typeof raw === "string" ? raw.trim().slice(0, MAX_REVOKE_REASON) || null : null;
    const row = await store.award(awardId);
    if (!row || row.memberId !== memberId) throw new BadgeError("NOT_FOUND", "Badge not found.");
    if (row.revokedAt) return { award: awardView(row) };
    const at = new Date(now());
    await store.revokeAward(row.id, memberId, at, reason);
    const after = await store.award(row.id);
    return { award: awardView(after ?? { ...row, revokedAt: at, revokedReason: reason }) };
  }

  // ---- Public reads (no auth). Never include memberId, email, name or the private revoke reason. ----

  function publicIssuer() {
    return { "@context": [...CREDENTIAL_CONTEXTS], ...buildIssuerProfile(issuer()) };
  }

  async function jwks() {
    const k = await key();
    return { keys: k.ok ? [k.key.publicJwk] : [] };
  }

  function publicAchievement(id: string) {
    const a = findAchievement(id);
    return a ? { "@context": [...CREDENTIAL_CONTEXTS], ...buildAchievement(a, issuer()) } : null;
  }

  async function publicAward(id: string) {
    const row = await store.award(id);
    if (!row) return null;
    let credential: Record<string, unknown> | null = null;
    try { credential = decodeJwt(row.credentialJwt) as Record<string, unknown>; } catch { credential = null; }
    let verified = false;
    let verifyError: string | null = null;
    const k = await key();
    if (sha256Hex(row.credentialJwt) !== row.credentialSha256) verifyError = "HASH_MISMATCH";
    else if (!k.ok) verifyError = k.reason === "UNSET" ? "KEY_UNSET" : "KEY_INVALID";
    else {
      try {
        const header = decodeProtectedHeader(row.credentialJwt);
        if (header.kid !== k.key.kid) verifyError = "KEY_MISMATCH";
        else {
          const { payload } = await jwtVerify(row.credentialJwt, k.key.publicKey, { algorithms: [JWT_ALG], currentDate: new Date(now()) });
          const mismatch = payloadMismatch(payload as Record<string, unknown>);
          if (mismatch) verifyError = `CLAIM_MISMATCH_${mismatch.toUpperCase()}`;
          else verified = true;
        }
      } catch {
        verifyError = "SIGNATURE_INVALID";
      }
    }
    const a = findAchievement(row.achievementId);
    return {
      id: row.id,
      jwt: row.credentialJwt,
      credential,
      verified,
      verifyError,
      revoked: row.revokedAt !== null,
      issuedAt: row.issuedAt,
      revokedAt: row.revokedAt,
      issuer: { name: buildIssuerProfile(issuer()).name, url: site() },
      achievement: a ? { id: a.id, name: a.name, description: a.description, metricId: a.metricId, threshold: a.threshold } : { id: row.achievementId, name: row.achievementId, description: null, metricId: null, threshold: null },
      value: row.value,
      resultText: a ? resultText(a, row.value) : null,
    };
  }

  async function status(id: string) {
    const row = await store.award(id);
    return row ? { revoked: row.revokedAt !== null, revokedAt: row.revokedAt } : null;
  }

  return { list, claim, revoke, publicIssuer, jwks, publicAchievement, publicAward, status, key };
}
export type BadgeService = ReturnType<typeof createBadgeService>;
