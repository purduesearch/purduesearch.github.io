-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('MEETING', 'DEADLINE', 'WORKSHOP', 'SOCIAL', 'OTHER');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SubmissionType" AS ENUM ('SOCIAL_POST', 'NEWSLETTER', 'PHOTO', 'VIDEO', 'ANNOUNCEMENT', 'EVENT_PROMO');

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "bio" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "team" TEXT,
ADD COLUMN     "timezone" TEXT,
ADD COLUMN     "title" TEXT;

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "EventType" NOT NULL DEFAULT 'MEETING',
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "location" TEXT,
    "isVirtual" BOOLEAN NOT NULL DEFAULT false,
    "projectId" TEXT,
    "organizerId" TEXT,
    "notes" TEXT,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "recurrencePattern" TEXT,
    "recurrenceEndDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachSubmission" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "SubmissionType" NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "content" TEXT,
    "mediaUrls" TEXT[],
    "platform" TEXT[],
    "projectId" TEXT,
    "eventId" TEXT,
    "authorId" TEXT NOT NULL,
    "reviewerId" TEXT,
    "reviewNote" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_EventPriorityTasks" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_EventPriorityTasks_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_EventAttendees" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_EventAttendees_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "Event_startTime_idx" ON "Event"("startTime");

-- CreateIndex
CREATE INDEX "Event_projectId_idx" ON "Event"("projectId");

-- CreateIndex
CREATE INDEX "Event_organizerId_idx" ON "Event"("organizerId");

-- CreateIndex
CREATE INDEX "OutreachSubmission_status_idx" ON "OutreachSubmission"("status");

-- CreateIndex
CREATE INDEX "OutreachSubmission_authorId_idx" ON "OutreachSubmission"("authorId");

-- CreateIndex
CREATE INDEX "OutreachSubmission_projectId_idx" ON "OutreachSubmission"("projectId");

-- CreateIndex
CREATE INDEX "_EventPriorityTasks_B_index" ON "_EventPriorityTasks"("B");

-- CreateIndex
CREATE INDEX "_EventAttendees_B_index" ON "_EventAttendees"("B");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachSubmission" ADD CONSTRAINT "OutreachSubmission_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachSubmission" ADD CONSTRAINT "OutreachSubmission_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachSubmission" ADD CONSTRAINT "OutreachSubmission_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachSubmission" ADD CONSTRAINT "OutreachSubmission_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EventPriorityTasks" ADD CONSTRAINT "_EventPriorityTasks_A_fkey" FOREIGN KEY ("A") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EventPriorityTasks" ADD CONSTRAINT "_EventPriorityTasks_B_fkey" FOREIGN KEY ("B") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EventAttendees" ADD CONSTRAINT "_EventAttendees_A_fkey" FOREIGN KEY ("A") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EventAttendees" ADD CONSTRAINT "_EventAttendees_B_fkey" FOREIGN KEY ("B") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
