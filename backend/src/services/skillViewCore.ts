// Response shaping for the skills feature (pure).
//
// Three audiences, three shapes:
//   member  - everything the system holds about them, with rationale and evidence.
//   admin   - the same plus disputes/disagreement, framed as advisory.
//   public  - built BY CONSTRUCTION from an allow-list (like publicEventService):
//             only fields named in buildPublicPortfolio ever leave the server, so a
//             new column on an assessment cannot leak to an employer by accident.
// Provenances (AI / self / peer / manager) are shown side by side and never merged.

export type Provenance = "AI_INFERRED" | "SELF_CLAIMED" | "PEER_ENDORSED" | "MANAGER_VERIFIED";
export type Band = "LOW" | "MEDIUM" | "HIGH";

export interface SkillNode { id: string; slug: string; name: string; type: string; parentIds: string[] }

export interface AssessmentRow {
  skillId: string;
  provenance: Provenance;
  level: number;
  confidence: number;
  confidenceBand: Band;
  firstSeen: Date | null;
  lastDemonstrated: Date | null;
  trend: "GROWING" | "STABLE" | "FADING";
  rationale: string | null;
  evidenceCount: number;
  assertedById: string;
  note: string | null;
  computedAt: Date;
}

/** Trust order for choosing which row leads a display. Rows are still all shown. */
export const PROVENANCE_ORDER: Provenance[] = ["MANAGER_VERIFIED", "PEER_ENDORSED", "AI_INFERRED", "SELF_CLAIMED"];

// ── Taxonomy grouping ────────────────────────────────────────

export interface Grouping { groupId: string; groupName: string; alsoUnder: string[] }

/** Each skill goes under its first (by name) root ancestor; other roots are listed as alsoUnder. */
export function groupBy(nodes: SkillNode[]): Map<string, Grouping> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out = new Map<string, Grouping>();
  const rootsOf = (id: string): SkillNode[] => {
    const roots = new Map<string, SkillNode>();
    const seen = new Set<string>();
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      const n = byId.get(cur);
      if (!n) continue;
      const parents = n.parentIds.filter((p) => byId.has(p));
      if (!parents.length) roots.set(n.id, n);
      else stack.push(...parents);
    }
    return [...roots.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  };
  for (const n of nodes) {
    const roots = rootsOf(n.id);
    const [first, ...rest] = roots.length ? roots : [n];
    out.set(n.id, { groupId: first.id, groupName: first.name, alsoUnder: rest.map((r) => r.name) });
  }
  return out;
}

// ── Disagreement ─────────────────────────────────────────────

export interface Disagreement {
  kind: "levels_differ" | "claim_without_evidence";
  spread: number;
  detail: string;
}

/** Visible disagreement between what the data says and what people claim. Never averaged away. */
export function disagreementOf(rows: Pick<AssessmentRow, "provenance" | "level" | "confidenceBand">[]): Disagreement | null {
  const by = new Map<Provenance, number>();
  for (const r of rows) by.set(r.provenance, r.level);
  const self = by.get("SELF_CLAIMED");
  if (self !== undefined && by.size === 1) {
    return { kind: "claim_without_evidence", spread: self, detail: `Self-claimed level ${self}; no analysed work backs it yet.` };
  }
  const present = [...by.entries()];
  if (present.length < 2) return null;
  const levels = present.map(([, l]) => l);
  const spread = Math.max(...levels) - Math.min(...levels);
  if (spread < 2) return null;
  const hi = present.reduce((a, b) => (b[1] > a[1] ? b : a));
  const lo = present.reduce((a, b) => (b[1] < a[1] ? b : a));
  const label = (p: Provenance) => p.toLowerCase().replace(/_/g, " ");
  return { kind: "levels_differ", spread, detail: `${label(hi[0])} says ${hi[1]}, ${label(lo[0])} says ${lo[1]}.` };
}

// ── Member / admin view ──────────────────────────────────────

export interface ShapedProvenance {
  provenance: Provenance;
  level: number;
  confidence: number;
  confidenceBand: Band;
  firstSeen: string | null;
  lastDemonstrated: string | null;
  trend: AssessmentRow["trend"];
  rationale: string | null;
  evidenceCount: number;
  assertedById: string | null;
  note: string | null;
  computedAt: string;
}

export interface ShapedSkill {
  skillId: string;
  slug: string;
  name: string;
  type: string;
  /** The row that leads the display: highest-trust provenance present. All rows are in `provenances`. */
  lead: Provenance;
  provenances: ShapedProvenance[];
  disagreement: Disagreement | null;
}

export interface ShapedGroup { groupId: string; groupName: string; skills: (ShapedSkill & { alsoUnder: string[] })[] }

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export function shapeSkills(rows: AssessmentRow[], nodes: SkillNode[]): ShapedGroup[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const groups = groupBy(nodes);
  const perSkill = new Map<string, AssessmentRow[]>();
  for (const r of rows) {
    if (!byId.has(r.skillId)) continue;
    perSkill.set(r.skillId, [...(perSkill.get(r.skillId) ?? []), r]);
  }
  const out = new Map<string, ShapedGroup>();
  for (const [skillId, list] of perSkill) {
    const node = byId.get(skillId)!;
    const g = groups.get(skillId)!;
    const sorted = [...list].sort((a, b) => PROVENANCE_ORDER.indexOf(a.provenance) - PROVENANCE_ORDER.indexOf(b.provenance));
    const group = out.get(g.groupId) ?? { groupId: g.groupId, groupName: g.groupName, skills: [] };
    group.skills.push({
      skillId, slug: node.slug, name: node.name, type: node.type, lead: sorted[0].provenance, alsoUnder: g.alsoUnder,
      provenances: sorted.map((r) => ({
        provenance: r.provenance, level: r.level, confidence: r.confidence, confidenceBand: r.confidenceBand,
        firstSeen: iso(r.firstSeen), lastDemonstrated: iso(r.lastDemonstrated), trend: r.trend, rationale: r.rationale,
        evidenceCount: r.evidenceCount, assertedById: r.assertedById || null, note: r.note, computedAt: r.computedAt.toISOString(),
      })),
      disagreement: disagreementOf(list),
    });
    out.set(g.groupId, group);
  }
  for (const g of out.values()) g.skills.sort((a, b) => a.name.localeCompare(b.name));
  return [...out.values()].sort((a, b) => a.groupName.localeCompare(b.groupName));
}

// ── Public portfolio (allow-list) ────────────────────────────

export interface PortfolioEvidenceRow {
  id: string;
  skillIds: string[];
  source: string;
  summary: string;
  sourceUrl: string | null;
  occurredAt: Date;
  projectId: string | null;
  projectName: string | null;
}

export interface PortfolioInput {
  member: { displayName: string; avatarUrl: string | null; title: string | null; bio: string | null };
  portfolio: { slug: string; enabled: boolean; headline: string | null };
  skills: SkillNode[];
  assessments: AssessmentRow[];
  /** skillId -> isPublic, only for skills the member set explicitly. Missing = public by default. */
  skillVisibility: ReadonlyMap<string, boolean>;
  /** projectId -> isPublic, same default. */
  projectVisibility: ReadonlyMap<string, boolean>;
  /** skills with an OPEN dispute; withheld until resolved */
  disputedSkillIds: ReadonlySet<string>;
  evidence: PortfolioEvidenceRow[];
}

export interface PublicEvidence { summary: string; source: string; date: string; project: string | null; link: string | null }
export interface PublicSkill {
  name: string;
  type: string;
  level: number;
  confidence: Band;
  lastDemonstrated: string | null;
  trend: AssessmentRow["trend"];
  verifiedByLead: boolean;
  peerEndorsed: boolean;
  evidence: PublicEvidence[];
}
export interface PublicPortfolio {
  slug: string;
  name: string;
  avatarUrl: string | null;
  title: string | null;
  bio: string | null;
  headline: string | null;
  generatedNote: string;
  groups: { name: string; skills: PublicSkill[] }[];
}

export const PUBLIC_MAX_SKILLS = 40;
export const PUBLIC_EVIDENCE_PER_SKILL = 5;
/** Only these sources carry a link an outsider could plausibly open; CAD/task URLs are internal. */
const LINKABLE_SOURCES = new Set(["GITHUB"]);
export const PUBLIC_NOTE = "Skill levels are advisory estimates built from a team member's project work, not formal certifications.";

/** Returns null when the portfolio is off, so the route can answer 404 without revealing the member exists. */
export function buildPublicPortfolio(input: PortfolioInput): PublicPortfolio | null {
  if (!input.portfolio.enabled) return null;
  const nodes = new Map(input.skills.map((n) => [n.id, n]));
  const groups = groupBy(input.skills);

  const bySkill = new Map<string, AssessmentRow[]>();
  for (const a of input.assessments) bySkill.set(a.skillId, [...(bySkill.get(a.skillId) ?? []), a]);

  const publicSkills: { groupName: string; skill: PublicSkill; sortKey: number }[] = [];
  for (const [skillId, rows] of bySkill) {
    const node = nodes.get(skillId);
    if (!node) continue;
    if (input.skillVisibility.get(skillId) === false) continue; // member hid it
    if (input.disputedSkillIds.has(skillId)) continue;          // under review
    const ai = rows.find((r) => r.provenance === "AI_INFERRED");
    const verified = rows.find((r) => r.provenance === "MANAGER_VERIFIED");
    const peer = rows.find((r) => r.provenance === "PEER_ENDORSED");
    // Evidence-backed or verified only. A bare self-claim, or a LOW-confidence inference, is not shown.
    const aiShowable = ai && ai.confidenceBand !== "LOW";
    const lead = verified ?? (aiShowable ? ai : undefined) ?? peer;
    if (!lead) continue;
    const evidence = input.evidence
      .filter((e) => e.skillIds.includes(skillId) && (!e.projectId || input.projectVisibility.get(e.projectId) !== false))
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, PUBLIC_EVIDENCE_PER_SKILL)
      .map<PublicEvidence>((e) => ({
        summary: e.summary, source: e.source.toLowerCase(), date: e.occurredAt.toISOString().slice(0, 10),
        project: e.projectId ? e.projectName : null, link: LINKABLE_SOURCES.has(e.source) ? e.sourceUrl : null,
      }));
    // A verified/peer-only skill with no showable evidence is still fine; an AI-only skill needs at least one.
    if (!verified && !peer && !evidence.length) continue;
    const g = groups.get(skillId)!;
    publicSkills.push({
      groupName: g.groupName,
      sortKey: lead.level * 10 + (lead.confidenceBand === "HIGH" ? 2 : lead.confidenceBand === "MEDIUM" ? 1 : 0),
      skill: {
        name: node.name, type: node.type.toLowerCase().replace("_", " "), level: lead.level, confidence: lead.confidenceBand,
        lastDemonstrated: lead.lastDemonstrated ? lead.lastDemonstrated.toISOString().slice(0, 7) : null, trend: lead.trend,
        verifiedByLead: !!verified, peerEndorsed: !!peer, evidence,
      },
    });
  }

  publicSkills.sort((a, b) => b.sortKey - a.sortKey || a.skill.name.localeCompare(b.skill.name));
  const kept = publicSkills.slice(0, PUBLIC_MAX_SKILLS);
  const byGroup = new Map<string, PublicSkill[]>();
  for (const k of kept) byGroup.set(k.groupName, [...(byGroup.get(k.groupName) ?? []), k.skill]);

  return {
    slug: input.portfolio.slug,
    name: input.member.displayName,
    avatarUrl: input.member.avatarUrl,
    title: input.member.title,
    bio: input.member.bio,
    headline: input.portfolio.headline,
    generatedNote: PUBLIC_NOTE,
    groups: [...byGroup.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([name, skills]) => ({ name, skills })),
  };
}

// ── Slug ─────────────────────────────────────────────────────

const RESERVED = new Set(["admin", "api", "me", "new", "edit", "clubpm", "portfolio", "search", "null", "undefined"]);

export function normalizeSlug(raw: string): string | null {
  const s = raw.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (s.length < 3 || s.length > 40 || RESERVED.has(s)) return null;
  return s;
}

// ── Admin skill matrix ───────────────────────────────────────

export interface MatrixCell { level: number; band: Band; provenance: Provenance; trend: AssessmentRow["trend"]; lastDemonstrated: string | null }
export interface MatrixSkill { id: string; name: string; type: string; holders: number; strong: number }
export interface SkillMatrix {
  advisory: string;
  groups: { id: string; name: string; skills: MatrixSkill[] }[];
  members: { id: string; displayName: string; avatarUrl: string | null; title: string | null; skillCount: number; cells: Record<string, MatrixCell> }[];
  /** Skills where exactly one person is at level 3+: knowledge that leaves if they do. */
  singlePoints: { skillId: string; name: string; memberId: string; displayName: string }[];
}

/** The level 3 bar used for "strong" and single-point counts. */
export const STRONG_LEVEL = 3;

/**
 * Members x skills, one cell per pair showing the highest-trust row (lead-verified,
 * then peer, then the analysis, then a self-claim). Columns are grouped by taxonomy
 * root and ordered by how many people hold them. Coverage, not a ranking: members
 * are sorted by name, and there is no total.
 */
export function buildMatrix(
  rows: (AssessmentRow & { memberId: string })[],
  nodes: SkillNode[],
  members: { id: string; displayName: string; avatarUrl: string | null; title: string | null }[],
  advisory: string,
): SkillMatrix {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const groups = groupBy(nodes);
  const memberById = new Map(members.map((m) => [m.id, m]));
  const per = new Map<string, AssessmentRow[]>();
  for (const r of rows) {
    if (!byId.has(r.skillId) || !memberById.has(r.memberId)) continue;
    const k = `${r.memberId}|${r.skillId}`;
    per.set(k, [...(per.get(k) ?? []), r]);
  }
  const cells = new Map<string, Record<string, MatrixCell>>();
  const holders = new Map<string, string[]>();
  const strong = new Map<string, string[]>();
  for (const [k, list] of per) {
    const [memberId, skillId] = k.split("|");
    const lead = [...list].sort((a, b) => PROVENANCE_ORDER.indexOf(a.provenance) - PROVENANCE_ORDER.indexOf(b.provenance))[0];
    const rec = cells.get(memberId) ?? {};
    rec[skillId] = { level: lead.level, band: lead.confidenceBand, provenance: lead.provenance, trend: lead.trend, lastDemonstrated: iso(lead.lastDemonstrated) };
    cells.set(memberId, rec);
    holders.set(skillId, [...(holders.get(skillId) ?? []), memberId]);
    // Strong means backed by more than a bare self-claim.
    if (lead.level >= STRONG_LEVEL && lead.provenance !== "SELF_CLAIMED") strong.set(skillId, [...(strong.get(skillId) ?? []), memberId]);
  }
  const outGroups = new Map<string, { id: string; name: string; skills: MatrixSkill[] }>();
  for (const skillId of holders.keys()) {
    const n = byId.get(skillId)!;
    const g = groups.get(skillId)!;
    const grp = outGroups.get(g.groupId) ?? { id: g.groupId, name: g.groupName, skills: [] };
    grp.skills.push({ id: skillId, name: n.name, type: n.type, holders: holders.get(skillId)!.length, strong: strong.get(skillId)?.length ?? 0 });
    outGroups.set(g.groupId, grp);
  }
  for (const g of outGroups.values()) g.skills.sort((a, b) => b.holders - a.holders || a.name.localeCompare(b.name));
  const singlePoints = [...strong.entries()].filter(([, ids]) => ids.length === 1).map(([skillId, [memberId]]) => ({
    skillId, name: byId.get(skillId)!.name, memberId, displayName: memberById.get(memberId)!.displayName,
  })).sort((a, b) => a.name.localeCompare(b.name));
  return {
    advisory,
    groups: [...outGroups.values()].sort((a, b) => a.name.localeCompare(b.name)),
    members: [...cells.entries()].map(([id, c]) => ({ ...memberById.get(id)!, skillCount: Object.keys(c).length, cells: c }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    singlePoints,
  };
}

// ── Teammate view (another member's profile) ─────────────────

export interface ProfileEvidence { summary: string; source: string; date: string; project: string | null; link: string | null }
export interface ProfileSkill {
  skillId: string;
  name: string;
  type: string;
  level: number;
  /** Confidence of the analysis row; null when the lead row is a human statement. */
  confidence: Band | null;
  lead: Provenance;
  trend: AssessmentRow["trend"];
  lastDemonstrated: string | null;
  verifiedByLead: boolean;
  endorsements: number;
  /** The viewer's own endorsement level, so the page can show and remove it. */
  myEndorsement: number | null;
  evidence: ProfileEvidence[];
}

export interface ProfileInput {
  viewerId: string;
  /** Project ids the viewer belongs to; evidence from other projects is withheld (admins pass null = all). */
  viewerProjectIds: ReadonlySet<string> | null;
  showOnProfile: boolean;
  skills: SkillNode[];
  assessments: AssessmentRow[];
  skillVisibility: ReadonlyMap<string, boolean>;
  disputedSkillIds: ReadonlySet<string>;
  evidence: PortfolioEvidenceRow[];
}

export const PROFILE_EVIDENCE_PER_SKILL = 3;

/**
 * What a teammate sees on someone's profile. Built by construction like the public
 * portfolio: no rationale, notes, or disputes. Skills the member hid, and skills
 * under an open dispute, are left out; evidence is limited to shared projects.
 */
export function buildProfileSkills(input: ProfileInput): { name: string; skills: ProfileSkill[] }[] {
  if (!input.showOnProfile) return [];
  const nodes = new Map(input.skills.map((n) => [n.id, n]));
  const groups = groupBy(input.skills);
  const bySkill = new Map<string, AssessmentRow[]>();
  for (const a of input.assessments) bySkill.set(a.skillId, [...(bySkill.get(a.skillId) ?? []), a]);
  const out = new Map<string, ProfileSkill[]>();
  for (const [skillId, rows] of bySkill) {
    const node = nodes.get(skillId);
    if (!node || input.skillVisibility.get(skillId) === false || input.disputedSkillIds.has(skillId)) continue;
    const sorted = [...rows].sort((a, b) => PROVENANCE_ORDER.indexOf(a.provenance) - PROVENANCE_ORDER.indexOf(b.provenance));
    const lead = sorted[0];
    const ai = rows.find((r) => r.provenance === "AI_INFERRED");
    const peers = rows.filter((r) => r.provenance === "PEER_ENDORSED");
    const mine = peers.find((r) => r.assertedById === input.viewerId);
    const evidence = input.evidence
      .filter((e) => e.skillIds.includes(skillId) && (!input.viewerProjectIds || (!!e.projectId && input.viewerProjectIds.has(e.projectId))))
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, PROFILE_EVIDENCE_PER_SKILL)
      .map<ProfileEvidence>((e) => ({
        summary: e.summary, source: e.source.toLowerCase(), date: e.occurredAt.toISOString().slice(0, 10),
        project: e.projectId ? e.projectName : null, link: e.source === "GITHUB" ? e.sourceUrl : null,
      }));
    const g = groups.get(skillId)!;
    out.set(g.groupName, [...(out.get(g.groupName) ?? []), {
      skillId, name: node.name, type: node.type, level: lead.level, confidence: ai ? ai.confidenceBand : null, lead: lead.provenance,
      trend: (ai ?? lead).trend, lastDemonstrated: iso((ai ?? lead).lastDemonstrated),
      verifiedByLead: rows.some((r) => r.provenance === "MANAGER_VERIFIED"), endorsements: peers.length, myEndorsement: mine?.level ?? null, evidence,
    }]);
  }
  for (const list of out.values()) list.sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));
  return [...out.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([name, skills]) => ({ name, skills }));
}
