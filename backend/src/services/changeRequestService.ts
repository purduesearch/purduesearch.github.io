// Constellation Vault — change request business logic (create/update/cancel/
// approve/reject). Revision letters are only ever stamped onto VaultVersion /
// VaultItem inside approveCr's single transaction (see Architecture reference
// invariant #1 in the plan) — never anywhere else in this file.

import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { logAuditEvent } from "./activityService.js";
import { createNotification } from "./notificationCrud.js";
import { nextRevisionLetter, allocateCrNumber, isAdminMember, MEMBER_SUMMARY } from "./vaultService.js";
import type { ChangeRequestStatus } from "@prisma/client";
import { reviewStatus, syncPr } from "./vaultPrReviewService.js";
import { buildReviewItems, proposalFingerprint, reviewGate } from "./vaultReviewPolicy.js";
import { buildReleasePackage, loadReleaseSnapshot, prepareRelease } from "./vaultReleaseService.js";
import { buildManifest, type ReadinessReport } from "./vaultReleasePolicy.js";
import { notifyCrDecision } from "./vaultNotificationService.js";
import { vaultLink } from "./vaultSearchCore.js";
import { reindexCrSoon, reindexItemSoon } from "./vaultSearchService.js";

const CR_INCLUDE = {
  author: MEMBER_SUMMARY,
  reviewer: MEMBER_SUMMARY,
  items: {
    include: {
      item: { select: { id: true, name: true, partNumber: true, currentRevision: true } },
      version: { select: { id: true, versionNumber: true, fileName: true, revision: true } },
    },
  },
} as const;

export type CrItemInput = { itemId: string; versionId: string; note?: string | null };

export type CreateCrInput = {
  title: string;
  description?: string | null;
  taskId?: string | null;
  items: CrItemInput[];
};

export type UpdateCrInput = {
  title?: string;
  description?: string | null;
  taskId?: string | null;
  releaseNotes?: string | null;
  items?: CrItemInput[];
};

function notFound(message: string) {
  return Object.assign(new Error(message), { status: 404 });
}
function badRequest(message: string) {
  return Object.assign(new Error(message), { status: 400 });
}
function conflict(message: string) {
  return Object.assign(new Error(message), { status: 409 });
}
function forbidden(message: string) {
  return Object.assign(new Error(message), { status: 403 });
}

// ── Shared helpers ────────────────────────────────────────────

/**
 * Validate a client-supplied item list for a CR: each entry must reference a
 * real, non-deleted VaultItem in the project and a VaultVersion that belongs
 * to it; itemIds must not repeat. `targetRevision` is always computed
 * server-side from the item's current revision — client values are ignored.
 */
async function validateCrItems(
  projectId: string,
  items: CrItemInput[]
): Promise<{ itemId: string; versionId: string; targetRevision: string; note: string | null }[]> {
  if (!Array.isArray(items) || items.length === 0) {
    throw badRequest("At least one item is required");
  }

  const seen = new Set<string>();
  for (const entry of items) {
    if (!entry?.itemId || !entry?.versionId) {
      throw badRequest("Each item requires itemId and versionId");
    }
    if (seen.has(entry.itemId)) {
      throw badRequest("Duplicate itemId in items");
    }
    seen.add(entry.itemId);
  }

  // Two batched lookups instead of 2N sequential round-trips.
  const [foundItems, foundVersions] = await Promise.all([
    prisma.vaultItem.findMany({ where: { id: { in: items.map((e) => e.itemId) } } }),
    prisma.vaultVersion.findMany({ where: { id: { in: items.map((e) => e.versionId) } } }),
  ]);
  const itemById = new Map(foundItems.map((it) => [it.id, it]));
  const versionById = new Map(foundVersions.map((v) => [v.id, v]));

  const result: { itemId: string; versionId: string; targetRevision: string; note: string | null }[] = [];
  for (const entry of items) {
    const item = itemById.get(entry.itemId);
    if (!item || item.deletedAt || item.projectId !== projectId) {
      throw badRequest(`Vault item ${entry.itemId} not found in this project`);
    }
    const version = versionById.get(entry.versionId);
    if (!version || version.itemId !== item.id) {
      throw badRequest(`Version ${entry.versionId} does not belong to item ${entry.itemId}`);
    }
    result.push({
      itemId: item.id,
      versionId: version.id,
      targetRevision: nextRevisionLetter(item.currentRevision),
      note: entry.note?.trim() || null,
    });
  }
  return result;
}

async function assertAuthorOrAdmin(actorId: string, authorId: string | null, action: string): Promise<void> {
  if (authorId === actorId) return;
  if (!(await isAdminMember(actorId))) {
    throw forbidden(`Only the author or an admin can ${action} this change request`);
  }
}

async function notifyAdminsOfSubmission(cr: {
  id: string;
  projectId: string;
  number: number;
  title: string;
}): Promise<void> {
  const admins = await prisma.member.findMany({ where: { isAdmin: true }, select: { id: true, slackId: true } });
  const message = `New change request "${cr.title}" (CR-${cr.number}) needs review.`;
  for (const admin of admins) {
    await createNotification({
      type: "VAULT_CR_SUBMITTED",
      recipientId: admin.id,
      projectId: cr.projectId,
      message,
      metadata: { crId: cr.id, number: cr.number, link: vaultLink({ projectId: cr.projectId, crId: cr.id }) },
      slackText: message,
    });
  }
}

// ── CRUD ──────────────────────────────────────────────────────

export async function createCr(projectId: string, authorId: string, data: CreateCrInput) {
  const title = data.title?.trim();
  if (!title) throw badRequest("title is required");

  if (data.taskId) {
    const task = await prisma.task.findUnique({ where: { id: data.taskId }, select: { projectId: true } });
    if (!task || task.projectId !== projectId) {
      throw badRequest("taskId must reference a task in the same project");
    }
  }

  const validatedItems = await validateCrItems(projectId, data.items);
  const number = await allocateCrNumber(projectId);

  const cr = await prisma.$transaction((tx) =>
    tx.changeRequest.create({
      data: {
        projectId,
        number,
        title,
        description: data.description ?? null,
        taskId: data.taskId ?? null,
        authorId,
        items: { create: validatedItems },
      },
      include: CR_INCLUDE,
    })
  );

  logAuditEvent({
    projectId, memberId: authorId, source: "WEB",
    eventType: "CHANGE_REQUEST_CREATED",
    payload: { crId: cr.id, number: cr.number, title: cr.title, itemCount: validatedItems.length },
  }).catch(console.error);

  notifyAdminsOfSubmission(cr).catch((err) => console.error("[changeRequestService] notify admins error:", err));
  reindexCrSoon(cr.id);

  // Pack C: warn about items that other assemblies use (where-used), so the
  // author/reviewer can weigh downstream impact. Advisory only — never blocks.
  const warnings = (
    await Promise.all(
      validatedItems.map(async (vi) => {
        const edges = await prisma.vaultBomEdge.findMany({
          where: { childId: vi.itemId },
          include: { parent: { select: { id: true, name: true, partNumber: true, deletedAt: true } } },
        });
        const usedIn = edges
          .filter((e) => !e.parent.deletedAt)
          .map((e) => ({ id: e.parent.id, name: e.parent.name, partNumber: e.parent.partNumber }));
        return usedIn.length > 0 ? { itemId: vi.itemId, usedIn } : null;
      })
    )
  ).filter((w): w is { itemId: string; usedIn: { id: string; name: string; partNumber: string | null }[] } => w !== null);

  return { ...cr, warnings };
}

export async function updateCr(crId: string, actorId: string, data: UpdateCrInput) {
  const existing = await prisma.changeRequest.findUnique({ where: { id: crId } });
  if (!existing) throw notFound("Change request not found");
  if (existing.status !== "OPEN") throw conflict("Only an open change request can be edited");
  await assertAuthorOrAdmin(actorId, existing.authorId, "edit");

  const updateData: { title?: string; description?: string | null; taskId?: string | null; releaseNotes?: string | null } = {};
  if (typeof data.title === "string") {
    const trimmed = data.title.trim();
    if (!trimmed) throw badRequest("title cannot be empty");
    updateData.title = trimmed;
  }
  if (data.description !== undefined) updateData.description = data.description;
  if (data.releaseNotes !== undefined) updateData.releaseNotes = data.releaseNotes;
  if (data.taskId !== undefined) {
    if (data.taskId) {
      const task = await prisma.task.findUnique({ where: { id: data.taskId }, select: { projectId: true } });
      if (!task || task.projectId !== existing.projectId) {
        throw badRequest("taskId must reference a task in the same project");
      }
    }
    updateData.taskId = data.taskId;
  }

  const validatedItems = data.items !== undefined ? await validateCrItems(existing.projectId, data.items) : null;

  const updated = await prisma.$transaction(async (tx) => {
    if (validatedItems) {
      await tx.changeRequestItem.deleteMany({ where: { changeRequestId: crId } });
      await tx.changeRequestItem.createMany({
        data: validatedItems.map((vi) => ({ changeRequestId: crId, ...vi })),
      });
    }
    return tx.changeRequest.update({ where: { id: crId }, data: updateData, include: CR_INCLUDE });
  });

  // Sign-offs are kept but no longer count once the proposed versions change;
  // record how many went stale so the audit trail explains the pending gate.
  const staleSignoffs = validatedItems
    ? await prisma.vaultSignoff.count({ where: { changeRequestId: crId, fingerprint: { not: proposalFingerprint(validatedItems) } } })
    : 0;
  logAuditEvent({
    projectId: existing.projectId, memberId: actorId, source: "WEB",
    eventType: "CHANGE_REQUEST_UPDATED",
    payload: { crId, number: existing.number, changedFields: Object.keys(updateData), itemsReplaced: !!validatedItems, staleSignoffs },
  }).catch(console.error);
  reindexCrSoon(crId);

  return updated;
}

export async function cancelCr(crId: string, actorId: string, opts: { reviewNote?: string } = {}) {
  const cr = await prisma.changeRequest.findUnique({ where: { id: crId } });
  if (!cr) throw notFound("Change request not found");
  if (cr.status !== "OPEN") throw conflict("Change request is not open");
  await assertAuthorOrAdmin(actorId, cr.authorId, "cancel");

  const updated = await prisma.changeRequest.update({
    where: { id: crId },
    data: { status: "CANCELLED", reviewerId: actorId, reviewedAt: new Date(), reviewNote: opts.reviewNote ?? null },
    include: CR_INCLUDE,
  });

  logAuditEvent({
    projectId: cr.projectId, memberId: actorId, source: "WEB",
    eventType: "CHANGE_REQUEST_CANCELLED",
    payload: { crId, number: cr.number },
  }).catch(console.error);
  reindexCrSoon(crId);

  return updated;
}

type ApproveTxResult = {
  updatedCr: Awaited<ReturnType<typeof getCr>>;
  releasedItems: { itemId: string; itemName: string; versionId: string; versionNumber: number; revision: string }[];
  projectId: string;
  authorId: string | null;
  number: number;
  title: string;
  release: { id: string; manifestSha256: string; entryCount: number };
};

async function runApproveTransaction(
  crId: string,
  reviewerId: string,
  opts: { reviewNote?: string; expectedFingerprint?: string; expectedHeadSha?: string | null; preReport?: ReadinessReport }
): Promise<ApproveTxResult> {
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const cr = await tx.changeRequest.findUnique({
            where: { id: crId },
            include: { items: { include: { version: true } } },
          });
          if (!cr) throw notFound("Change request not found");
          if (cr.status !== "OPEN") throw conflict("Change request is not open");
          if (opts.expectedFingerprint && proposalFingerprint(cr.items) !== opts.expectedFingerprint) throw conflict("Proposed versions changed during approval");
          if (opts.expectedHeadSha !== undefined && ((cr.prSnapshot as any)?.headSha ?? null) !== opts.expectedHeadSha) throw conflict("PR head changed during approval");
          const [rules, signoffs, repo, parents, vaultItems, members] = await Promise.all([
            tx.vaultReviewerRule.findMany({ where: { projectId: cr.projectId } }),
            tx.vaultSignoff.findMany({ where: { changeRequestId: crId } }),
            tx.vaultRepository.findUnique({ where: { projectId: cr.projectId }, select: { requiredChecks: true } }),
            tx.vaultBomEdge.findMany({ where: { parent: { projectId: cr.projectId } }, select: { childId: true, parentId: true } }),
            tx.vaultItem.findMany({ where: { id: { in: cr.items.map(i => i.itemId) } }, select: { id: true, partNumber: true } }),
            tx.projectMember.findMany({ where: { projectId: cr.projectId }, select: { memberId: true } }),
          ]);
          const membersSet = new Set(members.map(m => m.memberId));
          const gate = reviewGate({
            items: buildReviewItems(cr.items, vaultItems, parents),
            rules, signoffs: signoffs.filter(s => membersSet.has(s.memberId)),
            pr: cr.prSnapshot && typeof cr.prSnapshot === "object" ? cr.prSnapshot as any : null,
            prLinked: !!cr.prRepoSlug,
            requiredChecks: Array.isArray(repo?.requiredChecks) ? repo.requiredChecks.filter((v): v is string => typeof v === "string") : [],
            activeReviewerIds: membersSet,
          });
          if (gate.state !== "approved") throw conflict(`Review ${gate.state}: ${gate.reasons.join("; ")}`);

          const releasedItems: ApproveTxResult["releasedItems"] = [];
          const approvedAt = new Date();

          // Phase 7: pin the exact recursive BOM and real-byte hashes from this
          // same serializable snapshot. Any build-readiness blocker aborts the
          // approval; the manifest row is written below in the same commit.
          const revisions: Record<string, string> = {};
          for (const ci of cr.items) {
            const current = await tx.vaultItem.findUnique({ where: { id: ci.itemId }, select: { currentRevision: true, deletedAt: true } });
            if (!current || current.deletedAt) throw conflict("A vault item in this change request no longer exists");
            revisions[ci.itemId] = nextRevisionLetter(current.currentRevision);
          }
          const { snapshot } = await loadReleaseSnapshot(tx, crId, { includeTasks: false });
          const built = buildManifest(snapshot, { projectId: cr.projectId, changeRequestNumber: cr.number, title: cr.title, approvedAt, approvedById: reviewerId, revisions });

          for (const ci of cr.items) {
            const item = await tx.vaultItem.findUnique({ where: { id: ci.itemId } });
            if (!item || item.deletedAt) {
              throw conflict("A vault item in this change request no longer exists");
            }

            const revision = nextRevisionLetter(item.currentRevision);
            if (revision !== ci.targetRevision) {
              await tx.changeRequestItem.update({ where: { id: ci.id }, data: { targetRevision: revision } });
            }

            await tx.vaultVersion.update({
              where: { id: ci.versionId },
              data: { revision, releasedAt: approvedAt, releasedByCrId: crId },
            });
            await tx.vaultItem.update({ where: { id: ci.itemId }, data: { currentRevision: revision } });

            releasedItems.push({
              itemId: ci.itemId,
              itemName: item.name,
              versionId: ci.versionId,
              versionNumber: ci.version.versionNumber,
              revision,
            });
          }

          const updatedCr = await tx.changeRequest.update({
            where: { id: crId },
            data: {
              status: "APPROVED",
              reviewerId,
              reviewedAt: approvedAt,
              reviewNote: opts.reviewNote ?? null,
            },
            include: CR_INCLUDE,
          });

          // Open-task impact is read outside the transaction (it never changes
          // the pinned set); the stored report keeps it for the release page.
          const pre = opts.preReport;
          const readiness: ReadinessReport = pre
            ? { ...built.report, affectedTasks: pre.affectedTasks, warnings: [...built.report.warnings, ...pre.warnings.filter((w) => w.code === "AFFECTED_TASKS")] }
            : built.report;
          const release = await tx.vaultRelease.create({
            data: { projectId: cr.projectId, changeRequestId: crId, manifestJson: built.json, manifestSha256: built.sha256, readiness: readiness as unknown as Prisma.InputJsonValue, createdById: reviewerId },
            select: { id: true, manifestSha256: true },
          });

          return { updatedCr, releasedItems, projectId: cr.projectId, authorId: cr.authorId, number: cr.number, title: cr.title, release: { ...release, entryCount: built.manifest.entries.length } };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
    } catch (err: any) {
      // P2034: serialization/deadlock conflict — safe to retry from scratch.
      // P2002 here can only be the (itemId, revision) backstop firing on a
      // concurrent release of the same item — retrying recomputes the letter.
      if ((err?.code === "P2034" || err?.code === "P2002") && attempt < MAX_ATTEMPTS) continue;
      throw err;
    }
  }
}

export async function approveCr(crId: string, reviewerId: string, opts: { reviewNote?: string } = {}) {
  const linked = await prisma.changeRequest.findUnique({ where: { id: crId }, select: { prRepoSlug: true } });
  if (!linked) throw notFound("Change request not found");
  if (linked.prRepoSlug) await syncPr(crId);
  const gate = await reviewStatus(crId);
  if (gate.state !== "approved") throw conflict(`Review ${gate.state}: ${gate.reasons.join("; ")}`);
  // Build readiness: fail fast on blockers and hash any pinned legacy bytes
  // before opening the transaction, which re-checks the same rules.
  const preReport = await prepareRelease(crId);
  // Serializable isolation: two concurrent approvals touching the same item
  // would otherwise both read the same currentRevision under READ COMMITTED
  // and stamp duplicate revision letters. Retried on serialization conflicts
  // (P2034); the @@unique([itemId, revision]) constraint is the DB backstop.
  const result = await runApproveTransaction(crId, reviewerId, { ...opts, expectedFingerprint: gate.fingerprint, expectedHeadSha: gate.pr?.headSha ?? null, preReport });

  const { updatedCr, releasedItems, projectId, authorId, number, title, release } = result;

  for (const released of releasedItems) {
    logAuditEvent({
      projectId, memberId: reviewerId, source: "WEB",
      eventType: "VAULT_REVISION_RELEASED",
      payload: {
        itemId: released.itemId,
        itemName: released.itemName,
        versionId: released.versionId,
        versionNumber: released.versionNumber,
        revision: released.revision,
        crId,
      },
    }).catch(console.error);
  }
  logAuditEvent({
    projectId, memberId: reviewerId, source: "WEB",
    eventType: "CHANGE_REQUEST_APPROVED",
    payload: { crId, number, itemCount: releasedItems.length },
  }).catch(console.error);
  logAuditEvent({
    projectId, memberId: reviewerId, source: "WEB",
    eventType: "VAULT_RELEASE_MANIFEST_CREATED",
    payload: { crId, number, releaseId: release.id, manifestSha256: release.manifestSha256, entryCount: release.entryCount },
  }).catch(console.error);
  // The package is derived from the stored manifest and retried by cron on failure.
  buildReleasePackage(release.id, { actorId: reviewerId }).catch((err) => console.error("[changeRequestService] package build error:", err));

  notifyCrDecision({ id: crId, projectId, number, title, authorId, items: updatedCr.items }, "APPROVED", reviewerId);
  reindexCrSoon(crId);
  for (const released of releasedItems) reindexItemSoon(released.itemId);

  return updatedCr;
}

export async function rejectCr(crId: string, reviewerId: string, opts: { reviewNote?: string } = {}) {
  const cr = await prisma.changeRequest.findUnique({ where: { id: crId } });
  if (!cr) throw notFound("Change request not found");
  if (cr.status !== "OPEN") throw conflict("Change request is not open");

  const updated = await prisma.changeRequest.update({
    where: { id: crId },
    data: { status: "REJECTED", reviewerId, reviewedAt: new Date(), reviewNote: opts.reviewNote ?? null },
    include: CR_INCLUDE,
  });

  logAuditEvent({
    projectId: cr.projectId, memberId: reviewerId, source: "WEB",
    eventType: "CHANGE_REQUEST_REJECTED",
    payload: { crId, number: cr.number, reviewNote: opts.reviewNote ?? null },
  }).catch(console.error);

  notifyCrDecision({ ...cr, items: updated.items }, "REJECTED", reviewerId);
  reindexCrSoon(crId);

  return updated;
}

export async function listCrs(projectId: string, status?: ChangeRequestStatus) {
  return prisma.changeRequest.findMany({
    where: { projectId, ...(status ? { status } : {}) },
    orderBy: { number: "desc" },
    include: CR_INCLUDE,
  });
}

export async function getCr(crId: string) {
  const cr = await prisma.changeRequest.findUnique({ where: { id: crId }, include: CR_INCLUDE });
  if (!cr) throw notFound("Change request not found");
  return cr;
}

/** Global count of OPEN change requests across all projects (admin badge). */
export async function pendingCount(): Promise<number> {
  return prisma.changeRequest.count({ where: { status: "OPEN" } });
}
