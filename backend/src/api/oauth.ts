import { Router, type Request, type Response, type RequestHandler } from "express";
import { verifyBearerToken } from "./auth.js";
import { OAuthError } from "../services/oauthCore.js";
import { oauthService, type OAuthService } from "../services/oauthService.js";

function input(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new OAuthError("invalid_request", "An object request is required");
  return value as Record<string, unknown>;
}
function limiter() {
  const buckets = new Map<string, { count: number; until: number }>();
  return (name: string, max: number): RequestHandler => (req, res, next) => {
    const at = Date.now(), key = `${name}:${req.ip || req.socket.remoteAddress || "unknown"}`;
    let bucket = buckets.get(key);
    if (!bucket || bucket.until <= at) {
      if (buckets.size >= 10_000) for (const [id, value] of buckets) if (value.until <= at) buckets.delete(id);
      if (!bucket && buckets.size >= 10_000) { res.status(429).json({ error: "temporarily_unavailable" }); return; }
      bucket = { count: 0, until: at + 10 * 60_000 }; buckets.set(key, bucket);
    }
    if (++bucket.count > max) { res.setHeader("Retry-After", String(Math.ceil((bucket.until - at) / 1000))); res.status(429).json({ error: "temporarily_unavailable" }); return; }
    next();
  };
}

export function createOAuthRouters(deps: { service?: OAuthService; verifyLoginBearer?: (token: string) => Promise<string | null> } = {}) {
  const service = deps.service ?? oauthService;
  const verifyLoginBearer = deps.verifyLoginBearer ?? verifyBearerToken;
  const oauthRouter = Router(), oauthMetadataRouter = Router();
  const limit = limiter();
  const noStore: RequestHandler = (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); res.setHeader("Pragma", "no-cache"); next(); };
  oauthRouter.use(noStore);
  oauthMetadataRouter.use(noStore);
  const route = (run: (req: Request, res: Response) => Promise<unknown>): RequestHandler => (req, res) => {
    void run(req, res).catch((error: unknown) => {
      if (res.headersSent) return;
      if (error instanceof OAuthError) res.status(error.status).json({ error: error.code, error_description: error.message });
      else res.status(503).json({ error: "temporarily_unavailable", error_description: "Authorization service unavailable" });
    });
  };
  // Cookie authentication cannot authorize consent: cross-site cookies are SameSite=None.
  const member = async (req: Request) => {
    const header = req.headers.authorization;
    if (!header || !/^Bearer [^\s]+$/i.test(header)) throw new OAuthError("invalid_token", "A valid Constellation login Bearer token is required", 401);
    const memberId = await verifyLoginBearer(header.slice(7));
    if (!memberId) throw new OAuthError("invalid_token", "A valid Constellation login Bearer token is required", 401);
    req.memberId = memberId;
    return memberId;
  };
  oauthMetadataRouter.get("/oauth-authorization-server", (_req, res) => { res.json(service.metadata()); });
  oauthMetadataRouter.get(["/oauth-protected-resource", "/oauth-protected-resource/mcp"], (_req, res) => { res.json(service.resourceMetadata()); });
  oauthRouter.post("/register", limit("register", 30), route(async (req, res) => res.status(201).json(await service.register(input(req.body)))));
  oauthRouter.get("/authorize", limit("authorize", 100), route(async (req, res) => res.redirect(302, await service.authorize(input(req.query)))));
  oauthRouter.get("/pending/:id", limit("pending", 100), route(async (req, res) => res.json(await service.getPending(req.params.id, await member(req)))));
  oauthRouter.post("/consent", limit("consent", 50), route(async (req, res) => res.json(await service.consent(await member(req), input(req.body)))));
  oauthRouter.post("/token", limit("token", 120), route(async (req, res) => {
    const body = input(req.body);
    if (req.headers.authorization || body.client_secret !== undefined || body.client_assertion !== undefined) throw new OAuthError("invalid_client", "Only public PKCE clients are supported");
    if (body.grant_type === "authorization_code") res.json(await service.exchangeCode(body));
    else if (body.grant_type === "refresh_token") res.json(await service.exchangeRefresh(body));
    else throw new OAuthError("unsupported_grant_type", "Unsupported grant type");
  }));
  oauthRouter.post("/revoke", limit("revoke", 120), route(async (req, res) => {
    const body = input(req.body);
    if (req.headers.authorization || body.client_secret !== undefined || body.client_assertion !== undefined) throw new OAuthError("invalid_client", "Only public clients are supported");
    await service.revoke(body); res.status(200).json({});
  }));
  return { oauthRouter, oauthMetadataRouter };
}

export const { oauthRouter, oauthMetadataRouter } = createOAuthRouters();
