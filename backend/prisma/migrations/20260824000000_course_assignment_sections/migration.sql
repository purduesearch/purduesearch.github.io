-- New section kind.
ALTER TYPE "CourseSectionKind" ADD VALUE IF NOT EXISTS 'ASSIGNMENT';

-- Per-kind config column, matching the litConfig / slideConfig idiom.
ALTER TABLE "CourseSection" ADD COLUMN IF NOT EXISTS "assignmentConfig" JSONB;

-- Record of what was uploaded. The file itself is discarded after extraction.
-- The model rename to CourseWorkSubmission is @@map'd, so no table rename here.
ALTER TABLE "CourseLitSubmission" ADD COLUMN IF NOT EXISTS "fileName" TEXT;
ALTER TABLE "CourseLitSubmission" ADD COLUMN IF NOT EXISTS "fileMimeType" TEXT;
