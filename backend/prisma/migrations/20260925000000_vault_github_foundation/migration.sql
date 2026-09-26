-- CreateEnum
CREATE TYPE "VaultStorageProvider" AS ENUM ('DRIVE', 'GITHUB');

-- CreateEnum
CREATE TYPE "VaultUploadState" AS ENUM ('UPLOADED', 'LFS_STORED', 'COMMITTED', 'INDEXED', 'RETRY', 'FAILED');

-- AlterTable
ALTER TABLE "VaultItem" ALTER COLUMN "driveFolderId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "VaultVersion" ADD COLUMN     "blobSha" TEXT,
ADD COLUMN     "branch" TEXT,
ADD COLUMN     "commitSha" TEXT,
ADD COLUMN     "filePath" TEXT,
ADD COLUMN     "lfsOid" TEXT,
ADD COLUMN     "lfsSize" INTEGER,
ADD COLUMN     "repositoryId" TEXT,
ADD COLUMN     "sha256" TEXT,
ADD COLUMN     "storageProvider" "VaultStorageProvider" NOT NULL DEFAULT 'DRIVE',
ADD COLUMN     "thumbnailBlobSha" TEXT,
ADD COLUMN     "thumbnailCommitSha" TEXT,
ADD COLUMN     "thumbnailLfsOid" TEXT,
ADD COLUMN     "thumbnailLfsSize" INTEGER,
ADD COLUMN     "thumbnailPath" TEXT,
ADD COLUMN     "thumbnailProvider" "VaultStorageProvider",
ADD COLUMN     "thumbnailSha256" TEXT,
ALTER COLUMN "driveFileId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "VaultRepository" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "projectRepoId" TEXT NOT NULL,
    "repoSlug" TEXT NOT NULL,
    "branch" TEXT NOT NULL DEFAULT 'vault',
    "installId" INTEGER NOT NULL,
    "writeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "setupStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "migrationState" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "healthError" TEXT,
    "lastHeadSha" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "leaseOwner" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VaultRepository_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaultUploadJob" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "state" "VaultUploadState" NOT NULL DEFAULT 'UPLOADED',
    "diskPath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT,
    "note" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "sha256" TEXT NOT NULL,
    "expectedHeadSha" TEXT,
    "commitSha" TEXT,
    "blobSha" TEXT,
    "lfsOid" TEXT,
    "versionId" TEXT,
    "errorCode" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "retryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VaultUploadJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VaultRepository_projectId_key" ON "VaultRepository"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "VaultRepository_projectRepoId_key" ON "VaultRepository"("projectRepoId");

-- CreateIndex
CREATE UNIQUE INDEX "VaultRepository_projectRepoId_branch_key" ON "VaultRepository"("projectRepoId", "branch");

-- CreateIndex
CREATE UNIQUE INDEX "VaultRepository_repoSlug_branch_key" ON "VaultRepository"("repoSlug", "branch");

-- CreateIndex
CREATE UNIQUE INDEX "VaultUploadJob_versionId_key" ON "VaultUploadJob"("versionId");

-- CreateIndex
CREATE INDEX "VaultUploadJob_repositoryId_state_idx" ON "VaultUploadJob"("repositoryId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "VaultUploadJob_projectId_idempotencyKey_key" ON "VaultUploadJob"("projectId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "VaultRepository" ADD CONSTRAINT "VaultRepository_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultRepository" ADD CONSTRAINT "VaultRepository_projectRepoId_fkey" FOREIGN KEY ("projectRepoId") REFERENCES "ProjectRepo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultUploadJob" ADD CONSTRAINT "VaultUploadJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultUploadJob" ADD CONSTRAINT "VaultUploadJob_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "VaultRepository"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultUploadJob" ADD CONSTRAINT "VaultUploadJob_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "VaultItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultUploadJob" ADD CONSTRAINT "VaultUploadJob_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "VaultVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

