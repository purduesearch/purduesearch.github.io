-- AlterTable
ALTER TABLE "OutreachSubmission" ADD COLUMN     "safetyCheckedAt" TIMESTAMP(3),
ADD COLUMN     "safetyReport" JSONB;
