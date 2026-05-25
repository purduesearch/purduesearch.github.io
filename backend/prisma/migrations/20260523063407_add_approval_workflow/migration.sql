-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "requiredApprovers" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "ApprovalRecord" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "comment" TEXT,

    CONSTRAINT "ApprovalRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApprovalRecord_submissionId_idx" ON "ApprovalRecord"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalRecord_submissionId_approverId_key" ON "ApprovalRecord"("submissionId", "approverId");

-- AddForeignKey
ALTER TABLE "ApprovalRecord" ADD CONSTRAINT "ApprovalRecord_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "OutreachSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRecord" ADD CONSTRAINT "ApprovalRecord_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
