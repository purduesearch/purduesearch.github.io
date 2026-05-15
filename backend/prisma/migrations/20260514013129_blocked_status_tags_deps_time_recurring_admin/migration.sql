/*
  Warnings:

  - You are about to drop the column `tags` on the `Project` table. All the data in the column will be lost.
  - You are about to drop the column `tags` on the `Task` table. All the data in the column will be lost.
  - You are about to drop the `_TaskDependencies` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "_TaskDependencies" DROP CONSTRAINT "_TaskDependencies_A_fkey";

-- DropForeignKey
ALTER TABLE "_TaskDependencies" DROP CONSTRAINT "_TaskDependencies_B_fkey";

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "isAdmin" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Project" DROP COLUMN "tags";

-- AlterTable
ALTER TABLE "ProjectUpdate" ALTER COLUMN "authorId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Task" DROP COLUMN "tags",
ADD COLUMN     "estimatedHours" DOUBLE PRECISION,
ADD COLUMN     "isRecurring" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "recurrenceEndDate" TIMESTAMP(3),
ADD COLUMN     "recurrencePattern" TEXT,
ADD COLUMN     "recurringParentId" TEXT,
ADD COLUMN     "storyPoints" INTEGER;

-- DropTable
DROP TABLE "_TaskDependencies";

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6c5ce7',
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskDependency" (
    "blockingTaskId" TEXT NOT NULL,
    "blockedTaskId" TEXT NOT NULL,

    CONSTRAINT "TaskDependency_pkey" PRIMARY KEY ("blockingTaskId","blockedTaskId")
);

-- CreateTable
CREATE TABLE "TimeLog" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "note" TEXT,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_TaskTags" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_TaskTags_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "Tag_projectId_idx" ON "Tag"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_projectId_key" ON "Tag"("name", "projectId");

-- CreateIndex
CREATE INDEX "TimeLog_taskId_idx" ON "TimeLog"("taskId");

-- CreateIndex
CREATE INDEX "TimeLog_memberId_idx" ON "TimeLog"("memberId");

-- CreateIndex
CREATE INDEX "_TaskTags_B_index" ON "_TaskTags"("B");

-- AddForeignKey
ALTER TABLE "ProjectUpdate" ADD CONSTRAINT "ProjectUpdate_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_blockingTaskId_fkey" FOREIGN KEY ("blockingTaskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_blockedTaskId_fkey" FOREIGN KEY ("blockedTaskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeLog" ADD CONSTRAINT "TimeLog_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeLog" ADD CONSTRAINT "TimeLog_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TaskTags" ADD CONSTRAINT "_TaskTags_A_fkey" FOREIGN KEY ("A") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TaskTags" ADD CONSTRAINT "_TaskTags_B_fkey" FOREIGN KEY ("B") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
