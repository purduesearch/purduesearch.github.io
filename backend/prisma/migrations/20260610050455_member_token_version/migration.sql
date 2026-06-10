-- AlterTable
ALTER TABLE "DailyActivity" ADD COLUMN     "wasFrozen" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0;
