// SkillEvidence persistence. Append-only: rows are inserted, and the only update
// ever made is stamping supersededAt on an older analysis of the same artifact
// (a DB trigger rejects anything else). Raw artifact data is never stored.

import { Prisma, type SkillContribution, type SkillEvidenceSource, type SkillOutcome } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import type { SkillArtifact } from "./skillPrompts.js";
import type { ValidAnalysis } from "./skillValidateCore.js";
import { evidenceKey, storedHash } from "./skillPipelineCore.js";
import type { EvidenceInput } from "./skillScoringCore.js";
import { canonicalMap, projectEvidence, projectedDisputes } from "./skillCatalogCore.js";

type Db = typeof prisma | Prisma.TransactionClient;

export interface EvidenceMeta { modelVersion: string; promptVersion: string; rubricVersion: string; runId: string | null }

/** Keys of current (not superseded) evidence. contentHash already embeds the prompt version, so a version bump misses on purpose. */
export async function existingEvidenceKeys(artifacts: SkillArtifact[], db: Db = prisma): Promise<Set<string>> {
  const out = new Set<string>();
  if (!artifacts.length) return out;
  const members = [...new Set(artifacts.map((a) => a.memberId))];
  const refs = [...new Set(artifacts.map((a) => a.sourceRef))];
  const rows = await db.skillEvidence.findMany({
    where: { memberId: { in: members }, sourceRef: { in: refs }, supersededAt: null },
    select: { memberId: true, source: true, sourceRef: true, contentHash: true },
  });
  for (const r of rows) out.add(`${r.memberId}|${r.source}|${r.sourceRef}|${r.contentHash}`);
  return out;
}

export function isAlreadyAnalyzed(existing: ReadonlySet<string>, a: SkillArtifact, promptVersion: string): boolean {
  return existing.has(evidenceKey(a, promptVersion));
}

/** Insert one evidence row (+ join rows). Returns the id, or null when an identical row already exists. */
export async function writeEvidence(
  a: SkillArtifact,
  analysis: ValidAnalysis,
  embedding: number[],
  meta: EvidenceMeta,
  db: Db = prisma,
): Promise<string | null> {
  const hash = storedHash(a.contentHash, meta.promptVersion);
  // A skill tag an admin already upheld as wrong for this member stays off, even if a re-analysis proposes it again.
  const map = canonicalMap(await db.skill.findMany({ select: { id: true, canonicalId: true } }));
  const banned = projectedDisputes((await db.skillDispute.findMany({ where: { memberId: a.memberId, status: "UPHELD" }, select: { skillId: true } })).map(d => d.skillId), map);
  if (banned.size) {
    const skills = analysis.skills.filter((s) => !banned.has(map.get(s.skillId) ?? s.skillId));
    if (!skills.length && analysis.skills.length) return null;
    analysis = { ...analysis, skills };
  }
  try {
    return await (db === prisma ? prisma.$transaction((tx) => insert(tx), { timeout: 30_000, maxWait: 15_000 }) : insert(db as Prisma.TransactionClient));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return null; // concurrent identical write
    throw err;
  }

  async function insert(tx: Prisma.TransactionClient): Promise<string> {
    // Older analyses of this exact artifact stop counting; the rows stay as history.
    await tx.skillEvidence.updateMany({
      where: { memberId: a.memberId, source: a.source as SkillEvidenceSource, sourceRef: a.sourceRef, supersededAt: null, NOT: { contentHash: hash } },
      data: { supersededAt: new Date() },
    });
    const row = await tx.skillEvidence.create({
      data: {
        memberId: a.memberId, source: a.source as SkillEvidenceSource, sourceRef: a.sourceRef, sourceUrl: a.sourceUrl ?? null,
        projectId: a.projectId ?? null, occurredAt: a.occurredAt, skillIds: analysis.skills.map((s) => s.skillId),
        contribution: analysis.contribution as SkillContribution, complexity: analysis.complexity, outcome: analysis.outcome as SkillOutcome,
        summary: analysis.summary, embedding, contentHash: hash,
        contributionKey: a.contributionKey ?? null,
        context: { title: a.title, role: a.memberRole, facts: a.facts, truncated: a.body.includes("[truncated]"), supportingQuotes: analysis.proposed.map(p => p.supportingQuote).filter((q): q is string => !!q && a.body.replace(/\s+/g, " ").includes(q)), note: "Source metadata and attributed contribution; raw contents remain in the source system." },
        modelVersion: meta.modelVersion, promptVersion: meta.promptVersion, rubricVersion: meta.rubricVersion, runId: meta.runId,
        skills: { create: analysis.skills.map((s) => ({ skillId: s.skillId, weight: s.fit })) },
      },
      select: { id: true },
    });
    return row.id;
  }
}

/** All current (non-superseded) evidence for scoring, shaped for skillScoringCore. */
export async function loadEvidenceForScoring(memberIds: string[], db: Db = prisma): Promise<Map<string, EvidenceInput[]>> {
  const out = new Map<string, EvidenceInput[]>();
  if (!memberIds.length) return out;
  const rows = await db.skillEvidence.findMany({
    where: { memberId: { in: memberIds }, supersededAt: null },
    select: {
      id: true, memberId: true, source: true, projectId: true, occurredAt: true, contribution: true, complexity: true, outcome: true, contributionKey: true,
      skills: { select: { skillId: true, weight: true } },
    },
  });
  const map = canonicalMap(await db.skill.findMany({ select: { id: true, canonicalId: true } }));
  const disputes = await db.skillDispute.findMany({ where: { memberId: { in: memberIds }, status: "UPHELD" }, select: { memberId: true, skillId: true } });
  for (const r of rows) {
    const list = out.get(r.memberId) ?? [];
    list.push({
      id: r.id, source: r.source, projectId: r.projectId, occurredAt: r.occurredAt, contribution: r.contribution, complexity: r.complexity,
      outcome: r.outcome, skills: r.skills.map((s) => ({ skillId: s.skillId, fit: s.weight })),
      contributionKey: r.contributionKey,
    });
    out.set(r.memberId, list);
  }
  for (const [id, evidence] of out) {
    const banned = projectedDisputes(disputes.filter(d => d.memberId === id).map(d => d.skillId), map);
    out.set(id, projectEvidence(evidence, map).map(e => ({ ...e, skills: e.skills.filter(s => !banned.has(s.skillId)) })));
  }
  return out;
}
