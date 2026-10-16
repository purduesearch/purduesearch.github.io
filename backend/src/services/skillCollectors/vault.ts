// Constellation Vault -> CAD artifacts (check-ins) and REVIEW artifacts (change
// request decisions and sign-offs). Metadata only: names, notes, revision and BOM
// shape. The DB has no CAD feature tree, and file bytes are never read.

import { prisma } from "../../db/prisma.js";
import { EXCLUDE_TRAINING } from "../trainingSandboxService.js";
import { crReviewArtifact, enforceCap, vaultVersionArtifact, type CrReviewInput } from "../skillArtifactCore.js";
import { emptyResult, type CollectResult, type CollectWindow } from "./types.js";

export async function collectVault(win: CollectWindow): Promise<CollectResult> {
  const out = emptyResult();
  const wanted = win.memberIds ? new Set(win.memberIds) : null;
  const want = (id: string | null | undefined): id is string => !!id && (!wanted || wanted.has(id));

  const versions = await prisma.vaultVersion.findMany({
    where: {
      createdAt: { gt: win.since, lte: win.until },
      uploadedById: wanted ? { in: [...wanted] } : { not: null },
      item: { deletedAt: null, project: EXCLUDE_TRAINING },
    },
    select: {
      id: true, itemId: true, versionNumber: true, fileName: true, sizeBytes: true, revision: true, releasedAt: true, note: true,
      createdAt: true, uploadedById: true,
      item: {
        select: {
          name: true, partNumber: true, description: true, projectId: true,
          project: { select: { name: true } },
          _count: { select: { versions: true } },
          parentLinks: { select: { parent: { select: { name: true } } } },
          childLinks: { select: { child: { select: { name: true } } } },
        },
      },
      crItems: { select: { changeRequest: { select: { number: true, title: true, taskId: true } } } },
    },
    orderBy: { createdAt: "asc" },
    take: win.maxArtifacts + 1,
  });

  const kept = versions.slice(0, win.maxArtifacts);
  if (versions.length > win.maxArtifacts) {
    out.truncated = true;
    out.resumeFrom = kept[kept.length - 1]?.createdAt ?? null;
  }
  for (const v of kept) {
    if (!v.uploadedById) continue;
    const linkedTasks = [...new Set(v.crItems.map(c => c.changeRequest.taskId).filter((id): id is string => !!id))];
    out.artifacts.push(enforceCap(vaultVersionArtifact({
      taskId: linkedTasks.length === 1 ? linkedTasks[0] : null,
      versionId: v.id, itemId: v.itemId, itemName: v.item.name, partNumber: v.item.partNumber, itemDescription: v.item.description,
      fileName: v.fileName, sizeBytes: v.sizeBytes, versionNumber: v.versionNumber, versionCount: v.item._count.versions,
      revision: v.revision, released: !!v.releasedAt, note: v.note, uploadedAt: v.createdAt, uploadedById: v.uploadedById,
      projectId: v.item.projectId, projectName: v.item.project?.name ?? null,
      parentNames: v.item.parentLinks.map((e) => e.parent.name), childNames: v.item.childLinks.map((e) => e.child.name),
      crTitles: v.crItems.map((c) => `CR-${c.changeRequest.number} ${c.changeRequest.title}`),
    }, win.maxChars), win.maxChars));
  }

  // Reviews are bounded separately so a busy review week cannot crowd out check-ins.
  const crs = await prisma.changeRequest.findMany({
    where: { status: { in: ["APPROVED", "REJECTED"] }, reviewedAt: { gt: win.since, lte: win.until }, project: EXCLUDE_TRAINING },
    select: {
      id: true, number: true, title: true, description: true, status: true, reviewedAt: true, reviewNote: true, reviewerId: true,
      authorId: true, projectId: true, taskId: true, project: { select: { name: true } },
      items: { select: { item: { select: { name: true } } } },
      signoffs: { select: { memberId: true } },
    },
    orderBy: { reviewedAt: "asc" },
    take: win.maxArtifacts,
  });
  for (const c of crs) {
    if (!c.reviewedAt || (c.status !== "APPROVED" && c.status !== "REJECTED")) continue;
    const input: CrReviewInput = {
      taskId: c.taskId,
      crId: c.id, number: c.number, title: c.title, description: c.description, status: c.status, decidedAt: c.reviewedAt,
      reviewNote: c.reviewNote, itemNames: c.items.map((i) => i.item.name), projectId: c.projectId, projectName: c.project?.name ?? null,
    };
    if (want(c.reviewerId) && c.reviewerId !== c.authorId) out.artifacts.push(enforceCap(crReviewArtifact(input, c.reviewerId, "reviewer", win.maxChars), win.maxChars));
    for (const s of c.signoffs) {
      if (want(s.memberId) && s.memberId !== c.authorId && s.memberId !== c.reviewerId) {
        out.artifacts.push(enforceCap(crReviewArtifact(input, s.memberId, "signoff", win.maxChars), win.maxChars));
      }
    }
  }
  return out;
}
