# Session prompts — Slack portal

Twenty-eight sessions, one per plan task. Paste one prompt per fresh Sonnet session, in order. Each
prompt names its own reading, its scope boundary, and its verification.

**Plan:** `docs/superpowers/plans/2026-09-10-slack-portal.md`
**Branch:** `feat/slack-portal` (already exists; it carries the plan)
**Alternative:** [`2026-09-10-slack-portal-PHASES.md`](./2026-09-10-slack-portal-PHASES.md) runs the same tasks as seven phase sessions.

| Session | Task | Scope | Weight | Human step after? |
|---|---|---|---|---|
| 1 | 1 | Prisma schema + migration (+ private-kind backfill SQL) | light | |
| 2 | 2 | Pure: scopes + conversation access | light | |
| 3 | 3 | OAuth scopes, token plumbing, manifest | medium | **Yes — reinstall Slack app, re-sign-in** |
| 4 | 4 | Archive policy (bot msgs) + ingest rewrite | heavy | |
| 5 | 5 | Membership mirror, events, auto-join, ignoreSelf | heavy | |
| 6 | 6 | Token-aware files, DM files off Drive, /uploads guard, backfill | heavy | |
| 7 | 7 | SSE: one filtered topic | light | |
| 8 | 8 | Conversation access middleware + project chat filter | medium | |
| 9 | 9 | chatDto extraction + read service | medium | |
| 10 | 10 | /api/chat read routes + mount + admin public backfill | heavy | **Yes — run public backfill after deploy** |
| 11 | 11 | Send rules + send service + write routes | heavy | |
| 12 | 12 | Client fns + leaf components | medium | |
| 13 | 13 | ChatConversation + ChatTab refactor | medium | |
| 14 | 14 | Composer + encoder | heavy | |
| 15 | 15 | Message actions, emoji, thread replies | heavy | |
| 16 | 16 | Block Kit renderer (backend) | medium | |
| 17 | 17 | Block Kit renderer (frontend) | light | |
| 18 | 18 | /clubpm/chat page + nav + anchors | medium | |
| 19 | 19 | DmInbox + DmPanel + admin panel | medium | |
| 20 | 20 | MembersView: project scope, Message, group DMs | heavy | |
| 21 | 21 | Project Members tab + ?tab= deep links | medium | |
| 22 | 22 | Styling | medium | |
| 23 | 23 | Pure ping rules | medium | |
| 24 | 24 | Ping delivery | heavy | |
| 25 | 25 | Read sync + mute route + roster hygiene | medium | |
| 26 | 26 | Notification UI | medium | |
| 27 | 27 | Constellation→Slack parity | medium | |
| 28 | 28 | Verification, cleanup, CLAUDE.md, PR | medium | **Yes — two-person E2E in the real workspace** |

**Safe to merge into one session:** 1+2, 7+8, 16+17, 23 alone only. **Never merge:** 3 with anything
(it ends in a human step); 4+5 (both rewrite Slack wiring); 18 or 21 with a neighbour (their
commits are gated on `check-tour-anchors.js`).

Every prompt below implies the same standing rules, which are in the plan's Global Constraints: read
`req.memberId` never `req.session`; Grep before Read on the big files; no `<span>`/`<p>` in
`chat/`; commit the regenerated `public/fa-subset.css` when you add an icon; and the gate is
`npm run build` at the root plus `cd backend && npx tsc --noEmit`, both clean before committing.

---

## Session 1 — Schema and migration

```
Execute Task 1 of docs/superpowers/plans/2026-09-10-slack-portal.md. First run
`git checkout feat/slack-portal`. Use the superpowers:executing-plans skill.

Read the plan header, Design decisions, Global constraints, and Task 1 in full.

Scope: backend/prisma/schema.prisma and one migration folder. Nothing else.

Critical:
- schema.prisma is ~2,600 lines. Grep the anchors the plan gives; never read it whole.
- Use `migrate dev --create-only`, then APPEND the UPDATE statement from Step 7 to the
  generated migration.sql BEFORE applying. Without it, existing private archive rows
  become readable by every member.
- Run `npx prisma generate` after applying, before trusting tsc.

Done when: the migration exists and contains the UPDATE, tsc and the root build are
clean, and one commit exists with Step 10's message.
```

---

## Session 2 — Pure scopes and access rules

```
Execute Task 2 of docs/superpowers/plans/2026-09-10-slack-portal.md on feat/slack-portal.
Use superpowers:executing-plans and superpowers:test-driven-development.

Read Design decisions D2 and D3, Global constraints, and Task 2.

Scope: four new files in backend/src/services/. No Prisma, no Slack imports in the two
modules.

Critical:
- Backend tests are standalone tsx scripts with the inline check() harness — NOT Jest.
  Run each with `cd backend && npx tsx src/services/<name>.test.ts`. See it FAIL first.
- slackConversationAccess.ts must not contain the string "isAdmin" anywhere, including
  comments — the test greps its own source. Unknown channel kinds fail CLOSED (private).

Done when: 13 and 20 checks pass, the gate is clean, and one commit exists.
```

---

## Session 3 — OAuth scopes, tokens, manifest

```
Execute Task 3 of docs/superpowers/plans/2026-09-10-slack-portal.md on feat/slack-portal.
Use superpowers:executing-plans.

Read the Operator steps section and Task 3.

Scope: backend/src/api/auth.ts, backend/src/services/slackUserTokenService.ts,
slack-manifest.yaml. auth.ts is the ONLY file allowed to touch req.session — don't add new
session reads.

Critical:
- /auth/me returns capabilities, never tokens or raw scopes' meaning. Keep the existing
  token-stripping destructure intact.
- userClientFor(…, { interactive: true }) must disable retries (rejectRateLimitedCalls +
  retries: 0). A user waiting on Send must never hang for 30 minutes.
- The manifest's user scope list must equal SLACK_USER_SCOPES exactly.

Done when: the gate is clean and it's committed. Then STOP and tell me to update the Slack
app from the manifest, reinstall it, and sign in again (plan Task 3 Step 8). Don't start
Task 4.
```

---

## Session 4 — Policy and ingest rewrite

```
Execute Task 4 of docs/superpowers/plans/2026-09-10-slack-portal.md on feat/slack-portal.
Use superpowers:executing-plans and superpowers:test-driven-development for the policy.

Read Design decisions D4, D7, D10, and Task 4 in full.

Scope: slackArchivePolicy.ts, its test, slackArchiveService.ts — all three are full
replacements given verbatim in the plan. slackBackfillService.ts gets at most a one-line
compile fix (Task 6 rewrites it).

Critical:
- isBot is written on CREATE only (plus forceHuman). An echo must never flip a human row
  to bot.
- lastMessageAt only moves forward (updateMany with lt) — backfill walks backwards.
- Ingest returns an IngestResult (including botId) and NEVER notifies — the caller does.
- Do not reintroduce the project-linked gate.

Done when: the policy test prints 18 passed, the gate is clean, and one commit exists.
```

---

## Session 5 — Membership mirror and event wiring

```
Execute Task 5 of docs/superpowers/plans/2026-09-10-slack-portal.md on feat/slack-portal.
Use superpowers:executing-plans.

Read D2, D3, Known limitations, and Task 5.

Scope: create slackMembershipService.ts; modify slack/events.ts, slack/bolt.ts,
slack/scheduler.ts. scheduler.ts and events.ts are large — Grep the anchors, and read only
the handler you are editing.

Critical:
- ignoreSelf: false means our bot's own posts now reach app.message and reaction_added —
  add BOTH guards (bot_id before the TODO prompt; bot user after applyReaction).
- member_left_channel's removeConversationMember must run BEFORE the leadership
  early-return.
- Import bolt lazily inside the membership service (`await import`) — never at module top.
- Crons go in scheduler.ts only. Confirm the App parameter's real name before using `app`.

Done when: the gate is clean and it's committed. If you can run the backend locally, post
in a DM and confirm SlackConversationMember gets two rows.
```

---

## Session 6 — Files, Drive rule, uploads guard, backfill

```
Execute Task 6 of docs/superpowers/plans/2026-09-10-slack-portal.md on feat/slack-portal.
Use superpowers:executing-plans.

Read D5, D6, D10, and Task 6 — especially the "Why this task exists" paragraph.

Scope: slackFileService.ts (+ test), slackBackfillService.ts (full replacement),
app.ts (one guard), projectChat.ts (two call-site lines).

Critical:
- Never mark a file UNAVAILABLE because no token could read it — only on a real
  file_not_found. Otherwise every DM attachment is written off on first view, and that
  can't be undone.
- The /uploads/slack guard MUST sit above the express.static("/uploads") mount.
- getBackfillStatus keeps its exact old return shape.
- Backfill never imports or calls anything notification-related.

Done when: slackFileService.test.ts passes (21 checks), the gate is clean, and it's
committed. Quick check if the backend runs: curl /uploads/slack/x/y → 404.
```

---

## Session 7 — One filtered SSE topic

```
Execute Task 7 of docs/superpowers/plans/2026-09-10-slack-portal.md on feat/slack-portal.
Use superpowers:executing-plans.

Read Task 7.

Scope: backend/src/api/sse.ts (full replacement), emitChat() in slackArchiveService.ts,
one listener in src/components/clubpm/NotificationBell.jsx.

Critical: private/DM events must be dropped until the member's conversation set has loaded
(fail closed). The stream's ?token= auth (streamAuth) and its mount order must not change —
run `cd backend && npx tsx src/appMountOrder.test.ts`.

Done when: the mount-order test and the gate pass, and it's committed.
```

---

## Session 8 — Conversation access middleware

```
Execute Task 8 of docs/superpowers/plans/2026-09-10-slack-portal.md on feat/slack-portal.
Use superpowers:executing-plans and superpowers:test-driven-development.

Read D2, D3 and Task 8.

Scope: create middleware/conversationAccess.ts (+ static test); modify
middleware/projectChatAccess.ts.

Critical: conversationAccess.ts must never contain "isAdmin" or "status(403)" — its test
greps the source. Denials are 404. The project-chat change is a deliberate behaviour change
(D3): private linked channels follow Slack membership, admins included.

Done when: conversationAccess (4) and projectChatAccess tests pass, the gate is clean, and
it's committed.
```

---

## Session 9 — chatDto and read service

```
Execute Task 9 of docs/superpowers/plans/2026-09-10-slack-portal.md on feat/slack-portal.
Use superpowers:executing-plans and superpowers:test-driven-development for slackReadService.

Read Task 9 and the "Slack ts ordering" global constraint.

Scope: create services/chatDto.ts and services/slackReadService.ts (+ test); trim
api/projectChat.ts to import from chatDto.

Critical:
- Never order Slack ts values by string or by float — use compareTs.
- Only PUBLIC channel names go into the format context.
- slackReadService must not import notificationCrud (it would create an import cycle in
  Task 24).

Done when: slackReadService.test.ts shows 8 passed, the gate is clean, and it's committed.
```

---

## Session 10 — /api/chat read routes

```
Execute Task 10 of docs/superpowers/plans/2026-09-10-slack-portal.md on feat/slack-portal.
Use superpowers:executing-plans.

Read Task 10, and the "Routes produced" block.

Scope: create api/chat.ts; modify app.ts (mount), appMountOrder.test.ts, api/projectChat.ts
(export fileProxyAuth; add the admin backfill-public route).

Critical:
- chatRouter has NO pathless requireAuth; every route except /files names requireAuth
  explicitly.
- Mount it directly below slackArchiveAdminRouter, above every bare "/api" router. The
  extended mount-order test (including the uploads guard check) must pass.
- The file route re-checks access against the FILE's conversation, not a URL param.

Done when: the mount-order test and the gate pass, and it's committed. Then tell me to
deploy and run "Import all public channels" once the admin button exists (Session 19), or
POST /api/slack-archive/backfill-public now.
```

---

## Session 11 — Writes as the member

```
Execute Task 11 of docs/superpowers/plans/2026-09-10-slack-portal.md on feat/slack-portal.
Use superpowers:executing-plans and superpowers:test-driven-development for slackSendRules.

Read D1, D7, D13, Task 11, and its "Error contract" line.

Scope: create slackSendRules.ts (+ test) and slackSendService.ts; append the write routes
to api/chat.ts.

Critical:
- HTTP 409 means ONLY "reconnect Slack". The rules test asserts no other code maps to 409.
- sendMessage writes the archive row from Slack's response with forceHuman BEFORE
  returning (D7).
- openDm rejects bot Members and more than 8 others.

Done when: slackSendRules.test.ts shows 19 passed, the gate is clean, and it's committed.
If the backend runs with a reconnected account: POST a message and see it in Slack as
yourself.
```

---

## Session 12 — Client + leaf components

```
Execute Task 12 of docs/superpowers/plans/2026-09-10-slack-portal.md on feat/slack-portal.
Use superpowers:executing-plans.

Read Task 12.

Scope: src/api/clubPmClient.js (append only), ChatFileAttachment.jsx, ChatThreadDrawer.jsx,
ChatMessage.jsx — small prop/import swaps only. Don't touch ChatTab.jsx.

Critical: never build a file URL by hand — conversationFileUrl() carries the ?token= for
Brave/Safari.

Done when: `npm run build` compiles with no new warnings, and it's committed.
```

---

## Session 13 — ChatConversation + ChatTab

```
Execute Task 13 of docs/superpowers/plans/2026-09-10-slack-portal.md on feat/slack-portal.
Use superpowers:executing-plans.

Read D11 and Task 13.

Scope: create ChatConversation.jsx; replace ChatTab.jsx. Both are given verbatim.

Critical:
- Helper functions used inside hooks live OUTSIDE the component (isPinnedEl, pinToBottom).
  The CI build treats react-hooks/exhaustive-deps warnings as errors.
- Read marks only fire for participants, tab visible, view pinned, not while searching.

Done when: the build is clean, and in `npm start` a project Chat tab loads, paginates and
opens threads. Then commit.
```

---

## Session 14 — Composer

```
Execute Task 14 of docs/superpowers/plans/2026-09-10-slack-portal.md on feat/slack-portal.
Use superpowers:executing-plans and superpowers:test-driven-development for the encoder.

Read Task 14.

Scope: create encodeOutgoing.js (+ Jest test) and ChatComposer.jsx; mount the composer in
ChatConversation.jsx.

Critical:
- Run the Jest test with `npx react-scripts test --watchAll=false <path>`, and see it fail
  first.
- All hooks in ChatComposer come before its early returns.
- `npm run build` regenerates public/fa-subset.css — commit it and public/webfonts with the
  components.

Done when: 9 encoder tests pass, the build is clean, and a message with an @mention sent
from the Chat tab arrives in Slack as you and pings the person. Then commit.
```

---

## Session 15 — Message actions and threads

```
Execute Task 15 of docs/superpowers/plans/2026-09-10-slack-portal.md on feat/slack-portal.
Use superpowers:executing-plans.

Read Task 15 and the icon/emoji global constraints.

Scope: create emojiShortcodes.js; modify ChatRichText.jsx (emoji branch only); replace
ChatMessage.jsx and ChatThreadDrawer.jsx.

Critical:
- No <span>/<p> in chat/.
- Emoji characters are message CONTENT only — every button icon stays Font Awesome.
- The existing ChatRichText.test.jsx must still pass.

Done when: both chat Jest tests pass, the build is clean (commit the regenerated icon
subset), and react / thread reply / edit / delete each mirror to Slack. Then commit.
```

---

## Session 16 — Block Kit (backend)

```
Execute Task 16 of docs/superpowers/plans/2026-09-10-slack-portal.md on feat/slack-portal.
Use superpowers:executing-plans and superpowers:test-driven-development.

Read D4 and Task 16.

Scope: create slackBlocks.ts (+ test); add `blocks` to toDto in chatDto.ts.

Critical: links are http(s)/mailto only, and image URLs are never forwarded (alt text
only) — both are tested.

Done when: 17 checks pass, the gate is clean, and it's committed.
```

---

## Session 17 — Block Kit (frontend)

```
Execute Task 17 of docs/superpowers/plans/2026-09-10-slack-portal.md on feat/slack-portal.
Use superpowers:executing-plans.

Scope: create ChatBlocks.jsx; one branch in ChatMessage.jsx. No <span>/<p>. Commit the
regenerated icon subset.

Done when: the build is clean and a bot digest renders as structured blocks with an APP
badge. Then commit.
```

---

## Session 18 — /clubpm/chat

```
Execute Task 18 of docs/superpowers/plans/2026-09-10-slack-portal.md on feat/slack-portal.
Use superpowers:executing-plans.

Read Task 18 and CLAUDE.md's "Keeping the Constellation Course In Sync".

Scope (a deliberate 5-file task): create pages/ClubPM/ChatPage.jsx; modify App.js,
AppShell.jsx, tourAnchors.js, docs/courses/ANCHORS.md — all in ONE commit.

Critical: `node scripts/check-tour-anchors.js` must pass. Icon classes are string
literals (use ternaries, not template interpolation). Rewrite any course prose that lists
the sidebar items.

Done when: the anchor check and build are clean, /clubpm/chat lists channels with
browse/join, and it's committed.
```

---

## Session 19 — DM inbox and panel

```
Execute Task 19 of docs/superpowers/plans/2026-09-10-slack-portal.md on feat/slack-portal.
Use superpowers:executing-plans.

Read D12 and Task 19.

Scope: create components/clubpm/members/DmInbox.jsx and DmPanel.jsx; modify
SlackArchivePanel.jsx (backfill-public button + disk banner wording).

Done when: the build is clean and it's committed. (The components render from Session 20.)
Then tell me to click "Import all public channels" on the Admin page after deploying.
```

---

## Session 20 — Members page DMs

```
Execute Task 20 of docs/superpowers/plans/2026-09-10-slack-portal.md on feat/slack-portal.
Use superpowers:executing-plans.

Read D12, D13 and Task 20.

Scope: src/pages/ClubPM/MembersView.jsx only (~490 lines — reading it whole is fine).

Critical:
- The open DM is ?dm= URL state; setDm must preserve other params (the project tab
  adds ?tab=).
- Keep the literal "admin.members" in source (conditional data-tour-id); run
  check-tour-anchors.js.
- Commit the regenerated icon subset.

Done when: the build is clean, Message on a card opens a docked DM that sends as you,
group select caps at 8, and reloading with ?dm= reopens it. Then commit.
```

---

## Session 21 — Project Members tab

```
Execute Task 21 of docs/superpowers/plans/2026-09-10-slack-portal.md on feat/slack-portal.
Use superpowers:executing-plans.

Read Task 21.

Scope: ProjectDetail.jsx (NEVER read it whole — ~3,600 lines; use only the plan's grep
anchors), tourAnchors.js, docs/courses/ANCHORS.md, in one commit.

Critical: add changeTab to the setProjectNav effect's dependency array, and pass
initialChannelId/initialThreadTs through to ChatTab.

Done when: the anchor check and build are clean, /clubpm/projects/<id>?tab=members shows
only that project's roster with working DMs, and switching tabs drops ?dm. Then commit.
```

---

## Session 22 — Styling

```
Execute Task 22 of docs/superpowers/plans/2026-09-10-slack-portal.md on feat/slack-portal.
Use superpowers:executing-plans.

Scope: APPEND the given block to public/clubpm-theme.css. Do not read the stylesheet.

Critical: verify every var(--…) in the new block is in the Global-constraints token list
before committing. Check the layouts at 1440 / 1100 / 800px as listed in Step 2.

Done when: every surface in Step 2 looks right at all three widths. Then commit.
```

---

## Session 23 — Ping rules

```
Execute Task 23 of docs/superpowers/plans/2026-09-10-slack-portal.md on feat/slack-portal.
Use superpowers:executing-plans and superpowers:test-driven-development.

Read D8 and D9, and Task 23.

Scope: create slackPings.ts (+ test). Pure — no imports beyond a type.

Done when: 20 checks pass, the gate is clean, and it's committed.
```

---

## Session 24 — Ping delivery

```
Execute Task 24 of docs/superpowers/plans/2026-09-10-slack-portal.md on feat/slack-portal.
Use superpowers:executing-plans.

Read D8, D9, D10, D11, and Task 24 including its "Import graph" line.

Scope: create slackNotifyService.ts; append to notificationCrud.ts; extend
slackReadService.ts; restructure the first try-block of app.message in events.ts.

Critical:
- slackReadService must NOT import notificationCrud or slackNotifyService (cycle).
- deliverSlackPings is called from events.ts only — never from backfill.
- Membership is ensured before pings are computed.
- Our own bot is detected by bot user id OR auth.test bot_id.

Done when: the gate is clean and the four manual checks in Step 5 pass (two accounts).
Then commit.
```

---

## Session 25 — Read sync and mute

```
Execute Task 25 of docs/superpowers/plans/2026-09-10-slack-portal.md on feat/slack-portal.
Use superpowers:executing-plans.

Read D11 and Task 25.

Scope: create slackReadSyncService.ts; add one cron to scheduler.ts; append the mute route
to api/chat.ts; add two fields to BOTH strip-lists in api/members.ts.

Critical: the sync is single-flight and bounded to 40 pairs at 1.2s pacing.

Done when: the gate is clean and reading a DM in the Slack app clears its Constellation
notification within ~2 minutes. Then commit.
```

---

## Session 26 — Notification UI

```
Execute Task 26 of docs/superpowers/plans/2026-09-10-slack-portal.md on feat/slack-portal.
Use superpowers:executing-plans.

Read Task 26.

Scope: NotificationBell.jsx, NotificationCenter.jsx, NotificationPreferences.jsx,
ChatConversation.jsx (mute button). Commit the regenerated icon subset.

Critical: the SSE "notification" handler replaces by id (DM notifications update in
place). metadata.link navigation comes BEFORE the old projectId fallback.

Done when: the build is clean and the three manual checks in Step 5 pass. Then commit.
```

---

## Session 27 — Delivery preferences made real

```
Execute Task 27 of docs/superpowers/plans/2026-09-10-slack-portal.md on feat/slack-portal.
Use superpowers:executing-plans and superpowers:test-driven-development for the routing.

Read D9, D14 and Task 27, including its behaviour-change note.

Scope: create notificationRouting.ts (+ test); replace createNotification in
notificationCrud.ts; move five call sites onto slackText in tasks.ts, projects.ts,
taskCompletionService.ts. tasks.ts is large — Grep the `type: "…"` anchors; don't read it
whole.

Critical:
- Copy each existing queueDm string EXACTLY into slackText, then delete that queueDm line.
- Remove a file's queueDm import only if no queueDm call remains in it.
- Every other queueDm caller in the codebase stays untouched.

Done when: 8 routing checks pass, the gate is clean, and the Dashboard-only / Slack-only
manual check passes. Then commit.
```

---

## Session 28 — Close-out

```
Execute Task 28 of docs/superpowers/plans/2026-09-10-slack-portal.md on feat/slack-portal.
Use superpowers:executing-plans, then superpowers:verification-before-completion and
superpowers:finishing-a-development-branch.

Read Task 28 and every D-numbered decision.

Scope: delete the superseded project-chat read routes and client functions (after the
rg check shows nothing uses them), update appMountOrder.test.ts and the app.ts comment,
and update CLAUDE.md as listed.

Critical: the 14-step end-to-end check needs a real workspace and two people. Walk me
through it step by step and record pass/fail — don't claim a step passed that we didn't run.

Done when: every backend test file, tsc, `npm test -- --watchAll=false` and `npm run build`
pass, it's committed, and a PR against main exists with the decisions, the two behaviour
changes, and the E2E results.
```
