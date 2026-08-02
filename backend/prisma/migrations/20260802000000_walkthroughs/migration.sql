-- Additive only. No backfill, no existing row changes meaning.
ALTER TYPE "CourseSectionKind" ADD VALUE 'WALKTHROUGH';

ALTER TABLE "CourseSection" ADD COLUMN "tourConfig" JSONB;

ALTER TABLE "CourseSectionProgress" ADD COLUMN "maxStepIndex" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Project" ADD COLUMN "trainingForMemberId" TEXT;
CREATE UNIQUE INDEX "Project_trainingForMemberId_key" ON "Project"("trainingForMemberId");
