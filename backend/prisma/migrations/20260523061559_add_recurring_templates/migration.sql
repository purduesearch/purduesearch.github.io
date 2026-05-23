-- AlterTable
ALTER TABLE "OutreachSubmission" ADD COLUMN     "placeholders" JSONB;

-- CreateTable
CREATE TABLE "RecurringTemplate" (
    "id" TEXT NOT NULL,
    "templateSubmissionId" TEXT NOT NULL,
    "cronExpression" TEXT NOT NULL,
    "defaultValues" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecurringTemplate_templateSubmissionId_idx" ON "RecurringTemplate"("templateSubmissionId");

-- CreateIndex
CREATE INDEX "RecurringTemplate_active_nextRunAt_idx" ON "RecurringTemplate"("active", "nextRunAt");

-- AddForeignKey
ALTER TABLE "RecurringTemplate" ADD CONSTRAINT "RecurringTemplate_templateSubmissionId_fkey" FOREIGN KEY ("templateSubmissionId") REFERENCES "OutreachSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringTemplate" ADD CONSTRAINT "RecurringTemplate_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
