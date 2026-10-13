// Skill taxonomy + the admin review queue for proposed skills.
//
// Gemini never creates skills. It picks candidate keys; any free-text name it
// proposes goes through decideProposal() first, which maps aliases/typos onto
// existing skills, drops names an admin already rejected, and otherwise queues a
// SkillProposal. Only approveProposal() (admin) turns a proposal into a Skill.

import type { Prisma, SkillType } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import {
  buildAliasIndex,
  nearSkillMatches,
  normalizeSkillName,
  resolveSkillName,
  wouldCreateCycle,
  type AliasIndex,
  type SkillLite,
} from "./skillMatchCore.js";
import type { SeedSkill } from "./skillSeedData.js";
import { recomputeMembers } from "./skillAssessmentService.js";
import { MAPPED_PROPOSAL_FIT } from "./skillValidateCore.js";

type Db = typeof prisma | Prisma.TransactionClient;

export class TaxonomyError extends Error {
  constructor(public code: "ALIAS_TAKEN" | "CYCLE" | "NOT_FOUND" | "INVALID" | "NOT_PENDING" | "CONFLICT" | "FORBIDDEN", message: string) {
    super(message);
  }
}

export function slugify(name: string): string {
  return name
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/c\+\+/g, "cpp").replace(/c#/g, "csharp")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "skill";
}

// ── Pure decision for a model-proposed name ──────────────────

export type ProposalDecision =
  | { action: "MAP"; skillId: string }
  | { action: "SUPPRESS" }
  | { action: "QUEUE"; nearSkillIds: string[] };

export function decideProposal(name: string, index: AliasIndex, suppressedNorms: ReadonlySet<string>): ProposalDecision | { action: "INVALID" } {
  const norm = normalizeSkillName(name);
  if (norm.length < 2 || name.trim().length > 80) return { action: "INVALID" };
  const hit = resolveSkillName(name, index);
  if (hit) return { action: "MAP", skillId: hit };
  if (suppressedNorms.has(norm)) return { action: "SUPPRESS" };
  return { action: "QUEUE", nearSkillIds: nearSkillMatches(name, index) };
}

// ── Reads ────────────────────────────────────────────────────

export async function loadSkillLites(db: Db = prisma, opts: { activeOnly?: boolean } = {}): Promise<SkillLite[]> {
  const rows = await db.skill.findMany({
    where: opts.activeOnly === false ? {} : { status: "ACTIVE" },
    select: { id: true, name: true, aliases: { select: { alias: true } } },
    orderBy: { slug: "asc" },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, aliases: r.aliases.map((a) => a.alias) }));
}

export async function loadAliasIndex(db: Db = prisma): Promise<AliasIndex> {
  // Deprecated skills stay in the index so old names still resolve instead of re-proposing.
  return buildAliasIndex(await loadSkillLites(db, { activeOnly: false }));
}

export async function loadSuppressed(db: Db = prisma): Promise<Set<string>> {
  return new Set((await db.skillSuppression.findMany({ select: { nameNorm: true } })).map((r) => r.nameNorm));
}

// ── Writes (admin / seed) ────────────────────────────────────

export async function addAlias(skillId: string, alias: string, db: Db = prisma): Promise<void> {
  const norm = normalizeSkillName(alias);
  if (!norm) throw new TaxonomyError("INVALID", "Alias is empty");
  const taken = await db.skillAlias.findUnique({ where: { aliasNorm: norm }, select: { skillId: true } });
  if (taken) {
    if (taken.skillId === skillId) return;
    throw new TaxonomyError("ALIAS_TAKEN", `"${alias}" already belongs to another skill`);
  }
  const owner = await db.skill.findFirst({ select: { id: true, name: true } , where: { name: alias } });
  if (owner && owner.id !== skillId) throw new TaxonomyError("ALIAS_TAKEN", `"${alias}" is the name of another skill`);
  await db.skillAlias.create({ data: { skillId, alias, aliasNorm: norm } });
}

export async function addEdge(fromId: string, toId: string, kind: "PARENT" | "RELATED" | "PREREQUISITE", db: Db = prisma): Promise<void> {
  if (fromId === toId) throw new TaxonomyError("CYCLE", "A skill cannot link to itself");
  if (kind !== "RELATED") {
    const edges = await db.skillEdge.findMany({ where: { kind }, select: { fromId: true, toId: true } });
    if (wouldCreateCycle(edges, fromId, toId)) throw new TaxonomyError("CYCLE", `That ${kind.toLowerCase()} link would create a loop`);
  }
  await db.skillEdge.upsert({
    where: { fromId_toId_kind: { fromId, toId, kind } },
    create: { fromId, toId, kind },
    update: {},
  });
}

export interface NewSkill {
  name: string;
  type: SkillType;
  slug?: string;
  description?: string | null;
  source?: string;
  aliases?: string[];
  parentIds?: string[];
}

async function uniqueSlug(base: string, db: Db): Promise<string> {
  let slug = base, n = 2;
  while (await db.skill.findUnique({ where: { slug }, select: { id: true } })) slug = `${base}-${n++}`;
  return slug;
}

export async function createSkill(input: NewSkill, db: Db = prisma): Promise<{ id: string; slug: string }> {
  const name = input.name.trim();
  if (!name || name.length > 80) throw new TaxonomyError("INVALID", "Skill name must be 1-80 characters");
  const index = await loadAliasIndex(db);
  for (const form of [name, ...(input.aliases ?? [])]) {
    if (resolveSkillName(form, index)) throw new TaxonomyError("ALIAS_TAKEN", `"${form}" already matches an existing skill`);
  }
  const slug = await uniqueSlug(input.slug ?? slugify(name), db);
  const skill = await db.skill.create({
    data: { slug, name, type: input.type, description: input.description ?? null, source: input.source ?? "CLUB" },
    select: { id: true, slug: true },
  });
  for (const alias of input.aliases ?? []) await addAlias(skill.id, alias, db);
  for (const parentId of input.parentIds ?? []) await addEdge(skill.id, parentId, "PARENT", db);
  return skill;
}

// ── Seeding (idempotent, additive) ───────────────────────────

/** Upserts every seed skill by slug, then adds aliases and edges that are missing. Never deletes. */
export async function seedTaxonomy(data: SeedSkill[], db: Db = prisma): Promise<{ created: number; existing: number; aliases: number; edges: number }> {
  let created = 0, existing = 0, aliases = 0, edges = 0;
  const ids = new Map<string, string>();
  for (const sk of data) {
    const found = await db.skill.findUnique({ where: { slug: sk.slug }, select: { id: true } });
    if (found) { ids.set(sk.slug, found.id); existing++; continue; }
    const row = await db.skill.create({ data: { slug: sk.slug, name: sk.name, type: sk.type, source: sk.source }, select: { id: true } });
    ids.set(sk.slug, row.id);
    created++;
  }
  const idOf = (slug: string) => {
    const id = ids.get(slug);
    if (!id) throw new TaxonomyError("NOT_FOUND", `Seed references unknown skill "${slug}"`);
    return id;
  };
  for (const sk of data) {
    for (const alias of sk.aliases) {
      const norm = normalizeSkillName(alias);
      if (!norm || await db.skillAlias.findUnique({ where: { aliasNorm: norm }, select: { id: true } })) continue;
      await db.skillAlias.create({ data: { skillId: idOf(sk.slug), alias, aliasNorm: norm } });
      aliases++;
    }
    const links: [string[] | undefined, "PARENT" | "RELATED" | "PREREQUISITE"][] = [[sk.parents, "PARENT"], [sk.related, "RELATED"], [sk.prerequisites, "PREREQUISITE"]];
    for (const [targets, kind] of links) {
      for (const target of targets ?? []) {
        const before = await db.skillEdge.count({ where: { fromId: idOf(sk.slug), toId: idOf(target), kind } });
        if (before) continue;
        await addEdge(idOf(sk.slug), idOf(target), kind, db);
        edges++;
      }
    }
  }
  return { created, existing, aliases, edges };
}

// ── Proposal queue ───────────────────────────────────────────

export interface ProposedSkillInput {
  name: string;
  aliases?: string[];
  type?: SkillType | null;
  parentSlugs?: string[];
  rationale?: string | null;
  evidenceId?: string | null;
  runId?: string | null;
}

export type ProposalOutcome =
  | { kind: "mapped"; skillId: string }
  | { kind: "suppressed" }
  | { kind: "invalid" }
  | { kind: "queued"; proposalId: string; isNew: boolean };

/** Batch entry point: resolve, or queue (deduped by normalised name, seenCount bumped). */
export async function recordProposal(input: ProposedSkillInput, ctx: { index: AliasIndex; suppressed: ReadonlySet<string> }, db: Db = prisma): Promise<ProposalOutcome> {
  const decision = decideProposal(input.name, ctx.index, ctx.suppressed);
  if (decision.action === "MAP") return { kind: "mapped", skillId: decision.skillId };
  if (decision.action === "SUPPRESS") return { kind: "suppressed" };
  if (decision.action === "INVALID") return { kind: "invalid" };

  const nameNorm = normalizeSkillName(input.name);
  const pending = await db.skillProposal.findFirst({ where: { nameNorm, status: "PENDING" }, select: { id: true } });
  if (pending) {
    await db.skillProposal.update({
      where: { id: pending.id },
      data: { seenCount: { increment: 1 }, ...(input.evidenceId ? { evidenceIds: { push: input.evidenceId } } : {}) },
    });
    return { kind: "queued", proposalId: pending.id, isNew: false };
  }
  const row = await db.skillProposal.create({
    data: {
      name: input.name.trim().slice(0, 80),
      nameNorm,
      aliases: (input.aliases ?? []).slice(0, 8),
      suggestedType: input.type ?? null,
      suggestedParents: (input.parentSlugs ?? []).slice(0, 4),
      rationale: input.rationale?.slice(0, 500) ?? null,
      evidenceId: input.evidenceId ?? null,
      evidenceIds: input.evidenceId ? [input.evidenceId] : [],
      runId: input.runId ?? null,
    },
    select: { id: true },
  });
  return { kind: "queued", proposalId: row.id, isNew: true };
}

async function pendingProposal(id: string, db: Db) {
  const p = await db.skillProposal.findUnique({ where: { id } });
  if (!p) throw new TaxonomyError("NOT_FOUND", "Proposal not found");
  if (p.status !== "PENDING") throw new TaxonomyError("NOT_PENDING", "Proposal already reviewed");
  return p;
}

/**
 * The work that proposed a name now counts toward the skill it became: link each
 * current evidence row (at the same fit a mapped proposal gets) and recompute those
 * members. Skips members who had this skill upheld as wrong. No model call.
 */
export async function creditProposalEvidence(evidenceIds: string[], skillId: string): Promise<{ credited: number; members: number }> {
  const ids = [...new Set(evidenceIds)].filter(Boolean);
  if (!ids.length) return { credited: 0, members: 0 };
  const rows = await prisma.skillEvidence.findMany({ where: { id: { in: ids }, supersededAt: null }, select: { id: true, memberId: true } });
  const banned = new Set((await prisma.skillDispute.findMany({
    where: { skillId, status: "UPHELD", memberId: { in: [...new Set(rows.map((r) => r.memberId))] } }, select: { memberId: true },
  })).map((d) => d.memberId));
  const keep = rows.filter((r) => !banned.has(r.memberId));
  if (!keep.length) return { credited: 0, members: 0 };
  const res = await prisma.skillEvidenceSkill.createMany({ data: keep.map((r) => ({ evidenceId: r.id, skillId, weight: MAPPED_PROPOSAL_FIT })), skipDuplicates: true });
  const members = [...new Set(keep.map((r) => r.memberId))];
  await recomputeMembers(members);
  return { credited: res.count, members: members.length };
}

const proposalEvidence = (p: { evidenceId: string | null; evidenceIds: string[] }) => [...p.evidenceIds, ...(p.evidenceId ? [p.evidenceId] : [])];

export async function approveProposal(id: string, reviewerId: string, overrides: { name?: string; type?: SkillType; parentIds?: string[]; aliases?: string[] } = {}): Promise<{ skillId: string; credited: number }> {
  const out = await prisma.$transaction(async (tx) => {
    const p = await pendingProposal(id, tx);
    let parentIds = overrides.parentIds;
    if (!parentIds) {
      const parents = p.suggestedParents.length ? await tx.skill.findMany({ where: { slug: { in: p.suggestedParents } }, select: { id: true } }) : [];
      parentIds = parents.map((x) => x.id);
    }
    const skill = await createSkill({
      name: overrides.name ?? p.name,
      type: overrides.type ?? p.suggestedType ?? "TOOL",
      aliases: overrides.aliases ?? p.aliases,
      parentIds,
    }, tx);
    await tx.skillProposal.update({ where: { id }, data: { status: "APPROVED", createdSkillId: skill.id, reviewedById: reviewerId, reviewedAt: new Date() } });
    return { skillId: skill.id, evidence: proposalEvidence(p) };
  });
  const { credited } = await creditProposalEvidence(out.evidence, out.skillId);
  return { skillId: out.skillId, credited };
}

export async function rejectProposal(id: string, reviewerId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const p = await pendingProposal(id, tx);
    await tx.skillSuppression.upsert({ where: { nameNorm: p.nameNorm }, create: { nameNorm: p.nameNorm }, update: {} });
    await tx.skillProposal.update({ where: { id }, data: { status: "REJECTED", reviewedById: reviewerId, reviewedAt: new Date() } });
  });
}

/** The proposed name becomes an alias of an existing skill (duplicate, not new). */
export async function mergeProposal(id: string, intoSkillId: string, reviewerId: string): Promise<{ credited: number }> {
  const evidence = await prisma.$transaction(async (tx) => {
    const p = await pendingProposal(id, tx);
    if (!await tx.skill.findUnique({ where: { id: intoSkillId }, select: { id: true } })) throw new TaxonomyError("NOT_FOUND", "Target skill not found");
    for (const form of [p.name, ...p.aliases]) {
      try { await addAlias(intoSkillId, form, tx); } catch (e) { if (!(e instanceof TaxonomyError && e.code === "ALIAS_TAKEN")) throw e; }
    }
    await tx.skillProposal.update({ where: { id }, data: { status: "MERGED", mergedIntoId: intoSkillId, reviewedById: reviewerId, reviewedAt: new Date() } });
    return proposalEvidence(p);
  });
  return { credited: (await creditProposalEvidence(evidence, intoSkillId)).credited };
}

/**
 * Pending proposals whose name now resolves to a skill (an admin added it or an alias
 * by hand) are merged automatically and their work credited. Returns how many.
 */
export async function autoResolveProposals(reviewerId: string | null = null): Promise<number> {
  const pending = await prisma.skillProposal.findMany({ where: { status: "PENDING" }, select: { id: true, name: true, evidenceId: true, evidenceIds: true } });
  if (!pending.length) return 0;
  const index = await loadAliasIndex();
  let n = 0;
  for (const p of pending) {
    const skillId = resolveSkillName(p.name, index);
    if (!skillId) continue;
    const moved = await prisma.skillProposal.updateMany({ where: { id: p.id, status: "PENDING" }, data: { status: "MERGED", mergedIntoId: skillId, reviewedById: reviewerId, reviewedAt: new Date() } });
    if (!moved.count) continue;
    await creditProposalEvidence(proposalEvidence(p), skillId);
    n++;
  }
  return n;
}

export async function listProposals(status: "PENDING" | "APPROVED" | "REJECTED" | "MERGED" = "PENDING", db: Db = prisma) {
  const rows = await db.skillProposal.findMany({ where: { status }, orderBy: [{ seenCount: "desc" }, { createdAt: "asc" }], take: 200 });
  const index = await loadAliasIndex(db);
  return rows.map((r) => ({ ...r, nearSkillIds: nearSkillMatches(r.name, index) }));
}
