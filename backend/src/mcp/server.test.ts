import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, request as httpRequest } from "node:http";
import express from "express";
import { createMcpRouter } from "./server.js";
import { createMcpContext, createGrantRateLimiter, type VerifiedAccess, type AccessibleProject } from "./context.js";
import { createOAuthProvider } from "./auth.js";
import { OAuthError, hashOpaqueToken } from "../services/oauthCore.js";
import type { OAuthService, OAuthDb } from "../services/oauthService.js";

let passed = 0;
async function test(name: string, run: () => unknown) { await run(); passed++; console.log(`PASS ${name}`); }
const bad = (run: Promise<unknown>, status: number) => assert.rejects(run, (e: unknown) => e instanceof OAuthError && e.status === status);
const issuer = "https://api.example.test", resource = `${issuer}/mcp`;
const tokenA = "A".repeat(43), tokenB = "B".repeat(43);
function world() {
  let now = Date.now(), revoked = false, admin = true, verifications = 0, revokeAfter = -1;
  let currentProjects = ["p1", "p2"], grantProjects = ["p1", "p3"], scopes = ["constellation.read", "constellation.plan"];
  const verify = async (token: string) => {
    verifications++;
    if (![tokenA, tokenB].includes(token) || revoked) throw new OAuthError("invalid_token", "Token unavailable", 401);
    const id = token === tokenA ? "a" : "b";
    const access = { token, clientId: "client", scopes: [...scopes], expiresAt: Math.floor((now + 3_600_000) / 1000), resource: new URL(resource),
      extra: { grantId: id, memberId: id, clientName: "Claude" },
      grant: { id, clientId: "client", memberId: id, scopes: [...scopes], projectIds: [...grantProjects], revokedAt: null,
        client: { clientId: "client", name: "Claude", redirectUris: [], createdAt: new Date(now) } },
      member: { id, isAdmin: admin, isBot: false, deactivatedAt: null } } as VerifiedAccess;
    if (verifications === revokeAfter) revoked = true;
    return access;
  };
  const listProjects = async () => currentProjects.map(id => ({ id, name: id, status: "ACTIVE", members: [] })) as AccessibleProject[];
  const limiter = createGrantRateLimiter({ now: () => now });
  const deps = { verifyAccessToken: verify, listProjects, limiter, resource, now: () => now };
  return { deps, context: (token = tokenA) => createMcpContext(token, deps), verify,
    revoke: () => { revoked = true; }, restore: () => { revoked = false; }, admin: (value: boolean) => { admin = value; },
    scopes: (value: string[]) => { scopes = value; }, projects: (value: string[]) => { currentProjects = value; }, grants: (value: string[]) => { grantProjects = value; },
    verifications: () => verifications, revokeOnNextAuth: () => { revokeAfter = verifications + 1; }, advance: (ms: number) => { now += ms; } };
}

await test("grant projects intersect current membership and selected projects never widen access", async () => {
  const w = world(), access = await w.context().resolve();
  assert.deepEqual(access.projectIds, ["p1"]); assert.equal("token" in access, false);
  await bad(w.context().authorizeProject("p2"), 403);
  await bad(w.context().authorizeProject("p3"), 403);
  w.projects([]); await bad(w.context().authorizeProject("p1"), 403);
});
await test("each tool invocation rechecks revocation, scopes and current admin status", async () => {
  const w = world(), context = w.context();
  await context.authorizeProject("p1", { admin: true, scope: "constellation.plan", rate: "preview" });
  w.admin(false); await bad(context.resolve({ admin: true, scope: "constellation.plan", rate: "execute" }), 403);
  w.admin(true); w.scopes(["constellation.read"]); await bad(context.resolve({ scope: "constellation.plan", rate: "preview" }), 403);
  w.scopes([]); await bad(context.resolve(), 403);
  w.revoke(); await bad(context.resolve(), 401);
  assert.equal(w.verifications(), 5);
});
await test("a verifier cannot bypass token expiry, resource, identity or deactivation checks", async () => {
  const w = world(), original = await w.verify(tokenA);
  for (const override of [
    { expiresAt: Math.floor(Date.now() / 1000) - 1 }, { resource: new URL("https://wrong.test/mcp") },
    { member: { ...original.member, id: "other" } }, { member: { ...original.member, isBot: true } },
    { member: { ...original.member, deactivatedAt: new Date() } }, { grant: { ...original.grant, revokedAt: new Date() } },
  ]) await bad(createMcpContext(tokenA, { ...w.deps, verifyAccessToken: async () => ({ ...original, ...override }) as VerifiedAccess }).resolve(), 401);
});
await test("grant quotas isolate reads, previews, executions and logs and reset after one hour", async () => {
  const w = world(), context = w.context();
  for (let i = 0; i < 60; i++) await context.resolve();
  await bad(context.resolve(), 429);
  await w.context(tokenB).resolve();
  for (let i = 0; i < 10; i++) await context.resolve({ admin: true, scope: "constellation.plan", rate: "execute" });
  await bad(context.resolve({ rate: "execute" }), 429);
  for (let i = 0; i < 30; i++) await context.resolve({ rate: "preview" });
  await bad(context.resolve({ rate: "preview" }), 429);
  for (let i = 0; i < 20; i++) await context.resolve({ rate: "log" });
  await bad(context.resolve({ rate: "log" }), 429);
  w.advance(3_600_000); await context.resolve();
});
await test("limiter storage is bounded and expires entries without evicting active quotas", () => {
  let now = 0; const limiter = createGrantRateLimiter({ now: () => now, maxGrants: 1 });
  limiter.consume("a", "read"); assert.throws(() => limiter.consume("b", "read"), { status: 429 });
  now = 3_600_000; limiter.consume("b", "read");
});
await test("unknown authorization storage failures never expose runtime or credential text to tools", async () => {
  const w = world();
  for (const override of [
    { verifyAccessToken: async () => { throw new Error(`database unavailable credential=${tokenA}`); } },
    { listProjects: async () => { throw new Error("private database diagnostic"); } },
  ]) {
    await assert.rejects(createMcpContext(tokenA, { ...w.deps, ...override }).resolve(), (error: unknown) =>
      error instanceof OAuthError && error.status === 503 && error.message === "Connection authorization is unavailable");
  }
});

await test("SDK OAuth provider delegates issuance and validates client-bound code challenges", async () => {
  const calls: any[] = [], at = new Date();
  const client = { client_id: "client", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] };
  let code: any = { clientId: "client", codeChallenge: "challenge", usedAt: null, expiresAt: new Date(at.getTime() + 60_000) };
  const service = {
    register: async (input: any) => { calls.push(["register", input]); return client; },
    authorize: async (input: any) => { calls.push(["authorize", input]); return "https://app.test/clubpm/connect?req=id"; },
    exchangeCode: async (input: any) => { calls.push(["code", input]); return { access_token: "access", token_type: "Bearer" }; },
    exchangeRefresh: async (input: any) => { calls.push(["refresh", input]); return { access_token: "refresh", token_type: "Bearer" }; },
    revoke: async (input: any) => { calls.push(["revoke", input]); }, verifyAccessToken: async () => ({ clientId: "client" }),
  } as unknown as OAuthService;
  const db = { oAuthClient: { findUnique: async () => ({ clientId: "client", name: "Claude", redirectUris: client.redirect_uris, createdAt: at }) },
    oAuthAuthCode: { findUnique: async ({ where }: any) => { assert.equal(where.hash, hashOpaqueToken("code")); return code; } } } as unknown as OAuthDb;
  const provider = createOAuthProvider({ service, db, now: () => at });
  assert.equal((await provider.clientsStore.getClient("client"))?.token_endpoint_auth_method, "none");
  await provider.clientsStore.registerClient!({ redirect_uris: client.redirect_uris });
  let redirect = ""; await provider.authorize(client, { codeChallenge: "challenge", redirectUri: client.redirect_uris[0], scopes: ["constellation.read"], resource: new URL(resource) }, { redirect: (_status: number, url: string) => { redirect = url; } } as any);
  assert.match(redirect, /connect\?req=/); assert.equal(calls[1][1].code_challenge_method, "S256");
  assert.equal(await provider.challengeForAuthorizationCode(client, "code"), "challenge");
  code = { ...code, clientId: "other" }; await bad(provider.challengeForAuthorizationCode(client, "code"), 400);
  code = { ...code, clientId: "client", expiresAt: at }; await bad(provider.challengeForAuthorizationCode(client, "code"), 400);
  await provider.exchangeAuthorizationCode(client, "code", "verifier", client.redirect_uris[0], new URL(resource));
  await provider.exchangeRefreshToken(client, "refresh", ["constellation.read"], new URL(resource));
  await provider.revokeToken!(client, { token: "access" });
  assert.deepEqual(calls.slice(-3).map(c => c[0]), ["code", "refresh", "revoke"]);
});

const w = world();
const app = express(); app.use(express.json({ limit: "1mb" }));
const server = createServer(app); server.listen(0, "127.0.0.1"); await once(server, "listening");
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/mcp`;
app.use("/mcp", createMcpRouter({ ...w.deps, issuer, allowedHosts: [new URL(base).host], registerTools(server, context) {
  server.registerTool("identity_probe", { inputSchema: {}, annotations: { readOnlyHint: true } }, async () => {
    const access = await context.resolve(); return { content: [{ type: "text", text: JSON.stringify({ memberId: access.member.id, projectIds: access.projectIds }) }] };
  });
} }));
const headers = (token: string | undefined = tokenA) => ({ Accept: "application/json, text/event-stream", "Content-Type": "application/json", "MCP-Protocol-Version": "2025-11-25", ...(token ? { Authorization: `Bearer ${token}` } : {}) });
const rpc = (method: string, params = {}, token = tokenA) => fetch(base, { method: "POST", headers: headers(token), body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
try {
  await test("MCP rejects missing credentials, cookies, URL tokens, HMACs and unknown opaque credentials", async () => {
    for (const h of [{ Cookie: "connect.sid=valid" }, { Authorization: "Bearer web.payload.signature" }, { Authorization: `Bearer ${"C".repeat(43)}` }]) {
      const response = await fetch(base + "?token=" + tokenA, { headers: { ...headers(""), ...h } });
      assert.equal(response.status, 401); assert.match(response.headers.get("www-authenticate")!, /^Bearer resource_metadata="https:\/\/api.example.test\/\.well-known\/oauth-protected-resource\/mcp"$/);
    }
  });
  await test("MCP checks configured Host and Origin before creating a transport", async () => {
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const req = httpRequest(base, { headers: { ...headers(), Host: "evil.test" } }, res => { res.resume(); res.on("end", () => resolve(res.statusCode)); });
      req.on("error", reject); req.end();
    });
    assert.equal(status, 403);
    assert.equal((await fetch(base, { headers: { ...headers(), Origin: "https://evil.test" } })).status, 403);
    assert.equal((await fetch(base, { headers: { ...headers(), Origin: "https://claude.ai" } })).status, 405);
  });
  await test("authenticated GET, DELETE and PUT are 405 and content types/batches/oversize are bounded", async () => {
    for (const method of ["GET", "DELETE", "PUT"]) assert.equal((await fetch(base, { method, headers: headers() })).status, 405);
    assert.equal((await fetch(base, { method: "POST", headers: { ...headers(), "Content-Type": "text/plain" }, body: "{}" })).status, 415);
    assert.equal((await fetch(base, { method: "POST", headers: headers(), body: "[]" })).status, 400);
    assert.equal((await fetch(base, { method: "POST", headers: headers(), body: JSON.stringify({ value: "x".repeat(256 * 1024) }) })).status, 413);
  });
  await test("SDK stateless initialize, notification, tools/list and call complete without a session", async () => {
    const init = await rpc("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "offline-test", version: "1" } });
    assert.equal(init.status, 200); assert.equal(init.headers.get("mcp-session-id"), null); assert.equal((await init.json()).result.serverInfo.name, "constellation");
    const notice = await fetch(base, { method: "POST", headers: headers(), body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) });
    assert.equal(notice.status, 202);
    const list = await (await rpc("tools/list")).json(); assert.ok(list.result.tools.some((tool: any) => tool.name === "connection_status" && tool.annotations.readOnlyHint));
    const result = await (await rpc("tools/call", { name: "connection_status", arguments: {} })).json();
    assert.equal(result.result.content[0].text, "Constellation connection is active."); assert.equal(result.result.isError, undefined);
  });
  await test("separate stateless requests cannot retain another grant's identity", async () => {
    const a = await (await rpc("tools/call", { name: "identity_probe", arguments: {} }, tokenA)).json();
    const b = await (await rpc("tools/call", { name: "identity_probe", arguments: {} }, tokenB)).json();
    assert.equal(JSON.parse(a.result.content[0].text).memberId, "a"); assert.equal(JSON.parse(b.result.content[0].text).memberId, "b");
  });
  await test("tools/call rechecks revocation after HTTP auth and returns no protected data", async () => {
    w.revokeOnNextAuth();
    const result = await (await rpc("tools/call", { name: "identity_probe", arguments: {} })).json();
    assert.equal(result.result.isError, true); assert.ok(!JSON.stringify(result).includes('"memberId"'));
    assert.equal((await rpc("tools/list")).status, 401);
  });
  console.log(`MCP transport/context/provider: ${passed} passed, 0 failed`);
} finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
