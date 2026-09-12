# Slack Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> Paste-able prompts: one per phase in [`2026-09-10-slack-portal-PHASES.md`](./2026-09-10-slack-portal-PHASES.md) (a controller session drives a subagent per task), or one per task in [`2026-09-10-slack-portal-SESSIONS.md`](./2026-09-10-slack-portal-SESSIONS.md).

**Goal:** Make Constellation a two-way portal to the SEARCH Slack workspace — every channel and DM readable (per Slack's own visibility rules), posting/replying/reacting/editing/uploading *as the member*, DMs run from the Members page (club-wide and a per-project version), and every Slack ping mirrored as a Constellation notification with read state synced both ways.

**Architecture:** Builds directly on the read-only archive on `feat/slack-chat-archive` (spec: `docs/superpowers/specs/2026-09-09-slack-chat-archive-design.md`). Ingest widens from "project-linked channels, humans only" to "every conversation any signed-in member or the bot can see", fed by Slack **user events** (delivered once per event across all authorizing users). A mirrored `SlackConversationMember` table becomes the single source of truth for who may read what. A new conversation-scoped API (`/api/chat/*`) serves reads and performs writes with the **member's own user token**, writing each sent message into the archive from Slack's response rather than waiting for the echo. Pings are computed from each ingested message by one pure function and delivered through the existing notification table + SSE stream.

**Tech Stack:** Node 20 / Express / Prisma 6 / PostgreSQL / `@slack/bolt` 4 (Socket Mode) / `@slack/web-api` 7 (`filesUploadV2`) / React 19 / React Router 7 / plain CSS custom properties.

**Branch:** `feat/slack-portal`, cut from `main` with this plan as its first commit. The read-only archive is merged (PR #38), so no stacking is needed.

---

## Design decisions (locked — do not re-litigate during execution)

| # | Decision | Why |
|---|---|---|
| D1 | **Post as the member via their user token.** Never bot impersonation (`chat:write.customize`). | Bot posts carry an APP badge, can't DM as the person, and carry `bot_id`. |
| D2 | **DMs are archived, readable ONLY by the conversation's participants. Admins are excluded.** | Chosen by the user 2026-09-10. Enforced in one pure function that has no admin input at all (Task 2), plus a static test that the access modules never mention `isAdmin`. |
| D3 | **Slack is the source of truth for visibility.** Public channel → any member. Private channel / DM / group DM → Slack members of that conversation only. Project linkage decides *where* a channel shows up, never *who* may read it. | **Behavior change:** today, project members (and all admins) can read a linked *private* channel even if they are not in it in Slack. After Task 8 they cannot. |
| D4 | **Bot/app messages are archived** (flagged `isBot`, Block Kit kept raw in `botPayload`, rendered at read). | Reverses spec §2.1 of the archive design: a portal that hides every digest and task card isn't a portal. Forward-only — bot messages already dropped are gone. |
| D5 | **Only public-channel attachments go to Google Drive.** Private channels, DMs and group DMs mirror to local disk only. | The Drive bot account is browsed by humans; a participant-only DM must not land there. Files already mirrored from linked private channels stay where they are. |
| D6 | **`/uploads/slack/*` is never served statically.** | Pre-existing hole found while planning: `app.ts` serves all of `uploads/` publicly, and the archive's local-disk fallback writes into `uploads/slack/`, bypassing the proxy's access check. Fixed in Task 6, before any DM file can reach disk. |
| D7 | **The send path writes the archive row itself** from `chat.postMessage`'s response (`forceHuman`), and the echo event upserts the same `(channel, ts)`. | The UI must not depend on event timing, or on whether Slack stamps a user-token post with `bot_id`. |
| D8 | **Pings mirror Slack's default rules**: DMs and group DMs, direct `@mentions` (and user-group mentions) of conversation members, `@channel`/`@here`/`@everyone`, and replies in threads you started or replied to. The strongest ping wins, one notification per recipient per message. | Slack's per-user mute and keyword settings have **no API**, so they can't be mirrored. Constellation adds its own per-conversation mute and per-type toggles. |
| D9 | **Our own bot's messages never ping, and `SLACK_*` notifications are never DM'd back to Slack.** | Two loop guards. Constellation already notifies natively for everything the bot posts, and the Slack ping already happened in Slack. |
| D10 | **Backfill never creates notifications.** Pings are delivered only from the live event path (`events.ts`). | Importing 90 days of history must not fire hundreds of notifications. |
| D11 | **Read sync:** Constellation→Slack is immediate (`conversations.mark`). Slack→Constellation is polled every 2 min (`conversations.info.last_read`) for conversations that have unread Slack notifications. Posting in a conversation marks it read. | `channel_marked`/`im_marked` are RTM-only; the Events API never reports reads. |
| D12 | **DMs live on the Members page.** `/clubpm/members` for everyone; the project **Members** tab renders the same component filtered to the project's roster. The DM is URL state (`?dm=<channelId>`), so notifications deep-link. | User requirement. |
| D13 | **Group DMs are capped at 8 others** (9 people). | Slack's `conversations.open` limit. Larger groups belong in a channel. |
| D14 | **The existing per-event "Slack DM / Both / Dashboard / Off" preference becomes real** (Task 27). | Today `Member.notificationChannels` is saved by the UI and read by nothing. The five call sites exposed in the preferences UI pair `createNotification` with a hand-rolled `queueDm`. |

## Global constraints

- **Every API handler reads `req.memberId`, never `req.session`.** Only `auth.ts` may touch `req.session`.
- **Ingest must never call `memberService.resolveSlackMember()`.** It *creates* `Member` rows.
- **Nothing in `src/components/clubpm/chat/` may emit `<span>` or `<p>`.** `public/clubpm-theme.css` has `.clubpm-app p, .clubpm-app span { color: inherit !important }`. Use `<a> <code> <b> <i> <s> <div> <label> <button>`.
- **Declared CSS tokens only** (verified in `:root` at `public/clubpm-theme.css:643-670`): `--pm-bg-base --pm-bg-surface --pm-bg-elevated --pm-bg-overlay --pm-accent-teal --pm-accent-amber --pm-accent-coral --pm-accent-violet --pm-text-primary --pm-text-secondary --pm-text-muted --pm-border --pm-border-active --pm-shadow-card --pm-font-display --pm-font-body --pm-font-mono`. `--pm-surface` / `--pm-elevated` do **not** exist.
- **Icons are Font Awesome only.** Emoji characters appear only as *message content* (reactions, `:shortcode:` rendering), never as UI icons.
- **Font Awesome ships as a generated subset.** `npm run build` runs `prebuild` → `npm run build:icons`, which scans the source for `fa-*` class names and regenerates `public/fa-subset.css` and `public/webfonts/`. Write icon classes as **string literals** (the scan is static; a class built by interpolation needs a line in `scripts/fa-icons-extra.txt`). Any task that adds an icon must commit the regenerated `public/fa-subset.css` (and `public/webfonts/` if it changed) alongside its components.
- **Backend tests are standalone `tsx` scripts** using the inline `check()` harness: `cd backend && npx tsx src/<path>.test.ts`. Frontend tests are Jest: `npx react-scripts test --watchAll=false <path>`.
- **Never Read these in full — Grep first:** `backend/prisma/schema.prisma` (~2,600 lines), `public/clubpm-theme.css` (~26,600), `src/pages/ClubPM/ProjectDetail.jsx` (~3,600), `backend/src/api/tasks.ts`, `backend/src/slack/scheduler.ts`.
- **Tour/course sync:** adding a nav item or project tab means `src/clubpm/tour/tourAnchors.js` + `docs/courses/ANCHORS.md` change **in the same commit**. `node scripts/check-tour-anchors.js` enforces it, and `npm test` runs it first.
- **After every task:** `npm run build` (repo root) and `cd backend && npx tsc --noEmit`. Both must pass before the next task. After Task 1, run `npx prisma generate` before anything else.
- **Slack ts ordering:** never compare `ts` strings with `<`, and never with `parseFloat` when precision matters. Use `compareTs()` (Task 9).

## Operator steps (human, outside the code)

1. **After Task 3:** update the Slack app from `slack-manifest.yaml` (api.slack.com → your app → App Manifest), then **Reinstall to Workspace**. A workspace admin must approve the new user scopes. The consent screen now says the app can read and send messages in your channels and DMs; tell members before they see it.
2. **After Task 3 is deployed:** every member signs in again. The UI prompts them (Task 14). Until they do, nothing of theirs is read or sent.
3. **After Task 10 is deployed:** an admin runs **Backfill public channels** (Admin → Slack archive panel, or `POST /api/slack-archive/backfill-public`). Each member's own DM history is imported the first time they open the Members page (Task 20).
4. **Drive quota:** only public-channel files go to Drive (D5), but the bot account's free Drive has 15 GB. Watch the storage-health panel.

## Known limitations (accepted)

- Slack's per-user mute and keyword settings, and Do Not Disturb, can't be read. Constellation has its own mute (D8).
- Typing indicators, presence, huddles, drafts and "Later" have no API. Buttons in *other* apps' Block Kit messages can't be clicked from outside Slack; they render as inert chips with the message text.
- A Slack guest who signs in to Constellation can read public channels through it that Slack itself hides from them. Fixing this needs a `Member.isSlackGuest` flag from `users.info.is_restricted`; out of scope.
- Membership of a private channel the bot isn't in is kept current by user events while at least one signed-in member remains in it, and by the nightly reconcile.
- Unread counts start from when a member last signed in with Slack (`slackUserTokenAt`), so imported history doesn't show as unread.

---

## File structure

**Backend — created**

| File | Responsibility |
|---|---|
| `backend/src/services/slackScopes.ts` | Pure. The user-scope list and capability rules (`hasCapability`, `capabilitiesOf`, `needsReconnect`). |
| `backend/src/services/slackConversationAccess.ts` | Pure. `canReadConversation` / `canPostToConversation` / kind mapping. No admin input. |
| `backend/src/services/slackMembershipService.ts` | Mirror of Slack conversation membership; `resolveReadClient()`; joining public channels; nightly reconcile. |
| `backend/src/middleware/conversationAccess.ts` | DB wrapper over the pure access rules; `requireConversationRead`; `filterReadableChannels`. |
| `backend/src/services/chatDto.ts` | Shared message DTO + format context (extracted from `projectChat.ts`). |
| `backend/src/services/slackReadService.ts` | `compareTs`, `idsReadUpTo`, unread counts, read cursors, `conversations.mark`. |
| `backend/src/api/chat.ts` | `/api/chat/*`: conversation list, reads, file proxy, read mark, and every write. |
| `backend/src/services/slackSendRules.ts` | Pure. Slack error → HTTP mapping, DM target validation. |
| `backend/src/services/slackSendService.ts` | Post / edit / delete / react / upload / open DM / join, as the member. |
| `backend/src/services/slackBlocks.ts` | Pure. Block Kit + legacy attachments → simplified render tree. |
| `backend/src/services/slackPings.ts` | Pure. Who a message pings, and how. |
| `backend/src/services/slackNotifyService.ts` | Delivers pings as notifications; retracts on delete; builds deep links. |
| `backend/src/services/slackReadSyncService.ts` | Polls Slack `last_read` and clears Constellation notifications. |
| `backend/src/services/notificationRouting.ts` | Pure. Per-type delivery route (in-app / Slack DM / both / off). |

**Frontend — created**

`src/components/clubpm/chat/`: `ChatConversation.jsx`, `ChatComposer.jsx`, `ChatBlocks.jsx`, `encodeOutgoing.js`, `emojiShortcodes.js`. `src/components/clubpm/members/`: `DmInbox.jsx`, `DmPanel.jsx`. `src/pages/ClubPM/ChatPage.jsx`.

**Modified (both sides)**

`schema.prisma`, `auth.ts`, `slackUserTokenService.ts`, `slack-manifest.yaml`, `slackArchivePolicy.ts`, `slackArchiveService.ts`, `slack/events.ts`, `slack/bolt.ts`, `slack/scheduler.ts`, `slackFileService.ts`, `slackBackfillService.ts`, `app.ts`, `sse.ts`, `projectChatAccess.ts`, `projectChat.ts`, `notificationCrud.ts`, `members.ts`, `tasks.ts`, `projects.ts`, `taskCompletionService.ts`, `clubPmClient.js`, `ChatTab.jsx`, `ChatMessage.jsx`, `ChatThreadDrawer.jsx`, `ChatFileAttachment.jsx`, `ChatRichText.jsx`, `NotificationBell.jsx`, `NotificationCenter.jsx`, `NotificationPreferences.jsx`, `MembersView.jsx`, `ProjectDetail.jsx`, `AppShell.jsx`, `App.js`, `tourAnchors.js`, `docs/courses/ANCHORS.md`, `public/clubpm-theme.css`, `CLAUDE.md`.

## Task map

| Part | Task | Scope | Weight |
|---|---|---|---|
| A Foundations | 1 | Schema + migration | light |
| | 2 | Pure: scopes + conversation access | light |
| | 3 | OAuth scopes, token plumbing, manifest **(operator step after)** | medium |
| B Ingest everything | 4 | Policy (bot messages) + ingest widening | heavy |
| | 5 | Membership mirror, event wiring, public-channel auto-join | heavy |
| | 6 | Token-aware files, DM files off Drive, `/uploads/slack` guard, backfill generalization | heavy |
| | 7 | Live updates for every conversation (SSE) | light |
| C Conversation API | 8 | Conversation access middleware + project chat filter | medium |
| | 9 | `chatDto` extraction + read service | medium |
| | 10 | `/api/chat` read routes, mount, admin public backfill | heavy |
| | 11 | Send service + write routes | heavy |
| D Chat UI | 12 | Client functions + conversation-scoped leaf components | medium |
| | 13 | `ChatConversation` + `ChatTab` refactor | medium |
| | 14 | Composer + outgoing encoder | heavy |
| | 15 | Message actions, emoji, thread replies | heavy |
| | 16 | Block Kit renderer (backend) | medium |
| | 17 | Block Kit renderer (frontend) | light |
| | 18 | `/clubpm/chat` page + nav + anchors | medium |
| E DMs on Members | 19 | `DmInbox` + `DmPanel` | medium |
| | 20 | `MembersView`: project scope, Message buttons, group DMs, DM import | heavy |
| | 21 | Project Members tab + `?tab=` deep links + anchors | medium |
| | 22 | Styling (chat, composer, page, members/DM) | medium |
| F Notification sync | 23 | Pure ping rules | medium |
| | 24 | Ping delivery + retraction + read on own post | heavy |
| | 25 | Slack→Constellation read sync + mute backend | medium |
| | 26 | Notification UI (bell, center, preferences, mute) | medium |
| | 27 | Constellation→Slack parity (`notificationChannels` made real) | medium |
| G Close-out | 28 | End-to-end verification, cleanup, docs | medium |

---

# Part A — Foundations

## Task 1: Schema and migration

**Files:**
- Modify: `backend/prisma/schema.prisma` (+ one generated migration)

**Interfaces produced:** enum `SlackConversationKind`; `SlackChannelArchive.kind`; `SlackMessage.isBot`, `SlackMessage.botPayload`; models `SlackConversationMember` (composite id accessor `slackChannelId_slackUserId`) and `SlackReadCursor` (accessor `memberId_slackChannelId`); `Member.slackUserScopes`, `Member.mutedSlackChannelIds`, `Member.slackReadCursors`; `Notification.slackChannelId`, `Notification.slackTs`; `NotificationType` values `SLACK_DM`, `SLACK_MENTION`, `SLACK_THREAD_REPLY`, `SLACK_BROADCAST`.

- [ ] **Step 1: Add the four notification types**

Grep `^enum NotificationType` and add these four lines before its closing `}` (after `TRAINING_EXPIRING`):

```prisma
  // Slack pings mirrored into Constellation (slack portal). Never DM'd back to Slack.
  SLACK_DM
  SLACK_MENTION
  SLACK_THREAD_REPLY
  SLACK_BROADCAST
```

- [ ] **Step 2: Extend `Member`**

Grep `slackUserTokenAt     DateTime?` inside `model Member` and insert directly below it:

```prisma
  /// Slack USER scopes granted at sign-in (oauth.v2.access authed_user.scope).
  /// Drives which portal features the UI offers — see services/slackScopes.ts.
  slackUserScopes      String[]  @default([])
  /// Conversations muted in Constellation. Slack's own mute has no API, so this
  /// is a separate, Constellation-only mute (it silences mirrored pings).
  mutedSlackChannelIds String[]  @default([])
```

Then grep `blogThreadComments      BlogThreadComment[]` (the last relation line in `model Member`) and add below it:

```prisma
  slackReadCursors        SlackReadCursor[]
```

- [ ] **Step 3: Extend `Notification`**

Grep `^model Notification \{`. Insert below `metadata    Json?`:

```prisma
  /// Set only on SLACK_* notifications: the conversation and message that pinged.
  slackChannelId String?
  slackTs        String?
```

and add this index below the existing `@@index([projectId])`:

```prisma
  @@index([recipientId, slackChannelId, read])
```

- [ ] **Step 4: Extend the archive models**

Grep `^model SlackChannelArchive`. Insert below `archiveEnabled   Boolean @default(true)`:

```prisma
  /// Who may read this conversation is decided by kind + SlackConversationMember
  /// (services/slackConversationAccess.ts). isPrivate is kept for old readers.
  kind             SlackConversationKind @default(CHANNEL)
```

Grep `^model SlackMessage \{`. Insert below `reactions       Json?`:

```prisma
  /// Bot/app message. Archived since the portal pass (previously dropped).
  isBot           Boolean   @default(false)
  /// Raw { blocks, attachments } for bot messages. Rendered on READ by
  /// services/slackBlocks.ts, so improving the renderer never needs a backfill.
  botPayload      Json?
```

- [ ] **Step 5: Append the new enum and models**

Append to the end of `schema.prisma`:

```prisma
// ─────────────────────────────────────────────────────────────────────────────
// Slack portal
// ─────────────────────────────────────────────────────────────────────────────

enum SlackConversationKind {
  CHANNEL          // public channel — any club member may read
  PRIVATE_CHANNEL  // participants only
  IM               // 1:1 DM — participants only, admins included in "not allowed"
  MPIM             // group DM — participants only
}

/// Mirror of Slack conversation membership, and the SOURCE OF TRUTH for who
/// may read a private channel, DM or group DM through Constellation. Keyed on
/// Slack user id rather than Member id, because a DM partner may have no
/// Member row at all.
model SlackConversationMember {
  slackChannelId String
  slackUserId    String
  addedAt        DateTime @default(now())

  @@id([slackChannelId, slackUserId])
  @@index([slackUserId])
}

/// A member's read position in one conversation. Advanced from Constellation
/// (viewing), from Slack (polled last_read), and implicitly when they post.
model SlackReadCursor {
  memberId       String
  member         Member   @relation(fields: [memberId], references: [id], onDelete: Cascade)
  slackChannelId String
  lastReadTs     String
  lastReadAt     DateTime
  updatedAt      DateTime @updatedAt

  @@id([memberId, slackChannelId])
}
```

- [ ] **Step 6: Create the migration without applying it**

Run: `cd backend && npx prisma migrate dev --create-only --name slack_portal`
Expected: a new folder `backend/prisma/migrations/<timestamp>_slack_portal/` containing `migration.sql`.

- [ ] **Step 7: Backfill `kind` for existing private archives**

Existing rows default to `CHANNEL`, and some of them are private linked channels. Left alone, D3 would make them readable by everyone. Append to the end of the generated `migration.sql`:

```sql
-- Existing archive rows default to CHANNEL; private ones must not become
-- world-readable under the portal's access rules.
UPDATE "SlackChannelArchive" SET "kind" = 'PRIVATE_CHANNEL' WHERE "isPrivate" = true;
```

- [ ] **Step 8: Apply and regenerate**

Run: `cd backend && npx prisma migrate dev && npx prisma generate`
Expected: "Your database is now in sync with your schema", then the client is generated.

- [ ] **Step 9: Gate**

Run: `cd backend && npx tsc --noEmit` → no errors. `npm run build` (root) → compiles.

- [ ] **Step 10: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(slack-portal): schema for membership mirror, read cursors, bot messages, Slack notifications"
```

---

## Task 2: Pure logic — scopes and conversation access

**Files:**
- Create: `backend/src/services/slackScopes.ts`, `backend/src/services/slackScopes.test.ts`
- Create: `backend/src/services/slackConversationAccess.ts`, `backend/src/services/slackConversationAccess.test.ts`

**Interfaces produced:** `SLACK_USER_SCOPES`, `SlackCapability`, `parseScopes`, `hasCapability`, `capabilitiesOf`, `needsReconnect`; `ConversationKind`, `canReadConversation`, `canPostToConversation`, `kindFromChannelType`, `kindFromConversation`, `kindFromChannelId`.

- [ ] **Step 1: Write the failing scopes test**

`backend/src/services/slackScopes.test.ts`:

```ts
// Pure-logic tests for slackScopes. No DB, no Slack.
// Run: cd backend && npx tsx src/services/slackScopes.test.ts
import { SLACK_USER_SCOPES, parseScopes, hasCapability, capabilitiesOf, needsReconnect } from "./slackScopes.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}

// The scope set every member had before the portal pass.
const LEGACY = ["users:read", "users:read.email", "channels:read", "groups:read", "mpim:read", "channels:write.invites", "groups:write.invites"];

check("parseScopes splits, trims, dedupes", JSON.stringify(parseScopes(" a,b , a,,c ")) === JSON.stringify(["a", "b", "c"]));
check("parseScopes(null) is []", parseScopes(null).length === 0);
check("SLACK_USER_SCOPES has no duplicates", new Set(SLACK_USER_SCOPES).size === SLACK_USER_SCOPES.length);
check("legacy scopes cannot post", !hasCapability(LEGACY, "post"));
check("legacy scopes cannot read DMs", !hasCapability(LEGACY, "read"));
check("legacy scopes need reconnect", needsReconnect(LEGACY));
check("full scopes need no reconnect", !needsReconnect([...SLACK_USER_SCOPES]));
{
  const caps = capabilitiesOf([...SLACK_USER_SCOPES]);
  check("full scopes grant every capability", Object.values(caps).every(Boolean));
}
{
  const caps = capabilitiesOf(["chat:write"]);
  check("chat:write alone grants post", caps.post === true);
  check("chat:write alone does not grant dm", caps.dm === false);
  check("chat:write alone does not grant files", caps.files === false);
}
check("react needs reactions:write", hasCapability(["reactions:write"], "react"));
check("join needs channels:write", hasCapability(["channels:write"], "join") && !hasCapability([], "join"));

console.log(`\nslackScopes: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run it, see it fail**

Run: `cd backend && npx tsx src/services/slackScopes.test.ts`
Expected: FAIL — `Cannot find module './slackScopes.js'`.

- [ ] **Step 3: Implement `slackScopes.ts`**

```ts
/**
 * The Slack USER scopes Constellation requests, and what each unlocks.
 *
 * Pure — no Slack, no Prisma — so the sign-in route (auth.ts), /auth/me, and
 * every write path agree on one definition, and it is unit-testable.
 */
export const SLACK_USER_SCOPES = [
  // Pre-portal: roster, the channel picker, inviting the bot.
  "users:read", "users:read.email",
  "channels:read", "groups:read", "mpim:read", "im:read",
  "channels:write.invites", "groups:write.invites",
  // Portal: read history the bot cannot see (DMs, private channels it isn't in).
  "channels:history", "groups:history", "im:history", "mpim:history",
  // Portal: act as the member.
  "chat:write", "reactions:write", "files:read", "files:write",
  "im:write", "mpim:write",
  // Portal: read cursors (conversations.mark) and joining public channels.
  "channels:write", "groups:write",
] as const;

export type SlackCapability = "read" | "post" | "dm" | "react" | "files" | "mark" | "join";

const REQUIRES: Record<SlackCapability, readonly string[]> = {
  read:  ["channels:history", "groups:history", "im:history", "mpim:history", "im:read", "mpim:read"],
  post:  ["chat:write"],
  dm:    ["chat:write", "im:write", "mpim:write", "im:history", "mpim:history"],
  react: ["reactions:write"],
  files: ["files:read", "files:write"],
  mark:  ["channels:write", "groups:write", "im:write", "mpim:write"],
  join:  ["channels:write"],
};

/** Slack returns granted scopes as one comma-separated string. */
export function parseScopes(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))];
}

export function hasCapability(granted: readonly string[], cap: SlackCapability): boolean {
  const set = new Set(granted);
  return REQUIRES[cap].every((s) => set.has(s));
}

export function capabilitiesOf(granted: readonly string[]): Record<SlackCapability, boolean> {
  const out = {} as Record<SlackCapability, boolean>;
  for (const cap of Object.keys(REQUIRES) as SlackCapability[]) out[cap] = hasCapability(granted, cap);
  return out;
}

/** True when the member must run Slack sign-in again to get the portal scopes. */
export function needsReconnect(granted: readonly string[]): boolean {
  const set = new Set(granted);
  return !SLACK_USER_SCOPES.every((s) => set.has(s));
}
```

- [ ] **Step 4: Run it, see it pass**

Run: `cd backend && npx tsx src/services/slackScopes.test.ts`
Expected: `slackScopes: 13 passed, 0 failed`.

- [ ] **Step 5: Write the failing access test**

`backend/src/services/slackConversationAccess.test.ts`:

```ts
// Pure-logic tests for slackConversationAccess, plus a static guard.
// Run: cd backend && npx tsx src/services/slackConversationAccess.test.ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  canReadConversation, canPostToConversation,
  kindFromChannelType, kindFromConversation, kindFromChannelId,
} from "./slackConversationAccess.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}

check("public channel: non-participant may read", canReadConversation({ kind: "CHANNEL", isParticipant: false }));
check("private channel: non-participant may NOT read", !canReadConversation({ kind: "PRIVATE_CHANNEL", isParticipant: false }));
check("DM: non-participant may NOT read", !canReadConversation({ kind: "IM", isParticipant: false }));
check("group DM: non-participant may NOT read", !canReadConversation({ kind: "MPIM", isParticipant: false }));
check("DM: participant may read", canReadConversation({ kind: "IM", isParticipant: true }));
check("public channel: posting needs membership", !canPostToConversation({ kind: "CHANNEL", isParticipant: false }));
check("public channel: member may post", canPostToConversation({ kind: "CHANNEL", isParticipant: true }));

check("channel_type im → IM", kindFromChannelType("im") === "IM");
check("channel_type mpim → MPIM", kindFromChannelType("mpim") === "MPIM");
check("channel_type group → PRIVATE_CHANNEL", kindFromChannelType("group") === "PRIVATE_CHANNEL");
check("channel_type channel → CHANNEL", kindFromChannelType("channel") === "CHANNEL");
check("unknown channel_type fails closed", kindFromChannelType("weird") === "PRIVATE_CHANNEL");
check("undefined channel_type fails closed", kindFromChannelType(undefined) === "PRIVATE_CHANNEL");

check("info is_im → IM", kindFromConversation({ is_im: true }) === "IM");
check("info is_mpim → MPIM", kindFromConversation({ is_mpim: true, is_private: true }) === "MPIM");
check("info is_private → PRIVATE_CHANNEL", kindFromConversation({ is_private: true }) === "PRIVATE_CHANNEL");
check("info plain → CHANNEL", kindFromConversation({ is_channel: true }) === "CHANNEL");

check("D… id → IM", kindFromChannelId("D0123") === "IM");
// New workspaces issue C… ids for private channels too, so a bare C… id is
// NOT evidence of a public channel. Unknown must never widen access.
check("C… id alone fails closed", kindFromChannelId("C0123") === "PRIVATE_CHANNEL");

// Static guard: an admin bypass must be impossible to add by accident.
const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "slackConversationAccess.ts"), "utf8");
check("access module never mentions isAdmin", !/isAdmin/.test(src));

console.log(`\nslackConversationAccess: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 6: Run it, see it fail**

Run: `cd backend && npx tsx src/services/slackConversationAccess.test.ts`
Expected: FAIL — `Cannot find module`.

- [ ] **Step 7: Implement `slackConversationAccess.ts`**

```ts
/**
 * Who may read or post in a Slack conversation through Constellation.
 *
 * Mirrors Slack exactly:
 *   public channel              → any club member may read
 *   private channel, DM, group  → only members of that conversation in Slack
 *
 * There is deliberately NO administrator input anywhere in this module. A
 * Slack workspace admin cannot read a DM they are not in, so neither can a
 * Constellation admin. Keeping the flag out of every signature makes a bypass
 * impossible to add by accident; the test file also asserts this source never
 * names one.
 */
export type ConversationKind = "CHANNEL" | "PRIVATE_CHANNEL" | "IM" | "MPIM";

export function canReadConversation(input: { kind: ConversationKind; isParticipant: boolean }): boolean {
  if (input.kind === "CHANNEL") return true;
  return input.isParticipant;
}

/** Slack itself refuses posts from non-members (not_in_channel), even in public channels. */
export function canPostToConversation(input: { kind: ConversationKind; isParticipant: boolean }): boolean {
  return input.isParticipant;
}

/**
 * From a message event's `channel_type`. Unknown values fail CLOSED: a
 * mis-classified private conversation must never become world-readable.
 */
export function kindFromChannelType(channelType: string | undefined): ConversationKind {
  switch (channelType) {
    case "im": return "IM";
    case "mpim": return "MPIM";
    case "group": return "PRIVATE_CHANNEL";
    case "channel": return "CHANNEL";
    default: return "PRIVATE_CHANNEL";
  }
}

/** From a conversations.info / conversations.list `channel` object. */
export function kindFromConversation(c: {
  is_im?: boolean; is_mpim?: boolean; is_private?: boolean; is_group?: boolean; is_channel?: boolean;
}): ConversationKind {
  if (c.is_im) return "IM";
  if (c.is_mpim) return "MPIM";
  if (c.is_private || c.is_group) return "PRIVATE_CHANNEL";
  return "CHANNEL";
}

/**
 * Last-resort guess from the id alone. D… is always a DM. Everything else is
 * treated as private: modern workspaces mint C… ids for private channels too.
 */
export function kindFromChannelId(id: string): ConversationKind {
  return id.startsWith("D") ? "IM" : "PRIVATE_CHANNEL";
}
```

- [ ] **Step 8: Run both tests, see them pass**

Run: `cd backend && npx tsx src/services/slackScopes.test.ts && npx tsx src/services/slackConversationAccess.test.ts`
Expected: `13 passed, 0 failed`, then `20 passed, 0 failed`.

- [ ] **Step 9: Gate + commit**

Run the gate (root build + backend tsc), then:

```bash
git add backend/src/services/slackScopes.ts backend/src/services/slackScopes.test.ts backend/src/services/slackConversationAccess.ts backend/src/services/slackConversationAccess.test.ts
git commit -m "feat(slack-portal): pure scope capabilities and conversation access rules"
```

---

## Task 3: OAuth scopes, token plumbing, manifest

**Files:**
- Modify: `backend/src/api/auth.ts`
- Modify: `backend/src/services/slackUserTokenService.ts`
- Modify: `slack-manifest.yaml`

**Interfaces produced:** `storeSlackUserToken(memberId, token, scopes?)`; `userClientFor(memberId, opts?) → { client, token, scopes, slackId } | null`; `/auth/me` gains `slackCapabilities` and `slackNeedsReconnect`.

- [ ] **Step 1: Request the portal scopes at sign-in**

In `backend/src/api/auth.ts`, add to the imports:

```ts
import { SLACK_USER_SCOPES, parseScopes, capabilitiesOf, needsReconnect } from "../services/slackScopes.js";
```

Grep `const scopes = \[` (in `GET /slack`) and replace the whole array literal and its `.join(",")` with:

```ts
  // One definition shared with /auth/me and every portal write path.
  const scopes = SLACK_USER_SCOPES.join(",");
```

- [ ] **Step 2: Persist the granted scopes**

In the callback, grep `authed_user?: {` and add `scope?: string;` to that type:

```ts
      authed_user?: {
        id: string;
        access_token: string;
        scope?: string;
      };
```

Grep `await storeSlackUserToken(member.id, accessToken);` and replace with:

```ts
    await storeSlackUserToken(member.id, accessToken, parseScopes(tokenData.authed_user.scope));
```

- [ ] **Step 3: Expose capabilities on `/auth/me`**

Grep `const authToken = signToken(member.id, tokenVersion);` in `GET /me` and replace that line plus the `res.json(...)` below it with:

```ts
  const authToken = signToken(member.id, tokenVersion);
  // Capabilities, never the token. A member with no stored token has none,
  // whatever scopes were recorded before it was cleared.
  const grantedScopes = member.slackUserToken ? member.slackUserScopes : [];
  res.json({
    ...safeMember,
    authToken,
    slackCapabilities: capabilitiesOf(grantedScopes),
    slackNeedsReconnect: needsReconnect(grantedScopes),
  });
```

- [ ] **Step 4: Store scopes and add `userClientFor` in the token service**

In `backend/src/services/slackUserTokenService.ts`, add at the top:

```ts
import { WebClient } from "@slack/web-api";
```

Replace `storeSlackUserToken` and `clearSlackUserToken` with:

```ts
export async function storeSlackUserToken(
  memberId: string,
  token: string | null | undefined,
  scopes?: string[]
): Promise<void> {
  if (!token) return;
  try {
    const encrypted = encryptSecret(token);
    if (!encrypted) return;
    await prisma.member.update({
      where: { id: memberId },
      data: {
        slackUserToken: encrypted,
        slackUserTokenAt: new Date(),
        ...(scopes ? { slackUserScopes: scopes } : {}),
      },
    });
  } catch (err) {
    console.warn(
      "[slackUserToken] could not persist Slack user token (is INTEGRATION_TOKEN_KEY set?):",
      err instanceof Error ? err.message : err
    );
  }
}

/** Forget a token Slack has told us is no longer valid, so the UI prompts a re-auth. */
export async function clearSlackUserToken(memberId: string): Promise<void> {
  try {
    await prisma.member.update({
      where: { id: memberId },
      data: { slackUserToken: null, slackUserTokenAt: null, slackUserScopes: [] },
    });
  } catch {
    // Best effort — a failed clear just means we retry the dead token once more.
  }
}
```

Append to the end of the file:

```ts
/**
 * A Slack client acting AS the member, for services with no Request in hand.
 *
 * `interactive` clients fail fast on rate limits instead of retrying for up to
 * half an hour (the WebClient default) — a user waiting on "Send" must get an
 * error, not a hung request. Background jobs (backfill, read sync) keep the
 * default retries.
 */
export async function userClientFor(
  memberId: string,
  opts: { interactive?: boolean } = {}
): Promise<{ client: WebClient; token: string; scopes: string[]; slackId: string } | null> {
  const m = await prisma.member.findUnique({
    where: { id: memberId },
    select: { slackId: true, slackUserToken: true, slackUserScopes: true },
  });
  const token = decryptSecret(m?.slackUserToken);
  if (!m || !token) return null;
  const client = opts.interactive
    ? new WebClient(token, { rejectRateLimitedCalls: true, retryConfig: { retries: 0 } })
    : new WebClient(token);
  return { client, token, scopes: m.slackUserScopes, slackId: m.slackId };
}
```

- [ ] **Step 5: Update the manifest**

In `slack-manifest.yaml`, replace the `bot:` and `user:` scope lists and the `event_subscriptions` block with:

```yaml
  scopes:
    bot:
      - app_mentions:read
      - chat:write
      - commands
      - channels:read
      - channels:history
      - channels:join
      - users:read
      - users:read.email
      - usergroups:read
      - im:write
      - groups:read
      - groups:history
      - reactions:read
      - files:read
      - emoji:read
    user:
      - users:read
      - users:read.email
      - channels:read
      - groups:read
      - mpim:read
      - im:read
      - channels:write.invites
      - groups:write.invites
      - channels:history
      - groups:history
      - im:history
      - mpim:history
      - chat:write
      - reactions:write
      - files:read
      - files:write
      - im:write
      - mpim:write
      - channels:write
      - groups:write
```

```yaml
  event_subscriptions:
    bot_events:
      - app_mention
      - message.channels
      - message.groups
      - channel_created
      - member_joined_channel
      - member_left_channel
      - reaction_added
      - reaction_removed
      - file_shared
    # Events on behalf of every member who signed in. Slack delivers each event
    # ONCE per app even when several authorizations can see it.
    user_events:
      - message.channels
      - message.groups
      - message.im
      - message.mpim
      - reaction_added
      - reaction_removed
      - member_joined_channel
      - member_left_channel
```

The user scope list must match `SLACK_USER_SCOPES` exactly. Check with:
`node -e "const y=require('fs').readFileSync('slack-manifest.yaml','utf8');console.log(['chat:write','im:history','channels:write','groups:write','files:write'].every(s=>y.includes('- '+s)))"` → `true`.

- [ ] **Step 6: Run the existing token test + gate**

Run: `cd backend && npx tsx src/services/slackUserTokenService.test.ts` (must still pass), then the gate.

- [ ] **Step 7: Commit**

```bash
git add backend/src/api/auth.ts backend/src/services/slackUserTokenService.ts slack-manifest.yaml
git commit -m "feat(slack-portal): request portal user scopes, persist grants, expose capabilities"
```

- [ ] **Step 8: STOP — operator step**

Tell the human: update the Slack app from the manifest and reinstall it (workspace admin approval), then sign in again. Verify `GET /auth/me` returns `slackCapabilities.post === true`. **If `member_joined_channel`/`member_left_channel` are refused as user events, remove them from `user_events` and note it: the nightly reconcile (Task 5) then carries private-channel membership alone.**

---

# Part B — Ingest every conversation

## Task 4: Archive policy (bot messages) and ingest widening

**Files:**
- Modify: `backend/src/services/slackArchivePolicy.ts` (full replacement below)
- Modify: `backend/src/services/slackArchivePolicy.test.ts` (full replacement below)
- Modify: `backend/src/services/slackArchiveService.ts` (full replacement below)

**Interfaces produced:** `ArchiveDecision` now carries `isBot` on `new`/`edit`; `RawSlackMessage` gains `blocks`, `attachments`, `bot_profile`, `username`, `channel_type`, `message.edited`. `slackArchiveService` exports `isIngestEnabled`, `resolveAuthor`, `botAuthor`, `ensureChannelArchive(channelId, client, hint?)`, `storeArchivedMessage(channelId, msg, isBot, client, { overwrite, forceHuman? })`, `emitChat(event)`, `ingestSlackMessage(msg, client) → IngestResult | null`, `applyReaction`, `clearSlackArchiveCaches`, types `Author`, `ChatEvent`, `IngestResult`.

**Removed:** `isArchivedChannel` (the project-linked gate). Nothing outside this file imports it.

- [ ] **Step 1: Replace the policy test (it will fail)**

Replace `backend/src/services/slackArchivePolicy.test.ts` entirely:

```ts
// Pure-logic unit tests for slackArchivePolicy. No DB, no Slack.
// Run: cd backend && npx tsx src/services/slackArchivePolicy.test.ts

import { shouldArchive } from "./slackArchivePolicy.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}
const BOT = "U0BOTBOT";
const d = (m: Parameters<typeof shouldArchive>[0]) => shouldArchive(m, BOT) as any;

console.log("shouldArchive");
check("plain human message is archived as human",
  d({ user: "U1", text: "hello", ts: "1.0" }).archive === true && d({ user: "U1", text: "hello", ts: "1.0" }).isBot === false);
// Portal pass (D4): bot messages are archived, flagged, never dropped.
check("bot_id message is archived as bot",
  d({ bot_id: "B123", text: "Standup time!", ts: "1.0" }).isBot === true);
check("our own bot user is archived as bot",
  d({ user: BOT, text: "hi", ts: "1.0" }).isBot === true);
check("bot_message subtype is archived as bot",
  d({ subtype: "bot_message", bot_id: "B1", text: "x", ts: "1.0" }).isBot === true);
check("blocks-only bot message is not empty",
  d({ bot_id: "B1", text: "", ts: "1.0", blocks: [{ type: "section" }] }).archive === true);
check("attachments-only bot message is not empty",
  d({ bot_id: "B1", text: "", ts: "1.0", attachments: [{ text: "x" }] }).archive === true);
check("channel_join is housekeeping",
  d({ subtype: "channel_join", user: "U1", text: "joined", ts: "1.0" }).reason === "housekeeping");
check("channel_topic is housekeeping",
  d({ subtype: "channel_topic", user: "U1", text: "set topic", ts: "1.0" }).reason === "housekeeping");
check("bot_add is housekeeping",
  d({ subtype: "bot_add", user: "U1", text: "added an app", ts: "1.0" }).reason === "housekeeping");
check("file_share with no text is archived",
  d({ subtype: "file_share", user: "U1", text: "", ts: "1.0", files: [{ id: "F1" }] }).kind === "new");
check("no text, files, blocks or attachments is empty",
  d({ user: "U1", text: "", ts: "1.0" }).reason === "empty");
check("thread_broadcast is archived",
  d({ subtype: "thread_broadcast", user: "U1", text: "also here", ts: "2.0", thread_ts: "1.0" }).kind === "new");
check("me_message is archived",
  d({ subtype: "me_message", user: "U1", text: "waves", ts: "1.0" }).kind === "new");
check("message_changed is an edit",
  d({ subtype: "message_changed", message: { user: "U1", text: "edited", ts: "1.0" } }).kind === "edit");
check("edited bot message is an edit flagged as bot",
  d({ subtype: "message_changed", message: { bot_id: "B1", text: "x", ts: "1.0" } }).isBot === true);
check("message_changed without an inner ts is unsupported",
  d({ subtype: "message_changed", message: { user: "U1", text: "x" } }).reason === "unsupported_subtype");
check("message_deleted is a delete",
  d({ subtype: "message_deleted", deleted_ts: "1.0" }).kind === "delete");
check("unknown subtype is skipped",
  d({ subtype: "message_replied", user: "U1", text: "x", ts: "1.0" }).reason === "unsupported_subtype");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

Run: `cd backend && npx tsx src/services/slackArchivePolicy.test.ts` → FAIL (bot cases report `reason: "bot"`).

- [ ] **Step 2: Replace the policy**

Replace `backend/src/services/slackArchivePolicy.ts` entirely:

```ts
/**
 * The single ingest filter for the Slack archive. Pure: no Prisma, no Slack.
 *
 * Since the portal pass (D4) bot and app messages are ARCHIVED, flagged isBot,
 * with their Block Kit kept raw for read-time rendering. Only membership and
 * channel-config noise is dropped. Every caller (live ingest, backfill) goes
 * through this one predicate so the two can never disagree.
 */

export type ArchiveDecision =
  | { archive: false; reason: "housekeeping" | "empty" | "unsupported_subtype" }
  | { archive: true; kind: "new" | "edit"; isBot: boolean }
  | { archive: true; kind: "delete" };

export interface RawSlackMessage {
  subtype?: string;
  bot_id?: string;
  user?: string;
  username?: string;
  bot_profile?: { name?: string; icons?: { image_48?: string } };
  text?: string;
  ts?: string;
  thread_ts?: string;
  files?: unknown[];
  blocks?: unknown[];
  attachments?: unknown[];
  /** "channel" | "group" | "im" | "mpim" on message events. */
  channel_type?: string;
  /** message_changed carries the new message here. */
  message?: {
    text?: string; user?: string; bot_id?: string; ts?: string; thread_ts?: string;
    blocks?: unknown[]; attachments?: unknown[]; edited?: { ts?: string };
  };
  previous_message?: { ts?: string };
  /** message_deleted carries the target ts here. */
  deleted_ts?: string;
}

/** Membership and channel-config noise Slack delivers as messages. */
const HOUSEKEEPING = new Set([
  "channel_join", "channel_leave", "channel_topic", "channel_purpose",
  "channel_name", "channel_archive", "channel_unarchive", "channel_posting_permissions",
  "group_join", "group_leave", "group_topic", "group_purpose", "group_name",
  "pinned_item", "unpinned_item", "bot_add", "bot_remove",
  "reminder_add", "tombstone", "huddle_thread",
]);

/** Subtypes that carry real, archivable content. */
const CONTENT_SUBTYPES = new Set<string | undefined>([
  undefined, "file_share", "thread_broadcast", "bot_message", "me_message",
]);

function isBotAuthored(m: { bot_id?: string; user?: string; subtype?: string }, botUserId?: string): boolean {
  return !!m.bot_id || m.subtype === "bot_message" || (!!botUserId && m.user === botUserId);
}

const nonEmpty = (a: unknown) => Array.isArray(a) && a.length > 0;

export function shouldArchive(msg: RawSlackMessage, botUserId?: string): ArchiveDecision {
  // Deletes first: they carry no user, no text, and no subtype we can inspect.
  // Applying a delete for a ts we never stored updates zero rows, which is safe.
  if (msg.subtype === "message_deleted") return { archive: true, kind: "delete" };

  // Edits: authorship lives on the INNER message.
  if (msg.subtype === "message_changed") {
    const inner = msg.message;
    if (!inner?.ts) return { archive: false, reason: "unsupported_subtype" };
    return { archive: true, kind: "edit", isBot: isBotAuthored(inner, botUserId) };
  }

  if (msg.subtype && HOUSEKEEPING.has(msg.subtype)) return { archive: false, reason: "housekeeping" };
  if (!CONTENT_SUBTYPES.has(msg.subtype)) return { archive: false, reason: "unsupported_subtype" };

  const hasText = !!msg.text && msg.text.trim().length > 0;
  if (!hasText && !nonEmpty(msg.files) && !nonEmpty(msg.blocks) && !nonEmpty(msg.attachments)) {
    return { archive: false, reason: "empty" };
  }
  return { archive: true, kind: "new", isBot: isBotAuthored(msg, botUserId) };
}
```

Run the test → `18 passed, 0 failed`.

- [ ] **Step 3: Replace the ingest service**

Replace `backend/src/services/slackArchiveService.ts` entirely:

```ts
import type { WebClient } from "@slack/web-api";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { activityBus } from "./activityService.js";
import { shouldArchive, type RawSlackMessage } from "./slackArchivePolicy.js";
import { getBotUserId } from "./memberService.js";
import {
  kindFromChannelType, kindFromConversation, kindFromChannelId, type ConversationKind,
} from "./slackConversationAccess.js";

// ── Caches ───────────────────────────────────────────────────
// Ingest runs on every message in every conversation, so both hot paths are
// cached rather than hitting Postgres/Slack per message.

const ENABLED_TTL_MS = 5 * 60_000;
const AUTHOR_TTL_MS = 30 * 60_000;

const enabledCache = new Map<string, { enabled: boolean; at: number }>();
export type Author = { authorName: string; authorAvatarUrl: string | null; memberId: string | null };
const authorCache = new Map<string, Author & { at: number }>();

/** Test seam + a way for an admin toggle to take effect before the TTL. */
export function clearSlackArchiveCaches(): void {
  enabledCache.clear();
  authorCache.clear();
}

/**
 * Since the portal pass the scope is EVERY conversation. An admin can still
 * switch one off by setting archiveEnabled = false on its row. No row yet
 * means enabled.
 */
export async function isIngestEnabled(channelId: string): Promise<boolean> {
  const hit = enabledCache.get(channelId);
  if (hit && Date.now() - hit.at < ENABLED_TTL_MS) return hit.enabled;
  const row = await prisma.slackChannelArchive.findUnique({
    where: { slackChannelId: channelId },
    select: { archiveEnabled: true },
  });
  const enabled = row?.archiveEnabled ?? true;
  enabledCache.set(channelId, { enabled, at: Date.now() });
  return enabled;
}

/**
 * Resolve a Slack user to a display name + avatar, WITHOUT creating a Member.
 * (memberService.resolveSlackMember() creates one — wrong here: a guest's
 * message would silently add them to the roster and the assignee pickers.)
 */
export async function resolveAuthor(slackId: string, client: WebClient): Promise<Author> {
  const hit = authorCache.get(slackId);
  if (hit && Date.now() - hit.at < AUTHOR_TTL_MS) {
    return { authorName: hit.authorName, authorAvatarUrl: hit.authorAvatarUrl, memberId: hit.memberId };
  }

  const member = await prisma.member.findUnique({
    where: { slackId },
    select: { id: true, displayName: true, avatarUrl: true },
  });

  let author: Author;
  if (member) {
    author = { authorName: member.displayName, authorAvatarUrl: member.avatarUrl, memberId: member.id };
  } else {
    author = { authorName: slackId, authorAvatarUrl: null, memberId: null };
    try {
      const info = await client.users.info({ user: slackId });
      const u = info.user as { real_name?: string; name?: string; profile?: { image_72?: string } } | undefined;
      if (u) {
        author.authorName = u.real_name || u.name || slackId;
        author.authorAvatarUrl = u.profile?.image_72 ?? null;
      }
    } catch {
      // Deactivated or invisible user — the slackId fallback is fine.
    }
  }

  authorCache.set(slackId, { ...author, at: Date.now() });
  return author;
}

/** Display identity for a bot/app message — from the payload, never a Member lookup. */
export function botAuthor(msg: RawSlackMessage): Author {
  return {
    authorName: msg.bot_profile?.name || msg.username || "App",
    authorAvatarUrl: msg.bot_profile?.icons?.image_48 ?? null,
    memberId: null,
  };
}

const UNKNOWN_AUTHOR: Author = { authorName: "Unknown", authorAvatarUrl: null, memberId: null };

type ConversationInfo = {
  name?: string; is_im?: boolean; is_mpim?: boolean; is_private?: boolean; is_group?: boolean; is_channel?: boolean;
};

/**
 * Find or create the conversation's archive row.
 *
 * `hint.kind` (from the event's channel_type) is preferred: the bot cannot call
 * conversations.info on a member's DM. With nothing known, kind falls back to
 * kindFromChannelId, which fails CLOSED (private). upsert rather than create,
 * because two events for a brand-new channel can race here.
 */
export async function ensureChannelArchive(
  channelId: string,
  client: WebClient,
  hint: { kind?: ConversationKind; name?: string | null } = {}
): Promise<{ id: string; slackChannelName: string | null; kind: ConversationKind }> {
  const existing = await prisma.slackChannelArchive.findUnique({
    where: { slackChannelId: channelId },
    select: { id: true, slackChannelName: true, kind: true },
  });
  if (existing) return existing;

  let kind: ConversationKind | null = hint.kind ?? null;
  let name: string | null = hint.name ?? null;
  const isDm = kind === "IM" || kind === "MPIM";
  if (!isDm && (!kind || !name)) {
    try {
      const info = await client.conversations.info({ channel: channelId });
      const c = (info.channel ?? {}) as ConversationInfo;
      kind = kind ?? kindFromConversation(c);
      name = name ?? c.name ?? null;
    } catch {
      // Bot not in it, or a DM — keep whatever we have.
    }
  }
  const finalKind = kind ?? kindFromChannelId(channelId);

  return prisma.slackChannelArchive.upsert({
    where: { slackChannelId: channelId },
    create: { slackChannelId: channelId, slackChannelName: name, isPrivate: finalKind !== "CHANNEL", kind: finalKind },
    update: {},
    select: { id: true, slackChannelName: true, kind: true },
  });
}

/** Slack ts ("1725900000.001200") → Date. */
function tsToDate(ts: string): Date {
  return new Date(Math.round(parseFloat(ts) * 1000));
}

type SlackFilePayload = {
  id?: string; name?: string; title?: string; mimetype?: string; size?: number; original_w?: number; original_h?: number;
};

async function upsertFiles(messageId: string, postedAt: Date, files: unknown[]): Promise<void> {
  for (const raw of files) {
    const f = raw as SlackFilePayload;
    if (!f.id) continue;
    const isImage = !!f.mimetype?.startsWith("image/");
    await prisma.slackMessageFile.upsert({
      where: { slackFileId: f.id },
      create: {
        messageId,
        slackFileId: f.id,
        name: f.name || f.title || f.id,
        mimeType: f.mimetype ?? null,
        sizeBytes: f.size ?? null,
        isImage,
        width: f.original_w ?? null,
        height: f.original_h ?? null,
        postedAt,
      },
      // Metadata only. Never reset `storage` — a re-delivered event must not
      // undo a completed mirror.
      update: { name: f.name || f.title || f.id, mimeType: f.mimetype ?? null },
    });
  }
}

/** Recompute (never increment) a parent's reply count — replay-safe. */
async function refreshReplyCount(slackChannelId: string, threadTs: string): Promise<void> {
  const count = await prisma.slackMessage.count({
    where: { slackChannelId, threadTs, deletedAt: null, NOT: { ts: threadTs } },
  });
  await prisma.slackMessage.updateMany({
    where: { slackChannelId, ts: threadTs },
    data: { replyCount: count },
  });
}

function botPayloadOf(m: { blocks?: unknown[]; attachments?: unknown[] }): Prisma.InputJsonValue | null {
  const blocks = Array.isArray(m.blocks) ? m.blocks : [];
  const attachments = Array.isArray(m.attachments) ? m.attachments : [];
  if (blocks.length === 0 && attachments.length === 0) return null;
  return { blocks, attachments } as Prisma.InputJsonValue;
}

/**
 * Upsert one message row plus its files. Shared by live ingest, backfill, and
 * the send path so all three write identical rows.
 *
 * overwrite  — live ingest and the send path refresh text/payload; backfill
 *              never clobbers a live-ingested row.
 * forceHuman — the send path KNOWS a human wrote this (D7), whatever flags
 *              Slack's echo carries, so it pins isBot = false.
 * The archive row must already exist (ensureChannelArchive).
 */
export async function storeArchivedMessage(
  channelId: string,
  msg: RawSlackMessage,
  isBot: boolean,
  client: WebClient,
  opts: { overwrite: boolean; forceHuman?: boolean }
): Promise<{ id: string; ts: string; threadTs: string | null; postedAt: Date } | null> {
  const ts = msg.ts;
  if (!ts) return null;

  const author = isBot ? botAuthor(msg) : msg.user ? await resolveAuthor(msg.user, client) : UNKNOWN_AUTHOR;
  const postedAt = tsToDate(ts);
  const threadTs = msg.thread_ts && msg.thread_ts !== ts ? msg.thread_ts : null;
  const botPayload = isBot ? botPayloadOf(msg) : null;

  const row = await prisma.slackMessage.upsert({
    where: { slackChannelId_ts: { slackChannelId: channelId, ts } },
    create: {
      slackChannelId: channelId,
      ts,
      threadTs,
      authorSlackId: msg.user ?? null,
      memberId: author.memberId,
      authorName: author.authorName,
      authorAvatarUrl: author.authorAvatarUrl,
      text: msg.text ?? "",
      postedAt,
      isBot,
      ...(botPayload ? { botPayload } : {}),
    },
    // isBot is set on CREATE only (plus forceHuman), so a late echo can never
    // flip a human row to bot.
    update: opts.overwrite
      ? {
          text: msg.text ?? "",
          ...(opts.forceHuman ? { isBot: false } : {}),
          ...(botPayload ? { botPayload } : {}),
        }
      : {},
    select: { id: true },
  });

  if (Array.isArray(msg.files) && msg.files.length > 0) {
    await upsertFiles(row.id, postedAt, msg.files);
  }
  if (threadTs) await refreshReplyCount(channelId, threadTs);

  // Forward-only: backfill walks BACKWARDS through history and must not drag
  // lastMessageAt into the past.
  await prisma.slackChannelArchive.updateMany({
    where: { slackChannelId: channelId, OR: [{ lastMessageAt: null }, { lastMessageAt: { lt: postedAt } }] },
    data: { lastMessageAt: postedAt },
  });
  if (opts.overwrite) {
    await prisma.slackChannelArchive.update({
      where: { slackChannelId: channelId },
      data: { messageCount: await prisma.slackMessage.count({ where: { slackChannelId: channelId } }) },
    });
  }

  return { id: row.id, ts, threadTs, postedAt };
}

// ── Live events ──────────────────────────────────────────────

export type ChatEventKind = "new" | "edit" | "delete" | "reaction";
export interface ChatEvent {
  channelId: string;
  convKind: ConversationKind;
  ts: string;
  threadTs?: string | null;
  kind: ChatEventKind;
}

/** The ONE place the archive announces a change. Ids only, never text. */
export function emitChat(e: ChatEvent): void {
  activityBus.emit(`slack-chat:${e.channelId}`, e);
}

export interface IngestResult {
  channelId: string;
  convKind: ConversationKind;
  event: "new" | "edit" | "delete";
  ts: string;
  threadTs: string | null;
  isBot: boolean;
  authorSlackId: string | null;
  /** The message's bot_id, if any — lets ping delivery recognise our OWN bot (D9). */
  botId: string | null;
  text: string;
}

/**
 * Persist one Slack message event. Safe to call for every message in every
 * conversation. Returns what happened so the caller (slack/events.ts) can run
 * membership and ping delivery after it — ingest itself never notifies (D10).
 */
export async function ingestSlackMessage(
  msg: RawSlackMessage & { channel?: string },
  client: WebClient
): Promise<IngestResult | null> {
  const channelId = msg.channel;
  if (!channelId) return null;
  if (!(await isIngestEnabled(channelId))) return null;

  const botUserId = (await getBotUserId(client)) ?? undefined;
  const decision = shouldArchive(msg, botUserId);
  if (!decision.archive) return null;

  const archive = await ensureChannelArchive(channelId, client, {
    kind: msg.channel_type ? kindFromChannelType(msg.channel_type) : undefined,
  });
  const convKind = archive.kind;

  if (decision.kind === "delete") {
    const ts = msg.deleted_ts || msg.previous_message?.ts;
    if (!ts) return null;
    await prisma.slackMessage.updateMany({
      where: { slackChannelId: channelId, ts },
      data: { deletedAt: new Date() },
    });
    const gone = await prisma.slackMessage.findUnique({
      where: { slackChannelId_ts: { slackChannelId: channelId, ts } },
      select: { threadTs: true },
    });
    if (gone?.threadTs) await refreshReplyCount(channelId, gone.threadTs);
    emitChat({ channelId, convKind, ts, kind: "delete" });
    return { channelId, convKind, event: "delete", ts, threadTs: gone?.threadTs ?? null, isBot: false, authorSlackId: null, botId: null, text: "" };
  }

  if (decision.kind === "edit") {
    const inner = msg.message!;
    const ts = inner.ts!;
    const botPayload = decision.isBot ? botPayloadOf(inner) : null;
    await prisma.slackMessage.updateMany({
      where: { slackChannelId: channelId, ts },
      data: {
        text: inner.text ?? "",
        // message_changed also fires for link unfurls; only a real edit carries `edited`.
        ...(inner.edited ? { editedAt: new Date() } : {}),
        ...(botPayload ? { botPayload } : {}),
      },
    });
    const threadTs = inner.thread_ts && inner.thread_ts !== ts ? inner.thread_ts : null;
    emitChat({ channelId, convKind, ts, threadTs, kind: "edit" });
    return {
      channelId, convKind, event: "edit", ts, threadTs, isBot: decision.isBot,
      authorSlackId: inner.user ?? null, botId: inner.bot_id ?? null, text: inner.text ?? "",
    };
  }

  const stored = await storeArchivedMessage(channelId, msg, decision.isBot, client, { overwrite: true });
  if (!stored) return null;
  emitChat({ channelId, convKind, ts: stored.ts, threadTs: stored.threadTs, kind: "new" });
  return {
    channelId, convKind, event: "new", ts: stored.ts, threadTs: stored.threadTs,
    isBot: decision.isBot, authorSlackId: msg.user ?? null, botId: msg.bot_id ?? null, text: msg.text ?? "",
  };
}

/**
 * Toggle one reaction on an archived message.
 * Shape: { ":emoji:": { count, slackIds: [] } }
 */
export async function applyReaction(
  channelId: string,
  ts: string,
  emoji: string,
  slackId: string,
  added: boolean
): Promise<void> {
  if (!(await isIngestEnabled(channelId))) return;

  const row = await prisma.slackMessage.findUnique({
    where: { slackChannelId_ts: { slackChannelId: channelId, ts } },
    select: { id: true, reactions: true },
  });
  if (!row) return; // never archived — nothing to react to

  const reactions = (row.reactions as Record<string, { count: number; slackIds: string[] }> | null) ?? {};
  const entry = reactions[emoji] ?? { count: 0, slackIds: [] };
  const has = entry.slackIds.includes(slackId);

  if (added && !has) entry.slackIds.push(slackId);
  else if (!added && has) entry.slackIds = entry.slackIds.filter((id) => id !== slackId);
  else return; // already in the requested state

  entry.count = entry.slackIds.length;
  if (entry.count === 0) delete reactions[emoji];
  else reactions[emoji] = entry;

  await prisma.slackMessage.update({ where: { id: row.id }, data: { reactions } });
  const archive = await prisma.slackChannelArchive.findUnique({
    where: { slackChannelId: channelId },
    select: { kind: true },
  });
  emitChat({ channelId, convKind: archive?.kind ?? "PRIVATE_CHANNEL", ts, kind: "reaction" });
}
```

- [ ] **Step 4: Keep the backfill compiling**

`slackBackfillService.ts` is rewritten in Task 6. For now only make it compile against the new decision type: its `storeMessage` already checks `decision.kind !== "new"`, which still type-checks. Run `cd backend && npx tsc --noEmit`. If it reports anything in `slackBackfillService.ts`, fix only that line.

- [ ] **Step 5: Gate + commit**

Run the policy test, the gate, then:

```bash
git add backend/src/services/slackArchivePolicy.ts backend/src/services/slackArchivePolicy.test.ts backend/src/services/slackArchiveService.ts
git commit -m "feat(slack-portal): archive every conversation, keep bot messages flagged, return ingest results"
```

---

## Task 5: Membership mirror, event wiring, public-channel auto-join

**Files:**
- Create: `backend/src/services/slackMembershipService.ts`
- Modify: `backend/src/slack/events.ts`
- Modify: `backend/src/slack/bolt.ts`
- Modify: `backend/src/slack/scheduler.ts`

**Interfaces produced:** `setConversationMembers`, `syncConversationMembers`, `addConversationMember`, `removeConversationMember`, `ensureMembersKnown`, `resolveReadClient(channelId, preferMemberId?) → { client, token } | null`, `joinAndSyncPublicChannel`, `joinAllPublicChannels`, `reconcileMemberships`. Emits `slack-membership:<slackUserId>` `{ channelId, joined }` on the activity bus.

- [ ] **Step 1: Create the membership service**

`backend/src/services/slackMembershipService.ts`:

```ts
import type { WebClient } from "@slack/web-api";
import { prisma } from "../db/prisma.js";
import { activityBus } from "./activityService.js";
import { userClientFor } from "./slackUserTokenService.js";
import { hasCapability } from "./slackScopes.js";
import { getBotUserId } from "./memberService.js";
import { ensureChannelArchive } from "./slackArchiveService.js";
import type { ConversationKind } from "./slackConversationAccess.js";

/**
 * Mirror of Slack conversation membership — the table the access layer reads
 * to decide who may see a private channel, DM or group DM (D2, D3).
 *
 * Every change is announced on `slack-membership:<slackUserId>` so an open SSE
 * stream can start (or stop) delivering that conversation's live events
 * without a reconnect.
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Lazy: importing bolt.ts boots the Socket Mode app and every handler. */
async function botClient(): Promise<WebClient> {
  const { boltApp } = await import("../slack/bolt.js");
  return boltApp.client;
}

function emitMembership(slackUserId: string, channelId: string, joined: boolean): void {
  activityBus.emit(`slack-membership:${slackUserId}`, { channelId, joined });
}

/** Conversations whose member list this process has loaded at least once. */
const known = new Set<string>();

/** Replace a conversation's member set, announcing only the differences. */
export async function setConversationMembers(channelId: string, slackUserIds: string[]): Promise<void> {
  const before = await prisma.slackConversationMember.findMany({
    where: { slackChannelId: channelId },
    select: { slackUserId: true },
  });
  const prev = new Set(before.map((b) => b.slackUserId));
  const next = new Set(slackUserIds);
  const added = [...next].filter((id) => !prev.has(id));
  const removed = [...prev].filter((id) => !next.has(id));

  await prisma.$transaction([
    prisma.slackConversationMember.deleteMany({
      where: { slackChannelId: channelId, slackUserId: { in: removed } },
    }),
    prisma.slackConversationMember.createMany({
      data: added.map((slackUserId) => ({ slackChannelId: channelId, slackUserId })),
      skipDuplicates: true,
    }),
  ]);
  known.add(channelId);
  for (const id of added) emitMembership(id, channelId, true);
  for (const id of removed) emitMembership(id, channelId, false);
}

/** Load Slack's current member list (paginated) and mirror it. */
export async function syncConversationMembers(channelId: string, client: WebClient): Promise<number> {
  const ids: string[] = [];
  let cursor: string | undefined;
  do {
    const res = await client.conversations.members({ channel: channelId, limit: 1000, ...(cursor ? { cursor } : {}) });
    ids.push(...((res.members ?? []) as string[]));
    cursor = res.response_metadata?.next_cursor || undefined;
  } while (cursor);
  await setConversationMembers(channelId, ids);
  return ids.length;
}

export async function addConversationMember(channelId: string, slackUserId: string): Promise<void> {
  const existing = await prisma.slackConversationMember.findUnique({
    where: { slackChannelId_slackUserId: { slackChannelId: channelId, slackUserId } },
    select: { slackUserId: true },
  });
  if (existing) return;
  // createMany + skipDuplicates is race-safe against a concurrent sync.
  await prisma.slackConversationMember.createMany({
    data: [{ slackChannelId: channelId, slackUserId }],
    skipDuplicates: true,
  });
  emitMembership(slackUserId, channelId, true);
}

export async function removeConversationMember(channelId: string, slackUserId: string): Promise<void> {
  const { count } = await prisma.slackConversationMember.deleteMany({
    where: { slackChannelId: channelId, slackUserId },
  });
  if (count > 0) emitMembership(slackUserId, channelId, false);
}

async function backfillChannelName(channelId: string, client: WebClient): Promise<void> {
  const row = await prisma.slackChannelArchive.findUnique({
    where: { slackChannelId: channelId },
    select: { slackChannelName: true },
  });
  if (row?.slackChannelName) return;
  const info = await client.conversations.info({ channel: channelId });
  const name = (info.channel as { name?: string } | undefined)?.name;
  if (name) {
    await prisma.slackChannelArchive.update({ where: { slackChannelId: channelId }, data: { slackChannelName: name } });
  }
}

/**
 * Make sure we know who is in a conversation. Until this has run, a private
 * conversation has no member rows and is readable by NOBODY — the access layer
 * fails closed, so the gap is empty, never leaky.
 *
 * `authorizedSlackUserId` is the member whose authorization delivered the
 * event: for a DM or a private channel the bot is not in, theirs is the only
 * token that can list the members.
 */
export async function ensureMembersKnown(
  channelId: string,
  kind: ConversationKind,
  authorizedSlackUserId?: string
): Promise<void> {
  if (known.has(channelId)) return;
  const count = await prisma.slackConversationMember.count({ where: { slackChannelId: channelId } });
  if (count > 0) { known.add(channelId); return; }

  try {
    if (kind === "CHANNEL") {
      await syncConversationMembers(channelId, await botClient());
      return;
    }
    if (!authorizedSlackUserId) return;
    const member = await prisma.member.findUnique({ where: { slackId: authorizedSlackUserId }, select: { id: true } });
    const uc = member ? await userClientFor(member.id) : null;
    if (!uc) return;

    if (kind === "IM") {
      // A 1:1 DM's other party is on conversations.info; members of an IM never change.
      const info = await uc.client.conversations.info({ channel: channelId });
      const other = (info.channel as { user?: string } | undefined)?.user;
      await setConversationMembers(channelId, other ? [uc.slackId, other] : [uc.slackId]);
    } else {
      await syncConversationMembers(channelId, uc.client);
      if (kind === "PRIVATE_CHANNEL") await backfillChannelName(channelId, uc.client);
    }
  } catch (err) {
    console.warn(`[slackPortal] could not load members of ${channelId}:`, (err as Error).message);
  }
}

/**
 * A client that can READ this conversation, and its token (url_private file
 * downloads need the raw token). The bot works wherever it is a member; for
 * DMs and private channels it is not in, only a participant's own token can.
 * Prefers the requester, so a request is served with their own authority.
 */
export async function resolveReadClient(
  channelId: string,
  preferMemberId?: string
): Promise<{ client: WebClient; token: string } | null> {
  const bot = await botClient();
  const botUserId = await getBotUserId(bot);

  let rows = await prisma.slackConversationMember.findMany({
    where: { slackChannelId: channelId },
    select: { slackUserId: true },
  });
  if (rows.length === 0) {
    // Self-heal conversations that predate the mirror (e.g. project channels
    // archived before the portal pass). Works whenever the bot is in them.
    try {
      await syncConversationMembers(channelId, bot);
      rows = await prisma.slackConversationMember.findMany({
        where: { slackChannelId: channelId },
        select: { slackUserId: true },
      });
    } catch {
      // Bot is not in this conversation.
    }
  }
  const ids = new Set(rows.map((r) => r.slackUserId));
  if (botUserId && ids.has(botUserId)) return { client: bot, token: process.env.SLACK_BOT_TOKEN ?? "" };

  const tryMember = async (memberId: string) => {
    const uc = await userClientFor(memberId);
    return uc && ids.has(uc.slackId) && hasCapability(uc.scopes, "read") ? { client: uc.client, token: uc.token } : null;
  };
  if (preferMemberId) {
    const mine = await tryMember(preferMemberId);
    if (mine) return mine;
  }
  const candidates = await prisma.member.findMany({
    where: { slackId: { in: [...ids] }, slackUserToken: { not: null } },
    select: { id: true },
    take: 10,
  });
  for (const c of candidates) {
    const r = await tryMember(c.id);
    if (r) return r;
  }
  return null;
}

/** The bot joins one public channel and mirrors its members. */
export async function joinAndSyncPublicChannel(channelId: string, client: WebClient, name?: string | null): Promise<void> {
  await client.conversations.join({ channel: channelId });
  await ensureChannelArchive(channelId, client, { kind: "CHANNEL", name: name ?? null });
  await syncConversationMembers(channelId, client);
}

/**
 * Join every public channel the bot is not in yet. Idempotent. The bot has to
 * be IN a public channel to read its history (bot channels:history), and the
 * portal's promise is that every public channel is readable.
 */
export async function joinAllPublicChannels(client: WebClient): Promise<{ joined: number; seen: number }> {
  let cursor: string | undefined;
  let joined = 0;
  let seen = 0;
  do {
    const res = await client.conversations.list({
      types: "public_channel",
      exclude_archived: true,
      limit: 200,
      ...(cursor ? { cursor } : {}),
    });
    for (const c of (res.channels ?? []) as { id?: string; name?: string; is_member?: boolean }[]) {
      if (!c.id) continue;
      seen++;
      if (c.is_member) {
        await ensureChannelArchive(c.id, client, { kind: "CHANNEL", name: c.name ?? null });
        continue;
      }
      try {
        await joinAndSyncPublicChannel(c.id, client, c.name);
        joined++;
      } catch (err) {
        console.warn(`[slackPortal] could not join #${c.name ?? c.id}:`, (err as Error).message);
      }
      await sleep(1_200); // conversations.join is Tier 3
    }
    cursor = res.response_metadata?.next_cursor || undefined;
  } while (cursor);
  return { joined, seen };
}

/**
 * Nightly drift repair. Events keep membership current most of the time; this
 * catches what they miss (a private channel nobody signed-in remained in, a
 * missed event during a redeploy). 1:1 DMs are skipped — their membership
 * never changes.
 */
export async function reconcileMemberships(limit = 300): Promise<number> {
  const rows = await prisma.slackChannelArchive.findMany({
    where: { kind: { not: "IM" } },
    select: { slackChannelId: true },
    orderBy: { lastMessageAt: { sort: "desc", nulls: "last" } },
    take: limit,
  });
  let synced = 0;
  for (const r of rows) {
    try {
      const reader = await resolveReadClient(r.slackChannelId);
      if (!reader) continue;
      await syncConversationMembers(r.slackChannelId, reader.client);
      synced++;
    } catch (err) {
      console.warn(`[slackPortal] reconcile failed for ${r.slackChannelId}:`, (err as Error).message);
    }
    await sleep(700); // conversations.members is Tier 4
  }
  return synced;
}
```

- [ ] **Step 2: Turn `ignoreSelf` off**

In `backend/src/slack/bolt.ts`, inside `new App({ ... })`, add after `appToken`:

```ts
  // OFF so the archive records our own bot's posts (digests, task cards) like
  // any other message (D4). Every handler that reacts to messages or reactions
  // therefore guards against bot authors itself — see slack/events.ts.
  ignoreSelf: false,
```

- [ ] **Step 3: Wire events**

In `backend/src/slack/events.ts`:

1. Change the memberService import to `import { resolveSlackMember, getLeadershipChannelId, getBotUserId } from "../services/memberService.js";` and add:

```ts
import {
  ensureMembersKnown, addConversationMember, removeConversationMember, joinAndSyncPublicChannel,
} from "../services/slackMembershipService.js";
```

2. Replace the start of the `app.message` handler, from `app.message(async ({ message, say, client }) => {` through the line `if (message.subtype) return;`, with:

```ts
  app.message(async ({ message, say, client, body }) => {
    // Whose authorization delivered this event. For a DM, or a private channel
    // the bot is not in, theirs is the only token that can see the conversation.
    const authorizedUserId = (body as { authorizations?: { user_id?: string }[] }).authorizations?.[0]?.user_id;

    try {
      const result = await ingestSlackMessage(message as never, client);
      if (result?.event === "new") {
        await ensureMembersKnown(result.channelId, result.convKind, authorizedUserId);
      }
    } catch (error) {
      console.error("[slackArchive] ingest failed:", error);
    }

    try {
      // Only handle regular user messages with text
      if (message.subtype) return;
      // ignoreSelf is off (bolt.ts). Never let a bot message — ours or another
      // app's — trigger the TODO prompt.
      if ((message as { bot_id?: string }).bot_id) return;
```

3. In `reaction_added`, directly after the closing `}` of the `try { await applyReaction(...) } catch` block, add:

```ts
      // Our own bot's reactions now reach this handler (ignoreSelf: false).
      if (event.user === (await getBotUserId(client))) return;
```

4. In `channel_created`, as the first statement inside `try {`:

```ts
      // Portal: the bot joins every new public channel so it can read it.
      // channel_created only fires for public channels.
      try {
        await joinAndSyncPublicChannel(event.channel.id, client, event.channel.name);
      } catch (err) {
        console.error("[slackPortal] auto-join failed:", err);
      }
```

5. In `member_joined_channel`, directly after `const { user: slackUserId, channel: channelId } = event;` add:

```ts
      await addConversationMember(channelId, slackUserId);
```

6. In `member_left_channel`, directly after its `const { user: slackUserId, channel: channelId } = event;` add:

```ts
      await removeConversationMember(channelId, slackUserId);
```

(It must run **before** the leadership early-return that follows.)

- [ ] **Step 4: Nightly join + reconcile**

In `backend/src/slack/scheduler.ts`, grep `export function` near the top to confirm the Bolt `App` parameter's name (expected `app`). Directly after the `50 3 * * *` emoji cron block, add:

```ts
  // ── 03:55 daily — Slack portal: join new public channels, repair membership drift ──
  cron.schedule("55 3 * * *", async () => {
    try {
      const { joinAllPublicChannels, reconcileMemberships } = await import("../services/slackMembershipService.js");
      const j = await joinAllPublicChannels(app.client);
      const n = await reconcileMemberships();
      console.log(`👥 [slackPortal] joined ${j.joined}/${j.seen} public channels; reconciled ${n} member list(s)`);
    } catch (err) {
      console.error("[slackPortal] membership reconcile failed:", err);
    }
  });
```

(If the parameter is not named `app`, use its real name.)

- [ ] **Step 5: Gate + commit**

```bash
git add backend/src/services/slackMembershipService.ts backend/src/slack/events.ts backend/src/slack/bolt.ts backend/src/slack/scheduler.ts
git commit -m "feat(slack-portal): mirror conversation membership, auto-join public channels, archive own bot posts"
```

---

## Task 6: Token-aware files, DM files off Drive, `/uploads/slack` guard, backfill generalization

**Files:**
- Modify: `backend/src/services/slackFileService.ts`
- Modify: `backend/src/services/slackFileService.test.ts`
- Modify: `backend/src/services/slackBackfillService.ts` (full replacement)
- Modify: `backend/src/app.ts`

**Why this task exists:** `slackFileService` fetches every file with the **bot** token. The bot cannot see a member's DM, so `files.info` returns `file_not_found`, and the proxy would mark every DM attachment `UNAVAILABLE` ("expired") the first time anyone viewed it. That can't be undone. Separately, `app.ts` serves `uploads/` statically, which exposes the disk mirror (D6).

**Interfaces produced:** `mirrorTargetFor(kind) → "drive" | "disk"`; `resolveFileStream(slackFileId, requesterMemberId?)`; `startBackfill(channelId, { requesterMemberId? })`; `importMemberDms(memberId)`; `backfillAllPublicChannels()`.

- [ ] **Step 1: Failing test for the mirror target**

Append to `backend/src/services/slackFileService.test.ts`, just above the final `console.log`:

```ts
console.log("\nmirrorTargetFor");
{
  // D5: only PUBLIC channel files may land in the human-browsed club Drive.
  check("public channel → drive", mirrorTargetFor("CHANNEL") === "drive");
  check("private channel → disk", mirrorTargetFor("PRIVATE_CHANNEL") === "disk");
  check("DM → disk", mirrorTargetFor("IM") === "disk");
  check("group DM → disk", mirrorTargetFor("MPIM") === "disk");
}
```

and extend the import line to include `mirrorTargetFor`. Run it → FAIL (`mirrorTargetFor` is not exported).

- [ ] **Step 2: Make `slackFileService.ts` token-aware**

1. Add imports:

```ts
import type { WebClient } from "@slack/web-api";
import type { ConversationKind } from "./slackConversationAccess.js";
```

2. Below `streamSourceFor`, add:

```ts
/** Pure: where a mirrored copy may live. Only PUBLIC channel files go to the shared Drive (D5). */
export function mirrorTargetFor(kind: ConversationKind): "drive" | "disk" {
  return kind === "CHANNEL" ? "drive" : "disk";
}
```

3. Replace the whole `// ── Slack fetch ──` section (`slackFileUrl` and `fetchSlackFile`) with:

```ts
// ── Slack fetch ──────────────────────────────────────────────

type Reader = { client: WebClient; token: string };

/**
 * A token that can see the file's conversation. The bot token alone is wrong
 * for DMs: the bot is not in them, files.info answers file_not_found, and the
 * file would be written off as expired on first view.
 */
async function readerFor(slackFileId: string, requesterMemberId?: string): Promise<Reader | null> {
  const row = await prisma.slackMessageFile.findUnique({
    where: { slackFileId },
    select: { message: { select: { slackChannelId: true } } },
  });
  if (!row) return null;
  const { resolveReadClient } = await import("./slackMembershipService.js");
  return resolveReadClient(row.message.slackChannelId, requesterMemberId);
}

/** Fresh url_private at use time — a stored URL may have rotated. */
async function slackFileUrl(slackFileId: string, reader: Reader): Promise<{ url: string; mimeType: string } | "gone"> {
  try {
    const info = await reader.client.files.info({ file: slackFileId });
    const f = info.file as { url_private?: string; mimetype?: string } | undefined;
    if (!f?.url_private) return "gone";
    return { url: f.url_private, mimeType: f.mimetype ?? "application/octet-stream" };
  } catch (err) {
    const code = (err as { data?: { error?: string } }).data?.error;
    if (code === "file_not_found" || code === "file_deleted") return "gone";
    throw err;
  }
}

/** url_private requires the reading token in a header — a browser can never do this. */
async function fetchSlackFile(url: string, token: string): Promise<Response> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok || !res.body) throw new Error(`Slack file fetch failed: ${res.status}`);
  return res;
}
```

4. In `resolveFileStream`, change the signature to `export async function resolveFileStream(slackFileId: string, requesterMemberId?: string): Promise<ResolvedFile>` and replace its tail (from `const url = await slackFileUrl(slackFileId);` to the end of the function) with:

```ts
  const reader = await readerFor(slackFileId, requesterMemberId);
  // Nobody who can see this conversation has a usable token right now. That is
  // NOT evidence the file is gone — never mark UNAVAILABLE here.
  if (!reader) return { ok: false, status: 502, detail: "Nobody in this conversation has connected Slack yet" };

  const url = await slackFileUrl(slackFileId, reader);
  if (url === "gone") {
    await prisma.slackMessageFile.update({
      where: { slackFileId },
      data: { storage: "UNAVAILABLE" },
    });
    return { ok: false, status: 410, detail: "This file expired in Slack before it could be archived" };
  }
  const res = await fetchSlackFile(url.url, reader.token);
  return { ok: true, stream: webBodyToNode(res), mimeType: url.mimeType, fileName: row.name };
}
```

5. In `mirrorFile`, replace everything from `const attempts = row.mirrorAttempts + 1;` down to (not including) the `} catch (err) {` with:

```ts
  const attempts = row.mirrorAttempts + 1;
  const channelId = row.message.slackChannelId;

  try {
    const reader = await readerFor(slackFileId);
    if (!reader) {
      // Retry later — a member may connect Slack before the file expires.
      const storage = nextStorageState({ outcome: "error", attempts });
      await prisma.slackMessageFile.update({
        where: { slackFileId },
        data: { storage, mirrorAttempts: attempts, mirrorError: "no Slack token can read this conversation" },
      });
      return storage;
    }

    const url = await slackFileUrl(slackFileId, reader);
    if (url === "gone") {
      const storage = nextStorageState({ outcome: "gone", attempts });
      await prisma.slackMessageFile.update({
        where: { slackFileId },
        data: { storage, mirrorAttempts: attempts, mirrorError: "file_not_found in Slack" },
      });
      return storage;
    }

    const archive = await prisma.slackChannelArchive.findUnique({
      where: { slackChannelId: channelId },
      select: { kind: true },
    });
    // Unknown kind fails closed to disk.
    const target = mirrorTargetFor(archive?.kind ?? "PRIVATE_CHANNEL");
    const folderId = target === "drive" ? await ensureChannelDriveFolder(channelId) : null;

    if (folderId) {
      const res = await fetchSlackFile(url.url, reader.token);
      const uploaded = await uploadStreamToDrive(webBodyToNode(res), url.mimeType, row.name, folderId);
      if (uploaded) {
        await prisma.slackMessageFile.update({
          where: { slackFileId },
          data: {
            storage: nextStorageState({ outcome: "drive", attempts }),
            driveFileId: uploaded.fileId,
            mirroredAt: new Date(),
            mirrorAttempts: attempts,
            mirrorError: null,
          },
        });
        return "DRIVE";
      }
    }

    // Disk: by design for private conversations (D5), or as the fallback when
    // Drive is unavailable. Only the fallback records a mirrorError, which is
    // how the sweep tells the two apart.
    const res = await fetchSlackFile(url.url, reader.token);
    const localPath = await mirrorToDisk(channelId, slackFileId, row.name, res);
    await prisma.slackMessageFile.update({
      where: { slackFileId },
      data: {
        storage: nextStorageState({ outcome: "local", attempts }),
        localPath,
        mirroredAt: new Date(),
        mirrorAttempts: attempts,
        mirrorError: target === "disk" ? null : folderId ? "Drive upload returned null" : "no Drive account connected",
      },
    });
    return "LOCAL";
```

6. In `runSweep`, split by-design disk copies from Drive fallbacks, so the 03:40 cron's "is Google Drive connected?" warning doesn't fire for every DM attachment. Replace `else if (result === "LOCAL") tally.local++;` with:

```ts
    else if (result === "LOCAL") {
      const r = await prisma.slackMessageFile.findUnique({ where: { slackFileId: f.slackFileId }, select: { mirrorError: true } });
      if (r?.mirrorError) tally.local++; else tally.privateLocal++;
    }
```

Change the `SweepTally` type to add `privateLocal: number`, and the initializer to `{ swept: 0, drive: 0, local: 0, privateLocal: 0, failed: 0, unavailable: 0 }`.

Run the test → passes (the old 17 + 4 new).

- [ ] **Step 3: Close the static `/uploads/slack` hole (D6)**

In `backend/src/app.ts`, directly above `app.use("/uploads", express.static(UPLOADS_DIR, ...));`, add:

```ts
// Slack archive mirrors (uploads/slack/**) hold private-channel and DM files.
// They are served ONLY through the access-checked proxy (/api/chat/files/:id);
// the static handler below would otherwise hand them to anyone who knows a
// channel id and a file id. MUST stay above the static mount.
app.use("/uploads/slack", (_req, res) => { res.status(404).end(); });
```

- [ ] **Step 4: Replace the backfill service**

Replace `backend/src/services/slackBackfillService.ts` entirely:

```ts
import type { WebClient } from "@slack/web-api";
import { prisma } from "../db/prisma.js";
import { boltApp } from "../slack/bolt.js";
import { shouldArchive, type RawSlackMessage } from "./slackArchivePolicy.js";
import { ensureChannelArchive, storeArchivedMessage } from "./slackArchiveService.js";
import { getBotUserId } from "./memberService.js";
import { resolveReadClient, setConversationMembers, syncConversationMembers } from "./slackMembershipService.js";
import { userClientFor } from "./slackUserTokenService.js";
import { hasCapability } from "./slackScopes.js";

/**
 * Resumable history import.
 *
 * NEVER creates notifications. Pings are delivered only from the live event
 * path (slack/events.ts), so importing 90 days of history cannot fire hundreds
 * of them (D10). Do not add a notify call here.
 */

/** One in-flight backfill per channel, per process. */
const running = new Set<string>();
/** One DM import per member, per process. */
const importing = new Set<string>();

const PAGE = 200;
/** conversations.history is Slack Tier 3 (~50 req/min). Stay well under. */
const PACE_MS = 1_200;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type HistoryMessage = RawSlackMessage & { reply_count?: number };

async function storeMessage(channelId: string, msg: HistoryMessage, botUserId: string | undefined, client: WebClient): Promise<boolean> {
  // The SAME predicate as live ingest, so historical and live archives cannot diverge.
  const decision = shouldArchive(msg, botUserId);
  if (!decision.archive || decision.kind !== "new") return false;
  // overwrite: false — replay is free and never clobbers a live-ingested row.
  return !!(await storeArchivedMessage(channelId, msg, decision.isBot, client, { overwrite: false }));
}

async function storeThread(channelId: string, parentTs: string, botUserId: string | undefined, client: WebClient): Promise<number> {
  let stored = 0;
  let cursor: string | undefined;
  do {
    await sleep(PACE_MS);
    const replies = await client.conversations.replies({
      channel: channelId, ts: parentTs, limit: PAGE, ...(cursor ? { cursor } : {}),
    });
    for (const r of (replies.messages ?? []) as HistoryMessage[]) {
      if (r.ts === parentTs) continue; // the parent repeats itself on every page
      if (await storeMessage(channelId, r, botUserId, client)) stored++;
    }
    cursor = replies.response_metadata?.next_cursor || undefined;
  } while (cursor);
  return stored;
}

async function runBackfill(channelId: string, client: WebClient): Promise<void> {
  let stored = 0;
  try {
    const botUserId = (await getBotUserId(boltApp.client)) ?? undefined;
    const prior = await prisma.slackChannelArchive.findUnique({
      where: { slackChannelId: channelId },
      select: { backfillCursor: true, backfillOldestTs: true },
    });
    let cursor = prior?.backfillCursor ?? undefined;
    let oldest = prior?.backfillOldestTs ?? null;

    for (;;) {
      const res = await client.conversations.history({ channel: channelId, limit: PAGE, ...(cursor ? { cursor } : {}) });
      for (const m of (res.messages ?? []) as HistoryMessage[]) {
        if (await storeMessage(channelId, m, botUserId, client)) stored++;
        if (m.ts) oldest = m.ts;
        if ((m.reply_count ?? 0) > 0 && m.ts) stored += await storeThread(channelId, m.ts, botUserId, client);
      }
      cursor = res.response_metadata?.next_cursor || undefined;
      // Persist after EVERY page so a crash or redeploy resumes, not restarts.
      await prisma.slackChannelArchive.update({
        where: { slackChannelId: channelId },
        data: { backfillCursor: cursor ?? null, backfillOldestTs: oldest },
      });
      if (!cursor) break;
      await sleep(PACE_MS);
    }

    await prisma.slackChannelArchive.update({
      where: { slackChannelId: channelId },
      data: {
        backfillStatus: "COMPLETE",
        backfilledAt: new Date(),
        backfillError: null,
        backfillCursor: null,
        messageCount: await prisma.slackMessage.count({ where: { slackChannelId: channelId } }),
      },
    });
    console.log(`📚 [slackArchive] backfill complete for ${channelId} — ${stored} message(s) stored`);
  } catch (err) {
    console.error(`[slackArchive] backfill failed for ${channelId}:`, err);
    await prisma.slackChannelArchive
      .update({
        where: { slackChannelId: channelId },
        data: { backfillStatus: "FAILED", backfillError: String((err as Error)?.message ?? err).slice(0, 500) },
      })
      .catch((e) => console.error(`[slackArchive] could not record backfill failure for ${channelId}:`, e));
  } finally {
    running.delete(channelId);
  }
}

/** Claim the slot, mark RUNNING, run to completion. Resolves when done. */
async function backfillNow(channelId: string, client: WebClient): Promise<void> {
  if (running.has(channelId)) return;
  running.add(channelId);
  try {
    await prisma.slackChannelArchive.update({
      where: { slackChannelId: channelId },
      data: { backfillStatus: "RUNNING", backfillError: null },
    });
  } catch (err) {
    running.delete(channelId);
    throw err;
  }
  await runBackfill(channelId, client);
}

/**
 * Admin- or member-triggered import of one conversation, with whichever token
 * can read it (bot, else the requester, else any participant).
 */
export async function startBackfill(
  channelId: string,
  opts: { requesterMemberId?: string } = {}
): Promise<{ started: boolean; reason?: string }> {
  if (running.has(channelId)) return { started: false, reason: "already_running" };
  await ensureChannelArchive(channelId, boltApp.client);
  const reader = await resolveReadClient(channelId, opts.requesterMemberId);
  if (!reader) return { started: false, reason: "no_reader" };
  // Detached: the HTTP request returns immediately and the client polls status.
  void backfillNow(channelId, reader.client).catch((err) =>
    console.error(`[slackArchive] backfill could not start for ${channelId}:`, err)
  );
  return { started: true };
}

export async function getBackfillStatus(slackChannelId: string) {
  const a = await prisma.slackChannelArchive.findUnique({ where: { slackChannelId } });
  return {
    status: a?.backfillStatus ?? "NOT_STARTED",
    cursor: a?.backfillCursor ?? null,
    error: a?.backfillError ?? null,
    messageCount: a?.messageCount ?? 0,
  };
}

/**
 * A member's own DMs and group DMs: discover them with THEIR token (the bot
 * can see none of them), record membership, then import each sequentially.
 */
export async function importMemberDms(memberId: string): Promise<{ started: boolean; conversations?: number; reason?: string }> {
  if (importing.has(memberId)) return { started: false, reason: "already_running" };
  const uc = await userClientFor(memberId);
  if (!uc) return { started: false, reason: "not_connected" };
  if (!hasCapability(uc.scopes, "read")) return { started: false, reason: "reconnect" };

  importing.add(memberId);
  const found: { id: string; kind: "IM" | "MPIM"; other?: string }[] = [];
  try {
    let cursor: string | undefined;
    do {
      const res = await uc.client.conversations.list({
        types: "im,mpim", exclude_archived: true, limit: 200, ...(cursor ? { cursor } : {}),
      });
      for (const c of (res.channels ?? []) as { id?: string; is_im?: boolean; user?: string }[]) {
        if (c.id) found.push({ id: c.id, kind: c.is_im ? "IM" : "MPIM", other: c.user });
      }
      cursor = res.response_metadata?.next_cursor || undefined;
    } while (cursor);

    for (const c of found) {
      await ensureChannelArchive(c.id, uc.client, { kind: c.kind });
      if (c.kind === "IM") await setConversationMembers(c.id, c.other ? [uc.slackId, c.other] : [uc.slackId]);
      else await syncConversationMembers(c.id, uc.client);
    }
  } catch (err) {
    importing.delete(memberId);
    throw err;
  }

  void (async () => {
    try {
      for (const c of found) {
        const a = await prisma.slackChannelArchive.findUnique({
          where: { slackChannelId: c.id },
          select: { backfillStatus: true },
        });
        if (a?.backfillStatus === "COMPLETE") continue;
        await backfillNow(c.id, uc.client).catch((err) =>
          console.error(`[slackArchive] DM import failed for ${c.id}:`, err)
        );
      }
    } finally {
      importing.delete(memberId);
    }
  })();

  return { started: true, conversations: found.length };
}

/** Admin: import every public channel not yet imported (bot token). */
export async function backfillAllPublicChannels(): Promise<{ queued: number }> {
  const rows = await prisma.slackChannelArchive.findMany({
    where: { kind: "CHANNEL", archiveEnabled: true, backfillStatus: { in: ["NOT_STARTED", "FAILED"] } },
    select: { slackChannelId: true },
  });
  void (async () => {
    for (const r of rows) {
      await backfillNow(r.slackChannelId, boltApp.client).catch((err) =>
        console.error(`[slackArchive] public backfill failed for ${r.slackChannelId}:`, err)
      );
    }
  })();
  return { queued: rows.length };
}
```

`getBackfillStatus` keeps its exact pre-portal return shape (`status`, `cursor`, `error`, `messageCount`), because `projectChat.ts` and the chat tab read those fields.

- [ ] **Step 5: Pass the requester through the project route**

In `backend/src/api/projectChat.ts`, grep `res.json(await startBackfill(channelId));` and replace with:

```ts
      res.json(await startBackfill(channelId, { requesterMemberId: req.memberId }));
```

Grep `const resolved = await resolveFileStream(slackFileId);` and replace with:

```ts
      const resolved = await resolveFileStream(slackFileId, memberId);
```

- [ ] **Step 6: Gate + commit**

Run: `cd backend && npx tsx src/services/slackFileService.test.ts` → all pass; then the gate.

```bash
git add backend/src/services/slackFileService.ts backend/src/services/slackFileService.test.ts backend/src/services/slackBackfillService.ts backend/src/app.ts backend/src/api/projectChat.ts
git commit -m "fix(slack-portal): read files with a token that can see them, keep private files off Drive, block /uploads/slack"
```

(`projectChat.ts` is a two-line call-site update; it's included because the signatures changed.)

---

## Task 7: Live updates for every conversation

**Files:**
- Modify: `backend/src/api/sse.ts` (full replacement)
- Modify: `backend/src/services/slackArchiveService.ts` (`emitChat` only)
- Modify: `src/components/clubpm/NotificationBell.jsx` (one listener)

- [ ] **Step 1: Emit on one global topic**

In `slackArchiveService.ts`, replace the body of `emitChat`:

```ts
/**
 * The ONE place the archive announces a change. Ids only, never text: sse.ts
 * filters each event per connection, and the client re-fetches through the
 * access-checked API.
 */
export function emitChat(e: ChatEvent): void {
  activityBus.emit("slack-chat", e);
}
```

- [ ] **Step 2: Replace `sse.ts`**

```ts
import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth, verifyBearerToken } from "./auth.js";
import { activityBus } from "../services/activityService.js";
import { prisma } from "../db/prisma.js";

export const sseRouter = Router();

// EventSource cannot set an Authorization header, so Bearer-token users
// (cookie-blocked browsers, e.g. Brave) authenticate the stream via a signed
// `?token=` query param. sseRouter MUST be mounted in app.ts BEFORE
// notificationsRouter and every bare app.use("/api", …) router — see
// src/appMountOrder.test.ts.
async function streamAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const queryToken = typeof req.query.token === "string" ? req.query.token : undefined;
  if (queryToken) {
    const memberId = await verifyBearerToken(queryToken);
    if (memberId) {
      req.memberId = memberId;
      return next();
    }
  }
  return requireAuth(req, res, next);
}

// ── GET /api/notifications/stream ───────────────────────────
sseRouter.get("/stream", streamAuth, (req: Request, res: Response) => {
  const memberId = req.memberId;
  if (!memberId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable Nginx buffering
  res.flushHeaders();
  res.write("event: connected\ndata: {}\n\n");

  const send = (event: string, data: unknown) => {
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {
      // client disconnected mid-write — handled by the close handler below
    }
  };

  // ── Notifications ─────────────────────────────────────────
  const onNotification = (n: unknown) => send("notification", n);
  const onNotificationRead = (p: unknown) => send("notification-read", p);
  const onNotificationRemoved = (p: unknown) => send("notification-removed", p);
  activityBus.on(`notification:${memberId}`, onNotification);
  activityBus.on(`notification-read:${memberId}`, onNotificationRead);
  activityBus.on(`notification-removed:${memberId}`, onNotificationRemoved);

  // ── Slack conversations ───────────────────────────────────
  // ONE listener on the global topic, filtered per event. Public-channel events
  // go to everyone (any member may read a public channel); private channels,
  // DMs and group DMs only to their participants. Until the member's
  // conversation set has loaded, non-public events are dropped — fail closed.
  const mine = new Set<string>();
  let membershipTopic: string | null = null;
  let closed = false;

  const onChat = (e: { channelId: string; convKind: string }) => {
    if (e.convKind !== "CHANNEL" && !mine.has(e.channelId)) return;
    send("slack-message", e);
  };
  const onMembership = (p: { channelId: string; joined: boolean }) => {
    if (p.joined) mine.add(p.channelId);
    else mine.delete(p.channelId);
    send("slack-membership", p);
  };
  activityBus.on("slack-chat", onChat);

  void (async () => {
    try {
      const me = await prisma.member.findUnique({ where: { id: memberId }, select: { slackId: true } });
      if (!me || closed) return;
      const rows = await prisma.slackConversationMember.findMany({
        where: { slackUserId: me.slackId },
        select: { slackChannelId: true },
      });
      if (closed) return;
      for (const r of rows) mine.add(r.slackChannelId);
      membershipTopic = `slack-membership:${me.slackId}`;
      activityBus.on(membershipTopic, onMembership);
    } catch (err) {
      console.error("[sse] failed to load conversation membership:", err);
    }
  })();

  // Heartbeat every 30s to keep the connection alive through proxies
  const heartbeat = setInterval(() => {
    try {
      res.write(": heartbeat\n\n");
    } catch {
      clearInterval(heartbeat);
    }
  }, 30_000);

  req.on("close", () => {
    closed = true;
    clearInterval(heartbeat);
    activityBus.off(`notification:${memberId}`, onNotification);
    activityBus.off(`notification-read:${memberId}`, onNotificationRead);
    activityBus.off(`notification-removed:${memberId}`, onNotificationRemoved);
    activityBus.off("slack-chat", onChat);
    if (membershipTopic) activityBus.off(membershipTopic, onMembership);
    res.end();
  });
});
```

(`activityBus.setMaxListeners(200)` covers the one-listener-per-connection `slack-chat` topic up to 200 open tabs. Past that Node only logs a warning.)

- [ ] **Step 3: Re-broadcast membership changes in the bell**

In `NotificationBell.jsx`, directly after the `es.addEventListener("slack-message", ...)` block, add:

```js
    // A new DM or channel membership — lets inbox/sidebars refresh without polling.
    es.addEventListener("slack-membership", (e) => {
      try {
        window.dispatchEvent(new CustomEvent("clubpm:slack-membership", { detail: JSON.parse(e.data) }));
      } catch {
        // malformed event — ignore
      }
    });
```

- [ ] **Step 4: Gate + commit**

```bash
git add backend/src/api/sse.ts backend/src/services/slackArchiveService.ts src/components/clubpm/NotificationBell.jsx
git commit -m "feat(slack-portal): one filtered live topic for every conversation"
```

---

# Part C — Conversation API

## Task 8: Conversation access middleware and the project chat filter

**Files:**
- Create: `backend/src/middleware/conversationAccess.ts`
- Create: `backend/src/middleware/conversationAccess.test.ts`
- Modify: `backend/src/middleware/projectChatAccess.ts`

**Interfaces produced:** `ConversationAccess`, `getConversationAccess(memberId, channelId)`, `filterReadableChannels(memberId, channelIds)`, `requireConversationRead` (sets `req.conversation = { channelId, canRead, canPost, kind, isParticipant, slackId }`).

- [ ] **Step 1: Failing static test**

`backend/src/middleware/conversationAccess.test.ts`:

```ts
// Static guard, like appMountOrder.test.ts — importing the middleware would
// open a Prisma client. Run: cd backend && npx tsx src/middleware/conversationAccess.test.ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

let passed = 0, failed = 0;
const check = (n: string, c: boolean) => { if (c) passed++; else { failed++; console.error(`  ✗ ${n}`); } };

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "conversationAccess.ts"), "utf8");

// D2: no admin bypass, ever. The rule lives in the pure module, which has no
// admin input; this file must not reintroduce one by loading the flag.
check("never mentions isAdmin", !/isAdmin/.test(src));
check("delegates the read rule to the pure module", /canReadConversation\(/.test(src));
// Whether a particular DM exists is itself private: deny as 404, never 403.
check("denies with 404", /status\(404\)/.test(src));
check("never answers 403", !/status\(403\)/.test(src));

console.log(`conversationAccess: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

Run it → FAIL (`ENOENT`).

- [ ] **Step 2: Implement the middleware**

`backend/src/middleware/conversationAccess.ts`:

```ts
import type { Request, Response, NextFunction } from "express";
import { prisma } from "../db/prisma.js";
import {
  canReadConversation, canPostToConversation, type ConversationKind,
} from "../services/slackConversationAccess.js";

export interface ConversationAccess {
  canRead: boolean;
  canPost: boolean;
  kind: ConversationKind | null;
  isParticipant: boolean;
  slackId: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      conversation?: ConversationAccess & { channelId: string };
    }
  }
}

/**
 * The database side of the access rules. It deliberately loads nothing about
 * the member's roles: the rule (services/slackConversationAccess.ts) has no
 * admin input, and this wrapper must not smuggle one in (D2).
 */
export async function getConversationAccess(memberId: string, channelId: string): Promise<ConversationAccess> {
  const [member, archive] = await Promise.all([
    prisma.member.findUnique({ where: { id: memberId }, select: { slackId: true } }),
    prisma.slackChannelArchive.findUnique({ where: { slackChannelId: channelId }, select: { kind: true } }),
  ]);
  if (!member || !archive) {
    return { canRead: false, canPost: false, kind: archive?.kind ?? null, isParticipant: false, slackId: member?.slackId ?? null };
  }
  const row = await prisma.slackConversationMember.findUnique({
    where: { slackChannelId_slackUserId: { slackChannelId: channelId, slackUserId: member.slackId } },
    select: { slackUserId: true },
  });
  const input = { kind: archive.kind, isParticipant: !!row };
  return {
    canRead: canReadConversation(input),
    canPost: canPostToConversation(input),
    kind: archive.kind,
    isParticipant: input.isParticipant,
    slackId: member.slackId,
  };
}

/** Narrow a list of channel ids to those this member may read. Three queries total. */
export async function filterReadableChannels(memberId: string, channelIds: string[]): Promise<string[]> {
  if (channelIds.length === 0) return [];
  const member = await prisma.member.findUnique({ where: { id: memberId }, select: { slackId: true } });
  if (!member) return [];
  const [archives, memberships] = await Promise.all([
    prisma.slackChannelArchive.findMany({
      where: { slackChannelId: { in: channelIds } },
      select: { slackChannelId: true, kind: true },
    }),
    prisma.slackConversationMember.findMany({
      where: { slackUserId: member.slackId, slackChannelId: { in: channelIds } },
      select: { slackChannelId: true },
    }),
  ]);
  const kinds = new Map(archives.map((a) => [a.slackChannelId, a.kind]));
  const mine = new Set(memberships.map((m) => m.slackChannelId));
  // No archive row → kind unknown → not readable (fail closed).
  return channelIds.filter((id) => {
    const kind = kinds.get(id);
    return !!kind && canReadConversation({ kind, isParticipant: mine.has(id) });
  });
}

export async function requireConversationRead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const channelId = req.params.channelId as string;
    const access = await getConversationAccess(req.memberId!, channelId);
    // 404 rather than "forbidden": whether a given DM exists is itself private.
    if (!access.canRead) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    req.conversation = { ...access, channelId };
    next();
  } catch (err) {
    console.error("conversation access check failed:", err);
    res.status(500).json({ error: "Failed to check access" });
  }
}
```

Run the test → `4 passed, 0 failed`.

- [ ] **Step 3: Filter project chat by Slack visibility (D3)**

In `backend/src/middleware/projectChatAccess.ts`, add the import:

```ts
import { filterReadableChannels } from "./conversationAccess.js";
```

Replace the last three statements of `getProjectChatAccess` (from `const isAdmin = member?.isAdmin ?? false;` to its `return`) with:

```ts
  const isAdmin = member?.isAdmin ?? false;
  const canRead = isAdmin || !!membership;
  // D3: project membership decides where a channel SHOWS UP, never who may
  // read it. A private linked channel is listed only for its Slack members —
  // admins included. Admin still gates the project-level tools (backfill,
  // storage health), which expose no message content.
  const channelIds = canRead ? await filterReadableChannels(memberId, unionChannelIds(targets, project)) : [];
  return { canRead, isAdmin, channelIds };
```

Update the first line of the function's doc comment to: `Read access to a project's chat tab: admin OR project member — and then only the linked channels Slack lets this member see.`

Side effect: a linked channel with no archive row yet (no message since the portal pass, and the bot hasn't joined it) drops out of the Chat tab until it gets one. Public channels get a row within a day via the 03:55 join. A private one gets its row on its first message.

- [ ] **Step 4: Gate + commit**

Run: `cd backend && npx tsx src/middleware/conversationAccess.test.ts && npx tsx src/middleware/projectChatAccess.test.ts`, then the gate.

```bash
git add backend/src/middleware/conversationAccess.ts backend/src/middleware/conversationAccess.test.ts backend/src/middleware/projectChatAccess.ts
git commit -m "feat(slack-portal): conversation access middleware; project chat follows Slack visibility"
```

---

## Task 9: Shared message DTO and the read service

**Files:**
- Create: `backend/src/services/chatDto.ts`
- Modify: `backend/src/api/projectChat.ts` (import from `chatDto`)
- Create: `backend/src/services/slackReadService.ts`
- Create: `backend/src/services/slackReadService.test.ts`

**Interfaces produced:** `buildFormatContext`, `loadMessages`, `toDto(row, ctx, viewerSlackId?)` (adds `authorSlackId`, `isBot`, `reactions[].name/mine/url`), `MessageDto`, `tokensToPlain`, `previewText`. `compareTs`, `idsReadUpTo`, `tsToDate`, `unreadCounts`, `advanceCursor`, `markConversationRead(memberId, channelId, ts, { pushToSlack })`.

- [ ] **Step 1: Create `chatDto.ts`**

```ts
import { prisma } from "../db/prisma.js";
import { formatSlackText, type FormatContext, type SlackToken } from "./slackMessageFormat.js";
import { getCustomEmoji } from "./slackFileService.js";

/**
 * Mention names, channel names and custom emoji for one page of messages, in
 * one pass rather than per message — the reason the archive parses on read.
 * Only PUBLIC channel names are offered for <#C…> fallback labels, so a message
 * can never reveal a private channel's name to someone outside it.
 */
export async function buildFormatContext(): Promise<FormatContext> {
  const [members, channels] = await Promise.all([
    prisma.member.findMany({ select: { slackId: true, displayName: true } }),
    prisma.slackChannelArchive.findMany({
      where: { kind: "CHANNEL", slackChannelName: { not: null } },
      select: { slackChannelId: true, slackChannelName: true },
    }),
  ]);
  const memberNames: Record<string, string> = {};
  for (const m of members) if (m.slackId) memberNames[m.slackId] = m.displayName;
  const channelNames: Record<string, string> = {};
  for (const c of channels) if (c.slackChannelName) channelNames[c.slackChannelId] = c.slackChannelName;
  return { memberNames, channelNames, emojiUrls: await getCustomEmoji() };
}

export async function loadMessages(where: Record<string, unknown>, take: number, asc = false) {
  return prisma.slackMessage.findMany({
    where,
    orderBy: { postedAt: asc ? "asc" : "desc" },
    take,
    include: {
      files: {
        select: {
          id: true, slackFileId: true, name: true, mimeType: true, sizeBytes: true,
          isImage: true, width: true, height: true, storage: true,
        },
      },
    },
  });
}

export type MessageRow = Awaited<ReturnType<typeof loadMessages>>[number];

/** `viewerSlackId` lets each reaction say whether the viewer is on it (for toggling). */
export function toDto(row: MessageRow, ctx: FormatContext, viewerSlackId?: string | null) {
  const reactions = (row.reactions as Record<string, { count: number; slackIds?: string[] }> | null) ?? {};
  return {
    id: row.id,
    ts: row.ts,
    threadTs: row.threadTs,
    replyCount: row.replyCount,
    authorName: row.authorName,
    authorAvatarUrl: row.authorAvatarUrl,
    authorSlackId: row.authorSlackId,
    memberId: row.memberId,
    isBot: row.isBot,
    tokens: row.deletedAt ? [] : formatSlackText(row.text, ctx),
    editedAt: row.editedAt,
    deletedAt: row.deletedAt,
    postedAt: row.postedAt,
    reactions: Object.entries(reactions).map(([emoji, v]) => {
      const name = emoji.replace(/^:+|:+$/g, "");
      return {
        emoji,
        name,
        count: v.count,
        mine: !!viewerSlackId && (v.slackIds ?? []).includes(viewerSlackId),
        url: ctx.emojiUrls?.[name.split("::")[0]] ?? null,
      };
    }),
    files: row.deletedAt ? [] : row.files.map((f) => ({
      id: f.slackFileId,
      name: f.name,
      mimeType: f.mimeType,
      sizeBytes: f.sizeBytes,
      isImage: f.isImage,
      width: f.width,
      height: f.height,
      storage: f.storage,
    })),
  };
}

export type MessageDto = ReturnType<typeof toDto>;

export function tokensToPlain(tokens: SlackToken[]): string {
  return tokens
    .map((t) => {
      switch (t.type) {
        case "text":
        case "code":
        case "codeblock":
          return t.value;
        case "mention": return `@${t.label}`;
        case "channel": return `#${t.label}`;
        case "link": return t.label;
        case "emoji": return `:${t.name}:`;
        case "bold":
        case "italic":
        case "strike":
          return tokensToPlain(t.children);
      }
    })
    .join("");
}

/** One-line plain-text preview (inbox rows, notification text). */
export function previewText(raw: string, ctx: FormatContext, max = 140): string {
  const plain = tokensToPlain(formatSlackText(raw, ctx)).replace(/\s+/g, " ").trim();
  return plain.length > max ? `${plain.slice(0, max - 1)}…` : plain;
}
```

If `tsc` reports that `FormatContext` has no `channelNames`, grep `export interface FormatContext` in `slackMessageFormat.ts`. The formatter already reads `ctx.channelNames?.[…]`, so add `channelNames?: Record<string, string>;` to the interface if it's missing.

- [ ] **Step 2: Point `projectChat.ts` at `chatDto`**

In `backend/src/api/projectChat.ts`, delete the local `buildFormatContext`, `MessageRow`, `loadMessages` and `toDto` definitions and the now-unused imports (`formatSlackText`, `FormatContext`, `getCustomEmoji`). Add:

```ts
import { buildFormatContext, loadMessages, toDto } from "../services/chatDto.js";
```

Every existing `toDto(r, ctx)` call stays unchanged.

- [ ] **Step 3: Failing read-service test**

`backend/src/services/slackReadService.test.ts`:

```ts
// Pure-logic tests for slackReadService. Run: cd backend && npx tsx src/services/slackReadService.test.ts
import { compareTs, idsReadUpTo } from "./slackReadService.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}

check("equal ts compare 0", compareTs("1725900000.001200", "1725900000.001200") === 0);
check("earlier second sorts first", compareTs("1725900000.999999", "1725900001.000000") < 0);
check("fraction compared by digits", compareTs("1725900000.000200", "1725900000.001000") < 0);
check("short fraction is padded", compareTs("1725900000.1", "1725900000.099999") > 0);
// The reason this function exists: string comparison gets this one wrong.
check("numeric seconds, not string order", compareTs("10.000000", "9.000000") > 0);

const notifs = [
  { id: "a", slackTs: "100.000001" },
  { id: "b", slackTs: "100.000002" },
  { id: "c", slackTs: "100.000003" },
  { id: "d", slackTs: null },
];
check("read up to b covers a and b", JSON.stringify(idsReadUpTo(notifs, "100.000002")) === JSON.stringify(["a", "b"]));
check("rows without a ts are never auto-read", !idsReadUpTo(notifs, "999.0").includes("d"));
check("nothing read before the first", idsReadUpTo(notifs, "99.0").length === 0);

console.log(`\nslackReadService: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

Run it → FAIL (`Cannot find module`).

- [ ] **Step 4: Implement `slackReadService.ts`**

```ts
import { prisma } from "../db/prisma.js";
import { userClientFor, clearSlackUserToken, isDeadTokenError, slackErrorCode } from "./slackUserTokenService.js";
import { hasCapability } from "./slackScopes.js";

/**
 * Pure. Order two Slack ts strings exactly. Seconds are compared as numbers
 * (string order puts "10" before "9"); the microsecond fraction as zero-padded
 * digits (a float would round the last digits away).
 */
export function compareTs(a: string, b: string): number {
  const [as, af = ""] = a.split(".");
  const [bs, bf = ""] = b.split(".");
  const sa = Number(as) || 0;
  const sb = Number(bs) || 0;
  if (sa !== sb) return sa < sb ? -1 : 1;
  const fa = af.padEnd(6, "0");
  const fb = bf.padEnd(6, "0");
  return fa === fb ? 0 : fa < fb ? -1 : 1;
}

/** Pure. The notifications a read position at `lastReadTs` covers. */
export function idsReadUpTo(notifs: { id: string; slackTs: string | null }[], lastReadTs: string): string[] {
  return notifs.filter((n) => !!n.slackTs && compareTs(n.slackTs, lastReadTs) <= 0).map((n) => n.id);
}

export function tsToDate(ts: string): Date {
  return new Date(Math.round(parseFloat(ts) * 1000));
}

/**
 * Unread top-level messages per conversation, by others, after the member's
 * read cursor. Nothing before the moment they connected Slack counts
 * (slackUserTokenAt) — otherwise a fresh DM import would show 90 days unread.
 */
export async function unreadCounts(
  member: { id: string; slackId: string; slackUserTokenAt: Date | null },
  channelIds: string[]
): Promise<Record<string, number>> {
  if (!member.slackUserTokenAt || channelIds.length === 0) return {};
  const floor = member.slackUserTokenAt;
  const rows = await prisma.$queryRaw<{ slackChannelId: string; unread: number }[]>`
    SELECT m."slackChannelId", COUNT(*)::int AS unread
    FROM "SlackMessage" m
    LEFT JOIN "SlackReadCursor" c
      ON c."slackChannelId" = m."slackChannelId" AND c."memberId" = ${member.id}
    WHERE m."slackChannelId" = ANY(${channelIds})
      AND m."threadTs" IS NULL
      AND m."deletedAt" IS NULL
      AND (m."authorSlackId" IS NULL OR m."authorSlackId" <> ${member.slackId})
      AND m."postedAt" > GREATEST(COALESCE(c."lastReadAt", ${floor}), ${floor})
    GROUP BY m."slackChannelId"`;
  const out: Record<string, number> = {};
  for (const r of rows) out[r.slackChannelId] = r.unread;
  return out;
}

/** Move a read cursor forward only. True if it moved. */
export async function advanceCursor(memberId: string, channelId: string, ts: string): Promise<boolean> {
  const where = { memberId_slackChannelId: { memberId, slackChannelId: channelId } };
  const cur = await prisma.slackReadCursor.findUnique({ where, select: { lastReadTs: true } });
  if (cur && compareTs(ts, cur.lastReadTs) <= 0) return false;
  const at = tsToDate(ts);
  await prisma.slackReadCursor.upsert({
    where,
    create: { memberId, slackChannelId: channelId, lastReadTs: ts, lastReadAt: at },
    update: { lastReadTs: ts, lastReadAt: at },
  });
  return true;
}

/**
 * The member has seen `channelId` up to `ts`.
 *
 * pushToSlack — also move Slack's own read cursor, which clears the Slack
 * unread badge (D11). False when the read CAME from Slack, or when the
 * member's own post already marked it read there.
 */
export async function markConversationRead(
  memberId: string,
  channelId: string,
  ts: string,
  opts: { pushToSlack: boolean }
): Promise<{ advanced: boolean }> {
  const advanced = await advanceCursor(memberId, channelId, ts);
  if (advanced && opts.pushToSlack) {
    const uc = await userClientFor(memberId, { interactive: true });
    if (uc && hasCapability(uc.scopes, "mark")) {
      try {
        await uc.client.conversations.mark({ channel: channelId, ts });
      } catch (err) {
        const code = slackErrorCode(err);
        if (isDeadTokenError(code)) await clearSlackUserToken(memberId);
        else console.warn(`[slackPortal] conversations.mark failed for ${channelId}: ${code}`);
      }
    }
  }
  return { advanced };
}
```

Run the test → `8 passed, 0 failed`.

- [ ] **Step 5: Gate + commit**

```bash
git add backend/src/services/chatDto.ts backend/src/api/projectChat.ts backend/src/services/slackReadService.ts backend/src/services/slackReadService.test.ts
git commit -m "feat(slack-portal): shared chat DTO, exact ts ordering, unread counts and read cursors"
```

---

## Task 10: `/api/chat` read routes, mount, admin public backfill

**Files:**
- Create: `backend/src/api/chat.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/appMountOrder.test.ts`
- Modify: `backend/src/api/projectChat.ts` (export `fileProxyAuth`; admin `backfill-public` route)

**Routes produced:**

```
GET  /api/chat/conversations                       → { channels: [...], dms: [...] }
GET  /api/chat/conversations/:channelId            → header: name, kind, isParticipant, canPost, muted, participants
GET  /api/chat/conversations/:channelId/messages?before=<ts>
GET  /api/chat/conversations/:channelId/thread/:ts
GET  /api/chat/conversations/:channelId/search?q=
POST /api/chat/conversations/:channelId/read       { ts } → { advanced }
GET  /api/chat/files/:slackFileId[?token=]
POST /api/slack-archive/backfill-public            [admin] → { started }
```

- [ ] **Step 1: Export the query-token auth from `projectChat.ts`**

Grep `async function fileProxyAuth(` and prefix it with `export `.

- [ ] **Step 2: Create `chat.ts` with the read routes**

`backend/src/api/chat.ts`:

```ts
import { pipeline } from "node:stream/promises";
import { Router, type Request, type Response } from "express";
import { requireAuth } from "./auth.js";
import { fileProxyAuth } from "./projectChat.js";
import { prisma } from "../db/prisma.js";
import { requireConversationRead, getConversationAccess } from "../middleware/conversationAccess.js";
import { canReadConversation, type ConversationKind } from "../services/slackConversationAccess.js";
import { buildFormatContext, loadMessages, toDto, previewText } from "../services/chatDto.js";
import { unreadCounts, markConversationRead } from "../services/slackReadService.js";
import { resolveFileStream } from "../services/slackFileService.js";

/**
 * /api/chat — the conversation-scoped Slack portal API.
 *
 * No pathless requireAuth on this router: the file proxy authenticates with a
 * `?token=` query param (an <img> cannot send headers), and app.ts mounts this
 * router above every bare /api router for the same reason. Every other route
 * names requireAuth explicitly. Every handler reads req.memberId, never
 * req.session.
 */
export const chatRouter = Router();

const PAGE_SIZE = 50;
const TS_RE = /^\d+\.\d+$/;
const isDmKind = (k: ConversationKind) => k === "IM" || k === "MPIM";

type Person = { memberId: string | null; slackId: string; displayName: string; avatarUrl: string | null };

/** Display identity for Slack user ids — Members first, else the last name they posted under. */
async function peopleFor(slackIds: string[]): Promise<Map<string, Person>> {
  const out = new Map<string, Person>();
  if (slackIds.length === 0) return out;
  const members = await prisma.member.findMany({
    where: { slackId: { in: slackIds } },
    select: { id: true, slackId: true, displayName: true, avatarUrl: true },
  });
  for (const m of members) out.set(m.slackId, { memberId: m.id, slackId: m.slackId, displayName: m.displayName, avatarUrl: m.avatarUrl });
  for (const id of slackIds) {
    if (out.has(id)) continue;
    const last = await prisma.slackMessage.findFirst({
      where: { authorSlackId: id },
      orderBy: { postedAt: "desc" },
      select: { authorName: true, authorAvatarUrl: true },
    });
    out.set(id, { memberId: null, slackId: id, displayName: last?.authorName ?? id, avatarUrl: last?.authorAvatarUrl ?? null });
  }
  return out;
}

/** Newest top-level message per conversation, one query. */
async function latestPreviews(channelIds: string[]): Promise<Map<string, { text: string; authorName: string; postedAt: Date }>> {
  if (channelIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<{ slackChannelId: string; text: string; authorName: string; postedAt: Date }[]>`
    SELECT DISTINCT ON ("slackChannelId") "slackChannelId", "text", "authorName", "postedAt"
    FROM "SlackMessage"
    WHERE "slackChannelId" = ANY(${channelIds}) AND "deletedAt" IS NULL AND "threadTs" IS NULL
    ORDER BY "slackChannelId", "postedAt" DESC`;
  const ctx = await buildFormatContext();
  return new Map(rows.map((r) => [r.slackChannelId, { text: previewText(r.text, ctx, 90), authorName: r.authorName, postedAt: r.postedAt }]));
}

// ── GET /api/chat/conversations ──────────────────────────────
// Every conversation the member may read: all public channels (joined or not),
// plus private channels, DMs and group DMs they are in.
chatRouter.get("/conversations", requireAuth, async (req: Request, res: Response) => {
  try {
    const me = await prisma.member.findUnique({
      where: { id: req.memberId! },
      select: { id: true, slackId: true, slackUserTokenAt: true, mutedSlackChannelIds: true },
    });
    if (!me) return void res.status(401).json({ error: "Not authenticated" });

    const myRows = await prisma.slackConversationMember.findMany({
      where: { slackUserId: me.slackId },
      select: { slackChannelId: true },
    });
    const mine = new Set(myRows.map((r) => r.slackChannelId));

    const archives = await prisma.slackChannelArchive.findMany({
      where: { archiveEnabled: true, OR: [{ kind: "CHANNEL" }, { slackChannelId: { in: [...mine] } }] },
      select: { slackChannelId: true, slackChannelName: true, kind: true, lastMessageAt: true },
      orderBy: { lastMessageAt: { sort: "desc", nulls: "last" } },
    });
    // Defense in depth: the query scopes, the pure rule decides.
    const readable = archives.filter((a) => canReadConversation({ kind: a.kind, isParticipant: mine.has(a.slackChannelId) }));
    const unread = await unreadCounts(me, readable.filter((a) => mine.has(a.slackChannelId)).map((a) => a.slackChannelId));
    const muted = new Set(me.mutedSlackChannelIds);

    const dmArchives = readable.filter((a) => isDmKind(a.kind));
    const dmIds = dmArchives.map((a) => a.slackChannelId);
    const parts = dmIds.length
      ? await prisma.slackConversationMember.findMany({
          where: { slackChannelId: { in: dmIds } },
          select: { slackChannelId: true, slackUserId: true },
        })
      : [];
    const people = await peopleFor([...new Set(parts.map((p) => p.slackUserId))]);
    const latest = await latestPreviews(dmIds);

    res.json({
      channels: readable
        .filter((a) => !isDmKind(a.kind))
        .map((a) => ({
          slackChannelId: a.slackChannelId,
          name: a.slackChannelName ?? a.slackChannelId,
          kind: a.kind,
          isMember: mine.has(a.slackChannelId),
          unread: unread[a.slackChannelId] ?? 0,
          lastMessageAt: a.lastMessageAt,
          muted: muted.has(a.slackChannelId),
        })),
      dms: dmArchives.map((a) => ({
        slackChannelId: a.slackChannelId,
        kind: a.kind,
        participants: parts
          .filter((p) => p.slackChannelId === a.slackChannelId && p.slackUserId !== me.slackId)
          .map((p) => people.get(p.slackUserId)!)
          .filter(Boolean),
        unread: unread[a.slackChannelId] ?? 0,
        lastMessageAt: a.lastMessageAt,
        preview: latest.get(a.slackChannelId) ?? null,
        muted: muted.has(a.slackChannelId),
      })),
    });
  } catch (error) {
    console.error("chat/conversations error:", error);
    res.status(500).json({ error: "Failed to list conversations" });
  }
});

// ── GET /api/chat/conversations/:channelId ───────────────────
chatRouter.get("/conversations/:channelId", requireAuth, requireConversationRead, async (req: Request, res: Response) => {
  try {
    const c = req.conversation!;
    const [archive, me] = await Promise.all([
      prisma.slackChannelArchive.findUnique({
        where: { slackChannelId: c.channelId },
        select: { slackChannelName: true, backfillStatus: true },
      }),
      prisma.member.findUnique({ where: { id: req.memberId! }, select: { mutedSlackChannelIds: true } }),
    ]);
    let participants: Person[] = [];
    if (c.kind && isDmKind(c.kind)) {
      const parts = await prisma.slackConversationMember.findMany({
        where: { slackChannelId: c.channelId },
        select: { slackUserId: true },
      });
      const people = await peopleFor(parts.map((p) => p.slackUserId).filter((id) => id !== c.slackId));
      participants = [...people.values()];
    }
    res.json({
      slackChannelId: c.channelId,
      name: archive?.slackChannelName ?? null,
      kind: c.kind,
      isParticipant: c.isParticipant,
      canPost: c.canPost,
      muted: (me?.mutedSlackChannelIds ?? []).includes(c.channelId),
      backfillStatus: archive?.backfillStatus ?? "NOT_STARTED",
      participants,
    });
  } catch (error) {
    console.error("chat/conversation error:", error);
    res.status(500).json({ error: "Failed to load conversation" });
  }
});

// ── GET /api/chat/conversations/:channelId/messages ──────────
// Reverse-chronological page of TOP-LEVEL messages, returned oldest-first.
chatRouter.get("/conversations/:channelId/messages", requireAuth, requireConversationRead, async (req: Request, res: Response) => {
  try {
    const c = req.conversation!;
    const before = typeof req.query.before === "string" && TS_RE.test(req.query.before) ? req.query.before : null;
    const where: Record<string, unknown> = { slackChannelId: c.channelId, threadTs: null };
    if (before) where.postedAt = { lt: new Date(Math.round(parseFloat(before) * 1000)) };

    const rows = await loadMessages(where, PAGE_SIZE + 1);
    const hasMore = rows.length > PAGE_SIZE;
    const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
    const ctx = await buildFormatContext();
    res.json({ channelId: c.channelId, hasMore, messages: page.map((r) => toDto(r, ctx, c.slackId)).reverse() });
  } catch (error) {
    console.error("chat/messages error:", error);
    res.status(500).json({ error: "Failed to load messages" });
  }
});

// ── GET /api/chat/conversations/:channelId/thread/:ts ────────
chatRouter.get("/conversations/:channelId/thread/:ts", requireAuth, requireConversationRead, async (req: Request, res: Response) => {
  try {
    const c = req.conversation!;
    const ts = req.params.ts as string;
    if (!TS_RE.test(ts)) return void res.status(400).json({ error: "Bad ts" });
    const rows = await loadMessages({ slackChannelId: c.channelId, OR: [{ ts }, { threadTs: ts }] }, 500, true);
    const ctx = await buildFormatContext();
    res.json({ messages: rows.map((r) => toDto(r, ctx, c.slackId)) });
  } catch (error) {
    console.error("chat/thread error:", error);
    res.status(500).json({ error: "Failed to load thread" });
  }
});

// ── GET /api/chat/conversations/:channelId/search ────────────
chatRouter.get("/conversations/:channelId/search", requireAuth, requireConversationRead, async (req: Request, res: Response) => {
  try {
    const c = req.conversation!;
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (q.length < 2) return void res.json({ messages: [] });
    const rows = await loadMessages(
      { slackChannelId: c.channelId, deletedAt: null, text: { contains: q, mode: "insensitive" } },
      50
    );
    const ctx = await buildFormatContext();
    res.json({ messages: rows.map((r) => toDto(r, ctx, c.slackId)) });
  } catch (error) {
    console.error("chat/search error:", error);
    res.status(500).json({ error: "Search failed" });
  }
});

// ── POST /api/chat/conversations/:channelId/read ─────────────
// The member has seen the conversation up to `ts`. Moves our cursor and
// Slack's (D11). Reading a public channel you are not in has no cursor.
chatRouter.post("/conversations/:channelId/read", requireAuth, requireConversationRead, async (req: Request, res: Response) => {
  try {
    const c = req.conversation!;
    const ts = typeof req.body?.ts === "string" ? req.body.ts : "";
    if (!TS_RE.test(ts)) return void res.status(400).json({ error: "Bad ts" });
    if (!c.isParticipant) return void res.json({ advanced: false });
    res.json(await markConversationRead(req.memberId!, c.channelId, ts, { pushToSlack: true }));
  } catch (error) {
    console.error("chat/read error:", error);
    res.status(500).json({ error: "Failed to mark read" });
  }
});

// ── GET /api/chat/files/:slackFileId ─────────────────────────
// Streams an attachment after checking the viewer may read its conversation.
// `?token=` for <img> tags (Brave/Safari Bearer users) — see fileProxyAuth.
chatRouter.get("/files/:slackFileId", fileProxyAuth, async (req: Request, res: Response) => {
  try {
    const memberId = req.memberId;
    if (!memberId) return void res.status(401).json({ error: "Not authenticated" });
    const slackFileId = req.params.slackFileId as string;
    const file = await prisma.slackMessageFile.findUnique({
      where: { slackFileId },
      select: { message: { select: { slackChannelId: true } } },
    });
    if (!file) return void res.status(404).json({ error: "Not found" });
    const access = await getConversationAccess(memberId, file.message.slackChannelId);
    if (!access.canRead) return void res.status(404).json({ error: "Not found" });

    const resolved = await resolveFileStream(slackFileId, memberId);
    if (!resolved.ok) return void res.status(resolved.status).json({ error: resolved.detail });

    res.setHeader("Content-Type", resolved.mimeType);
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(resolved.fileName)}"`);
    // Uploaded .html/.svg would otherwise be stored XSS on the API origin.
    res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
    res.setHeader("X-Content-Type-Options", "nosniff");
    await pipeline(resolved.stream, res);
  } catch (error) {
    console.error("chat/files error:", error);
    if (!res.headersSent) res.status(500).json({ error: "Failed to load file" });
    else res.destroy();
  }
});
```

- [ ] **Step 3: Mount it above the bare `/api` routers**

In `backend/src/app.ts`, add `import { chatRouter } from "./api/chat.js";` next to the `projectChat` import. Directly below `app.use("/api/slack-archive", slackArchiveAdminRouter);` add:

```ts
// Above every bare "/api" router: the chat file proxy authenticates with a
// `?token=` query param, which a pathless requireAuth would 401 first.
app.use("/api/chat", chatRouter);
```

- [ ] **Step 4: Extend the mount-order guard**

In `backend/src/appMountOrder.test.ts`:

1. Change `const QUERY_TOKEN_ROUTERS = ["sseRouter", "projectChatRouter"];` to `["sseRouter", "projectChatRouter", "chatRouter"];`.
2. Replace the two lines `const shadow = SHADOWS[router];` and `check(\`${router} is mounted above ${shadow}\`, at < indexOf(shadow));` with:

```ts
  const shadow = SHADOWS[router];
  if (shadow) check(`${router} is mounted above ${shadow}`, at < indexOf(shadow));
```

3. Above the final `console.log`, add:

```ts
// D6: the Slack mirror directory must never be served statically.
const guardAt = src.indexOf('app.use("/uploads/slack"');
const staticAt = src.indexOf('app.use("/uploads", express.static');
check("uploads/slack guard exists", guardAt !== -1);
check("uploads/slack guard is above the static /uploads mount", guardAt !== -1 && guardAt < staticAt);
```

Run: `cd backend && npx tsx src/appMountOrder.test.ts` → all pass.

- [ ] **Step 5: Admin "backfill public channels" route**

In `backend/src/api/projectChat.ts`, change the backfill import to `import { startBackfill, getBackfillStatus, backfillAllPublicChannels } from "../services/slackBackfillService.js";`. Add `import { joinAllPublicChannels } from "../services/slackMembershipService.js";` and `import { boltApp } from "../slack/bolt.js";`. Then append:

```ts
// ── POST /api/slack-archive/backfill-public ──────────────────
// Join every public channel, then import each one's history with the bot
// token. Both run in the background; each channel's backfill status shows
// progress. Operator step 3 in the portal plan.
slackArchiveAdminRouter.post("/backfill-public", requireAuth, requireArchiveAdmin, async (_req: Request, res: Response) => {
  try {
    void joinAllPublicChannels(boltApp.client)
      .then(() => backfillAllPublicChannels())
      .then((r) => console.log(`📚 [slackPortal] queued ${r.queued} public channel backfill(s)`))
      .catch((err) => console.error("[slackPortal] public backfill failed:", err));
    res.json({ started: true });
  } catch (error) {
    console.error("slack-archive/backfill-public error:", error);
    res.status(500).json({ error: "Failed to start public backfill" });
  }
});
```

- [ ] **Step 6: Gate + commit**

```bash
git add backend/src/api/chat.ts backend/src/app.ts backend/src/appMountOrder.test.ts backend/src/api/projectChat.ts
git commit -m "feat(slack-portal): conversation-scoped read API, unread counts, file proxy, public backfill"
```

---

## Task 11: Send service and write routes

**Files:**
- Create: `backend/src/services/slackSendRules.ts`
- Create: `backend/src/services/slackSendRules.test.ts`
- Create: `backend/src/services/slackSendService.ts`
- Modify: `backend/src/api/chat.ts` (append write routes)

**Routes produced:**

```
POST   /api/chat/conversations/:channelId/messages               { text, threadTs?, broadcast? } → { ts }
PATCH  /api/chat/conversations/:channelId/messages/:ts           { text }
DELETE /api/chat/conversations/:channelId/messages/:ts
POST   /api/chat/conversations/:channelId/messages/:ts/reactions  { emoji, add }
POST   /api/chat/conversations/:channelId/files                  multipart: file, threadTs?, comment?
POST   /api/chat/conversations/:channelId/join                   (public channels)
POST   /api/chat/dms                                              { memberIds } → { channelId, kind }
POST   /api/chat/dms/import                                       → { started, conversations? }
```

**Error contract (the UI depends on it): HTTP 409 means exactly one thing, "reconnect Slack".** Never use 409 for anything else in these routes.

- [ ] **Step 1: Failing rules test**

`backend/src/services/slackSendRules.test.ts`:

```ts
// Run: cd backend && npx tsx src/services/slackSendRules.test.ts
import {
  mapSlackError, validateOutgoingText, validateDmTargets, normalizeEmojiName, MAX_TEXT,
} from "./slackSendRules.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}

check("dead token → 409 reconnect", mapSlackError("token_revoked").status === 409 && mapSlackError("token_revoked").code === "reconnect");
check("missing_scope → 409 reconnect", mapSlackError("missing_scope").status === 409);
check("not_in_channel → 403", mapSlackError("not_in_channel").status === 403);
check("ratelimited → 429", mapSlackError("ratelimited").status === 429);
check("already_reacted is a no-op", mapSlackError("already_reacted").code === "noop");
check("unknown → 502", mapSlackError("something_new").status === 502);
check("only reconnect uses 409", ["not_in_channel", "is_archived", "msg_too_long", "cant_delete_message", "x"].every((c) => mapSlackError(c).status !== 409));

check("empty text rejected", !validateOutgoingText("   ").ok);
check("non-string text rejected", !validateOutgoingText(42).ok);
check("text trimmed", (validateOutgoingText("  hi  ") as any).text === "hi");
check("over-long text rejected", !validateOutgoingText("x".repeat(MAX_TEXT + 1)).ok);

check("DM targets dedupe and drop self", JSON.stringify((validateDmTargets("me", ["a", "a", "me", "b"]) as any).ids) === JSON.stringify(["a", "b"]));
check("DM with only self rejected", !validateDmTargets("me", ["me"]).ok);
check("DM to 8 others allowed", validateDmTargets("me", ["1", "2", "3", "4", "5", "6", "7", "8"]).ok);
check("DM to 9 others rejected", !validateDmTargets("me", ["1", "2", "3", "4", "5", "6", "7", "8", "9"]).ok);
check("DM targets must be an array", !validateDmTargets("me", "a").ok);

check("emoji colons stripped", normalizeEmojiName(":tada:") === "tada");
check("skin tone kept", normalizeEmojiName("+1::skin-tone-3") === "+1::skin-tone-3");
check("junk emoji rejected", normalizeEmojiName("<script>") === null);

console.log(`\nslackSendRules: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

Run it → FAIL.

- [ ] **Step 2: Implement `slackSendRules.ts`**

```ts
import { isDeadTokenError } from "./slackUserTokenService.js";

/** Pure rules for the portal's write path. */

export const MAX_TEXT = 4000;
/** Slack's conversations.open accepts up to 8 other people (D13). */
export const MAX_DM_OTHERS = 8;

export interface SlackFailure { status: number; code: string; message: string }

/**
 * Slack error code → HTTP status + a sentence the UI can show.
 * 409 means exactly one thing — "reconnect Slack" — and the UI keys off it.
 */
export function mapSlackError(code: string): SlackFailure {
  if (isDeadTokenError(code) || code === "missing_scope" || code === "not_allowed_token_type") {
    return { status: 409, code: "reconnect", message: "Reconnect Slack to keep messaging from Constellation." };
  }
  switch (code) {
    case "not_in_channel": return { status: 403, code, message: "Join this channel to post in it." };
    case "channel_not_found": return { status: 404, code, message: "Slack can't find that conversation." };
    case "is_archived": return { status: 410, code, message: "This channel is archived in Slack." };
    case "msg_too_long": return { status: 400, code, message: "That message is too long for Slack." };
    case "ratelimited": return { status: 429, code, message: "Slack is rate-limiting — try again in a moment." };
    case "restricted_action": return { status: 403, code, message: "Your Slack workspace doesn't allow that." };
    case "cant_update_message":
    case "cant_delete_message":
    case "edit_window_closed":
    case "message_not_found":
      return { status: 403, code, message: "Slack won't let you change that message." };
    case "already_reacted":
    case "no_reaction":
      return { status: 200, code: "noop", message: "" };
    default:
      return { status: 502, code, message: "Slack rejected the request." };
  }
}

export function validateOutgoingText(text: unknown): { ok: true; text: string } | { ok: false; failure: SlackFailure } {
  if (typeof text !== "string" || !text.trim()) {
    return { ok: false, failure: { status: 400, code: "empty", message: "Message is empty." } };
  }
  const t = text.trim();
  if (t.length > MAX_TEXT) {
    return { ok: false, failure: { status: 400, code: "too_long", message: `Messages are limited to ${MAX_TEXT} characters.` } };
  }
  return { ok: true, text: t };
}

export function validateDmTargets(meId: string, ids: unknown): { ok: true; ids: string[] } | { ok: false; failure: SlackFailure } {
  if (!Array.isArray(ids)) {
    return { ok: false, failure: { status: 400, code: "bad_targets", message: "Pick who to message." } };
  }
  const unique = [...new Set(ids.filter((x): x is string => typeof x === "string" && x.length > 0))].filter((id) => id !== meId);
  if (unique.length === 0) {
    return { ok: false, failure: { status: 400, code: "bad_targets", message: "Pick at least one other person." } };
  }
  if (unique.length > MAX_DM_OTHERS) {
    return { ok: false, failure: { status: 400, code: "too_many", message: "Group messages are limited to 8 other people — use a channel for larger groups." } };
  }
  return { ok: true, ids: unique };
}

/** Slack reaction names carry no colons; the UI may send ":tada:". */
export function normalizeEmojiName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim().replace(/^:+|:+$/g, "");
  return /^[a-z0-9_+\-']+(::skin-tone-[2-6])?$/i.test(name) ? name : null;
}
```

Run the test → `19 passed, 0 failed`.

- [ ] **Step 3: Implement `slackSendService.ts`**

```ts
import type { WebClient } from "@slack/web-api";
import { prisma } from "../db/prisma.js";
import { userClientFor, clearSlackUserToken, isDeadTokenError, slackErrorCode } from "./slackUserTokenService.js";
import { hasCapability, type SlackCapability } from "./slackScopes.js";
import { ensureChannelArchive, storeArchivedMessage, applyReaction, emitChat } from "./slackArchiveService.js";
import { setConversationMembers, addConversationMember } from "./slackMembershipService.js";
import { markConversationRead } from "./slackReadService.js";
import { startBackfill } from "./slackBackfillService.js";
import { mapSlackError, type SlackFailure } from "./slackSendRules.js";
import type { ConversationKind } from "./slackConversationAccess.js";
import type { RawSlackMessage } from "./slackArchivePolicy.js";

/** Everything here acts AS the member with their own user token (D1). */

export class SendError extends Error {
  constructor(public readonly failure: SlackFailure) {
    super(failure.message);
  }
}

type Actor = { client: WebClient; slackId: string };

async function actAs(memberId: string, caps: SlackCapability[]): Promise<Actor> {
  // interactive: fail fast on a rate limit — the member is waiting on a button.
  const uc = await userClientFor(memberId, { interactive: true });
  if (!uc || !caps.every((c) => hasCapability(uc.scopes, c))) throw new SendError(mapSlackError("missing_scope"));
  return { client: uc.client, slackId: uc.slackId };
}

async function call<T>(memberId: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const code = (err as { code?: string }).code === "slack_webapi_rate_limited_error" ? "ratelimited" : slackErrorCode(err);
    if (isDeadTokenError(code)) await clearSlackUserToken(memberId);
    throw new SendError(mapSlackError(code));
  }
}

export async function sendMessage(
  memberId: string,
  channelId: string,
  convKind: ConversationKind,
  input: { text: string; threadTs?: string; broadcast?: boolean }
): Promise<{ ts: string }> {
  const me = await actAs(memberId, ["post"]);
  const args = input.threadTs
    ? { channel: channelId, text: input.text, thread_ts: input.threadTs, reply_broadcast: !!input.broadcast, unfurl_links: true }
    : { channel: channelId, text: input.text, unfurl_links: true };
  const res = await call(memberId, () => me.client.chat.postMessage(args));
  const ts = res.ts as string;
  const posted = (res.message ?? {}) as RawSlackMessage;

  // D7: write the row from Slack's answer now. The echo event upserts the same
  // (channel, ts), so this is idempotent; forceHuman pins isBot = false
  // whatever flags the echo carries.
  await storeArchivedMessage(
    channelId,
    { ...posted, ts, user: me.slackId, text: posted.text ?? input.text, thread_ts: input.threadTs },
    false,
    me.client,
    { overwrite: true, forceHuman: true }
  );
  emitChat({ channelId, convKind, ts, threadTs: input.threadTs ?? null, kind: "new" });
  // Slack treats your own post as read; mirror that without a second API call.
  await markConversationRead(memberId, channelId, ts, { pushToSlack: false });
  return { ts };
}

async function ownRow(channelId: string, ts: string, slackId: string) {
  const row = await prisma.slackMessage.findUnique({
    where: { slackChannelId_ts: { slackChannelId: channelId, ts } },
    select: { id: true, authorSlackId: true, deletedAt: true, threadTs: true },
  });
  if (!row || row.deletedAt) throw new SendError({ status: 404, code: "not_found", message: "That message no longer exists." });
  if (row.authorSlackId !== slackId) throw new SendError({ status: 403, code: "not_yours", message: "You can only change your own messages." });
  return row;
}

export async function editMessage(memberId: string, channelId: string, convKind: ConversationKind, ts: string, text: string): Promise<void> {
  const me = await actAs(memberId, ["post"]);
  const row = await ownRow(channelId, ts, me.slackId);
  await call(memberId, () => me.client.chat.update({ channel: channelId, ts, text }));
  await prisma.slackMessage.update({ where: { id: row.id }, data: { text, editedAt: new Date() } });
  emitChat({ channelId, convKind, ts, threadTs: row.threadTs, kind: "edit" });
}

export async function deleteMessage(memberId: string, channelId: string, convKind: ConversationKind, ts: string): Promise<void> {
  const me = await actAs(memberId, ["post"]);
  const row = await ownRow(channelId, ts, me.slackId);
  await call(memberId, () => me.client.chat.delete({ channel: channelId, ts }));
  // Tombstone now; the message_deleted echo also recomputes reply counts and
  // retracts notifications (Task 24).
  await prisma.slackMessage.update({ where: { id: row.id }, data: { deletedAt: new Date() } });
  emitChat({ channelId, convKind, ts, threadTs: row.threadTs, kind: "delete" });
}

export async function react(memberId: string, channelId: string, ts: string, name: string, add: boolean): Promise<void> {
  const me = await actAs(memberId, ["react"]);
  try {
    await call(memberId, () =>
      add
        ? me.client.reactions.add({ channel: channelId, timestamp: ts, name })
        : me.client.reactions.remove({ channel: channelId, timestamp: ts, name })
    );
  } catch (err) {
    // already_reacted / no_reaction: Slack is already in the state we want.
    if (!(err instanceof SendError && err.failure.code === "noop")) throw err;
  }
  await applyReaction(channelId, ts, `:${name}:`, me.slackId, add);
}

export async function uploadFile(
  memberId: string,
  channelId: string,
  file: { buffer: Buffer; filename: string },
  opts: { threadTs?: string; comment?: string }
): Promise<void> {
  const me = await actAs(memberId, ["post", "files"]);
  await call(memberId, () =>
    me.client.filesUploadV2({
      channel_id: channelId,
      file: file.buffer,
      filename: file.filename,
      initial_comment: opts.comment,
      thread_ts: opts.threadTs,
    } as Parameters<WebClient["filesUploadV2"]>[0])
  );
  // The file_share message arrives through the normal event path, which
  // archives it and its attachment like any other message.
}

export async function openDm(memberId: string, otherMemberIds: string[]): Promise<{ channelId: string; kind: ConversationKind }> {
  const me = await actAs(memberId, ["dm"]);
  const others = await prisma.member.findMany({
    where: { id: { in: otherMemberIds }, isBot: false },
    select: { slackId: true },
  });
  if (others.length !== otherMemberIds.length) {
    throw new SendError({ status: 404, code: "unknown_member", message: "One of those people isn't a club member." });
  }
  const users = others.map((o) => o.slackId);
  const res = await call(memberId, () => me.client.conversations.open({ users: users.join(","), return_im: true }));
  const channelId = (res.channel as { id?: string } | undefined)?.id;
  if (!channelId) throw new SendError({ status: 502, code: "open_failed", message: "Slack didn't open the conversation." });

  const kind: ConversationKind = users.length === 1 ? "IM" : "MPIM";
  await ensureChannelArchive(channelId, me.client, { kind });
  await setConversationMembers(channelId, [me.slackId, ...users]);

  // First open of a conversation that already has Slack history: import it
  // with the opener's own token. No-op once imported.
  const a = await prisma.slackChannelArchive.findUnique({
    where: { slackChannelId: channelId },
    select: { backfillStatus: true },
  });
  if (a?.backfillStatus === "NOT_STARTED") await startBackfill(channelId, { requesterMemberId: memberId });
  return { channelId, kind };
}

export async function joinChannel(memberId: string, channelId: string): Promise<void> {
  const me = await actAs(memberId, ["join"]);
  await call(memberId, () => me.client.conversations.join({ channel: channelId }));
  await addConversationMember(channelId, me.slackId);
}
```

- [ ] **Step 4: Append the write routes to `chat.ts`**

Add these imports at the top of `backend/src/api/chat.ts`:

```ts
import multer from "multer";
import { validateOutgoingText, validateDmTargets, normalizeEmojiName } from "../services/slackSendRules.js";
import {
  SendError, sendMessage, editMessage, deleteMessage, react, uploadFile, openDm, joinChannel,
} from "../services/slackSendService.js";
import { importMemberDms } from "../services/slackBackfillService.js";
```

Append to the end of the file:

```ts
// ── Writes (all as the member's own Slack identity) ──────────

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024, files: 1 } });

function fail(res: Response, err: unknown, label: string): void {
  if (err instanceof SendError) {
    if (err.failure.status === 200) return void res.json({ ok: true });
    return void res.status(err.failure.status).json({ error: err.failure.message, code: err.failure.code });
  }
  console.error(`chat/${label} error:`, err);
  res.status(500).json({ error: "Something went wrong talking to Slack" });
}

/** Posting needs real membership; a public channel you haven't joined offers "Join". */
function requireParticipant(req: Request, res: Response): boolean {
  if (req.conversation?.canPost) return true;
  res.status(403).json({
    error: req.conversation?.kind === "CHANNEL" ? "Join this channel to post in it." : "You are not in this conversation.",
    code: "not_in_channel",
  });
  return false;
}

const optionalTs = (v: unknown): string | undefined => (typeof v === "string" && TS_RE.test(v) ? v : undefined);

chatRouter.post("/conversations/:channelId/messages", requireAuth, requireConversationRead, async (req: Request, res: Response) => {
  if (!requireParticipant(req, res)) return;
  const v = validateOutgoingText(req.body?.text);
  if (!v.ok) return void res.status(v.failure.status).json({ error: v.failure.message, code: v.failure.code });
  try {
    const c = req.conversation!;
    res.json(await sendMessage(req.memberId!, c.channelId, c.kind!, {
      text: v.text,
      threadTs: optionalTs(req.body?.threadTs),
      broadcast: req.body?.broadcast === true,
    }));
  } catch (err) {
    fail(res, err, "send");
  }
});

chatRouter.patch("/conversations/:channelId/messages/:ts", requireAuth, requireConversationRead, async (req: Request, res: Response) => {
  if (!requireParticipant(req, res)) return;
  const ts = optionalTs(req.params.ts);
  if (!ts) return void res.status(400).json({ error: "Bad ts" });
  const v = validateOutgoingText(req.body?.text);
  if (!v.ok) return void res.status(v.failure.status).json({ error: v.failure.message, code: v.failure.code });
  try {
    const c = req.conversation!;
    await editMessage(req.memberId!, c.channelId, c.kind!, ts, v.text);
    res.json({ ok: true });
  } catch (err) {
    fail(res, err, "edit");
  }
});

chatRouter.delete("/conversations/:channelId/messages/:ts", requireAuth, requireConversationRead, async (req: Request, res: Response) => {
  if (!requireParticipant(req, res)) return;
  const ts = optionalTs(req.params.ts);
  if (!ts) return void res.status(400).json({ error: "Bad ts" });
  try {
    const c = req.conversation!;
    await deleteMessage(req.memberId!, c.channelId, c.kind!, ts);
    res.json({ ok: true });
  } catch (err) {
    fail(res, err, "delete");
  }
});

chatRouter.post("/conversations/:channelId/messages/:ts/reactions", requireAuth, requireConversationRead, async (req: Request, res: Response) => {
  if (!requireParticipant(req, res)) return;
  const ts = optionalTs(req.params.ts);
  const name = normalizeEmojiName(req.body?.emoji);
  if (!ts || !name) return void res.status(400).json({ error: "Bad reaction" });
  try {
    await react(req.memberId!, req.conversation!.channelId, ts, name, req.body?.add !== false);
    res.json({ ok: true });
  } catch (err) {
    fail(res, err, "react");
  }
});

chatRouter.post("/conversations/:channelId/files", requireAuth, requireConversationRead, upload.single("file"), async (req: Request, res: Response) => {
  if (!requireParticipant(req, res)) return;
  const file = req.file;
  if (!file) return void res.status(400).json({ error: "No file" });
  const comment = typeof req.body?.comment === "string" && req.body.comment.trim() ? req.body.comment.trim().slice(0, 4000) : undefined;
  try {
    await uploadFile(req.memberId!, req.conversation!.channelId, { buffer: file.buffer, filename: file.originalname }, {
      threadTs: optionalTs(req.body?.threadTs),
      comment,
    });
    res.json({ ok: true });
  } catch (err) {
    fail(res, err, "upload");
  }
});

chatRouter.post("/conversations/:channelId/join", requireAuth, requireConversationRead, async (req: Request, res: Response) => {
  const c = req.conversation!;
  if (c.kind !== "CHANNEL") return void res.status(400).json({ error: "Only public channels can be joined" });
  if (c.isParticipant) return void res.json({ ok: true });
  try {
    await joinChannel(req.memberId!, c.channelId);
    res.json({ ok: true });
  } catch (err) {
    fail(res, err, "join");
  }
});

chatRouter.post("/dms", requireAuth, async (req: Request, res: Response) => {
  const v = validateDmTargets(req.memberId!, req.body?.memberIds);
  if (!v.ok) return void res.status(v.failure.status).json({ error: v.failure.message, code: v.failure.code });
  try {
    res.json(await openDm(req.memberId!, v.ids));
  } catch (err) {
    fail(res, err, "open-dm");
  }
});

chatRouter.post("/dms/import", requireAuth, async (req: Request, res: Response) => {
  try {
    const r = await importMemberDms(req.memberId!);
    if (!r.started && r.reason === "reconnect") {
      return void res.status(409).json({ error: "Reconnect Slack to import your DMs.", code: "reconnect" });
    }
    res.json(r);
  } catch (err) {
    fail(res, err, "import-dms");
  }
});
```

- [ ] **Step 5: Gate + commit**

Run the rules test and the gate, then:

```bash
git add backend/src/services/slackSendRules.ts backend/src/services/slackSendRules.test.ts backend/src/services/slackSendService.ts backend/src/api/chat.ts
git commit -m "feat(slack-portal): post, edit, delete, react, upload, open DMs and join channels as the member"
```

---

# Part D — Chat UI

Frontend tasks never read `ProjectDetail.jsx` or `clubpm-theme.css` in full. Grep the anchors given.

## Task 12: Client functions and conversation-scoped leaf components

**Files:**
- Modify: `src/api/clubPmClient.js` (append)
- Modify: `src/components/clubpm/chat/ChatFileAttachment.jsx`
- Modify: `src/components/clubpm/chat/ChatThreadDrawer.jsx`
- Modify: `src/components/clubpm/chat/ChatMessage.jsx`

**Interfaces produced (client):** `listConversations`, `getConversation`, `getConversationMessages`, `getConversationThread`, `searchConversation`, `markConversationRead`, `sendChatMessage`, `editChatMessage`, `deleteChatMessage`, `reactToChatMessage`, `joinConversation`, `muteConversation` (its route lands in Task 25), `openDm`, `importMyDms`, `backfillPublicChannels`, `uploadChatFile`, `conversationFileUrl`.

- [ ] **Step 1: Append the client functions**

Append to `src/api/clubPmClient.js`:

```js
// ── Slack portal: conversation-scoped chat (/api/chat) ───────
// Everything the chat UI needs, keyed on the Slack conversation id rather than
// a project. HTTP 409 from any write means "reconnect Slack" (plan Task 11).

const chatPath = (channelId, rest = "") => `/api/chat/conversations/${encodeURIComponent(channelId)}${rest}`;

export const listConversations = () => get("/api/chat/conversations");
export const getConversation = (channelId) => get(chatPath(channelId));

export function getConversationMessages(channelId, before) {
  return get(chatPath(channelId, `/messages${before ? `?before=${encodeURIComponent(before)}` : ""}`));
}
export const getConversationThread = (channelId, ts) => get(chatPath(channelId, `/thread/${encodeURIComponent(ts)}`));
export const searchConversation = (channelId, q) => get(chatPath(channelId, `/search?q=${encodeURIComponent(q)}`));
export const markConversationRead = (channelId, ts) => post(chatPath(channelId, "/read"), { ts });

export const sendChatMessage = (channelId, { text, threadTs, broadcast } = {}) =>
  post(chatPath(channelId, "/messages"), { text, threadTs, broadcast });
export const editChatMessage = (channelId, ts, text) =>
  patch(chatPath(channelId, `/messages/${encodeURIComponent(ts)}`), { text });
export const deleteChatMessage = (channelId, ts) =>
  del(chatPath(channelId, `/messages/${encodeURIComponent(ts)}`));
export const reactToChatMessage = (channelId, ts, emoji, add) =>
  post(chatPath(channelId, `/messages/${encodeURIComponent(ts)}/reactions`), { emoji, add });
export const joinConversation = (channelId) => post(chatPath(channelId, "/join"), {});
/** Constellation-side mute (D8) — silences mirrored pings; Slack's own mute has no API. */
export const muteConversation = (channelId, muted) => post(chatPath(channelId, "/mute"), { muted });

/** Open (or find) a DM / group DM with these Member ids → { channelId, kind }. */
export const openDm = (memberIds) => post("/api/chat/dms", { memberIds });
/** Import the signed-in member's DM history (idempotent server-side). */
export const importMyDms = () => post("/api/chat/dms/import", {});
/** Admin: join + import every public channel. */
export const backfillPublicChannels = () => post("/api/slack-archive/backfill-public", {});

/** Multipart upload — `post()` is JSON-only. */
export async function uploadChatFile(channelId, file, { threadTs, comment } = {}) {
  const fd = new FormData();
  fd.append("file", file);
  if (threadTs) fd.append("threadTs", threadTs);
  if (comment) fd.append("comment", comment);
  const response = await fetch(`${BASE_URL}${chatPath(channelId, "/files")}`, {
    method: "POST",
    credentials: "include",
    headers: { ...authHeaders() },
    body: fd,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(response.status, body.error ?? "Upload failed");
  }
  return response.json();
}

/**
 * URL for an archived attachment in ANY conversation. The Bearer token rides
 * along as `?token=` because an <img> cannot send headers (Brave/Safari).
 * Never build this URL by hand in a component.
 */
export function conversationFileUrl(slackFileId) {
  const token = getStoredToken();
  const base = `${BASE_URL}/api/chat/files/${encodeURIComponent(slackFileId)}`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}
```

- [ ] **Step 2: `ChatFileAttachment` uses the conversation-scoped proxy**

In `src/components/clubpm/chat/ChatFileAttachment.jsx`:
- change the import to `import { conversationFileUrl } from "../../../api/clubPmClient";`
- change the signature to `export default function ChatFileAttachment({ file }) {`
- change `const href = chatFileUrl(projectId, file.id);` to `const href = conversationFileUrl(file.id);`

- [ ] **Step 3: `ChatThreadDrawer` reads through `/api/chat`**

In `src/components/clubpm/chat/ChatThreadDrawer.jsx`:
- change the import to `import { getConversationThread } from "../../../api/clubPmClient";`
- change the signature to `export default function ChatThreadDrawer({ channelId, ts, onClose }) {`
- change `getChatThread(projectId, channelId, ts)` to `getConversationThread(channelId, ts)` and the effect's dependency list to `[channelId, ts]`
- change `<ChatMessage key={m.id} message={m} projectId={projectId} compact />` to `<ChatMessage key={m.id} message={m} compact />`

- [ ] **Step 4: `ChatMessage` drops `projectId`**

In `src/components/clubpm/chat/ChatMessage.jsx`:
- change the signature to `export default function ChatMessage({ message, compact = false, onOpenThread }) {`
- change `<ChatFileAttachment key={f.id} file={f} projectId={projectId} />` to `<ChatFileAttachment key={f.id} file={f} />`

`ChatTab.jsx` still passes `projectId` to these two components until Task 13. The extra prop is harmless.

- [ ] **Step 5: Gate + commit**

`npm run build` (root) must compile with no new warnings.

```bash
git add src/api/clubPmClient.js src/components/clubpm/chat/ChatFileAttachment.jsx src/components/clubpm/chat/ChatThreadDrawer.jsx src/components/clubpm/chat/ChatMessage.jsx
git commit -m "feat(slack-portal): conversation-scoped chat client and leaf components"
```

---

## Task 13: `ChatConversation` and the `ChatTab` refactor

**Files:**
- Create: `src/components/clubpm/chat/ChatConversation.jsx`
- Modify: `src/components/clubpm/chat/ChatTab.jsx` (full replacement)

**Interfaces produced:** `<ChatConversation channelId conversation initialThreadTs? emptyHint? onJoined? composerPlaceholder? />`, the one conversation view shared by the Chat tab, `/clubpm/chat`, and DMs. It dispatches a `clubpm:conversation-read` window event (`{ channelId }`) after each read mark. `<ChatTab project isAdmin initialChannelId? initialThreadTs? />`.

- [ ] **Step 1: Create `ChatConversation.jsx`**

```jsx
import { useCallback, useEffect, useRef, useState } from "react";
import {
  getConversationMessages, searchConversation, markConversationRead,
} from "../../../api/clubPmClient";
import ChatMessage from "./ChatMessage";
import ChatThreadDrawer from "./ChatThreadDrawer";

// How close to the bottom (px) still counts as "reading the latest", so a live
// message keeps the view pinned instead of yanking someone reading history.
const PIN_THRESHOLD = 80;
// A read mark waits this long, so scrolling past a conversation doesn't clear it.
const READ_DEBOUNCE_MS = 1200;

function isPinnedEl(el) {
  return !el || el.scrollHeight - el.scrollTop - el.clientHeight < PIN_THRESHOLD;
}
function pinToBottom(ref) {
  requestAnimationFrame(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  });
}

/**
 * One Slack conversation: paginated history, live updates, search, threads,
 * and read marking. Shared by the project Chat tab, /clubpm/chat, and DMs on
 * the Members page, so all three behave identically.
 *
 * `conversation` is the header from GET /api/chat/conversations/:id
 * ({ kind, canPost, isParticipant, ... }); null while it loads.
 */
export default function ChatConversation({
  channelId,
  conversation = null,
  initialThreadTs = null,
  emptyHint = null,
  onJoined = null,
  composerPlaceholder = "Message",
}) {
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [threadTs, setThreadTs] = useState(initialThreadTs);

  const scrollRef = useRef(null);
  const lastMarkedRef = useRef(null);
  const markTimerRef = useRef(null);

  useEffect(() => {
    setResults(null);
    setQuery("");
    setThreadTs(initialThreadTs);
    lastMarkedRef.current = null;
  }, [channelId, initialThreadTs]);

  // ── History ────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!channelId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getConversationMessages(channelId);
      setMessages(data.messages ?? []);
      setHasMore(!!data.hasMore);
    } catch {
      setError("Could not load messages.");
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!loading) pinToBottom(scrollRef); }, [loading, channelId]);

  const loadOlder = async () => {
    if (!hasMore || loadingMore || messages.length === 0) return;
    setLoadingMore(true);
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    try {
      const data = await getConversationMessages(channelId, messages[0].ts);
      setMessages(prev => [...(data.messages ?? []), ...prev]);
      setHasMore(!!data.hasMore);
      requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - prevHeight; });
    } catch {
      setError("Could not load older messages.");
    } finally {
      setLoadingMore(false);
    }
  };

  // Silent refresh of the newest page. Keeps older pages the reader pulled in.
  const refreshLatest = useCallback(async (forcePin = false) => {
    if (!channelId) return;
    const wasPinned = forcePin || isPinnedEl(scrollRef.current);
    try {
      const data = await getConversationMessages(channelId);
      const latest = data.messages ?? [];
      const oldest = latest.length ? parseFloat(latest[0].ts) : Infinity;
      setMessages(prev => [...prev.filter(m => parseFloat(m.ts) < oldest), ...latest]);
      if (wasPinned) pinToBottom(scrollRef);
    } catch {
      // A missed live update is recovered by the next one or a reload.
    }
  }, [channelId]);

  // ── Live ───────────────────────────────────────────────────
  useEffect(() => {
    const onLive = (e) => {
      // Refetch rather than rebuild a DTO client-side: the server owns token
      // rendering, reaction shape, and reply counts.
      if (e.detail?.channelId === channelId) refreshLatest();
    };
    window.addEventListener("clubpm:slack-message", onLive);
    return () => window.removeEventListener("clubpm:slack-message", onLive);
  }, [channelId, refreshLatest]);

  // ── Read marking (D11) ─────────────────────────────────────
  // Only a participant has a read cursor, and only what is actually on screen
  // counts: tab visible, view pinned to the newest message, not in search.
  const newestTs = messages.length ? messages[messages.length - 1].ts : null;
  const isParticipant = !!conversation?.isParticipant;
  const scheduleMark = useCallback(() => {
    if (!isParticipant || !newestTs || results) return;
    if (document.visibilityState !== "visible" || !isPinnedEl(scrollRef.current)) return;
    if (lastMarkedRef.current === newestTs) return;
    clearTimeout(markTimerRef.current);
    markTimerRef.current = setTimeout(() => {
      lastMarkedRef.current = newestTs;
      markConversationRead(channelId, newestTs)
        .then(() => window.dispatchEvent(new CustomEvent("clubpm:conversation-read", { detail: { channelId } })))
        .catch(() => { lastMarkedRef.current = null; });
    }, READ_DEBOUNCE_MS);
  }, [channelId, isParticipant, newestTs, results]);

  useEffect(() => { scheduleMark(); }, [scheduleMark]);
  useEffect(() => {
    document.addEventListener("visibilitychange", scheduleMark);
    return () => {
      document.removeEventListener("visibilitychange", scheduleMark);
      clearTimeout(markTimerRef.current);
    };
  }, [scheduleMark]);

  // ── Search ─────────────────────────────────────────────────
  const runSearch = async (e) => {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 2) { setResults(null); return; }
    try {
      const data = await searchConversation(channelId, q);
      setResults(data.messages ?? []);
    } catch {
      setError("Search failed.");
    }
  };

  const shown = results ?? messages;
  const canPost = !!conversation?.canPost;

  return (
    <div className="cpm-chat-conv">
      <div className="cpm-chat-toolbar">
        <form className="cpm-chat-search" onSubmit={runSearch}>
          <input
            type="search"
            placeholder="Search this conversation…"
            aria-label="Search this conversation"
            value={query}
            onChange={e => { setQuery(e.target.value); if (!e.target.value) setResults(null); }}
          />
          <button type="submit" aria-label="Search">
            <i className="fas fa-magnifying-glass" aria-hidden="true" />
          </button>
        </form>
      </div>

      {results && (
        <div className="cpm-chat-banner">
          {results.length} result{results.length === 1 ? "" : "s"} ·{" "}
          <button type="button" className="cpm-chat-linkbtn" onClick={() => { setResults(null); setQuery(""); }}>
            back to the conversation
          </button>
        </div>
      )}

      <div className="cpm-chat-layout">
        <div className="cpm-chat-main">
          <div className="cpm-chat-scroll" ref={scrollRef} onScroll={scheduleMark}>
            {loading && <div className="cpm-spinner" aria-label="Loading" />}
            {error && <div className="cpm-chat-banner cpm-chat-banner--error">{error}</div>}

            {!loading && !results && hasMore && (
              <button type="button" className="cpm-chat-older" onClick={loadOlder} disabled={loadingMore}>
                {loadingMore ? "Loading…" : "Load older messages"}
              </button>
            )}

            {!loading && shown.length === 0 && !error && (
              <div className="cpm-chat-empty">
                <div>{emptyHint ?? "Nothing here yet."}</div>
              </div>
            )}

            {shown.map(m => (
              <ChatMessage
                key={m.id}
                message={m}
                channelId={channelId}
                canPost={canPost}
                onOpenThread={setThreadTs}
                onChanged={() => refreshLatest()}
              />
            ))}
          </div>
        </div>

        {threadTs && (
          <ChatThreadDrawer
            channelId={channelId}
            ts={threadTs}
            conversation={conversation}
            onClose={() => setThreadTs(null)}
          />
        )}
      </div>
    </div>
  );
}
```

`onJoined` and `composerPlaceholder` are consumed by the composer mounted in Task 14. The `canPost`/`onChanged`/`conversation` props passed to children are consumed in Task 15; React ignores them until then.

- [ ] **Step 2: Replace `ChatTab.jsx`**

```jsx
import { useCallback, useEffect, useRef, useState } from "react";
import {
  getChatChannels, getConversation, startChatBackfill, getChatBackfillStatus,
} from "../../../api/clubPmClient";
import ChatConversation from "./ChatConversation";

/**
 * The project Chat tab: a picker over the project's linked channels (already
 * filtered server-side to what Slack lets this member see, D3), the admin
 * history import, and the shared conversation view.
 */
export default function ChatTab({ project, isAdmin, initialChannelId = null, initialThreadTs = null }) {
  const projectId = project?.id;

  const [channels, setChannels] = useState([]);
  const [channelsLoaded, setChannelsLoaded] = useState(false);
  const [channelId, setChannelId] = useState(null);
  const [conversation, setConversation] = useState(null);
  const [error, setError] = useState(null);
  const [backfill, setBackfill] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const pollRef = useRef(null);
  const activeChannelRef = useRef(null);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  // ── Channels ───────────────────────────────────────────────
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setChannelsLoaded(false);
    getChatChannels(projectId)
      .then(data => {
        if (cancelled) return;
        const list = data.channels ?? [];
        setChannels(list);
        setChannelId(prev => {
          if (list.some(c => c.slackChannelId === prev)) return prev;
          if (initialChannelId && list.some(c => c.slackChannelId === initialChannelId)) return initialChannelId;
          return list[0]?.slackChannelId ?? null;
        });
      })
      .catch(() => { if (!cancelled) setError("Could not load channels."); })
      .finally(() => { if (!cancelled) setChannelsLoaded(true); });
    return () => { cancelled = true; };
  }, [projectId, initialChannelId]);

  // ── Header: canPost / isParticipant for the selected channel ──
  const loadConversation = useCallback(() => {
    if (!channelId) { setConversation(null); return; }
    getConversation(channelId).then(setConversation).catch(() => setConversation(null));
  }, [channelId]);

  useEffect(() => { loadConversation(); }, [loadConversation]);
  useEffect(() => {
    const onMembership = (e) => { if (e.detail?.channelId === channelId) loadConversation(); };
    window.addEventListener("clubpm:slack-membership", onMembership);
    return () => window.removeEventListener("clubpm:slack-membership", onMembership);
  }, [channelId, loadConversation]);

  // ── Backfill ───────────────────────────────────────────────
  // The poll belongs to one channel; stop it on channel switch and unmount.
  useEffect(() => {
    activeChannelRef.current = channelId;
    setBackfill(null);
    return () => {
      activeChannelRef.current = null;
      clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [channelId]);

  const runBackfill = async () => {
    if (!channelId || backfill?.status === "RUNNING") return;
    const target = channelId;
    stopPolling();
    setBackfill({ status: "RUNNING" });
    try {
      await startChatBackfill(projectId, target);
      if (activeChannelRef.current !== target) return;
      pollRef.current = setInterval(async () => {
        try {
          const s = await getChatBackfillStatus(projectId, target);
          setBackfill(s);
          if (s.status === "COMPLETE" || s.status === "FAILED") {
            stopPolling();
            setReloadKey(k => k + 1);
          }
        } catch {
          stopPolling();
          setBackfill({ status: "FAILED", error: "Lost track of the import — reload to check its status." });
        }
      }, 3000);
    } catch {
      setBackfill({ status: "FAILED", error: "Could not start backfill." });
    }
  };

  if (channelsLoaded && channels.length === 0 && !error) {
    return (
      <div className="cpm-chat-empty">
        <i className="fab fa-slack" aria-hidden="true" />
        <div>No Slack channel you can see is linked to this project.</div>
        <div className="cpm-chat-empty-sub">Link one from the project settings, or ask to be added to its private channel in Slack.</div>
      </div>
    );
  }

  return (
    <div className="cpm-chat-wrap">
      <div className="cpm-chat-toolbar">
        <select
          className="cpm-chat-channel-select"
          aria-label="Slack channel"
          value={channelId ?? ""}
          onChange={e => setChannelId(e.target.value)}
        >
          {channels.map(c => (
            <option key={c.slackChannelId} value={c.slackChannelId}>
              #{c.name} ({c.messageCount})
            </option>
          ))}
        </select>

        {isAdmin && (
          <button
            type="button"
            className="cpm-chat-backfill-btn"
            onClick={runBackfill}
            disabled={!channelId || backfill?.status === "RUNNING"}
          >
            <i className="fas fa-clock-rotate-left" aria-hidden="true" />
            {backfill?.status === "RUNNING" ? "Importing…" : "Import history"}
          </button>
        )}
      </div>

      {error && <div className="cpm-chat-banner cpm-chat-banner--error">{error}</div>}
      {backfill?.status === "FAILED" && (
        <div className="cpm-chat-banner cpm-chat-banner--error">
          History import failed{backfill.error ? `: ${backfill.error}` : "."}
        </div>
      )}

      {channelId && (
        <ChatConversation
          key={`${channelId}:${reloadKey}`}
          channelId={channelId}
          conversation={conversation}
          initialThreadTs={channelId === initialChannelId ? initialThreadTs : null}
          emptyHint={isAdmin ? "Nothing archived here yet — use “Import history” to pull in what Slack still has." : "Nothing archived here yet."}
          onJoined={loadConversation}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Gate + commit**

`npm run build` → compiles with no warnings. Open a project's Chat tab in `npm start` and confirm messages load, "Load older" works, and a thread opens.

```bash
git add src/components/clubpm/chat/ChatConversation.jsx src/components/clubpm/chat/ChatTab.jsx
git commit -m "feat(slack-portal): shared ChatConversation view; Chat tab reads through /api/chat"
```

---

## Task 14: Composer and the outgoing encoder

**Files:**
- Create: `src/components/clubpm/chat/encodeOutgoing.js`
- Create: `src/components/clubpm/chat/encodeOutgoing.test.js`
- Create: `src/components/clubpm/chat/ChatComposer.jsx`
- Modify: `src/components/clubpm/chat/ChatConversation.jsx` (mount the composer)

**Interfaces produced:** `encodeOutgoing(text, mentions) → mrkdwn`, `decodeForEdit(tokens) → { text, mentions }`; `<ChatComposer channelId conversation threadTs? placeholder? onSent? onJoined? />`; `reconnectHref()`; `<SlackReconnectNotice compact? />`.

- [ ] **Step 1: Failing encoder test**

`src/components/clubpm/chat/encodeOutgoing.test.js`:

```js
import { encodeOutgoing, decodeForEdit } from './encodeOutgoing';

describe('encodeOutgoing', () => {
  test('escapes Slack control characters', () => {
    expect(encodeOutgoing('a < b && c > d')).toBe('a &lt; b &amp;&amp; c &gt; d');
  });
  test('turns an autocompleted mention into <@U…>', () => {
    expect(encodeOutgoing('hi @Ann Lee!', { 'Ann Lee': 'U1' })).toBe('hi <@U1>!');
  });
  test('longest label wins', () => {
    expect(encodeOutgoing('@Ann and @Ann Lee', { Ann: 'U1', 'Ann Lee': 'U2' })).toBe('<@U1> and <@U2>');
  });
  test('does not match inside a word or an email', () => {
    expect(encodeOutgoing('bob@Ann @Annie', { Ann: 'U1' })).toBe('bob@Ann @Annie');
  });
  test('labels with regex characters are literal', () => {
    expect(encodeOutgoing('cc @Dr. Who', { 'Dr. Who': 'U9' })).toBe('cc <@U9>');
  });
  test('broadcast keywords become special mentions', () => {
    expect(encodeOutgoing('@here and @channel, not @everyoneelse')).toBe('<!here> and <!channel>, not @everyoneelse');
  });
  test('an unknown @word stays plain text', () => {
    expect(encodeOutgoing('ping @nobody')).toBe('ping @nobody');
  });
});

describe('decodeForEdit', () => {
  test('round-trips mentions and formatting', () => {
    const tokens = [
      { type: 'text', value: 'hi ' },
      { type: 'mention', slackId: 'U1', label: 'Ann' },
      { type: 'text', value: ' ' },
      { type: 'bold', children: [{ type: 'text', value: 'x' }] },
      { type: 'text', value: ' ' },
      { type: 'code', value: 'a<b' },
    ];
    const { text, mentions } = decodeForEdit(tokens);
    expect(text).toBe('hi @Ann *x* `a<b`');
    expect(mentions).toEqual({ Ann: 'U1' });
    expect(encodeOutgoing(text, mentions)).toBe('hi <@U1> *x* `a&lt;b`');
  });
  test('broadcast mentions decode to their keyword', () => {
    const { text } = decodeForEdit([{ type: 'mention', slackId: '!here', label: '@here' }]);
    expect(text).toBe('@here');
  });
});
```

Run: `npx react-scripts test --watchAll=false src/components/clubpm/chat/encodeOutgoing.test.js` → FAIL (module not found).

- [ ] **Step 2: Implement `encodeOutgoing.js`**

```js
/**
 * Composer text ⇄ Slack mrkdwn.
 *
 * Slack requires &, < and > escaped in message text — they are the control
 * characters of <@U…>, <#C…> and <url|label> — and a mention only pings when it
 * is sent as <@U…>. Plain "@Name" is inert text.
 *
 * `mentions` maps the exact label autocomplete inserted (without the "@") to a
 * Slack user id. Longest labels are replaced first so "@Ann Lee" beats "@Ann".
 */
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const escapeSlack = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function encodeOutgoing(text, mentions = {}) {
  let out = escapeSlack(text);
  const labels = Object.keys(mentions).filter(Boolean).sort((a, b) => b.length - a.length);
  for (const label of labels) {
    const re = new RegExp(`(^|[^\\w@])@${escapeRegExp(escapeSlack(label))}(?![\\w])`, 'g');
    out = out.replace(re, (_m, pre) => `${pre}<@${mentions[label]}>`);
  }
  return out.replace(/(^|[^\w@])@(channel|here|everyone)(?![\w])/g, (_m, pre, kw) => `${pre}<!${kw}>`);
}

const BROADCAST = new Set(['channel', 'here', 'everyone']);

/** A message's rendered tokens → editable composer text + its mention map. */
export function decodeForEdit(tokens) {
  const mentions = {};
  const walk = (list) => (list ?? []).map((t) => {
    switch (t.type) {
      case 'text': return t.value;
      case 'mention': {
        const bare = String(t.label ?? '').replace(/^@+/, '');
        if (String(t.slackId).startsWith('!')) {
          const kw = String(t.slackId).slice(1).split('^')[0];
          return `@${BROADCAST.has(kw) ? kw : bare}`;
        }
        mentions[bare] = t.slackId;
        return `@${bare}`;
      }
      case 'channel': return `#${t.label}`;
      case 'link': return t.href;
      case 'code': return `\`${t.value}\``;
      case 'codeblock': return `\`\`\`\n${t.value}\n\`\`\``;
      case 'emoji': return `:${t.name}:`;
      case 'bold': return `*${walk(t.children)}*`;
      case 'italic': return `_${walk(t.children)}_`;
      case 'strike': return `~${walk(t.children)}~`;
      default: return '';
    }
  }).join('');
  return { text: walk(tokens), mentions };
}
```

Run the test → PASS (9 tests).

- [ ] **Step 3: Create `ChatComposer.jsx`**

```jsx
import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { get, apiBaseUrl, sendChatMessage, uploadChatFile, joinConversation } from "../../../api/clubPmClient";
import { useClubPmAuth } from "../../../clubpm/ClubPmAuth";
import { encodeOutgoing } from "./encodeOutgoing";

// One roster fetch per page load, shared by every composer on the page.
let rosterPromise = null;
function loadRoster() {
  if (!rosterPromise) {
    rosterPromise = get("/api/members").catch(() => {
      rosterPromise = null;
      return [];
    });
  }
  return rosterPromise;
}

/** Sign in with Slack again (for the portal scopes) and come back to this page. */
export function reconnectHref() {
  const back = window.location.pathname + window.location.search;
  return `${apiBaseUrl}/auth/slack?returnTo=${encodeURIComponent(back)}`;
}

/** Shown wherever a portal feature needs scopes the member hasn't granted yet. */
export function SlackReconnectNotice({ compact = false }) {
  return (
    <div className={`cpm-chat-reconnect${compact ? " cpm-chat-reconnect--compact" : ""}`}>
      <div><b>Connect Slack to send and read DMs from Constellation.</b></div>
      <div className="cpm-chat-reconnect-sub">
        Constellation archives your Slack DMs so you can read them here. Only the people in each
        conversation can see them — admins can't.
      </div>
      <a className="clubpm-btn-primary cpm-chat-reconnect-btn" href={reconnectHref()}>
        <i className="fab fa-slack" aria-hidden="true" /> Connect Slack
      </a>
    </div>
  );
}

export default function ChatComposer({
  channelId,
  conversation,
  threadTs = null,
  placeholder = "Message",
  onSent = null,
  onJoined = null,
}) {
  const { member } = useClubPmAuth();
  const caps = member?.slackCapabilities ?? {};

  const [text, setText] = useState("");
  const [mentions, setMentions] = useState({});
  const [sending, setSending] = useState(false);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [roster, setRoster] = useState([]);
  const [suggest, setSuggest] = useState(null); // { query, start }
  const [highlight, setHighlight] = useState(0);
  const areaRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    let alive = true;
    loadRoster().then(r => { if (alive) setRoster(Array.isArray(r) ? r : []); });
    return () => { alive = false; };
  }, []);

  useEffect(() => { setText(""); setMentions({}); setSuggest(null); }, [channelId, threadTs]);

  const myId = member?.id;
  const matches = useMemo(() => {
    if (!suggest) return [];
    const q = suggest.query.toLowerCase();
    return roster
      .filter(m => m.id !== myId && (m.displayName?.toLowerCase().includes(q) || m.slackHandle?.toLowerCase().includes(q)))
      .slice(0, 6);
  }, [suggest, roster, myId]);

  // HTTP 409 means exactly "reconnect Slack" (plan Task 11).
  const handleError = (err) => {
    if (err?.status === 409) setNeedsReconnect(true);
    else toast.error(err?.message || "Could not send to Slack.");
  };

  const join = async () => {
    setSending(true);
    try {
      await joinConversation(channelId);
      onJoined?.();
    } catch (err) {
      handleError(err);
    } finally {
      setSending(false);
    }
  };

  const onChange = (e) => {
    const value = e.target.value;
    setText(value);
    const caret = e.target.selectionStart ?? value.length;
    const m = /(^|\s)@([^\s@]{0,30})$/.exec(value.slice(0, caret));
    setSuggest(m ? { query: m[2], start: caret - m[2].length - 1 } : null);
    setHighlight(0);
  };

  const pick = (person) => {
    const el = areaRef.current;
    const caret = el?.selectionStart ?? text.length;
    const before = text.slice(0, suggest.start);
    const after = text.slice(caret);
    const label = person.displayName;
    setText(`${before}@${label} ${after}`);
    setMentions(prev => ({ ...prev, [label]: person.slackId }));
    setSuggest(null);
    const pos = before.length + label.length + 2;
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(pos, pos); });
  };

  const submit = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const res = await sendChatMessage(channelId, { text: encodeOutgoing(body, mentions), threadTs: threadTs ?? undefined });
      setText("");
      setMentions({});
      onSent?.(res?.ts ?? null);
    } catch (err) {
      handleError(err);
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e) => {
    if (suggest && matches.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setHighlight(h => (h + 1) % matches.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setHighlight(h => (h - 1 + matches.length) % matches.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(matches[highlight]); return; }
      if (e.key === "Escape") { setSuggest(null); return; }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!caps.files) { setNeedsReconnect(true); return; }
    setSending(true);
    try {
      const body = text.trim();
      await uploadChatFile(channelId, file, {
        threadTs: threadTs ?? undefined,
        comment: body ? encodeOutgoing(body, mentions) : undefined,
      });
      setText("");
      setMentions({});
      toast.success("Uploaded — it appears here once Slack shares it.");
      onSent?.(null);
    } catch (err) {
      handleError(err);
    } finally {
      setSending(false);
    }
  };

  if (!conversation) return null;
  if (!caps.post || needsReconnect) return <SlackReconnectNotice compact={!!threadTs} />;
  if (!conversation.canPost) {
    if (conversation.kind !== "CHANNEL") return null;
    return (
      <div className="cpm-chat-join">
        <label className="cpm-chat-plain">You're previewing this channel.</label>
        <button type="button" className="clubpm-btn-primary" onClick={join} disabled={sending}>
          <i className="fas fa-right-to-bracket" aria-hidden="true" /> Join channel
        </button>
      </div>
    );
  }

  return (
    <div className="cpm-chat-composer">
      {suggest && matches.length > 0 && (
        <div className="cpm-chat-suggest" role="listbox" aria-label="Mention someone">
          {matches.map((m, i) => (
            <button
              key={m.id}
              type="button"
              role="option"
              aria-selected={i === highlight}
              className={`cpm-chat-suggest-item${i === highlight ? " active" : ""}`}
              onMouseDown={(e) => { e.preventDefault(); pick(m); }}
            >
              <b>{m.displayName}</b>
              {m.slackHandle && <label className="cpm-chat-plain cpm-chat-suggest-handle">@{m.slackHandle}</label>}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        className="cpm-chat-composer-btn"
        title="Attach a file"
        aria-label="Attach a file"
        onClick={() => fileRef.current?.click()}
        disabled={sending}
      >
        <i className="fas fa-paperclip" aria-hidden="true" />
      </button>
      <input ref={fileRef} type="file" hidden onChange={onFile} />
      <textarea
        ref={areaRef}
        className="cpm-chat-composer-input"
        rows={Math.min(6, Math.max(1, text.split("\n").length))}
        value={text}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => setSuggest(null), 150)}
        disabled={sending}
      />
      <button
        type="button"
        className="cpm-chat-composer-send"
        onClick={submit}
        disabled={sending || !text.trim()}
        aria-label="Send"
      >
        <i className="fas fa-paper-plane" aria-hidden="true" />
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Mount the composer in `ChatConversation`**

In `ChatConversation.jsx`, add `import ChatComposer from "./ChatComposer";`. Directly after the closing `</div>` of `<div className="cpm-chat-scroll" …>` (still inside `.cpm-chat-main`), add:

```jsx
          {!results && (
            <ChatComposer
              channelId={channelId}
              conversation={conversation}
              placeholder={composerPlaceholder}
              onSent={() => refreshLatest(true)}
              onJoined={onJoined}
            />
          )}
```

- [ ] **Step 5: Gate + commit**

Run the encoder test, then `npm run build`. It regenerates the icon subset for `fa-paperclip`, `fa-paper-plane` and `fa-right-to-bracket`. Manually: send a message with an `@mention` from the Chat tab. It must appear in Slack **as you**, and the mentioned person must get a Slack ping.

```bash
git add src/components/clubpm/chat/encodeOutgoing.js src/components/clubpm/chat/encodeOutgoing.test.js src/components/clubpm/chat/ChatComposer.jsx src/components/clubpm/chat/ChatConversation.jsx public/fa-subset.css public/webfonts
git commit -m "feat(slack-portal): composer with mentions, uploads, join, and reconnect prompt"
```

---

## Task 15: Message actions, emoji, thread replies

**Files:**
- Create: `src/components/clubpm/chat/emojiShortcodes.js`
- Modify: `src/components/clubpm/chat/ChatRichText.jsx` (emoji branch)
- Modify: `src/components/clubpm/chat/ChatMessage.jsx` (full replacement)
- Modify: `src/components/clubpm/chat/ChatThreadDrawer.jsx` (full replacement)

- [ ] **Step 1: Create `emojiShortcodes.js`**

```js
/**
 * Common Slack shortcodes → Unicode, for rendering message CONTENT (reactions
 * and :shortcode: text). Not an icon set — UI icons stay Font Awesome.
 * Unknown names fall back to their :name: text; workspace custom emoji come
 * from the server as image URLs.
 */
const MAP = {
  '+1': '👍', thumbsup: '👍', '-1': '👎', thumbsdown: '👎',
  white_check_mark: '✅', heavy_check_mark: '✔️', x: '❌', eyes: '👀',
  tada: '🎉', partying_face: '🥳', heart: '❤️', white_heart: '🤍',
  joy: '😂', smile: '😄', grinning: '😀', laughing: '😆', slightly_smiling_face: '🙂',
  wink: '😉', upside_down_face: '🙃', sweat_smile: '😅', sob: '😭', heart_eyes: '😍',
  thinking_face: '🤔', facepalm: '🤦', shrug: '🤷', saluting_face: '🫡',
  pray: '🙏', clap: '👏', raised_hands: '🙌', wave: '👋', ok_hand: '👌', muscle: '💪',
  fire: '🔥', rocket: '🚀', star: '⭐', sparkles: '✨', '100': '💯', bulb: '💡', memo: '📝',
  warning: '⚠️', rotating_light: '🚨', question: '❓', exclamation: '❗', hourglass_flowing_sand: '⏳',
};

/** "+1::skin-tone-3" → 👍 (skin tones fall back to the base glyph). */
export function emojiChar(name) {
  if (!name) return null;
  return MAP[String(name).split('::')[0]] ?? null;
}

export const QUICK_REACTIONS = ['+1', 'white_check_mark', 'eyes', 'tada', 'heart', 'joy'];
```

- [ ] **Step 2: Render standard emoji as characters**

In `ChatRichText.jsx`, add `import { emojiChar } from "./emojiShortcodes";` and replace the `case "emoji":` branch with:

```jsx
      case "emoji": {
        if (t.url) {
          return <img key={i} className="cpm-chat-emoji" src={t.url} alt={`:${t.name}:`} title={`:${t.name}:`} />;
        }
        const ch = emojiChar(t.name);
        return ch
          ? <label key={i} className="cpm-chat-plain cpm-chat-emoji-char" title={`:${t.name}:`}>{ch}</label>
          : <code key={i} className="cpm-chat-emoji-name">:{t.name}:</code>;
      }
```

Run: `npx react-scripts test --watchAll=false src/components/clubpm/chat/ChatRichText.test.jsx` → still passes.

- [ ] **Step 3: Replace `ChatMessage.jsx`**

```jsx
import { useState } from "react";
import toast from "react-hot-toast";
import { reactToChatMessage, editChatMessage, deleteChatMessage } from "../../../api/clubPmClient";
import { useClubPmAuth } from "../../../clubpm/ClubPmAuth";
import ChatRichText from "./ChatRichText";
import ChatFileAttachment from "./ChatFileAttachment";
import { emojiChar, QUICK_REACTIONS } from "./emojiShortcodes";
import { encodeOutgoing, decodeForEdit } from "./encodeOutgoing";

function timeLabel(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function ReactionFace({ name, url }) {
  if (url) return <img className="cpm-chat-emoji" src={url} alt={`:${name}:`} />;
  return <label className="cpm-chat-plain">{emojiChar(name) ?? `:${name}:`}</label>;
}

// 409 means exactly "reconnect Slack" (plan Task 11).
const errorText = (err) =>
  err?.status === 409 ? "Reconnect Slack to do that from Constellation." : (err?.message || "Slack rejected that.");

export default function ChatMessage({
  message,
  channelId = null,
  canPost = false,
  compact = false,
  onOpenThread,
  onChanged,
}) {
  const { member } = useClubPmAuth();
  const [editing, setEditing] = useState(null); // { text, mentions }
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState(false);

  // Deleted messages keep their row on purpose: the archive records that
  // something was said and removed, rather than quietly losing the turn.
  if (message.deletedAt) {
    return (
      <div className="cpm-chat-msg cpm-chat-msg--deleted">
        <div className="cpm-chat-msg-body">
          <i className="fas fa-trash-can" aria-hidden="true" />
          <label className="cpm-chat-plain"> This message was deleted</label>
        </div>
      </div>
    );
  }

  const canAct = canPost && !!channelId;
  const mine = !!member?.slackId && message.authorSlackId === member.slackId && !message.isBot;

  const toggleReaction = async (name, currentlyMine) => {
    if (!canAct || busy) return;
    setBusy(true);
    setPicker(false);
    try {
      await reactToChatMessage(channelId, message.ts, name, !currentlyMine);
      onChanged?.();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    const text = editing.text.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      await editChatMessage(channelId, message.ts, encodeOutgoing(text, editing.mentions));
      setEditing(null);
      onChanged?.();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm("Delete this message? It is deleted in Slack too.")) return;
    setBusy(true);
    try {
      await deleteChatMessage(channelId, message.ts);
      onChanged?.();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`cpm-chat-msg${compact ? " cpm-chat-msg--compact" : ""}${message.isBot ? " cpm-chat-msg--bot" : ""}`}>
      <div className="cpm-chat-avatar" aria-hidden="true">
        {message.authorAvatarUrl
          ? <img src={message.authorAvatarUrl} alt="" />
          : <i className={message.isBot ? "fas fa-robot" : "fas fa-user"} />}
      </div>

      <div className="cpm-chat-msg-body">
        <div className="cpm-chat-msg-head">
          <b className="cpm-chat-author">{message.authorName}</b>
          {message.isBot && <label className="cpm-chat-app-badge">APP</label>}
          <label className="cpm-chat-time">{timeLabel(message.postedAt)}</label>
          {message.editedAt && <label className="cpm-chat-edited">(edited)</label>}
        </div>

        {editing ? (
          <div className="cpm-chat-edit">
            <textarea
              className="cpm-chat-composer-input"
              value={editing.text}
              autoFocus
              aria-label="Edit message"
              onChange={e => setEditing({ ...editing, text: e.target.value })}
              onKeyDown={e => {
                if (e.key === "Escape") setEditing(null);
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(); }
              }}
            />
            <div className="cpm-chat-edit-actions">
              <button type="button" className="cpm-chat-linkbtn" onClick={() => setEditing(null)}>Cancel</button>
              <button type="button" className="clubpm-btn-primary" onClick={saveEdit} disabled={busy}>Save</button>
            </div>
          </div>
        ) : (
          <ChatRichText tokens={message.tokens} />
        )}

        {message.files?.length > 0 && (
          <div className="cpm-chat-files">
            {message.files.map(f => <ChatFileAttachment key={f.id} file={f} />)}
          </div>
        )}

        {message.reactions?.length > 0 && (
          <div className="cpm-chat-reactions">
            {message.reactions.map(r => (
              <button
                key={r.emoji}
                type="button"
                className={`cpm-chat-reaction${r.mine ? " cpm-chat-reaction--mine" : ""}`}
                title={r.emoji}
                disabled={!canAct || busy}
                onClick={() => toggleReaction(r.name, r.mine)}
              >
                <ReactionFace name={r.name} url={r.url} />
                <label className="cpm-chat-reaction-count">{r.count}</label>
              </button>
            ))}
          </div>
        )}

        {message.replyCount > 0 && onOpenThread && (
          <button type="button" className="cpm-chat-thread-btn" onClick={() => onOpenThread(message.ts)}>
            <i className="fas fa-comments" aria-hidden="true" />
            {message.replyCount} {message.replyCount === 1 ? "reply" : "replies"}
          </button>
        )}
      </div>

      {canAct && !editing && (
        <div className="cpm-chat-msg-actions" role="toolbar" aria-label="Message actions">
          <button type="button" title="Add reaction" aria-label="Add reaction" onClick={() => setPicker(p => !p)}>
            <i className="fas fa-face-smile" aria-hidden="true" />
          </button>
          {onOpenThread && !message.threadTs && (
            <button type="button" title="Reply in thread" aria-label="Reply in thread" onClick={() => onOpenThread(message.ts)}>
              <i className="fas fa-reply" aria-hidden="true" />
            </button>
          )}
          {mine && (
            <button type="button" title="Edit" aria-label="Edit" onClick={() => setEditing(decodeForEdit(message.tokens))}>
              <i className="fas fa-pen" aria-hidden="true" />
            </button>
          )}
          {mine && (
            <button type="button" title="Delete" aria-label="Delete" onClick={remove}>
              <i className="fas fa-trash-can" aria-hidden="true" />
            </button>
          )}
          {picker && (
            <div className="cpm-chat-react-picker">
              {QUICK_REACTIONS.map(n => (
                <button
                  key={n}
                  type="button"
                  title={`:${n}:`}
                  onClick={() => toggleReaction(n, message.reactions?.some(r => r.name === n && r.mine))}
                >
                  <ReactionFace name={n} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Replace `ChatThreadDrawer.jsx`**

```jsx
import { useCallback, useEffect, useRef, useState } from "react";
import { getConversationThread, markConversationRead } from "../../../api/clubPmClient";
import ChatMessage from "./ChatMessage";
import ChatComposer from "./ChatComposer";

export default function ChatThreadDrawer({ channelId, ts, conversation = null, onClose }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Opening a second thread before the first responds must not let the slower
  // response overwrite the newer one.
  const reqRef = useRef(0);

  const load = useCallback(async (quiet = false) => {
    const id = ++reqRef.current;
    if (!quiet) { setLoading(true); setError(null); }
    try {
      const data = await getConversationThread(channelId, ts);
      if (id === reqRef.current) setMessages(data.messages ?? []);
    } catch {
      if (id === reqRef.current && !quiet) setError("Could not load this thread.");
    } finally {
      if (id === reqRef.current && !quiet) setLoading(false);
    }
  }, [channelId, ts]);

  useEffect(() => { load(false); }, [load]);

  useEffect(() => {
    const onLive = (e) => {
      const d = e.detail;
      if (d?.channelId === channelId && (d.threadTs === ts || d.ts === ts)) load(true);
    };
    window.addEventListener("clubpm:slack-message", onLive);
    return () => window.removeEventListener("clubpm:slack-message", onLive);
  }, [channelId, ts, load]);

  // Viewing a thread clears its reply pings (D11) — the notification's ts is
  // the reply's, which a top-level read mark would not reach.
  const newest = messages.length ? messages[messages.length - 1].ts : null;
  const isParticipant = !!conversation?.isParticipant;
  useEffect(() => {
    if (!isParticipant || !newest) return;
    markConversationRead(channelId, newest)
      .then(() => window.dispatchEvent(new CustomEvent("clubpm:conversation-read", { detail: { channelId } })))
      .catch(() => {});
  }, [channelId, newest, isParticipant]);

  const canPost = !!conversation?.canPost;

  // In-flow flex column beside the message list, not position: fixed — so the
  // transformed ClubPM panel ancestors can't capture it.
  return (
    <aside className="cpm-chat-drawer" role="complementary" aria-label="Thread">
      <div className="cpm-chat-drawer-head">
        <b>Thread</b>
        <button type="button" className="cpm-chat-drawer-close" onClick={onClose} aria-label="Close thread">
          <i className="fas fa-xmark" aria-hidden="true" />
        </button>
      </div>

      <div className="cpm-chat-drawer-body">
        {loading && <div className="cpm-spinner" aria-label="Loading" />}
        {error && <div className="cpm-chat-empty">{error}</div>}
        {!loading && !error && messages.map(m => (
          <ChatMessage key={m.id} message={m} channelId={channelId} canPost={canPost} compact onChanged={() => load(true)} />
        ))}
      </div>

      {canPost && (
        <ChatComposer
          channelId={channelId}
          conversation={conversation}
          threadTs={ts}
          placeholder="Reply…"
          onSent={() => load(true)}
        />
      )}
    </aside>
  );
}
```

- [ ] **Step 5: Gate + commit**

Run both chat Jest tests, then `npm run build`, which regenerates the icon subset. Manual check: react, un-react, reply in a thread, edit and delete your own message. Each must mirror into Slack within a second.

```bash
git add src/components/clubpm/chat/emojiShortcodes.js src/components/clubpm/chat/ChatRichText.jsx src/components/clubpm/chat/ChatMessage.jsx src/components/clubpm/chat/ChatThreadDrawer.jsx public/fa-subset.css public/webfonts
git commit -m "feat(slack-portal): reactions, thread replies, edit and delete from Constellation"
```

---

## Task 16: Block Kit renderer (backend)

**Files:**
- Create: `backend/src/services/slackBlocks.ts`
- Create: `backend/src/services/slackBlocks.test.ts`
- Modify: `backend/src/services/chatDto.ts` (`toDto` gains `blocks`)

**Interfaces produced:** `RenderedBlock`, `renderBotPayload(payload, ctx) → RenderedBlock[]`. `toDto(...).blocks` (empty for humans).

- [ ] **Step 1: Failing test**

`backend/src/services/slackBlocks.test.ts`:

```ts
// Run: cd backend && npx tsx src/services/slackBlocks.test.ts
import { renderBotPayload } from "./slackBlocks.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}
const ctx = { memberNames: { U1: "Ann" }, channelNames: {}, emojiUrls: {} };
const r = (blocks: unknown[], attachments: unknown[] = []) => renderBotPayload({ blocks, attachments }, ctx) as any[];

check("null payload → []", renderBotPayload(null, ctx).length === 0);
check("header", r([{ type: "header", text: { type: "plain_text", text: "Standup" } }])[0].text === "Standup");
{
  const [s] = r([{ type: "section", text: { type: "mrkdwn", text: "*hi* <@U1>" } }]);
  check("section mrkdwn parses bold", s.tokens[0].type === "bold");
  check("section mrkdwn resolves mention", s.tokens.some((t: any) => t.type === "mention" && t.label === "Ann"));
}
{
  const [s] = r([{ type: "section", fields: [{ type: "mrkdwn", text: "*Due*" }, { type: "plain_text", text: "Fri" }] }]);
  check("section fields", s.fields.length === 2 && s.fields[1][0].value === "Fri");
}
check("divider", r([{ type: "divider" }])[0].type === "divider");
{
  const [c] = r([{ type: "context", elements: [{ type: "image", image_url: "x" }, { type: "mrkdwn", text: "via bot" }] }]);
  check("context skips images, keeps text", c.type === "context" && c.tokens.length > 0);
}
{
  const [a] = r([{ type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "Approve" } }, { type: "static_select", placeholder: { type: "plain_text", text: "Pick" } }] }]);
  check("actions become inert labels", a.type === "actions" && a.labels.join("|") === "Approve|Pick");
}
{
  const out = r([{ type: "section", text: { type: "mrkdwn", text: "x" }, accessory: { type: "button", text: { type: "plain_text", text: "Open" } } }]);
  check("section accessory button becomes a label row", out[1]?.type === "actions" && out[1].labels[0] === "Open");
}
check("image keeps only alt text", r([{ type: "image", image_url: "https://t", alt_text: "chart" }])[0].alt === "chart");
{
  const [s] = r([{ type: "rich_text", elements: [{ type: "rich_text_section", elements: [
    { type: "text", text: "bold", style: { bold: true } },
    { type: "link", url: "https://ok.example", text: "ok" },
    { type: "link", url: "javascript:alert(1)", text: "evil" },
    { type: "user", user_id: "U1" },
  ] }] }]);
  check("rich_text bold", s.tokens[0].type === "bold");
  check("rich_text safe link kept", s.tokens.some((t: any) => t.type === "link" && t.href === "https://ok.example"));
  check("rich_text javascript: link neutralized", !s.tokens.some((t: any) => t.type === "link" && String(t.href).startsWith("javascript")));
  check("rich_text user mention", s.tokens.some((t: any) => t.type === "mention" && t.label === "Ann"));
}
check("unknown block skipped", r([{ type: "video" }]).length === 0);
{
  const out = r([], [{ pretext: "Heads up", title: "Build failed", text: "main is red", fields: [{ title: "Repo", value: "site" }] }]);
  check("legacy attachment → section + header + section", out.length === 3 && out[1].type === "header");
  check("legacy attachment fields", out[2].fields.length === 1);
}

console.log(`\nslackBlocks: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

Run it → FAIL.

- [ ] **Step 2: Implement `slackBlocks.ts`**

```ts
import { formatSlackText, type FormatContext, type SlackToken } from "./slackMessageFormat.js";

/**
 * Pure. A bot message's raw { blocks, attachments } → a small render tree the
 * UI can draw with ChatRichText. Rendered on READ, like message text, so a
 * better renderer never needs a backfill.
 *
 * Interactive elements (buttons, selects) become inert labels: only the app
 * that owns them receives the click, and that is not us (plan: known limits).
 * Image URLs are dropped (alt text only) so a bot cannot make every viewer
 * fetch a tracking pixel. Links are limited to http(s)/mailto.
 */
export type RenderedBlock =
  | { type: "header"; text: string }
  | { type: "section"; tokens: SlackToken[]; fields: SlackToken[][] }
  | { type: "context"; tokens: SlackToken[] }
  | { type: "divider" }
  | { type: "actions"; labels: string[] }
  | { type: "image"; alt: string };

type Obj = Record<string, any>;
const MAX_BLOCKS = 50;

const safeHref = (href: unknown): string | null =>
  typeof href === "string" && /^(https?:|mailto:)/i.test(href) ? href : null;

function textTokens(t: unknown, ctx: FormatContext): SlackToken[] {
  const o = t as Obj | undefined;
  if (!o || typeof o.text !== "string" || !o.text) return [];
  return o.type === "mrkdwn" ? formatSlackText(o.text, ctx) : [{ type: "text", value: o.text }];
}

function plain(t: unknown): string {
  const o = t as Obj | undefined;
  return typeof o?.text === "string" ? o.text : "";
}

function richElement(el: Obj, ctx: FormatContext): SlackToken[] {
  switch (el?.type) {
    case "text": {
      const value = String(el.text ?? "");
      let tok: SlackToken = el.style?.code ? { type: "code", value } : { type: "text", value };
      if (el.style?.bold) tok = { type: "bold", children: [tok] };
      if (el.style?.italic) tok = { type: "italic", children: [tok] };
      if (el.style?.strike) tok = { type: "strike", children: [tok] };
      return [tok];
    }
    case "link": {
      const href = safeHref(el.url);
      const label = String(el.text ?? el.url ?? "");
      return href ? [{ type: "link", href, label }] : [{ type: "text", value: label }];
    }
    case "user": {
      const id = String(el.user_id ?? "");
      return [{ type: "mention", slackId: id, label: ctx.memberNames[id] ?? id }];
    }
    case "channel": {
      const id = String(el.channel_id ?? "");
      return [{ type: "channel", slackId: id, label: ctx.channelNames?.[id] ?? id }];
    }
    case "emoji": {
      const name = String(el.name ?? "");
      return [{ type: "emoji", name, url: ctx.emojiUrls?.[name] }];
    }
    case "broadcast": return [{ type: "text", value: `@${el.range ?? "channel"}` }];
    default: return [];
  }
}

function richContainer(el: Obj, ctx: FormatContext): SlackToken[] {
  const kids: Obj[] = Array.isArray(el?.elements) ? el.elements : [];
  switch (el?.type) {
    case "rich_text_section":
      return kids.flatMap((k) => richElement(k, ctx));
    case "rich_text_preformatted":
      return [{ type: "codeblock", value: kids.map((k) => String(k.text ?? "")).join("") }];
    case "rich_text_quote":
      return [{ type: "italic", children: kids.flatMap((k) => richElement(k, ctx)) }];
    case "rich_text_list":
      return kids.flatMap((item, i): SlackToken[] => [
        { type: "text", value: `${i ? "\n" : ""}• ` },
        ...richContainer(item, ctx),
      ]);
    default:
      return [];
  }
}

function actionLabel(el: Obj): string {
  return plain(el?.text) || plain(el?.placeholder) || "";
}

function renderBlock(b: Obj, ctx: FormatContext): RenderedBlock[] {
  switch (b?.type) {
    case "header": {
      const text = plain(b.text);
      return text ? [{ type: "header", text }] : [];
    }
    case "section": {
      const out: RenderedBlock[] = [{
        type: "section",
        tokens: textTokens(b.text, ctx),
        fields: Array.isArray(b.fields) ? b.fields.map((f: unknown) => textTokens(f, ctx)) : [],
      }];
      const label = b.accessory ? actionLabel(b.accessory) : "";
      if (label) out.push({ type: "actions", labels: [label] });
      return out;
    }
    case "context": {
      const tokens = (Array.isArray(b.elements) ? b.elements : [])
        .filter((e: Obj) => e?.type === "mrkdwn" || e?.type === "plain_text")
        .flatMap((e: Obj, i: number): SlackToken[] => [
          ...(i ? [{ type: "text", value: " · " } as SlackToken] : []),
          ...textTokens(e, ctx),
        ]);
      return tokens.length ? [{ type: "context", tokens }] : [];
    }
    case "divider":
      return [{ type: "divider" }];
    case "actions": {
      const labels = (Array.isArray(b.elements) ? b.elements : []).map(actionLabel).filter(Boolean);
      return labels.length ? [{ type: "actions", labels }] : [];
    }
    case "image":
      return [{ type: "image", alt: String(b.alt_text ?? plain(b.title) ?? "") }];
    case "rich_text": {
      const tokens = (Array.isArray(b.elements) ? b.elements : []).flatMap((e: Obj) => richContainer(e, ctx));
      return tokens.length ? [{ type: "section", tokens, fields: [] }] : [];
    }
    default:
      return [];
  }
}

function renderAttachment(a: Obj, ctx: FormatContext): RenderedBlock[] {
  const out: RenderedBlock[] = [];
  if (a?.pretext) out.push({ type: "section", tokens: formatSlackText(String(a.pretext), ctx), fields: [] });
  if (a?.title) out.push({ type: "header", text: String(a.title) });
  const fields: SlackToken[][] = (Array.isArray(a?.fields) ? a.fields : []).map((f: Obj): SlackToken[] => [
    { type: "bold", children: [{ type: "text", value: `${f.title ?? ""} ` }] },
    ...formatSlackText(String(f.value ?? ""), ctx),
  ]);
  if (a?.text || fields.length) {
    out.push({ type: "section", tokens: a?.text ? formatSlackText(String(a.text), ctx) : [], fields });
  }
  if (Array.isArray(a?.blocks)) out.push(...a.blocks.flatMap((b: Obj) => renderBlock(b, ctx)));
  const labels = (Array.isArray(a?.actions) ? a.actions : []).map((x: Obj) => String(x.text ?? x.name ?? "")).filter(Boolean);
  if (labels.length) out.push({ type: "actions", labels });
  if (a?.footer) out.push({ type: "context", tokens: [{ type: "text", value: String(a.footer) }] });
  return out;
}

export function renderBotPayload(payload: unknown, ctx: FormatContext): RenderedBlock[] {
  const p = payload as Obj | null;
  if (!p || typeof p !== "object") return [];
  const blocks: Obj[] = Array.isArray(p.blocks) ? p.blocks : [];
  const attachments: Obj[] = Array.isArray(p.attachments) ? p.attachments : [];
  return [
    ...blocks.flatMap((b) => renderBlock(b, ctx)),
    ...attachments.flatMap((a) => renderAttachment(a, ctx)),
  ].slice(0, MAX_BLOCKS);
}
```

The legacy attachment test expects `pretext` + `title` + a `section` holding both `text` and `fields`, which is three blocks. Run the test → `17 passed, 0 failed`.

- [ ] **Step 3: Add `blocks` to the DTO**

In `backend/src/services/chatDto.ts`, add `import { renderBotPayload } from "./slackBlocks.js";`. In `toDto`'s returned object, directly after `isBot: row.isBot,` add:

```ts
    // Bot messages render from their Block Kit; `tokens` (from the fallback
    // text) stays as the plain-text version for search results and previews.
    blocks: row.isBot && !row.deletedAt ? renderBotPayload(row.botPayload, ctx) : [],
```

- [ ] **Step 4: Gate + commit**

```bash
git add backend/src/services/slackBlocks.ts backend/src/services/slackBlocks.test.ts backend/src/services/chatDto.ts
git commit -m "feat(slack-portal): render bot Block Kit and legacy attachments on read"
```

---

## Task 17: Block Kit renderer (frontend)

**Files:**
- Create: `src/components/clubpm/chat/ChatBlocks.jsx`
- Modify: `src/components/clubpm/chat/ChatMessage.jsx`

- [ ] **Step 1: Create `ChatBlocks.jsx`**

```jsx
import ChatRichText from "./ChatRichText";

/**
 * Draws the render tree from backend/src/services/slackBlocks.ts.
 * NO SPAN AND NO PARAGRAPH ELEMENTS (see ChatRichText.jsx for why).
 * Buttons from other apps are inert labels: only the app that owns a button
 * receives its click, and that happens inside Slack.
 */
export default function ChatBlocks({ blocks }) {
  if (!blocks?.length) return null;
  return (
    <div className="cpm-chat-blocks">
      {blocks.map((b, i) => {
        switch (b.type) {
          case "header":
            return <b key={i} className="cpm-chat-block-header">{b.text}</b>;
          case "section":
            return (
              <div key={i} className="cpm-chat-block-section">
                <ChatRichText tokens={b.tokens} />
                {b.fields?.length > 0 && (
                  <div className="cpm-chat-block-fields">
                    {b.fields.map((f, j) => <ChatRichText key={j} tokens={f} />)}
                  </div>
                )}
              </div>
            );
          case "context":
            return <div key={i} className="cpm-chat-block-context"><ChatRichText tokens={b.tokens} /></div>;
          case "divider":
            return <hr key={i} className="cpm-chat-block-divider" />;
          case "actions":
            return (
              <div key={i} className="cpm-chat-block-actions" title="App buttons only work inside Slack">
                {b.labels.map((l, j) => <label key={j} className="cpm-chat-block-chip">{l}</label>)}
              </div>
            );
          case "image":
            return (
              <div key={i} className="cpm-chat-block-image">
                <i className="fas fa-image" aria-hidden="true" />
                <label className="cpm-chat-plain"> {b.alt || "Image"}</label>
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
```

- [ ] **Step 2: Use it for bot messages**

In `ChatMessage.jsx`, add `import ChatBlocks from "./ChatBlocks";` and replace `<ChatRichText tokens={message.tokens} />` (the non-editing branch) with:

```jsx
          message.isBot && message.blocks?.length > 0
            ? <ChatBlocks blocks={message.blocks} />
            : <ChatRichText tokens={message.tokens} />
```

- [ ] **Step 3: Gate + commit**

`npm run build` (regenerates the icon subset for `fa-image` and `fa-robot`). Manual: a Monday digest or task card in a channel renders as structured blocks with an APP badge.

```bash
git add src/components/clubpm/chat/ChatBlocks.jsx src/components/clubpm/chat/ChatMessage.jsx public/fa-subset.css public/webfonts
git commit -m "feat(slack-portal): draw bot messages from their Block Kit"
```

---

## Task 18: `/clubpm/chat` page, nav, anchors

**Files:**
- Create: `src/pages/ClubPM/ChatPage.jsx`
- Modify: `src/App.js`
- Modify: `src/components/clubpm/AppShell.jsx`
- Modify: `src/clubpm/tour/tourAnchors.js`
- Modify: `docs/courses/ANCHORS.md`

**This is a deliberate 5-file task:** `check-tour-anchors.js` fails the build unless the nav item, the registry and `ANCHORS.md` land in one commit.

- [ ] **Step 1: Create `ChatPage.jsx`**

```jsx
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { listConversations, getConversation } from "../../api/clubPmClient";
import ChatConversation from "../../components/clubpm/chat/ChatConversation";

function ChannelLink({ c, active }) {
  const unread = c.unread > 0 && !c.muted;
  return (
    <Link
      to={`/clubpm/chat/${c.slackChannelId}`}
      className={`cpm-chatpage-item${active ? " active" : ""}${unread ? " unread" : ""}`}
    >
      <i className={c.kind === "PRIVATE_CHANNEL" ? "fas fa-lock" : "fas fa-hashtag"} aria-hidden="true" />
      <label className="cpm-chat-plain cpm-chatpage-name">{c.name}</label>
      {c.muted && <i className="fas fa-bell-slash cpm-chatpage-muted" aria-label="Muted" />}
      {unread && <b className="cpm-chatpage-badge">{c.unread}</b>}
    </Link>
  );
}

/**
 * Every Slack channel the member may read: the ones they're in, plus a
 * "browse" list of public channels they can preview and join. DMs live on the
 * Members page (D12).
 */
export default function ChatPage() {
  const { channelId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("");
  const [showBrowse, setShowBrowse] = useState(false);
  const [conversation, setConversation] = useState(null);
  const [convError, setConvError] = useState(null);

  const refresh = useCallback(() => {
    listConversations().then(setData).catch(() => setError("Could not load channels."));
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  // Badges stay live without polling. Debounced: a busy workspace fires many events.
  useEffect(() => {
    let t;
    const bump = () => { clearTimeout(t); t = setTimeout(refresh, 1500); };
    const events = ["clubpm:slack-message", "clubpm:slack-membership", "clubpm:conversation-read"];
    events.forEach(e => window.addEventListener(e, bump));
    return () => { clearTimeout(t); events.forEach(e => window.removeEventListener(e, bump)); };
  }, [refresh]);

  const channels = data?.channels ?? [];
  const mine = channels.filter(c => c.isMember);
  const browse = channels.filter(c => !c.isMember);
  const q = filter.trim().toLowerCase();
  const matches = (c) => !q || c.name.toLowerCase().includes(q);

  // No channel in the URL: open the most recently active one you're in.
  const firstMine = mine[0]?.slackChannelId;
  useEffect(() => {
    if (!channelId && firstMine) navigate(`/clubpm/chat/${firstMine}`, { replace: true });
  }, [channelId, firstMine, navigate]);

  const loadConversation = useCallback(() => {
    if (!channelId) return;
    setConvError(null);
    getConversation(channelId)
      .then(setConversation)
      .catch(() => { setConversation(null); setConvError("That channel isn't available to you."); });
  }, [channelId]);

  useEffect(() => { setConversation(null); loadConversation(); }, [loadConversation]);
  useEffect(() => {
    const onMembership = (e) => { if (e.detail?.channelId === channelId) loadConversation(); };
    window.addEventListener("clubpm:slack-membership", onMembership);
    return () => window.removeEventListener("clubpm:slack-membership", onMembership);
  }, [channelId, loadConversation]);

  return (
    <div className="cpm-chatpage">
      <aside className="cpm-chatpage-side" aria-label="Channels">
        <input
          className="cpm-chatpage-filter"
          type="search"
          placeholder="Find a channel…"
          aria-label="Find a channel"
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
        {error && <div className="cpm-chat-banner cpm-chat-banner--error">{error}</div>}
        {!data && !error && <div className="cpm-spinner" aria-label="Loading" />}

        <div className="cpm-chatpage-group">Channels</div>
        {mine.filter(matches).map(c => (
          <ChannelLink key={c.slackChannelId} c={c} active={c.slackChannelId === channelId} />
        ))}
        {data && mine.length === 0 && <div className="cpm-chatpage-hint">You haven't joined any channels yet.</div>}

        <button type="button" className="cpm-chatpage-browse-toggle" onClick={() => setShowBrowse(v => !v)} aria-expanded={showBrowse}>
          <i className={showBrowse ? "fas fa-chevron-down" : "fas fa-chevron-right"} aria-hidden="true" />
          Browse public channels ({browse.length})
        </button>
        {showBrowse && browse.filter(matches).map(c => (
          <ChannelLink key={c.slackChannelId} c={c} active={c.slackChannelId === channelId} />
        ))}

        <Link to="/clubpm/members" className="cpm-chatpage-dmlink">
          <i className="fas fa-user-group" aria-hidden="true" /> Direct messages are on the Members page
        </Link>
      </aside>

      <section className="cpm-chatpage-main">
        {convError && <div className="cpm-chat-empty">{convError}</div>}
        {conversation && (
          <>
            <header className="cpm-chatpage-head">
              <i className={conversation.kind === "PRIVATE_CHANNEL" ? "fas fa-lock" : "fas fa-hashtag"} aria-hidden="true" />
              <b>{conversation.name ?? channelId}</b>
              {!conversation.isParticipant && <label className="cpm-chat-plain cpm-chatpage-preview">Previewing — join to post</label>}
            </header>
            <ChatConversation
              key={channelId}
              channelId={channelId}
              conversation={conversation}
              initialThreadTs={searchParams.get("thread")}
              composerPlaceholder={`Message #${conversation.name ?? "channel"}`}
              onJoined={() => { loadConversation(); refresh(); }}
            />
          </>
        )}
        {!channelId && data && mine.length === 0 && (
          <div className="cpm-chat-empty">Pick a public channel on the left to preview it.</div>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Routes**

In `src/App.js`, next to `const ClubPmMembersView = lazy(...)`, add:

```js
const ClubPmChatPage          = lazy(lazyWithClubPmTheme(() => import('./pages/ClubPM/ChatPage')));
```

and next to the `/clubpm/members` route:

```jsx
            <Route path="/clubpm/chat" element={<ClubPmProtectedPage><ClubPmChatPage /></ClubPmProtectedPage>} />
            <Route path="/clubpm/chat/:channelId" element={<ClubPmProtectedPage><ClubPmChatPage /></ClubPmProtectedPage>} />
```

- [ ] **Step 3: Sidebar item, active state, breadcrumb**

In `src/components/clubpm/AppShell.jsx`:

1. In `NAV_ITEMS`, directly after the Dashboard entry's closing `},`, insert:

```js
  {
    label: 'Chat',
    href: '/clubpm/chat',
    tourId: 'nav.chat',
    icon: <i className="fas fa-comments" aria-hidden="true" style={{ fontSize: 15, width: 18, textAlign: 'center' }} />,
  },
```

2. Grep `const isActive = location.pathname === item.href ||` and add a clause to the expression:

```js
              (item.href === '/clubpm/chat' && location.pathname.startsWith('/clubpm/chat')) ||
```

3. In `getBreadcrumb`, above the final `return [{ label: 'Constellation' }];`:

```js
  if (pathname.startsWith('/clubpm/chat')) return [{ label: 'Chat' }];
```

- [ ] **Step 4: Tour anchor, registry and doc together**

In `src/clubpm/tour/tourAnchors.js`, below the `"nav.dashboard"` line:

```js
  "nav.chat":               { label: "Chat link",            route: "*", note: "Every Slack channel; DMs live on Members" },
```

In `docs/courses/ANCHORS.md`, below the `| \`nav.dashboard\` | Dashboard link | \`*\` |` row:

```markdown
| `nav.chat` | Chat link | `*` |
```

Then: `rg -n "sidebar" docs/courses --glob "*.md"`. Any sentence that lists the sidebar's items in prose must mention Chat. Rewrite those sentences in this commit.

- [ ] **Step 5: Gate + commit**

`node scripts/check-tour-anchors.js` → passes. Then `npm run build`, which regenerates the icon subset for `fa-hashtag`, `fa-lock`, `fa-bell-slash` and `fa-user-group`.

```bash
git add src/pages/ClubPM/ChatPage.jsx src/App.js src/components/clubpm/AppShell.jsx src/clubpm/tour/tourAnchors.js docs/courses public/fa-subset.css public/webfonts
git commit -m "feat(slack-portal): /clubpm/chat — every channel you can read, browse and join"
```

---

# Part E — DMs on the Members page

## Task 19: `DmInbox` and `DmPanel`

**Files:**
- Create: `src/components/clubpm/members/DmInbox.jsx`
- Create: `src/components/clubpm/members/DmPanel.jsx`
- Modify: `src/components/clubpm/SlackArchivePanel.jsx` (public-backfill button; fix the disk banner's wording)

**Interfaces produced:** `<DmInbox activeChannelId onOpen(channelId) slackIdFilter? />` and `<DmPanel channelId onClose />`. The inbox triggers the member's one-per-session DM history import (operator step 3).

- [ ] **Step 1: Create `DmInbox.jsx`**

```jsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { listConversations, importMyDms } from "../../../api/clubPmClient";
import { useClubPmAuth } from "../../../clubpm/ClubPmAuth";
import { SlackReconnectNotice } from "../chat/ChatComposer";

const IMPORT_KEY = "cpm.dms.imported";
const DM_KINDS = new Set(["IM", "MPIM"]);

/**
 * The member's DMs and group DMs, newest first, with unread badges (D12).
 * `slackIdFilter` (a Set of Slack user ids) narrows it to conversations that
 * include at least one of those people — the project Members tab passes its
 * roster.
 */
export default function DmInbox({ activeChannelId, onOpen, slackIdFilter = null }) {
  const { member } = useClubPmAuth();
  const canRead = !!member?.slackCapabilities?.read;
  const [dms, setDms] = useState(null);
  const [error, setError] = useState(null);

  const refresh = useCallback(() => {
    listConversations()
      .then(d => { setDms(d.dms ?? []); setError(null); })
      .catch(() => setError("Could not load your messages."));
  }, []);

  useEffect(() => { if (canRead) refresh(); }, [canRead, refresh]);

  // Import DM history once per browser session. The server skips conversations
  // already imported, so this is cheap after the first time.
  useEffect(() => {
    if (!canRead) return;
    try {
      if (sessionStorage.getItem(IMPORT_KEY) === "1") return;
      sessionStorage.setItem(IMPORT_KEY, "1");
    } catch {
      // sessionStorage unavailable — importing again is harmless
    }
    importMyDms()
      .then(r => { if (r?.conversations) setTimeout(refresh, 4000); })
      .catch(() => {});
  }, [canRead, refresh]);

  // Live: new DM messages, new conversations, and reads elsewhere.
  useEffect(() => {
    let t;
    const bump = (e) => {
      if (e.type === "clubpm:slack-message" && !DM_KINDS.has(e.detail?.convKind)) return;
      clearTimeout(t);
      t = setTimeout(refresh, 600);
    };
    const events = ["clubpm:slack-message", "clubpm:slack-membership", "clubpm:conversation-read"];
    events.forEach(ev => window.addEventListener(ev, bump));
    return () => { clearTimeout(t); events.forEach(ev => window.removeEventListener(ev, bump)); };
  }, [refresh]);

  const shown = useMemo(
    () => (dms ?? []).filter(d => !slackIdFilter || d.participants.some(p => slackIdFilter.has(p.slackId))),
    [dms, slackIdFilter]
  );

  if (!canRead) {
    return (
      <aside className="cpm-dm-inbox" aria-label="Direct messages">
        <div className="cpm-dm-inbox-head"><b>Messages</b></div>
        <SlackReconnectNotice compact />
      </aside>
    );
  }

  return (
    <aside className="cpm-dm-inbox" aria-label="Direct messages">
      <div className="cpm-dm-inbox-head"><b>Messages</b></div>
      {error && <div className="cpm-chat-banner cpm-chat-banner--error">{error}</div>}
      {dms === null && !error && <div className="cpm-spinner" aria-label="Loading" />}
      {dms && shown.length === 0 && (
        <div className="cpm-dm-empty">No conversations yet — use <b>Message</b> on anyone's card.</div>
      )}
      {shown.map(d => {
        const names = d.participants.map(p => p.displayName).join(", ") || "Just you";
        const first = d.participants[0];
        const unread = d.unread > 0 && !d.muted;
        return (
          <button
            key={d.slackChannelId}
            type="button"
            className={`cpm-dm-row${d.slackChannelId === activeChannelId ? " active" : ""}${unread ? " unread" : ""}`}
            onClick={() => onOpen(d.slackChannelId)}
          >
            <div className="cpm-dm-avatar" aria-hidden="true">
              {first?.avatarUrl
                ? <img src={first.avatarUrl} alt="" />
                : <i className={d.kind === "MPIM" ? "fas fa-user-group" : "fas fa-user"} />}
            </div>
            <div className="cpm-dm-row-body">
              <div className="cpm-dm-row-top">
                <b className="cpm-dm-name">{names}</b>
                {d.lastMessageAt && (
                  <label className="cpm-dm-time">{formatDistanceToNowStrict(new Date(d.lastMessageAt))}</label>
                )}
              </div>
              <div className="cpm-dm-preview">
                {d.preview ? `${d.preview.authorName}: ${d.preview.text}` : "No messages yet"}
              </div>
            </div>
            {d.muted && <i className="fas fa-bell-slash cpm-chatpage-muted" aria-label="Muted" />}
            {unread && <b className="cpm-dm-badge">{d.unread}</b>}
          </button>
        );
      })}
    </aside>
  );
}
```

- [ ] **Step 2: Create `DmPanel.jsx`**

```jsx
import { useCallback, useEffect, useState } from "react";
import { getConversation } from "../../../api/clubPmClient";
import ChatConversation from "../chat/ChatConversation";

/** One open DM or group DM, docked beside the roster. URL state is `?dm=`. */
export default function DmPanel({ channelId, onClose }) {
  const [conversation, setConversation] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setError(null);
    getConversation(channelId)
      .then(setConversation)
      .catch(err => setError(err?.status === 404 ? "This conversation isn't available to you." : "Could not load this conversation."));
  }, [channelId]);

  useEffect(() => { setConversation(null); load(); }, [load]);

  const names = conversation?.participants?.map(p => p.displayName).join(", ");

  return (
    <section className="cpm-dm-panel" aria-label={names ? `Conversation with ${names}` : "Conversation"}>
      <header className="cpm-dm-panel-head">
        <b className="cpm-dm-panel-title">
          <i className={conversation?.kind === "MPIM" ? "fas fa-user-group" : "fas fa-comment"} aria-hidden="true" />{" "}
          {names || "Conversation"}
        </b>
        <button type="button" className="cpm-dm-panel-close" onClick={onClose} aria-label="Close conversation">
          <i className="fas fa-xmark" aria-hidden="true" />
        </button>
      </header>
      {error && <div className="cpm-chat-empty">{error}</div>}
      {!error && !conversation && <div className="cpm-spinner" aria-label="Loading" />}
      {conversation && (
        <ChatConversation
          key={channelId}
          channelId={channelId}
          conversation={conversation}
          emptyHint="No messages yet — say hi."
          composerPlaceholder={names ? `Message ${names}` : "Message"}
        />
      )}
    </section>
  );
}
```

- [ ] **Step 3: Admin panel — public backfill, honest disk wording**

In `src/components/clubpm/SlackArchivePanel.jsx`:

1. Change the import to `import { getSlackArchiveHealth, retryFailedSlackMirrors, backfillPublicChannels } from "../../api/clubPmClient";`.
2. Add state `const [publicNote, setPublicNote] = useState(null);` beside the others, and this handler below `retry()`:

```jsx
  async function backfillPublic() {
    setPublicNote(null);
    try {
      await backfillPublicChannels();
      setPublicNote({ ok: true, text: "Joining every public channel and importing its history in the background. This can take a while on a large workspace." });
    } catch {
      setPublicNote({ ok: false, text: "Could not start the public-channel import." });
    }
  }
```

3. Replace the `{local > 0 && health.driveConnected && ( … )}` banner with:

```jsx
      {local > 0 && (
        <div className="cpm-chat-banner" style={{ marginBottom: 12 }}>
          {local} attachment{local === 1 ? " is" : "s are"} stored on the server's disk. Private channels
          and DMs always are — they never go to the shared Drive — plus any public-channel files from a
          period when Drive was unavailable.
        </div>
      )}
```

4. Directly above the counts grid (`<div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>`), add:

```jsx
      <div style={{ marginBottom: 12 }}>
        <button type="button" className="cpm-chat-backfill-btn" onClick={backfillPublic}>
          <i className="fas fa-clock-rotate-left" aria-hidden="true" /> Import all public channels
        </button>
      </div>
      {publicNote && (
        <div className={`cpm-chat-banner${publicNote.ok ? "" : " cpm-chat-banner--error"}`} style={{ marginBottom: 12 }} role="status">
          {publicNote.text}
        </div>
      )}
```

- [ ] **Step 4: Gate + commit**

```bash
git add src/components/clubpm/members/DmInbox.jsx src/components/clubpm/members/DmPanel.jsx src/components/clubpm/SlackArchivePanel.jsx
git commit -m "feat(slack-portal): DM inbox and DM panel; admin public-channel import"
```

(The two new components are not rendered until Task 20, so the build won't pick up their icons yet. Task 20 commits the regenerated subset.)

---

## Task 20: `MembersView` — project scope, Message buttons, group DMs

**Files:**
- Modify: `src/pages/ClubPM/MembersView.jsx`

**Interfaces produced:** `<MembersView projectId? />`. With a `projectId` it shows only that project's roster, hides Import Contributors and the leaderboard, and filters the DM inbox to conversations involving the roster. The open DM is `?dm=<channelId>` in the URL.

- [ ] **Step 1: Imports**

- `import { Link } from 'react-router-dom';` → `import { Link, useSearchParams } from 'react-router-dom';`
- `import { get, post, listProjectRepos } from '../../api/clubPmClient';` → `import { get, post, listProjectRepos, openDm } from '../../api/clubPmClient';`
- add:

```js
import toast from 'react-hot-toast';
import DmInbox from '../../components/clubpm/members/DmInbox';
import DmPanel from '../../components/clubpm/members/DmPanel';
import { SlackReconnectNotice } from '../../components/clubpm/chat/ChatComposer';
```

- [ ] **Step 2: `MemberCard` — Message button and selection**

Change the signature to:

```jsx
function MemberCard({ member, onClick, onMessage, selectable = false, selected = false, onToggleSelect }) {
```

Replace the root `<div className="pm-member-card pm-member-card--enriched" onClick={onClick} ...>` opening tag with:

```jsx
    <div
      className={`pm-member-card pm-member-card--enriched${selected ? ' pm-member-card--selected' : ''}`}
      onClick={() => (selectable ? onToggleSelect?.(member) : onClick())}
      role="button"
      tabIndex={0}
      aria-pressed={selectable ? selected : undefined}
      onKeyDown={e => e.key === 'Enter' && (selectable ? onToggleSelect?.(member) : onClick())}
    >
      {selectable && (
        <div className={`pm-member-select${selected ? ' selected' : ''}`} aria-hidden="true">
          {selected && <i className="fas fa-check" />}
        </div>
      )}
```

Inside `pm-member-card-actions`, after `<KudosButton … />`, add:

```jsx
        {onMessage && (
          <button
            type="button"
            className="pm-member-card-message-btn"
            title={`Message ${displayName}`}
            aria-label={`Message ${displayName}`}
            onClick={() => onMessage(member)}
          >
            <i className="fas fa-comment" aria-hidden="true" />
          </button>
        )}
```

- [ ] **Step 3: `MemberDrawer` — Message button**

Change the signature to `function MemberDrawer({ member, onClose, isOwnProfile, onMessage }) {`. After the closing `)}` of the `isOwnProfile ? … : …` profile-link expression, add:

```jsx
        {!isOwnProfile && onMessage && (
          <button type="button" className="pm-member-edit-profile-btn" onClick={() => onMessage(member)}>
            <i className="fas fa-comment" aria-hidden="true" /> Message
          </button>
        )}
```

- [ ] **Step 4: Replace the `MembersView` component**

Replace everything from `export default function MembersView() {` to the end of the file with:

```jsx
export default function MembersView({ projectId = null }) {
  const { member: currentMember } = useClubPmAuth();
  const canDm = !!currentMember?.slackCapabilities?.dm;
  const [searchParams, setSearchParams] = useSearchParams();
  const dmChannelId = searchParams.get('dm');

  const [members, setMembers]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [filterRole, setFilterRole]         = useState('');
  const [selectedMember, setSelectedMember] = useState(null);
  const [showImport, setShowImport]         = useState(false);
  const [selecting, setSelecting]           = useState(false);
  const [selectedIds, setSelectedIds]       = useState(() => new Set());
  const [showReconnect, setShowReconnect]   = useState(false);
  const [opening, setOpening]               = useState(false);

  // GET /api/members already carries each member's projects, so the project
  // version is a filter, not a second endpoint.
  const fetchMembers = useCallback(() => {
    get('/api/members')
      .then(data => setMembers(
        projectId ? data.filter(m => m.projects?.some(pm => pm.project?.id === projectId)) : data
      ))
      .catch(err => console.error('Failed to load members:', err))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  // The open DM is URL state (?dm=) so notifications can deep-link to it (D12).
  const setDm = useCallback((channelId) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (channelId) next.set('dm', channelId);
      else next.delete('dm');
      return next;
    });
  }, [setSearchParams]);

  const startDm = async (memberIds) => {
    if (!canDm) { setShowReconnect(true); return; }
    setOpening(true);
    try {
      const { channelId } = await openDm(memberIds);
      setSelecting(false);
      setSelectedIds(new Set());
      setSelectedMember(null);
      setDm(channelId);
    } catch (err) {
      if (err?.status === 409) setShowReconnect(true);
      else toast.error(err?.message || 'Could not open that conversation.');
    } finally {
      setOpening(false);
    }
  };

  const toggleSelect = (m) => {
    if (m.id === currentMember?.id) return;
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(m.id)) next.delete(m.id);
      else if (next.size < 8) next.add(m.id);
      else toast.error('Group messages are limited to 8 other people — use a channel for larger groups.');
      return next;
    });
  };

  const rosterSlackIds = useMemo(
    () => (projectId ? new Set(members.map(m => m.slackId)) : null),
    [projectId, members]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return members.filter(m => {
      const matchesSearch = !q ||
        m.displayName?.toLowerCase().includes(q) ||
        m.slackHandle?.toLowerCase().includes(q) ||
        m.title?.toLowerCase().includes(q) ||
        m.email?.toLowerCase().includes(q);

      const roleLabel = m.isAdmin ? 'Admin' : (m.role === 'LEAD' ? 'Lead' : 'Member');
      const matchesRole = !filterRole || roleLabel === filterRole;

      return matchesSearch && matchesRole;
    });
  }, [members, search, filterRole]);

  const gridRef = useRef(null);
  // Only animate when loading flips true → false AFTER we've observed loading.
  // Initial mount (before fetch starts) must NOT animate, and filter/search
  // changes (which only mutate `filtered`) also must not re-trigger.
  const sawLoadingRef = useRef(false);
  useEffect(() => {
    if (loading) {
      sawLoadingRef.current = true;
      return;
    }
    if (!sawLoadingRef.current) return;
    sawLoadingRef.current = false;
    if (!gridRef.current) return;
    const cards = gridRef.current.querySelectorAll('.pm-member-card');
    if (cards.length) revealStagger(cards, { delay: 50, duration: 480 });
  }, [loading]);

  const messageFn = (m) => (m.id === currentMember?.id ? undefined : (target) => startDm([target.id]));

  return (
    <div className={`pm-members-page${projectId ? ' pm-members-page--project' : ''}`}>
      <div className="pm-members-header">
        <h1 className="pm-page-title">{projectId ? 'Project members' : 'Members'}</h1>
        <div className="pm-members-header-actions">
          <button
            type="button"
            className="clubpm-btn-secondary"
            aria-pressed={selecting}
            onClick={() => { setSelecting(s => !s); setSelectedIds(new Set()); }}
          >
            <i className="fas fa-user-group" aria-hidden="true" /> {selecting ? 'Cancel' : 'Group message'}
          </button>
          {!projectId && (
            <button className="clubpm-btn-secondary pm-gh-import-contrib-btn" onClick={() => setShowImport(true)}>
              <i className="fab fa-github" aria-hidden="true" /> Import Contributors
            </button>
          )}
        </div>
      </div>

      {showReconnect && <SlackReconnectNotice />}

      <div className={`pm-members-layout${dmChannelId ? ' pm-members-layout--dm' : ''}`}>
        <DmInbox activeChannelId={dmChannelId} onOpen={setDm} slackIdFilter={rosterSlackIds} />

        <div className="pm-members-roster">
          {!loading && <MembersStats members={members} />}

          <div className="pm-members-controls">
            <input
              className="pm-members-search"
              type="text"
              placeholder="Search by name, handle, title…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <div className="pm-members-filters">
              <select
                className="pm-members-filter-select"
                value={filterRole}
                onChange={e => setFilterRole(e.target.value)}
              >
                <option value="">All roles</option>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              {filterRole && (
                <button className="pm-members-filter-clear" onClick={() => setFilterRole('')}>
                  Clear filters
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}><OrbitLoader size={80} /></div>
          ) : filtered.length === 0 ? (
            <div className="pm-empty-state">No members found.</div>
          ) : (
            <div ref={gridRef} className="pm-members-grid" data-tour-id={projectId ? undefined : "admin.members"}>
              {filtered.map(m => (
                <MemberCard
                  key={m.id}
                  member={m}
                  onClick={() => setSelectedMember(m)}
                  onMessage={messageFn(m)}
                  selectable={selecting && m.id !== currentMember?.id}
                  selected={selectedIds.has(m.id)}
                  onToggleSelect={toggleSelect}
                />
              ))}
            </div>
          )}
        </div>

        {dmChannelId && <DmPanel channelId={dmChannelId} onClose={() => setDm(null)} />}
      </div>

      {selecting && selectedIds.size > 0 && (
        <div className="pm-members-groupbar" role="region" aria-label="Group message">
          <label>{selectedIds.size} selected</label>
          <button
            type="button"
            className="clubpm-btn-primary"
            disabled={opening}
            onClick={() => startDm([...selectedIds])}
          >
            <i className="fas fa-paper-plane" aria-hidden="true" />{' '}
            Message {selectedIds.size === 1 ? '1 person' : `${selectedIds.size} people`}
          </button>
        </div>
      )}

      {selectedMember && (
        <MemberDrawer
          member={selectedMember}
          onClose={() => setSelectedMember(null)}
          isOwnProfile={currentMember?.id === selectedMember.id}
          onMessage={(m) => startDm([m.id])}
        />
      )}

      {showImport && !projectId && (
        <ContributorImportModal
          onClose={() => setShowImport(false)}
          onImported={fetchMembers}
        />
      )}

      {/* Moved off the Dashboard — the XP/doubloon ranking reads as part of the
          roster. LeaderboardPanel fetches its own data. Club-wide page only. */}
      {!projectId && (
        <div data-tour-id="dash.leaderboard" style={{ marginTop: 24 }}><LeaderboardPanel /></div>
      )}
    </div>
  );
}
```

`data-tour-id={projectId ? undefined : "admin.members"}` keeps the literal `"admin.members"` in source for the static anchor check, while rendering it only on the club-wide page it is registered for.

- [ ] **Step 5: Gate + commit**

`node scripts/check-tour-anchors.js` → passes. Then `npm run build`, which regenerates the icon subset for `fa-comment`, `fa-check`, `fa-xmark` and the inbox icons. Manual: open `/clubpm/members`, hit **Message** on someone, and send. It must arrive in their Slack DMs **from you**. Reload with `?dm=` still in the URL and the panel reopens.

```bash
git add src/pages/ClubPM/MembersView.jsx public/fa-subset.css public/webfonts
git commit -m "feat(slack-portal): DMs from the Members page — message buttons, group DMs, inbox"
```

---

## Task 21: Project Members tab and deep links

**Files:**
- Modify: `src/pages/ClubPM/ProjectDetail.jsx`
- Modify: `src/clubpm/tour/tourAnchors.js`
- Modify: `docs/courses/ANCHORS.md`

**Never read `ProjectDetail.jsx` in full.** Every edit below is anchored by a grep.

- [ ] **Step 1: Import and tab entry**

Below `import ChatTab from "../../components/clubpm/chat/ChatTab";` add:

```js
import MembersView from "./MembersView";
```

In `const NAV_TABS = [`, directly after the `chat` entry's closing `},`, insert:

```jsx
  {
    id: "members", label: "Members", tourId: "project.tab.members",
    icon: (
      <TabIcon>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </TabIcon>
    ),
  },
```

- [ ] **Step 2: `?tab=` deep links**

Grep `const [searchParams] = useSearchParams();` inside `export default function ProjectDetail()` and change it to:

```js
  const [searchParams, setSearchParams] = useSearchParams();
```

Directly below `const [activeTab, setActiveTab] = useState("tasks");`, add:

```js
  // Deep links (notifications): ?tab=members&dm=…, ?tab=chat&channel=…&thread=…
  const tabParam = searchParams.get("tab");
  useEffect(() => {
    if (tabParam && NAV_TABS.some(t => t.id === tabParam)) setActiveTab(tabParam);
  }, [tabParam]);

  // Tab clicks keep the URL in step, and drop params that belong to other tabs.
  const changeTab = useCallback((id) => {
    setActiveTab(id);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (id === "tasks") next.delete("tab");
      else next.set("tab", id);
      if (id !== "members") next.delete("dm");
      if (id !== "chat") { next.delete("channel"); next.delete("thread"); }
      return next;
    }, { replace: true });
  }, [setSearchParams]);
```

In the `setProjectNav({ … })` effect (grep `onTabChange: setActiveTab,`), change `onTabChange: setActiveTab,` to `onTabChange: changeTab,` and that effect's dependency array from `[project?.name, activeTab, setProjectNav]` to `[project?.name, activeTab, setProjectNav, changeTab]`.

- [ ] **Step 3: Render the tab, and pass chat deep links through**

Grep `<ChatTab project={project} isAdmin={!!member?.isAdmin} />` and replace it with:

```jsx
              <ChatTab
                project={project}
                isAdmin={!!member?.isAdmin}
                initialChannelId={searchParams.get("channel")}
                initialThreadTs={searchParams.get("thread")}
              />
```

Directly after the closing `)}` of the `{activeTab === "chat" && ( … )}` block, add:

```jsx
          {activeTab === "members" && (
            <div className="cpm-proj-main-body" style={{ padding: "16px 24px 24px" }}>
              <MembersView projectId={project.id} />
            </div>
          )}
```

- [ ] **Step 4: Anchors, same commit**

In `src/clubpm/tour/tourAnchors.js`, below the `"project.tab.chat"` line:

```js
  "project.tab.members":    { label: "Members tab",          route: "/clubpm/projects/:id", note: "Sidebar project tab (AppShell) — roster + DMs" },
```

In `docs/courses/ANCHORS.md`, below the `project.tab.chat` row:

```markdown
| `project.tab.members` | Members tab&Dagger; | `/clubpm/projects/:id` |
```

Then run `rg -n "project tabs|Tasks, Files" docs/courses --glob "*.md"`. Any prose that enumerates the project tabs must list Members.

- [ ] **Step 5: Gate + commit**

`node scripts/check-tour-anchors.js` → passes; `npm run build` → compiles. Manual: `/clubpm/projects/<id>?tab=members` opens the Members tab showing only that project's roster. **Message** works there too, and switching back to Tasks removes `dm` from the URL.

```bash
git add src/pages/ClubPM/ProjectDetail.jsx src/clubpm/tour/tourAnchors.js docs/courses
git commit -m "feat(slack-portal): per-project Members tab with DMs; ?tab= deep links"
```

---

## Task 22: Styling

**Files:**
- Modify: `public/clubpm-theme.css` (append only)

**Do not read the stylesheet.** Existing chat rules sit around lines 26481–26620 (`.cpm-chat-wrap`, `.cpm-chat-layout`, `.cpm-chat-scroll`, `.cpm-chat-msg`, `.cpm-chat-reaction`, `.cpm-chat-drawer` at 340px). The rules below extend them and win by source order. Every element here is a ClubPM-only surface, so `clubpm-theme.css` is the correct file.

- [ ] **Step 1: Append**

```css
/* ═══════════════════════════════════════════════════════════════════
   Slack portal — conversation view, composer, actions, Block Kit
   ═══════════════════════════════════════════════════════════════════ */
.cpm-chat-conv { display: flex; flex-direction: column; gap: 10px; flex: 1; min-height: 0; }
.cpm-chat-main { display: flex; flex-direction: column; flex: 1; min-width: 0; min-height: 0; }

.cpm-chat-composer {
  position: relative; display: flex; align-items: flex-end; gap: 8px;
  margin-top: 10px; padding: 8px;
  background: var(--pm-bg-elevated); border: 1px solid var(--pm-border); border-radius: 10px;
}
.cpm-chat-composer:focus-within { border-color: var(--pm-border-active); }
.cpm-chat-composer-input {
  flex: 1; min-width: 0; max-height: 160px; resize: none;
  background: transparent; border: 0; outline: none; padding: 6px 4px;
  color: var(--pm-text-primary); font-family: var(--pm-font-body); font-size: 14px; line-height: 1.45;
}
.cpm-chat-composer-btn, .cpm-chat-composer-send {
  flex: none; width: 34px; height: 34px; border: 0; border-radius: 8px; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  background: transparent; color: var(--pm-text-secondary);
}
.cpm-chat-composer-btn:hover { background: var(--pm-bg-overlay); color: var(--pm-text-primary); }
.cpm-chat-composer-send { background: var(--pm-accent-teal); color: var(--pm-bg-base); }
.cpm-chat-composer-send:disabled { opacity: 0.4; cursor: default; }

.cpm-chat-suggest {
  position: absolute; left: 8px; right: 8px; bottom: calc(100% + 6px); z-index: 5; padding: 4px;
  background: var(--pm-bg-elevated); border: 1px solid var(--pm-border); border-radius: 10px;
  box-shadow: var(--pm-shadow-card);
}
.cpm-chat-suggest-item {
  display: flex; align-items: baseline; gap: 8px; width: 100%; padding: 6px 10px;
  border: 0; border-radius: 6px; background: transparent; color: var(--pm-text-primary);
  text-align: left; cursor: pointer;
}
.cpm-chat-suggest-item.active, .cpm-chat-suggest-item:hover { background: var(--pm-bg-overlay); }
.cpm-chat-suggest-handle { color: var(--pm-text-muted); font-size: 12px; }

.cpm-chat-reconnect {
  display: flex; flex-direction: column; gap: 8px; margin-top: 10px; padding: 14px;
  background: var(--pm-bg-elevated); border: 1px dashed var(--pm-border-active); border-radius: 10px;
  color: var(--pm-text-primary);
}
.cpm-chat-reconnect--compact { padding: 10px; font-size: 13px; }
.cpm-chat-reconnect-sub { color: var(--pm-text-secondary); font-size: 12px; line-height: 1.5; }
.cpm-chat-reconnect-btn { align-self: flex-start; display: inline-flex; align-items: center; gap: 8px; text-decoration: none; }

.cpm-chat-join {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  margin-top: 10px; padding: 10px 12px; color: var(--pm-text-secondary);
  background: var(--pm-bg-elevated); border: 1px solid var(--pm-border); border-radius: 10px;
}

.cpm-chat-msg { position: relative; }
.cpm-chat-msg-actions {
  position: absolute; top: 4px; right: 8px; display: none; gap: 2px; padding: 2px;
  background: var(--pm-bg-elevated); border: 1px solid var(--pm-border); border-radius: 8px;
  box-shadow: var(--pm-shadow-card);
}
.cpm-chat-msg:hover .cpm-chat-msg-actions,
.cpm-chat-msg:focus-within .cpm-chat-msg-actions { display: flex; }
.cpm-chat-msg-actions > button {
  width: 28px; height: 28px; border: 0; border-radius: 6px; cursor: pointer;
  background: transparent; color: var(--pm-text-secondary);
}
.cpm-chat-msg-actions > button:hover { background: var(--pm-bg-overlay); color: var(--pm-text-primary); }
.cpm-chat-react-picker {
  position: absolute; top: calc(100% + 4px); right: 0; z-index: 4; display: flex; gap: 2px; padding: 4px;
  background: var(--pm-bg-elevated); border: 1px solid var(--pm-border); border-radius: 8px;
  box-shadow: var(--pm-shadow-card);
}
.cpm-chat-react-picker > button {
  width: 32px; height: 32px; border: 0; border-radius: 6px; background: transparent; cursor: pointer; font-size: 18px;
}
.cpm-chat-react-picker > button:hover { background: var(--pm-bg-overlay); }
button.cpm-chat-reaction { color: inherit; font-family: inherit; cursor: pointer; }
button.cpm-chat-reaction:disabled { cursor: default; }
.cpm-chat-reaction--mine {
  border-color: var(--pm-accent-teal);
  background: color-mix(in srgb, var(--pm-accent-teal) 14%, var(--pm-bg-elevated));
}
.cpm-chat-emoji-char { font-size: 1.15em; line-height: 1; }

.cpm-chat-edit { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
.cpm-chat-edit .cpm-chat-composer-input {
  min-height: 60px; padding: 8px;
  background: var(--pm-bg-elevated); border: 1px solid var(--pm-border-active); border-radius: 8px;
}
.cpm-chat-edit-actions { display: flex; justify-content: flex-end; gap: 8px; }
.cpm-chat-app-badge {
  padding: 1px 5px; border-radius: 4px; font-size: 10px; font-weight: 700; letter-spacing: 0.06em;
  background: var(--pm-bg-overlay); color: var(--pm-text-secondary);
}
.cpm-chat-drawer .cpm-chat-composer, .cpm-chat-drawer .cpm-chat-reconnect { margin: 8px; }

.cpm-chat-blocks {
  display: flex; flex-direction: column; gap: 6px; padding-left: 10px;
  border-left: 3px solid var(--pm-border-active);
}
.cpm-chat-block-header { display: block; font-family: var(--pm-font-display); font-size: 15px; color: var(--pm-text-primary); }
.cpm-chat-block-fields { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 4px 16px; margin-top: 4px; }
.cpm-chat-block-context { font-size: 12px; color: var(--pm-text-muted); }
.cpm-chat-block-divider { width: 100%; margin: 2px 0; border: 0; border-top: 1px solid var(--pm-border); }
.cpm-chat-block-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.cpm-chat-block-chip {
  padding: 3px 10px; border: 1px solid var(--pm-border); border-radius: 999px;
  font-size: 12px; color: var(--pm-text-secondary); cursor: not-allowed;
}
.cpm-chat-block-image { font-size: 12px; color: var(--pm-text-muted); }

/* /clubpm/chat */
.cpm-chatpage {
  display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 16px;
  height: calc(100vh - 140px); min-height: 480px;
}
.cpm-chatpage-side {
  display: flex; flex-direction: column; gap: 2px; overflow-y: auto; padding: 12px;
  background: var(--pm-bg-surface); border: 1px solid var(--pm-border); border-radius: 12px;
}
.cpm-chatpage-filter {
  margin-bottom: 8px; padding: 7px 10px; border-radius: 8px;
  border: 1px solid var(--pm-border); background: var(--pm-bg-elevated); color: var(--pm-text-primary);
}
.cpm-chatpage-group {
  margin: 8px 6px 4px; font-size: 11px; font-weight: 700; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--pm-text-muted);
}
.cpm-chatpage-item {
  display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 7px;
  color: var(--pm-text-secondary); text-decoration: none;
}
.cpm-chatpage-item:hover { background: var(--pm-bg-overlay); color: var(--pm-text-primary); }
.cpm-chatpage-item.active { background: var(--pm-bg-elevated); color: var(--pm-text-primary); }
.cpm-chatpage-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cpm-chatpage-item.unread .cpm-chatpage-name { color: var(--pm-text-primary); font-weight: 700; }
.cpm-chatpage-badge, .cpm-dm-badge {
  min-width: 20px; padding: 1px 6px; border-radius: 999px; text-align: center;
  background: var(--pm-accent-coral); color: #fff; font-size: 11px;
}
.cpm-chatpage-muted { color: var(--pm-text-muted); font-size: 11px; }
.cpm-chatpage-browse-toggle {
  display: flex; align-items: center; gap: 8px; margin-top: 10px; padding: 6px 8px;
  border: 0; background: transparent; color: var(--pm-text-muted); text-align: left; cursor: pointer;
}
.cpm-chatpage-hint { padding: 4px 8px; font-size: 12px; color: var(--pm-text-muted); }
.cpm-chatpage-dmlink {
  display: flex; align-items: center; gap: 8px; margin-top: auto; padding: 10px 8px 2px;
  font-size: 12px; color: var(--pm-accent-teal); text-decoration: none;
}
.cpm-chatpage-main {
  display: flex; flex-direction: column; min-width: 0; min-height: 0; padding: 12px 16px;
  background: var(--pm-bg-surface); border: 1px solid var(--pm-border); border-radius: 12px;
}
.cpm-chatpage-head {
  display: flex; align-items: center; gap: 8px; padding-bottom: 10px; margin-bottom: 8px;
  border-bottom: 1px solid var(--pm-border); color: var(--pm-text-primary); font-family: var(--pm-font-display);
}
.cpm-chatpage-preview { margin-left: auto; font-size: 12px; color: var(--pm-accent-amber); }
@media (max-width: 860px) {
  .cpm-chatpage { grid-template-columns: 1fr; height: auto; }
  .cpm-chatpage-side { max-height: 260px; }
  .cpm-chatpage-main { min-height: 70vh; }
}

/* ═══════════════════════════════════════════════════════════════════
   Slack portal — DMs on the Members page
   ═══════════════════════════════════════════════════════════════════ */
.pm-members-header-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.pm-members-layout { display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 16px; align-items: start; }
.pm-members-layout--dm { grid-template-columns: 280px minmax(0, 1fr) minmax(360px, 440px); }
.pm-members-roster { min-width: 0; }

.cpm-dm-inbox {
  position: sticky; top: 12px; display: flex; flex-direction: column; gap: 2px;
  max-height: calc(100vh - 160px); overflow-y: auto; padding: 12px;
  background: var(--pm-bg-surface); border: 1px solid var(--pm-border); border-radius: 12px;
}
.cpm-dm-inbox-head { padding: 0 6px 8px; color: var(--pm-text-primary); font-family: var(--pm-font-display); }
.cpm-dm-row {
  display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px;
  border: 0; border-radius: 8px; background: transparent; color: var(--pm-text-secondary);
  text-align: left; cursor: pointer;
}
.cpm-dm-row:hover { background: var(--pm-bg-overlay); }
.cpm-dm-row.active { background: var(--pm-bg-elevated); }
.cpm-dm-row.unread .cpm-dm-name { color: var(--pm-text-primary); font-weight: 700; }
.cpm-dm-avatar {
  flex: none; width: 32px; height: 32px; overflow: hidden; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: var(--pm-bg-overlay); color: var(--pm-text-muted);
}
.cpm-dm-avatar img { width: 100%; height: 100%; object-fit: cover; }
.cpm-dm-row-body { flex: 1; min-width: 0; }
.cpm-dm-row-top { display: flex; justify-content: space-between; gap: 8px; }
.cpm-dm-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
.cpm-dm-time { flex: none; font-size: 11px; color: var(--pm-text-muted); }
.cpm-dm-preview { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: var(--pm-text-muted); }
.cpm-dm-empty { padding: 8px; font-size: 12px; line-height: 1.5; color: var(--pm-text-muted); }

.cpm-dm-panel {
  position: sticky; top: 12px; display: flex; flex-direction: column;
  height: calc(100vh - 160px); min-height: 420px; padding: 12px;
  background: var(--pm-bg-surface); border: 1px solid var(--pm-border); border-radius: 12px;
}
.cpm-dm-panel-head {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding-bottom: 10px; margin-bottom: 8px; border-bottom: 1px solid var(--pm-border); color: var(--pm-text-primary);
}
.cpm-dm-panel-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--pm-font-display); }
.cpm-dm-panel-close {
  width: 30px; height: 30px; border: 0; border-radius: 6px; cursor: pointer;
  background: transparent; color: var(--pm-text-secondary);
}
.cpm-dm-panel-close:hover { background: var(--pm-bg-overlay); }
/* A 340px thread drawer beside messages doesn't fit a docked panel: overlay it
   instead (absolute, not fixed — transformed ancestors would capture fixed). */
.cpm-dm-panel .cpm-chat-layout { position: relative; }
.cpm-dm-panel .cpm-chat-drawer { position: absolute; inset: 0; z-index: 3; width: auto; flex: none; }

.pm-member-card--enriched { position: relative; }
.pm-member-card-message-btn {
  width: 32px; height: 32px; border: 0; border-radius: 8px; cursor: pointer;
  background: transparent; color: var(--pm-text-secondary);
}
.pm-member-card-message-btn:hover { background: var(--pm-bg-overlay); color: var(--pm-accent-teal); }
.pm-member-card--selected { outline: 2px solid var(--pm-accent-teal); outline-offset: -2px; }
.pm-member-select {
  position: absolute; top: 10px; right: 10px; width: 22px; height: 22px; border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  border: 2px solid var(--pm-border-active); color: var(--pm-bg-base);
}
.pm-member-select.selected { background: var(--pm-accent-teal); border-color: var(--pm-accent-teal); }
.pm-members-groupbar {
  position: sticky; bottom: 16px; z-index: 20; width: fit-content; margin: 16px auto 0;
  display: flex; align-items: center; gap: 14px; padding: 10px 14px; border-radius: 999px;
  background: var(--pm-bg-elevated); border: 1px solid var(--pm-border-active);
  box-shadow: var(--pm-shadow-card); color: var(--pm-text-primary);
}

/* Narrow: an open DM replaces the roster rather than squeezing three columns. */
@media (max-width: 1200px) {
  .pm-members-layout--dm { grid-template-columns: 240px minmax(0, 1fr); }
  .pm-members-layout--dm .pm-members-roster { display: none; }
}
@media (max-width: 860px) {
  .pm-members-layout, .pm-members-layout--dm { grid-template-columns: 1fr; }
  .cpm-dm-inbox { position: static; max-height: 280px; }
  .cpm-dm-panel { position: static; height: 75vh; }
}
```

- [ ] **Step 2: Verify tokens, then look at it**

Run `rg -o "var\(--[a-z-]+\)" public/clubpm-theme.css | tail -400 | sort -u` and confirm every token in the new block is one of the Global-constraint tokens. Then `npm start` and check, at 1440px, 1100px and 800px wide:

- `/clubpm/chat`
- `/clubpm/members` with a DM open
- a project's Members tab
- a thread open inside a DM panel (it overlays the conversation)
- the hover actions on a message
- the mention suggestions above the composer

- [ ] **Step 3: Commit**

```bash
git add public/clubpm-theme.css
git commit -m "style(slack-portal): composer, message actions, Block Kit, chat page, DM inbox and panel"
```

---

# Part F — Notification sync

## Task 23: Pure ping rules

**Files:**
- Create: `backend/src/services/slackPings.ts`
- Create: `backend/src/services/slackPings.test.ts`

**Interfaces produced:** `PingType`, `Ping`, `PingInput`, `stripCode`, `extractMentions`, `computePings`.

- [ ] **Step 1: Failing test**

`backend/src/services/slackPings.test.ts`:

```ts
// Run: cd backend && npx tsx src/services/slackPings.test.ts
import { computePings, type PingInput } from "./slackPings.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}

const base: PingInput = {
  convKind: "CHANNEL", authorSlackId: "UA", isOwnBot: false, text: "",
  threadTs: null, conversationMemberIds: ["UA", "U1", "U2", "U3"],
  threadParticipantIds: [], userGroupMembers: {},
};
const pings = (over: Partial<PingInput>) => computePings({ ...base, ...over });
const typeFor = (ps: ReturnType<typeof computePings>, id: string) => ps.find((p) => p.slackUserId === id)?.type;

{
  const ps = pings({ convKind: "IM", conversationMemberIds: ["UA", "U1"], text: "hey" });
  check("DM pings the other participant", typeFor(ps, "U1") === "SLACK_DM");
  check("DM never pings its author", !typeFor(ps, "UA"));
}
check("group DM pings every other participant",
  pings({ convKind: "MPIM", conversationMemberIds: ["UA", "U1", "U2"], text: "x" }).length === 2);
check("our own bot never pings (D9)",
  pings({ convKind: "IM", conversationMemberIds: ["UBOT", "U1"], authorSlackId: "UBOT", isOwnBot: true, text: "<@U1>" }).length === 0);
check("another app's DM does ping",
  typeFor(pings({ convKind: "IM", conversationMemberIds: ["UAPP", "U1"], authorSlackId: "UAPP", text: "build done" }), "U1") === "SLACK_DM");
check("plain channel message pings nobody", pings({ text: "hello all" }).length === 0);
check("channel mention of a member", typeFor(pings({ text: "hi <@U1>" }), "U1") === "SLACK_MENTION");
check("labelled mention form", typeFor(pings({ text: "hi <@U1|ann>" }), "U1") === "SLACK_MENTION");
check("mention of a non-member pings nobody", pings({ text: "hi <@U9>" }).length === 0);
check("mention inside inline code is inert", pings({ text: "run `<@U1>`" }).length === 0);
check("mention inside a code block is inert", pings({ text: "```\n<@U1>\n```" }).length === 0);
check("author mentioning themselves", pings({ text: "note to <@UA>" }).length === 0);
{
  const ps = pings({ text: "<!channel> standup" });
  check("@channel pings every member but the author", ps.length === 3 && ps.every((p) => p.type === "SLACK_BROADCAST"));
}
check("@here is a broadcast too", pings({ text: "<!here>" }).length === 3);
check("direct mention beats broadcast", typeFor(pings({ text: "<!channel> esp. <@U1>" }), "U1") === "SLACK_MENTION");
{
  const ps = pings({ threadTs: "1.0", threadParticipantIds: ["U1", "UA", "U9"], text: "reply" });
  check("thread reply pings participants", typeFor(ps, "U1") === "SLACK_THREAD_REPLY");
  check("thread reply skips its author", !typeFor(ps, "UA"));
  check("thread participant who left the channel is skipped", !typeFor(ps, "U9"));
}
check("mention beats thread reply",
  typeFor(pings({ threadTs: "1.0", threadParticipantIds: ["U1"], text: "<@U1> ok" }), "U1") === "SLACK_MENTION");
{
  const ps = pings({ text: "<!subteam^S1|@leads> look", userGroupMembers: { S1: ["U2", "U9"] } });
  check("user-group mention reaches its members in the channel", typeFor(ps, "U2") === "SLACK_MENTION" && !typeFor(ps, "U9"));
}

console.log(`\nslackPings: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

Run it → FAIL.

- [ ] **Step 2: Implement `slackPings.ts`**

```ts
import type { ConversationKind } from "./slackConversationAccess.js";

/**
 * Pure. Who one Slack message pings, and how — mirroring Slack's default
 * notification rules (D8). One ping per recipient; the strongest reason wins.
 *
 * Slack's per-user mute and keyword settings have no API, so they can't be
 * mirrored; Constellation's own mute is applied by the caller.
 */
export type PingType = "SLACK_DM" | "SLACK_MENTION" | "SLACK_THREAD_REPLY" | "SLACK_BROADCAST";
export interface Ping { slackUserId: string; type: PingType }

export interface PingInput {
  convKind: ConversationKind;
  authorSlackId: string | null;
  /** Our own Club PM bot. Constellation already notified natively for its posts (D9). */
  isOwnBot: boolean;
  /** Raw mrkdwn. */
  text: string;
  /** Parent ts when this message is a thread reply. */
  threadTs: string | null;
  /** Slack members of the conversation (SlackConversationMember). */
  conversationMemberIds: string[];
  /** People following the thread: its parent's author, prior repliers, and people mentioned in it. */
  threadParticipantIds: string[];
  /** Expanded user groups, for <!subteam^S…> mentions. */
  userGroupMembers: Record<string, string[]>;
}

const STRENGTH: Record<PingType, number> = {
  SLACK_DM: 0, SLACK_MENTION: 1, SLACK_THREAD_REPLY: 2, SLACK_BROADCAST: 3,
};

/** Slack does not ping for mentions inside code. */
export function stripCode(text: string): string {
  return text.replace(/```[\s\S]*?```/g, " ").replace(/`[^`\n]*`/g, " ");
}

export function extractMentions(text: string): { users: string[]; groups: string[]; broadcast: boolean } {
  const t = stripCode(text);
  const users = [...t.matchAll(/<@([UW][A-Z0-9]+)(?:\|[^>]*)?>/g)].map((m) => m[1]);
  const groups = [...t.matchAll(/<!subteam\^([A-Z0-9]+)(?:\|[^>]*)?>/g)].map((m) => m[1]);
  const broadcast = /<!(channel|here|everyone)(?:\|[^>]*)?>/.test(t);
  return { users: [...new Set(users)], groups: [...new Set(groups)], broadcast };
}

export function computePings(input: PingInput): Ping[] {
  if (input.isOwnBot) return [];
  const isDm = input.convKind === "IM" || input.convKind === "MPIM";
  const members = new Set(input.conversationMemberIds);
  const out = new Map<string, PingType>();
  const give = (id: string, type: PingType) => {
    if (!id || id === input.authorSlackId) return;
    const prev = out.get(id);
    if (!prev || STRENGTH[type] < STRENGTH[prev]) out.set(id, type);
  };

  if (isDm) for (const id of members) give(id, "SLACK_DM");

  const m = extractMentions(input.text);
  // Slack doesn't notify someone mentioned in a conversation they're not in.
  for (const id of m.users) if (members.has(id)) give(id, "SLACK_MENTION");
  for (const g of m.groups) {
    for (const id of input.userGroupMembers[g] ?? []) if (members.has(id)) give(id, "SLACK_MENTION");
  }
  // @here is treated like @channel: we cannot see who is "active".
  if (m.broadcast && !isDm) for (const id of members) give(id, "SLACK_BROADCAST");
  if (input.threadTs) {
    for (const id of input.threadParticipantIds) if (members.has(id)) give(id, "SLACK_THREAD_REPLY");
  }

  return [...out].map(([slackUserId, type]) => ({ slackUserId, type }));
}
```

Run the test → `20 passed, 0 failed`.

- [ ] **Step 3: Gate + commit**

```bash
git add backend/src/services/slackPings.ts backend/src/services/slackPings.test.ts
git commit -m "feat(slack-portal): pure Slack ping rules"
```

---

## Task 24: Ping delivery, retraction, and read-on-post

**Files:**
- Create: `backend/src/services/slackNotifyService.ts`
- Modify: `backend/src/services/notificationCrud.ts` (append two functions)
- Modify: `backend/src/services/slackReadService.ts` (notification read-marking)
- Modify: `backend/src/slack/events.ts` (call delivery after ingest)

**Import graph (keep it acyclic):** `slackNotifyService` → `notificationCrud`, `slackReadService`, `chatDto`. `slackReadService` must **not** import `notificationCrud` or `slackNotifyService`; it owns Slack-notification read state itself.

- [ ] **Step 1: Upsert and retract in `notificationCrud.ts`**

Append:

```ts
// ── Slack ping mirror (slack portal) ─────────────────────────

/**
 * Create or merge one mirrored Slack ping.
 * - Never twice for the same (recipient, conversation, message, type): Slack
 *   redelivers events on retry.
 * - DMs aggregate: while an earlier DM notification from the same conversation
 *   is still unread, it is updated ("3 new messages") and bumped to the top
 *   instead of stacking one row per message.
 * SLACK_* notifications carry no projectId, so the member-project filter in
 * getNotificationsForMember never hides them.
 */
export async function upsertSlackNotification(data: {
  type: NotificationType;
  recipientId: string;
  actorId: string | null;
  slackChannelId: string;
  slackTs: string;
  message: string;
  aggregateMessage: (count: number) => string;
  link: string;
}): Promise<Notification | null> {
  const dupe = await prisma.notification.findFirst({
    where: { recipientId: data.recipientId, slackChannelId: data.slackChannelId, slackTs: data.slackTs, type: data.type },
    select: { id: true },
  });
  if (dupe) return null;

  if (data.type === "SLACK_DM") {
    const open = await prisma.notification.findFirst({
      where: { recipientId: data.recipientId, slackChannelId: data.slackChannelId, type: "SLACK_DM", read: false },
      orderBy: { createdAt: "desc" },
    });
    if (open) {
      const count = Number((open.metadata as { count?: number } | null)?.count ?? 1) + 1;
      const updated = await prisma.notification.update({
        where: { id: open.id },
        data: {
          message: data.aggregateMessage(count),
          slackTs: data.slackTs,
          actorId: data.actorId,
          createdAt: new Date(),
          metadata: { link: data.link, count },
        },
      });
      activityBus.emit(`notification:${data.recipientId}`, updated);
      return updated;
    }
  }

  const created = await prisma.notification.create({
    data: {
      type: data.type,
      recipientId: data.recipientId,
      actorId: data.actorId,
      slackChannelId: data.slackChannelId,
      slackTs: data.slackTs,
      message: data.message,
      metadata: { link: data.link, count: 1 },
    },
  });
  activityBus.emit(`notification:${data.recipientId}`, created);
  return created;
}

/** A message was deleted in Slack: its unread pings go with it (Slack does the same). */
export async function retractSlackNotifications(slackChannelId: string, slackTs: string): Promise<void> {
  const rows = await prisma.notification.findMany({
    where: { slackChannelId, slackTs, read: false },
    select: { id: true, recipientId: true },
  });
  if (rows.length === 0) return;
  await prisma.notification.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
  const byRecipient = new Map<string, string[]>();
  for (const r of rows) byRecipient.set(r.recipientId, [...(byRecipient.get(r.recipientId) ?? []), r.id]);
  for (const [recipientId, ids] of byRecipient) activityBus.emit(`notification-removed:${recipientId}`, { ids });
}
```

- [ ] **Step 2: Read state for Slack notifications in `slackReadService.ts`**

Add `import { activityBus } from "./activityService.js";` and append:

```ts
const SLACK_NOTIFICATION_TYPES = ["SLACK_DM", "SLACK_MENTION", "SLACK_THREAD_REPLY", "SLACK_BROADCAST"] as const;

/**
 * Mark a member's Slack notifications in one conversation read, up to `uptoTs`,
 * and tell their open tabs (SSE `notification-read`). Returns the ids cleared.
 */
export async function markSlackNotificationsRead(recipientId: string, slackChannelId: string, uptoTs: string): Promise<string[]> {
  const unread = await prisma.notification.findMany({
    where: { recipientId, slackChannelId, read: false, type: { in: [...SLACK_NOTIFICATION_TYPES] } },
    select: { id: true, slackTs: true },
  });
  const ids = idsReadUpTo(unread, uptoTs);
  if (ids.length === 0) return [];
  await prisma.notification.updateMany({ where: { id: { in: ids } }, data: { read: true, readAt: new Date() } });
  activityBus.emit(`notification-read:${recipientId}`, { ids });
  return ids;
}
```

In `markConversationRead`, directly after `const advanced = await advanceCursor(memberId, channelId, ts);`, add:

```ts
  // Reading a conversation clears its pings, whether or not the cursor moved —
  // a ping can be at or behind a cursor set by the member's own post.
  await markSlackNotificationsRead(memberId, channelId, ts);
```

- [ ] **Step 3: Create `slackNotifyService.ts`**

```ts
import type { WebClient } from "@slack/web-api";
import type { NotificationType } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { getBotUserId } from "./memberService.js";
import { computePings, extractMentions, type PingType } from "./slackPings.js";
import { upsertSlackNotification, retractSlackNotifications } from "./notificationCrud.js";
import { markConversationRead } from "./slackReadService.js";
import { buildFormatContext, previewText } from "./chatDto.js";
import { getProjectsForChannel } from "./projectService.js";
import type { IngestResult } from "./slackArchiveService.js";

/**
 * Slack → Constellation notification mirror (D8–D10).
 *
 * Called ONLY from the live event path (slack/events.ts). Backfill never calls
 * this, so importing history can't fire notifications (D10).
 */

const GROUP_TTL_MS = 30 * 60_000;
const groupCache = new Map<string, { ids: string[]; at: number }>();
let ownBotId: string | null | undefined;

/** Our app's bot_id, from auth.test — the reliable way to spot our own posts. */
async function getOwnBotId(client: WebClient): Promise<string | null> {
  if (ownBotId !== undefined) return ownBotId;
  try {
    const res = await client.auth.test();
    ownBotId = (res.bot_id as string | undefined) ?? null;
  } catch {
    ownBotId = null;
  }
  return ownBotId;
}

async function userGroupMembers(groupIds: string[], client: WebClient): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  for (const g of groupIds) {
    const hit = groupCache.get(g);
    if (hit && Date.now() - hit.at < GROUP_TTL_MS) { out[g] = hit.ids; continue; }
    try {
      const res = await client.usergroups.users.list({ usergroup: g });
      const ids = (res.users ?? []) as string[];
      groupCache.set(g, { ids, at: Date.now() });
      out[g] = ids;
    } catch {
      out[g] = []; // usergroups:read missing until the app is reinstalled
    }
  }
  return out;
}

/** Slack's "following": the parent's author, prior repliers, and people mentioned in the thread. */
async function threadParticipants(channelId: string, threadTs: string, excludeTs: string): Promise<string[]> {
  const rows = await prisma.slackMessage.findMany({
    where: { slackChannelId: channelId, OR: [{ ts: threadTs }, { threadTs }], NOT: { ts: excludeTs }, isBot: false, deletedAt: null },
    select: { authorSlackId: true, text: true },
  });
  const ids = new Set<string>();
  for (const r of rows) {
    if (r.authorSlackId) ids.add(r.authorSlackId);
    for (const u of extractMentions(r.text).users) ids.add(u);
  }
  return [...ids];
}

function messageFor(type: PingType, author: string, where: string, preview: string, isGroup: boolean): string {
  const q = preview ? `: “${preview}”` : "";
  switch (type) {
    case "SLACK_DM": return isGroup ? `${author} in a group message${q}` : `${author} sent you a message${q}`;
    case "SLACK_MENTION": return `${author} mentioned you in ${where}${q}`;
    case "SLACK_THREAD_REPLY": return `${author} replied in a thread in ${where}${q}`;
    case "SLACK_BROADCAST": return `${author} posted to everyone in ${where}${q}`;
  }
}

/**
 * Where a click goes (D12): DMs → the Members page; a channel → the Chat tab of
 * a project the recipient is on, else /clubpm/chat.
 */
function linkFor(r: IngestResult, projectIdForRecipient: string | null): string {
  const c = encodeURIComponent(r.channelId);
  if (r.convKind === "IM" || r.convKind === "MPIM") return `/clubpm/members?dm=${c}`;
  const thread = r.threadTs ? encodeURIComponent(r.threadTs) : null;
  if (projectIdForRecipient) {
    return `/clubpm/projects/${projectIdForRecipient}?tab=chat&channel=${c}${thread ? `&thread=${thread}` : ""}`;
  }
  return `/clubpm/chat/${c}${thread ? `?thread=${thread}` : ""}`;
}

export async function deliverSlackPings(r: IngestResult, client: WebClient): Promise<number> {
  if (r.event === "delete") {
    await retractSlackNotifications(r.channelId, r.ts);
    return 0;
  }
  if (r.event !== "new") return 0; // edits never re-ping; Slack doesn't either

  // Posting in a conversation means you've read it — Slack behaves the same.
  const author = r.authorSlackId
    ? await prisma.member.findUnique({ where: { slackId: r.authorSlackId }, select: { id: true } })
    : null;
  if (author && !r.isBot) await markConversationRead(author.id, r.channelId, r.ts, { pushToSlack: false });

  const [botUserId, botId] = await Promise.all([getBotUserId(client), getOwnBotId(client)]);
  const isOwnBot = r.isBot && ((!!botUserId && r.authorSlackId === botUserId) || (!!botId && r.botId === botId));

  const mentions = extractMentions(r.text);
  const [memberRows, archive, row] = await Promise.all([
    prisma.slackConversationMember.findMany({ where: { slackChannelId: r.channelId }, select: { slackUserId: true } }),
    prisma.slackChannelArchive.findUnique({ where: { slackChannelId: r.channelId }, select: { slackChannelName: true } }),
    prisma.slackMessage.findUnique({
      where: { slackChannelId_ts: { slackChannelId: r.channelId, ts: r.ts } },
      select: { authorName: true },
    }),
  ]);

  const pings = computePings({
    convKind: r.convKind,
    authorSlackId: r.authorSlackId,
    isOwnBot,
    text: r.text,
    threadTs: r.threadTs,
    conversationMemberIds: memberRows.map((m) => m.slackUserId),
    threadParticipantIds: r.threadTs ? await threadParticipants(r.channelId, r.threadTs, r.ts) : [],
    userGroupMembers: mentions.groups.length ? await userGroupMembers(mentions.groups, client) : {},
  });
  if (pings.length === 0) return 0;

  const recipients = await prisma.member.findMany({
    where: { slackId: { in: pings.map((p) => p.slackUserId) }, isBot: false },
    select: { id: true, slackId: true, mutedSlackChannelIds: true, notificationChannels: true },
  });
  if (recipients.length === 0) return 0;

  // One project lookup for everyone, not one per recipient.
  const isChannel = r.convKind === "CHANNEL" || r.convKind === "PRIVATE_CHANNEL";
  const projectIds = isChannel ? (await getProjectsForChannel(r.channelId)).map((p: { id: string }) => p.id) : [];
  const memberships = projectIds.length
    ? await prisma.projectMember.findMany({
        where: { projectId: { in: projectIds }, memberId: { in: recipients.map((m) => m.id) } },
        select: { projectId: true, memberId: true },
      })
    : [];
  const projectFor = new Map(memberships.map((m) => [m.memberId, m.projectId]));

  const ctx = await buildFormatContext();
  const preview = previewText(r.text, ctx, 120);
  const authorName = row?.authorName ?? "Someone";
  const where = archive?.slackChannelName ? `#${archive.slackChannelName}` : "a channel";
  const isGroup = r.convKind === "MPIM";
  const typeOf = new Map(pings.map((p) => [p.slackUserId, p.type]));

  let delivered = 0;
  for (const m of recipients) {
    const type = typeOf.get(m.slackId);
    if (!type) continue;
    if (m.mutedSlackChannelIds.includes(r.channelId)) continue;
    const prefs = (m.notificationChannels ?? {}) as Record<string, unknown>;
    if (prefs[type] === "off") continue;

    const n = await upsertSlackNotification({
      type: type as NotificationType,
      recipientId: m.id,
      actorId: author?.id ?? null,
      slackChannelId: r.channelId,
      slackTs: r.ts,
      message: messageFor(type, authorName, where, preview, isGroup),
      aggregateMessage: (count) =>
        isGroup ? `${count} new messages in a group message — latest from ${authorName}` : `${authorName} sent you ${count} messages`,
      link: linkFor(r, projectFor.get(m.id) ?? null),
    });
    if (n) delivered++;
  }
  return delivered;
}
```

If `tsc` complains about the `getProjectsForChannel` element type, grep `export async function getProjectsForChannel` in `projectService.ts` and use its real return type. It returns project rows that carry `id`.

- [ ] **Step 4: Deliver from the live event path**

In `backend/src/slack/events.ts`, add `import { deliverSlackPings } from "../services/slackNotifyService.js";`. Then replace the first `try { … } catch` block of `app.message` (the one Task 5 wrote, calling `ingestSlackMessage` and `ensureMembersKnown`) with:

```ts
    let result: Awaited<ReturnType<typeof ingestSlackMessage>> = null;
    try {
      result = await ingestSlackMessage(message as never, client);
      if (result?.event === "new") {
        await ensureMembersKnown(result.channelId, result.convKind, authorizedUserId);
      }
    } catch (error) {
      console.error("[slackArchive] ingest failed:", error);
    }

    // Mirror Slack's pings into Constellation. Live path ONLY — backfill never
    // notifies (D10). Separate error boundary: a ping bug must not lose the
    // archive row, and an archive bug must not block the TODO prompt below.
    if (result) {
      try {
        await deliverSlackPings(result, client);
      } catch (error) {
        console.error("[slackPortal] ping delivery failed:", error);
      }
    }
```

Membership is ensured **before** pings are computed, because pings need the member list.

- [ ] **Step 5: Gate + commit**

Run every backend test file touched so far, then the gate. Manual, with two accounts:

- A DMs B in Slack → B's Constellation bell rings with "A sent you a message". A second DM from A updates that same row to "A sent you 2 messages".
- A `@`-mentions B in a channel → B gets a mention notification.
- A deletes the message → B's unread notification disappears.
- The Monday digest (our bot) produces **no** Slack notifications.

```bash
git add backend/src/services/slackNotifyService.ts backend/src/services/notificationCrud.ts backend/src/services/slackReadService.ts backend/src/slack/events.ts
git commit -m "feat(slack-portal): mirror Slack pings as Constellation notifications"
```

---

## Task 25: Slack→Constellation read sync, mute, roster hygiene

**Files:**
- Create: `backend/src/services/slackReadSyncService.ts`
- Modify: `backend/src/slack/scheduler.ts`
- Modify: `backend/src/api/chat.ts` (mute route)
- Modify: `backend/src/api/members.ts` (strip new per-member fields from roster responses)

- [ ] **Step 1: Create `slackReadSyncService.ts`**

```ts
import { prisma } from "../db/prisma.js";
import { userClientFor, clearSlackUserToken, isDeadTokenError, slackErrorCode } from "./slackUserTokenService.js";
import { hasCapability } from "./slackScopes.js";
import { advanceCursor, markSlackNotificationsRead } from "./slackReadService.js";

const SLACK_TYPES = ["SLACK_DM", "SLACK_MENTION", "SLACK_THREAD_REPLY", "SLACK_BROADCAST"] as const;
const MAX_PAIRS = 40;
/** conversations.info is Tier 3 (~50/min). 40 × 1.2s fits well inside the 2-minute cron. */
const PACE_MS = 1_200;

let running = false;

/**
 * Slack → Constellation read sync (D11).
 *
 * The Events API never reports that someone read a message in Slack
 * (channel_marked/im_marked are RTM-only), so this polls instead: for each
 * (member, conversation) that still has unread Slack notifications, ask Slack
 * for that member's last_read, then clear everything up to it. Bounded and
 * single-flight, so a slow Slack can't stack runs.
 */
export async function syncReadStateFromSlack(): Promise<{ checked: number; cleared: number }> {
  if (running) return { checked: 0, cleared: 0 };
  running = true;
  try {
    const pairs = await prisma.notification.findMany({
      where: { read: false, type: { in: [...SLACK_TYPES] }, slackChannelId: { not: null } },
      select: { recipientId: true, slackChannelId: true },
      distinct: ["recipientId", "slackChannelId"],
      take: MAX_PAIRS,
    });

    let checked = 0;
    let cleared = 0;
    for (const p of pairs) {
      const channelId = p.slackChannelId!;
      const uc = await userClientFor(p.recipientId);
      if (!uc || !hasCapability(uc.scopes, "read")) continue;
      try {
        const info = await uc.client.conversations.info({ channel: channelId });
        const lastRead = (info.channel as { last_read?: string } | undefined)?.last_read;
        checked++;
        // Slack omits last_read for some conversation types; nothing to sync then.
        if (lastRead && !/^0+\.0+$/.test(lastRead)) {
          await advanceCursor(p.recipientId, channelId, lastRead);
          cleared += (await markSlackNotificationsRead(p.recipientId, channelId, lastRead)).length;
        }
      } catch (err) {
        const code = slackErrorCode(err);
        if (isDeadTokenError(code)) await clearSlackUserToken(p.recipientId);
      }
      await new Promise((res) => setTimeout(res, PACE_MS));
    }
    return { checked, cleared };
  } finally {
    running = false;
  }
}
```

- [ ] **Step 2: Every two minutes**

In `scheduler.ts`, after the 03:55 block from Task 5:

```ts
  // ── Every 2 min — Slack portal: clear notifications members already read in Slack ──
  cron.schedule("*/2 * * * *", async () => {
    try {
      const { syncReadStateFromSlack } = await import("../services/slackReadSyncService.js");
      const r = await syncReadStateFromSlack();
      if (r.cleared > 0) console.log(`👁️ [slackPortal] read sync cleared ${r.cleared} notification(s) across ${r.checked} conversation(s)`);
    } catch (err) {
      console.error("[slackPortal] read sync failed:", err);
    }
  });
```

- [ ] **Step 3: Mute route**

Append to `backend/src/api/chat.ts`:

```ts
// ── POST /api/chat/conversations/:channelId/mute ─────────────
// Constellation-only mute (D8): silences mirrored pings from this
// conversation. Slack's own mute has no API, so it can't be read or set.
chatRouter.post("/conversations/:channelId/mute", requireAuth, requireConversationRead, async (req: Request, res: Response) => {
  try {
    const muted = req.body?.muted === true;
    const channelId = req.conversation!.channelId;
    const me = await prisma.member.findUnique({ where: { id: req.memberId! }, select: { mutedSlackChannelIds: true } });
    const set = new Set(me?.mutedSlackChannelIds ?? []);
    if (muted) set.add(channelId);
    else set.delete(channelId);
    await prisma.member.update({
      where: { id: req.memberId! },
      data: { mutedSlackChannelIds: [...set].slice(0, 1000) },
    });
    res.json({ muted });
  } catch (error) {
    console.error("chat/mute error:", error);
    res.status(500).json({ error: "Failed to update mute" });
  }
});
```

- [ ] **Step 4: Keep per-member Slack state out of the roster**

The roster (`GET /api/members`, `GET /api/members/:id`) is readable by every member. A muted-conversation list names DM channel ids, so it is personal. In `backend/src/api/members.ts`, in **both** destructuring strip-lists (grep `slackUserToken: _sut,`; there are two), add:

```ts
        mutedSlackChannelIds: _msc,
        slackUserScopes: _sus,
```

- [ ] **Step 5: Gate + commit**

Manual: get a DM ping in Constellation, read the DM in the Slack app, and within about 2 minutes the Constellation notification turns read. Mute a conversation via `POST …/mute` and its next ping is suppressed.

```bash
git add backend/src/services/slackReadSyncService.ts backend/src/slack/scheduler.ts backend/src/api/chat.ts backend/src/api/members.ts
git commit -m "feat(slack-portal): clear notifications read in Slack; Constellation-side mute"
```

---

## Task 26: Notification UI

**Files:**
- Modify: `src/components/clubpm/NotificationBell.jsx`
- Modify: `src/components/clubpm/NotificationCenter.jsx`
- Modify: `src/components/clubpm/NotificationPreferences.jsx`
- Modify: `src/components/clubpm/chat/ChatConversation.jsx` (mute toggle)

- [ ] **Step 1: Bell**

In `NotificationBell.jsx`:

1. Replace `TYPE_GROUPS` and `TABS` with:

```js
const SLACK_TYPES = ["SLACK_DM", "SLACK_MENTION", "SLACK_THREAD_REPLY", "SLACK_BROADCAST"];

const TYPE_GROUPS = {
  Mentions: ["TASK_MENTIONED", "COMMENT_REPLY", "SLACK_MENTION", "SLACK_THREAD_REPLY"],
  Slack: SLACK_TYPES,
  Tasks: [
    "TASK_ASSIGNED",
    "TASK_COMPLETED",
    "TASK_UPDATED",
    "TASK_COMMENTED",
    "TASK_DUE_SOON",
    "TASK_OVERDUE",
  ],
  Projects: [
    "PROJECT_UPDATE",
    "MILESTONE_COMPLETED",
    "MILESTONE_AT_RISK",
    "STANDUP_POSTED",
    "SYSTEM",
  ],
};

const TABS = ["All", "Mentions", "Slack", "Tasks", "Projects"];
```

2. In the `"notification"` SSE handler, replace `setNotifications(prev => [notif, ...prev]);` with:

```js
        // Slack DM pings are UPDATED in place ("3 new messages") — replace by id.
        setNotifications(prev => [notif, ...prev.filter(n => n.id !== notif.id)]);
```

3. After the `"slack-membership"` listener (Task 7), add:

```js
    // Read in Slack, in another tab, or by posting — sync without a refetch.
    es.addEventListener("notification-read", (e) => {
      try {
        const ids = new Set(JSON.parse(e.data).ids ?? []);
        setNotifications(prev => prev.map(n => (ids.has(n.id) ? { ...n, read: true } : n)));
      } catch {
        // malformed event — ignore
      }
    });
    // The pinging message was deleted in Slack.
    es.addEventListener("notification-removed", (e) => {
      try {
        const ids = new Set(JSON.parse(e.data).ids ?? []);
        setNotifications(prev => prev.filter(n => !ids.has(n.id)));
      } catch {
        // malformed event — ignore
      }
    });
```

4. In `handleRead`, directly after the `patch(...)` call, add:

```js
      if (notif.metadata?.link) {
        setOpen(false);
        navigate(notif.metadata.link);
        return;
      }
```

- [ ] **Step 2: Notification center**

In `NotificationCenter.jsx`: apply the same `TYPE_GROUPS`/`TABS` replacement as the bell. Add these entries to `TYPE_LABELS`:

```js
  SLACK_DM:            "Slack DM",
  SLACK_MENTION:       "Slack mention",
  SLACK_THREAD_REPLY:  "Slack thread",
  SLACK_BROADCAST:     "Slack @channel",
```

and to `TYPE_BADGE_COLORS`:

```js
  SLACK_DM:            "var(--pm-accent-violet)",
  SLACK_MENTION:       "var(--pm-accent-violet)",
  SLACK_THREAD_REPLY:  "var(--pm-accent-teal)",
  SLACK_BROADCAST:     "var(--pm-accent-amber)",
```

In its `handleRead`, directly after the `patch(...)` call, add:

```js
    if (notif.metadata?.link) {
      navigate(notif.metadata.link);
      return;
    }
```

- [ ] **Step 3: Preferences**

In `NotificationPreferences.jsx`, below `EVENT_TYPES`, add:

```js
// Slack pings mirrored into Constellation. They are never sent back to Slack
// as a DM — the ping already happened there — so the only choices are
// "show it here" or "don't".
const SLACK_EVENT_TYPES = [
  { key: 'SLACK_DM',           label: 'Slack direct and group messages' },
  { key: 'SLACK_MENTION',      label: 'Mentioned in Slack' },
  { key: 'SLACK_THREAD_REPLY', label: 'Replies in Slack threads I’m in' },
  { key: 'SLACK_BROADCAST',    label: '@channel, @here and @everyone' },
];

const SLACK_CHANNEL_OPTIONS = [
  { value: 'dashboard', label: 'Constellation' },
  { value: 'off',       label: 'Off' },
];
```

Directly after the closing `</div>` of Section 2 (the "Delivery channel per event" section), add a sibling section:

```jsx
        {/* ── Section 2b: Slack pings mirrored here ───────── */}
        <div className="pm-prefs-section">
          <div className="pm-prefs-section-title">Slack pings in Constellation</div>
          <div className="pm-prefs-section-body">
            {SLACK_EVENT_TYPES.map(({ key, label }) => (
              <div key={key} className="pm-prefs-row">
                <span className="pm-prefs-label">{label}</span>
                <select
                  className="pm-prefs-select"
                  value={notificationChannels[key] === 'off' ? 'off' : 'dashboard'}
                  onChange={e => setChannel(key, e.target.value)}
                >
                  {SLACK_CHANNEL_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            ))}
            <p className="pm-prefs-hint">
              Slack's own mute and keyword settings can't be read by Constellation. To silence one
              conversation here, use the bell button in that conversation.
            </p>
          </div>
        </div>
```

(`<span>` is fine here: this file isn't in `chat/`, and it matches the section above.)

- [ ] **Step 4: Mute toggle in `ChatConversation`**

In `ChatConversation.jsx`, add `muteConversation` to the client import and `import toast from "react-hot-toast";`. Add this below the other `useState` calls:

```jsx
  const [muted, setMuted] = useState(!!conversation?.muted);
  useEffect(() => { setMuted(!!conversation?.muted); }, [conversation?.muted]);

  const toggleMute = async () => {
    const next = !muted;
    setMuted(next);
    try {
      await muteConversation(channelId, next);
    } catch {
      setMuted(!next);
      toast.error("Could not change notifications for this conversation.");
    }
  };
```

Inside `.cpm-chat-toolbar`, after the search `</form>`, add:

```jsx
        {conversation?.isParticipant && (
          <button
            type="button"
            className="cpm-chat-backfill-btn"
            onClick={toggleMute}
            aria-pressed={muted}
            title={muted ? "Unmute — get Constellation notifications from this conversation again" : "Mute — no Constellation notifications from this conversation"}
          >
            <i className={muted ? "fas fa-bell-slash" : "fas fa-bell"} aria-hidden="true" />
            {muted ? "Muted" : "Mute"}
          </button>
        )}
```

- [ ] **Step 5: Gate + commit**

`npm run build` (regenerates the subset for `fa-bell`). Manual:

- A Slack DM ping appears under the bell's **Slack** tab. Clicking it opens `/clubpm/members?dm=…` with the conversation docked.
- Reading it there clears the Slack unread badge in the Slack app too (`conversations.mark`).
- A mention in a project channel links to that project's Chat tab with the channel selected.

```bash
git add src/components/clubpm/NotificationBell.jsx src/components/clubpm/NotificationCenter.jsx src/components/clubpm/NotificationPreferences.jsx src/components/clubpm/chat/ChatConversation.jsx public/fa-subset.css public/webfonts
git commit -m "feat(slack-portal): Slack pings in the bell, deep links, read/remove sync, mute"
```

---

## Task 27: Constellation→Slack parity (`notificationChannels` made real)

**Files (deliberate 6-file mechanical task):**
- Create: `backend/src/services/notificationRouting.ts`
- Create: `backend/src/services/notificationRouting.test.ts`
- Modify: `backend/src/services/notificationCrud.ts` (`createNotification`)
- Modify: `backend/src/api/tasks.ts`, `backend/src/api/projects.ts`, `backend/src/services/taskCompletionService.ts` (five call sites)

**Background (D14).** The preferences page has always offered "Both / Dashboard only / Slack DM / Off" for seven event types. Nothing on the server has ever read the setting. Instead, the call sites for those types pair `createNotification(...)` with a hand-written `queueDm(...)`, so every member gets both, whatever they chose. After this task `createNotification` routes by preference, and those call sites pass `slackText` instead of calling `queueDm`.

**Behavior change:** `COMMENT_REPLY` gains a Slack DM by default, matching what the preferences UI has always claimed ("Both"). Note it in the PR.

- [ ] **Step 1: Failing routing test**

`backend/src/services/notificationRouting.test.ts`:

```ts
// Run: cd backend && npx tsx src/services/notificationRouting.test.ts
import { routeFor } from "./notificationRouting.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}
const eq = (a: object, b: object) => JSON.stringify(a) === JSON.stringify(b);

check("no preference → both", eq(routeFor("TASK_ASSIGNED", undefined), { inApp: true, slack: true }));
check("dashboard → in-app only", eq(routeFor("TASK_ASSIGNED", "dashboard"), { inApp: true, slack: false }));
check("slack → Slack only", eq(routeFor("TASK_ASSIGNED", "slack"), { inApp: false, slack: true }));
check("off → nothing", eq(routeFor("TASK_ASSIGNED", "off"), { inApp: false, slack: false }));
check("garbage preference → both", eq(routeFor("TASK_ASSIGNED", 42), { inApp: true, slack: true }));
// D9 loop guard: a mirrored Slack ping must never be DM'd back to Slack.
check("SLACK_DM default → in-app, never Slack", eq(routeFor("SLACK_DM", undefined), { inApp: true, slack: false }));
check("SLACK_MENTION 'slack' → still never Slack", eq(routeFor("SLACK_MENTION", "slack"), { inApp: true, slack: false }));
check("SLACK_BROADCAST off → nothing", eq(routeFor("SLACK_BROADCAST", "off"), { inApp: false, slack: false }));

console.log(`\nnotificationRouting: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Implement `notificationRouting.ts`**

```ts
/** Pure. How one notification reaches a member. */

export const SLACK_MIRROR_TYPES: ReadonlySet<string> = new Set([
  "SLACK_DM", "SLACK_MENTION", "SLACK_THREAD_REPLY", "SLACK_BROADCAST",
]);

type ChannelPref = "both" | "dashboard" | "slack" | "off";

/**
 * `pref` is Member.notificationChannels[type]; anything missing or unknown is
 * "both" (the preferences UI's default). SLACK_* types NEVER go to Slack —
 * they came from there (D9 loop guard).
 */
export function routeFor(type: string, pref: unknown): { inApp: boolean; slack: boolean } {
  const p: ChannelPref = pref === "dashboard" || pref === "slack" || pref === "off" ? pref : "both";
  if (SLACK_MIRROR_TYPES.has(type)) return { inApp: p !== "off", slack: false };
  return { inApp: p === "both" || p === "dashboard", slack: p === "both" || p === "slack" };
}
```

Run the test → `8 passed, 0 failed`.

- [ ] **Step 3: Route inside `createNotification`**

In `backend/src/services/notificationCrud.ts`, add:

```ts
import { queueDm } from "./dmBatcher.js";
import { routeFor } from "./notificationRouting.js";
```

Replace the whole `createNotification` function with:

```ts
/**
 * Create one notification, delivered per the recipient's preference for its
 * type (D14). `slackText` opts a call site in to the Slack DM; a caller that
 * passes none keeps its pre-portal behaviour (in-app only). No caller uses the
 * return value, which is null when the member turned this type off or chose
 * Slack-only.
 */
export async function createNotification(data: {
  type: NotificationType;
  recipientId: string;
  actorId?: string;
  projectId?: string;
  taskId?: string;
  commentId?: string;
  message: string;
  metadata?: Record<string, any>;
  slackText?: string;
}): Promise<Notification | null> {
  const recipient = await prisma.member.findUnique({
    where: { id: data.recipientId },
    select: { slackId: true, notificationChannels: true },
  });
  const prefs = (recipient?.notificationChannels ?? {}) as Record<string, unknown>;
  const route = routeFor(data.type, prefs[data.type]);

  let notification: Notification | null = null;
  if (route.inApp) {
    notification = await prisma.notification.create({
      data: {
        type:        data.type,
        recipientId: data.recipientId,
        actorId:     data.actorId     ?? null,
        projectId:   data.projectId   ?? null,
        taskId:      data.taskId      ?? null,
        commentId:   data.commentId   ?? null,
        message:     data.message,
        metadata:    (data.metadata as any) ?? undefined,
      },
    });
    // Push to SSE stream for the recipient
    activityBus.emit(`notification:${data.recipientId}`, notification);
  }

  if (route.slack && data.slackText && recipient?.slackId) {
    queueDm(recipient.slackId, data.slackText);
  }
  return notification;
}
```

Also change `batchCreateNotifications`' parameter element type to include `slackText?: string;`, so it stays a pass-through.

- [ ] **Step 4: Move the five call sites onto `slackText`**

For each site: add a `slackText:` property to the `createNotification({ … })` call, using the **exact** string the adjacent `queueDm` sends today, then delete the `queueDm` line.

| File | Grep | Change |
|---|---|---|
| `backend/src/api/tasks.ts` | `type: "TASK_ASSIGNED"` | `slackText: \`📋 *${actor?.displayName ?? "Someone"}* assigned you to *${task.title}* in ${proj?.name ?? "a project"}\``, then delete the `if (assignee.slackId) queueDm(…)` line below |
| `backend/src/api/tasks.ts` | `type: "COMMENT_REPLY"` | add `slackText: \`↩️ *${populatedComment.author.displayName}* replied to your comment on *${populatedComment.task.title}*\`` (no `queueDm` to delete — this is the behavior change) |
| `backend/src/api/tasks.ts` | `type: "TASK_COMMENTED"` | move the `queueDm` string into `slackText`, delete `if ((assignee as any).slackId) queueDm(…)` |
| `backend/src/api/projects.ts` | `type: "PROJECT_UPDATE"` | `slackText: \`📢 New update in *${projectWithMembers.name}*:\n> ${content.slice(0, 200)}\``, delete `if (recipient.slackId) queueDm(…)` |
| `backend/src/services/taskCompletionService.ts` | `type: "TASK_COMPLETED"` | `slackText: \`✅ Task *${updatedTask.title}* was marked done\``, delete the `queueDm` line |

After the edits, grep each of the three files for `queueDm(`. If a file has none left, delete its `import { queueDm } …` line. Other `queueDm` users (the scheduler, vault, courses, and so on) are untouched: they send DMs that have no in-app twin.

- [ ] **Step 5: Gate + commit**

Run the routing test and the gate. Manual: set "Task assigned to me" to **Dashboard only**, get assigned, and you see the bell notification but **no** Slack DM. Set it to **Slack DM**: you get the DM, and no bell notification.

```bash
git add backend/src/services/notificationRouting.ts backend/src/services/notificationRouting.test.ts backend/src/services/notificationCrud.ts backend/src/api/tasks.ts backend/src/api/projects.ts backend/src/services/taskCompletionService.ts
git commit -m "feat(notifications): honour per-event delivery preferences; Slack mirrors never echo back"
```

---

# Part G — Close-out

## Task 28: End-to-end verification, cleanup, docs

**Files:**
- Modify: `backend/src/api/projectChat.ts` (delete superseded read routes)
- Modify: `src/api/clubPmClient.js` (delete superseded functions)
- Modify: `backend/src/appMountOrder.test.ts`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Delete what `/api/chat` superseded**

First confirm nothing uses them: `rg -n "getChatMessages|getChatThread|searchChat|chatFileUrl" src` must list only their definitions in `clubPmClient.js`. Then:

- In `backend/src/api/projectChat.ts`, delete the `GET /:projectId/chat/messages`, `/chat/thread/:ts`, `/chat/search` and `/chat/files/:slackFileId` routes, plus any import only they used. Keep `fileProxyAuth` (exported, used by `chat.ts`), `channels`, `backfill`, `backfill/:channelId`, `storage-health` and the admin router.
- In `src/api/clubPmClient.js`, delete `getChatMessages`, `getChatThread`, `searchChat` and `chatFileUrl`.
- In `backend/src/appMountOrder.test.ts`, remove `"projectChatRouter"` from `QUERY_TOKEN_ROUTERS` and from `SHADOWS`: it no longer serves a `?token=` route. In `app.ts`, update the comment above `app.use("/api/projects", projectChatRouter);` to say the order is kept only for backfill routes, and that the file proxy moved to `/api/chat`.

- [ ] **Step 2: `CLAUDE.md`**

- **API Routes:** add `chat.ts`, the conversation-scoped Slack portal API (reads, writes as the member, file proxy, read marks, mute). Note it is mounted above the bare `/api` routers for its `?token=` proxy.
- **Services:** add one line each for `slackMembershipService`, `slackReadService`, `slackSendService`, `slackNotifyService`, `slackReadSyncService`, `slackBlocks`, `slackPings`, `notificationRouting`.
- **File structure:** `src/components/clubpm/chat/` (`ChatConversation`, `ChatComposer`, `ChatBlocks`), `src/components/clubpm/members/` (`DmInbox`, `DmPanel`), `src/pages/ClubPM/ChatPage.jsx`.
- **New gotcha section, "Slack portal invariants"**, each one line with its reason:
  1. No admin bypass for private conversations. The rule has no admin input, and static tests guard both access modules.
  2. Private/DM files never go to Drive (`mirrorTargetFor`).
  3. `/uploads/slack` must never be served statically (mount-order test).
  4. Backfill never notifies; pings come only from `events.ts`.
  5. `SLACK_*` notifications are never DM'd back, and our own bot's posts never ping.
  6. HTTP 409 from `/api/chat` means exactly "reconnect Slack".
  7. Any Slack read of a specific conversation goes through `resolveReadClient()`, never the bot token directly.
  8. `ignoreSelf` is off; every reactive Slack handler must guard against bot authors.
  9. Slack user events are delivered once per event, however many members can see it.
  10. `notificationChannels` is now enforced; `slackText` opts a call site in to the DM.

- [ ] **Step 3: End-to-end verification (real workspace, two members A and B, plus one admin C not in the test DM)**

Record pass/fail for each in the PR description:

1. A reconnects Slack. The consent screen lists the new scopes and `/auth/me` shows `slackCapabilities.post: true`.
2. A sends a message from a project Chat tab. It appears in Slack **as A**, with no APP badge, exactly once in Constellation (no duplicate from the echo).
3. A opens `/clubpm/members`, clicks **Message** on B and sends. B receives a Slack DM from A **and** a Constellation notification.
4. B replies **in Slack**. The reply appears live in A's DM panel.
5. B reads A's message **in Slack**. Within 2 min, B's Constellation notification turns read.
6. B opens the DM **in Constellation**. B's Slack unread badge for that DM clears.
7. Group DM of A + B + one more, from the project Members tab.
8. React, un-react, thread reply, edit, delete from Constellation. Each mirrors to Slack, and the deleted message's unread notification disappears for its recipient.
9. Upload an image in a DM. It renders through the proxy in **Brave** (Bearer-only) and in Chrome.
10. **Privacy:** as admin C, `curl -H "Authorization: Bearer <C's token>" $API/api/chat/conversations/<A–B DM id>/messages` → **404**. Also `…/api/chat/files/<that DM's file id>` → 404, and `$API/uploads/slack/<channel>/<file>` → 404.
11. The Monday digest renders as Block Kit with an APP badge in its channel, and creates no Slack notifications.
12. `@channel` in a public channel pings its members in Constellation. Muting that channel in Constellation stops the next one.
13. `/clubpm/chat` lists joined channels with unread badges. **Browse** previews an unjoined public channel, and **Join channel** works.
14. Set "Task assigned to me" to Dashboard only: bell notification, no Slack DM.

- [ ] **Step 4: Final gate + commit**

All backend test files pass:

```
cd backend && for f in src/services/slackScopes.test.ts src/services/slackConversationAccess.test.ts src/services/slackArchivePolicy.test.ts src/services/slackFileService.test.ts src/services/slackReadService.test.ts src/services/slackSendRules.test.ts src/services/slackBlocks.test.ts src/services/slackPings.test.ts src/services/notificationRouting.test.ts src/middleware/conversationAccess.test.ts src/appMountOrder.test.ts src/services/slackUserTokenService.test.ts; do npx tsx $f || exit 1; done
```

Then `npx tsc --noEmit`, and at the root `npm test -- --watchAll=false` and `npm run build`.

```bash
git add backend/src/api/projectChat.ts src/api/clubPmClient.js backend/src/appMountOrder.test.ts backend/src/app.ts CLAUDE.md
git commit -m "chore(slack-portal): remove superseded project chat reads; document portal invariants"
```

Then open the PR against `main`. List every D-numbered decision and the two behavior changes: D3 (private linked channels follow Slack membership) and COMMENT_REPLY gaining a Slack DM. Include the Step 3 results.
