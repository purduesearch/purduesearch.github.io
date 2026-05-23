-- AlterTable
ALTER TABLE "OutreachSubmission" ADD COLUMN "blogMarkdown" TEXT,
ADD COLUMN "blogSlug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "OutreachSubmission_blogSlug_key" ON "OutreachSubmission"("blogSlug");
