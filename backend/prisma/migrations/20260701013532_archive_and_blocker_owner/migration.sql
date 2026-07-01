-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityEventType" ADD VALUE 'TASK_ARCHIVED';
ALTER TYPE "ActivityEventType" ADD VALUE 'TASK_UNARCHIVED';
ALTER TYPE "ActivityEventType" ADD VALUE 'BLOCKER_ASSIGNED';

-- AlterTable
ALTER TABLE "Blocker" ADD COLUMN     "assigneeId" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "archiveNudgedAt" TIMESTAMP(3),
ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "archivedById" TEXT;

-- CreateIndex
CREATE INDEX "Task_archivedAt_idx" ON "Task"("archivedAt");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Blocker" ADD CONSTRAINT "Blocker_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
