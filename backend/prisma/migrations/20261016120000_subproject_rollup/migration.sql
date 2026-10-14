-- Sub-project roll-up settings: one row per child project; no row means everything off.

-- CreateTable
CREATE TABLE "SubProjectRollup" (
    "projectId" TEXT NOT NULL,
    "tasks" BOOLEAN NOT NULL DEFAULT false,
    "tagEnabled" BOOLEAN NOT NULL DEFAULT false,
    "tagLabel" TEXT,
    "tagColor" TEXT,
    "github" BOOLEAN NOT NULL DEFAULT false,
    "slack" BOOLEAN NOT NULL DEFAULT false,
    "vault" BOOLEAN NOT NULL DEFAULT false,
    "milestones" BOOLEAN NOT NULL DEFAULT false,
    "insights" BOOLEAN NOT NULL DEFAULT false,
    "parentMembersCanEdit" BOOLEAN NOT NULL DEFAULT false,
    "aiContext" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubProjectRollup_pkey" PRIMARY KEY ("projectId")
);

-- AddForeignKey
ALTER TABLE "SubProjectRollup" ADD CONSTRAINT "SubProjectRollup_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
