// Sponsor portal API (/api/sponsor) — auth routes. Mounted above every bare /api router so no member
// auth middleware runs first; sponsor routes never read member identity (session or member id).
//   POST /login   { email }  always 202 (no account enumeration); lookup + send happen after the response.
//   POST /session { token }  single-use magic-link exchange → 7-day sponsor Bearer token.
//   GET  /me                 requireSponsor → sponsor summary.
//   POST /logout             requireSponsor → bumps tokenVersion (revokes every session).

import { Router, type Request, type RequestHandler, type Response } from "express";
import { createRequireSponsor, sponsorOf } from "../middleware/sponsorAuth.js";
import {
  NOT_CONFIGURED, createLoginRateLimiter, createSponsorAuthService, defaultMailer, frontendBase,
  getDefaultSponsorStore, normalizeEmail, readSponsorSecret, sponsorSummary,
  type SponsorAuthService, type SponsorAuthStore, type SponsorMailer,
} from "../services/sponsorAuthService.js";

export interface SponsorRouterOptions {
  store?: SponsorAuthStore;
  mailer?: SponsorMailer;
  now?: () => number;
  /** A fixed secret (tests) or null for "unset"; default reads SPONSOR_TOKEN_SECRET on each request. */
  secret?: string | null;
  frontendUrl?: string;
  /** Receives each background login job (tests await these). */
  onBackground?: (job: Promise<void>) => void;
}

const ACCEPTED = { ok: true, message: "If that address belongs to an active sponsor account, a sign-in link is on its way." };

export function createSponsorRouter(opts: SponsorRouterOptions = {}): Router {
  const router = Router();
  const now = opts.now ?? Date.now;
  const secret = opts.secret !== undefined ? () => readSponsorSecret(opts.secret) : () => readSponsorSecret();
  let svc: SponsorAuthService | null = null;
  const service = async (): Promise<SponsorAuthService> => (svc ??= createSponsorAuthService({
    store: opts.store ?? await getDefaultSponsorStore(),
    mailer: opts.mailer ?? defaultMailer,
    now,
    secret,
    frontendUrl: () => frontendBase(opts.frontendUrl),
  }));
  const requireSponsor = createRequireSponsor({ store: opts.store, now, secret });
  const limiter = createLoginRateLimiter(now);

  const fail = (res: Response, err: unknown) => {
    console.error("[sponsor] request failed:", err instanceof Error ? err.name : "error");
    if (!res.headersSent) res.status(500).json({ error: "Something went wrong" });
  };
  const wrap = (fn: (req: Request, res: Response, s: SponsorAuthService) => Promise<unknown>): RequestHandler =>
    (req, res) => { service().then(s => fn(req, res, s)).catch(e => fail(res, e)); };

  router.post("/login", (req, res) => {
    const email = normalizeEmail((req.body as { email?: unknown } | undefined)?.email);
    const ip = req.ip ?? "unknown";
    const proceed = email !== null && secret() !== null && limiter.allow(email, ip);
    res.status(202).json(ACCEPTED);
    if (!proceed || !email) return;
    const job = service()
      .then(s => s.requestLogin(email))
      .then(() => undefined)
      .catch(err => { console.error("[sponsor] login link not sent:", err instanceof Error ? err.name : "error"); });
    opts.onBackground?.(job);
  });

  router.post("/session", (_req, res, next) => {
    if (!secret()) { res.status(503).json({ error: NOT_CONFIGURED }); return; }
    next();
  }, wrap(async (req, res, s) => {
    const session = await s.exchange((req.body as { token?: unknown } | undefined)?.token);
    if (!session) { res.status(401).json({ error: "This sign-in link is invalid or has expired." }); return; }
    res.setHeader("Cache-Control", "no-store");
    res.json(session);
  }));

  router.get("/me", requireSponsor, (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ sponsor: sponsorSummary(sponsorOf(res)) });
  });

  router.post("/logout", requireSponsor, wrap(async (req, res, s) => {
    await s.logout(req.sponsorUserId!);
    res.json({ ok: true });
  }));

  return router;
}

export const sponsorRouter = createSponsorRouter();
