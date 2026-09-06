-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "completedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Task_projectId_completedAt_idx" ON "Task"("projectId", "completedAt");

-- Backfill (1/2): for DONE tasks that have a TASK_COMPLETED audit row, use the
-- createdAt of the most recent such row as the completion timestamp.
UPDATE "Task" SET "completedAt" = sub."createdAt" FROM (
  SELECT DISTINCT ON ("taskId") "taskId", "createdAt"
  FROM "ActivityLog"
  WHERE "eventType" = 'TASK_COMPLETED' AND "taskId" IS NOT NULL
  ORDER BY "taskId", "createdAt" DESC
) sub WHERE "Task".id = sub."taskId" AND "Task".status = 'DONE';

-- Backfill (2/2): DONE tasks with no audit row fall back to updatedAt.
-- Non-DONE tasks are deliberately left NULL.
UPDATE "Task" SET "completedAt" = "updatedAt"
WHERE status = 'DONE' AND "completedAt" IS NULL;
