// Lab spaces + lab schedule. Spec: docs/superpowers/specs/2026-09-25-lab-schedule-design.md
import { Router, type Request, type Response } from "express";
import { requireAuth, requireAdmin } from "./auth.js";
import * as workspaceService from "../services/workspaceService.js";
import * as labSchedule from "../services/labScheduleService.js";
import { isYmd } from "../services/labScheduleCore.js";

export const workspacesRouter = Router();
workspacesRouter.use(requireAuth);

function sendError(res: Response, err: unknown, label: string) {
  if (err instanceof labSchedule.LabScheduleError) { res.status(err.status).json({ error: err.message }); return; }
  console.error(`[workspaces] ${label}:`, err);
  res.status(500).json({ error: "Something went wrong" });
}
const idList = (v: unknown): string[] | null =>
  Array.isArray(v) && v.every(x => typeof x === "string") ? [...new Set(v as string[])] : null;

// ROUTE ORDER: static paths MUST stay above "/:id" (workspaces.test.ts checks).

workspacesRouter.get("/buddy-requests", async (req: Request, res: Response) => {
  try {
    const projectId = typeof req.query.projectId === "string" && req.query.projectId ? req.query.projectId : undefined;
    res.json(await labSchedule.listBuddyRequests(req.memberId!, projectId));
  } catch (err) { sendError(res, err, "buddy requests"); }
});

workspacesRouter.patch("/shifts/:shiftId", async (req: Request, res: Response) => {
  try { res.json(await labSchedule.updateShift(req.params.shiftId as string, req.memberId!, req.body)); }
  catch (err) { sendError(res, err, "update shift"); }
});

workspacesRouter.delete("/shifts/:shiftId", async (req: Request, res: Response) => {
  try { await labSchedule.deleteShift(req.params.shiftId as string, req.memberId!); res.status(204).end(); }
  catch (err) { sendError(res, err, "delete shift"); }
});

workspacesRouter.get("/", async (req: Request, res: Response) => {
  try {
    const includeArchived = req.query.includeArchived === "1" && await workspaceService.isAdminMember(req.memberId!);
    const projectId = typeof req.query.projectId === "string" && req.query.projectId ? req.query.projectId : undefined;
    res.json(await workspaceService.listWorkspaces({ projectId, includeArchived }));
  } catch (err) { sendError(res, err, "list"); }
});

workspacesRouter.post("/", requireAdmin, async (req: Request, res: Response) => {
  try {
    const parsed = workspaceService.sanitizeWorkspaceInput(req.body, false);
    if (!parsed.ok) { res.status(400).json({ error: parsed.error }); return; }
    const ws = await workspaceService.createWorkspace(parsed.value, req.memberId!);
    const projectIds = idList(req.body?.projectIds);
    if (projectIds) await workspaceService.setWorkspaceProjects(ws.id, projectIds);
    const trainingIds = idList(req.body?.trainingIds) ?? [];
    const courseIds = idList(req.body?.courseIds) ?? [];
    if (trainingIds.length || courseIds.length) await workspaceService.setWorkspaceRequirements(ws.id, trainingIds, courseIds);
    res.status(201).json(await workspaceService.getWorkspace(ws.id));
  } catch (err) { sendError(res, err, "create"); }
});

workspacesRouter.patch("/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const parsed = workspaceService.sanitizeWorkspaceInput(req.body, true);
    if (!parsed.ok) { res.status(400).json({ error: parsed.error }); return; }
    const ws = await workspaceService.updateWorkspace(req.params.id as string, parsed.value);
    if (!ws) { res.status(404).json({ error: "Lab space not found" }); return; }
    res.json(ws);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Opening time")) { res.status(400).json({ error: err.message }); return; }
    sendError(res, err, "update");
  }
});

workspacesRouter.delete("/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const ok = await workspaceService.archiveWorkspace(req.params.id as string);
    if (!ok) { res.status(404).json({ error: "Lab space not found" }); return; }
    res.status(204).end();
  } catch (err) { sendError(res, err, "archive"); }
});

workspacesRouter.put("/:id/projects", requireAdmin, async (req: Request, res: Response) => {
  try {
    const projectIds = idList(req.body?.projectIds);
    if (!projectIds) { res.status(400).json({ error: "projectIds must be a list of ids" }); return; }
    await workspaceService.setWorkspaceProjects(req.params.id as string, projectIds);
    res.json(await workspaceService.getWorkspace(req.params.id as string));
  } catch (err) { sendError(res, err, "set projects"); }
});

workspacesRouter.put("/:id/requirements", requireAdmin, async (req: Request, res: Response) => {
  try {
    const trainingIds = idList(req.body?.trainingIds);
    const courseIds = idList(req.body?.courseIds);
    if (!trainingIds || !courseIds) { res.status(400).json({ error: "trainingIds and courseIds must be lists of ids" }); return; }
    await workspaceService.setWorkspaceRequirements(req.params.id as string, trainingIds, courseIds);
    res.json(await workspaceService.getWorkspace(req.params.id as string));
  } catch (err) { sendError(res, err, "set requirements"); }
});

workspacesRouter.get("/:id/week", async (req: Request, res: Response) => {
  try {
    const start = isYmd(req.query.start) ? req.query.start : new Date().toISOString().slice(0, 10);
    res.json(await labSchedule.getWeek(req.params.id as string, start, req.memberId!));
  } catch (err) { sendError(res, err, "week"); }
});

workspacesRouter.post("/:id/shifts/apply", async (req: Request, res: Response) => {
  try { res.json(await labSchedule.applyRect(req.memberId!, req.params.id as string, req.body)); }
  catch (err) { sendError(res, err, "apply"); }
});
