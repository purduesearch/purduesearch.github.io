# Constellation mobile redesign — release, smoke test and rollback runbook

Prepared: 2026-09-16 (Phase 5). **Nothing in this file has been executed.** Pushing to `main`
deploys the site (`.github/workflows/deploy.yml` runs on every push to `main`), so every step below
needs explicit release authorization first. Do not use production member accounts or send real
messages while testing; use the staging/test accounts named in HANDOFF Q6.

Readiness status and evidence: `release-readiness.md` (same folder). Read it first — the release is
**not** cleared until its "Pending external gates" are done.

## 0. Preconditions (all must be true)

1. Real-device checklist in `release-readiness.md` §5 completed on one iOS Safari and one Android
   Chrome phone against a **staging** backend, with results recorded in that file.
2. Member usability sessions (plan §6 Phase 5 step 3) run and recorded, or the owner has explicitly
   waived them for a staged rollout.
3. Owner sign-off on HANDOFF §4 Q1 (decisions D1–D11), Q4 (the desktop-visible additions listed in
   `release-readiness.md` §3) and Q7 (which evidence files are committed).
4. On the release commit, locally:
   ```bash
   node scripts/check-tour-anchors.js      # expect OK — 118 anchors, 118 rendered, 94 used
   npm run lint                            # expect exit 1 at the 576-error baseline, no new errors
   npm run test:ci                         # expect all suites pass
   npm run check:icons                     # expect only the pre-existing fa-calendar-star warning
   npm run build                           # expect exit 0 and five [minify-css] lines
   cd backend && npm run typecheck         # no backend code is part of this change; still exit 0
   ```

## 1. Prepare the commit (working tree is shared with unrelated work)

The working tree also holds changes that are **not** part of this redesign. Leave these out:

- `backend/**` (auth, members, prisma, memberService, taskService, blockKit) and the untracked
  `backend/src/db/prisma.test.ts`
- `FutureFeatures.txt`

Before staging, review `git diff -- AGENTS.md .github/workflows/deploy.yml` and confirm every hunk
belongs to the redesign (the rollout-switch env line, the dnd-kit and `@hello-pangea/dnd` notes, the
compact-layout notes).

Stage source, CSS, tests, the anchor registry, `docs/courses/**` and this plan folder **together**
(repository course-sync rule). Suggested split if reviewers prefer smaller commits — each one must
still pass the anchor check on its own:

1. Shell + primitives + rollout switch (Phase 1) with its course changes.
2. Home/tasks (Phase 2), comms/calendar (Phase 3), dense views (Phase 4), Phase 5 fixes — each with
   its course changes.
3. Plan, handoff, evidence and harness scripts (decide Q7 first; the evidence folders total several MB).

Work on a branch and open a PR; do not commit straight to `main`.

## 2. Release

1. Confirm the repository **variable** `REACT_APP_CLUBPM_COMPACT` is unset (or anything but `off`)
   in Settings → Secrets and variables → Actions → Variables. Unset means phones get the new layout.
   - Staged option: set it to `off` **before** merging. The new code then ships with the desktop
     shell at every width; testers opt in per browser (§4). Flip it on later with §3.1 in reverse.
2. Merge the approved PR into `main`. That push starts "Deploy to GitHub Pages".
3. Watch the run to completion (Actions tab). A failed build leaves the previous site live.
4. The theme stylesheet is cache-busted as `clubpm-theme.css?v=6` in three places that must agree:
   `src/clubpm/loadClubPmTheme.js`, `src/clubpm/loadClubPmTheme.test.js` and the preload in
   `public/index.html`. The test fails if the first two drift; check the third by eye.

## 3. Deployed smoke test (production, read-only)

Use a real phone and a desktop browser. **Read only:** open, navigate and cancel; do not post,
RSVP, purchase, approve, publish or resolve anything on production.

Bundle and switch:

1. `https://purduesearch.org/clubpm-theme.css?v=6` returns 200 and contains
   `Phase 5: category blockers on phones`.
2. In the desktop browser console on `/clubpm`:
   `[...document.scripts].map(s => s.src)` lists a `main.*.js`; fetch it and search for
   `REACT_APP_CLUBPM_COMPACT` — the inlined value must match the repository variable you intended
   (`"off"` or empty).
3. `https://purduesearch.org/` and `/about` look unchanged at phone and desktop width, and
   `/clubpm/login` still shows every scope-justification and Limited Use section.

Phone (signed in with your own account, portrait then landscape):

4. `/clubpm` shows the header (title, Search, bell) and the five-item bottom bar; no sideways panning.
5. Projects → pick a project → Tasks / Files / Chat / Insights switch; Back returns sensibly.
6. Open a task (full screen), close it — you land on the same list position.
7. Chat → a channel → the composer sits above the bar; focus it — the bar hides while the keyboard
   is open and returns when it closes. Do not send.
8. Calendar opens on the agenda; open an event (do not RSVP), Back closes it.
9. More → Courses → a course → Previous/Next visible above the bar.
10. More sheet: Back closes it; Sign out is separated from other rows (do not tap it).

Desktop (1280px+):

11. Sidebar, topbar, breadcrumb and the Ctrl+K palette look and behave as before.
12. Project Tasks still shows status bins and the assignee rail; Outreach Board still has five drag
    columns (look, do not drop).
13. `/clubpm/chat` still redirects to the first joined channel and shows the multi-pane layout.

Record the results (date, device, browser, pass/fail) in `release-readiness.md` §6.

## 4. Per-browser preview or opt-out (no deploy)

In the browser console on any `/clubpm` page:

```js
localStorage.setItem('pm-compact', 'off');   // force the desktop shell in this browser
localStorage.setItem('pm-compact', 'on');    // preview the phone shell even if the build is off
localStorage.removeItem('pm-compact');       // back to the build's value
window.dispatchEvent(new Event('pm-compact-changed'));  // apply without reloading
```

`on` never forces the phone layout onto a desktop-sized window; it only enables it where the
compact media query already matches.

## 5. Rollback

### 5.1 Presentation rollback (minutes, no code change) — try this first

1. Settings → Secrets and variables → Actions → Variables → set `REACT_APP_CLUBPM_COMPACT` = `off`.
2. Actions → "Deploy to GitHub Pages" → Run workflow on `main` (the value is baked in at build time;
   changing the variable alone does nothing).
3. Verify: on a phone, `/clubpm` shows the old icon rail and topbar (the pre-redesign phone layout,
   including its horizontal panning), `document.body.classList.contains('pm-m-compact')` is `false`,
   and there is no bottom bar.

What this does **not** undo (these ship regardless of the switch, and are covered by desktop
regression checks): the Outreach board's move from `@hello-pangea/dnd` to `@dnd-kit`; closing a task
keeping `tab`/`view` in the URL; the single shared notification stream; the course player's
Previous/Next row; the login wordmark size moving from an inline style into CSS; the phone login
width rules (`@media (max-width: 640px)`, outside the switch because login renders outside the
shell); the tour card docking to the top on ≤640px screens. If one of those is the problem, use 5.2.

### 5.2 Code rollback

1. `git revert` the release merge commit (or the specific commit from §1) on a branch, open a PR,
   run the §0 local checks, merge. The push redeploys.
2. The revert must include the course artifacts (`tourAnchors.js`, `docs/courses/**`) from the same
   commit, or `node scripts/check-tour-anchors.js` fails and walkthroughs target missing anchors.
3. Keep the theme cache-buster moving forward: after a revert, bump `?v=` to a new number (e.g.
   `v=7`) in the three places listed in §2.4 rather than reverting it to an old value, so browsers
   holding the phone stylesheet fetch the reverted one.

No data, schema or backend change is part of this release, so neither rollback touches the
database or the API.

## 6. After a stable period

Remove the rollout switch as its own change (plan §6 Phase 5 step 6): delete `isCompactEnabled`,
`setCompactPreview`, the `pm-compact-changed` event and `COMPACT_STORAGE_KEY` from
`compactLayout.js`; the `REACT_APP_CLUBPM_COMPACT` line from `deploy.yml`; the switch notes in
`AGENTS.md` and `src/AGENTS.md`; the switch tests. Delete the repository variable. Remove the
`@hello-pangea/dnd` dependency in a separate lockfile-only change.
