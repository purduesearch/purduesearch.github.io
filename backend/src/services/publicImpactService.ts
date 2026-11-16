// Public impact page payload (GET /api/public/impact). Locked decisions 3, 5, 7.
// - Totals come from stored impact snapshots through publicAggregate (floor 3). A total below the floor is
//   null, never 0. Only active, non-bot members count; per-member values never leave this module.
// - Only RECORDS metrics are totalled: CONFIRMED/CLAIM metrics need a per-member attestation to be shareable.
// - Tool counts: members with a demonstrated skill (level >= 3, not disputed, shared publicly or to the team)
//   linked to a hot O*NET technology; a tool below the floor is omitted.
// - Featured cards: buildPublicCard for members with showOnPublicPage only, alphabetical, no ranking.
// No model calls. All I/O goes through the injected store.
import { METRICS, METRIC_VERSION, PUBLIC_FLOOR, publicAggregate } from "./impactMetricCore.js";
import { buildPublicCard, type CardSource, type PublicCard } from "./talentDirectoryCore.js";
import { ONET_ATTRIBUTION } from "./careerService.js";

export const DEMONSTRATED_LEVEL = 3;

export interface PublicImpactStore {
  /** Snapshot rows for active (deactivatedAt null), non-bot members only. */
  snapshots(): Promise<{ memberId: string; metricId: string; value: number }[]>;
  disabledMetrics(): Promise<string[]>;
  /** Active, non-bot members' assessments on canonical active skills. */
  assessments(): Promise<{ memberId: string; skillId: string; level: number }[]>;
  /** OPEN or UPHELD disputes. */
  disputes(): Promise<{ memberId: string; skillId: string }[]>;
  visibility(): Promise<{ memberId: string; skillId: string; isPublic: boolean; showToTeam: boolean }[]>;
  /** Skill to hot technology links (OnetSoftware.hot = true via SkillOnetLink SOFTWARE). toolKey = exampleNorm. */
  skillTools(): Promise<{ skillId: string; toolKey: string; toolName: string }[]>;
  /** Card sources for active, non-bot members with showOnPublicPage = true. */
  featuredSources(): Promise<CardSource[]>;
}

export interface PublicImpactPayload {
  metricVersion: string;
  floor: number;
  totals: { id: string; label: string; unitSingular: string; unitPlural: string; total: number | null; contributors: number | null }[];
  tools: { name: string; members: number }[];
  featured: PublicCard[];
  attribution: string;
}

export async function buildPublicImpact(store: PublicImpactStore): Promise<PublicImpactPayload> {
  const [snaps, disabledList, assessments, disputes, visibility, skillTools, sources] = await Promise.all([
    store.snapshots(), store.disabledMetrics(), store.assessments(), store.disputes(), store.visibility(),
    store.skillTools(), store.featuredSources(),
  ]);
  const disabled = new Set(disabledList);

  const totals = METRICS.filter(m => m.proof === "RECORDS" && !disabled.has(m.id)).map(m => {
    const agg = publicAggregate(snaps.filter(s => s.metricId === m.id).map(s => ({ memberId: s.memberId, value: s.value })));
    const total = agg ? Math.round(agg.sum * 10) / 10 : null;
    return { id: m.id, label: m.label, unitSingular: m.unitSingular, unitPlural: m.unitPlural, total, contributors: agg ? agg.contributors : null };
  });

  const key = (m: string, s: string) => `${m}\u0000${s}`;
  const disputed = new Set(disputes.map(d => key(d.memberId, d.skillId)));
  const shared = new Set(visibility.filter(v => v.isPublic || v.showToTeam).map(v => key(v.memberId, v.skillId)));
  const membersBySkill = new Map<string, Set<string>>();
  for (const a of assessments) {
    if (a.level < DEMONSTRATED_LEVEL) continue;
    const k = key(a.memberId, a.skillId);
    if (disputed.has(k) || !shared.has(k)) continue;
    if (!membersBySkill.has(a.skillId)) membersBySkill.set(a.skillId, new Set());
    membersBySkill.get(a.skillId)!.add(a.memberId);
  }
  const byTool = new Map<string, { name: string; members: Set<string> }>();
  for (const link of skillTools) {
    const who = membersBySkill.get(link.skillId);
    if (!who) continue;
    const t = byTool.get(link.toolKey) ?? { name: link.toolName, members: new Set<string>() };
    if (link.toolName.localeCompare(t.name) < 0) t.name = link.toolName;
    who.forEach(m => t.members.add(m));
    byTool.set(link.toolKey, t);
  }
  const tools = [...byTool.values()]
    .filter(t => t.members.size >= PUBLIC_FLOOR)
    .map(t => ({ name: t.name, members: t.members.size }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const featured = sources
    .map(src => buildPublicCard(src, { disabledMetrics: disabled }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { metricVersion: METRIC_VERSION, floor: PUBLIC_FLOOR, totals, tools, featured, attribution: ONET_ATTRIBUTION };
}

let defaultStoreP: Promise<PublicImpactStore> | null = null;
export function getDefaultPublicImpactStore(): Promise<PublicImpactStore> {
  defaultStoreP ??= Promise.all([import("../db/prisma.js"), import("./careerStore.js"), import("./introService.js")])
    .then(([{ prisma }, { prismaCareerStore: cs }, intro]): PublicImpactStore => {
      const active = { isBot: false, deactivatedAt: null };
      return {
        snapshots: () => prisma.impactSnapshot.findMany({ where: { member: active }, select: { memberId: true, metricId: true, value: true } }),
        disabledMetrics: () => cs.disabledMetrics(),
        assessments: () => prisma.skillAssessment.findMany({
          where: { level: { gte: DEMONSTRATED_LEVEL }, member: active, skill: { status: "ACTIVE", canonicalId: null } },
          select: { memberId: true, skillId: true, level: true },
        }),
        disputes: () => prisma.skillDispute.findMany({ where: { status: { in: ["OPEN", "UPHELD"] } }, select: { memberId: true, skillId: true } }),
        visibility: () => prisma.skillVisibility.findMany({
          where: { OR: [{ isPublic: true }, { showToTeam: true }] }, select: { memberId: true, skillId: true, isPublic: true, showToTeam: true },
        }),
        async skillTools() {
          const links = await prisma.skillOnetLink.findMany({ where: { kind: "SOFTWARE" }, select: { skillId: true, ref: true } });
          if (!links.length) return [];
          const hot = await prisma.onetSoftware.findMany({
            where: { hot: true, exampleNorm: { in: [...new Set(links.map(l => l.ref))] } }, select: { exampleNorm: true, example: true },
          });
          const nameOf = new Map<string, string>();
          for (const h of hot) {
            const cur = nameOf.get(h.exampleNorm);
            if (cur === undefined || h.example.localeCompare(cur) < 0) nameOf.set(h.exampleNorm, h.example);
          }
          return links.flatMap(l => (nameOf.has(l.ref) ? [{ skillId: l.skillId, toolKey: l.ref, toolName: nameOf.get(l.ref)! }] : []));
        },
        async featuredSources() {
          const ids = (await prisma.member.findMany({
            where: { ...active, careerProfile: { is: { showOnPublicPage: true } } }, select: { id: true },
          })).map(m => m.id);
          const store = await intro.getDefaultIntroStore();
          const out = await Promise.all(ids.map(id => store.cardSource(id)));
          return out.flatMap(s => (s ? [s] : []));
        },
      };
    });
  return defaultStoreP;
}

export async function getPublicImpact(): Promise<PublicImpactPayload> {
  return buildPublicImpact(await getDefaultPublicImpactStore());
}
