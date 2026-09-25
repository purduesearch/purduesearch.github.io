/**
 * The tour anchor vocabulary.
 *
 * Every id here must be rendered by exactly one component as `data-tour-id` —
 * or, for a `layout: "both"` shell id, by one desktop and one phone owner that
 * are never mounted together — and every `anchor` in a *.steps.json file
 * (including a step's `compact.anchor`) must appear here.
 * `scripts/check-tour-anchors.js` enforces all three directions on every build.
 *
 * `route` is where the anchor is reachable — the runtime navigates there before
 * hunting for the element, so a wrong route means a step that degrades for no
 * reason. "*" means it is present on every ClubPM screen.
 *
 * These ids are targeting hooks, NOT styling hooks. Never select one in CSS.
 *
 * Human-readable counterpart: docs/courses/ANCHORS.md. The two must be edited
 * together, in the same commit, along with any step file that targets the id.
 */
export const TOUR_ANCHORS = Object.freeze({
  // Shell and navigation — desktop: src/components/clubpm/AppShell.jsx (sidebar
  // + topbar); phone: MobileBottomNav, MobileHeader, MobileMoreMenu and
  // MobileProjectPicker. `layout` says which shell mounts the id: "both" = a
  // desktop owner and a phone owner in mutually exclusive branches (never both
  // mounted), "desktop" / "compact" = that shell only. `reveal` names the phone
  // sheet the element lives in. A step whose anchor is desktop-only needs a
  // `compact.anchor`, and a step whose phone anchor has a `reveal` needs the
  // same `compact.reveal`. check-tour-anchors.js enforces both.
  "nav.sidebar":            { label: "Sidebar",              route: "*", layout: "desktop", note: "Whole desktop rail, for coarse dimming — the phone equivalent is nav.bar" },
  "nav.bar":                { label: "Bottom navigation",    route: "*", layout: "compact", note: "Phone bottom bar: Home, Projects, Chat, Calendar, More" },
  "nav.dashboard":          { label: "Dashboard link",       route: "*", layout: "both",    note: "Sidebar Dashboard link; bottom-bar Home on phones" },
  "nav.social":             { label: "Social group",         route: "*", layout: "desktop", note: "Collapsible sidebar group containing Chat, Members, and Calendar — no phone equivalent (use nav.chat)" },
  "nav.chat":               { label: "Chat link",            route: "*", layout: "both",    note: "Child of the Social group; bottom-bar Chat on phones" },
  "nav.projects":           { label: "Projects link",        route: "*", layout: "both",    note: "Sidebar project list; bottom-bar Projects button on phones (opens projects.sheet)" },
  "projects.sheet":         { label: "Project list sheet",   route: "*", layout: "compact", reveal: "projects", note: "Project list inside the phone Projects sheet" },
  "nav.members":            { label: "Members link",         route: "*", layout: "both", reveal: "more",    note: "Child of the Social group — expand it first; More › People & DMs on phones" },
  "nav.calendar":           { label: "Calendar link",        route: "*", layout: "both",    note: "Child of the Social group; bottom-bar Calendar on phones" },
  "nav.courses":            { label: "Courses link",         route: "*", layout: "both", reveal: "more",    note: "Child of the Other group; More › Courses on phones" },
  "nav.shop":               { label: "Shop link",            route: "*", layout: "both", reveal: "more",    note: "Sidebar doubloon counter; More › Shop on phones" },
  "nav.other":              { label: "Other group",          route: "*", layout: "desktop", note: "Collapsed by default; contains Outreach Hub, Blog, Courses, and Admin — on phones those are More rows" },
  "nav.admin":              { label: "Admin link",           route: "*", layout: "both", reveal: "more",    note: "Admins only — child of Other; More › Admin on phones; absent for other members" },
  "nav.profile":            { label: "Profile link",         route: "*", layout: "both", reveal: "more",    note: "Sidebar user block; More › Profile on phones" },
  "nav.more":               { label: "More button",          route: "*", layout: "compact", note: "Bottom-bar More; opens the sheet holding every other destination" },
  "topbar.notifications":   { label: "Notification bell",    route: "*", layout: "both",    note: "Dropdown on desktop; on phones a link to /clubpm/notifications" },
  "topbar.search":          { label: "Command palette",      route: "*", layout: "both",    note: "AI command palette trigger; header Search icon on phones (full-screen)" },
  "chat.people":            { label: "People & DMs shortcut", route: "/clubpm/chat", layout: "compact", note: "First row on the phone channel-list landing screen" },
  "topbar.streak":          { label: "Streak counter",       route: "*", layout: "both", reveal: "more",    note: "Flame counter; More › Progress on phones" },
  "topbar.challenges":      { label: "Quests button",        route: "*", layout: "both", reveal: "more",    note: "Trophy icon — was the nav.challenges sidebar link; More › Quests & achievements on phones" },

  // Dashboard — src/pages/ClubPM/Dashboard.jsx
  "nav.xp":                 { label: "XP bar",               route: "*",       layout: "both", reveal: "more", note: "Sidebar XP progress bar; More › Progress on phones — the product has no XP stat tile" },
  "nav.rank":               { label: "Rank badge",           route: "*",       layout: "both", reveal: "more", note: "Sidebar rank icon; More account row on phones" },
  "dash.quests":            { label: "Daily quests",         route: "/clubpm", layout: "both", reveal: "expand", note: "Expanded supporting panel on phones" },
  "dash.work":              { label: "My work",              route: "/clubpm", note: "Filterable task list" },
  "dash.agenda":            { label: "Agenda panel",         route: "/clubpm", layout: "both", reveal: "expand", note: "7-day agenda; supporting panel on phones" },
  "dash.leaderboard":       { label: "Leaderboard",          route: "/clubpm/members", note: "Bottom of the member roster — moved off the dashboard" },
  "dash.insights":          { label: "AI insight cards",     route: "/clubpm", layout: "both", reveal: "expand", note: "Expanded supporting panel on phones" },
  "dash.project.card":      { label: "Project card",         route: "/clubpm", layout: "compact", note: "First row in Home's My projects panel" },

  // Project detail — src/pages/ClubPM/ProjectDetail.jsx
  "project.header":         { label: "Project header",       route: "/clubpm/projects/:id", layout: "both", note: "Title + status row; compact hero stays short" },
  "project.lab":            { label: "Lab time button",      route: "/clubpm/projects/:id", note: "Only rendered when the project has assigned lab spaces" },
  "project.actions":        { label: "Project actions",      route: "/clubpm/projects/:id", layout: "compact", note: "Labelled phone control opening the shared Projects sheet" },
  "project.milestones":     { label: "Milestone summary",    route: "/clubpm/projects/:id", layout: "compact", note: "Compact milestone list with Timeline link" },
  // The project tab bar (desktop sidebar tabs, phone section bar) is rendered by
  // AppShell from the ProjectNavContext, not by ProjectDetail — ProjectDetail
  // only supplies the list (with these ids as `tourId`). Only one of the two
  // presentations mounts, so each id is in the DOM once.
  "project.tab.tasks":      { label: "Tasks tab",            route: "/clubpm/projects/:id", note: "Sidebar project tab on desktop; section bar under the phone header (AppShell)" },
  "project.tab.files":      { label: "Files tab",            route: "/clubpm/projects/:id", note: "Sidebar project tab on desktop; section bar under the phone header (AppShell)" },
  "project.tab.chat":       { label: "Chat tab",             route: "/clubpm/projects/:id", note: "Sidebar project tab on desktop; section bar under the phone header (AppShell) — contains Chat and Members" },
  "project.tab.insights":   { label: "Insights tab",         route: "/clubpm/projects/:id", note: "Sidebar project tab on desktop; section bar under the phone header (AppShell) — charts, time, activity, press kit, and AI" },
  "project.tab.vault":      { label: "Vault sub-tab",        route: "/clubpm/projects/:id", layout: "both", note: "Inside the Files tab — open project.tab.files first. Desktop pill row; labelled Source selector on phones" },
  "board.newtask":          { label: "New task button",      route: "/clubpm/projects/:id", layout: "both", note: "" },
  "board.filters":          { label: "Task controls",        route: "/clubpm/projects/:id", layout: "both", note: "Desktop sort row; phone scope, search, and Filters & sort toolbar" },
  "board.scope":            { label: "Task scope",           route: "/clubpm/projects/:id", layout: "compact", note: "My tasks / All tasks segmented control" },
  "board.search":           { label: "Task search",          route: "/clubpm/projects/:id", layout: "compact", note: "Phone task search" },
  // The four columns carry the uppercase TaskStatus enum value so the id cannot
  // drift from the enum it is derived from.
  "board.column.TODO":        { label: "To-do column",       route: "/clubpm/projects/:id", note: "" },
  "board.column.IN_PROGRESS": { label: "In-progress column", route: "/clubpm/projects/:id", note: "" },
  "board.column.BLOCKED":     { label: "Blocked column",     route: "/clubpm/projects/:id", note: "" },
  "board.column.DONE":        { label: "Done column",        route: "/clubpm/projects/:id", note: "" },
  "board.card.first":       { label: "First task card",      route: "/clubpm/projects/:id", layout: "both", note: "First task in the TODO column/group" },
  "board.memberchips":      { label: "Member chip rail",     route: "/clubpm/projects/:id", layout: "desktop", note: "Desktop drag assignment; phone rows use labelled Assign" },
  "board.blocker.bin":      { label: "Blocked-task group",   route: "/clubpm/projects/:id", layout: "both", note: "Desktop blocker sub-bin; first matching blocked row on phones" },
  "ai.goal":                { label: "Action-plan goal",     route: "/clubpm/projects/:id", note: "Goal input in Insights → AI" },

  // New-task modal — src/pages/ClubPM/ProjectDetail.jsx (AddProjectTaskModal).
  // A different component from the task modal below, with a different and much
  // smaller set of fields. Creating a task does NOT open the task modal, so a
  // step that wants task.modal.* has to spotlight the new card and wait for the
  // learner to click it first.
  "task.create.modal":      { label: "New-task modal",       route: "/clubpm/projects/:id", note: "Opened by board.newtask" },
  "task.create.title":      { label: "New-task title field", route: "/clubpm/projects/:id", note: "Inside task.create.modal" },

  // Task modal — src/components/clubpm/TaskModal.jsx
  "task.modal":             { label: "Task modal",           route: "*", note: "The modal shell — opens by clicking a card, never by creating one" },
  "task.modal.title":       { label: "Title field",          route: "*", note: "" },
  "task.modal.status":      { label: "Status selector",      route: "*", note: "" },
  "task.modal.priority":    { label: "Priority selector",    route: "*", note: "" },
  "task.modal.assignees":   { label: "Assignee picker",      route: "*", note: "" },
  "task.modal.due":         { label: "Due-date field",       route: "*", note: "" },
  "task.modal.description": { label: "Description",          route: "*", note: "" },
  "task.modal.comments":    { label: "Comment composer",     route: "*", note: "" },
  "task.modal.timelog":     { label: "Log time",             route: "*", note: "" },
  "task.modal.subtasks":    { label: "Subtask list",         route: "*", note: "" },
  "task.modal.deps":        { label: "Dependencies",         route: "*", note: "" },
  "task.modal.blockers":    { label: "Blockers",             route: "*", note: "" },
  "task.modal.history":     { label: "History tab",          route: "*", note: "Audit trail" },

  // Gamification
  "challenges.active":       { label: "Active quests",       route: "/clubpm/challenges", note: "" },
  "challenges.claim":        { label: "Claim button",        route: "/clubpm/challenges", note: "First claimable quest only" },
  "challenges.achievements": { label: "Achievement grid",    route: "/clubpm/challenges", note: "" },
  "shop.grid":               { label: "Cosmetic grid",       route: "/clubpm/shop", note: "" },
  "shop.balance":            { label: "Doubloon balance",    route: "/clubpm/shop", note: "" },
  "profile.rank":            { label: "Rank + XP bar",       route: "/clubpm/profile", note: "" },
  "profile.avatar":          { label: "Avatar editor",       route: "/clubpm/profile", note: "" },
  "profile.history":         { label: "XP history",          route: "/clubpm/profile", note: "" },

  // Communications
  "notifications.list":     { label: "Notification list",    route: "/clubpm/notifications", note: "" },
  "notifications.prefs":    { label: "Preferences link",     route: "/clubpm/notifications", note: "" },
  "notifications.slack":    { label: "Slack DM toggle",      route: "/clubpm/notifications/preferences", note: "" },
  "calendar.grid":          { label: "Month grid",           route: "/clubpm/calendar", note: "" },
  "calendar.event":         { label: "Event chip",           route: "/clubpm/calendar", note: "First event only" },
  "calendar.lab":           { label: "Lab schedule button",  route: "/clubpm/calendar", note: "Opens the lab schedule modal" },

  // Vault and change requests — src/components/clubpm/vault/
  // Everything below lives under Files → Vault, so a step targeting one of them
  // must be preceded by steps that open both. The Vault's own sub-nav then
  // splits the item grid from the change-request list.
  "vault.tree":             { label: "Item tree",            route: "/clubpm/projects/:id", note: "Files → Vault" },
  "vault.item":             { label: "Vault item row",       route: "/clubpm/projects/:id", note: "First row only" },
  "vault.checkout":         { label: "Check-out button",     route: "/clubpm/projects/:id", note: "Inside the item modal" },
  "vault.upload":           { label: "New-version upload",   route: "/clubpm/projects/:id", note: "Vault toolbar" },
  "vault.versions":         { label: "Version history",      route: "/clubpm/projects/:id", note: "Tab inside the item modal" },
  "vault.bom":              { label: "BOM view",             route: "/clubpm/projects/:id", note: "Tab inside the item modal" },
  "vault.tab.crs":          { label: "Change Requests tab",  route: "/clubpm/projects/:id", note: "Vault sub-nav pill" },
  "cr.new":                 { label: "New change request",   route: "/clubpm/projects/:id", note: "Under vault.tab.crs" },
  "cr.list":                { label: "Change-request list",  route: "/clubpm/projects/:id", note: "Under vault.tab.crs" },
  "cr.card":                { label: "Change-request card",  route: "/clubpm/projects/:id", note: "First card only — opens the CR modal" },
  "cr.review":              { label: "CR review controls",   route: "/clubpm/projects/:id", note: "Approve / reject — admins only, inside the CR modal, and only while the CR is OPEN" },

  // Outreach and blog — src/pages/ClubPM/OutreachHub.jsx, BlogEditorPage.jsx
  "outreach.tab.contacts":  { label: "Contacts tab",         route: "/clubpm/outreach", layout: "both", note: "Desktop tab bar; phone Section chip row" },
  "outreach.tab.campaigns": { label: "Campaigns tab",        route: "/clubpm/outreach", layout: "both", note: "Desktop tab bar; phone Section chip row" },
  "outreach.tab.blog":      { label: "Blog tab",             route: "/clubpm/outreach", layout: "both", note: "Desktop tab bar; phone Section chip row" },
  "outreach.contact.new":   { label: "Add contact",          route: "/clubpm/outreach", note: "" },
  "outreach.contact.form":  { label: "Contact form",         route: "/clubpm/outreach", note: "The New/Edit contact modal panel" },
  "outreach.campaign.new":  { label: "New campaign",         route: "/clubpm/outreach", note: "Campaigns tab header action" },
  "outreach.campaign.form": { label: "Campaign form",        route: "/clubpm/outreach", note: "The New/Edit campaign modal panel" },
  "outreach.contact.card":  { label: "Contact card",         route: "/clubpm/outreach", layout: "both", note: "First card on the CRM board, in column order; first card in the phone stage list" },
  "outreach.contact.timeline": { label: "Timeline tab",      route: "/clubpm/outreach", note: "Tab inside the contact drawer — open a contact first" },
  "outreach.contact.history": { label: "Interaction history", route: "/clubpm/outreach", note: "Body of the drawer's Timeline tab — select that tab first" },
  "outreach.contact.followup": { label: "Next follow-up field", route: "/clubpm/outreach", note: "Date field in the contact form — only while the modal is open" },
  "blog.new":               { label: "New post",             route: "/clubpm/outreach", note: "Blog tab header action" },
  "blog.editor.body":       { label: "Editor canvas",        route: "/clubpm/outreach/blog/:id/edit", note: "" },
  "blog.editor.toolbar":    { label: "Formatting toolbar",   route: "/clubpm/outreach/blog/:id/edit", layout: "both", note: "Full desktop toolbar; phone primary row, with the rest behind More formatting" },
  "blog.editor.presence":   { label: "Collaborator presence", route: "/clubpm/outreach/blog/:id/edit", note: "" },
  "blog.editor.publish":    { label: "Publish control",      route: "/clubpm/outreach/blog/:id/edit", note: "Publish / schedule" },
  "blog.editor.save":       { label: "Save draft button",    route: "/clubpm/outreach/blog/:id/edit", note: "Explicit save — the editor also autosaves 1.5s after you stop typing" },
  "blog.editor.aitoggle":   { label: "AI assistant toggle",  route: "/clubpm/outreach/blog/:id/edit", note: "Header wand button — opens blog.editor.ai" },
  // BlogAiPanel is shared by the blog editor and the course editor, so this id
  // is rendered by one file but reachable from two routes. The blog one is the
  // route a step should navigate to.
  "blog.editor.ai":         { label: "AI assistant panel",   route: "/clubpm/outreach/blog/:id/edit", note: "Shared with the course editor; renders nothing until blog.editor.aitoggle is pressed" },

  // Courses and admin
  "courses.list":           { label: "Course list",          route: "/clubpm/courses", note: "" },
  "courses.new":            { label: "New course",           route: "/clubpm/courses", note: "" },
  "courses.gen":            { label: "AI-generate button",   route: "/clubpm/courses", note: "" },
  "courses.progress":       { label: "Progress dashboard",   route: "/clubpm/courses", note: "Admins only — swaps the catalog for the dashboard" },
  // Assignment lives on the progress dashboard on the catalog page, NOT in the
  // course editor. It was registered under a course.editor.* id pointing at
  // /edit, where it has never existed.
  "courses.assign":         { label: "Assign to members",    route: "/clubpm/courses", note: "Admins only — inside courses.progress" },
  "course.editor.rail":     { label: "Section rail",         route: "/clubpm/courses/:id/edit", note: "" },
  "course.editor.addsection": { label: "Add section",        route: "/clubpm/courses/:id/edit", note: "" },
  "course.editor.preview":  { label: "Preview link",         route: "/clubpm/courses/:id/edit", note: "" },
  "admin.rewards.pending":  { label: "Pending rewards",      route: "/clubpm/admin", note: "" },
  "admin.rewards.config":   { label: "Reward config",        route: "/clubpm/admin", note: "" },
  "admin.integrations":     { label: "Integrations",         route: "/clubpm/admin",   note: "Drive connect card — /clubpm/admin has no separate event-config panel" },
  "admin.members":          { label: "Member roster",        route: "/clubpm/members", note: "Member admin lives on its own route, not under /clubpm/admin" },
});

export function isKnownAnchor(id) {
  return Object.prototype.hasOwnProperty.call(TOUR_ANCHORS, id);
}
