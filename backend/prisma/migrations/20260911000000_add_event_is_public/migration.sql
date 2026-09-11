-- AlterTable
-- No backfill: every existing event stays private (decided 2026-09-11).
ALTER TABLE "Event" ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Event_isPublic_startTime_idx" ON "Event"("isPublic", "startTime");
