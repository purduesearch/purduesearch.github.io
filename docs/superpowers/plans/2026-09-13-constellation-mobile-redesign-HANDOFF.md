# Constellation mobile redesign — handoff

Plan: `docs/superpowers/plans/2026-09-13-constellation-mobile-redesign.md`
Supporting material: `docs/superpowers/plans/2026-09-13-constellation-mobile-redesign/` (index in its `README.md`)
Last updated: 2026-09-16 (Phase 5 session). Branch: `main`, nothing committed, nothing pushed or deployed.

**Current state in one paragraph.** All five phases are implemented and every automated gate passes
on the final working tree (Jest 55/384, anchors 118/118/94, lint at the 576-error baseline, icons,
build, backend typecheck; browser harnesses Phase 1 213/213, Phase 2 31/31, Phase 3 46/46, Phase 4
53/53, Phase 5 matrix 36/36, journeys 56/56, dialogs 12/12, HEAD comparison 11/11). Phase 5 found and
fixed 11 defects, including a desktop regression (tasks opened from the Dashboard could not be
closed). **The release is not cleared:** no real device, real account, screen reader, live editor
collaboration or member session has been used. Read `…/release-readiness.md` (status + checklist),
`…/release-runbook.md` (release/rollback) and `…/pr-description.md`.

Statuses used: **Not started** · **In progress** · **Implemented — awaiting validation** · **Complete**.

## Phase status

| Phase | Status | Summary |
| --- | --- | --- |
| 0 — Inventory, baseline, prototype | **Implemented — awaiting validation** | Inventory, findings, contracts, fixture-backed production baselines, and an interactive prototype with 205 passing automated checks are done. Real-device checks, a real-account baseline, and sign-off on the open decisions below are outstanding. |
| 1 — Phone shell + shared interaction components | **Implemented — awaiting validation** | Shell, primitives, header/palette/bell, More, project picker + actions, project sections, rollout switch, and the shell course migration are in the working tree. Automated implementation gates pass (included in the current Jest 359/359 run, anchor check, lint at baseline, build, 213/213 emulated browser checks). Not verified on a real device, with a real account, or with a screen reader. See **§0**. |
| 2 — Home, projects, task completion | **Implemented — awaiting validation** | Complete phone dashboard/project/task loop, shared full-screen task surfaces, explicit status/assignee controls, context restoration, compact milestones, Gantt entry point, and course migration. All automated gates pass, including 31/31 Phase 2 browser checks. Real-device, real-account, software-keyboard, and screen-reader validation remain. |
| 3 — Chat, DMs, calendar, notifications | **Implemented — awaiting validation** | Phone channel landing, list/conversation/thread history, roster/inbox and full-screen DMs, viewport-aware composers, agenda-first Calendar and event links, RSVP, permitted creation, notifications/preferences, and course sync are implemented. Automated implementation gates pass; real iOS/Android, real-account, upload-picker, and screen-reader gates remain pending. |
| 4 — Remaining tools and dense views | **Implemented — awaiting validation** | All eight slices plus the cross-slice gates are done; slice-level record in the Phase 4 section directly below. Real-device, real-account, screen-reader and live-editor validation remain, and no mutation was performed. |
| 5 — Full-system validation and release | **Implemented — awaiting validation** | Full automated validation done on production bundles, defects fixed, release/rollback documents prepared. External gates (devices, accounts, screen readers, live editors, member sessions, owner sign-offs) pending. See the Phase 5 section below. |

Phases 0–4 stay **Implemented — awaiting validation** for the same reason: their remaining gates are
the external checks listed in `release-readiness.md` §5. No phase is marked Complete.

## Phase 5 — full-system validation and release preparation (2026-09-16)

### What was run

- Static gates on the final tree: `npm run test:ci` **55 suites / 384 tests**; explicit
  `node scripts/check-tour-anchors.js` **118 / 118 / 94**; `npm run lint` exit 1 at **576 errors / 967
  warnings** (baseline); `npm run check:icons` **357 pairs** (only `fa-calendar-star`); `npm run build`
  exit 0; `backend` typecheck exit 0; 41 course JSON files parse; mojibake scan clean.
- Phase 1–4 harnesses rerun on the final source (dev server): **213, 31, 46, 53 — all pass**.
- Four new harnesses against **production bundles** (`scripts/serve-build.mjs` + fixture API), with
  a build of `4cb57ccb` (HEAD) and a `REACT_APP_CLUBPM_COMPACT=off` build alongside:
  `check-phase5-matrix.mjs` **36/36** (44 destinations × 320/360/390/430/667×375/844×390, boundary
  767/768/1024, 1280 all routes, 1440; enlarged text; safe areas; roles; empty/error/expired;
  rollback), `check-phase5-journeys.mjs` **56/56** (five journeys, blockers, history/refresh/direct
  links, real key events, AX tree, drafts, duplicate submits, keyboard-height composers, one live
  EventSource), `check-phase5-overlays.mjs` **12/12** (legacy dialogs, Outreach FAB),
  `check-phase5-compare.mjs` **11/11** (desktop + public pixels vs HEAD, drag, shortcuts, task close,
  timing, listeners). Bundle: total JS −7.9 kB gzip, main +1.0 kB, ClubPM CSS +10.6 kB, public CSS
  unchanged apart from +108 B icon CSS and +916 B webfont.
- Evidence: `evidence/phase5/` (`matrix.json`, `journeys.json`, `overlays.json`, `compare.json`,
  `bundle.json`, screenshots, `compare/` pairs for the remaining intentional/nondeterministic diffs).

### Defects fixed (details: `release-readiness.md` §3, `findings.md` P5-1…P5-11)

1. **Desktop + phone regression:** a task opened from the Dashboard could not be closed
   (`ProjectDetail.jsx`, dismissed-id ref).
2. Phone category-blocker management and Move › Blocked prompt (`ProjectDetail.jsx`
   `CompactBlockerList` / `CompactBlockerForm`, three new sheets).
3. Project Chat › Messages height and keyboard visibility (hero hidden on that view, compact padding).
4. Phone `<nav>`s overflowing landscape insets (`width: auto`; shell `box-sizing`).
5. 36px short-landscape section buttons → 44px.
6. Outreach FAB over the bottom bar / Composer Send row (`OutreachHub.jsx`, CSS).
7. Task "···" menu off-screen + unnamed trigger (`TaskModal.jsx`, CSS).
8. `MobileSheet` handled keys from portalled sub-dialogs (`MobileSheet.jsx` + test).
9. RSVP "Saving…" mojibake (`CalendarPage.jsx`) and one in `docs/courses/ANCHORS.md`.
10. Same-tick duplicate comment/reply, RSVP, course completion (ref guards + tests).
11. Legacy dialog 16px inputs / 44px Close under `body.pm-m-compact`; accessible names for comment
    Send and the shortcuts dialog; 44px archived-task controls.

Theme cache-buster → `?v=6` (loader, test, `index.html` preload). Course sync: blocked-and-unblocked
phone copy + `constellation-101/walkthroughs/README.md`. `src/AGENTS.md` gained the 16px/Close and
ref-guard notes. Fixture API gained `slowWrites`, `failAuth`, `slackExpired`, a p1 category blocker,
a p1 chat channel, a course enrollment in progress, and a downloadable vault file.

### Changed files this session

`src/pages/ClubPM/ProjectDetail.jsx`, `src/pages/ClubPM/CalendarPage.jsx`,
`src/pages/ClubPM/CoursePlayerPage.jsx`, `src/pages/ClubPM/OutreachHub.jsx`,
`src/components/clubpm/TaskModal.jsx`, `src/components/clubpm/MobileSheet.jsx`,
`src/components/clubpm/KeyboardShortcutsModal.jsx`, `public/clubpm-theme.css`,
`src/clubpm/loadClubPmTheme.js` + test, `public/index.html`; tests
`src/components/clubpm/TaskModal.comments.test.jsx` (new), `CalendarPage.compact.test.jsx`,
`MobileSheet.test.jsx`; docs `src/AGENTS.md`, `docs/courses/ANCHORS.md`,
`docs/courses/constellation-101/walkthroughs/{blocked-and-unblocked.steps.json,README.md}`; plan
folder `release-readiness.md`, `release-runbook.md`, `pr-description.md`, `findings.md`, `README.md`,
`scripts/{fixture-api,serve-build,phase5-lib,check-phase5-*}.mjs`, `evidence/phase5/`.

### Session housekeeping

The CRA dev server (:3000), fixture API (:3001) and three build servers (:4001–:4003) were stopped at
the end of the session. Builds and the HEAD archive live in this session's scratch directory only.
The real backend was never started. Nothing was sent, published, approved, purchased, claimed,
completed or signed in against a real service. An orphaned Phase 1 harness process from a previous
session and its headless Chromes were found holding CDP ports and were stopped.

### Exact next steps

1. **Owner decisions:** Q1 (D1–D11), Q4 (desktop-visible changes, `release-readiness.md` §3.3), Q7
   (which evidence to commit; ≈14 MB across `evidence/`), and whether member usability
   sessions are required before a staged rollout.
2. **External validation:** `release-readiness.md` §5, items 1–15, on one iOS Safari and one Android
   Chrome phone against staging with member + admin test accounts. Record results in §6 of that file
   (add a results table). Any failure → fix → rerun the affected harness plus the Phase 5 compare.
3. **Release (when authorized):** `release-runbook.md` §0–§3. Stage only the redesign files (leave
   `backend/**`, `backend/src/db/prisma.test.ts` and `FutureFeatures.txt` out), branch + PR using
   `pr-description.md`, merge, watch the Pages run, run the deployed smoke test.
4. **Rollback if needed:** runbook §5.1 (variable `off` + re-run workflow) first, §5.2 (revert) if a
   shared change is at fault.
5. **Follow-ups after stability:** remove the rollout switch (runbook §6), drop `@hello-pangea/dnd`
   from `package.json` in its own change, fix B10 (shell remount) separately, consider ref guards for
   the remaining legacy submit paths, review Q5 (member fields in `/api/projects`) independently.

## Phase 4 implementation — remaining tools and dense views (2026-09-15)

**Phase 4 is NOT complete.** Work through the slices in order; each row below is the exact
continuation record. A slice is only "Implemented" when every existing action on that surface is
reachable on a phone — a readable fallback with a missing action is still "In progress".

| Slice | Status | Notes |
| --- | --- | --- |
| A — Files, Vault, GitHub | **Implemented — awaiting validation** | See §4A. |
| B — Insights, AI, Gantt | **Implemented — awaiting validation** | See §4B. |
| C — Outreach (incl. BoardTab dnd-kit migration) | **Implemented — awaiting validation** | See §4C. |
| D — Blog and course editors | **Implemented — awaiting validation** | See §4D. |
| E — Course learning | **Implemented — awaiting validation** | See §4E. |
| F — Admin and meeting notes | **Implemented — awaiting validation** | See §4F. |
| G — Profile, Shop, Challenges | **Implemented — awaiting validation** | See §4G. |
| H — Login and connection states | **Implemented — awaiting validation** | See §4H. |
| Cross-slice gates (anchors, lint, tests, icons, build, layout inspection) | **Done** | See **Phase 4 cross-slice gates** below. |

### Shared mechanism added in Phase 4

`AppShell` now adds **`body.pm-m-compact`** while (and only while) the compact shell is mounted, and
removes it on unmount, so the rollout switch still turns everything off. Legacy dialogs portal
straight to `<body>`, outside the shell root, so `.pm-shell--compact` cannot reach them; this marker
is what lets the compact stylesheet size those portals for a phone without threading the layout hook
through every one of them. Dialogs that carry real workflows still move into the shared
`MobileSheet` overlay stack (focus trap, Escape, `inert` background, focus return) — the marker is
for the remaining small confirm/preview boxes.

Every Phase 4 rule stays inside the single `@media COMPACT_QUERY { … }` block in
`public/clubpm-theme.css` (`compactLayout.test.js` fails otherwise) and is scoped under
`.pm-shell--compact`, a `.pm-m-*-layer` portal class, or `body.pm-m-compact`.

### 4A. Files, Vault, GitHub

**Inventory taken before changing presentation** (`inventory.md` §2 `?tab=files`, §5): source toggle
Drive/GitHub/Vault with per-project `sessionStorage` memory; Drive link/change/open/preview and the
embedded folder view; GitHub repos, sub-tabs, issue/PR/file lists and their preview, add-repo,
import-issues, issue-picker and branch-create dialogs; Vault sub-views Vault / Change Requests /
Review Queue (admin), search, All/Parts/Released/Checked-out filters, "Ask the vault", check-in
upload, item detail (rename, versions/history, download, check-out/release, promote, BOM, delete)
and change-request create/review.

What changed:

- `ProjectDetail.jsx` `FilesTabContent` renders a **labelled "Source" selector** (three 44px
  controls, `aria-pressed`) on compact instead of the desktop pill tablist; the desktop tablist is
  untouched. Both branches read and write the same `cpm.files.sub.<projectId>` `sessionStorage`
  value, so returning from an item detail lands on the source you left. The Files body drops its
  inline 24px padding on compact only.
- `project.tab.vault` now has two mutually exclusive owners (desktop pills, phone selector), so the
  registry entry gained `layout: "both"` and `ANCHORS.md` records both presentations.
- `VaultItemModal`, `VaultUploadModal`, `ChangeRequestModal` and `DrivePreviewModal` render through
  `MobileSheet variant="fullscreen"` on compact; the desktop portals are byte-for-byte unchanged.
  The Drive preview keeps "Open in Drive" in the dialog header (`headerExtra`) so the escape hatch
  for un-embeddable files survives. The vault item panel hides its own close button and scrim on
  compact because the sheet supplies both.
- CSS: stacked vault toolbar, single-column vault and change-request lists, scrollable vault/GitHub
  sub-tab strips, wrapped GitHub rows and stat tiles, a 60vh Drive folder embed, and full-screen
  treatment of the `cpm-gh-modal-overlay` / `cpm-drive-edit-overlay` portals through
  `body.pm-m-compact`. Every interactive control in this area is at least 44px, and editable text is
  16px so iOS does not zoom on focus.
- Theme cache-buster bumped to `?v=5` in `loadClubPmTheme.js`, its test, and the `index.html`
  preload, together.

Checks run for this slice: `node scripts/check-tour-anchors.js` → **118 anchors / 118 rendered /
94 used**; `compactLayout` + `loadClubPmTheme` suites → **8 tests pass** (the CSS-block integrity
assertion covers the new rules); targeted ESLint on the six changed source files → **0 errors**
(pre-existing warnings only); new `vault/VaultCompact.test.jsx` → **4 tests pass** (phone full-screen
dialog with `#root` inert and the check-in action still present; desktop portal unchanged; Drive
preview keeps its Open-in-Drive link on phones and its modal on desktop).

**One plan item deliberately not followed:** the slice table says "move secondary tools into
Actions". The Vault toolbar's two secondary controls are "Ask the vault" and "Check in file"; on a
phone both became full-width 44px buttons instead. Burying a two-item list behind an Actions menu
costs a tap and hides the check-in action this slice's acceptance gate names. If a third tool
appears here, revisit it.

Not yet done for this slice: no real-device pass, no authorized-account vault upload or
change-request review, and no browser harness run (the Phase 4 harness is written once, after the
last slice, alongside the cross-slice gates).

### 4B. Insights, AI, Gantt

**Inventory taken first** (`inventory.md` §2 `?tab=insights`, §10): Charts (eight analytics cards,
each with a chart-type switcher, Copy-as-PNG and CSV export, plus the toolbar's range/bucket/
subtask/archived/assignee controls and the KPI strip), Activity (filters, search, infinite list,
rows open `TaskModal`), Press Kit (collaborative editor, revisions, export — `canEdit` gated), AI
(Q&A, the Action Plan lane with built-in and clipboard modes, per-action accept/decline and execute,
plus Document Intelligence, risk, sprint and capacity cards), and the Gantt route, which is still
reachable only through the Phase 2 Project actions › Timeline entry point.

What changed:

- **Section selector.** Insights renders a labelled "Section" control (2×2, 44px targets,
  `aria-pressed`) on compact instead of the `presskit-report-subtabs` strip. It calls the same
  `changeInsightSection`, so `?view=` values and the legacy `?tab=members|reports|ai` redirects are
  untouched, and the desktop strip is unchanged.
- **Charts get a data alternative.** `AnalyticsCard` gains a compact-only `Chart | Data` control.
  Data renders the card's own `csv` rows — the exact series the chart plots — as a scrollable table
  with a sticky header, row headers and a caption. A card with nothing to export says so. This is
  the answer to two phone problems at once: axis labels are illegible at 320px, and reading a series
  by pointing at it is a hover interaction. Chart stays the default and the toggle is reversible, so
  no existing affordance (chart type, Copy as PNG, CSV export, the risk radar's task links) is lost.
- **Per-action AI review is full-screen.** On compact the action plan is a list of summary rows —
  type badge, target, the action's headline parameter, and Accept/Decline on the row — plus an
  explicit **Review** control that opens the unchanged `ActionCard` editor (target picker and every
  typed field) in `MobileSheet variant="fullscreen"`, with focus returning to the row's Review
  button. Re-generating, importing, switching lane or starting over closes the review so it can
  never point at a stale action. Execute, the dropped-action notes, the clipboard lane and the
  per-action result badges are unchanged.
- **Gantt opens on a schedule.** `GanttChart` on compact shows a `Schedule | Timeline` control
  defaulting to Schedule: dated milestones with health, then every timeline row as text — title,
  subtask nesting, status, start, due (or "No due date"), dependency count and critical-path
  membership. Timeline renders the *same* SVG (extracted once into `chartFrame` and shared by both
  branches — the desktop chart is not duplicated or re-implemented) inside a bordered frame whose
  horizontal scrolling is contained, with a visible instruction. The page never scrolls sideways.
  `GanttView` gained a `cpm-gantt-page` class so its page chrome can narrow.
- CSS for the analytics grid/KPI strip/toolbar, activity filters and rows, press-kit panel and
  revision drawer, the AI panel and action-plan controls, and the Gantt schedule.

Checks run for this slice: new `InsightsCompact.test.jsx` → **6 tests pass** (data table shows the
same rows and is reversible; empty-data message; no view control on desktop; schedule carries
due/dependency/milestone facts and mounts no SVG; Timeline mounts the real chart inside the
contained frame; desktop chart and controls unchanged). `node scripts/check-tour-anchors.js` →
**118 / 118 / 94**. Targeted ESLint on the changed source and both new test files → **0 errors**
(the two test files carry the same scoped `testing-library/no-node-access` disable header the
existing shell tests use, so the repository lint baseline does not move).

Not yet done for this slice: no real-device pass; no authorized-account AI plan execution (nothing
was executed against a project); press-kit collaborative editing was not exercised on a phone — it
is adapted as a layout, and its editor toolbar is covered by slice D.

### 4C. Outreach

**Inventory taken first** (`inventory.md` §1, §4, §5, §6): seven tabs (Composer, Board, Calendar,
Campaigns, CRM, Blog, Insights) with `?tab=` deep links; page search and the activity feed; the
board's campaign filter, multi-select + bulk status/delete toolbar, per-card comments, Copy for
Posting, Expand to blog, Approve/Reject (admin/author), delete confirm, safety badge and approval
chips, and drag between five status columns; the CRM's type filter, search, contact drawer with its
stage strip, CSV import and contact form, and drag between five pipeline stages; campaign cards and
the campaign detail drawer; the composer's platform toggles, per-platform overrides, media list,
preview tabs and save/send row.

**`@hello-pangea/dnd` → `@dnd-kit` migration** (required by the repository instructions when
touching BoardTab). BoardTab now uses `DndContext` + `SortableContext` per column with
`useSortable` cards and a `useDroppable` column body, the same libraries the ProjectDetail kanban and
the CRM board already use. Desktop drag behaviour is preserved deliberately: cross-column drops call
the same `onStatusChange` and show the same toast, within-column drops still reorder locally through
`arrayMove` (that order was never persisted before either), `isDragDisabled` becomes `disabled` on
the same admin/author condition, empty columns still accept a drop, and a `DragOverlay` replaces the
old drag preview. **Nothing in `src/` imports `@hello-pangea/dnd` any more.** The package is still in
`package.json`; removing it touches the lockfile, so that is left as its own change and is recorded
in the root `AGENTS.md`, whose stack line now names `@dnd-kit` for all three boards.

What changed for phones:

- **Section selector.** Seven tabs become one labelled "Section" chip row (44px, `aria-pressed`,
  wrapping rather than scrolling). Chips are real buttons, not a `<select>`, so
  `outreach.tab.contacts` / `.campaigns` / `.blog` keep a mounted, clickable walkthrough target —
  the registry entries gained `layout: "both"` and `ANCHORS.md` records both presentations. No
  hidden duplicate anchor was introduced.
- **Board.** One stage at a time: a Stage chip row with per-stage counts, then a full-width card
  list, each card followed by an explicit **Move** button opening a status sheet. Choosing a status
  calls the same `onStatusChange` path the drag used (extracted into one `moveSubmission`) and
  switches the list to the destination stage so the move is visible rather than silent. The campaign
  filter, bulk toolbar and every per-card action stay exactly where they were.
- **CRM.** The same shape: a Stage chip row, a contact list, and a Move sheet per contact. Drag and
  sheet share one `changeStage` with the existing optimistic update and rollback-on-error. The
  contact drawer's own stage strip (already an explicit control) is untouched.
- **Composer, campaigns, preview and send.** Single-column composer, wrapped platform/preview/
  override tabs, a media grid that fits, 16px fields, and a sticky save/send row that stays above the
  bottom bar and the keyboard. No send, publish or approval step was altered: the safety badge,
  approval chips, bulk-delete confirm and per-card delete confirm are the same code paths.
- Campaign cards stack, and the campaign drawer, CRM drawer, contact form and insights modal fill the
  screen through `body.pm-m-compact` instead of being clipped.

**Narrow prerequisite defect fixed:** BoardTab derived `filtered` inline and depended on it from the
column-building `useEffect`. The array was rebuilt on every render, so the effect re-ran and re-set
state on every render. It is now `useMemo`d on `submissions` + `campaignFilter`.

Checks run for this slice: new `OutreachCompact.test.jsx` → **3 tests pass** (phone shows one stage
with counts and no `.pm-crm-board`; Move issues the same `PATCH /api/outreach/contacts/:id` with the
chosen stage and the list follows the contact; desktop still renders five columns with no Move
control). Existing `CrmTab.test.jsx` → **8 tests pass** unchanged, which is the desktop-board
regression check. Targeted ESLint on `OutreachHub.jsx`, `CrmTab.jsx` and the new test → **0 errors**.
`node scripts/check-tour-anchors.js` → **118 / 118 / 94**. `fa-arrow-right-arrow-left` was already in
the icon subset.

Not yet done for this slice: no real-device pass; **nothing was sent, published or approved** — no
outreach submission was posted, no campaign published and no contact emailed; the composer's send
path was exercised only as layout.

### 4D. Blog and course editors

**Inventory taken first** (`inventory.md` §5, §7): the blog editor's formatting toolbar (Format,
font, size, colour, highlight, heading, Lists, Add Section, Insert, table controls, Design, Find &
replace, undo/redo, Markdown mode, keyboard shortcuts), its collapse chevron, the mode control and
presence bar, the comment rail, the meta/review/AI side panels, revision history, snippets, the
section library, section settings, Share, Preview, Save draft and the Publish menu (publish,
schedule, unpublish, archive, delete) with its approval chips; and the course editor's structure
rail (modules, sections, add, reorder by drag, required toggle, delete), the per-kind builders, the
learner Preview link, Save draft and its own Publish menu.

What changed:

- **Compact primary toolbar plus a formatting menu.** On phones `BlogEditor` renders a short
  always-visible row — Bold, Italic, Undo, Redo, Add Section — and one labelled **More formatting**
  control that opens **the same `<Toolbar />`** full screen. The sheet is not a reduced copy: every
  band, select and menu is the existing component, so the two can never drift. Inside the sheet the
  bands stack and the toolbar menus open in flow (`position: static`), so a popup cannot be clipped
  by the dialog. Choosing Find, Snippets, Add Section or Markdown closes the sheet first so the
  surface it opens is not buried under it. Desktop keeps the full bar and its collapse chevron.
- `blog.editor.toolbar` now has a desktop and a phone owner, so its registry entry gained
  `layout: "both"` and `ANCHORS.md` records both. The primary row carries the anchor, so blog
  walkthrough steps still find a mounted, visible toolbar on a phone.
- `CompactPrimaryToolbar` lives in its own module. That is not cosmetic: `BlogEditor.jsx` imports
  TipTap, which Jest cannot load (ESM), so a component defined there cannot be unit tested at all.
- **Course editor section/block picker.** The structure rail cannot sit beside the editor at phone
  width, so it becomes one labelled control naming what is currently open, which opens the same rail
  full screen; choosing a module or section closes it. The rail is defined once
  (`railElement({ closeAfterSelect })`) and used by both layouts, so adding, reordering, the
  required toggle and delete are identical in both.
- **Preview and save/publish.** The preview frame goes full width at 70vh with its own scroll; the
  editor header becomes sticky and wrapping with 44px controls, so Save draft and the Publish menu
  stay reachable. No publish path changed: the Publish menu, its confirmations, the schedule popover
  and the approval chips are the same components and the same handlers. The comment rail already
  hides itself below its own `(min-width: 1100px)` query and thread clicks already fall back to the
  review panel — that existing behaviour is reused rather than duplicated. Side panels, the revision
  modal, snippets and the section library fill the screen instead of docking to a gutter that does
  not exist at this width. Collaboration (Hocuspocus provider, presence, follow mode), draft state
  and dirty/save indicators are untouched.

Checks run for this slice: new `blog/compactToolbar.test.jsx` → **4 tests pass** (each button runs
the editor command it names; active marks and can-undo/redo are reflected; Add Section stays on the
row and More formatting is a dialog opener; the walkthrough anchor is on the row).
`node scripts/check-tour-anchors.js` → **118 / 118 / 94**. Targeted ESLint on `BlogEditor.jsx`,
`CompactPrimaryToolbar.jsx`, `CourseEditorPage.jsx` and the new test → **0 errors**.

Not yet done for this slice: no real-device pass; **nothing was published** — no post or course was
published, scheduled, archived or deleted, and no AI review was run; collaborative editing was not
exercised with a second peer on a phone.

### 4E. Course learning

**Inventory taken first** (`CoursePlayerPage.jsx`): the learner rail grouped by module (per-module
collapse with an explicit override, locked-module teasers, per-section kind icon, done/locked/
optional state), the header with progress, due date, completion and the author-preview chip, and the
section body for each kind — CONTENT reader, locked VIDEO player, SLIDES player, QUIZ runner,
WALKTHROUGH launch card, LIT_REVIEW and ASSIGNMENT composers with their gates and submission
history, TRAINING — plus "Mark complete & continue".

What changed:

- **Collapsible contents.** On phones the rail moves inside a `<details>` that names where the
  learner is ("Contents · Section 3 of 11") and starts closed, so the lesson is the page. `<details>`
  keeps the rail mounted, so each module's open/closed override survives opening and closing it, and
  choosing a section closes it. Desktop keeps the sticky side rail.
- **Previous / Next.** The player had *no* step control at all — the rail was the only way through a
  course, and on a phone it is now collapsed. A sticky footer adds Previous / Next with a position
  readout. Both walk the server's flat, module-ordered section list and **skip locked sections**, so
  neither can offer a step the sequencing rules forbid (a locked section arrives without its
  content). The logic is `src/lib/courseSteps.js` — pure, because `CoursePlayerPage` imports TipTap
  and nothing defined there can be unit tested.
- Readable lessons, quizzes and assignments: single-column answer lists, 44px options and buttons,
  16px composers, wrapped quiz/player/launch action rows, and a slide stage that fits the width.
- Phone walkthroughs already work through the Phase 1 tour work (`step.compact` overrides,
  `compact.reveal` opening the sheet before measuring, the overlay docking clear of the bottom bar);
  this slice only made the launch card's controls touch-sized. No new walkthrough machinery.
- Course prose: `constellation-authoring/videos/V10-building-a-course.md` now says where the section
  rail is on a phone, since that script points at it on screen.

Checks run for this slice: new `lib/courseSteps.test.js` → **5 tests pass** (adjacent steps; locked
sections skipped in both directions; no previous at the start or next at the end; nothing offered
when everything else is locked; unknown selection and missing list). ESLint on
`CoursePlayerPage.jsx`, `courseSteps.js` and the test → **0 errors**.
`node scripts/check-tour-anchors.js` → **118 / 118 / 94**.

Not yet done for this slice: no real-device pass; no course was actually completed against a real
enrollment (no `completeCourseSection` call was made), and no live walkthrough was followed on a
phone — the tour path is Phase 1 evidence, not re-run here.

### 4F. Admin and meeting notes

**Inventory taken first** (`inventory.md` §1, §4): `/clubpm/admin` is admin-only and redirects every
other member; `/clubpm/meeting-notes` redirects to it. It stacks five sections — the pending reward
queue (approve / reject / adjust, with a history disclosure), the event reward config table,
Integrations (Google Drive connect), the Slack archive panel (backfill, storage health), and the
full meeting-notes generator (date picker, project list, generated editor, regenerate, retry). More
carries the Admin row with its three separate badges, for admins only.

What changed:

- **Grouped sections without hiding anything.** A phone-only labelled **Jump to** chip row links to
  each of the five sections, which now carry ids and a `scroll-margin-top` clear of the phone
  header. Deliberately *not* a `<details>` accordion: the admin tour measures
  `admin.rewards.pending`, `admin.rewards.config` and `admin.integrations`, and a collapsed section
  measures zero — the static anchor check cannot catch that, so a collapsed group would silently
  break three steps (this is the "tour anchor check is static only" trap).
- Pending rewards read as cards: the row becomes a grid, its approve/reject/adjust controls a
  full-width 44px group, and the history disclosure a 44px summary.
- The reward-config and Slack-archive tables scroll inside their own bordered frame, so the page
  never scrolls sideways while the table stays complete (plan §8 allows contained table scrolling
  with a visible indication).
- Meeting notes go to one column with a 50vh editor, wrapped toolbars, 44px actions and 16px date
  input; the existing `(max-width: …)` layout query it already had is reused, not duplicated.
- **Role restrictions are unchanged.** `AdminView` still redirects non-admins before rendering
  anything, the More menu still gates the Admin row and its three badges on `isAdmin`, and no gated
  control moved into an ungated menu.

Checks run for this slice: `node scripts/check-tour-anchors.js` → **118 / 118 / 94** (the three admin
anchors still resolve, and are still in the DOM unconditionally). ESLint on `AdminView.jsx` →
**0 errors**.

Not yet done for this slice: no real-device pass; **no pending reward was approved or rejected and no
meeting note was generated** — the queue was exercised as layout only, against no live record.

### 4G. Profile, Shop, Challenges

**Inventory taken first**: Profile (identity/rank card, XP bar and heatmap, badges, cosmetic locker
with per-slot equip, bio/contact editing, project and activity lists — plus the `/:memberId` view of
another member), Shop (`/api/shop/today` rotation with a featured hero, rank-gated rare and mythic
slots, wishlist hearts, purchase, consumables row and inventory effects), Challenges (Quests and
Achievements tabs, per-quest claim, the reward-roll modal), and the reward celebrations that mount
at shell level — rank-up, streak milestone, cosmetic unlock, reward roll.

What changed — layout only. No purchase, equip, claim or celebration rule was touched:

- Profile goes to one column; the edit form's fields are full width and 16px, its Save/Cancel pair a
  two-column 44px row, the cosmetic locker a grid that fits from 320px, and the badge row wraps.
- Shop header, rotation grid and consumables row reflow to fit; card descriptions wrap instead of
  overflowing; Buy is full width.
- Challenges tabs wrap at 44px, the quest list is one column and achievements a fitting grid.
- Celebrations keep covering the bottom bar (that is their design), but their own dismiss control is
  now full width and 48px, the card scrolls if it is taller than the screen, and it clears the
  home-indicator safe area — so a celebration can always be dismissed at 320px.

**Defect found by the browser harness and fixed:** the Shop wishlist heart rendered at under 44px on
a phone. It is now 44×44. This is exactly the class of thing source reading misses.

Checks run for this slice: the Phase 4 browser harness asserts Profile, Shop and Challenges each fit
a 320px screen with **no sub-44px control and no horizontal overflow** (6 checks). ESLint unchanged.

Not yet done for this slice: no real-device pass; **nothing was purchased, equipped or claimed** —
the fixture accepts writes and discards them, and no live celebration was triggered.

### 4H. Login and connection states

**Inventory taken first**: `/clubpm/login` is public and renders *outside* `AppShell` — the hero,
wordmark, feature list, the single "Sign in with Slack" action, and the `.pm-login-doc` sections that
a Google OAuth reviewer reads (scope justification table plus the Limited Use language). In-shell
failure surfaces: the ClubPM `ErrorBoundary`, the vault and GitHub setup/empty cards, the Slack
reconnect notice (HTTP 409 ⇒ reconnect, portal invariant 6) and the chat send-failure retry.

What changed:

- **Login is outside the shell**, so neither `.pm-shell--compact` nor `body.pm-m-compact` reaches it.
  Its phone rules are therefore a plain `@media (max-width: 640px)` block beside the existing login
  styles, and that is deliberate, not an oversight — it is noted in the stylesheet.
- The hero and the card each carried 2rem of side padding, which left a 320px screen with a ~160px
  content column and a sign-in button to match. One gutter is enough: the button is now the card's
  full width (248px at 320px) and at least 44px tall.
- The feature list goes to one column, the wordmark scales, and **the scope-justification table
  scrolls inside its own bordered frame** rather than widening the page — the table keeps every row
  and column.
- **Every `.pm-login-doc` section and the Limited Use language still render in full.** Nothing was
  hidden, collapsed or trimmed; the harness asserts both.
- In-shell error and reconnect surfaces get readable margins, wrapping text and full-width 44–48px
  actions, so a phone user who hits one can act on it.

Checks run for this slice: the harness asserts at 320px that all five `.pm-login-doc` sections and
the Limited Use text are present, that the sign-in action is full width and touch-sized, and that
the page has no horizontal overflow while the scope table stays contained (3 checks).

Not yet done for this slice: no real-device pass; **no sign-in was performed** (the fixture's
`/auth/slack` is not exercised), and no live 409 reconnect was triggered.

### Phase 4 cross-slice gates

| Check | Result |
| --- | --- |
| `npm run test:ci` | **54 suites / 381 tests pass** (Phase 3 baseline: 49 / 359). New: `vault/VaultCompact.test.jsx` (4), `InsightsCompact.test.jsx` (6), `OutreachCompact.test.jsx` (3), `blog/compactToolbar.test.jsx` (4), `lib/courseSteps.test.js` (5). The pre-existing App/AppShell jsdom `act` console noise is unchanged. |
| `node scripts/check-tour-anchors.js` | **118 anchors / 118 rendered / 94 used**, run explicitly. Four ids gained a second (phone) owner this phase — `project.tab.vault`, `outreach.tab.contacts/.campaigns/.blog`, `outreach.contact.card`, `blog.editor.toolbar` — each recorded as `layout: "both"` in the registry and in `ANCHORS.md`. |
| `npm run lint` | exits 1 at the documented **576 errors / 967 warnings** baseline — unchanged. (It briefly went to 577: an undefined `compact` in `OutreachHub.jsx` that lint caught and is fixed.) |
| `npm run check:icons` | **357 icon/style pairs**; only the documented pre-existing Pro-only `fa-calendar-star` warning. No new icon literal was introduced — every icon this phase uses was already in the subset. |
| `npm run build` | **exit 0**, existing CRA warnings only; all five `[minify-css]` targets pass (`clubpm-theme.css` 951.0 kB → 676.7 kB). |
| `check-phase4-tools.mjs` (new) | **53 / 53 pass**; console output is the documented Insights/Activity ErrorBoundary baseline only. |
| `check-phase1-shell.mjs` rerun | **213 / 213 pass.** |
| `check-phase2-tasks.mjs` rerun | **31 / 31 pass.** |
| `check-phase3-comms.mjs` rerun | **46 / 46 pass.** |

**Harness runs must not overlap with edits.** An earlier Phase 1 rerun reported 209/213, with four
failures on a single route reporting zero bottom-nav items. That was the CRA dev server reloading
mid-run because this session was editing `public/clubpm-theme.css` and running `npm run build` at the
same time: `App.js` wraps the whole `AppShell` in one `Suspense`, so during a reload there is no
shell at all to measure. Re-run alone, it is 213/213. Run one harness at a time and touch nothing
while it runs — they share the dev server and the fixture API.

**Phase 4 browser harness.** `scripts/check-phase4-tools.mjs` + `evidence/phase4/` (report plus 13
screenshots). At 320px it covers: the Files Source selector and its `sessionStorage` memory, a
full-screen vault item with `#root` inert and its metadata/version/checkout actions intact, the
Insights section selector, every chart's Chart/Data control and the resulting table, the AI goal
field's 16px text, the Gantt schedule-then-timeline pair with contained panning, the seven-chip
Outreach Section row with one mounted anchor per tour-targeted section, the board and CRM stage
lists with a Move sheet that issues the same `PATCH` the drag did, the collapsed course contents and
reachable Previous/Next, the admin jump list with all three tour anchors still measurable, a
non-admin still being redirected from `/clubpm/admin`, Profile/Shop/Challenges with no sub-44px
control, and the login page's scope sections, Limited Use text and sign-in button. It also checks
844×390 landscape and, at 1280px, that Files, Insights, Outreach, Gantt and Admin keep their desktop
presentation with no compact class or `body.pm-m-compact` and no horizontal overflow — and that the
Outreach board still has its five drag columns with **no** Move buttons.

The harness found four real defects that source reading had missed, all fixed:

1. The Shop wishlist heart was under 44px on a phone.
2. The login hero and card each carried 2rem of side padding, leaving a 320px screen with a ~160px
   sign-in button.
3. The login wordmark's font size was an **inline style** on its `<h1>`, so no stylesheet could
   shrink it and "Constellation" broke mid-word at 320px. The size moved to
   `.pm-login-wordmark h1` in CSS (desktop value unchanged) and the phone query now scales it.
4. **`public/style.min.css` carries a bare `nav { width: 100vw }`** and `index.html` loads it on
   every page, so the course player's new Previous/Next `<nav>` was 320px wide inside a 288px
   column. It and the admin jump `<nav>` now set `width: auto`. This one is worth remembering: the
   element overflows its *parent*, not the document, so a page-overflow check does not see it. It is
   recorded in `src/AGENTS.md`.

A CSS audit script also checked every one of the **352 class selectors** added this phase against
`src/`: all 352 are classes some component actually renders (several typos and stale names were
found and corrected this way).

The fixture API gained Phase 4 endpoints (vault, change requests, GitHub repos, outreach
submissions/contacts/campaigns, the learner course, pending rewards, shop rotation, quests and
achievements). Two shapes were corrected against the consuming components rather than guessed:
cosmetics use `doubloonPrice`, and `CosmeticChip` dereferences `category` without a guard.

**Honest limits.** This is Chromium viewport/touch emulation against fixture data. **Not done:** any
real iOS Safari or Android Chrome device, any real account or staging backend, any software
keyboard, any screen reader, and any real mutation — nothing was sent, published, approved,
purchased, claimed, completed or signed in during this phase. Slice D's blog and course *editors*
were not driven in the browser at all: they need a live Hocuspocus collaboration socket, which the
fixture does not provide, so their evidence is the unit test plus source review. That is the largest
gap in this phase's evidence and is listed first under the remaining gates below.

## Phase 3 implementation — communications, Calendar, and notifications (2026-09-15)

### What changed

- Compact `/clubpm/chat` stays on the channel list and includes `chat.people` (People & DMs). Desktop still redirects to its first joined channel; direct channel and `?thread=` links remain supported. Phone conversation/thread panes have explicit returns and URL/history-backed Back/Forward; the existing conversation stays mounted behind its thread, preserving its scroll and draft. Desktop multi-pane messaging remains unchanged.
- Members reuses the existing `DmInbox` and DM API. Phone Inbox/People entry leads to full-screen `?dm=` detail and URL-backed threads. Project Members starts on its project-filtered roster, retains `tab`/`view`, and keeps the same participant-filtered inbox. Desktop DM close retains its original query-navigation behavior.
- The shared composer retains text, selected-mention encoding, failed-send retry, and retryable attachment Files across conversation remounts. Immediate in-flight guards prevent duplicate sends/uploads. Existing post/file capabilities, preview/join, reactions, unread/mute, reconnect, and live/read-mark ownership remain in place. Thread load errors now expose Retry. No `<span>` or `<p>` was introduced in chat components.
- One shell-owned visual-viewport hook hides global navigation only for focused editable controls with substantial viewport contraction (>150px). Hardware keyboards leave navigation/shortcuts unchanged. The compact shell fits the visible viewport; history and thread bodies scroll above bottom composers. Touch message actions occupy their own row instead of squeezing message text.
- Phone Calendar starts on Agenda with date selection, project/member/type filters, and Month access. Event detail is URL-backed on phones; Back closes and Forward restores it. Links outside the painted date range resolve through the existing authorized event-detail endpoint. RSVP uses the existing attendees endpoint with retained error feedback. Existing Event/Import admin gates, Poll permissions, field validation, deadline privacy, and explicit public-event confirmation remain intact. Compact event/poll/import/detail portals are full-screen and safe-area/viewport scoped.
- Notification Center/preferences have readable compact rows and reachable controls, load errors with Retry, and task/channel/thread/event deep links. Course registry/ANCHORS, comms walkthrough copy and outline, and V04 communication/Calendar script were updated together. Theme href/preload/test are synchronized at `?v=4`; icon assets were regenerated by the build.

### Validation and evidence

| Check | Result |
| --- | --- |
| `npm run test:ci` | **49 suites / 359 tests pass**. New tests cover phone-list versus desktop redirect, direct channel/thread links and history, DM participant scope with one inbox fetch owner, failed sends/uploads, remounted mention drafts/retry, keyboard detection and hardware-focused rotation, agenda/Month/filtering, and RSVP. Pre-existing App/AppShell jsdom/act console noise remains; the new Calendar/composer suites are clean. |
| `node scripts/check-tour-anchors.js` | **118 anchors / 118 rendered / 94 used**; run explicitly. |
| Course JSON parse | **41 JSON files parse**. |
| Targeted Phase 3 ESLint | **0 errors / 0 warnings**. |
| `npm run lint` | exits 1 at the documented **576 pre-existing errors**, **967 warnings** (Phase 2: 968). |
| `npm run check:icons` | **357 icon/style pairs**; only the documented pre-existing Pro-only `fa-calendar-star` warning. Build verifies all 357 glyph pairs. |
| `npm run build` | **exit 0**, existing CRA warnings only; all five CSS minification targets pass. |
| Phase 1 shell browser rerun | **213/213 pass**. Its console still records the documented baseline Insights/Activity ErrorBoundary (`%o`, `[ClubPM ErrorBoundary]`); not a communication regression. |
| Phase 2 task browser rerun | **31/31 pass, 0 console errors**. |
| Phase 3 communication/Calendar browser harness | **46/46 pass, 0 console errors**, fixture-only Chromium touch/viewport emulation. |

Phase 3 fixture-only browser evidence is in `docs/superpowers/plans/2026-09-13-constellation-mobile-redesign/evidence/phase3/report.json` and six screenshots. The harness covers channel-list/desktop defaults, direct links, Back/Forward, one-pane threads and restored scroll, touch controls/readability, mentions, failed send/retry, preview/join request count, DM entry/direct return and project roster scope, simulated keyboard/nav interaction, Agenda/date/filters/Month, RSVP, authorized creation/public confirmation without publishing, and task/channel/thread/event notification routing.

### Remaining gates / next boundary

- **Real-device validation pending:** no real iOS Safari or Android Chrome access was available. Chromium viewport/touch and keyboard-contraction emulation is regression evidence, not a device pass. Validate software keyboards (including switching to hardware keyboards), safe areas/notches, browser chrome collapse, rotation, upload pickers/cancel/retry, edge-swipe/hardware Back, last-message visibility, and focus/scroll restoration on both platforms.
- **Authorized staging validation pending:** test member/admin and restricted conversation permissions, reconnect, realistic failed sends/uploads/RSVP, and event/poll creation against test accounts/fixtures. No real messages were sent and no live events/polls were created; the real backend and its cron/Bolt services were not started.
- Calendar Event/Poll/Import forms and event detail reuse Phase 1 `MobileSheet variant="fullscreen"`, including its focus trap, Escape/top-layer handling, inert background, scroll lock, and focus return; desktop retains the original portals.
- **VoiceOver/TalkBack validation pending:** list/detail/thread announcements and return focus, keyboard reachability, full-screen Calendar forms/detail, notification rows/preferences, and the updated comms walkthrough.
- Phase 3 is implemented but cannot be marked Complete until these gates pass. Phase 4 owns remaining Files/Vault/GitHub, Insights/AI/Gantt, Outreach, editor/learning, and secondary/admin dense views. No Phase 4 surfaces were redesigned opportunistically.

## Phase 2 implementation — home, projects, and task completion (2026-09-14)

### What changed

- Dashboard compact order is My work, the next event, My projects, then compact Progress & quests and expandable agenda/insight/GitHub support panels. The desktop branch retains its prior order and information. My projects consumes the existing `/api/projects` load through `ProjectNavContext`; it does not add another project store or request owner. Phone project cards expose labelled, 44px Tasks and Files controls instead of hover-only icons.
- Project Tasks now render four readable compact status groups with counts and collapse state, My tasks/All tasks, search, and one Filters & sort sheet. Every editable row has labelled Move and Assign controls. Those controls reuse the existing task PATCH paths, permission checks, blocker/dependency guards, optimistic update, rollback, and toasts. The desktop status bins, drag-and-drop board, and assignee rail are unchanged.
- Project task creation, `TaskModal`, and the legacy `TaskDetailModal` reuse the Phase 1 `MobileSheet variant="fullscreen"` on compact layouts. Task title, status, assignee, and due date remain prominent; subtasks, attachments, blockers/dependencies, comments, and time controls remain available. Sticky create/comment actions and 16px form fields keep the primary action usable at the keyboard-height proxy. Failed creates/comments retain input, and ref-backed in-flight guards prevent synchronous double submission.
- Opening a task preserves the existing `?task=` deep link. Closing removes only `task`, retaining project `tab`, `view`, component filters, collapsed groups, and the actual nested task-list scroll position, then returns focus when the opener still exists.
- The compact project hero keeps name/status/progress visible, moves description/Slack/Drive into an expandable resource panel, and exposes the shared Projects action sheet. Phone milestones use compact summaries and both milestones and Project actions expose Timeline (Gantt); detailed Gantt adaptation remains Phase 4.
- Tour/course changes landed with the UI: the registry and `ANCHORS.md`, affected Constellation 101 step files and walkthrough outline, C01/C02 prose, Q01/Q05 and quiz notes, and V01/V02 scripts now describe desktop columns versus phone status groups and explicit Move/Assign. Compact supporting panels use the new `expand` reveal mode.

### Narrow prerequisite defects fixed

1. Task close rebuilt the query string and stripped `tab`/`view`; it now removes only `task` on both layouts so existing deep links round-trip correctly.
2. The compact project flex chain clipped content and left the wrong element scrolling; height/overflow ownership now reaches `.cpm-proj-main-body`, enabling reliable task-list scroll restoration.
3. React state alone allowed two same-tick create submissions; both create forms now use an immediate ref guard in addition to disabled/loading UI.
4. Failed comment saves had no handled feedback path; they now toast the error and retain the draft.
5. Task-detail section headers were pointer-only and an icon-only close control lacked a name; the headers now support keyboard activation/expanded state and the control has an accessible label.
6. The dashboard project Files shortcut pointed at the calendar tab; it now targets Files.
7. Dashboard project data previously required a second owner/fetch; the existing `ProjectNavContext` now carries AppShell's catalog and refresh state for reuse.

### Validation and evidence

| Check | Result |
| --- | --- |
| `npm run test:ci` | **44 suites / 346 tests pass**; added compact task-detail and failed-comment/duplicate-submit coverage. |
| `node scripts/check-tour-anchors.js` | **117 anchors / 117 rendered / 94 used**. |
| Course JSON parse | **41 JSON files parse**. |
| `npm run lint` | exits 1 at the pre-existing **576 errors** baseline; warnings are **968** (below the Phase 1 baseline of 970). |
| `npm run check:icons` | **356 icon pairs resolve**; only the documented pre-existing Pro-only `fa-calendar-star` warning. |
| `npm run build` | exit 0; CRA compiles with existing warnings, all five CSS minification targets pass, and the icon subset is verified. |
| `check-phase2-tasks.mjs` | **31 / 31 pass, 0 console errors** using the isolated fixture API and headless Chrome. |

The Phase 2 browser matrix covers 320x640, 390x844, 430x932, 844x390 landscape, a 320x460 keyboard-height proxy, and a 1280x800 desktop boundary. It exercises dashboard order and touch-sized labelled actions; status groups, scope/search/filtering; move, assignment, comment, close and context/scroll restoration; deep links; milestone/Timeline access; failed create and retry; synchronous double-click protection; rotation and breakpoint crossing with a draft; horizontal overflow; and preservation of desktop bins/assignee rail. Evidence is in `docs/.../evidence/phase2/` (`report.json` plus six screenshots).

This is honest emulation evidence only: no real iOS/Android device, production/staging account, software keyboard, VoiceOver, or TalkBack was used. The fixture confirms request shape and UI rollback boundaries, not production authorization data. Desktop drag remains in the DOM and existing automated suite, but was not manually replayed against a real account.

### Remaining validation / next phase boundary

- Run the complete requested member journey and the permitted-assignment path on iOS Safari and Android Chrome against a staging backend, including a real failed save, software keyboard, browser chrome collapse, rotation, edge-swipe Back, and breakpoint crossing.
- Run VoiceOver and TalkBack through both full-screen task surfaces, the Move/Assign/filter sheets, collapse controls, and focus return.
- Recheck desktop drag/drop and restricted-permission behavior with real member/admin fixtures. No backend permission rule was changed.
- Phase 3 owns composer-wide keyboard/bottom-bar behavior (D7). Phase 4 owns the dense Gantt presentation; Phase 2 only makes existing Gantt access reachable.

## 0. Phase 1 — phone shell (2026-09-14)

### 0.1 How Phase 0's open decisions were resolved

The owner had not answered Q1 (approve D1–D11) when Phase 1 was requested. The request itself
restates D1–D8, D11 and the Q10 choice, so Phase 1 adopted **D1–D11 as written** plus these
recoveries, each the minimum needed to proceed:

| Item | Resolution used | Why |
| --- | --- | --- |
| D2 "CSS scoped under a class, not a duplicated media query" vs the request's "matched exactly by CSS" | **Both.** The query lives once in JS (`COMPACT_QUERY`); every compact rule is scoped under `.pm-shell--compact` **and** wrapped in an `@media` block with the identical string. `compactLayout.test.js` fails if the CSS string, the JS string, or the contract text drift, or if any compact selector sits outside that block. | The class keeps CSS and JS from ever disagreeing; the media wrapper keeps the rules off desktop-sized viewports even if the class were set. The switch only enables/disables — it never forces compact onto a viewport that fails the query. |
| Q10 Forward into a closed sheet | **Reopen.** Sheets are `location.state.pmOverlay`, so Back closes, Forward reopens, and a reload with a sheet open restores it. | Derived from history, so it can't go stale across AppShell remounts (B10). |
| Q9 tablets 768–1023 portrait | Unchanged desktop layout (out of scope, as recorded). Verified `x768` touch → desktop. | Plan scope. |
| Q2 phone `/clubpm/chat` auto-open | **Resolved in Phase 3:** compact stays on the channel list; desktop redirects as before. | Requested Phase 3 contract. |
| Q4 tiny desktop additions | **None made.** Desktop tree is unchanged at ≥768px. | Needs sign-off. |
| D9 project Actions | Phase 1 publishes `actions` (Edit project, Pin/Unpin, Timeline) through `ProjectNavContext` and lists them as "This project" at the top of the Projects sheet (project title → sheet). The hero's own Actions button / description move stays Phase 2. | Gives Timeline (Gantt) its first entry point anywhere without adding a fifth control to the 320px section bar. |
| `chat.people` anchor | **Implemented in Phase 3** on the compact Chat landing; More retains `nav.members`. | Registry/ANCHORS and comms course updated. |
| 1b shell remount (B10) | **Not done.** The shell still remounts per path change, as before. Phase 1 does not depend on it (overlay state lives in history; the notification feed is shell-owned). | Risky routing refactor outside the requested list; keep for its own change. |
| D7 hide the bar while the software keyboard is open | **Implemented in Phase 3**, with focused-editable + visual-viewport contraction detection. | Automated keyboard/nav checks pass; real-device gate pending. |

### 0.2 What changed

New files
- `src/clubpm/layout/compactLayout.js` — `COMPACT_QUERY`, `COMPACT_CLASS`, `useCompactLayout()` (`useSyncExternalStore` over one `matchMedia` list), `isCompactEnabled()`, `setCompactPreview()`.
- `src/clubpm/layout/shellOverlay.js` — `useShellOverlay()` (history contract §5) and the sticky walkthrough reveal (`requestShellReveal` / `getShellReveal`, scoped to the requesting step's route).
- `src/components/clubpm/MobileSheet.jsx` — shared sheet / full-screen dialog: body portal, one overlay stack, `inert` on `#root` and lower layers, Tab trap, Escape = top layer only, heading focus unless `[data-autofocus]`, focus return by stable selector, body scroll lock.
- `MobileBottomNav.jsx` (Home / Projects / Chat / Calendar / More, one `aria-current`, `aria-expanded` for sheets; reward particles fly to More), `MobileHeader.jsx` (title or Back + title, project-name switch, Search, bell link with unread count; `getCompactHeader()` deterministic parents; `MobileProjectSections`), `MobileProjectPicker.jsx` (starred ordering, client search not auto-focused, loading / empty / error + Retry, admin-only New project, This-project actions), `MobileMoreMenu.jsx` (account + Profile, progress & rewards with live StreakBadge, Quests, Shop, People & DMs, Notification Center, preferences, Outreach Hub, Blog, Courses, Admin with the same three badges for admins only, Keyboard shortcuts, Main site, spaced Sign out).
- `src/components/clubpm/useNotificationFeed.js` — the feed + single EventSource lifted out of `NotificationBell` into `AppShell`, gated on a signed-in member.
- Tests: `compactLayout.test.js` (+ `compactMediaTestUtils.js`), `MobileSheet.test.jsx`, `AppShell.compact.test.jsx`, `tour/TourProvider.compact.test.jsx`.
- `docs/.../scripts/check-phase1-shell.mjs`, `docs/.../evidence/phase1/` (43 PNG + `report.json`, 2.9 MB). `scripts/fixture-api.mjs` gained a `failProjects=1` state for the picker's error path.

Modified
- `AppShell.jsx` — compact branch renders `MobileHeader` / sections / bottom nav / sheets instead of sidebar + topbar; **every branch is a fixed-position slot** so crossing the breakpoint never remounts `children`; Cmd/Ctrl+K opens the full-screen Search on phones; project load now tracks loading/error with Retry (desktop sidebar still shows nothing on error, as before); reveal listener.
- `NotificationBell.jsx` — presentation only; takes `feed`. Desktop DOM unchanged.
- `AICommandPalette.jsx` — `compact` renders the same search inside `MobileSheet` (full-screen, field focused, Back/Escape close); `onNavigate` replaces the dialog's history entry. Desktop box unchanged.
- `ProjectDetail.jsx` — publishes `projectId` + `actions`; pin toggle extracted to `togglePinned` (same behaviour).
- `App.js` — `AppToaster`: bottom-centre above the bar on compact `/clubpm/*` only; unchanged elsewhere.
- `TourProvider.jsx` — `effectiveStep()` merges `step.compact` on phones; a layout effect requests the sheet reveal before the overlay measures or subscribes to clicks. `TourOverlay.jsx` — on ≤640px the docked card moves to the top when the target is in the lower half. Desktop steps and sidebar pinning unchanged.
- `public/clubpm-theme.css` — one appended block (compact) + a ≤640px tour-card rule; no existing selector touched. `loadClubPmTheme.js`, `public/index.html` preload, `loadClubPmTheme.test.js` → `?v=3` (the file's own BUMP rule; the preload had drifted at `v=1` and the test at `v=1` was already failing).
- `public/fa-subset.css`, `public/webfonts/fa-solid-900.woff2` — regenerated by the build for the new literals (`chart-gantt`, `sliders`, `arrow-right-from-bracket`, …).
- `scripts/check-tour-anchors.js` — reads `compact.anchor`/`compact.dim`/`compact.reveal`; registry `layout` (`both` | `desktop` | `compact`) and `reveal`; allows at most one desktop + one phone owner for `both` ids; fails a step with a desktop-only anchor and no `compact.anchor`, or a phone anchor inside a sheet without the matching `compact.reveal`; skips `*.test.js(x)`.
- Course sync (same change set): `tourAnchors.js` (+`nav.bar`, `nav.more`, `projects.sheet`; layout/reveal on every shell id), `docs/courses/ANCHORS.md` (phone column, layout/reveal, rule 6), 5 step files (15 step-level `compact` overrides: first-look ×6, comms ×3, rewards ×2, admin ×2, course-authoring ×2), the three `walkthroughs/README.md` outlines. Course `content/`, `videos/`, `quizzes/` had no shell wording to change (the remaining "hover"/"drag" wording is task-surface, Phase 2).
- `.github/workflows/deploy.yml` — passes repo variable `REACT_APP_CLUBPM_COMPACT` to the build. `AGENTS.md`, `src/AGENTS.md` — switch + shell notes.

### 0.3 Enablement switch — preview and disable

- Default: on. Compact mounts only when `COMPACT_QUERY` matches.
- Disable for everyone: set the repository **variable** `REACT_APP_CLUBPM_COMPACT` to `off` and re-run "Deploy to GitHub Pages" (baked in at build time). Locally: `REACT_APP_CLUBPM_COMPACT=off npm start`.
- Per browser (preview or opt-out): in DevTools, `localStorage.setItem('pm-compact','off')` or `'on'`, or `setCompactPreview` from `compactLayout.js`; `localStorage.removeItem('pm-compact')` restores the build value. Takes effect live (no reload).
- Off ⇒ no `.pm-shell--compact` class ⇒ none of the compact CSS applies; desktop shell at every width. Remove the switch in the Phase 5 follow-up.

### 0.4 Evidence

| Check | Result |
| --- | --- |
| `npm run test:ci` | **44 suites / 344 tests pass** (was 1 failing suite before: the `loadClubPmTheme` href test, fixed by the v=3 bump). New: 6 layout, 4 sheet, 25 shell, 4 tour. |
| `node scripts/check-tour-anchors.js` | OK — 113 anchors, 113 rendered, 94 used by steps |
| `npm run lint` | 576 errors / 970 warnings (baseline 576 / 971) — no new problems |
| `npm run build` | exit 0, "Compiled with warnings" (pre-existing); `[minify-css]` all 5 targets; minified `clubpm-theme.css` keeps the compact `@media` block |
| `npm run check:icons` | New icons present in the subset; only the pre-existing `fa-calendar-star` warning |
| `cd backend && npm run typecheck` | exit 0 (no backend code changed by this phase) |
| `check-phase1-shell.mjs` (headless Chrome, fixture API, touch emulation) | **213 / 213 pass** — `evidence/phase1/report.json` |

What the 213 browser checks cover: which shell mounts at d1440 / d1280 / x768-touch / l1024-touch (desktop) and x767-mouse / p390 / p320 / l844 (compact); desktop sidebar/topbar/main rects and breadcrumb **identical to Phase 0** on 6 routes × 2 widths (screenshots differ only in fixture dates); desktop Ctrl+K palette unchanged; 12 phone routes at 390 and 5 at 320/844: five labelled, hit-testable (`elementFromPoint`) bottom items, none truncated, all ≥44px, exactly one `aria-current`, correct header title/Back, no page-wide overflow, no duplicate `data-tour-id`; More sheet (modal, `aria-expanded`, heading focus, `#root` inert, every row hit-testable ≥44px, member vs admin rows/badges), Back closes / Forward reopens, destination replaces the sheet entry, Escape returns focus to More, Keyboard shortcuts from More; Projects sheet (search not focused, choose, 26-project internal scroll, 503 → error + Retry → recovers); project sections (`?tab=files`, current state, Back parity); project title → This-project actions → Timeline route; full-screen Search with focused field, Back closes; bell → Notification Center; five breakpoint crossings with **zero** notification/project/auth refetches and **zero** new SSE streams; walkthrough: first-look `xp` step on a phone opens More, rings `nav.xp` with phone copy and the card docked clear of it, next step closes the sheet; same step on desktop keeps desktop copy, pins the sidebar, opens nothing.

Console errors seen during the run (duplicate-key warning, `[ClubPM ErrorBoundary]` on Insights › Activity) are the same ones recorded in the Phase 0 baseline; the picker's `ApiError` is the deliberate fixture 503.

### 0.5 Not verified / remaining gate items

- **Real devices:** nothing run on iOS Safari or Android Chrome — safe-area insets, `100dvh` with collapsing browser chrome, touch Back gesture, and Forward-reopen are emulation-only.
- **Screen readers:** not run (VoiceOver/TalkBack). Roles, names, `aria-current`/`aria-expanded`, focus order and `inert` are asserted in DOM only.
- **Real accounts:** fixture member/admin personas only.
- **Hardware-keyboard Tab trap in a real browser:** asserted in Jest (jsdom), not in Chrome.
- **Remaining dense page bodies belong to Phase 4.** Phase 2 adapted tasks/projects; Phase 3 adapted communication, Calendar, notifications, and D7 keyboard/nav coordination. Real-device validation remains outstanding.
- Rank-up / streak celebrations are modals that cover the bottom bar while shown (by design; the harness seeds the last-seen rank to avoid them).
- B10 (shell remount per route) still present.

## 1. Phase 0 exit gates

| Gate (plan §6, Phase 0) | Result | Evidence |
| --- | --- | --- |
| Every existing destination has a phone entry point | **Passed in design and prototype.** All 24 `/clubpm` route entries (including 4 legacy redirects), every project sub-view, every shell control and gated action are mapped in `inventory.md` §1–§4; the prototype renders an entry point for each (primary screens fully, others as labelled stand-ins naming the real route). Includes three destinations that have **no entry point even on desktop today** (Gantt, Notification Center, Notification Preferences). Production implementation is Phase 1+. | `inventory.md`, `prototype/` |
| Five primary journeys fit without page-wide horizontal scrolling | **Partly passed.** Prototype: no page-wide overflow on 9 screens × 2 personas at 320, 390 and 844×390 (54 layout checks) and the journeys *open a project, update a task (status + assign without drag), reply to a message, find an event/RSVP* pass at 320px. **Unverified: *complete training*** — the course player was not prototyped or captured (no fixture for it). Production today fails this gate everywhere (expected; findings B1). | `evidence/prototype/report.json`, `findings.md` B1 |
| Desktop preservation boundaries documented | **Passed.** `contracts.md` §9, desktop baselines at 1440/1280 plus 768/1024 tablet and 767 mouse captures. | `evidence/browser/d1440-*`, `d1280-*`, `x768-*`, `x1024-*`, `x767-*` |
| Baselines at 1280, 1440, 320, 390, landscape (plan step 2) | **Captured with fixture data, not with real accounts or devices.** 44 + 13 captures of the production components. | `evidence/browser/SUMMARY.md` |
| Overflow, hover-only, keyboard obstruction, deep links recorded | Overflow, hover-only (sticky hover on tap) and deep links: **observed**. Keyboard obstruction: **proxy only** (460px-tall viewport), not a device. | `findings.md` B1–B16 |
| Breakpoint, long names, crowded list, admin menu tested (plan step 3) | **Passed in prototype** (8 boundary cases, 26-project picker, long project/channel/member names, member vs admin More). | `check-prototype.mjs` §1–§3 |
| Route/current map, overlay/history contract, tour-anchor map recorded (plan step 4) | **Done.** Missing API support flagged (none required; one security observation). | `contracts.md` §2–§8 |

Honest summary: the documentation, prototype and emulated evidence are complete; **nothing has been
checked on a real iOS or Android device, with a real account, or with a screen reader**.

## 2. Decisions made in Phase 0

| ID | Decision | Where |
| --- | --- | --- |
| D1 | Compact condition `(max-width: 767.98px), (pointer: coarse) and (hover: none) and (max-width: 1023.98px) and (max-height: 499.98px)`; 768px desktop verified usable | `contracts.md` §1 |
| D2 | Query defined once in JS (`useCompactLayout`); CSS scoped under a `pm-shell--compact` class set by AppShell instead of a duplicated media query; enablement switch = `REACT_APP_CLUBPM_COMPACT` + `localStorage['pm-compact']` preview override | `contracts.md` §1 |
| D3 | Bottom bar Home / Projects (sheet) / Chat / Calendar / More (sheet); Members → Chat; every other destination → More; exactly one `aria-current` item | `contracts.md` §2 |
| D4 | `ProjectNavContext` remains the source of truth; add `projectId` and `actions` descriptors; phone renders the section control under the header; section switches keep `replace` | `contracts.md` §3 |
| D5 | Single overlay stack; portal to body; `inert` background; heading focus (never auto-focus search in a sheet); z-index tiers (phone header 60, nav 90, sheets 820–821, under existing modals 900+, tour 9000) | `contracts.md` §4 |
| D6 | History: sheets push a same-URL entry; a destination chosen in a sheet replaces it; drill-downs push with `from`; direct-link Back replaces with a deterministic parent; no entries for typing/filters | `contracts.md` §5 |
| D7 | Bottom bar hides only when a text field is focused **and** the visual viewport shrank >150px; hardware-keyboard shortcuts unchanged; editable text ≥16px | `contracts.md` §6 |
| D8 | Tour steps gain an optional `compact` override (`anchor`, copy, `placement`, `reveal: more|projects|expand`); `check-tour-anchors.js` must read it; new ids `nav.bar`, `nav.more`, `projects.sheet`, `chat.people` | `contracts.md` §7 |
| D9 | Project header on phones: one-line name + status + % + labelled Actions; description/Slack/Drive move to Actions or an expander | `contracts.md` §3 |
| D10 | Home "My projects" is new UI over the existing `/api/projects` (the Dashboard has no project list today) | `inventory.md` §10, `findings.md` S9 |
| D11 | Bell on phones opens the Notification Center page; the EventSource/poll logic in `NotificationBell` must stay single-instance (extract a hook or add a variant) | `findings.md` S4–S5 |

## 3. Changed files (Phase 0 session — Phase 1 changes are in §0.2)

No existing file was modified. `git status` after this session shows only the pre-existing
`M FutureFeatures.txt` (untouched) and untracked documentation:

- `docs/superpowers/plans/2026-09-13-constellation-mobile-redesign-HANDOFF.md` (this file)
- `docs/superpowers/plans/2026-09-13-constellation-mobile-redesign/` — `README.md`, `inventory.md`,
  `findings.md`, `contracts.md`, `prototype/` (7 files), `scripts/` (7 files),
  `evidence/browser/` (57 PNG + `metrics.json`, `metrics-extras.json`, `SUMMARY.md`),
  `evidence/prototype/` (42 PNG + `report.json`), `evidence/source/` (3 generated `.md`). ≈7.8 MB of
  evidence; decide before committing whether to keep all screenshots in git (see §4 Q7).

The plan file itself is unchanged.

## 4. Unresolved issues and questions for the owner

| # | Item | Needed by |
| --- | --- | --- |
| Q1 | Approve D1–D11 (Phase 1 proceeded on them as written; see §0.1), or change them. | before Phase 1 is marked Complete |
| Q2 | Phone `/clubpm/chat` stops auto-opening the first channel; desktop keeps it. | Resolved in Phase 3 |
| Q3 | **Resolved in Phase 2:** fix both layouts. Closing removes only `task`, preserving `tab`/`view` and deep-link context. | Done |
| Q4 | Allow tiny desktop additions: "View all" in the bell dropdown, a Timeline link, removal of dead Dashboard code and the `/clubpm/activity` breadcrumb. | Phase 1–2 |
| Q5 | **Security, separate from this project:** `GET /api/projects` appears to return full `Member` rows (email, encrypted Slack/GitHub tokens, iCal secret) for every project member to any signed-in member (source reading; not verified live). Needs its own review. | now, independently |
| Q6 | Real-device + real-account validation: which phones (iOS Safari, Android Chrome), which test accounts (member + admin), and a staging database? Plan "open evidence" items (task frequency, hardware, accounts, device-specific course steps) are still open; device-specific steps now have a design (D8). | before Phase 1 exit |
| Q7 | Commit the ~100 screenshots as-is, downscale them, or keep only `SUMMARY.md` + a subset? | before first commit |
| Q8 | **Resolved in Phase 2:** use a compact hero plus expandable project resources and make the inner task body the scroll owner. The 844×390 overflow/controls check passes. | Done |
| Q9 | Tablets (768–1023 portrait, touch) keep the desktop layout and therefore its hover-only rail (B4). Out of scope per plan; confirm. | Phase 1 |
| Q10 | Forward into a closed sheet: reopen (React Router location-state implementation) or not (prototype)? Either satisfies D6. | Phase 1 |

Known gaps in the evidence: fixture API does not model every endpoint (Upcoming events shows "Invalid
Date"; Insights › Activity hit the ErrorBoundary; the change-request badge did not render). These are
harness artifacts, listed in `findings.md` › Limits. Counts of duplicate requests come from a
development build with React StrictMode.

Pre-existing baseline problems (not caused by this work): `npm run lint` exits 1 with **576 errors and
971 warnings in 32 files** on the untouched `src/`; build prints "Compiled with warnings". Phase 1 must
not increase these counts.

## 5. Checks performed this session

| Check | Result |
| --- | --- |
| `node .../scripts/check-prototype.mjs` (prototype, headless Chrome, touch) | **205 passed, 0 failed, 0 page errors** (final run after the last edit) |
| `node .../scripts/capture-baselines.mjs` (production components, fixture API) | 44 captures; metrics in `evidence/browser/metrics.json` |
| `node .../scripts/capture-extras.mjs` | 13 captures (767/768/1024 boundary, admin sidebar, rank-up overlay) |
| `node scripts/check-tour-anchors.js` | OK — 110 anchors, 110 rendered, 91 used by steps (unchanged) |
| `npm run build` (repo root) | exit 0, "Compiled with warnings"; `[minify-css]` covered all 5 targets |
| `npm run typecheck` (backend) | exit 0 |
| `npm run lint` | exit 1 — pre-existing (576 errors / 971 warnings); no `src/` files changed |
| Prototype from `file://` | loads and navigates in Chromium |
| Font Awesome subset | proposed icons present in `public/fa-subset.css` except `ellipsis-vertical`, `sliders`, `filter` — the subset build picks them up once they appear as literals in `src/`; confirm with `npm run check:icons` in Phase 1 |

Not run: frontend Jest (`npm run test:ci`) — no source changed; real devices; screen readers.

## 6. Exact next steps

Phase 1 sub-steps 1a and 1c–1f (the Phase 0 plan below this line in history) are done — see §0.
1b (shell remount, B10) was deliberately not done; schedule it as its own change.

**To mark Phase 1 Complete**
1. Owner signs off Q1 (D1–D11 and the §0.1 recoveries) and Q7 (whether `evidence/phase1/`, 2.9 MB,
   and the Phase 0 screenshots are committed).
2. Real-device pass (Q6): one iOS Safari + one Android Chrome against a **staging** backend with a
   member and an admin test account — never production credentials. Walk: every bottom item; More →
   each row; Projects → switch, This-project actions; Search; bell; Back/Forward and the edge-swipe
   Back gesture with a sheet open; rotate with a half-typed draft; the first-look and rewards tours.
   Check safe areas (home indicator, notch in landscape) and `100dvh` with the browser bar collapsing.
3. Screen-reader pass: VoiceOver (iOS) and TalkBack — sheet announced as a dialog, focus lands on its
   heading, background unreachable, focus returns to the opener, current/expanded states read.
4. Re-run `check-phase1-shell.mjs` after any shell change (fixture API + `npm start`, see README).

**Commit guidance (when authorised):** commit the Phase 1 source, CSS, tests, anchor registry,
`ANCHORS.md`, step files and walkthrough outlines **together** (repo course-sync rule). Leave the
unrelated pre-existing working-tree changes (`backend/**`, `FutureFeatures.txt`,
`backend/src/db/prisma.test.ts`) out of that commit.

**Phase 4 implementation is done — all eight slices and the cross-slice gates.** See the Phase 4
section near the top of this file for the per-slice record. What remains before Phase 4 can be
called **Complete** (in priority order):

1. **Drive the blog and course editors in a browser.** They are the only Phase 4 surfaces the
   harness does not cover: they need a live Hocuspocus collaboration socket, which the fixture does
   not provide. Walk the phone primary toolbar and the More-formatting sheet, the course Sections
   picker, preview, Save draft and the publish menu, on a staging backend.
2. **Real devices (Q6):** one iOS Safari + one Android Chrome against staging, member and admin
   accounts — never production credentials. Walk each slice's acceptance gate from the plan's Phase 4
   table, with attention to the software keyboard over the sticky composer/save rows added this
   phase, contained horizontal scrolling (Gantt timeline, scope table, config tables) with a real
   touch, and the celebration overlays at 320px.
3. **Authorized-account mutations.** Nothing was mutated in this phase. Still to exercise against
   test data: a vault check-in and change-request review, an AI plan execution, an outreach stage
   move and a composer send, a course section completion, a pending-reward approval, a shop purchase
   and quest claim, and a real sign-in.
4. **Screen readers:** VoiceOver and TalkBack through the new full-screen dialogs (vault item, AI
   action review, formatting sheet, Move sheets), the `<details>` course contents, and the admin
   jump list.
5. Re-run `check-phase4-tools.mjs` (and the Phase 1–3 harnesses) after any further shared-shell
   change. Run them **one at a time**: they share the fixture API and the dev server, and two
   concurrent runs interfere.

Phase 5 is now implemented — see the Phase 5 section near the top. Keep unrelated working-tree changes out of any later authorized commit, and commit
source/CSS/tests/course artifacts together. Do not push or deploy without new authorization.

## 7a. Phase 4 session housekeeping (2026-09-15)

CRA dev on :3000 and the fixture API on :3001 were started for the browser evidence and **stopped at
the end of the session**. The real backend was never started: `backend/.env` holds live
Slack/GitHub/Google credentials and its Bolt app and cron scheduler act on the real workspace.
Headless Chrome profiles live in the OS temp directory.

Files changed in Phase 4 (all in the working tree, nothing committed, nothing pushed or deployed):

- Source: `AppShell.jsx` (`body.pm-m-compact`), `ProjectDetail.jsx`, `GanttChart.jsx`,
  `ActionPlanReview.jsx`, `analytics/AnalyticsCard.jsx`, `vault/{VaultItemModal,VaultUploadModal,
  ChangeRequestModal}.jsx`, `DrivePreviewModal.jsx`, `CrmTab.jsx`, `OutreachHub.jsx`,
  `blog/BlogEditor.jsx` + new `blog/CompactPrimaryToolbar.jsx`, `CourseEditorPage.jsx`,
  `CoursePlayerPage.jsx` + new `lib/courseSteps.js`, `AdminView.jsx`, `GanttView.jsx`, `Login.jsx`.
- CSS: `public/clubpm-theme.css` (one appended block per slice inside the single compact
  `@media`, plus the phone login rules beside the existing login styles) and the `?v=5` bump in
  `loadClubPmTheme.js`, its test and the `index.html` preload.
- Tests: `vault/VaultCompact.test.jsx`, `InsightsCompact.test.jsx`, `OutreachCompact.test.jsx`,
  `blog/compactToolbar.test.jsx`, `lib/courseSteps.test.js`.
- Course sync: `tourAnchors.js`, `docs/courses/ANCHORS.md`,
  `constellation-authoring/videos/V10-building-a-course.md`.
- Docs: `AGENTS.md` (dnd-kit stack line + the leftover `@hello-pangea/dnd` dependency note),
  `src/AGENTS.md` (`body.pm-m-compact`, the `nav { width: 100vw }` trap, the corrected ProjectDetail
  tab list), this handoff, and the plan folder's `README.md`.
- Evidence: `scripts/check-phase4-tools.mjs`, `scripts/fixture-api.mjs` (Phase 4 endpoints),
  `evidence/phase4/` (report + 13 screenshots).

## 7. Session housekeeping

Servers started for evidence (CRA dev on :3000, fixture API on :3001; Phase 0 also used a prototype server on :4410) were stopped
at the end of each session. Headless Chrome profiles live in the OS temp directory (`cpm-phase0-*`).
