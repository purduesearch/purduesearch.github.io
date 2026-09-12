# Phase prompts — Slack portal

Seven phase-level prompts, one per Part of the plan. Paste each into a **fresh** session, in order.
Each session acts as a *controller*: it dispatches one fresh subagent per task
(superpowers:subagent-driven-development), reviews the result, runs the gate, and commits. The
controller's own context therefore stays small, even for Part D's seven tasks.

If you would rather run one task per session instead, use
[`2026-09-10-slack-portal-SESSIONS.md`](./2026-09-10-slack-portal-SESSIONS.md). Both files describe
the same 28 tasks; pick one and don't mix them within a phase.

**Plan:** `docs/superpowers/plans/2026-09-10-slack-portal.md`
**Branch:** `feat/slack-portal` (already exists; it carries the plan)

| Phase | Plan part | Tasks | Ends with a human step? |
|---|---|---|---|
| 1 | A — Foundations | 1–3 | **Yes** — reinstall Slack app, everyone re-signs in |
| 2 | B — Ingest every conversation | 4–7 | No |
| 3 | C — Conversation API | 8–11 | No (the public backfill waits for Phase 5's admin button) |
| 4 | D — Chat UI | 12–18 | No |
| 5 | E — DMs on the Members page | 19–22 | **Yes** — deploy, click "Import all public channels" |
| 6 | F — Notification sync | 23–27 | No |
| 7 | G — Close-out | 28 | **Yes** — two-person end-to-end check, then PR |

## Rules every phase prompt relies on

These are restated in every prompt so each one stands alone:

- **One subagent per task**, handed that task's full text from the plan plus the plan's *Design
  decisions* and *Global constraints*. The subagent never reads the whole plan.
- **Order is strict.** A task starts only after the previous task's gate passed and its commit
  exists.
- **Gate after every task:** `npm run build` at the repo root and `cd backend && npx tsc --noEmit`,
  plus every test file the task names. Nothing is committed on a red gate.
- **Verify, don't trust.** After each subagent finishes, the controller re-runs the gate itself
  and reads `git show --stat HEAD` to confirm only that task's listed files changed.
- **Stop, don't improvise.** If a task's anchor text isn't found, a test won't go green after two
  fix attempts, or the plan contradicts the code, stop and report. Don't redesign.

---

## Phase 1 — Part A: Foundations (Tasks 1–3)

```
You are the controller for Phase 1 of the Slack portal. Plan:
docs/superpowers/plans/2026-09-10-slack-portal.md. Branch: feat/slack-portal
(`git checkout feat/slack-portal && git pull --ff-only` if it has a remote).

Use superpowers:subagent-driven-development. Read ONLY these parts of the plan yourself:
the header, "Design decisions", "Global constraints", "Operator steps", "Task map", and
Tasks 1–3. Do not read other tasks.

Run Tasks 1, 2, 3 in order. For each task, dispatch ONE fresh subagent and give it:
(a) the full text of that task, copied verbatim from the plan, (b) the Design decisions
and Global constraints sections, and (c) this instruction: "Implement exactly this task,
follow its steps in order (tests first where the task says so), run its gate, and commit
with the task's commit message. Do not touch files the task doesn't list."

After each subagent returns:
1. Re-run the gate yourself: `npm run build` (root) and `cd backend && npx tsc --noEmit`,
   plus the task's test files (`cd backend && npx tsx <file>`).
2. `git show --stat HEAD` — confirm only the task's files changed and the message matches.
3. If anything fails, send the subagent back once with the exact failure. If it still
   fails, STOP and report.

Phase-specific must-knows:
- Task 1: the migration must be made with `--create-only`, and the UPDATE from Step 7
  appended BEFORE applying. Then `npx prisma generate`.
- Task 2: slackConversationAccess.ts must not contain the string "isAdmin", even in
  comments — its own test greps for it.
- Task 3: interactive user clients must not retry (rejectRateLimitedCalls + retries: 0).

When Task 3 is committed, STOP. Don't start Phase 2. Tell me exactly what to do next:
update the Slack app from slack-manifest.yaml, Reinstall to Workspace (a workspace admin
approves the new user scopes), sign out and back in, and confirm GET /auth/me shows
slackCapabilities.post === true. Also report whether Slack accepted member_joined_channel /
member_left_channel as user events (Task 3 Step 8).
```

---

## Phase 2 — Part B: Ingest every conversation (Tasks 4–7)

```
You are the controller for Phase 2 of the Slack portal. Plan:
docs/superpowers/plans/2026-09-10-slack-portal.md, on branch feat/slack-portal.
Precondition: Phase 1 is committed, and I have reinstalled the Slack app and signed in
again. If `git log --oneline -5` doesn't show the Task 3 commit, STOP.

Use superpowers:subagent-driven-development. Read ONLY the header, "Design decisions",
"Global constraints", and Tasks 4–7.

Run Tasks 4, 5, 6, 7 in order. For each task, dispatch ONE fresh subagent with the task's
full text verbatim plus the Design decisions and Global constraints sections, and the
instruction: "Implement exactly this task in order, tests first where it says so, run
its gate, commit with its message, touch only its listed files."

After each: re-run the gate yourself (root `npm run build`, `cd backend && npx tsc
--noEmit`, and the task's tsx tests), check `git show --stat HEAD`, send back once on
failure, then STOP and report if it still fails.

Phase-specific must-knows (repeat them to the relevant subagent):
- Task 4: three files are full replacements given verbatim. isBot is set on create
  only (plus forceHuman); lastMessageAt only moves forward; ingest never notifies.
- Task 5: ignoreSelf becomes false — BOTH bot guards in events.ts are mandatory.
  removeConversationMember runs before the leadership early-return. Import bolt lazily
  in the membership service. Confirm scheduler.ts's App parameter name first.
- Task 6: never mark a file UNAVAILABLE just because no token could read it. The
  /uploads/slack guard goes ABOVE the static /uploads mount. getBackfillStatus keeps its
  exact old shape. Backfill never touches notifications.
- Task 7: non-public events are dropped until the member's conversation set has loaded.
  Run `cd backend && npx tsx src/appMountOrder.test.ts`.

Finish with a summary: the four commits, test results, and anything you had to deviate
on (there should be nothing).
```

---

## Phase 3 — Part C: Conversation API (Tasks 8–11)

```
You are the controller for Phase 3 of the Slack portal. Plan:
docs/superpowers/plans/2026-09-10-slack-portal.md, on branch feat/slack-portal.
Precondition: the Task 7 commit exists. Otherwise STOP.

Use superpowers:subagent-driven-development. Read ONLY the header, "Design decisions",
"Global constraints", and Tasks 8–11.

Run Tasks 8, 9, 10, 11 in order, one fresh subagent each, same hand-off as always:
the task's full text verbatim, plus Design decisions and Global constraints, plus
"implement exactly this, tests first where stated, gate, commit with its message, only
its files". After each: re-run the gate and the task's tests yourself, check
`git show --stat HEAD`, one retry on failure, then STOP and report.

Phase-specific must-knows:
- Task 8: conversationAccess.ts must never contain "isAdmin" or "status(403)" — its test
  greps the source. Denials are 404. The project-chat filter is an intended behaviour
  change (D3).
- Task 9: slackReadService must NOT import notificationCrud (it would create an import
  cycle in Task 24). Use compareTs for every ts comparison.
- Task 10: chatRouter has no pathless requireAuth. It mounts directly below
  slackArchiveAdminRouter, above every bare "/api" router. The extended appMountOrder
  test, including the uploads guard, must pass.
- Task 11: HTTP 409 means ONLY "reconnect Slack" (the rules test enforces it).
  sendMessage writes the archive row with forceHuman before returning.

If the backend can run locally with a reconnected account, finish with one smoke test:
POST /api/chat/conversations/<a DM or channel you're in>/messages and confirm it arrives in
Slack as you, exactly once in the archive. Report the commits and results.
```

---

## Phase 4 — Part D: Chat UI (Tasks 12–18)

```
You are the controller for Phase 4 of the Slack portal. Plan:
docs/superpowers/plans/2026-09-10-slack-portal.md, on branch feat/slack-portal.
Precondition: the Task 11 commit exists. Otherwise STOP.

Use superpowers:subagent-driven-development. Read ONLY the header, "Design decisions",
"Global constraints", and Tasks 12–18. This is the longest phase — keep your own context
lean: never open the source files yourself beyond `git show --stat` and test output.

Run Tasks 12 → 18 in order, one fresh subagent each, standard hand-off (the task's full
text verbatim, plus Design decisions and Global constraints, plus "implement exactly
this, tests first where stated, gate, commit with its message, only its files"). After
each: re-run the gate yourself, and the Jest tests the task names with
`npx react-scripts test --watchAll=false <path>`. Check `git show --stat HEAD`. One
retry on failure, then STOP and report.

Phase-specific must-knows (tell the relevant subagent):
- ALL frontend tasks: no <span>/<p> anywhere in src/components/clubpm/chat/. Icon classes
  are string literals. `npm run build` regenerates public/fa-subset.css and
  public/webfonts — those MUST be in the task's commit whenever an icon was added. The CI
  build treats react-hooks/exhaustive-deps warnings as errors.
- Task 13: helper functions used inside hooks live outside the component, as given.
- Task 14: all hooks in ChatComposer run before its early returns. The encoder test must
  fail first, then pass (9 tests).
- Task 15: emoji characters are message content only; button icons stay Font Awesome.
  ChatRichText.test.jsx must still pass.
- Task 16: backend; 17 checks. Links are http(s)/mailto only; image URLs never forwarded.
- Task 18: a deliberate 5-file, single-commit task. `node scripts/check-tour-anchors.js`
  must pass. Rewrite any course prose that lists the sidebar items.

Finish with the seven commits, test results, and a list of the manual checks each task
names (react/edit/delete mirror to Slack, bot digest renders as blocks, /clubpm/chat
browse + join). Say which ones you ran and which ones I still need to run in a browser.
```

---

## Phase 5 — Part E: DMs on the Members page (Tasks 19–22)

```
You are the controller for Phase 5 of the Slack portal. Plan:
docs/superpowers/plans/2026-09-10-slack-portal.md, on branch feat/slack-portal.
Precondition: the Task 18 commit exists. Otherwise STOP.

Use superpowers:subagent-driven-development. Read ONLY the header, "Design decisions",
"Global constraints", and Tasks 19–22.

Run Tasks 19, 20, 21, 22 in order, one fresh subagent each, standard hand-off and
verification (re-run the gate yourself, check `git show --stat HEAD`, one retry, then
STOP and report).

Phase-specific must-knows:
- Task 20: the open DM is ?dm= URL state, and setDm must preserve other params (the
  project tab adds ?tab=). Keep the literal "admin.members" in source (conditional
  data-tour-id) and run check-tour-anchors.js. Commit the regenerated icon subset.
- Task 21: NEVER read ProjectDetail.jsx whole (~3,600 lines) — use only the plan's grep
  anchors. Add changeTab to the setProjectNav effect's dependency array. Anchor registry,
  ANCHORS.md and the tab land in ONE commit.
- Task 22: append-only to public/clubpm-theme.css; never read the stylesheet. Verify
  every var(--…) in the new block is in the Global-constraints token list.

When Task 22 is committed, STOP and tell me the human steps:
(1) deploy frontend + backend (the migration runs on deploy);
(2) on the Admin page, click "Import all public channels";
(3) walk the Task 22 Step 2 layout checks at 1440 / 1100 / 800px on /clubpm/chat,
    /clubpm/members with a DM open, and a project's Members tab.
```

---

## Phase 6 — Part F: Notification sync (Tasks 23–27)

```
You are the controller for Phase 6 of the Slack portal. Plan:
docs/superpowers/plans/2026-09-10-slack-portal.md, on branch feat/slack-portal.
Precondition: the Task 22 commit exists. Otherwise STOP.

Use superpowers:subagent-driven-development. Read ONLY the header, "Design decisions"
(especially D8–D11 and D14), "Global constraints", and Tasks 23–27.

Run Tasks 23 → 27 in order, one fresh subagent each, standard hand-off and verification.

Phase-specific must-knows:
- Task 23: pure; 20 checks.
- Task 24: respect the "Import graph" line — slackReadService must NOT import
  notificationCrud or slackNotifyService. deliverSlackPings is called ONLY from
  events.ts (never from backfill), after ensureMembersKnown. Our own bot is recognised by
  bot user id OR auth.test bot_id.
- Task 25: the read sync is single-flight, 40 pairs, 1.2s pacing; the cron goes in
  scheduler.ts. Add the two new fields to BOTH strip-lists in members.ts.
- Task 26: the SSE "notification" handler replaces by id; metadata.link navigation comes
  before the old projectId fallback. Commit the regenerated icon subset.
- Task 27: a deliberate 6-file mechanical task. Copy each existing queueDm string EXACTLY
  into slackText before deleting that queueDm. Remove a file's queueDm import only if no
  call remains. Leave every other queueDm caller alone. 8 routing checks.

Finish with the five commits, test results, and the manual two-account checks from Tasks
24–27 that I still need to run.
```

---

## Phase 7 — Part G: Close-out (Task 28)

```
You are finishing the Slack portal. Plan:
docs/superpowers/plans/2026-09-10-slack-portal.md, on branch feat/slack-portal.
Precondition: the Task 27 commit exists. Otherwise STOP.

Use superpowers:executing-plans for Task 28, then superpowers:verification-before-completion
and superpowers:finishing-a-development-branch. Read the header, every D-numbered
decision, "Known limitations", and Task 28. Do this phase yourself — no subagents.

1. Step 1 cleanup: run the `rg` check first and delete only what it proves unused.
2. Step 2: update CLAUDE.md exactly as listed (API route, services, file structure, and
   the ten "Slack portal invariants").
3. Step 4: run the full test loop, tsc, `npm test -- --watchAll=false` and
   `npm run build`. Commit.
4. Step 3: the 14-step end-to-end check needs two real people in the Slack workspace.
   Walk me through it one step at a time and wait for my result on each. Record
   pass/fail honestly — never mark a step passed that we didn't run.
5. Open a PR against main whose description lists every D-decision, the two behaviour
   changes (D3 private-channel visibility; COMMENT_REPLY gains a Slack DM), the known
   limitations, and the E2E results table.
```
