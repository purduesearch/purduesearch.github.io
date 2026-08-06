-- CreateEnum
CREATE TYPE "DocAccessLevel" AS ENUM ('VIEW', 'COMMENT', 'EDIT', 'OWNER');

-- CreateTable
CREATE TABLE "DocAccessGrant" (
    "id" TEXT NOT NULL,
    "postId" TEXT,
    "pressKitId" TEXT,
    "courseSectionId" TEXT,
    "memberId" TEXT NOT NULL,
    "level" "DocAccessLevel" NOT NULL,
    "grantedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocAccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocShareSettings" (
    "id" TEXT NOT NULL,
    "postId" TEXT,
    "pressKitId" TEXT,
    "courseSectionId" TEXT,
    "clubLevel" "DocAccessLevel" NOT NULL,
    "setById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocShareSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocAccessGrant_memberId_idx" ON "DocAccessGrant"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "DocAccessGrant_postId_memberId_key" ON "DocAccessGrant"("postId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "DocAccessGrant_pressKitId_memberId_key" ON "DocAccessGrant"("pressKitId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "DocAccessGrant_courseSectionId_memberId_key" ON "DocAccessGrant"("courseSectionId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "DocShareSettings_postId_key" ON "DocShareSettings"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "DocShareSettings_pressKitId_key" ON "DocShareSettings"("pressKitId");

-- CreateIndex
CREATE UNIQUE INDEX "DocShareSettings_courseSectionId_key" ON "DocShareSettings"("courseSectionId");

-- AddForeignKey
ALTER TABLE "DocAccessGrant" ADD CONSTRAINT "DocAccessGrant_postId_fkey" FOREIGN KEY ("postId") REFERENCES "BlogPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocAccessGrant" ADD CONSTRAINT "DocAccessGrant_pressKitId_fkey" FOREIGN KEY ("pressKitId") REFERENCES "ProjectPressKit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocAccessGrant" ADD CONSTRAINT "DocAccessGrant_courseSectionId_fkey" FOREIGN KEY ("courseSectionId") REFERENCES "CourseSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocAccessGrant" ADD CONSTRAINT "DocAccessGrant_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocAccessGrant" ADD CONSTRAINT "DocAccessGrant_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocShareSettings" ADD CONSTRAINT "DocShareSettings_postId_fkey" FOREIGN KEY ("postId") REFERENCES "BlogPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocShareSettings" ADD CONSTRAINT "DocShareSettings_pressKitId_fkey" FOREIGN KEY ("pressKitId") REFERENCES "ProjectPressKit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocShareSettings" ADD CONSTRAINT "DocShareSettings_courseSectionId_fkey" FOREIGN KEY ("courseSectionId") REFERENCES "CourseSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocShareSettings" ADD CONSTRAINT "DocShareSettings_setById_fkey" FOREIGN KEY ("setById") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-appended: Prisma cannot express "exactly one FK set" in schema.prisma,
-- so the polymorphic target is constrained here instead.
ALTER TABLE "DocAccessGrant" ADD CONSTRAINT "DocAccessGrant_one_target"
  CHECK (num_nonnulls("postId", "pressKitId", "courseSectionId") = 1);
ALTER TABLE "DocShareSettings" ADD CONSTRAINT "DocShareSettings_one_target"
  CHECK (num_nonnulls("postId", "pressKitId", "courseSectionId") = 1);

-- Backfill: post creators become OWNER.
INSERT INTO "DocAccessGrant" ("id", "postId", "memberId", "level", "grantedById", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, p."id", p."createdById", 'OWNER', p."createdById", NOW(), NOW()
FROM "BlogPost" p
ON CONFLICT DO NOTHING;

-- Backfill: existing BlogAuthor rows become EDIT (creator row above wins on conflict).
INSERT INTO "DocAccessGrant" ("id", "postId", "memberId", "level", "grantedById", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, a."postId", a."memberId", 'EDIT', p."createdById", NOW(), NOW()
FROM "BlogAuthor" a
JOIN "BlogPost" p ON p."id" = a."postId"
ON CONFLICT DO NOTHING;
