-- CreateTable
CREATE TABLE "CourseSectionRevision" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "contentJson" JSONB NOT NULL,
    "title" TEXT NOT NULL,
    "name" TEXT,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseSectionRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CourseSectionRevision_sectionId_createdAt_idx" ON "CourseSectionRevision"("sectionId", "createdAt");

-- AddForeignKey
ALTER TABLE "CourseSectionRevision" ADD CONSTRAINT "CourseSectionRevision_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "CourseSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseSectionRevision" ADD CONSTRAINT "CourseSectionRevision_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
