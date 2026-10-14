// Admin skills: staffing search, per-person view, review queues, run control.
//
// Everything returned is advisory. There is deliberately no overall score and no
// leaderboard: results are per skill, with level and confidence side by side and
// the evidence behind them, so a person can be judged on the work, not a number.

import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { skillsLlmConfig } from "./ai/skillsGemini.js";
import { loadSkillNodes, assessmentRowsFor } from "./skillMemberService.js";
import { recomputeAll, recomputeMembers } from "./skillAssessmentService.js";
import { buildMatrix, disagreementOf, shapeSkills, type Band, type Provenance } from "./skillViewCore.js";
import { TaxonomyError, createSkill, addAlias, addEdge } from "./skillTaxonomyService.js";
import { normalizeSkillName } from "./skillMatchCore.js";
import type { SkillType } from "@prisma/client";

export const ADVISORY = "Skill data is advisory. It is inferred from project work and should inform, not decide, staffing or evaluation.";
const BAND_RANK: Record<Band, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

export interface SearchParams {
  skillIds: string[];
  includeChildren?: boolean;
  minLevel?: number;
  activeWithinDays?: number;
  minConfidence?: Band;
  provenances?: Provenance[];
  limit?: number;
}

export interface PersonHit {
  member: { id: string; displayName: string; avatarUrl: string | null; title: string | null };
  skills: { skillId: string; name: string; rows: { provenance: Provenance; level: number; confidenceBand: Band; lastDemonstrated: string | null; trend: string; evidenceCount: number }[]; evidence: { id: string; summary: string; source: string; date: string; url: string | null; project: string | null }[] }[];
  bestLevel: number;
}

/** Order by strongest matching level, then confidence, then recency. Ties alphabetical so results are stable. */
export function rankPeople<T extends { bestLevel: number; bestBand: Band; lastDemonstrated: number; name: string }>(people: T[]): T[] {
  return [...people].sort((a, b) =>
    b.bestLevel - a.bestLevel || BAND_RANK[b.bestBand] - BAND_RANK[a.bestBand] || b.lastDemonstrated - a.lastDemonstrated || a.name.localeCompare(b.name));
}

/** Skill ids plus every descendant (searching "CAD" also finds SolidWorks). */
export async function expandSkillIds(ids: string[], includeChildren = true): Promise<string[]> {
  if (!includeChildren || !ids.length) return ids;
  const edges = await prisma.skillEdge.findMany({ where: { kind: "PARENT" }, select: { fromId: true, toId: true } });
  const kids = new Map<string, string[]>();
  for (const e of edges) kids.set(e.toId, [...(kids.get(e.toId) ?? []), e.fromId]);
  const seen = new Set(ids);
  const stack = [...ids];
  while (stack.length) for (const k of kids.get(stack.pop()!) ?? []) if (!seen.has(k)) { seen.add(k); stack.push(k); }
  return [...seen];
}

export async function searchPeople(p: SearchParams) {
  const skillIds = await expandSkillIds(p.skillIds, p.includeChildren !== false);
  if (!skillIds.length) return { advisory: ADVISORY, people: [] as PersonHit[] };
  const minBand = p.minConfidence ? BAND_RANK[p.minConfidence] : 0;
  const since = p.activeWithinDays ? new Date(Date.now() - p.activeWithinDays * 86_400_000) : null;

  const rows = await prisma.skillAssessment.findMany({
    where: {
      skillId: { in: skillIds }, level: { gte: p.minLevel ?? 1 },
      ...(p.provenances?.length ? { provenance: { in: p.provenances } } : {}),
      ...(since ? { lastDemonstrated: { gte: since } } : {}),
      member: { isBot: false },
    },
    include: { member: { select: { id: true, displayName: true, avatarUrl: true, title: true } }, skill: { select: { name: true } } },
    take: 2000,
  });
  const kept = rows.filter((r) => BAND_RANK[r.confidenceBand] >= minBand || r.provenance !== "AI_INFERRED");

  const byMember = new Map<string, typeof kept>();
  for (const r of kept) byMember.set(r.memberId, [...(byMember.get(r.memberId) ?? []), r]);
  const memberIds = [...byMember.keys()];
  const evidence = memberIds.length
    ? await prisma.skillEvidenceSkill.findMany({
        where: { skillId: { in: skillIds }, evidence: { memberId: { in: memberIds }, supersededAt: null } },
        select: { skillId: true, evidence: { select: { id: true, memberId: true, summary: true, source: true, occurredAt: true, sourceUrl: true, projectId: true } } },
        take: 4000,
      })
    : [];
  const projectIds = [...new Set(evidence.map((e) => e.evidence.projectId).filter((x): x is string => !!x))];
  const projects = projectIds.length ? await prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, name: true } }) : [];
  const pname = new Map(projects.map((x) => [x.id, x.name]));

  const ranked = rankPeople([...byMember.entries()].map(([memberId, list]) => {
    const best = [...list].sort((a, b) => b.level - a.level || BAND_RANK[b.confidenceBand] - BAND_RANK[a.confidenceBand])[0];
    const bySkill = new Map<string, typeof list>();
    for (const r of list) bySkill.set(r.skillId, [...(bySkill.get(r.skillId) ?? []), r]);
    const hit: PersonHit = {
      member: list[0].member, bestLevel: best.level,
      skills: [...bySkill.entries()].map(([skillId, rs]) => ({
        skillId, name: rs[0].skill.name,
        rows: rs.map((r) => ({ provenance: r.provenance, level: r.level, confidenceBand: r.confidenceBand, lastDemonstrated: r.lastDemonstrated?.toISOString() ?? null, trend: r.trend, evidenceCount: r.evidenceCount })),
        evidence: evidence
          .filter((e) => e.skillId === skillId && e.evidence.memberId === memberId)
          .sort((a, b) => b.evidence.occurredAt.getTime() - a.evidence.occurredAt.getTime()).slice(0, 3)
          .map((e) => ({ id: e.evidence.id, summary: e.evidence.summary, source: e.evidence.source.toLowerCase(), date: e.evidence.occurredAt.toISOString().slice(0, 10), url: e.evidence.sourceUrl, project: e.evidence.projectId ? pname.get(e.evidence.projectId) ?? null : null })),
      })),
    };
    return { hit, bestLevel: best.level, bestBand: best.confidenceBand as Band, lastDemonstrated: best.lastDemonstrated?.getTime() ?? 0, name: list[0].member.displayName };
  }));
  return { advisory: ADVISORY, people: ranked.slice(0, Math.min(p.limit ?? 50, 100)).map((r) => r.hit) };
}

/** Club-wide coverage grid: who holds which skill, and where only one person is strong. */
export async function getSkillMatrix() {
  const [nodes, rows] = await Promise.all([
    loadSkillNodes(),
    prisma.skillAssessment.findMany({
      where: { member: { isBot: false } },
      select: {
        memberId: true, skillId: true, provenance: true, level: true, confidence: true, confidenceBand: true, firstSeen: true, lastDemonstrated: true,
        trend: true, rationale: true, evidenceCount: true, assertedById: true, note: true, computedAt: true,
      },
    }),
  ]);
  const members = await prisma.member.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.memberId))] }, isBot: false },
    select: { id: true, displayName: true, avatarUrl: true, title: true },
  });
  return buildMatrix(rows, nodes, members, ADVISORY);
}

export async function getPerson(memberId: string) {
  const member = await prisma.member.findFirst({ where: { id: memberId, isBot: false }, select: { id: true, displayName: true, avatarUrl: true, title: true, githubLogin: true } });
  if (!member) throw new TaxonomyError("NOT_FOUND", "Member not found");
  const [nodes, rows, disputes, evidenceCount, lastEvidence] = await Promise.all([
    loadSkillNodes(), assessmentRowsFor(memberId),
    prisma.skillDispute.findMany({ where: { memberId }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.skillEvidence.count({ where: { memberId, supersededAt: null } }),
    prisma.skillEvidence.findFirst({ where: { memberId, supersededAt: null }, orderBy: { occurredAt: "desc" }, select: { occurredAt: true } }),
  ]);
  return {
    advisory: ADVISORY,
    member: { id: member.id, displayName: member.displayName, avatarUrl: member.avatarUrl, title: member.title, githubLinked: !!member.githubLogin },
    groups: shapeSkills(rows, nodes), disputes, evidenceCount, lastEvidenceAt: lastEvidence?.occurredAt ?? null,
  };
}

/** Where the data and the claims disagree, widest gap first. */
export async function listDisagreements(limit = 100) {
  const rows = await prisma.skillAssessment.findMany({
    where: { member: { isBot: false } },
    include: { member: { select: { id: true, displayName: true } }, skill: { select: { id: true, name: true } } },
  });
  const grouped = new Map<string, typeof rows>();
  for (const r of rows) grouped.set(`${r.memberId}|${r.skillId}`, [...(grouped.get(`${r.memberId}|${r.skillId}`) ?? []), r]);
  const out: { member: { id: string; displayName: string }; skill: { id: string; name: string }; kind: string; spread: number; detail: string; levels: { provenance: Provenance; level: number }[] }[] = [];
  for (const list of grouped.values()) {
    const d = disagreementOf(list);
    if (d) out.push({ member: list[0].member, skill: list[0].skill, kind: d.kind, spread: d.spread, detail: d.detail, levels: list.map((r) => ({ provenance: r.provenance, level: r.level })) });
  }
  return out.sort((a, b) => b.spread - a.spread || a.member.displayName.localeCompare(b.member.displayName)).slice(0, limit);
}

// ── Disputes ─────────────────────────────────────────────────

export async function listDisputes(status: "OPEN" | "UPHELD" | "DISMISSED" = "OPEN") {
  const rows = await prisma.skillDispute.findMany({ where: { status }, orderBy: { createdAt: "asc" }, take: 200 });
  const skills = await prisma.skill.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.skillId))] } }, select: { id: true, name: true } });
  const members = await prisma.member.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.memberId))] } }, select: { id: true, displayName: true } });
  const evidence = await prisma.skillEvidence.findMany({ where: { id: { in: rows.map((r) => r.evidenceId).filter((x): x is string => !!x) } }, select: { id: true, summary: true, source: true, sourceUrl: true, occurredAt: true } });
  const sn = new Map(skills.map((s) => [s.id, s.name])), mn = new Map(members.map((m) => [m.id, m.displayName])), ev = new Map(evidence.map((e) => [e.id, e]));
  return rows.map((r) => ({ ...r, skillName: sn.get(r.skillId) ?? null, memberName: mn.get(r.memberId) ?? null, evidence: r.evidenceId ? ev.get(r.evidenceId) ?? null : null }));
}

/**
 * UPHELD removes the disputed tag from scoring (the evidence rows stay as history):
 * just the one evidence item if the dispute named one, otherwise this skill on all
 * of the member's evidence. Later re-analyses will not re-add an upheld skill.
 */
export async function resolveDispute(id: string, adminId: string, decision: "UPHELD" | "DISMISSED", resolution: string | null) {
  const d = await prisma.skillDispute.findUnique({ where: { id } });
  if (!d) throw new TaxonomyError("NOT_FOUND", "Dispute not found");
  if (d.status !== "OPEN") throw new TaxonomyError("CONFLICT", "Already resolved");
  if (decision === "UPHELD") {
    await prisma.skillEvidenceSkill.deleteMany({ where: { skillId: d.skillId, evidence: { memberId: d.memberId }, ...(d.evidenceId ? { evidenceId: d.evidenceId } : {}) } });
  }
  await prisma.skillDispute.update({ where: { id }, data: { status: decision, resolution: resolution?.slice(0, 500) ?? null, resolvedById: adminId, resolvedAt: new Date() } });
  if (decision === "UPHELD") await recomputeMembers([d.memberId]);
}

// ── Taxonomy admin ───────────────────────────────────────────

export async function listTaxonomy() {
  const [skills, usage] = await Promise.all([
    prisma.skill.findMany({ orderBy: { name: "asc" }, include: { aliases: { select: { id: true, alias: true } }, parents: { select: { id: true, toId: true, kind: true } } } }),
    prisma.skillAssessment.groupBy({ by: ["skillId"], where: { provenance: "AI_INFERRED" }, _count: { _all: true } }),
  ]);
  const used = new Map(usage.map((u) => [u.skillId, u._count._all]));
  return skills.map((s) => ({
    id: s.id, slug: s.slug, name: s.name, type: s.type, description: s.description, status: s.status, source: s.source,
    aliases: s.aliases, links: s.parents.map((e) => ({ id: e.id, toId: e.toId, kind: e.kind })), people: used.get(s.id) ?? 0,
  }));
}

export async function patchSkill(id: string, input: { name?: unknown; type?: unknown; description?: unknown; status?: unknown }) {
  const skill = await prisma.skill.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!skill) throw new TaxonomyError("NOT_FOUND", "Skill not found");
  const data: { name?: string; type?: SkillType; description?: string | null; status?: "ACTIVE" | "DEPRECATED" } = {};
  if (input.name !== undefined) {
    if (typeof input.name !== "string" || input.name.trim().length < 1 || input.name.trim().length > 80) throw new TaxonomyError("INVALID", "name must be 1-80 characters");
    const norm = normalizeSkillName(input.name);
    const clash = await prisma.skillAlias.findUnique({ where: { aliasNorm: norm }, select: { skillId: true } });
    if (clash && clash.skillId !== id) throw new TaxonomyError("ALIAS_TAKEN", "That name is an alias of another skill");
    data.name = input.name.trim();
  }
  if (input.type !== undefined) {
    if (!["TOOL", "TECHNIQUE", "DOMAIN", "SOFT_SKILL"].includes(String(input.type))) throw new TaxonomyError("INVALID", "bad type");
    data.type = input.type as SkillType;
  }
  if (input.description !== undefined) data.description = input.description === null ? null : String(input.description).slice(0, 500);
  if (input.status !== undefined) {
    if (input.status !== "ACTIVE" && input.status !== "DEPRECATED") throw new TaxonomyError("INVALID", "bad status");
    data.status = input.status;
  }
  await prisma.skill.update({ where: { id }, data });
}

export { createSkill, addAlias, addEdge };

export async function removeAlias(aliasId: string) { await prisma.skillAlias.delete({ where: { id: aliasId } }); }
export async function removeEdge(edgeId: string) { await prisma.skillEdge.delete({ where: { id: edgeId } }); }

// ── Runs ─────────────────────────────────────────────────────

export async function listRuns(limit = 20) {
  return prisma.skillRun.findMany({ orderBy: { startedAt: "desc" }, take: Math.min(limit, 100) });
}

export async function runStatusPanel() {
  const now = new Date();
  const [latest, lastGood, running, recent, pendingProposals, openDisputes, evidence, members, activeSkills, totalMembers, githubLinked, repos] = await Promise.all([
    prisma.skillRun.findFirst({ orderBy: { startedAt: "desc" } }),
    prisma.skillRun.findFirst({ where: { status: { in: ["SUCCEEDED", "PARTIAL"] } }, orderBy: { startedAt: "desc" } }),
    prisma.skillRun.findFirst({ where: { status: "RUNNING" }, orderBy: { startedAt: "desc" }, select: { id: true, startedAt: true, trigger: true, progress: true, leaseUntil: true, cancelRequested: true, scope: true } }),
    prisma.skillRun.findMany({ orderBy: { startedAt: "desc" }, take: 12, select: { id: true, trigger: true, status: true, startedAt: true, finishedAt: true, counts: true, errors: true, estCostUsd: true, tokensIn: true, tokensOut: true, scope: true, modelVersion: true } }),
    prisma.skillProposal.count({ where: { status: "PENDING" } }),
    prisma.skillDispute.count({ where: { status: "OPEN" } }),
    prisma.skillEvidence.count({ where: { supersededAt: null } }),
    prisma.skillAssessment.findMany({ where: { provenance: "AI_INFERRED" }, distinct: ["memberId"], select: { memberId: true } }),
    prisma.skill.count({ where: { status: "ACTIVE" } }),
    prisma.member.count({ where: { isBot: false } }),
    prisma.member.count({ where: { isBot: false, githubLogin: { not: null } } }),
    prisma.projectRepo.count(),
  ]);
  const llm = skillsLlmConfig();
  // A RUNNING row whose lease ran out belongs to a process that died (deploy, crash).
  const stale = !!running && (!running.leaseUntil || running.leaseUntil < now);
  const checks = [
    { id: "key", ok: llm.keySet, label: "Gemini API key", detail: llm.keySet ? "Set on the server" : "GEMINI_API_KEY is missing in backend/.env" },
    { id: "model", ok: !!llm.model, label: "Model", detail: llm.model ? `${llm.model} (${llm.schemaMode === "json" ? "JSON schema" : "OpenAPI schema"}${llm.thinkingBudget !== null ? `, thinking ${llm.thinkingBudget}` : ""})` : "Set SKILLS_MODEL or GEMINI_MODEL" },
    { id: "taxonomy", ok: activeSkills > 0, label: "Skill list", detail: activeSkills ? `${activeSkills} active skills` : "Empty: install the starter skills (the next run also does this)" },
    { id: "github", ok: githubLinked > 0 || repos === 0, label: "GitHub accounts", detail: `${githubLinked} of ${totalMembers} members linked · ${repos} repos` },
    { id: "schedule", ok: process.env.SKILLS_ENABLED === "1", label: "Weekly schedule", detail: process.env.SKILLS_ENABLED === "1" ? "Sundays 02:30 server time" : "Off (set SKILLS_ENABLED=1)" },
  ];
  return {
    enabled: process.env.SKILLS_ENABLED === "1", geminiConfigured: llm.problems.length === 0, configProblems: llm.problems, schedule: "Sundays 02:30 server time",
    running: running && !stale ? running : null, staleRun: stale ? running : null,
    latest, lastSuccessful: lastGood, recent, pendingProposals, openDisputes, evidenceCount: evidence, membersWithSkills: members.length,
    activeSkills, totalMembers, githubLinked, checks, dryRun: dryRunState,
    llm: { model: llm.model, embedModel: llm.embedModel, batch: llm.batch, rpm: llm.rpm },
  };
}

// ── Dry runs (in memory: they write nothing, and collecting can outlast a proxy timeout) ──

export interface DryRunState { running: boolean; startedAt: string; finishedAt: string | null; scope: string; result: unknown | null; error: string | null }
export let dryRunState: DryRunState | null = null;
export function setDryRunState(s: DryRunState | null) { dryRunState = s; }

/** Admin stop: a live run stops at its next checkpoint; a dead one (lease expired) is closed now. */
export async function cancelRun(id: string) {
  const run = await prisma.skillRun.findUnique({ where: { id }, select: { status: true, leaseUntil: true } });
  if (!run) throw new TaxonomyError("NOT_FOUND", "Run not found");
  if (run.status !== "RUNNING") throw new TaxonomyError("CONFLICT", "That run already finished");
  const now = new Date();
  if (!run.leaseUntil || run.leaseUntil < now) {
    await prisma.skillRun.update({ where: { id }, data: { status: "FAILED", finishedAt: now, progress: Prisma.DbNull, errors: [{ stage: "lease", message: "Run stopped responding (server restart or crash); closed by an admin." }] } });
    return { closed: true };
  }
  await prisma.skillRun.update({ where: { id }, data: { cancelRequested: true } });
  return { closed: false };
}

export async function recomputeEverything() { return recomputeAll(); }
