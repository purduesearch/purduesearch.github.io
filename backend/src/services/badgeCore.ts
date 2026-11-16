// Pure Open Badges 3.0 rules for member-claimed achievement badges. No database, network, model or key access.
// Numbers come from impact snapshots only (decision 3). Nothing here ever carries a plain email, photo, Slack id,
// display name or skill level (decision 5): the recipient is a salted IdentityObject hash and a random subject URN.
//
// Spec: 1EdTech Open Badges 3.0, https://www.imsglobal.org/spec/ob/v3p0/ (Final Release, checked 2026-11-16).
import { createHash } from "node:crypto";
import { ACHIEVEMENTS, METRICS } from "./impactMetricCore.js";

/** §B.1.2 / §E.1: "@context ... MUST be an ordered set where the first item is ... credentials/v2, and the second ... context-3.0.3.json". */
export const VC_CONTEXT_V2 = "https://www.w3.org/ns/credentials/v2";
export const OB_CONTEXT = "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json";
export const CREDENTIAL_CONTEXTS = [VC_CONTEXT_V2, OB_CONTEXT] as const;
/** §D.1 example `credentialSchema`. */
export const OB_CREDENTIAL_SCHEMA = {
  id: "https://purl.imsglobal.org/spec/ob/v3p0/schema/json/ob_v3p0_achievementcredential_schema.json",
  type: "1EdTechJsonSchemaValidator2019",
} as const;
/**
 * §B.1.22 CredentialStatus: `type` is "the name of the credential status method" and `id` its URL. §9.1 only defines
 * revocation checking for BitstringStatusListEntry; ours is a simple per-credential JSON status endpoint, so it uses
 * its own method name and verifiers that do not know it skip it. See OPEN in the Phase 21 receipt.
 */
export const BADGE_STATUS_TYPE = "ConstellationBadgeStatus";
/** §8.2.3: JOSE header is alg + kid + typ only ("Additional JOSE Headers are NOT allowed"). typ, if present, MUST be "JWT". */
export const JWT_ALG = "EdDSA";
export const JWT_TYP = "JWT";
export const ISSUER_NAME = "Purdue SEARCH";
export const ISSUER_DESCRIPTION = "Purdue SEARCH is a student space-exploration club. Badges are counted from Constellation records and claimed by the member.";

export type BadgeDef = { name: string; description: string; result: string };

/** Display copy per achievement. `{n}` and `{unit}` are filled from the snapshot value and the metric's unit. */
export const BADGE_DEFS: Record<string, BadgeDef> = {
  trainer: { name: "Trainer", result: "Trained {n} {unit}",
    description: "Courses this member authored in Constellation were completed by other club members." },
  "cad-release": { name: "CAD Release Contributor", result: "Contributed to {n} released CAD {unit}",
    description: "This member uploaded versions of CAD items that went through a formal Vault release." },
  "design-reviewer": { name: "Design Reviewer", result: "Reviewed {n} design {unit}",
    description: "This member reviewed or signed off on design change requests in the club's CAD Vault." },
  "software-contributor": { name: "Software Contributor", result: "Authored {n} merged {unit}",
    description: "This member authored pull requests that were merged into club project repositories." },
  "lab-practitioner": { name: "Lab Practitioner", result: "Recorded {n} confirmed lab {unit}",
    description: "This member checked in to club lab spaces and confirmed the time they spent there." },
  "team-lead": { name: "Team Lead", result: "Led a project with {n} other task {unit}",
    description: "This member led a club project whose tasks were assigned to other members." },
  "outreach-organizer": { name: "Outreach Organizer", result: "Recorded {n} public event {unit}",
    description: "This member organized public events and attendance was recorded for them." },
};

export type BadgeAchievement = {
  id: string; metricId: string; threshold: number; proof: "RECORDS" | "CONFIRMED";
  name: string; description: string; resultTemplate: string; unitSingular: string; unitPlural: string;
};

/** Every achievement from the impact registry, with its badge copy. Order follows METRICS. */
export const BADGE_ACHIEVEMENTS: readonly BadgeAchievement[] = ACHIEVEMENTS.map(a => {
  const metric = METRICS.find(m => m.id === a.metricId)!;
  const def = BADGE_DEFS[a.id] ?? { name: metric.label, description: metric.label, result: "{n} {unit}" };
  return {
    id: a.id, metricId: a.metricId, threshold: a.threshold, proof: metric.proof,
    name: def.name, description: def.description, resultTemplate: def.result,
    unitSingular: metric.unitSingular, unitPlural: metric.unitPlural,
  };
});

export function findAchievement(id: string): BadgeAchievement | null {
  return BADGE_ACHIEVEMENTS.find(a => a.id === id) ?? null;
}

/** Exact integers stay exact; fractional counts (lab hours) show one decimal. */
export function formatValue(value: number): string {
  if (!Number.isFinite(value)) throw new RangeError("Badge value must be finite.");
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}

export function resultText(a: BadgeAchievement, value: number): string {
  const n = formatValue(value);
  const unit = n === "1" ? a.unitSingular : a.unitPlural;
  return a.resultTemplate.replace("{n}", n).replace("{unit}", unit);
}

export function criteriaNarrative(a: BadgeAchievement): string {
  const unit = a.threshold === 1 ? a.unitSingular : a.unitPlural;
  const confirm = a.proof === "CONFIRMED" ? " A project lead or club admin confirmed the count before the badge could be claimed." : "";
  return `${a.description} Earned at ${a.threshold} or more ${unit}, counted by Constellation from club records.${confirm} The member chose to claim it.`;
}

/**
 * §B.7 IdentityHash: "an algorithm identifier, a $ separator, and a hash across an identifier and an optionally appended
 * salt string ... encoded in UTF-8 ... expressed in hexadecimal". Spec vector: sha256 of 'a@example.comKosher'.
 * Emails are trimmed and lowercased first so the member can re-derive the hash from the address they know.
 */
export function identityHash(email: string, salt: string): string {
  const id = email.trim().toLowerCase();
  return "sha256$" + createHash("sha256").update(id + salt, "utf8").digest("hex");
}

export function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

/** Absolute URLs, all rooted at the public API base (BACKEND_URL) or the public site (FRONTEND_URL). */
export function badgeUrls(apiBase: string) {
  const root = `${apiBase.replace(/\/+$/, "")}/api/public/badges`;
  return {
    issuer: `${root}/issuer`,
    jwks: `${root}/jwks.json`,
    achievement: (id: string) => `${root}/achievements/${encodeURIComponent(id)}`,
    credential: (id: string) => `${root}/${encodeURIComponent(id)}`,
    status: (id: string) => `${root}/${encodeURIComponent(id)}/status`,
  };
}
export function verifyPageUrl(siteUrl: string, awardId: string): string {
  return `${siteUrl.replace(/\/+$/, "")}/badges/${encodeURIComponent(awardId)}`;
}

export type IssuerConfig = { apiBase: string; siteUrl: string };

/** §B.1.14 Profile: id + type are required; name/url/description are optional and included. */
export function buildIssuerProfile(issuer: IssuerConfig) {
  return {
    id: badgeUrls(issuer.apiBase).issuer,
    type: ["Profile"],
    name: ISSUER_NAME,
    url: issuer.siteUrl.replace(/\/+$/, ""),
    description: ISSUER_DESCRIPTION,
  };
}

/** §B.1.1 Achievement: id, type, criteria, description and name are required. */
export function buildAchievement(a: BadgeAchievement, issuer: IssuerConfig) {
  const id = badgeUrls(issuer.apiBase).achievement(a.id);
  return {
    id,
    type: ["Achievement"],
    achievementType: "Badge",
    name: a.name,
    description: a.description,
    criteria: { narrative: criteriaNarrative(a) },
    creator: buildIssuerProfile(issuer),
    // §B.1.17: id, type, name and resultType are required.
    resultDescription: [{ id: `${id}#result`, type: ["ResultDescription"], name: `${a.name} count`, resultType: "Result" }],
  };
}

export type AwardInput = {
  /** Award id; also the credential path segment. Generated before signing so the credential can name itself. */
  id: string;
  value: number;
  issuedAt: Date;
  /** Random per-award salt for the identity hash. */
  salt: string;
  /** Random `urn:uuid:` subject id; carries no member information. */
  subjectId: string;
};

/** ISO-8601 with second precision: §8.2.6.1 requires nbf (whole seconds) to equal validFrom. */
export function isoSeconds(d: Date): string {
  return new Date(Math.floor(d.getTime() / 1000) * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * An OpenBadgeCredential (VC Data Model 2.0, so `validFrom`, not `issuanceDate`; see the notes under §8.2.6.1).
 * The subject has no name: §B.1.3 AchievementSubject defines no name property, and decision 5 keeps names off.
 */
export function buildCredential(award: AwardInput, member: { email: string | null }, a: BadgeAchievement, issuer: IssuerConfig) {
  const urls = badgeUrls(issuer.apiBase);
  const achievement = buildAchievement(a, issuer);
  const email = member.email?.trim();
  return {
    "@context": [...CREDENTIAL_CONTEXTS],
    id: urls.credential(award.id),
    type: ["VerifiableCredential", "OpenBadgeCredential"],
    name: a.name,
    description: resultText(a, award.value),
    issuer: buildIssuerProfile(issuer),
    validFrom: isoSeconds(award.issuedAt),
    credentialSubject: {
      id: award.subjectId,
      type: ["AchievementSubject"],
      ...(email ? {
        identifier: [{ type: "IdentityObject", identityHash: identityHash(email, award.salt), identityType: "emailAddress", hashed: true, salt: award.salt }],
      } : {}),
      achievement,
      result: [{ type: ["Result"], resultDescription: achievement.resultDescription[0].id, value: resultText(a, award.value) }],
    },
    credentialStatus: { id: urls.status(award.id), type: BADGE_STATUS_TYPE },
    credentialSchema: [{ ...OB_CREDENTIAL_SCHEMA }],
  };
}
export type OpenBadgeCredential = ReturnType<typeof buildCredential>;

/**
 * §8.2.4.1 JWT Payload Format: "The JWT Payload is the JSON object of the OpenBadgeCredential" plus iss = issuer.id,
 * jti = id, nbf = validFrom, sub = credentialSubject.id (all required); exp only with validUntil. The VC 1.1 `vc`
 * claim form is legacy (note under §8.2.6) and is not used.
 */
export function jwtPayload(credential: OpenBadgeCredential): Record<string, unknown> {
  return {
    ...credential,
    iss: credential.issuer.id,
    jti: credential.id,
    sub: credential.credentialSubject.id,
    nbf: Math.floor(Date.parse(credential.validFrom) / 1000),
  };
}

/** §8.2.6.1 claim checks against the embedded credential. Returns the first mismatch, or null. */
export function payloadMismatch(payload: Record<string, unknown>): string | null {
  const issuer = payload.issuer as { id?: unknown } | undefined;
  const subject = payload.credentialSubject as { id?: unknown } | undefined;
  if (payload.iss !== issuer?.id) return "iss";
  if (payload.jti !== payload.id) return "jti";
  if (payload.sub !== subject?.id) return "sub";
  if (typeof payload.validFrom !== "string" || payload.nbf !== Math.floor(Date.parse(payload.validFrom) / 1000)) return "nbf";
  return null;
}

/** Strips every private JWK member (RFC 7518 §6.2.2 / §6.3.2 / §6.4): the published key must never carry `d`. */
const PRIVATE_JWK_MEMBERS = ["d", "p", "q", "dp", "dq", "qi", "oth", "k"];
export function toPublicJwk(jwk: Record<string, unknown>, kid: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(jwk)) if (!PRIVATE_JWK_MEMBERS.includes(k) && k !== "key_ops" && k !== "ext") out[k] = v;
  return { ...out, kid, alg: JWT_ALG, use: "sig" };
}

/**
 * LinkedIn "Add to profile" certification link. Parameter names follow LinkedIn's addtoprofile URL form
 * (startTask=CERTIFICATION_NAME, name, organizationName, issueYear, issueMonth, certUrl, certId); see OPEN.
 */
export function linkedInAddUrl(award: { id: string; issuedAt: Date; name: string; certUrl: string }): string {
  const p = new URLSearchParams({
    startTask: "CERTIFICATION_NAME",
    name: award.name,
    organizationName: ISSUER_NAME,
    issueYear: String(award.issuedAt.getUTCFullYear()),
    issueMonth: String(award.issuedAt.getUTCMonth() + 1),
    certUrl: award.certUrl,
    certId: award.id,
  });
  return `https://www.linkedin.com/profile/add?${p.toString()}`;
}
