-- Keep the master opt-out off for new members and reset existing preferences once.
-- Category channels, quiet hours, and project mutes remain unchanged.
ALTER TABLE "Member" ALTER COLUMN "notificationsDisabled" SET DEFAULT false;

UPDATE "Member"
SET "notificationsDisabled" = false
WHERE "notificationsDisabled" = true;
