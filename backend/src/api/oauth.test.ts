import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import express from "express";
import { createOAuthRouters } from "./oauth.js";
import { OAuthError } from "../services/oauthCore.js";
import type { OAuthService } from "../services/oauthService.js";

let passed = 0, consents = 0, tokens = 0, revokes = 0;
const calls: string[] = [];
const service = {
  metadata: () => ({ issuer: "https://issuer.test", token_endpoint: "https://issuer.test/oauth/token" }),
  resourceMetadata: () => ({ resource: "https://issuer.test/mcp" }),
  register: async () => ({ client_id: "registered" }),
  authorize: async (body: any) => { if (Array.isArray(body.client_id)) throw new OAuthError("invalid_request", "Invalid client_id"); return "https://app.test/clubpm/connect?req=pending"; },
  getPending: async (_id: unknown, memberId: string) => ({ member: memberId, projects: [] }),
  consent: async (memberId: string) => { consents++; calls.push(memberId); return { redirectUrl: "https://claude.ai/api/mcp/auth_callback?code=test" }; },
  exchangeCode: async () => { tokens++; return { access_token: "opaque", token_type: "Bearer" }; },
  exchangeRefresh: async () => { tokens++; return { access_token: "rotated", token_type: "Bearer" }; },
  revoke: async () => { revokes++; },
  listGrants: async (memberId: string) => ({ projects: [], grants: [{ id: "g1", memberId }] }),
  updateGrantProjects: async (memberId: string) => { calls.push(`update:${memberId}`); },
  revokeMemberGrant: async (memberId: string) => { calls.push(`revoke:${memberId}`); },
} as unknown as OAuthService;
const { oauthRouter, oauthMetadataRouter } = createOAuthRouters({ service,
  verifyLoginBearer: async token => token === "valid-login" ? "member" : null });
const app = express(); app.use(express.json()); app.use(express.urlencoded({ extended: true }));
// A cookie-created session must never substitute for consent's explicit verified Bearer.
app.use((req, _res, next) => { (req as any).session = { memberId: "cookie-member" }; next(); });
app.use("/oauth", oauthRouter); app.use("/.well-known", oauthMetadataRouter);
const server = createServer(app); server.listen(0, "127.0.0.1"); await once(server, "listening");
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
async function test(name: string, run: () => Promise<void>) { await run(); passed++; console.log(`PASS ${name}`); }
const post = (path: string, body: unknown, authorization?: string) => fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", ...(authorization ? { Authorization: authorization } : {}) }, body: JSON.stringify(body) });
try {
  await test("metadata is unauthenticated at root and resource-specific well-known URLs", async () => {
    for (const path of ["/oauth-authorization-server", "/oauth-protected-resource", "/oauth-protected-resource/mcp"]) {
      const result = await fetch(base + "/.well-known" + path);
      assert.equal(result.status, 200); assert.equal(result.headers.get("cache-control"), "no-store");
      assert.equal(result.headers.get("pragma"), "no-cache");
    }
  });
  await test("cookie-only, invalid Bearer, and malformed Bearer cannot consent", async () => {
    for (const auth of [undefined, "Bearer invalid", "Bearer invalid extra", "Basic valid-login"]) {
      const result = await post("/oauth/consent", { approve: true }, auth);
      assert.equal(result.status, 401); assert.equal((await result.json()).error, "invalid_token");
    }
    assert.equal(consents, 0);
  });
  await test("valid login Bearer supplies the member identity to consent", async () => {
    const result = await post("/oauth/consent", { approve: true }, "Bearer valid-login");
    assert.equal(result.status, 200); assert.deepEqual(calls, ["member"]);
    assert.match((await result.json()).redirectUrl, /^https:\/\/claude.ai\//);
  });
  await test("pending data also requires a verified login Bearer", async () => {
    assert.equal((await fetch(base + "/oauth/pending/id")).status, 401);
    const result = await fetch(base + "/oauth/pending/id", { headers: { Authorization: "Bearer valid-login" } });
    assert.equal(result.status, 200); assert.equal((await result.json()).member, "member");
  });
  await test("connected-app grant routes require a verified login Bearer, never the cookie", async () => {
    const send = (method: string, path: string, authorization?: string) => fetch(base + path, { method,
      headers: { "Content-Type": "application/json", ...(authorization ? { Authorization: authorization } : {}) }, body: method === "GET" ? undefined : JSON.stringify({ projectIds: [] }) });
    for (const [method, path] of [["GET", "/oauth/grants"], ["PATCH", "/oauth/grants/g1"], ["DELETE", "/oauth/grants/g1"]]) {
      assert.equal((await send(method, path)).status, 401);
      assert.equal((await send(method, path, "Bearer valid-login")).status, 200);
    }
    assert.ok(calls.includes("update:member") && calls.includes("revoke:member"));
    assert.equal(calls.some(c => c.includes("cookie-member")), false);
  });
  await test("authorize redirects only after service validation and query arrays fail", async () => {
    const result = await fetch(base + "/oauth/authorize?client_id=client", { redirect: "manual" });
    assert.equal(result.status, 302); assert.equal(result.headers.get("location"), "https://app.test/clubpm/connect?req=pending");
    assert.equal((await fetch(base + "/oauth/authorize?client_id=a&client_id=b", { redirect: "manual" })).status, 400);
  });
  await test("tokens require a supported grant and reject secret/assertion/header client auth", async () => {
    for (const body of [{ grant_type: "password" }, { grant_type: "authorization_code", client_secret: "secret" }, { grant_type: "refresh_token", client_assertion: "assertion" }]) assert.equal((await post("/oauth/token", body)).status, 400);
    assert.equal((await post("/oauth/token", { grant_type: "authorization_code" }, "Basic client")).status, 400);
    assert.equal(tokens, 0);
    assert.equal((await post("/oauth/token", { grant_type: "authorization_code" })).status, 200);
    assert.equal((await post("/oauth/token", { grant_type: "refresh_token" })).status, 200);
    assert.equal(tokens, 2);
  });
  await test("URL-encoded token requests work", async () => {
    const result = await fetch(base + "/oauth/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=authorization_code&client_id=client" });
    assert.equal(result.status, 200); assert.equal(result.headers.get("cache-control"), "no-store");
  });
  await test("revocation rejects unsupported client auth and otherwise answers idempotently", async () => {
    assert.equal((await post("/oauth/revoke", { token: "t", client_secret: "secret" })).status, 400);
    assert.equal((await post("/oauth/revoke", { token: "t", client_assertion: "assertion" })).status, 400);
    assert.equal((await post("/oauth/revoke", { token: "t" }, "Basic client")).status, 400);
    assert.equal(revokes, 0);
    assert.equal((await post("/oauth/revoke", { token: "t" })).status, 200);
  });
  await test("registration uses a bounded per-IP limiter", async () => {
    for (let i = 0; i < 30; i++) assert.equal((await post("/oauth/register", {})).status, 201);
    const result = await post("/oauth/register", {}); assert.equal(result.status, 429);
    assert.ok(Number(result.headers.get("retry-after")) > 0);
  });
  console.log(`oauth routes: ${passed} passed, 0 failed`);
} finally {
  server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
