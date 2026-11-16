// requireSponsor: accepts ONLY a sponsor Bearer token (Authorization header). Member session cookies and member
// tokens are never consulted. The SponsorUser is re-read on every request, so disabling a user, deactivating or
// expiring the org, or bumping tokenVersion (logout) takes effect immediately. Every rejection is 401.

import type { NextFunction, Request, RequestHandler, Response } from "express";
import {
  NOT_CONFIGURED, createSponsorAuthService, defaultMailer, frontendBase, getDefaultSponsorStore, readSponsorSecret,
  type SponsorAuthService, type SponsorAuthStore, type SponsorUserRow,
} from "../services/sponsorAuthService.js";

declare module "express-serve-static-core" {
  interface Request {
    sponsorUserId?: string;
  }
}

export interface RequireSponsorOptions {
  store?: SponsorAuthStore;
  now?: () => number;
  secret?: () => string | null;
}

/** The authenticated sponsor row set by requireSponsor (fresh for this request). */
export function sponsorOf(res: Response): SponsorUserRow {
  return res.locals.sponsorUser as SponsorUserRow;
}

export function createRequireSponsor(opts: RequireSponsorOptions = {}): RequestHandler {
  // Always validated here, whatever the caller supplies: unset or short means 503.
  const secret = (): string | null => (opts.secret ? readSponsorSecret(opts.secret()) : readSponsorSecret());
  let svc: SponsorAuthService | null = null;
  const service = async () => (svc ??= createSponsorAuthService({
    store: opts.store ?? await getDefaultSponsorStore(),
    mailer: defaultMailer,
    now: opts.now ?? Date.now,
    secret,
    frontendUrl: () => frontendBase(),
  }));

  return (req: Request, res: Response, next: NextFunction) => {
    if (!secret()) { res.status(503).json({ error: NOT_CONFIGURED }); return; }
    const header = req.headers.authorization;
    if (typeof header !== "string" || !header.startsWith("Bearer ")) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    service()
      .then(s => s.authenticate(header.slice(7).trim()))
      .then(user => {
        if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
        req.sponsorUserId = user.id;
        res.locals.sponsorUser = user;
        next();
      })
      .catch(err => {
        console.error("[sponsor] auth check failed:", err instanceof Error ? err.name : "error");
        if (!res.headersSent) res.status(500).json({ error: "Something went wrong" });
      });
  };
}

export const requireSponsor = createRequireSponsor();
