-- AlterTable
ALTER TABLE "Event" ADD COLUMN "seriesId" TEXT;

-- CreateIndex
CREATE INDEX "Event_seriesId_idx" ON "Event"("seriesId");

-- Backfill existing series. Before this column, a recurring event and its
-- copies were written in one request with nothing linking them, so group them
-- the only way the data allows: same title and pattern, created within a few
-- seconds of each other. The series id is the earliest row's id. A copy whose
-- title was edited since stays on its own, which is harmless (a series of one).
UPDATE "Event" e
SET "seriesId" = (
  SELECT o.id FROM "Event" o
  WHERE o."isRecurring" = true
    AND o.title = e.title
    AND o."recurrencePattern" = e."recurrencePattern"
    AND o."createdAt" BETWEEN e."createdAt" - INTERVAL '10 seconds' AND e."createdAt"
  ORDER BY o."createdAt" ASC, o."startTime" ASC
  LIMIT 1
)
WHERE e."isRecurring" = true AND e."recurrencePattern" IS NOT NULL;
