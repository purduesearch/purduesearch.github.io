-- Skills upgrade: live run progress + cancel, proposal -> evidence links, profile visibility.

-- AlterTable
ALTER TABLE "SkillRun" ADD COLUMN "progress" JSONB,
ADD COLUMN "cancelRequested" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SkillProposal" ADD COLUMN "evidenceIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "MemberPortfolio" ADD COLUMN "showOnProfile" BOOLEAN NOT NULL DEFAULT true;
