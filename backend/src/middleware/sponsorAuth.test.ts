// requireSponsor tests: in-process Express, in-memory store. No DB, no network.
// Run: cd backend && npx tsx src/middleware/sponsorAuth.test.ts
import express from "express";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { createRequireSponsor } from "./sponsorAuth.js";
import { signSponsorToken, type SponsorAuthStore, type SponsorUserRow } from "../services/sponsorAuthService.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) { if (cond) passed++; else { failed++; console.error(`  FAIL ${name}`); } }

const SECRET = "s".repeat(40);
const SESSION_SECRET = "m".repeat(40);

async function main() {
  const src = readFileSync(fileURLToPath(new URL("./sponsorAuth.ts", import.meta.url)), "utf8");
  check("never reads req.session", !/req\.session/.test(src));
  check("never imports member auth", !/api\/auth\.js|requireAuth|verifyBearerToken/.test(src));

  const users: SponsorUserRow[] = [
    { id: "u1", email: "a@acme.com", name: "A", tokenVersion: 2, disabledAt: null, org: { id: "o1", name: "Acme", active: true, accessUntil: null } },
  ];
  const store = {
    findUserById: async (id: string) => users.find(u => u.id === id) ?? null,
  } as unknown as SponsorAuthStore;
  const clock = 1_700_000_000_000;
  let secret: string | null = SECRET;

  const app = express();
  app.use(express.json());
  app.get("/p", createRequireSponsor({ store, now: () => clock, secret: () => secret }), (req, res) => {
    res.json({ sponsorUserId: req.sponsorUserId ?? null, memberId: req.memberId ?? null });
  });
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/p`;
  const call = async (auth?: string) => {
    const r = await fetch(base, { headers: auth ? { authorization: auth } : {} });
    let json: any = null; try { json = await r.json(); } catch { /* none */ }
    return { status: r.status, json };
  };

  try {
    const good = signSponsorToken(SECRET, "u1", 2, clock).token;
    check("missing header 401", (await call()).status === 401);
    check("non-bearer header 401", (await call(`Basic ${good}`)).status === 401);
    check("bad token 401", (await call("Bearer nonsense")).status === 401);
    const ok = await call(`Bearer ${good}`);
    check("valid sets req.sponsorUserId", ok.status === 200 && ok.json?.sponsorUserId === "u1" && ok.json?.memberId === null);
    check("stale tokenVersion 401", (await call(`Bearer ${signSponsorToken(SECRET, "u1", 1, clock).token}`)).status === 401);
    check("unknown user 401", (await call(`Bearer ${signSponsorToken(SECRET, "nope", 0, clock).token}`)).status === 401);
    check("expired bearer 401", (await call(`Bearer ${signSponsorToken(SECRET, "u1", 2, clock - 8 * 86400_000).token}`)).status === 401);

    users[0].disabledAt = new Date(0);
    check("disabled user 401", (await call(`Bearer ${good}`)).status === 401);
    users[0].disabledAt = null;
    users[0].org.active = false;
    check("inactive org 401", (await call(`Bearer ${good}`)).status === 401);
    users[0].org.active = true;
    users[0].org.accessUntil = new Date(clock - 1);
    check("expired accessUntil 401", (await call(`Bearer ${good}`)).status === 401);
    users[0].org.accessUntil = new Date(clock + 86400_000);
    check("future accessUntil ok", (await call(`Bearer ${good}`)).status === 200);

    // Member Bearer token (real member signer) is rejected.
    process.env.SESSION_SECRET = SESSION_SECRET;
    const { signToken } = await import("../api/auth.js");
    check("member bearer rejected", (await call(`Bearer ${signToken("u1", 2)}`)).status === 401);
    // Session cookie alone never authenticates.
    const r = await fetch(base, { headers: { cookie: "connect.sid=s%3Aabc.def" } });
    check("cookie alone 401", r.status === 401);

    secret = "short";
    const nc = await call(`Bearer ${good}`);
    check("short secret 503", nc.status === 503 && nc.json?.error === "Sponsor sign-in is not configured.");
    secret = null;
    check("unset secret 503", (await call()).status === 503);
  } finally {
    server.close();
  }

  console.log(`${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
