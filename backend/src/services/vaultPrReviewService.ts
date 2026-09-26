import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { octokitForInstallation } from "./githubService.js";
import { logAuditEvent } from "./activityService.js";
import { buildReviewItems, canSignoff, proposalFingerprint, reviewGate, shouldAuditHead, type PrSnapshot, type ReviewItem } from "./vaultReviewPolicy.js";

const error = (status: number, message: string) => Object.assign(new Error(message), { status });
const asSnapshot = (value: unknown): PrSnapshot | null => value && typeof value === "object" ? value as PrSnapshot : null;

async function context(crId: string) {
  const cr = await prisma.changeRequest.findUnique({ where: { id: crId }, include: { items: { include: { item: true } }, signoffs: true } });
  if (!cr) throw error(404, "Change request not found");
  const [rules, repo, memberships, edges] = await Promise.all([
    prisma.vaultReviewerRule.findMany({ where: { projectId: cr.projectId }, include: { reviewer: { select: { id: true, displayName: true } } } }),
    prisma.vaultRepository.findUnique({ where: { projectId: cr.projectId } }),
    prisma.projectMember.findMany({ where: { projectId: cr.projectId }, select: { memberId: true } }),
    prisma.vaultBomEdge.findMany({ where: { parent: { projectId: cr.projectId } }, select: { childId: true, parentId: true } }),
  ]);
  const items: ReviewItem[] = buildReviewItems(cr.items, cr.items.map(ci => ci.item), edges);
  return { cr, rules, repo, items, memberIds: new Set(memberships.map(m => m.memberId)) };
}

export async function reviewStatus(crId: string) {
  const { cr, rules, repo, items, memberIds } = await context(crId);
  const requiredChecks = Array.isArray(repo?.requiredChecks) ? repo.requiredChecks.filter((v): v is string => typeof v === "string") : [];
  const gate = reviewGate({ items, rules, signoffs: cr.signoffs.filter(s => memberIds.has(s.memberId)), pr: asSnapshot(cr.prSnapshot), prLinked: !!cr.prRepoSlug, requiredChecks, activeReviewerIds: memberIds });
  return { ...gate, rules, signoffs: cr.signoffs, pr: asSnapshot(cr.prSnapshot), fingerprint: proposalFingerprint(items) };
}

export async function linkPr(crId: string, actorId: string, repoSlug: string, number: number) {
  const { cr } = await context(crId);
  if (cr.status !== "OPEN") throw error(409, "Change request is not open");
  const member = await prisma.member.findUnique({ where: { id: actorId }, select: { isAdmin: true, role: true } });
  if (cr.authorId !== actorId && !member?.isAdmin && member?.role !== "ADMIN") throw error(403, "Only the author or an admin can link a PR");
  const linked = await prisma.projectRepo.findFirst({ where: { projectId: cr.projectId, slug: { equals: repoSlug, mode: "insensitive" } } });
  if (!linked || !linked.installId || !Number.isInteger(number) || number < 1) throw error(400, "PR must belong to a linked project repository with an App installation");
  await prisma.$transaction(async tx => {
    await tx.vaultSignoff.deleteMany({ where: { changeRequestId: crId } });
    await tx.changeRequest.update({ where: { id: crId }, data: { prRepoSlug: linked.slug.toLowerCase(), prNumber: number, prSnapshot: Prisma.JsonNull, prSyncedAt: null } });
  });
  await syncPr(crId);
  logAuditEvent({ projectId: cr.projectId, memberId: actorId, source: "WEB", eventType: "CHANGE_REQUEST_PR_LINKED", payload: { crId, repoSlug: linked.slug, number } }).catch(console.error);
  return reviewStatus(crId);
}

export async function syncPr(crId: string) {
  const { cr } = await context(crId);
  if (!cr.prRepoSlug || !cr.prNumber) return reviewStatus(crId);
  const linked = await prisma.projectRepo.findFirst({ where: { projectId: cr.projectId, slug: { equals: cr.prRepoSlug, mode: "insensitive" } } });
  const client = linked?.installId ? octokitForInstallation(linked.installId) : null;
  if (!client) {
    const previous = asSnapshot(cr.prSnapshot);
    await prisma.changeRequest.update({ where: { id: crId }, data: { prSnapshot: { ...(previous || { title: "", state: "unknown", draft: false, headSha: "", author: "", reviews: [], checks: [], timeline: [] }), error: "GitHub App permission unavailable" }, prSyncedAt: new Date() } });
    throw error(503, "GitHub App permission unavailable");
  }
  const [owner, repo] = cr.prRepoSlug.split("/");
  try {
    const pull = await client.pulls.get({ owner, repo, pull_number: cr.prNumber });
    const headSha = pull.data.head.sha;
    const [reviews, checks, statuses, events] = await Promise.all([
      client.paginate(client.pulls.listReviews, { owner, repo, pull_number: cr.prNumber, per_page: 100 }),
      client.checks.listForRef({ owner, repo, ref: headSha, per_page: 100 }),
      client.repos.getCombinedStatusForRef({ owner, repo, ref: headSha }),
      client.paginate(client.issues.listEvents, { owner, repo, issue_number: cr.prNumber, per_page: 100 }),
    ]);
    const snapshot: PrSnapshot = {
      title: pull.data.title, state: pull.data.state, draft: !!pull.data.draft, headSha, author: pull.data.user?.login || "",
      reviews: reviews.map(r => ({ login: r.user?.login || "", state: r.state, submittedAt: r.submitted_at || "", headSha: r.commit_id })).filter(r => r.login),
      checks: [...checks.data.check_runs.map(c => ({ name: c.name, status: c.status, conclusion: c.conclusion })), ...statuses.data.statuses.map(s => ({ name: s.context, status: s.state === "pending" ? "in_progress" : "completed", conclusion: s.state === "success" ? "success" : s.state === "failure" || s.state === "error" ? "failure" : null }))],
      timeline: [
        { kind: "PR", label: "PR opened", at: pull.data.created_at, actor: pull.data.user?.login || undefined },
        ...reviews.map(r => ({ kind: "REVIEW", label: r.state, at: r.submitted_at || "", actor: r.user?.login || undefined })),
        ...events.map(e => ({ kind: "EVENT", label: e.event, at: e.created_at || "", actor: e.actor?.login || undefined })),
      ].filter(e => e.at).sort((a, b) => a.at.localeCompare(b.at)).slice(-100),
    };
    const previous = asSnapshot(cr.prSnapshot);
    await prisma.changeRequest.update({ where: { id: crId }, data: { prSnapshot: snapshot, prSyncedAt: new Date() } });
    if (shouldAuditHead(previous, snapshot)) {
      const staleSignoffs = cr.signoffs.filter(s => s.prHeadSha !== headSha).length;
      logAuditEvent({ projectId: cr.projectId, source: "WEB", eventType: "CHANGE_REQUEST_PR_SYNCED", payload: { crId, previousHeadSha: previous?.headSha, headSha, staleSignoffs, origin: "GITHUB" } }).catch(console.error);
    }
  } catch (cause: any) {
    const status = cause?.status;
    if (status === 403 || status === 404 || status === 401) {
      const previous = asSnapshot(cr.prSnapshot);
      await prisma.changeRequest.update({ where: { id: crId }, data: { prSnapshot: { ...(previous || { title: "", state: "unknown", draft: false, headSha: "", author: "", reviews: [], checks: [], timeline: [] }), error: "GitHub PR access lost; restore App permissions" }, prSyncedAt: new Date() } });
      throw error(503, "GitHub PR access lost; restore App permissions");
    }
    throw error(503, "GitHub PR status unavailable");
  }
  return reviewStatus(crId);
}

export async function signoffCr(crId: string, memberId: string, revoke = false) {
  const { cr, rules, items } = await context(crId);
  if (cr.status !== "OPEN") throw error(409, "Change request is not open");
  const membership = await prisma.projectMember.findUnique({ where: { projectId_memberId: { projectId: cr.projectId, memberId } } });
  if (!membership || !canSignoff(memberId, rules, items)) throw error(403, "You are not a required reviewer for these items");
  if (revoke) await prisma.vaultSignoff.deleteMany({ where: { changeRequestId: crId, memberId } });
  else {
    if (cr.prRepoSlug) await syncPr(crId);
    const current = await prisma.changeRequest.findUniqueOrThrow({ where: { id: crId } });
    const pr = asSnapshot(current.prSnapshot);
    if (pr?.error) throw error(503, pr.error);
    await prisma.vaultSignoff.upsert({ where: { changeRequestId_memberId: { changeRequestId: crId, memberId } }, create: { changeRequestId: crId, memberId, fingerprint: proposalFingerprint(items), prHeadSha: pr?.headSha || null }, update: { fingerprint: proposalFingerprint(items), prHeadSha: pr?.headSha || null, createdAt: new Date() } });
  }
  logAuditEvent({ projectId: cr.projectId, memberId, source: "WEB", eventType: revoke ? "CHANGE_REQUEST_SIGNOFF_REVOKED" : "CHANGE_REQUEST_SIGNED_OFF", payload: { crId } }).catch(console.error);
  return reviewStatus(crId);
}

/** Returns how many linked CRs failed to refresh, so a webhook caller can let GitHub redeliver. */
export async function syncLinkedPrs(repoSlug: string, number?: number): Promise<number> {
  if (!repoSlug) return 0;
  const crs = await prisma.changeRequest.findMany({ where: { prRepoSlug: repoSlug.toLowerCase(), ...(number ? { prNumber: number } : {}), status: "OPEN" }, select: { id: true } });
  let failed = 0;
  for (const cr of crs) await syncPr(cr.id).catch(err => { failed++; console.error("[vault-pr] sync failed", cr.id, err); });
  return failed;
}
