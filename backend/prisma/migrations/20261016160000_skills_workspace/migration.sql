ALTER TABLE "Skill" ADD COLUMN "lifecycle" TEXT NOT NULL DEFAULT 'ESTABLISHED', ADD COLUMN "canonicalId" TEXT, ADD COLUMN "policyLocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Skill" ADD CONSTRAINT "Skill_canonicalId_fkey" FOREIGN KEY ("canonicalId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Skill_canonicalId_idx" ON "Skill"("canonicalId");
ALTER TABLE "SkillProposal" ADD COLUMN "description" TEXT, ADD COLUMN "supportingQuote" TEXT, ADD COLUMN "exceptionReason" TEXT;
ALTER TABLE "SkillEvidence" ADD COLUMN "context" JSONB, ADD COLUMN "contributionKey" TEXT;
ALTER TABLE "SkillVisibility" ADD COLUMN "showToTeam" BOOLEAN NOT NULL DEFAULT false;
-- Freeze the existing audience selections. New discoveries require explicit sharing.
INSERT INTO "SkillVisibility" ("memberId", "skillId", "isPublic", "showToTeam")
SELECT DISTINCT "memberId", "skillId", true, true FROM "SkillAssessment"
ON CONFLICT ("memberId", "skillId") DO NOTHING;
UPDATE "SkillVisibility" SET "showToTeam" = "isPublic";
ALTER TABLE "SkillVisibility" ALTER COLUMN "isPublic" SET DEFAULT false;
INSERT INTO "SkillProjectVisibility" ("memberId", "projectId", "isPublic") SELECT DISTINCT "memberId", "projectId", true FROM "SkillEvidence" WHERE "projectId" IS NOT NULL ON CONFLICT ("memberId", "projectId") DO NOTHING;
ALTER TABLE "SkillProjectVisibility" ALTER COLUMN "isPublic" SET DEFAULT false;
CREATE TABLE "SkillGoal" ("memberId" TEXT NOT NULL, "skillId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "SkillGoal_pkey" PRIMARY KEY ("memberId", "skillId"));
ALTER TABLE "SkillGoal" ADD CONSTRAINT "SkillGoal_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SkillGoal" ADD CONSTRAINT "SkillGoal_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "SkillOpportunitySave" ("memberId" TEXT NOT NULL, "taskId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "SkillOpportunitySave_pkey" PRIMARY KEY ("memberId", "taskId"));
ALTER TABLE "SkillOpportunitySave" ADD CONSTRAINT "SkillOpportunitySave_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "SkillCatalogChange" ("id" TEXT NOT NULL, "kind" TEXT NOT NULL, "skillId" TEXT NOT NULL, "targetId" TEXT, "actorId" TEXT, "automatic" BOOLEAN NOT NULL DEFAULT false, "reason" TEXT NOT NULL, "policyVersion" TEXT NOT NULL, "payload" JSONB NOT NULL, "reversesId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "SkillCatalogChange_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "SkillCatalogChange_reversesId_key" ON "SkillCatalogChange"("reversesId");
CREATE INDEX "SkillCatalogChange_createdAt_idx" ON "SkillCatalogChange"("createdAt");
CREATE INDEX "SkillCatalogChange_skillId_idx" ON "SkillCatalogChange"("skillId");
CREATE TABLE "SkillAutomationPolicy" ("id" TEXT NOT NULL DEFAULT 'default', "paused" BOOLEAN NOT NULL DEFAULT false, "autoCreate" BOOLEAN NOT NULL DEFAULT true, "autoConsolidate" BOOLEAN NOT NULL DEFAULT true, "maxCreatesPerDay" INTEGER NOT NULL DEFAULT 10, "maxMergesPerDay" INTEGER NOT NULL DEFAULT 3, "maxAffectedMembers" INTEGER NOT NULL DEFAULT 5, "maxRunCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 2, "revision" INTEGER NOT NULL DEFAULT 0, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "SkillAutomationPolicy_pkey" PRIMARY KEY ("id"));
-- Append-only decisions, except DELETE for an explicit retention operation.
CREATE FUNCTION skill_catalog_change_append_only() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'Skill catalog decisions are append-only'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER skill_catalog_change_append_only_trg BEFORE UPDATE ON "SkillCatalogChange" FOR EACH ROW EXECUTE FUNCTION skill_catalog_change_append_only();
