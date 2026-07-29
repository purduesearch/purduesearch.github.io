-- CreateEnum
CREATE TYPE "CourseStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CourseSectionKind" AS ENUM ('CONTENT', 'VIDEO', 'QUIZ');

-- CreateEnum
CREATE TYPE "CourseQuestionKind" AS ENUM ('SINGLE', 'MULTI', 'TRUE_FALSE');

-- CreateEnum
CREATE TYPE "CourseProgressStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RewardEventType" ADD VALUE 'COURSE_SECTION_COMPLETE';
ALTER TYPE "RewardEventType" ADD VALUE 'COURSE_COMPLETE';

-- AlterEnum
ALTER TYPE "XpSource" ADD VALUE 'COURSE';

-- AlterEnum
ALTER TYPE "DoubloonSource" ADD VALUE 'COURSE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ChallengeMetric" ADD VALUE 'COURSE_SECTION_COMPLETED';
ALTER TYPE "ChallengeMetric" ADD VALUE 'COURSE_COMPLETED';

-- AlterEnum
ALTER TYPE "ChallengeCategory" ADD VALUE 'LEARNING';

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "coverImageUrl" TEXT,
    "status" "CourseStatus" NOT NULL DEFAULT 'DRAFT',
    "theme" JSONB,
    "estimatedMinutes" INTEGER,
    "xpOverride" INTEGER,
    "doubloonOverride" INTEGER,
    "createdById" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseSection" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "CourseSectionKind" NOT NULL DEFAULT 'CONTENT',
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "contentJson" JSONB NOT NULL,
    "contentYjs" BYTEA,
    "videoConfig" JSONB,
    "passThreshold" INTEGER,
    "maxAttempts" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseQuestion" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "kind" "CourseQuestionKind" NOT NULL DEFAULT 'SINGLE',
    "explanation" TEXT,
    "points" INTEGER NOT NULL DEFAULT 1,
    "videoTimestampSec" INTEGER,
    "rewindToSec" INTEGER,

    CONSTRAINT "CourseQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseAnswer" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CourseAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseEnrollment" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "assignedById" TEXT,
    "dueDate" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "rewardGrantedAt" TIMESTAMP(3),
    "lastSectionId" TEXT,

    CONSTRAINT "CourseEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseSectionProgress" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "status" "CourseProgressStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "maxWatchedSec" INTEGER NOT NULL DEFAULT 0,
    "answeredPopupIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "completedAt" TIMESTAMP(3),
    "rewardGrantedAt" TIMESTAMP(3),

    CONSTRAINT "CourseSectionProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseQuizAttempt" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "scorePct" DOUBLE PRECISION,
    "passed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CourseQuizAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseQuestionResponse" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answerIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CourseQuestionResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Course_slug_key" ON "Course"("slug");

-- CreateIndex
CREATE INDEX "Course_status_idx" ON "Course"("status");

-- CreateIndex
CREATE INDEX "Course_createdById_idx" ON "Course"("createdById");

-- CreateIndex
CREATE INDEX "CourseSection_courseId_order_idx" ON "CourseSection"("courseId", "order");

-- CreateIndex
CREATE INDEX "CourseQuestion_sectionId_order_idx" ON "CourseQuestion"("sectionId", "order");

-- CreateIndex
CREATE INDEX "CourseAnswer_questionId_order_idx" ON "CourseAnswer"("questionId", "order");

-- CreateIndex
CREATE INDEX "CourseEnrollment_memberId_idx" ON "CourseEnrollment"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseEnrollment_courseId_memberId_key" ON "CourseEnrollment"("courseId", "memberId");

-- CreateIndex
CREATE INDEX "CourseSectionProgress_sectionId_idx" ON "CourseSectionProgress"("sectionId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseSectionProgress_enrollmentId_sectionId_key" ON "CourseSectionProgress"("enrollmentId", "sectionId");

-- CreateIndex
CREATE INDEX "CourseQuizAttempt_enrollmentId_sectionId_idx" ON "CourseQuizAttempt"("enrollmentId", "sectionId");

-- CreateIndex
CREATE INDEX "CourseQuestionResponse_attemptId_idx" ON "CourseQuestionResponse"("attemptId");

-- CreateIndex
CREATE INDEX "CourseQuestionResponse_questionId_idx" ON "CourseQuestionResponse"("questionId");

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseSection" ADD CONSTRAINT "CourseSection_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseQuestion" ADD CONSTRAINT "CourseQuestion_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "CourseSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseAnswer" ADD CONSTRAINT "CourseAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "CourseQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseEnrollment" ADD CONSTRAINT "CourseEnrollment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseEnrollment" ADD CONSTRAINT "CourseEnrollment_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseEnrollment" ADD CONSTRAINT "CourseEnrollment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseSectionProgress" ADD CONSTRAINT "CourseSectionProgress_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "CourseEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseSectionProgress" ADD CONSTRAINT "CourseSectionProgress_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "CourseSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseQuizAttempt" ADD CONSTRAINT "CourseQuizAttempt_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "CourseEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseQuizAttempt" ADD CONSTRAINT "CourseQuizAttempt_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "CourseSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseQuestionResponse" ADD CONSTRAINT "CourseQuestionResponse_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "CourseQuizAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseQuestionResponse" ADD CONSTRAINT "CourseQuestionResponse_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "CourseQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
