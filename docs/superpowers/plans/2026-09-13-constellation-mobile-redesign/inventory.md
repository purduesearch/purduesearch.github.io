# Constellation destination and operation inventory (Phase 0)

Date: 2026-09-13
Source of truth: the current working tree (`main` at `4cb57ccb` plus the uncommitted plan). Where
older documentation disagrees, the source wins and the disagreement is noted.

**Purpose.** Later phases must not lose less-visible functionality. Every row below needs a phone
entry point before the redesign is called complete. The "Phone entry" column is the Phase 0
mapping that the prototype implements (see `prototype/README.md`) and that Phase 1 must build.

Legend for "Reach today": **Nav** = sidebar or topbar, **In-page** = only from another page,
**URL** = no in-app link found, **Key** = keyboard shortcut only.

## 1. Routes (`src/App.js`)

All `/clubpm/*` routes except `/clubpm/login` are wrapped in `ClubPmProtectedPage` → a *new*
`ProjectNavProvider` + `AppShell` per route element (`src/App.js:86-94`). The route tree is keyed by
`location.pathname` (`src/App.js:123`), so the whole shell remounts on every path change (see
findings F-S4).

| Route | Component | Gate | Reach today | Phone entry (proposed) | Current bottom item | Adapted in |
| --- | --- | --- | --- | --- | --- | --- |
| `/clubpm/login` | `pages/ClubPM/Login.jsx` | public | redirect when signed out | unchanged (no shell) | — | Phase 4 (login slice) |
| `/clubpm` | `Dashboard.jsx` | member | Nav: Dashboard | Home | Home | Phase 2 |
| `/clubpm/projects/:id` | `ProjectDetail.jsx` | member; edits need channel membership (`canEdit`) | Nav: sidebar project list; palette | Projects sheet → project | Projects | Phase 1 (nav) / 2 (tasks) |
| `/clubpm/projects/:id/gantt` | `GanttView.jsx` | member | **URL only** — no link anywhere in `src/` | Project actions › Timeline; Tasks › "Open timeline" | Projects | Phase 2 (link) / 4 (view) |
| `/clubpm/members` (+`?dm=`) | `MembersView.jsx` | member | Nav: Social › Members; Chat page link | Chat › People & DMs card; More › People & DMs | Chat | Phase 3 |
| `/clubpm/chat` | `ChatPage.jsx` | member | Nav: Social › Chat | Chat | Chat | Phase 3 |
| `/clubpm/chat/:channelId` (+`?thread=`) | `ChatPage.jsx` | conversation access (server) | channel list; notifications | channel list row | Chat | Phase 3 |
| `/clubpm/notifications` | `NotificationCenter.jsx` | member | **URL only** — the bell opens a dropdown with no "view all" link | Header bell | More | Phase 1 (entry) / 3 |
| `/clubpm/notifications/preferences` | `NotificationPreferences.jsx` | member | In-page: Notification Center only (itself URL-only) | Notifications › Preferences; More › Notification preferences | More | Phase 1 / 3 |
| `/clubpm/calendar` | `CalendarPage.jsx` | member; admin-only create/import/move | Nav: Social › Calendar; Key `g e` | Calendar | Calendar | Phase 3 |
| `/clubpm/admin` | `AdminView.jsx` | **admin** (redirects others to `/clubpm`) | Nav: Other › Admin (admins) | More › Admin (admins only, badges) | More | Phase 4 |
| `/clubpm/meeting-notes` | redirect → `/clubpm/admin` | — | Key `g n` | (redirect kept) | More | — |
| `/clubpm/outreach` (+`?tab=`) | `OutreachHub.jsx` | member; admin review/delete | Nav: Other › Outreach Hub; Key `g o` | More › Outreach Hub | More | Phase 4 |
| `/clubpm/outreach?tab=blog` | `OutreachHub` › `BlogTab` | member | Nav: Other › Blog | More › Blog | More | Phase 4 |
| `/clubpm/outreach/blog/:id/edit` | `BlogEditorPage.jsx` | author/editor | In-page: Blog tab | Blog list (unchanged route) | More | Phase 4 |
| `/clubpm/courses` | `CoursesPage.jsx` → `CoursesTab` | member; admin dashboard/assign | Nav: Other › Courses | More › Courses | More | Phase 4 |
| `/clubpm/courses/:id/edit` | `CourseEditorPage.jsx` | author | In-page | Courses (unchanged route) | More | Phase 4 |
| `/clubpm/courses/:slug/learn` | `CoursePlayerPage.jsx` | enrolled member | In-page; shared links | Courses (unchanged route) | More | Phase 4 |
| `/clubpm/outreach/courses*` | legacy redirects | — | old links | kept | — | — |
| `/clubpm/profile`, `/clubpm/profile/:memberId` | `Profile.jsx` | member | Nav: sidebar user block | More › account row › Profile; member rows | More | Phase 4 |
| `/clubpm/shop` | `Shop.jsx` | member | Nav: sidebar doubloon button | More › Progress › Shop | More | Phase 4 |
| `/clubpm/challenges` | `ChallengesPage.jsx` | member | Topbar trophy | More › Quests & achievements; Home › Progress | More | Phase 4 |
| `/rsvp/:eventId`, `/schedule/:token` | public pages in ClubPM look | public | links | unchanged (no shell) | — | out of scope (check only) |

Breadcrumb-only paths with **no route**: `/clubpm/activity` (`AppShell.jsx:39`) falls through to the
public `NotFound`. Nothing links to it; remove the breadcrumb case in Phase 1.

## 2. Project sub-views (`ProjectDetail.jsx`)

`NAV_TABS` (`ProjectDetail.jsx:161`) is the live taxonomy: **Tasks, Files, Chat, Insights**. The shell
renders them from `ProjectNavContext`; ProjectDetail does not render its own tab bar. Stale docs:
`src/AGENTS.md` lists "tasks, files, chat, members, reports, and AI" and the root `AGENTS.md` file map
says "kanban/milestones/files/vault/ai" — both predate the Members→Chat and Reports/AI→Insights merge.

| URL | Section | Contents / operations | Notes |
| --- | --- | --- | --- |
| `?` (no tab) | Tasks | Show archived, Sort (priority/due/status/created/title/tags), four status bins (collapsible, counts), per-bin **Add Task**, Blocked bin sub-groups (category blockers with owner picker, rename/recolor, **Resolve**), task rows (drag, click → TaskModal, Ctrl/Cmd/Shift multi-select → BulkActionBar), Archived group with **Unarchive**, Timeline (embedded `GanttChart`), right-hand **AssigneePanel** (Everyone/Nobody chips, search, draggable member chips, Ctrl-click group) | No search box and no My/All toggle exist today; the plan proposes them. `board.filters` wraps only the archived/sort row. |
| `?tab=files` | Files | Source toggle Drive / GitHub / Vault (remembered in `sessionStorage` per project); `DriveFilesPanel`, `GitHubPanel`, `VaultTab` (sub-views Vault / Change Requests / Review Queue (admin); filters All/Parts/Released/Checked out; upload, item modal with versions/BOM/check-out, CR create/review) | Vault review queue is admin-only. |
| `?tab=chat` | Chat › Messages | `ChatTab` (project channels, `?channel=`, `?thread=`) | |
| `?tab=chat&view=members` (+`dm`) | Chat › Members | `MembersView projectId` (roster filtered to project, DMs) | |
| `?tab=insights` | Insights › Charts | `ProjectAnalytics` (risk radar opens tasks) | |
| `?tab=insights&view=activity` | Insights › Activity | `ProjectActivity` (rows open TaskModal) | |
| `?tab=insights&view=presskit` | Insights › Press Kit | `PressKitPanel` (collab editor; `canEdit`) | |
| `?tab=insights&view=ai` | Insights › AI | `AiPanel`: Ask, Action Plan (goal → `ActionPlanReview` accept/decline → execute), clipboard prompt/import lane | `ai.goal` anchor |
| `?task=<id>` | any | Opens `TaskModal` | Close does `navigate('/clubpm/projects/:id', { replace: true })` — strips `tab`/`view` (F-S7). |
| legacy `?tab=members` / `reports` / `ai` | redirects | rewritten with `replace` to the merged tabs (`ProjectDetail.jsx:2111-2137`) | preserve |

Project header operations (`ProjectDetail.jsx:3096-3226`): **Edit project** (canEdit → `EditProjectModal`),
**Pin/Unpin** (localStorage `pm-starred-projects`, drives sidebar order), **Link Slack channel**
(`SlackChannelPicker`), **Drive folder** pill (preview/change; admin), "View only" lock, description
**Read more** and **Edit description** (admin). Phone: Project actions sheet (prototype) + summary line.

## 3. Shell-level controls and operations (`AppShell.jsx`)

| Control | Where today | Gate | Phone placement (proposed) |
| --- | --- | --- | --- |
| Dashboard link | sidebar | — | Bottom: Home |
| Social group → Chat / Members / Calendar | sidebar group (collapsed by default) | — | Bottom: Chat, Calendar; Members via Chat card + More |
| Other group → Outreach Hub / Blog / Courses / Admin | sidebar group | Admin: `isAdmin` | More › Club tools |
| Admin badges: pending rewards, open CRs, certificates | inside Admin child | admin | More › Admin row, three separate labeled badges |
| Project tabs (from context) | sidebar section | — | Project section control under the header |
| Project list (starred first, status dot/star) | sidebar | — | Projects sheet (Starred, All; star toggle) |
| **New project** `+` → `CreateProjectModal` | sidebar header | **admin** (not "under the existing permission rule" for members — members never see it) | Projects sheet › New project (admins) |
| Profile (avatar, name, handle, rank icon) | sidebar footer | — | More › account row › Profile |
| XP bar + doubloons (→ Shop) | sidebar footer (`SidebarXpDoubloons`) | — | More › Progress & rewards |
| Main site | sidebar footer | — | More › Account › Main SEARCH site |
| Sign out | sidebar footer | — | More › bottom, separated |
| Keyboard shortcuts button | topbar | — | More › Help (modal also on `?`) |
| Search / command palette (`AICommandPalette`) | topbar + Cmd/Ctrl+K | — | Header search icon → full-screen palette |
| Quests (trophy) | topbar | — | More › Quests & achievements |
| Streak badge (+ tooltip on hover) | topbar | — | More › Progress (streak tile) |
| Notification bell + dropdown | topbar | — | Header bell → Notification Center |
| Breadcrumb | topbar | — | One-line title / Back |

Shell-mounted overlays and listeners (must stay single-instance): `AICommandPalette`,
`CreateProjectModal`, `RankUpModal`, `StreakMilestoneModal`, `RewardFlux`, `CosmeticUnlockModal`,
`QuestCompleteToast`, `RewardQueuedToast`, `AchievementUnlockListener`, the cosmetic theme loader,
admin count fetches, and `NotificationBell` — which also owns the **app-wide EventSource + poll**
(`NotificationBell.jsx:174,197-244`) that re-broadcasts Slack events as window events used by Chat.

## 4. Role and permission gates found in the UI

| Gate | Where | Effect |
| --- | --- | --- |
| `member.isAdmin` | AppShell | Admin nav child + badges; New project `+`; admin count requests |
| `member.isAdmin` | `AdminView.jsx:23` | Non-admins redirected to `/clubpm` |
| `member.isAdmin` | `ProjectDetail` | Edit description; Drive folder admin controls |
| `canEdit` = no linked channel **or** member in `channelMemberSlackIds` | `ProjectDetail.jsx:3081` | Add Task, drag moves, Edit project, BulkActionBar, blocker edit/resolve, press kit edit; "View only" chip otherwise |
| `isAdmin` or `role === 'ADMIN'` | `CalendarPage.jsx:239` | New event/import/drag-move; poll delete also for organizer |
| admin / author | `OutreachHub.jsx:142-146,548` | delete, review, copy, drag on board |
| admin | Vault review queue, CR review (`cr.review`) | approve/reject |
| admin | `CoursesTab` progress dashboard, assign, certificate review | |
| author/owner (server) | task delete, comment edit/delete | shown/hidden inside `TaskModal` |
| `slackCapabilities.post/files` | `ChatComposer.jsx:50,172` | composer vs reconnect notice; 409 ⇒ reconnect (portal invariant 6) |

Phone rule: every gated row keeps the same gate; the prototype shows the Admin row, New project, and
admin badges only for the admin persona (`scripts/check-prototype.mjs` asserts the member case).

## 5. Modals, drawers, sheets and overlays

| Overlay | File | Presentation today | Portal? | z-index | Phone target |
| --- | --- | --- | --- | --- | --- |
| Command palette | `AICommandPalette.jsx` | centred box, `max-width: calc(100vw - 32px)` | yes | 800 | full-screen dialog |
| Notification dropdown | `NotificationBell.jsx` | 320px absolute dropdown | no | 700 | replaced by Notification Center page |
| Keyboard shortcuts | `KeyboardShortcutsModal.jsx` | modal | — | — | More › Help |
| Create project | `AppShell.jsx:163` | inline-styled modal | no | 900 | full-screen form |
| Edit project | `EditProjectModal.jsx` | `.cpm-proj-edit-overlay` | — | 950 | full-screen form |
| Task detail | `TaskModal.jsx` (+ sub-modals at 1000) | `min(820px, 96vw)`, 92vh, has full-screen toggle; sub-modals: move, duplicate, shift dates, delete confirm | yes | 1000 | full-screen dialog, sections collapsed |
| Legacy task detail | `TaskDetailModal.jsx` | **not imported anywhere** (dead) | — | — | drop from Phase 2 file list |
| Add project task | `ProjectDetail.jsx:1038` (`AddProjectTaskModal`) | modal | — | — | full-screen form |
| Blocker name prompt | `ProjectDetail.jsx:667` | modal on drop into Blocked | — | — | status sheet › Blocked |
| Bulk action bar | `BulkActionBar.jsx` | fixed bar | — | — | Select mode bar |
| Drive preview | `DrivePreviewModal.jsx` | modal | — | — | full-screen |
| Event detail / form / import / poll | `CalendarPage.jsx`, `EventFormModal`, `CalendarImportModal`, `MeetingPollModal`, `MeetingPollBoard` | modals (poll board has 640px rules) | — | — | full-screen forms |
| Contributor import | `MembersView.jsx:145` | modal | — | — | full-screen |
| DM panel | `members/DmPanel` | docked panel / 75vh at ≤860px | no | — | full-screen conversation |
| Chat thread drawer | `chat/ChatThreadDrawer.jsx` | 340px drawer; column at ≤900px | no | — | full-screen thread |
| Outreach submission form | `SubmissionFormModal.jsx` | modal + floating "new" button | — | — | Phase 4 |
| CRM contact modal + drawer | `CrmTab.jsx` | modal/drawer (640px rules) | yes | — | Phase 4 |
| Vault item / CR modals | `vault/*` | modals | — | — | Phase 4 |
| Blog editor side panels, revision drawer, generate modal | `blog/*`, `BlogTab` | drawers/rails with 720/480px rules | — | — | Phase 4 |
| Course gen / assign / outline modals | `courses/*` | modals (640px rules) | — | — | Phase 4 |
| Reward celebrations | `celebrate/RankUpModal`, `StreakMilestoneModal`, `CosmeticUnlockModal`, `challenges/RewardRollModal`, `RewardFlux`, toasts | full-screen/centred | mixed | 950–9999 | keep, verify fit at 320px (Phase 4) |
| Tour overlay | `clubpm/tour/TourOverlay.jsx` | scrim + ring + card | — | 9000 | above all phone layers |

Counts from source: 38 ClubPM files call `createPortal`; 127 lines carry `createPortal`, `role="dialog"` or
`aria-modal`. Five files set an inline `position: fixed` overlay (AppShell, CosmeticUnlockModal, TaskModal,
Dashboard, ProjectDetail). The memory note about `revealStagger` transforms applies:
any new phone sheet must be portalled to `document.body`.

## 6. Interactions that currently require hover, drag, or modifier keys

| Interaction | File | Phone alternative (prototype) |
| --- | --- | --- |
| Sidebar labels, project names, section labels, sign-out label: `opacity: 0` until `.pm-sidebar:hover` | `clubpm-theme.css:2945-3175` | Bottom nav + sheets with persistent labels |
| Move task between status bins by drag | `ProjectDetail` `DndContext` (PointerSensor, 8px) | Status button → status sheet; status control in task detail |
| Attach task to a blocker category by drag | `handleDragEnd` | Status › Blocked asks for the blocker (as today's drop prompt); task detail › Blockers |
| Assign by dragging member chips (and Everyone/Nobody) | `AssigneePanel` | Assign picker sheet with Everyone / Nobody |
| Set blocker owner by dropping a member on a sub-bin | `handleDragEnd` | owner picker already exists (click) — keep |
| Multi-select tasks: Ctrl/Cmd-click, Shift-click range | `handleRowClick` `ProjectDetail.jsx:2575-2611` | Project actions › Select tasks (checkbox mode + bulk bar) |
| Multi-select members for group assign: Ctrl/Cmd-click | `DraggableMemberChip` | Assign picker is already multi-select |
| Dashboard project quick actions on mouse-enter | `Dashboard.jsx:1114` `ProjectListItem` | **dead code** — never rendered (F-S9) |
| Streak tooltip on hover | `StreakBadge.jsx:141` | Streak tile in More |
| Calendar tooltips on hover | `CalendarTab.jsx:101,125` | tap opens detail |
| Palette selection follows mouse | `AICommandPalette.jsx:147` | tap |
| Outreach BoardTab drag (legacy `@hello-pangea/dnd`) | `OutreachHub.jsx` | explicit Move (Phase 4; migrate to dnd-kit if touched) |
| CRM pipeline drag (dnd-kit) | `CrmTab.jsx` | stage selector (already has `.pm-crm-stage-btn` at 640px) |

## 7. Keyboard shortcuts (hardware keyboards must keep working on phones/tablets)

Global (`GlobalShortcutsSetup.jsx`): `g d` Dashboard, `g e` Calendar, `g o` Outreach, `g m` Members,
`g n` Meeting Notes (→ Admin redirect; non-admins bounce to Dashboard), `?` help. Shell: Cmd/Ctrl+K
palette (`AppShell.jsx:369`). Page: Outreach `n` new submission, `c` composer, `/` focus search; blog
editor Ctrl/Cmd+B/I/U/K/S/Z/Shift+Z and `Ctrl/Cmd+\` autocomplete.
Existing conflict: the shell's Cmd/Ctrl+K listener is on `document` and `preventDefault`s, so it
competes with the blog editor's Ctrl/Cmd+K "link" binding. Out of scope; recorded for Phase 4.

## 8. Existing responsive rules

Full list: `evidence/source/clubpm-theme-media-queries.md` (120 `@media` blocks; 17 at `max-width:
640px`, 12 at 900px, 7 at 768px, 7 at 480px, 8 `hover: hover`, 31 reduced-motion). None of them
touch the shell (`.pm-sidebar`, `.pm-shell-main` margin, `.pm-topbar`), the ProjectDetail three-column
flex (`.cpm-project-layout`, `.cpm-assignee-panel` 280px), or TaskModal. Useful existing adaptations to
reuse: chat page single column at ≤860px (`:26956`), members/DM single column at ≤860px (`:27042`),
chat thread drawer column at ≤900px (`:26659`), dashboard single column at ≤780px (`:2024`), CRM
drawer/stage buttons at ≤640px (`:11642`), poll board at ≤640px, blog editor header/toolbar at
≤720/480px, course rail/editor at ≤900px, login doc at ≤640px, tour pill at ≤640px.
JS width logic: `BlogEditor.jsx:790` (toolbar collapsed ≤640px on mount), `CourseSectionRail.jsx:119`,
`TourOverlay.jsx:21` (viewport tracking), `anim/motion.js` (`hover: hover`). No shared layout hook exists.

## 9. Tour anchors that depend on the shell

`src/clubpm/tour/tourAnchors.js` registers 18 shell ids (14 `nav.*`, 4 `topbar.*`) plus the five
`project.tab.*` ids. Steps that target shell, dashboard, project-tab, `board.filters` or
`board.memberchips` anchors: `evidence/source/shell-tour-steps.md` (27 steps across 9 walkthroughs). Course prose naming desktop-only UI (sidebar, Social, rail, drag, hover):
`evidence/source/course-prose-desktop-terms.md`. Migration map: `contracts.md` §6.

## 10. Orphaned, dead, or stale items found (preserve or fix deliberately)

| Item | Evidence | Recommendation |
| --- | --- | --- |
| Gantt route has no link | `rg "/gantt" src` → only `App.js` + breadcrumb | Add Project actions › Timeline (Phase 2) |
| Notification Center + Preferences have no entry point | bell dropdown has no "view all"; only `NotificationCenter` links to Preferences | Header bell → Center on phones; add "View all" to desktop dropdown (tiny, Phase 1) |
| `ProjectsSidebar`, `ProjectListItem`, `QuickCreateFAB/Drawer`, Dashboard `CreateProjectModal` never rendered; `TaskDetailModal.jsx` never imported | `Dashboard.jsx:181-1243` vs render at `:1442-1462` | Dashboard has **no project list today**; phone Home "My projects" is new UI over existing `/api/projects`. Delete dead code separately. |
| `dash.project.card` anchor never mounts | inside unrendered `ProjectsSidebar` | registry says "First card in the grid" — stale; the static check cannot see it |
| Agenda "More" button has no handler | `Dashboard.jsx:1030` | remove or wire (Phase 2) |
| `/clubpm/activity` breadcrumb without a route | `AppShell.jsx:39` | remove case |
| Quick action `?tab=calendar` | dead `ProjectListItem` | not a valid tab; dies with the dead code |
| Palette `/new-project` and `/my-tasks` both just navigate to `/clubpm`; task results open the project, not the task | `AICommandPalette.jsx:6-9,119-121` | no "confirmation flow" exists (the plan's wording is stale); open `?task=` on phones |
