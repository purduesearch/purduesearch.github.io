import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../db/prisma.js";
import { commitVaultFile, findCommittedJob, remoteHead, sha256File, verifyVaultObject, VaultGitError } from "./vaultGitTransport.js";
import { sanitizeFileName } from "./vaultService.js";
import { executeVaultJob, sameUpload, type StoredCommit } from "./vaultJobProtocol.js";
import { reconcileAllVaultRepositories } from "./vaultCutoverService.js";
import { actorName, autoWatchSoon, dispatchVaultEventSoon, enqueueVaultEvent } from "./vaultNotificationService.js";
import { checkinEventRows } from "./vaultNotifyCore.js";
import { indexVaultCommits, reindexItemSoon } from "./vaultSearchService.js";

const jobDir = path.resolve(process.env.VAULT_JOB_DIR || "uploads/vault-jobs");
const leaseMs = 60_000;
const owner = randomUUID();
let working = false;

export async function canAccessVaultProject(memberId: string | undefined, projectId: string): Promise<boolean> {
  if (!memberId) return false;
  const [member, membership] = await Promise.all([
    prisma.member.findUnique({ where: { id: memberId }, select: { isAdmin: true, role: true } }),
    prisma.projectMember.findFirst({ where: { memberId, projectId }, select: { memberId: true } }),
  ]);
  return !!member && (member.isAdmin || member.role === "ADMIN" || !!membership);
}

export function publicJob(job: { id: string; state: string; versionId: string | null; commitSha: string | null; errorCode: string | null; attempts: number; createdAt: Date; updatedAt: Date }) {
  return { id: job.id, state: job.state, versionId: job.versionId, commitSha: job.commitSha, errorCode: job.errorCode, attempts: job.attempts, createdAt: job.createdAt, updatedAt: job.updatedAt };
}

export async function enqueueVaultUpload(args: { projectId: string; itemId: string; uploaderId: string; idempotencyKey: string; temporaryPath: string; fileName: string; mimeType?: string; note: string; expectedHeadSha: string | null }) {
  const repo = await prisma.vaultRepository.findUnique({ where: { projectId: args.projectId } });
  if (!repo || !repo.writeEnabled || repo.setupStatus !== "READY" || ["FROZEN", "DRIVE_ROLLBACK"].includes(repo.migrationState)) throw new Error("VAULT_NOT_ENABLED");
  const existing = await prisma.vaultUploadJob.findUnique({ where: { projectId_idempotencyKey: { projectId: args.projectId, idempotencyKey: args.idempotencyKey } } });
  if (existing) {
    if (!sameUpload(existing, { itemId: args.itemId, uploaderId: args.uploaderId, sha256: await sha256File(args.temporaryPath), note: args.note, fileName: sanitizeFileName(args.fileName) || "file" })) throw new Error("IDEMPOTENCY_CONFLICT");
    return existing;
  }
  await mkdir(jobDir, { recursive: true });
  const id = randomUUID();
  const durablePath = path.join(jobDir, id);
  const fileName = sanitizeFileName(args.fileName) || "file";
  const sizeBytes = BigInt((await stat(args.temporaryPath)).size);
  if (sizeBytes > 2_147_483_647n) throw new Error("UPLOAD_TOO_LARGE");
  const sha256 = await sha256File(args.temporaryPath);
  await rename(args.temporaryPath, durablePath);
  try {
    return await prisma.vaultUploadJob.create({ data: { id, projectId: args.projectId, repositoryId: repo.id, itemId: args.itemId, uploaderId: args.uploaderId, idempotencyKey: args.idempotencyKey, diskPath: durablePath, fileName, mimeType: args.mimeType, note: args.note, sizeBytes, sha256, expectedHeadSha: args.expectedHeadSha } });
  } catch (error: any) {
    await rm(durablePath, { force: true });
    if (error?.code === "P2002") {
      const winner = await prisma.vaultUploadJob.findUnique({ where: { projectId_idempotencyKey: { projectId: args.projectId, idempotencyKey: args.idempotencyKey } } });
      if (winner && sameUpload(winner, { itemId: args.itemId, uploaderId: args.uploaderId, sha256, note: args.note, fileName })) return winner;
      throw new Error("IDEMPOTENCY_CONFLICT");
    }
    throw error;
  }
}

async function lease(repositoryId: string): Promise<boolean> {
  const now = new Date();
  const claimed = await prisma.vaultRepository.updateMany({ where: { id: repositoryId, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] }, data: { leaseOwner: owner, leaseUntil: new Date(now.getTime() + leaseMs) } });
  return claimed.count === 1;
}

async function indexCommitted(jobId: string): Promise<void> {
  const job = await prisma.vaultUploadJob.findUniqueOrThrow({ where: { id: jobId }, include: { repository: { include: { projectRepo: true } }, item: true } });
  if (!job.commitSha || !job.blobSha || !job.lfsOid) throw new Error("COMMIT_NOT_RECORDED");
  const relative = `vault/items/${job.itemId}/source/${job.fileName}`;
  const uploaderName = await actorName(job.uploaderId);
  const eventIds: string[] = [];
  await prisma.$transaction(async tx => {
    const current = await tx.vaultUploadJob.findUniqueOrThrow({ where: { id: jobId } });
    if (current.versionId) return;
    const latest = await tx.vaultVersion.aggregate({ where: { itemId: job.itemId }, _max: { versionNumber: true } });
    const version = await tx.vaultVersion.create({ data: { itemId: job.itemId, versionNumber: (latest._max.versionNumber ?? 0) + 1, fileName: job.fileName, mimeType: job.mimeType, sizeBytes: Number(job.sizeBytes), note: job.note, uploadedById: job.uploaderId, storageProvider: "GITHUB", repositoryId: job.repositoryId, branch: job.repository.branch, filePath: relative, commitSha: job.commitSha, blobSha: job.blobSha, sha256: job.sha256, lfsOid: job.lfsOid, lfsSize: Number(job.sizeBytes) } });
    await tx.vaultUploadJob.update({ where: { id: jobId }, data: { versionId: version.id, state: "INDEXED", errorCode: null, retryAt: null } });
    await tx.vaultRepository.update({ where: { id: job.repositoryId }, data: { lastHeadSha: job.commitSha, lastSyncedAt: new Date(), healthError: null } });
    // Notifications commit with the version: the event keys are the version id,
    // so a retried job can never announce the same check-in twice.
    const holder = job.item.checkedOutById && job.item.checkedOutById !== job.uploaderId ? job.item.checkedOutById : null;
    for (const event of checkinEventRows(job.item, version, job.uploaderId, uploaderName, holder)) {
      if (await enqueueVaultEvent(event, tx)) eventIds.push(event.id);
    }
  });
  for (const id of eventIds) dispatchVaultEventSoon(id);
  autoWatchSoon(job.uploaderId, job.itemId, job.projectId);
  reindexItemSoon(job.itemId);
  indexVaultCommits(job.projectId, job.repository.projectRepo.slug, [{ sha: job.commitSha, message: `${job.note.slice(0, 160)} [vault-job:${job.id}]`, authorName: uploaderName, at: new Date(), itemId: job.itemId }])
    .catch((err) => console.error("[vault-search] commit index failed", job.commitSha, err?.message || err));
  await rm(job.diskPath, { force: true });
}

export async function processVaultJob(jobId: string): Promise<void> {
  const job = await prisma.vaultUploadJob.findUnique({ where: { id: jobId }, include: { repository: { include: { projectRepo: true } }, item: true } });
  if (!job || job.state === "INDEXED" || job.state === "FAILED") return;
  let timer: NodeJS.Timeout | undefined;
  await executeVaultJob({
    expectedHead: job.expectedHeadSha,
    acquire: async () => { if (!(await lease(job.repositoryId))) return false; timer = setInterval(() => { prisma.vaultRepository.updateMany({ where: { id: job.repositoryId, leaseOwner: owner }, data: { leaseUntil: new Date(Date.now() + leaseMs) } }).catch(() => undefined); }, leaseMs / 3); return true; },
    release: async () => { if (timer) clearInterval(timer); await prisma.vaultRepository.updateMany({ where: { id: job.repositoryId, leaseOwner: owner }, data: { leaseOwner: null, leaseUntil: null } }); },
    storedCommit: async () => job.commitSha && job.blobSha && job.lfsOid ? { commitSha: job.commitSha, blobSha: job.blobSha, lfsOid: job.lfsOid } : null,
    recoverCommit: async () => {
      return findCommittedJob(job.repository.projectRepo.slug, job.repository.branch, job.repository.installId, job.id, job.itemId, job.fileName, job.sha256, job.sizeBytes);
    },
    actualHead: () => remoteHead(job.repository.projectRepo.slug, job.repository.branch, job.repository.installId),
    saveCommit: async (commit: StoredCommit) => { await prisma.vaultUploadJob.update({ where: { id: job.id }, data: { state: "COMMITTED", commitSha: commit.commitSha, blobSha: commit.blobSha, lfsOid: commit.lfsOid, errorCode: null, retryAt: null } }); },
    push: async onCommitted => {
      if (!fs.existsSync(job.diskPath) || await sha256File(job.diskPath) !== job.sha256) throw new VaultGitError("VERIFY_FAILED");
      await prisma.vaultUploadJob.update({ where: { id: job.id }, data: { attempts: { increment: 1 }, errorCode: null } });
      await commitVaultFile({ slug: job.repository.projectRepo.slug, branch: job.repository.branch, installId: job.repository.installId, itemId: job.itemId, itemName: job.item.name, fileName: job.fileName, diskPath: job.diskPath, sha256: job.sha256, size: job.sizeBytes, note: job.note, expectedHeadSha: job.expectedHeadSha, jobId: job.id }, onCommitted, async () => { await prisma.vaultUploadJob.update({ where: { id: job.id }, data: { state: "LFS_STORED" } }); }, false);
    },
    verify: (commit: StoredCommit) => verifyVaultObject(job.repository.projectRepo.slug, job.repository.branch, job.repository.installId, commit.commitSha, `vault/items/${job.itemId}/source/${job.fileName}`, job.sha256),
    index: async () => indexCommitted(job.id),
    fail: async code => { await prisma.vaultUploadJob.update({ where: { id: job.id }, data: { state: code === "VERIFY_FAILED" ? "FAILED" : "RETRY", errorCode: code, retryAt: code === "BRANCH_DRIFT" ? null : new Date(Date.now() + Math.min(3_600_000, 30_000 * 2 ** Math.min(job.attempts, 7))) } }); await prisma.vaultRepository.update({ where: { id: job.repositoryId }, data: { healthError: code } }); },
  });
}

export async function reconcileVaultJobs(): Promise<void> {
  if (working) return;
  working = true;
  try {
    const jobs = await prisma.vaultUploadJob.findMany({ where: { state: { in: ["UPLOADED", "LFS_STORED", "COMMITTED", "RETRY"] }, AND: [{ OR: [{ errorCode: null }, { errorCode: { not: "BRANCH_DRIFT" } }] }, { OR: [{ retryAt: null }, { retryAt: { lte: new Date() } }] }] }, orderBy: { createdAt: "asc" }, take: 20, select: { id: true } });
    for (const job of jobs) await processVaultJob(job.id);
  } finally { working = false; }
}

export async function sweepAbandonedVaultJobFiles(): Promise<void> {
  await mkdir(jobDir, { recursive: true });
  const cutoff = Date.now() - 48 * 60 * 60 * 1000;
  const failedCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const name of await fs.promises.readdir(jobDir)) {
    if (!/^[0-9a-f-]{36}$/.test(name)) continue;
    const file = path.join(jobDir, name);
    const info = await stat(file).catch(() => null);
    if (!info?.isFile() || info.mtimeMs >= cutoff) continue;
    const job = await prisma.vaultUploadJob.findUnique({ where: { id: name }, select: { state: true } });
    if (!job || job.state === "INDEXED" || (job.state === "FAILED" && info.mtimeMs < failedCutoff)) await rm(file, { force: true });
  }
}

export function startVaultJobWorker(): void {
  reconcileVaultJobs().catch(() => undefined);
  reconcileAllVaultRepositories().catch(() => undefined);
  sweepAbandonedVaultJobFiles().catch(() => undefined);
  setInterval(() => reconcileVaultJobs().catch(() => undefined), 30_000).unref();
  setInterval(() => reconcileAllVaultRepositories().catch(() => undefined), 5 * 60_000).unref();
  setInterval(() => sweepAbandonedVaultJobFiles().catch(() => undefined), 24 * 60 * 60 * 1000).unref();
}
