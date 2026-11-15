// Self-only pathway: one member against one O*NET occupation. No model calls.
import { METRICS } from "./impactMetricCore.js";
import { canonicalMap } from "./skillCatalogCore.js";
import { buildPathway, type Pathway, type PathwayInput } from "./pathwayCore.js";

export interface PathwayStore {
  occupation(code: string): Promise<{ code: string; title: string } | null>;
  software(code: string): Promise<PathwayInput["software"]>;
  ratings(code: string): Promise<PathwayInput["ratings"]>;
  elements(ids: string[]): Promise<{ id: string; name: string; domain: string }[]>;
  occupationDwas(code: string): Promise<string[]>;
  emerging(code: string): Promise<PathwayInput["emergingTasks"]>;
  related(code: string): Promise<{ code: string; tier: string; rank: number }[]>;
  occupationTitles(codes: string[]): Promise<{ code: string; title: string }[]>;
  skillNodes(): Promise<{ id: string; canonicalId: string | null }[]>;
  allLinks(kind: "SOFTWARE" | "ELEMENT"): Promise<{ skillId: string; ref: string }[]>;
  assessments(memberId: string): Promise<PathwayInput["assessments"]>;
  openDisputes(memberId: string): Promise<{ skillId: string }[]>;
  goals(memberId: string): Promise<{ skillId: string }[]>;
  snapshots(memberId: string): Promise<{ metricId: string; value: number }[]>;
  /** Non-training projects the member belongs to (same access rule as skillWorkspaceService). */
  memberProjectIds(memberId: string): Promise<string[]>;
  /** Raw task rows for those projects; the service applies the open/unassigned/unarchived rule. */
  tasksInProjects(projectIds: string[]): Promise<{ id: string; title: string; projectId: string; projectName: string; status: string; archivedAt: Date | null; assigneeCount: number }[]>;
}
export interface PathwayDependencies { store?: PathwayStore }

async function defaultStore(): Promise<PathwayStore> {
  const { prisma } = await import("../db/prisma.js");
  const { EXCLUDE_TRAINING } = await import("./trainingSandboxService.js");
  return {
    occupation: code => prisma.onetOccupation.findUnique({ where: { code }, select: { code: true, title: true } }),
    software: code => prisma.onetSoftware.findMany({ where: { occupationCode: code }, select: { example: true, exampleNorm: true, categoryId: true, hot: true, inDemand: true } }),
    ratings: code => prisma.onetRating.findMany({ where: { occupationCode: code, scale: "IM" }, select: { elementId: true, scale: true, value: true, suppress: true, notRelevant: true } }),
    elements: ids => prisma.onetElement.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, domain: true } }),
    occupationDwas: async code => (await prisma.onetOccupationDwa.findMany({ where: { occupationCode: code }, select: { dwaId: true } })).map(r => r.dwaId),
    emerging: code => prisma.onetEmergingTask.findMany({ where: { occupationCode: code }, select: { id: true, task: true, category: true } }),
    related: async code => (await prisma.onetRelatedOccupation.findMany({ where: { occupationCode: code, tier: { startsWith: "Primary" } }, select: { relatedCode: true, tier: true, rank: true } }))
      .map(r => ({ code: r.relatedCode, tier: r.tier, rank: r.rank })),
    occupationTitles: codes => prisma.onetOccupation.findMany({ where: { code: { in: codes } }, select: { code: true, title: true } }),
    skillNodes: () => prisma.skill.findMany({ select: { id: true, canonicalId: true } }),
    allLinks: kind => prisma.skillOnetLink.findMany({ where: { kind }, select: { skillId: true, ref: true } }),
    assessments: memberId => prisma.skillAssessment.findMany({ where: { memberId }, select: { skillId: true, provenance: true, level: true } }),
    openDisputes: memberId => prisma.skillDispute.findMany({ where: { memberId, status: { in: ["OPEN", "UPHELD"] } }, select: { skillId: true } }),
    goals: memberId => prisma.skillGoal.findMany({ where: { memberId }, select: { skillId: true } }),
    snapshots: memberId => prisma.impactSnapshot.findMany({ where: { memberId }, select: { metricId: true, value: true } }),
    memberProjectIds: async memberId => (await prisma.projectMember.findMany({ where: { memberId, project: EXCLUDE_TRAINING }, select: { projectId: true } })).map(r => r.projectId),
    tasksInProjects: async projectIds => (await prisma.task.findMany({
      where: { projectId: { in: projectIds }, archivedAt: null, status: { not: "DONE" } },
      orderBy: { id: "asc" }, take: 2000,
      select: { id: true, title: true, projectId: true, status: true, archivedAt: true, project: { select: { name: true } }, _count: { select: { assignees: true } } },
    })).map(r => ({ id: r.id, title: r.title, projectId: r.projectId, projectName: r.project.name, status: r.status, archivedAt: r.archivedAt, assigneeCount: r._count.assignees })),
  };
}

async function openTasks(store: PathwayStore, memberId: string): Promise<PathwayInput["candidateTasks"]> {
  const ids = await store.memberProjectIds(memberId);
  if (!ids.length) return [];
  const allowed = new Set(ids);
  return (await store.tasksInProjects(ids))
    .filter(t => allowed.has(t.projectId) && t.archivedAt === null && (t.status === "TODO" || t.status === "IN_PROGRESS") && t.assigneeCount === 0)
    .map(t => ({ id: t.id, title: t.title, projectId: t.projectId, projectName: t.projectName }));
}

/** Null for an unknown occupation code. */
export async function getPathway(memberId: string, code: string, deps: PathwayDependencies = {}): Promise<Pathway | null> {
  const store = deps.store ?? await defaultStore();
  const occupation = await store.occupation(code);
  if (!occupation) return null;
  const [software, ratings, dwaIds, emergingTasks, related, nodes, assessments, disputes, goals, snapshots, candidateTasks, softwareLinks, elementLinks] = await Promise.all([
    store.software(code), store.ratings(code), store.occupationDwas(code), store.emerging(code), store.related(code),
    store.skillNodes(), store.assessments(memberId), store.openDisputes(memberId), store.goals(memberId),
    store.snapshots(memberId), openTasks(store, memberId), store.allLinks("SOFTWARE"), store.allLinks("ELEMENT"),
  ]);
  const elements = await store.elements([...new Set([...ratings.map(r => r.elementId), ...dwaIds])]);
  const dwaNames = new Map(elements.map(e => [e.id, e.name]));
  const titles = new Map((await store.occupationTitles(related.map(r => r.code))).map(t => [t.code, t.title]));
  const metricDwa = new Map(METRICS.map(m => [m.id, m.dwaId]));
  return buildPathway({
    occupation, software, ratings, elements, softwareLinks, elementLinks, assessments,
    goalSkillIds: goals.map(g => g.skillId), disputedSkillIds: disputes.map(d => d.skillId),
    canonical: canonicalMap(nodes),
    metrics: snapshots.map(s => ({ metricId: s.metricId, dwaId: metricDwa.get(s.metricId) ?? null, value: s.value })),
    dwas: dwaIds.map(id => ({ dwaId: id, name: dwaNames.get(id) ?? id })),
    emergingTasks, candidateTasks,
    related: related.filter(r => titles.has(r.code)).map(r => ({ ...r, title: titles.get(r.code)! })),
  });
}
