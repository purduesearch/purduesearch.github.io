# Phase 0 contracts: layout, navigation, overlays, history, keyboard, tours

Date: 2026-09-13. Status: **decided for Phase 1** unless marked *open*. Each decision cites the
evidence that supports it. The prototype (`prototype/`) implements every contract here except where
noted "production-only", and `scripts/check-prototype.mjs` asserts them (205 checks, all passing).

## 1. Compact-layout condition

```text
(max-width: 767.98px),
(pointer: coarse) and (hover: none) and (max-width: 1023.98px) and (max-height: 499.98px)
```

- **767.98px, not "below 768"**: a fractional viewport (767.5px at some zoom levels) must not fall
  between the phone and desktop rules. At 768px the existing desktop layout is usable
  (`evidence/browser/x768-tablet-tasks.png`: project main 424px + 280px panel, no overflow), so the
  plan's boundary holds.
- **Landscape clause** requires a coarse primary pointer *and* no hover *and* a short viewport. Verified
  in the prototype: 844×390 touch → compact; 1023×480 touch → compact; 1024×480 touch → desktop;
  900×520 touch → desktop; 844×390 mouse window → desktop (check-prototype §1). Production today
  renders the desktop layout at 844×390 and the project header fills the screen (findings B8).
- **Narrow desktop windows below 768px get the compact layout** (intended; a mouse does not make a
  366px content column usable). 767px mouse window today = desktop shell (`x767-mouse-*.png`).
- Tablets 768–1023 portrait and 1024+ keep the desktop layout **in this scope**, including its
  hover-only rail (touch tablets hit findings B4). Recorded as a known limitation, not fixed here.

**Single source of truth (decision).** Define the query once in JS
(`src/clubpm/layout/compactLayout.js`, proposed: `COMPACT_QUERY` + `useCompactLayout()` built on
`useSyncExternalStore(matchMedia)`), and let `AppShell` put a class on the shell root
(`pm-shell--compact`). Phone CSS in `public/clubpm-theme.css` is scoped under
`.pm-shell.pm-shell--compact …`, **not** under a duplicated `@media` query. Reasons: CSS and JS can
never disagree about which presentation is mounted; the Phase 5 enablement switch becomes one
boolean (`useCompactLayout` returns `false` when disabled) with no CSS change; the shell is
client-rendered so there is no first-paint mismatch. Portalled sheets add the same class to their own
root. Add a Jest source-inspection test that the constant string matches this document.

Enablement switch (Phase 1 builds it, Phase 5 removes it): build-time `REACT_APP_CLUBPM_COMPACT`
(`on` default, `off` disables) plus a per-browser preview override `localStorage['pm-compact']`
(`on`/`off`). Document both where `.env.example` is documented; never persist it server-side.

## 2. Route → current bottom item

| Route | Current item (`aria-current="page"`) | Header |
| --- | --- | --- |
| `/clubpm` | Home | "Home" + Search + Bell |
| `/clubpm/projects/:id` (any `tab`/`view`/`task`) | Projects | Project name button (opens picker) + Search + Bell; section control below |
| `/clubpm/projects/:id/gantt` | Projects | Back (→ project) + "Timeline" |
| `/clubpm/chat`, `/clubpm/chat/:id` | Chat | list: "Chat"; conversation: Back + `#name` + Actions |
| `/clubpm/members` (incl. `?dm=`) | Chat | Back (→ chat) + "People & DMs"; DM: Back (→ DM list) |
| `/clubpm/calendar` | Calendar | "Calendar" |
| everything else (notifications, preferences, profile, shop, challenges, outreach, blog editor, courses, player, editor, admin) | More | Back + page title |

Projects and More are **buttons** (`aria-haspopup="dialog"`) that open sheets; while a sheet is open
its button has `aria-expanded="true"` and the route's item keeps `aria-current`. Exactly one item is
current on every route (asserted for 9 routes × 2 personas × 3 sizes in check-prototype §2).

## 3. Project navigation

- **Source of truth stays `ProjectNavContext`.** ProjectDetail keeps publishing `NAV_TABS`, the active
  tab and `changeTab`. Phase 1 adds two fields to the published value: `projectId` (the picker and
  header need it; today AppShell only has the name) and `actions` — descriptors
  `{ id, label, icon, onSelect, hidden }` for Edit project, Pin, Slack channel, Drive folder, Timeline,
  Edit description, Select tasks — so the phone "Project actions" sheet renders from the same
  permission checks ProjectDetail already computes (`canEdit`, `isAdmin`).
- **Phone placement.** AppShell's compact branch renders the four section links directly below the
  header (the prototype's `.m-sections`). The desktop sidebar block is not rendered in compact mode, so
  `project.tab.*` tour ids mount exactly once.
- **Section switches use `replace`** on both layouts (unchanged desktop behaviour; measured today:
  Back after a tab switch leaves the project, findings B11). Sections are peers, not drill-downs.
  Sub-views (`view=members`, Insights section, Files source) also `replace`.
- **Project picker** uses AppShell's existing `/api/projects` result and the `pm-starred-projects`
  localStorage list + `pm-stars-changed` event. It needs loading, empty, and error/Retry states — today
  AppShell swallows the error (`.catch(() => {})`), so a failed load shows an empty sidebar. New project
  stays admin-only. Search is client-side over names.
- Project header on phones: one-line name (ellipsis; full name in the picker), status chip, completion
  %, and a labelled "Actions" button. The description, Slack picker and Drive pill move into Actions /
  an expander (Phase 2).

## 4. Overlay stack and stacking order

One `OverlayStack` provider in AppShell owns every *new* phone surface (sheets, full-screen dialogs,
the phone presentation of search). Rules, all implemented in the prototype:

1. Portal to `document.body` (the `revealStagger` transform residue otherwise re-parents fixed
   children — see memory note); restate `font-family`/`color` on the portal root.
2. Only the top layer is interactive: everything beneath gets `inert`. Tab is trapped in the top
   layer. Escape closes the top layer only.
3. Focus moves to the layer's `data-autofocus` target, else its heading (`tabindex=-1`). **Never
   auto-focus a search field in a sheet** — on a phone that raises the keyboard over the list.
4. Closing returns focus to the opener (stored by a stable key, because re-renders replace nodes).
5. At most one sheet per level; stacking is allowed only from a full-screen dialog (e.g. Assign picker
   over task detail — asserted in check-prototype §3a).
6. Body scroll is locked while a layer is open; the layer scrolls itself (`overscroll-behavior: contain`).

z-index tiers (existing values audited from `clubpm-theme.css`):

| Tier | Value | Notes |
| --- | --- | --- |
| Page content | 0 | |
| Phone header / section bar | 60 | desktop topbar is 50 |
| Phone bottom nav | 90 | below every existing overlay; desktop sidebar is 100 |
| Existing notification dropdown | 700 | desktop only after Phase 1 |
| Existing command palette | 800 | phone presentation moves into the stack |
| **Phone sheets** (scrim 820, sheet 821) | 820–821 | above palette, below existing modals |
| Existing modals (create 900, edit project 950, TaskModal 1000, poll board 1050, others ≤1500) | 900–1500 | Phase 2–4 convert them to stack members |
| Celebrations (`pm-celebrate-*`, reward flux 950, confetti) | 950–9999 | audit in Phase 4; must not trap Back |
| Tour overlay | 9000 | stays above every phone layer |
| Toasts (`react-hot-toast`) | library default | bottom-right on desktop; phone: bottom-centre above the nav |

## 5. History, Back and Forward

| Transition | History operation | Back does |
| --- | --- | --- |
| Bottom-nav destination (Home, Chat, Calendar) | push | previous screen |
| Project chosen in picker / More destination | **replace the sheet entry** | the page that was under the sheet |
| Open a sheet (Projects, More, Filters, Actions, Assign…) | push a same-URL entry carrying `{ overlay: id }` | closes the sheet, page unchanged |
| Close a sheet by ✕, scrim, Escape | `history.back()` if the top entry is that sheet, else remove | — |
| Project section / sub-view switch | replace | leaves the project (desktop parity) |
| Drill-down (task detail, conversation, thread, DM, file detail, stub page) | push with `state.from` | the exact previous screen (same list, filters, scroll) |
| Direct/external link to a drill-down (no in-app `from`) | — | header Back **replaces** with the deterministic parent (below); browser Back leaves normally |
| Legacy URL (`?tab=members/reports/ai`) | replace (existing) | — |
| Typing, filter changes, search text | no history entry | — |

Deterministic parents: task → its project with the same `tab`/`view`; conversation → `/clubpm/chat`;
thread → its conversation; DM → `/clubpm/members?view=dms`; Gantt → project; notification
preferences → notifications; any More destination → `/clubpm`.

Forward into a sheet entry: the prototype does not reopen it. In production, implementing sheets as
React Router location state (`navigate(location, { state: { ...state, overlay } })`) will reopen it on
Forward; **either is acceptable** — the requirement is no duplicated or stale sheet. Record the choice
in Phase 1.

Phone-only changes that touch existing behaviour (need sign-off, *open*):
- `/clubpm/chat` must not auto-open the first channel on phones (findings B6); desktop keeps it.
- Closing TaskModal should restore `tab`/`view` instead of stripping them (findings S7). This is a
  desktop bug too; fixing it on both is recommended but changes desktop behaviour — decide in Phase 2.
- Signed-out deep links should carry a return path (findings B16) — backend/auth change, out of scope.

## 6. Keyboard behaviour

**Software keyboard.** Hide the bottom bar only when *both* a text field is focused *and*
`innerHeight - visualViewport.height > 150`; restore on blur/resize. Focus alone never hides it (a
hardware keyboard does not shrink the viewport) — asserted both ways in check-prototype §3d.
Conversation and form footers (composer, Save/Create) sit in the layer's own grid row, so they rise
with the keyboard instead of being covered. *Open, device-only:* iOS Safari does not resize the layout
viewport; Phase 3 must test whether the composer needs a `visualViewport` offset, and whether to set
`interactive-widget=resizes-content` in the viewport meta **from the ClubPM shell only** (the meta in
`public/index.html` is shared with the public site).

**Hardware keyboard.** All existing shortcuts stay active in compact mode (`g d/e/o/m/n`, `?`,
Cmd/Ctrl+K, Outreach `n/c//`, blog editor keys). Cmd/Ctrl+K opens the full-screen search. Focus order:
header → section bar → main → bottom nav. Visible `:focus-visible` rings on every control.

**Inputs.** Editable text ≥16px (no iOS zoom-on-focus); tap targets ≥44×44 CSS px for phone chrome
(asserted for the bottom bar; remaining sub-44px controls in the prototype are listed in
`evidence/prototype/report.json › controlsUnder40pxInView` for Phase 1 to close).

## 7. Tour-anchor migration

Principles (from the plan §7, now concrete): one mounted target per id — the desktop and compact
branches are mutually exclusive, so an id may appear as a literal in both files but only one mounts;
providers stay outside the branch; never skip a step silently.

**Device-specific steps (decision).** Add an optional `compact` object to a step in `*.steps.json`:

```json
{
  "id": "the-rail", "anchor": "nav.sidebar", "title": "Start here", "body": "…desktop copy…",
  "placement": "right", "advance": { "on": "next" },
  "compact": { "anchor": "nav.bar", "body": "Everything hangs off this bar…", "placement": "top" }
}
```

- `TourProvider`/`TourOverlay` merge `step.compact` over the step when `useCompactLayout()` is true.
- `compact.reveal: "more" | "projects" | "expand"` asks the shell to open that sheet (or expand the collapsed Home panel) (via the OverlayStack API)
  **before** `findAnchor` measures and before the click listener subscribes; the sheet stays open until
  the step advances. The tour scrim (9000) sits above sheets (821).
- `TourOverlay`'s sidebar pinning (`closest('.pm-sidebar')`) is a no-op in compact mode; keep it.
- `scripts/check-tour-anchors.js` must also read `compact.anchor` (it currently reads `anchor` and
  `dim` only — a compact anchor typo would pass). Registry entries gain `layout: "both" | "desktop" |
  "compact"` for the human docs; `docs/courses/ANCHORS.md` gets the same column.

Shell anchors (steps that use them: `evidence/source/shell-tour-steps.md`; `#n` below is the
zero-based step index in that walkthrough's `steps` array). `reveal` values: `more`, `projects`,
`expand`.

| Anchor | Desktop owner | Compact owner | Reveal | Steps affected → action |
| --- | --- | --- | --- | --- |
| `nav.sidebar` | sidebar `<nav>` | — (new `nav.bar` = bottom bar) | — | first-look#0 → `compact.anchor: nav.bar`, rewrite copy |
| `nav.dashboard` | sidebar link | bottom Home | — | first-look#1, comms#7 → same id; copy says "Home" on phones |
| `nav.social` | sidebar group | — (group removed) | — | comms#3 (click) → `compact.anchor: nav.chat`, copy: Chat + People & DMs |
| `nav.chat` | Social child | bottom Chat | — | registry only |
| `nav.calendar` | Social child | bottom Calendar | — | comms#4 → same id |
| `nav.members` | Social child | More › People & DMs (and `chat.people` card) | more | registry only |
| `nav.projects` | sidebar project list | bottom Projects button; new `projects.sheet` for the list | projects (for sheet) | first-look#7 → same id; admin-tour#6 (all projects) → `compact.anchor: projects.sheet`, `reveal: projects` |
| `nav.courses` | Other child | More › Courses | more | course-authoring#0, #6 (click) → `reveal: more` |
| `nav.admin` | Other child | More › Admin | more | admin-tour#0 (click) → `reveal: more` |
| `nav.other` | sidebar group | — | — | registry only; mark desktop-only |
| `nav.shop` | sidebar doubloons | More › Progress › Shop | more | rewards#3 (click) → `reveal: more` |
| `nav.profile` | sidebar user block | More › account row › Profile | more | rewards#6 (click) → `reveal: more` |
| `nav.xp`, `nav.rank` | sidebar XP/rank | More › Progress block | more | first-look#2 → `reveal: more` |
| `topbar.search` | topbar ⌘K | header search icon | — | registry only |
| `topbar.notifications` | topbar bell (dropdown) | header bell (→ Notification Center) | — | first-look#5 (click) → same id; copy changes (opens the page) |
| `topbar.streak` | topbar badge | More › Progress streak tile | more | first-look#6 → `reveal: more` |
| `topbar.challenges` | topbar trophy | More › Quests & achievements | more | registry only |
| `project.tab.*` | sidebar project tabs | section bar under header | — | board-basics#1, blocked#10, vault#0, cr#0 → same ids |
| `board.memberchips` | AssigneePanel | — (panel not shown on phones) | — | board-basics#7 ("These chips are draggable…") → `compact.anchor: board.card.first`, copy "open a task, then Assign"; must not teach dragging |
| `board.filters`, `board.newtask`, `board.column.*`, `board.card.first` | Tasks toolbar/bins | phone toolbar/groups (same ids) | — | same ids; verify placement copy |
| `dash.work`, `dash.agenda` | Dashboard panels | Home › My work, Next up | — | first-look#3, #4, comms#8 → same ids |
| `dash.insights`, `dash.quests` | Dashboard panels | Home › collapsed expanders | `expand` (open the `<details>` before measuring) | comms#9 → `reveal: expand` |
| `dash.project.card` | never mounts today (dead code) | Home › My projects first row | — | fix the registry note; no steps use it |
| new: `nav.bar`, `nav.more`, `projects.sheet`, `chat.people` | — | bottom bar, More button, picker body, Chat › People card | — | add to registry + ANCHORS.md in Phase 1 |

Course prose to rewrite alongside (sidebar/Social/rail/drag/hover wording): 
`evidence/source/course-prose-desktop-terms.md`. Drag-teaching steps (board-basics, blocked-and-
unblocked) need compact copy that uses the status and Assign controls instead of dragging.

## 8. API support

No new API is required for Phase 1–3 as designed. Flags:

- **Home "My projects"** needs the member's projects. `/api/projects` returns *all* projects with
  full `members` rows; filtering client-side by membership works but see findings S17 (payload and
  possible field exposure) before relying on it more.
- **Palette task results opening the task** needs only the existing `projectId` in `/api/tasks/search`.
- **Signed-out return path** (B16) would need an auth-flow change — not planned.
- Chat, DMs, calendar agenda, notification center: existing endpoints suffice.

## 9. Desktop preservation boundaries

- At ≥768px (and not in the landscape clause) the desktop tree renders byte-for-byte as today: sidebar,
  topbar, breadcrumb, project sidebar tabs, AssigneePanel, drag, Ctrl/Shift selection, dropdown bell,
  palette box. Phase 1 changes to shared components must be gated on `useCompactLayout()`.
- Exceptions proposed for desktop, each needing explicit sign-off: add a "View all" link to the bell
  dropdown (S4), add a Timeline link (S6), fix TaskModal close param-stripping (S7), remove dead code
  (S9, S15). None is required by the phone work.
- Regression evidence to compare against: `evidence/browser/d1440-*`, `d1280-*`, `x768-*`, `x1024-*`,
  `x767-*`, `x1440-admin-sidebar-hover-other.png`.
- Mount only one presentation: providers, polling (`NotificationBell` EventSource/poll, StreakBadge
  60s poll), reward listeners and the palette stay single-instance across the branch switch (S5).
