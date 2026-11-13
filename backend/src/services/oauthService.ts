import { prisma } from "../db/prisma.js";
import {
  OAuthError, OAUTH_SCOPES, DEFAULT_ALLOWED_REDIRECT_URIS, OAUTH_TTL_MS,
  assertAllowedRedirectUri, validatePkceChallenge, verifyPkceS256, parseScopes, validateScopes,
  generateOpaqueToken, hashOpaqueToken, expiresAt, isExpired,
} from "./oauthCore.js";

/** Any member may grant every other scope; their own permissions still apply to each call. */
const ADMIN_ONLY_SCOPES: ReadonlySet<string> = new Set(["constellation.plan.delete"]);

export type OAuthDb = Pick<typeof prisma, "member" | "project" | "oAuthClient" | "oAuthPendingRequest" | "oAuthAuthCode" | "oAuthGrant" | "oAuthToken" | "$transaction">;
type Store = Omit<OAuthDb, "$transaction">;
export interface OAuthConfig { issuer: string; resource: string; frontendOrigin: string; allowedRedirectUris: string[] }

export function oauthConfig(env: NodeJS.ProcessEnv = process.env): OAuthConfig {
  const issuer = env.MCP_ISSUER || "https://api.purduesearch.org";
  if (env.NODE_ENV === "production" && !env.FRONTEND_URL) throw new Error("FRONTEND_URL is required for production connector consent");
  const frontend = env.FRONTEND_URL || "http://localhost:3000";
  const origin = (value: string, https: boolean): string => {
    let url: URL;
    try { url = new URL(value); } catch { throw new Error("Invalid connector origin configuration"); }
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/"
      || (url.protocol !== "https:" && !( !https && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) {
      throw new Error("Connector origins must be single HTTPS origins (local frontend development may use HTTP)");
    }
    return url.origin;
  };
  const issuerOrigin = origin(issuer, true);
  const allowedRedirectUris = env.MCP_ALLOWED_REDIRECT_URIS === undefined
    ? [...DEFAULT_ALLOWED_REDIRECT_URIS] : env.MCP_ALLOWED_REDIRECT_URIS.split(",").map(s => s.trim());
  if (!allowedRedirectUris.length || allowedRedirectUris.some(uri => {
    try { assertAllowedRedirectUri(uri, allowedRedirectUris); return false; } catch { return true; }
  })) throw new Error("MCP_ALLOWED_REDIRECT_URIS must contain exact HTTPS callback URLs");
  return { issuer: issuerOrigin, resource: `${issuerOrigin}/mcp`, frontendOrigin: origin(frontend, env.NODE_ENV === "production"), allowedRedirectUris };
}

export function oauthString(value: unknown, label: string, max = 2048): string {
  if (typeof value !== "string" || !value.length || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new OAuthError("invalid_request", `Invalid ${label}`);
  }
  return value;
}
function stringArray(value: unknown, label: string, max: number): string[] {
  if (!Array.isArray(value) || value.length > max || value.some(v => typeof v !== "string" || !v.length || v.length > 200)
    || new Set(value).size !== value.length) throw new OAuthError("invalid_request", `Invalid ${label}`);
  return value;
}
function credential(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value)) throw new OAuthError("invalid_grant", "Credential unavailable");
  return value;
}
function invalidGrant(): OAuthError { return new OAuthError("invalid_grant", "Credential unavailable"); }

export async function getActiveMember(db: Pick<Store, "member">, memberId: string) {
  const member = await db.member.findUnique({ where: { id: memberId }, select: { id: true, isAdmin: true, isBot: true, deactivatedAt: true } });
  if (!member || member.isBot || member.deactivatedAt) throw new OAuthError("access_denied", "Member access is unavailable", 403);
  return member;
}

/** Current membership narrows every consent/tool call; a grant never establishes project access itself. */
export async function listAccessibleProjects(db: Pick<Store, "member" | "project">, memberId: string) {
  const member = await getActiveMember(db, memberId);
  return db.project.findMany({
    where: { trainingForMemberId: null, ...(member.isAdmin ? {} : { members: { some: { memberId } } }) },
    select: { id: true, name: true, status: true, members: { where: { memberId }, select: { isLead: true } } },
    orderBy: { name: "asc" },
  });
}

export function createOAuthService(deps: { db?: OAuthDb; config?: OAuthConfig; now?: () => Date; token?: () => string } = {}) {
  const db = deps.db ?? prisma;
  const config = deps.config ?? oauthConfig();
  const now = deps.now ?? (() => new Date());
  const token = deps.token ?? generateOpaqueToken;
  function checkResource(value: unknown) {
    if (value !== undefined && value !== config.resource) throw new OAuthError("invalid_target", "Resource must identify this MCP server");
  }
  async function client(clientId: unknown, store: Store = db) {
    const found = await store.oAuthClient.findUnique({ where: { clientId: oauthString(clientId, "client_id", 200) } });
    if (!found) throw new OAuthError("invalid_client", "Client unavailable");
    return found;
  }
  async function revokeGrant(store: Store, grantId: string, at: Date) {
    await store.oAuthGrant.updateMany({ where: { id: grantId, revokedAt: null }, data: { revokedAt: at } });
    await store.oAuthToken.updateMany({ where: { grantId, revokedAt: null }, data: { revokedAt: at } });
  }
  async function issueTokens(store: Store, grantId: string, scopes: string[], at: Date) {
    const access = token(), refresh = token();
    await store.oAuthToken.createMany({ data: [
      { hash: hashOpaqueToken(access), grantId, kind: "ACCESS", expiresAt: expiresAt("access", at) },
      { hash: hashOpaqueToken(refresh), grantId, kind: "REFRESH", expiresAt: expiresAt("refresh", at) },
    ] });
    return { access_token: access, token_type: "Bearer" as const, expires_in: OAUTH_TTL_MS.access / 1000, refresh_token: refresh, scope: scopes.join(" ") };
  }
  async function pending(id: unknown, memberId: string, store: Store = db) {
    const request = await store.oAuthPendingRequest.findUnique({ where: { id: oauthString(id, "pending request", 200) }, include: { client: true } });
    if (!request || isExpired(request.expiresAt, now()) || (request.memberId && request.memberId !== memberId)) {
      throw new OAuthError("invalid_request", "Authorization request unavailable");
    }
    assertAllowedRedirectUri(request.redirectUri, config.allowedRedirectUris);
    if (!request.client.redirectUris.includes(request.redirectUri)) throw new OAuthError("invalid_request", "Authorization request unavailable");
    return request;
  }
  return {
    config,
    metadata() {
      return {
        issuer: config.issuer, authorization_endpoint: `${config.issuer}/oauth/authorize`, token_endpoint: `${config.issuer}/oauth/token`,
        registration_endpoint: `${config.issuer}/oauth/register`, revocation_endpoint: `${config.issuer}/oauth/revoke`,
        response_types_supported: ["code"], grant_types_supported: ["authorization_code", "refresh_token"],
        token_endpoint_auth_methods_supported: ["none"], revocation_endpoint_auth_methods_supported: ["none"],
        code_challenge_methods_supported: ["S256"], scopes_supported: [...OAUTH_SCOPES],
      };
    },
    resourceMetadata() { return { resource: config.resource, authorization_servers: [config.issuer], scopes_supported: [...OAUTH_SCOPES], bearer_methods_supported: ["header"], resource_name: "Constellation" }; },
    async register(input: Record<string, unknown>) {
      const name = oauthString(input.client_name, "client_name", 100);
      if (input.token_endpoint_auth_method !== undefined && input.token_endpoint_auth_method !== "none") throw new OAuthError("invalid_client_metadata", "Only public PKCE clients are supported");
      const redirectUris = stringArray(input.redirect_uris, "redirect_uris", 10);
      if (!redirectUris.length) throw new OAuthError("invalid_redirect_uri", "At least one callback is required");
      for (const uri of redirectUris) assertAllowedRedirectUri(uri, config.allowedRedirectUris);
      if (input.grant_types !== undefined) {
        const grants = stringArray(input.grant_types, "grant_types", 2);
        if (!grants.includes("authorization_code") || grants.some(s => !["authorization_code", "refresh_token"].includes(s))) throw new OAuthError("invalid_client_metadata", "Unsupported grant type");
      }
      if (input.response_types !== undefined && JSON.stringify(input.response_types) !== '["code"]') throw new OAuthError("invalid_client_metadata", "Only code responses are supported");
      if (input.scope !== undefined) parseScopes(input.scope);
      const row = await db.oAuthClient.create({ data: { name, redirectUris } });
      return { client_id: row.clientId, client_name: row.name, redirect_uris: row.redirectUris, token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], client_id_issued_at: Math.floor(row.createdAt.getTime() / 1000) };
    },
    async authorize(input: Record<string, unknown>) {
      const registered = await client(input.client_id);
      const redirectUri = assertAllowedRedirectUri(input.redirect_uri, config.allowedRedirectUris);
      if (!registered.redirectUris.includes(redirectUri)) throw new OAuthError("invalid_redirect_uri", "Callback is not registered for this client");
      if (input.response_type !== "code") throw new OAuthError("unsupported_response_type", "Only code responses are supported");
      if (input.code_challenge_method !== "S256") throw new OAuthError("invalid_request", "PKCE S256 is required");
      const codeChallenge = validatePkceChallenge(input.code_challenge, input.code_challenge_method);
      const scopes = parseScopes(input.scope);
      const state = input.state === undefined ? null : oauthString(input.state, "state", 2048);
      checkResource(input.resource);
      const request = await db.oAuthPendingRequest.create({ data: { clientId: registered.clientId, redirectUri, scopes, codeChallenge, state, expiresAt: expiresAt("pending", now()) } });
      const url = new URL("/clubpm/connect", config.frontendOrigin);
      url.searchParams.set("req", request.id);
      return url.toString();
    },
    async getPending(id: unknown, memberId: string) {
      const member = await getActiveMember(db, memberId);
      const request = await pending(id, memberId);
      const projects = await listAccessibleProjects(db, memberId);
      return { id: request.id, client: { name: request.client.name }, requestedScopes: request.scopes,
        scopes: request.scopes.filter(scope => member.isAdmin || !ADMIN_ONLY_SCOPES.has(scope)),
        projects: projects.map(p => ({ id: p.id, name: p.name, status: p.status, isLead: p.members.some(m => m.isLead) })),
        member: { id: member.id, isAdmin: member.isAdmin }, expiresAt: request.expiresAt.toISOString() };
    },
    async consent(memberId: string, input: Record<string, unknown>) {
      if (typeof input.approve !== "boolean") throw new OAuthError("invalid_request", "Consent requires an explicit decision");
      return db.$transaction(async tx => {
        const member = await getActiveMember(tx, memberId);
        const request = await pending(input.pendingId, memberId, tx);
        const at = now();
        const callback = new URL(request.redirectUri);
        if (request.state !== null) callback.searchParams.set("state", request.state);
        let scopes: string[] = [], projectIds: string[] = [];
        if (input.approve) {
          scopes = validateScopes(stringArray(input.scopes, "scopes", OAUTH_SCOPES.length));
          if (scopes.some(s => !request.scopes.includes(s))) throw new OAuthError("invalid_scope", "Consent cannot add unrequested permissions");
          if (!member.isAdmin && scopes.some(s => ADMIN_ONLY_SCOPES.has(s))) throw new OAuthError("access_denied", "Deleting tasks requires an administrator", 403);
          projectIds = stringArray(input.projectIds, "projectIds", 100);
          const accessible = new Set((await listAccessibleProjects(tx, memberId)).map(p => p.id));
          if (projectIds.some(id => !accessible.has(id))) throw new OAuthError("access_denied", "A selected project is unavailable", 403);
        }
        // Exactly one concurrent consent can consume this request. Failed inserts roll back this claim.
        const claim = await tx.oAuthPendingRequest.deleteMany({ where: { id: request.id, expiresAt: { gt: at }, OR: [{ memberId: null }, { memberId }] } });
        if (claim.count !== 1) throw new OAuthError("invalid_request", "Authorization request unavailable");
        if (!input.approve) callback.searchParams.set("error", "access_denied");
        else {
          const code = token();
          await tx.oAuthAuthCode.create({ data: { hash: hashOpaqueToken(code), clientId: request.clientId, memberId, scopes, projectIds,
            codeChallenge: request.codeChallenge, redirectUri: request.redirectUri, expiresAt: expiresAt("code", at) } });
          callback.searchParams.set("code", code);
        }
        return { redirectUrl: callback.toString() };
      });
    },
    async exchangeCode(input: Record<string, unknown>) {
      checkResource(input.resource);
      const registered = await client(input.client_id);
      const code = credential(input.code);
      const redirectUri = assertAllowedRedirectUri(input.redirect_uri, config.allowedRedirectUris);
      if (!registered.redirectUris.includes(redirectUri)) throw invalidGrant();
      return db.$transaction(async tx => {
        const row = await tx.oAuthAuthCode.findUnique({ where: { hash: hashOpaqueToken(code) } });
        const at = now();
        if (!row || row.clientId !== registered.clientId || row.redirectUri !== redirectUri || row.usedAt || isExpired(row.expiresAt, at)
          || !verifyPkceS256(input.code_verifier, row.codeChallenge)) throw invalidGrant();
        await getActiveMember(tx, row.memberId);
        const claim = await tx.oAuthAuthCode.updateMany({ where: { hash: row.hash, clientId: registered.clientId, usedAt: null, expiresAt: { gt: at } }, data: { usedAt: at } });
        if (claim.count !== 1) throw invalidGrant();
        const grant = await tx.oAuthGrant.create({ data: { clientId: row.clientId, memberId: row.memberId, scopes: row.scopes, projectIds: row.projectIds } });
        return issueTokens(tx, grant.id, row.scopes, at);
      });
    },
    async exchangeRefresh(input: Record<string, unknown>) {
      checkResource(input.resource);
      const registered = await client(input.client_id);
      const refresh = credential(input.refresh_token);
      const requested = input.scope === undefined ? undefined : parseScopes(input.scope);
      const result = await db.$transaction(async tx => {
        const row = await tx.oAuthToken.findUnique({ where: { hash: hashOpaqueToken(refresh) }, include: { grant: true } });
        const at = now();
        if (!row || row.kind !== "REFRESH" || row.grant.clientId !== registered.clientId || row.grant.revokedAt || isExpired(row.expiresAt, at)) return null;
        await getActiveMember(tx, row.grant.memberId);
        if (row.revokedAt) { await revokeGrant(tx, row.grantId, at); return null; }
        const scopes = requested ?? row.grant.scopes;
        if (scopes.some(scope => !row.grant.scopes.includes(scope))) throw new OAuthError("invalid_scope", "Refresh cannot increase permissions");
        const claim = await tx.oAuthToken.updateMany({ where: { hash: row.hash, revokedAt: null, expiresAt: { gt: at } }, data: { revokedAt: at } });
        if (claim.count !== 1) { await revokeGrant(tx, row.grantId, at); return null; }
        // Scope reduction applies to the grant so earlier access tokens cannot retain broader rights.
        const grantClaim = await tx.oAuthGrant.updateMany({ where: { id: row.grantId, revokedAt: null }, data: { scopes } });
        if (grantClaim.count !== 1) return null;
        return issueTokens(tx, row.grantId, scopes, at);
      });
      if (!result) throw invalidGrant();
      return result;
    },
    /** Profile → Connected apps. Project names come only from projects the member can still open; `projects` feeds the edit picker. */
    async listGrants(memberId: string) {
      await getActiveMember(db, memberId);
      const [grants, projects] = await Promise.all([
        db.oAuthGrant.findMany({ where: { memberId, revokedAt: null }, include: { client: true }, orderBy: { createdAt: "desc" } }),
        listAccessibleProjects(db, memberId),
      ]);
      const names = new Map(projects.map(p => [p.id, p.name]));
      const available = projects.map(p => ({ id: p.id, name: p.name, isLead: p.members.some(m => m.isLead) }));
      return { projects: available, grants: grants.map(g => ({
        id: g.id, clientName: g.client.name, scopes: g.scopes, createdAt: g.createdAt.toISOString(),
        lastUsedAt: g.lastUsedAt?.toISOString() ?? null,
        projects: g.projectIds.filter(id => names.has(id)).map(id => ({ id, name: names.get(id)! })),
        unavailableProjectCount: g.projectIds.filter(id => !names.has(id)).length,
      })) };
    },
    async revokeMemberGrant(memberId: string, grantId: unknown) {
      const id = oauthString(grantId, "grant", 200);
      await db.$transaction(async tx => {
        const grant = await tx.oAuthGrant.findUnique({ where: { id } });
        if (!grant || grant.memberId !== memberId || grant.revokedAt) throw new OAuthError("not_found", "Connection unavailable", 404);
        await revokeGrant(tx, id, now());
      });
    },
    /** The member picks again from projects they can open now; scopes never change here. */
    async updateGrantProjects(memberId: string, grantId: unknown, input: Record<string, unknown>) {
      const id = oauthString(grantId, "grant", 200);
      const projectIds = stringArray(input.projectIds, "projectIds", 100);
      const accessible = new Set((await listAccessibleProjects(db, memberId)).map(p => p.id));
      if (projectIds.some(p => !accessible.has(p))) throw new OAuthError("access_denied", "A selected project is unavailable", 403);
      const updated = await db.oAuthGrant.updateMany({ where: { id, memberId, revokedAt: null }, data: { projectIds } });
      if (updated.count !== 1) throw new OAuthError("not_found", "Connection unavailable", 404);
    },
    async revoke(input: Record<string, unknown>) {
      const registered = await client(input.client_id);
      const raw = oauthString(input.token, "token", 2048);
      await db.$transaction(async tx => {
        const row = await tx.oAuthToken.findUnique({ where: { hash: hashOpaqueToken(raw) }, include: { grant: true } });
        if (row?.grant.clientId === registered.clientId) await revokeGrant(tx, row.grantId, now());
      });
    },
    async verifyAccessToken(raw: string) {
      let value: string;
      try { value = credential(raw); } catch { throw new OAuthError("invalid_token", "Token unavailable", 401); }
      const row = await db.oAuthToken.findUnique({ where: { hash: hashOpaqueToken(value) }, include: { grant: { include: { client: true } } } });
      const at = now();
      if (!row || row.kind !== "ACCESS" || row.revokedAt || isExpired(row.expiresAt, at) || row.grant.revokedAt) throw new OAuthError("invalid_token", "Token unavailable", 401);
      let member: Awaited<ReturnType<typeof getActiveMember>>;
      try { member = await getActiveMember(db, row.grant.memberId); }
      catch (error) {
        if (error instanceof OAuthError) throw new OAuthError("invalid_token", "Token unavailable", 401);
        throw error;
      }
      const live = await db.oAuthGrant.updateMany({ where: { id: row.grantId, revokedAt: null }, data: { lastUsedAt: at } });
      if (live.count !== 1) throw new OAuthError("invalid_token", "Token unavailable", 401);
      return { token: raw, clientId: row.grant.clientId, scopes: row.grant.scopes, expiresAt: Math.floor(row.expiresAt.getTime() / 1000),
        resource: new URL(config.resource), extra: { grantId: row.grantId, memberId: member.id, clientName: row.grant.client.name }, grant: row.grant, member };
    },
  };
}

export type OAuthService = ReturnType<typeof createOAuthService>;
export const oauthService = createOAuthService();
