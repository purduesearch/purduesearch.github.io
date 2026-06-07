-- Member.lastSeenProgress: nullable JSON snapshot of per-project / per-milestone
-- progress percentages the user last observed. The frontend writes this on
-- project unmount and reads it on next mount to animate progress bars from the
-- previous value to the current one (rather than snapping).

BEGIN;

ALTER TABLE "Member" ADD COLUMN "lastSeenProgress" JSONB;

COMMIT;
