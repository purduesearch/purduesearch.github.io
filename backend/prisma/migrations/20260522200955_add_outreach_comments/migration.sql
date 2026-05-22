-- CreateTable
CREATE TABLE "OutreachComment" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "mentions" TEXT[],
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutreachComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OutreachComment_submissionId_idx" ON "OutreachComment"("submissionId");

-- AddForeignKey
ALTER TABLE "OutreachComment" ADD CONSTRAINT "OutreachComment_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "OutreachSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachComment" ADD CONSTRAINT "OutreachComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachComment" ADD CONSTRAINT "OutreachComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "OutreachComment"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
