-- CreateTable
CREATE TABLE "OutreachContact" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "organization" TEXT,
    "role" TEXT,
    "contactType" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'COLD',
    "tags" TEXT[],
    "notes" TEXT,
    "lastContactedAt" TIMESTAMP(3),
    "nextFollowUpAt" TIMESTAMP(3),
    "ownerId" TEXT,
    "campaignId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactInteraction" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "memberId" TEXT NOT NULL,

    CONSTRAINT "ContactInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OutreachContact_contactType_stage_idx" ON "OutreachContact"("contactType", "stage");

-- CreateIndex
CREATE INDEX "OutreachContact_nextFollowUpAt_idx" ON "OutreachContact"("nextFollowUpAt");

-- CreateIndex
CREATE INDEX "OutreachContact_ownerId_idx" ON "OutreachContact"("ownerId");

-- CreateIndex
CREATE INDEX "ContactInteraction_contactId_idx" ON "ContactInteraction"("contactId");

-- AddForeignKey
ALTER TABLE "OutreachContact" ADD CONSTRAINT "OutreachContact_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachContact" ADD CONSTRAINT "OutreachContact_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactInteraction" ADD CONSTRAINT "ContactInteraction_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "OutreachContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactInteraction" ADD CONSTRAINT "ContactInteraction_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
