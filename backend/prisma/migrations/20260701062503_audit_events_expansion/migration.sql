-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityEventType" ADD VALUE 'TASK_DEPENDENCY_ADDED';
ALTER TYPE "ActivityEventType" ADD VALUE 'TASK_DEPENDENCY_REMOVED';
ALTER TYPE "ActivityEventType" ADD VALUE 'TASK_BLOCKER_ATTACHED';
ALTER TYPE "ActivityEventType" ADD VALUE 'TASK_BLOCKER_DETACHED';
ALTER TYPE "ActivityEventType" ADD VALUE 'BLOCKER_RESOLVED';
ALTER TYPE "ActivityEventType" ADD VALUE 'COMMENT_ADDED';
ALTER TYPE "ActivityEventType" ADD VALUE 'COMMENT_EDITED';
ALTER TYPE "ActivityEventType" ADD VALUE 'COMMENT_DELETED';
ALTER TYPE "ActivityEventType" ADD VALUE 'TIME_LOGGED';
ALTER TYPE "ActivityEventType" ADD VALUE 'MILESTONE_CREATED';
ALTER TYPE "ActivityEventType" ADD VALUE 'MILESTONE_UPDATED';
ALTER TYPE "ActivityEventType" ADD VALUE 'MILESTONE_DELETED';
ALTER TYPE "ActivityEventType" ADD VALUE 'MILESTONE_TASKS_LINKED';
ALTER TYPE "ActivityEventType" ADD VALUE 'AI_PLAN_EXECUTED';
