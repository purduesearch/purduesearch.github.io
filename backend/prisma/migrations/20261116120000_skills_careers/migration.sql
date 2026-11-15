-- CreateEnum
CREATE TYPE "OnetDomain" AS ENUM ('ESSENTIAL_SKILL', 'TRANSFERABLE_SKILL', 'KNOWLEDGE', 'WORK_STYLE', 'SOFTWARE_CATEGORY', 'GWA', 'IWA', 'DWA', 'OTHER');

-- CreateEnum
CREATE TYPE "OnetLinkKind" AS ENUM ('SOFTWARE', 'ELEMENT', 'DWA');

-- CreateEnum
CREATE TYPE "OnetLinkRelation" AS ENUM ('EXACT', 'BROADER', 'RELATED');

-- CreateEnum
CREATE TYPE "AttestationKind" AS ENUM ('CLAIM', 'CONFIRM');

-- CreateEnum
CREATE TYPE "AttestationStatus" AS ENUM ('PENDING', 'VERIFIED', 'DECLINED', 'NEEDS_PROOF');

-- CreateEnum
CREATE TYPE "IntroStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "OpportunitySourceKind" AS ENUM ('USAJOBS', 'GREENHOUSE', 'LEVER', 'ASHBY', 'SPONSOR');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'CAREER_INTRO_REQUEST';
ALTER TYPE "NotificationType" ADD VALUE 'CAREER_ATTESTATION_REVIEWED';

-- CreateTable
CREATE TABLE "OnetRelease" (
    "version" TEXT NOT NULL,
    "releasedOn" TEXT NOT NULL,
    "sourceSha256" TEXT NOT NULL,
    "counts" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "loadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnetRelease_pkey" PRIMARY KEY ("version")
);

-- CreateTable
CREATE TABLE "OnetOccupation" (
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "jobZone" INTEGER,

    CONSTRAINT "OnetOccupation_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "OnetElement" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "domain" "OnetDomain" NOT NULL,
    "parentId" TEXT,

    CONSTRAINT "OnetElement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnetRating" (
    "occupationCode" TEXT NOT NULL,
    "elementId" TEXT NOT NULL,
    "scale" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "suppress" BOOLEAN NOT NULL DEFAULT false,
    "notRelevant" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "OnetRating_pkey" PRIMARY KEY ("occupationCode","elementId","scale")
);

-- CreateTable
CREATE TABLE "OnetSoftware" (
    "id" SERIAL NOT NULL,
    "occupationCode" TEXT NOT NULL,
    "example" TEXT NOT NULL,
    "exampleNorm" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "hot" BOOLEAN NOT NULL,
    "inDemand" BOOLEAN NOT NULL,

    CONSTRAINT "OnetSoftware_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnetOccupationDwa" (
    "occupationCode" TEXT NOT NULL,
    "dwaId" TEXT NOT NULL,

    CONSTRAINT "OnetOccupationDwa_pkey" PRIMARY KEY ("occupationCode","dwaId")
);

-- CreateTable
CREATE TABLE "OnetJobTitle" (
    "id" SERIAL NOT NULL,
    "occupationCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleNorm" TEXT NOT NULL,

    CONSTRAINT "OnetJobTitle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnetEmergingTask" (
    "id" SERIAL NOT NULL,
    "occupationCode" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "category" TEXT NOT NULL,

    CONSTRAINT "OnetEmergingTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnetRelatedOccupation" (
    "occupationCode" TEXT NOT NULL,
    "relatedCode" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,

    CONSTRAINT "OnetRelatedOccupation_pkey" PRIMARY KEY ("occupationCode","relatedCode")
);

-- CreateTable
CREATE TABLE "SkillOnetLink" (
    "id" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "kind" "OnetLinkKind" NOT NULL,
    "ref" TEXT NOT NULL,
    "relation" "OnetLinkRelation" NOT NULL DEFAULT 'EXACT',
    "origin" TEXT NOT NULL DEFAULT 'AUTO',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkillOnetLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareerProfile" (
    "memberId" TEXT NOT NULL,
    "major" TEXT,
    "gradTerm" TEXT,
    "openTo" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "availableFrom" TEXT,
    "headline" TEXT,
    "shareWithSponsors" BOOLEAN NOT NULL DEFAULT false,
    "showOnPublicPage" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareerProfile_pkey" PRIMARY KEY ("memberId")
);

-- CreateTable
CREATE TABLE "CareerTarget" (
    "memberId" TEXT NOT NULL,
    "onetCode" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CareerTarget_pkey" PRIMARY KEY ("memberId","onetCode")
);

-- CreateTable
CREATE TABLE "ImpactSnapshot" (
    "memberId" TEXT NOT NULL,
    "metricId" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "detail" JSONB NOT NULL,
    "sourceRefs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metricVersion" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImpactSnapshot_pkey" PRIMARY KEY ("memberId","metricId")
);

-- CreateTable
CREATE TABLE "ImpactAttestation" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "kind" "AttestationKind" NOT NULL,
    "metricId" TEXT,
    "label" TEXT,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT,
    "dwaId" TEXT,
    "evidenceUrl" TEXT,
    "note" TEXT,
    "status" "AttestationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewerId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImpactAttestation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResumeBullet" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "sourceKind" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "template" TEXT,
    "included" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResumeBullet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemandSignal" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "publishedOn" TEXT NOT NULL,
    "onetElementIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "skillIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metricIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemandSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SponsorOrg" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "outreachContactId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "accessUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SponsorOrg_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SponsorUser" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "lastLoginAt" TIMESTAMP(3),
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SponsorUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SponsorLoginToken" (
    "tokenHash" TEXT NOT NULL,
    "sponsorUserId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SponsorLoginToken_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateTable
CREATE TABLE "IntroRequest" (
    "id" TEXT NOT NULL,
    "sponsorUserId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "opportunityId" TEXT,
    "message" TEXT NOT NULL,
    "status" "IntroStatus" NOT NULL DEFAULT 'PENDING',
    "respondedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntroRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunitySource" (
    "id" TEXT NOT NULL,
    "kind" "OpportunitySourceKind" NOT NULL,
    "label" TEXT NOT NULL,
    "companyName" TEXT,
    "config" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastFetchedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpportunitySource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT,
    "location" TEXT,
    "url" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "employmentType" TEXT,
    "isInternship" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT NOT NULL,
    "onetCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "skillIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiredAt" TIMESTAMP(3),

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunitySave" (
    "memberId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpportunitySave_pkey" PRIMARY KEY ("memberId","opportunityId")
);

-- CreateTable
CREATE TABLE "CareerSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "disabledMetrics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareerSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BadgeAward" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "achievementId" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "credentialJwt" TEXT NOT NULL,
    "credentialSha256" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,

    CONSTRAINT "BadgeAward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OnetOccupation_title_idx" ON "OnetOccupation"("title");

-- CreateIndex
CREATE INDEX "OnetElement_domain_idx" ON "OnetElement"("domain");

-- CreateIndex
CREATE INDEX "OnetElement_parentId_idx" ON "OnetElement"("parentId");

-- CreateIndex
CREATE INDEX "OnetRating_elementId_scale_idx" ON "OnetRating"("elementId", "scale");

-- CreateIndex
CREATE INDEX "OnetSoftware_exampleNorm_idx" ON "OnetSoftware"("exampleNorm");

-- CreateIndex
CREATE INDEX "OnetSoftware_categoryId_idx" ON "OnetSoftware"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "OnetSoftware_occupationCode_example_categoryId_key" ON "OnetSoftware"("occupationCode", "example", "categoryId");

-- CreateIndex
CREATE INDEX "OnetOccupationDwa_dwaId_idx" ON "OnetOccupationDwa"("dwaId");

-- CreateIndex
CREATE INDEX "OnetJobTitle_titleNorm_idx" ON "OnetJobTitle"("titleNorm");

-- CreateIndex
CREATE INDEX "SkillOnetLink_kind_ref_idx" ON "SkillOnetLink"("kind", "ref");

-- CreateIndex
CREATE UNIQUE INDEX "SkillOnetLink_skillId_kind_ref_key" ON "SkillOnetLink"("skillId", "kind", "ref");

-- CreateIndex
CREATE INDEX "ImpactSnapshot_metricId_idx" ON "ImpactSnapshot"("metricId");

-- CreateIndex
CREATE INDEX "ImpactAttestation_status_createdAt_idx" ON "ImpactAttestation"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ImpactAttestation_memberId_idx" ON "ImpactAttestation"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "ResumeBullet_memberId_sourceKind_sourceId_key" ON "ResumeBullet"("memberId", "sourceKind", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "SponsorUser_email_key" ON "SponsorUser"("email");

-- CreateIndex
CREATE INDEX "SponsorLoginToken_expiresAt_idx" ON "SponsorLoginToken"("expiresAt");

-- CreateIndex
CREATE INDEX "IntroRequest_memberId_status_idx" ON "IntroRequest"("memberId", "status");

-- CreateIndex
CREATE INDEX "IntroRequest_sponsorUserId_createdAt_idx" ON "IntroRequest"("sponsorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "Opportunity_expiredAt_idx" ON "Opportunity"("expiredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_sourceId_externalId_key" ON "Opportunity"("sourceId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "BadgeAward_memberId_achievementId_key" ON "BadgeAward"("memberId", "achievementId");

-- AddForeignKey
ALTER TABLE "OnetRating" ADD CONSTRAINT "OnetRating_occupationCode_fkey" FOREIGN KEY ("occupationCode") REFERENCES "OnetOccupation"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnetSoftware" ADD CONSTRAINT "OnetSoftware_occupationCode_fkey" FOREIGN KEY ("occupationCode") REFERENCES "OnetOccupation"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnetOccupationDwa" ADD CONSTRAINT "OnetOccupationDwa_occupationCode_fkey" FOREIGN KEY ("occupationCode") REFERENCES "OnetOccupation"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnetJobTitle" ADD CONSTRAINT "OnetJobTitle_occupationCode_fkey" FOREIGN KEY ("occupationCode") REFERENCES "OnetOccupation"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnetEmergingTask" ADD CONSTRAINT "OnetEmergingTask_occupationCode_fkey" FOREIGN KEY ("occupationCode") REFERENCES "OnetOccupation"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillOnetLink" ADD CONSTRAINT "SkillOnetLink_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareerProfile" ADD CONSTRAINT "CareerProfile_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareerTarget" ADD CONSTRAINT "CareerTarget_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImpactSnapshot" ADD CONSTRAINT "ImpactSnapshot_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImpactAttestation" ADD CONSTRAINT "ImpactAttestation_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResumeBullet" ADD CONSTRAINT "ResumeBullet_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorUser" ADD CONSTRAINT "SponsorUser_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "SponsorOrg"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorLoginToken" ADD CONSTRAINT "SponsorLoginToken_sponsorUserId_fkey" FOREIGN KEY ("sponsorUserId") REFERENCES "SponsorUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntroRequest" ADD CONSTRAINT "IntroRequest_sponsorUserId_fkey" FOREIGN KEY ("sponsorUserId") REFERENCES "SponsorUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntroRequest" ADD CONSTRAINT "IntroRequest_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "OpportunitySource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunitySave" ADD CONSTRAINT "OpportunitySave_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunitySave" ADD CONSTRAINT "OpportunitySave_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BadgeAward" ADD CONSTRAINT "BadgeAward_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
