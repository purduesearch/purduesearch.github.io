# Reports Tab Overhaul — Activity, Press Kit, Charts

**Date:** 2026-09-06
**Scope:** `ProjectDetail` → Reports tab (`/clubpm/projects/:id`, `reportTab` = charts | activity | presskit)
**Plan:** `~/.claude/plans/reports-tab-overhaul-tufted-marmot.md`

---

## 1. Problem statement

The Reports tab has three sub-tabs, each with a distinct defect:

### 1.1 Activity — rows visually collide

`src/components/clubpm/ProjectActivity.jsx` renders each row's avatar via
`<MemberBadge member={log.member} size="sm" />` inside a
`flex-shrink: 0; width: 32px; height: 32px` div.

`MemberBadge` (`src/components/clubpm/MemberBadge.jsx`) ends with a "tooltip" div whose
classes are Tailwind utilities — `absolute bottom-full left-1/2 -translate-x-1/2 mb-2 …
opacity-0 group-hover:opacity-100`. **ClubPM does not ship Tailwind.** None of those
classes resolve, so the div is a static, fully-opaque block in normal flow containing
`member.displayName`. Inside a 32px-wide box, "Henry Ewald" wraps to two lines at full
body font size and overflows vertically into the rows above and below. Every row in the
feed carries this hidden name label; the screenshot's stacked "Henry Ewald / Henry
Ewald / Henry Ewald" text is it.

Secondary problems in the same file:

- The component is ~100% inline styles — no CSS class hooks, nothing themeable.
- `EVENT_META` uses emoji as icons (`✨`, `🗑`, `🤖`, …), violating the project-wide
  "Font Awesome classes only; never use emoji as icons in JSX" convention. Emoji also
  render at inconsistent widths across platforms, which is part of the ragged alignment.
- Flat undifferentiated list — no date grouping, so a 200-row feed has no scannable
  structure.
- Filters are single-`eventType` only. There is no actor filter and no text search, and
  a conceptual group like "Comments" cannot be expressed because the endpoint accepts
  one enum value.
- Rows referencing a task are not clickable.

### 1.2 Press Kit — the AI prompt is starved of detail

`generatePressKitPlan` (`backend/src/services/aiService.ts:155`) receives:

- 7 scalar stats,
- ≤ 8 **completed** milestones (`gatherPressKitData` filters `status: "COMPLETED"`, `take: 8`),
- 50 top-level task **titles only** (`pressKitService.ts:334`, `where: { parentTaskId: null }`,
  `select: { title: true }`),
- team roster, tags, links.

No task descriptions, statuses, priorities, or assignees. No subtasks. No blockers or
dependencies. No GitHub activity. No standups or project updates. No time distribution.
No velocity. The model is asked to write "3–5 sentences naming the specific subsystems"
from a bare list of titles, so the output is necessarily generic.

### 1.3 Charts — two silent data bugs

**`Task` has no `completedAt` column.** Confirmed against
`backend/prisma/schema.prisma:355-440`. Both of these therefore read `undefined`:

- `useVelocityData` — `tasks.filter(t => t.completedAt)` yields `[]`, so **Weekly
  Velocity renders eight empty bars, always.**
- `useBurndownData` — `safeDate(t.completedAt)` is always `null`, so no task is ever
  counted as complete and the **"Actual" line is a flat horizontal line at total task
  count**, regardless of real progress.

**Subtasks are excluded.** `projectService.getProject` fetches
`tasks: { where: { parentTaskId: null } }` (`projectService.ts:91`). `ProjectAnalytics`
receives only top-level tasks, so subtasks are invisible to the Status donut, Risk
Radar, Burndown, and Velocity. Subtasks **are** nested under each parent in the same
payload (`include: { subtasks: … }`), so this is fixable client-side with no backend
change.

Beyond the bugs the tab is thin: four fixed cards, no time range, no grouping control,
no export, hardcoded hex colors that don't match the ClubPM palette, and a Risk Radar
that is three hardcoded `if` statements capped at `.slice(0, 3)`.

---

## 2. Non-goals

- No change to the Reports sub-tab routing or to `PressKitPanel`'s editor/collab layer.
- No redesign of the press kit **output document** (`sectionPlan.ts`, `blogRender.ts`,
  print styles). Only the data gathered and the prompt that consumes it change.
- No new chart library. `recharts ^3.8.1` and `date-fns ^4.1.0` are already dependencies.
- No changes to `MemberBadge`'s public API. The broken Tailwind tooltip is worked around
  inside `ProjectActivity` (containment + native `title`), not fixed globally — a global
  fix touches ~40 call sites and belongs in its own PR.

---

## 3. Part A — Activity timeline rebuild

### 3.1 Backend: filter parameters

`getProjectAuditLog(projectId, cursor, limit, eventType)` in
`backend/src/services/activityService.ts:114` gains two capabilities:

| Param | Shape | Behavior |
|---|---|---|
| `eventType` | `string` (comma-separated) | Split on `,`, validate each against the `ActivityEventType` enum, drop unknowns. One value → `{ eventType: v }`; many → `{ eventType: { in: [...] } }`; none → omit. |
| `memberId` | `string` | Adds `{ memberId }` to the `where`. Ignored when blank. |

Signature becomes an options object —
`getProjectAuditLog(projectId, { cursor, limit, eventTypes, memberId })` — because four
positional params with two new ones is unreadable. **`projectContextService.ts` and
`api/projects.ts:245` are the only callers** and both are updated in the same phase.

`projectsRouter.get("/:id/activity")` (`backend/src/api/projects.ts:238`) parses
`?eventType=A,B,C&memberId=…` and forwards them.

Validation is required, not optional: an unvalidated string reaching a Prisma enum
filter throws a 500 rather than returning an empty page.

### 3.2 Frontend: event metadata

`EVENT_META` is rewritten so each entry is
`{ icon: "fas fa-…", tone: "<token-name>", label: "…" }`:

- `icon` — a Font Awesome class string, never emoji.
- `tone` — one of a fixed set (`create | update | done | danger | warn | muted | github |
  ai | comment | time | milestone`) that maps to a CSS custom property. Colors move out
  of JS into `clubpm-theme.css` so light/dark and future re-theming are one edit.

`describeEvent()` is kept as-is apart from mechanical changes; its per-event copy is
already good and rewriting it risks regressions across ~40 event types.

### 3.3 Frontend: row structure

```
.pm-activity-day            ← sticky day header: "Today" / "Yesterday" / "Sep 4, 2026"
  .pm-activity-row          ← grid: [rail+icon 32px] [avatar 28px] [1fr text] [auto meta]
    .pm-activity-rail       ← ::before vertical connector line
      .pm-activity-icon     ← 28px circle, tone-colored bg + border, <i class="fas …">
    .pm-activity-avatar     ← overflow:hidden, contains the MemberBadge; title attr
    .pm-activity-body
      .pm-activity-text     ← describeEvent(log)
      .pm-activity-meta     ← <RelativeTime> · <SourceBadge>
```

- `.pm-activity-avatar` sets `overflow: hidden; width: 28px; height: 28px; position:
  relative` — this is what contains the broken `MemberBadge` tooltip. It also carries
  `title={log.member.displayName}` so hover identification still works.
- The vertical rail is a `::before` on `.pm-activity-row` running the full row height,
  hidden on the last row of each day group via `:last-child`.
- Rows with `log.taskId` get `.pm-activity-row--clickable` (pointer cursor, hover
  surface) and `role="button"` + `tabIndex=0` + Enter/Space handling.

### 3.4 Frontend: grouping, filters, states

- **Day grouping** — rows bucketed by local calendar day (`date-fns` `startOfDay`).
  Header label: "Today", "Yesterday", weekday name within the last 7 days, else
  `MMM d, yyyy`. Header is `position: sticky; top: 0`.
- **Filter groups** — `FILTER_OPTIONS` entries become
  `{ id, label, icon, types: ActivityEventType[] }`. Groups: All · Tasks · Completed ·
  Comments · Blockers & deps · Milestones · GitHub · Standups · Project · AI. The
  `types` array is joined with `,` into the query.
- **Actor filter** — a row of member avatars sourced from a new `members` prop
  (`ProjectDetail` already holds the roster). Clicking one sets `memberId`.
- **Search** — a debounced (250 ms) text input filtering the *already-loaded* rows
  client-side on the flattened text of `describeEvent`. Explicitly client-side: the
  payload is JSON and not usefully searchable in Postgres without a new index, and the
  feed is cursor-paginated so server-side search would need its own endpoint. The empty
  state says so ("no match in the loaded activity — scroll to load more").
- **Loading** — five skeleton rows (`.pm-activity-skeleton`) replacing the bare spinner.
- **Empty** — Font Awesome icon + "No activity yet" / "No activity matches these
  filters" + a "Clear filters" button when any filter is active.

`ProjectDetail.jsx` passes `members={project.members}` and
`onOpenTask={id => setOpenTaskId(id)}` (reusing the existing task-modal opener).

### 3.5 CSS

A new `/* === Project Activity Timeline === */` block appended to
`public/clubpm-theme.css`. All tone colors declared once as `--pm-act-*` custom
properties on `.pm-activity`. `prefers-reduced-motion` disables the row hover
transition. Under 640px the meta column wraps beneath the text and the actor-filter row
becomes horizontally scrollable.

---

## 4. Part B — `Task.completedAt`

### 4.1 Schema

```prisma
model Task {
  …
  completedAt DateTime?
  …
  @@index([projectId, completedAt])
}
```

Named migration `add_task_completed_at`.

### 4.2 Backfill

In the same migration SQL, after the `ALTER TABLE`:

1. For each task currently `status = 'DONE'`, set `completedAt` to the `createdAt` of
   its most recent `ActivityLog` row with `eventType = 'TASK_COMPLETED'`.
2. For DONE tasks with no such log row, fall back to `updatedAt`.

Written as two `UPDATE … FROM` statements. Non-DONE tasks are left `NULL`.

### 4.3 Writers

The completion transition is set in **`taskService.updateTask`**
(`backend/src/services/taskService.ts:133`), which is the single funnel for the web
single PATCH (`tasks.ts:528`), the bulk PATCH (`tasks.ts:317`), `slack/actions.ts:47`,
and `slack/modals.ts:1001`:

```ts
if (data.status !== undefined) {
  updateData.status = data.status;
  if (data.status === "DONE")      updateData.completedAt = current?.completedAt ?? new Date();
  else if (currentStatusWasDone)   updateData.completedAt = null;
}
```

The existing `→DONE` guard already fetches `current`; it is widened to also select
`status` and `completedAt` and to run for **every** status change, not only `→DONE`, so
the clear-on-leaving-DONE branch has the data it needs.

Three writers bypass `updateTask` and set status via raw Prisma. Each gets the same
treatment inline:

| File | Line | Context |
|---|---|---|
| `backend/src/services/aiActionService.ts` | 386 | `SET_STATUS` / `UPDATE_TASK` dispatch |
| `backend/src/services/githubSyncService.ts` | 899 | PR-merge auto-complete |
| `backend/src/services/githubSyncService.ts` | 1044 | issue-close sync |

`completedAt` is **not** an idempotency gate — that remains `rewardGrantedAt`.
Re-completing a task refreshes `completedAt` only if it was cleared in between, which is
the correct semantic for velocity ("when did this last become done").

### 4.4 Tests

`backend/src/services/taskService.completedAt.test.ts`: `→DONE` sets it; `DONE→DONE`
(no-op status write) preserves the original value; `DONE→IN_PROGRESS` clears it;
`→BLOCKED` from TODO leaves it null.

---

## 5. Part C — Charts rebuild

### 5.1 File layout

`ProjectAnalytics.jsx` (419 lines, one file, four cards) is replaced by a folder. The
existing file is deleted; `ProjectDetail.jsx`'s import path changes to the folder index.

```
src/components/clubpm/analytics/
  index.js                     re-export
  ProjectAnalytics.jsx         toolbar + KPI strip + card grid
  useAnalyticsData.js          ALL derivation — pure, no React beyond useMemo
  useAnalyticsData.test.js
  analyticsTheme.js            palette, tooltip, axis props, shared recharts config
  AnalyticsToolbar.jsx
  AnalyticsCard.jsx            shell: title, header menu, chart-type switch, export
  KpiStrip.jsx
  cards/
    BurndownCard.jsx
    CumulativeFlowCard.jsx
    VelocityCard.jsx
    ThroughputCard.jsx
    StatusBreakdownCard.jsx
    AssigneeWorkloadCard.jsx
    PriorityAgingCard.jsx
    RiskRadarCard.jsx
```

### 5.2 `useAnalyticsData.js` — the single derivation layer

One exported hook, `useAnalyticsData(project, options)`, plus the pure functions it
composes (each exported for test).

**Flattening.** `flattenTasks(tasks, includeSubtasks)` returns
`tasks.flatMap(t => includeSubtasks ? [t, ...(t.subtasks ?? [])] : [t])`. Subtasks in
the payload carry `status`, `priority`, `createdAt`, `assignees`, and (after Part B)
`completedAt`, which is everything the charts read. **Subtasks count as full tasks** —
no weighting.

**Options** (all from the toolbar): `range` (30 | 60 | 90 | 0 for all), `bucket`
(`week` | `month`), `includeSubtasks` (default `true`), `includeArchived` (default
`false`), `assigneeId` (null = all).

**Returns:**

| Key | Shape | Notes |
|---|---|---|
| `tasks` | flattened + filtered array | every card derives from this, nothing re-filters |
| `kpis` | `{ completionPct, doneThisPeriod, avgCycleDays, overdue, hoursLogged, activeBlockers }` each `{ value, delta }` | `delta` compares against the immediately preceding window of equal length |
| `burndown` | `[{ date, actual, ideal, projected }]` | ideal anchored to `project.startDate` → `project.targetDate` (falls back to first task `createdAt` → latest milestone `dueDate` → +30d) |
| `cumulativeFlow` | `[{ date, TODO, IN_PROGRESS, BLOCKED, DONE }]` | reconstructed per day from `createdAt`/`completedAt`; non-DONE tasks are attributed to their **current** status for the whole window (documented approximation — historical status transitions are in `ActivityLog`, not fetched here) |
| `velocity` | `[{ label, start, count, points, hours, rolling }]` | `rolling` = 3-bucket trailing mean |
| `throughput` | `[{ label, created, completed, net }]` | |
| `statusBreakdown` / `priorityBreakdown` / `assigneeBreakdown` | `[{ key, label, value, color }]` | the donut's three dimensions |
| `workload` | `[{ member, TODO, IN_PROGRESS, BLOCKED, DONE, total }]` | open work per assignee; unassigned is a synthetic row |
| `aging` | `[{ bucket, LOW, MEDIUM, HIGH, CRITICAL }]` | open tasks by age × priority; buckets `<1w`, `1–2w`, `2–4w`, `>1mo` |
| `risk` | `{ score, band, factors: [{ id, label, weight, contribution, severity, tasks }] }` | see 5.3 |

**Bucketing** uses `startOfISOWeek` / `startOfMonth` and keys on the bucket-start ISO
string, never on `getISOWeek()` alone — the current code compares `(week, year)` pairs
built from `getISOWeek`/`getISOWeekYear`, which is correct but fragile; keying on the
start date removes the class of bug entirely. Buckets are generated for the whole range
so empty periods render as zero bars rather than disappearing.

### 5.3 Risk Radar scoring

Replaces the three hardcoded `if`s. Seven weighted factors, each producing a normalized
`0..1` contribution multiplied by its weight; the score is
`round(100 * Σ(contribution × weight) / Σ weight)` — so 0 is clean and 100 is maximally
at-risk.

| Factor | Signal | Weight |
|---|---|---|
| `blocked` | share of open tasks in `BLOCKED` | 20 |
| `overdue` | share of open tasks past `dueDate` | 20 |
| `aging` | share of open tasks older than 30d with no completion | 15 |
| `stale` | share of `IN_PROGRESS` tasks not updated in 14d | 15 |
| `unassigned` | share of open tasks with no assignee | 10 |
| `dependencies` | share of open tasks with an unresolved `blockedBy` | 10 |
| `velocityTrend` | latest bucket vs 3-bucket rolling mean, clamped | 10 |

Bands: `0–24 healthy` (teal) · `25–49 watch` (amber) · `50–74 at risk` (coral) ·
`75–100 critical` (red). Each factor carries the offending task list, rendered as an
expandable row that click-throughs to the task modal. A factor contributing 0 is shown
greyed rather than hidden, so the card's height is stable and the reader can see what
*was* checked.

### 5.4 Toolbar and persistence

`AnalyticsToolbar` controls: range · bucket · include-subtasks · include-archived ·
assignee. State lives in `ProjectAnalytics` and is persisted to
`localStorage["clubpm:analytics:" + projectId]`, read once on mount behind a
`try/catch` (private-window / blocked-storage safe) and merged over defaults so a
schema change in a later release can't produce an invalid option.

### 5.5 `AnalyticsCard` shell

Every card renders inside `<AnalyticsCard>`, which supplies: title, optional subtitle, a
`⋯` header menu, and a fixed-height chart slot.

Menu items:
- **Chart type** — only where meaningful, driven by a `chartTypes` prop
  (`["area","line","bar"]`). Selection is local card state.
- **Copy as PNG** — serializes the card's `<svg>` to a canvas and writes a PNG to the
  clipboard via `navigator.clipboard.write`. Disabled with a tooltip where
  `ClipboardItem` is unavailable (Firefox).
- **Export CSV** — downloads that card's underlying rows. One shared
  `toCsv(rows, columns)` helper in `analyticsTheme.js`; the download uses a blob URL and
  a synthetic `<a download>`.

### 5.6 Palette

`analyticsTheme.js` is the only place chart colors are written. Categorical series draw
from a fixed ordered array; status/priority keep semantic colors. All are ClubPM tokens
(`--pm-accent-teal`, `--pm-accent-amber`, `--pm-accent-coral`, `--pm-accent-violet`)
resolved through `getComputedStyle` once, with hex fallbacks, because recharts cannot
consume `var()` in every prop position. Grid, axis, and tooltip styling is exported as
spreadable prop objects so no card re-declares them.

### 5.7 Tests

`useAnalyticsData.test.js`, using a hand-built project fixture:

- flattening on/off changes counts by exactly the subtask count;
- archived tasks excluded by default, included when toggled;
- weekly bucketing spans a Dec→Jan ISO-week-year boundary correctly;
- empty buckets are present with zero, not missing;
- cycle time ignores tasks with no `completedAt`;
- risk score is 0 for a clean project and > 50 for a project with all factors tripped;
- a project with zero tasks returns defined, non-`NaN` values for every key.

---

## 6. Part D — Press kit prompt detail

### 6.1 Data gathered

`PressKitContext` (`pressKitService.ts:56`) is extended. New queries in
`gatherPressKitData`, all with hard caps so a large project cannot blow the model's
context:

| Field | Source | Cap |
|---|---|---|
| `tasks` — title, description (trimmed 240 chars), status, priority, assignee names, completedAt, isSubtask, parent title | `prisma.task.findMany` — **`parentTaskId` filter dropped** | 200, ordered `completedAt desc, createdAt desc` |
| `milestones` — all statuses, + `dueDate`, `taskCount`, `doneCount` | widened from `status: "COMPLETED"`, `take: 8` | 25 |
| `blockers` — label, resolved?, affected task count | `TaskBlocker` + `Blocker` | 20 |
| `dependencies` — count of open blocking edges, 5 example pairs | `TaskDependency` | 5 examples |
| `github` — repo, merged PR count, open PR count, recent merged PR titles, branch count | `GitHubLink` + `ActivityLog` `GITHUB_PR_MERGED` | 15 titles |
| `updates` — recent project updates + standups, trimmed 300 chars | `project.updates`, `ActivityLog` `STANDUP_POSTED` | 15 |
| `timeByMonth` — `[{ month, hours }]` | `TimeLog` groupBy | 24 |
| `topTimeTasks` — `[{ title, hours }]` | `TimeLog` groupBy task | 10 |
| `velocity` — `[{ month, completed }]`, `pacePerMonth`, `daysToTarget` | derived from `completedAt` (Part B) | 12 |
| `team` — + `rank`, `projectRole`, `joinedAt` | existing include widened | — |
| `deliverables` — vault item count + names, task attachment count | `VaultItem` | 20 names |
| `tags` — + usage count | `project.tags` | — |

Every new query is wrapped so a failure degrades to an empty array rather than failing
generation — the press kit must still generate when, say, the vault tables are empty.

### 6.2 Prompt

`PressKitPlanInput` gains the fields above. In `generatePressKitPlan`:

- The `facts` object carries every new field.
- `maxOutputTokens` 8192 → 16384.
- New **Depth** rules block, placed above the existing Rules block:

  > - Prioritize specificity over polish. Every paragraph must contain at least one
  >   concrete detail drawn from FACTS — a component name, a subsystem, a number, a
  >   date, a tool, or a person's contribution.
  > - A sentence that would read identically for a different engineering project is a
  >   failure. Rewrite it with specifics or cut it.
  > - Name the actual workstreams. Infer them by clustering the task titles and
  >   descriptions, and refer to them the way the team does.
  > - Prefer the specific number to the vague quantifier: "41 of 63 tasks complete", not
  >   "significant progress".

- The existing grounding rule is strengthened to: *"Ground every statement ONLY in
  FACTS. If a fact is absent, omit the claim — never estimate, round up, or infer a
  number that is not present."* This gets **more** important as the fact set grows.
- Per-section length floors raised in `SECTION_INSTRUCTIONS`:
  - `about` 2–4 → **4–6 sentences**, must name the technical domain and current phase.
  - `building` 3–5 → **6–10 sentences**, must name at least three distinct workstreams
    with a concrete detail each.
  - `highlights` → **5–8 bullets, each citing a specific milestone, PR, or number**.
  - `tech` 1–2 → **3–5 sentences**, drawn from tags *and* task titles, not tags alone.
  - `aboutSearch` and the placeholder sections are unchanged.

`fallbackPressKitPlan` is unchanged — it is the no-API-key path and does not read facts.

---

## 7. Sequencing

Part B ships before Part D so the press kit's velocity facts are real rather than empty.
Part B also unblocks Parts C's two headline bug fixes. Part A is independent and goes
first because it is the smallest and lowest-risk.

```
A1 → A2   Activity   (backend filters + component, then CSS + wiring)
B         completedAt migration + writers + tests      ← deploy gate
D1 → D2   Press kit  (data gathering, then prompt)
C1 … C5   Charts     (data hook, shell, cards ×2, CSS)
```

Ten phases, each sized for a fresh session: ≤ 4 files touched, ≤ 2 new components, and
no phase mixes a Prisma migration with frontend work. `npm run build` (repo root) and
`npx tsc --noEmit` (`backend/`) run at the end of every phase.
