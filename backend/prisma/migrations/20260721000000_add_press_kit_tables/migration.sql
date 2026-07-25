-- CreateEnum
CREATE TYPE "PressKitStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateTable
CREATE TABLE "ProjectPressKit" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "contentJson" JSONB,
    "contentYjs" BYTEA,
    "renderedHtml" TEXT,
    "config" JSONB NOT NULL,
    "status" "PressKitStatus" NOT NULL DEFAULT 'DRAFT',
    "generatedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectPressKit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PressKitRevision" (
    "id" TEXT NOT NULL,
    "pressKitId" TEXT NOT NULL,
    "contentJson" JSONB NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PressKitRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectPressKit_projectId_key" ON "ProjectPressKit"("projectId");

-- CreateIndex
CREATE INDEX "PressKitRevision_pressKitId_idx" ON "PressKitRevision"("pressKitId");

-- AddForeignKey
ALTER TABLE "ProjectPressKit" ADD CONSTRAINT "ProjectPressKit_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectPressKit" ADD CONSTRAINT "ProjectPressKit_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PressKitRevision" ADD CONSTRAINT "PressKitRevision_pressKitId_fkey" FOREIGN KEY ("pressKitId") REFERENCES "ProjectPressKit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PressKitRevision" ADD CONSTRAINT "PressKitRevision_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
