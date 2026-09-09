-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "icsFeedCheckedAt" TIMESTAMP(3),
ADD COLUMN     "icsFeedLabel" TEXT,
ADD COLUMN     "icsFeedStatus" TEXT,
ADD COLUMN     "icsFeedUrl" TEXT;

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "externalSource" TEXT,
ADD COLUMN     "externalUid" TEXT;

-- CreateIndex
CREATE INDEX "Event_externalUid_idx" ON "Event"("externalUid");

