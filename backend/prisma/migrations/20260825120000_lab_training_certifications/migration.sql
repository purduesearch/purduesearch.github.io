-- Lab training certifications: the shared Training registry and retained,
-- admin-reviewed TrainingCertificate submissions.
--
-- NOTE: `Training` here is a SAFETY-TRAINING CATALOG ENTRY. It is unrelated to
-- the walkthrough sandbox "training project" (POST /api/training-project,
-- tourConfig.requiresTrainingProject, EXCLUDE_TRAINING in scheduler.ts).

-- CreateEnum
CREATE TYPE "TrainingCertStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
-- Values are ADDED, never dropped and recreated: recreating either enum would
-- break every existing row that already uses one of its values.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TRAINING_CERT_REVIEWED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TRAINING_EXPIRING';

-- AlterEnum
ALTER TYPE "CourseSectionKind" ADD VALUE IF NOT EXISTS 'TRAINING';

-- AlterTable
ALTER TABLE "CourseSection" ADD COLUMN     "trainingId" TEXT;

-- CreateTable
CREATE TABLE "Training" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "providerName" TEXT NOT NULL,
    "providerUrl" TEXT,
    "courseUrl" TEXT,
    "registrationUrl" TEXT,
    "description" TEXT,
    "renewalMonths" INTEGER,
    "exampleFileId" TEXT,
    "exampleFileName" TEXT,
    "exampleMimeType" TEXT,
    "createdById" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Training_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingCertificate" (
    "id" TEXT NOT NULL,
    "trainingId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "sectionId" TEXT,
    "driveFileId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileMimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "completedOn" TIMESTAMP(3) NOT NULL,
    "expiresOn" TIMESTAMP(3),
    "status" "TrainingCertStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "lastRemindedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Training_slug_key" ON "Training"("slug");

-- CreateIndex
CREATE INDEX "Training_archivedAt_idx" ON "Training"("archivedAt");

-- CreateIndex
CREATE INDEX "TrainingCertificate_trainingId_memberId_idx" ON "TrainingCertificate"("trainingId", "memberId");

-- CreateIndex
CREATE INDEX "TrainingCertificate_status_idx" ON "TrainingCertificate"("status");

-- CreateIndex
CREATE INDEX "TrainingCertificate_status_expiresOn_idx" ON "TrainingCertificate"("status", "expiresOn");

-- CreateIndex
CREATE INDEX "CourseSection_trainingId_idx" ON "CourseSection"("trainingId");

-- AddForeignKey
ALTER TABLE "CourseSection" ADD CONSTRAINT "CourseSection_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES "Training"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Training" ADD CONSTRAINT "Training_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingCertificate" ADD CONSTRAINT "TrainingCertificate_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES "Training"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingCertificate" ADD CONSTRAINT "TrainingCertificate_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingCertificate" ADD CONSTRAINT "TrainingCertificate_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "CourseSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingCertificate" ADD CONSTRAINT "TrainingCertificate_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
