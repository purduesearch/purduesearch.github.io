-- AlterTable: add isBot flag so we can exclude Slack bots from assignee lists
ALTER TABLE "Member" ADD COLUMN "isBot" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: flag the @Slackbot system user immediately. Per-app bots are
-- flagged on next resolveSlackMember() / syncProjectMembersFromChannel().
UPDATE "Member" SET "isBot" = true WHERE "slackId" = 'USLACKBOT';
