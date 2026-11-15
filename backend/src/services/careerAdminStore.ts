// Prisma-backed CareerAdminStore. Kept apart from careerAdminService so the service and its route tests load no database.
import { prisma } from "../db/prisma.js";
import { applyCuratedLinks, listUnlinked, removeLink, setLink } from "./onetLinkService.js";
import type { AdminAttestation, CareerAdminStore, DemandSignalRow } from "./careerAdminService.js";

const attSelect = {
  id: true, memberId: true, kind: true, status: true, metricId: true, label: true, value: true, unit: true,
  evidenceUrl: true, note: true, reviewNote: true, reviewerId: true, reviewedAt: true, createdAt: true,
} as const;
const sigSelect = {
  id: true, title: true, summary: true, sourceName: true, sourceUrl: true, publishedOn: true,
  onetElementIds: true, skillIds: true, metricIds: true, active: true,
} as const;

export const prismaCareerAdminStore: CareerAdminStore = {
  async onetStatus() {
    const [release, links] = await Promise.all([
      prisma.onetRelease.findFirst({ where: { active: true } }),
      prisma.skillOnetLink.findMany({ select: { id: true, skillId: true, kind: true, ref: true } }),
    ]);
    const refs = (kind: string) => [...new Set(links.filter(l => l.kind === kind).map(l => l.ref))];
    const [sw, el, dwa] = await Promise.all([
      prisma.onetSoftware.findMany({ where: { exampleNorm: { in: refs("SOFTWARE") } }, select: { exampleNorm: true }, distinct: ["exampleNorm"] }),
      prisma.onetElement.findMany({ where: { id: { in: refs("ELEMENT") }, domain: { not: "DWA" } }, select: { id: true } }),
      prisma.onetElement.findMany({ where: { id: { in: refs("DWA") }, domain: "DWA" }, select: { id: true } }),
    ]);
    const ok: Record<string, Set<string>> = {
      SOFTWARE: new Set(sw.map(r => r.exampleNorm)), ELEMENT: new Set(el.map(r => r.id)), DWA: new Set(dwa.map(r => r.id)),
    };
    return {
      release: release && { version: release.version, releasedOn: release.releasedOn, loadedAt: release.loadedAt, sourceSha256: release.sourceSha256, active: release.active },
      counts: release?.counts ?? null,
      danglingLinks: links.filter(l => !ok[l.kind]?.has(l.ref)),
    };
  },
  unlinked: () => listUnlinked(),
  setLink: (actor, input) => setLink(actor, input as Parameters<typeof setLink>[1]),
  removeLink: (actor, input) => removeLink(actor, input as Parameters<typeof removeLink>[1]),
  applyCurated: () => applyCuratedLinks(),
  async disabledMetrics() { return (await prisma.careerSettings.findUnique({ where: { id: "default" } }))?.disabledMetrics ?? []; },
  async setDisabledMetrics(ids) {
    await prisma.careerSettings.upsert({ where: { id: "default" }, create: { id: "default", disabledMetrics: ids }, update: { disabledMetrics: ids } });
  },
  async listAttestations(status) {
    const rows = await prisma.impactAttestation.findMany({
      where: status ? { status: status as never } : {}, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 500,
      select: { ...attSelect, member: { select: { displayName: true } } },
    });
    return rows.map(({ member, ...r }) => ({ ...r, memberName: member.displayName })) as (AdminAttestation & { memberName?: string | null })[];
  },
  attestation: (id) => prisma.impactAttestation.findUnique({ where: { id }, select: attSelect }) as Promise<AdminAttestation | null>,
  async reviewClaim(id, d) {
    const r = await prisma.impactAttestation.updateMany({
      where: { id, kind: "CLAIM", status: { in: ["PENDING", "NEEDS_PROOF"] } },
      data: { status: d.status, reviewNote: d.reviewNote, reviewerId: d.reviewerId, reviewedAt: d.reviewedAt },
    });
    return r.count === 1;
  },
  member: (id) => prisma.member.findUnique({ where: { id }, select: { id: true, isBot: true } }),
  async snapshotValue(memberId, metricId) {
    return (await prisma.impactSnapshot.findUnique({ where: { memberId_metricId: { memberId, metricId } }, select: { value: true } }))?.value ?? null;
  },
  async confirmMetric(d) {
    const data = { value: d.value, status: "VERIFIED" as const, reviewerId: d.reviewerId, reviewedAt: d.reviewedAt };
    const existing = await prisma.impactAttestation.findFirst({ where: { memberId: d.memberId, kind: "CONFIRM", metricId: d.metricId }, select: { id: true } });
    if (existing) return prisma.impactAttestation.update({ where: { id: existing.id }, data, select: attSelect }) as Promise<AdminAttestation>;
    return prisma.impactAttestation.create({ data: { memberId: d.memberId, kind: "CONFIRM", metricId: d.metricId, ...data }, select: attSelect }) as Promise<AdminAttestation>;
  },
  listSignals: () => prisma.demandSignal.findMany({ orderBy: [{ publishedOn: "desc" }, { id: "asc" }], select: sigSelect }),
  countSignals: () => prisma.demandSignal.count(),
  seedSignals: (rows) => prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('career-demand-seed'))`;
    if (await tx.demandSignal.count() > 0) return false;
    await tx.demandSignal.createMany({ data: rows });
    return true;
  }),
  createSignal: (data) => prisma.demandSignal.create({ data, select: sigSelect }),
  async updateSignal(id, data) {
    try { return await prisma.demandSignal.update({ where: { id }, data, select: sigSelect }) as DemandSignalRow; } catch { return null; }
  },
  async deleteSignal(id) { return (await prisma.demandSignal.deleteMany({ where: { id } })).count === 1; },
};
