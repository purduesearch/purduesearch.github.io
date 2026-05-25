-- AlterTable
ALTER TABLE "Project" ADD COLUMN "programTag" TEXT,
ADD COLUMN "pressKitToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Project_pressKitToken_key" ON "Project"("pressKitToken");
