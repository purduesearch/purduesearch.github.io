// Public badge route tests: in-process Express, in-memory store, generated Ed25519 key. No DB, no network.
// Run: cd backend && npx tsx src/api/badges.test.ts
import express from "express";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { exportJWK, generateKeyPair } from "jose";
import { createPublicBadgesRouter } from "./badges.js";
import { createBadgeService, type AwardRow, type BadgeStore } from "../services/badgeService.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) { if (cond) passed++; else { failed++; console.error(`  FAIL ${name}`); } }

const src = readFileSync(fileURLToPath(new URL("./badges.ts", import.meta.url)), "utf8");
check("GET routes only", !/router\.(post|put|patch|delete)\(/.test(src));
check("no auth middleware", !/import[^\n]*requireAuth|req\.session|req\.memberId/.test(src));
check("static paths registered above /:id", ["/issuer", "/jwks.json", "/achievements/:id", "/:id/status"].every(p => src.indexOf(`"${p}"`) !== -1 && src.indexOf(`"${p}"`) < src.indexOf(`router.get("/:id",`)));

const EMAIL = "ada.private@example.com";
const awards: AwardRow[] = [];
const store: BadgeStore = {
  member: async id => ({ id, email: EMAIL }),
  snapshotValue: async () => 9,
  snapshotValues: async () => [{ metricId: "members_trained", value: 9 }],
  confirmations: async () => [],
  disabledMetrics: async () => [],
  awardsForMember: async m => awards.filter(a => a.memberId === m),
  award: async id => awards.find(a => a.id === id) ?? null,
  createAward: async row => { const r = { ...row, revokedAt: null, revokedReason: null }; awards.push(r); return r; },
  revokeAward: async (id, memberId, at, reason) => { const a = awards.find(x => x.id === id && x.memberId === memberId); if (!a) return false; a.revokedAt = at; a.revokedReason = reason; return true; },
};

async function main() {
  const KEY = JSON.stringify(await exportJWK((await generateKeyPair("EdDSA", { extractable: true })).privateKey));
  const API = "https://api.test", SITE = "https://site.test";
  const clock = Date.UTC(2026, 10, 16, 12, 0, 0);
  // Seed one award through the real service so the stored JWT is genuine.
  const seed = createBadgeService({ store, now: () => clock, signingJwk: () => KEY, apiUrl: () => API, siteUrl: () => SITE, newId: () => "award-abc123" });
  await seed.claim("member-1", "trainer");

  const app = express();
  app.use("/api/public/badges", createPublicBadgesRouter({ store, now: () => clock, signingJwk: KEY, apiUrl: API, frontendUrl: SITE }));
  app.use("/api/public/badges-unset", createPublicBadgesRouter({ store, now: () => clock, signingJwk: null, apiUrl: API, frontendUrl: SITE }));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/public`;
  const get = async (path: string, method = "GET") => {
    const r = await fetch(base + path, { method });
    const text = await r.text();
    let json: any = null; try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: r.status, json, text, headers: r.headers };
  };
  const all: string[] = [];
  const keep = <T extends { text: string }>(r: T) => { all.push(r.text); return r; };

  try {
    let r = keep(await get("/badges/issuer"));
    check("issuer 200 Profile", r.status === 200 && r.json.type[0] === "Profile" && r.json.id === `${API}/api/public/badges/issuer` && r.json.url === SITE && Array.isArray(r.json["@context"]));
    check("issuer cached briefly", /public, max-age=\d+/.test(r.headers.get("cache-control") ?? ""));

    r = keep(await get("/badges/jwks.json"));
    check("jwks 200 one key", r.status === 200 && r.json.keys.length === 1 && r.json.keys[0].alg === "EdDSA" && r.json.keys[0].use === "sig");
    check("jwks never has d", !/"d"\s*:/.test(r.text));

    r = keep(await get("/badges/achievements/trainer"));
    check("achievement 200", r.status === 200 && r.json.type[0] === "Achievement" && r.json.name === "Trainer" && typeof r.json.criteria.narrative === "string");
    check("unknown achievement 404", (await get("/badges/achievements/nope")).status === 404);

    r = keep(await get("/badges/award-abc123"));
    check("award 200 verified", r.status === 200 && r.json.verified === true && typeof r.json.jwt === "string" && r.json.credential.id === `${API}/api/public/badges/award-abc123`);
    check("award summary", r.json.achievement.id === "trainer" && r.json.resultText === "Trained 9 members" && r.json.revoked === false && r.json.issuer.name === "Purdue SEARCH");
    check("award has no member id", !r.text.includes("member-1"));

    r = keep(await get("/badges/award-abc123/status"));
    check("status 200", r.status === 200 && r.json.revoked === false && r.json.revokedAt === null);

    const unknown = await get("/badges/award-zzz999");
    check("unknown award 404", unknown.status === 404 && unknown.json.error === "Badge not found");
    check("unknown status 404", (await get("/badges/award-zzz999/status")).status === 404);
    check("malformed id 404", (await get("/badges/a")).status === 404 && (await get("/badges/" + "x".repeat(80))).status === 404);
    check("POST not allowed", (await get("/badges/award-abc123", "POST")).status === 404);

    // Revoked: status flips; reason never public.
    await seed.revoke("member-1", "award-abc123", { reason: "private reason" });
    r = keep(await get("/badges/award-abc123/status"));
    check("status revoked", r.json.revoked === true && typeof r.json.revokedAt === "string");
    r = keep(await get("/badges/award-abc123"));
    check("revoked award still served, reason hidden", r.status === 200 && r.json.revoked === true && !r.text.includes("private reason"));

    // Key unset: jwks empty; stored credential still returned with verified false.
    r = keep(await get("/badges-unset/jwks.json"));
    check("unset jwks empty", r.status === 200 && r.json.keys.length === 0);
    r = keep(await get("/badges-unset/award-abc123"));
    check("unset: credential served, verified false + reason", r.status === 200 && r.json.verified === false && r.json.verifyError === "KEY_UNSET" && r.json.credential !== null);

    const joined = all.join("\n");
    check("no email anywhere in any response", !joined.includes(EMAIL) && !/ada\.private/i.test(joined));
    check("no level/photo/slack keys", !/"(level|avatarUrl|slackUserId|slackId|email)"\s*:/.test(joined));
  } finally {
    server.close();
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}
main().catch(e => { console.error(e); process.exit(1); });
