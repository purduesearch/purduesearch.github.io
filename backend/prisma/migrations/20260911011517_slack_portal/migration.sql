-- CreateEnum
CREATE TYPE "SlackConversationKind" AS ENUM ('CHANNEL', 'PRIVATE_CHANNEL', 'IM', 'MPIM');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'SLACK_DM';
ALTER TYPE "NotificationType" ADD VALUE 'SLACK_MENTION';
ALTER TYPE "NotificationType" ADD VALUE 'SLACK_THREAD_REPLY';
ALTER TYPE "NotificationType" ADD VALUE 'SLACK_BROADCAST';

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "mutedSlackChannelIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "slackUserScopes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "slackChannelId" TEXT,
ADD COLUMN     "slackTs" TEXT;

-- AlterTable
ALTER TABLE "SlackChannelArchive" ADD COLUMN     "kind" "SlackConversationKind" NOT NULL DEFAULT 'CHANNEL';

-- AlterTable
ALTER TABLE "SlackMessage" ADD COLUMN     "botPayload" JSONB,
ADD COLUMN     "isBot" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "SlackConversationMember" (
    "slackChannelId" TEXT NOT NULL,
    "slackUserId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlackConversationMember_pkey" PRIMARY KEY ("slackChannelId","slackUserId")
);

-- CreateTable
CREATE TABLE "SlackReadCursor" (
    "memberId" TEXT NOT NULL,
    "slackChannelId" TEXT NOT NULL,
    "lastReadTs" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlackReadCursor_pkey" PRIMARY KEY ("memberId","slackChannelId")
);

-- CreateIndex
CREATE INDEX "SlackConversationMember_slackUserId_idx" ON "SlackConversationMember"("slackUserId");

-- CreateIndex
CREATE INDEX "Notification_recipientId_slackChannelId_read_idx" ON "Notification"("recipientId", "slackChannelId", "read");

-- AddForeignKey
ALTER TABLE "SlackReadCursor" ADD CONSTRAINT "SlackReadCursor_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing archive rows default to CHANNEL; private ones must not become
-- world-readable under the portal's access rules.
UPDATE "SlackChannelArchive" SET "kind" = 'PRIVATE_CHANNEL' WHERE "isPrivate" = true;
