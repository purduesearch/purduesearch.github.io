-- AlterEnum
ALTER TYPE "ActivityEventType" ADD VALUE 'AGENT_EXTERNAL_ACTION';

-- AlterTable
ALTER TABLE "AgentPlanDraft" ADD COLUMN     "origin" TEXT NOT NULL DEFAULT 'AGENT',
ADD COLUMN     "recommendationKey" TEXT;

-- CreateTable
CREATE TABLE "AgentRecommendationDismissal" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "until" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentRecommendationDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentRecommendationDismissal_until_idx" ON "AgentRecommendationDismissal"("until");

-- CreateIndex
CREATE UNIQUE INDEX "AgentRecommendationDismissal_memberId_projectId_key_key" ON "AgentRecommendationDismissal"("memberId", "projectId", "key");

-- CreateIndex
CREATE INDEX "AgentPlanDraft_grantId_recommendationKey_idx" ON "AgentPlanDraft"("grantId", "recommendationKey");

-- AddForeignKey
ALTER TABLE "AgentRecommendationDismissal" ADD CONSTRAINT "AgentRecommendationDismissal_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRecommendationDismissal" ADD CONSTRAINT "AgentRecommendationDismissal_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

