# Slack Chat Archive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a **Chat** tab to the ClubPM project detail page that renders the project's Slack channels from a durable archive, so conversation survives Slack's 90-day free-plan history boundary.

**Architecture:** Slack messages already arrive over Socket Mode at `app.message()`; a new ingest service persists them keyed on `slackChannelId`. Attachments are referenced in Slack while they live there and swept into the club Google Drive before Slack expires them, behind a backend proxy that makes the migration invisible to the UI. Reads are project-scoped, pushed live over the existing SSE stream, and rendered by a read-only React tab.

**Tech Stack:** Node 20 / Express / Prisma / PostgreSQL / `@slack/bolt` (Socket Mode) / `googleapis` Drive v3 / React 19 / plain CSS custom properties.

**Spec:** [`docs/superpowers/specs/2026-09-09-slack-chat-archive-design.md`](../specs/2026-09-09-slack-chat-archive-design.md)

## Global Constraints

- **Direction is Slack → website only.** No composer, no reply box, no reaction buttons. Posting from the web is a later pass.
- **Every API handler reads `req.memberId`, never `req.session`.** Session reads are `undefined` for Bearer-authenticated clients and break them silently. Only `auth.ts` may touch `req.session`.
- **Ingest must never call `memberService.resolveSlackMember()`** — it *creates* `Member` rows, which would add every non-member Slack poster to the club roster and to assignee pickers.
- **Bot messages are never archived.** The decision lives in exactly one exported predicate, `shouldArchive()`.
- **`ChatRichText.jsx` must not emit `<span>` or `<p>`.** `public/clubpm-theme.css:969` is `.clubpm-app p, .clubpm-app span { color: inherit !important }`, which no selector can override. Use `<a>`, `<code>`, `<b>`, `<i>`, `<s>`, `<div>`, `<label>`.
- **Declared CSS tokens only.** Verified present in `:root` at `public/clubpm-theme.css:643-670`: `--pm-bg-base`, `--pm-bg-surface`, `--pm-bg-elevated`, `--pm-bg-overlay`, `--pm-accent-teal`, `--pm-accent-amber`, `--pm-accent-coral`, `--pm-accent-violet`, `--pm-text-primary`, `--pm-text-secondary`, `--pm-text-muted`, `--pm-border`, `--pm-border-active`, `--pm-shadow-card`, `--pm-font-display`, `--pm-font-body`, `--pm-font-mono`. **`--pm-surface` and `--pm-elevated` do NOT exist** despite what `CLAUDE.md` says — the real names carry the `bg-` infix.
- **Drive mirror cutoff is 60 days.** Not 75, not 90.
- **Backend tests are standalone `tsx` scripts**, not Jest. There is no `npm test` in `backend/`. Each test file is run directly: `npx tsx src/services/<name>.test.ts`, uses the inline `check()` harness copied in Task 2, and is excluded from the production build by the `tsconfig` `*.test.ts` exclude.
- **After every task:** `npm run build` at the repo root and `npx tsc --noEmit` in `backend/`. Both must pass before the next task.
- **After Task 1 only:** run `npx prisma generate` before anything else. A stale Prisma client produces phantom `tsc` errors that look like real type bugs in correct code.

---

## File Structure

**Backend — created**

| File | Responsibility |
|---|---|
| `backend/src/services/slackMessageFormat.ts` | Pure. Slack mrkdwn → `SlackToken[]`. No Prisma, no Slack imports. |
| `backend/src/services/slackArchivePolicy.ts` | Pure. `shouldArchive()` — the single ingest filter. |
| `backend/src/services/slackArchiveService.ts` | Ingest: upsert / edit / delete / reactions, author + channel-link caches, SSE emit. |
| `backend/src/services/slackFileService.ts` | Attachment storage state machine: resolve for streaming, mirror one file, nightly sweep, health counts. |
| `backend/src/services/slackBackfillService.ts` | Resumable one-shot history import. |
| `backend/src/middleware/projectChatAccess.ts` | `canRead` + the project's linked `channelIds`. |
| `backend/src/api/projectChat.ts` | All `/api/projects/:projectId/chat/*` routes, including the file proxy. |

**Backend — modified**

| File | Change |
|---|---|
| `backend/prisma/schema.prisma` | 3 models, 3 enums. |
| `backend/src/slack/events.ts` | Call ingest from `app.message`; extend `reaction_added`; add `reaction_removed`. |
| `backend/src/slack/scheduler.ts` | Nightly mirror sweep (03:40) + daily emoji cache refresh (03:50). |
| `backend/src/api/sse.ts` | Subscribe the connecting member to their project channel topics. |
| `backend/src/app.ts` | Mount `projectChatRouter` **before** `projectsRouter`. |
| `slack-manifest.yaml` | `reaction_removed` event, `emoji:read` scope. |

**Frontend — created**

`src/components/clubpm/chat/`: `ChatRichText.jsx`, `ChatFileAttachment.jsx`, `ChatMessage.jsx`, `ChatThreadDrawer.jsx`, `ChatTab.jsx`, plus `src/components/clubpm/SlackArchivePanel.jsx`.

**Frontend — modified**

`src/api/clubPmClient.js`, `src/components/clubpm/NotificationBell.jsx`, `src/pages/ClubPM/ProjectDetail.jsx`, `src/pages/ClubPM/AdminView.jsx`, `src/clubpm/tour/tourAnchors.js`, `docs/courses/ANCHORS.md`, `public/clubpm-theme.css`.

---

## Task 1: Schema and migration

**Files:**
- Modify: `backend/prisma/schema.prisma`

**Interfaces:**
- Consumes: nothing.
- Produces: Prisma models `SlackChannelArchive`, `SlackMessage`, `SlackMessageFile`; enums `SlackBackfillStatus`, `SlackFileStorage`. Compound unique accessor `slackChannelId_ts` for `SlackMessage`.

- [ ] **Step 1: Append the enums and models**

Append to the end of `backend/prisma/schema.prisma`:

```prisma
// ─────────────────────────────────────────────────────────────────────────────
// Slack chat archive
//
// Keyed on slackChannelId, never projectId: getProjectsForChannel() returns an
// ARRAY — one Slack channel can be linked to several projects. Channel-keying
// means both projects render the same conversation, re-linking never duplicates
// history, and unlinking a channel does not orphan its archive.
// Project scoping happens at READ time, by resolving a project's channel ids.
// ─────────────────────────────────────────────────────────────────────────────

enum SlackBackfillStatus {
  NOT_STARTED
  RUNNING
  COMPLETE
  FAILED
}

/// Mixes storage LOCATIONS with OUTCOMES. MIRROR_FAILED still streams from
/// Slack (the copy failed; the file is still there) — see slackFileService.
enum SlackFileStorage {
  SLACK_ONLY
  DRIVE
  LOCAL
  MIRROR_FAILED
  UNAVAILABLE
}

model SlackChannelArchive {
  id               String  @id @default(cuid())
  slackChannelId   String  @unique
  slackChannelName String?
  isPrivate        Boolean @default(false)
  archiveEnabled   Boolean @default(true)

  /// Drive folder holding this channel's mirrored attachments.
  driveFolderId    String?

  backfillStatus   SlackBackfillStatus @default(NOT_STARTED)
  /// Slack ts paginated back to — makes backfill resumable after a crash.
  backfillCursor   String?
  backfillOldestTs String?
  backfillError    String?
  backfilledAt     DateTime?

  lastMessageAt    DateTime?
  messageCount     Int      @default(0)

  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
}

model SlackMessage {
  id              String @id @default(cuid())
  slackChannelId  String
  /// Slack's message ts — the natural key.
  ts              String
  /// Parent ts when this is a reply.
  threadTs        String?
  /// Maintained on the PARENT row; recomputed, never incremented.
  replyCount      Int    @default(0)

  authorSlackId   String?
  /// Null for non-members and deactivated users. Ingest never creates Members.
  memberId        String?
  /// Snapshot of the display name at post time.
  authorName      String
  authorAvatarUrl String?

  /// Raw Slack mrkdwn — the source of truth. Rendered to tokens on read.
  text            String    @db.Text
  editedAt        DateTime?
  /// Tombstone. The row and its files are kept.
  deletedAt       DateTime?
  /// { ":emoji:": { count: number, slackIds: string[] } }
  reactions       Json?

  postedAt        DateTime
  files           SlackMessageFile[]

  @@unique([slackChannelId, ts])
  @@index([slackChannelId, postedAt])
  @@index([threadTs])
  @@index([memberId])
}

model SlackMessageFile {
  id             String       @id @default(cuid())
  messageId      String
  message        SlackMessage @relation(fields: [messageId], references: [id], onDelete: Cascade)

  slackFileId    String  @unique
  name           String
  mimeType       String?
  sizeBytes      Int?
  isImage        Boolean @default(false)
  /// So the UI can reserve layout space without fetching the bytes.
  width          Int?
  height         Int?

  storage        SlackFileStorage @default(SLACK_ONLY)
  driveFileId    String?
  localPath      String?
  mirrorAttempts Int      @default(0)
  mirrorError    String?
  mirroredAt     DateTime?

  /// Denormalized from SlackMessage.postedAt so the nightly sweep is a single
  /// index scan instead of a join.
  postedAt       DateTime

  createdAt      DateTime @default(now())

  @@index([storage, postedAt])
  @@index([messageId])
}
```

- [ ] **Step 2: Create the migration**

```bash
cd backend && npx prisma migrate dev --name slack_chat_archive
```

Expected: a new folder under `backend/prisma/migrations/` and "Your database is now in sync with your schema."

- [ ] **Step 3: Regenerate the Prisma client**

```bash
cd backend && npx prisma generate
```

Expected: "Generated Prisma Client". **Do not skip** — without it every later task sees phantom `tsc` errors about `prisma.slackMessage` not existing.

- [ ] **Step 4: Verify the schema compiles**

```bash
cd backend && npx tsc --noEmit
```

Expected: no output (success).

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(slack-archive): schema for channel archive, messages, and files"
```

---

## Task 2: Pure logic — mrkdwn parser and ingest policy

**Files:**
- Create: `backend/src/services/slackMessageFormat.ts`
- Create: `backend/src/services/slackMessageFormat.test.ts`
- Create: `backend/src/services/slackArchivePolicy.ts`
- Create: `backend/src/services/slackArchivePolicy.test.ts`

**Interfaces:**
- Consumes: nothing (both files are pure — no Prisma, no Slack imports).
- Produces:
  - `type SlackToken` (discriminated union on `type`), `interface FormatContext { memberNames: Record<string,string>; channelNames?: Record<string,string>; emojiUrls?: Record<string,string> }`, `formatSlackText(raw: string, ctx: FormatContext): SlackToken[]`
  - `type ArchiveDecision`, `interface RawSlackMessage`, `shouldArchive(msg: RawSlackMessage, botUserId?: string): ArchiveDecision`

- [ ] **Step 1: Write the failing parser test**

Create `backend/src/services/slackMessageFormat.test.ts`:

```ts
// Pure-logic unit tests for slackMessageFormat. No DB, no Slack.
// Run: cd backend && npx tsx src/services/slackMessageFormat.test.ts
//
// Excluded from the production build (tsconfig `exclude` covers *.test.ts).

import { formatSlackText, type SlackToken } from "./slackMessageFormat.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}
const ctx = {
  memberNames: { U123: "Henry Ewald" },
  channelNames: { C999: "proj-ares" },
  emojiUrls: { rocket_club: "https://emoji.example/rocket.png" },
};

console.log("formatSlackText");
{
  const t = formatSlackText("hello world", ctx);
  check("plain text is one token", t.length === 1 && t[0].type === "text");
  check("plain text value", (t[0] as any).value === "hello world");
}
{
  const t = formatSlackText("hey <@U123> look", ctx);
  check("mention splits into 3", t.length === 3);
  check("mention resolves to display name",
    t[1].type === "mention" && (t[1] as any).label === "Henry Ewald");
}
{
  const t = formatSlackText("hey <@U404> look", ctx);
  check("unknown mention falls back to the id",
    t[1].type === "mention" && (t[1] as any).label === "U404");
}
{
  const t = formatSlackText("see <https://x.dev|the docs>", ctx);
  check("link href", t[1].type === "link" && (t[1] as any).href === "https://x.dev");
  check("link label", (t[1] as any).label === "the docs");
}
{
  const t = formatSlackText("bare <https://x.dev>", ctx);
  check("bare link labels with the url", t[1].type === "link" && (t[1] as any).label === "https://x.dev");
}
{
  const t = formatSlackText("in <#C999|proj-ares> please", ctx);
  check("channel ref", t[1].type === "channel" && (t[1] as any).label === "proj-ares");
}
{
  const t = formatSlackText("run `npm test` now", ctx);
  check("inline code", t[1].type === "code" && (t[1] as any).value === "npm test");
}
{
  const t = formatSlackText("a ```const x = 1;``` b", ctx);
  check("code block", t[1].type === "codeblock" && (t[1] as any).value === "const x = 1;");
}
{
  // An unmatched backtick must not swallow the rest of the message.
  const t = formatSlackText("a `b `c` d", ctx);
  const joined = t.map(x => x.type).join(",");
  check("unmatched backtick degrades to text", joined.includes("code") && t.length >= 3);
  const last = t[t.length - 1];
  check("text after an unmatched backtick survives",
    last.type === "text" && String((last as any).value).includes("d"));
}
{
  // Angle parsing must happen BEFORE entity unescaping, or &lt; becomes a
  // fake tag and the message is mangled.
  const t = formatSlackText("5 &lt; 10 &amp;&amp; ok", ctx);
  check("entities unescape after angle parsing",
    t.length === 1 && (t[0] as any).value === "5 < 10 && ok");
}
{
  const t = formatSlackText(":rocket_club:", ctx);
  check("emoji-only message is one token", t.length === 1 && t[0].type === "emoji");
  check("custom emoji resolves a url",
    (t[0] as any).url === "https://emoji.example/rocket.png");
}
{
  const t = formatSlackText(":unknown_emoji:", ctx);
  check("unknown emoji has no url", t[0].type === "emoji" && (t[0] as any).url === undefined);
}
{
  const t = formatSlackText("a < b > c", ctx);
  check("malformed angles stay text", t.every((x: SlackToken) => x.type === "text"));
}
{
  check("empty string yields no tokens", formatSlackText("", ctx).length === 0);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd backend && npx tsx src/services/slackMessageFormat.test.ts
```

Expected: FAIL — `Cannot find module './slackMessageFormat.js'`.

- [ ] **Step 3: Implement the parser**

Create `backend/src/services/slackMessageFormat.ts`:

```ts
/**
 * Slack mrkdwn → token array. Pure: no Prisma, no Slack client, no I/O.
 *
 * Called on READ, not on ingest. SlackMessage.text stores the raw mrkdwn as the
 * source of truth, so improving this parser never requires backfilling stored
 * rows, and a member who renames themselves renders correctly retroactively.
 */

export type SlackToken =
  | { type: "text"; value: string }
  | { type: "mention"; slackId: string; label: string }
  | { type: "channel"; slackId: string; label: string }
  | { type: "link"; href: string; label: string }
  | { type: "code"; value: string }
  | { type: "codeblock"; value: string }
  | { type: "emoji"; name: string; url?: string };

export interface FormatContext {
  /** slackId → display name, for <@U123> resolution. */
  memberNames: Record<string, string>;
  channelNames?: Record<string, string>;
  /** Custom emoji name → image url, from the cached emoji.list. */
  emojiUrls?: Record<string, string>;
}

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">" };

/**
 * Slack escapes &, < and > in message text. This MUST run after angle parsing:
 * unescaping first would turn a literal "&lt;" into "<" and the tokenizer would
 * then read it as the start of a tag.
 */
function unescapeSlack(s: string): string {
  return s.replace(/&(amp|lt|gt);/g, (m) => ENTITIES[m] ?? m);
}

/**
 * Split on a paired delimiter (``` or `). With an odd number of delimiters the
 * last one is unmatched: everything after it is plain text with the delimiter
 * restored, so a stray backtick can never swallow the rest of a message.
 */
function splitPaired(s: string, delim: string): { text: string; delimited: boolean }[] {
  const parts = s.split(delim);
  const delimCount = parts.length - 1;
  const lastPaired = delimCount - (delimCount % 2);
  return parts.map((text, i) => {
    if (i % 2 === 1 && i <= lastPaired) return { text, delimited: true };
    return { text: i > lastPaired && i > 0 ? delim + text : text, delimited: false };
  });
}

function splitOnce(s: string, sep: string): [string, string | undefined] {
  const i = s.indexOf(sep);
  return i === -1 ? [s, undefined] : [s.slice(0, i), s.slice(i + 1)];
}

/** One <...> entity: <@U123|label>, <#C123|name>, <!here>, <url|label>. */
function parseAngle(body: string, ctx: FormatContext): SlackToken {
  const [target, label] = splitOnce(body, "|");

  if (target.startsWith("@")) {
    const slackId = target.slice(1);
    return { type: "mention", slackId, label: label || ctx.memberNames[slackId] || slackId };
  }
  if (target.startsWith("#")) {
    const slackId = target.slice(1);
    return { type: "channel", slackId, label: label || ctx.channelNames?.[slackId] || slackId };
  }
  if (target.startsWith("!")) {
    // Broadcast pseudo-mentions: <!here>, <!channel>, <!everyone>.
    return { type: "mention", slackId: target, label: label || `@${target.slice(1)}` };
  }
  const href = unescapeSlack(target);
  return { type: "link", href, label: label ? unescapeSlack(label) : href };
}

/** :emoji: within a run of plain text. */
function tokenizeEmoji(text: string, ctx: FormatContext): SlackToken[] {
  const out: SlackToken[] = [];
  let last = 0;
  for (const m of text.matchAll(/:([a-z0-9_+'-]+):/g)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ type: "text", value: unescapeSlack(text.slice(last, at)) });
    out.push({ type: "emoji", name: m[1], url: ctx.emojiUrls?.[m[1]] });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ type: "text", value: unescapeSlack(text.slice(last)) });
  return out;
}

/** A non-code run: <...> entities first, then emoji in what's left. */
function tokenizePlain(seg: string, ctx: FormatContext): SlackToken[] {
  const out: SlackToken[] = [];
  let last = 0;
  for (const m of seg.matchAll(/<([^<>]+)>/g)) {
    const at = m.index ?? 0;
    if (at > last) out.push(...tokenizeEmoji(seg.slice(last, at), ctx));
    out.push(parseAngle(m[1], ctx));
    last = at + m[0].length;
  }
  if (last < seg.length) out.push(...tokenizeEmoji(seg.slice(last), ctx));
  return out;
}

/** Collapse consecutive text tokens and drop empty ones. */
function mergeText(tokens: SlackToken[]): SlackToken[] {
  const out: SlackToken[] = [];
  for (const t of tokens) {
    if (t.type !== "text") { out.push(t); continue; }
    if (t.value === "") continue;
    const prev = out[out.length - 1];
    if (prev && prev.type === "text") prev.value += t.value;
    else out.push({ ...t });
  }
  return out;
}

export function formatSlackText(raw: string, ctx: FormatContext): SlackToken[] {
  if (!raw) return [];
  const tokens: SlackToken[] = [];

  for (const fence of splitPaired(raw, "```")) {
    if (fence.delimited) {
      tokens.push({ type: "codeblock", value: unescapeSlack(fence.text.replace(/^\n/, "").replace(/\n$/, "")) });
      continue;
    }
    for (const inline of splitPaired(fence.text, "`")) {
      if (inline.delimited) tokens.push({ type: "code", value: unescapeSlack(inline.text) });
      else tokens.push(...tokenizePlain(inline.text, ctx));
    }
  }

  return mergeText(tokens);
}
```

- [ ] **Step 4: Run the parser test to verify it passes**

```bash
cd backend && npx tsx src/services/slackMessageFormat.test.ts
```

Expected: `15 passed, 0 failed`.

- [ ] **Step 5: Write the failing policy test**

Create `backend/src/services/slackArchivePolicy.test.ts`:

```ts
// Pure-logic unit tests for slackArchivePolicy. No DB, no Slack.
// Run: cd backend && npx tsx src/services/slackArchivePolicy.test.ts

import { shouldArchive } from "./slackArchivePolicy.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}
const BOT = "U0BOTBOT";

console.log("shouldArchive");
{
  const d = shouldArchive({ user: "U1", text: "hello", ts: "1.0" }, BOT);
  check("plain human message is archived", d.archive === true && (d as any).kind === "new");
}
{
  // The whole reason this predicate exists: bot text can look human.
  const d = shouldArchive({ bot_id: "B123", text: "Standup time!", ts: "1.0" }, BOT);
  check("bot_id is skipped", d.archive === false && (d as any).reason === "bot");
}
{
  const d = shouldArchive({ user: BOT, text: "hi", ts: "1.0" }, BOT);
  check("our own bot user is skipped", d.archive === false && (d as any).reason === "bot");
}
{
  const d = shouldArchive({ subtype: "channel_join", user: "U1", text: "joined", ts: "1.0" }, BOT);
  check("channel_join is housekeeping", d.archive === false && (d as any).reason === "housekeeping");
}
{
  const d = shouldArchive({ subtype: "channel_topic", user: "U1", text: "set topic", ts: "1.0" }, BOT);
  check("channel_topic is housekeeping", d.archive === false && (d as any).reason === "housekeeping");
}
{
  // Text is empty but a screenshot was shared — this is NOT an empty message.
  const d = shouldArchive({ subtype: "file_share", user: "U1", text: "", ts: "1.0", files: [{ id: "F1" }] }, BOT);
  check("file_share with no text is archived", d.archive === true && (d as any).kind === "new");
}
{
  const d = shouldArchive({ user: "U1", text: "", ts: "1.0" }, BOT);
  check("no text and no files is empty", d.archive === false && (d as any).reason === "empty");
}
{
  const d = shouldArchive({ subtype: "thread_broadcast", user: "U1", text: "also here", ts: "2.0", thread_ts: "1.0" }, BOT);
  check("thread_broadcast is archived", d.archive === true && (d as any).kind === "new");
}
{
  const d = shouldArchive({ subtype: "message_changed", message: { user: "U1", text: "edited", ts: "1.0" } }, BOT);
  check("message_changed is an edit", d.archive === true && (d as any).kind === "edit");
}
{
  // The bot_id lives on the INNER message for edits, not the outer envelope.
  const d = shouldArchive({ subtype: "message_changed", message: { bot_id: "B1", text: "x", ts: "1.0" } }, BOT);
  check("edited bot message is still skipped", d.archive === false && (d as any).reason === "bot");
}
{
  const d = shouldArchive({ subtype: "message_deleted", deleted_ts: "1.0" }, BOT);
  check("message_deleted is a delete", d.archive === true && (d as any).kind === "delete");
}
{
  const d = shouldArchive({ subtype: "message_replied", user: "U1", text: "x", ts: "1.0" }, BOT);
  check("unknown subtype is skipped", d.archive === false && (d as any).reason === "unsupported_subtype");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 6: Run it to verify it fails**

```bash
cd backend && npx tsx src/services/slackArchivePolicy.test.ts
```

Expected: FAIL — `Cannot find module './slackArchivePolicy.js'`.

- [ ] **Step 7: Implement the policy**

Create `backend/src/services/slackArchivePolicy.ts`:

```ts
/**
 * The single ingest filter for the Slack archive. Pure: no Prisma, no Slack.
 *
 * Bot messages are not archived. That policy lives here, in one predicate,
 * rather than scattered through the event handler — so flipping it later
 * ("store bot messages, render collapsed") is a one-function change.
 * Note the tradeoff: a bot message skipped at ingest is unrecoverable once it
 * passes Slack's retention boundary.
 */

export type ArchiveDecision =
  | { archive: false; reason: "bot" | "housekeeping" | "empty" | "unsupported_subtype" }
  | { archive: true; kind: "new" | "edit" | "delete" };

export interface RawSlackMessage {
  subtype?: string;
  bot_id?: string;
  user?: string;
  text?: string;
  ts?: string;
  thread_ts?: string;
  files?: unknown[];
  /** message_changed carries the new message here. */
  message?: { text?: string; user?: string; bot_id?: string; ts?: string; thread_ts?: string };
  previous_message?: { ts?: string };
  /** message_deleted carries the target ts here. */
  deleted_ts?: string;
}

/** Membership and channel-config noise Slack delivers as messages. */
const HOUSEKEEPING = new Set([
  "channel_join", "channel_leave", "channel_topic", "channel_purpose",
  "channel_name", "channel_archive", "channel_unarchive", "channel_posting_permissions",
  "group_join", "group_leave", "group_topic", "group_purpose", "group_name",
  "pinned_item", "unpinned_item", "bot_message", "bot_add", "bot_remove",
  "reminder_add", "tombstone", "huddle_thread",
]);

/** Subtypes that carry real, archivable content. */
const CONTENT_SUBTYPES = new Set([undefined as unknown as string, "file_share", "thread_broadcast"]);

const BOT = { archive: false, reason: "bot" } as const;

export function shouldArchive(msg: RawSlackMessage, botUserId?: string): ArchiveDecision {
  // Deletes first: they carry no user, no text, and no subtype we can inspect.
  // Applying a delete for a ts we never stored updates zero rows, which is safe,
  // so there is no need to know whether the original was a bot message.
  if (msg.subtype === "message_deleted") return { archive: true, kind: "delete" };

  // Edits next: the authorship fields live on the INNER message, so an edited
  // bot message has no bot_id on the outer envelope.
  if (msg.subtype === "message_changed") {
    const inner = msg.message;
    if (!inner) return { archive: false, reason: "unsupported_subtype" };
    if (inner.bot_id || (botUserId && inner.user === botUserId)) return BOT;
    return { archive: true, kind: "edit" };
  }

  if (msg.bot_id) return BOT;
  if (botUserId && msg.user === botUserId) return BOT;
  if (msg.subtype && HOUSEKEEPING.has(msg.subtype)) return { archive: false, reason: "housekeeping" };
  if (!CONTENT_SUBTYPES.has(msg.subtype as string)) return { archive: false, reason: "unsupported_subtype" };

  const hasText = !!msg.text && msg.text.trim().length > 0;
  const hasFiles = Array.isArray(msg.files) && msg.files.length > 0;
  if (!hasText && !hasFiles) return { archive: false, reason: "empty" };

  return { archive: true, kind: "new" };
}
```

- [ ] **Step 8: Run the policy test to verify it passes**

```bash
cd backend && npx tsx src/services/slackArchivePolicy.test.ts
```

Expected: `12 passed, 0 failed`.

- [ ] **Step 9: Typecheck and commit**

```bash
cd backend && npx tsc --noEmit
git add backend/src/services/slackMessageFormat.ts backend/src/services/slackMessageFormat.test.ts backend/src/services/slackArchivePolicy.ts backend/src/services/slackArchivePolicy.test.ts
git commit -m "feat(slack-archive): pure mrkdwn parser and ingest policy with tests"
```

---

## Task 3: Ingest service and Slack event wiring

**Files:**
- Create: `backend/src/services/slackArchiveService.ts`
- Modify: `backend/src/slack/events.ts` (`app.message` at :244, `reaction_added` at :271; add `reaction_removed`)
- Modify: `slack-manifest.yaml`

**Interfaces:**
- Consumes: `shouldArchive`, `RawSlackMessage` (Task 2); `activityBus` from `./activityService.js`; `getBotUserId(client)` from `./memberService.js`.
- Produces:
  - `ingestSlackMessage(msg: RawSlackMessage & { channel?: string }, client: WebClient): Promise<void>`
  - `applyReaction(channelId: string, ts: string, emoji: string, slackId: string, added: boolean): Promise<void>`
  - `isArchivedChannel(channelId: string): Promise<boolean>`
  - `ensureChannelArchive(channelId: string, client: WebClient): Promise<{ id: string; slackChannelName: string | null }>`
  - `resolveAuthor(slackId: string, client: WebClient): Promise<{ authorName: string; authorAvatarUrl: string | null; memberId: string | null }>`
  - SSE topic string: `` `slack-chat:${slackChannelId}` ``

- [ ] **Step 1: Create the ingest service**

Create `backend/src/services/slackArchiveService.ts`:

```ts
import type { WebClient } from "@slack/web-api";
import { prisma } from "../db/prisma.js";
import { activityBus } from "./activityService.js";
import { shouldArchive, type RawSlackMessage } from "./slackArchivePolicy.js";
import { getBotUserId } from "./memberService.js";

// ── Caches ───────────────────────────────────────────────────
// Ingest runs on every message in every channel the bot is in, so both of these
// hot paths are cached rather than hitting Postgres/Slack per message.

const LINK_TTL_MS = 5 * 60_000;
const AUTHOR_TTL_MS = 30 * 60_000;

const linkCache = new Map<string, { linked: boolean; at: number }>();
type Author = { authorName: string; authorAvatarUrl: string | null; memberId: string | null };
const authorCache = new Map<string, Author & { at: number }>();

/** Test seam + a way for the channel picker to invalidate after a link change. */
export function clearSlackArchiveCaches(): void {
  linkCache.clear();
  authorCache.clear();
}

/**
 * Is this channel linked to a project? Scope is "project-linked channels only",
 * and a channel is linked either through a notification target (primary) or the
 * legacy Project.slackChannelId / slackChannel fields.
 */
export async function isArchivedChannel(channelId: string): Promise<boolean> {
  const hit = linkCache.get(channelId);
  if (hit && Date.now() - hit.at < LINK_TTL_MS) return hit.linked;

  const [target, legacy] = await Promise.all([
    prisma.projectNotificationTarget.findFirst({
      where: { slackChannelId: channelId },
      select: { id: true },
    }),
    prisma.project.findFirst({
      where: { OR: [{ slackChannelId: channelId }, { slackChannel: channelId }] },
      select: { id: true },
    }),
  ]);

  const linked = !!(target || legacy);
  linkCache.set(channelId, { linked, at: Date.now() });
  return linked;
}

/**
 * Resolve a Slack user to a display name + avatar, WITHOUT creating a Member.
 *
 * memberService.resolveSlackMember() creates a Member row when one is missing.
 * That is correct for member_joined_channel and wrong here: archiving a message
 * from a guest or a non-member would silently add them to the club roster,
 * where they would then show up in assignee pickers.
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

/** Find or create the per-channel archive row, refreshing its cached name. */
export async function ensureChannelArchive(
  channelId: string,
  client: WebClient
): Promise<{ id: string; slackChannelName: string | null }> {
  const existing = await prisma.slackChannelArchive.findUnique({
    where: { slackChannelId: channelId },
    select: { id: true, slackChannelName: true },
  });
  if (existing) return existing;

  let name: string | null = null;
  let isPrivate = false;
  try {
    const info = await client.conversations.info({ channel: channelId });
    name = (info.channel as { name?: string } | undefined)?.name ?? null;
    isPrivate = !!(info.channel as { is_private?: boolean } | undefined)?.is_private;
  } catch {
    // Missing scope or archived channel — the row is still worth creating.
  }

  return prisma.slackChannelArchive.create({
    data: { slackChannelId: channelId, slackChannelName: name, isPrivate },
    select: { id: true, slackChannelName: true },
  });
}

/** Slack ts ("1725900000.001200") → Date. */
function tsToDate(ts: string): Date {
  return new Date(Math.round(parseFloat(ts) * 1000));
}

type SlackFilePayload = {
  id?: string;
  name?: string;
  title?: string;
  mimetype?: string;
  size?: number;
  original_w?: number;
  original_h?: number;
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
      // undo a completed Drive mirror.
      update: { name: f.name || f.title || f.id, mimeType: f.mimetype ?? null },
    });
  }
}

/**
 * Recompute (never increment) the parent's reply count. Live ingest and backfill
 * can both touch the same parent, so this has to be idempotent under replay.
 */
async function refreshReplyCount(slackChannelId: string, threadTs: string): Promise<void> {
  const count = await prisma.slackMessage.count({
    where: { slackChannelId, threadTs, deletedAt: null, NOT: { ts: threadTs } },
  });
  await prisma.slackMessage.updateMany({
    where: { slackChannelId, ts: threadTs },
    data: { replyCount: count },
  });
}

/**
 * Persist one Slack message event. Safe to call for every message in every
 * channel — it returns early for unlinked channels and filtered messages.
 */
export async function ingestSlackMessage(
  msg: RawSlackMessage & { channel?: string },
  client: WebClient
): Promise<void> {
  const channelId = msg.channel;
  if (!channelId) return;
  if (!(await isArchivedChannel(channelId))) return;

  const botUserId = (await getBotUserId(client)) ?? undefined;
  const decision = shouldArchive(msg, botUserId);
  if (!decision.archive) return;

  if (decision.kind === "delete") {
    const ts = msg.deleted_ts || msg.previous_message?.ts;
    if (!ts) return;
    await prisma.slackMessage.updateMany({
      where: { slackChannelId: channelId, ts },
      data: { deletedAt: new Date() },
    });
    activityBus.emit(`slack-chat:${channelId}`, { channelId, ts, kind: "delete" });
    return;
  }

  if (decision.kind === "edit") {
    const inner = msg.message!;
    if (!inner.ts) return;
    await prisma.slackMessage.updateMany({
      where: { slackChannelId: channelId, ts: inner.ts },
      data: { text: inner.text ?? "", editedAt: new Date() },
    });
    activityBus.emit(`slack-chat:${channelId}`, { channelId, ts: inner.ts, kind: "edit" });
    return;
  }

  const ts = msg.ts;
  if (!ts) return;

  await ensureChannelArchive(channelId, client);
  const author = msg.user
    ? await resolveAuthor(msg.user, client)
    : { authorName: "Unknown", authorAvatarUrl: null, memberId: null };
  const postedAt = tsToDate(ts);
  const threadTs = msg.thread_ts && msg.thread_ts !== ts ? msg.thread_ts : null;

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
    },
    update: { text: msg.text ?? "" },
    select: { id: true },
  });

  if (Array.isArray(msg.files) && msg.files.length > 0) {
    await upsertFiles(row.id, postedAt, msg.files);
  }
  if (threadTs) await refreshReplyCount(channelId, threadTs);

  await prisma.slackChannelArchive.update({
    where: { slackChannelId: channelId },
    data: {
      lastMessageAt: postedAt,
      messageCount: await prisma.slackMessage.count({ where: { slackChannelId: channelId } }),
    },
  });

  activityBus.emit(`slack-chat:${channelId}`, { channelId, ts, threadTs, kind: "new" });
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
  if (!(await isArchivedChannel(channelId))) return;

  const row = await prisma.slackMessage.findUnique({
    where: { slackChannelId_ts: { slackChannelId: channelId, ts } },
    select: { id: true, reactions: true },
  });
  if (!row) return; // never archived (e.g. a bot message) — nothing to react to

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
  activityBus.emit(`slack-chat:${channelId}`, { channelId, ts, kind: "reaction" });
}
```

- [ ] **Step 2: Wire ingest into `app.message`**

In `backend/src/slack/events.ts`, add to the imports at the top:

```ts
import { ingestSlackMessage, applyReaction } from "../services/slackArchiveService.js";
```

Then replace the whole `app.message(async ({ message, say }) => { ... });` block (starting at line 244) with:

```ts
  // ── Message: archive + auto-detect TODO/ACTION ────────────
  // The archive call runs FIRST and in its own try/catch. The two concerns get
  // independent error boundaries in both directions: an archive bug must not
  // break the TODO prompt that works today, and a failure in the TODO logic
  // must not lose a message from the archive.
  app.message(async ({ message, say, client }) => {
    try {
      await ingestSlackMessage(message as never, client);
    } catch (error) {
      console.error("[slackArchive] ingest failed:", error);
    }

    try {
      // Only handle regular user messages with text
      if (message.subtype) return;
      if (!("text" in message) || !message.text) return;

      const text = message.text.trim();

      // Check for TODO: or ACTION: prefix
      if (/^(TODO|ACTION):/i.test(text)) {
        // Check if this channel is linked to a project
        const project = await getProjectByChannel(message.channel);
        if (!project) return; // Not a project channel, ignore

        const threadTs = "ts" in message ? message.ts : undefined;
        await say({
          ...(threadTs ? { thread_ts: threadTs } : {}),
          blocks: buildTodoPrompt(text),
          text: "Would you like to turn this into a task?",
        });
      }
    } catch (error) {
      console.error("Message event error:", error);
    }
  });
```

- [ ] **Step 3: Record reactions**

In the same file, inside the existing `app.event("reaction_added", ...)` handler, insert immediately after the `const { channel, ts } = event.item as { channel: string; ts: string };` line (currently line 275):

```ts
      // Mirror the reaction into the archive before the clipboard/✅ flows below.
      try {
        await applyReaction(channel, ts, `:${event.reaction}:`, event.user, true);
      } catch (error) {
        console.error("[slackArchive] reaction_added failed:", error);
      }
```

Then add a new handler directly after the closing `});` of the `reaction_added` handler:

```ts
  // ── Reaction Removed: keep the archive in sync ────────────
  app.event("reaction_removed", async ({ event }) => {
    try {
      if (event.item.type !== "message") return;
      const { channel, ts } = event.item as { channel: string; ts: string };
      await applyReaction(channel, ts, `:${event.reaction}:`, event.user, false);
    } catch (error) {
      console.error("reaction_removed event error:", error);
    }
  });
```

- [ ] **Step 4: Update the Slack manifest**

In `slack-manifest.yaml`, add `emoji:read` to `oauth_config.scopes.bot` (after `files:read`):

```yaml
      - files:read
      - emoji:read
```

And add `reaction_removed` to `settings.event_subscriptions.bot_events` (after `reaction_added`):

```yaml
      - reaction_added
      - reaction_removed
```

- [ ] **Step 5: Typecheck**

```bash
cd backend && npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/slackArchiveService.ts backend/src/slack/events.ts slack-manifest.yaml
git commit -m "feat(slack-archive): ingest messages, edits, deletes, and reactions"
```

- [ ] **Step 7: Reinstall the Slack app (manual, one time)**

The manifest changes need a reinstall to take effect. In the Slack app config: **App Manifest** → paste the updated YAML → **Save**, then **Install App** → **Reinstall to Workspace**. Until this is done, `reaction_removed` events never arrive and `emoji.list` returns `missing_scope`; everything else in this plan works regardless.

---

## Task 4: Access control and read API

**Files:**
- Create: `backend/src/middleware/projectChatAccess.ts`
- Create: `backend/src/middleware/projectChatAccess.test.ts`
- Create: `backend/src/api/projectChat.ts`
- Modify: `backend/src/app.ts` (mount at line ~129)

**Interfaces:**
- Consumes: `formatSlackText`, `FormatContext` (Task 2); Prisma models (Task 1).
- Produces:
  - `unionChannelIds(targets: { slackChannelId: string｜null }[], project: { slackChannelId: string｜null; slackChannel: string｜null }): string[]` — pure
  - `getProjectChatAccess(memberId: string, projectId: string): Promise<{ canRead: boolean; isAdmin: boolean; channelIds: string[] }>`
  - `requireProjectChatRead(req, res, next)` — sets `req.chatChannelIds: string[]` and `req.chatIsAdmin: boolean`
  - `projectChatRouter` (Express Router), mounted at `/api/projects`
  - Wire JSON shape `ChatMessageDto` consumed by Tasks 8–10:
    ```ts
    { id, ts, threadTs, replyCount, authorName, authorAvatarUrl, memberId,
      tokens: SlackToken[], editedAt, deletedAt, postedAt,
      reactions: { emoji: string; count: number }[],
      files: { id, name, mimeType, sizeBytes, isImage, width, height, storage }[] }
    ```
    (`id` is the **Slack** file id, not the row id — it is what `chatFileUrl()` and the proxy route take.)

- [ ] **Step 1: Write the failing channel-union test**

The channel-id union is the part of access control that leaks data if it is
wrong, and it is pure — so it is extracted and tested directly. The `canRead`
boolean itself is a two-line admin-or-member check against Prisma and is covered
by manual verification step 9.

Create `backend/src/middleware/projectChatAccess.test.ts`:

```ts
// Pure-logic unit tests for the chat channel-id union. No DB.
// Run: cd backend && npx tsx src/middleware/projectChatAccess.test.ts

import { unionChannelIds } from "./projectChatAccess.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}
const noProject = { slackChannelId: null, slackChannel: null };

console.log("unionChannelIds");
{
  const ids = unionChannelIds([{ slackChannelId: "C1" }, { slackChannelId: "C2" }], noProject);
  check("collects notification targets", ids.length === 2 && ids.includes("C1") && ids.includes("C2"));
}
{
  const ids = unionChannelIds([], { slackChannelId: "C9", slackChannel: null });
  check("includes the legacy slackChannelId", ids.length === 1 && ids[0] === "C9");
}
{
  // The legacy column sometimes holds a channel NAME, which is not an id and
  // must never be treated as one — it would silently widen the read scope.
  const ids = unionChannelIds([], { slackChannelId: null, slackChannel: "proj-ares" });
  check("a legacy channel NAME is not treated as an id", ids.length === 0);
}
{
  const ids = unionChannelIds([], { slackChannelId: null, slackChannel: "C7ABC123" });
  check("a legacy raw id IS accepted", ids.length === 1 && ids[0] === "C7ABC123");
}
{
  const ids = unionChannelIds([], { slackChannelId: null, slackChannel: "GPRIVATE1" });
  check("private-channel ids (G prefix) are accepted", ids.length === 1);
}
{
  const ids = unionChannelIds([{ slackChannelId: "C1" }], { slackChannelId: "C1", slackChannel: "C1" });
  check("the same id from all three sources dedupes", ids.length === 1);
}
{
  check("no links at all yields nothing", unionChannelIds([], noProject).length === 0);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd backend && npx tsx src/middleware/projectChatAccess.test.ts
```

Expected: FAIL — `Cannot find module './projectChatAccess.js'`.

- [ ] **Step 3: Create the access middleware**

Create `backend/src/middleware/projectChatAccess.ts`:

```ts
import type { Request, Response, NextFunction } from "express";
import { prisma } from "../db/prisma.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      chatChannelIds?: string[];
      chatIsAdmin?: boolean;
    }
  }
}

/**
 * Union the channel ids a project is linked through. Pure, and separated out
 * because this is the part that leaks another project's conversation if it is
 * wrong.
 *
 * The legacy `Project.slackChannel` column holds a channel NAME in some rows and
 * a raw id in others, so it is admitted only when it looks like an id
 * (C… public, G… private). Treating a name as an id would widen the read scope.
 */
export function unionChannelIds(
  targets: { slackChannelId: string | null }[],
  project: { slackChannelId: string | null; slackChannel: string | null }
): string[] {
  const ids = new Set<string>();
  for (const t of targets) if (t.slackChannelId) ids.add(t.slackChannelId);
  if (project.slackChannelId) ids.add(project.slackChannelId);
  if (project.slackChannel && /^[CG][A-Z0-9]+$/.test(project.slackChannel)) {
    ids.add(project.slackChannel);
  }
  return [...ids];
}

/**
 * Read access to a project's Slack archive: admin OR project member.
 *
 * Returns the project's linked channel ids from the SAME call, so every read
 * route is scoped by construction and cannot accidentally serve another
 * project's channel. Channels are linked either via notification targets
 * (primary) or the legacy Project.slackChannelId / slackChannel fields.
 */
export async function getProjectChatAccess(
  memberId: string,
  projectId: string
): Promise<{ canRead: boolean; isAdmin: boolean; channelIds: string[] }> {
  const [member, project, membership, targets] = await Promise.all([
    prisma.member.findUnique({ where: { id: memberId }, select: { isAdmin: true } }),
    prisma.project.findUnique({
      where: { id: projectId },
      select: { slackChannelId: true, slackChannel: true },
    }),
    prisma.projectMember.findFirst({ where: { projectId, memberId }, select: { id: true } }),
    prisma.projectNotificationTarget.findMany({
      where: { projectId },
      select: { slackChannelId: true },
    }),
  ]);

  if (!project) return { canRead: false, isAdmin: false, channelIds: [] };

  const isAdmin = member?.isAdmin ?? false;
  const canRead = isAdmin || !!membership;

  return { canRead, isAdmin, channelIds: unionChannelIds(targets, project) };
}

export async function requireProjectChatRead(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const projectId = req.params.projectId as string;
  const { canRead, isAdmin, channelIds } = await getProjectChatAccess(req.memberId!, projectId);
  if (!canRead) {
    res.status(403).json({ error: "You do not have access to this project's chat" });
    return;
  }
  req.chatChannelIds = channelIds;
  req.chatIsAdmin = isAdmin;
  next();
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd backend && npx tsx src/middleware/projectChatAccess.test.ts
```

Expected: `7 passed, 0 failed`.

- [ ] **Step 5: Create the read routes**

Create `backend/src/api/projectChat.ts`:

```ts
import { Router, type Request, type Response } from "express";
import { requireAuth } from "./auth.js";
import { requireProjectChatRead } from "../middleware/projectChatAccess.js";
import { prisma } from "../db/prisma.js";
import { formatSlackText, type FormatContext } from "../services/slackMessageFormat.js";

export const projectChatRouter = Router();

const PAGE_SIZE = 50;

/** Reject a channelId that isn't one of the project's own. */
function requestedChannel(req: Request): string | null {
  const wanted = typeof req.query.channelId === "string" ? req.query.channelId : null;
  const allowed = req.chatChannelIds ?? [];
  if (wanted) return allowed.includes(wanted) ? wanted : null;
  return allowed[0] ?? null;
}

/**
 * Build the mention/emoji lookup for a page of messages. One query per page
 * rather than one per message — the reason this project parses on read.
 */
async function buildFormatContext(): Promise<FormatContext> {
  const members = await prisma.member.findMany({
    where: { slackId: { not: null } },
    select: { slackId: true, displayName: true },
  });
  const memberNames: Record<string, string> = {};
  for (const m of members) if (m.slackId) memberNames[m.slackId] = m.displayName;

  const { getCustomEmoji } = await import("../services/slackFileService.js");
  return { memberNames, emojiUrls: await getCustomEmoji() };
}

type MessageRow = Awaited<ReturnType<typeof loadMessages>>[number];

async function loadMessages(where: Record<string, unknown>, take: number, asc = false) {
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

function toDto(row: MessageRow, ctx: FormatContext) {
  const reactions = (row.reactions as Record<string, { count: number }> | null) ?? {};
  return {
    id: row.id,
    ts: row.ts,
    threadTs: row.threadTs,
    replyCount: row.replyCount,
    authorName: row.authorName,
    authorAvatarUrl: row.authorAvatarUrl,
    memberId: row.memberId,
    tokens: row.deletedAt ? [] : formatSlackText(row.text, ctx),
    editedAt: row.editedAt,
    deletedAt: row.deletedAt,
    postedAt: row.postedAt,
    reactions: Object.entries(reactions).map(([emoji, v]) => ({ emoji, count: v.count })),
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

// ── GET /api/projects/:projectId/chat/channels ───────────────
projectChatRouter.get(
  "/:projectId/chat/channels",
  requireAuth,
  requireProjectChatRead,
  async (req: Request, res: Response) => {
    try {
      const ids = req.chatChannelIds ?? [];
      const archives = await prisma.slackChannelArchive.findMany({
        where: { slackChannelId: { in: ids } },
      });
      const byId = new Map(archives.map((a) => [a.slackChannelId, a]));

      res.json({
        channels: ids.map((id) => {
          const a = byId.get(id);
          return {
            slackChannelId: id,
            name: a?.slackChannelName ?? id,
            isPrivate: a?.isPrivate ?? false,
            messageCount: a?.messageCount ?? 0,
            lastMessageAt: a?.lastMessageAt ?? null,
            backfillStatus: a?.backfillStatus ?? "NOT_STARTED",
            archived: !!a,
          };
        }),
        isAdmin: !!req.chatIsAdmin,
      });
    } catch (error) {
      console.error("chat/channels error:", error);
      res.status(500).json({ error: "Failed to list chat channels" });
    }
  }
);

// ── GET /api/projects/:projectId/chat/messages ───────────────
// Reverse-chronological page of TOP-LEVEL messages. `before` is a Slack ts.
projectChatRouter.get(
  "/:projectId/chat/messages",
  requireAuth,
  requireProjectChatRead,
  async (req: Request, res: Response) => {
    try {
      const channelId = requestedChannel(req);
      if (!channelId) { res.json({ messages: [], hasMore: false, channelId: null }); return; }

      const before = typeof req.query.before === "string" ? req.query.before : null;
      const where: Record<string, unknown> = { slackChannelId: channelId, threadTs: null };
      if (before) where.postedAt = { lt: new Date(Math.round(parseFloat(before) * 1000)) };

      const rows = await loadMessages(where, PAGE_SIZE + 1);
      const hasMore = rows.length > PAGE_SIZE;
      const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
      const ctx = await buildFormatContext();

      // Oldest-first for rendering; the client prepends older pages.
      res.json({
        channelId,
        hasMore,
        messages: page.map((r) => toDto(r, ctx)).reverse(),
      });
    } catch (error) {
      console.error("chat/messages error:", error);
      res.status(500).json({ error: "Failed to load messages" });
    }
  }
);

// ── GET /api/projects/:projectId/chat/thread/:ts ─────────────
projectChatRouter.get(
  "/:projectId/chat/thread/:ts",
  requireAuth,
  requireProjectChatRead,
  async (req: Request, res: Response) => {
    try {
      const channelId = requestedChannel(req);
      if (!channelId) { res.status(404).json({ error: "No channel" }); return; }

      const ts = req.params.ts as string;
      const rows = await loadMessages(
        { slackChannelId: channelId, OR: [{ ts }, { threadTs: ts }] },
        200,
        true
      );
      const ctx = await buildFormatContext();
      res.json({ messages: rows.map((r) => toDto(r, ctx)) });
    } catch (error) {
      console.error("chat/thread error:", error);
      res.status(500).json({ error: "Failed to load thread" });
    }
  }
);

// ── GET /api/projects/:projectId/chat/search ─────────────────
projectChatRouter.get(
  "/:projectId/chat/search",
  requireAuth,
  requireProjectChatRead,
  async (req: Request, res: Response) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
      if (q.length < 2) { res.json({ messages: [] }); return; }

      const channelId = requestedChannel(req);
      const ids = channelId ? [channelId] : (req.chatChannelIds ?? []);
      if (ids.length === 0) { res.json({ messages: [] }); return; }

      const rows = await loadMessages(
        {
          slackChannelId: { in: ids },
          deletedAt: null,
          text: { contains: q, mode: "insensitive" },
        },
        50
      );
      const ctx = await buildFormatContext();
      res.json({ messages: rows.map((r) => toDto(r, ctx)) });
    } catch (error) {
      console.error("chat/search error:", error);
      res.status(500).json({ error: "Search failed" });
    }
  }
);
```

- [ ] **Step 6: Mount the router BEFORE `projectsRouter`**

In `backend/src/app.ts`, add the import beside the other API router imports:

```ts
import { projectChatRouter } from "./api/projectChat.js";
```

Then insert the mount **immediately before** the existing `app.use("/api/projects", projectsRouter);` line (currently line 129):

```ts
// MUST be mounted before projectsRouter. projectsRouter attaches a pathless
// requireAuth (api/projects.ts:37), which would 401 the chat file proxy's
// `?token=` requests — an <img> tag cannot send an Authorization header — before
// they ever reached this router. Same ordering hazard as sseRouter vs
// notificationsRouter below.
app.use("/api/projects", projectChatRouter);
app.use("/api/projects", projectsRouter);
```

- [ ] **Step 7: Typecheck**

```bash
cd backend && npx tsc --noEmit
```

Expected: one error — `Cannot find module '../services/slackFileService.js'`. That module arrives in Task 5. To keep this task independently verifiable, temporarily replace `buildFormatContext`'s last two lines with `return { memberNames, emojiUrls: {} };`, deleting the dynamic import; Task 5 Step 6 restores it.

- [ ] **Step 8: Re-typecheck and commit**

```bash
cd backend && npx tsc --noEmit
git add backend/src/middleware/projectChatAccess.ts backend/src/middleware/projectChatAccess.test.ts backend/src/api/projectChat.ts backend/src/app.ts
git commit -m "feat(slack-archive): project-scoped chat read API and access control"
```

---

## Task 5: File proxy, Drive mirror sweep, emoji cache

**Files:**
- Create: `backend/src/services/slackFileService.ts`
- Create: `backend/src/services/slackFileService.test.ts`
- Modify: `backend/src/api/projectChat.ts` (add the proxy route)
- Modify: `backend/src/slack/scheduler.ts` (two crons)

**Interfaces:**
- Consumes: `driveService` — `ensureClubPmRootFolder(): Promise<string|null>`, `createDriveFolder(name, parentId?): Promise<DriveResult<{id, webViewLink?}>>`, `uploadStreamToDrive(stream, mimeType, filename, folderId): Promise<{fileId,...}|null>`, `streamDriveFile(fileId): Promise<DriveStreamResult>`; `boltApp.client`.
- Produces:
  - `resolveFileStream(slackFileId: string): Promise<ResolvedFile>`
  - `mirrorFile(slackFileId: string): Promise<SlackFileStorage>`
  - `sweepExpiringFiles(cutoffDays?: number, batchSize?: number): Promise<{ swept: number; drive: number; local: number; failed: number; unavailable: number }>`
  - `getStorageHealth(): Promise<{ counts: Record<string, number>; driveConnected: boolean }>`
  - `getCustomEmoji(): Promise<Record<string,string>>`, `refreshCustomEmoji(): Promise<number>`
  - `MIRROR_CUTOFF_DAYS = 60`, `MAX_MIRROR_ATTEMPTS = 3`

- [ ] **Step 1: Write the failing state-machine test**

Create `backend/src/services/slackFileService.test.ts`:

```ts
// Pure-logic unit tests for the slackFileService state machine. No DB, no I/O.
// Run: cd backend && npx tsx src/services/slackFileService.test.ts

import { nextStorageState, streamSourceFor, MAX_MIRROR_ATTEMPTS } from "./slackFileService.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}

console.log("nextStorageState");
check("drive success → DRIVE",
  nextStorageState({ outcome: "drive", attempts: 0 }) === "DRIVE");
check("local fallback → LOCAL",
  nextStorageState({ outcome: "local", attempts: 0 }) === "LOCAL");
check("slack lost the file → UNAVAILABLE",
  nextStorageState({ outcome: "gone", attempts: 0 }) === "UNAVAILABLE");
check("first failure stays SLACK_ONLY so the next sweep retries",
  nextStorageState({ outcome: "error", attempts: 1 }) === "SLACK_ONLY");
check("second failure still retries",
  nextStorageState({ outcome: "error", attempts: 2 }) === "SLACK_ONLY");
check(`failure number ${MAX_MIRROR_ATTEMPTS} gives up`,
  nextStorageState({ outcome: "error", attempts: MAX_MIRROR_ATTEMPTS }) === "MIRROR_FAILED");
check("a fourth failure stays MIRROR_FAILED",
  nextStorageState({ outcome: "error", attempts: MAX_MIRROR_ATTEMPTS + 1 }) === "MIRROR_FAILED");

console.log("\nstreamSourceFor");
{
  // MIRROR_FAILED is an OUTCOME, not a location — the file is still in Slack
  // until Slack expires it, so the proxy must keep serving it from there.
  check("SLACK_ONLY streams from slack", streamSourceFor("SLACK_ONLY") === "slack");
  check("MIRROR_FAILED also streams from slack", streamSourceFor("MIRROR_FAILED") === "slack");
  check("DRIVE streams from drive", streamSourceFor("DRIVE") === "drive");
  check("LOCAL streams from disk", streamSourceFor("LOCAL") === "disk");
  check("UNAVAILABLE streams from nowhere", streamSourceFor("UNAVAILABLE") === "none");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd backend && npx tsx src/services/slackFileService.test.ts
```

Expected: FAIL — `Cannot find module './slackFileService.js'`.

- [ ] **Step 3: Implement the file service**

Create `backend/src/services/slackFileService.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Readable } from "node:stream";
import { prisma } from "../db/prisma.js";
import { boltApp } from "../slack/bolt.js";
import {
  ensureClubPmRootFolder,
  createDriveFolder,
  uploadStreamToDrive,
  streamDriveFile,
} from "./driveService.js";

/**
 * Slack never announces expiry — on the free plan, history simply stops being
 * returned past ~90 days. So "about to expire" is age-based, and the 30-day
 * margin below is this design's entire tolerance for a cron outage, a Drive
 * quota error, or a revoked Drive credential. Copying early costs nothing:
 * they are the same bytes either way.
 */
export const MIRROR_CUTOFF_DAYS = 60;
export const MAX_MIRROR_ATTEMPTS = 3;

type Storage = "SLACK_ONLY" | "DRIVE" | "LOCAL" | "MIRROR_FAILED" | "UNAVAILABLE";
type MirrorOutcome = "drive" | "local" | "gone" | "error";

/** Pure: the storage state a mirror attempt lands in. */
export function nextStorageState(input: { outcome: MirrorOutcome; attempts: number }): Storage {
  switch (input.outcome) {
    case "drive": return "DRIVE";
    case "local": return "LOCAL";
    case "gone":  return "UNAVAILABLE";
    case "error": return input.attempts >= MAX_MIRROR_ATTEMPTS ? "MIRROR_FAILED" : "SLACK_ONLY";
  }
}

/**
 * Pure: where the proxy streams a file from.
 *
 * SlackFileStorage mixes locations with outcomes. MIRROR_FAILED maps to "slack"
 * because the mirror failing does not remove the file from Slack — it is still
 * servable until Slack expires it, at which point the next sweep marks it
 * UNAVAILABLE and the proxy stops trying.
 */
export function streamSourceFor(storage: Storage): "slack" | "drive" | "disk" | "none" {
  if (storage === "DRIVE") return "drive";
  if (storage === "LOCAL") return "disk";
  if (storage === "UNAVAILABLE") return "none";
  return "slack"; // SLACK_ONLY and MIRROR_FAILED
}

const UPLOADS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "uploads");
const SLACK_UPLOADS = path.join(UPLOADS_DIR, "slack");

// ── Custom emoji cache ───────────────────────────────────────

let emojiCache: { map: Record<string, string>; at: number } | null = null;
const EMOJI_TTL_MS = 24 * 60 * 60_000;

export async function refreshCustomEmoji(): Promise<number> {
  try {
    const res = await boltApp.client.emoji.list({});
    const map: Record<string, string> = {};
    for (const [name, url] of Object.entries(res.emoji ?? {})) {
      if (typeof url === "string" && url.startsWith("http")) map[name] = url;
    }
    emojiCache = { map, at: Date.now() };
    return Object.keys(map).length;
  } catch (err) {
    // missing_scope until the app is reinstalled with emoji:read. Custom emoji
    // then render as their :name: text, which is a degradation, not a failure.
    console.warn("[slackFile] emoji.list failed:", (err as Error).message);
    if (!emojiCache) emojiCache = { map: {}, at: Date.now() };
    return 0;
  }
}

export async function getCustomEmoji(): Promise<Record<string, string>> {
  if (!emojiCache || Date.now() - emojiCache.at > EMOJI_TTL_MS) await refreshCustomEmoji();
  return emojiCache?.map ?? {};
}

// ── Slack fetch ──────────────────────────────────────────────

/** Fresh url_private at use time — a stored URL may have rotated. */
async function slackFileUrl(slackFileId: string): Promise<{ url: string; mimeType: string } | "gone"> {
  try {
    const info = await boltApp.client.files.info({ file: slackFileId });
    const f = info.file as { url_private?: string; mimetype?: string } | undefined;
    if (!f?.url_private) return "gone";
    return { url: f.url_private, mimeType: f.mimetype ?? "application/octet-stream" };
  } catch (err) {
    const code = (err as { data?: { error?: string } }).data?.error;
    if (code === "file_not_found" || code === "file_deleted") return "gone";
    throw err;
  }
}

/** url_private requires the bot token in a header — a browser can never do this. */
async function fetchSlackFile(url: string): Promise<Response> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` },
  });
  if (!res.ok || !res.body) throw new Error(`Slack file fetch failed: ${res.status}`);
  return res;
}

// ── Proxy resolution ─────────────────────────────────────────

export type ResolvedFile =
  | { ok: true; stream: Readable; mimeType: string; fileName: string }
  | { ok: false; status: 404 | 410 | 502; detail: string };

export async function resolveFileStream(slackFileId: string): Promise<ResolvedFile> {
  const row = await prisma.slackMessageFile.findUnique({ where: { slackFileId } });
  if (!row) return { ok: false, status: 404, detail: "unknown file" };

  const source = streamSourceFor(row.storage as Storage);
  const mimeType = row.mimeType ?? "application/octet-stream";

  if (source === "none") {
    return { ok: false, status: 410, detail: "This file expired in Slack before it could be archived" };
  }

  if (source === "drive" && row.driveFileId) {
    const result = await streamDriveFile(row.driveFileId);
    if (!result.ok) return { ok: false, status: 502, detail: result.detail ?? result.reason };
    return { ok: true, stream: result.stream, mimeType: result.mimeType, fileName: row.name };
  }

  if (source === "disk" && row.localPath) {
    const abs = path.join(SLACK_UPLOADS, row.localPath);
    if (!fs.existsSync(abs)) return { ok: false, status: 410, detail: "mirrored copy is missing" };
    return { ok: true, stream: fs.createReadStream(abs), mimeType, fileName: row.name };
  }

  const url = await slackFileUrl(slackFileId);
  if (url === "gone") {
    await prisma.slackMessageFile.update({
      where: { slackFileId },
      data: { storage: "UNAVAILABLE" },
    });
    return { ok: false, status: 410, detail: "This file expired in Slack before it could be archived" };
  }
  const res = await fetchSlackFile(url.url);
  const { Readable: NodeReadable } = await import("node:stream");
  return {
    ok: true,
    stream: NodeReadable.fromWeb(res.body as never),
    mimeType: url.mimeType,
    fileName: row.name,
  };
}

// ── Mirroring ────────────────────────────────────────────────

/**
 * Per-channel folder directly under the ClubPM root, named for the channel.
 * Per-CHANNEL rather than per-project because a channel can belong to several
 * projects — a per-project layout would have to pick one arbitrarily.
 */
async function ensureChannelDriveFolder(slackChannelId: string): Promise<string | null> {
  const archive = await prisma.slackChannelArchive.findUnique({
    where: { slackChannelId },
    select: { driveFolderId: true, slackChannelName: true },
  });
  if (archive?.driveFolderId) return archive.driveFolderId;

  const root = await ensureClubPmRootFolder();
  if (!root) return null;

  const name = `Slack Archive — #${archive?.slackChannelName ?? slackChannelId}`;
  const created = await createDriveFolder(name, root);
  if (!created.ok) return null;

  await prisma.slackChannelArchive.update({
    where: { slackChannelId },
    data: { driveFolderId: created.value.id },
  });
  return created.value.id;
}

async function mirrorToDisk(slackChannelId: string, slackFileId: string, name: string, body: Response): Promise<string> {
  const dir = path.join(SLACK_UPLOADS, slackChannelId);
  fs.mkdirSync(dir, { recursive: true });
  const safe = `${slackFileId}-${name.replace(/[^\w.\-]/g, "_")}`;
  const abs = path.join(dir, safe);
  const { Readable: NodeReadable } = await import("node:stream");
  const { pipeline } = await import("node:stream/promises");
  await pipeline(NodeReadable.fromWeb(body.body as never), fs.createWriteStream(abs));
  return path.join(slackChannelId, safe);
}

/** Copy one file out of Slack. Idempotent: an already-mirrored row is a no-op. */
export async function mirrorFile(slackFileId: string): Promise<Storage> {
  const row = await prisma.slackMessageFile.findUnique({
    where: { slackFileId },
    include: { message: { select: { slackChannelId: true } } },
  });
  if (!row) return "UNAVAILABLE";
  if (row.storage === "DRIVE" || row.storage === "LOCAL" || row.storage === "UNAVAILABLE") {
    return row.storage as Storage;
  }

  const attempts = row.mirrorAttempts + 1;
  const channelId = row.message.slackChannelId;

  try {
    const url = await slackFileUrl(slackFileId);
    if (url === "gone") {
      const storage = nextStorageState({ outcome: "gone", attempts });
      await prisma.slackMessageFile.update({
        where: { slackFileId },
        data: { storage, mirrorAttempts: attempts, mirrorError: "file_not_found in Slack" },
      });
      return storage;
    }

    const folderId = await ensureChannelDriveFolder(channelId);

    if (folderId) {
      const res = await fetchSlackFile(url.url);
      const { Readable: NodeReadable } = await import("node:stream");
      const uploaded = await uploadStreamToDrive(
        NodeReadable.fromWeb(res.body as never),
        url.mimeType,
        row.name,
        folderId
      );
      if (uploaded) {
        await prisma.slackMessageFile.update({
          where: { slackFileId },
          data: {
            storage: "DRIVE",
            driveFileId: uploaded.fileId,
            mirroredAt: new Date(),
            mirrorAttempts: attempts,
            mirrorError: null,
          },
        });
        return "DRIVE";
      }
    }

    // Drive unavailable (no credential, or the upload returned null). Falling
    // back to disk matters: every driveService call returns null on error rather
    // than throwing, so without this the sweep would no-op SILENTLY and files
    // would die at day 90 with nothing in the logs saying why.
    const res = await fetchSlackFile(url.url);
    const localPath = await mirrorToDisk(channelId, slackFileId, row.name, res);
    await prisma.slackMessageFile.update({
      where: { slackFileId },
      data: {
        storage: "LOCAL",
        localPath,
        mirroredAt: new Date(),
        mirrorAttempts: attempts,
        mirrorError: folderId ? "Drive upload returned null" : "no Drive account connected",
      },
    });
    return "LOCAL";
  } catch (err) {
    const storage = nextStorageState({ outcome: "error", attempts });
    await prisma.slackMessageFile.update({
      where: { slackFileId },
      data: { storage, mirrorAttempts: attempts, mirrorError: (err as Error).message.slice(0, 500) },
    });
    return storage;
  }
}

export async function sweepExpiringFiles(
  cutoffDays = MIRROR_CUTOFF_DAYS,
  batchSize = 200
): Promise<{ swept: number; drive: number; local: number; failed: number; unavailable: number }> {
  const cutoff = new Date(Date.now() - cutoffDays * 86_400_000);
  const due = await prisma.slackMessageFile.findMany({
    where: { storage: "SLACK_ONLY", postedAt: { lt: cutoff } },
    orderBy: { postedAt: "asc" },
    take: batchSize,
    select: { slackFileId: true },
  });

  const tally = { swept: 0, drive: 0, local: 0, failed: 0, unavailable: 0 };
  for (const f of due) {
    const result = await mirrorFile(f.slackFileId);
    tally.swept++;
    if (result === "DRIVE") tally.drive++;
    else if (result === "LOCAL") tally.local++;
    else if (result === "UNAVAILABLE") tally.unavailable++;
    else tally.failed++;
  }
  return tally;
}

export async function getStorageHealth(): Promise<{ counts: Record<string, number>; driveConnected: boolean }> {
  const grouped = await prisma.slackMessageFile.groupBy({ by: ["storage"], _count: { _all: true } });
  const counts: Record<string, number> = {};
  for (const g of grouped) counts[g.storage] = g._count._all;
  const cred = await prisma.googleDriveCredential.findUnique({ where: { id: "singleton" } });
  return { counts, driveConnected: !!cred };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd backend && npx tsx src/services/slackFileService.test.ts
```

Expected: `12 passed, 0 failed`.

- [ ] **Step 5: Add the file proxy route**

In `backend/src/api/projectChat.ts`, add to the imports:

```ts
import { verifyBearerToken } from "./auth.js";
import { getProjectChatAccess } from "../middleware/projectChatAccess.js";
import { resolveFileStream, getStorageHealth } from "../services/slackFileService.js";
```

Then append to the file:

```ts
// ── GET /api/projects/:projectId/chat/files/:slackFileId ─────
// An <img> tag cannot set an Authorization header, so Bearer-token users
// (Brave, Safari — the exact browsers the Bearer fallback exists for) would
// find EVERY image in the archive broken while it worked fine in Chrome.
// The signed `?token=` query param is the same escape hatch sse.ts uses.
projectChatRouter.get(
  "/:projectId/chat/files/:slackFileId",
  async (req: Request, res: Response) => {
    try {
      let memberId = req.memberId;
      if (!memberId && typeof req.query.token === "string") {
        memberId = (await verifyBearerToken(req.query.token)) ?? undefined;
      }
      if (!memberId) {
        return void res.status(401).json({ error: "Not authenticated" });
      }

      const projectId = req.params.projectId as string;
      const { canRead, channelIds } = await getProjectChatAccess(memberId, projectId);
      if (!canRead) return void res.status(403).json({ error: "No access" });

      const slackFileId = req.params.slackFileId as string;
      const file = await prisma.slackMessageFile.findUnique({
        where: { slackFileId },
        select: { message: { select: { slackChannelId: true } } },
      });
      // Scope the proxy to the project's own channels — this route serves the
      // actual private content, so it gets the same check as the read routes.
      if (!file || !channelIds.includes(file.message.slackChannelId)) {
        return void res.status(404).json({ error: "Not found" });
      }

      const resolved = await resolveFileStream(slackFileId);
      if (!resolved.ok) {
        return void res.status(resolved.status).json({ error: resolved.detail });
      }

      res.setHeader("Content-Type", resolved.mimeType);
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(resolved.fileName)}"`);
      resolved.stream.pipe(res);
    } catch (error) {
      console.error("chat/files error:", error);
      if (!res.headersSent) res.status(500).json({ error: "Failed to load file" });
    }
  }
);

// ── GET /api/projects/:projectId/chat/storage-health ─────────
projectChatRouter.get(
  "/:projectId/chat/storage-health",
  requireAuth,
  requireProjectChatRead,
  async (req: Request, res: Response) => {
    if (!req.chatIsAdmin) return void res.status(403).json({ error: "Admin only" });
    try {
      res.json(await getStorageHealth());
    } catch (error) {
      console.error("chat/storage-health error:", error);
      res.status(500).json({ error: "Failed to read storage health" });
    }
  }
);
```

- [ ] **Step 6: Restore the emoji lookup in `buildFormatContext`**

In `backend/src/api/projectChat.ts`, replace the temporary `return { memberNames, emojiUrls: {} };` from Task 4 Step 4 with:

```ts
  const { getCustomEmoji } = await import("../services/slackFileService.js");
  return { memberNames, emojiUrls: await getCustomEmoji() };
```

- [ ] **Step 7: Register the crons**

In `backend/src/slack/scheduler.ts`, add inside the same function that holds the other `cron.schedule` calls, after the existing `cron.schedule("45 3 * * *", ...)` block:

```ts
  // ── 03:40 daily — mirror Slack attachments before Slack expires them ──
  // Clear of the 03:00–03:30 cluster (vault temp sweep, notification cleanup,
  // auto-archive nudges).
  cron.schedule("40 3 * * *", async () => {
    try {
      const { sweepExpiringFiles, MIRROR_CUTOFF_DAYS } = await import("../services/slackFileService.js");
      const t = await sweepExpiringFiles();
      if (t.swept > 0) {
        console.log(
          `📦 [slackArchive] swept ${t.swept} file(s) older than ${MIRROR_CUTOFF_DAYS}d — ` +
          `${t.drive} to Drive, ${t.local} to disk, ${t.unavailable} already gone, ${t.failed} failed`
        );
      }
      if (t.local > 0) {
        console.warn("⚠️ [slackArchive] files fell back to local disk — is Google Drive connected?");
      }
    } catch (err) {
      console.error("[slackArchive] mirror sweep failed:", err);
    }
  });

  // ── 03:50 daily — refresh the workspace custom-emoji cache ──
  cron.schedule("50 3 * * *", async () => {
    try {
      const { refreshCustomEmoji } = await import("../services/slackFileService.js");
      const n = await refreshCustomEmoji();
      console.log(`😀 [slackArchive] cached ${n} custom emoji`);
    } catch (err) {
      console.error("[slackArchive] emoji refresh failed:", err);
    }
  });
```

- [ ] **Step 8: Typecheck and commit**

```bash
cd backend && npx tsc --noEmit
git add backend/src/services/slackFileService.ts backend/src/services/slackFileService.test.ts backend/src/api/projectChat.ts backend/src/slack/scheduler.ts
git commit -m "feat(slack-archive): file proxy, Drive mirror sweep, emoji cache"
```

---

## Task 6: Resumable history backfill

**Files:**
- Create: `backend/src/services/slackBackfillService.ts`
- Modify: `backend/src/api/projectChat.ts` (two routes)

**Interfaces:**
- Consumes: `ensureChannelArchive`, `resolveAuthor`, `isArchivedChannel` (Task 3); `shouldArchive` (Task 2).
- Produces:
  - `startBackfill(slackChannelId: string): Promise<{ started: boolean; reason?: string }>`
  - `getBackfillStatus(slackChannelId: string): Promise<{ status: string; cursor: string|null; error: string|null; messageCount: number }>`

**No unit test here, deliberately.** The spec asks for one covering resume-from-cursor and
idempotency, but both behaviors are pure I/O sequencing against Postgres and the Slack API — the
inline `tsx` harness has no DB and no Slack mock, so a test would only assert against stubs it also
defines. Idempotency is instead enforced *structurally* by `@@unique([slackChannelId, ts])` plus
`update: {}` on every upsert, and both behaviors are covered by manual verification step 8. If a
DB-backed test harness is ever added to `backend/`, this is the first thing that should get one.

- [ ] **Step 1: Implement the backfill runner**

Create `backend/src/services/slackBackfillService.ts`:

```ts
import { prisma } from "../db/prisma.js";
import { boltApp } from "../slack/bolt.js";
import { shouldArchive, type RawSlackMessage } from "./slackArchivePolicy.js";
import { ensureChannelArchive, resolveAuthor } from "./slackArchiveService.js";
import { getBotUserId } from "./memberService.js";

/** One in-flight backfill per channel, per process. */
const running = new Set<string>();

const PAGE = 200;
/** conversations.history is Slack Tier 3 (~50 req/min). Stay well under. */
const PACE_MS = 1_200;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const tsToDate = (ts: string) => new Date(Math.round(parseFloat(ts) * 1000));

type HistoryMessage = RawSlackMessage & { reply_count?: number };

async function storeMessage(
  slackChannelId: string,
  msg: HistoryMessage,
  botUserId: string | undefined
): Promise<boolean> {
  // The SAME predicate as live ingest, so historical and live archives cannot
  // diverge in what they contain.
  const decision = shouldArchive(msg, botUserId);
  if (!decision.archive || decision.kind !== "new") return false;
  if (!msg.ts) return false;

  const author = msg.user
    ? await resolveAuthor(msg.user, boltApp.client)
    : { authorName: "Unknown", authorAvatarUrl: null, memberId: null };
  const postedAt = tsToDate(msg.ts);
  const threadTs = msg.thread_ts && msg.thread_ts !== msg.ts ? msg.thread_ts : null;

  const row = await prisma.slackMessage.upsert({
    where: { slackChannelId_ts: { slackChannelId, ts: msg.ts } },
    create: {
      slackChannelId,
      ts: msg.ts,
      threadTs,
      authorSlackId: msg.user ?? null,
      memberId: author.memberId,
      authorName: author.authorName,
      authorAvatarUrl: author.authorAvatarUrl,
      text: msg.text ?? "",
      postedAt,
    },
    update: {}, // replay is free — never clobber a live-ingested row
    select: { id: true },
  });

  for (const raw of msg.files ?? []) {
    const f = raw as { id?: string; name?: string; title?: string; mimetype?: string; size?: number; original_w?: number; original_h?: number };
    if (!f.id) continue;
    await prisma.slackMessageFile.upsert({
      where: { slackFileId: f.id },
      create: {
        messageId: row.id,
        slackFileId: f.id,
        name: f.name || f.title || f.id,
        mimeType: f.mimetype ?? null,
        sizeBytes: f.size ?? null,
        isImage: !!f.mimetype?.startsWith("image/"),
        width: f.original_w ?? null,
        height: f.original_h ?? null,
        // Backfilled files older than the 60-day cutoff are swept THAT NIGHT.
        // Intended: the cutoff is checked against postedAt, not ingest time.
        postedAt,
      },
      update: {},
    });
  }
  return true;
}

async function runBackfill(slackChannelId: string): Promise<void> {
  const botUserId = (await getBotUserId(boltApp.client)) ?? undefined;
  let cursor: string | undefined;
  let stored = 0;
  let oldest: string | null = null;

  try {
    // Resume from where a previous run stopped, if any.
    const prior = await prisma.slackChannelArchive.findUnique({
      where: { slackChannelId },
      select: { backfillCursor: true },
    });
    cursor = prior?.backfillCursor ?? undefined;

    for (;;) {
      const res = await boltApp.client.conversations.history({
        channel: slackChannelId,
        limit: PAGE,
        ...(cursor ? { cursor } : {}),
      });

      for (const m of (res.messages ?? []) as HistoryMessage[]) {
        if (await storeMessage(slackChannelId, m, botUserId)) stored++;
        if (m.ts) oldest = m.ts;

        if ((m.reply_count ?? 0) > 0 && m.ts) {
          await sleep(PACE_MS);
          const replies = await boltApp.client.conversations.replies({
            channel: slackChannelId,
            ts: m.ts,
            limit: PAGE,
          });
          for (const r of (replies.messages ?? []) as HistoryMessage[]) {
            if (r.ts === m.ts) continue; // the parent repeats itself in replies
            if (await storeMessage(slackChannelId, r, botUserId)) stored++;
          }
          const count = await prisma.slackMessage.count({
            where: { slackChannelId, threadTs: m.ts, deletedAt: null, NOT: { ts: m.ts } },
          });
          await prisma.slackMessage.updateMany({
            where: { slackChannelId, ts: m.ts },
            data: { replyCount: count },
          });
        }
      }

      cursor = res.response_metadata?.next_cursor || undefined;

      // Persist the cursor after EVERY page, so a crash or redeploy resumes
      // instead of restarting a large channel from scratch.
      await prisma.slackChannelArchive.update({
        where: { slackChannelId },
        data: { backfillCursor: cursor ?? null, backfillOldestTs: oldest },
      });

      if (!cursor) break;
      await sleep(PACE_MS);
    }

    await prisma.slackChannelArchive.update({
      where: { slackChannelId },
      data: {
        backfillStatus: "COMPLETE",
        backfilledAt: new Date(),
        backfillError: null,
        backfillCursor: null,
        messageCount: await prisma.slackMessage.count({ where: { slackChannelId } }),
      },
    });
    console.log(`📚 [slackArchive] backfill complete for ${slackChannelId} — ${stored} message(s) stored`);
  } catch (err) {
    console.error(`[slackArchive] backfill failed for ${slackChannelId}:`, err);
    await prisma.slackChannelArchive.update({
      where: { slackChannelId },
      data: { backfillStatus: "FAILED", backfillError: (err as Error).message.slice(0, 500) },
    });
  } finally {
    running.delete(slackChannelId);
  }
}

export async function startBackfill(slackChannelId: string): Promise<{ started: boolean; reason?: string }> {
  if (running.has(slackChannelId)) return { started: false, reason: "already_running" };

  await ensureChannelArchive(slackChannelId, boltApp.client);
  await prisma.slackChannelArchive.update({
    where: { slackChannelId },
    data: { backfillStatus: "RUNNING", backfillError: null },
  });

  running.add(slackChannelId);
  // Detached on purpose: the HTTP request returns immediately and the client
  // polls the status route.
  void runBackfill(slackChannelId);
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
```

- [ ] **Step 2: Add the backfill routes**

In `backend/src/api/projectChat.ts`, add the import:

```ts
import { startBackfill, getBackfillStatus } from "../services/slackBackfillService.js";
```

And append:

```ts
// ── POST /api/projects/:projectId/chat/backfill ──────────────
projectChatRouter.post(
  "/:projectId/chat/backfill",
  requireAuth,
  requireProjectChatRead,
  async (req: Request, res: Response) => {
    if (!req.chatIsAdmin) return void res.status(403).json({ error: "Admin only" });
    try {
      const channelId = typeof req.body?.channelId === "string" ? req.body.channelId : null;
      if (!channelId || !(req.chatChannelIds ?? []).includes(channelId)) {
        return void res.status(400).json({ error: "channelId is not linked to this project" });
      }
      res.json(await startBackfill(channelId));
    } catch (error) {
      console.error("chat/backfill error:", error);
      res.status(500).json({ error: "Failed to start backfill" });
    }
  }
);

// ── GET /api/projects/:projectId/chat/backfill/:channelId ────
projectChatRouter.get(
  "/:projectId/chat/backfill/:channelId",
  requireAuth,
  requireProjectChatRead,
  async (req: Request, res: Response) => {
    try {
      const channelId = req.params.channelId as string;
      if (!(req.chatChannelIds ?? []).includes(channelId)) {
        return void res.status(404).json({ error: "Not found" });
      }
      res.json(await getBackfillStatus(channelId));
    } catch (error) {
      console.error("chat/backfill status error:", error);
      res.status(500).json({ error: "Failed to read backfill status" });
    }
  }
);
```

- [ ] **Step 3: Typecheck and commit**

```bash
cd backend && npx tsc --noEmit
git add backend/src/services/slackBackfillService.ts backend/src/api/projectChat.ts
git commit -m "feat(slack-archive): resumable admin-triggered history backfill"
```

---

## Task 7: Live updates over the existing SSE stream

**Files:**
- Modify: `backend/src/api/sse.ts`
- Modify: `src/components/clubpm/NotificationBell.jsx` (SSE block at ~:190-240)

**Interfaces:**
- Consumes: `activityBus` topic `` `slack-chat:${channelId}` `` emitted by Task 3.
- Produces: SSE event named `slack-message` with data `{ channelId, ts, threadTs?, kind }`; window event `clubpm:slack-message` with the same object as `detail`, consumed by `ChatTab` in Task 10.

- [ ] **Step 1: Subscribe the stream to project channels**

In `backend/src/api/sse.ts`, add to the imports:

```ts
import { prisma } from "../db/prisma.js";
```

Then, inside the `sseRouter.get("/stream", ...)` handler, immediately after the existing `activityBus.on(\`notification:${memberId}\`, onNotification);` line, insert:

```ts
  // Slack chat: subscribe to every channel linked to a project this member is
  // on. Reuses this one stream rather than opening a second EventSource, so the
  // ?token= auth path, heartbeat, and cleanup all keep working unchanged.
  //
  // Resolved ONCE at connect time: a member added to a project mid-stream sees
  // its messages only after a reconnect. Accepted — the alternative is
  // re-resolving permissions on every emit.
  const chatTopics: string[] = [];
  const onChatMessage = (payload: unknown) => {
    try {
      res.write(`event: slack-message\ndata: ${JSON.stringify(payload)}\n\n`);
    } catch {
      // client disconnected mid-write — handled by the close handler below
    }
  };

  void (async () => {
    try {
      const member = await prisma.member.findUnique({
        where: { id: memberId },
        select: { isAdmin: true },
      });
      const memberships = await prisma.projectMember.findMany({
        where: { memberId },
        select: { projectId: true },
      });
      const projectIds = memberships.map((m) => m.projectId);

      const targets = await prisma.projectNotificationTarget.findMany({
        where: member?.isAdmin ? {} : { projectId: { in: projectIds } },
        select: { slackChannelId: true },
      });
      const projects = await prisma.project.findMany({
        where: member?.isAdmin ? {} : { id: { in: projectIds } },
        select: { slackChannelId: true },
      });

      const ids = new Set<string>();
      for (const t of targets) if (t.slackChannelId) ids.add(t.slackChannelId);
      for (const p of projects) if (p.slackChannelId) ids.add(p.slackChannelId);

      for (const id of ids) {
        const topic = `slack-chat:${id}`;
        chatTopics.push(topic);
        activityBus.on(topic, onChatMessage);
      }
    } catch (err) {
      console.error("[sse] failed to subscribe chat topics:", err);
    }
  })();
```

Then, inside the existing `req.on("close", ...)` handler, add before `res.end();`:

```ts
    for (const topic of chatTopics) activityBus.off(topic, onChatMessage);
```

- [ ] **Step 2: Re-broadcast as a window event on the client**

In `src/components/clubpm/NotificationBell.jsx`, immediately after the existing `es.addEventListener("notification", ...)` block closes, add:

```jsx
    // Slack chat archive: the chat tab is not always mounted, so this listener
    // lives with the app's single EventSource and re-broadcasts as a window
    // event — same idiom as clubpm:reward-granted above.
    es.addEventListener("slack-message", (e) => {
      try {
        window.dispatchEvent(new CustomEvent("clubpm:slack-message", {
          detail: JSON.parse(e.data),
        }));
      } catch {
        // malformed event — ignore
      }
    });
```

- [ ] **Step 3: Verify both build**

```bash
cd backend && npx tsc --noEmit
cd .. && npm run build
```

Expected: both succeed.

- [ ] **Step 4: Commit**

```bash
git add backend/src/api/sse.ts src/components/clubpm/NotificationBell.jsx
git commit -m "feat(slack-archive): push new messages over the existing SSE stream"
```

---

## Task 8: API client and chat leaf components

**Files:**
- Modify: `src/api/clubPmClient.js`
- Create: `src/components/clubpm/chat/ChatRichText.jsx`
- Create: `src/components/clubpm/chat/ChatFileAttachment.jsx`

**Interfaces:**
- Consumes: the `ChatMessageDto` shape from Task 4; the file proxy from Task 5.
- Produces:
  - Client: `getChatChannels(projectId)`, `getChatMessages(projectId, channelId, before?)`, `getChatThread(projectId, channelId, ts)`, `searchChat(projectId, channelId, q)`, `startChatBackfill(projectId, channelId)`, `getChatBackfillStatus(projectId, channelId)`, `getChatStorageHealth(projectId)`, `chatFileUrl(projectId, slackFileId)`
  - `<ChatRichText tokens={SlackToken[]} />`
  - `<ChatFileAttachment file={FileDto} projectId={string} />`

- [ ] **Step 1: Add the client helpers**

Append to `src/api/clubPmClient.js`:

```js
// ── Slack chat archive ───────────────────────────────────────

export function getChatChannels(projectId) {
  return get(`/api/projects/${projectId}/chat/channels`);
}

export function getChatMessages(projectId, channelId, before) {
  const q = new URLSearchParams({ channelId });
  if (before) q.set("before", before);
  return get(`/api/projects/${projectId}/chat/messages?${q}`);
}

export function getChatThread(projectId, channelId, ts) {
  return get(`/api/projects/${projectId}/chat/thread/${ts}?channelId=${encodeURIComponent(channelId)}`);
}

export function searchChat(projectId, channelId, q) {
  const params = new URLSearchParams({ q });
  if (channelId) params.set("channelId", channelId);
  return get(`/api/projects/${projectId}/chat/search?${params}`);
}

export function startChatBackfill(projectId, channelId) {
  return post(`/api/projects/${projectId}/chat/backfill`, { channelId });
}

export function getChatBackfillStatus(projectId, channelId) {
  return get(`/api/projects/${projectId}/chat/backfill/${channelId}`);
}

export function getChatStorageHealth(projectId) {
  return get(`/api/projects/${projectId}/chat/storage-health`);
}

/**
 * URL for an archived Slack attachment.
 *
 * An <img> tag cannot send an Authorization header, so the Bearer token rides
 * along as a signed query param — the same escape hatch EventSource uses. Never
 * build this URL by hand in a component, or images silently break for every
 * cookie-blocked browser (Brave, Safari).
 */
export function chatFileUrl(projectId, slackFileId) {
  const token = getStoredToken();
  const base = `${BASE_URL}/api/projects/${projectId}/chat/files/${encodeURIComponent(slackFileId)}`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}
```

- [ ] **Step 2: Create the rich-text renderer**

Create `src/components/clubpm/chat/ChatRichText.jsx`:

```jsx
/**
 * Renders the token array from GET .../chat/messages.
 *
 * NO <span> AND NO <p> ANYWHERE IN THIS FILE.
 * public/clubpm-theme.css:969 is
 *   `.clubpm-app p, .clubpm-app span { color: inherit !important }`
 * so a token rendered as a <span> loses its color with no way to override it —
 * every mention, link, and code fragment would silently read as body text.
 * Use <a>, <code>, <b>, <i>, <s>, <div>, <label> instead.
 */
export default function ChatRichText({ tokens }) {
  if (!tokens || tokens.length === 0) return null;

  return (
    <div className="cpm-chat-text">
      {tokens.map((t, i) => {
        switch (t.type) {
          case "mention":
            return <b key={i} className="cpm-chat-mention">@{t.label}</b>;

          case "channel":
            return <b key={i} className="cpm-chat-channel">#{t.label}</b>;

          case "link":
            return (
              <a
                key={i}
                className="cpm-chat-link"
                href={t.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t.label}
              </a>
            );

          case "code":
            return <code key={i} className="cpm-chat-code">{t.value}</code>;

          case "codeblock":
            return (
              <code key={i} className="cpm-chat-codeblock">
                {t.value}
              </code>
            );

          case "emoji":
            return t.url
              ? <img key={i} className="cpm-chat-emoji" src={t.url} alt={`:${t.name}:`} title={`:${t.name}:`} />
              : <code key={i} className="cpm-chat-emoji-name">:{t.name}:</code>;

          case "text":
          default:
            // A <label> is the only inline text element the blanket !important
            // rule above leaves alone.
            return <label key={i} className="cpm-chat-plain">{t.value}</label>;
        }
      })}
    </div>
  );
}
```

- [ ] **Step 3: Create the attachment renderer**

Create `src/components/clubpm/chat/ChatFileAttachment.jsx`:

```jsx
import { useState } from "react";
import { chatFileUrl } from "../../../api/clubPmClient";

/** Human-readable byte count. */
function sizeLabel(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function ChatFileAttachment({ file, projectId }) {
  const [broken, setBroken] = useState(false);

  // The archive's whole point is that this stays rare — but when Slack expired
  // a file before the sweep reached it, say so instead of showing a broken
  // image icon.
  if (file.storage === "UNAVAILABLE") {
    return (
      <div className="cpm-chat-file cpm-chat-file--gone">
        <i className="fas fa-triangle-exclamation" aria-hidden="true" />
        <div className="cpm-chat-file-meta">
          <div className="cpm-chat-file-name">{file.name}</div>
          <div className="cpm-chat-file-sub">Expired in Slack before it could be archived</div>
        </div>
      </div>
    );
  }

  const href = chatFileUrl(projectId, file.id);

  if (file.isImage && !broken) {
    return (
      <a className="cpm-chat-image-link" href={href} target="_blank" rel="noopener noreferrer">
        <img
          className="cpm-chat-image"
          src={href}
          alt={file.name}
          loading="lazy"
          width={file.width || undefined}
          height={file.height || undefined}
          onError={() => setBroken(true)}
        />
      </a>
    );
  }

  return (
    <a className="cpm-chat-file" href={href} target="_blank" rel="noopener noreferrer">
      <i className="fas fa-paperclip" aria-hidden="true" />
      <div className="cpm-chat-file-meta">
        <div className="cpm-chat-file-name">{file.name}</div>
        <div className="cpm-chat-file-sub">
          {[file.mimeType, sizeLabel(file.sizeBytes)].filter(Boolean).join(" · ")}
        </div>
      </div>
    </a>
  );
}
```

- [ ] **Step 4: Build and commit**

```bash
npm run build
git add src/api/clubPmClient.js src/components/clubpm/chat/ChatRichText.jsx src/components/clubpm/chat/ChatFileAttachment.jsx
git commit -m "feat(slack-archive): chat API client and rich-text/attachment renderers"
```

---

## Task 9: Message and thread components

**Files:**
- Create: `src/components/clubpm/chat/ChatMessage.jsx`
- Create: `src/components/clubpm/chat/ChatThreadDrawer.jsx`

**Interfaces:**
- Consumes: `ChatRichText`, `ChatFileAttachment` (Task 8); `getChatThread` (Task 8).
- Produces:
  - `<ChatMessage message={dto} projectId compact={bool} onOpenThread={fn} />`
  - `<ChatThreadDrawer projectId channelId ts onClose />`

- [ ] **Step 1: Create the message component**

Create `src/components/clubpm/chat/ChatMessage.jsx`:

```jsx
import ChatRichText from "./ChatRichText";
import ChatFileAttachment from "./ChatFileAttachment";

function timeLabel(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export default function ChatMessage({ message, projectId, compact = false, onOpenThread }) {
  // Deleted messages keep their row on purpose: the archive records that
  // something was said and removed, rather than quietly losing the turn.
  if (message.deletedAt) {
    return (
      <div className="cpm-chat-msg cpm-chat-msg--deleted">
        <div className="cpm-chat-msg-body">
          <i className="fas fa-trash-can" aria-hidden="true" />
          <label className="cpm-chat-plain"> This message was deleted in Slack</label>
        </div>
      </div>
    );
  }

  return (
    <div className={`cpm-chat-msg${compact ? " cpm-chat-msg--compact" : ""}`}>
      <div className="cpm-chat-avatar" aria-hidden="true">
        {message.authorAvatarUrl
          ? <img src={message.authorAvatarUrl} alt="" />
          : <i className="fas fa-user" />}
      </div>

      <div className="cpm-chat-msg-body">
        <div className="cpm-chat-msg-head">
          <b className="cpm-chat-author">{message.authorName}</b>
          <label className="cpm-chat-time">{timeLabel(message.postedAt)}</label>
          {message.editedAt && <label className="cpm-chat-edited">(edited)</label>}
        </div>

        <ChatRichText tokens={message.tokens} />

        {message.files?.length > 0 && (
          <div className="cpm-chat-files">
            {message.files.map(f => (
              <ChatFileAttachment key={f.id} file={f} projectId={projectId} />
            ))}
          </div>
        )}

        {message.reactions?.length > 0 && (
          <div className="cpm-chat-reactions">
            {message.reactions.map(r => (
              <div key={r.emoji} className="cpm-chat-reaction" title={r.emoji}>
                <label className="cpm-chat-plain">{r.emoji}</label>
                <label className="cpm-chat-reaction-count">{r.count}</label>
              </div>
            ))}
          </div>
        )}

        {message.replyCount > 0 && onOpenThread && (
          <button
            type="button"
            className="cpm-chat-thread-btn"
            onClick={() => onOpenThread(message.ts)}
          >
            <i className="fas fa-comments" aria-hidden="true" />
            {message.replyCount} {message.replyCount === 1 ? "reply" : "replies"}
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the thread drawer**

Create `src/components/clubpm/chat/ChatThreadDrawer.jsx`:

```jsx
import { useEffect, useState } from "react";
import { getChatThread } from "../../../api/clubPmClient";
import ChatMessage from "./ChatMessage";

export default function ChatThreadDrawer({ projectId, channelId, ts, onClose }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    getChatThread(projectId, channelId, ts)
      .then(data => { if (!cancelled) setMessages(data.messages ?? []); })
      .catch(() => { if (!cancelled) setError("Could not load this thread."); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [projectId, channelId, ts]);

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
          <ChatMessage key={m.id} message={m} projectId={projectId} compact />
        ))}
      </div>
    </aside>
  );
}
```

- [ ] **Step 3: Build and commit**

```bash
npm run build
git add src/components/clubpm/chat/ChatMessage.jsx src/components/clubpm/chat/ChatThreadDrawer.jsx
git commit -m "feat(slack-archive): message and thread drawer components"
```

---

## Task 10: Chat tab, wire-up, and tour/course sync

**Files:**
- Create: `src/components/clubpm/chat/ChatTab.jsx`
- Modify: `src/pages/ClubPM/ProjectDetail.jsx` (`NAV_TABS` at :158; tab render near :3251)
- Modify: `src/clubpm/tour/tourAnchors.js` (:49-53)
- Modify: `docs/courses/ANCHORS.md` (:62-66)

**Interfaces:**
- Consumes: everything from Tasks 8–9; the `clubpm:slack-message` window event from Task 7.
- Produces: `<ChatTab project={project} isAdmin={bool} />`; tour anchor id `project.tab.chat`.

**Note on the file count:** this task touches 4 files (5 with any step file). `CLAUDE.md` requires the tab registration, `tourAnchors.js`, `ANCHORS.md`, and affected step files to land in the **same commit** — `scripts/check-tour-anchors.js` fails the build otherwise — so splitting them to satisfy the ≤4-file guideline would break a harder rule.

- [ ] **Step 1: Create the chat tab**

Create `src/components/clubpm/chat/ChatTab.jsx`:

```jsx
import { useCallback, useEffect, useRef, useState } from "react";
import {
  getChatChannels, getChatMessages, searchChat,
  startChatBackfill, getChatBackfillStatus,
} from "../../../api/clubPmClient";
import ChatMessage from "./ChatMessage";
import ChatThreadDrawer from "./ChatThreadDrawer";

export default function ChatTab({ project, isAdmin }) {
  const projectId = project?.id;

  const [channels, setChannels] = useState([]);
  const [channelId, setChannelId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [threadTs, setThreadTs] = useState(null);
  const [backfill, setBackfill] = useState(null);

  const scrollRef = useRef(null);

  // ── Channels ───────────────────────────────────────────────
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    getChatChannels(projectId)
      .then(data => {
        if (cancelled) return;
        setChannels(data.channels ?? []);
        setChannelId(prev => prev ?? data.channels?.[0]?.slackChannelId ?? null);
      })
      .catch(() => { if (!cancelled) setError("Could not load channels."); });
    return () => { cancelled = true; };
  }, [projectId]);

  // ── Messages ───────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!projectId || !channelId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const data = await getChatMessages(projectId, channelId);
      setMessages(data.messages ?? []);
      setHasMore(!!data.hasMore);
    } catch {
      setError("Could not load messages.");
    } finally {
      setLoading(false);
    }
  }, [projectId, channelId]);

  useEffect(() => { load(); }, [load]);

  // Pin to the newest message after a fresh channel load.
  useEffect(() => {
    if (!loading && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [loading, channelId]);

  const loadOlder = async () => {
    if (!hasMore || loadingMore || messages.length === 0) return;
    setLoadingMore(true);
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    try {
      const data = await getChatMessages(projectId, channelId, messages[0].ts);
      setMessages(prev => [...(data.messages ?? []), ...prev]);
      setHasMore(!!data.hasMore);
      // Keep the reading position steady after prepending older messages.
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - prevHeight;
      });
    } catch {
      setError("Could not load older messages.");
    } finally {
      setLoadingMore(false);
    }
  };

  // ── Live append ────────────────────────────────────────────
  useEffect(() => {
    if (!channelId) return;
    const onLive = (e) => {
      if (e.detail?.channelId !== channelId) return;
      // Refetch rather than reconstructing a DTO client-side: the server owns
      // token rendering, reaction shape, and reply counts.
      load();
    };
    window.addEventListener("clubpm:slack-message", onLive);
    return () => window.removeEventListener("clubpm:slack-message", onLive);
  }, [channelId, load]);

  // ── Search ─────────────────────────────────────────────────
  const runSearch = async (e) => {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 2) { setResults(null); return; }
    try {
      const data = await searchChat(projectId, channelId, q);
      setResults(data.messages ?? []);
    } catch {
      setError("Search failed.");
    }
  };

  // ── Backfill ───────────────────────────────────────────────
  const runBackfill = async () => {
    if (!channelId) return;
    setBackfill({ status: "RUNNING" });
    try {
      await startChatBackfill(projectId, channelId);
      const poll = setInterval(async () => {
        const s = await getChatBackfillStatus(projectId, channelId);
        setBackfill(s);
        if (s.status === "COMPLETE" || s.status === "FAILED") {
          clearInterval(poll);
          load();
        }
      }, 3000);
    } catch {
      setBackfill({ status: "FAILED", error: "Could not start backfill." });
    }
  };

  if (channels.length === 0 && !loading) {
    return (
      <div className="cpm-chat-empty">
        <i className="fab fa-slack" aria-hidden="true" />
        <div>No Slack channel is linked to this project yet.</div>
        <div className="cpm-chat-empty-sub">Link one from the project settings to start archiving.</div>
      </div>
    );
  }

  const shown = results ?? messages;

  return (
    <div className="cpm-chat-wrap">
      <div className="cpm-chat-toolbar">
        <select
          className="cpm-chat-channel-select"
          value={channelId ?? ""}
          onChange={e => { setChannelId(e.target.value); setResults(null); setThreadTs(null); }}
        >
          {channels.map(c => (
            <option key={c.slackChannelId} value={c.slackChannelId}>
              #{c.name} ({c.messageCount})
            </option>
          ))}
        </select>

        <form className="cpm-chat-search" onSubmit={runSearch}>
          <input
            type="search"
            placeholder="Search this channel…"
            value={query}
            onChange={e => { setQuery(e.target.value); if (!e.target.value) setResults(null); }}
          />
          <button type="submit" aria-label="Search">
            <i className="fas fa-magnifying-glass" aria-hidden="true" />
          </button>
        </form>

        {isAdmin && (
          <button type="button" className="cpm-chat-backfill-btn" onClick={runBackfill}>
            <i className="fas fa-clock-rotate-left" aria-hidden="true" />
            {backfill?.status === "RUNNING" ? "Importing…" : "Import history"}
          </button>
        )}
      </div>

      {backfill?.status === "FAILED" && (
        <div className="cpm-chat-banner cpm-chat-banner--error">
          History import failed{backfill.error ? `: ${backfill.error}` : "."}
        </div>
      )}
      {results && (
        <div className="cpm-chat-banner">
          {results.length} result{results.length === 1 ? "" : "s"} ·{" "}
          <button type="button" className="cpm-chat-linkbtn" onClick={() => { setResults(null); setQuery(""); }}>
            back to the conversation
          </button>
        </div>
      )}

      <div className="cpm-chat-layout">
        <div className="cpm-chat-scroll" ref={scrollRef}>
          {loading && <div className="cpm-spinner" aria-label="Loading" />}
          {error && <div className="cpm-chat-banner cpm-chat-banner--error">{error}</div>}

          {!loading && !results && hasMore && (
            <button type="button" className="cpm-chat-older" onClick={loadOlder} disabled={loadingMore}>
              {loadingMore ? "Loading…" : "Load older messages"}
            </button>
          )}

          {!loading && shown.length === 0 && !error && (
            <div className="cpm-chat-empty">
              <div>Nothing archived here yet.</div>
              {isAdmin && <div className="cpm-chat-empty-sub">Use “Import history” to pull in what Slack still has.</div>}
            </div>
          )}

          {shown.map(m => (
            <ChatMessage
              key={m.id}
              message={m}
              projectId={projectId}
              onOpenThread={setThreadTs}
            />
          ))}
        </div>

        {threadTs && (
          <ChatThreadDrawer
            projectId={projectId}
            channelId={channelId}
            ts={threadTs}
            onClose={() => setThreadTs(null)}
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Register the tab in `ProjectDetail.jsx`**

Add the import beside the other tab-content imports near the top of `src/pages/ClubPM/ProjectDetail.jsx`:

```jsx
import ChatTab from "../../components/clubpm/chat/ChatTab";
```

In the `NAV_TABS` array (line 158), insert this entry between the `files` and `reports` entries:

```jsx
  {
    id: "chat", label: "Chat", tourId: "project.tab.chat",
    icon: (
      <TabIcon>
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </TabIcon>
    ),
  },
```

Then, immediately after the `{activeTab === "files" && ( ... )}` block (ends near line 3260), add:

```jsx
          {activeTab === "chat" && (
            <div className="cpm-proj-main-body" style={{ padding: "16px 24px 24px" }}>
              <ChatTab project={project} isAdmin={!!member?.isAdmin} />
            </div>
          )}
```

- [ ] **Step 3: Register the tour anchor**

In `src/clubpm/tour/tourAnchors.js`, add after the `project.tab.files` line (:50):

```js
  "project.tab.chat":       { label: "Chat tab",             route: "/clubpm/projects/:id", note: "Sidebar project tab (AppShell)" },
```

In `docs/courses/ANCHORS.md`, add after the `project.tab.files` row (:63):

```markdown
| `project.tab.chat` | Chat tab&Dagger; | `/clubpm/projects/:id` |
```

- [ ] **Step 4: Run the anchor check**

```bash
node scripts/check-tour-anchors.js
```

Expected: passes. The anchor is rendered by **AppShell**, not `ProjectDetail` — `AppShell.jsx:135` emits `data-tour-id={item.tourId}` for each `NAV_TABS` entry, so the `tourId` string literal added in Step 2 is what the static scan sees. It must stay a literal; a template-interpolated id is invisible to the check.

- [ ] **Step 5: Grep for course prose that enumerates the tabs**

```bash
rg -n "Tasks, Files, Reports|tabs across the top|Files.*Reports.*AI" docs/courses/
```

For every hit, add Chat to the list so the written course matches the UI. If there are no hits, note that and move on.

- [ ] **Step 6: Build and commit**

```bash
npm run build
git add src/components/clubpm/chat/ChatTab.jsx src/pages/ClubPM/ProjectDetail.jsx src/clubpm/tour/tourAnchors.js docs/courses/ANCHORS.md
git commit -m "feat(slack-archive): Chat tab on ProjectDetail with tour anchor"
```

---

## Task 11: Styling

**Files:**
- Modify: `public/clubpm-theme.css` (append at the end)

**Interfaces:**
- Consumes: the class names emitted in Tasks 8–10.
- Produces: no JS interface.

- [ ] **Step 1: Append the chat styles**

Append to the end of `public/clubpm-theme.css`:

```css
/* === Slack chat archive (ProjectDetail → Chat tab) ================= */
/* Token names verified against the :root block at ~line 643. Note the `bg-`
   infix: --pm-bg-surface / --pm-bg-elevated exist; --pm-surface / --pm-elevated
   do NOT, and an undeclared custom property fails silently rather than
   erroring.
   The renderer deliberately avoids <span> and <p>: the blanket
   `.clubpm-app p, .clubpm-app span { color: inherit !important }` at ~line 969
   would strip color from every token. That is why plain text is a <label>. */

.cpm-chat-wrap { display: flex; flex-direction: column; gap: 12px; height: 100%; min-height: 0; }

.cpm-chat-toolbar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }

.cpm-chat-channel-select,
.cpm-chat-search input {
  background: var(--pm-bg-elevated);
  color: var(--pm-text-primary);
  border: 1px solid var(--pm-border);
  border-radius: 8px;
  padding: 7px 10px;
  font-family: var(--pm-font-body);
  font-size: 13px;
}
.cpm-chat-search { display: flex; gap: 6px; flex: 1; min-width: 180px; }
.cpm-chat-search input { flex: 1; }
.cpm-chat-search button,
.cpm-chat-backfill-btn {
  background: var(--pm-bg-elevated);
  color: var(--pm-text-secondary);
  border: 1px solid var(--pm-border);
  border-radius: 8px;
  padding: 7px 12px;
  cursor: pointer;
  font-size: 13px;
  display: inline-flex; align-items: center; gap: 6px;
}
.cpm-chat-search button:hover,
.cpm-chat-backfill-btn:hover { border-color: var(--pm-border-active); color: var(--pm-accent-teal); }

.cpm-chat-layout { display: flex; gap: 14px; min-height: 0; flex: 1; }
.cpm-chat-scroll {
  flex: 1; min-width: 0;
  overflow-y: auto;
  display: flex; flex-direction: column; gap: 2px;
  padding-right: 4px;
  max-height: 64vh;
}

.cpm-chat-msg { display: flex; gap: 10px; padding: 7px 8px; border-radius: 8px; }
.cpm-chat-msg:hover { background: var(--pm-bg-surface); }
.cpm-chat-msg--compact { padding: 5px 8px; }
.cpm-chat-msg--deleted { opacity: 0.55; font-style: italic; }

.cpm-chat-avatar {
  width: 34px; height: 34px; flex: 0 0 34px;
  border-radius: 8px; overflow: hidden;
  background: var(--pm-bg-elevated);
  display: grid; place-items: center;
  color: var(--pm-text-muted);
}
.cpm-chat-avatar img { width: 100%; height: 100%; object-fit: cover; }

.cpm-chat-msg-body { min-width: 0; flex: 1; }
.cpm-chat-msg-head { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.cpm-chat-author { color: var(--pm-text-primary); font-size: 13px; font-weight: 700; }
.cpm-chat-time,
.cpm-chat-edited { color: var(--pm-text-muted); font-size: 11px; }

.cpm-chat-text { color: var(--pm-text-secondary); font-size: 13.5px; line-height: 1.55; word-break: break-word; }
.cpm-chat-plain { color: var(--pm-text-secondary); }
.cpm-chat-mention { color: var(--pm-accent-teal); background: rgba(0,229,204,0.10); border-radius: 4px; padding: 0 3px; }
.cpm-chat-channel { color: var(--pm-accent-violet); }
.cpm-chat-link { color: var(--pm-accent-teal); text-decoration: underline; }
.cpm-chat-code,
.cpm-chat-emoji-name {
  font-family: var(--pm-font-mono); font-size: 12px;
  background: var(--pm-bg-overlay); color: var(--pm-accent-amber);
  border-radius: 4px; padding: 1px 5px;
}
.cpm-chat-codeblock {
  display: block; white-space: pre-wrap;
  font-family: var(--pm-font-mono); font-size: 12px;
  background: var(--pm-bg-overlay); color: var(--pm-text-primary);
  border: 1px solid var(--pm-border); border-radius: 8px;
  padding: 9px 11px; margin: 6px 0;
  overflow-x: auto;
}
.cpm-chat-emoji { width: 18px; height: 18px; vertical-align: -3px; }

.cpm-chat-files { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 7px; }
.cpm-chat-image { max-width: min(380px, 100%); height: auto; border-radius: 8px; border: 1px solid var(--pm-border); display: block; }
.cpm-chat-file {
  display: flex; align-items: center; gap: 9px;
  background: var(--pm-bg-elevated); border: 1px solid var(--pm-border);
  border-radius: 8px; padding: 8px 11px; text-decoration: none;
  color: var(--pm-text-secondary); max-width: 320px;
}
.cpm-chat-file:hover { border-color: var(--pm-border-active); }
.cpm-chat-file--gone { border-style: dashed; color: var(--pm-text-muted); }
.cpm-chat-file-name { color: var(--pm-text-primary); font-size: 12.5px; font-weight: 600; word-break: break-all; }
.cpm-chat-file-sub { color: var(--pm-text-muted); font-size: 11px; }

.cpm-chat-reactions { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
.cpm-chat-reaction {
  display: inline-flex; align-items: center; gap: 4px;
  background: var(--pm-bg-elevated); border: 1px solid var(--pm-border);
  border-radius: 11px; padding: 1px 8px; font-size: 11.5px;
}
.cpm-chat-reaction-count { color: var(--pm-text-muted); }

.cpm-chat-thread-btn,
.cpm-chat-older,
.cpm-chat-linkbtn {
  background: none; border: none; cursor: pointer;
  color: var(--pm-accent-teal); font-size: 12px;
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 0; font-family: var(--pm-font-body);
}
.cpm-chat-older { align-self: center; padding: 8px; }

.cpm-chat-drawer {
  width: 340px; flex: 0 0 340px;
  background: var(--pm-bg-surface);
  border: 1px solid var(--pm-border); border-radius: 10px;
  display: flex; flex-direction: column; min-height: 0;
}
.cpm-chat-drawer-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 11px 13px; border-bottom: 1px solid var(--pm-border);
  color: var(--pm-text-primary);
}
.cpm-chat-drawer-close { background: none; border: none; color: var(--pm-text-muted); cursor: pointer; font-size: 15px; }
.cpm-chat-drawer-body { overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 2px; }

.cpm-chat-banner {
  background: var(--pm-bg-elevated); border: 1px solid var(--pm-border);
  border-radius: 8px; padding: 8px 12px;
  color: var(--pm-text-secondary); font-size: 12.5px;
}
.cpm-chat-banner--error { border-color: var(--pm-accent-coral); color: var(--pm-accent-coral); }

.cpm-chat-empty {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 42px 20px; color: var(--pm-text-secondary); text-align: center;
}
.cpm-chat-empty i { font-size: 26px; color: var(--pm-text-muted); }
.cpm-chat-empty-sub { color: var(--pm-text-muted); font-size: 12.5px; }

@media (max-width: 900px) {
  .cpm-chat-layout { flex-direction: column; }
  .cpm-chat-drawer { width: 100%; flex: 1 1 auto; }
}
```

- [ ] **Step 2: Confirm the stylesheet is minified in the build**

```bash
npm run build 2>&1 | grep "\[minify-css\]"
```

Expected: a line for `clubpm-theme.css`. It is already in the `TARGETS` array of `scripts/minify-public-css.mjs`, so no change is needed — but the script *warns and skips* rather than failing, so read the log rather than assuming.

- [ ] **Step 3: Commit**

```bash
git add public/clubpm-theme.css
git commit -m "style(slack-archive): chat tab styles"
```

---

## Task 12: Admin storage-health surface

**Files:**
- Create: `src/components/clubpm/SlackArchivePanel.jsx`
- Modify: `src/pages/ClubPM/AdminView.jsx`

**Interfaces:**
- Consumes: `getChatStorageHealth(projectId)` (Task 8); `GET /api/projects/:projectId/chat/storage-health` (Task 5).
- Produces: `<SlackArchivePanel />`.

- [ ] **Step 1: Add a project-independent health endpoint**

The storage-health route added in Task 5 is project-scoped, but the counts it returns are global. Rather than making the admin page pick an arbitrary project, add a global admin route. In `backend/src/api/projectChat.ts`, append:

```ts
// ── GET /api/slack-archive/health ────────────────────────────
// Global counts for the admin page. Exported separately from the
// project-scoped route because the numbers are workspace-wide, and the admin
// page should not have to name an arbitrary project to see them.
export const slackArchiveAdminRouter = Router();

slackArchiveAdminRouter.get("/health", requireAuth, async (req: Request, res: Response) => {
  try {
    const member = await prisma.member.findUnique({
      where: { id: req.memberId! },
      select: { isAdmin: true },
    });
    if (!member?.isAdmin) return void res.status(403).json({ error: "Admin only" });
    res.json(await getStorageHealth());
  } catch (error) {
    console.error("slack-archive/health error:", error);
    res.status(500).json({ error: "Failed to read storage health" });
  }
});
```

In `backend/src/app.ts`, update the import and add the mount beside the other API mounts:

```ts
import { projectChatRouter, slackArchiveAdminRouter } from "./api/projectChat.js";
```

```ts
app.use("/api/slack-archive", slackArchiveAdminRouter);
```

- [ ] **Step 2: Add the client helper**

Append to `src/api/clubPmClient.js`:

```js
export function getSlackArchiveHealth() {
  return get("/api/slack-archive/health");
}
```

- [ ] **Step 3: Create the panel**

Create `src/components/clubpm/SlackArchivePanel.jsx`:

```jsx
import { useEffect, useState } from "react";
import { getSlackArchiveHealth } from "../../api/clubPmClient";

const LABELS = {
  SLACK_ONLY:    "Still in Slack",
  DRIVE:         "Mirrored to Drive",
  LOCAL:         "Mirrored to local disk",
  MIRROR_FAILED: "Mirror failed",
  UNAVAILABLE:   "Expired before archiving",
};

export default function SlackArchivePanel() {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getSlackArchiveHealth().then(setHealth).catch(() => setError("Could not load archive health."));
  }, []);

  if (error) return <div className="cpm-profile-card">{error}</div>;
  if (!health) return null;

  const counts = health.counts ?? {};
  const pending = counts.SLACK_ONLY ?? 0;
  const failed = counts.MIRROR_FAILED ?? 0;
  const local = counts.LOCAL ?? 0;

  return (
    <div className="cpm-profile-card">
      <h3 style={{ marginTop: 0 }}>Slack archive</h3>

      {/* The sweep falls back to disk rather than failing, so a disconnected
          Drive is easy to miss until files start expiring. Say it loudly. */}
      {!health.driveConnected && pending > 0 && (
        <div className="cpm-chat-banner cpm-chat-banner--error" style={{ marginBottom: 12 }}>
          <i className="fas fa-triangle-exclamation" aria-hidden="true" />{" "}
          Google Drive is not connected. {pending} attachment{pending === 1 ? "" : "s"} will be
          mirrored to local disk instead of Drive.
        </div>
      )}
      {failed > 0 && (
        <div className="cpm-chat-banner cpm-chat-banner--error" style={{ marginBottom: 12 }}>
          <i className="fas fa-triangle-exclamation" aria-hidden="true" />{" "}
          {failed} attachment{failed === 1 ? "" : "s"} failed to mirror after repeated attempts.
        </div>
      )}
      {local > 0 && health.driveConnected && (
        <div className="cpm-chat-banner" style={{ marginBottom: 12 }}>
          {local} attachment{local === 1 ? " is" : "s are"} on local disk from a period when Drive was unavailable.
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {Object.entries(LABELS).map(([key, label]) => (
          <div key={key} className="cpm-card" style={{ padding: "10px 14px", minWidth: 150 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--pm-text-primary)" }}>
              {counts[key] ?? 0}
            </div>
            <div style={{ fontSize: 12, color: "var(--pm-text-muted)" }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Mount it in `AdminView.jsx`**

Add the import beside the other panel imports in `src/pages/ClubPM/AdminView.jsx`:

```jsx
import SlackArchivePanel from "../../components/clubpm/SlackArchivePanel";
```

And add a section immediately after the existing `admin.integrations` section:

```jsx
      <section>
        <SlackArchivePanel />
      </section>
```

- [ ] **Step 5: Verify both build**

```bash
cd backend && npx tsc --noEmit
cd .. && npm run build
node scripts/check-tour-anchors.js
```

Expected: all three succeed.

- [ ] **Step 6: Commit**

```bash
git add backend/src/api/projectChat.ts backend/src/app.ts src/api/clubPmClient.js src/components/clubpm/SlackArchivePanel.jsx src/pages/ClubPM/AdminView.jsx
git commit -m "feat(slack-archive): admin storage-health panel"
```

---

## Manual verification (after Task 12)

Requires a real Slack workspace and the app reinstalled per Task 3 Step 7.

1. **Live ingest** — post in a linked channel; it appears in the Chat tab within a second (SSE).
2. **Edit** — edit that message in Slack; the tab shows the new text with `(edited)`.
3. **Delete** — delete it; the tab shows "This message was deleted in Slack", not a disappearance.
4. **Reactions** — add and remove a reaction; the count appears then disappears.
5. **Threads** — reply in a thread; the parent shows "N replies" and the drawer lists them.
6. **Bot messages** — trigger a bot post (e.g. `/pm status`); it must **not** appear.
7. **Attachments in a Bearer-only browser** — open the tab in Brave with cookies blocked. Images must render. This is the single most likely thing to be broken and invisible in Chrome.
8. **Backfill** — click "Import history" as an admin; the count climbs and older messages appear.
9. **Access control** — sign in as a member who is not on the project; the tab must 403 rather than render.
10. **Sweep** — temporarily call `sweepExpiringFiles(0)` from a scratch script against a freshly shared file; confirm the row moves to `DRIVE` (or `LOCAL` if Drive is disconnected) and that the image still renders afterwards through the same proxy URL.
