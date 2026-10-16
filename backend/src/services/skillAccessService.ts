// Visibility is resolved before retrieval/embedding/prompt construction.
import { prisma } from "../db/prisma.js";
import { canonicalMap, identityIds, projectedDisputes, sharingProjection, projectEvidence } from "./skillCatalogCore.js";
import { assessMember } from "./skillScoringCore.js";

export async function visibleSkillPairs(memberIds: string[]) {
  const [nodes, visibility, portfolios, disputes] = await Promise.all([
    prisma.skill.findMany({ select: { id: true, canonicalId: true } }),
    prisma.skillVisibility.findMany({ where: { memberId: { in: memberIds } } }),
    prisma.memberPortfolio.findMany({ where: { memberId: { in: memberIds }, showOnProfile: false }, select: { memberId: true } }),
    prisma.skillDispute.findMany({ where: { memberId: { in: memberIds }, status: { in: ["OPEN", "UPHELD"] } }, select: { memberId: true, skillId: true } }),
  ]);
  const map = canonicalMap(nodes), hidden = new Set(portfolios.map(p => p.memberId));
  return memberIds.filter(id => !hidden.has(id)).map(memberId => {
    const choices = sharingProjection(map, new Map(visibility.filter(v => v.memberId === memberId).map(v => [v.skillId, v.showToTeam])));
    const blocked = projectedDisputes(disputes.filter(d => d.memberId === memberId).map(d => d.skillId), map);
    const ids = [...choices].filter(([id, yes]) => yes && !blocked.has(id)).flatMap(([id]) => identityIds(id, map));
    return { memberId, skillId: { in: ids } };
  }).filter(p => p.skillId.in.length > 0);
}

export async function visibleProjectAssessments(memberIds: string[], projectId: string) {
  const pairs = await visibleSkillPairs(memberIds);
  const evidence = await prisma.skillEvidence.findMany({
    where: { projectId, supersededAt: null, OR: pairs.map(p => ({ memberId: p.memberId, skills: { some: { skillId: p.skillId } } })) },
    select: { id: true, memberId: true, source: true, projectId: true, contribution: true, complexity: true, outcome: true, occurredAt: true, contributionKey: true, skills: { select: { skillId: true, weight: true } } },
    orderBy: { occurredAt: "desc" }, take: 5000,
  });
  const nodes = await prisma.skill.findMany({ select: { id: true, canonicalId: true, name: true } });
  const map = canonicalMap(nodes), byId = new Map(nodes.map(n => [n.id, n]));
  const rows = [];
  for (const pair of pairs) {
    const allowed = new Set(pair.skillId.in);
    const current = evidence.filter(e => e.memberId === pair.memberId).map(e => ({ ...e, skills: e.skills.filter(s => allowed.has(s.skillId)).map(s => ({ skillId: s.skillId, fit: s.weight })) }));
    for (const [skillId, a] of assessMember(projectEvidence(current, map), new Date())) rows.push({ ...a, memberId: pair.memberId, skillId, provenance: "AI_INFERRED" as const, skill: { name: byId.get(skillId)?.name ?? "Skill" } });
  }
  return rows;
}
