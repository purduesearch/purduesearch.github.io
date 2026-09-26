import { randomBytes, randomUUID, createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { Router, type Request, type Response } from "express";
import multer from "multer";
import { prisma } from "../db/prisma.js";
import { requireAuth, requireAdmin } from "./auth.js";
import { canAccessVaultProject, enqueueVaultUpload, processVaultJob, publicJob } from "../services/vaultGithubJobs.js";
import { commitVaultFile, installationToken, remoteHead, sha256File, VaultGitError } from "../services/vaultGitTransport.js";
import { isAdminMember, sanitizeFileName } from "../services/vaultService.js";
import { findRepoInstallId } from "../services/githubService.js";
import { sameUpload } from "../services/vaultJobProtocol.js";
import { cutoverBlockers, cutoverTransition, hasCutoverAuthority, reconcileVaultRepository, repairMessages, vaultLegacyCounts, verifyProjectBytes } from "../services/vaultCutoverService.js";
import { autoWatchSoon } from "../services/vaultNotificationService.js";
import { rebuildVaultSearch, reindexItemSoon } from "../services/vaultSearchService.js";

export const vaultGithubRouter = Router();
vaultGithubRouter.use(requireAuth);

function safeError(error: unknown): string {
  return error instanceof VaultGitError ? error.code : "GIT_ERROR";
}

vaultGithubRouter.get("/projects/:projectId/vault/repository", async (req: Request, res: Response) => {
  const projectId = req.params.projectId as string;
  if (!(await canAccessVaultProject(req.memberId, projectId))) { res.status(403).json({ error: "Forbidden" }); return; }
  const repo = await prisma.vaultRepository.findUnique({ where: { projectId }, include: { projectRepo: { select: { slug: true } } } });
  if (!repo) { res.json({ repository: null }); return; }
  res.json({ repository: { id: repo.id, projectRepoId: repo.projectRepoId, slug: repo.projectRepo.slug, branch: repo.branch, writeEnabled: repo.writeEnabled, setupStatus: repo.setupStatus, migrationState: repo.migrationState, healthError: repo.healthError, repair: repo.healthError ? repairMessages[repo.healthError] : null, lastHeadSha: repo.lastHeadSha, driftHeadSha: repo.driftHeadSha, lastSyncedAt: repo.lastSyncedAt, phase3VerifiedAt: repo.phase3VerifiedAt, cutoverAt: repo.cutoverAt, retentionUntil: repo.retentionUntil } });
});

vaultGithubRouter.get("/projects/:projectId/vault/cutover", requireAdmin, async (req: Request, res: Response) => {
  const projectId = req.params.projectId as string;
  const repo = await prisma.vaultRepository.findUnique({ where: { projectId } });
  if (!repo) { res.status(404).json({ error: "Vault repository not configured" }); return; }
  const [counts, pendingJobs] = await Promise.all([vaultLegacyCounts(projectId), prisma.vaultUploadJob.count({ where: { projectId, state: { in: ["UPLOADED", "LFS_STORED", "COMMITTED", "RETRY"] } } })]);
  res.json({ projectId, state: repo.migrationState, writeEnabled: repo.writeEnabled, counts, phase3Baseline: { checkedAt: repo.phase3VerifiedAt, driveVersions: repo.phase3DriveVersions, driveThumbnails: repo.phase3DriveThumbnails, driveItems: repo.phase3DriveItems }, pendingJobs, legacyWritesInFlight: repo.legacyWritesInFlight, branchLeaseUntil: repo.leaseUntil, expectedHeadSha: repo.lastHeadSha, driftHeadSha: repo.driftHeadSha, cutoverAt: repo.cutoverAt, retentionUntil: repo.retentionUntil, healthError: repo.healthError, repair: repo.healthError ? repairMessages[repo.healthError] : null });
});

vaultGithubRouter.post("/projects/:projectId/vault/cutover", requireAdmin, async (req: Request, res: Response) => {
  if (!hasCutoverAuthority(req.header("X-Vault-Cutover-Authority"))) { res.status(403).json({ error: "Configured cutover authority required" }); return; }
  const projectId = req.params.projectId as string;
  const action = req.body.action;
  const repo = await prisma.vaultRepository.findUnique({ where: { projectId }, include: { projectRepo: true } });
  if (!repo) { res.status(404).json({ error: "Vault repository not configured" }); return; }
  if (action === "freeze") {
    const transition = cutoverTransition("freeze", repo.migrationState);
    if (!transition) { res.status(409).json({ error: "Already cut over; use rollback" }); return; }
    await prisma.vaultRepository.update({ where: { id: repo.id }, data: transition });
    res.json({ state: "FROZEN", writeEnabled: false }); return;
  }
  if (action === "rollback") {
    // Rollback changes new writes only. Existing GitHub versions retain pinned reads.
    await prisma.vaultRepository.update({ where: { id: repo.id }, data: cutoverTransition("rollback", repo.migrationState)! });
    res.json({ state: "DRIVE_ROLLBACK", writeEnabled: false }); return;
  }
  if (repo.migrationState !== "FROZEN") { res.status(409).json({ error: "Freeze Vault writes first" }); return; }
  if (action === "accept-reviewed-head") {
    const reviewedHeadSha = req.body.reviewedHeadSha;
    if (typeof reviewedHeadSha !== "string" || !/^[0-9a-f]{40}$/.test(reviewedHeadSha)) { res.status(400).json({ error: "Reviewed commit SHA required" }); return; }
    const pending = await prisma.vaultUploadJob.count({ where: { projectId, state: { in: ["UPLOADED", "LFS_STORED", "COMMITTED", "RETRY"] } } });
    if (pending || repo.legacyWritesInFlight || (repo.leaseUntil && repo.leaseUntil > new Date())) { res.status(409).json({ error: "PENDING_JOBS", pendingJobs: pending, legacyWritesInFlight: repo.legacyWritesInFlight }); return; }
    try {
      const actual = await remoteHead(repo.projectRepo.slug, repo.branch, repo.installId);
      if (actual !== reviewedHeadSha) { res.status(409).json({ error: "BRANCH_DRIFT", actualHeadSha: actual }); return; }
      await verifyProjectBytes(projectId);
      await prisma.vaultRepository.update({ where: { id: repo.id }, data: { lastHeadSha: actual, driftHeadSha: null, healthError: null, lastSyncedAt: new Date() } });
      res.json({ state: "FROZEN", lastHeadSha: actual });
    } catch (error) { const code = safeError(error); res.status(409).json({ error: code, repair: repairMessages[code] }); }
    return;
  }
  if (action === "record-phase3") {
    const checkedAt = new Date(req.body.checkedAt);
    if (!Number.isFinite(checkedAt.getTime()) || checkedAt > new Date() || Date.now() - checkedAt.getTime() > 7 * 24 * 60 * 60 * 1000) { res.status(400).json({ error: "Recent Phase 3 verification timestamp required" }); return; }
    const baseline = req.body.counts;
    if (!baseline || ![baseline.driveVersions, baseline.driveThumbnails, baseline.driveItems].every((value: unknown) => value === 0)) { res.status(409).json({ error: "Phase 3 report must verify zero legacy versions, thumbnails, and folders" }); return; }
    const current = await vaultLegacyCounts(projectId);
    if (Object.values(current).some(value => value !== 0)) { res.status(409).json({ error: "LEGACY_BYTES", counts: current }); return; }
    await prisma.vaultRepository.update({ where: { id: repo.id }, data: { phase3VerifiedAt: checkedAt, phase3DriveVersions: 0, phase3DriveThumbnails: 0, phase3DriveItems: 0 } });
    res.json({ state: "FROZEN", phase3VerifiedAt: checkedAt, counts: current }); return;
  }
  if (action !== "activate") { res.status(400).json({ error: "Unknown cutover action" }); return; }
  const current = await vaultLegacyCounts(projectId);
  const pendingJobs = await prisma.vaultUploadJob.count({ where: { projectId, state: { in: ["UPLOADED", "LFS_STORED", "COMMITTED", "RETRY"] } } });
  const baseline = repo.phase3VerifiedAt && repo.phase3DriveVersions != null && repo.phase3DriveThumbnails != null && repo.phase3DriveItems != null ? { driveVersions: repo.phase3DriveVersions, driveThumbnails: repo.phase3DriveThumbnails, driveItems: repo.phase3DriveItems } : null;
  let actualHead: string | null;
  try { actualHead = await remoteHead(repo.projectRepo.slug, repo.branch, repo.installId); }
  catch (error) { const code = safeError(error); res.status(503).json({ error: code, repair: repairMessages[code] }); return; }
  const blockers = cutoverBlockers(baseline, current, pendingJobs + repo.legacyWritesInFlight + (repo.leaseUntil && repo.leaseUntil > new Date() ? 1 : 0), actualHead === repo.lastHeadSha && !repo.driftHeadSha);
  if (blockers.length) { res.status(409).json({ blockers, counts: current, pendingJobs, actualHeadSha: actualHead, repair: blockers.map(code => repairMessages[code]) }); return; }
  try {
    const verifiedObjects = await verifyProjectBytes(projectId);
    const recheckedHead = await remoteHead(repo.projectRepo.slug, repo.branch, repo.installId);
    if (recheckedHead !== actualHead) throw new VaultGitError("BRANCH_DRIFT");
    const retentionDays = Number(process.env.VAULT_DRIVE_RETENTION_DAYS);
    if (!Number.isInteger(retentionDays) || retentionDays < 1) { res.status(409).json({ error: "Set VAULT_DRIVE_RETENTION_DAYS before cutover" }); return; }
    const at = new Date();
    const updated = await prisma.vaultRepository.updateMany({ where: { id: repo.id, migrationState: "FROZEN", lastHeadSha: actualHead, driftHeadSha: null, legacyWritesInFlight: 0, OR: [{ leaseUntil: null }, { leaseUntil: { lt: at } }] }, data: { migrationState: "GITHUB_ACTIVE", writeEnabled: true, cutoverAt: at, retentionUntil: new Date(at.getTime() + retentionDays * 86400000), healthError: null } });
    if (!updated.count) { res.status(409).json({ error: "Cutover state changed; retry verification" }); return; }
    // Migration moved storage pointers: rebuild this project's search rows from source.
    rebuildVaultSearch(projectId).catch((err) => console.error("[vault-search] post-cutover rebuild failed", projectId, err?.message || err));
    res.json({ state: "GITHUB_ACTIVE", writeEnabled: true, verifiedObjects, headSha: actualHead, cutoverAt: at });
  } catch (error) { const code = safeError(error); await prisma.vaultRepository.update({ where: { id: repo.id }, data: { healthError: code } }); res.status(409).json({ error: code, repair: repairMessages[code] }); }
});

vaultGithubRouter.post("/projects/:projectId/vault/repository/reconcile", requireAdmin, async (req: Request, res: Response) => {
  const result = await reconcileVaultRepository(req.params.projectId as string);
  if (!result) { res.status(404).json({ error: "Vault repository not configured" }); return; }
  res.json(result);
});

vaultGithubRouter.get("/projects/:projectId/vault/repository/health", async (req: Request, res: Response) => {
  const projectId = req.params.projectId as string;
  if (!(await canAccessVaultProject(req.memberId, projectId))) { res.status(403).json({ error: "Forbidden" }); return; }
  const repo = await prisma.vaultRepository.findUnique({ where: { projectId }, include: { projectRepo: true } });
  if (!repo) { res.status(404).json({ error: "Vault repository not configured" }); return; }
  try {
    const token = await installationToken(repo.installId);
    const response = await fetch(`https://api.github.com/repos/${repo.projectRepo.slug}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "Constellation-Vault" } });
    if (!response.ok) { const code = [401, 403, 404].includes(response.status) ? "AUTH" : "GIT_ERROR"; await prisma.vaultRepository.update({ where: { id: repo.id }, data: { healthError: code } }); res.status(502).json({ status: code, repair: repairMessages[code] }); return; }
    const details = await response.json() as { private?: boolean; permissions?: { push?: boolean } };
    const head = await remoteHead(repo.projectRepo.slug, repo.branch, repo.installId);
    const status = !details.private ? "NOT_PRIVATE" : !details.permissions?.push ? "PERMISSION" : head !== repo.lastHeadSha ? "BRANCH_DRIFT" : ["LFS_QUOTA", "LFS_MISSING", "VERIFY_FAILED"].includes(repo.healthError ?? "") ? repo.healthError! : repo.setupStatus !== "READY" ? "VERIFY_REQUIRED" : "READY";
    await prisma.vaultRepository.update({ where: { id: repo.id }, data: { healthError: status === "READY" ? null : status } });
    res.json({ status, repair: repairMessages[status] ?? null, branch: repo.branch, slug: repo.projectRepo.slug, visibility: details.private ? "private" : "public", lastHeadSha: repo.lastHeadSha, actualHeadSha: head, lastSyncedAt: repo.lastSyncedAt });
  } catch (error) { const code = safeError(error); await prisma.vaultRepository.update({ where: { id: repo.id }, data: { healthError: code } }); res.status(502).json({ status: code, repair: repairMessages[code] }); }
});

vaultGithubRouter.get("/projects/:projectId/vault/repository/commits", async (req: Request, res: Response) => {
  const projectId = req.params.projectId as string;
  if (!(await canAccessVaultProject(req.memberId, projectId))) { res.status(403).json({ error: "Forbidden" }); return; }
  const repo = await prisma.vaultRepository.findUnique({ where: { projectId }, include: { projectRepo: true } });
  if (!repo) { res.json({ commits: [] }); return; }
  try {
    const token = await installationToken(repo.installId);
    const response = await fetch(`https://api.github.com/repos/${repo.projectRepo.slug}/commits?sha=${encodeURIComponent(repo.branch)}&path=vault%2Fitems&per_page=8`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "Constellation-Vault" } });
    if (!response.ok) { res.status(502).json({ error: "Could not read repository commits" }); return; }
    const rows = await response.json() as Array<{ sha: string; commit: { message: string; author?: { name?: string; date?: string } } }>;
    res.json({ commits: rows.map(row => ({ sha: row.sha, message: row.commit.message.split("\n")[0], author: row.commit.author?.name ?? "Unknown", at: row.commit.author?.date, url: `https://github.com/${repo.projectRepo.slug}/commit/${row.sha}` })) });
  } catch { res.status(502).json({ error: "Could not read repository commits" }); }
});

vaultGithubRouter.put("/projects/:projectId/vault/repository", requireAdmin, async (req: Request, res: Response) => {
  const projectId = req.params.projectId as string;
  const projectRepoId = String(req.body.projectRepoId ?? "");
  const branch = String(req.body.branch ?? "vault");
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/.test(branch) || branch.endsWith("/") || branch.endsWith(".") || branch.includes("..") || branch.includes("//") || branch.includes(".lock")) { res.status(400).json({ error: "Invalid branch" }); return; }
  let linked = await prisma.projectRepo.findFirst({ where: { id: projectRepoId, projectId } });
  if (linked && !linked.installId) {
    const installId = await findRepoInstallId(linked.slug);
    if (installId) linked = await prisma.projectRepo.update({ where: { id: linked.id }, data: { installId } });
  }
  if (!linked?.installId) { res.status(400).json({ error: "Linked repository needs an App installation" }); return; }
  const binding = await prisma.vaultRepository.findUnique({ where: { projectId } });
  if (binding && await prisma.vaultUploadJob.count({ where: { projectId, state: { in: ["UPLOADED", "LFS_STORED", "COMMITTED", "RETRY"] } } })) { res.status(409).json({ error: "Resolve pending Vault jobs before reconfiguring" }); return; }
  if (binding && (binding.projectRepoId !== projectRepoId || binding.branch !== branch)) {
    const [versions, jobs] = await Promise.all([prisma.vaultVersion.count({ where: { item: { projectId } } }), prisma.vaultUploadJob.count({ where: { projectId } })]);
    if (versions || jobs) { res.status(409).json({ error: "Repository switch requires migration" }); return; }
  }
  const sameSlug = await prisma.projectRepo.findMany({ where: { slug: { equals: linked.slug, mode: "insensitive" }, vaultRepository: { isNot: null } }, include: { vaultRepository: true } });
  if (sameSlug.some(row => row.vaultRepository?.projectId !== projectId && row.vaultRepository?.branch === branch)) { res.status(409).json({ error: "Repository branch already bound to another Vault" }); return; }
  try {
    const token = await installationToken(linked.installId);
    const info = await fetch(`https://api.github.com/repos/${linked.slug}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "Constellation-Vault" } });
    if (!info.ok) { res.status(502).json({ error: "APP_PERMISSION" }); return; }
    const details = await info.json() as { private?: boolean; permissions?: { push?: boolean } };
    if (!details.private || !details.permissions?.push) { res.status(400).json({ error: "Vault repository must be private and App writable" }); return; }
    const head = await remoteHead(linked.slug, branch, linked.installId);
    const repoSlug = linked.slug.toLowerCase();
    const repo = await prisma.vaultRepository.upsert({ where: { projectId }, create: { projectId, projectRepoId, repoSlug, branch, installId: linked.installId, lastHeadSha: head, setupStatus: "PENDING" }, update: { projectRepoId, repoSlug, branch, installId: linked.installId, lastHeadSha: head, setupStatus: "PENDING", writeEnabled: false, healthError: null } });
    res.json({ repository: { id: repo.id, projectRepoId, branch, setupStatus: repo.setupStatus, lastHeadSha: head, writeEnabled: false } });
  } catch (error: any) { res.status(error?.code === "P2002" ? 409 : 502).json({ error: error?.code === "P2002" ? "Repository branch already bound to another Vault" : safeError(error) }); }
});

vaultGithubRouter.post("/projects/:projectId/vault/repository/verify", requireAdmin, async (req: Request, res: Response) => {
  const projectId = req.params.projectId as string;
  const repo = await prisma.vaultRepository.findUnique({ where: { projectId }, include: { projectRepo: true } });
  if (!repo || repo.writeEnabled) { res.status(409).json({ error: "Disable writes before setup verification" }); return; }
  const scratch = path.join(process.cwd(), "uploads", `vault-probe-${randomUUID()}`);
  const bytes = randomBytes(256);
  await fs.mkdir(path.dirname(scratch), { recursive: true });
  await fs.writeFile(scratch, bytes);
  try {
    const head = await remoteHead(repo.projectRepo.slug, repo.branch, repo.installId);
    if (head !== repo.lastHeadSha) { res.status(409).json({ error: "BRANCH_DRIFT", actualHeadSha: head }); return; }
    const result = await commitVaultFile({ slug: repo.projectRepo.slug, branch: repo.branch, installId: repo.installId, itemId: "healthcheck", itemName: "Vault transport health", fileName: "probe.bin", diskPath: scratch, sha256: createHash("sha256").update(bytes).digest("hex"), size: BigInt(bytes.length), note: "Verify Vault Git LFS transport", expectedHeadSha: head, jobId: randomUUID() }, async committed => {
      await prisma.vaultRepository.update({ where: { id: repo.id }, data: { lastHeadSha: committed.commitSha, setupStatus: "VERIFYING" } });
    });
    await prisma.vaultRepository.update({ where: { id: repo.id }, data: { setupStatus: "READY", healthError: null, lastHeadSha: result.commitSha, lastSyncedAt: new Date() } });
    res.json({ setupStatus: "READY", lastHeadSha: result.commitSha });
  } catch (error) {
    const code = safeError(error);
    await prisma.vaultRepository.update({ where: { id: repo.id }, data: { setupStatus: "ERROR", healthError: code } });
    res.status(502).json({ error: code });
  } finally { await fs.rm(scratch, { force: true }); }
});

vaultGithubRouter.patch("/projects/:projectId/vault/repository", requireAdmin, async (req: Request, res: Response) => {
  const projectId = req.params.projectId as string;
  if (typeof req.body.writeEnabled !== "boolean") { res.status(400).json({ error: "writeEnabled required" }); return; }
  const repo = await prisma.vaultRepository.findUnique({ where: { projectId } });
  if (repo && ["FROZEN", "GITHUB_ACTIVE", "DRIVE_ROLLBACK"].includes(repo.migrationState)) { res.status(409).json({ error: "Use the controlled cutover endpoint" }); return; }
  if (!repo || (req.body.writeEnabled && repo.setupStatus !== "READY")) { res.status(409).json({ error: "Verify repository before enabling writes" }); return; }
  await prisma.vaultRepository.update({ where: { id: repo.id }, data: { writeEnabled: req.body.writeEnabled } });
  res.json({ writeEnabled: req.body.writeEnabled });
});

const upload = multer({ storage: multer.diskStorage({ destination: (_req, _file, cb) => { const dir = path.resolve("uploads/vault-tmp"); fs.mkdir(dir, { recursive: true }).then(() => cb(null, dir)).catch(error => cb(error, dir)); } }), limits: { fileSize: (Number(process.env.VAULT_MAX_UPLOAD_MB) || 512) * 1024 * 1024, files: 1 } });
vaultGithubRouter.post("/projects/:projectId/vault/github-items", upload.single("file"), async (req: Request, res: Response) => {
  let createdItemId: string | null = null;
  try {
    const projectId = req.params.projectId as string;
    if (!(await canAccessVaultProject(req.memberId, projectId))) { res.status(403).json({ error: "Forbidden" }); return; }
    const key = req.header("Idempotency-Key");
    const note = typeof req.body.note === "string" ? req.body.note.trim() : "";
    const name = sanitizeFileName(String(req.body.name ?? ""));
    if (!req.file || !key || key.length > 160 || !note || !name) { res.status(400).json({ error: "file, name, Idempotency-Key, and change description required" }); return; }
    const old = await prisma.vaultUploadJob.findUnique({ where: { projectId_idempotencyKey: { projectId, idempotencyKey: key } } });
    if (old) {
      if (!sameUpload(old, { uploaderId: req.memberId!, sha256: await sha256File(req.file.path), note, fileName: sanitizeFileName(req.file.originalname) || "file" })) { res.status(409).json({ error: "IDEMPOTENCY_CONFLICT" }); return; }
      res.status(202).json({ itemId: old.itemId, job: publicJob(old) }); return;
    }
    const expectedHeadSha = typeof req.body.expectedHeadSha === "string" ? req.body.expectedHeadSha : null;
    if (expectedHeadSha !== null && !/^[0-9a-f]{40}$/.test(expectedHeadSha)) { res.status(400).json({ error: "Invalid expected head" }); return; }
    const repo = await prisma.vaultRepository.findUnique({ where: { projectId } });
    if (!repo?.writeEnabled || repo.setupStatus !== "READY") { res.status(409).json({ error: "VAULT_NOT_ENABLED" }); return; }
    const item = await prisma.vaultItem.create({ data: { projectId, name, description: typeof req.body.description === "string" ? req.body.description.trim() || null : null, driveFolderId: null, createdById: req.memberId } });
    createdItemId = item.id;
    const job = await enqueueVaultUpload({ projectId, itemId: item.id, uploaderId: req.memberId!, idempotencyKey: key, temporaryPath: req.file.path, fileName: req.file.originalname, mimeType: req.file.mimetype, note, expectedHeadSha });
    if (job.itemId !== item.id) { await prisma.vaultItem.delete({ where: { id: item.id } }); createdItemId = null; }
    else { autoWatchSoon(req.memberId, item.id, projectId); reindexItemSoon(item.id); }
    processVaultJob(job.id).catch(() => undefined);
    res.status(202).json({ itemId: job.itemId, job: publicJob(job) });
  } catch {
    if (createdItemId) await prisma.vaultItem.delete({ where: { id: createdItemId } }).catch(() => undefined);
    res.status(400).json({ error: "UPLOAD_FAILED" });
  } finally { if (req.file) await fs.rm(req.file.path, { force: true }); }
});
vaultGithubRouter.post("/vault/items/:id/github-versions", upload.single("file"), async (req: Request, res: Response) => {
  try {
    const item = await prisma.vaultItem.findUnique({ where: { id: req.params.id as string }, select: { id: true, projectId: true, deletedAt: true } });
    if (!item || item.deletedAt) { res.status(404).json({ error: "Item not found" }); return; }
    if (!(await canAccessVaultProject(req.memberId, item.projectId))) { res.status(403).json({ error: "Forbidden" }); return; }
    const key = req.header("Idempotency-Key");
    const note = typeof req.body.note === "string" ? req.body.note.trim() : "";
    if (!req.file || !key || key.length > 160 || !note) { res.status(400).json({ error: "file, Idempotency-Key, and change description required" }); return; }
    const expectedHeadSha = typeof req.body.expectedHeadSha === "string" ? req.body.expectedHeadSha : null;
    if (expectedHeadSha !== null && !/^[0-9a-f]{40}$/.test(expectedHeadSha)) { res.status(400).json({ error: "Invalid expected head" }); return; }
    const job = await enqueueVaultUpload({ projectId: item.projectId, itemId: item.id, uploaderId: req.memberId!, idempotencyKey: key, temporaryPath: req.file.path, fileName: req.file.originalname, mimeType: req.file.mimetype, note, expectedHeadSha });
    processVaultJob(job.id).catch(() => undefined);
    res.status(202).json({ job: publicJob(job) });
  } catch (error) { res.status(error instanceof Error && error.message === "IDEMPOTENCY_CONFLICT" ? 409 : 400).json({ error: error instanceof Error && ["IDEMPOTENCY_CONFLICT", "VAULT_NOT_ENABLED"].includes(error.message) ? error.message : "UPLOAD_FAILED" }); }
  finally { if (req.file) await fs.rm(req.file.path, { force: true }); }
});

vaultGithubRouter.get("/vault/upload-jobs/:id", async (req: Request, res: Response) => {
  const job = await prisma.vaultUploadJob.findUnique({ where: { id: req.params.id as string } });
  if (!job) { res.status(404).json({ error: "Job not found" }); return; }
  if (!(await canAccessVaultProject(req.memberId, job.projectId))) { res.status(403).json({ error: "Forbidden" }); return; }
  res.json({ job: publicJob(job) });
});

vaultGithubRouter.post("/vault/upload-jobs/:id/retry", async (req: Request, res: Response) => {
  const job = await prisma.vaultUploadJob.findUnique({ where: { id: req.params.id as string } });
  if (!job) { res.status(404).json({ error: "Job not found" }); return; }
  if (!(await canAccessVaultProject(req.memberId, job.projectId)) || (job.uploaderId !== req.memberId && !(await isAdminMember(req.memberId!)))) { res.status(403).json({ error: "Forbidden" }); return; }
  if (job.state === "INDEXED") { res.json({ job: publicJob(job) }); return; }
  if (job.state === "FAILED" && !(await fs.stat(job.diskPath).catch(() => null))) { res.status(410).json({ error: "Upload expired; start a new check-in" }); return; }
  if (job.errorCode === "BRANCH_DRIFT") {
    const head = typeof req.body.expectedHeadSha === "string" ? req.body.expectedHeadSha : null;
    if (!head || !/^[0-9a-f]{40}$/.test(head)) { res.status(409).json({ error: "Provide current expectedHeadSha" }); return; }
    await prisma.vaultUploadJob.update({ where: { id: job.id }, data: { expectedHeadSha: head, errorCode: null, retryAt: null, state: "RETRY" } });
  } else await prisma.vaultUploadJob.update({ where: { id: job.id }, data: { errorCode: null, retryAt: null, state: "RETRY" } });
  processVaultJob(job.id).catch(() => undefined);
  res.status(202).json({ job: publicJob(await prisma.vaultUploadJob.findUniqueOrThrow({ where: { id: job.id } })) });
});
