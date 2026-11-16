// Sponsor auth service tests. In-memory store, stub mailer. No DB, no network.
// Run: cd backend && npx tsx src/services/sponsorAuthService.test.ts
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  LOGIN_TOKEN_TTL_MS, SESSION_TTL_MS, cleanupSponsorTokens, createLoginRateLimiter, createSponsorAuthService,
  hashLoginToken, loginEmailHtml, newLoginToken, normalizeEmail, readSponsorSecret, signSponsorToken,
  verifySponsorToken, type SponsorAuthStore, type SponsorUserRow,
} from "./sponsorAuthService.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) { if (cond) passed++; else { failed++; console.error(`  FAIL ${name}`); } }

const SECRET = "s".repeat(40);
const SESSION_SECRET = "m".repeat(40);

function makeSponsorStore(users: SponsorUserRow[]) {
  const tokens: { tokenHash: string; sponsorUserId: string; expiresAt: Date; usedAt: Date | null }[] = [];
  const logins: string[] = [];
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
    touchLogin: async id => { logins.push(id); },
    bumpTokenVersion: async id => { const u = users.find(x => x.id === id); if (u) u.tokenVersion++; },
    deleteStaleTokens: async now => {
      const before = tokens.length;
      for (let i = tokens.length - 1; i >= 0; i--) if (tokens[i].usedAt || tokens[i].expiresAt < now) tokens.splice(i, 1);
      return before - tokens.length;
    },
  };
  return { store, tokens, logins };
}

const user = (over: Partial<SponsorUserRow> = {}): SponsorUserRow => ({
  id: "u1", email: "ada@acme.com", name: "Ada <b>", tokenVersion: 0, disabledAt: null,
  org: { id: "o1", name: "Acme", active: true, accessUntil: null }, ...over,
});

async function main() {
  // Static guards
  const src = readFileSync(fileURLToPath(new URL("./sponsorAuthService.ts", import.meta.url)), "utf8");
  check("uses timingSafeEqual", /timingSafeEqual/.test(src));
  check("no insecure default secret", !/SPONSOR_TOKEN_SECRET\s*\?\?|\|\|\s*["']/.test(src));
  check("no member session secret", !/getSessionSecret|SESSION_SECRET/.test(src));
  check("no console line mentions email or token values", !/console\.[a-z]+\([^)]*(email|rawToken|raw\b|hash)/i.test(src));

  // Hashing
  const { raw, hash } = newLoginToken();
  check("raw token is 32 bytes base64url", Buffer.from(raw, "base64url").length === 32 && /^[A-Za-z0-9_-]+$/.test(raw));
  check("hash is sha256 hex of raw", hash === hashLoginToken(raw) && /^[0-9a-f]{64}$/.test(hash) && hash !== raw);
  check("tokens differ", newLoginToken().raw !== raw);

  // Email normalization
  check("normalize trims + lowercases", normalizeEmail("  Ada@ACME.com ") === "ada@acme.com");
  check("rejects non-email", normalizeEmail("nope") === null && normalizeEmail(42) === null && normalizeEmail("") === null);
  check("rejects > 254 chars", normalizeEmail("a".repeat(250) + "@x.co") === null);

  // Secret
  check("unset secret fails closed", readSponsorSecret(undefined) === null && readSponsorSecret("") === null);
  check("short secret fails closed", readSponsorSecret("x".repeat(31)) === null);
  check("32-char secret accepted", readSponsorSecret("x".repeat(32)) === "x".repeat(32));

  // Bearer tokens
  const t0 = 1_700_000_000_000;
  const { token, expiresAt } = signSponsorToken(SECRET, "u1", 3, t0);
  check("expiry is 7 days", expiresAt.getTime() === t0 + SESSION_TTL_MS);
  const claims = verifySponsorToken(SECRET, token, t0 + 1000);
  check("valid token verifies", claims?.sponsorUserId === "u1" && claims.version === 3);
  check("expired token fails", verifySponsorToken(SECRET, token, t0 + SESSION_TTL_MS) === null);
  check("wrong secret fails", verifySponsorToken("z".repeat(40), token, t0) === null);
  const [p, sig] = token.split(".");
  const flipped = sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A");
  check("tampered signature fails", verifySponsorToken(SECRET, `${p}.${flipped}`, t0) === null);
  const forgedPayload = Buffer.from(`sponsor:u2:3:${t0 + SESSION_TTL_MS}`).toString("base64url");
  check("swapped payload fails", verifySponsorToken(SECRET, `${forgedPayload}.${sig}`, t0) === null);
  check("garbage fails", verifySponsorToken(SECRET, "abc", t0) === null && verifySponsorToken(SECRET, null, t0) === null);

  // Cross verification with the real member token code (member secret set before import).
  process.env.SESSION_SECRET = SESSION_SECRET;
  const auth = await import("../api/auth.js");
  const memberToken = auth.signToken("u1", 0);
  check("member token never verifies as sponsor (sponsor secret)", verifySponsorToken(SECRET, memberToken, Date.now()) === null);
  check("member token never verifies as sponsor (even with equal secrets)", verifySponsorToken(SESSION_SECRET, memberToken, Date.now()) === null);
  // A member-format payload signed exactly like a sponsor token is still rejected by the prefix check.
  const mp = Buffer.from(`u1|${Date.now() + 1e6}|0`).toString("base64url");
  const msig = createHmac("sha256", SECRET).update(mp).digest("base64url");
  check("member-format payload with sponsor signature rejected", verifySponsorToken(SECRET, `${mp}.${msig}`, Date.now()) === null);
  const sponsorTok = signSponsorToken(SECRET, "u1", 0, Date.now()).token;
  const sameSecretTok = signSponsorToken(SESSION_SECRET, "u1", 0, Date.now()).token;
  check("sponsor token never verifies as member", (await auth.verifyBearerToken(sponsorTok)) === null);
  check("sponsor token never verifies as member (even with equal secrets)", (await auth.verifyBearerToken(sameSecretTok)) === null);

  // Service: login → exchange → authenticate → logout
  let clock = t0;
  const users = [user(), user({ id: "u2", email: "off@acme.com", disabledAt: new Date(0) })];
  const h = makeSponsorStore(users);
  const sent: { to: string; subject: string; html: string }[] = [];
  let secretValue: string | null = SECRET;
  const svc = createSponsorAuthService({
    store: h.store, mailer: async m => { sent.push(m); }, now: () => clock,
    secret: () => readSponsorSecret(secretValue), frontendUrl: () => "https://example.org/",
  });

  check("requestLogin sends for eligible user", (await svc.requestLogin("ada@acme.com")) === true && sent.length === 1);
  check("requestLogin skips disabled user", (await svc.requestLogin("off@acme.com")) === false && sent.length === 1);
  check("requestLogin skips unknown", (await svc.requestLogin("who@acme.com")) === false && sent.length === 1);
  const link = /href="([^"]+)"/.exec(sent[0].html)?.[1] ?? "";
  check("link uses frontend url", link.startsWith("https://example.org/sponsors?t="));
  const rawLink = decodeURIComponent(link.split("?t=")[1]);
  check("raw token never stored", h.tokens.every(t => t.tokenHash !== rawLink) && h.tokens[0].tokenHash === hashLoginToken(rawLink));
  check("link token expires in 15 min", h.tokens[0].expiresAt.getTime() === t0 + LOGIN_TOKEN_TTL_MS);
  check("html escapes name", sent[0].html.includes("Ada &lt;b&gt;") && loginEmailHtml("x\"y", null).includes("x&quot;y"));

  // New request invalidates previous link
  await svc.requestLogin("ada@acme.com");
  const rawLink2 = decodeURIComponent((/href="([^"]+)"/.exec(sent[1].html)?.[1] ?? "").split("?t=")[1]);
  check("older link invalidated by new request", (await svc.exchange(rawLink)) === null);

  const session = await svc.exchange(rawLink2);
  check("exchange returns bearer + summary", !!session && session.sponsor.id === "u1" && session.sponsor.org.name === "Acme" && h.logins.includes("u1"));
  check("second consume fails (single use)", (await svc.exchange(rawLink2)) === null);
  check("authenticate valid bearer", (await svc.authenticate(session!.token))?.id === "u1");

  // Expiry of login link
  await svc.requestLogin("ada@acme.com");
  const rawLink3 = decodeURIComponent((/href="([^"]+)"/.exec(sent[2].html)?.[1] ?? "").split("?t=")[1]);
  clock += LOGIN_TOKEN_TTL_MS + 1;
  check("expired link fails", (await svc.exchange(rawLink3)) === null);

  // tokenVersion revocation
  await svc.logout("u1");
  check("logout revokes old bearer", (await svc.authenticate(session!.token)) === null);

  // Eligibility re-checked at authenticate time
  const fresh = signSponsorToken(SECRET, "u1", users[0].tokenVersion, clock).token;
  check("fresh bearer valid", (await svc.authenticate(fresh))?.id === "u1");
  users[0].org.accessUntil = new Date(clock - 1);
  check("expired org access rejects", (await svc.authenticate(fresh)) === null);
  users[0].org.accessUntil = null; users[0].org.active = false;
  check("inactive org rejects", (await svc.authenticate(fresh)) === null);
  users[0].org.active = true;

  // Missing secret fails closed
  secretValue = "short";
  const before = sent.length;
  check("no send without secret", (await svc.requestLogin("ada@acme.com")) === false && sent.length === before);
  let threw = false; try { await svc.exchange("x".repeat(43)); } catch { threw = true; }
  check("exchange throws when unconfigured", threw);
  threw = false; try { await svc.authenticate(fresh); } catch { threw = true; }
  check("authenticate throws when unconfigured", threw);
  check("configured() false", svc.configured() === false);

  // Cleanup deletes used + expired only
  const c = makeSponsorStore([]);
  const now = new Date(t0);
  await c.store.createLoginToken({ tokenHash: "live", sponsorUserId: "u1", expiresAt: new Date(t0 + 1000) });
  await c.store.createLoginToken({ tokenHash: "old", sponsorUserId: "u1", expiresAt: new Date(t0 - 1000) });
  await c.store.createLoginToken({ tokenHash: "used", sponsorUserId: "u1", expiresAt: new Date(t0 + 1000) });
  c.tokens[2].usedAt = now;
  const origLog = console.log; console.log = () => {};
  const n = await cleanupSponsorTokens(now, c.store);
  console.log = origLog;
  check("cleanup deletes used + expired", n === 2 && c.tokens.length === 1 && c.tokens[0].tokenHash === "live");
  const origErr = console.error; console.error = () => {};
  const n2 = await cleanupSponsorTokens(now, { ...c.store, deleteStaleTokens: async () => { throw new Error("db down"); } });
  console.error = origErr;
  check("cleanup never throws", n2 === 0);

  // Rate limiter
  let rl = 0;
  const lim = createLoginRateLimiter(() => rl);
  const okFive = [1, 2, 3, 4, 5].every(() => lim.allow("a@x.co", "1.1.1.1"));
  check("5 per email allowed", okFive);
  check("6th per email blocked", !lim.allow("a@x.co", "2.2.2.2"));
  rl += 60 * 60 * 1000;
  check("window rolls", lim.allow("a@x.co", "1.1.1.1"));
  const ipLim = createLoginRateLimiter(() => 0);
  for (let i = 0; i < 30; i++) ipLim.allow(`u${i}@x.co`, "9.9.9.9");
  check("per-ip limit 30", !ipLim.allow("new@x.co", "9.9.9.9") && ipLim.allow("new@x.co", "8.8.8.8"));

  console.log(`${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
