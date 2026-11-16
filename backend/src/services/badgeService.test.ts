// badgeService tests: in-memory store + a generated Ed25519 key. No DB, no network.
// Run: cd backend && npx tsx src/services/badgeService.test.ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createLocalJWKSet, decodeProtectedHeader, exportJWK, generateKeyPair, jwtVerify } from "jose";
import { createBadgeService, loadSigningKey, type AwardRow, type BadgeStore } from "./badgeService.js";
import { identityHash, sha256Hex } from "./badgeCore.js";
import type { ImpactAttestationInput } from "./impactMetricCore.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) { if (cond) passed++; else { failed++; console.error(`  FAIL ${name}`); } }

const src = readFileSync(fileURLToPath(new URL("./badgeService.ts", import.meta.url)), "utf8");
check("no model imports", !/gemini|aiRouter/i.test(src));
check("no notifications or crons", !/createNotification|queueDm|node-cron|sendSlack/.test(src));

function makeStore() {
  const snaps: Record<string, Record<string, number>> = {
    m1: { members_trained: 5, lab_hours: 49.9, team_led: 4, prs_merged: 10 },
    m2: { members_trained: 7 },
  };
  const confirmations: Record<string, ImpactAttestationInput[]> = { m1: [] };
  const awards: AwardRow[] = [];
  let disabled: string[] = [];
  const writes: { op: string; data: unknown }[] = [];
  const store: BadgeStore = {
    member: async id => (id.startsWith("m") ? { id, email: `${id}@example.com` } : null),
    snapshotValue: async (m, metric) => snaps[m]?.[metric] ?? null,
    snapshotValues: async m => Object.entries(snaps[m] ?? {}).map(([metricId, value]) => ({ metricId, value })),
    confirmations: async m => confirmations[m] ?? [],
    disabledMetrics: async () => disabled,
    awardsForMember: async m => awards.filter(a => a.memberId === m),
    award: async id => awards.find(a => a.id === id) ?? null,
    createAward: async row => {
      writes.push({ op: "create", data: row });
      if (awards.some(a => a.memberId === row.memberId && a.achievementId === row.achievementId)) throw Object.assign(new Error("dup"), { code: "P2002" });
      const r = { ...row, revokedAt: null, revokedReason: null }; awards.push(r); return r;
    },
    revokeAward: async (id, memberId, at, reason) => {
      writes.push({ op: "revoke", data: { id, memberId, at, reason } });
      const a = awards.find(x => x.id === id && x.memberId === memberId && !x.revokedAt);
      if (!a) return false;
      a.revokedAt = at; a.revokedReason = reason; return true;
    },
  };
  return { store, snaps, confirmations, awards, writes, setDisabled: (d: string[]) => { disabled = d; } };
}

async function main() {
  const { privateKey } = await generateKeyPair("EdDSA", { extractable: true });
  const privJwk = await exportJWK(privateKey);
  const KEY = JSON.stringify(privJwk);
  const other = JSON.stringify(await exportJWK((await generateKeyPair("EdDSA", { extractable: true })).privateKey));
  const API = "https://api.test";
  const SITE = "https://site.test";
  let clock = Date.UTC(2026, 10, 16, 12, 0, 0, 250);
  let n = 0;

  check("generated key is Ed25519 with d", privJwk.kty === "OKP" && privJwk.crv === "Ed25519" && typeof privJwk.d === "string");
  check("loadSigningKey unset", (await loadSigningKey(null, API)).ok === false);
  check("loadSigningKey bad json", (await loadSigningKey("{", API)).ok === false);
  check("loadSigningKey public-only rejected", (await loadSigningKey(JSON.stringify({ ...privJwk, d: undefined }), API)).ok === false);
  check("loadSigningKey mismatched pair rejected", (await loadSigningKey(JSON.stringify({ ...privJwk, x: JSON.parse(other).x }), API)).ok === false);

  // Unset key: refuse to issue, list says canIssue false.
  {
    const h = makeStore();
    const s = createBadgeService({ store: h.store, now: () => clock, signingJwk: () => null, apiUrl: () => API, siteUrl: () => SITE });
    const l = await s.list("m1");
    check("unset key: canIssue false", l.canIssue === false);
    let code = ""; try { await s.claim("m1", "trainer"); } catch (e) { code = (e as { code: string }).code; }
    check("unset key: claim refused NOT_CONFIGURED", code === "NOT_CONFIGURED" && h.writes.length === 0);
    check("unset key: jwks empty", (await s.jwks()).keys.length === 0);
  }

  const h = makeStore();
  let key: string | null = KEY;
  const s = createBadgeService({
    store: h.store, now: () => clock, signingJwk: () => key, apiUrl: () => API, siteUrl: () => SITE,
    newId: () => `award-${++n}`, newSalt: () => "salt-1",
  });
  const err = async (fn: () => Promise<unknown>) => { try { await fn(); return ""; } catch (e) { return (e as { code?: string }).code ?? "THREW"; } };

  // list
  let l = await s.list("m1");
  check("canIssue true", l.canIssue === true);
  const t = l.badges.find(b => b.id === "trainer")!;
  check("trainer eligible at threshold", t.value === 5 && t.eligible === true && t.award === null);
  check("lab below threshold", l.badges.find(b => b.id === "lab-practitioner")!.eligible === false);
  const lead = l.badges.find(b => b.id === "team-lead")!;
  check("team-lead needs confirmation", lead.meetsThreshold && lead.needsConfirmation && !lead.eligible);

  // threshold boundary
  check("unknown achievement 404", await err(() => s.claim("m1", "nope")) === "NOT_FOUND");
  check("49.9 < 50 not eligible", await err(() => s.claim("m1", "lab-practitioner")) === "NOT_ELIGIBLE");
  check("no snapshot not eligible", await err(() => s.claim("m1", "design-reviewer")) === "NOT_ELIGIBLE");
  h.snaps.m1.lab_hours = 50;
  check("exactly 50 claims", (await s.claim("m1", "lab-practitioner")).award.value === 50);

  // CONFIRMED needs VERIFIED attestation matching the value
  check("CONFIRMED without attestation refused", await err(() => s.claim("m1", "team-lead")) === "NOT_ELIGIBLE");
  h.confirmations.m1.push({ kind: "CONFIRM", status: "PENDING", metricId: "team_led", value: 4 });
  check("CONFIRMED with PENDING refused", await err(() => s.claim("m1", "team-lead")) === "NOT_ELIGIBLE");
  h.confirmations.m1.push({ kind: "CONFIRM", status: "VERIFIED", metricId: "team_led", value: 3 });
  check("CONFIRMED with VERIFIED for a different value refused", await err(() => s.claim("m1", "team-lead")) === "NOT_ELIGIBLE");
  h.confirmations.m1.push({ kind: "CONFIRM", status: "VERIFIED", metricId: "team_led", value: 4 });
  check("CONFIRMED with matching VERIFIED claims", (await s.claim("m1", "team-lead")).award.value === 4);

  // disabled metric
  h.setDisabled(["prs_merged"]);
  check("disabled metric refused", await err(() => s.claim("m1", "software-contributor")) === "NOT_FOUND");
  check("disabled metric hidden from list", !(await s.list("m1")).badges.some(b => b.id === "software-contributor"));
  h.setDisabled([]);

  // claim + JWT
  const before = h.writes.length;
  const c = await s.claim("m1", "trainer");
  const row = h.awards.find(a => a.id === c.award.id)!;
  check("one insert per claim", h.writes.length === before + 1 && h.writes.at(-1)!.op === "create");
  check("insert carries jwt and sha256", typeof row.credentialJwt === "string" && row.credentialSha256 === sha256Hex(row.credentialJwt));
  check("issuedAt truncated to seconds", row.issuedAt.getTime() % 1000 === 0);
  check("verify/linkedin urls", c.award.verifyUrl === `${SITE}/badges/${row.id}` && c.award.linkedInUrl!.startsWith("https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME"));
  const header = decodeProtectedHeader(row.credentialJwt);
  check("header alg/typ/kid only", header.alg === "EdDSA" && header.typ === "JWT" && String(header.kid).startsWith(`${API}/api/public/badges/jwks.json#`) && Object.keys(header).sort().join() === "alg,kid,typ");
  const jwks = await s.jwks();
  check("jwks has no d", jwks.keys.length === 1 && !("d" in jwks.keys[0]) && jwks.keys[0].kid === header.kid);
  const { payload } = await jwtVerify(row.credentialJwt, createLocalJWKSet(jwks as never), { algorithms: ["EdDSA"], currentDate: new Date(clock) });
  check("JWT verifies with published jwks", payload.jti === `${API}/api/public/badges/${row.id}` && payload.iss === `${API}/api/public/badges/issuer`);
  const subj = (payload as { credentialSubject: { identifier: { identityHash: string }[]; result: { value: string }[] } }).credentialSubject;
  check("subject hash is salted sha256 of email", subj.identifier[0].identityHash === identityHash("m1@example.com", "salt-1"));
  check("result value text", subj.result[0].value === "Trained 5 members");
  check("no plain email in jwt payload", !JSON.stringify(payload).includes("m1@example.com") && !JSON.stringify(payload).includes("\"m1\""));

  // duplicates
  check("duplicate refused", await err(() => s.claim("m1", "trainer")) === "ALREADY_CLAIMED");
  // race: store reports P2002 even though the pre-check missed it
  {
    const h2 = makeStore();
    const s2 = createBadgeService({ store: { ...h2.store, awardsForMember: async () => [] }, now: () => clock, signingJwk: () => KEY, apiUrl: () => API, siteUrl: () => SITE });
    await s2.claim("m2", "trainer");
    check("P2002 race maps to ALREADY_CLAIMED", await err(() => s2.claim("m2", "trainer")) === "ALREADY_CLAIMED");
  }

  // public reads
  let pub = await s.publicAward(row.id);
  check("public award verified", pub!.verified === true && pub!.verifyError === null && pub!.revoked === false);
  check("public award has decoded credential", (pub!.credential as { id?: string }).id === payload.jti);
  check("public award no email/member id", !JSON.stringify(pub).includes("m1@example.com") && !JSON.stringify(pub).includes("\"m1\""));
  check("public unknown null", (await s.publicAward("missing")) === null && (await s.status("missing")) === null);
  check("public achievement", (await s.publicAchievement("trainer"))!.name === "Trainer" && s.publicAchievement("nope") === null);
  check("issuer profile", s.publicIssuer().id === `${API}/api/public/badges/issuer`);

  // revoke: owner only, sets revokedAt only
  const jwtBefore = row.credentialJwt, shaBefore = row.credentialSha256;
  check("other member cannot revoke", await err(() => s.revoke("m2", row.id, {})) === "NOT_FOUND" && row.revokedAt === null);
  check("bad reason type 400", await err(() => s.revoke("m1", row.id, { reason: 5 })) === "INVALID");
  clock += 5000;
  const r = await s.revoke("m1", row.id, { reason: "  moving on " });
  check("revoke sets revokedAt", r.award.revokedAt instanceof Date && row.revokedAt!.getTime() === clock && row.revokedReason === "moving on");
  check("revoke never rewrites credential", row.credentialJwt === jwtBefore && row.credentialSha256 === shaBefore && h.awards.includes(row));
  check("revoke idempotent", (await s.revoke("m1", row.id, {})).award.revokedAt!.getTime() === clock);
  check("status shows revoked", (await s.status(row.id))!.revoked === true);
  pub = await s.publicAward(row.id);
  check("public revoked, reason hidden", pub!.revoked === true && !JSON.stringify(pub).includes("moving on"));
  check("revoked cannot be re-claimed", await err(() => s.claim("m1", "trainer")) === "REVOKED");
  l = await s.list("m1");
  check("list shows revoked award, not eligible", l.badges.find(b => b.id === "trainer")!.award!.revokedAt !== null && !l.badges.find(b => b.id === "trainer")!.eligible);

  // key rotated or removed: stored credential still served, verified false
  key = other;
  pub = await s.publicAward(row.id);
  check("rotated key: verified false KEY_MISMATCH", pub!.verified === false && pub!.verifyError === "KEY_MISMATCH" && pub!.jwt === jwtBefore);
  key = null;
  pub = await s.publicAward(row.id);
  check("unset key: verified false, credential still served", pub!.verified === false && pub!.verifyError === "KEY_UNSET" && pub!.credential !== null);
  key = KEY;
  // tampered storage
  row.credentialSha256 = "0".repeat(64);
  check("hash mismatch detected", (await s.publicAward(row.id))!.verifyError === "HASH_MISMATCH");
  row.credentialSha256 = shaBefore;
  const [hh, pp, sig] = row.credentialJwt.split(".");
  row.credentialJwt = `${hh}.${pp}.${sig.slice(0, -4)}AAAA`; row.credentialSha256 = sha256Hex(row.credentialJwt);
  check("bad signature detected", (await s.publicAward(row.id))!.verifyError === "SIGNATURE_INVALID");

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}
main().catch(e => { console.error(e); process.exit(1); });
