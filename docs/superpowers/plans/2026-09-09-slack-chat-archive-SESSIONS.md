# Session prompts — Slack chat archive

Twelve sessions, one per plan task. Copy one prompt per fresh session, in order. Each is
self-contained: it names its own reading, its own scope boundary, and its own verification.

**Plan:** `docs/superpowers/plans/2026-09-09-slack-chat-archive.md`
**Spec:** `docs/superpowers/specs/2026-09-09-slack-chat-archive-design.md`
**Branch:** `feat/slack-chat-archive`

| Session | Task | Scope | Weight |
|---|---|---|---|
| 1 | 1 | Prisma schema + migration | light |
| 2 | 2 | Pure logic: mrkdwn parser, archive policy, tests | medium |
| 3 | 3 | Ingest service + Slack event wiring + manifest | heavy |
| 4 | 4 | Access control middleware + read API | heavy |
| 5 | 5 | File proxy, Drive mirror sweep, emoji cache | heavy |
| 6 | 6 | Resumable history backfill | medium |
| 7 | 7 | SSE live updates (backend + bell) | light |
| 8 | 8 | API client + rich-text/attachment renderers | medium |
| 9 | 9 | Message + thread drawer components | medium |
| 10 | 10 | Chat tab, ProjectDetail wire-up, tour/course sync | heavy |
| 11 | 11 | Styling | medium |
| 12 | 12 | Admin storage-health panel + manual verification | medium |

**Progress:** Sessions 1–4 are done (last commit `fb1e4cf3`). Start with Session 5.

Sessions 7 and 8 are the only pair small enough to merge safely. Do **not** merge 4+5 (Task 4
deliberately ships with a stub that Task 5 removes) or 10+11 (Task 10's commit is gated on
`check-tour-anchors.js`).

Two sessions hand work back to a human rather than finishing autonomously: Session 3 needs the Slack
app reinstalled from the updated manifest (a console step), and Session 12's manual verification
needs a real Slack workspace.

Backend exports the plan depends on were verified present when these prompts were written:
`verifyBearerToken` (`backend/src/api/auth.ts:93`), `getBotUserId`
(`backend/src/services/memberService.ts:165`), `activityBus`
(`backend/src/services/activityService.ts:9`), `getProjectsForChannel`
(`backend/src/services/projectService.ts:122`), and `ensureClubPmRootFolder` / `createDriveFolder` /
`uploadStreamToDrive` / `streamDriveFile` in `backend/src/services/driveService.ts`.

---

## Session 1 — Schema and migration

```
Execute Task 1 of docs/superpowers/plans/2026-09-09-slack-chat-archive.md, on branch
feat/slack-chat-archive. Use the superpowers:executing-plans skill.

Read the plan's header, Global Constraints, File Structure, and Task 1 in full before starting.
Read spec §3, §3.1 and §3.3 (docs/superpowers/specs/2026-09-09-slack-chat-archive-design.md)
for why the archive is keyed on slackChannelId rather than projectId.

Scope: backend/prisma/schema.prisma and one generated migration. Nothing else. No services,
no routes, no React.

Critical:
- schema.prisma is 1,661 lines. Grep for model and enum names; do not read it whole. Append the
  new block at the end.
- Copy the models from the plan verbatim, including the doc comments. The comment explaining
  channel-keying is the thing that stops a future reader from "fixing" it into projectId.
- `npx prisma migrate dev --name slack_chat_archive` must actually run and produce a folder under
  backend/prisma/migrations/. A schema edit with no migration passes every local check and only
  500s in production.
- Then run `npx prisma generate` before trusting tsc. A stale client reports phantom errors about
  prisma.slackMessage not existing, in correct code.

Done when: the migration folder exists, `cd backend && npx tsc --noEmit` is clean, and one commit
exists with the message from Task 1 Step 5.
```

---

## Session 2 — Pure logic: parser and policy

```
Execute Task 2 of docs/superpowers/plans/2026-09-09-slack-chat-archive.md, on branch
feat/slack-chat-archive. Use the superpowers:executing-plans skill, and
superpowers:test-driven-development for each of the two units.

Read the plan's Global Constraints and Task 2 in full, plus spec §4, §4.1, §5.1 and §2.1.

Scope: four new files under backend/src/services/ — slackMessageFormat.ts, slackArchivePolicy.ts,
and a .test.ts beside each. Both modules are pure: no Prisma import, no Slack import, no I/O.
Nothing else in the repo changes.

Follow the plan's step order exactly: write the failing test, RUN it and see it fail with
"Cannot find module", then implement, then see it pass. Do not write implementation first.

Critical:
- Backend tests are standalone tsx scripts, NOT Jest. There is no `npm test` in backend/. Run each
  as `cd backend && npx tsx src/services/<name>.test.ts` using the inline check() harness given in
  the plan. tsconfig already excludes *.test.ts from the production build.
- HTML-entity unescaping MUST run after angle-bracket parsing, not before. Reversing the order
  makes a message containing &lt;http://x&gt; parse as a real link.
- Unclosed backticks must be restored as literal text, so one stray backtick cannot swallow the
  rest of a message.
- shouldArchive() is the ONE place bot messages are rejected. Do not add a second bot check
  anywhere later; anything that needs the decision imports this predicate.
- The parser runs at READ time on raw stored mrkdwn, which is why improving it later never needs a
  backfill. Do not "optimize" by storing tokens.

Done when: both test files print "N passed, 0 failed" (15 and 12 respectively),
`cd backend && npx tsc --noEmit` is clean, and one commit exists with the message from Step 9.
```

---

## Session 3 — Ingest service and Slack event wiring

```
Execute Task 3 of docs/superpowers/plans/2026-09-09-slack-chat-archive.md, on branch
feat/slack-chat-archive. Use the superpowers:executing-plans skill.

Read the plan's Global Constraints and Task 3 in full, plus spec §5, §5.2, §5.3 and §3.4.

Scope: create backend/src/services/slackArchiveService.ts; modify backend/src/slack/events.ts
(app.message at ~:244, reaction_added at ~:271, plus a new reaction_removed handler) and
slack-manifest.yaml. Do not touch the read API, the file service, or React.

Already verified present, do not go looking for them: getBotUserId is exported from
backend/src/services/memberService.ts:165, activityBus from
backend/src/services/activityService.ts:9, getProjectsForChannel from
backend/src/services/projectService.ts:122.

Critical:
- NEVER call memberService.resolveSlackMember() from ingest. It CREATES Member rows, so every
  guest and non-member who posts would be added to the club roster and to assignee pickers. Look
  members up read-only; memberId stays null when there is no match.
- In app.message, the ingest call goes FIRST, in its own try/catch, ahead of the existing
  TODO/ACTION logic in its own try/catch. Two independent error boundaries in both directions: an
  archive bug must not break the TODO prompt that ships today, and a TODO bug must not lose a
  message. Preserve the existing TODO behaviour byte-for-byte — you are wrapping it, not rewriting it.
- Reply counts are RECOMPUTED on the parent row, never incremented. Live ingest and backfill both
  write the same rows and an increment would double-count.
- On an edit, update metadata only — never reset a file row's `storage`. A re-delivered event must
  not undo a completed Drive mirror.
- Applying a delete or reaction for a ts that was never stored updates zero rows. That is correct
  (bot messages), not an error to handle.
- Author and channel-link lookups are cached; ingest runs on every message in every channel the bot
  is in.

Manual step you cannot do from here: Step 7 requires reinstalling the Slack app from the updated
manifest. Do the code, then tell the user in your final message that reaction_removed events and
emoji.list stay dead until they paste the manifest and Reinstall to Workspace. Everything else
works without it.

Done when: `cd backend && npx tsc --noEmit` is clean and one commit exists with the message from
Step 6.
```

---

## Session 4 — Access control and read API

```
Execute Task 4 of docs/superpowers/plans/2026-09-09-slack-chat-archive.md, on branch
feat/slack-chat-archive. Use the superpowers:executing-plans skill, and
superpowers:test-driven-development for the channel-union unit.

Read the plan's Global Constraints and Task 4 in full, plus spec §7 and §8.

Scope: create backend/src/middleware/projectChatAccess.ts (+ .test.ts) and
backend/src/api/projectChat.ts; modify backend/src/app.ts to mount the router. No file proxy in
this task — that is Task 5.

Critical:
- Every handler reads req.memberId. NEVER req.session. Session reads are undefined for
  Bearer-authenticated clients (Brave, Safari) and break them silently; this exact bug class has
  been found in 13 backend files. Only auth.ts may touch req.session.
- unionChannelIds is where a mistake leaks another project's private conversation, which is why it
  is extracted and tested directly. project.slackChannel is a NAME, not an id — never treat it as
  one; that would silently widen the read scope.
- The mount order is load-bearing: app.use("/api/projects", projectChatRouter) goes IMMEDIATELY
  BEFORE app.use("/api/projects", projectsRouter) at app.ts:~129. projectsRouter attaches a
  pathless requireAuth (api/projects.ts:37) that would 401 Task 5's ?token= image requests before
  they ever reached this router. Keep the comment explaining it.
- Task 4 ends with a DELIBERATE stub: buildFormatContext's last lines become
  `return { memberNames, emojiUrls: {} };` with the dynamic import deleted, because
  slackFileService.js does not exist until Task 5. Do this — it is Step 7, not a workaround — and
  do not stub anything else to make tsc pass.
- The ChatMessageDto `files[].id` is the SLACK file id, not the row id. Tasks 5 and 8 both index on
  that. Getting it wrong makes every attachment 404 in a way that looks like an auth bug.

Done when: the union test passes via `npx tsx src/middleware/projectChatAccess.test.ts`,
`cd backend && npx tsc --noEmit` is clean (with the Step 7 stub in place), and one commit exists
with the message from Step 8.
```

---

## Session 5 — File proxy, Drive mirror sweep, emoji cache

```
Execute Task 5 of docs/superpowers/plans/2026-09-09-slack-chat-archive.md, on branch
feat/slack-chat-archive. Use the superpowers:executing-plans skill, and
superpowers:test-driven-development for the storage state machine.

Read the plan's Global Constraints and Task 5 in full, plus spec §6, §6.1 through §6.5, and §8.1.

Scope: create backend/src/services/slackFileService.ts (+ .test.ts); add the file proxy and
storage-health routes to backend/src/api/projectChat.ts; restore the emoji lookup stubbed in
Task 4; register two crons in backend/src/slack/scheduler.ts. No React.

Already verified present in backend/src/services/driveService.ts, with these exact names:
ensureClubPmRootFolder (:346), createDriveFolder (:295), uploadStreamToDrive (:372),
streamDriveFile (:455). verifyBearerToken is exported from backend/src/api/auth.ts:93.

Critical:
- The proxy route must NOT sit behind requireAuth. It authenticates itself: req.memberId first,
  then a ?token= query param via verifyBearerToken. An <img> tag cannot send an Authorization
  header, so without this every image in the archive is broken in Brave and Safari and fine in
  Chrome — invisible to whoever tests it.
- The proxy still scopes to the project's own channelIds and 404s otherwise. It serves actual
  private content, so it gets the same check as the read routes, not a lighter one.
- MIRROR_CUTOFF_DAYS = 60. Not 75, not 90. The 30-day margin is the whole tolerance for a cron
  outage, a Drive quota error, or a revoked credential.
- SlackFileStorage mixes locations with outcomes: MIRROR_FAILED still streams from Slack — the
  copy failed, the file is still there. Only UNAVAILABLE means there is nothing to serve.
- The sweep must fail loudly (spec §6.4): record mirrorError and mirrorAttempts, stop after
  MAX_MIRROR_ATTEMPTS, and surface counts through getStorageHealth. A silent sweep failure is data
  loss on a 30-day fuse.
- Cron times are 03:40 and 03:50, deliberately clear of the existing 03:00–03:30 cluster (vault
  temp sweep, notification cleanup, auto-archive nudges). Add them in scheduler.ts only — that file
  is the single home for crons.
- Step 6 restores the real emoji lookup in buildFormatContext. Do not skip it; Task 4 left it
  stubbed on purpose.
- The dev database has no Drive credential, so the Drive branch cannot be exercised locally. Test
  the state machine's decisions, not Drive itself, and say so rather than claiming end-to-end
  verification.

Done when: the state-machine test passes, `cd backend && npx tsc --noEmit` is clean, and one commit
exists with the message from Step 8.
```

---

## Session 6 — Resumable history backfill

```
Execute Task 6 of docs/superpowers/plans/2026-09-09-slack-chat-archive.md, on branch
feat/slack-chat-archive. Use the superpowers:executing-plans skill.

Read the plan's Global Constraints and Task 6 in full, plus spec §9.

Scope: create backend/src/services/slackBackfillService.ts and add two routes to
backend/src/api/projectChat.ts. Nothing else.

Critical:
- There is deliberately NO unit test in this task. The plan says why: both behaviours are I/O
  sequencing against Postgres and the Slack API, and the tsx harness has no DB and no Slack mock,
  so a test would only assert against stubs it also defines. Do not add one to feel thorough — read
  the paragraph under Interfaces before deciding otherwise.
- Idempotency is structural: @@unique([slackChannelId, ts]) plus `update: {}` on every upsert.
  Replay is free and must never clobber a live-ingested row — an update body that writes fields
  would let a backfill overwrite a newer edit.
- Reuse ensureChannelArchive, resolveAuthor and shouldArchive from Task 3. Do not reimplement the
  bot filter or author resolution here; the second copy is how the two paths drift.
- backfillCursor is persisted per page so a crash resumes rather than restarting. Write it as you
  go, not at the end.
- Both routes read req.memberId, never req.session, and sit behind requireProjectChatRead.

Done when: `cd backend && npx tsc --noEmit` is clean and one commit exists with the message from
Step 3. Backfill itself is verified manually in Session 12 against a real workspace.
```

---

## Session 7 — Live updates over SSE

```
Execute Task 7 of docs/superpowers/plans/2026-09-09-slack-chat-archive.md, on branch
feat/slack-chat-archive. Use the superpowers:executing-plans skill.

Read the plan's Global Constraints and Task 7 in full, plus spec §10.

Scope: two files — backend/src/api/sse.ts and src/components/clubpm/NotificationBell.jsx (the SSE
block at ~:190-240). Small task; resist widening it.

Critical:
- Reuse the ONE existing EventSource. Do not open a second stream: the ?token= auth path, the
  heartbeat, and the cleanup all already work on this one, and a second connection would need all
  three rebuilt.
- Channel subscriptions resolve ONCE at connect time. A member added to a project mid-stream sees
  nothing until reconnect, and that is the accepted tradeoff — keep the comment saying so.
- Every listener added must be removed in the same cleanup path as the existing ones, or a
  reconnect leaks emitter handlers on the server.
- The bell re-broadcasts as a window CustomEvent named clubpm:slack-message, because the chat tab
  is not always mounted. Same idiom as clubpm:reward-granted directly above it. Wrap the JSON.parse
  in try/catch and ignore malformed events.
- The topic string is `slack-chat:${channelId}` and must match what Task 3 emits exactly.

Done when: `cd backend && npx tsc --noEmit` is clean, `npm run build` at the repo root succeeds,
and one commit exists with the message from Step 4.

Note: `npm test` currently has one pre-existing failure (src/clubpm/loadClubPmTheme.test.js expects
?v=1, the loader sends ?v=2) plus a long-broken App.test.js. Neither is yours. Verify with
npm run build.
```

---

## Session 8 — API client and leaf renderers

```
Execute Task 8 of docs/superpowers/plans/2026-09-09-slack-chat-archive.md, on branch
feat/slack-chat-archive. Use the superpowers:executing-plans skill.

Read the plan's Global Constraints and Task 8 in full, plus spec §4.1, §8.1, §11.2 and §11.3.

Scope: append helpers to src/api/clubPmClient.js; create src/components/clubpm/chat/ChatRichText.jsx
and ChatFileAttachment.jsx. No tab, no ProjectDetail, no CSS file changes.

Critical:
- ChatRichText.jsx must contain NO <span> and NO <p>, anywhere. public/clubpm-theme.css:969 is
  `.clubpm-app p, .clubpm-app span { color: inherit !important }` — a blanket !important that no
  selector can outrank. A token rendered as a <span> silently loses its colour and every mention,
  link and code fragment reads as plain body text. Use <a>, <code>, <b>, <i>, <s>, <div>, <label>.
  Plain text is a <label> on purpose.
- Attachment URLs come from chatFileUrl() only. Never hand-build the path in a component: the
  helper is what appends the ?token= query param, and without it every image is broken for
  cookie-blocked browsers and fine in Chrome.
- The file id in the DTO is the Slack file id — pass it straight through.
- Class names must match what Task 11 will style (cpm-chat-*). Pick them from the plan verbatim;
  ClubPM CSS has a long history of styling class names no component renders any more.
- Handle the empty/missing tokens array by rendering nothing, not by crashing.

Done when: `npm run build` at the repo root succeeds and one commit exists with the message from
Step 4.
```

---

## Session 9 — Message and thread components

```
Execute Task 9 of docs/superpowers/plans/2026-09-09-slack-chat-archive.md, on branch
feat/slack-chat-archive. Use the superpowers:executing-plans skill.

Read the plan's Global Constraints and Task 9 in full, plus spec §11 and §11.1.

Scope: create src/components/clubpm/chat/ChatMessage.jsx and ChatThreadDrawer.jsx. Consume
ChatRichText, ChatFileAttachment and getChatThread from Task 8. Do not modify ProjectDetail.jsx —
that is Task 10, and keeping it out of these two files is an explicit spec goal (§11.1).

Critical:
- Deleted messages render a tombstone ("This message was deleted in Slack"), never a
  disappearance. The archive records that something was said and removed; that is the point of
  keeping the row.
- Read-only. No composer, no reply box, no reaction buttons anywhere in these components. Posting
  from the web is a later pass.
- If ChatThreadDrawer uses position: fixed, check where it actually lands in the browser before
  calling it done. ClubPM panels sit inside a transformed ancestor (the reveal/stagger animation),
  which makes that ancestor the containing block for fixed children — modals land inside their
  panel instead of the viewport and drags miss the cursor. Either portal it to <body> or verify it
  visually; do not assume from reading the CSS.
- Guard the async thread fetch with a cancelled flag in the effect cleanup. Clicking two threads
  quickly must not let the slower response overwrite the newer one.
- Reuse the cpm-chat-* class names the plan specifies; Task 11 styles exactly those.

Done when: `npm run build` at the repo root succeeds and one commit exists with the message from
Step 3.
```

---

## Session 10 — Chat tab, wire-up, and tour/course sync

```
Execute Task 10 of docs/superpowers/plans/2026-09-09-slack-chat-archive.md, on branch
feat/slack-chat-archive. Use the superpowers:executing-plans skill.

Read the plan's Global Constraints and Task 10 in full, plus spec §11, §11.1 and §11.4, and the
"Keeping the Constellation Course In Sync" section of CLAUDE.md.

Scope: create src/components/clubpm/chat/ChatTab.jsx; modify src/pages/ClubPM/ProjectDetail.jsx
(NAV_TABS at :158, tab render near :3251), src/clubpm/tour/tourAnchors.js (:49-53), and
docs/courses/ANCHORS.md (:62-66) — plus any course step file the Step 5 grep turns up.

This task touches 4-5 files on purpose. CLAUDE.md requires the tab registration, tourAnchors.js,
ANCHORS.md and affected step files to land in the SAME commit, because
scripts/check-tour-anchors.js fails the build otherwise. Splitting them to satisfy the ≤4-file
guideline breaks the harder rule. Do not split.

Critical:
- ProjectDetail.jsx is 3,613 lines. Grep for NAV_TABS and the activeTab === "files" block; do not
  read it whole. Your edits there are two small insertions — a tab entry and a render branch.
- The tourId must be a plain string literal. check-tour-anchors.js is a STATIC scan: a
  template-interpolated id is invisible to it, and a green run also does not prove the element ever
  mounts. The anchor is rendered by AppShell.jsx:135, not by ProjectDetail.
- The tab subscribes to the window event clubpm:slack-message from Task 7, and must remove its
  listener on unmount.
- Still read-only: channel picker, message list, search, thread drawer, and an admin-only "Import
  history" button. No composer.
- Step 5's grep over docs/courses/ is not optional. Course prose enumerates the tabs in plain
  English and goes stale silently. If there are genuinely no hits, say so explicitly rather than
  skipping the step.

Done when: `node scripts/check-tour-anchors.js` passes, `npm run build` succeeds, and one commit
exists with the message from Step 6 containing all the files above together.
```

---

## Session 11 — Styling

```
Execute Task 11 of docs/superpowers/plans/2026-09-09-slack-chat-archive.md, on branch
feat/slack-chat-archive. Use the superpowers:executing-plans skill.

Read the plan's Global Constraints and Task 11 in full, plus spec §11.3.

Scope: append one block to the end of public/clubpm-theme.css. Nothing else — no JSX changes. If a
style seems to need a markup change, note it and finish the CSS; do not reopen Tasks 8-10.

Critical:
- public/clubpm-theme.css is 20,529 lines. Grep, never read it whole. Append at the end.
- Use ONLY tokens that are actually declared. Verified present in the :root block at
  clubpm-theme.css:643-670: --pm-bg-base, --pm-bg-surface, --pm-bg-elevated, --pm-bg-overlay,
  --pm-accent-teal, --pm-accent-amber, --pm-accent-coral, --pm-accent-violet, --pm-text-primary,
  --pm-text-secondary, --pm-text-muted, --pm-border, --pm-border-active, --pm-shadow-card,
  --pm-font-display, --pm-font-body, --pm-font-mono. --pm-surface and --pm-elevated DO NOT EXIST,
  despite what CLAUDE.md's token list says — the real names carry the `bg-` infix. An undeclared
  custom property fails silently rather than erroring, so this is invisible until someone looks at
  the page.
- Do not try to style <p> or <span>: .clubpm-app p, .clubpm-app span { color: inherit !important }
  at ~:969 beats every selector. That rule is why the renderer emits <label> for plain text — keep
  the explanatory comment the plan puts at the top of the block.
- Style only class names that Tasks 8-10 actually render. Grep src/components/clubpm/chat/ for each
  selector you write.
- Step 2 is a real check, not a formality: run `npm run build 2>&1 | grep "\[minify-css\]"` and
  read the line for clubpm-theme.css. The minifier warns and skips rather than failing, so a
  missing target never surfaces as a build error.

Done when: the minify line for clubpm-theme.css appears in the build log, `npm run build` succeeds,
and one commit exists with the message from Step 3.
```

---

## Session 12 — Admin panel and final verification

```
Execute Task 12 of docs/superpowers/plans/2026-09-09-slack-chat-archive.md, then walk the plan's
"Manual verification" section. Branch: feat/slack-chat-archive. Use the superpowers:executing-plans
skill, and superpowers:verification-before-completion before making any completion claim.

Read the plan's Global Constraints, Task 12, and the Manual verification list in full, plus
spec §6.3 and §12.

Scope: add the global health route + router export to backend/src/api/projectChat.ts, mount it in
backend/src/app.ts, add one client helper to src/api/clubPmClient.js, create
src/components/clubpm/SlackArchivePanel.jsx, and mount it in src/pages/ClubPM/AdminView.jsx.

Critical:
- The new /api/slack-archive/health route checks isAdmin itself via req.memberId — never
  req.session — and is mounted at its own path, not under /api/projects. It exists separately from
  the project-scoped route because the counts are workspace-wide and the admin page should not have
  to name an arbitrary project.
- The panel surfaces the sweep's failure counts. Do not render MIRROR_FAILED as a neutral state:
  it is the 30-day fuse burning, and a panel that makes it look fine defeats the point of building
  it.
- Same CSS rules as everywhere else in this feature: declared --pm-bg-* / --pm-text-* tokens only,
  no <p> or <span> for coloured text.

Then run the 10 manual verification steps. They need a real Slack workspace and the app reinstalled
from Task 3's manifest — if you cannot reach one, run every step you can, and report exactly which
you could not run and why. Do not describe an unrun step as passing.

Step 7 is the one most likely to be broken and invisible: open the Chat tab in Brave with cookies
blocked and confirm images render. That is the Bearer-token ?token= path, and it looks perfect in
Chrome either way.

Done when: `cd backend && npx tsc --noEmit`, `npm run build`, and
`node scripts/check-tour-anchors.js` all pass; one commit exists with the message from Step 6; and
you have reported the manual verification results step by step, marking anything unrun as unrun.
```
