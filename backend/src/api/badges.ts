// Public Open Badges 3.0 endpoints (/api/public/badges). GET only, no auth, small caches. Mounted above
// publicRouter and every bare /api router so no member requireAuth runs first. Unknown ids are a plain 404
// that says nothing about whether a member exists. Responses never carry email, name, member id or the
// member's private revoke reason.
//   GET /issuer             issuer Profile (OB 3.0 §B.1.14)
//   GET /jwks.json          { keys: [public Ed25519 JWK] } — never `d`; empty while BADGE_SIGNING_JWK is unset
//   GET /achievements/:id   Achievement (§B.1.1)
//   GET /:id                { id, jwt, credential, verified, verifyError, revoked, issuedAt, revokedAt, issuer, achievement, value, resultText }
//   GET /:id/status         { revoked, revokedAt }
// Static paths are registered above /:id.

import { Router, type Request, type RequestHandler, type Response } from "express";
import { createBadgeService, getDefaultBadgeStore, type BadgeService, type BadgeStore } from "../services/badgeService.js";

export interface PublicBadgesRouterOptions {
  store?: BadgeStore;
  now?: () => number;
  /** Fixed key JSON (tests) or null for unset; default reads BADGE_SIGNING_JWK. */
  signingJwk?: string | null;
  apiUrl?: string;
  frontendUrl?: string;
}

const ID = /^[A-Za-z0-9_-]{6,64}$/;
const NOT_FOUND = { error: "Badge not found" };

export function createPublicBadgesRouter(opts: PublicBadgesRouterOptions = {}): Router {
  const router = Router();
  let svc: BadgeService | null = null;
  const service = async (): Promise<BadgeService> => (svc ??= createBadgeService({
    store: opts.store ?? await getDefaultBadgeStore(),
    now: opts.now,
    signingJwk: opts.signingJwk !== undefined ? () => opts.signingJwk ?? null : undefined,
    apiUrl: opts.apiUrl !== undefined ? () => opts.apiUrl! : undefined,
    siteUrl: opts.frontendUrl !== undefined ? () => opts.frontendUrl! : undefined,
  }));
  const fail = (res: Response, err: unknown) => {
    console.error("[badges] request failed:", err instanceof Error ? err.name : "error");
    if (!res.headersSent) res.status(500).json({ error: "Something went wrong" });
  };
  const wrap = (maxAge: number, fn: (req: Request, res: Response, s: BadgeService) => Promise<unknown>): RequestHandler =>
    (req, res) => {
      service().then(async s => {
        const body = await fn(req, res, s);
        if (body === null) { res.status(404).json(NOT_FOUND); return; }
        res.setHeader("Cache-Control", `public, max-age=${maxAge}`);
        res.json(body);
      }).catch(e => fail(res, e));
    };
  const validId: RequestHandler = (req, res, next) => {
    if (!ID.test(String(req.params.id))) { res.status(404).json(NOT_FOUND); return; }
    next();
  };

  router.get("/issuer", wrap(300, async (_req, _res, s) => s.publicIssuer()));
  router.get("/jwks.json", wrap(300, async (_req, _res, s) => s.jwks()));
  router.get("/achievements/:id", validId, wrap(300, async (req, _res, s) => s.publicAchievement(String(req.params.id))));
  router.get("/:id/status", validId, wrap(60, async (req, _res, s) => s.status(String(req.params.id))));
  router.get("/:id", validId, wrap(60, async (req, _res, s) => s.publicAward(String(req.params.id))));

  return router;
}

export const publicBadgesRouter = createPublicBadgesRouter();
