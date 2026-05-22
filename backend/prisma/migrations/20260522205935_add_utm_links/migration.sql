-- CreateTable
CREATE TABLE "UtmLink" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "submissionId" TEXT,
    "platform" TEXT,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UtmLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UtmLink_code_key" ON "UtmLink"("code");

-- CreateIndex
CREATE INDEX "UtmLink_submissionId_idx" ON "UtmLink"("submissionId");

-- AddForeignKey
ALTER TABLE "UtmLink" ADD CONSTRAINT "UtmLink_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "OutreachSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
