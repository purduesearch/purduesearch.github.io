-- AlterTable
ALTER TABLE "BlogThread" ADD COLUMN     "courseSectionId" TEXT;

-- CreateIndex
CREATE INDEX "BlogThread_courseSectionId_status_idx" ON "BlogThread"("courseSectionId", "status");

-- AddForeignKey
ALTER TABLE "BlogThread" ADD CONSTRAINT "BlogThread_courseSectionId_fkey" FOREIGN KEY ("courseSectionId") REFERENCES "CourseSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
