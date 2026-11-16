// Counted impact only. This service neither calls a model nor changes evidence,
// attestations, sharing preferences, achievements, or notification state.
import type { Prisma } from "@prisma/client";
import { METRICS, METRIC_VERSION } from "./impactMetricCore.js";
import { canonicalMap, projectedDisputes } from "./skillCatalogCore.js";
import { EXCLUDE_TRAINING } from "./trainingSandboxService.js";

export type ImpactTransaction = Pick<Prisma.TransactionClient,
  "member" | "project" | "projectMember" | "courseEnrollment" | "course" |
  "vaultItem" | "vaultVersion" | "changeRequest" | "skillEvidence" | "task" |
  "labVisit" | "event" | "eventRsvp" | "outreachSubmission" | "blogPost" |
  "milestone" | "skill" | "skillAssessment" | "skillDispute" | "skillOnetLink" |
  "onetSoftware" | "impactSnapshot" | "$queryRaw">;

export interface ImpactStore {
  /** Must pin one connection and roll back every write if work rejects. */
  transaction<T>(work: (tx: ImpactTransaction) => Promise<T>, options: {
    timeout: number; maxWait: number; isolationLevel: "RepeatableRead";
  }): Promise<T>;
}
export interface ImpactDependencies { store?: ImpactStore; now?: () => Date }
export type ImpactDetail = {
  breakdown: Prisma.InputJsonObject;
  projects: { id: string; name: string }[];
  /** Earliest recorded contributing occurrence; null when absent (especially lead tenure). */
  since: string | null;
  tool: string | null;
  onTimeRate?: number | null;
  tasksShipped?: number;
};
/** Internal/own-data result, NOT a public payload. Sharing/proof gates belong to the caller. */
export interface ComputedImpactSnapshot {
  memberId: string; metricId: string; value: number; detail: ImpactDetail;
  sourceRefs: string[]; metricVersion: string; computedAt: Date;
}
export interface ImpactRecomputeResult { status: "COMPLETED" | "SKIPPED"; members: number; snapshots: number }

type Fact = { id: string; key?: string; at?: Date | null; projectId?: string | null };
type MetricCount = {
  value: number; facts: Fact[]; breakdown?: Prisma.InputJsonObject;
  onTimeRate?: number | null; tasksShipped?: number; projectIds?: string[];
};
type MetricQuery = (tx: ImpactTransaction, memberId: string, now: Date) => Promise<MetricCount>;
const count = (facts: Fact[]): MetricCount => ({ value: new Set(facts.map(f => f.key ?? f.id)).size, facts });
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const unique = (values: string[]) => [...new Set(values)].sort(compare);
// A member's private training sandbox is a real project they can freely mark DONE.
// Every project-scoped source excludes it; optional project links keep unlinked rows.
const NOT_TRAINING = { project: EXCLUDE_TRAINING };
const UNLINKED_OR_NOT_TRAINING = [{ projectId: null }, { project: EXCLUDE_TRAINING }];
/** SkillEvidence.projectId has no FK, so the sandbox ids are read and filtered here. */
async function withoutTraining<T extends { projectId: string | null }>(tx: ImpactTransaction, rows: T[]): Promise<T[]> {
  const ids = unique(rows.flatMap(r => r.projectId ? [r.projectId] : []));
  if (!ids.length) return rows;
  const training = await tx.project.findMany({ where: { id: { in: ids }, trainingForMemberId: { not: null } }, select: { id: true } });
  const excluded = new Set(training.map(p => p.id));
  return rows.filter(r => !r.projectId || !excluded.has(r.projectId));
}
function earliest(dates: (Date | null | undefined)[]): Date | null {
  const times = dates.filter((d): d is Date => !!d).map(d => d.getTime());
  return times.length ? new Date(times.reduce((a, b) => Math.min(a, b))) : null;
}

async function membersTrained(tx: ImpactTransaction, memberId: string): Promise<MetricCount> {
  const rows = await tx.courseEnrollment.findMany({
    where: { memberId: { not: memberId }, member: { isBot: false }, completedAt: { not: null }, course: { createdById: memberId } },
    select: { id: true, memberId: true, completedAt: true },
  });
  return count(rows.map(r => ({ id: r.id, key: r.memberId, at: r.completedAt })));
}
async function coursesAuthored(tx: ImpactTransaction, memberId: string): Promise<MetricCount> {
  const rows = await tx.course.findMany({ where: { createdById: memberId, status: "PUBLISHED" }, select: { id: true, publishedAt: true } });
  return count(rows.map(r => ({ id: r.id, at: r.publishedAt })));
}
async function releasedItems(tx: ImpactTransaction, memberId: string, drawing: boolean): Promise<MetricCount> {
  const contribution = { version: { uploadedById: memberId }, changeRequest: { status: "APPROVED" as const } };
  const rows = await tx.vaultItem.findMany({
    where: { deletedAt: null, ...NOT_TRAINING, ...(drawing ? { drawingForId: { not: null } } : {}), crItems: { some: contribution } },
    select: { id: true, projectId: true, crItems: { where: contribution, select: { changeRequest: { select: { reviewedAt: true } } } } },
  });
  return count(rows.map(r => ({ id: r.id, projectId: r.projectId, at: earliest(r.crItems.map(i => i.changeRequest.reviewedAt)) })));
}
async function cadItemsReleased(tx: ImpactTransaction, memberId: string): Promise<MetricCount> {
  return releasedItems(tx, memberId, false);
}
async function cadRevisions(tx: ImpactTransaction, memberId: string): Promise<MetricCount> {
  const rows = await tx.vaultVersion.findMany({
    where: { uploadedById: memberId, item: { deletedAt: null, ...NOT_TRAINING } },
    select: { id: true, createdAt: true, item: { select: { projectId: true } } },
  });
  return count(rows.map(r => ({ id: r.id, at: r.createdAt, projectId: r.item.projectId })));
}
async function drawingsReleased(tx: ImpactTransaction, memberId: string): Promise<MetricCount> {
  return releasedItems(tx, memberId, true);
}
async function designReviews(tx: ImpactTransaction, memberId: string): Promise<MetricCount> {
  const rows = await tx.changeRequest.findMany({
    where: { ...NOT_TRAINING, OR: [{ reviewerId: memberId, status: { in: ["APPROVED", "REJECTED"] } }, { signoffs: { some: { memberId } } }] },
    select: { id: true, projectId: true, reviewerId: true, reviewedAt: true, signoffs: { where: { memberId }, select: { createdAt: true } } },
  });
  return count(rows.map(r => ({ id: r.id, projectId: r.projectId,
    at: earliest([r.reviewerId === memberId ? r.reviewedAt : null, ...r.signoffs.map(s => s.createdAt)]) })));
}
async function prsMerged(tx: ImpactTransaction, memberId: string): Promise<MetricCount> {
  const rows = await withoutTraining(tx, await tx.skillEvidence.findMany({
    where: { memberId, source: "GITHUB", contribution: "AUTHORED", outcome: "MERGED", supersededAt: null },
    select: { sourceRef: true, occurredAt: true, projectId: true },
  }));
  return count(rows.map(r => ({ id: r.sourceRef, at: r.occurredAt, projectId: r.projectId })));
}
async function codeReviews(tx: ImpactTransaction, memberId: string): Promise<MetricCount> {
  const rows = await withoutTraining(tx, await tx.skillEvidence.findMany({
    where: { memberId, source: "REVIEW", sourceRef: { contains: ":review:" }, supersededAt: null },
    select: { sourceRef: true, occurredAt: true, projectId: true },
  }));
  return count(rows.map(r => ({ id: r.sourceRef, at: r.occurredAt, projectId: r.projectId })));
}
async function tasksCompleted(tx: ImpactTransaction, memberId: string): Promise<MetricCount> {
  const rows = await tx.task.findMany({
    where: { status: "DONE", assignees: { some: { id: memberId } }, ...NOT_TRAINING },
    select: { id: true, projectId: true, completedAt: true, dueDate: true },
  });
  const withDueDate = rows.filter(r => r.dueDate !== null);
  const onTime = withDueDate.filter(r => r.completedAt !== null && r.completedAt <= r.dueDate!).length;
  return { ...count(rows.map(r => ({ id: r.id, at: r.completedAt, projectId: r.projectId }))),
    onTimeRate: withDueDate.length ? onTime / withDueDate.length : null,
    breakdown: { withDueDate: withDueDate.length, onTime } };
}
async function labHours(tx: ImpactTransaction, memberId: string): Promise<MetricCount> {
  // Same confirmed-duration filter as getLabTimeSummary, without its display window.
  const rows = await tx.labVisit.findMany({
    where: { memberId, status: { in: ["CLOSED", "DISCARDED"] }, totalMinutes: { gt: 0 }, checkedOutAt: { not: null } },
    select: { id: true, checkedInAt: true, totalMinutes: true },
  });
  const totalMinutes = rows.reduce((sum, r) => sum + r.totalMinutes, 0);
  return { value: totalMinutes / 60, facts: rows.map(r => ({ id: r.id, at: r.checkedInAt })), breakdown: { visits: rows.length, totalMinutes } };
}
async function teamLed(tx: ImpactTransaction, memberId: string): Promise<MetricCount> {
  const rows = await tx.projectMember.findMany({
    where: { memberId, isLead: true, ...NOT_TRAINING },
    select: { projectId: true, project: { select: { tasks: { select: {
      id: true, status: true, assignees: { where: { id: { not: memberId }, isBot: false }, select: { id: true } },
    } } } } },
  });
  const projects = rows.map(r => ({ projectId: r.projectId,
    assignees: new Set(r.project.tasks.flatMap(t => t.assignees.map(a => a.id))).size,
    tasksShipped: r.project.tasks.filter(t => t.status === "DONE").length,
    tasks: r.project.tasks,
  })).sort((a, b) => b.assignees - a.assignees || compare(a.projectId, b.projectId));
  const largest = projects[0];
  return { value: largest?.assignees ?? 0, tasksShipped: largest?.tasksShipped ?? 0,
    // No lead-start date exists. Membership joinedAt must not imply lead tenure.
    facts: largest?.tasks.map(t => ({ id: t.id, projectId: largest.projectId })) ?? [],
    projectIds: projects.map(p => p.projectId),
    breakdown: { largestProjectId: largest?.projectId ?? null,
      projects: projects.map(({ projectId, assignees, tasksShipped }) => ({ projectId, assignees, tasksShipped })) } };
}
async function eventsOrganized(tx: ImpactTransaction, memberId: string, now: Date): Promise<MetricCount> {
  const rows = await tx.event.findMany({
    where: { organizerId: memberId, type: { not: "DEADLINE" }, startTime: { lt: now }, OR: UNLINKED_OR_NOT_TRAINING },
    select: { id: true, projectId: true, startTime: true },
  });
  return count(rows.map(r => ({ id: r.id, at: r.startTime, projectId: r.projectId })));
}
async function outreachAttendees(tx: ImpactTransaction, memberId: string): Promise<MetricCount> {
  const rows = await tx.eventRsvp.findMany({
    where: { attended: true, event: { organizerId: memberId, isPublic: true, OR: UNLINKED_OR_NOT_TRAINING }, OR: [{ memberId: null }, { member: { isBot: false } }] },
    select: { id: true, memberId: true, attendedAt: true, event: { select: { projectId: true } } },
  });
  return { ...count(rows.map(r => ({ id: r.id, at: r.attendedAt, projectId: r.event.projectId }))),
    breakdown: { members: rows.filter(r => r.memberId !== null).length, guests: rows.filter(r => r.memberId === null).length } };
}
async function outreachPublished(tx: ImpactTransaction, memberId: string): Promise<MetricCount> {
  const rows = await tx.outreachSubmission.findMany({
    where: { authorId: memberId, status: "PUBLISHED", OR: UNLINKED_OR_NOT_TRAINING }, select: { id: true, publishedAt: true, projectId: true },
  });
  return count(rows.map(r => ({ id: r.id, at: r.publishedAt, projectId: r.projectId })));
}
async function blogPostsPublished(tx: ImpactTransaction, memberId: string): Promise<MetricCount> {
  const rows = await tx.blogPost.findMany({
    // Creator is not necessarily a credited author (e.g. an admin publishing for others).
    where: { status: "PUBLISHED", authors: { some: { memberId } } }, select: { id: true, publishedAt: true },
  });
  return count(rows.map(r => ({ id: r.id, at: r.publishedAt })));
}
async function milestonesDelivered(tx: ImpactTransaction, memberId: string): Promise<MetricCount> {
  const rows = await tx.milestone.findMany({
    where: { ownerId: memberId, status: "COMPLETED", ...NOT_TRAINING }, select: { id: true, completedAt: true, projectId: true },
  });
  return count(rows.map(r => ({ id: r.id, at: r.completedAt, projectId: r.projectId })));
}

const queries: Record<string, MetricQuery> = {
  members_trained: membersTrained, courses_authored: coursesAuthored, cad_items_released: cadItemsReleased,
  cad_revisions: cadRevisions, drawings_released: drawingsReleased, design_reviews: designReviews,
  prs_merged: prsMerged, code_reviews: codeReviews, tasks_completed: tasksCompleted, lab_hours: labHours,
  team_led: teamLed, events_organized: eventsOrganized, outreach_attendees: outreachAttendees,
  outreach_published: outreachPublished, blog_posts_published: blogPostsPublished, milestones_delivered: milestonesDelivered,
};

async function resolveTools(tx: ImpactTransaction, memberId: string): Promise<Map<string, string>> {
  const nodes = await tx.skill.findMany({ select: { id: true, canonicalId: true, name: true } });
  const identities = canonicalMap(nodes);
  const canonical = (id: string) => identities.get(id) ?? id;
  const names = new Map(nodes.map(n => [n.id, n.name]));
  const disputes = await tx.skillDispute.findMany({ where: { memberId, status: { in: ["OPEN", "UPHELD"] } }, select: { skillId: true } });
  const blocked = projectedDisputes(disputes.map(d => d.skillId), identities);
  const assessments = await tx.skillAssessment.findMany({
    where: { memberId, provenance: { in: ["AI_INFERRED", "MANAGER_VERIFIED"] }, level: { gt: 0 } },
    select: { skillId: true, level: true },
  });
  const eligible = assessments.filter(a => !blocked.has(canonical(a.skillId)));
  if (!eligible.length) return new Map();
  const ids = new Set(eligible.map(a => canonical(a.skillId)));
  const links = await tx.skillOnetLink.findMany({
    where: { kind: "SOFTWARE", skillId: { in: nodes.filter(n => ids.has(canonical(n.id))).map(n => n.id) } },
    select: { skillId: true, ref: true },
  });
  if (!links.length) return new Map();
  const software = await tx.onetSoftware.findMany({
    where: { exampleNorm: { in: unique(links.map(l => l.ref)) }, categoryId: { in: unique(METRICS.flatMap(m => m.softwareCategories)) } },
    select: { exampleNorm: true, categoryId: true },
  });
  const categories = new Map<string, Set<string>>();
  for (const link of links) {
    const id = canonical(link.skillId), set = categories.get(id) ?? new Set<string>();
    for (const row of software) if (row.exampleNorm === link.ref) set.add(row.categoryId);
    categories.set(id, set);
  }
  // Highest level first; stable canonical name/id tie-break, without merging levels.
  eligible.sort((a, b) => b.level - a.level || compare(names.get(canonical(a.skillId)) ?? "", names.get(canonical(b.skillId)) ?? "")
    || compare(canonical(a.skillId), canonical(b.skillId)));
  const tools = new Map<string, string>();
  for (const metric of METRICS) {
    const match = eligible.find(a => metric.softwareCategories.some(c => categories.get(canonical(a.skillId))?.has(c)));
    const name = match && names.get(canonical(match.skillId));
    if (name) tools.set(metric.id, name);
  }
  return tools;
}

async function computeInTransaction(tx: ImpactTransaction, memberId: string, now: Date): Promise<ComputedImpactSnapshot[]> {
  const member = await tx.member.findUnique({ where: { id: memberId }, select: { isBot: true } });
  if (!member || member.isBot) return [];
  const counts = new Map<string, MetricCount>();
  for (const metric of METRICS) {
    if (!queries[metric.id]) throw new Error(`Missing impact query: ${metric.id}`);
    counts.set(metric.id, await queries[metric.id](tx, memberId, now));
  }
  const ids = unique([...counts.values()].flatMap(c => [...(c.projectIds ?? []), ...c.facts.flatMap(f => f.projectId ? [f.projectId] : [])]));
  const projects = ids.length ? await tx.project.findMany({ where: { id: { in: ids } }, select: { id: true, name: true }, orderBy: { id: "asc" } }) : [];
  const tools = await resolveTools(tx, memberId);
  const snapshots: ComputedImpactSnapshot[] = METRICS.map(metric => {
    const result = counts.get(metric.id)!;
    const projectIds = new Set([...(result.projectIds ?? []), ...result.facts.map(f => f.projectId)]);
    return { memberId, metricId: metric.id, value: result.value,
      detail: { breakdown: result.breakdown ?? { records: result.value }, projects: projects.filter(p => projectIds.has(p.id)),
        since: earliest(result.facts.map(f => f.at))?.toISOString() ?? null, tool: tools.get(metric.id) ?? null,
        ...(result.onTimeRate !== undefined ? { onTimeRate: result.onTimeRate } : {}),
        ...(result.tasksShipped !== undefined ? { tasksShipped: result.tasksShipped } : {}) },
      sourceRefs: unique(result.facts.map(f => f.id)).slice(0, 50), metricVersion: METRIC_VERSION, computedAt: now };
  });
  for (const snapshot of snapshots) {
    await tx.impactSnapshot.upsert({ where: { memberId_metricId: { memberId, metricId: snapshot.metricId } }, create: snapshot, update: snapshot });
  }
  return snapshots;
}

async function storeFor(deps: ImpactDependencies): Promise<ImpactStore> {
  if (deps.store) return deps.store;
  const { prisma } = await import("../db/prisma.js");
  return { transaction: (work, options) => prisma.$transaction(work, options) };
}
const transactionOptions = { timeout: 120_000, maxWait: 20_000, isolationLevel: "RepeatableRead" as const };

/** All 16 snapshots in registry order, or [] for a missing member/bot. Reads and
 * upserts are atomic. Returned details/refs are internal audit data, not share approval. */
export async function computeForMember(memberId: string, deps: ImpactDependencies = {}): Promise<ComputedImpactSnapshot[]> {
  const store = await storeFor(deps), now = (deps.now ?? (() => new Date()))();
  return store.transaction(tx => computeInTransaction(tx, memberId, now), transactionOptions);
}

/** Pages 50 human members at a time. One pinned transaction holds the xact lock
 * for the entire run (including reads and all upserts); failure rolls back the run.
 * The 30-minute timeout bounds both the snapshot transaction and lock lifetime. */
export async function recomputeAll(deps: ImpactDependencies = {}): Promise<ImpactRecomputeResult> {
  const store = await storeFor(deps), now = (deps.now ?? (() => new Date()))();
  return store.transaction(async tx => {
    const lock = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtext('impact-recompute')) AS locked`;
    if (!lock[0]?.locked) return { status: "SKIPPED", members: 0, snapshots: 0 };
    const result: ImpactRecomputeResult = { status: "COMPLETED", members: 0, snapshots: 0 };
    let after: string | undefined;
    for (;;) {
      const members = await tx.member.findMany({ where: { isBot: false, ...(after ? { id: { gt: after } } : {}) },
        orderBy: { id: "asc" }, take: 50, select: { id: true } });
      if (!members.length) break;
      for (const member of members) {
        const snapshots = await computeInTransaction(tx, member.id, now);
        if (snapshots.length) { result.members++; result.snapshots += snapshots.length; }
      }
      after = members[members.length - 1].id;
      if (members.length < 50) break;
    }
    return result;
  }, { ...transactionOptions, timeout: 30 * 60_000 });
}

/** Maintenance-only cron entry point. Never throws or sends Slack/email/notifications. */
export async function recomputeAllImpact(deps: ImpactDependencies = {}): Promise<void> {
  try { await recomputeAll(deps); }
  catch { console.error("[impact] Snapshot recompute failed; transaction rolled back."); }
}
