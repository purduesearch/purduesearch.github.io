-- CreateEnum
CREATE TYPE "BlogThreadKind" AS ENUM ('COMMENT', 'SUGGESTION');

-- CreateEnum
CREATE TYPE "BlogThreadStatus" AS ENUM ('OPEN', 'RESOLVED', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "BlogThreadOrigin" AS ENUM ('HUMAN', 'AI');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'BLOG_COMMENTED';

-- CreateTable
CREATE TABLE "BlogThread" (
    "id" TEXT NOT NULL,
    "postId" TEXT,
    "pressKitId" TEXT,
    "kind" "BlogThreadKind" NOT NULL,
    "status" "BlogThreadStatus" NOT NULL DEFAULT 'OPEN',
    "origin" "BlogThreadOrigin" NOT NULL DEFAULT 'HUMAN',
    "anchorText" TEXT NOT NULL,
    "replaceWith" TEXT,
    "rationale" TEXT,
    "createdById" TEXT NOT NULL,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlogThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlogThreadComment" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlogThreadComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BlogThread_postId_status_idx" ON "BlogThread"("postId", "status");

-- CreateIndex
CREATE INDEX "BlogThread_pressKitId_status_idx" ON "BlogThread"("pressKitId", "status");

-- CreateIndex
CREATE INDEX "BlogThreadComment_threadId_createdAt_idx" ON "BlogThreadComment"("threadId", "createdAt");

-- AddForeignKey
ALTER TABLE "BlogThread" ADD CONSTRAINT "BlogThread_postId_fkey" FOREIGN KEY ("postId") REFERENCES "BlogPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlogThread" ADD CONSTRAINT "BlogThread_pressKitId_fkey" FOREIGN KEY ("pressKitId") REFERENCES "ProjectPressKit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlogThread" ADD CONSTRAINT "BlogThread_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlogThreadComment" ADD CONSTRAINT "BlogThreadComment_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "BlogThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlogThreadComment" ADD CONSTRAINT "BlogThreadComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

