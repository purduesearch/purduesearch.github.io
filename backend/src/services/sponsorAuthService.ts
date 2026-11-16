// Sponsor sign-in (locked decision 6). Sponsors are admin-invited SponsorUser rows that sign in by magic link.
// - Login links carry a random 32-byte token; only its SHA-256 hex is stored, and it expires after 15 minutes.
// - A consumed link becomes a 7-day HMAC Bearer token signed with SPONSOR_TOKEN_SECRET (never the member secret).
//   The signed payload starts with "sponsor:" so a member token can never verify here and a sponsor token never
//   parses as a member token. Expiry and tokenVersion live inside the signed payload.
// - Missing or short secret: fail closed. Nothing is ever signed with a default.
// Logs never contain tokens, token hashes or email addresses.

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const LOGIN_TOKEN_TTL_MS = 15 * 60 * 1000;
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MIN_SECRET_LENGTH = 32;
export const NOT_CONFIGURED = "Sponsor sign-in is not configured.";
const PREFIX = "sponsor";

// ── Secret ──────────────────────────────────────────────────

/** The configured secret, or null when unset/too short (callers must fail closed). */
export function readSponsorSecret(raw: string | undefined | null = process.env.SPONSOR_TOKEN_SECRET): string | null {
  if (typeof raw !== "string" || raw.length < MIN_SECRET_LENGTH) return null;
  return raw;
}

// ── Login tokens ────────────────────────────────────────────

export function hashLoginToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export function newLoginToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashLoginToken(raw) };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trim + lowercase; null when not a plausible address or longer than 254 characters. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const e = raw.trim().toLowerCase();
  if (e.length === 0 || e.length > 254 || !EMAIL_RE.test(e)) return null;
  return e;
}

// ── Bearer tokens ───────────────────────────────────────────

export function signSponsorToken(secret: string, sponsorUserId: string, version: number, nowMs: number): { token: string; expiresAt: Date } {
  const exp = nowMs + SESSION_TTL_MS;
  const payload = Buffer.from(`${PREFIX}:${sponsorUserId}:${version}:${exp}`, "utf8").toString("base64url");
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return { token: `${payload}.${sig}`, expiresAt: new Date(exp) };
}

export interface SponsorClaims { sponsorUserId: string; version: number; exp: number }

/** Signature, prefix and expiry checks only; the caller re-reads the user for tokenVersion and eligibility. */
export function verifySponsorToken(secret: string, token: unknown, nowMs: number): SponsorClaims | null {
  if (typeof token !== "string" || token.length === 0 || token.length > 1024) return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot !== token.lastIndexOf(".")) return null;
  const payload = token.slice(0, dot);
  const sig = Buffer.from(token.slice(dot + 1), "utf8");
  const expected = Buffer.from(createHmac("sha256", secret).update(payload).digest("base64url"), "utf8");
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return null;
  const parts = Buffer.from(payload, "base64url").toString("utf8").split(":");
  if (parts.length !== 4 || parts[0] !== PREFIX) return null;
  const [, sponsorUserId, v, e] = parts;
  if (!sponsorUserId || !/^\d+$/.test(v) || !/^\d+$/.test(e)) return null;
  const version = Number(v), exp = Number(e);
  if (!Number.isSafeInteger(version) || !Number.isSafeInteger(exp) || nowMs >= exp) return null;
  return { sponsorUserId, version, exp };
}

// ── Store ───────────────────────────────────────────────────

export interface SponsorUserRow {
  id: string;
  email: string;
  name: string | null;
  tokenVersion: number;
  disabledAt: Date | null;
  org: { id: string; name: string; active: boolean; accessUntil: Date | null };
}

export interface SponsorAuthStore {
  findUserByEmail(email: string): Promise<SponsorUserRow | null>;
  findUserById(id: string): Promise<SponsorUserRow | null>;
  /** Marks the user's still-unused tokens used, so only the newest link works. */
  invalidateUnusedTokens(sponsorUserId: string, now: Date): Promise<void>;
  createLoginToken(row: { tokenHash: string; sponsorUserId: string; expiresAt: Date }): Promise<void>;
  /** Atomically marks an unused, unexpired token used; returns its user id only when exactly one row changed. */
  consumeLoginToken(tokenHash: string, now: Date): Promise<string | null>;
  touchLogin(sponsorUserId: string, now: Date): Promise<void>;
  bumpTokenVersion(sponsorUserId: string): Promise<void>;
  /** Deletes used or expired login tokens; returns the count. */
  deleteStaleTokens(now: Date): Promise<number>;
}

export function isSponsorEligible(u: SponsorUserRow | null, now: Date): u is SponsorUserRow {
  if (!u || u.disabledAt) return false;
  if (!u.org.active) return false;
  if (u.org.accessUntil && u.org.accessUntil.getTime() <= now.getTime()) return false;
  return true;
}

export function sponsorSummary(u: SponsorUserRow) {
  return { id: u.id, name: u.name, email: u.email, org: { id: u.org.id, name: u.org.name } };
}

const userSelect = {
  id: true, email: true, name: true, tokenVersion: true, disabledAt: true,
  org: { select: { id: true, name: true, active: true, accessUntil: true } },
} as const;

let defaultStoreP: Promise<SponsorAuthStore> | null = null;

export function getDefaultSponsorStore(): Promise<SponsorAuthStore> {
  defaultStoreP ??= import("../db/prisma.js").then(({ prisma }): SponsorAuthStore => ({
    findUserByEmail: email => prisma.sponsorUser.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: userSelect }),
    findUserById: id => prisma.sponsorUser.findUnique({ where: { id }, select: userSelect }),
    invalidateUnusedTokens: async (sponsorUserId, now) => {
      await prisma.sponsorLoginToken.updateMany({ where: { sponsorUserId, usedAt: null }, data: { usedAt: now } });
    },
    createLoginToken: async row => { await prisma.sponsorLoginToken.create({ data: row }); },
    consumeLoginToken: async (tokenHash, now) => {
      const r = await prisma.sponsorLoginToken.updateMany({
        where: { tokenHash, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now },
      });
      if (r.count !== 1) return null;
      const row = await prisma.sponsorLoginToken.findUnique({ where: { tokenHash }, select: { sponsorUserId: true } });
      return row?.sponsorUserId ?? null;
    },
    touchLogin: async (id, now) => { await prisma.sponsorUser.update({ where: { id }, data: { lastLoginAt: now } }); },
    bumpTokenVersion: async id => { await prisma.sponsorUser.update({ where: { id }, data: { tokenVersion: { increment: 1 } } }); },
    deleteStaleTokens: async now => {
      const r = await prisma.sponsorLoginToken.deleteMany({ where: { OR: [{ usedAt: { not: null } }, { expiresAt: { lt: now } }] } });
      return r.count;
    },
  }));
  return defaultStoreP;
}

// ── Mail ────────────────────────────────────────────────────

export type SponsorMailer = (msg: { to: string; subject: string; html: string }) => Promise<void>;

export async function defaultMailer(msg: { to: string; subject: string; html: string }): Promise<void> {
  const { send } = await import("./emailService.js");
  await send(msg);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function frontendBase(raw: string | undefined = process.env.FRONTEND_URL): string {
  return (raw ?? "http://localhost:3000").replace(/\/+$/, "");
}

export function loginLink(frontendUrl: string, rawToken: string): string {
  return `${frontendBase(frontendUrl)}/sponsors?t=${encodeURIComponent(rawToken)}`;
}

export function loginEmailHtml(link: string, name: string | null): string {
  const hello = name ? `Hi ${escapeHtml(name)},` : "Hi,";
  const href = escapeHtml(link);
  return [
    `<p>${hello}</p>`,
    `<p>Use this link to sign in to the Purdue SEARCH sponsor portal. It works once and expires in 15 minutes.</p>`,
    `<p><a href="${href}">Sign in to the sponsor portal</a></p>`,
    `<p>If you did not ask to sign in, you can ignore this email.</p>`,
  ].join("\n");
}

// ── Login rate limit (in memory) ────────────────────────────

export const LOGIN_LIMIT_PER_EMAIL = 5;
export const LOGIN_LIMIT_PER_IP = 30;
const HOUR_MS = 60 * 60 * 1000;

export function createLoginRateLimiter(now: () => number = Date.now, opts: { perEmail?: number; perIp?: number } = {}) {
  const perEmail = opts.perEmail ?? LOGIN_LIMIT_PER_EMAIL;
  const perIp = opts.perIp ?? LOGIN_LIMIT_PER_IP;
  const hits = new Map<string, number[]>();
  let lastPrune = now();
  const recent = (key: string, t: number) => (hits.get(key) ?? []).filter(x => t - x < HOUR_MS);
  return {
    /** True when this request may proceed (and records it); false when either limit is reached. */
    allow(email: string, ip: string): boolean {
      const t = now();
      if (t - lastPrune > HOUR_MS / 4) {
        for (const [k, v] of hits) { const keep = v.filter(x => t - x < HOUR_MS); if (keep.length) hits.set(k, keep); else hits.delete(k); }
        lastPrune = t;
      }
      const eKey = `e:${email}`, iKey = `i:${ip}`;
      const e = recent(eKey, t), i = recent(iKey, t);
      if (e.length >= perEmail || i.length >= perIp) return false;
      e.push(t); i.push(t);
      hits.set(eKey, e); hits.set(iKey, i);
      return true;
    },
    size: () => hits.size,
  };
}

// ── Service ─────────────────────────────────────────────────

export interface SponsorAuthDeps {
  store: SponsorAuthStore;
  mailer: SponsorMailer;
  now: () => number;
  /** Read per call so a misconfigured deploy fails closed rather than at import. */
  secret: () => string | null;
  frontendUrl: () => string;
}

export type SponsorSession = { token: string; expiresAt: string; sponsor: ReturnType<typeof sponsorSummary> };

export function createSponsorAuthService(d: SponsorAuthDeps) {
  return {
    configured: () => d.secret() !== null,

    /** Background half of POST /login. Sends only for an eligible user; never reveals which case applied. */
    async requestLogin(email: string): Promise<boolean> {
      if (!d.secret()) return false;
      const now = new Date(d.now());
      const user = await d.store.findUserByEmail(email);
      if (!isSponsorEligible(user, now)) return false;
      const { raw, hash } = newLoginToken();
      await d.store.invalidateUnusedTokens(user.id, now);
      await d.store.createLoginToken({ tokenHash: hash, sponsorUserId: user.id, expiresAt: new Date(now.getTime() + LOGIN_TOKEN_TTL_MS) });
      const link = loginLink(d.frontendUrl(), raw);
      await d.mailer({ to: user.email, subject: "Your Purdue SEARCH sponsor sign-in link", html: loginEmailHtml(link, user.name) });
      return true;
    },

    /** POST /session: single-use exchange. Null for invalid, used, expired or no-longer-eligible. Throws only if unconfigured. */
    async exchange(rawToken: unknown): Promise<SponsorSession | null> {
      const secret = d.secret();
      if (!secret) throw new Error(NOT_CONFIGURED);
      if (typeof rawToken !== "string" || rawToken.length < 16 || rawToken.length > 256) return null;
      const now = new Date(d.now());
      const userId = await d.store.consumeLoginToken(hashLoginToken(rawToken), now);
      if (!userId) return null;
      const user = await d.store.findUserById(userId);
      if (!isSponsorEligible(user, now)) return null;
      await d.store.touchLogin(user.id, now);
      const { token, expiresAt } = signSponsorToken(secret, user.id, user.tokenVersion, now.getTime());
      return { token, expiresAt: expiresAt.toISOString(), sponsor: sponsorSummary(user) };
    },

    /** Bearer check used by requireSponsor: signature + expiry, then a fresh user read for version and eligibility. */
    async authenticate(bearer: unknown): Promise<SponsorUserRow | null> {
      const secret = d.secret();
      if (!secret) throw new Error(NOT_CONFIGURED);
      const nowMs = d.now();
      const claims = verifySponsorToken(secret, bearer, nowMs);
      if (!claims) return null;
      const user = await d.store.findUserById(claims.sponsorUserId);
      if (!isSponsorEligible(user, new Date(nowMs))) return null;
      if (user.tokenVersion !== claims.version) return null;
      return user;
    },

    /** Revokes every session for this sponsor user. */
    logout: (sponsorUserId: string) => d.store.bumpTokenVersion(sponsorUserId),
  };
}

export type SponsorAuthService = ReturnType<typeof createSponsorAuthService>;

// ── Maintenance (cron `23 * * * *`) ─────────────────────────

/** Deletes used or expired login tokens. Never throws; logs the count only. */
export async function cleanupSponsorTokens(now: Date = new Date(), store?: SponsorAuthStore): Promise<number> {
  try {
    const s = store ?? await getDefaultSponsorStore();
    const n = await s.deleteStaleTokens(now);
    if (n > 0) console.log(`[sponsor] removed ${n} used or expired login tokens`);
    return n;
  } catch (err) {
    console.error("[sponsor] login token cleanup failed:", err instanceof Error ? err.name : "error");
    return 0;
  }
}

/** Hourly sponsor data maintenance: stale login tokens, then PENDING intro requests past expiresAt → EXPIRED. Never throws. */
export async function runSponsorMaintenance(
  now: Date = new Date(),
  deps: { tokens?: SponsorAuthStore; intros?: import("./introService.js").IntroStore } = {},
): Promise<{ tokensDeleted: number; introsExpired: number }> {
  const tokensDeleted = await cleanupSponsorTokens(now, deps.tokens);
  let introsExpired = 0;
  try {
    const { expireIntroRequests } = await import("./introService.js");
    introsExpired = await expireIntroRequests(now, deps.intros);
  } catch (err) {
    console.error("[sponsor] intro expiry failed:", err instanceof Error ? err.name : "error");
  }
  return { tokensDeleted, introsExpired };
}
