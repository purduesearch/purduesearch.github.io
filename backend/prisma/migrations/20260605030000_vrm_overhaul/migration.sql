-- Phase 4 of the VRM overhaul.
--
-- This migration is DESTRUCTIVE.
--   - Every owned cosmetic is refunded to the member's doubloon balance.
--   - The Cosmetic catalogue + every dependent table (MemberCosmetic,
--     CosmeticWishlist, ShopRotation) is truncated.
--   - Every AvatarConfig.equippedCosmetics is reset to {} because the old
--     cosmeticIds no longer exist.
--   - AvatarConfig.featureJson is left in place; the runtime
--     (migrateFeatureJson) coerces the legacy shape on first load.
--
-- Run AFTER 20260605020000_avatar_portrait_url. Run BEFORE
-- backend/prisma/seedVrmCosmetics.ts (the seed re-populates Cosmetic).
--
-- FK audit (2026-06-05): MemberCosmetic + CosmeticWishlist have hard FKs to
-- Cosmetic. ShopRotation references cosmeticIds via JSON only. DoubloonEvent
-- has a nullable String column `cosmeticId` with no @relation — old rows are
-- left untouched and become archival pointers with no DB constraint.
-- PendingReward does NOT reference Cosmetic in this schema.

BEGIN;

-- 1. Refund owned cosmetics to each member's doubloon balance.
UPDATE "Member" m
SET    "doubloons" = m."doubloons" + COALESCE((
         SELECT SUM(c."doubloonPrice")
         FROM   "MemberCosmetic" mc
         JOIN   "Cosmetic" c ON c."id" = mc."cosmeticId"
         WHERE  mc."memberId" = m."id"
         AND    c."doubloonPrice" IS NOT NULL
       ), 0);

-- 2. Wipe cosmetic catalog + dependents (FK dependency order).
TRUNCATE TABLE "CosmeticWishlist" CASCADE;
TRUNCATE TABLE "MemberCosmetic"   CASCADE;
TRUNCATE TABLE "ShopRotation"     CASCADE;
TRUNCATE TABLE "Cosmetic"         CASCADE;

-- 3. Clear equippedCosmetics on every AvatarConfig (stale ids).
UPDATE "AvatarConfig" SET "equippedCosmetics" = '{}'::jsonb;

COMMIT;
