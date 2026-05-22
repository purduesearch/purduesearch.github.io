-- One-shot migration: wipe Slack-workspace-coupled data after migrating to a new Slack workspace.
-- Safe to run only when DB was provisioned for the OLD workspace and you've cut over to a new one.
--
--   psql "$DATABASE_URL" -f backend/scripts/reset-for-new-workspace.sql

BEGIN;

-- TimeLog.member has no onDelete cascade, so it would block Member truncate.
DELETE FROM "TimeLog";

-- Wipe Members. Cascades:
--   ProjectMember, TaskAssignees (m2m), TaskComment  -> deleted
--   Activity.memberId, ActivityLog.memberId, Milestone.ownerId, ProjectUpdate.authorId  -> SET NULL
TRUNCATE TABLE "Member" CASCADE;

-- Stale channel pointers (IDs belong to the old workspace).
UPDATE "Project"
   SET "slackChannelId"   = NULL,
       "slackChannelName" = NULL,
       "slackChannel"     = NULL;
DELETE FROM "ProjectNotificationTarget";

-- Stale message timestamps (reaction handlers and "mark done" won't resolve old TS).
UPDATE "Task"      SET "slackMsgTs" = NULL WHERE "slackMsgTs" IS NOT NULL;
UPDATE "Milestone" SET "slackMsgTs" = NULL WHERE "slackMsgTs" IS NOT NULL;

-- Active sessions still hold memberId + slackAccessToken from the old workspace.
TRUNCATE TABLE "session";

COMMIT;
