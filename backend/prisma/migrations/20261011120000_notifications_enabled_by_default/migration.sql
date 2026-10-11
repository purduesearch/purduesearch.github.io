-- Notifications are on by default. Existing rows keep their current value.
ALTER TABLE "Member" ALTER COLUMN "notificationsDisabled" SET DEFAULT false;
