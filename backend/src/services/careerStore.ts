// Prisma-backed CareerStore. Kept apart from careerService so the service and its route tests load no database.
import { prisma } from "../db/prisma.js";
import { getSkillDemand } from "./onetLinkService.js";
import { computeForMember } from "./impactMetricService.js";
import type { AttestationRow, CareerStore } from "./careerService.js";

const attSelect = {
  id: true, kind: true, status: true, metricId: true, label: true, value: true, unit: true,
  evidenceUrl: true, note: true, reviewNote: true, createdAt: true,
} as const;

export const prismaCareerStore: CareerStore = {
  member: (id) => prisma.member.findUnique({ where: { id }, select: { id: true, displayName: true, email: true } }),
  profile: (id) => prisma.careerProfile.findUnique({
    where: { memberId: id },
    select: { major: true, gradTerm: true, openTo: true, availableFrom: true, headline: true, shareWithSponsors: true, showOnPublicPage: true },
  }),
  upsertProfile: (id, data) => prisma.careerProfile.upsert({
    where: { memberId: id }, create: { memberId: id, ...data }, update: data,
    select: { major: true, gradTerm: true, openTo: true, availableFrom: true, headline: true, shareWithSponsors: true, showOnPublicPage: true },
  }),
  async targets(id) {
    const rows = await prisma.careerTarget.findMany({ where: { memberId: id }, orderBy: { position: "asc" } });
    const occ = await prisma.onetOccupation.findMany({ where: { code: { in: rows.map(r => r.onetCode) } }, select: { code: true, title: true } });
    const titles = new Map(occ.map(o => [o.code, o.title]));
    return rows.map(r => ({ code: r.onetCode, title: titles.get(r.onetCode) ?? r.onetCode, position: r.position }));
  },
  async existingOccupations(codes) {
    return (await prisma.onetOccupation.findMany({ where: { code: { in: codes } }, select: { code: true } })).map(o => o.code);
  },
  async replaceTargets(id, codes) {
    await prisma.$transaction([
      prisma.careerTarget.deleteMany({ where: { memberId: id } }),
      prisma.careerTarget.createMany({ data: codes.map((onetCode, position) => ({ memberId: id, onetCode, position })) }),
    ]);
  },
  async searchOccupations(q, limit) {
    const norm = q.toLowerCase();
    const [direct, lay] = await Promise.all([
      prisma.onetOccupation.findMany({ where: { title: { contains: q, mode: "insensitive" } }, select: { code: true, title: true }, orderBy: { title: "asc" }, take: limit }),
      prisma.onetJobTitle.findMany({ where: { titleNorm: { contains: norm } }, select: { occupation: { select: { code: true, title: true } } }, take: limit * 3 }),
    ]);
    return [...direct, ...lay.map(l => l.occupation)];
  },
  async snapshots(id) {
    const rows = await prisma.impactSnapshot.findMany({ where: { memberId: id } });
    return rows.map(r => {
      const d = (r.detail ?? {}) as { tool?: string | null; projects?: { id?: string; name: string }[] };
      return { metricId: r.metricId, value: r.value, detail: { tool: d.tool ?? null, projects: d.projects ?? [] }, computedAt: r.computedAt };
    });
  },
  attestations: (id) => prisma.impactAttestation.findMany({ where: { memberId: id }, select: attSelect, orderBy: { createdAt: "desc" } }) as Promise<AttestationRow[]>,
  bulletRows: (id) => prisma.resumeBullet.findMany({ where: { memberId: id }, select: { sourceKind: true, sourceId: true, template: true, included: true, position: true } }),
  async upsertBullet(id, kind, sourceId, data) {
    await prisma.resumeBullet.upsert({
      where: { memberId_sourceKind_sourceId: { memberId: id, sourceKind: kind, sourceId } },
      create: { memberId: id, sourceKind: kind, sourceId, ...data }, update: data,
    });
  },
  async deleteBullet(id, kind, sourceId) { await prisma.resumeBullet.deleteMany({ where: { memberId: id, sourceKind: kind, sourceId } }); },
  async disabledMetrics() { return (await prisma.careerSettings.findUnique({ where: { id: "default" } }))?.disabledMetrics ?? []; },
  async certifications(id) {
    const rows = await prisma.trainingCertificate.findMany({
      where: { memberId: id, status: "APPROVED" }, orderBy: { completedOn: "desc" },
      select: { completedOn: true, training: { select: { name: true, providerName: true } } },
    });
    return rows.map(r => ({ name: r.training.name, issuer: r.training.providerName, date: r.completedOn.toISOString().slice(0, 10) }));
  },
  badges: (id) => prisma.badgeAward.findMany({ where: { memberId: id, revokedAt: null }, select: { achievementId: true, issuedAt: true }, orderBy: { issuedAt: "asc" } }),
  async skills(id) {
    // A shareable file: skip zero-level rows and skills the member has disputed.
    const disputed = await prisma.skillDispute.findMany({ where: { memberId: id, status: { in: ["OPEN", "UPHELD"] } }, select: { skillId: true } });
    const rows = await prisma.skillAssessment.findMany({
      where: { memberId: id, level: { gt: 0 }, skillId: { notIn: disputed.map(d => d.skillId) }, skill: { status: "ACTIVE", canonicalId: null } },
      select: { skill: { select: { name: true, type: true } } },
    });
    return rows.map(r => ({ name: r.skill.name, area: r.skill.type }));
  },
  elementNames: (ids) => (ids.length ? prisma.onetElement.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : Promise.resolve([])),
  countOpenClaims: (id) => prisma.impactAttestation.count({ where: { memberId: id, kind: "CLAIM", status: { in: ["PENDING", "NEEDS_PROOF"] } } }),
  createClaim: (id, d) => prisma.impactAttestation.create({
    data: { memberId: id, kind: "CLAIM", label: d.label, value: d.value, unit: d.unit, evidenceUrl: d.evidenceUrl },
    select: attSelect,
  }) as Promise<AttestationRow>,
  attestation: (attId) => prisma.impactAttestation.findUnique({ where: { id: attId }, select: { ...attSelect, memberId: true } }) as Promise<(AttestationRow & { memberId: string }) | null>,
  async deleteAttestation(attId) { await prisma.impactAttestation.delete({ where: { id: attId } }); },
  demandSignals: () => prisma.demandSignal.findMany({
    where: { active: true }, orderBy: { publishedOn: "desc" },
    select: { id: true, title: true, summary: true, sourceName: true, sourceUrl: true, publishedOn: true, onetElementIds: true, skillIds: true, metricIds: true },
  }),
  skill: (id) => prisma.skill.findUnique({ where: { id }, select: { id: true, name: true, status: true, canonicalId: true } }),
  skillLinks: (skillId) => prisma.skillOnetLink.findMany({ where: { skillId }, select: { kind: true, ref: true, relation: true } }),
  softwareByNorm: (refs) => (refs.length ? prisma.onetSoftware.findMany({ where: { exampleNorm: { in: refs } }, select: { exampleNorm: true, example: true, categoryId: true } }) : Promise.resolve([])),
  elements: (ids) => (ids.length ? prisma.onetElement.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, parentId: true } }) : Promise.resolve([])),
  async skillDemand(skillId) { return (await getSkillDemand([skillId]))[skillId] ?? null; },
  async recompute(id) { return (await computeForMember(id)).length; },
};
