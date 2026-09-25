-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'LAB_BUDDY_JOINED';
ALTER TYPE "NotificationType" ADD VALUE 'LAB_BUDDY_WANTED';

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "workspaceId" TEXT;

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "color" TEXT NOT NULL DEFAULT '#00e5cc',
    "capacity" INTEGER,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "openStartMin" INTEGER NOT NULL DEFAULT 480,
    "openEndMin" INTEGER NOT NULL DEFAULT 1320,
    "defaultEndsOn" DATE,
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceProject" (
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,

    CONSTRAINT "WorkspaceProject_pkey" PRIMARY KEY ("workspaceId","projectId")
);

-- CreateTable
CREATE TABLE "WorkspaceRequirement" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "trainingId" TEXT,
    "courseId" TEXT,

    CONSTRAINT "WorkspaceRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabShift" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMin" INTEGER NOT NULL,
    "endMin" INTEGER NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "buddyWanted" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabShiftSkip" (
    "shiftId" TEXT NOT NULL,
    "date" DATE NOT NULL,

    CONSTRAINT "LabShiftSkip_pkey" PRIMARY KEY ("shiftId","date")
);

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");

-- CreateIndex
CREATE INDEX "Workspace_archivedAt_idx" ON "Workspace"("archivedAt");

-- CreateIndex
CREATE INDEX "WorkspaceProject_projectId_idx" ON "WorkspaceProject"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceRequirement_workspaceId_trainingId_key" ON "WorkspaceRequirement"("workspaceId", "trainingId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceRequirement_workspaceId_courseId_key" ON "WorkspaceRequirement"("workspaceId", "courseId");

-- CreateIndex
CREATE INDEX "LabShift_workspaceId_startsOn_endsOn_idx" ON "LabShift"("workspaceId", "startsOn", "endsOn");

-- CreateIndex
CREATE INDEX "LabShift_memberId_idx" ON "LabShift"("memberId");

-- CreateIndex
CREATE INDEX "Event_workspaceId_idx" ON "Event"("workspaceId");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceProject" ADD CONSTRAINT "WorkspaceProject_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceProject" ADD CONSTRAINT "WorkspaceProject_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceRequirement" ADD CONSTRAINT "WorkspaceRequirement_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceRequirement" ADD CONSTRAINT "WorkspaceRequirement_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES "Training"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceRequirement" ADD CONSTRAINT "WorkspaceRequirement_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabShift" ADD CONSTRAINT "LabShift_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabShift" ADD CONSTRAINT "LabShift_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabShiftSkip" ADD CONSTRAINT "LabShiftSkip_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "LabShift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

