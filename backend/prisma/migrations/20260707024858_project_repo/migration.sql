-- AlterTable
ALTER TABLE "GitHubMilestoneMap" ADD COLUMN     "projectRepoId" TEXT;

-- CreateTable
CREATE TABLE "ProjectRepo" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "installId" INTEGER,
    "blockDoneOnCiFail" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectRepo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectRepo_projectId_slug_key" ON "ProjectRepo"("projectId", "slug");

-- AddForeignKey
ALTER TABLE "GitHubMilestoneMap" ADD CONSTRAINT "GitHubMilestoneMap_projectRepoId_fkey" FOREIGN KEY ("projectRepoId") REFERENCES "ProjectRepo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectRepo" ADD CONSTRAINT "ProjectRepo_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
