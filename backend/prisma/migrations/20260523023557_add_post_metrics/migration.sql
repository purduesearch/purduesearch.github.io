-- CreateTable
CREATE TABLE "PostMetric" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "impressions" INTEGER,
    "likes" INTEGER,
    "comments" INTEGER,
    "shares" INTEGER,
    "clicks" INTEGER,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" TEXT NOT NULL,

    CONSTRAINT "PostMetric_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PostMetric_submissionId_idx" ON "PostMetric"("submissionId");

-- CreateIndex
CREATE INDEX "PostMetric_platform_idx" ON "PostMetric"("platform");

-- CreateIndex
CREATE INDEX "PostMetric_recordedAt_idx" ON "PostMetric"("recordedAt");

-- AddForeignKey
ALTER TABLE "PostMetric" ADD CONSTRAINT "PostMetric_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "OutreachSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostMetric" ADD CONSTRAINT "PostMetric_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
