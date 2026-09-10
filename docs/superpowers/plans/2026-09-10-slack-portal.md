# Slack Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> Paste-able per-session prompts: [`2026-09-10-slack-portal-SESSIONS.md`](./2026-09-10-slack-portal-SESSIONS.md).

**Goal:** Make Constellation a two-way portal to the SEARCH Slack workspace — every channel and DM readable (per Slack's own visibility rules), posting/replying/reacting/editing/uploading *as the member*, DMs run from the Members page (club-wide and a per-project version), and every Slack ping mirrored as a Constellation notification with read state synced both ways.

**Architecture:** Builds directly on the read-only archive on `feat/slack-chat-archive` (spec: `docs/superpowers/specs/2026-09-09-slack-chat-archive-design.md`). Ingest widens from "project-linked channels, humans only" to "every conversation any signed-in member or the bot can see", fed by Slack **user events** (delivered once per event across all authorizing users). A mirrored `SlackConversationMember` table becomes the single source of truth for who may read what. A new conversation-scoped API (`/api/chat/*`) serves reads and performs writes with the **member's own user token**, writing each sent message into the archive from Slack's response rather than waiting for the echo. Pings are computed from each ingested message by one pure function and delivered through the existing notification table + SSE stream.

**Tech Stack:** Node 20 / Express / Prisma 6 / PostgreSQL / `@slack/bolt` 4 (Socket Mode) / `@slack/web-api` 7 (`filesUploadV2`) / React 19 / React Router 7 / plain CSS custom properties.

**Branch:** create `feat/slack-portal` from the tip of `feat/slack-chat-archive` (which is not merged yet). Merge the archive branch first if possible; otherwise this branch stacks on it.

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
    return { channelId, convKind, event: "delete", ts, threadTs: gone?.threadTs ?? null, isBot: false, authorSlackId: null, text: "" };
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
    return { channelId, convKind, event: "edit", ts, threadTs, isBot: decision.isBot, authorSlackId: inner.user ?? null, text: inner.text ?? "" };
  }

  const stored = await storeArchivedMessage(channelId, msg, decision.isBot, client, { overwrite: true });
  if (!stored) return null;
  emitChat({ channelId, convKind, ts: stored.ts, threadTs: stored.threadTs, kind: "new" });
  return {
    channelId, convKind, event: "new", ts: stored.ts, threadTs: stored.threadTs,
    isBot: decision.isBot, authorSlackId: msg.user ?? null, text: msg.text ?? "",
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

<!-- PART C -->
