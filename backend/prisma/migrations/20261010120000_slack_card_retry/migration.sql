-- Bounded retries for the Slack card outbox: failed bundles back off, then stop.
ALTER TABLE "SlackCardQueue" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SlackCardQueue" ADD COLUMN "nextAttemptAt" TIMESTAMP(3);
ALTER TABLE "SlackCardQueue" ADD COLUMN "failedAt" TIMESTAMP(3);
ALTER TABLE "SlackCardQueue" ADD COLUMN "lastError" TEXT;
