-- CreateEnum
CREATE TYPE "SkillType" AS ENUM ('TOOL', 'TECHNIQUE', 'DOMAIN', 'SOFT_SKILL');

-- CreateEnum
CREATE TYPE "SkillStatus" AS ENUM ('ACTIVE', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "SkillEdgeKind" AS ENUM ('PARENT', 'RELATED', 'PREREQUISITE');

-- CreateEnum
CREATE TYPE "SkillProposalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'MERGED');

-- CreateEnum
CREATE TYPE "SkillEvidenceSource" AS ENUM ('GITHUB', 'CAD', 'TASK', 'REVIEW', 'MANUAL');

-- CreateEnum
CREATE TYPE "SkillContribution" AS ENUM ('AUTHORED', 'REVIEWED', 'LED', 'ASSISTED');

-- CreateEnum
CREATE TYPE "SkillOutcome" AS ENUM ('MERGED', 'SHIPPED', 'REWORKED', 'ABANDONED', 'NONE');

-- CreateEnum
CREATE TYPE "SkillProvenance" AS ENUM ('AI_INFERRED', 'SELF_CLAIMED', 'PEER_ENDORSED', 'MANAGER_VERIFIED');

-- CreateEnum
CREATE TYPE "SkillTrend" AS ENUM ('GROWING', 'STABLE', 'FADING');

-- CreateEnum
CREATE TYPE "SkillConfidenceBand" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "SkillDisputeStatus" AS ENUM ('OPEN', 'UPHELD', 'DISMISSED');

-- CreateEnum
CREATE TYPE "SkillRunTrigger" AS ENUM ('CRON', 'MANUAL', 'BACKFILL');

-- CreateEnum
CREATE TYPE "SkillRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED');

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SkillType" NOT NULL,
    "description" TEXT,
    "rubricNotes" TEXT,
    "status" "SkillStatus" NOT NULL DEFAULT 'ACTIVE',
    "source" TEXT NOT NULL DEFAULT 'CLUB',
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillAlias" (
    "id" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "aliasNorm" TEXT NOT NULL,

    CONSTRAINT "SkillAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillEdge" (
    "id" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "kind" "SkillEdgeKind" NOT NULL,

    CONSTRAINT "SkillEdge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillProposal" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameNorm" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "suggestedType" "SkillType",
    "suggestedParents" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rationale" TEXT,
    "evidenceId" TEXT,
    "runId" TEXT,
    "seenCount" INTEGER NOT NULL DEFAULT 1,
    "status" "SkillProposalStatus" NOT NULL DEFAULT 'PENDING',
    "mergedIntoId" TEXT,
    "createdSkillId" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkillProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillSuppression" (
    "nameNorm" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkillSuppression_pkey" PRIMARY KEY ("nameNorm")
);

-- CreateTable
CREATE TABLE "SkillEvidence" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "source" "SkillEvidenceSource" NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "projectId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "skillIds" TEXT[],
    "contribution" "SkillContribution" NOT NULL,
    "complexity" INTEGER NOT NULL,
    "outcome" "SkillOutcome" NOT NULL,
    "summary" TEXT NOT NULL,
    "embedding" DOUBLE PRECISION[] DEFAULT ARRAY[]::DOUBLE PRECISION[],
    "contentHash" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "rubricVersion" TEXT NOT NULL,
    "runId" TEXT,
    "supersededAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkillEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillEvidenceSkill" (
    "evidenceId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,

    CONSTRAINT "SkillEvidenceSkill_pkey" PRIMARY KEY ("evidenceId","skillId")
);

-- CreateTable
CREATE TABLE "SkillAssessment" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "provenance" "SkillProvenance" NOT NULL,
    "level" INTEGER NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "confidenceBand" "SkillConfidenceBand" NOT NULL,
    "firstSeen" TIMESTAMP(3),
    "lastDemonstrated" TIMESTAMP(3),
    "trend" "SkillTrend" NOT NULL DEFAULT 'STABLE',
    "rationale" TEXT,
    "evidenceIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "evidenceCount" INTEGER NOT NULL DEFAULT 0,
    "sourceDiversity" INTEGER NOT NULL DEFAULT 0,
    "assertedById" TEXT NOT NULL DEFAULT '',
    "note" TEXT,
    "modelVersion" TEXT,
    "scoringVersion" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkillAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillDispute" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "evidenceId" TEXT,
    "reason" TEXT NOT NULL,
    "status" "SkillDisputeStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkillDispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillVisibility" (
    "memberId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SkillVisibility_pkey" PRIMARY KEY ("memberId","skillId")
);

-- CreateTable
CREATE TABLE "SkillProjectVisibility" (
    "memberId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SkillProjectVisibility_pkey" PRIMARY KEY ("memberId","projectId")
);

-- CreateTable
CREATE TABLE "MemberPortfolio" (
    "memberId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "headline" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberPortfolio_pkey" PRIMARY KEY ("memberId")
);

-- CreateTable
CREATE TABLE "SkillRun" (
    "id" TEXT NOT NULL,
    "trigger" "SkillRunTrigger" NOT NULL,
    "status" "SkillRunStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "leaseUntil" TIMESTAMP(3),
    "watermarks" JSONB NOT NULL DEFAULT '{}',
    "counts" JSONB NOT NULL DEFAULT '{}',
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "embedTokens" INTEGER NOT NULL DEFAULT 0,
    "estCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "errors" JSONB NOT NULL DEFAULT '[]',
    "scope" JSONB,
    "modelVersion" TEXT,
    "promptVersion" TEXT,
    "startedById" TEXT,

    CONSTRAINT "SkillRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Skill_slug_key" ON "Skill"("slug");

-- CreateIndex
CREATE INDEX "Skill_type_status_idx" ON "Skill"("type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SkillAlias_aliasNorm_key" ON "SkillAlias"("aliasNorm");

-- CreateIndex
CREATE INDEX "SkillAlias_skillId_idx" ON "SkillAlias"("skillId");

-- CreateIndex
CREATE INDEX "SkillEdge_toId_kind_idx" ON "SkillEdge"("toId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "SkillEdge_fromId_toId_kind_key" ON "SkillEdge"("fromId", "toId", "kind");

-- CreateIndex
CREATE INDEX "SkillProposal_status_createdAt_idx" ON "SkillProposal"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SkillProposal_nameNorm_idx" ON "SkillProposal"("nameNorm");

-- CreateIndex
CREATE INDEX "SkillEvidence_memberId_occurredAt_idx" ON "SkillEvidence"("memberId", "occurredAt");

-- CreateIndex
CREATE INDEX "SkillEvidence_source_sourceRef_idx" ON "SkillEvidence"("source", "sourceRef");

-- CreateIndex
CREATE INDEX "SkillEvidence_runId_idx" ON "SkillEvidence"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "SkillEvidence_memberId_source_sourceRef_contentHash_key" ON "SkillEvidence"("memberId", "source", "sourceRef", "contentHash");

-- CreateIndex
CREATE INDEX "SkillEvidenceSkill_skillId_idx" ON "SkillEvidenceSkill"("skillId");

-- CreateIndex
CREATE INDEX "SkillAssessment_skillId_provenance_level_idx" ON "SkillAssessment"("skillId", "provenance", "level");

-- CreateIndex
CREATE INDEX "SkillAssessment_memberId_idx" ON "SkillAssessment"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "SkillAssessment_memberId_skillId_provenance_assertedById_key" ON "SkillAssessment"("memberId", "skillId", "provenance", "assertedById");

-- CreateIndex
CREATE INDEX "SkillDispute_status_createdAt_idx" ON "SkillDispute"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SkillDispute_memberId_skillId_idx" ON "SkillDispute"("memberId", "skillId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberPortfolio_slug_key" ON "MemberPortfolio"("slug");

-- CreateIndex
CREATE INDEX "SkillRun_status_startedAt_idx" ON "SkillRun"("status", "startedAt");

-- AddForeignKey
ALTER TABLE "SkillAlias" ADD CONSTRAINT "SkillAlias_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillEdge" ADD CONSTRAINT "SkillEdge_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillEdge" ADD CONSTRAINT "SkillEdge_toId_fkey" FOREIGN KEY ("toId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillEvidence" ADD CONSTRAINT "SkillEvidence_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillEvidenceSkill" ADD CONSTRAINT "SkillEvidenceSkill_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "SkillEvidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillAssessment" ADD CONSTRAINT "SkillAssessment_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillAssessment" ADD CONSTRAINT "SkillAssessment_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillDispute" ADD CONSTRAINT "SkillDispute_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillVisibility" ADD CONSTRAINT "SkillVisibility_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillProjectVisibility" ADD CONSTRAINT "SkillProjectVisibility_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberPortfolio" ADD CONSTRAINT "MemberPortfolio_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- SkillEvidence is append-only: after insert only supersededAt (re-analysis) and
-- embedding (derived data, backfilled after an embedding outage) may change.
-- DELETE stays allowed so removing a Member cascades.
CREATE OR REPLACE FUNCTION skill_evidence_append_only() RETURNS trigger AS $$
BEGIN
  IF (to_jsonb(NEW) - 'supersededAt' - 'embedding') IS DISTINCT FROM (to_jsonb(OLD) - 'supersededAt' - 'embedding') THEN
    RAISE EXCEPTION 'SkillEvidence is append-only: only supersededAt and embedding may be updated';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER skill_evidence_append_only_trg
  BEFORE UPDATE ON "SkillEvidence"
  FOR EACH ROW EXECUTE FUNCTION skill_evidence_append_only();
