-- CreateEnum
CREATE TYPE "ChallengeType" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'ACHIEVEMENT');

-- CreateEnum
CREATE TYPE "ChallengeCategory" AS ENUM ('KANBAN', 'COMMENTS', 'TIME', 'FILES', 'PROFILE', 'CONTENT', 'LEADERSHIP', 'ELITE', 'COLLABORATION');

-- CreateEnum
CREATE TYPE "ChallengeMetric" AS ENUM ('TASK_COMPLETED', 'TASK_CREATED_WITH_DETAILS', 'TASK_MOVED_BACKLOG_TO_INPROGRESS', 'TASK_MOVED_INPROGRESS_TO_DONE', 'TASK_LABELED', 'TASK_ASSIGNED_TO_TEAMMATE', 'COMMENT_WRITTEN', 'COMMENT_LONG', 'COMMENT_REACTION', 'STATUS_COMMENT', 'TIME_LOG_ENTRY', 'TIME_LOG_HOURS', 'TIME_LOG_UNIQUE_TASKS', 'TIME_LOG_WEEKDAY', 'FILE_ATTACHED', 'PROFILE_UPDATED', 'BLOG_DRAFTED', 'BLOG_PUBLISHED', 'OUTREACH_DRAFTED', 'OUTREACH_SUBMITTED', 'DAILY_ACTIVE', 'TASKS_NO_OVERDUE', 'UNIQUE_ASSIGNEES', 'UNIQUE_COMMENTERS_TARGETED', 'KANBAN_COLUMN_COMPLETION', 'ALL_MONTHLY_COMPLETE', 'RANK_RARE_ACHIEVEMENTS_ALL');

-- AlterEnum
ALTER TYPE "CosmeticCategory" ADD VALUE 'BORDER';

-- AlterTable
ALTER TABLE "Cosmetic" ADD COLUMN     "themeTokens" JSONB;

-- CreateTable
CREATE TABLE "Challenge" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "type" "ChallengeType" NOT NULL,
    "category" "ChallengeCategory" NOT NULL,
    "tier" "CosmeticRarity",
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "metricKey" "ChallengeMetric" NOT NULL,
    "target" INTEGER NOT NULL,
    "xpReward" INTEGER NOT NULL,
    "doubloonReward" INTEGER NOT NULL,
    "rollTableKey" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "iconClass" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Challenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberChallenge" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "progressMeta" JSONB,
    "completedAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "rolledItems" JSONB,

    CONSTRAINT "MemberChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberAchievement" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rolledItems" JSONB,

    CONSTRAINT "MemberAchievement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardRoll" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "tableKey" TEXT NOT NULL,
    "rolled" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RewardRoll_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Challenge_key_key" ON "Challenge"("key");

-- CreateIndex
CREATE INDEX "Challenge_type_active_idx" ON "Challenge"("type", "active");

-- CreateIndex
CREATE INDEX "MemberChallenge_memberId_periodStart_idx" ON "MemberChallenge"("memberId", "periodStart");

-- CreateIndex
CREATE INDEX "MemberChallenge_memberId_completedAt_idx" ON "MemberChallenge"("memberId", "completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MemberChallenge_memberId_challengeId_periodStart_key" ON "MemberChallenge"("memberId", "challengeId", "periodStart");

-- CreateIndex
CREATE INDEX "MemberAchievement_memberId_idx" ON "MemberAchievement"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberAchievement_memberId_challengeId_key" ON "MemberAchievement"("memberId", "challengeId");

-- CreateIndex
CREATE INDEX "RewardRoll_memberId_createdAt_idx" ON "RewardRoll"("memberId", "createdAt");

-- AddForeignKey
ALTER TABLE "MemberChallenge" ADD CONSTRAINT "MemberChallenge_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberChallenge" ADD CONSTRAINT "MemberChallenge_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberAchievement" ADD CONSTRAINT "MemberAchievement_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberAchievement" ADD CONSTRAINT "MemberAchievement_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardRoll" ADD CONSTRAINT "RewardRoll_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
