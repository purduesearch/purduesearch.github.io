-- AlterEnum
ALTER TYPE "CourseSectionKind" ADD VALUE 'SLIDES';

-- AlterTable
ALTER TABLE "CourseQuestion" ADD COLUMN     "slideIndex" INTEGER;

-- AlterTable
ALTER TABLE "CourseSection" ADD COLUMN     "slideConfig" JSONB;

-- AlterTable
ALTER TABLE "CourseSectionProgress" ADD COLUMN     "maxSlideIndex" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CourseSlide" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "imageFileId" TEXT NOT NULL,
    "text" TEXT,
    "notes" TEXT,
    "startSec" INTEGER,
    "width" INTEGER,
    "height" INTEGER,

    CONSTRAINT "CourseSlide_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CourseSlide_sectionId_index_idx" ON "CourseSlide"("sectionId", "index");

-- AddForeignKey
ALTER TABLE "CourseSlide" ADD CONSTRAINT "CourseSlide_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "CourseSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
