-- CreateEnum
CREATE TYPE "AiProvider" AS ENUM ('GEMINI', 'ANTHROPIC', 'OPENAI');

-- CreateEnum
CREATE TYPE "AiCredentialStatus" AS ENUM ('ACTIVE', 'INVALID');

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "aiModelPrefs" JSONB;

-- CreateTable
CREATE TABLE "MemberAiCredential" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "provider" "AiProvider" NOT NULL,
    "apiKey" TEXT NOT NULL,
    "keyHint" TEXT NOT NULL,
    "status" "AiCredentialStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastError" TEXT,
    "lastVerifiedAt" TIMESTAMP(3),
    "lastNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberAiCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MemberAiCredential_memberId_idx" ON "MemberAiCredential"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberAiCredential_memberId_provider_key" ON "MemberAiCredential"("memberId", "provider");

-- AddForeignKey
ALTER TABLE "MemberAiCredential" ADD CONSTRAINT "MemberAiCredential_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

