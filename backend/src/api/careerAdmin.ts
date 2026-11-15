// Career admin API (/api/admin/career). Every route needs an admin; identity is req.memberId, never the session.
// No model calls. Mount: app.use("/api/admin/career", careerAdminRouter) above bare /api routers.
import { Router, type Request, type RequestHandler, type Response } from "express";
import { requireAdmin, requireAuth } from "./auth.js";
import { OnetLinkError } from "../services/onetLinkService.js";
import {
  ADMIN_STATUS, CareerAdminError, createCareerAdminService, getDefaultAdminDeps,
  type CareerAdminService, type CareerAdminStore, type ReviewNotify,
} from "../services/careerAdminService.js";

const LINK_STATUS = { INVALID: 400, NOT_FOUND: 404, FORBIDDEN: 403 } as const;

export function sendCareerAdminError(res: Response, err: unknown): void {
  if (err instanceof CareerAdminError) { res.status(ADMIN_STATUS[err.code]).json({ error: err.message, code: err.code }); return; }
  if (err instanceof OnetLinkError) { res.status(LINK_STATUS[err.code]).json({ error: err.message, code: err.code }); return; }
  console.error("[career-admin] request failed:", err);
  res.status(500).json({ error: "Something went wrong" });
}

export interface CareerAdminRouterOptions {
  /** Replaces [requireAuth, requireAdmin] in tests. */
  auth?: RequestHandler[];
  store?: CareerAdminStore;
  notify?: ReviewNotify;
  now?: () => number;
}

export function createCareerAdminRouter(opts: CareerAdminRouterOptions = {}): Router {
  const router = Router();
  let svc: CareerAdminService | null = null;
  const service = async (): Promise<CareerAdminService> => {
    if (svc) return svc;
    const injected = opts.store && opts.notify;
    const d = injected ? { store: opts.store!, notify: opts.notify! } : await getDefaultAdminDeps();
    return (svc = createCareerAdminService(opts.store ?? d.store, { now: opts.now, notify: opts.notify ?? d.notify }));
  };
  const wrap = (fn: (req: Request, res: Response, s: CareerAdminService) => Promise<unknown>) =>
    (req: Request, res: Response) => { service().then(s => fn(req, res, s)).catch(e => sendCareerAdminError(res, e)); };

  router.use(...(opts.auth ?? [requireAuth, requireAdmin]));

  router.get("/onet/status", wrap(async (_req, res, s) => { res.json(await s.onetStatus()); }));
  router.get("/onet/unlinked", wrap(async (_req, res, s) => { res.json(await s.unlinked()); }));
  router.post("/onet/apply-curated", wrap(async (_req, res, s) => { res.json(await s.applyCurated()); }));
  router.put("/skills/:id/onet-links", wrap(async (req, res, s) => { res.json(await s.setLink(req.memberId!, String(req.params.id), req.body)); }));
  // Body or query: { kind, ref }.
  router.delete("/skills/:id/onet-links", wrap(async (req, res, s) => {
    res.json(await s.removeLink(req.memberId!, String(req.params.id), req.body && Object.keys(req.body).length ? req.body : req.query));
  }));

  router.get("/metrics", wrap(async (_req, res, s) => { res.json(await s.metrics()); }));
  router.put("/metrics", wrap(async (req, res, s) => { res.json(await s.setMetrics(req.body)); }));

  router.get("/attestations", wrap(async (req, res, s) => { res.json(await s.attestations(req.query.status)); }));
  router.post("/attestations/:id/review", wrap(async (req, res, s) => { res.json(await s.review(req.memberId!, String(req.params.id), req.body)); }));
  router.post("/confirm", wrap(async (req, res, s) => { res.status(201).json(await s.confirm(req.memberId!, req.body)); }));

  router.get("/demand-signals", wrap(async (_req, res, s) => { res.json(await s.signals()); }));
  router.post("/demand-signals", wrap(async (req, res, s) => { res.status(201).json(await s.createSignal(req.body)); }));
  router.put("/demand-signals/:id", wrap(async (req, res, s) => { res.json(await s.updateSignal(String(req.params.id), req.body)); }));
  router.delete("/demand-signals/:id", wrap(async (req, res, s) => { res.json(await s.deleteSignal(String(req.params.id))); }));

  return router;
}

export const careerAdminRouter = createCareerAdminRouter();
