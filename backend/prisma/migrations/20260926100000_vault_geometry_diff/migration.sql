-- Phase 9: cached, leased geometry diffs between two pinned Vault versions.
CREATE TABLE "VaultGeometryDiff" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "algorithmVersion" TEXT NOT NULL,
    "beforeVersionId" TEXT NOT NULL,
    "afterVersionId" TEXT NOT NULL,
    "beforeSha256" TEXT NOT NULL,
    "afterSha256" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "outcomeStatus" TEXT,
    "resultJson" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseUntil" TIMESTAMP(3),
    "requestedById" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VaultGeometryDiff_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VaultGeometryDiff_projectId_cacheKey_key" ON "VaultGeometryDiff"("projectId", "cacheKey");
CREATE INDEX "VaultGeometryDiff_state_idx" ON "VaultGeometryDiff"("state");
ALTER TABLE "VaultGeometryDiff" ADD CONSTRAINT "VaultGeometryDiff_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
