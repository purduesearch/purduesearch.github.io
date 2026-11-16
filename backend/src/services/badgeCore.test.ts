// badgeCore tests: pure credential shape, pinned spec constants, identity hashing, LinkedIn URL. No DB, no network.
// Run: cd backend && npx tsx src/services/badgeCore.test.ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ACHIEVEMENTS } from "./impactMetricCore.js";
import {
  BADGE_ACHIEVEMENTS, BADGE_STATUS_TYPE, OB_CONTEXT, VC_CONTEXT_V2, buildAchievement, buildCredential, buildIssuerProfile,
  findAchievement, formatValue, identityHash, isoSeconds, jwtPayload, linkedInAddUrl, payloadMismatch, resultText, toPublicJwk,
} from "./badgeCore.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) { if (cond) passed++; else { failed++; console.error(`  FAIL ${name}`); } }

const src = readFileSync(fileURLToPath(new URL("./badgeCore.ts", import.meta.url)), "utf8");
check("no model imports", !/gemini|aiRouter/i.test(src));
check("no db imports", !/prisma/.test(src));

// Spec constants (OB 3.0 §B.1.2 / §E.1)
check("VC 2.0 context pinned", VC_CONTEXT_V2 === "https://www.w3.org/ns/credentials/v2");
check("OB 3.0.3 context pinned", OB_CONTEXT === "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json");

// Spec IdentityHash vector (§B.7): sha256('a@example.comKosher')
check("identityHash matches spec vector", identityHash("a@example.com", "Kosher") === "sha256$b5809d8a92f8858436d7e6b87c12ebc0ae1eac4baecc2c0b913aee2c922ef399");
check("identityHash trims + lowercases", identityHash("  A@Example.com ", "Kosher") === identityHash("a@example.com", "Kosher"));

// Registry coverage
check("every achievement has badge copy", BADGE_ACHIEVEMENTS.length === ACHIEVEMENTS.length && BADGE_ACHIEVEMENTS.every(a => a.name && a.description && a.resultTemplate.includes("{n}")));
const trainer = findAchievement("trainer")!;
const lead = findAchievement("team-lead")!;
const lab = findAchievement("lab-practitioner")!;
check("unknown achievement null", findAchievement("nope") === null);
check("team-lead is CONFIRMED", lead.proof === "CONFIRMED" && lead.threshold === 3);
check("result text", resultText(trainer, 14) === "Trained 14 members");
check("result text singular", resultText(trainer, 1) === "Trained 1 member");
check("fractional value one decimal", formatValue(50.26) === "50.3" && resultText(lab, 50.26) === "Recorded 50.3 confirmed lab hours");
let threw = false; try { formatValue(NaN); } catch { threw = true; }
check("NaN value throws", threw);

const issuer = { apiBase: "https://api.test/", siteUrl: "https://site.test/" };
const award = { id: "award-123", value: 14, issuedAt: new Date("2026-11-16T12:34:56.789Z"), salt: "pepper", subjectId: "urn:uuid:11111111-2222-4333-8444-555555555555" };
const cred = buildCredential(award, { email: "Ada@Example.com" }, trainer, issuer);
const json = JSON.stringify(cred);

check("contexts ordered", JSON.stringify(cred["@context"]) === JSON.stringify([VC_CONTEXT_V2, OB_CONTEXT]));
check("types", cred.type.includes("VerifiableCredential") && cred.type.includes("OpenBadgeCredential"));
check("credential id is public API url", cred.id === "https://api.test/api/public/badges/award-123");
check("validFrom seconds precision, no issuanceDate", cred.validFrom === "2026-11-16T12:34:56Z" && !("issuanceDate" in cred));
check("issuer profile", cred.issuer.id === "https://api.test/api/public/badges/issuer" && cred.issuer.type[0] === "Profile" && cred.issuer.url === "https://site.test" && cred.issuer.name === "Purdue SEARCH");
check("subject type", cred.credentialSubject.type[0] === "AchievementSubject" && cred.credentialSubject.id === award.subjectId);
const ident = (cred.credentialSubject as { identifier?: { type: string; identityHash: string; identityType: string; hashed: boolean; salt: string }[] }).identifier![0];
check("IdentityObject hashed email", ident.type === "IdentityObject" && ident.hashed === true && ident.identityType === "emailAddress" && ident.salt === "pepper" && ident.identityHash === identityHash("ada@example.com", "pepper"));
check("plain email never appears", !/ada@example\.com/i.test(json) && !json.includes("@Example"));
check("subject has no name", !("name" in cred.credentialSubject));
const ach = cred.credentialSubject.achievement;
check("achievement shape", ach.id === "https://api.test/api/public/badges/achievements/trainer" && ach.type[0] === "Achievement" && ach.name === "Trainer" && typeof ach.description === "string");
check("criteria narrative mentions threshold", /5 or more members/.test(ach.criteria.narrative));
check("result carries value text", cred.credentialSubject.result[0].value === "Trained 14 members" && cred.credentialSubject.result[0].resultDescription === ach.resultDescription[0].id);
check("credentialStatus points at status route", cred.credentialStatus.id === "https://api.test/api/public/badges/award-123/status" && cred.credentialStatus.type === BADGE_STATUS_TYPE);
check("credentialSchema present", cred.credentialSchema[0].type === "1EdTechJsonSchemaValidator2019");
check("no level anywhere", !/"level"|achievedLevel/i.test(json));

const noEmail = buildCredential(award, { email: null }, trainer, issuer);
check("no email: identifier omitted", !("identifier" in noEmail.credentialSubject));

const leadCred = buildAchievement(lead, issuer);
check("CONFIRMED narrative mentions confirmation", /confirmed the count/.test(leadCred.criteria.narrative));

// JWT payload (§8.2.4.1)
const p = jwtPayload(cred);
check("payload claims", p.iss === cred.issuer.id && p.jti === cred.id && p.sub === award.subjectId && p.nbf === Math.floor(award.issuedAt.getTime() / 1000));
check("payload embeds credential (no vc claim)", !("vc" in p) && (p as { credentialSubject?: unknown }).credentialSubject !== undefined);
check("payloadMismatch null for good payload", payloadMismatch(p) === null);
check("payloadMismatch catches iss", payloadMismatch({ ...p, iss: "https://evil" }) === "iss");
check("payloadMismatch catches nbf", payloadMismatch({ ...p, nbf: 1 }) === "nbf");
check("isoSeconds", isoSeconds(new Date(1500)) === "1970-01-01T00:00:01Z");

// Public JWK
const pub = toPublicJwk({ kty: "OKP", crv: "Ed25519", x: "abc", d: "secret", key_ops: ["sign"], ext: true }, "kid-1");
check("public jwk drops d", !("d" in pub) && !("key_ops" in pub) && pub.kid === "kid-1" && pub.alg === "EdDSA" && pub.use === "sig" && pub.x === "abc");

// Issuer profile
check("issuer profile id", buildIssuerProfile(issuer).id === "https://api.test/api/public/badges/issuer");

// LinkedIn
const li = new URL(linkedInAddUrl({ id: "award 1&x", issuedAt: new Date("2026-02-03T00:00:00Z"), name: "Trainer & Mentor", certUrl: "https://site.test/badges/award-1?x=1" }));
check("linkedin base", li.origin + li.pathname === "https://www.linkedin.com/profile/add");
check("linkedin params", li.searchParams.get("startTask") === "CERTIFICATION_NAME" && li.searchParams.get("name") === "Trainer & Mentor"
  && li.searchParams.get("organizationName") === "Purdue SEARCH" && li.searchParams.get("issueYear") === "2026" && li.searchParams.get("issueMonth") === "2"
  && li.searchParams.get("certUrl") === "https://site.test/badges/award-1?x=1" && li.searchParams.get("certId") === "award 1&x");
check("linkedin encodes", !linkedInAddUrl({ id: "a&b", issuedAt: new Date(0), name: "x y", certUrl: "https://s/b?c=1" }).includes("a&b"));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
