-- Phase 3: webhook-driven automation + CI gating.

-- ── CI gating toggle on Project (default ON) ──
ALTER TABLE "Project"
  ADD COLUMN "githubBlockDoneOnCiFail" BOOLEAN NOT NULL DEFAULT TRUE;

-- ── New ActivityEventType values ──
ALTER TYPE "ActivityEventType" ADD VALUE 'GITHUB_PR_OPENED';
ALTER TYPE "ActivityEventType" ADD VALUE 'GITHUB_PR_MERGED';
ALTER TYPE "ActivityEventType" ADD VALUE 'GITHUB_PR_CLOSED';
ALTER TYPE "ActivityEventType" ADD VALUE 'GITHUB_PR_REVIEW';
ALTER TYPE "ActivityEventType" ADD VALUE 'GITHUB_CI_PASSED';
ALTER TYPE "ActivityEventType" ADD VALUE 'GITHUB_CI_FAILED';
ALTER TYPE "ActivityEventType" ADD VALUE 'GITHUB_PUSH';
ALTER TYPE "ActivityEventType" ADD VALUE 'GITHUB_COMMIT_REFERENCED';
ALTER TYPE "ActivityEventType" ADD VALUE 'GITHUB_ISSUE_SYNCED';

-- ── New NotificationType values ──
ALTER TYPE "NotificationType" ADD VALUE 'GITHUB_PR_REVIEW_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'GITHUB_PR_MERGED';
ALTER TYPE "NotificationType" ADD VALUE 'GITHUB_CI_FAILED';
