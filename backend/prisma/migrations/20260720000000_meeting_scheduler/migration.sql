-- CreateEnum
CREATE TYPE "MeetingPollStatus" AS ENUM ('OPEN', 'FINALIZED', 'CANCELED');

-- CreateEnum
CREATE TYPE "MeetingPollAudience" AS ENUM ('INVITED', 'PROJECT', 'ANYONE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'MEETING_POLL_INVITE';
ALTER TYPE "NotificationType" ADD VALUE 'MEETING_POLL_FINALIZED';
ALTER TYPE "NotificationType" ADD VALUE 'MEETING_POLL_REMINDER';

-- AlterEnum
ALTER TYPE "RewardEventType" ADD VALUE 'MEETING_AVAILABILITY_SUBMITTED';

-- AlterEnum
ALTER TYPE "XpSource" ADD VALUE 'MEETING';

-- AlterEnum
ALTER TYPE "DoubloonSource" ADD VALUE 'MEETING';

-- CreateTable
CREATE TABLE "MeetingPoll" (
    "id" TEXT NOT NULL,
    "publicToken" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "slotMinutes" INTEGER NOT NULL DEFAULT 30,
    "slotStarts" TIMESTAMP(3)[],
    "responseDeadline" TIMESTAMP(3),
    "audience" "MeetingPollAudience" NOT NULL DEFAULT 'INVITED',
    "status" "MeetingPollStatus" NOT NULL DEFAULT 'OPEN',
    "organizerId" TEXT,
    "projectId" TEXT,
    "finalStart" TIMESTAMP(3),
    "finalEnd" TIMESTAMP(3),
    "eventId" TEXT,
    "reminderSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingPoll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingResponse" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "memberId" TEXT,
    "guestName" TEXT,
    "slots" TIMESTAMP(3)[],
    "rewarded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_PollPriorityTasks" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_PollPriorityTasks_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_PollInvitees" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_PollInvitees_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "MeetingPoll_publicToken_key" ON "MeetingPoll"("publicToken");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingPoll_eventId_key" ON "MeetingPoll"("eventId");

-- CreateIndex
CREATE INDEX "MeetingPoll_status_idx" ON "MeetingPoll"("status");

-- CreateIndex
CREATE INDEX "MeetingPoll_projectId_idx" ON "MeetingPoll"("projectId");

-- CreateIndex
CREATE INDEX "MeetingResponse_pollId_idx" ON "MeetingResponse"("pollId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingResponse_pollId_memberId_key" ON "MeetingResponse"("pollId", "memberId");

-- CreateIndex
CREATE INDEX "_PollPriorityTasks_B_index" ON "_PollPriorityTasks"("B");

-- CreateIndex
CREATE INDEX "_PollInvitees_B_index" ON "_PollInvitees"("B");

-- AddForeignKey
ALTER TABLE "MeetingPoll" ADD CONSTRAINT "MeetingPoll_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingPoll" ADD CONSTRAINT "MeetingPoll_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingPoll" ADD CONSTRAINT "MeetingPoll_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingResponse" ADD CONSTRAINT "MeetingResponse_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "MeetingPoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingResponse" ADD CONSTRAINT "MeetingResponse_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PollPriorityTasks" ADD CONSTRAINT "_PollPriorityTasks_A_fkey" FOREIGN KEY ("A") REFERENCES "MeetingPoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PollPriorityTasks" ADD CONSTRAINT "_PollPriorityTasks_B_fkey" FOREIGN KEY ("B") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PollInvitees" ADD CONSTRAINT "_PollInvitees_A_fkey" FOREIGN KEY ("A") REFERENCES "MeetingPoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PollInvitees" ADD CONSTRAINT "_PollInvitees_B_fkey" FOREIGN KEY ("B") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

