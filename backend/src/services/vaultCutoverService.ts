import { timingSafeEqual } from "node:crypto";
import { prisma } from "../db/prisma.js";
import { remoteHead, verifyVaultObject, VaultGitError } from "./vaultGitTransport.js";

export const repairMessages: Record<string, string> = {
  AUTH: "GitHub App access was revoked. Reinstall or grant this repository to the App, then verify again.",
  PERMISSION: "The Vault branch rejected the App push. Review branch protection and ruleset bypass permissions.",
  GIT_ERROR: "GitHub is unavailable or Git transport failed. Keep writes paused and retry after service recovery.",
  LFS_QUOTA: "Git LFS storage or bandwidth quota stopped transfers. Raise the owner spending cap before retrying.",
  LFS_MISSING: "A pinned Git LFS object is missing. Restore it from the retained original and verify its SHA-256.",
  BRANCH_DRIFT: "An external push changed the Vault branch. Review the diff and reconcile the head before retrying.",
  VERIFY_FAILED: "Downloaded bytes differ from the recorded SHA-256. Restore the object before cutover.",
  LEGACY_BYTES: "Drive-backed versions or thumbnails remain. Finish and verify Phase 3 migration first.",
  PENDING_JOBS: "Vault uploads remain pending. Drain or repair every job before cutover.",
};

export function hasCutoverAuthority(value: unknown): boolean {
  const expected = process.env.VAULT_CUTOVER_AUTHORITY;
  if (!expected || typeof value !== "string") return false;
  const left = Buffer.from(value), right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** A durable write intent makes a freeze wait for uploads that passed the first gate. */
export async function acquireLegacyVaultWrite(projectId: string): Promise<"UNBOUND" | "ACQUIRED" | "PAUSED"> {
  const repo = await prisma.vaultRepository.findUnique({ where: { projectId }, select: { id: true } });
  if (!repo) return "UNBOUND";
  const claimed = await prisma.vaultRepository.updateMany({ where: { id: repo.id, writeEnabled: false, migrationState: { notIn: ["FROZEN", "GITHUB_ACTIVE"] } }, data: { legacyWritesInFlight: { increment: 1 } } });
  return claimed.count ? "ACQUIRED" : "PAUSED";
}

export async function releaseLegacyVaultWrite(projectId: string): Promise<void> {
  await prisma.vaultRepository.updateMany({ where: { projectId, legacyWritesInFlight: { gt: 0 } }, data: { legacyWritesInFlight: { decrement: 1 } } });
}

export async function vaultLegacyCounts(projectId: string) {
  const item = { projectId };
  const [driveVersions, driveThumbnails, driveItems] = await Promise.all([
    prisma.vaultVersion.count({ where: { item, storageProvider: "DRIVE" } }),
    prisma.vaultVersion.count({ where: { item, thumbnailFileId: { not: null }, OR: [{ thumbnailProvider: null }, { thumbnailProvider: "DRIVE" }] } }),
    prisma.vaultItem.count({ where: { projectId, driveFolderId: { not: null } } }),
  ]);
  return { driveVersions, driveThumbnails, driveItems };
}

export function cutoverBlockers(baseline: { driveVersions: number; driveThumbnails: number; driveItems: number } | null, current: { driveVersions: number; driveThumbnails: number; driveItems: number }, pendingJobs: number, headMatches: boolean): string[] {
  const blockers: string[] = [];
  if (!baseline || Object.values(baseline).some(value => value !== 0) || Object.values(current).some(value => value !== 0)) blockers.push("LEGACY_BYTES");
  if (pendingJobs) blockers.push("PENDING_JOBS");
  if (!headMatches) blockers.push("BRANCH_DRIFT");
  return blockers;
}

export function branchStatus(expectedHead: string | null, actualHead: string | null): "READY" | "BRANCH_DRIFT" {
  return expectedHead === actualHead ? "READY" : "BRANCH_DRIFT";
}

export function cutoverTransition(action: "freeze" | "rollback", state: string): { migrationState: string; writeEnabled: false } | null {
  if (action === "freeze") return state === "GITHUB_ACTIVE" ? null : { migrationState: "FROZEN", writeEnabled: false };
  return { migrationState: "DRIVE_ROLLBACK", writeEnabled: false };
}

export async function verifyProjectBytes(projectId: string): Promise<number> {
  const versions = await prisma.vaultVersion.findMany({ where: { item: { projectId } }, select: { id: true, storageProvider: true, repositoryId: true, branch: true, filePath: true, commitSha: true, sha256: true, sizeBytes: true, thumbnailProvider: true, thumbnailPath: true, thumbnailCommitSha: true, thumbnailSha256: true, thumbnailLfsSize: true } });
  const repo = await prisma.vaultRepository.findUniqueOrThrow({ where: { projectId }, include: { projectRepo: true } });
  let checked = 0;
  for (const version of versions) {
    if (version.storageProvider !== "GITHUB" || version.repositoryId !== repo.id || !version.filePath || !version.commitSha || !version.sha256 || version.sizeBytes == null) throw new VaultGitError("VERIFY_FAILED");
    await verifyVaultObject(repo.projectRepo.slug, version.branch || repo.branch, repo.installId, version.commitSha, version.filePath, version.sha256, version.sizeBytes);
    checked++;
    if (version.thumbnailProvider) {
      if (version.thumbnailProvider !== "GITHUB" || !version.thumbnailPath || !version.thumbnailCommitSha || !version.thumbnailSha256 || version.thumbnailLfsSize == null) throw new VaultGitError("VERIFY_FAILED");
      await verifyVaultObject(repo.projectRepo.slug, version.branch || repo.branch, repo.installId, version.thumbnailCommitSha, version.thumbnailPath, version.thumbnailSha256, version.thumbnailLfsSize);
      checked++;
    }
  }
  return checked;
}

export async function reconcileVaultRepository(projectId: string, webhookHead?: string | null) {
  const repo = await prisma.vaultRepository.findUnique({ where: { projectId }, include: { projectRepo: true } });
  if (!repo) return null;
  try {
    const actual = await remoteHead(repo.projectRepo.slug, repo.branch, repo.installId);
    const drift = branchStatus(repo.lastHeadSha, actual) === "BRANCH_DRIFT";
    // A webhook is only a hint. Always fetch the actual head before changing health.
    const error = drift ? "BRANCH_DRIFT" : ["PERMISSION", "LFS_QUOTA", "LFS_MISSING", "VERIFY_FAILED"].includes(repo.healthError ?? "") ? repo.healthError : null;
    await prisma.vaultRepository.update({ where: { id: repo.id }, data: { driftHeadSha: drift ? actual : null, healthError: error, lastSyncedAt: new Date() } });
    return { status: error ?? "READY", expectedHeadSha: repo.lastHeadSha, actualHeadSha: actual, webhookHeadSha: webhookHead ?? null, repair: error ? repairMessages[error] : null };
  } catch (error) {
    const code = error instanceof VaultGitError ? error.code : "GIT_ERROR";
    await prisma.vaultRepository.update({ where: { id: repo.id }, data: { healthError: code } });
    return { status: code, expectedHeadSha: repo.lastHeadSha, actualHeadSha: null, webhookHeadSha: webhookHead ?? null, repair: repairMessages[code] };
  }
}

export async function reconcileAllVaultRepositories(): Promise<void> {
  const repositories = await prisma.vaultRepository.findMany({ select: { projectId: true } });
  for (const repo of repositories) await reconcileVaultRepository(repo.projectId);
}
