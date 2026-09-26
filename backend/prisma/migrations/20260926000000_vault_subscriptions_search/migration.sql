-- Phase 8: per-item Vault subscriptions, a durable notification outbox with
-- per-recipient delivery dedupe, the Vault search index and saved views.
-- The search index is populated by 'npm run vault:search-rebuild' after deploy.
-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'VAULT_CHECKOUT_CONFLICT';

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "vaultAutoWatch" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "VaultSubscription" (
    "memberId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "checkins" BOOLEAN NOT NULL DEFAULT true,
    "decisions" BOOLEAN NOT NULL DEFAULT true,
    "conflicts" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VaultSubscription_pkey" PRIMARY KEY ("memberId","itemId")
);

-- CreateTable
CREATE TABLE "VaultNotificationEvent" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "itemIds" TEXT[],
    "actorId" TEXT,
    "directRecipientIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "payload" JSONB NOT NULL,
    "fannedOutAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VaultNotificationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaultNotificationDelivery" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "notificationId" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VaultNotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaultSearchDoc" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "itemId" TEXT,
    "versionId" TEXT,
    "crId" TEXT,
    "commitSha" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "partNumber" TEXT,
    "fileName" TEXT,
    "fileExt" TEXT,
    "authorId" TEXT,
    "authorName" TEXT,
    "released" BOOLEAN NOT NULL DEFAULT false,
    "checkedOut" BOOLEAN NOT NULL DEFAULT false,
    "crStatus" TEXT,
    "url" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "searchVector" tsvector,
    "indexedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VaultSearchDoc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaultSavedView" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "query" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VaultSavedView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VaultSubscription_itemId_idx" ON "VaultSubscription"("itemId");

-- CreateIndex
CREATE INDEX "VaultSubscription_memberId_projectId_idx" ON "VaultSubscription"("memberId", "projectId");

-- CreateIndex
CREATE INDEX "VaultNotificationEvent_fannedOutAt_createdAt_idx" ON "VaultNotificationEvent"("fannedOutAt", "createdAt");

-- CreateIndex
CREATE INDEX "VaultNotificationDelivery_state_nextAttemptAt_idx" ON "VaultNotificationDelivery"("state", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "VaultNotificationDelivery_eventId_recipientId_channel_key" ON "VaultNotificationDelivery"("eventId", "recipientId", "channel");

-- CreateIndex
CREATE INDEX "VaultSearchDoc_projectId_kind_occurredAt_idx" ON "VaultSearchDoc"("projectId", "kind", "occurredAt");

-- CreateIndex
CREATE INDEX "VaultSearchDoc_itemId_idx" ON "VaultSearchDoc"("itemId");

-- CreateIndex
CREATE INDEX "VaultSearchDoc_searchVector_idx" ON "VaultSearchDoc" USING GIN ("searchVector");

-- CreateIndex
CREATE INDEX "VaultSavedView_memberId_projectId_idx" ON "VaultSavedView"("memberId", "projectId");

-- AddForeignKey
ALTER TABLE "VaultSubscription" ADD CONSTRAINT "VaultSubscription_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultSubscription" ADD CONSTRAINT "VaultSubscription_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "VaultItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultNotificationEvent" ADD CONSTRAINT "VaultNotificationEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultNotificationDelivery" ADD CONSTRAINT "VaultNotificationDelivery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "VaultNotificationEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultNotificationDelivery" ADD CONSTRAINT "VaultNotificationDelivery_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultSearchDoc" ADD CONSTRAINT "VaultSearchDoc_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultSavedView" ADD CONSTRAINT "VaultSavedView_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultSavedView" ADD CONSTRAINT "VaultSavedView_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

