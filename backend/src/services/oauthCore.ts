import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Pure OAuth primitives. Connector credentials have no relationship to web login tokens. */
export const OAUTH_SCOPES = [
  "constellation.read", "constellation.plan", "constellation.plan.delete",
] as const;
export type OAuthScope = typeof OAUTH_SCOPES[number];

export const DEFAULT_ALLOWED_REDIRECT_URIS = ["https://claude.ai/api/mcp/auth_callback"] as const;
export const OAUTH_TTL_MS = {
  access: 60 * 60_000,
  refresh: 30 * 24 * 60 * 60_000,
  pending: 10 * 60_000,
  code: 5 * 60_000,
  draft: 60 * 60_000,
} as const;
export type OAuthLifetime = keyof typeof OAUTH_TTL_MS;

export class OAuthError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) {
    super(message);
    this.name = "OAuthError";
  }
}

const VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;

/** S256 is the only supported method; reject noncanonical base64url pad bits too. */
export function validatePkceChallenge(challenge: unknown, method: unknown = "S256"): string {
  if (method !== "S256" || typeof challenge !== "string" || !CHALLENGE.test(challenge)
    || Buffer.from(challenge, "base64url").toString("base64url") !== challenge) {
    throw new OAuthError("invalid_request", "A canonical S256 PKCE challenge is required");
  }
  return challenge;
}

export function verifyPkceS256(verifier: unknown, challenge: unknown): boolean {
  if (typeof verifier !== "string" || !VERIFIER.test(verifier)) return false;
  try { validatePkceChallenge(challenge); } catch { return false; }
  const expected = createHash("sha256").update(verifier, "ascii").digest();
  return timingSafeEqual(expected, Buffer.from(challenge as string, "base64url"));
}

/** Match the supplied string exactly. Never normalize a caller's redirect before comparing it. */
export function isAllowedRedirectUri(
  value: unknown,
  allowedUris: readonly string[] = DEFAULT_ALLOWED_REDIRECT_URIS,
): value is string {
  if (typeof value !== "string" || value.length > 2048 || /[\s\u0000-\u001f\u007f]/.test(value)
    || value.includes("#") || !allowedUris.includes(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !!url.hostname && !url.username && !url.password
      && !/^https:\/\/[^/?#]*@/i.test(value);
  } catch { return false; }
}

export function assertAllowedRedirectUri(
  value: unknown,
  allowedUris: readonly string[] = DEFAULT_ALLOWED_REDIRECT_URIS,
): string {
  if (!isAllowedRedirectUri(value, allowedUris)) {
    throw new OAuthError("invalid_redirect_uri", "Redirect URI is not allowed");
  }
  return value;
}

/** Validate a consent-selected scope set without silently adding permissions. */
export function validateScopes(scopes: readonly string[]): OAuthScope[] {
  if (!scopes.length || scopes.some(s => !(OAUTH_SCOPES as readonly string[]).includes(s))
    || new Set(scopes).size !== scopes.length) {
    throw new OAuthError("invalid_scope", "Scopes must be known, nonempty, and unique");
  }
  if ((scopes.includes("constellation.plan") && !scopes.includes("constellation.read"))
    || (scopes.includes("constellation.plan.delete") && !scopes.includes("constellation.plan"))) {
    throw new OAuthError("invalid_scope", "Planning requires read access; deletion also requires planning access");
  }
  return [...scopes] as OAuthScope[];
}

/** An omitted request defaults to read only. OAuth scope tokens use ASCII spaces. */
export function parseScopes(value: unknown): OAuthScope[] {
  if (value === undefined) return ["constellation.read"];
  if (typeof value !== "string" || value.length > 512 || !/^[\x21\x23-\x5b\x5d-\x7e]+(?: [\x21\x23-\x5b\x5d-\x7e]+)*$/.test(value)) {
    throw new OAuthError("invalid_scope", "Scope must be an ASCII space-separated list");
  }
  return validateScopes(value.split(" "));
}

/** 256 bits of entropy. Persist only hashOpaqueToken(value), never this plaintext. */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashOpaqueToken(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function expiresAt(kind: OAuthLifetime, now: Date = new Date()): Date {
  const timestamp = now.getTime() + OAUTH_TTL_MS[kind];
  if (!Number.isSafeInteger(timestamp)) throw new OAuthError("invalid_request", "Invalid expiry time");
  const expiry = new Date(timestamp);
  if (!Number.isFinite(expiry.getTime())) throw new OAuthError("invalid_request", "Invalid expiry time");
  return expiry;
}

/** Expiry is inclusive, and invalid dates fail closed. */
export function isExpired(expiry: Date, now: Date = new Date()): boolean {
  return !Number.isFinite(expiry.getTime()) || !Number.isFinite(now.getTime())
    || expiry.getTime() <= now.getTime();
}
