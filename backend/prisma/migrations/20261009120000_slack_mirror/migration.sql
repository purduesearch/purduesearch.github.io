-- CreateEnum
CREATE TYPE "SlackEntityType" AS ENUM ('TASK', 'VAULT_ITEM', 'CHANGE_REQUEST', 'GITHUB', 'DRIVE_FILE', 'MILESTONE', 'EVENT', 'MEETING_POLL');

-- CreateEnum
CREATE TYPE "SlackCardKind" AS ENUM ('TASK_BUNDLE', 'LINK_CARD', 'VAULT_NOTICE', 'POLL_INVITE', 'CHECKIN');

-- CreateTable
CREATE TABLE "SlackCardQueue" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "entityType" "SlackEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "actorId" TEXT,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "messageId" TEXT,

    CONSTRAINT "SlackCardQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlackCardMessage" (
    "id" TEXT NOT NULL,
    "kind" "SlackCardKind" NOT NULL,
    "slackChannelId" TEXT NOT NULL,
    "ts" TEXT NOT NULL,
    "threadTs" TEXT,
    "recipientId" TEXT,
    "sourceTs" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "renderedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlackCardMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlackCardRef" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "entityType" "SlackEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "SlackCardRef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlackItemLink" (
    "id" TEXT NOT NULL,
    "slackChannelId" TEXT NOT NULL,
    "messageTs" TEXT NOT NULL,
    "threadTs" TEXT,
    "entityType" "SlackEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT,
    "projectId" TEXT,
    "linkedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlackItemLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlackPlanSession" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "actionsJson" TEXT NOT NULL,
    "decisions" JSONB NOT NULL DEFAULT '{}',
    "resultsJson" JSONB,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "viewId" TEXT,
    "sourceChannelId" TEXT,
    "sourceTs" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlackPlanSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SlackCardQueue_sentAt_recipientId_idx" ON "SlackCardQueue"("sentAt", "recipientId");

-- CreateIndex
CREATE INDEX "SlackCardQueue_entityType_entityId_idx" ON "SlackCardQueue"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "SlackCardMessage_slackChannelId_sourceTs_idx" ON "SlackCardMessage"("slackChannelId", "sourceTs");

-- CreateIndex
CREATE UNIQUE INDEX "SlackCardMessage_slackChannelId_ts_key" ON "SlackCardMessage"("slackChannelId", "ts");

-- CreateIndex
CREATE INDEX "SlackCardRef_entityType_entityId_idx" ON "SlackCardRef"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "SlackCardRef_messageId_entityType_entityId_key" ON "SlackCardRef"("messageId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "SlackItemLink_entityType_entityId_idx" ON "SlackItemLink"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "SlackItemLink_slackChannelId_messageTs_entityType_entityId_key" ON "SlackItemLink"("slackChannelId", "messageTs", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "SlackPlanSession_memberId_status_idx" ON "SlackPlanSession"("memberId", "status");

-- AddForeignKey
ALTER TABLE "SlackCardQueue" ADD CONSTRAINT "SlackCardQueue_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlackCardQueue" ADD CONSTRAINT "SlackCardQueue_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "SlackCardMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlackCardRef" ADD CONSTRAINT "SlackCardRef_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "SlackCardMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlackItemLink" ADD CONSTRAINT "SlackItemLink_linkedById_fkey" FOREIGN KEY ("linkedById") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlackPlanSession" ADD CONSTRAINT "SlackPlanSession_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

