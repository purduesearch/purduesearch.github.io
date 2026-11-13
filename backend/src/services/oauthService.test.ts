import assert from "node:assert/strict";
import { createOAuthService, oauthConfig, listAccessibleProjects, type OAuthDb } from "./oauthService.js";
import { OAuthError, OAUTH_SCOPES, hashOpaqueToken } from "./oauthCore.js";

const callback = "https://claude.ai/api/mcp/auth_callback";
const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const config = oauthConfig({ MCP_ISSUER: "https://api.example.test", FRONTEND_URL: "https://app.example.test" });
let passed = 0;
async function test(name: string, run: () => unknown) { await run(); passed++; console.log(`PASS ${name}`); }
const rejects = (run: Promise<unknown>, code: string) => assert.rejects(run, (e: unknown) => e instanceof OAuthError && e.code === code);

function fixture() {
  let at = new Date("2026-11-13T12:00:00.000Z"), sequence = 0;
  let state: Record<string, any[]> = {
    member: [{ id: "member", isAdmin: false, isBot: false, deactivatedAt: null }, { id: "admin", isAdmin: true, isBot: false, deactivatedAt: null }],
    project: [{ id: "p1", name: "One", status: "ACTIVE", trainingForMemberId: null, members: [{ memberId: "member", isLead: true }] },
      { id: "p2", name: "Two", status: "ACTIVE", trainingForMemberId: null, members: [] },
      { id: "training", name: "Training", trainingForMemberId: "admin", members: [] }],
    oAuthClient: [], oAuthPendingRequest: [], oAuthAuthCode: [], oAuthGrant: [], oAuthToken: [],
  };
  const clone = <T>(v: T): T => structuredClone(v);
  const match = (row: any, where: any): boolean => Object.entries(where ?? {}).every(([key, v]: any) => {
    if (key === "OR") return v.some((w: any) => match(row, w));
    if (key === "members") return row.members.some((m: any) => match(m, v.some));
    if (v && typeof v === "object" && "gt" in v) return row[key] > v.gt;
    return row[key] === v;
  });
  const db: any = {};
  for (const model of Object.keys(state)) {
    const enrich = (row: any, args: any) => {
      if (!row) return null;
      const result = clone(row);
      if (model === "oAuthPendingRequest" && args.include?.client) result.client = clone(state.oAuthClient.find(c => c.clientId === row.clientId));
      if (model === "oAuthGrant" && args.include?.client) result.client = clone(state.oAuthClient.find(c => c.clientId === row.clientId));
      if (model === "oAuthToken" && args.include?.grant) {
        result.grant = clone(state.oAuthGrant.find(g => g.id === row.grantId));
        if (args.include.grant.include?.client) result.grant.client = clone(state.oAuthClient.find(c => c.clientId === result.grant.clientId));
      }
      return result;
    };
    db[model] = {
      findUnique: async (args: any) => enrich(state[model].find(r => match(r, args.where)), args),
      findMany: async (args: any) => state[model].filter(r => match(r, args.where)).map(r => enrich(r, args)),
      create: async ({ data }: any) => {
        const row = { id: `row${++sequence}`, createdAt: clone(at), revokedAt: null, usedAt: null, memberId: null, ...clone(data) };
        if (model === "oAuthClient") row.clientId = `client${sequence}`;
        state[model].push(row); return clone(row);
      },
      createMany: async ({ data }: any) => { for (const row of data) await db[model].create({ data: row }); return { count: data.length }; },
      updateMany: async ({ where, data }: any) => {
        const rows = state[model].filter(r => match(r, where));
        for (const row of rows) Object.assign(row, clone(data));
        return { count: rows.length };
      },
      deleteMany: async ({ where }: any) => {
        const rows = state[model].filter(r => match(r, where));
        state[model] = state[model].filter(r => !rows.includes(r)); return { count: rows.length };
      },
    };
  }
  let transaction = Promise.resolve();
  db.$transaction = (run: (tx: any) => Promise<any>) => {
    const result = transaction.then(async () => {
      const before = clone(state);
      try { return await run(db); } catch (error) { state = before; throw error; }
    });
    transaction = result.then(() => undefined, () => undefined); return result;
  };
  const service = createOAuthService({ db, config, now: () => clone(at) });
  async function register(name = "Claude") { return service.register({ client_name: name, redirect_uris: [callback] }); }
  async function request(clientId: string, scopes: string[] = ["constellation.read"]) {
    const url = await service.authorize({ client_id: clientId, redirect_uri: callback, response_type: "code", code_challenge_method: "S256", code_challenge: challenge, state: "opaque-state", scope: scopes.join(" "), resource: config.resource });
    return new URL(url).searchParams.get("req")!;
  }
  async function approved(memberId = "member", scopes: string[] = ["constellation.read"], projects = ["p1"]) {
    const registered = await register();
    const pendingId = await request(registered.client_id, scopes);
    const result = await service.consent(memberId, { pendingId, approve: true, scopes, projectIds: projects });
    return { clientId: registered.client_id, code: new URL(result.redirectUrl).searchParams.get("code")! };
  }
  const exchange = ({ clientId, code }: { clientId: string; code: string }, extra = {}) => service.exchangeCode({ client_id: clientId, code, redirect_uri: callback, code_verifier: verifier, resource: config.resource, ...extra });
  return { db: db as OAuthDb, service, register, request, approved, exchange, state: () => state, advance: (ms: number) => { at = new Date(at.getTime() + ms); } };
}

await test("configuration and metadata use fixed issuer and resource origins", () => {
  const f = fixture();
  assert.equal(f.service.metadata().token_endpoint, "https://api.example.test/oauth/token");
  assert.equal(f.service.resourceMetadata().resource, "https://api.example.test/mcp");
  for (const bad of ["http://api.example.test", "https://api.example.test/path", "https://api.example.test?x=1", "https://user@api.example.test"]) assert.throws(() => oauthConfig({ MCP_ISSUER: bad }));
  assert.throws(() => oauthConfig({ FRONTEND_URL: "https://app.example.test,https://other.test" }));
  assert.throws(() => oauthConfig({ NODE_ENV: "production" }));
  assert.throws(() => oauthConfig({ NODE_ENV: "production", FRONTEND_URL: "http://localhost:3000" }));
  assert.equal(oauthConfig({ NODE_ENV: "development", FRONTEND_URL: "http://localhost:3000" }).frontendOrigin, "http://localhost:3000");
});
await test("registration accepts only public code clients and exact allow-listed callbacks", async () => {
  const f = fixture();
  await rejects(f.service.register({ client_name: "Bad", redirect_uris: [callback + "/"] }), "invalid_redirect_uri");
  await rejects(f.service.register({ client_name: "Bad", redirect_uris: [callback], token_endpoint_auth_method: "client_secret_basic" }), "invalid_client_metadata");
  await rejects(f.service.register({ client_name: "Bad", redirect_uris: [callback], grant_types: ["password"] }), "invalid_client_metadata");
  assert.equal((await f.register()).token_endpoint_auth_method, "none");
});
await test("authorize rejects missing/plain PKCE, redirect mismatch, scopes, resource and parameter arrays", async () => {
  const f = fixture(), c = await f.register();
  const base = { client_id: c.client_id, redirect_uri: callback, response_type: "code", code_challenge_method: "S256", code_challenge: challenge };
  for (const method of [undefined, "plain"]) await rejects(f.service.authorize({ ...base, code_challenge_method: method }), "invalid_request");
  await rejects(f.service.authorize({ ...base, scope: "unknown" }), "invalid_scope");
  await rejects(f.service.authorize({ ...base, redirect_uri: callback + "?x=1" }), "invalid_redirect_uri");
  await rejects(f.service.authorize({ ...base, resource: "https://elsewhere.test/mcp" }), "invalid_target");
  await rejects(f.service.authorize({ ...base, client_id: [c.client_id, c.client_id] }), "invalid_request");
  assert.equal(f.state().oAuthPendingRequest.length, 0);
});
await test("picker filters current membership/training and does not expose PKCE or state", async () => {
  const f = fixture(), c = await f.register(), id = await f.request(c.client_id, [...OAUTH_SCOPES]);
  const result = await f.service.getPending(id, "member");
  assert.deepEqual(result.projects.map(p => p.id), ["p1"]);
  assert.deepEqual(result.scopes, ["constellation.read"]);
  assert.equal("codeChallenge" in result, false); assert.equal("state" in result, false);
  assert.deepEqual((await listAccessibleProjects(f.db, "admin")).map(p => p.id), ["p1", "p2"]);
});
await test("consent cannot add scopes, foreign projects, or non-admin project changes", async () => {
  const f = fixture(), c = await f.register(), pendingId = await f.request(c.client_id);
  await rejects(f.service.consent("member", { pendingId, approve: true, scopes: ["constellation.read"], projectIds: ["p2"] }), "access_denied");
  await rejects(f.service.consent("admin", { pendingId, approve: true, scopes: ["constellation.read", "constellation.plan"], projectIds: ["p1"] }), "invalid_scope");
  const planId = await f.request(c.client_id, [...OAUTH_SCOPES]);
  await rejects(f.service.consent("member", { pendingId: planId, approve: true, scopes: [...OAUTH_SCOPES], projectIds: ["p1"] }), "access_denied");
  assert.equal(f.state().oAuthAuthCode.length, 0);
});
await test("denial consumes request, preserves state and issues no code", async () => {
  const f = fixture(), c = await f.register(), pendingId = await f.request(c.client_id);
  const result = await f.service.consent("member", { pendingId, approve: false });
  const url = new URL(result.redirectUrl);
  assert.equal(url.searchParams.get("error"), "access_denied"); assert.equal(url.searchParams.get("state"), "opaque-state");
  assert.equal(f.state().oAuthAuthCode.length, 0);
  await rejects(f.service.consent("member", { pendingId, approve: false }), "invalid_request");
});
await test("expired or member-bound pending requests cannot be consented", async () => {
  const f = fixture(), c = await f.register(), pendingId = await f.request(c.client_id);
  f.state().oAuthPendingRequest[0].memberId = "admin";
  await rejects(f.service.getPending(pendingId, "member"), "invalid_request");
  f.advance(600_000);
  await rejects(f.service.consent("admin", { pendingId, approve: false }), "invalid_request");
});
await test("code exchange binds client, redirect and PKCE without consuming failed attempts", async () => {
  const f = fixture(), auth = await f.approved(), other = await f.register("Other");
  await rejects(f.exchange(auth, { client_id: other.client_id }), "invalid_grant");
  await rejects(f.exchange(auth, { code_verifier: "a".repeat(43) }), "invalid_grant");
  await rejects(f.exchange(auth, { redirect_uri: callback + "/" }), "invalid_redirect_uri");
  assert.equal(f.state().oAuthGrant.length, 0);
  const tokens = await f.exchange(auth);
  assert.equal(tokens.expires_in, 3600); assert.equal(tokens.scope, "constellation.read");
  assert.equal(f.state().oAuthAuthCode[0].hash, hashOpaqueToken(auth.code));
  assert.equal(JSON.stringify(f.state()).includes(tokens.access_token), false);
  assert.equal(JSON.stringify(f.state()).includes(tokens.refresh_token), false);
  await rejects(f.exchange(auth), "invalid_grant");
});
await test("concurrent code and consent claims permit only one winner", async () => {
  const f = fixture(), c = await f.register(), pendingId = await f.request(c.client_id);
  const calls = await Promise.allSettled([1, 2].map(() => f.service.consent("member", { pendingId, approve: true, scopes: ["constellation.read"], projectIds: ["p1"] })));
  assert.equal(calls.filter(r => r.status === "fulfilled").length, 1);
  const result = calls.find(r => r.status === "fulfilled") as PromiseFulfilledResult<{ redirectUrl: string }>;
  const auth = { clientId: c.client_id, code: new URL(result.value.redirectUrl).searchParams.get("code")! };
  const exchanges = await Promise.allSettled([f.exchange(auth), f.exchange(auth)]);
  assert.equal(exchanges.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(f.state().oAuthGrant.length, 1);
});
await test("expired code refuses exchange", async () => { const f = fixture(), auth = await f.approved(); f.advance(300_000); await rejects(f.exchange(auth), "invalid_grant"); });
await test("lost atomic claims cannot create grants or authorization codes", async () => {
  const f = fixture(), auth = await f.approved();
  (f.db.oAuthAuthCode as any).updateMany = async () => ({ count: 0 });
  await rejects(f.exchange(auth), "invalid_grant");
  assert.equal(f.state().oAuthGrant.length, 0);
  const pendingId = await f.request(auth.clientId);
  (f.db.oAuthPendingRequest as any).deleteMany = async () => ({ count: 0 });
  await rejects(f.service.consent("member", { pendingId, approve: true, scopes: ["constellation.read"], projectIds: ["p1"] }), "invalid_request");
  assert.equal(f.state().oAuthAuthCode.length, 1);
});
await test("refresh rotates and replay revokes every token in the grant", async () => {
  const f = fixture(), auth = await f.approved(), first = await f.exchange(auth);
  const second = await f.service.exchangeRefresh({ client_id: auth.clientId, refresh_token: first.refresh_token });
  assert.notEqual(second.refresh_token, first.refresh_token);
  assert.equal((await f.service.verifyAccessToken(second.access_token)).extra.memberId, "member");
  await rejects(f.service.exchangeRefresh({ client_id: auth.clientId, refresh_token: first.refresh_token }), "invalid_grant");
  await rejects(f.service.verifyAccessToken(second.access_token), "invalid_token");
  assert.ok(f.state().oAuthToken.every(t => t.revokedAt));
});
await test("refresh rejects another client and scope escalation without revoking rightful grant", async () => {
  const f = fixture(), auth = await f.approved(), tokens = await f.exchange(auth), other = await f.register("Other");
  await rejects(f.service.exchangeRefresh({ client_id: other.client_id, refresh_token: tokens.refresh_token }), "invalid_grant");
  await rejects(f.service.exchangeRefresh({ client_id: auth.clientId, refresh_token: tokens.refresh_token, scope: "constellation.read constellation.plan" }), "invalid_scope");
  assert.equal((await f.service.verifyAccessToken(tokens.access_token)).extra.memberId, "member");
});
await test("refresh scope reduction narrows the grant and existing access tokens", async () => {
  const f = fixture(), auth = await f.approved("admin", [...OAUTH_SCOPES]), tokens = await f.exchange(auth);
  await f.service.exchangeRefresh({ client_id: auth.clientId, refresh_token: tokens.refresh_token, scope: "constellation.read" });
  assert.deepEqual((await f.service.verifyAccessToken(tokens.access_token)).scopes, ["constellation.read"]);
});
await test("wrong-client revocation is idempotent and cannot revoke another client's grant", async () => {
  const f = fixture(), auth = await f.approved(), tokens = await f.exchange(auth), other = await f.register("Other");
  await f.service.revoke({ client_id: other.client_id, token: tokens.access_token });
  await f.service.verifyAccessToken(tokens.access_token);
  await f.service.revoke({ client_id: auth.clientId, token: tokens.refresh_token });
  await f.service.revoke({ client_id: auth.clientId, token: tokens.refresh_token });
  await rejects(f.service.verifyAccessToken(tokens.access_token), "invalid_token");
});
await test("deactivation rejects pending, code, refresh and access credentials", async () => {
  const f = fixture(), auth = await f.approved(), tokens = await f.exchange(auth), next = await f.approved();
  f.state().member[0].deactivatedAt = new Date();
  await rejects(f.exchange(next), "access_denied");
  await rejects(f.service.verifyAccessToken(tokens.access_token), "invalid_token");
  await rejects(f.service.exchangeRefresh({ client_id: auth.clientId, refresh_token: tokens.refresh_token }), "access_denied");
  assert.equal(f.state().oAuthGrant.length, 1);
});
await test("access expiry is inclusive; a refresh token is never accepted as access", async () => {
  const f = fixture(), auth = await f.approved(), tokens = await f.exchange(auth);
  await rejects(f.service.verifyAccessToken(tokens.refresh_token), "invalid_token");
  f.advance(3_600_000); await rejects(f.service.verifyAccessToken(tokens.access_token), "invalid_token");
});
await test("access verifier returns 401 invalid_token for malformed credentials or missing members", async () => {
  const f = fixture();
  for (const invalid of ["", "web.payload.signature", "a".repeat(42), "a".repeat(44)]) {
    await assert.rejects(f.service.verifyAccessToken(invalid), (e: unknown) => e instanceof OAuthError && e.code === "invalid_token" && e.status === 401);
  }
  const auth = await f.approved(), tokens = await f.exchange(auth);
  f.state().member = f.state().member.filter(m => m.id !== "member");
  await assert.rejects(f.service.verifyAccessToken(tokens.access_token), (e: unknown) => e instanceof OAuthError && e.code === "invalid_token" && e.status === 401);
});
await test("connected apps list, edit and revoke only the member's own grants", async () => {
  const f = fixture(), auth = await f.approved(), tokens = await f.exchange(auth);
  const grantId = f.state().oAuthGrant[0].id;
  const { grants: [listed], projects } = await f.service.listGrants("member");
  assert.deepEqual(projects, [{ id: "p1", name: "One", isLead: true }]);
  assert.equal(listed.clientName, "Claude");
  assert.deepEqual(listed.projects, [{ id: "p1", name: "One" }]);
  assert.equal("changeCursor" in listed, false);
  assert.deepEqual((await f.service.listGrants("admin")).grants, []);
  await rejects(f.service.updateGrantProjects("member", grantId, { projectIds: ["p2"] }), "access_denied");
  await rejects(f.service.updateGrantProjects("admin", grantId, { projectIds: [] }), "not_found");
  await f.service.updateGrantProjects("member", grantId, { projectIds: [] });
  assert.deepEqual(f.state().oAuthGrant[0].projectIds, []);
  await rejects(f.service.revokeMemberGrant("admin", grantId), "not_found");
  await f.service.verifyAccessToken(tokens.access_token);
  await f.service.revokeMemberGrant("member", grantId);
  await rejects(f.service.verifyAccessToken(tokens.access_token), "invalid_token");
  await rejects(f.service.exchangeRefresh({ client_id: auth.clientId, refresh_token: tokens.refresh_token }), "invalid_grant");
  assert.deepEqual((await f.service.listGrants("member")).grants, []);
});
console.log(`oauthService: ${passed} passed, 0 failed`);
