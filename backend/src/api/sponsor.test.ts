// Sponsor auth route tests: in-process Express, in-memory store, stub mailer. No DB, no network, no email.
// Run: cd backend && npx tsx src/api/sponsor.test.ts
import express from "express";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { createSponsorRouter } from "./sponsor.js";
import { LOGIN_TOKEN_TTL_MS, type SponsorAuthStore, type SponsorUserRow } from "../services/sponsorAuthService.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) { if (cond) passed++; else { failed++; console.error(`  FAIL ${name}`); } }

const SECRET = "s".repeat(40);
const FRONTEND = "https://frontend.test";

function makeStore(users: SponsorUserRow[]) {
  const tokens: { tokenHash: string; sponsorUserId: string; expiresAt: Date; usedAt: Date | null }[] = [];
  const store: SponsorAuthStore = {
    findUserByEmail: async e => users.find(u => u.email.toLowerCase() === e.toLowerCase()) ?? null,
    findUserById: async id => users.find(u => u.id === id) ?? null,
    invalidateUnusedTokens: async (id, now) => { for (const t of tokens) if (t.sponsorUserId === id && !t.usedAt) t.usedAt = now; },
    createLoginToken: async row => { tokens.push({ ...row, usedAt: null }); },
    consumeLoginToken: async (hash, now) => {
      const hit = tokens.filter(t => t.tokenHash === hash && !t.usedAt && t.expiresAt > now);
      if (hit.length !== 1) return null;
      hit[0].usedAt = now;
      return hit[0].sponsorUserId;
    },
    touchLogin: async id => { const u = users.find(x => x.id === id); if (u) (u as SponsorUserRow & { lastLoginAt?: Date }).lastLoginAt = new Date(); },
    bumpTokenVersion: async id => { const u = users.find(x => x.id === id); if (u) u.tokenVersion++; },
    deleteStaleTokens: async () => 0,
  };
  return { store, tokens };
}

const org = (over: Partial<SponsorUserRow["org"]> = {}) => ({ id: "o1", name: "Acme", active: true, accessUntil: null, ...over });

async function main() {
  const src = readFileSync(fileURLToPath(new URL("./sponsor.ts", import.meta.url)), "utf8");
  check("never reads req.session or req.memberId", !/req\.session|req\.memberId/.test(src));
  check("never uses member requireAuth", !/requireAuth/.test(src));

  let clock = 1_700_000_000_000;
  const users: SponsorUserRow[] = [
    { id: "ok", email: "ada@acme.com", name: "Ada", tokenVersion: 0, disabledAt: null, org: org() },
    { id: "dis", email: "dis@acme.com", name: null, tokenVersion: 0, disabledAt: new Date(0), org: org() },
    { id: "ina", email: "ina@off.com", name: null, tokenVersion: 0, disabledAt: null, org: org({ id: "o2", active: false }) },
    { id: "exp", email: "exp@old.com", name: null, tokenVersion: 0, disabledAt: null, org: org({ id: "o3", accessUntil: new Date(clock - 1) }) },
    { id: "rl", email: "rl@acme.com", name: null, tokenVersion: 0, disabledAt: null, org: org() },
  ];
  const h = makeStore(users);
  const sent: { to: string; subject: string; html: string }[] = [];
  let jobs: Promise<void>[] = [];
  const mk = (secret: string | null) => createSponsorRouter({
    store: h.store, mailer: async m => { sent.push(m); }, now: () => clock, secret, frontendUrl: FRONTEND,
    onBackground: j => { jobs.push(j); },
  });
  const app = express();
  app.use(express.json());
  app.use("/api/sponsor", mk(SECRET));
  app.use("/off/sponsor", mk(null));
  app.use("/short/sponsor", mk("short-secret"));
  const server = app.listen(0);
  const root = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (method: string, path: string, body?: unknown, bearer?: string, prefix = "/api/sponsor") => {
    const r = await fetch(root + prefix + path, {
      method,
      headers: { "content-type": "application/json", ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json: any = null; try { json = await r.json(); } catch { /* none */ }
    return { status: r.status, json };
  };
  const settle = async () => { await Promise.all(jobs); jobs = []; };
  const linkOf = (html: string) => (/href="([^"]+)"/.exec(html)?.[1] ?? "").replace(/&amp;/g, "&");
  const rawOf = (html: string) => decodeURIComponent(linkOf(html).split("?t=")[1] ?? "");

  try {
    // Login always 202; mail only for the valid one.
    const cases: [string, unknown][] = [
      ["unknown email", { email: "nobody@acme.com" }],
      ["disabled user", { email: "dis@acme.com" }],
      ["inactive org", { email: "ina@off.com" }],
      ["expired access", { email: "exp@old.com" }],
      ["invalid email", { email: "not-an-email" }],
      ["missing body", undefined],
    ];
    for (const [name, body] of cases) {
      const r = await call("POST", "/login", body);
      await settle();
      check(`login 202 for ${name}`, r.status === 202);
    }
    check("no mail for ineligible cases", sent.length === 0 && h.tokens.length === 0);

    // Rate limit: 5 per email per hour.
    for (let i = 0; i < 5; i++) { await call("POST", "/login", { email: "rl@acme.com" }); await settle(); }
    check("5 sends within limit", sent.length === 5);
    const over = await call("POST", "/login", { email: " RL@acme.com " });
    await settle();
    check("rate-limited still 202", over.status === 202);
    check("rate-limited does not send", sent.length === 5);
    sent.length = 0;

    const valid = await call("POST", "/login", { email: "  Ada@ACME.com " });
    await settle();
    check("valid login 202", valid.status === 202);
    check("same body for every login", JSON.stringify(valid.json) === JSON.stringify(over.json));
    check("mailer called once for valid user", sent.length === 1 && sent[0].to === "ada@acme.com");
    check("link is FRONTEND_URL/sponsors?t=", linkOf(sent[0].html).startsWith(`${FRONTEND}/sponsors?t=`));
    const raw = rawOf(sent[0].html);
    check("raw token never stored", raw.length >= 40 && h.tokens.every(t => t.tokenHash !== raw));

    // Session
    const s = await call("POST", "/session", { token: raw });
    check("session happy path", s.status === 200 && typeof s.json?.token === "string" && s.json?.sponsor?.id === "ok"
      && s.json?.sponsor?.org?.name === "Acme" && typeof s.json?.expiresAt === "string");
    check("session reuse 401", (await call("POST", "/session", { token: raw })).status === 401);
    check("session garbage 401", (await call("POST", "/session", { token: "x".repeat(43) })).status === 401);
    check("session missing token 401", (await call("POST", "/session", {})).status === 401);

    await call("POST", "/login", { email: "ada@acme.com" }); await settle();
    const raw2 = rawOf(sent[1].html);
    clock += LOGIN_TOKEN_TTL_MS + 1;
    check("session expired 401", (await call("POST", "/session", { token: raw2 })).status === 401);

    // /me and /logout
    const bearer = s.json.token as string;
    const me = await call("GET", "/me", undefined, bearer);
    check("/me returns summary", me.status === 200 && me.json?.sponsor?.email === "ada@acme.com" && me.json?.sponsor?.org?.id === "o1");
    check("/me without bearer 401", (await call("GET", "/me")).status === 401);
    check("/logout ok", (await call("POST", "/logout", undefined, bearer)).status === 200);
    check("/me after logout 401", (await call("GET", "/me", undefined, bearer)).status === 401);
    check("/logout without bearer 401", (await call("POST", "/logout")).status === 401);

    // Unconfigured secret: fail closed.
    const offLogin = await call("POST", "/login", { email: "ada@acme.com" }, undefined, "/off/sponsor");
    await settle();
    check("unset secret: login still 202, no mail", offLogin.status === 202 && sent.length === 2);
    const offSession = await call("POST", "/session", { token: raw }, undefined, "/off/sponsor");
    check("unset secret: session 503", offSession.status === 503 && offSession.json?.error === "Sponsor sign-in is not configured.");
    check("unset secret: /me 503", (await call("GET", "/me", undefined, bearer, "/off/sponsor")).status === 503);
    check("short secret: session 503", (await call("POST", "/session", { token: raw }, undefined, "/short/sponsor")).status === 503);
    await call("POST", "/login", { email: "ada@acme.com" }, undefined, "/short/sponsor"); await settle();
    check("short secret: no mail", sent.length === 2);
  } finally {
    server.close();
  }

  console.log(`${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
