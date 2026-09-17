# Constellation mobile redesign — release readiness (Phase 5)

Date: 2026-09-16. Branch: `main` working tree, nothing committed, pushed or deployed.
Companion documents: `release-runbook.md` (release, smoke test, rollback) and `pr-description.md`.

## 1. Assessment

**Not ready to release.** Every automated gate that can run on this machine passes, and the defects
Phase 5 found are fixed and covered by checks. The plan's exit gate also requires real-device
walkthroughs, device keyboard/safe-area/upload/Back behaviour, screen-reader passes, real-account
mutations and member usability sessions. None of those has been done (no devices, test accounts or
staging backend were available to this session). §5 is the exact checklist.

There is **no open code-level release blocker**. The blockers are the pending external gates in §4.

Status words: **Pass** = verified here with the evidence named. **Pass (emulated)** = verified in
headless Chrome with touch/viewport emulation against the fixture API; not device evidence.
**Unverified** = not exercised; needs §5. **Fail** = none remain.

## 2. What Phase 5 ran

All browser evidence ran against **production bundles** served by `scripts/serve-build.mjs`
(GitHub-Pages-style static serving with SPA fallback, `/api` proxied to `scripts/fixture-api.mjs`),
except the Phase 1–4 harnesses, which use the CRA dev server as before. A production build of the
pre-redesign commit (`4cb57ccb`) was served beside the working-tree build for comparisons, and a
third build with `REACT_APP_CLUBPM_COMPACT=off` exercised the rollback switch.

| Check | Result | Evidence |
| --- | --- | --- |
| `npm run test:ci` | **Pass** — 55 suites / 384 tests | new: `TaskModal.comments.test.jsx`; added cases in `CalendarPage.compact.test.jsx`, `MobileSheet.test.jsx` (each shown to fail without its fix) |
| `node scripts/check-tour-anchors.js` | **Pass** — 118 anchors / 118 rendered / 94 used | run explicitly |
| `npm run lint` | **Pass at baseline** — exit 1 with the pre-existing 576 errors; warnings 967 (Phase 4: 967) | — |
| `npm run check:icons` | **Pass** — 357 icon/style pairs; only the pre-existing Pro-only `fa-calendar-star` warning | — |
| `npm run build` | **Pass** — exit 0, existing CRA warnings; five `[minify-css]` targets | `clubpm-theme.css` 957.4 → 680.2 kB |
| `cd backend && npm run typecheck` | **Pass** (no backend change in this work) | — |
| Course JSON parse | **Pass** — 41 files | — |
| Encoding scan (mojibake introduced vs HEAD) | **Pass** after fixing two (see §3) | — |
| `check-phase1-shell.mjs` | **Pass (emulated)** — 213/213 | `evidence/phase1/` |
| `check-phase2-tasks.mjs` | **Pass (emulated)** — 31/31 | `evidence/phase2/` |
| `check-phase3-comms.mjs` | **Pass (emulated)** — 46/46 | `evidence/phase3/` |
| `check-phase4-tools.mjs` | **Pass (emulated)** — 53/53 | `evidence/phase4/` |
| `check-phase5-matrix.mjs` | **Pass (emulated)** — 36/36 | `evidence/phase5/matrix.json` |
| `check-phase5-journeys.mjs` | **Pass (emulated)** — 56/56 | `evidence/phase5/journeys.json`, `j*.png` |
| `check-phase5-overlays.mjs` | **Pass (emulated)** — 12/12 | `evidence/phase5/overlays.json`, `p320-overlay-*.png` |
| `check-phase5-compare.mjs` | **Pass (emulated)** — 11/11 | `evidence/phase5/compare.json`, `compare/*.png` |
| Bundle comparison | **Pass** — see below | `evidence/phase5/bundle.json` |

### 2.1 Viewport and state matrix (`matrix.json`)

- **Every Phase 0 destination** — 44 routes: all 24 route entries, every project sub-view, the three
  legacy `?tab=` redirects, a `?task=` deep link, an empty project, DM/thread/event deep links, a
  private and a preview-only channel, all seven Outreach sections, both editors, the course player —
  at **320, 360, 390, 430 portrait and 667×375, 844×390 landscape**: phone shell mounted, five
  hit-testable untruncated bottom items, exactly one correct current item, a title, ≥44px chrome,
  no page-wide overflow, no duplicate tour anchors, no error boundary (full-screen dialogs are
  allowed to cover the bar).
- **Boundary and wide:** 767 (mouse) gets the phone shell; 768 portrait touch, 1024 landscape touch,
  1280 (all 44 routes) and 1440 keep the desktop shell with no overflow.
- **Enlarged text:** every element's computed font size ×1.3 and ×2 at 390px and ×1.3 at 320px on
  eight key routes — no overflow, nav reachable, labels contained. (Proxy for OS text scaling, not
  the OS setting.)
- **Safe areas** (`Emulation.setSafeAreaInsetsOverride`): 47/34px portrait insets — bar padding,
  header below the notch, composer above the bar; 47px landscape side insets — bar and header
  controls inside the insets.
- **Roles:** member is redirected from Admin/Meeting notes, sees no Admin row or New project; admin
  sees both. The course-editor URL renders for a member on HEAD too (authorization is server-side) —
  recorded, not a phone change.
- **Empty/error/expired:** no-projects Home and picker (with New project for admins), project-load
  failure with Retry, Slack HTTP 409 → reachable reconnect action above the bar, expired session →
  reload lands on a sign-in page that fits.
- **Rollback switch:** see §6.

### 2.2 Five primary journeys at 320px (`journeys.json`)

| Journey | Result |
| --- | --- |
| Find and update an assigned task | **Pass (emulated)** — Home › My work row → full-screen task (`?task=`), status picker (44px options), comment, close back to the list; category blockers edit/resolve and Move › Blocked (§3) |
| Open a project conversation and reply | **Pass (emulated)** — Projects sheet → project → Chat in three taps; composer above the bar; reply sent once on a double tap; composer visible and bar hidden with a keyboard-height viewport |
| Find an event and RSVP | **Pass (emulated)** — Calendar tab → agenda → event → RSVP (44px, one request on a double tap), Back closes detail |
| Retrieve a file | **Pass (emulated)** — Projects → Files → Vault → item → Download: signed URL fetched, file request made, browser download event, app not navigated away; Escape keeps the Vault source |
| Resume and progress through training | **Pass (emulated)** — More → Courses → **Continue** resumes at section 2/3; Next disabled for the locked section; Mark complete records once on a double tap; Previous works; step row above the bar |

Also in `journeys.json`: More sheet survives refresh, Back closes / Forward reopens; seven direct
query-param links (task, thread, DM, event, Files source, Insights › AI, Outreach › CRM) open the
right detail both directly and after refresh; header Back on a directly opened thread stays in the
app; Back after switching project sections returns to the opener (contract D4). Real key events:
Enter opens More, 40 Tab/Shift+Tab presses stay inside the dialog, Escape closes and returns focus;
same for task detail; Ctrl+K opens full-screen Search. Accessibility tree: Primary navigation and
main landmarks, no unnamed buttons/links on the task screen, open sheet is a named dialog with the
background removed from the tree, opener `aria-expanded`. Drafts survive portrait → landscape →
desktop width → portrait (chat) and rotation (DM); DM and thread composers stay visible with a
keyboard-height viewport. Exactly one live notification `EventSource` after three bottom-bar
navigations.

### 2.3 Dialogs (`overlays.json`)

At 320px, each opens inside the screen with no control past the edge, 16px form text and a
touch-sized close: Create project, Edit project, task Move / Shift deadlines / Change parent, the
task "···" menu, Outreach New submission (and its floating button clears the bottom bar), Blog
Generate, Course assign (plus the admin Progress dashboard without overflow), Keyboard shortcuts.
GitHub contributor import was not reachable with fixture data (needs a linked repository).

### 2.4 Desktop and public comparison (`compare.json`)

- **22 ClubPM routes at 1280 and 1440**, HEAD vs working tree, pixel-compared after freezing motion:
  sidebar/topbar/main geometry and breadcrumb identical everywhere. Pixel differences only on
  **Course player** (the Previous/Next row — intentional, §3.3) and **Shop** (the refresh countdown
  and an animated card background; three HEAD captures of the same route differ as much).
- **Public pages** (`/`, `/about`, `/ares`, `/blog`, `/contact`, `/outreach`, `/astrousa`, `/rsvp/:id`)
  at 390 and 1280, and `/clubpm/login` at 1280: pixel-identical to HEAD. `/clubpm/login` at 390
  differs by design (Phase 4H phone sign-in). `search-theme.css` and `style.min.css` are
  byte-identical to HEAD. Leaving `/clubpm` for a public page removes `body.pm-m-compact`, phone
  nodes, `inert` and the scroll lock.
- **Desktop interactions, same result on both builds:** task drag between status bins (task PATCH),
  Outreach card drag to another column (status PATCH; dnd-kit now, hello-pangea before), `g e` /
  `g o`, Ctrl+K palette box, `?` shortcuts, sidebar hover 64 → 220px, and a task opened from the
  Dashboard closes and reopens (§3 #1).
- **Responsiveness** (5 cold loads each, same fixture): task route load median 648 → 654 ms at
  1280 and 665 → 654 ms at 390; long-task blocking median 50 → 51 ms / 55 → 50 ms; p95 scroll frame
  16.8 → 16.7 ms. Window listeners 22 → 33 (desktop) / 38 (phone) and **no growth after 12 in-app
  navigations** on either build.
- **Bundle** (`bundle.json`): total JS −7.9 kB gzip (hello-pangea no longer bundled), `main.js`
  +1.0 kB, `clubpm-theme.css` +10.6 kB gzip (ClubPM routes only), public CSS unchanged except
  `fa-subset.css` +108 B and the solid webfont +916 B.

## 3. Defects found and fixed in Phase 5

| # | Defect | Scope | Fix | Proof |
| --- | --- | --- | --- | --- |
| 1 | **A task opened from the Dashboard could not be closed** — the URL dropped `?task=` but the dialog reopened. Clearing state rendered before the router applied the URL, and the `?task=` effect saw the stale param. | **Desktop and phone** (regression from the Phase 2 close change; HEAD was fine) | `ProjectDetail.jsx`: remember the dismissed id until the param clears | `compare.json` (both builds close and reopen), J1 |
| 2 | Phone Blocked group had **no way to resolve, rename/recolour or reassign a category blocker**; Move › Blocked skipped "what's blocking it" | Phone | `CompactBlockerList` / `CompactBlockerForm` in the phone Blocked group; Move › Blocked sheet (existing blocker, new blocker, or plain) — same handlers as desktop | J1b (7 checks), course step copy + walkthrough README updated |
| 3 | Project Chat › Messages left **~70px of history at 320×640**, and the composer was clipped under a keyboard-height viewport | Phone | Hero steps aside on that view; tighter padding; section row and sub-tabs hide while the keyboard is open | J2 keyboard check (history now ~250px) |
| 4 | Bottom bar and section row ran **off the right edge with landscape side insets** (`nav { width: 100vw }` in `style.min.css`) | Phone landscape (notched) | `width: auto` on both phone `<nav>`s; `box-sizing: border-box` on the shell | matrix safe-area check |
| 5 | Project section buttons were **36px** in short landscape | Phone landscape | 44px | matrix l667/l844 |
| 6 | Outreach **floating New submission button sat on the bottom bar's More item**, and over the Composer's sticky Send row | Phone | Lifted above the bar and home indicator; hidden while typing and on the Composer section | overlays |
| 7 | Task **"···" menu opened 104px off a 320px screen**; its trigger had no accessible name | Phone (name: both) | Right-anchored on phones; `aria-label="More task actions"` + `aria-expanded` | overlays |
| 8 | **Tab/Escape inside task sub-dialogs were captured by the full-screen sheet** (React portal events bubble through it): Tab jumped back into the task, Escape closed the whole task | Phone, hardware keyboard | `MobileSheet` ignores keys whose target is outside its layer | `MobileSheet.test.jsx` |
| 9 | **RSVP button showed `Savingâ€¦`** (mojibake introduced in Phase 3); `ANCHORS.md` had one too | Both / docs | Re-encoded | encoding scan; RSVP test asserts "Saving…" |
| 10 | Same-tick double activation posted **twice** for task comments/replies, RSVP and course completion | Both | Ref in-flight guards | tests + J1/J3/J5 |
| 11 | Legacy dialogs used **12–14px inputs** (iOS zooms on focus) and **20–30px close buttons** | Phone | Under `body.pm-m-compact`: 16px form text, 44px `Close` buttons | overlays |
| 12 | Task comment Send and shortcuts dialog lacked accessible names/role | Both | `aria-label="Post comment"`; shortcuts panel `role="dialog"` + label | journeys a11y |
| 13 | Archived-task toggle and Unarchive were ~30px | Phone | 44px | — |

Theme cache-buster moved to `?v=6` (three places). Course sync: `blocked-and-unblocked.steps.json`
phone copy and `constellation-101/walkthroughs/README.md`; `ANCHORS.md` encoding. No anchor id changed.

### 3.3 Desktop-visible changes that need owner sign-off (HANDOFF Q4)

1. Course player Previous/Next row at every width (Phase 4E).
2. Closing a task keeps `tab`/`view` in the URL (Phase 2).
3. Outreach board on `@dnd-kit` (Phase 4C) — drag verified equivalent.
4. Accessible names/roles and in-flight guards from §3 (#7, #10, #12).
5. Walkthrough card docks to the top on ≤640px windows (Phase 1).

## 4. Gate status against the plan

### 4.1 Phase 5 exit gate (plan §6)

| Gate | Status |
| --- | --- |
| All five primary journeys pass | **Pass (emulated)**; device and member runs **Unverified** |
| All Phase 4 acceptance gates pass | Partly — see 4.2 |
| No essential phone action requires hover or drag | **Pass (emulated)** — Tasks now covers blockers; bulk selection has no phone equivalent (non-essential, every operation is available per task) |
| No desktop regression remains | **Pass (emulated)** — the one found (§3 #1) is fixed; §3.3 needs sign-off |
| Course checks pass | **Pass** — anchors, JSON, prose updated |
| Device walkthroughs pass | **Unverified** |

### 4.2 Phase 4 acceptance gates (plan §6 table)

| Slice | Gate | Status |
| --- | --- | --- |
| Files, Vault, GitHub | Browse, preview/download, upload, authorized review without a clipped modal | Browse, download: **Pass (emulated)**. Upload dialog fits: **Pass (emulated)**; real upload picker: **Unverified**. Change-request review: layout **Pass (emulated)**, approval **Unverified** (no mutation) |
| Insights, AI, Gantt | Inspect and individually accept/decline an AI proposal; timeline without page overflow | **Pass (emulated)** (Phase 4 harness); execution against a project **Unverified** |
| Outreach | Open a contact, change stage, inspect a campaign, review a draft | **Pass (emulated)**; nothing sent/published |
| Blog and course editors | Edit and save a draft, recover from errors, inspect publish/review flow without accidental submission | **Unverified** in a browser — needs a live Hocuspocus collaboration socket (unit tests + source review only) |
| Course learning | Resume training, complete a quiz/assignment, follow a live walkthrough | Resume + content completion: **Pass (emulated)**. Quiz/assignment on a phone: **Unverified**. Walkthrough reveal: **Pass (emulated)** (Phase 1) |
| Admin and meeting notes | Review a pending item and access notes; members cannot gain access | Layout + role gating: **Pass (emulated)**; approving a reward **Unverified** |
| Profile, Shop, Challenges | Edit profile, equip/purchase, view quests without covered buttons | Layout: **Pass (emulated)**; the mutations **Unverified** |
| Login and connection states | Sign in on a phone; keep every `.pm-login-doc` section | Docs + layout: **Pass (emulated)**; real sign-in **Unverified**; Slack 409 reconnect: **Pass (emulated)** |

### 4.3 Plan §8 verification areas

| Area | Status |
| --- | --- |
| Viewports incl. enlarged text | **Pass (emulated)** |
| Devices (iOS Safari, Android Chrome) | **Unverified** |
| Navigation, Back/Forward, refresh, direct links | **Pass (emulated)**; edge-swipe/hardware Back **Unverified** |
| Layout | **Pass (emulated)** |
| Accessibility | DOM/AX-tree and real key events **Pass (emulated)**; VoiceOver/TalkBack **Unverified** |
| State (rotation, drafts, duplicates, failures) | **Pass (emulated)** |
| Desktop | **Pass (emulated)** with §3.3 sign-off |
| Performance | **Pass (emulated)** — no listener growth, no added blocking time, comparable load; device timing **Unverified** |

## 5. Remaining external checks (exact checklist)

Use one current **iPhone (iOS Safari)** and one **Android phone (Chrome)**, a **staging** backend with
a member and an admin **test** account (never production credentials), and the build from the
release commit (a preview deploy or a local build pointed at staging). Record device, OS, browser
version, pass/fail and a screenshot for each line in §6.

1. **Shell:** each bottom item; More → every row; Projects → switch, New project (admin only),
   This project → Edit/Pin/Timeline; Search; bell → Notification Center → Preferences.
2. **Back:** iOS edge swipe and Android system Back with the More sheet open, a task open, a
   thread open, a DM open, an event open — each closes the top layer first and never leaves the site.
3. **Keyboard:** focus the chat, thread, DM, task comment and New task title fields — the software
   keyboard must not hide the field or its send/save control; the bar hides and returns when the
   keyboard closes. Repeat with a Bluetooth keyboard attached: the bar must stay, Tab must stay in
   dialogs, Ctrl/Cmd+K opens Search.
4. **Browser chrome:** scroll long lists (tasks, channels, agenda) until the address bar collapses
   and expands; nothing jumps under the bar, no double scrollbars.
5. **Safe areas:** notch/home indicator in portrait and both landscape orientations (Dynamic Island
   left and right).
6. **Rotation:** rotate with a half-typed chat message, a New task draft and an open task — nothing
   lost, nothing submitted.
7. **Uploads:** chat attachment (photo library, camera, files; cancel; retry after airplane mode),
   vault check-in, Outreach media.
8. **Five journeys** as in §2.2 against staging, including a real failed save (airplane mode) and a
   real Slack reconnect (revoked token on the test account).
9. **Phase 4 mutations on test data:** vault check-in and change-request approval, AI plan execution
   on a scratch project, outreach stage move and composer send to a test channel, course quiz and
   assignment submission, pending-reward approval, shop purchase and quest claim, profile edit,
   real Slack sign-in on the phone.
10. **Editors with collaboration:** blog and course editor on a phone with a second desktop peer —
    More formatting sheet, section picker, preview, Save draft, Publish menu (cancel at the confirm).
11. **Screen readers:** VoiceOver and TalkBack through the bottom bar (current item announced),
    More and Projects sheets (dialog announced, focus on heading, background unreachable, focus
    returns), task detail, Move/Assign/blocker sheets, chat list → conversation → thread, Calendar
    event, course contents `<details>`, admin jump list.
12. **Text size:** iOS Larger Text (largest non-accessibility size) and Android font size max —
    bottom labels, header title, task rows.
13. **Walkthroughs:** first-look, rewards and blocked-and-unblocked on a phone.
14. **Member usability sessions** (plan Phase 5 step 3): 3–5 members, the five journeys, record
    completion, wrong turns and blocked actions.
15. **Rollback drill on staging:** build with `REACT_APP_CLUBPM_COMPACT=off`, confirm §6 behaviour on
    a phone, then `localStorage.setItem('pm-compact','on')` previews the phone shell.

## 6. Rollback mechanism — verified here

| Check | Result |
| --- | --- |
| Build flag `off` on a 390px phone: desktop shell, no `.pm-shell--compact`, no `body.pm-m-compact`, no phone nodes | **Pass (emulated)** |
| Same build: shell, main, assignee-rail geometry and page width equal the **pre-redesign** build | **Pass (emulated)** |
| `localStorage pm-compact=on` previews the phone shell on an off build | **Pass (emulated)** |
| `pm-compact=off` live (no reload) removes shell, marker and phone nodes; survives reload; clearing restores live | **Pass (emulated)** |
| `pm-compact=on` never forces the phone shell on a desktop viewport | **Pass (emulated)** |
| CSS/JS consistency: one `COMPACT_QUERY` string in JS and the single compact `@media` block; every compact selector scoped to `.pm-shell--compact`, a phone layer or `body.pm-m-compact` | **Pass** — `compactLayout.test.js`; no other `matchMedia`/`innerWidth` layout switch in new code |
| Rules outside the switch (by design) | Login phone rules (`max-width: 640px`, login is outside the shell) and the tour card's top-docking at ≤640px |
| Workflow wiring | `deploy.yml` passes `vars.REACT_APP_CLUBPM_COMPACT`; unset = on; the value is inlined at build time (checked in the off bundle) |

What the switch does not undo: `release-runbook.md` §5.1.

## 7. Known limitations (non-blocking)

- Bulk task selection has no phone equivalent (every operation is available per task).
- Tablets 768–1023px portrait keep the desktop layout, including the hover rail (plan scope).
- Shell remounts on each path change (pre-existing B10): one notification stream per navigation is
  opened and the previous one closed; no accumulation observed.
- After a session expires mid-use, in-app navigation stays on the page with failing requests until
  a reload sends the user to sign-in (observed with the fixture; not compared with HEAD).
- Several legacy desktop dialogs (vault actions, change requests, EditProject, quest claims, …) keep
  state-only submit guards. Separate real taps are protected by React's re-render; only a same-tick
  double activation is not.
- GitHub contributor import was not opened (fixture has no linked repository).
- Evidence is Chromium emulation with fixture data. Safari layout, real keyboards and assistive
  technology can differ.
