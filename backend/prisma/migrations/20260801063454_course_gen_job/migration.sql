-- CreateEnum
CREATE TYPE "CourseGenStatus" AS ENUM ('OUTLINING', 'AWAITING_REVIEW', 'GENERATING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "CourseGenJob" (
    "id" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "status" "CourseGenStatus" NOT NULL DEFAULT 'OUTLINING',
    "prompt" TEXT NOT NULL,
    "reference" TEXT,
    "sourcePostIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "outline" JSONB,
    "courseId" TEXT,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "stepLabel" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseGenJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CourseGenJob_createdById_createdAt_idx" ON "CourseGenJob"("createdById", "createdAt");

-- AddForeignKey
ALTER TABLE "CourseGenJob" ADD CONSTRAINT "CourseGenJob_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
