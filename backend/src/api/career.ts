// Member career API (/api/career). Members only ever read and write their own rows; identity is req.memberId.
// No model calls anywhere. Pending claims appear only in the member's own responses and never in export.json.

import { Router, type Request, type RequestHandler, type Response } from "express";
import { requireAuth } from "./auth.js";
import { getPathway } from "../services/pathwayService.js";
import {
  CAREER_STATUS, CareerError, createCareerService, getDefaultStore, type CareerService, type CareerStore,
} from "../services/careerService.js";

export function sendCareerError(res: Response, err: unknown): void {
  if (err instanceof CareerError) { res.status(CAREER_STATUS[err.code]).json({ error: err.message, code: err.code }); return; }
  console.error("[career] request failed:", err);
  res.status(500).json({ error: "Something went wrong" });
}

export interface CareerRouterOptions {
  auth?: RequestHandler;
  store?: CareerStore;
  pathway?: (memberId: string, code: string) => Promise<unknown | null>;
  now?: () => number;
}

export function createCareerRouter(opts: CareerRouterOptions = {}): Router {
  const router = Router();
  const now = opts.now ?? Date.now;
  const pathway = opts.pathway ?? getPathway;
  let svc: CareerService | null = null;
  const service = async (): Promise<CareerService> => (svc ??= createCareerService(opts.store ?? await getDefaultStore(), { now }));

  const wrap = (fn: (req: Request, res: Response, s: CareerService) => Promise<unknown>) =>
    (req: Request, res: Response) => { service().then(s => fn(req, res, s)).catch(e => sendCareerError(res, e)); };

  // Small per-member throttle on writes (30/min).
  const writes = new Map<string, number[]>();
  const throttled: RequestHandler = (req, res, next) => {
    const id = req.memberId!;
    const t = now();
    const recent = (writes.get(id) ?? []).filter(x => t - x < 60_000);
    if (recent.length >= 30) { res.status(429).json({ error: "Too many changes; try again in a minute", code: "RATE_LIMITED" }); return; }
    recent.push(t); writes.set(id, recent);
    next();
  };

  router.use(opts.auth ?? requireAuth);

  router.get("/me", wrap(async (req, res, s) => { res.json(await s.me(req.memberId!)); }));
  router.put("/me/profile", throttled, wrap(async (req, res, s) => { res.json({ profile: await s.updateProfile(req.memberId!, req.body) }); }));
  router.put("/me/targets", throttled, wrap(async (req, res, s) => { res.json(await s.setTargets(req.memberId!, req.body)); }));
  router.get("/occupations", wrap(async (req, res, s) => { res.json(await s.searchOccupations(req.query.q)); }));
  router.get("/pathway/:code", wrap(async (req, res) => {
    const p = await pathway(req.memberId!, String(req.params.code));
    if (!p) throw new CareerError("NOT_FOUND", "Unknown occupation.");
    res.json(p);
  }));
  // Rate-limited 1/minute per member inside the service (429).
  router.post("/me/recompute", wrap(async (req, res, s) => { res.json(await s.recompute(req.memberId!)); }));
  router.put("/me/bullets/:sourceKind/:sourceId", throttled, wrap(async (req, res, s) => {
    res.json(await s.setBullet(req.memberId!, String(req.params.sourceKind), String(req.params.sourceId), req.body));
  }));
  router.post("/me/claims", throttled, wrap(async (req, res, s) => { res.status(201).json(await s.createClaim(req.memberId!, req.body)); }));
  router.delete("/me/claims/:id", throttled, wrap(async (req, res, s) => { res.json(await s.deleteClaim(req.memberId!, String(req.params.id))); }));
  // The member's own download. `basics.email` is deliberately omitted (includeEmail stays off); see resumeCore.buildJsonResume.
  router.get("/me/export.json", wrap(async (req, res, s) => {
    const resume = await s.exportResume(req.memberId!, { includeEmail: false });
    res.setHeader("Content-Disposition", 'attachment; filename="resume.json"');
    res.setHeader("Cache-Control", "no-store");
    res.type("application/json").send(JSON.stringify(resume, null, 2));
  }));
  router.get("/demand-signals", wrap(async (_req, res, s) => { res.json(await s.demandSignals()); }));

  return router;
}

export const careerRouter = createCareerRouter();
