/**
 * The tour anchor vocabulary.
 *
 * Every id here must be rendered by exactly one component as `data-tour-id`,
 * and every `anchor` in a *.steps.json file must appear here.
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
  // Shell and navigation — src/components/clubpm/AppShell.jsx
  "nav.sidebar":            { label: "Sidebar",              route: "*", note: "Whole rail, for coarse dimming" },
  "nav.dashboard":          { label: "Dashboard link",       route: "*", note: "" },
  "nav.projects":           { label: "Projects link",        route: "*", note: "" },
  "nav.members":            { label: "Members link",         route: "*", note: "Child of the Outreach group — expand it first" },
  "nav.calendar":           { label: "Calendar link",        route: "*", note: "" },
  "nav.courses":            { label: "Courses link",         route: "*", note: "" },
  "nav.shop":               { label: "Shop link",            route: "*", note: "" },
  "nav.outreach":           { label: "Outreach group",       route: "*", note: "Collapsible group header, not a link" },
  "nav.admin":              { label: "Admin link",           route: "*", note: "Admins only — absent for other members" },
  "nav.profile":            { label: "Profile link",         route: "*", note: "Sidebar user block" },
  "topbar.notifications":   { label: "Notification bell",    route: "*", note: "" },
  "topbar.search":          { label: "Command palette",      route: "*", note: "AI command palette trigger" },
  "topbar.streak":          { label: "Streak counter",       route: "*", note: "Flame counter" },
  "topbar.challenges":      { label: "Quests button",        route: "*", note: "Trophy icon — was the nav.challenges sidebar link" },

  // Dashboard — src/pages/ClubPM/Dashboard.jsx
  "nav.xp":                 { label: "XP bar",               route: "*",       note: "Sidebar XP progress bar — the product has no XP stat tile" },
  "nav.rank":               { label: "Rank badge",           route: "*",       note: "Sidebar rank icon" },
  "dash.quests":            { label: "Daily quests",         route: "/clubpm", note: "" },
  "dash.work":              { label: "My work",              route: "/clubpm", note: "Filterable task list" },
  "dash.agenda":            { label: "Agenda panel",         route: "/clubpm", note: "7-day agenda" },
  "dash.leaderboard":       { label: "Leaderboard",          route: "/clubpm/members", note: "Bottom of the member roster — moved off the dashboard" },
  "dash.insights":          { label: "AI insight cards",     route: "/clubpm", note: "" },
  "dash.project.card":      { label: "Project card",         route: "/clubpm", note: "First card in the grid only" },

  // Project detail — src/pages/ClubPM/ProjectDetail.jsx
  "project.header":         { label: "Project header",       route: "/clubpm/projects/:id", note: "Title + status row" },
  // The project tab bar is rendered by AppShell from the ProjectNavContext, not
  // by ProjectDetail — ProjectDetail only supplies the list. Put the ids on
  // AppShell's buttons or they exist in the source and never in the DOM.
  "project.tab.tasks":      { label: "Tasks tab",            route: "/clubpm/projects/:id", note: "Sidebar project tab (AppShell)" },
  "project.tab.files":      { label: "Files tab",            route: "/clubpm/projects/:id", note: "Sidebar project tab (AppShell)" },
  "project.tab.reports":    { label: "Reports tab",          route: "/clubpm/projects/:id", note: "Sidebar project tab (AppShell)" },
  "project.tab.ai":         { label: "AI tab",               route: "/clubpm/projects/:id", note: "Sidebar project tab (AppShell)" },
  "project.tab.vault":      { label: "Vault sub-tab",        route: "/clubpm/projects/:id", note: "Inside the Files tab — open project.tab.files first" },
  "board.newtask":          { label: "New task button",      route: "/clubpm/projects/:id", note: "" },
  "board.filters":          { label: "Board filters",        route: "/clubpm/projects/:id", note: "Filter / search row above the board" },
  // The four columns carry the uppercase TaskStatus enum value so the id cannot
  // drift from the enum it is derived from.
  "board.column.TODO":        { label: "To-do column",       route: "/clubpm/projects/:id", note: "" },
  "board.column.IN_PROGRESS": { label: "In-progress column", route: "/clubpm/projects/:id", note: "" },
  "board.column.BLOCKED":     { label: "Blocked column",     route: "/clubpm/projects/:id", note: "" },
  "board.column.DONE":        { label: "Done column",        route: "/clubpm/projects/:id", note: "" },
  "board.card.first":       { label: "First task card",      route: "/clubpm/projects/:id", note: "First card of the TODO column only" },
  "board.memberchips":      { label: "Member chip rail",     route: "/clubpm/projects/:id", note: "Draggable onto tasks" },
  "board.blocker.bin":      { label: "Blocker sub-bin",      route: "/clubpm/projects/:id", note: "Under the Blocked column" },
  "ai.goal":                { label: "Action-plan goal",     route: "/clubpm/projects/:id", note: "Goal input in the AI tab" },

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
  "outreach.tab.contacts":  { label: "Contacts tab",         route: "/clubpm/outreach", note: "" },
  "outreach.tab.campaigns": { label: "Campaigns tab",        route: "/clubpm/outreach", note: "" },
  "outreach.tab.blog":      { label: "Blog tab",             route: "/clubpm/outreach", note: "" },
  "outreach.contact.new":   { label: "Add contact",          route: "/clubpm/outreach", note: "" },
  "outreach.contact.form":  { label: "Contact form",         route: "/clubpm/outreach", note: "The New/Edit contact modal panel" },
  "outreach.campaign.new":  { label: "New campaign",         route: "/clubpm/outreach", note: "Campaigns tab header action" },
  "outreach.campaign.form": { label: "Campaign form",        route: "/clubpm/outreach", note: "The New/Edit campaign modal panel" },
  "outreach.contact.card":  { label: "Contact card",         route: "/clubpm/outreach", note: "First card on the CRM board, in column order" },
  "outreach.contact.timeline": { label: "Timeline tab",      route: "/clubpm/outreach", note: "Tab inside the contact drawer — open a contact first" },
  "outreach.contact.history": { label: "Interaction history", route: "/clubpm/outreach", note: "Body of the drawer's Timeline tab — select that tab first" },
  "outreach.contact.followup": { label: "Next follow-up field", route: "/clubpm/outreach", note: "Date field in the contact form — only while the modal is open" },
  "blog.new":               { label: "New post",             route: "/clubpm/outreach", note: "Blog tab header action" },
  "blog.editor.body":       { label: "Editor canvas",        route: "/clubpm/outreach/blog/:id/edit", note: "" },
  "blog.editor.toolbar":    { label: "Formatting toolbar",   route: "/clubpm/outreach/blog/:id/edit", note: "" },
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
