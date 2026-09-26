// Vault geometry diff (Phase 9). Mounted at bare /api. Every route is
// authenticated and every read re-checks project access for the stored row —
// see vaultGeometryService.ts for the cache, bounds and worker.

import fs from "node:fs";
import { Router, type Request, type Response } from "express";
import { requireAuth } from "./auth.js";
import { authorizeGeometryDiff, geometryCapabilities, GeometryRequestError, meshFile, publicGeometryDiff, requestGeometryDiff } from "../services/vaultGeometryService.js";
import { prisma } from "../db/prisma.js";
import { geometryFormatOf } from "../services/vaultGeometryParsers.js";

export const vaultGeometryRouter = Router();

function fail(res: Response, err: unknown, fallback: string): void {
  if (err instanceof GeometryRequestError) { res.status(err.status).json({ error: err.message }); return; }
  console.error(fallback, err);
  res.status(500).json({ error: fallback });
}

// ── GET /api/vault/geometry/capabilities ───────────────────────
// Supported formats, unit handling, converter version and limits, so the UI
// can state them instead of hard-coding them.

vaultGeometryRouter.get("/vault/geometry/capabilities", requireAuth, (_req: Request, res: Response) => {
  res.json(geometryCapabilities());
});

// ── POST /api/vault/geometry-diffs ─────────────────────────────
// { beforeVersionId, afterVersionId, units?, tolerance? } → the cached row
// (state DONE) or a queued one (PENDING/RUNNING). Poll GET /:id until DONE or
// FAILED.

vaultGeometryRouter.post("/vault/geometry-diffs", requireAuth, async (req: Request, res: Response) => {
  try {
    const diff = await requestGeometryDiff(req.memberId, req.body ?? {});
    res.status(diff.state === "DONE" || diff.state === "FAILED" ? 200 : 202).json({ diff });
  } catch (err) {
    fail(res, err, "Failed to request geometry diff");
  }
});

vaultGeometryRouter.get("/vault/geometry-diffs/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const row = await authorizeGeometryDiff(req.memberId, req.params.id as string);
    res.json({ diff: publicGeometryDiff(row) });
  } catch (err) {
    fail(res, err, "Failed to load geometry diff");
  }
});

// ── GET /api/vault/geometry-diffs/:id/mesh/:side ───────────────
// The triangles a STEP side was measured on, as binary STL, so the compare
// view draws exactly what was compared. Only STEP sides have one; mesh
// formats are drawn from their own download.

vaultGeometryRouter.get("/vault/geometry-diffs/:id/mesh/:side", requireAuth, async (req: Request, res: Response) => {
  try {
    const side = req.params.side;
    if (side !== "before" && side !== "after") { res.status(400).json({ error: "side must be before or after" }); return; }
    const row = await authorizeGeometryDiff(req.memberId, req.params.id as string);
    const version = await prisma.vaultVersion.findUnique({ where: { id: side === "before" ? row.beforeVersionId : row.afterVersionId }, select: { fileName: true } });
    if (!version || geometryFormatOf(version.fileName) !== "step") { res.status(404).json({ error: "Only STEP versions have a converted mesh" }); return; }
    const file = meshFile(side === "before" ? row.beforeSha256 : row.afterSha256);
    const size = await fs.promises.stat(file).then((s) => s.size).catch(() => null);
    if (size === null) { res.status(404).json({ error: "The converted mesh is not available yet (or was pruned); request the diff again" }); return; }
    res.setHeader("Content-Type", "model/stl");
    res.setHeader("Content-Length", size);
    res.setHeader("Cache-Control", "private, max-age=3600");
    fs.createReadStream(file).on("error", () => res.destroy()).pipe(res);
  } catch (err) {
    fail(res, err, "Failed to load converted mesh");
  }
});
