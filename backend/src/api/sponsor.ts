// Sponsor portal API (/api/sponsor) — auth routes. Mounted above every bare /api router so no member
// auth middleware runs first; sponsor routes never read member identity (session or member id).
//   POST /login   { email }  always 202 (no account enumeration); lookup + send happen after the response.
//   POST /session { token }  single-use magic-link exchange → 7-day sponsor Bearer token.
//   GET  /me                 requireSponsor → sponsor summary.
//   POST /logout             requireSponsor → bumps tokenVersion (revokes every session).
//   GET  /directory          requireSponsor → shared members only, allow-list cards, alphabetical (or gradTerm).
//   POST /intros             requireSponsor → { memberId, message, opportunityId? }; 1 pending per pair, 20 per 7 days.
//   GET  /intros             requireSponsor → own requests; memberEmail only once ACCEPTED.

import { Router, type Request, type RequestHandler, type Response } from "express";
import { createRequireSponsor, sponsorOf } from "../middleware/sponsorAuth.js";
import { OpportunityError, OPPORTUNITY_STATUS, createOpportunityService, getDefaultOpportunityStore, type OpportunityStore, type OpportunityService } from "../services/opportunityService.js";
import {
  NOT_CONFIGURED, createLoginRateLimiter, createSponsorAuthService, defaultMailer, frontendBase,
  getDefaultSponsorStore, normalizeEmail, readSponsorSecret, sponsorSummary,
  type SponsorAuthService, type SponsorAuthStore, type SponsorMailer,
} from "../services/sponsorAuthService.js";
import {
  INTRO_STATUS, IntroError, createIntroService, defaultIntroMailer, defaultIntroNotify, getDefaultIntroStore,
  type IntroMailer, type IntroNotify, type IntroService, type IntroStore,
} from "../services/introService.js";

export interface SponsorRouterOptions {
  store?: SponsorAuthStore;
  mailer?: SponsorMailer;
  now?: () => number;
  /** A fixed secret (tests) or null for "unset"; default reads SPONSOR_TOKEN_SECRET on each request. */
  secret?: string | null;
  frontendUrl?: string;
  /** Receives each background login job (tests await these). */
  onBackground?: (job: Promise<void>) => void;
  introStore?: IntroStore;
  notify?: IntroNotify;
  introMailer?: IntroMailer;
  opportunityStore?: OpportunityStore;
}

const ACCEPTED = { ok: true, message: "If that address belongs to an active sponsor account, a sign-in link is on its way." };

export function createSponsorRouter(opts: SponsorRouterOptions = {}): Router {
  const router = Router();
  const now = opts.now ?? Date.now;
  let opportunitySvc: OpportunityService | null = null;
  const opportunities = async () => opportunitySvc ??= createOpportunityService({ store: opts.opportunityStore ?? await getDefaultOpportunityStore(), now });
  const withOpportunities = (fn: (req: Request, res: Response, s: OpportunityService) => Promise<unknown>): RequestHandler =>
    (req, res) => { opportunities().then(s => fn(req, res, s)).catch(e => {
      if (e instanceof OpportunityError) { res.status(OPPORTUNITY_STATUS[e.code]).json({ error: e.message, code: e.code }); return; }
      fail(res, e);
    }); };
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
  let introSvc: IntroService | null = null;
  const intros = async (): Promise<IntroService> => (introSvc ??= createIntroService({
    store: opts.introStore ?? await getDefaultIntroStore(),
    now,
    notify: opts.notify ?? defaultIntroNotify,
    mailer: opts.introMailer ?? defaultIntroMailer,
    frontendUrl: () => frontendBase(opts.frontendUrl),
  }));
  const introFail = (res: Response, err: unknown) => {
    if (err instanceof IntroError) { res.status(INTRO_STATUS[err.code]).json({ error: err.message, code: err.code }); return; }
    fail(res, err);
  };
  const withIntros = (fn: (req: Request, res: Response, s: IntroService) => Promise<unknown>): RequestHandler =>
    (req, res) => { intros().then(s => fn(req, res, s)).catch(e => introFail(res, e)); };
  // Per-sponsor-user write throttle (10/min) on top of the 20-per-7-days intro limit.
  const writes = new Map<string, number[]>();
  const throttled: RequestHandler = (req, res, next) => {
    const id = req.sponsorUserId!;
    const t = now();
    const recent = (writes.get(id) ?? []).filter(x => t - x < 60_000);
    if (recent.length >= 10) { res.status(429).json({ error: "Too many requests; try again in a minute", code: "RATE_LIMITED" }); return; }
    recent.push(t); writes.set(id, recent);
    next();
  };

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
    res.json({ sponsor: sponsorSummary(sponsorOf(res)), features: { postings: true } });
  });

  router.post("/logout", requireSponsor, wrap(async (req, res, s) => {
    await s.logout(req.sponsorUserId!);
    res.json({ ok: true });
  }));

  router.post("/postings", requireSponsor, throttled, withOpportunities(async (req, res, s) => { res.status(201).json({ posting: await s.createPosting(sponsorOf(res), req.body) }); }));
  router.patch("/postings/:id", requireSponsor, throttled, withOpportunities(async (req, res, s) => { res.json({ posting: await s.updatePosting(sponsorOf(res), String(req.params.id), req.body) }); }));
  router.delete("/postings/:id", requireSponsor, throttled, withOpportunities(async (req, res, s) => { res.json(await s.deletePosting(sponsorOf(res), String(req.params.id))); }));

  router.get("/directory", requireSponsor, withIntros(async (req, res, s) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(await s.directory(req.query as Record<string, unknown>));
  }));

  router.post("/intros", requireSponsor, throttled, withIntros(async (req, res, s) => {
    res.status(201).json(await s.requestIntro(sponsorOf(res), req.body));
  }));

  router.get("/intros", requireSponsor, withIntros(async (req, res, s) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(await s.sponsorIntros(req.sponsorUserId!));
  }));

  return router;
}

export const sponsorRouter = createSponsorRouter();
