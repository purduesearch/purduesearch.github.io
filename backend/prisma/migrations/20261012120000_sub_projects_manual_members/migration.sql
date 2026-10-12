-- Sub-projects (one level, enforced by the API) and admin-added project members.
ALTER TABLE "Project" ADD COLUMN "parentId" TEXT;
CREATE INDEX "Project_parentId_idx" ON "Project"("parentId");
ALTER TABLE "Project" ADD CONSTRAINT "Project_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProjectMember" ADD COLUMN "addedManually" BOOLEAN NOT NULL DEFAULT false;
