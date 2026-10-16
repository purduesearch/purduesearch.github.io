import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { CATALOG_POLICY_VERSION, canonicalMap, identityIds, mergeProblem, proposalProblem } from "./skillCatalogCore.js";
import { loadAliasIndex, loadSuppressed, recordProposal, createSkill, TaxonomyError, type ProposedSkillInput } from "./skillTaxonomyService.js";
import { nearSkillMatches } from "./skillMatchCore.js";
import { recomputeMembers } from "./skillAssessmentService.js";
import { MAPPED_PROPOSAL_FIT } from "./skillValidateCore.js";
import type { SkillArtifact } from "./skillPrompts.js";

export type CatalogDb = typeof prisma | Prisma.TransactionClient;
export const lockCatalog = (tx: Prisma.TransactionClient) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('skills-catalog'))`;
export async function readCatalogMap(db: CatalogDb = prisma) {
  return canonicalMap(await db.skill.findMany({ select: { id: true, canonicalId: true } }));
}
export async function catalogPolicy(db: CatalogDb = prisma) {
  return db.skillAutomationPolicy.upsert({ where: { id: "default" }, create: { id: "default" }, update: {} });
}
export async function updateCatalogPolicy(input: Record<string, unknown>) {
  const data: Record<string, boolean | number> = {};
  for (const key of ["paused", "autoCreate", "autoConsolidate"]) {
    if (input[key] !== undefined) { if (typeof input[key] !== "boolean") throw new TaxonomyError("INVALID", `${key} must be boolean`); data[key] = input[key] as boolean; }
  }
  if (input.maxRunCostUsd !== undefined) {
    if (typeof input.maxRunCostUsd !== "number" || !Number.isFinite(input.maxRunCostUsd) || input.maxRunCostUsd < .01 || input.maxRunCostUsd > 100) throw new TaxonomyError("INVALID", "Run budget must be between 0.01 and 100 USD");
    data.maxRunCostUsd = input.maxRunCostUsd;
  }
  // Semantic consolidation is intentionally not an exposed toggle: only normalized
  // exact duplicates are eligible until a separately reviewed equivalence policy exists.
  if (!Number.isInteger(input.revision)) throw new TaxonomyError("INVALID", "Expected policy revision is required");
  return prisma.$transaction(async tx => {
    await lockCatalog(tx);
    const current = await catalogPolicy(tx);
    if (current.revision !== input.revision) throw new TaxonomyError("CONFLICT", "Policy changed; refresh before saving");
    return tx.skillAutomationPolicy.update({ where: { id: "default" }, data: { ...data, revision: { increment: 1 } } });
  });
}

/** Normal pipeline path: all candidate creation is serialized with limits and receipts. */
export async function processCatalogProposal(input: ProposedSkillInput & { artifact?: SkillArtifact }, root: Pick<typeof prisma, "$transaction"> = prisma) {
  return root.$transaction(async tx => {
    await lockCatalog(tx);
    const index = await loadAliasIndex(tx);
    const suppressed = await loadSuppressed(tx);
    const outcome = await recordProposal(input, { index, suppressed }, tx);
    if (outcome.kind === "mapped" && input.evidenceId) {
      const evidence = await tx.skillEvidence.findFirst({ where: { id: input.evidenceId, supersededAt: null, memberId: input.artifact?.memberId }, select: { id: true, memberId: true } });
      const map = await readCatalogMap(tx);
      if (evidence && !await tx.skillDispute.count({ where: { memberId: evidence.memberId, status: "UPHELD", skillId: { in: identityIds(outcome.skillId, map) } } })) await tx.skillEvidenceSkill.upsert({ where: { evidenceId_skillId: { evidenceId: evidence.id, skillId: outcome.skillId } }, create: { evidenceId: evidence.id, skillId: outcome.skillId, weight: MAPPED_PROPOSAL_FIT }, update: {} });
    }
    if (outcome.kind !== "queued") return outcome;
    const policy = await catalogPolicy(tx);
    let problem = policy.paused ? "Catalog automation is paused" : !policy.autoCreate ? "Automatic creation is disabled" : proposalProblem(input, input.artifact, nearSkillMatches(input.name, index).length);
    const projectName = input.artifact?.projectName?.toLowerCase();
    if (projectName && projectName.length >= 3 && `${input.name} ${input.description ?? ""}`.toLowerCase().includes(projectName)) problem = "A reusable concept definition must omit private project names";
    const since = new Date(); since.setUTCHours(0, 0, 0, 0);
    if (!problem && await tx.skillCatalogChange.count({ where: { kind: "CREATE", automatic: true, createdAt: { gte: since } } }) >= policy.maxCreatesPerDay) problem = "Daily creation limit reached; candidate preserved for a later run";
    const evidence = input.evidenceId ? await tx.skillEvidence.findUnique({ where: { id: input.evidenceId } }) : null;
    if (!evidence || evidence.supersededAt || evidence.memberId !== input.artifact?.memberId) problem = "Current supporting evidence is required";
    if (problem) { await tx.skillProposal.update({ where: { id: outcome.proposalId }, data: { exceptionReason: problem } }); return outcome; }
    const parents = await tx.skill.findMany({ where: { OR: [{ slug: { in: input.parentSlugs ?? [] } }, { id: { in: input.parentIds ?? [] } }], status: "ACTIVE", canonicalId: null }, select: { id: true } });
    if (!parents.length && input.type !== "DOMAIN") { await tx.skillProposal.update({ where: { id: outcome.proposalId }, data: { exceptionReason: "A valid broader skill is needed before creating this concept" } }); return outcome; }
    const skill = await createSkill({ name: input.name, type: input.type ?? "TECHNIQUE", description: input.description, recordDecision: false, parentIds: parents.map(p => p.id) }, tx);
    await tx.skill.update({ where: { id: skill.id }, data: { lifecycle: "PROVISIONAL" } });
    await tx.skillProposal.update({ where: { id: outcome.proposalId }, data: { status: "APPROVED", createdSkillId: skill.id, reviewedAt: new Date(), exceptionReason: null } });
    await tx.skillEvidenceSkill.create({ data: { evidenceId: evidence!.id, skillId: skill.id, weight: MAPPED_PROPOSAL_FIT } });
    await tx.skillCatalogChange.create({ data: { kind: "CREATE", skillId: skill.id, automatic: true, reason: input.rationale!, policyVersion: CATALOG_POLICY_VERSION, payload: { proposalId: outcome.proposalId, evidenceIds: [evidence!.id], name: input.name, definition: input.description!, modelVersion: evidence!.modelVersion } } });
    return { kind: "created" as const, skillId: skill.id };
  }, { timeout: 30_000, maxWait: 20_000 });
}

/** Existing concepts retain all original records. A redirect is the only identity mutation. */
export async function consolidateSkills(sourceId: string, targetId: string, actorId: string | null, automatic = false, root: Pick<typeof prisma, "$transaction"> = prisma) {
  return root.$transaction(async tx => {
    await lockCatalog(tx);
    const nodes = await tx.skill.findMany();
    const source = nodes.find(n => n.id === sourceId), target = nodes.find(n => n.id === targetId);
    if (!source || !target) throw new TaxonomyError("NOT_FOUND", "Skill not found");
    const map = canonicalMap(nodes);
    const ids = [...identityIds(sourceId, map), ...identityIds(targetId, map)];
    const externalIds = new Set(nodes.filter(n => ids.includes(n.id) && n.externalId).map(n => `${n.source}:${n.externalId}`));
    if (externalIds.size > 1) throw new TaxonomyError("CONFLICT", "External identities in these concept groups conflict");
    const [edges, assertions, disputes, evidenceMembers, policy, blocks] = await Promise.all([
      tx.skillEdge.findMany(),
      tx.skillAssessment.findMany({ where: { skillId: { in: ids } } }),
      tx.skillDispute.count({ where: { skillId: { in: ids }, status: "OPEN" } }),
      tx.skillEvidenceSkill.findMany({ where: { skillId: { in: ids } }, select: { evidence: { select: { memberId: true } } } }),
      catalogPolicy(tx),
      tx.skillCatalogChange.findMany({ where: { kind: "KEEP_SEPARATE", OR: [{ skillId: sourceId, targetId }, { skillId: targetId, targetId: sourceId }] }, take: 1 }),
    ]);
    const memberIds = [...new Set([...assertions.map(a => a.memberId), ...evidenceMembers.map(e => e.evidence.memberId)])];
    const projectedEdges = edges.map(e => ({ ...e, fromId: map.get(e.fromId) ?? e.fromId, toId: map.get(e.toId) ?? e.toId }));
    const problem = mergeProblem(source, target, projectedEdges, memberIds.length, automatic, policy.maxAffectedMembers);
    if (problem) throw new TaxonomyError("CONFLICT", problem);
    if (disputes) throw new TaxonomyError("CONFLICT", "Resolve open disputes before consolidating these concepts");
    if (blocks.length) throw new TaxonomyError("CONFLICT", "A keep-separate decision blocks this consolidation");
    const manual = assertions.filter(a => a.provenance !== "AI_INFERRED");
    if (manual.some(a => manual.some(b => a.memberId === b.memberId && a.provenance === b.provenance && a.assertedById === b.assertedById && a.level !== b.level))) throw new TaxonomyError("CONFLICT", "Manual assertions conflict; keep these concepts separate for review");
    if (automatic) {
      if (policy.paused || !policy.autoConsolidate) throw new TaxonomyError("CONFLICT", "Automatic consolidation is disabled");
      const since = new Date(); since.setUTCHours(0, 0, 0, 0);
      if (await tx.skillCatalogChange.count({ where: { kind: "CONSOLIDATE", automatic: true, createdAt: { gte: since } } }) >= policy.maxMergesPerDay) throw new TaxonomyError("CONFLICT", "Daily consolidation limit reached");
    }
    await tx.skill.update({ where: { id: sourceId }, data: { canonicalId: targetId } });
    const change = await tx.skillCatalogChange.create({ data: { kind: "CONSOLIDATE", skillId: sourceId, targetId, actorId, automatic, reason: automatic ? "Exact normalized identity, matching type, no hierarchy or assertion conflicts" : "Admin confirmed the same concept and scope", policyVersion: CATALOG_POLICY_VERSION, payload: { sourceName: source.name, targetName: target.name, sourceDefinition: source.description, targetDefinition: target.description, memberIds, previousCanonicalId: null } } });
    await recomputeMembers(memberIds, { db: tx });
    return change;
  }, { timeout: 120_000, maxWait: 20_000 });
}

export async function reverseCatalogChange(id: string, actorId: string, root: Pick<typeof prisma, "$transaction"> = prisma) {
  return root.$transaction(async tx => {
    await lockCatalog(tx);
    const change = await tx.skillCatalogChange.findUnique({ where: { id } });
    if (!change) throw new TaxonomyError("NOT_FOUND", "Decision not found");
    if (change.kind !== "CONSOLIDATE" || !change.targetId) throw new TaxonomyError("CONFLICT", "Only an existing-concept consolidation can be reversed here");
    if (await tx.skillCatalogChange.findFirst({ where: { reversesId: id } })) throw new TaxonomyError("CONFLICT", "This consolidation has already been reversed");
    const dependents = await tx.skillCatalogChange.findMany({ where: { createdAt: { gte: change.createdAt }, id: { not: id }, kind: "CONSOLIDATE", OR: [{ skillId: { in: [change.skillId, change.targetId] } }, { targetId: { in: [change.skillId, change.targetId] } }] }, select: { id: true } });
    const reversedIds = new Set((await tx.skillCatalogChange.findMany({ where: { reversesId: { in: dependents.map(d => d.id) } }, select: { reversesId: true } })).map(c => c.reversesId));
    if (dependents.some(d => !reversedIds.has(d.id))) throw new TaxonomyError("CONFLICT", "Later consolidations depend on this decision; reverse those first");
    const skill = await tx.skill.findUnique({ where: { id: change.skillId } });
    if (skill?.canonicalId !== change.targetId) throw new TaxonomyError("CONFLICT", "Identity has changed; refresh before reversing");
    const map = await readCatalogMap(tx);
    const ids = identityIds(change.targetId, map);
    if (await tx.skillDispute.count({ where: { skillId: { in: ids }, status: { in: ["OPEN", "UPHELD"] }, createdAt: { gte: change.createdAt } } })) throw new TaxonomyError("CONFLICT", "A later dispute depends on this identity; review its scope before reversing");
    const members = await tx.skillAssessment.findMany({ where: { skillId: { in: ids } }, distinct: ["memberId"], select: { memberId: true } });
    const evidenceMembers = await tx.skillEvidenceSkill.findMany({ where: { skillId: { in: ids } }, select: { evidence: { select: { memberId: true } } } });
    await tx.skill.update({ where: { id: change.skillId }, data: { canonicalId: null } });
    const reversed = await tx.skillCatalogChange.create({ data: { kind: "KEEP_SEPARATE", skillId: change.skillId, targetId: change.targetId, actorId, reason: "Reversed consolidation; preserve distinct identities on future runs", policyVersion: CATALOG_POLICY_VERSION, reversesId: id, payload: { originalDecisionId: id } } });
    await recomputeMembers([...new Set([...members.map(m => m.memberId), ...evidenceMembers.map(e => e.evidence.memberId)])], { db: tx });
    return reversed;
  }, { timeout: 120_000, maxWait: 20_000 });
}

export async function catalogActivity() {
  const [changes, policy] = await Promise.all([prisma.skillCatalogChange.findMany({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100 }), catalogPolicy()]);
  return { changes, policy };
}

/** Revisit deferred proposals without a model call and consolidate only exact duplicate names. */
export async function reconcileCatalog() {
  const policy = await catalogPolicy();
  if (policy.paused) return;
  if (policy.autoCreate) {
    const pending = await prisma.skillProposal.findMany({ where: { status: "PENDING", description: { not: null }, supportingQuote: { not: null } }, orderBy: { createdAt: "asc" }, take: 50 });
    for (const p of pending) {
      const e = p.evidenceId ? await prisma.skillEvidence.findUnique({ where: { id: p.evidenceId } }) : null;
      const context = e?.context && typeof e.context === "object" && !Array.isArray(e.context) ? e.context : {};
      if (!e || e.supersededAt || !Array.isArray(context.supportingQuotes) || !context.supportingQuotes.includes(p.supportingQuote)) continue;
      const res = await processCatalogProposal({ name: p.name, type: p.suggestedType, description: p.description, supportingQuote: p.supportingQuote, rationale: p.rationale, parentSlugs: p.suggestedParents, parentIds: p.suggestedParents, evidenceId: e.id, artifact: { memberId: e.memberId, source: e.source, sourceRef: e.sourceRef, projectId: e.projectId, title: String(context.title ?? ""), body: context.supportingQuotes.filter((q): q is string => typeof q === "string").join("\n"), memberRole: String(context.role ?? ""), occurredAt: e.occurredAt, facts: {}, contentHash: e.contentHash } });
      if (res.kind === "created") await recomputeMembers([e.memberId]);
    }
  }
  const nodes = await prisma.skill.findMany({ where: { status: "ACTIVE", canonicalId: null }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  if (policy.autoConsolidate) {
    const { normalizeSkillName } = await import("./skillMatchCore.js");
    const seen = new Map<string, string>();
    for (const node of nodes) {
      const key = `${node.type}|${normalizeSkillName(node.name)}`;
      const existing = seen.get(key);
      if (existing) await consolidateSkills(node.id, existing, null, true).catch(e => { if (!(e instanceof TaxonomyError)) throw e; });
      else seen.set(key, node.id);
    }
  }
  // Promote only independently attributed artifacts; repeated re-analyses of the
  // same sourceRef cannot establish a provisional concept by repetition.
  for (const node of nodes.filter(n => n.lifecycle === "PROVISIONAL")) {
    const joins = await prisma.skillEvidenceSkill.findMany({ where: { skillId: node.id, evidence: { supersededAt: null } }, select: { evidence: { select: { source: true, sourceRef: true, contributionKey: true } } } });
    const groups = new Set(joins.map(j => j.evidence.contributionKey ?? `${j.evidence.source}:${j.evidence.sourceRef}`));
    if (groups.size < 2) continue;
    await prisma.$transaction(async tx => {
      await lockCatalog(tx);
      const changed = await tx.skill.updateMany({ where: { id: node.id, lifecycle: "PROVISIONAL", canonicalId: null }, data: { lifecycle: "ESTABLISHED" } });
      if (changed.count) await tx.skillCatalogChange.create({ data: { kind: "ESTABLISH", skillId: node.id, automatic: true, reason: "Supported by at least two distinct source contributions", policyVersion: CATALOG_POLICY_VERSION, payload: { contributionCount: groups.size } } });
    });
  }
}
