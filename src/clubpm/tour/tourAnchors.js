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
  "nav.members":            { label: "Members link",         route: "*", note: "" },
  "nav.calendar":           { label: "Calendar link",        route: "*", note: "" },
  "nav.challenges":         { label: "Quests link",          route: "*", note: "" },
  "nav.shop":               { label: "Shop link",            route: "*", note: "" },
  "nav.outreach":           { label: "Outreach link",        route: "*", note: "" },
  "nav.admin":              { label: "Admin link",           route: "*", note: "Admins only — absent for other members" },
  "nav.profile":            { label: "Profile link",         route: "*", note: "Sidebar user block" },
  "topbar.notifications":   { label: "Notification bell",    route: "*", note: "" },
  "topbar.search":          { label: "Command palette",      route: "*", note: "AI command palette trigger" },
  "topbar.streak":          { label: "Streak counter",       route: "*", note: "Flame counter" },

  // Dashboard — src/pages/ClubPM/Dashboard.jsx
  "dash.stats":             { label: "Stat bar",             route: "/clubpm", note: "The five-tile stat bar" },
  "nav.xp":                 { label: "XP bar",               route: "*",       note: "Sidebar XP progress bar — the product has no XP stat tile" },
  "nav.rank":               { label: "Rank badge",           route: "*",       note: "Sidebar rank icon" },
  "dash.quests":            { label: "Daily quests",         route: "/clubpm", note: "" },
  "dash.work":              { label: "My work",              route: "/clubpm", note: "Filterable task list" },
  "dash.agenda":            { label: "Agenda panel",         route: "/clubpm", note: "7-day agenda" },
  "dash.leaderboard":       { label: "Leaderboard",          route: "/clubpm", note: "" },
  "dash.insights":          { label: "AI insight cards",     route: "/clubpm", note: "" },
  "dash.project.card":      { label: "Project card",         route: "/clubpm", note: "First card in the grid only" },

  // Project detail — src/pages/ClubPM/ProjectDetail.jsx
  "project.header":         { label: "Project header",       route: "/clubpm/projects/:id", note: "Title + status row" },
  "project.tab.tasks":      { label: "Tasks tab",            route: "/clubpm/projects/:id", note: "" },
  "project.tab.milestones": { label: "Milestones tab",       route: "/clubpm/projects/:id", note: "" },
  "project.tab.files":      { label: "Files tab",            route: "/clubpm/projects/:id", note: "" },
  "project.tab.vault":      { label: "Vault tab",            route: "/clubpm/projects/:id", note: "" },
  "project.tab.reports":    { label: "Reports tab",          route: "/clubpm/projects/:id", note: "" },
  "project.tab.ai":         { label: "AI tab",               route: "/clubpm/projects/:id", note: "" },
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
  "milestones.panel":       { label: "Milestone list",       route: "/clubpm/projects/:id", note: "" },
  "milestones.new":         { label: "New milestone",        route: "/clubpm/projects/:id", note: "" },
  "milestones.health":      { label: "Milestone health",     route: "/clubpm/projects/:id", note: "Badge on the first milestone" },
  "ai.goal":                { label: "Action-plan goal",     route: "/clubpm/projects/:id", note: "Goal input in the AI tab" },

  // Task modal — src/components/clubpm/TaskModal.jsx
  "task.modal":             { label: "Task modal",           route: "*", note: "The modal shell" },
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
  "vault.tree":             { label: "Item tree",            route: "/clubpm/projects/:id", note: "" },
  "vault.item":             { label: "Vault item row",       route: "/clubpm/projects/:id", note: "First row only" },
  "vault.checkout":         { label: "Check-out button",     route: "/clubpm/projects/:id", note: "" },
  "vault.upload":           { label: "New-version upload",   route: "/clubpm/projects/:id", note: "" },
  "vault.versions":         { label: "Version history",      route: "/clubpm/projects/:id", note: "" },
  "vault.bom":              { label: "BOM view",             route: "/clubpm/projects/:id", note: "" },
  "cr.new":                 { label: "New change request",   route: "/clubpm/projects/:id", note: "" },
  "cr.list":                { label: "Change-request list",  route: "/clubpm/projects/:id", note: "" },
  "cr.review":              { label: "CR review controls",   route: "/clubpm/projects/:id", note: "Approve / reject" },

  // Outreach and blog — src/pages/ClubPM/OutreachHub.jsx, BlogEditorPage.jsx
  "outreach.tab.contacts":  { label: "Contacts tab",         route: "/clubpm/outreach", note: "" },
  "outreach.tab.campaigns": { label: "Campaigns tab",        route: "/clubpm/outreach", note: "" },
  "outreach.tab.blog":      { label: "Blog tab",             route: "/clubpm/outreach", note: "" },
  "outreach.tab.courses":   { label: "Courses tab",          route: "/clubpm/outreach", note: "" },
  "outreach.contact.new":   { label: "Add contact",          route: "/clubpm/outreach", note: "" },
  "outreach.campaign.new":  { label: "New campaign",         route: "/clubpm/outreach", note: "" },
  "blog.editor.body":       { label: "Editor canvas",        route: "/clubpm/outreach/blog/:id/edit", note: "" },
  "blog.editor.toolbar":    { label: "Formatting toolbar",   route: "/clubpm/outreach/blog/:id/edit", note: "" },
  "blog.editor.presence":   { label: "Collaborator presence", route: "/clubpm/outreach/blog/:id/edit", note: "" },
  "blog.editor.publish":    { label: "Publish control",      route: "/clubpm/outreach/blog/:id/edit", note: "Publish / schedule" },

  // Courses and admin
  "courses.list":           { label: "Course list",          route: "/clubpm/outreach", note: "" },
  "courses.new":            { label: "New course",           route: "/clubpm/outreach", note: "" },
  "courses.gen":            { label: "AI-generate button",   route: "/clubpm/outreach", note: "" },
  "course.editor.rail":     { label: "Section rail",         route: "/clubpm/outreach/courses/:id/edit", note: "" },
  "course.editor.addsection": { label: "Add section",        route: "/clubpm/outreach/courses/:id/edit", note: "" },
  "course.editor.preview":  { label: "Preview link",         route: "/clubpm/outreach/courses/:id/edit", note: "" },
  "course.editor.assign":   { label: "Assign to members",    route: "/clubpm/outreach/courses/:id/edit", note: "" },
  "admin.rewards.pending":  { label: "Pending rewards",      route: "/clubpm/admin", note: "" },
  "admin.rewards.config":   { label: "Reward config",        route: "/clubpm/admin", note: "" },
  "admin.integrations":     { label: "Integrations",         route: "/clubpm/admin",   note: "Drive connect card — /clubpm/admin has no separate event-config panel" },
  "admin.members":          { label: "Member roster",        route: "/clubpm/members", note: "Member admin lives on its own route, not under /clubpm/admin" },
});

export function isKnownAnchor(id) {
  return Object.prototype.hasOwnProperty.call(TOUR_ANCHORS, id);
}
