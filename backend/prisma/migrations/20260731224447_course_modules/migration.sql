-- CreateTable
CREATE TABLE "CourseModule" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "estimatedMinutes" INTEGER,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "sequential" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseModule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CourseModule_courseId_order_idx" ON "CourseModule"("courseId", "order");

ALTER TABLE "CourseModule" ADD CONSTRAINT "CourseModule_courseId_fkey"
    FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add the column nullable so the backfill has somewhere to write.
ALTER TABLE "CourseSection" ADD COLUMN "moduleId" TEXT;

-- Backfill: exactly one module per existing course, holding all of its sections
-- at their current order values. A single sequential module over the same
-- ordered list IS the pre-module rule, so gating is unchanged.
-- The id is derived from the course id rather than a cuid: it is deterministic,
-- unique (course ids are), and obvious in a debugging session.
INSERT INTO "CourseModule" ("id", "courseId", "order", "title", "isRequired", "sequential", "createdAt", "updatedAt")
SELECT 'mod_' || "id", "id", 0, 'Course content', true, true, NOW(), NOW()
FROM "Course";

UPDATE "CourseSection" SET "moduleId" = 'mod_' || "courseId";

-- Now it can be constrained.
ALTER TABLE "CourseSection" ALTER COLUMN "moduleId" SET NOT NULL;

ALTER TABLE "CourseSection" ADD CONSTRAINT "CourseSection_moduleId_fkey"
    FOREIGN KEY ("moduleId") REFERENCES "CourseModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "CourseSection_moduleId_order_idx" ON "CourseSection"("moduleId", "order");

DROP INDEX IF EXISTS "CourseSection_courseId_order_idx";
