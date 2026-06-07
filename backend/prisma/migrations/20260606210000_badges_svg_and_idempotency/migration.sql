-- Add svgUrl on Cosmetic (alongside legacy iconClass)
ALTER TABLE "Cosmetic" ADD COLUMN "svgUrl" TEXT;

-- Add equippedBadgeId on Member (rank-slot badge; null = render default rank SVG)
ALTER TABLE "Member" ADD COLUMN "equippedBadgeId" TEXT;
ALTER TABLE "Member"
  ADD CONSTRAINT "Member_equippedBadgeId_fkey"
  FOREIGN KEY ("equippedBadgeId") REFERENCES "Cosmetic"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Add rewardGrantedAt on Task for engagement idempotency
ALTER TABLE "Task" ADD COLUMN "rewardGrantedAt" TIMESTAMP(3);
