-- AlterEnum
ALTER TYPE "ActivityEventType" ADD VALUE 'VAULT_BOM_LINK_UPDATED';

-- AlterTable
ALTER TABLE "ActivityLog" ADD COLUMN     "vaultItemId" TEXT;

-- CreateIndex
CREATE INDEX "ActivityLog_vaultItemId_idx" ON "ActivityLog"("vaultItemId");

-- CreateIndex
CREATE UNIQUE INDEX "VaultVersion_itemId_revision_key" ON "VaultVersion"("itemId", "revision");


-- Backfill: existing vault audit rows carry the item id in payload.itemId;
-- copy it into the new indexed column so history queries stay complete.
UPDATE "ActivityLog"
SET "vaultItemId" = "payload"->>'itemId'
WHERE ("eventType"::text LIKE 'VAULT_%' OR "eventType"::text LIKE 'CHANGE_REQUEST_%')
  AND "payload" ? 'itemId';
