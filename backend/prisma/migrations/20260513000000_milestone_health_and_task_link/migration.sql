-- CreateEnum
CREATE TYPE "MilestoneStatus" AS ENUM ('ON_TRACK', 'AT_RISK', 'BEHIND', 'COMPLETED', 'CANCELLED');

-- DropIndex
DROP INDEX "Milestone_projectId_idx";

-- RenameColumn (safe rename instead of drop+add to preserve data)
ALTER TABLE "Milestone" RENAME COLUMN "name" TO "title";

-- AlterTable: add new columns
ALTER TABLE "Milestone"
ADD COLUMN "completedAt" TIMESTAMP(3),
ADD COLUMN "description" TEXT,
ADD COLUMN "ownerId" TEXT,
ADD COLUMN "slackMsgTs" TEXT,
ADD COLUMN "status" "MilestoneStatus" NOT NULL DEFAULT 'ON_TRACK';

-- CreateIndex
CREATE INDEX "Milestone_projectId_dueDate_idx" ON "Milestone"("projectId", "dueDate");

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
