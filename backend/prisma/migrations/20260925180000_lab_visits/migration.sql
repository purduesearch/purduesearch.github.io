-- CreateEnum
CREATE TYPE "LabVisitStatus" AS ENUM ('OPEN', 'CLOSED', 'PENDING_CONFIRM', 'DISCARDED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'LAB_CHECKOUT_REMINDER';
ALTER TYPE "NotificationType" ADD VALUE 'LAB_VISIT_PENDING';
ALTER TYPE "NotificationType" ADD VALUE 'LAB_ALONE';

-- AlterTable
ALTER TABLE "TimeLog" ADD COLUMN     "labVisitId" TEXT;

-- CreateTable
CREATE TABLE "LabVisit" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "status" "LabVisitStatus" NOT NULL DEFAULT 'OPEN',
    "source" "ActivitySource" NOT NULL,
    "checkedInAt" TIMESTAMP(3) NOT NULL,
    "checkedOutAt" TIMESTAMP(3),
    "expectedEndAt" TIMESTAMP(3),
    "reminderSentAt" TIMESTAMP(3),
    "autoClosed" BOOLEAN NOT NULL DEFAULT false,
    "unallocatedMinutes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabVisit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LabVisit_memberId_status_idx" ON "LabVisit"("memberId", "status");

-- CreateIndex
CREATE INDEX "LabVisit_workspaceId_checkedInAt_idx" ON "LabVisit"("workspaceId", "checkedInAt");

-- CreateIndex
CREATE INDEX "LabVisit_status_checkedInAt_idx" ON "LabVisit"("status", "checkedInAt");

-- CreateIndex
CREATE INDEX "TimeLog_labVisitId_idx" ON "TimeLog"("labVisitId");

-- AddForeignKey
ALTER TABLE "TimeLog" ADD CONSTRAINT "TimeLog_labVisitId_fkey" FOREIGN KEY ("labVisitId") REFERENCES "LabVisit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabVisit" ADD CONSTRAINT "LabVisit_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabVisit" ADD CONSTRAINT "LabVisit_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

