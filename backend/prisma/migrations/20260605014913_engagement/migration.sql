-- CreateEnum
CREATE TYPE "Rank" AS ENUM ('NESTLING', 'FLEDGLING', 'CADET', 'SPECIALIST', 'PIONEER', 'COSMONAUT', 'CELESTIAL');

-- CreateEnum
CREATE TYPE "RewardEventType" AS ENUM ('TIME_LOG_HOUR', 'TASK_COMPLETE_ADMIN_CREATED', 'TASK_COMPLETE_MEMBER_CREATED', 'MILESTONE_HIT', 'KUDOS_RECEIVED', 'BLOG_POST_PUBLISHED', 'EARLY_DELIVERY_BONUS');

-- CreateEnum
CREATE TYPE "XpSource" AS ENUM ('TIME_LOG', 'TASK_COMPLETE', 'MILESTONE', 'KUDOS', 'BLOG_POST', 'ADMIN_ADJUSTMENT', 'EARLY_BONUS');

-- CreateEnum
CREATE TYPE "DoubloonSource" AS ENUM ('TIME_LOG', 'TASK_COMPLETE', 'MILESTONE', 'KUDOS', 'BLOG_POST', 'SHOP_PURCHASE', 'ADMIN_ADJUSTMENT', 'EARLY_BONUS');

-- CreateEnum
CREATE TYPE "CosmeticCategory" AS ENUM ('AVATAR_FEATURE', 'CLOTHING', 'NAME_FRAME', 'DASHBOARD_THEME', 'BADGE', 'ANIMATION');

-- CreateEnum
CREATE TYPE "CosmeticRarity" AS ENUM ('COMMON', 'UNCOMMON', 'RARE', 'MYTHIC');

-- CreateEnum
CREATE TYPE "PendingRewardStatus" AS ENUM ('PENDING', 'APPROVED', 'ADJUSTED', 'REJECTED');

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "doubloons" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rank" "Rank" NOT NULL DEFAULT 'NESTLING',
ADD COLUMN     "xp" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "RewardEventConfig" (
    "id" TEXT NOT NULL,
    "eventType" "RewardEventType" NOT NULL,
    "autoApprove" BOOLEAN NOT NULL DEFAULT true,
    "xpAmount" INTEGER NOT NULL DEFAULT 0,
    "doubloonAmount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RewardEventConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "XpEvent" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "source" "XpSource" NOT NULL,
    "taskId" TEXT,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "XpEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoubloonEvent" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "source" "DoubloonSource" NOT NULL,
    "taskId" TEXT,
    "cosmeticId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DoubloonEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cosmetic" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "CosmeticCategory" NOT NULL,
    "rarity" "CosmeticRarity" NOT NULL,
    "cssSlug" TEXT,
    "iconClass" TEXT,
    "registryKey" TEXT,
    "doubloonPrice" INTEGER NOT NULL DEFAULT 0,
    "xpGate" INTEGER,
    "rankGate" "Rank",
    "shopEligible" BOOLEAN NOT NULL DEFAULT true,
    "unlockCondition" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cosmetic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberCosmetic" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "cosmeticId" TEXT NOT NULL,
    "equippedSlot" TEXT,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberCosmetic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CosmeticWishlist" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "cosmeticId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CosmeticWishlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopRotation" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "slots" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopRotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingReward" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "taskId" TEXT,
    "eventType" "RewardEventType" NOT NULL,
    "proposedXp" INTEGER NOT NULL,
    "proposedDoubloons" INTEGER NOT NULL,
    "status" "PendingRewardStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingReward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvatarConfig" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "featureJson" JSONB NOT NULL,
    "equippedCosmetics" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvatarConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Kudos" (
    "id" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Kudos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RewardEventConfig_eventType_key" ON "RewardEventConfig"("eventType");

-- CreateIndex
CREATE INDEX "XpEvent_memberId_createdAt_idx" ON "XpEvent"("memberId", "createdAt");

-- CreateIndex
CREATE INDEX "DoubloonEvent_memberId_createdAt_idx" ON "DoubloonEvent"("memberId", "createdAt");

-- CreateIndex
CREATE INDEX "Cosmetic_category_rarity_shopEligible_idx" ON "Cosmetic"("category", "rarity", "shopEligible");

-- CreateIndex
CREATE INDEX "MemberCosmetic_memberId_equippedSlot_idx" ON "MemberCosmetic"("memberId", "equippedSlot");

-- CreateIndex
CREATE UNIQUE INDEX "MemberCosmetic_memberId_cosmeticId_key" ON "MemberCosmetic"("memberId", "cosmeticId");

-- CreateIndex
CREATE UNIQUE INDEX "CosmeticWishlist_memberId_cosmeticId_key" ON "CosmeticWishlist"("memberId", "cosmeticId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopRotation_memberId_date_key" ON "ShopRotation"("memberId", "date");

-- CreateIndex
CREATE INDEX "PendingReward_status_createdAt_idx" ON "PendingReward"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AvatarConfig_memberId_key" ON "AvatarConfig"("memberId");

-- CreateIndex
CREATE INDEX "Kudos_toId_createdAt_idx" ON "Kudos"("toId", "createdAt");

-- CreateIndex
CREATE INDEX "Kudos_fromId_createdAt_idx" ON "Kudos"("fromId", "createdAt");

-- AddForeignKey
ALTER TABLE "XpEvent" ADD CONSTRAINT "XpEvent_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoubloonEvent" ADD CONSTRAINT "DoubloonEvent_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberCosmetic" ADD CONSTRAINT "MemberCosmetic_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberCosmetic" ADD CONSTRAINT "MemberCosmetic_cosmeticId_fkey" FOREIGN KEY ("cosmeticId") REFERENCES "Cosmetic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CosmeticWishlist" ADD CONSTRAINT "CosmeticWishlist_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CosmeticWishlist" ADD CONSTRAINT "CosmeticWishlist_cosmeticId_fkey" FOREIGN KEY ("cosmeticId") REFERENCES "Cosmetic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopRotation" ADD CONSTRAINT "ShopRotation_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingReward" ADD CONSTRAINT "PendingReward_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvatarConfig" ADD CONSTRAINT "AvatarConfig_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kudos" ADD CONSTRAINT "Kudos_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kudos" ADD CONSTRAINT "Kudos_toId_fkey" FOREIGN KEY ("toId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
