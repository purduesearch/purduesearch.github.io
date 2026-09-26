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
import { draftCrReleaseNotes, summarizeCrImpact } from "../services/vaultContextService.js";
import type { ChangeRequestStatus } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { canAccessVaultProject } from "../services/vaultGithubJobs.js";
import { linkPr, reviewStatus, signoffCr, syncPr } from "../services/vaultPrReviewService.js";
import { logAuditEvent } from "../services/activityService.js";
import { getReadiness, listReleases, publicRelease } from "../services/vaultReleaseService.js";
import { REQUIREMENT_SCOPES, SEVERITIES } from "../services/vaultReleasePolicy.js";

export const changeRequestsRouter = Router();
changeRequestsRouter.use(requireAuth);

changeRequestsRouter.get("/projects/:projectId/vault/reviewer-rules", async (req: Request, res: Response) => {
  const projectId = req.params.projectId as string;
  if (!(await canAccessVaultProject(req.memberId, projectId))) { res.status(403).json({ error: "Forbidden" }); return; }
  const [rules, repo] = await Promise.all([prisma.vaultReviewerRule.findMany({ where: { projectId }, include: { reviewer: { select: { id: true, displayName: true } } }, orderBy: [{ scope: "asc" }, { value: "asc" }] }), prisma.vaultRepository.findUnique({ where: { projectId }, select: { requiredChecks: true } })]);
  res.json({ rules, requiredChecks: repo?.requiredChecks || [] });
});

changeRequestsRouter.put("/projects/:projectId/vault/reviewer-rules", requireAdmin, async (req: Request, res: Response) => {
  try {
    const projectId = req.params.projectId as string;
    const configuredRepo = await prisma.vaultRepository.findUnique({ where: { projectId }, select: { id: true } });
    if (!configuredRepo) { res.status(400).json({ error: "Configure a Vault repository before review rules" }); return; }
    const rules = req.body.rules;
    const requiredChecks = req.body.requiredChecks;
    if (!Array.isArray(rules) || rules.length > 100 || rules.some((r: any) => !["SUBSYSTEM", "BOM_PARENT"].includes(r.scope) || typeof r.value !== "string" || !r.value.trim() || typeof r.reviewerId !== "string") || !Array.isArray(requiredChecks) || requiredChecks.some((v: any) => typeof v !== "string" || !v.trim())) { res.status(400).json({ error: "Invalid reviewer rules or required checks" }); return; }
    const reviewerIds = [...new Set(rules.map((r: any) => r.reviewerId))] as string[];
    const [members, parents] = await Promise.all([
      prisma.projectMember.findMany({ where: { projectId, memberId: { in: reviewerIds } }, select: { memberId: true } }),
      prisma.vaultItem.findMany({ where: { projectId, id: { in: rules.filter((r: any) => r.scope === "BOM_PARENT").map((r: any) => r.value) }, deletedAt: null }, select: { id: true } }),
    ]);
    if (members.length !== reviewerIds.length || rules.some((r: any) => r.scope === "BOM_PARENT" && !parents.some(p => p.id === r.value))) { res.status(400).json({ error: "Reviewers must be project members and BOM parents must belong to this project" }); return; }
    await prisma.$transaction(async tx => {
      await tx.vaultReviewerRule.deleteMany({ where: { projectId } });
      if (rules.length) await tx.vaultReviewerRule.createMany({ data: rules.map((r: any) => ({ projectId, scope: r.scope, value: r.value.trim(), reviewerId: r.reviewerId })), skipDuplicates: true });
      await tx.vaultRepository.update({ where: { projectId }, data: { requiredChecks } });
    });
    logAuditEvent({ projectId, memberId: req.memberId, source: "WEB", eventType: "VAULT_REVIEWER_RULE_CHANGED", payload: { ruleCount: rules.length, requiredChecks } }).catch(console.error);
    res.json(await prisma.vaultReviewerRule.findMany({ where: { projectId }, include: { reviewer: { select: { id: true, displayName: true } } } }));
  } catch (err) { handleError(res, err, "Failed to save reviewer rules"); }
});

// ── Phase 7: drawing requirements, drawing links, releases ─────

changeRequestsRouter.get("/projects/:projectId/vault/drawing-requirements", async (req: Request, res: Response) => {
  const projectId = req.params.projectId as string;
  if (!(await canAccessVaultProject(req.memberId, projectId))) { res.status(403).json({ error: "Forbidden" }); return; }
  res.json(await prisma.vaultDrawingRequirement.findMany({ where: { projectId }, orderBy: [{ scope: "asc" }, { value: "asc" }] }));
});

changeRequestsRouter.put("/projects/:projectId/vault/drawing-requirements", requireAdmin, async (req: Request, res: Response) => {
  try {
    const projectId = req.params.projectId as string;
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    const requirements = req.body.requirements;
    const valid = Array.isArray(requirements) && requirements.length <= 50 && requirements.every((r: any) =>
      (REQUIREMENT_SCOPES as readonly string[]).includes(r?.scope) && (SEVERITIES as readonly string[]).includes(r?.severity) &&
      (r.scope === "ALL" || (typeof r.value === "string" && r.value.trim().length > 0 && r.value.length <= 200)));
    if (!valid) { res.status(400).json({ error: "Each requirement needs scope ALL, SUBSYSTEM or EXTENSION, a value (except ALL), and severity WARNING or BLOCKER" }); return; }
    const rows = requirements.map((r: any) => ({ projectId, scope: r.scope, value: r.scope === "ALL" ? "" : r.value.trim(), severity: r.severity }));
    await prisma.$transaction(async (tx) => {
      await tx.vaultDrawingRequirement.deleteMany({ where: { projectId } });
      if (rows.length) await tx.vaultDrawingRequirement.createMany({ data: rows });
    });
    logAuditEvent({ projectId, memberId: req.memberId, source: "WEB", eventType: "VAULT_DRAWING_REQUIREMENT_CHANGED", payload: { requirements: rows.map(({ scope, value, severity }: any) => ({ scope, value, severity })) } }).catch(console.error);
    res.json(await prisma.vaultDrawingRequirement.findMany({ where: { projectId }, orderBy: [{ scope: "asc" }, { value: "asc" }] }));
  } catch (err) { handleError(res, err, "Failed to save drawing requirements"); }
});

// PUT /api/vault/items/:id/drawing-for { drawingForId: string | null } — mark this item as the drawing of another item.
changeRequestsRouter.put("/vault/items/:id/drawing-for", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const target = req.body?.drawingForId ?? null;
    const item = await prisma.vaultItem.findUnique({ where: { id }, select: { id: true, projectId: true, deletedAt: true, drawingForId: true, name: true } });
    if (!item || item.deletedAt) { res.status(404).json({ error: "Vault item not found" }); return; }
    if (!(await canAccessVaultProject(req.memberId, item.projectId))) { res.status(403).json({ error: "Forbidden" }); return; }
    if (target !== null) {
      if (typeof target !== "string" || target === id) { res.status(400).json({ error: "Choose a different item for this drawing" }); return; }
      const [part, ownDrawings] = await Promise.all([
        prisma.vaultItem.findUnique({ where: { id: target }, select: { projectId: true, deletedAt: true, drawingForId: true } }),
        prisma.vaultItem.count({ where: { drawingForId: id, deletedAt: null } }),
      ]);
      if (!part || part.deletedAt || part.projectId !== item.projectId) { res.status(400).json({ error: "The documented item must be in the same project" }); return; }
      if (part.drawingForId || ownDrawings > 0) { res.status(400).json({ error: "A drawing cannot document another drawing" }); return; }
    }
    const updated = await prisma.vaultItem.update({ where: { id }, data: { drawingForId: target }, select: { id: true, drawingForId: true } });
    logAuditEvent({ projectId: item.projectId, memberId: req.memberId, source: "WEB", eventType: "VAULT_DRAWING_LINK_CHANGED", payload: { itemId: id, itemName: item.name, from: item.drawingForId, to: target } }).catch(console.error);
    res.json(updated);
  } catch (err) { handleError(res, err, "Failed to link drawing"); }
});

changeRequestsRouter.get("/projects/:projectId/vault/releases", async (req: Request, res: Response) => {
  try {
    const projectId = req.params.projectId as string;
    if (!(await canAccessVaultProject(req.memberId, projectId))) { res.status(403).json({ error: "Forbidden" }); return; }
    res.json(await listReleases(projectId));
  } catch (err) { handleError(res, err, "Failed to list releases"); }
});

async function accessCr(req: Request, res: Response): Promise<boolean> {
  const cr = await prisma.changeRequest.findUnique({ where: { id: req.params.id as string }, select: { projectId: true } });
  if (!cr) { res.status(404).json({ error: "Change request not found" }); return false; }
  if (!(await canAccessVaultProject(req.memberId, cr.projectId))) { res.status(403).json({ error: "Forbidden" }); return false; }
  return true;
}

changeRequestsRouter.get("/change-requests/:id/review-status", async (req: Request, res: Response) => {
  try { if (!await accessCr(req, res)) return; res.json(await reviewStatus(req.params.id as string)); }
  catch (err) { handleError(res, err, "Failed to get review status"); }
});
// Build readiness + impact before approval (stored report once approved).
changeRequestsRouter.get("/change-requests/:id/readiness", async (req: Request, res: Response) => {
  try { if (!await accessCr(req, res)) return; res.json(await getReadiness(req.params.id as string)); }
  catch (err) { handleError(res, err, "Failed to compute build readiness"); }
});
changeRequestsRouter.get("/change-requests/:id/release", async (req: Request, res: Response) => {
  try {
    if (!await accessCr(req, res)) return;
    const release = await prisma.vaultRelease.findUnique({ where: { changeRequestId: req.params.id as string } });
    res.json(release ? publicRelease(release, { withManifest: true }) : null);
  } catch (err) { handleError(res, err, "Failed to load release"); }
});
changeRequestsRouter.post("/change-requests/:id/pr", async (req: Request, res: Response) => {
  try { if (!await accessCr(req, res)) return; res.json(await linkPr(req.params.id as string, req.memberId!, req.body.repoSlug, Number(req.body.number))); }
  catch (err) { handleError(res, err, "Failed to link PR"); }
});
changeRequestsRouter.post("/change-requests/:id/pr/sync", async (req: Request, res: Response) => {
  try { if (!await accessCr(req, res)) return; res.json(await syncPr(req.params.id as string)); }
  catch (err) { handleError(res, err, "Failed to sync PR"); }
});
changeRequestsRouter.post("/change-requests/:id/signoff", async (req: Request, res: Response) => {
  try { if (!await accessCr(req, res)) return; res.json(await signoffCr(req.params.id as string, req.memberId!)); }
  catch (err) { handleError(res, err, "Failed to sign off"); }
});
changeRequestsRouter.delete("/change-requests/:id/signoff", async (req: Request, res: Response) => {
  try { if (!await accessCr(req, res)) return; res.json(await signoffCr(req.params.id as string, req.memberId!, true)); }
  catch (err) { handleError(res, err, "Failed to revoke sign-off"); }
});

// Keep every CR read and write scoped to a project member. The admin count is
// already protected by requireAdmin on its own route.
changeRequestsRouter.use(async (req: Request, res: Response, next) => {
  try {
    if (req.path === "/change-requests/pending/count") { next(); return; }
    const projectMatch = req.path.match(/^\/projects\/([^/]+)\/change-requests(?:\/|$)/);
    const crMatch = req.path.match(/^\/change-requests\/([^/]+)(?:\/|$)/);
    if (projectMatch) {
      if (!(await canAccessVaultProject(req.memberId, projectMatch[1]))) { res.status(403).json({ error: "Forbidden" }); return; }
    } else if (crMatch) {
      req.params.id = crMatch[1];
      if (!await accessCr(req, res)) return;
    }
    next();
  } catch (err) { handleError(res, err, "Failed to authorize change request"); }
});

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

// ── POST /api/change-requests/:id/ai-release-notes ──────────────
// AI-drafted release notes (Pack B). Not persisted — the client saves the
// draft via PATCH releaseNotes if the author accepts it.

changeRequestsRouter.post("/change-requests/:id/ai-release-notes", async (req: Request, res: Response) => {
  try {
    const draft = await draftCrReleaseNotes(req.params.id as string, req.memberId);
    if (draft === null) {
      res.status(404).json({ error: "Change request not found" });
      return;
    }
    res.json({ draft });
  } catch (err: any) {
    handleError(res, err, "Failed to draft release notes");
  }
});

// ── POST /api/change-requests/:id/ai-impact ─────────────────────
// AI impact summary (Pack B): where-used chains, linked task, open tasks
// mentioning the CR's items.

changeRequestsRouter.post("/change-requests/:id/ai-impact", async (req: Request, res: Response) => {
  try {
    const summary = await summarizeCrImpact(req.params.id as string, req.memberId);
    if (summary === null) {
      res.status(404).json({ error: "Change request not found" });
      return;
    }
    res.json({ summary });
  } catch (err: any) {
    handleError(res, err, "Failed to summarize impact");
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
