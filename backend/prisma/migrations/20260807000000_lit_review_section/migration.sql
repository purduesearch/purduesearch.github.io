-- AlterEnum
ALTER TYPE "CourseSectionKind" ADD VALUE 'LIT_REVIEW';

-- AlterTable
ALTER TABLE "CourseSection" ADD COLUMN     "litConfig" JSONB;

-- CreateTable
CREATE TABLE "CourseLitSubmission" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "wordCount" INTEGER NOT NULL,
    "feedbackJson" JSONB,
    "gradedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseLitSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CourseLitSubmission_sectionId_memberId_idx" ON "CourseLitSubmission"("sectionId", "memberId");

-- AddForeignKey
ALTER TABLE "CourseLitSubmission" ADD CONSTRAINT "CourseLitSubmission_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "CourseSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseLitSubmission" ADD CONSTRAINT "CourseLitSubmission_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
