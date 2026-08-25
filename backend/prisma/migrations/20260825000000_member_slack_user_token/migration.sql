-- Persist the Slack user OAuth token per member (AES-GCM encrypted at rest).
-- Previously it lived only in the express-session, which Bearer-authenticated
-- clients cannot read and which expires after 7 days.
ALTER TABLE "Member" ADD COLUMN     "slackUserToken" TEXT,
                     ADD COLUMN     "slackUserTokenAt" TIMESTAMP(3);
