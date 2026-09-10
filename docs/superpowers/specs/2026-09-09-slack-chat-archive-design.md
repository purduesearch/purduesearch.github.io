# Slack chat archive — Slack conversation as a ClubPM project tab

**Date:** 2026-09-09
**Status:** approved design, not yet implemented
**Direction:** Slack → website only. Posting *from* the website is explicitly out of scope for this pass.

Today the Slack workspace and the Constellation site are two disconnected experiences: the real
project conversation happens in Slack and is invisible on the website, and on the free Slack plan it
becomes invisible in Slack too once it passes the 90-day history boundary. This design adds a **Chat**
tab to the ClubPM project detail page that renders the project's Slack channels, backed by a durable
archive that outlives Slack's retention.

---

## 1. What already exists (and why ingestion needs no new Slack scopes)

The single most important pre-existing fact: **every message in every channel the bot is in already
arrives at the backend.**

- `backend/src/slack/bolt.ts:13` sets `socketMode: true` **unconditionally** — not only in dev. Slack
  events stream in over a websocket, so there is no HTTP event endpoint to add.
- `slack-manifest.yaml` already subscribes to `message.channels` and `message.groups`, and already
  holds `channels:history`, `groups:history`, `reactions:read`, `files:read`, and `users:read`.
- `backend/src/slack/events.ts:244`'s `app.message()` handler therefore receives every message today
  — and throws all of them away unless the text starts with `TODO:` or `ACTION:`.

Channel↔project linking also already exists, two ways, resolved by
`projectService.getProjectsForChannel()`: the `ProjectNotificationTarget` join model (primary) and the
legacy `Project.slackChannelId` / `Project.slackChannel` fields (fallback).

Existing infrastructure this design reuses rather than rebuilds:

| Need | Existing thing |
|---|---|
| Durable file storage | `GoogleDriveCredential` singleton + `driveService.ensureClubPmRootFolder()`, `createDriveFolder()`, `uploadStreamToDrive()`, `streamDriveFile()`, `deleteDriveFile()` |
| Local static file serving | `uploads/` dir, served at `/uploads` (`app.ts:181`) |
| Live push | `activityBus` + `backend/src/api/sse.ts` + the single `EventSource` in `src/components/clubpm/NotificationBell.jsx:197` |
| Per-resource permissions idiom | `backend/src/middleware/taskAccess.ts` |
| Cron registration | `backend/src/slack/scheduler.ts` (the *only* place crons go) |

**Two manifest changes are required**, bundled into a single Slack app reinstall: the
`reaction_removed` bot event, and the `emoji:read` bot scope for custom emoji rendering.

---

## 2. Scope decisions

| Decision | Choice |
|---|---|
| Which channels | Project-linked channels only (via `ProjectNotificationTarget` or the legacy `Project.slackChannelId`) |
| Attachment durability | Referenced in Slack while it lives there; swept into the club Google Drive before Slack expires it |
| Who can read | Project members + admins |
| Live updates | Extend the existing member SSE stream with project channel events |
| Backfill | One-shot, admin-triggered, per channel |
| Bot messages | Not archived at all |
| Fidelity | Threads, edits/deletes, reactions, and rich text (mentions, links, code, custom emoji) |

### 2.1 Accepted tradeoff: bot messages

Bot and Block-Kit messages (the ~30 scheduler crons' digests, standup prompts, risk reports, task
announcement cards) are dropped at ingest and never stored. This keeps the archive a record of human
conversation.

The tradeoff, accepted deliberately: **a bot message skipped at ingest is unrecoverable** once it
passes Slack's retention boundary. To keep the policy cheap to change *going forward*, the filter is a
single exported predicate `shouldArchive()` (§5.1) rather than conditions scattered through the
handler — flipping to "store bot messages, render collapsed" is then a one-function change plus a
renderer branch, affecting messages from that point on only.

---

## 3. Data model

Three new models and three new enums in `backend/prisma/schema.prisma`.

### 3.1 Keyed on channel, not project

`SlackChannelArchive` and `SlackMessage` key on **`slackChannelId`**, never `projectId`. This is
load-bearing, not incidental:

- `getProjectsForChannel()` returns an **array** — one Slack channel can be linked to several
  projects. Project-keying would need duplicate message rows per project, or an arbitrary "primary
  project" choice.
- Channel-keying means both projects render the same conversation, re-linking a channel never
  duplicates history, and *unlinking* a channel does not orphan or delete its archive.
- It also makes the "project-linked only" scope reversible: widening to all bot channels later becomes
  a change to the ingest predicate, not a migration.

Project scoping happens at **read** time by resolving the requested project's linked channel ids.

### 3.2 Models

```prisma
enum SlackBackfillStatus { NOT_STARTED  RUNNING  COMPLETE  FAILED }

enum SlackFileStorage {
  SLACK_ONLY     // still live in Slack; proxy streams from Slack
  DRIVE          // mirrored into the club Drive; proxy streams from Drive
  LOCAL          // mirrored to uploads/slack/ because Drive was unavailable
  MIRROR_FAILED  // repeated mirror failures; needs admin attention
  UNAVAILABLE    // Slack no longer has it and it was never mirrored
}

model SlackChannelArchive {
  id               String   @id @default(cuid())
  slackChannelId   String   @unique
  slackChannelName String?
  isPrivate        Boolean  @default(false)
  archiveEnabled   Boolean  @default(true)

  // Google Drive subfolder holding this channel's mirrored attachments.
  driveFolderId    String?

  backfillStatus   SlackBackfillStatus @default(NOT_STARTED)
  backfillCursor   String?   // Slack ts paginated back to; makes backfill resumable
  backfillOldestTs String?   // oldest ts successfully stored
  backfillError    String?
  backfilledAt     DateTime?

  lastMessageAt    DateTime?
  messageCount     Int      @default(0)

  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
}

model SlackMessage {
  id              String    @id @default(cuid())
  slackChannelId  String
  ts              String    // Slack's message ts — the natural key
  threadTs        String?   // parent ts when this is a reply
  replyCount      Int       @default(0)  // maintained on the parent row

  authorSlackId   String?
  memberId        String?   // resolved Member, null for non-members / deactivated users
  authorName      String    // snapshot of the display name at post time
  authorAvatarUrl String?   // snapshot

  text            String    @db.Text  // raw Slack mrkdwn, the source of truth
  editedAt        DateTime?
  deletedAt       DateTime? // tombstone — the row is kept
  reactions       Json?     // { ":emoji:": { count, slackIds: [] } }

  postedAt        DateTime
  files           SlackMessageFile[]

  @@unique([slackChannelId, ts])
  @@index([slackChannelId, postedAt])
  @@index([threadTs])
  @@index([memberId])
}

model SlackMessageFile {
  id             String   @id @default(cuid())
  messageId      String
  message        SlackMessage @relation(fields: [messageId], references: [id], onDelete: Cascade)

  slackFileId    String   @unique
  name           String
  mimeType       String?
  sizeBytes      Int?
  isImage        Boolean  @default(false)
  width          Int?     // so the UI can reserve layout space without fetching
  height         Int?

  storage        SlackFileStorage @default(SLACK_ONLY)
  driveFileId    String?
  localPath      String?
  mirrorAttempts Int      @default(0)
  mirrorError    String?
  mirroredAt     DateTime?

  // Denormalized from SlackMessage.postedAt so the nightly sweep is a single
  // index scan instead of a join.
  postedAt       DateTime

  createdAt      DateTime @default(now())

  @@index([storage, postedAt])
  @@index([messageId])
}
```

### 3.3 Two deliberate denormalizations

**`authorName` / `authorAvatarUrl` snapshots.** A message shows who posted it as they were, and the
archive stays readable for people who left the club or never had a `Member` row.

**`SlackMessageFile.postedAt`.** The nightly sweep's whole query is
`where: { storage: SLACK_ONLY, postedAt: { lt: cutoff } }`, which the `@@index([storage, postedAt])`
serves directly.

### 3.4 Ingest must not create Member rows

`memberService.resolveSlackMember()` **creates** a `Member` when one doesn't exist. It is correct for
`member_joined_channel`; it is wrong here. Archiving a message from a guest, a contractor, or a
non-member would silently add them to the club roster, where they would then appear in assignee
pickers.

Ingest instead looks up `Member` by `slackId`; on a miss it stores `authorSlackId` plus a display name
from a cached `users.info` call and leaves `memberId` null.

---

## 4. Rich text: parse at read, not at ingest

`text` stores raw Slack mrkdwn. A pure function converts it to a token array on **read**:

```
type SlackToken =
  | { type: "text";      value: string }
  | { type: "mention";   slackId: string; label: string }   // <@U123> → display name
  | { type: "channel";   slackId: string; label: string }   // <#C123|name>
  | { type: "link";      href: string; label: string }      // <url|label>
  | { type: "code";      value: string }                    // `inline`
  | { type: "codeblock"; value: string }                    // ```block```
  | { type: "emoji";     name: string; url?: string }       // :custom: → workspace emoji URL
  | { type: "bold" | "italic" | "strike"; children: SlackToken[] }
```

Parse-at-read rather than parse-at-ingest because:

- improving the parser never requires backfilling stored rows;
- a member who renames themselves renders correctly retroactively;
- mention resolution needs one cached `slackId → member` map per page of messages, not a lookup per
  message at write time.

The parser lives in `backend/src/services/slackMessageFormat.ts` as a pure, unit-tested function with
no Prisma or Slack imports. Custom emoji come from an `emoji.list` result cached in memory, refreshed
by a daily cron registered in `slack/scheduler.ts` alongside the mirror sweep (phase 5). Until that
cache is first populated, a custom emoji token renders as its `:name:` text rather than failing.

### 4.1 The CSS trap this renderer walks into

`public/clubpm-theme.css:969` is:

```css
.clubpm-app h1, .clubpm-app h2, .clubpm-app h3, .clubpm-app p, .clubpm-app span,
.clubpm-portal h1, … { color: inherit !important; }
```

A token renderer naturally emits one `<span>` per token. Under that rule **every mention, link, and
code token silently renders as plain body text**, with no selector able to override it — an
`!important` blanket beats everything.

**Rule for `ChatRichText.jsx`: no `<span>`, no `<p>`.** Tokens render as `<a>`, `<code>`, `<b>`,
`<i>`, `<s>`, `<div>`, or `<label>`. Message bodies are `<div>`, never `<p>`.

---

## 5. Ingest

### 5.1 The filter

One exported predicate decides everything, so the policy lives in a single place:

```ts
// backend/src/services/slackArchivePolicy.ts — pure, no I/O
export function shouldArchive(msg: SlackMessageEvent): ArchiveDecision
// → { archive: false, reason: "bot" | "join_leave" | "subtype" | "no_text" }
// → { archive: true,  kind: "new" | "edit" | "delete" }
```

Not archived: anything with a `bot_id`, anything from the app's own bot user, and the membership /
housekeeping subtypes (`channel_join`, `channel_leave`, `channel_topic`, `channel_purpose`,
`channel_name`, `channel_archive`, `pinned_item`, …).

Archived, by subtype:

| Subtype | Action |
|---|---|
| *(none)* | upsert a new message |
| `file_share` | upsert, plus `SlackMessageFile` rows |
| `thread_broadcast` | upsert with `threadTs` set |
| `message_changed` | update `text`, set `editedAt` |
| `message_deleted` | set `deletedAt` (tombstone; row and files are kept) |

### 5.2 Wiring into the existing handler

In `backend/src/slack/events.ts`'s `app.message()`, the archive call goes **first and in its own
try/catch**:

```ts
app.message(async ({ message, client }) => {
  try { await ingestSlackMessage(message, client); }
  catch (err) { console.error("[slackArchive] ingest failed:", err); }

  try { /* existing TODO:/ACTION: prompt logic, unchanged */ }
  catch (err) { console.error("Message event error:", err); }
});
```

Independent error boundaries in both directions: an archive bug must not stop the `TODO:` prompt that
works today, and a failure in the existing logic must not lose a message from the archive.

`reaction_added` extends the existing handler (which already runs for clipboard/✅ flows);
`reaction_removed` is a new handler.

### 5.3 Thread reply counts

A reply upsert increments the parent's `replyCount`. Because backfill and live ingest can both touch
the same parent, `replyCount` is **recomputed** from a count query rather than blindly incremented, so
it is idempotent under replay.

---

## 6. Attachments: Slack now, Drive before expiry

### 6.1 Why a proxy endpoint is required from day one

Slack's `url_private` requires the bot token in an `Authorization` header. A browser `<img src>` can
never carry one. So even while a file is live in Slack, the frontend cannot reference it directly —
there must be a backend endpoint that streams the bytes.

That endpoint is the design's key indirection: it resolves `SlackFileStorage` at request time and
streams from Slack, Drive, or disk as appropriate. **No stored message record ever contains a
Slack-hosted URL the frontend depends on**, which is what makes the Slack→Drive migration completely
invisible to the UI.

Resolution table — note that `SlackFileStorage` mixes *locations* with *outcomes*, so the proxy maps
two states to the same source:

| `storage` | Proxy streams from |
|---|---|
| `SLACK_ONLY` | Slack, via a fresh `files.info` `url_private` + bot token |
| `MIRROR_FAILED` | **Slack, same as `SLACK_ONLY`** — mirroring failed, but the file is still there until Slack expires it |
| `DRIVE` | `driveService.streamDriveFile(driveFileId)` |
| `LOCAL` | `uploads/slack/…` on disk |
| `UNAVAILABLE` | nothing — responds `410 Gone` so the UI renders an explanatory placeholder |

A `MIRROR_FAILED` file that Slack has since expired resolves to `UNAVAILABLE` on the next sweep, at
which point the proxy stops trying.

### 6.2 State machine

```
                     ┌──────────────┐
   ingest ──────────>│ SLACK_ONLY   │
                     └──────┬───────┘
       nightly sweep, postedAt < now − 60d
                            │
        ┌───────────────────┼────────────────────┬─────────────────┐
        v                   v                    v                 v
   ┌─────────┐      ┌──────────────┐    ┌───────────────┐   ┌─────────────┐
   │  DRIVE  │      │    LOCAL     │    │ MIRROR_FAILED │   │ UNAVAILABLE │
   └─────────┘      └──────────────┘    └───────────────┘   └─────────────┘
   uploaded to      Drive unconfigured   attempts > 3,       Slack returns
   club Drive       → uploads/slack/     error recorded      file_not_found
```

`MIRROR_FAILED → SLACK_ONLY` is the one backward edge, and only an admin takes it:
`POST /api/slack-archive/retry-failed` (the **Retry** button on the Admin page's Slack archive panel)
resets `storage` **and** `mirrorAttempts = 0` — without the counter reset the next failure would
re-fail the row immediately — keeps `mirrorError`, and starts a sweep in the background. Sweeps are
single-flight, so an on-demand sweep cannot race the 03:40 cron into double-uploading a file.

### 6.3 Sweep

New cron in `backend/src/slack/scheduler.ts` at **03:40 daily** — clear of the existing 03:00–03:30
cluster (vault temp sweep, notification cleanup, auto-archive nudges).

- **Cutoff is 60 days, not 75+.** Slack never announces expiry; on the free plan history simply stops
  being returned past ~90 days. The 30-day margin is the design's entire tolerance for a cron outage,
  a Drive quota error, or a revoked Drive credential. Copying early costs nothing — they are the same
  bytes either way.
- Batch-capped per run (200 files) to bound runtime.
- Calls `files.info(slackFileId)` at sweep time for a **fresh** `url_private` rather than trusting a
  stored URL that may have rotated.
- Streams Slack → `uploadStreamToDrive()` without buffering the whole file in memory.
- `file_not_found` from Slack → `UNAVAILABLE`, so the UI can say "this file expired before it could be
  archived" instead of showing a broken image.
- Failures increment `mirrorAttempts` and record `mirrorError`; after 3 attempts the row becomes
  `MIRROR_FAILED`. Idempotent — re-running never double-uploads, because state advances only on
  success.

### 6.4 The sweep must fail loudly

`driveService.getBotDrive()` returns `null` when no `GoogleDriveCredential` exists, and every
`driveService` function returns `null` on error rather than throwing. A naive sweep would therefore
no-op **silently**, and files would die at day 90 with nothing in the logs saying why. (The dev
database has no Drive credential at all, so this is the default local behavior, not an edge case.)

Two mitigations:

1. **Local fallback.** Drive unavailable → mirror to `uploads/slack/<channelId>/`, `storage = LOCAL`.
   The archive is never lossy merely because Drive is disconnected.
2. **Admin visibility.** A summary endpoint reports counts by storage state; `AdminView` shows a
   persistent warning when files are pending with no Drive connected, and when any row is
   `MIRROR_FAILED`.

### 6.5 Drive folder layout

One `Slack Archive` folder under the existing ClubPM Drive root, with a per-channel subfolder cached
on `SlackChannelArchive.driveFolderId`. Per-**channel** rather than per-project, because a channel can
belong to several projects — a per-project layout would have to pick one arbitrarily or store the file
twice.

---

## 7. Access control

New `backend/src/middleware/projectChatAccess.ts`, mirroring `taskAccess.ts`'s shape:

```ts
export async function getProjectChatAccess(memberId, projectId)
  : Promise<{ canRead: boolean; isAdmin: boolean; channelIds: string[] }>
export async function requireProjectChatRead(req, res, next)
```

`canRead` is `isAdmin || project member`. `channelIds` is the project's linked channel ids (notification
targets ∪ legacy field) — returning them from the same call means every read route is scoped by
construction and cannot accidentally serve another project's channel.

**The file proxy is checked too.** It is the route that serves the actual private content, and it is
the one most easily forgotten because it is fetched by the browser rather than by app code.

---

## 8. API

All routes in a new `backend/src/api/projectChat.ts`, mounted under `/api/projects`. Every handler
reads **`req.memberId`**, never `req.session` — the project-wide convention that Bearer-authenticated
clients depend on.

```
GET  /api/projects/:projectId/chat/channels
       → linked channels + archive state (messageCount, lastMessageAt, backfillStatus)

GET  /api/projects/:projectId/chat/messages?channelId=&before=<ts>&limit=50
       → reverse-chronological page of top-level messages (threadTs null),
         each with rendered token array, files, reactions, replyCount

GET  /api/projects/:projectId/chat/thread/:ts
       → the parent plus its replies, oldest first

GET  /api/projects/:projectId/chat/search?q=&channelId=
       → ILIKE over text, 50 max, newest first

GET  /api/projects/:projectId/chat/files/:slackFileId[?token=<bearer>]
       → streams the attachment from Slack / Drive / disk per storage state

POST /api/projects/:projectId/chat/backfill   { channelId }     [admin only]
GET  /api/projects/:projectId/chat/backfill/:channelId          → progress

GET  /api/projects/:projectId/chat/storage-health               [admin only]
       → counts by SlackFileStorage + whether Drive is connected
```

### 8.1 The file proxy needs `?token=`

An `<img>` tag cannot set an `Authorization` header. Cookie auth covers most browsers, but
Bearer-token users — Brave and Safari, which is exactly why the Bearer fallback exists — would find
**every image in the archive broken** while it worked perfectly for anyone on Chrome.

The proxy therefore accepts a signed `?token=` query param verified with `verifyBearerToken()`,
following the precedent already set for `EventSource` in `sse.ts:20`. `clubPmClient.js` exports a
`chatFileUrl()` helper that appends the token when one is in localStorage, so no component builds the
URL by hand.

---

## 9. Backfill

Admin-triggered per channel. There is no job queue in this codebase, so the runner is an in-process
async function whose progress lives in the `SlackChannelArchive` row:

1. Set `backfillStatus = RUNNING`.
2. Page `conversations.history` backwards, persisting `backfillCursor` **after each page**, so a crash
   or redeploy resumes rather than restarting.
3. For each message with `reply_count > 0`, page `conversations.replies`.
4. Upsert on `@@unique([slackChannelId, ts])` — replay is free.
5. File rows are created as `SLACK_ONLY`; the nightly sweep mirrors them on its normal schedule. A
   backfilled file that is already older than the 60-day cutoff is swept that same night, which is
   the intended behavior and the reason the cutoff is checked against `postedAt` rather than against
   ingest time.
6. `COMPLETE` (with `backfilledAt`) or `FAILED` (with `backfillError`).

The same `shouldArchive()` predicate governs backfill, so live and historical ingest cannot diverge.
Slack's `WebClient` retries 429s automatically; the runner additionally paces requests to respect the
Tier-3 limit on `conversations.history`.

---

## 10. Live updates

`slackArchiveService` emits on the existing bus after a successful ingest:

```ts
activityBus.emit(`slack-chat:${slackChannelId}`, payload);
```

`sse.ts` resolves the connecting member's accessible channel ids once at connect time and subscribes
to each topic, alongside the existing `notification:${memberId}` subscription. Reusing the one stream
means **no second `EventSource` and no new auth path** — the `?token=` flow, heartbeat, and cleanup
already work.

`NotificationBell.jsx` — which owns the app's only `EventSource` — dispatches a
`clubpm:slack-message` window `CustomEvent`, matching the established `clubpm:reward-granted` /
`clubpm:achievement-unlocked` idiom. `ChatTab` listens for it and appends.

**Known limitation:** channel subscriptions are computed at connect time, so a member added to a
project mid-stream sees its messages only after a reconnect. Acceptable — the alternative is
re-resolving permissions on every emit.

---

## 11. Frontend

### 11.1 Keeping `ProjectDetail.jsx` out of it

`src/pages/ClubPM/ProjectDetail.jsx` is already 3,613 lines. Its total change is **one `NAV_TABS`
entry and one `activeTab === "chat"` render line.** Everything real lives in
`src/components/clubpm/chat/`:

| Component | Responsibility |
|---|---|
| `ChatTab.jsx` | Channel picker, paginated message list, reverse-infinite scroll, search box, SSE append, backfill button for admins |
| `ChatMessage.jsx` | One message: author snapshot, timestamp, edited/deleted state, reactions, files, reply affordance |
| `ChatThreadDrawer.jsx` | A thread's replies in a side drawer |
| `ChatRichText.jsx` | Token array → JSX. **No `<span>`, no `<p>`** (§4.1) |
| `ChatFileAttachment.jsx` | Image thumbnail vs. generic file chip; `UNAVAILABLE` renders an explanatory placeholder, not a broken image |

Read-only. No composer, no reaction buttons, no reply box — writing back to Slack is a later pass.

### 11.2 Client

`src/api/clubPmClient.js` gains `getChatChannels`, `getChatMessages`, `getChatThread`, `searchChat`,
`startChatBackfill`, `getChatBackfillStatus`, `getChatStorageHealth`, and `chatFileUrl()` (§8.1).

### 11.3 CSS

New `cpm-chat-*` rules appended to `public/clubpm-theme.css` (ClubPM-only surface, so not the public
stylesheet). Tokens must be verified by grepping the actual `:root`/`.clubpm-app` blocks before use —
several `--pm-*` names documented elsewhere are not in fact declared, and an undeclared custom
property fails silently rather than erroring.

### 11.4 Course and tour sync — same commit

Per `CLAUDE.md`, adding a project tab moves three artifacts **in the same commit**, enforced by
`scripts/check-tour-anchors.js` (also wired into the build):

1. `src/clubpm/tour/tourAnchors.js` — add `project.tab.chat`.
2. `docs/courses/ANCHORS.md` — the same id and route.
3. Any `docs/courses/**/*.steps.json` walkthrough that enumerates the project tabs, plus its
   `walkthroughs/README.md` outline.

The anchor check is a **static scan**, so the id must appear as a string literal — never built by
template interpolation. A green check also does not prove the element ever mounts.

---

## 12. Testing

Pure logic gets real unit tests; I/O paths get targeted ones.

| Unit | Tests |
|---|---|
| `slackMessageFormat.ts` | Each token type; nested formatting; unmatched backticks; `<@U…>` with and without a known member; malformed `<…>`; text that is only an emoji |
| `slackArchivePolicy.ts` | Every skip reason; every archived subtype; a bot message with human-looking text; a message with `text: ""` but files attached |
| `slackFileService.ts` | State transitions incl. `file_not_found` → `UNAVAILABLE`, Drive-null → `LOCAL`, 4th failure → `MIRROR_FAILED`; re-running a `DRIVE` row is a no-op |
| `projectChatAccess.ts` | Non-member denied; member allowed; admin allowed; `channelIds` unions notification targets with the legacy field and never leaks another project's channel |
| `slackBackfillService.ts` | Resumes from `backfillCursor`; re-running is idempotent via the ts unique constraint |

Manual verification requiring a real workspace: post → appears live; edit → shows edited; delete →
tombstone; react → reaction appears; share an image → renders through the proxy in a Bearer-only
browser (Brave) as well as a cookie browser.

**Not verifiable before ship:** the Drive sweep on a genuinely 60-day-old file. It is exercised by
forcing the cutoff in a test and by manually invoking the sweep with a temporary cutoff of 0 days
against a freshly shared file.

---

## 13. Implementation phases

Grouped so each phase touches one layer's file cluster, keeping context tight. Every phase respects
the `CLAUDE.md` limits (≤4 files, ≤2 new components, a Prisma migration never shares a phase with
frontend work), and each ends with `npm run build` at the repo root plus `npx tsc --noEmit` in
`backend/`.

| # | Phase | Files |
|---|---|---|
| 1 | Schema + migration | `prisma/schema.prisma` (+ migration; then `prisma generate`) |
| 2 | Pure logic + tests | `slackMessageFormat.ts`, `slackArchivePolicy.ts` (+ 2 test files) |
| 3 | Ingest service + event wiring | `slackArchiveService.ts`, `slack/events.ts`, `slack-manifest.yaml` |
| 4 | Access control + read API | `middleware/projectChatAccess.ts`, `api/projectChat.ts`, `app.ts` |
| 5 | File proxy + Drive sweep + emoji cache cron | `slackFileService.ts`, `slack/scheduler.ts`, `api/projectChat.ts` |
| 6 | Backfill runner | `slackBackfillService.ts`, `api/projectChat.ts` |
| 7 | SSE end to end | `api/sse.ts`, `NotificationBell.jsx` |
| 8 | Client + chat leaf components | `clubPmClient.js`, `ChatRichText.jsx`, `ChatFileAttachment.jsx` |
| 9 | Message + thread components | `ChatMessage.jsx`, `ChatThreadDrawer.jsx` |
| 10 | Container + wire up the tab + tour/course sync | `ChatTab.jsx`, `ProjectDetail.jsx`, `tourAnchors.js`, `docs/courses/ANCHORS.md`, step files |
| 11 | Styling | `public/clubpm-theme.css` |
| 12 | Admin surface | `AdminView.jsx` (backfill trigger, storage health warnings) |

Phases 8–10 split the five components three ways specifically to hold each phase to the ≤2-new-components
limit, building leaves before the containers that consume them.

**Phase 10 is a deliberate 5-file exception** to the ≤4-file guideline: `CLAUDE.md` requires the tab
registration, `tourAnchors.js`, `ANCHORS.md`, and the affected step files to land in the *same commit*,
and `scripts/check-tour-anchors.js` fails the build otherwise. Splitting them to satisfy the file count
would break a harder rule.

After phase 1, run `npx prisma generate` before anything else — a stale Prisma client produces
phantom `tsc` errors that look like real type bugs in code that is actually correct.

---

## 14. Out of scope

- **Posting from the website to Slack.** Deliberately deferred; this pass is Slack → website.
- Reaction and reply *authoring* from the web UI (part of the same later pass).
- Non-project-linked channels (a club-wide chat view).
- DMs and group DMs — never ingested, no scope requested.
- Slack's Block-Kit rendering, since bot messages are not archived at all.
