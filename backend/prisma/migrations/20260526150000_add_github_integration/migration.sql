-- Phase 1: GitHub integration foundation
-- Adds per-member GitHub OAuth fields and per-project repo link.
-- Phase 2 will add GitHubLink (task↔issue/PR/branch/commit/file linkage).

ALTER TABLE "Member"
  ADD COLUMN "githubLogin"            TEXT,
  ADD COLUMN "githubAccessToken"      TEXT,
  ADD COLUMN "githubRefreshToken"     TEXT,
  ADD COLUMN "githubTokenExpiresAt"   TIMESTAMP(3);

CREATE UNIQUE INDEX "Member_githubLogin_key" ON "Member"("githubLogin");

ALTER TABLE "Project"
  ADD COLUMN "githubRepo"      TEXT,
  ADD COLUMN "githubInstallId" INTEGER;
