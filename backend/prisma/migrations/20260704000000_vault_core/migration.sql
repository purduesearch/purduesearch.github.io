-- CreateEnum
CREATE TYPE "ChangeRequestStatus" AS ENUM ('OPEN', 'APPROVED', 'REJECTED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'VAULT_CR_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE 'VAULT_CR_DECIDED';
ALTER TYPE "NotificationType" ADD VALUE 'VAULT_CHECKIN';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityEventType" ADD VALUE 'VAULT_ITEM_CREATED';
ALTER TYPE "ActivityEventType" ADD VALUE 'VAULT_ITEM_UPDATED';
ALTER TYPE "ActivityEventType" ADD VALUE 'VAULT_ITEM_DELETED';
ALTER TYPE "ActivityEventType" ADD VALUE 'VAULT_VERSION_CHECKED_IN';
ALTER TYPE "ActivityEventType" ADD VALUE 'VAULT_ITEM_CHECKED_OUT';
ALTER TYPE "ActivityEventType" ADD VALUE 'VAULT_CHECKOUT_RELEASED';
ALTER TYPE "ActivityEventType" ADD VALUE 'VAULT_ITEM_PROMOTED';
ALTER TYPE "ActivityEventType" ADD VALUE 'VAULT_REVISION_RELEASED';
ALTER TYPE "ActivityEventType" ADD VALUE 'CHANGE_REQUEST_CREATED';
ALTER TYPE "ActivityEventType" ADD VALUE 'CHANGE_REQUEST_UPDATED';
ALTER TYPE "ActivityEventType" ADD VALUE 'CHANGE_REQUEST_APPROVED';
ALTER TYPE "ActivityEventType" ADD VALUE 'CHANGE_REQUEST_REJECTED';
ALTER TYPE "ActivityEventType" ADD VALUE 'CHANGE_REQUEST_CANCELLED';
ALTER TYPE "ActivityEventType" ADD VALUE 'VAULT_BOM_LINK_ADDED';
ALTER TYPE "ActivityEventType" ADD VALUE 'VAULT_BOM_LINK_REMOVED';

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "vaultCrCounter" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "vaultFolderId" TEXT,
ADD COLUMN     "vaultPartCounter" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "vaultPartPrefix" TEXT NOT NULL DEFAULT 'PRT';

-- CreateTable
CREATE TABLE "VaultItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "driveFolderId" TEXT NOT NULL,
    "partNumber" TEXT,
    "currentRevision" TEXT,
    "checkedOutById" TEXT,
    "checkedOutAt" TIMESTAMP(3),
    "checkoutNote" TEXT,
    "createdById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VaultItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaultVersion" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "driveFileId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "checksumMd5" TEXT,
    "note" TEXT,
    "uploadedById" TEXT,
    "revision" TEXT,
    "releasedAt" TIMESTAMP(3),
    "releasedByCrId" TEXT,
    "thumbnailFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VaultVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeRequest" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "ChangeRequestStatus" NOT NULL DEFAULT 'OPEN',
    "authorId" TEXT,
    "reviewerId" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "releaseNotes" TEXT,
    "taskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeRequestItem" (
    "id" TEXT NOT NULL,
    "changeRequestId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "targetRevision" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "ChangeRequestItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaultBomEdge" (
    "parentId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VaultBomEdge_pkey" PRIMARY KEY ("parentId","childId")
);

-- CreateIndex
CREATE INDEX "VaultItem_projectId_deletedAt_idx" ON "VaultItem"("projectId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "VaultItem_projectId_partNumber_key" ON "VaultItem"("projectId", "partNumber");

-- CreateIndex
CREATE INDEX "VaultVersion_itemId_idx" ON "VaultVersion"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "VaultVersion_itemId_versionNumber_key" ON "VaultVersion"("itemId", "versionNumber");

-- CreateIndex
CREATE INDEX "ChangeRequest_projectId_status_idx" ON "ChangeRequest"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ChangeRequest_projectId_number_key" ON "ChangeRequest"("projectId", "number");

-- CreateIndex
CREATE INDEX "ChangeRequestItem_itemId_idx" ON "ChangeRequestItem"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "ChangeRequestItem_changeRequestId_itemId_key" ON "ChangeRequestItem"("changeRequestId", "itemId");

-- CreateIndex
CREATE INDEX "VaultBomEdge_childId_idx" ON "VaultBomEdge"("childId");

-- AddForeignKey
ALTER TABLE "VaultItem" ADD CONSTRAINT "VaultItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultItem" ADD CONSTRAINT "VaultItem_checkedOutById_fkey" FOREIGN KEY ("checkedOutById") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultItem" ADD CONSTRAINT "VaultItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultVersion" ADD CONSTRAINT "VaultVersion_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "VaultItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultVersion" ADD CONSTRAINT "VaultVersion_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequestItem" ADD CONSTRAINT "ChangeRequestItem_changeRequestId_fkey" FOREIGN KEY ("changeRequestId") REFERENCES "ChangeRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequestItem" ADD CONSTRAINT "ChangeRequestItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "VaultItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequestItem" ADD CONSTRAINT "ChangeRequestItem_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "VaultVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultBomEdge" ADD CONSTRAINT "VaultBomEdge_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "VaultItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultBomEdge" ADD CONSTRAINT "VaultBomEdge_childId_fkey" FOREIGN KEY ("childId") REFERENCES "VaultItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

