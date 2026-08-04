# Tour Anchor Vocabulary

Every walkthrough step targets a UI element by **anchor id**. This file is the human-readable
contract; `src/clubpm/tour/tourAnchors.js` is the machine-readable one, and
`scripts/check-tour-anchors.js` fails the build when the two disagree with each other or with the
step files.

## Rules

1. Naming is `surface.element[.variant]` — lowercase, dot-separated, no spaces.
2. An id appears in **exactly one** component. If two elements would share an id, one of them is
   wrong.
3. Adding `data-tour-id` to a component means adding the id here and to the registry, in the same
   commit. The check script enforces all three.
4. Anchors are **not** styling hooks and must never be selected in CSS. Once a stylesheet depends on
   one, removing a dead anchor becomes a visual risk instead of a cleanup.
5. `route` records where the anchor is reachable. The tour runtime navigates there before hunting for
   the element, so a wrong `route` means a step that degrades for no reason.

## Shell and navigation — `src/components/clubpm/AppShell.jsx`

| Anchor | Element | Route |
|---|---|---|
| `nav.sidebar` | The whole sidebar, for coarse dimming | `*` |
| `nav.dashboard` | Dashboard link | `*` |
| `nav.projects` | Projects link | `*` |
| `nav.members` | Members link — a child of the Outreach group† | `*` |
| `nav.calendar` | Calendar link | `*` |
| `nav.courses` | Courses link | `*` |
| `nav.shop` | Shop link | `*` |
| `nav.outreach` | Outreach group header (collapsible, not a link) | `*` |
| `nav.admin` | Admin link (admins only) | `*` |
| `nav.profile` | Sidebar user / profile link | `*` |
| `nav.xp` | Sidebar XP progress bar | `*` |
| `nav.rank` | Sidebar rank badge | `*` |
| `topbar.notifications` | Notification bell | `*` |
| `topbar.search` | AI command palette trigger | `*` |
| `topbar.streak` | Streak flame counter | `*` |
| `topbar.challenges` | Quests button (trophy icon) | `*` |

† The sidebar is an icon-only rail that expands on hover, and group children are `display: none`
until it does. The static check still sees `nav.members` because the literal is in `NAV_ITEMS`, but a
step that targets it will measure a zero rect and degrade. Don't target a group child until the rail
keeps its children in layout.

## Dashboard — `src/pages/ClubPM/Dashboard.jsx`

| Anchor | Element | Route |
|---|---|---|
| `dash.quests` | Daily quests widget | `/clubpm` |
| `dash.work` | "My work" filterable task list | `/clubpm` |
| `dash.agenda` | 7-day agenda panel | `/clubpm` |
| `dash.leaderboard` | Leaderboard panel, at the bottom of the member roster | `/clubpm/members` |
| `dash.insights` | AI insight cards | `/clubpm` |
| `dash.project.card` | First project card in the grid | `/clubpm` |

## Project detail — `src/pages/ClubPM/ProjectDetail.jsx`

| Anchor | Element | Route |
|---|---|---|
| `project.header` | Project title + status row | `/clubpm/projects/:id` |
| `project.tab.tasks` | Tasks tab&Dagger; | `/clubpm/projects/:id` |
| `project.tab.files` | Files tab&Dagger; | `/clubpm/projects/:id` |
| `project.tab.reports` | Reports tab&Dagger; | `/clubpm/projects/:id` |
| `project.tab.ai` | AI tab&Dagger; | `/clubpm/projects/:id` |
| `project.tab.vault` | Vault **sub**-tab, inside the Files tab | `/clubpm/projects/:id` |
| `board.newtask` | "New task" button | `/clubpm/projects/:id` |
| `board.filters` | Filter / search row above the board | `/clubpm/projects/:id` |
| `board.column.TODO` | To-do column | `/clubpm/projects/:id` |
| `board.column.IN_PROGRESS` | In-progress column | `/clubpm/projects/:id` |
| `board.column.BLOCKED` | Blocked column | `/clubpm/projects/:id` |
| `board.column.DONE` | Done column | `/clubpm/projects/:id` |
| `board.card.first` | First card in the to-do column | `/clubpm/projects/:id` |
| `board.memberchips` | Draggable member chip rail | `/clubpm/projects/:id` |
| `board.blocker.bin` | Blocker sub-bin under the Blocked column | `/clubpm/projects/:id` |
| `ai.goal` | Action-plan goal input | `/clubpm/projects/:id` |

&Dagger; The project tab bar is rendered by **AppShell** from `ProjectNavContext`; `ProjectDetail` only
supplies the list (`NAV_TABS`, each entry carrying its `tourId`). These ids must sit on AppShell's
buttons. They previously sat on a `ProjectSidebar` component in `ProjectDetail.jsx` that nothing
rendered — the static check passed while every step targeting them degraded.

## New-task modal — `src/pages/ClubPM/ProjectDetail.jsx` (`AddProjectTaskModal`)

| Anchor | Element | Route |
|---|---|---|
| `task.create.modal` | The New Task panel, opened by `board.newtask` | `/clubpm/projects/:id` |
| `task.create.title` | "Task Title" field | `/clubpm/projects/:id` |

&sect; **Creating a task does not open the task modal.** The create form asks only for a title,
priority, due date, milestone and tags, then closes; the new card lands in the column it was created
from. A step that needs any `task.modal.*` anchor below must therefore first spotlight the card and
wait for the learner to click it — see `your-first-task`'s `open-it` step. Skipping that leaves five
consecutive steps hunting for a modal nobody opened.

## Task modal — `src/components/clubpm/TaskModal.jsx`

| Anchor | Element | Route |
|---|---|---|
| `task.modal` | The modal shell (opened by clicking a card) | `*` |
| `task.modal.title` | Title field | `*` |
| `task.modal.status` | Status selector | `*` |
| `task.modal.priority` | Priority selector | `*` |
| `task.modal.assignees` | Assignee picker | `*` |
| `task.modal.due` | Due-date field | `*` |
| `task.modal.description` | Description body | `*` |
| `task.modal.comments` | Comment composer | `*` |
| `task.modal.timelog` | "Log time" control | `*` |
| `task.modal.subtasks` | Subtask list | `*` |
| `task.modal.deps` | Dependencies section | `*` |
| `task.modal.blockers` | Blockers section | `*` |
| `task.modal.history` | History / audit tab | `*` |

## Gamification

| Anchor | Element | Route |
|---|---|---|
| `challenges.active` | Active quest list | `/clubpm/challenges` |
| `challenges.claim` | Claim button on the first claimable quest | `/clubpm/challenges` |
| `challenges.achievements` | Achievement grid | `/clubpm/challenges` |
| `shop.grid` | Cosmetic grid | `/clubpm/shop` |
| `shop.balance` | Doubloon balance | `/clubpm/shop` |
| `profile.rank` | Rank + XP bar | `/clubpm/profile` |
| `profile.avatar` | Avatar editor entry | `/clubpm/profile` |
| `profile.history` | XP history list | `/clubpm/profile` |

## Communications

| Anchor | Element | Route |
|---|---|---|
| `notifications.list` | Notification list | `/clubpm/notifications` |
| `notifications.prefs` | Preferences link | `/clubpm/notifications` |
| `notifications.slack` | Slack DM toggle row | `/clubpm/notifications/preferences` |
| `calendar.grid` | Month grid | `/clubpm/calendar` |
| `calendar.event` | First event chip | `/clubpm/calendar` |

## Vault and change requests — `src/components/clubpm/vault/`

| Anchor | Element | Route |
|---|---|---|
Everything below is behind **Files &rarr; Vault**; a step must open both before it can target one.

| Anchor | Element | Route |
|---|---|---|
| `vault.tab.crs` | "Change Requests" pill in the Vault sub-nav | `/clubpm/projects/:id` |
| `vault.tree` | Item tree | `/clubpm/projects/:id` |
| `vault.item` | First vault item row | `/clubpm/projects/:id` |
| `vault.checkout` | Check-out button | `/clubpm/projects/:id` |
| `vault.upload` | New-version upload | `/clubpm/projects/:id` |
| `vault.versions` | Version history | `/clubpm/projects/:id` |
| `vault.bom` | BOM view | `/clubpm/projects/:id` |
| `cr.new` | New change request | `/clubpm/projects/:id` |
| `cr.list` | Change-request list (under `vault.tab.crs`) | `/clubpm/projects/:id` |
| `cr.card` | First change-request card — opens the CR modal | `/clubpm/projects/:id` |
| `cr.review` | Approve / reject — **admins only**, inside the CR modal, CR must be OPEN | `/clubpm/projects/:id` |

## Outreach and blog — `src/pages/ClubPM/OutreachHub.jsx`, `BlogEditorPage.jsx`

| Anchor | Element | Route |
|---|---|---|
| `outreach.tab.contacts` | Contacts tab | `/clubpm/outreach` |
| `outreach.tab.campaigns` | Campaigns tab | `/clubpm/outreach` |
| `outreach.tab.blog` | Blog tab | `/clubpm/outreach` |
| `outreach.contact.new` | Add contact | `/clubpm/outreach` |
| `outreach.contact.form` | New/Edit contact modal panel | `/clubpm/outreach` |
| `outreach.campaign.new` | New campaign | `/clubpm/outreach` |
| `outreach.campaign.form` | New/Edit campaign modal panel | `/clubpm/outreach` |
| `outreach.contact.card` | First card on the CRM board, in column order — opens the drawer | `/clubpm/outreach` |
| `outreach.contact.timeline` | "Timeline" tab inside the contact drawer | `/clubpm/outreach` |
| `outreach.contact.history` | Body of the drawer's Timeline tab — select that tab first | `/clubpm/outreach` |
| `outreach.contact.followup` | "Next follow-up" date field — **only while the contact modal is open** | `/clubpm/outreach` |
| `blog.new` | New-post button on the Blog tab | `/clubpm/outreach` |
| `blog.editor.body` | Editor canvas | `/clubpm/outreach/blog/:id/edit` |
| `blog.editor.toolbar` | Formatting toolbar | `/clubpm/outreach/blog/:id/edit` |
| `blog.editor.presence` | Collaborator presence row | `/clubpm/outreach/blog/:id/edit` |
| `blog.editor.publish` | Publish / schedule control | `/clubpm/outreach/blog/:id/edit` |
| `blog.editor.save` | "Save draft" button (the editor also autosaves ~1.5s after typing stops) | `/clubpm/outreach/blog/:id/edit` |
| `blog.editor.aitoggle` | Header wand button — **opens** `blog.editor.ai` | `/clubpm/outreach/blog/:id/edit` |
| `blog.editor.ai` | AI assistant panel (shared with the course editor); renders nothing until the toggle is pressed | `/clubpm/outreach/blog/:id/edit` |

## Courses — `src/pages/ClubPM/CoursesPage.jsx`, `CourseEditorPage.jsx` — and admin

| Anchor | Element | Route |
|---|---|---|
| `courses.list` | Course list | `/clubpm/courses` |
| `courses.new` | New course | `/clubpm/courses` |
| `courses.gen` | AI-generate button | `/clubpm/courses` |
| `courses.progress` | "Progress dashboard" button — admins only | `/clubpm/courses` |
| `courses.assign` | Assign-to-members button, **inside** `courses.progress` — admins only | `/clubpm/courses` |
| `course.editor.rail` | Section rail | `/clubpm/courses/:id/edit` |
| `course.editor.addsection` | Add-section control | `/clubpm/courses/:id/edit` |
| `course.editor.preview` | Preview link | `/clubpm/courses/:id/edit` |
| `admin.rewards.pending` | Pending reward queue | `/clubpm/admin` |
| `admin.rewards.config` | Reward amount config | `/clubpm/admin` |
| `admin.integrations` | Integrations (Drive connect) card | `/clubpm/admin` |
| `admin.members` | Member roster grid | `/clubpm/members` |

---

**Count: 106 anchors.** `node scripts/check-tour-anchors.js` prints the live number.

The check script is static: it proves an id exists as a literal *somewhere* in `src/`. It cannot
prove the element is ever mounted. Two failure modes slip past it, and both have bitten this
repo — an id on a component nothing renders, and an id on a node that only mounts behind a tab,
modal, or drawer the step never opens. When you add a step, walk the tour.

Not every anchor is used by a step today. The registry is deliberately a little wider than the
curriculum so that adding a step is usually a content change rather than a code change — but the
check script still flags a registry entry no component renders, so the width has a floor.
