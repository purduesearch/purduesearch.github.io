// Constellation Vault — release manifests and assembly packages
// (/api/vault-releases). Mounted above the bare "/api" routers in app.ts: the
// package download accepts a short-lived signed URL (an <a href> cannot send
// the Bearer header), and blockersRouter's pathless requireAuth would 401 it
// first. Every route still checks project membership for the resolved member.

import fs from "node:fs";
import { Router, type NextFunction, type Request, type Response } from "express";
import { requireAuth } from "./auth.js";
import { prisma } from "../db/prisma.js";
import { canAccessVaultProject } from "../services/vaultGithubJobs.js";
import { signVaultPath, verifyVaultSignature } from "../services/vaultService.js";
import { logAuditEvent } from "../services/activityService.js";
import { authorizeRelease, buildReleasePackage, getRelease, publicRelease, releasePackageFile, verifyRelease } from "../services/vaultReleaseService.js";

export const vaultReleasesRouter = Router();

const SIGNED_PACKAGE_PATH = /^\/[^/]+\/package$/;
const signedPath = (releaseId: string) => `/vault-releases/${releaseId}/package`;

/** Signed package GETs are accepted without a session; everything else needs normal auth. */
export function signedPackageMember(method: string, routePath: string, query: Record<string, unknown>, verify = verifyVaultSignature): string | null {
  if (method !== "GET" || !SIGNED_PACKAGE_PATH.test(routePath)) return null;
  const { exp, sig, memberId } = query;
  if (typeof exp !== "string" || typeof sig !== "string" || typeof memberId !== "string") return null;
  return verify(`/vault-releases${routePath}`, Number(exp), sig, memberId) ? memberId : null;
}

vaultReleasesRouter.use((req: Request, res: Response, next: NextFunction) => {
  const signed = signedPackageMember(req.method, req.path, req.query as Record<string, unknown>);
  if (signed) { req.memberId = signed; next(); return; }
  requireAuth(req, res, next);
});

const releaseDeps = {
  find: (id: string) => prisma.vaultRelease.findUnique({ where: { id }, select: { projectId: true } }),
  canAccess: canAccessVaultProject,
};

async function authorized(req: Request, res: Response): Promise<boolean> {
  const verdict = await authorizeRelease(req.memberId, req.params.id as string, releaseDeps);
  if (verdict === "not_found") { res.status(404).json({ error: "Release not found" }); return false; }
  if (verdict === "forbidden") { res.status(403).json({ error: "Forbidden" }); return false; }
  return true;
}

function handleError(res: Response, err: any, fallback: string): void {
  const status = typeof err?.status === "number" ? err.status : 500;
  if (status !== 500) { res.status(status).json({ error: err.message }); return; }
  console.error(fallback, err);
  res.status(500).json({ error: fallback });
}

// GET /api/vault-releases/:id — release record with its parsed manifest and stored readiness report.
vaultReleasesRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    if (!await authorized(req, res)) return;
    res.json(publicRelease(await getRelease(req.params.id as string), { withManifest: true }));
  } catch (err) { handleError(res, err, "Failed to load release"); }
});

// GET /api/vault-releases/:id/manifest — the exact stored manifest bytes.
vaultReleasesRouter.get("/:id/manifest", async (req: Request, res: Response) => {
  try {
    if (!await authorized(req, res)) return;
    const release = await getRelease(req.params.id as string);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="release-${release.id}-manifest.json"`);
    res.setHeader("X-Manifest-SHA256", release.manifestSha256);
    res.send(release.manifestJson);
  } catch (err) { handleError(res, err, "Failed to load manifest"); }
});

// GET /api/vault-releases/:id/package-url — short-lived signed link for the download below.
vaultReleasesRouter.get("/:id/package-url", async (req: Request, res: Response) => {
  try {
    if (!await authorized(req, res)) return;
    const id = req.params.id as string;
    const { exp, sig } = signVaultPath(signedPath(id), req.memberId!);
    res.json({ url: `/api/vault-releases/${encodeURIComponent(id)}/package?exp=${exp}&sig=${sig}&memberId=${encodeURIComponent(req.memberId!)}` });
  } catch (err) { handleError(res, err, "Failed to sign package link"); }
});

// GET /api/vault-releases/:id/package — the tar built only from the manifest's pinned versions.
vaultReleasesRouter.get("/:id/package", async (req: Request, res: Response) => {
  try {
    if (!await authorized(req, res)) return;
    const release = await getRelease(req.params.id as string);
    const file = releasePackageFile(release.id);
    const size = await fs.promises.stat(file).then((s) => s.size).catch(() => -1);
    if (release.packageState !== "READY" || !release.packageSha256 || size !== Number(release.packageSize)) {
      // Missing cache or unfinished build: start one (leased, so repeats are harmless) and tell the client to wait.
      buildReleasePackage(release.id, { actorId: req.memberId }).catch((err) => console.error("[vault-release] build error", err));
      res.status(409).json({ error: release.packageState === "FAILED" ? `Package build failed: ${release.packageError}` : "The package is being built; try again shortly", state: release.packageState === "READY" ? "BUILDING" : release.packageState });
      return;
    }
    const manifest = JSON.parse(release.manifestJson) as { release: { changeRequestNumber: number } };
    res.setHeader("Content-Type", "application/x-tar");
    res.setHeader("Content-Length", size);
    res.setHeader("Content-Disposition", `attachment; filename="CR-${manifest.release.changeRequestNumber}-release-${release.packageSha256.slice(0, 12)}.tar"`);
    res.setHeader("X-Package-SHA256", release.packageSha256);
    res.setHeader("X-Manifest-SHA256", release.manifestSha256);
    logAuditEvent({ projectId: release.projectId, memberId: req.memberId ?? null, source: "WEB", eventType: "VAULT_RELEASE_PACKAGE_DOWNLOADED", payload: { releaseId: release.id, crId: release.changeRequestId, packageSha256: release.packageSha256 } }).catch(console.error);
    const stream = fs.createReadStream(file);
    stream.on("error", () => { if (!res.headersSent) res.status(500).end(); else res.destroy(); });
    stream.pipe(res);
  } catch (err) { handleError(res, err, "Failed to download package"); }
});

// POST /api/vault-releases/:id/package — retry or (re)build the package now.
vaultReleasesRouter.post("/:id/package", async (req: Request, res: Response) => {
  try {
    if (!await authorized(req, res)) return;
    res.json(await buildReleasePackage(req.params.id as string, { actorId: req.memberId }));
  } catch (err) { handleError(res, err, "Failed to build package"); }
});

// POST /api/vault-releases/:id/verify — rebuild from pinned versions and compare hashes.
vaultReleasesRouter.post("/:id/verify", async (req: Request, res: Response) => {
  try {
    if (!await authorized(req, res)) return;
    res.json(await verifyRelease(req.params.id as string, req.memberId ?? null));
  } catch (err) { handleError(res, err, "Failed to verify release"); }
});
