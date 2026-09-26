// Constellation Vault — Phase 7 release records, build readiness and
// assembly packages. The manifest is written inside approveCr's serializable
// transaction (changeRequestService.ts), so ClubPM's release stays the
// authority; everything here after that point only reads the stored manifest
// text. Package builds are leased, retryable and reproducible — see
// vaultReleasePackage.ts for the byte-level contract.

import fs from "node:fs";
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { prisma } from "../db/prisma.js";
import { logAuditEvent } from "./activityService.js";
import { getDriveFileStream } from "./driveService.js";
import { materializeVaultObject, sha256File, VaultGitError } from "./vaultGitTransport.js";
import { computeReadiness, versionsNeedingHash, ReleaseBlockedError, type PolicyVersion, type ReadinessReport, type ReleaseManifest, type ReleaseSnapshot } from "./vaultReleasePolicy.js";
import { parseManifest, ReleasePackageError, writeReleasePackage, type FetchEntry } from "./vaultReleasePackage.js";

// The plain client or the approval transaction (same omit-configured delegates).
type Db = Pick<typeof prisma, "changeRequest" | "vaultItem" | "vaultVersion" | "vaultBomEdge" | "vaultDrawingRequirement" | "task" | "vaultRepository">;

const error = (status: number, message: string) => Object.assign(new Error(message), { status });
export const RELEASE_DIR = process.env.VAULT_RELEASE_DIR || "uploads/vault-releases";
const BUILD_LEASE_MS = 30 * 60 * 1000;
const MAX_AUTO_ATTEMPTS = 6;
export const releasePackageFile = (releaseId: string) => path.join(RELEASE_DIR, `${releaseId}.tar`);

const VERSION_SELECT = {
  id: true, itemId: true, versionNumber: true, revision: true, releasedAt: true, fileName: true, mimeType: true,
  sizeBytes: true, sha256: true, storageProvider: true, repositoryId: true, branch: true, filePath: true,
  commitSha: true, blobSha: true, lfsOid: true, lfsSize: true, driveFileId: true,
} as const;

/** Everything the release policy needs, read through `db` (the approval transaction or the plain client). */
export async function loadReleaseSnapshot(db: Db, crId: string, opts: { includeTasks: boolean }): Promise<{ snapshot: ReleaseSnapshot; cr: { id: string; projectId: string; number: number; title: string; status: string; taskId: string | null } }> {
  const cr = await db.changeRequest.findUnique({ where: { id: crId }, include: { items: { select: { itemId: true, versionId: true } } } });
  if (!cr) throw error(404, "Change request not found");
  const projectId = cr.projectId;
  const [items, versions, edges, requirements, tasks, openCrs] = await Promise.all([
    db.vaultItem.findMany({ where: { projectId }, select: { id: true, name: true, partNumber: true, currentRevision: true, deletedAt: true, drawingForId: true } }),
    db.vaultVersion.findMany({ where: { OR: [{ id: { in: cr.items.map((i) => i.versionId) } }, { releasedAt: { not: null }, item: { projectId } }] }, select: VERSION_SELECT }),
    db.vaultBomEdge.findMany({ where: { parent: { projectId } }, select: { parentId: true, childId: true, quantity: true } }),
    db.vaultDrawingRequirement.findMany({ where: { projectId }, select: { id: true, scope: true, value: true, severity: true } }),
    opts.includeTasks ? db.task.findMany({ where: { projectId, archivedAt: null, status: { not: "DONE" } }, select: { id: true, title: true, status: true, description: true } }) : Promise.resolve([]),
    db.changeRequest.findMany({ where: { projectId, status: "OPEN" }, select: { id: true, number: true, taskId: true, items: { select: { itemId: true } } } }),
  ]);
  const repositoryIds = [...new Set(versions.map((v) => v.repositoryId).filter((v): v is string => !!v))];
  const repositories = repositoryIds.length ? await db.vaultRepository.findMany({ where: { id: { in: repositoryIds } }, select: { id: true, repoSlug: true } }) : [];
  const slugById = new Map(repositories.map((r) => [r.id, r.repoSlug]));
  const policyVersions: PolicyVersion[] = versions.map((v) => ({
    ...v,
    sizeBytes: v.sizeBytes ?? v.lfsSize ?? null,
    sha256: v.sha256 ? v.sha256.toLowerCase() : null,
    storageProvider: v.storageProvider,
    repositorySlug: v.repositoryId ? slugById.get(v.repositoryId) ?? null : null,
  }));
  return {
    cr: { id: cr.id, projectId, number: cr.number, title: cr.title, status: cr.status, taskId: cr.taskId },
    snapshot: {
      crId: cr.id,
      crItems: cr.items,
      linkedTaskId: cr.taskId,
      items,
      versions: policyVersions,
      edges,
      requirements,
      tasks: tasks.map((t) => ({ ...t, status: String(t.status) })),
      openCrs: openCrs.map((o) => ({ id: o.id, number: o.number, taskId: o.taskId, itemIds: o.items.map((i) => i.itemId) })),
    },
  };
}

/** Pre-approval build readiness and impact. Approved CRs return the report stored with their release. */
export async function getReadiness(crId: string): Promise<ReadinessReport & { stored?: boolean }> {
  const release = await prisma.vaultRelease.findUnique({ where: { changeRequestId: crId }, select: { readiness: true } });
  if (release) return { ...(release.readiness as unknown as ReadinessReport), stored: true };
  const { snapshot } = await loadReleaseSnapshot(prisma, crId, { includeTasks: true });
  return computeReadiness(snapshot);
}

/** Hash a legacy Drive version's stored bytes (never trusted from the client) and record it once. */
async function hashDriveVersion(version: PolicyVersion): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), "vault-hash-"));
  try {
    const file = await getDriveFileStream(version.driveFileId!);
    if (!file) throw error(409, `Stored bytes for ${version.fileName} (v${version.versionNumber}) could not be read from Drive; the release cannot be pinned.`);
    const target = path.join(dir, "file");
    await pipeline(file.stream as NodeJS.ReadableStream, fs.createWriteStream(target));
    const [sha256, info] = await Promise.all([sha256File(target), stat(target)]);
    if (version.sha256 && version.sha256 !== sha256) throw error(409, `Stored bytes for ${version.fileName} (v${version.versionNumber}) no longer match their recorded SHA-256.`);
    await prisma.vaultVersion.updateMany({ where: { id: version.id, sha256: null }, data: { sha256 } });
    await prisma.vaultVersion.updateMany({ where: { id: version.id, sizeBytes: null }, data: { sizeBytes: info.size } });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Runs before the approval transaction: fails fast on blockers and fills in
 * real-byte hashes for pinned legacy versions. The transaction re-checks
 * everything, so this is advisory for correctness and useful for messages.
 */
export async function prepareRelease(crId: string): Promise<ReadinessReport> {
  let { snapshot } = await loadReleaseSnapshot(prisma, crId, { includeTasks: true });
  const pending = versionsNeedingHash(snapshot);
  if (pending.length) {
    for (const version of pending) await hashDriveVersion(version);
    ({ snapshot } = await loadReleaseSnapshot(prisma, crId, { includeTasks: true }));
  }
  const report = computeReadiness(snapshot);
  if (report.state === "blocked") throw new ReleaseBlockedError(report.blockers);
  return report;
}

// ── Package builds ────────────────────────────────────────────

function gitFailure(err: unknown, entryPath: string): never {
  const code = err instanceof VaultGitError ? err.code : "GIT_ERROR";
  if (code === "LFS_MISSING" || code === "VERIFY_FAILED") throw new ReleasePackageError("MISSING_BYTES", `${entryPath}: the pinned LFS object is missing or does not match its SHA-256`);
  if (code === "AUTH" || code === "PERMISSION" || code === "LFS_QUOTA") throw new ReleasePackageError("STORAGE_ACCESS", `${entryPath}: GitHub access failed (${code}); restore the App installation or LFS quota and retry`);
  throw new ReleasePackageError("COMMIT_UNAVAILABLE", `${entryPath}: the pinned commit could not be fetched; the branch may have been force-pushed`);
}

/** Reads each entry by its pinned commit + path (GitHub) or file id (Drive). Never by branch head. */
export const storageFetchEntry: FetchEntry = async (entry) => {
  const s = entry.storage;
  if (s.provider === "GITHUB") {
    const repository = s.repositoryId ? await prisma.vaultRepository.findUnique({ where: { id: s.repositoryId }, select: { branch: true, installId: true, repoSlug: true } }) : null;
    if (!repository || !s.commitSha || !s.path || !s.repository) throw new ReleasePackageError("STORAGE_ACCESS", `${entry.packagePath}: the Vault repository record is missing`);
    try { return await materializeVaultObject(s.repository, s.branch || repository.branch, repository.installId, s.commitSha, s.path, entry.sha256); }
    catch (err) { gitFailure(err, entry.packagePath); }
  }
  if (!s.driveFileId) throw new ReleasePackageError("MISSING_BYTES", `${entry.packagePath}: no stored file id`);
  const file = await getDriveFileStream(s.driveFileId);
  if (!file) throw new ReleasePackageError("MISSING_BYTES", `${entry.packagePath}: the Drive file is missing`);
  const dir = await mkdtemp(path.join(tmpdir(), "vault-release-"));
  const target = path.join(dir, "file");
  try { await pipeline(file.stream as NodeJS.ReadableStream, fs.createWriteStream(target)); }
  catch { await rm(dir, { recursive: true, force: true }); throw new ReleasePackageError("MISSING_BYTES", `${entry.packagePath}: the Drive download failed`); }
  return { file: target, cleanup: () => rm(dir, { recursive: true, force: true }) };
};

const describeError = (err: unknown) => err instanceof ReleasePackageError ? err.message : "WRITE_FAILED: unexpected package build error";

async function packageFilePresent(release: { id: string; packageSize: bigint | null }): Promise<boolean> {
  try { return (await stat(releasePackageFile(release.id))).size === Number(release.packageSize); }
  catch { return false; }
}

/**
 * Build (or rebuild) a release's package under a lease. A rebuild whose hash
 * differs from the recorded one is refused, never swapped in silently.
 */
export async function buildReleasePackage(releaseId: string, deps: { fetchEntry?: FetchEntry; actorId?: string } = {}) {
  const current = await prisma.vaultRelease.findUnique({ where: { id: releaseId } });
  if (!current) throw error(404, "Release not found");
  if (current.packageState === "READY" && await packageFilePresent(current)) return publicRelease(current);
  const now = new Date();
  const claimed = await prisma.vaultRelease.updateMany({
    where: { id: releaseId, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
    data: { packageState: "BUILDING", leaseUntil: new Date(now.getTime() + BUILD_LEASE_MS), packageAttempts: { increment: 1 } },
  });
  if (!claimed.count) return publicRelease((await prisma.vaultRelease.findUnique({ where: { id: releaseId } }))!);
  const release = (await prisma.vaultRelease.findUnique({ where: { id: releaseId } }))!;
  let manifest: ReleaseManifest | null = null;
  try {
    manifest = parseManifest(release.manifestJson, release.manifestSha256);
    await mkdir(RELEASE_DIR, { recursive: true });
    const built = await writeReleasePackage(release.manifestJson, release.manifestSha256, releasePackageFile(releaseId), deps.fetchEntry || storageFetchEntry);
    if (release.packageSha256 && release.packageSha256 !== built.sha256) {
      await rm(releasePackageFile(releaseId), { force: true });
      throw new ReleasePackageError("HASH_MISMATCH", "rebuilt package differs from the recorded package SHA-256");
    }
    const updated = await prisma.vaultRelease.update({ where: { id: releaseId }, data: { packageState: "READY", packageSha256: built.sha256, packageSize: BigInt(built.size), packageError: null, packageBuiltAt: new Date(), leaseUntil: null } });
    logAuditEvent({ projectId: release.projectId, memberId: deps.actorId ?? null, source: "WEB", eventType: "VAULT_RELEASE_PACKAGE_BUILT", payload: { releaseId, crId: release.changeRequestId, packageSha256: built.sha256, sizeBytes: built.size, rebuild: !!release.packageSha256, attempts: updated.packageAttempts } }).catch(console.error);
    return publicRelease(updated);
  } catch (err) {
    const message = describeError(err);
    if (!(err instanceof ReleasePackageError)) console.error("[vault-release] package build failed", releaseId, err);
    const updated = await prisma.vaultRelease.update({ where: { id: releaseId }, data: { packageState: "FAILED", packageError: message.slice(0, 500), leaseUntil: null } });
    logAuditEvent({ projectId: release.projectId, memberId: deps.actorId ?? null, source: "WEB", eventType: "VAULT_RELEASE_PACKAGE_FAILED", payload: { releaseId, crId: release.changeRequestId, error: message.slice(0, 500), attempts: updated.packageAttempts, entryCount: manifest?.entries.length ?? null } }).catch(console.error);
    return publicRelease(updated);
  }
}

/** Rebuild from the pinned versions into a scratch file and compare with the recorded package hash. */
export async function verifyRelease(releaseId: string, actorId: string | null, deps: { fetchEntry?: FetchEntry } = {}) {
  const release = await prisma.vaultRelease.findUnique({ where: { id: releaseId } });
  if (!release) throw error(404, "Release not found");
  const dir = await mkdtemp(path.join(tmpdir(), "vault-verify-"));
  let result: { reproducible: boolean; manifestSha256: string; recordedPackageSha256: string | null; rebuiltPackageSha256: string | null; error: string | null };
  try {
    const built = await writeReleasePackage(release.manifestJson, release.manifestSha256, path.join(dir, "package.tar"), deps.fetchEntry || storageFetchEntry);
    result = { reproducible: !release.packageSha256 || release.packageSha256 === built.sha256, manifestSha256: release.manifestSha256, recordedPackageSha256: release.packageSha256, rebuiltPackageSha256: built.sha256, error: release.packageSha256 && release.packageSha256 !== built.sha256 ? "Rebuilt package differs from the recorded package" : null };
  } catch (err) {
    result = { reproducible: false, manifestSha256: release.manifestSha256, recordedPackageSha256: release.packageSha256, rebuiltPackageSha256: null, error: describeError(err) };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  logAuditEvent({ projectId: release.projectId, memberId: actorId, source: "WEB", eventType: "VAULT_RELEASE_VERIFIED", payload: { releaseId, crId: release.changeRequestId, ...result } }).catch(console.error);
  return result;
}

/** Cron: finish pending builds and retry failed ones with backoff via updatedAt. */
export async function retryReleasePackages(limit = 5): Promise<number> {
  const now = Date.now();
  const due = await prisma.vaultRelease.findMany({
    where: { OR: [
      { packageState: "PENDING", OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date(now) } }] },
      { packageState: "BUILDING", leaseUntil: { lt: new Date(now) } },
      { packageState: "FAILED", packageAttempts: { lt: MAX_AUTO_ATTEMPTS }, updatedAt: { lt: new Date(now - 10 * 60 * 1000) } },
    ] },
    orderBy: { createdAt: "asc" }, take: limit, select: { id: true },
  });
  for (const r of due) await buildReleasePackage(r.id).catch((err) => console.error("[vault-release] retry failed", r.id, err));
  return due.length;
}

// ── Read models ───────────────────────────────────────────────

type ReleaseRow = { id: string; projectId: string; changeRequestId: string; manifestJson: string; manifestSha256: string; readiness: unknown; createdById: string | null; packageState: string; packageSha256: string | null; packageSize: bigint | null; packageError: string | null; packageAttempts: number; packageBuiltAt: Date | null; createdAt: Date };

export function publicRelease(r: ReleaseRow, opts: { withManifest?: boolean } = {}) {
  let manifest: ReleaseManifest | null = null;
  try { manifest = JSON.parse(r.manifestJson) as ReleaseManifest; } catch { /* reported by the build */ }
  return {
    id: r.id, projectId: r.projectId, changeRequestId: r.changeRequestId, manifestSha256: r.manifestSha256,
    packageState: r.packageState, packageSha256: r.packageSha256, packageSize: r.packageSize === null ? null : r.packageSize.toString(),
    packageError: r.packageError, packageAttempts: r.packageAttempts, packageBuiltAt: r.packageBuiltAt, createdAt: r.createdAt, createdById: r.createdById,
    approvedAt: manifest?.release.approvedAt ?? null, changeRequestNumber: manifest?.release.changeRequestNumber ?? null, title: manifest?.release.title ?? null,
    entryCount: manifest?.entries.length ?? 0,
    ...(opts.withManifest ? { manifest, readiness: r.readiness } : {}),
  };
}

export async function getRelease(releaseId: string) {
  const release = await prisma.vaultRelease.findUnique({ where: { id: releaseId } });
  if (!release) throw error(404, "Release not found");
  return release;
}

export async function listReleases(projectId: string) {
  const rows = await prisma.vaultRelease.findMany({ where: { projectId }, orderBy: { createdAt: "desc" }, take: 100 });
  return rows.map((r) => publicRelease(r));
}

/** Only project members (or admins) may read a release; the check is injected so it can be tested without a database. */
export async function authorizeRelease(memberId: string | undefined, releaseId: string, deps: { find: (id: string) => Promise<{ projectId: string } | null>; canAccess: (memberId: string | undefined, projectId: string) => Promise<boolean> }): Promise<"ok" | "not_found" | "forbidden"> {
  if (!memberId) return "forbidden";
  const release = await deps.find(releaseId);
  if (!release) return "not_found";
  return (await deps.canAccess(memberId, release.projectId)) ? "ok" : "forbidden";
}
