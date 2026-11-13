import type { RequestHandler } from "express";
import type { OAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import { prisma } from "../db/prisma.js";
import { OAuthError, hashOpaqueToken, isExpired } from "../services/oauthCore.js";
import { oauthService, type OAuthService, type OAuthDb } from "../services/oauthService.js";
import type { VerifiedAccess } from "./context.js";

export type AuthenticatedMcpRequest = Express.Request & { mcpToken?: string; mcpAccess?: VerifiedAccess };

/** SDK provider conformance, backed by the same service used by the custom OAuth HTTP routes. */
export function createOAuthProvider(deps: { service?: OAuthService; db?: OAuthDb; now?: () => Date } = {}): OAuthServerProvider {
  const service = deps.service ?? oauthService;
  const db = deps.db ?? prisma;
  return {
    clientsStore: {
      async getClient(clientId) {
        const row = await db.oAuthClient.findUnique({ where: { clientId } });
        if (!row) return undefined;
        return { client_id: row.clientId, client_name: row.name, redirect_uris: row.redirectUris,
          token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"],
          client_id_issued_at: Math.floor(row.createdAt.getTime() / 1000) };
      },
      async registerClient(client) {
        return service.register({ ...client, client_name: client.client_name ?? "Claude" }) as Promise<OAuthClientInformationFull>;
      },
    },
    async authorize(client, params, res) {
      const redirect = await service.authorize({ client_id: client.client_id, redirect_uri: params.redirectUri,
        response_type: "code", code_challenge_method: "S256", code_challenge: params.codeChallenge,
        scope: params.scopes?.join(" "), state: params.state, resource: params.resource?.href });
      res.redirect(302, redirect);
    },
    async challengeForAuthorizationCode(client, code) {
      const row = await db.oAuthAuthCode.findUnique({ where: { hash: hashOpaqueToken(code) } });
      if (!row || row.clientId !== client.client_id || row.usedAt || isExpired(row.expiresAt, (deps.now ?? (() => new Date()))())) {
        throw new OAuthError("invalid_grant", "Credential unavailable");
      }
      return row.codeChallenge;
    },
    exchangeAuthorizationCode: (client, code, verifier, redirectUri, resource) => service.exchangeCode({
      client_id: client.client_id, code, code_verifier: verifier, redirect_uri: redirectUri, resource: resource?.href,
    }),
    exchangeRefreshToken: (client, refreshToken, scopes, resource) => service.exchangeRefresh({
      client_id: client.client_id, refresh_token: refreshToken, scope: scopes?.join(" "), resource: resource?.href,
    }),
    verifyAccessToken: token => service.verifyAccessToken(token),
    revokeToken: (client, request) => service.revoke({ client_id: client.client_id, token: request.token }),
  };
}

export function mcpChallenge(issuer: string) {
  return `Bearer resource_metadata="${issuer}/.well-known/oauth-protected-resource/mcp"`;
}

/** Reject web HMACs and cookie-only requests before they reach MCP. */
export function createMcpBearerAuth(deps: { verifyAccessToken?: (token: string) => Promise<VerifiedAccess>; issuer?: string } = {}): RequestHandler {
  const verify = deps.verifyAccessToken ?? oauthService.verifyAccessToken;
  const challenge = mcpChallenge(deps.issuer ?? oauthService.config.issuer);
  return (req, res, next) => {
    const header = req.headers.authorization;
    if (!header || !/^Bearer [A-Za-z0-9_-]{43}$/i.test(header)) {
      res.setHeader("WWW-Authenticate", challenge); res.status(401).json({ error: "invalid_token" }); return;
    }
    const token = header.slice(7);
    void verify(token).then(access => {
      const request = req as typeof req & AuthenticatedMcpRequest;
      request.mcpToken = token; request.mcpAccess = access; next();
    }).catch((error: unknown) => {
      if (error instanceof OAuthError) { res.setHeader("WWW-Authenticate", challenge); res.status(401).json({ error: "invalid_token" }); }
      else res.status(503).json({ error: "temporarily_unavailable" });
    });
  };
}
