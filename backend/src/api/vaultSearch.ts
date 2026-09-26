// Vault search, saved views and per-item subscriptions (Phase 8). Mounted at
// bare /api. Every read is scoped by canAccessVaultProject — search through
// accessibleVaultProjectIds, the rest per item/project — and saved views and
// subscriptions are only ever the caller's own.

import { Router, type Request, type Response } from "express";
import { requireAuth, requireAdmin } from "./auth.js";
import { prisma } from "../db/prisma.js";
import { canAccessVaultProject } from "../services/vaultGithubJobs.js";
import { rebuildVaultSearch, searchVault, SearchForbidden } from "../services/vaultSearchService.js";
import { savedViewQuery } from "../services/vaultSearchCore.js";
import { setVaultSubscription, subscriptionView } from "../services/vaultNotificationService.js";

export const vaultSearchRouter = Router();
vaultSearchRouter.use(requireAuth);

const MAX_SAVED_VIEWS = 50;

function fail(res: Response, err: unknown, fallback: string): void {
  if (err instanceof SearchForbidden) { res.status(403).json({ error: "Forbidden" }); return; }
  console.error(fallback, err);
  res.status(500).json({ error: fallback });
}

// ── GET /api/vault/search ──────────────────────────────────────
// q, projectId, kinds (ITEM,VERSION,CR,COMMIT), released, checkedOut,
// crStatus, fileExts, authorId ("me" allowed), watching, since, until,
// sort (relevance|recent), limit, offset.

vaultSearchRouter.get("/vault/search", async (req: Request, res: Response) => {
  try {
    const { results, hasMore } = await searchVault(req.memberId!, req.query as Record<string, unknown>);
    res.json({ results, hasMore });
  } catch (err) { fail(res, err, "Failed to search the Vault"); }
});

// ── Saved views ───────────────────────────────────────────────

function viewName(value: unknown): string | null {
  const name = typeof value === "string" ? value.trim().slice(0, 80) : "";
  return name || null;
}

vaultSearchRouter.get("/vault/saved-views", async (req: Request, res: Response) => {
  try {
    const projectId = typeof req.query.projectId === "string" && req.query.projectId ? req.query.projectId : null;
    if (projectId && !(await canAccessVaultProject(req.memberId, projectId))) { res.status(403).json({ error: "Forbidden" }); return; }
    // A project view list also shows the member's cross-project views.
    const views = await prisma.vaultSavedView.findMany({
      where: { memberId: req.memberId!, ...(projectId ? { OR: [{ projectId }, { projectId: null }] } : {}) },
      orderBy: [{ projectId: "asc" }, { name: "asc" }],
    });
    res.json({ views });
  } catch (err) { fail(res, err, "Failed to load saved views"); }
});

vaultSearchRouter.post("/vault/saved-views", async (req: Request, res: Response) => {
  try {
    const name = viewName(req.body?.name);
    if (!name) { res.status(400).json({ error: "name is required" }); return; }
    const projectId = typeof req.body?.projectId === "string" && req.body.projectId ? req.body.projectId : null;
    if (projectId && !(await canAccessVaultProject(req.memberId, projectId))) { res.status(403).json({ error: "Forbidden" }); return; }
    const existing = await prisma.vaultSavedView.findMany({ where: { memberId: req.memberId! }, select: { name: true, projectId: true } });
    if (existing.length >= MAX_SAVED_VIEWS) { res.status(400).json({ error: `You can keep up to ${MAX_SAVED_VIEWS} saved views` }); return; }
    if (existing.some((v) => v.projectId === projectId && v.name.toLowerCase() === name.toLowerCase())) { res.status(409).json({ error: "A saved view with that name already exists" }); return; }
    const view = await prisma.vaultSavedView.create({ data: { memberId: req.memberId!, projectId, name, query: savedViewQuery(req.body?.query ?? {}) as any } });
    res.status(201).json(view);
  } catch (err) { fail(res, err, "Failed to save view"); }
});

vaultSearchRouter.patch("/vault/saved-views/:id", async (req: Request, res: Response) => {
  try {
    const view = await prisma.vaultSavedView.findUnique({ where: { id: req.params.id as string } });
    if (!view || view.memberId !== req.memberId) { res.status(404).json({ error: "Saved view not found" }); return; }
    const data: Record<string, unknown> = {};
    if (req.body?.name !== undefined) {
      const name = viewName(req.body.name);
      if (!name) { res.status(400).json({ error: "name cannot be empty" }); return; }
      const clash = await prisma.vaultSavedView.findFirst({ where: { memberId: req.memberId!, projectId: view.projectId, id: { not: view.id }, name: { equals: name, mode: "insensitive" } } });
      if (clash) { res.status(409).json({ error: "A saved view with that name already exists" }); return; }
      data.name = name;
    }
    if (req.body?.query !== undefined) data.query = savedViewQuery(req.body.query ?? {});
    res.json(await prisma.vaultSavedView.update({ where: { id: view.id }, data }));
  } catch (err) { fail(res, err, "Failed to update saved view"); }
});

vaultSearchRouter.delete("/vault/saved-views/:id", async (req: Request, res: Response) => {
  try {
    const { count } = await prisma.vaultSavedView.deleteMany({ where: { id: req.params.id as string, memberId: req.memberId! } });
    if (!count) { res.status(404).json({ error: "Saved view not found" }); return; }
    res.status(204).end();
  } catch (err) { fail(res, err, "Failed to delete saved view"); }
});

// ── Subscriptions ─────────────────────────────────────────────

async function liveItem(req: Request, res: Response) {
  const item = await prisma.vaultItem.findUnique({ where: { id: req.params.id as string }, select: { id: true, projectId: true, deletedAt: true } });
  if (!item || item.deletedAt) { res.status(404).json({ error: "Vault item not found" }); return null; }
  if (!(await canAccessVaultProject(req.memberId, item.projectId))) { res.status(403).json({ error: "Forbidden" }); return null; }
  return item;
}

vaultSearchRouter.get("/vault/items/:id/subscription", async (req: Request, res: Response) => {
  try {
    const item = await liveItem(req, res);
    if (!item) return;
    const [row, watchers] = await Promise.all([
      prisma.vaultSubscription.findUnique({ where: { memberId_itemId: { memberId: req.memberId!, itemId: item.id } } }),
      prisma.vaultSubscription.count({ where: { itemId: item.id, OR: [{ checkins: true }, { decisions: true }, { conflicts: true }] } }),
    ]);
    res.json({ ...subscriptionView(row), watchers });
  } catch (err) { fail(res, err, "Failed to load subscription"); }
});

vaultSearchRouter.put("/vault/items/:id/subscription", async (req: Request, res: Response) => {
  try {
    const item = await liveItem(req, res);
    if (!item) return;
    const flag = (key: string) => req.body?.[key] === undefined ? true : req.body[key] === true;
    const row = await setVaultSubscription(req.memberId!, item.id, item.projectId, { checkins: flag("checkins"), decisions: flag("decisions"), conflicts: flag("conflicts") });
    res.json(subscriptionView(row));
  } catch (err) { fail(res, err, "Failed to update subscription"); }
});

// Unwatch keeps an all-false row so auto-watch never re-subscribes the member.
vaultSearchRouter.delete("/vault/items/:id/subscription", async (req: Request, res: Response) => {
  try {
    const item = await liveItem(req, res);
    if (!item) return;
    const row = await setVaultSubscription(req.memberId!, item.id, item.projectId, { checkins: false, decisions: false, conflicts: false });
    res.json(subscriptionView(row));
  } catch (err) { fail(res, err, "Failed to unwatch item"); }
});

vaultSearchRouter.get("/vault/subscriptions", async (req: Request, res: Response) => {
  try {
    const projectId = typeof req.query.projectId === "string" && req.query.projectId ? req.query.projectId : null;
    if (projectId && !(await canAccessVaultProject(req.memberId, projectId))) { res.status(403).json({ error: "Forbidden" }); return; }
    const rows = await prisma.vaultSubscription.findMany({
      where: { memberId: req.memberId!, ...(projectId ? { projectId } : {}), OR: [{ checkins: true }, { decisions: true }, { conflicts: true }], item: { deletedAt: null } },
      include: { item: { select: { id: true, name: true, partNumber: true, projectId: true } } },
      orderBy: { createdAt: "desc" },
    });
    const allowed = new Map<string, boolean>();
    const visible = [];
    for (const row of rows) {
      if (!allowed.has(row.projectId)) allowed.set(row.projectId, await canAccessVaultProject(req.memberId, row.projectId));
      if (allowed.get(row.projectId)) visible.push({ ...subscriptionView(row), item: row.item });
    }
    res.json({ subscriptions: visible });
  } catch (err) { fail(res, err, "Failed to load subscriptions"); }
});

// ── POST /api/projects/:projectId/vault/search/rebuild (admin) ─

vaultSearchRouter.post("/projects/:projectId/vault/search/rebuild", requireAdmin, async (req: Request, res: Response) => {
  try {
    const projectId = req.params.projectId as string;
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    res.json(await rebuildVaultSearch(projectId));
  } catch (err) { fail(res, err, "Failed to rebuild the Vault search index"); }
});
