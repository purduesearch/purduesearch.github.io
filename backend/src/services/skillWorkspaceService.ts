import { prisma } from "../db/prisma.js";
import { getMySkills } from "./skillMemberService.js";
import { TaxonomyError } from "./skillTaxonomyService.js";
import { EXCLUDE_TRAINING } from "./trainingSandboxService.js";
import { matchOpportunity, validateGoals } from "./skillWorkspaceCore.js";
import { visibleSkillPairs, visibleProjectAssessments } from "./skillAccessService.js";
import { canonicalMap } from "./skillCatalogCore.js";

export async function setSkillGoals(memberId: string, value: unknown) {
  let ids: string[];
  try { ids = validateGoals(value); } catch (e) { throw new TaxonomyError("INVALID", (e as Error).message); }
  const found = await prisma.skill.count({ where: { id: { in: ids }, status: "ACTIVE", canonicalId: null } });
  if (found !== ids.length) throw new TaxonomyError("NOT_FOUND", "One of the focus skills is unavailable");
  await prisma.$transaction(async tx => {
    // Serialize member goal replacement so two saves cannot exceed the three-goal cap.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`skill-goals:${memberId}`}))`;
    await tx.skillGoal.deleteMany({ where: { memberId } });
    if (ids.length) await tx.skillGoal.createMany({ data: ids.map(skillId => ({ memberId, skillId })) });
  });
}

async function accessibleTask(memberId: string, taskId: string) {
  return prisma.task.findFirst({ where: { id: taskId, archivedAt: null, project: { ...EXCLUDE_TRAINING, members: { some: { memberId } } } }, select: { id: true } });
}
export async function saveSkillOpportunity(memberId: string, taskId: string, saved: unknown) {
  if (typeof saved !== "boolean") throw new TaxonomyError("INVALID", "saved must be boolean");
  if (!saved) { await prisma.skillOpportunitySave.deleteMany({ where: { memberId, taskId } }); return; }
  if (!await accessibleTask(memberId, taskId)) throw new TaxonomyError("NOT_FOUND", "Task not available in your projects");
  await prisma.skillOpportunitySave.upsert({ where: { memberId_taskId: { memberId, taskId } }, create: { memberId, taskId }, update: {} });
}

export async function getSkillWorkspace(memberId: string) {
  const [record, goals, saved, projects, evidence, member, catalog] = await Promise.all([
    getMySkills(memberId),
    prisma.skillGoal.findMany({ where: { memberId }, include: { skill: { select: { id: true, name: true, type: true, aliases: { select: { alias: true } } } } }, orderBy: { createdAt: "asc" } }),
    prisma.skillOpportunitySave.findMany({ where: { memberId }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.projectMember.findMany({ where: { memberId, project: EXCLUDE_TRAINING }, select: { project: { select: { id: true, name: true } }, isLead: true } }),
    prisma.skillEvidence.findMany({ where: { memberId, supersededAt: null }, orderBy: { occurredAt: "desc" }, take: 1000, select: { id: true, source: true, sourceRef: true, summary: true, occurredAt: true, projectId: true, contributionKey: true } }),
    prisma.member.findUnique({ where: { id: memberId }, select: { githubLogin: true } }),
    prisma.skill.findMany({ select: { id: true, canonicalId: true, name: true, type: true, status: true, aliases: { select: { alias: true } } } }),
  ]);
  const map = canonicalMap(catalog);
  const goalSkills = [...new Map(goals.map(g => catalog.find(s => s.id === (map.get(g.skillId) ?? g.skillId))).filter((s): s is NonNullable<typeof s> => !!s && s.status === "ACTIVE").map(s => [s.id, { id: s.id, name: s.name, type: s.type, aliases: s.aliases.map(a => a.alias) }])).values()];
  const savedIds = saved.map(s => s.taskId);
  const tasks = await prisma.task.findMany({
    where: { archivedAt: null, status: { in: ["TODO", "IN_PROGRESS"] }, projectId: { in: projects.map(p => p.project.id) }, OR: [{ assignees: { none: {} } }, { id: { in: savedIds } }] },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }], take: 250,
    select: { id: true, title: true, description: true, projectId: true, estimatedHours: true, status: true, assignees: { select: { id: true } }, project: { select: { name: true } }, tags: { select: { name: true } } },
  });
  const opportunities = tasks.map(t => ({
    id: t.id, title: t.title, projectId: t.projectId, projectName: t.project.name, estimatedHours: t.estimatedHours, status: t.status,
    assigned: t.assignees.length > 0, saved: savedIds.includes(t.id),
    matches: matchOpportunity(`${t.title}\n${t.description ?? ""}\n${t.tags.map(x => x.name).join(" ")}`, goalSkills),
  })).filter(t => t.matches.length || t.saved).sort((a, b) => Number(b.saved) - Number(a.saved) || b.matches.length - a.matches.length || a.title.localeCompare(b.title)).slice(0, 20);
  const names = new Map(projects.map(p => [p.project.id, p.project.name]));
  return {
    ...record, evidenceProjects: record.projects, goals: goalSkills, projects: projects.map(p => ({ ...p.project, isLead: p.isLead })), opportunities,
    summary: { contributions: new Set(evidence.map(e => e.contributionKey ? `${e.projectId}|${e.contributionKey}` : `${e.source}|${e.sourceRef}`)).size, evidenceRecords: evidence.length, projects: new Set(evidence.map(e => e.projectId).filter(Boolean)).size, truncated: evidence.length === 1000 },
    recent: evidence.slice(0, 5).map(e => ({ id: e.id, source: e.source, summary: e.summary, occurredAt: e.occurredAt, projectName: e.projectId ? names.get(e.projectId) ?? "Former project" : null })),
    connections: { githubLinked: !!member?.githubLogin, note: "Vault and completed-task evidence is collected from your project work. Source freshness is shown in the admin run report." },
  };
}

/** A project-scoped directory; profile shaping applies visibility and disputes. */
export async function getProjectSkillCoverage(memberId: string, projectId: string) {
  const membership = await prisma.projectMember.findUnique({ where: { projectId_memberId: { projectId, memberId } }, select: { memberId: true } });
  if (!membership) throw new TaxonomyError("FORBIDDEN", "Choose a project you belong to");
  const roster = await prisma.projectMember.findMany({ where: { projectId, member: { isBot: false } }, orderBy: { member: { displayName: "asc" } }, take: 150, select: { member: { select: { id: true, displayName: true, avatarUrl: true, title: true } } } });
  const ids = roster.map(r => r.member.id);
  const [rows, pairs, nodes] = await Promise.all([visibleProjectAssessments(ids, projectId), visibleSkillPairs(ids), prisma.skill.findMany({ select: { id: true, canonicalId: true } })]);
  const map = canonicalMap(nodes);
  const evidence = await prisma.skillEvidence.findMany({ where: { projectId, supersededAt: null, OR: pairs.map(p => ({ memberId: p.memberId, skills: { some: { skillId: p.skillId } } })) }, orderBy: { occurredAt: "desc" }, take: 5000, select: { memberId: true, summary: true, source: true, occurredAt: true, skills: { select: { skillId: true } } } });
  const members = roster.map(({ member }) => ({ ...member, hidden: false, groups: [{ name: "Project experience", skills: rows.filter(r => r.memberId === member.id).map(r => ({
    skillId: r.skillId, name: r.skill.name, level: r.level, confidence: r.confidenceBand,
    evidence: evidence.filter(e => e.memberId === member.id && e.skills.some(s => (map.get(s.skillId) ?? s.skillId) === r.skillId)).slice(0, 3).map(e => ({ summary: e.summary, source: e.source, date: e.occurredAt.toISOString() })),
  })) }].filter(g => g.skills.length > 0) }));
  return { members, truncated: roster.length === 150, notice: "Shared project evidence only. Missing evidence is unknown, and does not mean someone cannot do the work. Ask about availability before planning a pairing." };
}
