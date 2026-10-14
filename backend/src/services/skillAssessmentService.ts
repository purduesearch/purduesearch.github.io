// Derived AI_INFERRED assessments. Recomputable at any time from evidence with no
// model call: deterministic scoring (skillScoringCore) over current evidence.
// Other provenances (self-claimed, peer-endorsed, manager-verified) live on their
// own rows and are never touched here, so they can disagree with the AI row.

import { prisma } from "../db/prisma.js";
import { loadEvidenceForScoring } from "./skillEvidenceService.js";
import { assessMember, SCORING_VERSION } from "./skillScoringCore.js";

export interface RecomputeResult { members: number; upserted: number; removed: number }

export async function recomputeMembers(memberIds: string[], opts: { now?: Date; modelVersion?: string | null } = {}): Promise<RecomputeResult> {
  const now = opts.now ?? new Date();
  const result: RecomputeResult = { members: 0, upserted: 0, removed: 0 };
  const evidence = await loadEvidenceForScoring(memberIds);
  for (const memberId of memberIds) {
    const assessments = assessMember(evidence.get(memberId) ?? [], now);
    await prisma.$transaction(async (tx) => {
      for (const [skillId, a] of assessments) {
        const data = {
          level: a.level, confidence: a.confidence, confidenceBand: a.confidenceBand, firstSeen: a.firstSeen, lastDemonstrated: a.lastDemonstrated,
          trend: a.trend, rationale: a.rationale, evidenceIds: a.evidenceIds, evidenceCount: a.evidenceCount, sourceDiversity: a.sourceDiversity,
          modelVersion: opts.modelVersion ?? null, scoringVersion: SCORING_VERSION, computedAt: now,
        };
        await tx.skillAssessment.upsert({
          where: { memberId_skillId_provenance_assertedById: { memberId, skillId, provenance: "AI_INFERRED", assertedById: "" } },
          create: { memberId, skillId, provenance: "AI_INFERRED", assertedById: "", ...data },
          update: data,
        });
        result.upserted++;
      }
      // A skill whose evidence is all superseded/removed no longer has an AI row.
      const gone = await tx.skillAssessment.deleteMany({
        where: { memberId, provenance: "AI_INFERRED", skillId: { notIn: [...assessments.keys()] } },
      });
      result.removed += gone.count;
      // A member with dozens of skills means dozens of round trips; the 5 s interactive
      // default aborted whole runs on a remote database ("Transaction already closed").
    }, { timeout: 120_000, maxWait: 20_000 });
    result.members++;
  }
  return result;
}

/** Every member with evidence or an AI assessment: used after a scoring-version bump. */
export async function recomputeAll(opts: { now?: Date } = {}): Promise<RecomputeResult> {
  const [fromEvidence, fromAssessments] = await Promise.all([
    prisma.skillEvidence.findMany({ distinct: ["memberId"], select: { memberId: true } }),
    prisma.skillAssessment.findMany({ where: { provenance: "AI_INFERRED" }, distinct: ["memberId"], select: { memberId: true } }),
  ]);
  const ids = [...new Set([...fromEvidence, ...fromAssessments].map((r) => r.memberId))];
  const total: RecomputeResult = { members: 0, upserted: 0, removed: 0 };
  for (let i = 0; i < ids.length; i += 25) {
    const r = await recomputeMembers(ids.slice(i, i + 25), opts);
    total.members += r.members; total.upserted += r.upserted; total.removed += r.removed;
  }
  return total;
}
