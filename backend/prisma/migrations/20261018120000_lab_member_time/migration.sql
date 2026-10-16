ALTER TABLE "LabVisit"
  ADD COLUMN "totalMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "otherMinutes" INTEGER NOT NULL DEFAULT 0;

-- Recover confirmed historical attendance from the original instants. Expired,
-- unconfirmed auto-closures must not become confirmed attendance retroactively.
UPDATE "LabVisit"
SET "totalMinutes" = GREATEST(0, FLOOR(EXTRACT(EPOCH FROM ("checkedOutAt" - "checkedInAt")) / 60)::INTEGER)
WHERE "checkedOutAt" IS NOT NULL
  AND ("status" = 'CLOSED' OR ("status" = 'DISCARDED' AND NOT "autoClosed"));
