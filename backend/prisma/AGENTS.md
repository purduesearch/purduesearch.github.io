# AGENTS.md — Database Schema (`backend/prisma/`)

Scope: Prisma schema, models, and enums. Applies together with the root and
`backend/AGENTS.md`.

---

### Database (`backend/prisma/schema.prisma`)
Key models include `Member`, `Project`, `ProjectMember`, `Task`, `TaskComment`, `TaskDependency`, `Blocker`, `TaskBlocker`, `Milestone`, `TimeLog`, `Activity`, `ActivityLog`, `GitHubLink`, `ProjectRepo`, `Event`, `OutreachSubmission`, `BlogPost`, `Course`, `CourseModule`, `CourseSection`, `CourseWorkSubmission`, `Training`, `TrainingCertificate`, `XpEvent`, `DoubloonEvent`, `Challenge`, `MemberChallenge`, `MemberAchievement`, `Cosmetic`, `MemberCosmetic`, `MemberInventory`, `SlackMessage`, `SlackMessageFile`, `SlackConversationMember`, `Workspace`, `WorkspaceProject`, `WorkspaceRequirement`, `LabShift`, and `LabShiftSkip`. `LabShift` dates are `@db.Date` local dates and minutes are local; `Event.workspaceId` links an event to a lab space (SetNull). Search the schema for the authoritative fields and relations before writing queries; there is no `MilestoneTask` or `InventoryItem` model in the current schema.

Key enums:
- `Rank` — NESTLING → FLEDGLING → CADET → SPECIALIST → PIONEER → COSMONAUT → CELESTIAL (thresholds 0–21,000 XP)
- `TaskStatus` — TODO, IN_PROGRESS, BLOCKED, DONE
- `Priority` — LOW, MEDIUM, HIGH, CRITICAL
- `RewardEventType` — TIME_LOG_HOUR, TASK_COMPLETE_MEMBER_CREATED, TASK_COMPLETE_ADMIN_CREATED, MILESTONE_HIT, KUDOS_RECEIVED, BLOG_POST_PUBLISHED, EARLY_DELIVERY_BONUS, MEETING_AVAILABILITY_SUBMITTED, COURSE_SECTION_COMPLETE, COURSE_COMPLETE
- `ChallengeMetric` — TASK_COMPLETED, COMMENT_WRITTEN, TIME_LOG_HOURS, UNIQUE_ASSIGNEES, FILE_ATTACHED, etc.
- `ChallengeType` — DAILY, WEEKLY, MONTHLY, ACHIEVEMENT
- `CourseSectionKind` — CONTENT, VIDEO, QUIZ, SLIDES, WALKTHROUGH, LIT_REVIEW, ASSIGNMENT, TRAINING. One `Json?` config column per configurable kind on `CourseSection`; **every writer spreads the previous value and writes the column whole**, never key-by-key. `LIT_REVIEW` and `ASSIGNMENT` both write learner attempts to `CourseWorkSubmission` — one model, `@@map`'d to the original `CourseLitSubmission` table so the rename emitted no DDL. One row **per attempt**, never updated in place; revision history is the point. Opt-in score gating on either kind reuses `CourseSection.passThreshold`. `TRAINING` uses the training registry/certificate models and an externally hosted course.
- `ActivityEventType` — `ActivityLog` event types (see `logAuditEvent`/`getProjectAuditLog`/`getTaskAuditLog`). Task/project/GitHub lifecycle values (`TASK_CREATED`, `TASK_UPDATED`, `TASK_COMPLETED`, `TASK_DELETED`, `TASK_ASSIGNED`, `GITHUB_PR_MERGED`, etc.) plus the audit-sync additions: `TASK_DEPENDENCY_ADDED`/`TASK_DEPENDENCY_REMOVED`, `TASK_BLOCKER_ATTACHED`/`TASK_BLOCKER_DETACHED`, `BLOCKER_RESOLVED`, `COMMENT_ADDED`/`COMMENT_EDITED`/`COMMENT_DELETED`, `TIME_LOGGED`, `MILESTONE_CREATED`/`MILESTONE_UPDATED`/`MILESTONE_DELETED`/`MILESTONE_TASKS_LINKED`, and `AI_PLAN_EXECUTED` (one summary event per AI action-plan execution, in addition to the specific event type logged per executed action).

Member XP lives in **two places kept in sync by `grantXP()`**: a `Member.xp` running-total column (read for display/rank) and `XpEvent` ledger rows (audit/history). Never increment one without the other — go through `rewardService.grantXP()`.
Task `rewardGrantedAt` is an idempotency gate; do not clear it or DONE→IN_PROGRESS→DONE re-grants XP.
