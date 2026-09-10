-- CreateEnum
CREATE TYPE "SlackBackfillStatus" AS ENUM ('NOT_STARTED', 'RUNNING', 'COMPLETE', 'FAILED');

-- CreateEnum
CREATE TYPE "SlackFileStorage" AS ENUM ('SLACK_ONLY', 'DRIVE', 'LOCAL', 'MIRROR_FAILED', 'UNAVAILABLE');

-- CreateTable
CREATE TABLE "SlackChannelArchive" (
    "id" TEXT NOT NULL,
    "slackChannelId" TEXT NOT NULL,
    "slackChannelName" TEXT,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "archiveEnabled" BOOLEAN NOT NULL DEFAULT true,
    "driveFolderId" TEXT,
    "backfillStatus" "SlackBackfillStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "backfillCursor" TEXT,
    "backfillOldestTs" TEXT,
    "backfillError" TEXT,
    "backfilledAt" TIMESTAMP(3),
    "lastMessageAt" TIMESTAMP(3),
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlackChannelArchive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlackMessage" (
    "id" TEXT NOT NULL,
    "slackChannelId" TEXT NOT NULL,
    "ts" TEXT NOT NULL,
    "threadTs" TEXT,
    "replyCount" INTEGER NOT NULL DEFAULT 0,
    "authorSlackId" TEXT,
    "memberId" TEXT,
    "authorName" TEXT NOT NULL,
    "authorAvatarUrl" TEXT,
    "text" TEXT NOT NULL,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "reactions" JSONB,
    "postedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlackMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlackMessageFile" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "slackFileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "isImage" BOOLEAN NOT NULL DEFAULT false,
    "width" INTEGER,
    "height" INTEGER,
    "storage" "SlackFileStorage" NOT NULL DEFAULT 'SLACK_ONLY',
    "driveFileId" TEXT,
    "localPath" TEXT,
    "mirrorAttempts" INTEGER NOT NULL DEFAULT 0,
    "mirrorError" TEXT,
    "mirroredAt" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlackMessageFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SlackChannelArchive_slackChannelId_key" ON "SlackChannelArchive"("slackChannelId");

-- CreateIndex
CREATE INDEX "SlackMessage_slackChannelId_postedAt_idx" ON "SlackMessage"("slackChannelId", "postedAt");

-- CreateIndex
CREATE INDEX "SlackMessage_threadTs_idx" ON "SlackMessage"("threadTs");

-- CreateIndex
CREATE INDEX "SlackMessage_memberId_idx" ON "SlackMessage"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "SlackMessage_slackChannelId_ts_key" ON "SlackMessage"("slackChannelId", "ts");

-- CreateIndex
CREATE UNIQUE INDEX "SlackMessageFile_slackFileId_key" ON "SlackMessageFile"("slackFileId");

-- CreateIndex
CREATE INDEX "SlackMessageFile_storage_postedAt_idx" ON "SlackMessageFile"("storage", "postedAt");

-- CreateIndex
CREATE INDEX "SlackMessageFile_messageId_idx" ON "SlackMessageFile"("messageId");

-- AddForeignKey
ALTER TABLE "SlackMessageFile" ADD CONSTRAINT "SlackMessageFile_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "SlackMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
