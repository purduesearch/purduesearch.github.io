// Member-facing skills: see everything inferred about you with its evidence, add
// self-claims, flag wrong tags, choose what is public, add work that leaves few
// digital traces. Every read here is scoped to the signed-in member's own id.

import { randomUUID } from "node:crypto";
import { prisma } from "../db/prisma.js";
import { manualArtifact } from "./skillArtifactCore.js";
import { recomputeMembers } from "./skillAssessmentService.js";
import { writeEvidence } from "./skillEvidenceService.js";
import { RUBRIC_VERSION } from "./skillPrompts.js";
import { buildPublicPortfolio, normalizeSlug, shapeSkills, type AssessmentRow, type PortfolioEvidenceRow, type SkillNode } from "./skillViewCore.js";
import { TaxonomyError } from "./skillTaxonomyService.js";

const bad = (msg: string) => new TaxonomyError("INVALID", msg);
const isLevel = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 5;
const text = (v: unknown, min: number, max: number, what: string): string => {
  if (typeof v !== "string") throw bad(`${what} is required`);
  const t = v.replace(/\s+/g, " ").trim();
  if (t.length < min || t.length > max) throw bad(`${what} must be ${min}-${max} characters`);
  return t;
};

export async function loadSkillNodes(): Promise<SkillNode[]> {
  const rows = await prisma.skill.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, slug: true, name: true, type: true, parents: { where: { kind: "PARENT" }, select: { toId: true } } },
  });
  return rows.map((r) => ({ id: r.id, slug: r.slug, name: r.name, type: r.type, parentIds: r.parents.map((p) => p.toId) }));
}

export async function assessmentRowsFor(memberId: string): Promise<AssessmentRow[]> {
  const rows = await prisma.skillAssessment.findMany({ where: { memberId } });
  return rows.map((r) => ({
    skillId: r.skillId, provenance: r.provenance, level: r.level, confidence: r.confidence, confidenceBand: r.confidenceBand,
    firstSeen: r.firstSeen, lastDemonstrated: r.lastDemonstrated, trend: r.trend, rationale: r.rationale, evidenceCount: r.evidenceCount,
    assertedById: r.assertedById, note: r.note, computedAt: r.computedAt,
  }));
}

/** Everything the system holds about this member's skills, as the member sees it. */
export async function getMySkills(memberId: string) {
  const [nodes, rows, disputes, vis, projVis, portfolio, lastRun] = await Promise.all([
    loadSkillNodes(),
    assessmentRowsFor(memberId),
    prisma.skillDispute.findMany({ where: { memberId }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, skillId: true, evidenceId: true, reason: true, status: true, resolution: true, createdAt: true, resolvedAt: true } }),
    prisma.skillVisibility.findMany({ where: { memberId } }),
    prisma.skillProjectVisibility.findMany({ where: { memberId } }),
    prisma.memberPortfolio.findUnique({ where: { memberId } }),
    prisma.skillRun.findFirst({ where: { status: { in: ["SUCCEEDED", "PARTIAL"] } }, orderBy: { startedAt: "desc" }, select: { finishedAt: true } }),
  ]);
  const projectIds = (await prisma.skillEvidence.findMany({ where: { memberId, supersededAt: null, projectId: { not: null } }, distinct: ["projectId"], select: { projectId: true } })).map((p) => p.projectId!);
  const projects = projectIds.length ? await prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, name: true } }) : [];
  const visMap = new Map(vis.map((v) => [v.skillId, v.isPublic]));
  const projMap = new Map(projVis.map((v) => [v.projectId, v.isPublic]));
  return {
    groups: shapeSkills(rows, nodes).map((g) => ({ ...g, skills: g.skills.map((s) => ({ ...s, isPublic: visMap.get(s.skillId) !== false })) })),
    projects: projects.map((p) => ({ ...p, isPublic: projMap.get(p.id) !== false })),
    disputes,
    portfolio: portfolio ? { slug: portfolio.slug, enabled: portfolio.enabled, headline: portfolio.headline } : null,
    lastAnalysisAt: lastRun?.finishedAt ?? null,
    notice: "These are advisory estimates inferred from your project work. You can see all of it here, dispute anything that looks wrong, and choose what is public.",
  };
}

export async function getMyEvidence(memberId: string, skillId: string) {
  const joins = await prisma.skillEvidenceSkill.findMany({
    where: { skillId, evidence: { memberId, supersededAt: null } },
    select: {
      weight: true,
      evidence: { select: { id: true, source: true, sourceRef: true, sourceUrl: true, projectId: true, occurredAt: true, contribution: true, complexity: true, outcome: true, summary: true, modelVersion: true, promptVersion: true } },
    },
  });
  const projectIds = [...new Set(joins.map((j) => j.evidence.projectId).filter((p): p is string => !!p))];
  const projects = projectIds.length ? await prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, name: true } }) : [];
  const names = new Map(projects.map((p) => [p.id, p.name]));
  return joins
    .map((j) => ({ ...j.evidence, fit: j.weight, projectName: j.evidence.projectId ? names.get(j.evidence.projectId) ?? null : null }))
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
}

async function activeSkill(skillId: unknown): Promise<{ id: string; name: string }> {
  if (typeof skillId !== "string") throw bad("skillId is required");
  const skill = await prisma.skill.findFirst({ where: { id: skillId, status: "ACTIVE" }, select: { id: true, name: true } });
  if (!skill) throw new TaxonomyError("NOT_FOUND", "Skill not found");
  return skill;
}

// ── Claims and endorsements (own provenance rows; never touch the AI row) ──

async function upsertStated(memberId: string, skillId: string, provenance: "SELF_CLAIMED" | "PEER_ENDORSED" | "MANAGER_VERIFIED", assertedById: string, level: number, note: string | null) {
  const now = new Date();
  const data = { level, confidence: 0, confidenceBand: "LOW" as const, trend: "STABLE" as const, note, scoringVersion: provenance.toLowerCase(), computedAt: now, evidenceCount: 0, evidenceIds: [] as string[] };
  await prisma.skillAssessment.upsert({
    where: { memberId_skillId_provenance_assertedById: { memberId, skillId, provenance, assertedById } },
    create: { memberId, skillId, provenance, assertedById, ...data },
    update: data,
  });
}

export async function setSelfClaim(memberId: string, input: { skillId?: unknown; level?: unknown; note?: unknown }) {
  const skill = await activeSkill(input.skillId);
  if (!isLevel(input.level)) throw bad("level must be 1-5");
  const note = input.note == null || input.note === "" ? null : text(input.note, 1, 280, "note");
  await upsertStated(memberId, skill.id, "SELF_CLAIMED", memberId, input.level, note);
}

export async function removeSelfClaim(memberId: string, skillId: string) {
  await prisma.skillAssessment.deleteMany({ where: { memberId, skillId, provenance: "SELF_CLAIMED", assertedById: memberId } });
}

export async function endorsePeer(endorserId: string, input: { memberId?: unknown; skillId?: unknown; level?: unknown; note?: unknown }) {
  if (typeof input.memberId !== "string") throw bad("memberId is required");
  if (input.memberId === endorserId) throw bad("You cannot endorse yourself");
  if (!await prisma.member.findFirst({ where: { id: input.memberId, isBot: false }, select: { id: true } })) throw new TaxonomyError("NOT_FOUND", "Member not found");
  const skill = await activeSkill(input.skillId);
  if (!isLevel(input.level)) throw bad("level must be 1-5");
  const note = input.note == null || input.note === "" ? null : text(input.note, 1, 280, "note");
  await upsertStated(input.memberId, skill.id, "PEER_ENDORSED", endorserId, input.level, note);
}

export async function removePeerEndorsement(endorserId: string, memberId: string, skillId: string) {
  await prisma.skillAssessment.deleteMany({ where: { memberId, skillId, provenance: "PEER_ENDORSED", assertedById: endorserId } });
}

export async function endorseAsManager(adminId: string, input: { memberId?: unknown; skillId?: unknown; level?: unknown; note?: unknown }) {
  if (typeof input.memberId !== "string") throw bad("memberId is required");
  if (!await prisma.member.findFirst({ where: { id: input.memberId, isBot: false }, select: { id: true } })) throw new TaxonomyError("NOT_FOUND", "Member not found");
  const skill = await activeSkill(input.skillId);
  if (!isLevel(input.level)) throw bad("level must be 1-5");
  const note = input.note == null || input.note === "" ? null : text(input.note, 1, 280, "note");
  await upsertStated(input.memberId, skill.id, "MANAGER_VERIFIED", adminId, input.level, note);
}

// ── Disputes and visibility ──────────────────────────────────

export async function createDispute(memberId: string, input: { skillId?: unknown; evidenceId?: unknown; reason?: unknown }) {
  const skill = await activeSkill(input.skillId);
  const reason = text(input.reason, 5, 500, "reason");
  let evidenceId: string | null = null;
  if (input.evidenceId != null) {
    if (typeof input.evidenceId !== "string") throw bad("evidenceId must be a string");
    const link = await prisma.skillEvidenceSkill.findFirst({ where: { evidenceId: input.evidenceId, skillId: skill.id, evidence: { memberId } }, select: { evidenceId: true } });
    if (!link) throw new TaxonomyError("NOT_FOUND", "That evidence is not tagged with this skill for you");
    evidenceId = input.evidenceId;
  }
  const dup = await prisma.skillDispute.findFirst({ where: { memberId, skillId: skill.id, evidenceId, status: "OPEN" }, select: { id: true } });
  if (dup) throw new TaxonomyError("CONFLICT", "You already flagged this; it is waiting for review");
  return prisma.skillDispute.create({ data: { memberId, skillId: skill.id, evidenceId, reason }, select: { id: true, status: true, createdAt: true } });
}

export async function setSkillVisibility(memberId: string, skillId: string, isPublic: unknown) {
  if (typeof isPublic !== "boolean") throw bad("isPublic must be true or false");
  const skill = await activeSkill(skillId);
  await prisma.skillVisibility.upsert({ where: { memberId_skillId: { memberId, skillId: skill.id } }, create: { memberId, skillId: skill.id, isPublic }, update: { isPublic } });
}

export async function setProjectVisibility(memberId: string, projectId: string, isPublic: unknown) {
  if (typeof isPublic !== "boolean") throw bad("isPublic must be true or false");
  // Only projects this member has evidence in; stops the table filling with arbitrary ids.
  if (!await prisma.skillEvidence.findFirst({ where: { memberId, projectId }, select: { id: true } })) throw new TaxonomyError("NOT_FOUND", "No work of yours is linked to that project");
  await prisma.skillProjectVisibility.upsert({ where: { memberId_projectId: { memberId, projectId } }, create: { memberId, projectId, isPublic }, update: { isPublic } });
}

export async function setPortfolio(memberId: string, input: { slug?: unknown; enabled?: unknown; headline?: unknown }) {
  const existing = await prisma.memberPortfolio.findUnique({ where: { memberId } });
  let slug = existing?.slug ?? null;
  if (input.slug !== undefined) {
    if (typeof input.slug !== "string") throw bad("slug must be a string");
    const n = normalizeSlug(input.slug);
    if (!n) throw bad("slug must be 3-40 letters, numbers or dashes and not a reserved word");
    slug = n;
  }
  if (!slug) {
    const m = await prisma.member.findUnique({ where: { id: memberId }, select: { displayName: true } });
    slug = normalizeSlug(m?.displayName ?? "") ?? `member-${memberId.slice(-6).toLowerCase()}`;
  }
  const enabled = input.enabled === undefined ? existing?.enabled ?? false : input.enabled;
  if (typeof enabled !== "boolean") throw bad("enabled must be true or false");
  const headline = input.headline === undefined ? existing?.headline ?? null : input.headline === null || input.headline === "" ? null : text(input.headline, 1, 120, "headline");
  const taken = await prisma.memberPortfolio.findFirst({ where: { slug, NOT: { memberId } }, select: { memberId: true } });
  if (taken) throw new TaxonomyError("CONFLICT", "That portfolio address is taken");
  const row = await prisma.memberPortfolio.upsert({ where: { memberId }, create: { memberId, slug, enabled, headline }, update: { slug, enabled, headline } });
  return { slug: row.slug, enabled: row.enabled, headline: row.headline };
}

// ── Manual evidence ──────────────────────────────────────────

const CONTRIBUTIONS = ["AUTHORED", "REVIEWED", "LED", "ASSISTED"] as const;
const OUTCOMES = ["MERGED", "SHIPPED", "REWORKED", "ABANDONED", "NONE"] as const;

/**
 * Work with few digital traces (mentoring, testing, coordination). No model call
 * in the request path: the person picks the skills. Self-entered complexity is
 * capped at 3 so unverifiable entries cannot carry a person to the top levels;
 * an admin entering it for someone may use the full scale.
 */
export async function addManualEvidence(
  subjectId: string,
  enteredById: string,
  input: { title?: unknown; description?: unknown; link?: unknown; occurredAt?: unknown; skillIds?: unknown; contribution?: unknown; complexity?: unknown; outcome?: unknown; projectId?: unknown },
) {
  const title = text(input.title, 5, 120, "title");
  const description = text(input.description, 10, 1500, "description");
  if (!Array.isArray(input.skillIds) || input.skillIds.length < 1 || input.skillIds.length > 5) throw bad("choose 1-5 skills");
  const skills = await prisma.skill.findMany({ where: { id: { in: input.skillIds.filter((x): x is string => typeof x === "string") }, status: "ACTIVE" }, select: { id: true } });
  if (skills.length !== new Set(input.skillIds).size) throw new TaxonomyError("NOT_FOUND", "One of the skills was not found");
  const contribution = CONTRIBUTIONS.find((c) => c === input.contribution);
  if (!contribution) throw bad("contribution must be AUTHORED, REVIEWED, LED or ASSISTED");
  const outcome = input.outcome === undefined ? "NONE" : OUTCOMES.find((o) => o === input.outcome);
  if (!outcome) throw bad("invalid outcome");
  const byOther = enteredById !== subjectId;
  const requested = input.complexity === undefined ? 2 : input.complexity;
  if (!isLevel(requested)) throw bad("complexity must be 1-5");
  const complexity = byOther ? requested : Math.min(requested, 3);
  const occurredAt = input.occurredAt === undefined ? new Date() : new Date(String(input.occurredAt));
  if (Number.isNaN(occurredAt.getTime()) || occurredAt.getTime() > Date.now() + 86_400_000) throw bad("occurredAt must be a past date");
  let link: string | null = null;
  if (input.link != null && input.link !== "") {
    try { const u = new URL(String(input.link)); if (u.protocol !== "https:" && u.protocol !== "http:") throw 0; link = u.toString(); } catch { throw bad("link must be an http(s) URL"); }
  }
  let projectId: string | null = null, projectName: string | null = null;
  if (typeof input.projectId === "string" && input.projectId) {
    const pm = await prisma.projectMember.findFirst({ where: { projectId: input.projectId, memberId: subjectId }, select: { project: { select: { id: true, name: true } } } });
    if (!pm) throw bad("you are not a member of that project");
    projectId = pm.project.id; projectName = pm.project.name;
  }

  const id = `manual:${byOther ? `lead:${enteredById}` : "self"}:${randomUUID()}`;
  const artifact = manualArtifact({ id, memberId: subjectId, title, description, link, occurredAt, projectId, projectName, enteredByOther: byOther });
  const evidenceId = await writeEvidence(
    artifact,
    { skills: skills.map((s) => ({ skillId: s.id, fit: 1 })), proposed: [], contribution, complexity, outcome, summary: title.length >= 10 ? title : `${title} (manual entry)`, warnings: [] },
    [],
    { modelVersion: "manual", promptVersion: "manual-v1", rubricVersion: RUBRIC_VERSION, runId: null },
  );
  if (!evidenceId) throw new TaxonomyError("CONFLICT", "That entry already exists");
  await recomputeMembers([subjectId], { modelVersion: "manual" });
  return { evidenceId, complexity };
}

// ── Public portfolio ─────────────────────────────────────────

export async function getPublicPortfolio(slugRaw: string) {
  const slug = normalizeSlug(slugRaw);
  if (!slug) return null;
  const portfolio = await prisma.memberPortfolio.findUnique({ where: { slug }, include: { member: { select: { id: true, displayName: true, avatarUrl: true, title: true, bio: true, isBot: true } } } });
  if (!portfolio || !portfolio.enabled || portfolio.member.isBot) return null;
  const memberId = portfolio.memberId;
  const [nodes, rows, vis, projVis, disputes, joins] = await Promise.all([
    loadSkillNodes(),
    assessmentRowsFor(memberId),
    prisma.skillVisibility.findMany({ where: { memberId } }),
    prisma.skillProjectVisibility.findMany({ where: { memberId } }),
    prisma.skillDispute.findMany({ where: { memberId, status: "OPEN" }, select: { skillId: true } }),
    prisma.skillEvidence.findMany({
      where: { memberId, supersededAt: null }, orderBy: { occurredAt: "desc" }, take: 600,
      select: { id: true, source: true, summary: true, sourceUrl: true, occurredAt: true, projectId: true, skills: { select: { skillId: true } } },
    }),
  ]);
  const projectIds = [...new Set(joins.map((e) => e.projectId).filter((p): p is string => !!p))];
  const projects = projectIds.length ? await prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, name: true } }) : [];
  const names = new Map(projects.map((p) => [p.id, p.name]));
  const evidence: PortfolioEvidenceRow[] = joins.map((e) => ({
    id: e.id, skillIds: e.skills.map((s) => s.skillId), source: e.source, summary: e.summary, sourceUrl: e.sourceUrl, occurredAt: e.occurredAt,
    projectId: e.projectId, projectName: e.projectId ? names.get(e.projectId) ?? null : null,
  }));
  return buildPublicPortfolio({
    member: portfolio.member, portfolio: { slug: portfolio.slug, enabled: portfolio.enabled, headline: portfolio.headline },
    skills: nodes, assessments: rows,
    skillVisibility: new Map(vis.map((v) => [v.skillId, v.isPublic])),
    projectVisibility: new Map(projVis.map((v) => [v.projectId, v.isPublic])),
    disputedSkillIds: new Set(disputes.map((d) => d.skillId)),
    evidence,
  });
}
