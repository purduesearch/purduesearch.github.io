# Slack Mirror — Constellation inside Slack

**Date:** 2026-10-09 · **Branch:** `feat/slack-mirror` from `main` · **Builds on:** `2026-09-10-slack-portal.md` (Slack → Constellation). This plan does the reverse direction: Constellation → Slack.

**Executor:** one **GPT-6.1 Sol (medium)** orchestrator agent that dispatches one subagent per phase.
Context: 1,050,000 tokens. Max output: 128,000 tokens. Context is not the main constraint. Focus is. Each phase brief is self-contained, so a subagent reads §A2, §B, §C and its own §P section, then only the files the brief names.

**UI mockups (owner's reference):** https://claude.ai/artifact/GSwxZ77hQFrT73QSgqZcR3. Subagents cannot open it. §C5 restates every layout in Block Kit terms.

---

## §A — How to execute this plan

### A1. Orchestrator protocol

1. Create the branch: `git checkout main && git pull && git checkout -b feat/slack-mirror`.
2. Run the baseline gate once (§A4). Record failures that exist before any change. Never fix them unless a phase says so.
3. Execute the waves in §D in order. In one wave, dispatch every **parallel-safe** phase at the same time. Run **sequential** phases one at a time, in the order listed.
4. Dispatch prompt for a subagent (use it verbatim, replace `Pxx`):
   > Execute phase Pxx of `docs/superpowers/plans/2026-10-09-slack-mirror.md`. Read §A2, §B, §C and §Pxx in that file, and nothing else in it. Follow the brief exactly. Do not edit any file listed in §A3. Finish with the receipt from §A5.
5. When a subagent finishes:
   - Read its receipt only. Do not re-read the files it changed unless the gate fails.
   - Apply the receipt's **Registration** lines to the orchestrator-owned files (§A3).
   - Run the gate (§A4).
   - Commit one commit per phase (§A6).
6. If the gate fails, dispatch a fix subagent with: the phase id, the failing command, and the last 80 lines of its output. Allow at most two fix attempts. Then stop and report to the human.
7. Stop and ask the human only at the **STOP** points in §D. Never re-open a decision in §B.

### A2. Rules for every subagent

- Read only the files your brief lists under **Read**. Use `rg` with the given anchors to find code; read the matching range plus about 40 lines of context. Read a file in full only if the brief says "full".
- **Never read in full:** `backend/prisma/schema.prisma`, `backend/src/api/tasks.ts`, `backend/src/api/vault.ts`, `backend/src/slack/modals.ts`, `src/components/clubpm/TaskModal.jsx`, `src/pages/ClubPM/ProjectDetail.jsx`, `public/clubpm-theme.css`, `public/search-theme.css`.
- Edit only the files under **Create / Edit**. If you must touch another file, stop and report it in the receipt under **Blocked**.
- Do not edit files in §A3. If your module needs registering, put the exact lines in the receipt under **Registration**.
- Plain TypeScript, ESM imports with `.js` suffixes (match the existing backend). No new npm dependencies.
- All AI calls go through `backend/src/services/ai/aiRouter.ts` (`runJson` / `runText`). The one exception is P18, which reuses `parseTaskFromMessage` in `services/aiService.ts`.
- Every Slack write runs **as the clicking member**: resolve `body.user.id` to a `Member` with `prisma.member.findUnique({ where: { slackId } })`. If no member exists, reply ephemerally: "Sign in to Constellation first: <FRONTEND_URL>/clubpm/login". Then run the same service function and permission check the REST route uses.
- Ack every Slack interaction within 3 s. Open a modal **before** any AI or heavy DB work: open a loading view, then call `views.update` (§C4).
- Tests: standalone `*.test.ts` files run with `npx tsx`, using `node:assert/strict`. Copy the style of `backend/src/services/slackPings.test.ts`. Pure modules get unit tests. Handlers get none.
- In a **parallel-safe** phase, run only your own test file(s) plus `npm run typecheck`. Report typecheck errors in files you did not touch; do not fix them.

### A3. Orchestrator-owned files (subagents never edit these)

| File | Why |
|---|---|
| `backend/src/slack/mirror.ts` | One `registerMirror(app)` that calls every new handler module's `register*` function. Created by P03. |
| `backend/src/slack/router.ts` | The `/c` subcommand table. Created by P03. |
| `backend/src/slack/bolt.ts` | Calls `registerMirror(boltApp)` (added once, by P03). |
| `backend/src/slack/scheduler.ts` | The only cron registry (repo rule). |
| `backend/src/app.ts` | Router mounting and startup hooks. |
| `slack-manifest.yaml` | Created/updated in P03; later phases list scope/event needs in the receipt. |

**Registration** lines in a receipt look like this:
```
mirror.ts:   import { registerTaskCardActions } from "./handlers/taskCardActions.js";  →  registerTaskCardActions(app);
router.ts:   "task": handleTaskCommand   (import from "./handlers/quickAdd.js")
scheduler.ts: cron "* * * * *" → flushDueCardBundles()   (import from "../services/slackCardService.js")
app.ts:      app.use("/api/slack-links", requireAuth, slackLinksRouter)  — mount above the bare /api routers
```

### A4. Gate (orchestrator runs it after every phase, serially)

```bash
cd backend && npm run typecheck && npm test        # all standalone backend tests
cd .. && npm run build                              # CLAUDE.md requires the root build after every phase
```
Pipe each command through `tail -n 60` to keep context small. A phase is done only when the whole gate is green, or matches the baseline from A1.2.

### A5. Receipt format (subagent's final message, at most 20 lines)

```
Phase: Pxx — <title>
Status: DONE | BLOCKED
Files: <created/edited paths>
Tests: <commands run> → <pass/fail counts>
Typecheck: clean | errors only in <files not mine>
Registration: <lines for §A3 files, or "none">
Manifest needs: <scopes/events/shortcuts, or "none">
Deviations: <anything that differs from the brief, and why>
Blocked: <files outside scope you needed, or "none">
```

### A6. Commits

Constellation patch notes are built from commit subjects (`docs/PATCH-NOTES.md`). `feat`/`fix`/`perf` subjects reach members.
- Refactors, schema-only changes, pure view builders and tests: `refactor(slack): …`, `chore(slack): …` or `test(slack): …`. These never become patch notes.
- A phase that members can use after deploy: a `feat(slack): …` subject written for members, e.g. `feat(slack): tag @Constellation to attach tasks, CAD parts, PRs and Drive files to a message`.

---

## §B — Locked decisions (do not re-litigate)

| ID | Decision |
|---|---|
| L1 | Bot display name and bot user become **Constellation**. One command, **`/c`**, plus `/constellation` as the long alias. `/pm` stays as a legacy alias into the same router. `/lab` stays (it is missing from the manifest today; P03 adds it). |
| L2 | **Task creation:** `/c task <sentence>` → AI draft as an ephemeral card (Create · Edit details… · Use existing · Cancel). Bare `/c task`, buttons and shortcuts open the **full modal**: one modal with the basics shown, plus "+ section" buttons (Subtasks · Blockers & dependencies · Links & files · Milestone & tags · Estimate & repeat) that reveal sections through `views.update`. A "Draft details with AI" button fills description and acceptance criteria. Edit mode uses the same modal. |
| L3 | **@Constellation is intent-aware.** A mention with no verb opens the attach checklist. Keyword fast path: `make (this )?(a )?task` / `task` → task draft; `plan …` → plan modal button; `summari[sz]e` → private thread summary; `blocked on …` / `blocker …` → attach-blocker form; text ending in `?` → private answer with sources. Otherwise one Gemini call classifies the intent and returns recommendations. Every non-attach reply ends with "Not what you meant? [Attach items instead]". |
| L4 | **Attach picker:** an ephemeral message in the thread of the tagged message. Grouped checkboxes: Tasks · CAD vault · GitHub · Drive · Milestones. AI picks are pre-ticked, each with a reason of 75 characters or fewer. Buttons: Attach N · Search for more… (typeahead modal) · Dismiss. |
| L5 | **Display:** the bot posts one **context card as a thread reply** under the source message. Each item gets a row with a status pill and an overflow (Open · Mark done for tasks · Check out for vault · Unlink). There is one card per source message; attaching again updates it. Statuses update live. Every attachment is a `SlackItemLink` row, which powers a "Mentioned in Slack" section in Constellation. That section shows only to viewers who can read the conversation. |
| L6 | **Task cards never post to channels.** When someone is added as an assignee (not by themselves), they get a **DM bundle**: 10-minute debounce, capped at 15 minutes after the first queued card. One DM message per bundle, so one ping. Up to 5 full live cards; any extra tasks as compact lines plus "Open my work". Cards re-render in place (`chat.update`, silent) whenever the task changes. Follows the member's `notificationChannels.TASK_ASSIGNED`: if Slack is off for that type, no card. |
| L7 | **Live task card:** header = title. Fields: Status, Assignees, Due (with relative days), Priority, Milestone, Subtasks progress. Context: blockers/dependencies summary, logged time, Open link. Actions: status `static_select`, Mark done, Assign me (hidden for current assignees), Log time, and a **"More" `static_select`**: Edit · Add subtask · Add blocker · Add dependency · Comment · AI enrich · Suggest deadline · Archive. (An overflow menu holds at most 5 options, so "More" is a select.) |
| L8 | **Action plan:** a **private modal** that uses the shared-plan layout. Each action is a row: bold "n · Type" + summary, rationale as context, state line (✓ Accepted / Skipped / Edited), and Accept · Skip · Edit buttons. Edit pushes a per-type form. Bottom row: Accept all · Discard. The modal submit is "Run N accepted"; results then replace the row buttons. State lives in a `SlackPlanSession` row, not `private_metadata`. Triggers: `/c plan <goal>`, @Constellation plan, the "Plan from thread" shortcut, and the Home "Plan" button. |
| L9 | **App Home** has tabs: **My work · Projects · Files · Calendar**. Files tab: project picker, then **Drive** (folder link + recent files), **GitHub** (repos, open PRs/issues, recent links), **Vault** (my checkouts, CRs waiting on me, latest release). Calendar: upcoming events with RSVP, open polls with Vote. The last tab is remembered in memory only. |
| L10 | **Message shortcuts:** Create task · Attach items · Plan from thread · Add to task. |
| L11 | **Vault:** `/c vault <q>` search (same access rule as `searchVault`). Item cards: Open · Check out / Undo checkout · Watch. CR cards: Approve / Reject (admin only, with a note modal) · Sign off / Revoke. Vault notifications arrive as Block Kit cards. **DM check-in:** a member shares a CAD file in the DM with Constellation, gets a card with the guessed item, confirms in a modal (item + required change note), and `enqueueVaultUpload` runs; job progress updates the card in place. GitHub-backed vaults only. |
| L12 | **Events:** RSVP buttons copy the web's meaning: an `EventRsvp` upsert means going, and "Cancel RSVP" deletes your own row. No "Maybe" (that would need a schema change the web does not use). **Poll voting** modal: one checkbox group per local day (split at 10 slots), pre-filled with your current response, a "Use my usual availability" button, and "Open full grid ↗". The poll invite DM becomes a card with [Fill in availability]. **No** event reminders. **No** rebuild of the event-create modal. |
| L13 | **Unfurls** for Constellation links (task, vault item, CR, event, project): a compact preview (title, status pill, 2–3 facts, Open + one action) only when the entity's project is linked to that channel. Otherwise a generic "Constellation · Task" line with Open. |
| L14 | Slack paths call the **same service functions and permission checks** as REST: `taskMutationService`, `vaultCheckoutService`, `changeRequestService`, `vaultPrReviewService`, `aiActionService.executeActionPlan`, `pollService.upsertResponse`, `eventRsvpService`. Slack handlers never write task/vault/event rows with Prisma directly (a static test enforces it). |
| L15 | Gemini sees only content a member explicitly tagged or ran a shortcut on: the message, plus its thread when the intent needs it. Model output names candidates by short keys (`c1…cN`); ids are mapped back and never trusted from the model. |
| L16 | Slack's assignment DMs go through `createNotification` (Slack portal invariant 10). The direct `queueDm` in `new_task_submit` is removed. Creating a task now notifies added assignees from **every** path (web, Slack, AI plan). This is an intentional web behaviour change: today only PATCH notifies. |
| L17 | Mentions in conversations the bot is not in: if the portal's user-token events show a message containing `<@BOT_ID>` in such a conversation, DM the author: "Invite me with /invite @Constellation to use me there." |

---

## §C — Architecture and contracts

### C1. New Prisma schema (paste into `schema.prisma` in P02)

```prisma
enum SlackEntityType {
  TASK
  VAULT_ITEM
  CHANGE_REQUEST
  GITHUB
  DRIVE_FILE
  MILESTONE
  EVENT
  MEETING_POLL
}

enum SlackCardKind {
  TASK_BUNDLE
  LINK_CARD
  VAULT_NOTICE
  POLL_INVITE
  CHECKIN
}

/// Durable queue for DM card bundles (L6). One row per (recipient, entity, reason) waiting to send.
model SlackCardQueue {
  id          String            @id @default(cuid())
  recipientId String
  recipient   Member            @relation("SlackCardQueueRecipient", fields: [recipientId], references: [id], onDelete: Cascade)
  entityType  SlackEntityType
  entityId    String
  reason      String            // "ASSIGNED" | "POLL_INVITE" | "VAULT" …
  actorId     String?
  queuedAt    DateTime          @default(now())
  sentAt      DateTime?
  messageId   String?
  message     SlackCardMessage? @relation(fields: [messageId], references: [id], onDelete: SetNull)

  @@index([sentAt, recipientId])
  @@index([entityType, entityId])
}

/// A bot message whose blocks render live Constellation state. Re-rendered on change.
model SlackCardMessage {
  id             String           @id @default(cuid())
  kind           SlackCardKind
  slackChannelId String
  ts             String
  threadTs       String?
  /// DM bundles: the member it was sent to (buttons depend on the viewer).
  recipientId    String?
  /// LINK_CARD: ts of the member message the card annotates.
  sourceTs       String?
  createdAt      DateTime         @default(now())
  renderedAt     DateTime         @default(now())
  refs           SlackCardRef[]
  queued         SlackCardQueue[]

  @@unique([slackChannelId, ts])
  @@index([slackChannelId, sourceTs])
}

model SlackCardRef {
  id         String           @id @default(cuid())
  messageId  String
  message    SlackCardMessage @relation(fields: [messageId], references: [id], onDelete: Cascade)
  entityType SlackEntityType
  entityId   String
  position   Int

  @@unique([messageId, entityType, entityId])
  @@index([entityType, entityId])
}

/// A member attached a Constellation item to a Slack message (L5). Backs "Mentioned in Slack".
model SlackItemLink {
  id             String          @id @default(cuid())
  slackChannelId String
  messageTs      String
  threadTs       String?
  entityType     SlackEntityType
  /// TASK/VAULT_ITEM/CHANGE_REQUEST/MILESTONE/EVENT/MEETING_POLL: row id.
  /// GITHUB: GitHubLink.id when a row exists, else "owner/repo#123" or "owner/repo@sha".
  /// DRIVE_FILE: the Drive file id.
  entityId       String
  /// Title snapshot, shown if the entity is later deleted.
  label          String
  url            String?
  projectId      String?
  linkedById     String?
  linkedBy       Member?         @relation("SlackItemLinker", fields: [linkedById], references: [id], onDelete: SetNull)
  createdAt      DateTime        @default(now())

  @@unique([slackChannelId, messageTs, entityType, entityId])
  @@index([entityType, entityId])
}

/// One action-plan review in a Slack modal (L8).
model SlackPlanSession {
  id              String   @id @default(cuid())
  memberId        String
  member          Member   @relation("SlackPlanOwner", fields: [memberId], references: [id], onDelete: Cascade)
  projectId       String
  goal            String
  /// Normalized ActionPlan JSON (aiActionService.normalizeActionPlan output), edited in place.
  actionsJson     String   @db.Text
  /// { "<index>": "ACCEPTED" | "SKIPPED" | "EDITED" }
  decisions       Json     @default("{}")
  /// ActionExecutionResult[] after a run.
  resultsJson     Json?
  status          String   @default("OPEN") // OPEN | RUNNING | DONE | DISCARDED
  viewId          String?
  sourceChannelId String?
  sourceTs        String?
  createdAt       DateTime @default(now())
  expiresAt       DateTime

  @@index([memberId, status])
}
```
Add these back-relations to `model Member`:
```prisma
  slackCardQueue    SlackCardQueue[]   @relation("SlackCardQueueRecipient")
  slackItemLinks    SlackItemLink[]    @relation("SlackItemLinker")
  slackPlanSessions SlackPlanSession[] @relation("SlackPlanOwner")
```

### C2. File map

New backend files. `(P)` means pure (no Prisma, no Slack client), with a sibling `.test.ts`.

```
backend/src/services/
  taskMutationService.ts        P01, P08  — updateTaskAsMember, createTaskAsMember, addCommentAsMember, logTimeAsMember, notifyAddedAssignees
  taskChangeBus.ts              P14       — EventEmitter: emitTaskChanged(taskId | taskId[])
  slackCardCore.ts (P)          P09       — bundle window, bundle composition
  slackCardService.ts           P09, P14  — queue, flush, render, live refresh
  slackMentionCore.ts (P)       P05       — intent fast path, tokenizer, lexical scoring, AI-output normalizer, prompt builder
  slackMentionService.ts        P12       — candidate gathering + recommend()
  slackItemLinkService.ts       P12, P32  — create/unlink links, list backlinks with access filter
  slackPlanSessionService.ts    P22
  slackUnfurlCore.ts (P)        P06       — URL → entity ref
  projectAskService.ts          P21       — answer a question from buildProjectContext (moved out of api/projects.ts)
  vaultCheckoutService.ts       P07       — checkout / undo, moved out of api/vault.ts
  eventRsvpService.ts           P29
  slackHomeData.ts              P25       — data loaders for the Home tabs (2-min cache for GitHub)
backend/src/slack/
  mirror.ts                     P03 (orchestrator-owned afterwards)
  router.ts                     P03 (orchestrator-owned afterwards)
  views/common.ts (P)           P04       — limits, truncation, pills, links, member mention
  views/taskCard.ts (P)         P04
  views/taskModal.ts (P)        P10
  views/taskDraft.ts (P)        P18
  views/taskSmallModals.ts (P)  P16
  views/attachPicker.ts (P)     P19
  views/linkCard.ts (P)         P19
  views/planModal.ts (P)        P11
  views/home.ts (P)             P13
  views/homeFilesCalendar.ts (P) P13
  views/vaultCards.ts (P)       P26
  views/eventCards.ts (P)       P29
  views/pollModal.ts (P)        P30
  views/unfurl.ts (P)           P31
  handlers/taskCardActions.ts   P16
  handlers/taskModal.ts         P17
  handlers/quickAdd.ts          P18
  handlers/mentions.ts          P20
  handlers/mentionIntents.ts    P21
  handlers/plan.ts              P23
  handlers/shortcuts.ts         P24
  handlers/vault.ts             P26
  handlers/vaultCheckin.ts      P28
  handlers/calendar.ts          P29
  handlers/polls.ts             P30
  handlers/unfurls.ts           P31
backend/src/api/slackLinks.ts   P32
src/components/clubpm/SlackMentions.jsx   P33
```

### C3. Service contracts (signatures are binding; bodies are up to the phase)

```ts
// taskMutationService.ts
export type MutationSource = "WEB" | "SLACK" | "AI";
export class TaskMutationError extends Error { constructor(public status: number, message: string) { super(message); } }
export interface TaskPatch { title?: string; description?: string; status?: TaskStatus; progress?: TaskProgress; priority?: Priority;
  dueDate?: string | null; assigneeIds?: string[]; tags?: string[]; attachments?: { url: string; label?: string }[];
  parentTaskId?: string | null; blockingTaskIds?: string[]; blockingTaskReasons?: Record<string, string | null>; }
export interface MutationResult { task: any; actorReward: ActorRewardSummary | null; progressMilestones: ProgressMilestone[]; achievementUnlocks: AchievementUnlock[]; }
export async function updateTaskAsMember(actorId: string, taskId: string, patch: TaskPatch, source: MutationSource): Promise<MutationResult>;
export interface CreateTaskInput { projectId: string; title: string; description?: string; priority?: Priority; status?: TaskStatus;
  dueDate?: Date; assigneeIds?: string[]; parentTaskId?: string; milestoneId?: string; tagIds?: string[];
  estimatedHours?: number; storyPoints?: number; isRecurring?: boolean; recurrencePattern?: string; recurrenceEndDate?: Date;
  attachments?: { url: string; label?: string }[]; }
export async function createTaskAsMember(actorId: string | null, input: CreateTaskInput, source: MutationSource): Promise<any /* task with assignees */>;
export async function addCommentAsMember(actorId: string, taskId: string, content: string, opts: { parentId?: string | null; source: MutationSource }): Promise<any>;
export async function logTimeAsMember(actorId: string, taskId: string, minutes: number, note: string | undefined, source: "WEB" | "SLACK"): Promise<any>;
export async function notifyAddedAssignees(opts: { taskId: string; actorId: string | null; addedAssigneeIds: string[] }): Promise<void>;

// slackCardService.ts
export async function queueCard(opts: { recipientId: string; entityType: SlackEntityType; entityId: string; reason: string; actorId?: string | null }): Promise<void>;
export async function flushDueCardBundles(now?: Date): Promise<number>;           // cron, every minute
export function refreshCardsSoon(entityType: SlackEntityType, entityId: string): void; // 5 s debounce per message
export async function postLinkCard(opts: { channelId: string; sourceTs: string; threadTs: string; linkerId: string }): Promise<void>; // create or update the L5 card

// slackMentionService.ts
export interface Candidate { key: string; kind: "TASK" | "VAULT_ITEM" | "GITHUB" | "DRIVE_FILE" | "MILESTONE"; id: string; title: string; meta: string; url?: string; projectId: string; updatedAt?: Date }
export interface Recommendation { intent: "ATTACH" | "TASK" | "PLAN" | "ASK" | "SUMMARIZE" | "BLOCKER"; intentArg: string | null;
  picks: { candidate: Candidate; reason: string; confidence: number }[]; aiUsed: boolean }
export async function gatherCandidates(memberId: string, projectIds: string[]): Promise<Candidate[]>;
export async function recommend(opts: { memberId: string; projectIds: string[]; text: string; threadText?: string }): Promise<Recommendation>;

// slackItemLinkService.ts
export async function linkItems(opts: { channelId: string; messageTs: string; threadTs: string | null; linkerId: string; items: Candidate[] }): Promise<number>;
export async function unlinkItem(linkId: string, actorId: string): Promise<void>;     // linker or admin
export async function listBacklinks(viewerId: string, entityType: SlackEntityType, entityId: string): Promise<BacklinkDto[]>;

// slackPlanSessionService.ts
export async function startSession(opts: { memberId: string; projectId: string; goal: string; threadText?: string; source?: { channelId: string; ts: string } }): Promise<SlackPlanSession>;
export async function setDecision(sessionId: string, memberId: string, index: number, decision: "ACCEPTED" | "SKIPPED"): Promise<SlackPlanSession>;
export async function acceptAll(sessionId: string, memberId: string): Promise<SlackPlanSession>;
export async function editAction(sessionId: string, memberId: string, index: number, params: Record<string, unknown>, targetTaskId?: string | null): Promise<SlackPlanSession>;
export async function runAccepted(sessionId: string, memberId: string): Promise<{ session: SlackPlanSession; results: ActionExecutionResult[] }>;
export async function discard(sessionId: string, memberId: string): Promise<void>;

// vaultCheckoutService.ts
export class VaultCheckoutError extends Error { constructor(public status: number, message: string, public holder?: unknown) { super(message); } }
export async function checkoutItem(memberId: string, itemId: string, opts: { note?: string; force?: boolean; source: "WEB" | "SLACK" }): Promise<any>;
export async function undoCheckout(memberId: string, itemId: string, source: "WEB" | "SLACK"): Promise<any>;

// eventRsvpService.ts
export async function setMemberRsvp(eventId: string, memberId: string, going: boolean): Promise<{ going: boolean; count: number }>;
export async function getMemberRsvps(memberId: string, eventIds: string[]): Promise<Set<string>>;

// projectAskService.ts
export async function askProject(projectId: string, question: string, memberId: string | null): Promise<string | null>;
```

### C4. Slack platform limits and patterns (do not re-research)

- Blocks: a message holds at most **50**; a modal or Home tab at most **100**. `views/common.ts` exports `assertBlockBudget(blocks, max)`, and every builder test calls it.
- Text limits: section text 3000 · header 150 · button text 75 · option text 75 · option description 75 · fields at most 10 per section · button `value` 2000 · `private_metadata` 3000 · modal title/submit/close 24.
- `static_select` holds at most 100 options; `checkboxes`/`radio_buttons` at most 10; `overflow` 2–5.
- `trigger_id` is valid for **3 s**. Pattern: `const { view } = await client.views.open({ trigger_id, view: loadingView(title) })`, then do the work, then `client.views.update({ view_id: view.id, hash: view.hash, view: real })`.
- `views.update` keeps typed input when `block_id` and `action_id` stay the same. Always pass `hash`.
- `views.push` stacks at most 3 views. Plan "Edit" pushes one level. On the pushed view's submit, update the root view with `views.update({ view_id: rootViewId })`.
- Ephemeral messages cannot be edited with `chat.update`. Change them with `respond({ replace_original: true, … })` from the interaction's `response_url`.
- `chat.postEphemeral({ channel, user, thread_ts, blocks, text })` needs the bot in the channel. The bot is in every public channel (portal auto-join); for private ones, see L17.
- External selects (`external_select`, `multi_external_select`) need `app.options("<action_id>", …)` handlers; set `min_query_length: 0` so AI prefills show at once.
- `users_select` returns Slack user ids. Map them to members. Reject non-members with `ack({ response_action: "errors", errors: { <block_id>: "…" } })`.
- Message shortcut payload (`app.shortcut({ callback_id, type: "message_action" })`) carries `trigger_id`, `message`, `channel`, `response_url`.
- Unfurls: `app.event("link_shared")` → `client.chat.unfurl({ channel, ts, unfurls: { [url]: { blocks } } })`. Needs the `links:read` and `links:write` bot scopes and the `purduesearch.org` unfurl domain.
- Rate: about 1 post per second per channel. `refreshCardsSoon` debounces 5 s per message and skips messages rendered in the last 3 s.
- Deep links (backend uses `FRONTEND_URL`): task `${FRONTEND_URL}/clubpm/projects/${projectId}?task=${taskId}`; vault: reuse `vaultLink()` (`rg "export function vaultLink" backend/src`); project `${FRONTEND_URL}/clubpm/projects/${projectId}`. For events, check how the frontend reads its event deep link: `rg "searchParams.get\(\"event" src/pages/ClubPM`.

### C5. View specs (what each builder must render)

**Task card (L7)**, `buildTaskCardBlocks(task, viewer)` with `viewer = { memberId, isAssignee, canEdit }`:
```
header         : task.title (≤150)
section.fields : *Status* <pill>          | *Assignees* <@slack> <@slack> (else display names)
                 *Due* Fri, Oct 17 · in 8 days (overdue → "3 days overdue")   | *Priority* <dot> High
                 *Milestone* CDR · Nov 14 (omit if none) | *Subtasks* ■■□□□□ 1 of 3 (omit if none)
context        : "Blocked by 2 tasks" | "Blocked: Order delays" | "Not blocked" · "2h 30m logged" · <Open in Constellation|url>
actions        : static_select status (action_id "tc_status", initial = current)
                 button "Mark done" primary (tc_done) — omitted when DONE
                 button "Assign me" (tc_assign_me) — omitted when viewer.isAssignee
                 button "Log time" (tc_log_time)
                 static_select placeholder "More" (tc_more): edit, subtask, blocker, dependency, comment, enrich, deadline, archive
every action value: JSON {"t": taskId}
```
Status pills use colored-dot emoji text: TODO `:white_circle: To do`, IN_PROGRESS `:large_blue_circle: In progress`, BLOCKED `:red_circle: Blocked`, DONE `:large_green_circle: Done`. Priority dots: LOW `:large_green_circle:`, MEDIUM `:large_yellow_circle:`, HIGH `:large_orange_circle:`, CRITICAL `:red_circle:`.

**DM bundle (L6)**, `buildTaskBundle(recipient, items[])`: section "*<Actor> assigned you N task(s)*" (several actors → "You have N new tasks"), divider, then up to 5 task cards separated by dividers. Any extra tasks become one section of compact lines ("• <title> · due Fri · <Open|url>") plus a button "Open my work" linking to `${FRONTEND_URL}/clubpm`. Plain `text` fallback: "N new tasks assigned to you". Stays within 50 blocks.

**Attach picker (L4)**, `buildAttachPicker(rec, ctx)`: section "I read your message. Pick what to attach:"; then for each non-empty kind, a context-styled group label (TASKS / CAD VAULT / GITHUB / DRIVE / MILESTONES) and one `checkboxes` block (block_id `ap_<kind>`, at most 5 options). Option text = title · status (≤75), description = reason (≤75), `initial_options` = AI picks with confidence ≥ 0.5. Actions: "Attach" primary (`ap_attach`, value = pickerId), "Search for more…" (`ap_search`), "Dismiss" (`ap_dismiss`). The picker state (candidates by key, source channel/ts/thread) lives in an in-memory map keyed by `pickerId` with a 30-minute TTL. If the entry is gone, reply "This picker expired — tag @Constellation again."

**Link card (L5)**, `buildLinkCard(items[])`: per item, one section with mrkdwn `"<kindEmoji> *<url|title>*\n<pill> · <meta>"` and an `overflow` accessory (`lc_item`, value `{"l": linkId, "a": "open|done|checkout|unlink"}`; Open is a url option). Closing context: "Linked by <@user> · statuses update live". Kind emoji: TASK `:white_check_mark:`, VAULT_ITEM `:gear:`, GITHUB `:octocat:` (fallback `:link:` if the workspace lacks it), DRIVE_FILE `:page_facing_up:`, MILESTONE `:dart:`.

**Plan modal (L8)**, `buildPlanModal(session, ctx)`: title "Action plan"; callback_id `plan_run`; submit "Run N accepted" (with no accepted actions, omit `submit`, so only Close shows); `private_metadata` = sessionId. Blocks: context "Goal: …" · divider · per action: section "*n · <Type label>* <summary>\n_<rationale>_" (rationale ≤ 300 chars), context state line, and an actions block (`plan_accept`/`plan_skip`/`plan_edit`, value `{"s":sessionId,"i":index}`), with the chosen button styled `primary`. After all actions: actions block "Accept all" (`plan_accept_all`) and "Discard" (`plan_discard`, style danger, with a `confirm` dialog). After a run, each row's actions block becomes a context "✓ Done" / "✕ <error>". Budget: 3 blocks per action + 4, so cap at 30 actions; beyond 30, show the first 30 and a context line "+N more — open in Constellation".

**Home tabs (L9)**: first block is an actions row of 4 buttons (`home_tab`, value `mywork|projects|files|calendar`); the active tab is styled `primary`. Second block: context summary. Each tab stays within 100 blocks.

---

## §D — Waves

| Wave | Phases (∥ = parallel-safe, → = run in order) |
|---|---|
| 1 | ∥ P01, P02, P03, P04, P05, P06, P07 |
| 2 | → P08 · then ∥ P09, P10, P11, P12, P13 |
| 3 | → P14 → P15 → P16 → P17 → P18 |
| 4 | → P19 → P20 → P22 → P23 → P21 → P24 |
| 5 | → P25 · ∥ P26, P29 · → P27 → P28 → P30 → P31 |
| 6 | → P32 → P33 → P34 → P35 → P36 · **STOP** P37 (human) |

Inside a wave, any phase that edits an existing file (not only new files) is listed with →, so two subagents never edit the same file at once.

---

## §P — Phase briefs

### P01 — Extract `updateTaskAsMember` from the REST PATCH route
**Mode:** parallel-safe (only these files). **Depends:** none.
**Read:** `backend/src/api/tasks.ts`: the range from anchor `tasksRouter.patch("/:id", channelAuth` to the `GET /api/tasks/:id` comment (about 300 lines), plus the import block at the top. `backend/src/services/taskService.ts`: `rg -n "export async function (updateTask|getTask)|export function assert"`.
**Create:** `backend/src/services/taskMutationService.ts`, `backend/src/services/taskMutationService.test.ts`. **Edit:** `backend/src/api/tasks.ts` (the PATCH route only).
**Do:**
1. Move the whole PATCH body into `updateTaskAsMember(actorId, taskId, patch, source)` (contract in §C3). Keep every behaviour: permission check via `getTaskPermissions`, `assertNotCategoryBlocked`, `assertCanComplete`, `assertCiGatePasses`, the `updateTask` call, audit log, streak tick, TASK_ASSIGNED notifications, milestone health refresh, `applyCompletionSideEffects`, challenge hooks and achievement-unlock lookup.
2. Replace each `res.status(n).json({ error })` with `throw new TaskMutationError(n, error)`. Map the "circular" error to 400 as today.
3. Use `source` wherever the route hard-codes `"WEB"` in `logAuditEvent`.
4. The route becomes: parse body → `updateTaskAsMember(req.memberId!, id, body, "WEB")` → spread `task` and add `actorReward` / `progressMilestones` / `achievementUnlocks` exactly as before (keep the same response keys). Catch `TaskMutationError` → `res.status(e.status).json({ error: e.message })`.
5. Test (source inspection, no DB): read `api/tasks.ts` as text and assert the PATCH route no longer contains `assertCanComplete(` or `applyCompletionSideEffects(`; read `taskMutationService.ts` and assert it contains both. Also assert `TaskMutationError` keeps `status`.
**Gate:** `npx tsx src/services/taskMutationService.test.ts`, `npm run typecheck`.
**Commit:** `refactor(tasks): move task update rules into taskMutationService`.

### P02 — Schema and migration
**Mode:** parallel-safe. **Depends:** none.
**Read:** `backend/prisma/schema.prisma`: `rg -n "^model Member \{" -A 5` and the closing `}` of `Member` only; the end of the file. `ls backend/prisma/migrations | tail -3` to copy the naming style.
**Edit:** `backend/prisma/schema.prisma`. **Create:** `backend/prisma/migrations/20261009120000_slack_mirror/migration.sql`. **Edit:** `backend/prisma/AGENTS.md`.
**Do:**
1. Append §C1 at the end of the schema. Add the three back-relations inside `model Member`.
2. Generate the SQL without a database:
   ```bash
   cd backend
   git show HEAD:backend/prisma/schema.prisma > "$TMPDIR/old.prisma"
   npx prisma migrate diff --from-schema-datamodel "$TMPDIR/old.prisma" --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/20261009120000_slack_mirror/migration.sql
   npx prisma generate
   ```
   On Windows, use the scratch directory the agent was given in place of `$TMPDIR`. The SQL must contain only `CREATE TYPE`, `CREATE TABLE`, `CREATE INDEX` and `ALTER TABLE … ADD CONSTRAINT`. If it contains any `DROP` or `ALTER COLUMN`, stop and report: the schema drifted.
3. In `backend/prisma/AGENTS.md`, add one sentence to the model list: the five Slack mirror models, and "`SlackItemLink` rows are member-visible backlinks; list them only through `slackItemLinkService.listBacklinks`, which applies conversation access."
**Gate:** `npx prisma validate`, `npm run typecheck`.
**Commit:** `chore(db): add Slack mirror card, link and plan-session tables`.

### P03 — Identity, manifest, `/c` router, registry
**Mode:** parallel-safe. **Depends:** none. After this phase, `mirror.ts`, `router.ts`, `bolt.ts` and `slack-manifest.yaml` are orchestrator-owned.
**Read:** `slack-manifest.yaml` (full). `backend/src/slack/bolt.ts` (full). `backend/src/slack/commands.ts`: anchor `app.command("/pm"` through the end of its `switch` (about 270 lines). `backend/src/utils/blockKit.ts`: `rg -n "export function buildHelpCard" -A 60`.
**Create:** `backend/src/slack/router.ts`, `backend/src/slack/mirror.ts`. **Edit:** `backend/src/slack/commands.ts`, `backend/src/slack/bolt.ts`, `slack-manifest.yaml`, `backend/src/utils/blockKit.ts` (help card only).
That is 6 files, but four of them get small edits. This phase is allowed to exceed the 4-file rule.
**Do:**
1. In `commands.ts`, move the `/pm` switch body into `export async function runLegacyPm(args: string[], command, respond, client)`. `/pm` calls it.
2. `router.ts`:
   ```ts
   export type CmdCtx = { args: string[]; text: string; command: SlashCommand; respond: RespondFn; client: WebClient; ack?: never };
   export type CmdHandler = (ctx: CmdCtx) => Promise<void>;
   export const SUBCOMMANDS: Record<string, CmdHandler> = { /* filled by later phases through Registration */ };
   export function registerRouter(app: App): void // registers "/c" and "/constellation": ack(); subcommand = args[0]
   // dispatch: SUBCOMMANDS[sub] ?? (sub === "help" || !sub ? sendHelp : fallback to runLegacyPm(args, …))
   ```
3. `mirror.ts`: `export function registerMirror(app: App): void { registerRouter(app); }`. `bolt.ts`: call `registerMirror(boltApp)` after the existing `register*` calls.
4. `buildHelpCard()`: rewrite for `/c`. Sections: Tasks (`/c task …`, `/c find <q>`), Plans (`/c plan <goal>`), CAD (`/c vault <q>`), Lab (`/lab in|out|who`), Tag @Constellation (attach · make a task · plan · ask · summarize), Shortcuts (⋯ on any message). Last line: "Old /pm commands still work."
5. Manifest:
   - `display_information.name` and `bot_user.display_name` → `Constellation`; description "Constellation, inside Slack".
   - `slash_commands`: `/c` (usage hint `task | plan | vault | find | help`), `/constellation` (same), `/pm` (legacy), `/lab` (`in | out | who | status`). All `should_escape: false`.
   - `features.app_home`: `home_tab_enabled: true`, `messages_tab_enabled: true`, `messages_tab_read_only_enabled: false`.
   - `features.shortcuts` (type `message`): callback_ids `sc_create_task` "Create task", `sc_attach_items` "Attach Constellation items", `sc_plan_thread` "Plan from this thread", `sc_add_to_task` "Add to task". Descriptions ≤ 80 characters.
   - `features.unfurl_domains: [purduesearch.org]`.
   - Bot scopes add: `app_mentions:read`, `links:read`, `links:write`, `im:history`, `im:read`.
   - `bot_events` add: `app_mention`, `link_shared`, `message.im`, `app_home_opened`.
   - Leave `user` scopes and `user_events` unchanged (they must keep matching `SLACK_USER_SCOPES`).
**Gate:** `npm run typecheck`. Manual check: `/pm help` still routes to the legacy path in code.
**Commit:** `feat(slack): the Slack app is now Constellation, with one /c command`.

### P04 — Common view helpers and the live task card
**Mode:** parallel-safe. **Depends:** none (types come from `@prisma/client` and `@slack/bolt`).
**Read:** `backend/src/utils/blockKit.ts`: `rg -n "^import|KnownBlock" | head` (types only). `backend/src/services/slackPings.test.ts` (first 30 lines, for test style).
**Create:** `backend/src/slack/views/common.ts`, `backend/src/slack/views/taskCard.ts`, `backend/src/slack/views/taskCard.test.ts`.
**Do:**
1. `common.ts` exports: `LIMITS` (§C4 numbers); `trunc(s, n)` (adds an ellipsis); `assertBlockBudget(blocks, max)` (throws); `statusPill(status)`; `priorityDot(p)`; `relativeDue(due, now)` ("in 8 days", "today", "3 days overdue"); `progressBar(done, total, width=6)`; `memberRef(m)` (`<@slackId>`, else the display name); `taskUrl(projectId, taskId)` / `projectUrl(id)` from `process.env.FRONTEND_URL ?? "http://localhost:3000"`; `loadingView(title)` (a modal with one section ":hourglass_flowing_sand: Working on it…").
2. `taskCard.ts`: `export type CardTask` (fields the card needs: id, title, status, priority, dueDate, projectId, project{name}, assignees{id,slackId,displayName}[], milestone{title,dueDate}|null, subtaskCounts{done,total}, blockedByOpen:number, categoryBlockers:string[], loggedMinutes:number). `buildTaskCardBlocks(task, viewer, now)` per §C5. `buildTaskBundle(recipientName, actorNames, tasks, viewerFor, now)` per §C5. `buildCompactTaskLine(task)`. Keep these builders pure: the database loader `loadCardTask` belongs to P09's service, not here.
3. Tests: card for TODO/DONE (no "Mark done" when DONE), Assign me hidden for an assignee, an overdue phrase, a 120-character title truncated in the header, a bundle of 7 tasks → 5 cards + a compact section and ≤ 50 blocks, every `action_id` unique per card.
**Gate:** `npx tsx src/slack/views/taskCard.test.ts`, `npm run typecheck`.
**Commit:** `refactor(slack): Block Kit helpers and live task card builder`.

### P05 — `slackMentionCore` (pure)
**Mode:** parallel-safe. **Depends:** none.
**Read:** `backend/src/services/vaultSearchCore.ts`: `rg -n "export function tokenize" -A 30` (reuse its joined-form idea; do not import it if it pulls in Prisma).
**Create:** `backend/src/services/slackMentionCore.ts`, `backend/src/services/slackMentionCore.test.ts`.
**Do:**
1. `stripMention(text, botUserId)` removes `<@BOT>` and trims.
2. `fastIntent(text): { intent, arg } | null` implements L3's keyword rules (case-insensitive, at the start of the stripped text). An empty string → `{ intent: "ATTACH", arg: null }`. No match → `null`.
3. `tokenize(text)`: lowercase words ≥ 2 characters, minus a small stopword list. Adds joined forms (`prt-0012` → `prt0012`). Extracts PR/issue refs `#\d+` and part numbers `[A-Z]{2,5}-\d{2,6}`.
4. `scoreCandidates(textTokens, candidates, now)` → sorted `{ key, score }`. Score = IDF-weighted token overlap with the title (×2) and meta (×1), +5 for an exact part number, +5 for a PR number match, a small recency bonus (≤ 1), and 0 when there is no overlap. Return at most 20 per kind and 60 in total.
5. `buildRecommendPrompt({ text, threadText, candidates })`: candidate lines `cN | KIND | title | meta`. Ask for JSON `{"intent":"ATTACH|TASK|PLAN|ASK|SUMMARIZE|BLOCKER","intentArg":string|null,"picks":[{"k":"cN","reason":"<=60 chars","confidence":0..1}]}`. Rules in the prompt: pick only items the message actually refers to; at most 8 picks; reasons quote the matching words.
6. `normalizeAiPicks(raw, candidatesByKey)`: drop unknown keys and duplicates, clamp confidence to 0–1, truncate reasons to 75, keep at most 8, and coerce an unknown intent to `ATTACH`.
7. `lexicalFallback(scored, candidatesByKey)`: top 5 with score ≥ 2 and the reason `Matches "<top overlapping words>"`.
8. Tests cover each function, including an AI response that invents the key `c999` (dropped) and the fast-path phrases from L3.
**Gate:** `npx tsx src/services/slackMentionCore.test.ts`.
**Commit:** `refactor(slack): intent and recommendation core for @Constellation`.

### P06 — `slackUnfurlCore` (pure)
**Mode:** parallel-safe. **Depends:** none.
**Read:** `rg -n "export function vaultLink" -A 15 backend/src`. `rg -n "searchParams.get\(\"(task|vaultItem|vaultCr|event|tab)\"" src/pages/ClubPM` (find the frontend's deep-link params).
**Create:** `backend/src/services/slackUnfurlCore.ts`, `backend/src/services/slackUnfurlCore.test.ts`.
**Do:** `parseConstellationUrl(url, frontendOrigins: string[]): EntityRef | null`, where `EntityRef = { type: SlackEntityType; id: string; projectId?: string }`. Accept origins from `FRONTEND_URL` plus `https://purduesearch.org`. Recognize: project (`/clubpm/projects/:id`), task (`?task=`), vault item (`vaultItem=`), CR (`vaultCr=`), and event/poll pages (use the params you found; if events have no deep link, return a project ref or `null`). Tests use one URL per kind, plus a foreign host and a malformed URL.
**Gate:** own test.
**Commit:** `refactor(slack): parse Constellation links for unfurls`.

### P07 — Extract `vaultCheckoutService`
**Mode:** parallel-safe. **Depends:** none.
**Read:** `backend/src/api/vault.ts`: anchors `vaultRouter.post("/vault/items/:id/checkout"` and `vaultRouter.delete("/vault/items/:id/checkout"` (both whole routes), plus the import block.
**Create:** `backend/src/services/vaultCheckoutService.ts`. **Edit:** `backend/src/api/vault.ts` (those two routes only).
**Do:** Move both bodies into `checkoutItem` / `undoCheckout` (§C3). Keep conflict notifications, `autoWatchSoon`, `reindexItemSoon` and the audit events. Use `source` in `logAuditEvent`. Throw `VaultCheckoutError(409, …, holder)` where the route returned 409 with `holder`. The routes become thin wrappers with identical responses.
**Gate:** `npm run typecheck`, `npx tsx src/services/vaultService.test.ts`.
**Commit:** `refactor(vault): move checkout rules into vaultCheckoutService`.

### P08 — Task create, comment, time log and assignee notifications through the mutation service
**Mode:** sequential. **Depends:** P01.
**Read:** `backend/src/services/taskMutationService.ts` (full). `backend/src/api/projects.ts`: anchor `projectsRouter.post("/:id/tasks"` (whole route). `backend/src/api/tasks.ts`: anchors `tasksRouter.post("/:id/comments", requireAuth, channelAuth` (whole route, about 125 lines) and `tasksRouter.post("/:id/time-logs"`. `backend/src/services/aiActionService.ts`: `rg -n "async function dispatchAction" -A 120` (find the `CREATE_TASK` and `ASSIGN` branches).
**Edit:** `taskMutationService.ts`, `api/projects.ts`, `api/tasks.ts`, `services/aiActionService.ts`.
**Do:**
1. `notifyAddedAssignees({ taskId, actorId, addedAssigneeIds })`: for each id ≠ actor, call `createNotification({ type: "TASK_ASSIGNED", …, message, slackText })`, using the same text as the PATCH path. P14 later adds the card. Make `updateTaskAsMember` use this helper too, so there is one implementation.
2. `createTaskAsMember`: `createTask` + milestone refresh + `TASK_CREATED` audit (with `source`) + `notifyAddedAssignees` (L16) + `emit` hook placeholder (a comment `// P14: emitTaskChanged`). Attachments go through the same `normaliseAttachments` (move it from `tasks.ts` into the service and import it back).
3. `addCommentAsMember`: move the comments-route body (mention parsing, notifications, challenge hooks, audit). The route becomes a wrapper.
4. `logTimeAsMember`: check `getTaskPermissions(actor, task).canEdit` (REST gets this from `requireTaskEdit`), then `recordTimeLog({ …, source })`.
5. `projects.ts` POST tasks → `createTaskAsMember(req.memberId ?? null, …, "WEB")`. Keep the response, and keep the 400 mapping for `Invalid …` / `year out of range`.
6. `aiActionService` `CREATE_TASK` → `createTaskAsMember(memberId, …, "AI")`. `ASSIGN` and `UPDATE_TASK` with `assigneeIds` → after the update, call `notifyAddedAssignees` with the added ids. Do not change its permission checks.
**Gate:** `npm run typecheck`, `npm test`.
**Commit:** `feat(tasks): assignees are notified when a task is created with them, from anywhere`.

### P09 — Card queue, bundles, rendering, live refresh
**Mode:** parallel-safe (new files only). **Depends:** P02, P04.
**Read:** `backend/src/slack/views/taskCard.ts` (full). `backend/src/services/dmBatcher.ts` (full; 136 lines). `backend/src/services/projectContextService.ts`: `rg -n "blockedByOpenDependencies|activeCategoryBlockers" -B 3 -A 10` (copy how open blockers are computed).
**Create:** `backend/src/services/slackCardCore.ts`, `backend/src/services/slackCardCore.test.ts`, `backend/src/services/slackCardService.ts`.
**Do:**
1. Core:
   ```ts
   export const BUNDLE_QUIET_MS = 10 * 60_000;
   export const BUNDLE_MAX_WAIT_MS = 15 * 60_000;
   export function bundleIsDue(rows: { queuedAt: Date }[], now: Date): boolean {
     if (rows.length === 0) return false;
     const t = rows.map(r => r.queuedAt.getTime());
     return now.getTime() - Math.max(...t) >= BUNDLE_QUIET_MS || now.getTime() - Math.min(...t) >= BUNDLE_MAX_WAIT_MS;
   }
   export function planBundles(rows: QueueRow[], now: Date): { recipientId: string; rowIds: string[]; entityIds: string[] }[]; // group by recipient + kind, dedupe entityId, keep queue order
   ```
   Tests: quiet window, hard cap, dedupe, grouping by recipient.
2. Service:
   - `queueCard(…)` inserts a `SlackCardQueue` row.
   - `flushDueCardBundles(now)`: load unsent rows, `planBundles`, and for each bundle: load the tasks with `loadCardTask`; drop tasks that are deleted, archived, or no longer assigned to the recipient; if none remain, mark the rows sent with `messageId = null`. Otherwise `conversations.open({ users: slackId })` → `chat.postMessage({ blocks: buildTaskBundle(…), text })` → create `SlackCardMessage(kind TASK_BUNDLE)` + `SlackCardRef`s → mark the rows sent. Use the bot client: `import { boltApp } from "../slack/bolt.js"` **lazily inside the function** to avoid an import cycle.
   - `loadCardTask(taskId)` → `CardTask` in one query (assignees, project name, milestone, subtask counts, open dependency count, active category blocker labels, sum of `TimeLog` minutes).
   - `refreshCardsSoon(type, id)`: per-message debounce of 5 s through an in-memory `Map<messageId, Timeout>`. On fire, re-render the whole message from its refs (`TASK_BUNDLE` → `buildTaskBundle`; `LINK_CARD` → P19's builder, behind a `renderers` registry `registerCardRenderer(kind, fn)` so later phases plug in without editing this file) and call `chat.update`. Swallow `message_not_found` by deleting the row.
   - `postLinkCard` is a stub that throws `Error("P20")`; P20 implements it in its own file through `registerCardRenderer`.
**Registration:** scheduler cron `* * * * *` → `flushDueCardBundles()`.
**Gate:** own test, `npm run typecheck`.
**Commit:** `refactor(slack): durable DM card bundles with live re-rendering`.

### P10 — Task modal builder (pure)
**Mode:** parallel-safe. **Depends:** P04.
**Read:** `backend/src/slack/modals.ts`: anchors `export async function openNewTaskModal` (about 280 lines) and `app.view("new_task_submit"` (about 110 lines), for field names and parsing only.
**Create:** `backend/src/slack/views/taskModal.ts`, `backend/src/slack/views/taskModal.test.ts`.
**Do:**
```ts
export type TaskSection = "subtasks" | "deps" | "links" | "meta" | "estimate";
export interface TaskModalState { mode: "create" | "edit"; taskId?: string; projectLocked: boolean; sections: TaskSection[]; subtaskRows: number;
  initial: { title?: string; description?: string; projectId?: string; assigneeSlackIds?: string[]; dueDate?: string; priority?: Priority; status?: TaskStatus;
    tagIds?: string[]; milestoneId?: string; parentTaskId?: string; estimatedHours?: number; storyPoints?: number; recurrence?: string; recurrenceEnd?: string;
    blockerIds?: string[]; dependencyTaskIds?: string[]; links?: string; subtasks?: string[] };
  options: { projects: Opt[]; tags: Opt[]; milestones: Opt[]; blockers: Opt[] } }
export function buildTaskModal(state: TaskModalState): View;   // callback_id "task_modal_submit", private_metadata = JSON {mode, taskId, projectLocked, sections, subtaskRows, projectId}
export function parseTaskModal(values: ViewStateValues, meta): { input: ParsedTaskForm; errors: Record<string, string> };
```
- Basics: title (required, ≤ 200), description (multiline) with a "Draft details with AI" button (`tm_ai_draft`) in an actions block under it, project (`static_select` with `dispatch_action: true`, or a locked section), assignees (`multi_users_select`), due (`datepicker`), priority (`static_select`), status (edit mode only).
- Sections: subtasks = N `plain_text_input` rows (block_ids `tm_sub_0…`) plus "+ Add another subtask" (`tm_add_sub`, at most 10); deps = existing blockers `multi_static_select` + new blocker label input + dependency tasks `multi_external_select` (`tm_dep_tasks`) + parent task `external_select` (`tm_parent`); links = multiline input, one URL per line, optional "label | url"; meta = milestone select + tags `multi_static_select`; estimate = hours, story points, recurrence select, repeat-until datepicker.
- Bottom: context "Add more to this task", then one button per **hidden** section (`tm_section`, value = section).
- Stable block_ids are required so `views.update` keeps typed values.
- Tests: create mode with no sections stays under 30 blocks; all sections + 10 subtasks stay ≤ 100; parse rejects an empty title, reads links in both formats, drops the "none" placeholders, and ignores non-numeric hours.
**Gate:** own test.
**Commit:** `refactor(slack): full task modal builder with expandable sections`.

### P11 — Plan modal builder (pure)
**Mode:** parallel-safe. **Depends:** P04.
**Read:** `backend/src/services/aiActionService.ts`: lines 1–75 (types) and `rg -n "dispatchAction" -A 5` (per-type param names). §C5 plan spec.
**Create:** `backend/src/slack/views/planModal.ts`, `backend/src/slack/views/planModal.test.ts`.
**Do:** `actionLabel(type)` ("Create task", "Set due", …). `summarizeAction(action, taskTitles: Map<string, string>)` (for example `Swap pump driver → Oct 15`). `buildPlanModal({ sessionId, goal, actions, decisions, results?, taskTitles })` per §C5. `buildPlanEditModal(index, action, ctx)` with per-type fields from `api/AGENTS.md` (the AI Action Plan params list); callback_id `plan_edit_submit`; `private_metadata` `{s, i}`. `parsePlanEdit(type, values)` → params. Tests: 6 actions with mixed decisions show the right primary styles and the submit label "Run 4 accepted"; 35 actions → capped, with ≤ 100 blocks; with results, every action row is replaced by a context row; the edit modal round-trips each type.
**Gate:** own test.
**Commit:** `refactor(slack): action-plan review modal builder`.

### P12 — Mention recommender + item links
**Mode:** parallel-safe (new files only). **Depends:** P02, P05.
**Read:** `backend/src/services/slackMentionCore.ts` (full). `backend/src/services/vaultSearchService.ts`: `rg -n "export async function (accessibleVaultProjectIds|searchVault)" -A 20`. `backend/src/services/githubService.ts` (binary-flagged, so use `rg -a`): `rg -a -n "export async function (listPulls|listIssues|octokitForRepo)" -A 15`. `backend/src/api/projects.ts`: `rg -n "rootFolderId" -B 15 | head -40` (how a project's Drive folder id comes from `driveLink`). `backend/src/middleware/conversationAccess.ts` (full; small).
**Create:** `backend/src/services/slackMentionService.ts`, `backend/src/services/slackItemLinkService.ts`.
**Do:**
1. `gatherCandidates(memberId, projectIds)`:
   - Tasks: not archived, in those projects; open, plus DONE in the last 14 days; at most 300.
   - Vault items: not deleted, in `projectIds ∩ accessibleVaultProjectIds(memberId)`; meta = part number · revision · checkout holder.
   - GitHub: `GitHubLink` rows for those projects (last 90 days), plus open PRs and issues from each `ProjectRepo` via `listPulls`/`listIssues` (at most 20 per repo), cached in memory for 2 minutes. Swallow GitHub errors.
   - Drive: `listDriveFolderFiles(rootFolderId)` (best effort; it may return `[]` under `drive.file`) plus the Drive URLs found in task `attachments` in scope.
   - Milestones: open ones.
   - Keys `c1…cN` in that order.
2. `recommend(…)`:
   - `fastIntent` first.
   - Candidates → `scoreCandidates` → top 60.
   - If the fast intent is set and is not ATTACH, skip the AI and return the lexical picks.
   - Otherwise `runJson({ memberId }, "medium", { prompt: buildRecommendPrompt(…), json: true, maxOutputTokens: 1024 })` → `normalizeAiPicks`. On null or an error, use `lexicalFallback` with `aiUsed: false`.
3. `slackItemLinkService`:
   - `linkItems`: upsert per §C1 (snapshot label/url/projectId).
   - `unlinkItem`: the linker or an admin only.
   - `listBacklinks(viewerId, type, id)`: load the links, then keep only those whose conversation the viewer can read. Use the helper in `middleware/conversationAccess.ts` if it exposes a non-Express function; otherwise mirror its rule with `canReadConversation` + `SlackConversationMember`. **Never add an admin bypass** (Slack portal invariant 1). Return `{ id, channelId, channelName, messageTs, permalink, snippet, authorName, linkedByName, createdAt }`. The snippet comes from the `SlackMessage` archive row (≤ 140 characters); the permalink comes from `chat.getPermalink` through `resolveReadClient(channelId, viewerId)`, cached in memory.
**Gate:** `npm run typecheck`.
**Commit:** `refactor(slack): recommend and link Constellation items from a message`.

### P13 — Home tab builders (pure)
**Mode:** parallel-safe. **Depends:** P04.
**Read:** `backend/src/utils/blockKit.ts`: anchor `export function buildAppHome` (about 150 lines, for the current content). §C5 Home spec. §B L9.
**Create:** `backend/src/slack/views/home.ts`, `backend/src/slack/views/homeFilesCalendar.ts`, `backend/src/slack/views/home.test.ts`.
**Do:** Data-in, blocks-out builders: `homeTabs(active)`, `buildMyWork(data)` (sections Overdue / This week / Later / Waiting on you (CR reviews + polls not answered) / quick actions New task · Plan · Lab check-in or check-out), `buildProjects(data)` (per project: name, status counts, next milestone, buttons Report · Plan · New task), `buildFiles(data)` (project select `home_files_project`, Drive block, GitHub block, Vault block, each with an "Open ↗" link and empty states like "No Drive folder linked — link one in project settings"), `buildCalendar(data)` (next 14 days: per event a section with RSVP button state `cal_rsvp`; open polls with "Vote" `poll_open`). Each view wraps tabs + summary + body and asserts ≤ 100 blocks. Tests: each tab at maximum data stays within budget, empty states render, and the active tab is styled primary.
**Gate:** own test.
**Commit:** `refactor(slack): App Home tab builders`.

### P14 — Wire notifications to cards; task change bus
**Mode:** sequential. **Depends:** P08, P09.
**Read:** `backend/src/services/notificationCrud.ts`: lines 1–60. `backend/src/services/taskService.ts`: `rg -n "^export (async )?function"`, then each write function's body. `backend/src/services/taskMutationService.ts`: `rg -n "notifyAddedAssignees|P14"`. `backend/src/slack/modals.ts`: anchor `app.view("new_task_submit"`, the `queueDm` block only.
**Create:** `backend/src/services/taskChangeBus.ts`. **Edit:** `notificationCrud.ts`, `taskService.ts`, `taskMutationService.ts`, `slack/modals.ts` (delete the direct `queueDm` block only).
**Do:**
1. `createNotification` gains `slackCard?: { entityType: SlackEntityType; entityId: string; reason: string }`. When `route.slack && data.slackCard && recipient.slackId`, call `queueCard(…)` **instead of** `queueDm`. `slackText` stays the fallback when no card is given. Add a comment pointing to invariant 10.
2. `notifyAddedAssignees` passes `slackCard: { entityType: "TASK", entityId: taskId, reason: "ASSIGNED" }`.
3. `taskChangeBus.ts`: `export function emitTaskChanged(ids: string | string[])` and `onTaskChanged(fn)`. Emit from `taskService` `createTask`, `updateTask`, `deleteTask`, `createSubtask` (parent and child), `addDependency`/`removeDependency` (both tasks), and `logTime`.
4. In `slackCardService`, add `export function startCardRefresh()` that subscribes `onTaskChanged(ids => ids.forEach(id => refreshCardsSoon("TASK", id)))`.
5. Remove the `queueDm` IIFE in `new_task_submit`. The old modal path now gets its assignee notification from P17's code. Until P17, note it under **Deviations**: legacy modal assignees get no DM for one phase.
**Registration:** `app.ts`: call `startCardRefresh()` next to `initDmBatcher(boltApp)`.
**Gate:** full gate.
**Commit:** `feat(slack): new task assignments arrive as one bundled Slack DM with live cards`.

### P15 — Emit task changes from every other write path
**Mode:** sequential. **Depends:** P14.
**Read:** `rg -n "prisma(Client)?\.task\.(update|updateMany|delete|deleteMany|create)\(" backend/src/api backend/src/services`. Read ±20 lines around each hit.
**Edit:** at most 4 files from that list, highest traffic first: `api/tasks.ts` (bulk, bulk-archive, archive/unarchive), `api/blockers.ts`, `services/taskCompletionService.ts`, `services/aiActionService.ts`. Report any remaining hits in the receipt; P35 handles them.
**Do:** Call `emitTaskChanged(ids)` after each successful write. Also emit after comment create/delete and blocker attach/detach/resolve (these change card context).
**Gate:** full gate.
**Commit:** `refactor(tasks): broadcast task changes from bulk, archive and blocker paths`.

### P16 — Task card actions and small modals
**Mode:** sequential. **Depends:** P08, P09.
**Read:** `backend/src/slack/views/taskCard.ts`, `backend/src/slack/views/common.ts`, `backend/src/services/taskMutationService.ts` (signatures only: `rg -n "^export"`). `backend/src/slack/actions.ts`: anchors `app.action("ai_enrich_task"` and `app.action("ai_suggest_deadline"` (reuse the prompts). `backend/src/api/blockers.ts`: `rg -n "router\.(post|delete)\(" -A 25` for attach and create logic. `backend/src/api/tasks.ts`: anchor `tasksRouter.post("/:id/archive"` and `tasksRouter.post("/:id/subtasks"`.
**Create:** `backend/src/slack/handlers/taskCardActions.ts`, `backend/src/slack/views/taskSmallModals.ts`, `backend/src/slack/views/taskSmallModals.test.ts`.
**Do:**
- Small modals (pure): log time (hours + minutes + note → minutes), comment (multiline), add subtask (title + assignee), add blocker (existing project blocker select or a new label), add dependency (`external_select` `ts_dep_task`), archive confirm. `private_metadata = {t: taskId}`.
- Handlers:
  - `tc_status` → `updateTaskAsMember(…, { status }, "SLACK")`.
  - `tc_done` → status DONE.
  - `tc_assign_me` → `assigneeIds` = current + me.
  - `tc_log_time` opens the log-time modal → `logTimeAsMember`.
  - `tc_more` → each option opens its small modal, or for enrich/deadline runs the existing prompts through `runJson` and replies ephemerally with Apply buttons.
  - Edit opens P17's modal: export `openTaskModal` from P17. P16 runs first, so for now import from `./taskModal.js` behind `await import()`. If P17 is missing, reply "Editing from Slack ships in the next phase" (P17 removes the fallback).
  - Subtask create uses the same service the REST subtasks route uses (move nothing; call `createSubtask` + `notifyAddedAssignees`).
  - Blocker attach: call the same service code as the REST route. If the logic is inline in `blockers.ts`, **stop and report under Blocked**, and the orchestrator adds an extraction phase.
  - Every handler: resolve the member; map `TaskMutationError` → an ephemeral `❌ <message>` through `respond` or `chat.postEphemeral`. Never mutate the card directly; the change bus re-renders it.
- Tests: modal builders and the log-time parser ("1h 30m", "90", "1.5h").
**Registration:** `mirror.ts` → `registerTaskCardActions(app)`. `options` handler for `ts_dep_task` (task search in the same project, ≤ 100 options, matching titles).
**Gate:** full gate.
**Commit:** `feat(slack): change status, assign yourself, log time and more from a task card`.

### P17 — Task modal handlers
**Mode:** sequential. **Depends:** P10, P08.
**Read:** `backend/src/slack/views/taskModal.ts` (full). `backend/src/slack/actions.ts`: `rg -n "openNewTaskModal\(" -B 3`. `backend/src/slack/commands.ts`: same grep. `backend/src/services/projectService.ts`: `rg -n "export async function getProjectByChannel" -A 25`.
**Create:** `backend/src/slack/handlers/taskModal.ts`. **Edit:** `backend/src/slack/actions.ts`, `backend/src/slack/commands.ts` (only the call sites), `backend/src/slack/handlers/taskCardActions.ts` (remove the P16 fallback).
**Do:**
- `export async function openTaskModal(client, triggerId, opts: { channelId?: string; memberId: string; isAdmin: boolean; prefill?: …; taskId?: string })`: open a loading view, then load options (projects; for the chosen project its tags, milestones and active blockers; for edit, the task with its subtasks, deps and blockers), then `views.update`.
- Project lock rule: the same as today (a non-admin in a channel with a linked project is locked to it).
- `block_actions`:
  - `tm_section` adds a section.
  - `tm_add_sub` adds a row.
  - Project select change reloads the project options.
  - `tm_ai_draft` runs `enrichTaskPrompt` through `runJson` and fills the description with acceptance criteria.
  - Each calls `views.update` with `hash` and keeps typed values.
- `options` handlers: `tm_dep_tasks`, `tm_parent` (open tasks in the project, title match).
- `view_submission` `task_modal_submit`:
  - Parse; errors → `response_action: "errors"`.
  - Map users to members; reject non-members per block.
  - Create: `createTaskAsMember`, then subtasks (`createSubtask` each), new blocker (create + attach), existing blockers, dependencies (`addDependency`), links (attachments), parent.
  - Edit: `updateTaskAsMember` with the diff.
  - `ack()` first with `response_action: "clear"`, then do the writes. Report failures by DM through `chat.postMessage` to the member.
- Rewire every `openNewTaskModal(` call site to `openTaskModal(`. Keep the old `new_task_submit` handler registered (in-flight views); P35 removes it.
**Registration:** `mirror.ts` → `registerTaskModal(app)`.
**Gate:** full gate.
**Commit:** `feat(slack): create and edit tasks in Slack with every field, including subtasks, blockers and links`.

### P18 — Quick-add (`/c task <sentence>`) and `/c find`
**Mode:** sequential. **Depends:** P17.
**Read:** `backend/src/services/aiService.ts`: anchor `export async function parseTaskFromMessage` (signature + `ParsedTask` type). `backend/src/api/tasks.ts`: anchor `tasksRouter.post("/check-duplicates"` (prompt import name). `backend/src/utils/aiTaskCache.ts` (full). `backend/src/slack/events.ts`: `rg -n "function extractSuggestedAssignees" -B 80` (the name-matching helpers).
**Create:** `backend/src/slack/handlers/quickAdd.ts`, `backend/src/slack/views/taskDraft.ts`, `backend/src/slack/views/taskDraft.test.ts`.
**Do:**
- `handleTaskCommand(ctx)`:
  - No text → `openTaskModal`.
  - With text → respond "Drafting…" ephemerally, then `parseTaskFromMessage(text, today, context)` + the duplicate check via `runJson` medium with `duplicateDetectionPrompt` + `extractSuggestedAssignees` (move the helpers to `views/taskDraft.ts`, or import them if exported; do not duplicate them) → `storeAiTask` → `respond({ replace_original: true, blocks: buildTaskDraft(…) })`.
- Draft card per the mockup:
  - Header and fields: Project, Due, Assignee, Priority.
  - Duplicate context line.
  - Buttons: Create (`qa_create`), Edit details… (`qa_edit` → `openTaskModal` with prefill), Use existing (`qa_existing` → ephemeral live card of the duplicate with Assign me), Cancel.
- Create: `createTaskAsMember(…, "SLACK")`, then replace the draft with "✓ Created <link>". The assignees get the DM bundle.
- `handleFindCommand(ctx)`: `/c find <q>` → task search (reuse the logic behind `tasksRouter.get("/search"`, or a simple `contains` query scoped to the member's projects, at most 8) → ephemeral compact lines, each with a "Show card" button (ephemeral live card).
- Rewire `create_task_from_message`, `open_task_modal_from_reaction` and `ai_create_task` to open the draft or modal (keep the 📋 reaction behaviour).
**Registration:** `router.ts` → `task: handleTaskCommand`, `find: handleFindCommand`. `mirror.ts` → `registerQuickAdd(app)`.
**Gate:** full gate.
**Commit:** `feat(slack): type /c task followed by a sentence and confirm the drafted task`.

### P19 — Attach picker and link card builders (pure)
**Mode:** sequential. **Depends:** P12, P04.
**Read:** §C5 picker and link card. `backend/src/services/slackMentionService.ts`: `rg -n "^export (interface|type)" -A 12`.
**Create:** `backend/src/slack/views/attachPicker.ts`, `backend/src/slack/views/linkCard.ts`, `backend/src/slack/views/attach.test.ts`.
**Do:** `buildAttachPicker(rec, { pickerId, aiUsed })` (when `aiUsed` is false, add context "AI was unavailable — showing word matches"). `buildAttachSearchModal(prefill)` with `multi_external_select` per kind (`as_tasks`, `as_vault`, `as_github`, `as_drive`, `as_milestones`), each with `initial_options` from the picks. `buildLinkCard(items: LinkCardItem[])` per §C5, with the overflow options varying by kind and status. Tests: block budgets, a 6th pick per kind is dropped, descriptions are cut at 75, unknown kinds are skipped.
**Gate:** own test.
**Commit:** `refactor(slack): attach picker and context card builders`.

### P20 — @Constellation: attach flow
**Mode:** sequential. **Depends:** P19, P09.
**Read:** `backend/src/slack/views/attachPicker.ts`, `linkCard.ts` (signatures). `backend/src/services/slackCardService.ts`: `rg -n "registerCardRenderer|^export"`. `backend/src/services/projectService.ts`: `rg -n "export async function getProjectsForChannel" -A 30`. `backend/src/services/memberService.ts`: `rg -n "export async function getBotUserId" -A 15`. `backend/src/slack/events.ts`: anchor `app.message(async` (whole handler).
**Create:** `backend/src/slack/handlers/mentions.ts`. **Edit:** `backend/src/slack/events.ts` (L17 only: a bot-mention check in the existing user-event path).
**Do:**
- `app.event("app_mention")`:
  - Ignore bot authors.
  - Resolve the member (not found → ephemeral sign-in).
  - Project scope: `getProjectsForChannel(channel)` ids, else the member's projects.
  - `fastIntent` → if not ATTACH, call `routeIntent(…)` exported by P21 through `await import("./mentionIntents.js")`. Until P21, treat everything as ATTACH.
  - Thread text: if the mention is a reply, read the parent and up to 20 replies through `resolveReadClient(channel, memberId)`.
  - `recommend` → picker state map → `chat.postEphemeral({ thread_ts: event.thread_ts ?? event.ts, blocks })`.
- `ap_attach` reads the checkbox state from `body.state.values`, then `linkItems` → `postLinkCard` (implement it here: find or create the `SlackCardMessage(kind LINK_CARD, sourceTs)` and post or update the bot thread reply; register a `LINK_CARD` renderer that rebuilds it from `SlackItemLink` + live entity state) → `respond({ delete_original: true })`.
- `ap_search` opens the search modal; `options` handlers per kind reuse `gatherCandidates` filtered by the typed query. Its submit links the items the same way.
- `ap_dismiss` deletes the ephemeral.
- `lc_item` overflow:
  - open (a url option needs no handling)
  - done → `updateTaskAsMember`
  - checkout → `checkoutItem`
  - unlink → `unlinkItem`, then re-render.
- Live refresh: `TASK` changes already reach `refreshCardsSoon("TASK", id)`. Add `SlackCardRef` rows for every linked TASK and VAULT_ITEM so `LINK_CARD` messages refresh too.
- L17: in `events.ts`, inside the existing message handler after the archive step: if the text contains `<@BOT_ID>`, the event came from a user token, and the bot is not a member of the channel (check `SlackConversationMember`), DM the author once per channel per day (in-memory set).
**Registration:** `mirror.ts` → `registerMentions(app)`.
**Manifest needs:** none (P03 added `app_mention`).
**Gate:** full gate.
**Commit:** `feat(slack): tag @Constellation to attach tasks, CAD parts, PRs and Drive files to a message`.

### P21 — @Constellation: other intents and project Q&A
**Mode:** sequential. **Depends:** P20, P18, P23.
**Read:** `backend/src/api/projects.ts`: anchor `projectsRouter.post("/:id/ask"` (whole route + imports of `projectContextPrompt`/`todayContext`). `backend/src/slack/handlers/mentions.ts`: `rg -n "routeIntent|fastIntent" -B 3 -A 10`.
**Create:** `backend/src/services/projectAskService.ts`, `backend/src/slack/handlers/mentionIntents.ts`. **Edit:** `backend/src/api/projects.ts` (the `/ask` route becomes a wrapper), `backend/src/slack/handlers/mentions.ts` (remove the "treat as ATTACH" placeholder).
**Do:** `routeIntent(intent, ctx)`:
- TASK → the draft card from P18 with the message (+ thread) as text.
- PLAN → an ephemeral "Review plan for <project>" button that opens P23's modal. (A button is needed because `app_mention` carries no `trigger_id`.)
- ASK → `askProject` → ephemeral answer + "Sources: <task links>" (tasks whose titles appear in the answer).
- SUMMARIZE → read the thread through `resolveReadClient`, `runText` medium "summarize decisions, open questions, owners in ≤ 6 bullets", then ephemeral.
- BLOCKER → ephemeral form: task select (AI or lexical pick) + blocker select / new label + Attach.
- Each reply ends with context "Not what you meant?" + button "Attach items instead" (`mi_attach_instead`), which runs the attach flow.
- `/c ask <q>` uses `askProject` too.
**Registration:** `router.ts` → `ask: handleAskCommand`. `mirror.ts` → `registerMentionIntents(app)`.
**Gate:** full gate.
**Commit:** `feat(slack): ask @Constellation questions, summarize threads, or log blockers by tagging it`.

### P22 — Plan sessions
**Mode:** sequential. **Depends:** P02, P11.
**Read:** `backend/src/services/aiActionService.ts`: lines 75–160 and anchor `export async function executeActionPlan` (whole). `backend/src/services/projectContextService.ts`: `rg -n "^export" -A 3`.
**Create:** `backend/src/services/slackPlanSessionService.ts`.
**Do:** Implement §C3.
- `startSession`: if `threadText` is given, add it to the goal as "Context from Slack thread: …" (≤ 4000 chars). Call `suggestProjectActions(projectId, goal, memberId)`, store the actions; all start undecided; `expiresAt` = now + 24 h.
- Only the owner may mutate. Expired → throw "This plan expired — start a new one."
- `runAccepted`: set status RUNNING under a conditional `updateMany` guard (prevents a double run), call `executeActionPlan` with the accepted subset **in original order**, then map the results back to the original indexes and store them.
- `editAction`: re-validate with `normalizeActionPlan([edited], context)`; if it drops the action, throw its reason.
**Gate:** `npm run typecheck`.
**Commit:** `refactor(slack): stored action-plan review sessions`.

### P23 — Plan handlers
**Mode:** sequential. **Depends:** P22.
**Read:** `backend/src/slack/views/planModal.ts`, `backend/src/services/slackPlanSessionService.ts` (signatures).
**Create:** `backend/src/slack/handlers/plan.ts`.
**Do:**
- `export async function openPlanModal(client, triggerId, { memberId, projectId?, goal?, threadText?, source? })`:
  - Open a loading view.
  - If no project or goal: show a small form (project select + goal input, callback `plan_start`).
  - Otherwise `startSession` → store `viewId` → `views.update`.
- Buttons `plan_accept` / `plan_skip` / `plan_accept_all` → update the session → `views.update` the root.
- `plan_edit` → `views.push(buildPlanEditModal)`; `plan_edit_submit` → `editAction` → `views.update` the root (`viewId` from the session) → `ack()`.
- `plan_discard` → discard → `views.update` to a "Plan discarded" view.
- `plan_run` submission → `ack({ response_action: "update", view: loading })` → `runAccepted` → `views.update` with results.
- `/c plan <goal>` → `handlePlanCommand`.
**Registration:** `router.ts` → `plan: handlePlanCommand`. `mirror.ts` → `registerPlan(app)`.
**Gate:** full gate.
**Commit:** `feat(slack): review and run AI action plans in a Slack modal with /c plan`.

### P24 — Message shortcuts
**Mode:** sequential. **Depends:** P18, P20, P23.
**Read:** signatures of `openTaskModal`, the draft builder, `recommend`, `openPlanModal`, `addCommentAsMember`, `linkItems`.
**Create:** `backend/src/slack/handlers/shortcuts.ts`, `backend/src/slack/views/addToTask.ts`.
**Do:**
- `sc_create_task` → `openTaskModal` prefilled from the message (`parseTaskFromMessage` runs after the loading view opens).
- `sc_attach_items` → run the attach flow for that message. The picker goes to the clicker as an ephemeral in the message's thread. If ephemeral posting fails (bot not in the conversation), use `response_url` instead.
- `sc_plan_thread` → read the thread through `resolveReadClient(channel, memberId)` → `openPlanModal` with `threadText`.
- `sc_add_to_task`:
  - Modal: task `external_select` (`att_task`), mode radio (Comment · Link only), "Include files" checkbox.
  - Submit: Comment mode → `addCommentAsMember(content = message text + "\n\n— from Slack: <permalink>")`; Link mode → append the attachment `{ url: permalink, label: "Slack: <first 40 chars>" }` through `updateTaskAsMember`. "Include files" appends each file's permalink as an attachment.
  - Always `linkItems` so the backlink exists.
**Registration:** `mirror.ts` → `registerShortcuts(app)`.
**Gate:** full gate.
**Commit:** `feat(slack): message shortcuts to create a task, attach items, plan from a thread, or add to a task`.

### P25 — App Home handlers
**Mode:** sequential. **Depends:** P13, P16, P23.
**Read:** `backend/src/slack/views/home.ts`, `homeFilesCalendar.ts` (signatures + data types). `backend/src/slack/home.ts` (full). `backend/src/slack/commands.ts`: anchor `async function fetchReportData`. `backend/src/services/labVisitService.ts`: `rg -n "export async function (getMyVisits|checkIn|checkOut)" -A 3`.
**Create:** `backend/src/services/slackHomeData.ts`. **Edit:** `backend/src/slack/home.ts` (rewrite).
**Do:**
- Loaders per tab (member-scoped). Files tab: Drive (root folder id, as in P12; up to 8 files), GitHub (repos; up to 5 open PRs and 5 issues per repo, cached 2 minutes; recent `GitHubLink`s), Vault (the member's checkouts in the project, open CRs where the member is a reviewer or the project lead, latest `VaultRelease`). Calendar: `getUpcomingEvents(14)` + `getMemberRsvps` + open polls the member can respond to (`canRespond`) and has not answered.
- `home.ts`:
  - `app_home_opened` publishes the last tab (in-memory `Map<slackId, tab>`, default `mywork`).
  - `home_tab` switches tab.
  - `home_files_project` changes the project.
  - Quick actions: New task → `openTaskModal`; Plan → `openPlanModal`; Lab check-in/out → `labVisits` + republish.
  - `refreshAppHome(client, slackId)` keeps its export (other code calls it).
**Gate:** full gate.
**Commit:** `feat(slack): new Constellation home in Slack with My work, Projects, Files and Calendar tabs`.

### P26 — Vault cards and `/c vault`
**Mode:** parallel-safe (new files only). **Depends:** P07.
**Read:** `backend/src/services/vaultSearchService.ts`: anchor `export async function searchVault` (whole). `backend/src/services/changeRequestService.ts`: `rg -n "export async function (approveCr|rejectCr|getCr)" -A 8`. `backend/src/services/vaultPrReviewService.ts`: `rg -n "export async function (signoffCr|reviewStatus)" -A 12`. `backend/src/api/changeRequests.ts`: anchors `"/change-requests/:id/approve"` and `"/change-requests/:id/signoff"` (to copy the checks).
**Create:** `backend/src/slack/views/vaultCards.ts`, `backend/src/slack/views/vaultCards.test.ts`, `backend/src/slack/handlers/vault.ts`.
**Do:**
- Item card: name · part number · revision pill · checkout line · buttons Open (url) · Check out / Undo checkout (`vc_checkout` / `vc_undo`) · Watch toggle (`vc_watch`, via the subscription service the REST route uses).
- CR card: title · status · affected items · review gate summary · buttons Approve / Reject (`cr_approve` / `cr_reject`, shown only to admins; each opens a note modal) · Sign off / Revoke (`cr_signoff`) · Open.
- `/c vault <q>` → `searchVault(memberId, { q, limit: 5 })` → ephemeral cards.
- A 409 holder → ephemeral "Checked out by <name> since <date> · [Take over]", where Take over sends `force: true` behind a `confirm`.
**Registration:** `router.ts` → `vault: handleVaultCommand`. `mirror.ts` → `registerVault(app)`.
**Gate:** own test, `npm run typecheck`.
**Commit:** `feat(slack): search CAD parts, check out, and approve change requests with /c vault`.

### P27 — Vault notifications as cards
**Mode:** sequential. **Depends:** P26.
**Read:** `backend/src/services/vaultNotificationService.ts`: `rg -n "sendSlack|slackText|function render" -B 5 -A 20`. `backend/src/services/dmBatcher.ts`: anchor `export async function sendSlackDmNow`.
**Edit:** `vaultNotificationService.ts`, `dmBatcher.ts`, `backend/src/slack/views/vaultCards.ts`.
**Do:** `sendSlackDmNow(slackId, text, blocks?)`. The vault outbox passes blocks from `buildVaultNoticeBlocks(event)` (check-in → item card; CR submitted/decided → CR card; checkout conflict → item card with holder). Keep the text fallback and the retry semantics unchanged (invariant 10's exception).
**Gate:** full gate (includes `vaultNotify.test.ts`).
**Commit:** `feat(slack): CAD notifications arrive as cards with review and checkout buttons`.

### P28 — Check in CAD from a DM
**Mode:** sequential. **Depends:** P26.
**Read:** `backend/src/api/vaultGithub.ts`: anchor `vaultGithubRouter.post("/vault/items/:id/github-versions"` (whole). `backend/src/services/vaultGithubJobs.ts`: `rg -n "export (async )?function (enqueueVaultUpload|processVaultJob|publicJob)" -A 10`. `backend/src/services/slackFileService.ts`: `rg -n "url_private|fetch\(" -B 3 -A 10` (how Slack files are downloaded with the bot token). `backend/src/slack/events.ts`: anchor `app.event("file_shared"`.
**Create:** `backend/src/slack/handlers/vaultCheckin.ts`. **Edit:** `backend/src/slack/events.ts` (route IM file shares to the new handler before the image-task prompt).
**Do:**
- In an IM between a member and the bot, when the file extension is CAD-like (`step, stp, sldprt, sldasm, slddrw, ipt, iam, f3d, stl, obj, gltf, glb, dxf, dwg, pdf`):
  - Guess the item: a part number in the file name or message → exact match; else the member's checked-out items ranked by name similarity.
  - Post a card: "Check in <file> as a new version of <item>?" · [Check in…] [Different part…] [Cancel].
- The modal holds an item `external_select` (accessible projects only) and a required note.
- Submit:
  - Download to the OS temp dir.
  - `enqueueVaultUpload({ …, idempotencyKey: "slack:" + fileId + ":" + itemId, expectedHeadSha: null })` → `processVaultJob`.
  - Create a `SlackCardMessage(kind CHECKIN)`.
  - Poll the job row every 5 s for up to 10 minutes; on each state change, `chat.update` the card ("Uploaded → Stored → Committed → Indexed", or a failure with a retry link to the web).
  - Remove the temp file in `finally`.
- `VAULT_NOT_ENABLED` → "This project's vault isn't on GitHub yet; check in on the web."
**Registration:** `mirror.ts` → `registerVaultCheckin(app)`.
**Gate:** full gate.
**Commit:** `feat(slack): check in a CAD file by sending it to Constellation in a DM`.

### P29 — RSVP and Calendar actions
**Mode:** parallel-safe (new files only). **Depends:** P13.
**Read:** `backend/src/api/public.ts`: anchor `publicRouter.post("/events/:eventId/rsvp"` (the member branch). `backend/src/services/eventService.ts`: `rg -n "export async function (getUpcomingEvents|getEvent)" -A 15`.
**Create:** `backend/src/services/eventRsvpService.ts`, `backend/src/slack/views/eventCards.ts`, `backend/src/slack/handlers/calendar.ts`.
**Do:**
- `setMemberRsvp`: going → the same upsert as the public route's member branch; not going → `deleteMany({ eventId, memberId })`. Return the new count.
- Event row: title · time (member's timezone, else America/New_York) · location · "N going" · button RSVP (primary when going: "Going ✓ · Cancel"), `cal_rsvp` value `{e, g}`.
- Handler: toggles, then re-renders where clicked (Home → republish; ephemeral → `respond replace_original`).
- `/c events` → ephemeral list of the next 7 days with RSVP.
**Registration:** `router.ts` → `events: handleEventsCommand`. `mirror.ts` → `registerCalendar(app)`.
**Gate:** `npm run typecheck`.
**Commit:** `feat(slack): RSVP to club events from Slack`.

### P30 — Poll voting in Slack
**Mode:** sequential. **Depends:** P09, P29.
**Read:** `backend/src/services/pollService.ts`: anchors `export function slotKey`, `export function canRespond`, `export async function upsertResponse`, `export async function getSuggestedAvailability` (whole functions). `backend/src/api/meetingPolls.ts`: `rg -n "MEETING_POLL_INVITE" -B 10 -A 10` (where invites are created).
**Create:** `backend/src/slack/views/pollModal.ts`, `backend/src/slack/views/pollModal.test.ts`, `backend/src/slack/handlers/polls.ts`. **Edit:** `backend/src/api/meetingPolls.ts` (pass `slackCard` on invite notifications).
**Do:**
- Modal: group `slotStarts` by local date in `poll.timezone`. One `checkboxes` block per ≤ 10 slots (labels like "Tue 3:00 PM"; a day with more slots is split "Tue (1/2)"). `initial_options` = the member's current slots. Actions: "Use my usual availability" (`poll_usual` → prefill from `getSuggestedAvailability` through `views.update`), "Open full grid ↗" (url to `/schedule/<publicToken>`). Over 100 blocks → show the first days and a context "Grid too large for Slack — use the full grid".
- Submit: `canRespond` check, then `upsertResponse({ memberId, slots })`, then a DM "Saved your availability for <title>".
- Invite card (`POLL_INVITE` renderer, registered via `registerCardRenderer`): title · organizer · deadline · [Fill in availability] (`poll_open`).
**Registration:** `mirror.ts` → `registerPolls(app)`.
**Gate:** full gate.
**Commit:** `feat(slack): fill in meeting-poll availability without leaving Slack`.

### P31 — Link unfurls
**Mode:** sequential. **Depends:** P06, P04, P26, P29.
**Read:** `backend/src/services/slackUnfurlCore.ts` (full). `views/taskCard.ts`, `views/vaultCards.ts`, `views/eventCards.ts` (signatures).
**Create:** `backend/src/slack/views/unfurl.ts`, `backend/src/slack/handlers/unfurls.ts`.
**Do:**
- `link_shared` → parse each link → load the entity → if `entity.projectId ∈ getProjectsForChannel(channel)` ids, a compact unfurl (§B L13: title, pill, 2–3 facts, an Open button, and one action: Assign me for tasks, Check out for vault items, RSVP for events). Otherwise the generic line.
- Never unfurl in IM/MPIM (privacy: no project linkage exists there).
**Registration:** `mirror.ts` → `registerUnfurls(app)`.
**Gate:** full gate.
**Commit:** `feat(slack): Constellation links show a preview in project channels`.

### P32 — Backlinks API
**Mode:** sequential. **Depends:** P12.
**Read:** `backend/src/services/slackItemLinkService.ts` (full). `backend/src/app.ts`: `rg -n "app.use\(\"/api" | head -40` (mount order). `backend/src/appMountOrder.test.ts` (first 40 lines).
**Create:** `backend/src/api/slackLinks.ts`.
**Do:** `GET /api/slack-links?entityType=&entityId=` (`requireAuth`; validate the enum; viewer = `req.memberId`) → `listBacklinks`. `DELETE /api/slack-links/:id` → `unlinkItem`, then refresh the link card (`refreshCardsSoon`).
**Registration:** `app.ts` → `app.use("/api/slack-links", slackLinksRouter)` placed among the explicit-prefix routers, not after the bare `/api` ones.
**Gate:** full gate.
**Commit:** `refactor(api): list Slack messages that mention a task or part`.

### P33 — Frontend: `SlackMentions` component
**Mode:** sequential. **Depends:** P32.
**Read:** `src/api/clubPmClient.js`: `rg -n "^export (const|function|async function)" | head -60` and one small existing helper as a model. `src/components/clubpm/github/GitHubTaskSection.jsx` (full; the closest sibling pattern). `public/clubpm-theme.css`: `rg -n "pm-task-modal-section|SectionHeader" | head`.
**Create:** `src/components/clubpm/SlackMentions.jsx`. **Edit:** `src/api/clubPmClient.js` (add `getSlackLinks(entityType, entityId)` and `deleteSlackLink(id)`), `public/clubpm-theme.css` (append a `/* === Slack mentions === */` block at the end).
**Do:** A section titled "Mentioned in Slack": a list of rows (`#channel` · author · relative time · snippet · "Open in Slack" link to the permalink · an unlink icon button for the linker, `aria-label="Unlink"`). Empty → render nothing (no empty section). Font Awesome icons only (`fab fa-slack`); no emoji. Class prefix `cpm-slack-mentions`. Plain JSX, hooks only.
**Gate:** root `npm run build`, `npm run lint`.
**Commit:** `refactor(clubpm): Slack mentions component`.

### P34 — Frontend: show mentions on tasks and parts
**Mode:** sequential. **Depends:** P33.
**Read:** `src/components/clubpm/TaskModal.jsx`: anchor `{/* GitHub (Phase 2) */}` ±20 lines and the imports. `src/components/clubpm/vault/VaultItemModal.jsx`: `rg -n "return \(|<section|className=\"" | head -30`, then the chosen insertion point ±20 lines.
**Edit:** `TaskModal.jsx`, `VaultItemModal.jsx`.
**Do:** Render `<SlackMentions entityType="TASK" entityId={task.id} />` after the GitHub section, and `entityType="VAULT_ITEM"` in the item modal after the version history. No route, nav or tab change, so no tour-anchor work.
**Gate:** root `npm run build`, `npm run lint`, `npm test -- --watchAll=false src/components/clubpm/vault`.
**Commit:** `feat(clubpm): tasks and CAD parts show the Slack messages they were attached to`.

### P35 — Legacy cleanup and invariant tests
**Mode:** sequential. **Depends:** P15–P34.
**Read:** `backend/src/slack/modals.ts`: `rg -n "export async function|app.view\(" `. `backend/src/slack/actions.ts`: `rg -n "app.action\("`. The P15 receipt's leftover list.
**Edit:** `backend/src/slack/modals.ts`, `backend/src/slack/actions.ts`, one leftover write path from P15 if any. **Create:** `backend/src/slack/slackMirrorInvariants.test.ts`.
**Do:**
1. Delete `openNewTaskModal`, `new_task_submit`, `openSubtaskModal`/`subtask_submit` and `openTaskDoneModal`/`task_done_submit` if they have no remaining callers (`rg` each name first). Keep standup, project, milestone, Drive-parse, meeting-notes, sprint, image-task, event and outreach.
2. Static tests (read files as text):
   - (a) No file under `backend/src/slack/handlers/` or `backend/src/slack/views/` contains `prisma.task.update`, `prisma.task.create`, `prisma.vaultItem.update` or `queueDm(`.
   - (b) `backend/src/slack/handlers/mentions.ts` and `services/slackItemLinkService.ts` do not contain `isAdmin`, except `unlinkItem`'s admin check, which lives in a function named `canUnlink` that is excluded by name.
   - (c) Every `views.open(` in `handlers/` is followed within 5 lines by `loadingView(`, or the handler is on an allowlist of instant modals.
   - (d) Block-budget tests exist for every file in `views/`.
**Gate:** full gate.
**Commit:** `refactor(slack): remove superseded modals and guard the mirror invariants`.

### P36 — Docs and course sync
**Mode:** sequential. **Depends:** P35.
**Read:** `backend/src/slack/AGENTS.md` (full). `rg -n "/pm |@Club PM|Club PM" docs/courses src backend/src AGENTS.md backend/AGENTS.md`.
**Edit:** `backend/src/slack/AGENTS.md`, `backend/src/services/AGENTS.md`, `backend/src/api/AGENTS.md`, `AGENTS.md` (root). Plus the course and copy hits from the grep: `docs/courses/constellation-admin-tools/content/C10-the-officers-handbook.md` (`/pm report` → `/c report`) and `src/pages/ClubPM/ProjectDetail.jsx` (the `/invite @Club PM` string → `/invite @Constellation`). Docs-only edits may exceed 4 files.
**Do:**
- Slack AGENTS: add a "Slack mirror" section with the handler map (§C2), the orchestrator-owned registry files, and invariants 11–15:
  - 11: task cards never post to channels.
  - 12: handlers write only through mutation services.
  - 13: model ids are validated against candidate keys.
  - 14: backlinks are filtered by conversation access with no admin bypass.
  - 15: open a loading modal before slow work.
- Also add the 1-minute `flushDueCardBundles` cron to the scheduler list, and note it is a reactive outbox, not a scheduled digest.
- Services/API AGENTS: one line per new service and route.
- Root AGENTS: mention `slack-manifest.yaml` and `/c`.
- Run `node scripts/check-tour-anchors.js` (it must still pass; nothing in the nav changed).
**Gate:** full gate.
**Commit:** `docs(slack): document the Slack mirror and rename /pm references`.

### P37 — STOP: human steps
The orchestrator stops here and gives the human this checklist:
1. Merge or deploy `feat/slack-mirror` (the deploy runs `prisma migrate deploy`).
2. In api.slack.com → the app → **App Manifest**: paste `slack-manifest.yaml`, save, then **Reinstall to Workspace**. Admin approval is needed for the new bot scopes (`app_mentions:read`, `links:read`, `links:write`, `im:history`, `im:read`).
3. **Event Subscriptions → App unfurl domains**: confirm `purduesearch.org` is listed.
4. End-to-end check with two people:
   - (a) `/c task fix pump driver by fri for @<other> high` → Create → the other person gets one DM within 15 minutes with a live card; change the status on the web and watch the card update.
   - (b) Post a message mentioning a real task and part, tag @Constellation → checklist → Attach → thread card → open the task in Constellation and see "Mentioned in Slack".
   - (c) `/c plan <goal>` → Accept/Skip/Edit → Run → the results appear.
   - (d) The Home tabs all render.
   - (e) Send a STEP file to Constellation in a DM → check-in completes.
   - (f) Fill in a poll from Slack.
   - (g) Paste a task link in a project channel → it unfurls.
5. Report anything that fails to the orchestrator as a new fix phase.

---

## §E — Orchestrator kickoff prompt

> You are the orchestrator for `docs/superpowers/plans/2026-10-09-slack-mirror.md` in this repository. Read all of §A, §B, §C and §D now, and skim the §P headers. Follow §A1 exactly: create the branch, run the baseline gate, then execute the waves in §D. Dispatch one subagent per phase with the §A1.4 prompt. Never edit code yourself, except the §A3 registration lines and commits. Keep your own context small: read receipts, not diffs. Stop at P37 or after two failed fix attempts on any phase, and report status in at most 15 lines.
