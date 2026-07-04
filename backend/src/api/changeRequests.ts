// Constellation Vault — change request routes. Thin handlers only; all
// business logic (validation, revision math, audit, notifications) lives in
// changeRequestService.ts.

import { Router, type Request, type Response } from "express";
import { requireAuth, requireAdmin } from "./auth.js";
import {
  createCr,
  updateCr,
  cancelCr,
  approveCr,
  rejectCr,
  listCrs,
  getCr,
  pendingCount,
  type CrItemInput,
} from "../services/changeRequestService.js";
import type { ChangeRequestStatus } from "@prisma/client";

export const changeRequestsRouter = Router();
changeRequestsRouter.use(requireAuth);

const VALID_STATUSES: ChangeRequestStatus[] = ["OPEN", "APPROVED", "REJECTED", "CANCELLED"];

function handleError(res: Response, err: any, fallback: string): void {
  const status = typeof err?.status === "number" ? err.status : 500;
  if (status !== 500) {
    res.status(status).json({ error: err.message });
    return;
  }
  console.error(fallback, err);
  res.status(500).json({ error: fallback });
}

// ── GET /api/projects/:projectId/change-requests ───────────────

changeRequestsRouter.get("/projects/:projectId/change-requests", async (req: Request, res: Response) => {
  try {
    const projectId = req.params.projectId as string;
    const statusParam = req.query.status as string | undefined;
    const status = statusParam && (VALID_STATUSES as string[]).includes(statusParam)
      ? (statusParam as ChangeRequestStatus)
      : undefined;

    const crs = await listCrs(projectId, status);
    res.json(crs);
  } catch (err: any) {
    handleError(res, err, "Failed to list change requests");
  }
});

// ── POST /api/projects/:projectId/change-requests ──────────────

changeRequestsRouter.post("/projects/:projectId/change-requests", async (req: Request, res: Response) => {
  try {
    const projectId = req.params.projectId as string;
    const { title, description, taskId, items } = req.body as {
      title: string;
      description?: string | null;
      taskId?: string | null;
      items: CrItemInput[];
    };

    const cr = await createCr(projectId, req.memberId!, { title, description, taskId, items });
    res.status(201).json(cr);
  } catch (err: any) {
    handleError(res, err, "Failed to create change request");
  }
});

// ── GET /api/change-requests/:id ────────────────────────────────

changeRequestsRouter.get("/change-requests/:id", async (req: Request, res: Response) => {
  try {
    const cr = await getCr(req.params.id as string);
    res.json(cr);
  } catch (err: any) {
    handleError(res, err, "Failed to get change request");
  }
});

// ── PATCH /api/change-requests/:id ──────────────────────────────
// Author-or-admin, OPEN only; whitelist title/description/taskId/
// releaseNotes/items — items (if present) replace the full set.

changeRequestsRouter.patch("/change-requests/:id", async (req: Request, res: Response) => {
  try {
    const { title, description, taskId, releaseNotes, items } = req.body as {
      title?: string;
      description?: string | null;
      taskId?: string | null;
      releaseNotes?: string | null;
      items?: CrItemInput[];
    };

    const cr = await updateCr(req.params.id as string, req.memberId!, {
      title, description, taskId, releaseNotes, items,
    });
    res.json(cr);
  } catch (err: any) {
    handleError(res, err, "Failed to update change request");
  }
});

// ── POST /api/change-requests/:id/cancel ────────────────────────
// Author-or-admin.

changeRequestsRouter.post("/change-requests/:id/cancel", async (req: Request, res: Response) => {
  try {
    const { reviewNote } = req.body as { reviewNote?: string };
    const cr = await cancelCr(req.params.id as string, req.memberId!, { reviewNote });
    res.json(cr);
  } catch (err: any) {
    handleError(res, err, "Failed to cancel change request");
  }
});

// ── POST /api/change-requests/:id/approve ───────────────────────

changeRequestsRouter.post("/change-requests/:id/approve", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { reviewNote } = req.body as { reviewNote?: string };
    const cr = await approveCr(req.params.id as string, req.memberId!, { reviewNote });
    res.json(cr);
  } catch (err: any) {
    handleError(res, err, "Failed to approve change request");
  }
});

// ── POST /api/change-requests/:id/reject ────────────────────────

changeRequestsRouter.post("/change-requests/:id/reject", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { reviewNote } = req.body as { reviewNote?: string };
    const cr = await rejectCr(req.params.id as string, req.memberId!, { reviewNote });
    res.json(cr);
  } catch (err: any) {
    handleError(res, err, "Failed to reject change request");
  }
});

// ── GET /api/change-requests/pending/count ──────────────────────
// Admin-only; global OPEN count (not scoped to a single project).

changeRequestsRouter.get("/change-requests/pending/count", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const count = await pendingCount();
    res.json({ count });
  } catch (err: any) {
    handleError(res, err, "Failed to get pending change request count");
  }
});
