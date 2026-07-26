-- Data cleanup: remove ownership, wishlist, and shop-rotation references to
-- hair/outfit cosmetics before the enum values disappear. Doubloons for these
-- purchases were already refunded via scripts/refund-vrm-cosmetics.ts.
DELETE FROM "MemberCosmetic"
  WHERE "cosmeticId" IN (SELECT "id" FROM "Cosmetic" WHERE "category" IN ('AVATAR_FEATURE', 'CLOTHING'));
DELETE FROM "CosmeticWishlist"
  WHERE "cosmeticId" IN (SELECT "id" FROM "Cosmetic" WHERE "category" IN ('AVATAR_FEATURE', 'CLOTHING'));
DELETE FROM "Cosmetic" WHERE "category" IN ('AVATAR_FEATURE', 'CLOTHING');

-- Today's shop rotations may reference deleted cosmetic ids in their JSON slots.
-- They expire within 24h; clearing them forces a clean re-roll on next request.
DELETE FROM "ShopRotation";

-- DropForeignKey
ALTER TABLE "AvatarConfig" DROP CONSTRAINT "AvatarConfig_memberId_fkey";

-- DropTable
DROP TABLE "AvatarConfig";

-- AlterEnum
BEGIN;
CREATE TYPE "CosmeticCategory_new" AS ENUM ('NAME_FRAME', 'DASHBOARD_THEME', 'BADGE', 'ANIMATION', 'BORDER');
ALTER TABLE "Cosmetic" ALTER COLUMN "category" TYPE "CosmeticCategory_new" USING ("category"::text::"CosmeticCategory_new");
ALTER TYPE "CosmeticCategory" RENAME TO "CosmeticCategory_old";
ALTER TYPE "CosmeticCategory_new" RENAME TO "CosmeticCategory";
DROP TYPE "CosmeticCategory_old";
COMMIT;
