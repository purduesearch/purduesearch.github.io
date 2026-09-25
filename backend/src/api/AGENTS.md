# AGENTS.md — Backend API Routes (`backend/src/api/`)

Scope: REST route handlers. Applies together with the root and `backend/AGENTS.md`.

---

### API Routes (`backend/src/api/`)
- `tasks.ts` — Core task CRUD + comments, subtasks, dependencies, time logs, AI enrichment. See **Task API Quick Reference** below.
- `members.ts` — Member profile, XP history, rank. Rank is a Prisma enum on `Member`. Also serves `GET /api/members/cosmetic-styles` — memberId → equipped css slugs; MUST stay registered above `GET /:id`.
- `auth.ts`, `githubAuth.ts`, and `googleAuth.ts` — Dual auth: session cookie (express-session + Slack OAuth) **plus** an HMAC-signed Bearer token (7-day TTL, `tokenVersion` revocation) delivered via `?lt=` redirect and stored in localStorage — the fallback for browsers that block cross-origin cookies. `requireAuth` accepts either and sets `req.memberId`. **Convention: read the authenticated identity from `req.memberId`, never `req.session.memberId`, in normal handlers.** The OAuth modules may use the session for short-lived state/return targets, but that does not make session-only identity valid elsewhere. The Slack user token lives on `Member.slackUserToken` (AES-GCM, like `githubAccessToken`) and is resolved by `services/slackUserTokenService.ts`; `src/services/slackUserTokenService.test.ts` asserts `api/slack.ts` contains no `req.session`.
- `projects.ts` — Project CRUD; also mounts `tagsRouter`.
- `milestones.ts` — Milestone CRUD + health refresh. See **Milestones API** below.
- `blockers.ts` — Project "category" blocker CRUD + task attach/detach. See **Blockers API** below.
- `rewards.ts` — Pending reward queue, admin approve/reject.
- `challenges.ts` — Active challenges, claim endpoint.
- `outreach.ts` — OutreachSubmission CRUD; sub-routers: assets, brand-voices, campaigns, contacts, insights.
- `shop.ts` / `inventory.ts` — Cosmetic shop, inventory.
- `leaderboard.ts` — XP + doubloon rankings.
- `notifications.ts` + `sse.ts` — Notification CRUD + SSE push stream.
- `public.ts` — Unauthenticated endpoints (the public site reads these). Includes the homepage events calendar: `GET /api/public/events` (JSON, `isPublic` + non-DEADLINE only, payload built by construction in `services/publicEventService.ts`), `GET /api/public/events.ics` (subscribable feed; UIDs `evt-<id>@purduesearch.org` — never change them once shipped, same reason as the poll UID), `GET /api/public/events/:eventId/ics` (single-event download).
- `github.ts` / `githubWebhook.ts` — GitHub integration + webhook (raw body handler).
- `reporting.ts`, `activity.ts`, `events.ts`, `eventConfig.ts`, `streak.ts` — Ancillary data.
- `vault.ts` + `changeRequests.ts` — Constellation Vault CAD/PDM: items, versions, checkouts, BOM, CRs. Mounted at bare `/api` (like `blockers.ts` and `streak.ts`).
- `blog.ts` — Blog editor CRUD, revisions, taxonomy, publish/schedule; collaborative editing WS (Hocuspocus) attaches at `/collab/blog` on the same HTTP server (`backend/src/collab/blogCollab.ts`).
- `chat.ts` — `/api/chat/*`, the conversation-scoped Slack portal API: conversation list, reads (messages, thread, search), file proxy (`/files/:slackFileId`), read marks, mute, and every write *as the member* with their own user token (post, edit, delete, react, upload, join, open/import DMs). Access goes through `middleware/conversationAccess.ts`. **Mounted above every bare `/api` router** because its file proxy authenticates with a `?token=` query param (an `<img>` can't send a header) that a pathless `requireAuth` would 401 first; `appMountOrder.test.ts` guards it. `projectChat.ts` now keeps only the project's channel list, backfill, storage-health and the `/api/slack-archive` admin routes — its old read/file routes were superseded by this file.
- `workspaces.ts` — Lab spaces + lab schedule (`/api/workspaces`). Admin CRUD/projects/requirements; `GET /:id/week` (presence blocks, event bands, requirement status, `canSchedule`); `POST /:id/shifts/apply` (rectangle add/erase, `weekly` or `dates` scope); `PATCH|DELETE /shifts/:shiftId`; `GET /buddy-requests`. Static paths stay above `/:id` (`workspaces.test.ts`). Requirements are advisory — never return 4xx for a missing training.
- `labVisits.ts` — Lab check-in/out (`/api/lab-visits`): `GET /me` (open, pending-confirm and unallocated visits + up to 10 TODO tasks), `GET /present?projectId=&workspaceId=` (checked in + scheduled now, per space), `POST /check-in { workspaceId }`, `POST /check-out { at? }`, `POST /confirm { at? }`, `POST /:id/allocate { taskId }`. Closing a visit splits its minutes into `TimeLog` rows (`labVisitId`) through `timeLogService.recordTimeLog`; auto-closed time earns no XP. Static paths stay above `/:id`.

**Body parsing:** the GitHub webhook is mounted before JSON parsing so it can verify the raw body. All normal JSON routes use `express.json({ limit: "15mb" })`, which is intentionally large enough for base64 image/document request bodies; do not silently revert it to Express's 100 kb default.

---

### Task API Quick Reference (`backend/src/api/tasks.ts`)

```
GET    /api/tasks/search                        full-text search (max 20)
POST   /api/tasks/check-duplicates              AI duplicate detection
POST   /api/tasks/create-from-nl               NL → structured task
POST   /api/tasks/create-from-image            screenshot → task extraction
PATCH  /api/tasks/bulk                         bulk updates with completion invariants
POST   /api/tasks/bulk-delete                  bulk hard delete with permission checks
POST   /api/tasks/bulk-archive                 bulk archive
GET    /api/tasks/:id                           single task + assignees + milestone
PATCH  /api/tasks/:id                           update (status, priority, assignees, attachments…)
DELETE /api/tasks/:id                           hard delete (prisma.task.delete); creator/admin only — no deletedAt field, row is removed
POST   /api/tasks/:id/archive                   archive one task
POST   /api/tasks/:id/unarchive                 restore one archived task
GET    /api/tasks/:id/comments                  threaded comments (top-level + 200 replies)
POST   /api/tasks/:id/comments                  create comment; parses @handle mentions → in-app notification + Slack DM to matched members; fires challenge hooks
PATCH  /api/tasks/:id/comments/:cid             edit (author only)
DELETE /api/tasks/:id/comments/:cid             delete (author or admin)
POST   /api/tasks/:id/comments/:cid/reactions   toggle emoji reaction (reactions JSON: { emoji: memberId[] }); fires challenge hook on toggle-on of someone else's comment
GET    /api/tasks/:id/subtasks                  list subtasks
POST   /api/tasks/:id/subtasks                  create subtask
POST   /api/tasks/:id/dependencies              add dependency (validates no circular refs)
DELETE /api/tasks/:id/dependencies/:depId       remove dependency
POST   /api/tasks/:id/time-logs                 log time (daily 8-hr cap; >2 hr queued for admin)
GET    /api/tasks/:id/time-logs                 list logs + total minutes
POST   /api/tasks/:id/ai-enrich                Gemini: description + acceptance criteria + DoD
POST   /api/tasks/:id/suggest-deadline         AI deadline suggestion
GET    /api/tasks/:id/history                   50 most recent `ActivityLog` rows for this task (`getTaskAuditLog`), mapped to { id, actor, action, at, metadata } — `action` is the humanized `eventType`, `metadata` is the raw payload (may include a `diffObjects` array rendered in TaskModal as `field: from → to`)
```

PATCH `/:id` status→DONE triggers: blocker validation, CI gate (if `githubBlockDoneOnCiFail`), `rewardService.handleTaskComplete()`, `challengeService.recordEvent()`, streak tick.
Always include `include: { assignees: { include: { member: true } } }` to get avatarUrl + rank.

---

### Blockers API (`backend/src/api/blockers.ts`)

Reusable, project-scoped "category" blockers (e.g. "Order delays"). Attaching one to a task forces it `BLOCKED`; the task clears back to `TODO` only once it has no open category blockers *and* no open (non-DONE) dependencies.

```
GET    /api/projects/:projectId/blockers        active (unresolved) blockers for a project
POST   /api/projects/:projectId/blockers        create a blocker { label, color?, assigneeId? }
PATCH  /api/blockers/:id                        rename/recolor/reassign a blocker
POST   /api/blockers/:id/resolve                resolve + detach from all tasks; recomputes affected tasks' BLOCKED status
POST   /api/tasks/:id/blockers                  attach an existing blocker to a task { blockerId, reason? }; sets task BLOCKED
DELETE /api/tasks/:id/blockers/:blockerId       detach; recomputes BLOCKED status for that task
```

Reassigning a blocker's `assigneeId` (create or update) sends an in-app notification + Slack DM to the new assignee.

---

### Milestones API (`backend/src/api/milestones.ts`)

```
GET    /api/milestones/project/:projectId       milestones for a project, with progress/taskCounts
GET    /api/milestones/:id                      single milestone with progress
POST   /api/milestones                          create { title, projectId, dueDate?, description?, ownerId? }
PATCH  /api/milestones/:id                       update fields; `milestoneTaskIds` replaces the full task link set; refreshes health after update
DELETE /api/milestones/:id                       unlinks tasks, then deletes the milestone
```

---

### AI Action Plan (`backend/src/api/projects.ts` + `backend/src/services/aiActionService.ts` + `projectContextService.ts`)

```
POST   /api/projects/:id/ask                    Q&A over buildProjectContext() via aiRouter's high tier — reflects task descriptions + recent ActivityLog, not just titles
POST   /api/projects/:id/ai-suggest-actions     { goal } → ActionPlan (proposed actions, not executed): suggestProjectActions() builds context, calls aiRouter's high tier, validates/clamps into known ids
POST   /api/projects/:id/ai-plan-prompt         { goal } → clipboard prompt; makes no AI/network call
POST   /api/projects/:id/ai-plan-import         { raw } → validated ActionPlan plus dropped-action reasons
POST   /api/projects/:id/ai-execute-plan        { actions: ActionPlan } → { results: [{ index, type, ok, error? }] }: executeActionPlan() re-validates and dispatches each action
```

`ActionPlan` = `{ type, targetTaskId?, params, rationale }[]`. `type` is one of `CREATE_TASK`, `UPDATE_TASK`, `DELETE_TASK`, `SET_STATUS`, `SET_PRIORITY`, `SET_DUE`, `ASSIGN`, `CREATE_SUBTASK`, `ADD_DEPENDENCY`, `ATTACH_BLOCKER`, `RESOLVE_BLOCKER`, `ADD_COMMENT`, `CREATE_MILESTONE`, `LINK_MILESTONE`. Most types require `targetTaskId` (must be a real task id in the project); `CREATE_TASK`, `CREATE_MILESTONE`, `RESOLVE_BLOCKER` are project-scoped (no target); `LINK_MILESTONE` takes an optional `targetTaskId` plus `params.taskIds[]`. `params` per type (see `aiActionService.ts` `dispatchAction()` for the authoritative list): `CREATE_TASK` → `{ title, description?, priority?, dueDate?, assigneeIds?, milestoneId?, subtasks? }`; `UPDATE_TASK` → `{ title?, description?, priority?, dueDate?, assigneeIds?, milestoneId? }`; `SET_STATUS` → `{ status }`; `SET_PRIORITY` → `{ priority }`; `SET_DUE` → `{ dueDate }`; `ASSIGN` → `{ assigneeIds }`; `CREATE_SUBTASK` → `{ title, assigneeIds? }`; `ADD_DEPENDENCY` → `{ blockingTaskId, reason? }`; `ATTACH_BLOCKER`/`RESOLVE_BLOCKER` → `{ blockerId, reason? }`; `ADD_COMMENT` → `{ content }`; `CREATE_MILESTONE` → `{ title, dueDate?, description?, ownerId? }`; `LINK_MILESTONE` → `{ milestoneId, taskIds? }`.

Execution is open to **any logged-in member** — `executeActionPlan` re-checks `taskAccess.ts` `getTaskPermissions` (edit/delete) for every action server-side regardless of what the client marked accepted, wraps each action in try/catch so one failure doesn't abort the batch, and logs the specific `eventType` per successful action plus one summary `AI_PLAN_EXECUTED` event with `{ totalActions, succeeded, failed }`. Frontend: `ProjectDetail.jsx`'s AiPanel "Action Plan" section (goal input → editable per-action cards, reusing the `SuggestedTaskCard` accept/dismiss idiom, via `src/components/clubpm/ActionPlanReview.jsx`) → `clubPmClient.js`'s `suggestActions(projectId, goal)` / `executePlan(projectId, actions)`.
