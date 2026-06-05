-- Phase 2: GitHub Issue/PR/Branch/Commit/File links to tasks.

-- ── Enums ──
CREATE TYPE "GitHubLinkKind" AS ENUM ('ISSUE', 'PR', 'BRANCH', 'COMMIT', 'FILE');

ALTER TYPE "ActivityEventType" ADD VALUE 'GITHUB_REPO_LINKED';
ALTER TYPE "ActivityEventType" ADD VALUE 'GITHUB_ISSUE_LINKED';
ALTER TYPE "ActivityEventType" ADD VALUE 'GITHUB_ISSUE_IMPORTED';
ALTER TYPE "ActivityEventType" ADD VALUE 'GITHUB_BRANCH_CREATED';
ALTER TYPE "ActivityEventType" ADD VALUE 'GITHUB_PR_LINKED';

-- ── Table ──
CREATE TABLE "GitHubLink" (
  "id"            TEXT NOT NULL,
  "projectId"    TEXT NOT NULL,
  "taskId"       TEXT,
  "kind"         "GitHubLinkKind" NOT NULL,
  "repoFullName" TEXT NOT NULL,
  "refNumber"    INTEGER,
  "refSha"       TEXT,
  "refPath"      TEXT,
  "state"        TEXT,
  "title"        TEXT,
  "url"          TEXT NOT NULL,
  "externalId"   TEXT,
  "lastSyncedAt" TIMESTAMP(3),
  "createdById"  TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GitHubLink_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GitHubLink_projectId_idx"               ON "GitHubLink"("projectId");
CREATE INDEX "GitHubLink_taskId_idx"                  ON "GitHubLink"("taskId");
CREATE INDEX "GitHubLink_repoFullName_kind_idx"       ON "GitHubLink"("repoFullName", "kind");

ALTER TABLE "GitHubLink"
  ADD CONSTRAINT "GitHubLink_projectId_fkey"  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE  ON UPDATE CASCADE,
  ADD CONSTRAINT "GitHubLink_taskId_fkey"     FOREIGN KEY ("taskId")    REFERENCES "Task"("id")    ON DELETE CASCADE  ON UPDATE CASCADE,
  ADD CONSTRAINT "GitHubLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
