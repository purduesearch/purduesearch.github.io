-- Reverses 20260902000000_add_member_ai_credentials.
--
-- The bring-your-own API-key provider feature is replaced by a clipboard
-- planning lane that stores no credentials. Dropping this table destroys every
-- stored (AES-GCM encrypted) member API key. That is intended, not collateral:
-- they are third-party secrets the club no longer has any reason to hold.
--
-- Order matters. The table must go before the enums it uses.

-- DropTable (cascades its foreign key and both indexes)
DROP TABLE IF EXISTS "MemberAiCredential";

-- AlterTable
ALTER TABLE "Member" DROP COLUMN IF EXISTS "aiModelPrefs";

-- DropEnum
DROP TYPE IF EXISTS "AiCredentialStatus";
DROP TYPE IF EXISTS "AiProvider";
