-- Phase 4: GitHub milestone mapping table.

CREATE TABLE "GitHubMilestoneMap" (
  "id"                    TEXT NOT NULL,
  "projectId"             TEXT NOT NULL,
  "milestoneId"           TEXT NOT NULL,
  "githubMilestoneNumber" INTEGER NOT NULL,
  "repoFullName"          TEXT NOT NULL,
  "lastSyncedAt"          TIMESTAMP(3),
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GitHubMilestoneMap_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GitHubMilestoneMap_milestoneId_key"
  ON "GitHubMilestoneMap"("milestoneId");
CREATE INDEX "GitHubMilestoneMap_projectId_idx"
  ON "GitHubMilestoneMap"("projectId");
CREATE INDEX "GitHubMilestoneMap_repoFullName_githubMilestoneNumber_idx"
  ON "GitHubMilestoneMap"("repoFullName", "githubMilestoneNumber");

ALTER TABLE "GitHubMilestoneMap"
  ADD CONSTRAINT "GitHubMilestoneMap_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
