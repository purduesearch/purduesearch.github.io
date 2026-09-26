-- Phase 7: release manifests, assembly packages, drawing requirements.
ALTER TYPE "ActivityEventType" ADD VALUE 'VAULT_DRAWING_REQUIREMENT_CHANGED';
ALTER TYPE "ActivityEventType" ADD VALUE 'VAULT_DRAWING_LINK_CHANGED';
ALTER TYPE "ActivityEventType" ADD VALUE 'VAULT_RELEASE_MANIFEST_CREATED';
ALTER TYPE "ActivityEventType" ADD VALUE 'VAULT_RELEASE_PACKAGE_BUILT';
ALTER TYPE "ActivityEventType" ADD VALUE 'VAULT_RELEASE_PACKAGE_FAILED';
ALTER TYPE "ActivityEventType" ADD VALUE 'VAULT_RELEASE_PACKAGE_DOWNLOADED';
ALTER TYPE "ActivityEventType" ADD VALUE 'VAULT_RELEASE_VERIFIED';

ALTER TABLE "VaultItem" ADD COLUMN "drawingForId" TEXT;
ALTER TABLE "VaultItem" ADD CONSTRAINT "VaultItem_drawingForId_fkey" FOREIGN KEY ("drawingForId") REFERENCES "VaultItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "VaultDrawingRequirement" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "value" TEXT NOT NULL DEFAULT '',
    "severity" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VaultDrawingRequirement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "VaultDrawingRequirement_projectId_idx" ON "VaultDrawingRequirement"("projectId");
ALTER TABLE "VaultDrawingRequirement" ADD CONSTRAINT "VaultDrawingRequirement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "VaultRelease" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "changeRequestId" TEXT NOT NULL,
    "manifestJson" TEXT NOT NULL,
    "manifestSha256" TEXT NOT NULL,
    "readiness" JSONB NOT NULL,
    "createdById" TEXT,
    "packageState" TEXT NOT NULL DEFAULT 'PENDING',
    "packageSha256" TEXT,
    "packageSize" BIGINT,
    "packageError" TEXT,
    "packageAttempts" INTEGER NOT NULL DEFAULT 0,
    "packageBuiltAt" TIMESTAMP(3),
    "leaseUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VaultRelease_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VaultRelease_changeRequestId_key" ON "VaultRelease"("changeRequestId");
CREATE INDEX "VaultRelease_projectId_createdAt_idx" ON "VaultRelease"("projectId", "createdAt");
CREATE INDEX "VaultRelease_packageState_idx" ON "VaultRelease"("packageState");
ALTER TABLE "VaultRelease" ADD CONSTRAINT "VaultRelease_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VaultRelease" ADD CONSTRAINT "VaultRelease_changeRequestId_fkey" FOREIGN KEY ("changeRequestId") REFERENCES "ChangeRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
