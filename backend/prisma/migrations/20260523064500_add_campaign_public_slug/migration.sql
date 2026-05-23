-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN "slug" TEXT,
ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_slug_key" ON "Campaign"("slug");
