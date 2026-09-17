# Phone usability findings (Phase 0)

Date: 2026-09-13. Two kinds of finding, kept separate:

- **B — browser-observed.** Measured on the *production* React components (`npm start`) in headless
  Chrome with mobile-viewport + touch emulation, API answered by `scripts/fixture-api.mjs`
  (fixture data). Screenshots and numbers: `evidence/browser/` (`SUMMARY.md` is the table).
  Emulation, not a real device; see "Limits" at the end.
- **S — source finding.** Read from the code; not reproduced in a browser (either not reachable with
  fixture data, or needs a device).

Severity: **Blocker** = a primary journey cannot be completed on a phone; **Major** = completable with
significant difficulty or lost context; **Minor** = friction or inconsistency.

## Summary

The current Constellation UI does not have a phone layout. Every signed-in route needs a layout
at least **427–465 CSS px wide**, so on a 390px or 320px phone 37–145px of every page sit past the
right edge and the whole page pans sideways (B1). On top of that, the fixed 64px icon rail stays, project Tasks gets a **46px** content column at 390px and **0px** at 320px (B2), the notification bell sits past the right edge (B3), and the chat
composer is two to three screen-heights down the page (B5). Landscape phones render the desktop
layout at 844×390, where the project header alone fills the screen (B8). Desktop at 1280/1440 and
tablets at 768/1024 render correctly with no overflow (baseline preserved).

## Browser-observed (B)

| ID | Sev | Finding | Evidence | Component reference |
| --- | --- | --- | --- | --- |
| B1 | Blocker | **Page wider than the phone on every signed-in route.** Layout width after load: Home 431, Tasks 463, Members 465, Calendar 462, Chat 434, Notifications 427 CSS px, on both 390 and 320px devices. Measured on Tasks at 390: visual viewport 390px at scale 1, document `scrollWidth` 463 → the page pans sideways by 73px (145px at 320) and the user can pinch out. The minimum is set by the fixed shell: 64px rail + non-shrinking topbar actions (`.pm-topbar-actions` right edge 425–459px). | `SUMMARY.md` rows `p390-*`, `p320-*`; `p320-home.png` | `.pm-shell-main { margin-left: 64px }` and `.pm-topbar` (`clubpm-theme.css:3178-3274`); no shell media queries exist (`evidence/source/clubpm-theme-media-queries.md`) |
| B2 | Blocker | **Project Tasks content column collapses**: `.cpm-project-main` 46px wide at 390, **0px** at 320, because `.cpm-assignee-panel` is a fixed 280px flex child beside it; the task list is unreadable/unusable. Files/Insights (no panel) get 326px. | `p390-tasks.png`, `p320-tasks.png`, `p390-project-empty.png` | `ProjectDetail.jsx:3450` (`AssigneePanel` always open, `assigneePanelOpen` constant `true` at `:2199`); CSS `:2033-2070` |
| B3 | Major | **Topbar actions overflow**: the notification bell (and at 320 the streak and Quests buttons) are past the device's right edge; the 34px icon buttons are all under 44px. | `interactiveBeyondRightEdge` in `metrics.json` (`Notifications, 1 unread` on every phone capture) | `AppShell.jsx:551-581`, `.pm-topbar-btn` 34px (`:3216`) |
| B4 | Major | **Tapping the rail triggers sticky hover**: a touch on the 64px rail expands it to 220px *over* the content (labels appear), and it stays expanded until the user taps elsewhere. Navigation labels are otherwise invisible (`opacity: 0`) on touch devices. | `p390-home-after-tap-social.png`, `x390-admin-sidebar-after-tap-other.png` (sidebar measured 220px) | `.pm-sidebar:hover` rules `clubpm-theme.css:2910-3175` |
| B5 | Blocker (chat) | **Composer is far below the fold.** `/clubpm/chat` stacks a 260px channel list above the conversation; the composer starts at y=2220 (390×844 device; the widened layout is 940px tall) and y=2814 at 320. In landscape it is at y=1524 of 390. With a 460px-tall viewport (keyboard proxy) the composer is at 779 — outside the visible area. | `p390-conversation.png`, `l844-conversation.png`, `p390-conversation-keyboard-proxy.png` | `ChatPage.jsx:80-135`; `.cpm-chatpage` ≤860px rule (`:26956-26960`) gives `min-height: 70vh` but no pinned composer |
| B6 | Major | **`/clubpm/chat` auto-opens the first channel** (`replace`), so the list is never the destination on its own; confirmed by the URL after load in every chat capture. | `url` column: `/clubpm/chat` → `/clubpm/chat/C_FIX_GENERAL` | `ChatPage.jsx:58-62` |
| B7 | Major | **TaskModal does not fit phones**: the overlay is centred in the widened 463px layout viewport, so on a 320px screen the modal (307px) starts ~78px in and its right part is off-screen; the toolbar row (Add Subtask, Edit, …) and metadata grid are cut. | `p320-task-modal-deeplink.png` (`interactiveBeyondRightEdge`: Newest, Critical, date input) | `TaskModal.jsx:1557-1569` |
| B8 | Blocker (landscape) | **Landscape phones get the desktop layout** (844×390 is above 768px): no overflow, but the project header + hero fills the entire 390px height — zero task rows visible before scrolling; the conversation composer is at y=1524. | `l844-tasks.png`, `l844-conversation.png` | same as B2/B5; there is no height-aware rule anywhere |
| B9 | Major | **Calendar month grid is 7×~300px columns** inside the page on phones; the Month/Week/Agenda switch is past the right edge. Agenda exists but is not the default. | `p390-calendar.png`, `overflowRightOfViewport` right edge 2166px | `CalendarPage.jsx:242` (`viewMode` defaults to `'month'`); `.cpm-cal-toolbar-actions` ≤720px only |
| B10 | Major | **Shell remounts on every path change**: Dashboard → Chat (one click, plus the auto-redirect) re-requested `/api/projects`, profile, celebration, notifications ×4 each and re-opened the notifications EventSource. Query-param changes (project tab switch) made **zero** requests. Counts include React 19 StrictMode's dev double-invocation, so production is roughly half — still one full shell reload per navigation. | `navigationRequests` in `metrics.json` | `App.js:86-94,123` (`ClubPmProtectedPage` per route; `Routes key={location.pathname}`) |
| B11 | Major | **Project section switches use `replace`**: Tasks → Insights then Back leaves the project (returned to `/clubpm`). | `history.afterBack` in `metrics.json` | `ProjectDetail.jsx:2140-2181` |
| B12 | Minor | **Small targets everywhere**: e.g. 390 Home 29 of 33 visible controls are under 44px; desktop 51/55 (expected on desktop). | `under44InView` per capture | shared `pm-`/`cpm-` button styles |
| B13 | Minor | **Reward celebrations cover the whole phone** (RankUpModal after a rank change) over the widened page; dismissable with Continue. Centred on the 431px layout, so slightly off-centre on a 390px screen. | `x390-admin-rankup-celebration.png`, `p390-home-admin-manyprojects.png` | `celebrate/RankUpModal` |
| B14 | OK | **Desktop and tablet baselines are clean**: 1440/1280/1024/768 have no page overflow; at 768 portrait tablet the desktop layout is usable (project main 424px + 280px panel). 767px mouse window also renders desktop today. | `d1440-*`, `d1280-*`, `x768-*`, `x1024-*`, `x767-*` | — |
| B15 | OK | **Login page fits** 320/390 without page-wide overflow; the long `.pm-login-doc` sections scroll inside their container. | `p320-login.png`, `p390-login.png` | `Login.jsx`, `.pm-login-doc` ≤640px rules |
| B16 | Minor | **Signed-out deep link loses its destination**: `/clubpm/projects/p1` while signed out lands on `/clubpm/login` with no return parameter. | `history.signedOutDeepLink` | `AppShell.jsx:388-390` (`<Navigate to="/clubpm/login" replace />`) |

## Source findings (S)

| ID | Sev | Finding | Reference |
| --- | --- | --- | --- |
| S1 | Blocker | Only a **hover** reveals navigation labels, project names, section headers and Sign out; there is no labelled navigation for touch at any width. | `clubpm-theme.css:2945-3175`, `:16018`, `:21004`, `:23294` |
| S2 | Blocker | **Every status move, blocker attach and assignment on the board is drag-only** (dnd-kit `PointerSensor`, 8px). The TaskModal status/assignee controls exist, but on a phone the modal is clipped (B7). | `ProjectDetail.jsx:2282-2283,2695-2864`; `AssigneePanel` `:873-1032` |
| S3 | Major | **Bulk actions need Ctrl/Cmd/Shift-click** — unreachable by touch. | `ProjectDetail.jsx:2575-2611`, `BulkActionBar` |
| S4 | Major | **Notification Center and Notification Preferences have no in-app entry point** (desktop too): the bell opens a 320px dropdown with no "view all"; Preferences are linked only from the Center. | `NotificationBell.jsx:385-463`, `NotificationCenter.jsx:291` |
| S5 | Major | **`NotificationBell` owns the app-wide EventSource and poll** that feed chat/membership window events. A phone header that swaps the bell for a link must keep exactly one instance of that logic, or chat badges and live updates silently stop. | `NotificationBell.jsx:174,197-244` |
| S6 | Major | **Gantt route has no link** anywhere. | `rg "/gantt" src` |
| S7 | Major | **Closing TaskModal strips the URL** to `/clubpm/projects/:id` with `replace`, dropping `tab`/`view`. The ProjectDetail tab effect does not reset on a missing `tab`, so state and URL disagree afterwards (Insights shown, URL says Tasks); a refresh then lands on Tasks. Not reproduced in the browser: the fixture could not render Insights › Activity (ErrorBoundary). | `ProjectDetail.jsx:3524-3527`, `:2111-2137` |
| S8 | Major | **Command palette** has no dialog semantics, no focus trap, and task results open the project rather than the task; `/new-project` and `/my-tasks` both only navigate to `/clubpm` (there is no confirmation flow, despite the plan's wording). | `AICommandPalette.jsx:6-9,112-122,174-245` |
| S9 | Minor | The Dashboard **has no project list**: `ProjectsSidebar`, `ProjectListItem` (the mouse-enter quick actions the plan mentions), `QuickCreateFAB/Drawer`, and a Dashboard `CreateProjectModal` are dead code; `dash.project.card` therefore never mounts even though the static anchor check passes. | `Dashboard.jsx:181-1243` vs render `:1442-1462` |
| S10 | Minor | Agenda panel "More" button has no handler. | `Dashboard.jsx:1030` |
| S11 | Minor | Icon-only controls without accessible names: TaskModal close/fullscreen (`title` only), palette clear `×` (no label, `tabIndex=-1`), CreateProject close `×`, project pin star (`title` only). | `TaskModal.jsx:1585-1587`, `AICommandPalette.jsx:193-199`, `AppShell.jsx:188`, `ProjectDetail.jsx:3145-3164` |
| S12 | Minor | Task rows are `div`s with click handlers and dnd-kit `attributes`; keyboard activation relies on dnd-kit's role=button semantics (no explicit Enter handler found). Verify with a screen reader in Phase 2. | `ProjectDetail.jsx:720-760` |
| S13 | Minor | Editable text in several forms is 12–13px (`CreateProjectModal`, palette, filters) — iOS Safari zooms the page on focus below 16px. | `AppShell.jsx:198`, `ProjectDetail.jsx:3241-3244` |
| S14 | Minor | Stale docs: `src/AGENTS.md` project tab list, root `AGENTS.md` file map ("kanban/milestones/files/vault/ai"), plan §2 "confirmation flow" and "quick actions"; `TaskDetailModal.jsx` listed in plan Phase 2 is never imported. | see `inventory.md` §2, §10 |
| S15 | Minor | `/clubpm/activity` breadcrumb entry has no route. | `AppShell.jsx:39` |
| S16 | Minor | Shell Cmd/Ctrl+K listener competes with the blog editor's Ctrl/Cmd+K link binding. | `AppShell.jsx:369-378`, blog shortcuts |
| S17 | Out of scope — **security, needs separate review** | `GET /api/projects` returns `members: { include: { member: true } }` for every project to any signed-in member. Read from source only: that shape includes every `Member` column (email, AES-GCM–encrypted Slack/GitHub tokens, iCal feed secret) unless something strips them, and no serializer/`omit` was found. Also a large payload that B10 re-fetches on every navigation. Not verified against a live server. | `backend/src/services/projectService.ts:252-273`, `backend/prisma/schema.prisma` `model Member` |

## What already works and should be reused

Chat page single column ≤860px, members/DM single column ≤860px, thread drawer stacking ≤900px,
dashboard single column ≤780px, CRM stage buttons ≤640px, poll board ≤640px, blog editor header/toolbar
≤720/480px, course rails ≤900px, login doc ≤640px, tour pill ≤640px — see `inventory.md` §8. The
`Files` source toggle already remembers the source per project (`sessionStorage`), and `Calendar`
already has an agenda view mode.

## Limits of this evidence

- **No real device and no real account.** The backend was not started: PostgreSQL was not running and
  `backend/.env` carries live Slack/GitHub/Google credentials whose Bolt app and cron scheduler act on
  the real workspace. All data is fixture data; any endpoint not modelled returns an empty default.
  Fixture gaps seen: the Upcoming events widget shows "Invalid Date" (field names), Insights › Activity
  hit the ErrorBoundary, the change-request badge did not appear. These are harness artifacts.
- **Software keyboard, safe areas, browser chrome expansion, iOS Safari, Android Chrome, screen
  readers, upload pickers: not tested.** The 460px-tall viewport is a proxy for an open keyboard only.
- Counts in B10 include React StrictMode double effects (development build).
- The `p390-home-after-tap-social` capture from the first run used a gesture API that does not
  emit clicks in headless Chrome; the scripts now use raw touch events and the committed screenshot is
  from the corrected run.

## Phase 5 findings (2026-09-16) — all fixed

Found by the Phase 5 harnesses against production bundles; details, fixes and proof in
`release-readiness.md` §3.

| ID | Sev | Finding | Status |
| --- | --- | --- | --- |
| P5-1 | Blocker (desktop + phone) | A task opened from the Dashboard could not be closed: `?task=` was dropped but the `?task=` effect reopened the dialog before the router applied the URL. Regression from the Phase 2 close change. | Fixed |
| P5-2 | Major | Phone Blocked group had no way to resolve, rename/recolour or reassign a category blocker; Move › Blocked skipped the blocker prompt. | Fixed |
| P5-3 | Major | Project Chat › Messages left ~70px of history at 320×640; composer clipped with a keyboard-height viewport. | Fixed |
| P5-4 | Major | Phone `<nav>`s (bottom bar, section row) inherited `width: 100vw` and ran past the right landscape safe-area inset. | Fixed |
| P5-5 | Minor | Short-landscape section buttons were 36px. | Fixed |
| P5-6 | Major | Outreach floating button covered the bottom bar's More item and the Composer's Send row. | Fixed |
| P5-7 | Major | Task "···" menu opened ~104px off a 320px screen. | Fixed |
| P5-8 | Minor | Tab/Escape inside task sub-dialogs were handled by the enclosing full-screen sheet. | Fixed |
| P5-9 | Minor | RSVP "Saving…" rendered as mojibake; one in `ANCHORS.md`. | Fixed |
| P5-10 | Minor | Same-tick double activation duplicated task comments/replies, RSVP and course completion. | Fixed |
| P5-11 | Minor | Legacy dialogs: sub-16px inputs (iOS focus zoom), 20–30px close buttons, unnamed icon buttons, archived-task controls under 44px. | Fixed |
