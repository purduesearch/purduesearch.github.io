# Constellation mobile redesign plan

Date: 2026-09-13  
Status: Phases 0–5 implemented in the working tree; external validation and release pending — current state in `2026-09-13-constellation-mobile-redesign-HANDOFF.md`  
Scope: The root React application's Constellation (`/clubpm`) experience on phones. Preserve the desktop layout, navigation, shortcuts, and workflows.

## 1. Outcome and boundaries

Make it straightforward to open a project, update a task, reply to a message, find an event, and complete training using one hand on a phone. Replace the desktop navigation presentation on small screens while sharing authentication, permissions, data, mutations, and existing URLs.

This is a responsive web redesign, not a separate app. The public SEARCH website, standalone `frontend/` admin application, backend permissions, and desktop information architecture are outside the redesign. Advanced Constellation tools remain reachable on mobile; later phases adapt their dense interfaces rather than silently removing functionality.

The phase order prioritizes shared navigation and daily member workflows before occasional administrative and authoring work. Each phase must produce a usable increment, with its own course updates and desktop checks.

## 2. Findings from the current source

These are source-review findings, not claims from a completed device test. Phase 0 verifies the actual rendering and interaction failures.

| Surface | Current implementation | Redesign implication |
| --- | --- | --- |
| Shared shell | `AppShell.jsx` renders Dashboard, Social, Other, project tabs, project list, profile, rewards, and sign-out in one sidebar. CSS fixes it at 64px and expands it to 220px on hover; main content retains a 64px left margin. | Give phones full content width and explicit, labeled navigation that never depends on hover. |
| Top bar | Breadcrumbs share space with keyboard help, command palette, quests, streak, and notifications. `.pm-topbar-btn` is 34px square. | Keep only title/back, Search, and Notifications in the phone header; relocate occasional actions. |
| Project navigation | The live `NAV_TABS` contains **Tasks, Files, Chat, Insights**, passed through `ProjectNavContext` into the shell sidebar. Older frontend instructions describe superseded tabs. | Reuse these four sections and their existing nested destinations; do not introduce a second competing taxonomy. |
| Task work | The current Tasks renderer already iterates stacked status bins, with dragging, member assignment, filters, and complex detail dialogs. | Improve the existing layout with compact rows and explicit status/assignment actions; do not assume the primary screen is still a four-column board. |
| Dashboard | Many panels compete with My work and agenda; project quick actions are revealed using mouse-enter state. | Put immediate work first and make phone project actions visible through a labeled menu. |
| Messaging | Chat has a channel sidebar and conversation pane; `/clubpm/chat` automatically opens the first available channel. DMs live in Members, including project-filtered member views. | Use list-to-detail navigation on phones, retain DM URLs, and make the Channels/People connection obvious. |
| Secondary tools | Outreach has seven tabs; Files and Insights have their own sub-navigation. There are already feature-specific responsive rules. | Reuse working adaptations, consolidate phone navigation, and avoid stacking multiple scrolling tab bars. |
| Walkthroughs | Tour lookup uses `document.querySelector`; the overlay pins the desktop sidebar open. | Hidden duplicate anchors and desktop-only instructions are implementation blockers, not post-launch cleanup. |

Primary implementation references: `src/components/clubpm/AppShell.jsx`, `src/pages/ClubPM/{Dashboard,ProjectDetail,ChatPage,MembersView,CalendarPage,OutreachHub}.jsx`, `src/clubpm/ProjectNavContext.js`, `src/clubpm/tour/`, and `public/clubpm-theme.css`.

## 3. Responsive contract: preserve desktop

- Initial phone layout: viewport width below **768 CSS pixels**. At 768px and above, retain the current desktop presentation. Validate the boundary in Phase 0 before locking it.
- Include a compact landscape-phone condition: coarse pointer, no hover, width below 1024px, and height below 500px. Mirror the exact condition in CSS and the shared layout hook. Larger tablets otherwise retain the existing layout in this scope.
- Use viewport/capability queries, not user-agent sniffing. A narrow desktop browser may receive the compact layout; a mouse does not make a narrow screen wide enough for the full sidebar.
- Desktop selectors and interaction defaults stay intact. Scope new rules under the Constellation shell and phone conditions in `public/clubpm-theme.css`; do not scatter overrides through public-site CSS.
- Keep data providers and mutation logic shared. Conditionally render only the navigation presentation where necessary; do not mount two complete page trees, polling loops, editors, or conversations.
- Preserve form drafts, selected records, filters, and scroll position across rotation or breakpoint changes. A breakpoint change must not submit, discard, or duplicate a mutation.

## 4. Proposed navigation and control placement

### 4.1 Global bottom navigation

Use five equal-width destinations with an icon **and persistent text**. This bar stays global, including inside projects; project navigation lives near the page title.

| Item | Font Awesome icon | Destination / behavior |
| --- | --- | --- |
| Home | `fa-house` | Existing `/clubpm` dashboard, reordered for phone use. |
| Projects | `fa-folder-open` | New searchable project-picker sheet backed by the shell's existing project data and starred ordering. Selecting an item opens its existing project URL. |
| Chat | `fa-comments` | `/clubpm/chat`, showing the channel list first on phones. Include a visible People & DMs shortcut to Members. |
| Calendar | `fa-calendar-days` | Existing `/clubpm/calendar`, with agenda-first presentation on phones. |
| More | `fa-bars` | Scrollable menu for all remaining destinations and account controls. |

Projects is a button opening a dialog, not a new `/clubpm/projects` page. Mark Projects current for project routes; mark Chat current for global Chat and Members routes. Home is current only at `/clubpm`. Calendar is current on its route. More represents remaining destinations. When a sheet opens, expose its expanded state separately from the underlying current destination.

Do not swap this bar for project tabs: the user should always know how to leave a project. On 320px screens, keep all five labels visible without horizontal scrolling.

### 4.2 Header, More menu, and icon consolidation

| Current control | Phone placement |
| --- | --- |
| Long breadcrumb | One-line page title; explicit Back on detail screens. Project title also opens the project picker. |
| Command palette with Cmd+K label | Search icon with accessible name, opening the existing palette in a full-screen phone presentation. Preserve its supported actions and confirmation flow. |
| Notification dropdown | Header bell linking to the existing full-page Notification Center; retain unread indication and preferences access. |
| Keyboard-shortcut help | More > Help; keep keyboard shortcuts available when a hardware keyboard is attached. |
| Quests trophy, streak, XP, rank, doubloons | A compact Progress & rewards block in More: visible values, Quests & achievements link, and Shop link. Preserve live reward feedback. |
| Avatar/profile | Account row at the top of More, with a labeled Profile action. |
| Social group | Promote Chat and Calendar; expose Members through both More > People & DMs and the Chat shortcut. |
| Other group | Labeled rows in More: Outreach Hub, Blog, Courses, and Admin for authorized members. Blog retains `/clubpm/outreach?tab=blog`. |
| Main site and sign-out | Separate labeled rows at the bottom of More. Sign-out must not sit adjacent to a frequent action without spacing. |
| Project creation plus | Labeled New project action inside the project picker, under the existing permission rule. |
| Repeated page toolbar icons | One visible, contextual primary action plus a labeled Actions menu containing secondary operations. |

More must also expose People & DMs, notification preferences, and any currently reachable utility discovered in Phase 0. Keep role badges on the relevant menu rows; do not invent aggregate counts from unrelated unread/reward values. Do not place a universal floating plus over every screen: creation should clearly identify what it creates and respect permissions.

### 4.3 Project navigation

Below the compact project heading, show four labeled controls: **Tasks / Files / Chat / Insights**. Use the existing `ProjectNavContext` descriptors and callbacks as the source of truth. At narrow widths, text labels take priority over decorative icons.

- Tasks: My tasks/All tasks control, Search, one Filters & sort button with applied count, and a labeled New task action when allowed. Put archive visibility in Filters. Status groups show counts and can collapse; expose Move/status and Assign in task details so dragging is optional.
- Files: retain Drive / GitHub / Vault. Use a labeled source selector rather than another wide icon toolbar. Remember the selected source when returning from an item.
- Chat: retain the Messages / Members distinction. Members includes the project-filtered roster and DMs. Make the project scope visible in the heading.
- Insights: use one section selector for Charts / Activity / Press kit / AI. Preserve existing `tab` and `view` values, including compatibility redirects for old Members, Reports, and AI links.
- Move project editing, external resources, and Gantt access into a labeled Project actions menu where permitted. Preserve all current operations; confirm the complete action inventory in Phase 0.

Do not add an additional sticky sub-tab row beneath the project controls. On conversation and editor detail screens, use a compact contextual header with a clear return action to recover vertical space.

### 4.4 Example phone layouts

```text
HOME                         PROJECT: TASKS
Home          Search  Bell   Back  Project name v   Search  Bell
My work                     Tasks | Files | Chat | Insights
  Task rows                 My tasks / All    Filters (2)
Today / next event          + New task
My projects                 To do (3)       [expand/collapse]
Progress summary              Task title        Status
Other panels [expand]         Assignee / due date
Home Projects Chat Cal More  Home Projects Chat Cal More
```

```text
CHAT LIST                    CONVERSATION
Chat          Search  Bell   Back  #channel     Actions
People & DMs                Message history
Find a channel              ...
Joined channels             Reply / thread buttons
Browse public channels      Attach  Message field     Send
Home Projects Chat Cal More  Home Projects Chat Cal More
                            (global bar hidden while typing)
```

Actual controls use full labels such as Calendar; abbreviated wireframe text is only to fit this illustration.

## 5. Shared interaction rules

- Design target: at least 44 by 44 CSS pixels for phone tap areas, with spacing between adjacent actions. Use readable body text and at least 16px editable text. These are project acceptance targets, not a claim of completed accessibility certification.
- Use existing Font Awesome assets and visible labels for navigation. Decorative icons have `aria-hidden`; icon-only buttons have explicit accessible names. Verify new icons through the repository's subset build.
- Use a reusable sheet for short choices and filters; use full-screen dialogs for long forms, task detail, search, and complex editors. Keep focus inside modal surfaces, return it to the opener, support Escape, and make background controls inert.
- Define a single overlay stack. Back dismisses the top sheet/detail first, then returns to its parent screen. Direct external links need a deterministic parent fallback rather than blindly leaving the site. Do not add a history entry for every keystroke or filter adjustment.
- Keep existing URLs and query parameters (`tab`, `view`, `task`, `dm`, `channel`, `thread`). Audit current `replace: true` tab transitions before implementing phone Back behavior; use deliberate phone history entries for drill-downs and retain desktop behavior.
- Use one primary vertical scroll area per screen, with `min-height: 0` where needed. Budget space for the header, bottom bar, and safe-area insets. Use dynamic viewport sizing with a fallback; confirm behavior with expanding browser chrome.
- While the software keyboard is open in a conversation or form, reserve space for its composer/save controls and suppress the global bottom bar. Do not equate any focused input with an open keyboard on hardware-keyboard devices. Restore navigation when the keyboard closes.
- Support reduced motion, keyboard focus, zoom, long labels, and loading/empty/error/retry states. Explicit buttons are required for actions otherwise available only through hover, drag, swipe, or long press.
- Preserve drafts when opening menus, retrying a request, or switching detail panels. Failed saves retain user input and expose Retry. Existing publication, AI review, event visibility confirmation, and destructive-action safeguards still apply.

## 6. Implementation phases

Effort labels are relative, not calendar estimates. The critical path is **0 > 1 > 2 > 3 > 4 > 5**. Implement the reusable interaction patterns once, then apply them across pages. Avoid combining this work with backend migrations or unrelated desktop refactors.

### Phase 0 — Inventory, baseline, and phone prototype (small)

**Purpose:** Verify the contract and resolve navigation edge cases before changing the shell.

1. Inventory every reachable route, project sub-view, role-gated action, modal, and existing mobile rule. Include login, course player/editor, blog editor, Vault, GitHub, and reward overlays.
2. Capture baseline desktop screenshots at 1280px and 1440px, plus phone captures at 320px, 390px, and landscape. Record overflow, hover-only actions, keyboard obstruction, and deep-link behavior using representative authorized test accounts.
3. Prototype Home, project Tasks, channel list, conversation, and More with the proposed shared controls. Test the breakpoint, long project names, a crowded project list, and an admin menu.
4. Record the final route/current-item map, overlay/history contract, and tour-anchor migration map alongside this plan. Flag missing API support explicitly instead of assuming new services.

**Deliverables:** Screen inventory, baseline captures, reviewable prototype, and implementation checklist.  
**Exit gate:** Every existing destination has a phone entry point; five primary journeys fit without page-wide horizontal scrolling. Desktop preservation boundaries are documented.

### Phase 1 — Phone shell and shared interaction components (medium)

**Purpose:** Make the entire system navigable before adapting individual pages.

1. Add a shared responsive hook and phone shell presentation; remove the sidebar margin only in compact mode.
2. Build proposed `MobileBottomNav`, `MobileHeader`, `MobileProjectPicker`, and `MobileMoreMenu` components under `src/components/clubpm/`. These names describe new files, not existing components.
3. Build shared sheet/full-screen dialog behavior and the overlay/history integration. Adapt the palette and notification entry point; consolidate account and reward controls in More.
4. Render the four project controls from the existing context. Preserve the desktop sidebar and topbar presentation.
5. Implement safe-area spacing, current states, focus handling, permission-gated actions, and error/retry states for the project picker.
6. Update shell-related tours and course material in this phase; do not postpone them to Phase 5.

**Main files:** `AppShell.jsx`, `ProjectNavContext.js`, new mobile components/hook, `public/clubpm-theme.css`, palette/notification components, tour files.  
**Exit gate:** A phone user can navigate to every existing destination without hover; project switching and More work with Back and a screen reader. Desktop shell screenshots and navigation remain equivalent to baseline. No duplicate shell requests, reward listeners, or tour targets.

### Phase 2 — Home, projects, and task completion (large)

**Purpose:** Deliver the highest-value daily work loop using the Phase 1 primitives.

1. Reorder Home for phones: My work, today's/next event, projects, then compact progress and expandable supporting panels. Preserve desktop order and all data.
2. Replace mouse-only project quick actions on phones with visible labeled actions. Reuse the shell project picker instead of creating a second project API/data store.
3. Adapt existing task status bins into compact, readable groups with counts, filters, and non-drag status and assignee controls. Keep desktop behavior intact.
4. Convert new-task and task-detail dialogs to phone full-screen layouts. Keep title/status/assignee/due date prominent; group subtasks, blockers/dependencies, attachments, comments, and time controls into expandable sections without removing actions.
5. Make save/create actions reachable above the keyboard, retain validation and optimistic rollback, and keep the correct project/filter/scroll context when closing a task.
6. Adapt milestones and expose Gantt through Project actions; detailed timeline presentation is completed in Phase 4.

**Main files:** `Dashboard.jsx`, `ProjectDetail.jsx`, `TaskModal.jsx`, `TaskDetailModal.jsx`, `MilestonePanel.jsx`, relevant course artifacts.  
**Exit gate:** On a 320px phone, a member can find an assigned task, open it, change status, assign through a picker if permitted, comment, and return to the same list without dragging or horizontal page scrolling. New-task creation and failure recovery work; desktop task interactions pass regression checks.

### Phase 3 — Chat, DMs, calendar, and notifications (large)

**Purpose:** Complete communication and attendance workflows, including keyboard behavior.

1. On phones, make `/clubpm/chat` stay on the channel list instead of auto-opening the first channel. Keep the existing desktop redirect behavior. Channel URLs still open the requested conversation directly.
2. Present one messaging pane at a time: channel list > conversation > thread. Keep preview/join, attachments, mentions, reactions, unread/mute state, reconnect, and explicit retry controls.
3. Turn Members into a readable roster/inbox entry with full-screen DM detail; retain `?dm=` and project roster filtering. Link it visibly from Chat and More without relocating the DM backend or duplicating inbox state.
4. Keep the composer visible with the software keyboard and restore conversation position after returning from a thread. Follow the chat rendering invariant: do not introduce `<span>` or `<p>` inside the chat components.
5. Default Calendar to an agenda on phones; provide date selection, project filters, Month access, RSVP, and permitted Event/Poll creation. Adapt forms and preserve the public-event confirmation step.
6. Make notification rows and preferences comfortable to use and verify task/channel/thread/event deep links reach the correct detail screen.

**Main files:** `ChatPage.jsx`, `MembersView.jsx`, `chat/*`, `members/*`, `CalendarPage.jsx`, event/poll dialogs, Notification Center/preferences.  
**Exit gate:** Real iOS Safari and Android Chrome checks cover keyboard open/close, send/retry, attachments, channel join, DMs, thread Back, notification entry, and RSVP. No composer or last message is obscured by navigation. Desktop messaging retains its multiple-pane layout.

### Phase 4 — Remaining tools and dense views (large; ship as bounded slices)

**Purpose:** Finish mobile coverage without delaying core work for the largest editors.

| Slice | Phone adaptation | Acceptance gate |
| --- | --- | --- |
| Files, Vault, GitHub | Full-width item rows; source selector; item detail with metadata, history, download, upload, and permitted change-request actions. Move secondary tools into Actions. | Browse, preview/download, upload, and complete an authorized review without a clipped modal. |
| Insights, AI, Gantt | Insights selector; charts with readable labels and a summary/list alternative; full-screen AI action review; agenda/milestone list as the initial Gantt presentation with optional contained timeline pan/zoom. | An AI proposal can be inspected and individually accepted/declined; timeline details remain accessible without page-wide overflow. |
| Outreach | Replace seven phone tabs with a labeled section selector; CRM/board use stage-filtered lists and explicit Move actions. Composer gets a focused form and clear preview/send steps. | Open a contact, change stage, inspect a campaign, and review a draft on a phone. If touching legacy Outreach BoardTab, migrate its `@hello-pangea/dnd` usage to `@dnd-kit/core` as repository instructions require; retain desktop drag behavior. |
| Blog and course editors | Compact primary toolbar plus More formatting; full-screen preview; section/block selection through a list; preserve collaboration, save state, and explicit publish controls. | Edit and save a draft, recover from errors, and inspect the full publish/review flow without accidental submission. |
| Course learning | Collapsible contents, readable lessons/quizzes/assignments, reachable Previous/Next, and phone-aware walkthrough overlays. | Resume training, complete a quiz/assignment, and follow a live UI walkthrough. |
| Admin and meeting notes | Grouped sections, card/list replacements for dense tables, filter sheet, and full-screen review detail. Keep role restrictions and badges. | An authorized admin can review a pending item and access meeting notes; ordinary members cannot gain access through the new menus. |
| Profile, Shop, Challenges | Single-column account controls and fitting item grids, compact reward summaries, phone-sized avatar/editor dialogs and celebrations. | Edit profile, inspect/equip or purchase an eligible item through existing rules, and view quests without covered buttons. |
| Login and connection states | Readable sign-in, reconnect/error controls, and responsive documentation sections. | Sign in on a phone; preserve all `.pm-login-doc` scope justification and Limited Use content. |

Each slice has its own course updates and desktop regression checks. Reuse existing APIs and components; record any necessary service change separately. A readable fallback is an interim release improvement, not completion if an existing action is still unreachable.

### Phase 5 — Full-system validation and controlled release (medium)

**Purpose:** Verify complete phone usability and desktop preservation before publishing.

1. Run the scenario matrix below using representative data, member/admin roles, long labels, empty projects, loading failures, expired connections, and direct links.
2. Compare desktop screenshots and keyboard/drag workflows against Phase 0. Verify public pages and login documentation were not affected by ClubPM CSS changes.
3. Complete a small device usability pass with members: open an assigned task, post a project message, find and RSVP to an event, retrieve a file, and resume training. Record completion, wrong turns, and blocked actions rather than assuming improvement from screenshots.
4. Fix release blockers, document remaining non-blocking limitations, and retain baseline captures plus verification results in the implementation PR.
5. Prepare a reversible mobile enablement switch during implementation so compact presentation can be disabled without changing data or desktop defaults. Keep its CSS and JS activation consistent. A switch used for preview must not become an undocumented permanent setting.
6. Follow the repository's manual main-branch/Pages release process when implementation is authorized. This planning task does not authorize deployment. Verify the deployed bundle after release and remove temporary rollout machinery in a follow-up once stable.

**Exit gate:** All five primary journeys and Phase 4 acceptance gates pass, no essential phone action requires hover or drag, no desktop regression remains, and course checks plus device walkthroughs pass. Navigation-only delivery is a milestone, not the completed redesign.

## 7. Course synchronization is part of every phase

For each navigation, route, tab, or anchor change, update in the **same implementation commit**:

1. `src/clubpm/tour/tourAnchors.js` and the rendered literal `data-tour-id` values.
2. `docs/courses/ANCHORS.md` with the same IDs/routes and accurate phone/desktop notes.
3. Affected `docs/courses/**/*.steps.json` and adjacent `walkthroughs/README.md` outlines; preserve API `advance.path` expectations unless the actual endpoint changes.
4. Course `content/*.md`, `videos/*.md`, and `quizzes/*.json` that name moved controls or teach hover/drag interactions. Search old terms such as Social, Other, sidebar, and keyboard shortcut.

Prefer one mounted target for each semantic anchor. If desktop and phone navigation branches share an ID, mount only the active branch and retain providers outside it. Do not render hidden duplicate anchors: the current selector can choose the invisible node.

Preserve existing IDs where their meaning still fits; add explicit mobile IDs for genuinely different surfaces such as the project-picker trigger versus its contents. The tour resolver must reveal the relevant phone menu before measurement and click subscription, and the overlay must avoid desktop sidebar pinning on phones. Document any required device-specific step selection in Phase 0, implement it with the shell in Phase 1, and preserve existing desktop steps. Never solve a missing target by silently skipping the lesson.

## 8. Verification and measurable acceptance

| Area | Required checks |
| --- | --- |
| Viewports | 320, 360, 390, and 430px portrait; short landscape phone; 767/768px boundary; 1024, 1280, and 1440px desktop/tablet widths. Include enlarged text/zoom. |
| Devices | Real iOS Safari and Android Chrome for keyboard, browser chrome, safe areas, scrolling, upload picker, and Back. Emulation supplements these checks. |
| Navigation | Every bottom item, More destination, project switch, permission-gated action, browser Back/Forward, refresh, and direct query-param link. Projects reachable within two taps from the bottom bar, excluding search typing. |
| Layout | No document-wide horizontal overflow or clipped navigation. Contained timeline/code/data-table scrolling is allowed only with a visible indication and a usable surrounding layout. |
| Accessibility | Visible labels, target sizes, focus return, no background focus in dialogs, correct current/expanded states, reduced motion, keyboard and screen-reader reading order. |
| State | Rotation and breakpoint crossing retain drafts/context; duplicate submissions are prevented; failures retain input; loading and unavailable/private resources have useful next actions. |
| Desktop | Sidebar, topbar, project tabs, keyboard shortcuts, task/Outreach drag interactions, dialogs, and multi-pane messaging match intended existing behavior. |
| Performance | No duplicate polling, listeners, or editor mounts. Compare route loading, scrolling, and interaction responsiveness with the baseline using the same device/data. Investigate added long tasks or unexpected bundle growth. |

Implementation checks: run `node scripts/check-tour-anchors.js` explicitly, `npm run lint`, relevant existing/added interaction tests, and `npm run build`. The current package scripts do not visibly run the anchor check as part of build, so do not rely on the documentation's build-wiring statement. Run `npm run check:icons` when adding icons and inspect the build's icon output. Backend checks are only needed if implementation actually changes backend code.

Add meaningful regression tests around the new behavior: layout selection, current navigation/role visibility, sheet focus and dismissal, phone chat-list versus desktop redirect, deep-link/back handling, and unique visible tour targets. Avoid snapshot tests for every spacing change. Build/lint success alone cannot validate phone usability.

## 9. Scope controls and completion checklist

- [ ] Keep desktop appearance and defaults intact throughout every phase.
- [ ] Reuse current data and permission boundaries; no duplicate mobile application.
- [ ] Finish the shell before individually improvising phone toolbars on every page.
- [ ] Keep global navigation, project navigation, and local section selection visually distinct.
- [ ] Make every existing operation reachable; use explicit touch alternatives for hover and drag.
- [ ] Ship course synchronization alongside each affected UI slice.
- [ ] Validate keyboard/safe-area behavior on devices before calling messaging complete.
- [ ] Complete secondary tools, editors, login, and admin coverage before declaring the redesign finished.
- [ ] Retain documented desktop and phone evidence with the implementation review.

Open evidence to resolve in Phase 0: actual member task frequency, representative phone hardware, availability of test accounts/data, and the best handling of device-specific course steps. The navigation above is the working design; change it only when the prototype or usability evidence supports a clearer path.
