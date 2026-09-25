// Lab check-in/out (LabVisit). Plan: ~/.claude/plans/lab-overlap-checkin-tawny-heron.md, decisions 5–11.
import { Router, type Request, type Response } from "express";
import { requireAuth } from "./auth.js";
import * as labVisits from "../services/labVisitService.js";

export const labVisitsRouter = Router();
labVisitsRouter.use(requireAuth);

function sendError(res: Response, err: unknown, label: string) {
  if (err instanceof labVisits.LabVisitError) { res.status(err.status).json({ error: err.message }); return; }
  console.error(`[labVisits] ${label}:`, err);
  res.status(500).json({ error: "Something went wrong" });
}
const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
/** Optional ISO instant from the body; invalid input is a 400, not "now". */
function atFrom(body: unknown): Date | undefined {
  const raw = (body as Record<string, unknown> | undefined)?.at;
  if (raw === undefined || raw === null || raw === "") return undefined;
  const d = typeof raw === "string" ? new Date(raw) : new Date(NaN);
  if (Number.isNaN(d.getTime())) throw new labVisits.LabVisitError(400, "at must be an ISO date-time.");
  return d;
}

// ROUTE ORDER: static paths stay above "/:id".

labVisitsRouter.get("/me", async (req: Request, res: Response) => {
  try { res.json(await labVisits.getMyVisits(req.memberId!)); }
  catch (err) { sendError(res, err, "me"); }
});

labVisitsRouter.get("/present", async (req: Request, res: Response) => {
  try {
    res.json(await labVisits.getPresent({ projectId: str(req.query.projectId), workspaceId: str(req.query.workspaceId) }));
  } catch (err) { sendError(res, err, "present"); }
});

labVisitsRouter.post("/check-in", async (req: Request, res: Response) => {
  try {
    const workspaceId = str(req.body?.workspaceId);
    if (!workspaceId) { res.status(400).json({ error: "workspaceId is required." }); return; }
    res.status(201).json(await labVisits.checkIn(req.memberId!, workspaceId, "WEB"));
  } catch (err) { sendError(res, err, "check-in"); }
});

labVisitsRouter.post("/check-out", async (req: Request, res: Response) => {
  try { res.json(await labVisits.checkOut(req.memberId!, { at: atFrom(req.body), source: "WEB" })); }
  catch (err) { sendError(res, err, "check-out"); }
});

labVisitsRouter.post("/confirm", async (req: Request, res: Response) => {
  try { res.json(await labVisits.confirmPending(req.memberId!, { at: atFrom(req.body), source: "WEB" })); }
  catch (err) { sendError(res, err, "confirm"); }
});

labVisitsRouter.post("/:id/allocate", async (req: Request, res: Response) => {
  try {
    const taskId = str(req.body?.taskId);
    if (!taskId) { res.status(400).json({ error: "taskId is required." }); return; }
    res.json(await labVisits.allocateUnallocated(req.memberId!, req.params.id as string, taskId, "WEB"));
  } catch (err) { sendError(res, err, "allocate"); }
});
