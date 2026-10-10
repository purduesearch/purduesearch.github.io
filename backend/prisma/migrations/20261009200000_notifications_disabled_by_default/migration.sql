-- Testing rollout: existing and new members start with notifications disabled.
ALTER TABLE "Member" ADD COLUMN "notificationsDisabled" BOOLEAN NOT NULL DEFAULT true;
