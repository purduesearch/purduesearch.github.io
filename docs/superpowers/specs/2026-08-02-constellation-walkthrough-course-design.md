# Constellation Walkthroughs & the Onboarding Curriculum — Design

Fourth spec in the course-system line, after modules, slides, and AI generation. It assumes those
have shipped: a `CourseSection` already belongs to a `CourseModule`, the learner payload already
withholds locked sections' bodies, and `completeSection` already refuses premature completion per
kind.

## Context

Constellation has ~18 distinct surfaces — dashboard, projects and the kanban board, milestones,
gantt, the Constellation Vault and change requests, outreach CRM, the blog editor, courses, calendar,
quests, shop, profile, leaderboard, notifications, admin tools, and the Slack and GitHub
integrations. New club members currently learn it by being shown it over someone's shoulder.

The course system can already teach with prose, video, decks, and quizzes. What it cannot do is
teach the product *in* the product. This spec adds a `WALKTHROUGH` section kind — a guided tour that
runs against the real Constellation UI, spotlighting where to go, dimming and blocking where not to
go yet, and requiring the learner to actually perform the action before advancing — and then defines
the curriculum built on top of it.

## Decisions

| Decision | Choice |
|---|---|
| How tours drive the UI | **Live overlay on the real app.** Not a sandboxed replica, not screenshots. |
| Element targeting | `data-tour-id` attributes plus a frozen registry, enforced by a CI script. |
| Where the runtime mounts | Above the route tree in `App.js`, so a tour survives navigation. |
| Spotlight technique | One SVG `<path>` with `fill-rule="evenodd"`. Not four divs, not a giant `box-shadow`. |
| Where the learner practices | A per-member seeded **training project**, hidden from all real views. |
| Step storage | **Courses-as-code.** Steps are repo files, not database rows. |
| Content home | `docs/courses/`, single source of truth for json and prose alike. |
| Curriculum shape | One required **Constellation 101**, four role-gated electives. |
| Completion | `maxStepIndex === stepCount - 1`, server-enforced, mirroring SLIDES. |
| Missing anchor | Fail soft — degrade the step, report it, never trap the learner. |

## Non-goals

- Editing walkthrough steps in the course editor. The editor gets a **read-only** step list and a
  breakage report; authoring a tour means editing a repo file and opening a PR. This is the direct
  consequence of the courses-as-code decision, not an oversight.
- Tours of the public marketing site (`/`, `/astrousa`, …). ClubPM surfaces only.
- Recording or branching tours per learner. Every learner gets the same steps in the same order.
- Replacing `CoursesTab`, `CourseGenModal`, or any existing section kind's behavior.
- AI-generated walkthroughs. The generator (`coursePlan.ts`) may propose a `WALKTHROUGH` section as
  an outline item, but it cannot write steps — it has no knowledge of the anchor registry.

---

## Part 1 — The walkthrough engine

### Why live, and what that costs

A tour that drives the real app teaches the real app. A replica teaches a replica and drifts from the
product the day after it ships; annotated screenshots rot on the next redesign and were never
interactive. Both alternatives were considered and rejected on those grounds.

The cost of going live is concrete and worth naming up front:

1. **Anchors must exist.** There are zero `data-testid` or `data-tour-id` attributes in `src/` today.
   98 must be added across ~15 files — enumerated in [`docs/courses/ANCHORS.md`](../../courses/ANCHORS.md).
2. **Steps break when the UI changes.** Mitigated by the CI check below, which turns a silent
   production breakage into a failed build.
3. **Real actions touch real data.** Mitigated by the training project.

### The anchor registry

Three pieces, and all three are required for the contract to mean anything:

- **Components carry the attribute.** `<Link data-tour-id="nav.projects" …>`,
  `data-tour-id="board.column.TODO"`, `data-tour-id="task.modal.timelog"`.
- **`src/clubpm/tour/tourAnchors.js`** exports a frozen `Object.freeze` map of
  id → `{ label, route, note }`. It is the vocabulary; no step file may invent an id outside it.
- **`scripts/check-tour-anchors.js`** scans `src/` for every `data-tour-id` literal, scans every
  `docs/courses/**/*.steps.json` for every `anchor`, and exits non-zero when:
  - a step references an id the registry does not declare,
  - the registry declares an id no component renders,
  - a component renders an id the registry does not declare.

  Wired into `npm test`, so it runs on every build.

Naming is `surface.element[.variant]`, lowercase dotted. The registry's `route` field records where
an anchor is reachable, which is what lets the runtime navigate before hunting for it.

**This script is the entire justification for the courses-as-code decision.** With steps in the
database, renaming a nav link produces a clean PR diff and a tour that silently breaks in production.
With steps in the repo, the same rename fails the build and names the step it broke.

### Runtime

A tour outlives the course page — the learner leaves `/clubpm/outreach/courses/:slug/learn` and ends
up on `/clubpm/projects/:id` — so the runtime cannot mount inside the player. `App.js` gains
`<TourProvider>` inside the existing ClubPM providers, wrapping the route tree.

| File | Role |
|---|---|
| `src/clubpm/tour/TourProvider.jsx` | Active tour, step index, `useNavigate` for `route` steps, progress pings, resume |
| `src/clubpm/tour/TourOverlay.jsx` | Portal to `document.body`: scrim, spotlight, coach card, dock |
| `src/clubpm/tour/useAnchorRect.js` | Resolves `[data-tour-id]`; tracks its rect via `ResizeObserver` + scroll |
| `src/clubpm/tour/tourAnchors.js` | The frozen registry |

### The spotlight

One full-viewport `<svg>` containing a single `<path>` with `fill-rule="evenodd"`: an outer rect
covering the viewport, minus a rounded-rect subpath around the target. Extra subpaths cut additional
holes for a step's `dim` exemptions.

Chosen over the two common alternatives for specific reasons:

- **Four positioned divs** cannot do rounded corners and produce visible seams while animating.
- **`box-shadow: 0 0 0 9999px rgba(0,0,0,.6)`** on a positioned element cannot cut multiple holes and
  fights `overflow: hidden` ancestors.

`pointer-events: auto` on the path is what "greys out areas not to go to yet" actually means: the
scrim absorbs every click, and the hole is a genuine absence of geometry, so clicks over the target
land on the real app element beneath. No click-forwarding, no `elementFromPoint` trickery.

Target tracking: `scrollIntoView({ block: 'center', behavior: 'smooth' })` on step entry, then a
`ResizeObserver` on the target plus a passive scroll listener, both writing into a rect state that
the path is derived from. No `requestAnimationFrame` polling loop.

### Step model

```jsonc
{
  "id": "open-tasks-tab",
  "anchor": "project.tab.tasks",
  "title": "Open the Tasks tab",
  "body": "Every project's work lives on a board here.",
  "placement": "right",              // top | right | bottom | left | center
  "advance": { "on": "click" },
  "dim": ["nav.sidebar"],            // extra holes: visible but still blocked
  "optional": false
}
```

Four advance modes, which between them cover every step in the curriculum:

| `advance.on` | Advances when | Used for |
|---|---|---|
| `next` | The learner clicks Next in the coach card | Read-only "this is where X lives" |
| `click` | The learner clicks the spotlit element | Navigation and disclosure |
| `route` | `location.pathname` matches `advance.match` | Multi-page flows |
| `api` | A successful call matches `advance.method` + `advance.path` | "Now actually create a task" |

`api` requires **one** addition to `clubPmClient.js`: its existing shared fetch wrapper dispatches
`clubpm:api-success` with `{ method, path }` on a 2xx. Every call in the client already funnels
through that wrapper — the same one that dispatches `clubpm:reward-granted` today — so this is a
single dispatch line, not a per-endpoint change.

A step's `route` field (distinct from `advance.match`) declares where the anchor lives. On entering a
step whose `route` does not match the current location, the provider navigates there first, then
resolves the anchor.

### Failing soft is mandatory

If the anchor does not resolve within 8 seconds — the element was renamed, the route 404'd, the data
the step assumed is absent — the step **degrades** rather than hanging:

- the coach card renders with no spotlight and an honest line: "We couldn't find this on your screen."
- a **Skip this step** button appears,
- the client `POST`s a breakage report (`tourId`, `stepId`, `anchor`, `pathname`), surfaced in the
  editor's WALKTHROUGH view so authors learn about rot from data rather than from a complaint.

A learner is never trapped by a stale selector. This rule outranks step ordering: a skipped step
still counts toward `maxStepIndex`, because refusing to let someone finish a course over our own
broken selector is the worse failure.

Skip is reachable **only** from a degraded step — there is no general escape hatch, so a learner
cannot click past a tour that is working. A step marked `"optional": true` is the author-declared
version of the same idea: it renders a Skip button immediately, for steps that depend on data the
learner may not have (a project with a GitHub repo linked, say).

### The training project

`Project.trainingForMemberId String? @unique`. Non-null means "this is that member's training
project"; the column is simultaneously the flag, the ownership, and — via the unique index — the
thing that makes `ensureTrainingProject(memberId)` idempotent by construction rather than by
convention.

`backend/src/services/trainingSandboxService.ts`:

- `ensureTrainingProject(memberId)` — upsert on `trainingForMemberId`, seeding on create from a fixed
  fixture: 6 tasks spanning all four `TaskStatus` values, 2 milestones (one deliberately at-risk so
  `refreshMilestoneHealth` has something to show), 1 category blocker, 1 vault item, 1 change
  request. The learner is the only `ProjectMember`.
- `archiveTrainingProject(memberId)` — sets `status: ARCHIVED` when the course completes.
- A sweep in `scheduler.ts` (03:45, alongside the existing 03:00–03:30 cleanup crons) deletes
  training projects untouched for 30 days.

Rewards are suppressed inside a training project: `rewardService` early-returns for any task whose
project has a non-null `trainingForMemberId`, so completing a fake task cannot mint real XP or
doubloons. The course's own completion reward is the only XP the curriculum grants.

#### The exclusion sweep, stated as the risk it is

Every query that lists projects or aggregates across them must exclude training projects. This is a
checklist of call sites, not a one-line filter, and missing one puts a fake
"Constellation 101 — Training" project into the club's real reporting.

The enumerated sites, to be verified individually in the phase that does this work:

`Dashboard.jsx` project list and stats · `CoursesTab`/project pickers · `GanttView` · leaderboard
aggregation in `leaderboard.ts` · `reporting.ts` · `activityService.getProjectActivities` feeds ·
`projectContextService.buildProjectContext` (so the AI never reasons about a training project) ·
`projects.ts` `GET /api/projects` · Slack Monday digest and standup prompts in `scheduler.ts` ·
`MembersView` open-task counts · `streakService` activity credit.

### Data model

```prisma
enum CourseSectionKind {
  CONTENT
  VIDEO
  QUIZ
  SLIDES
  WALKTHROUGH   // new
}

// CourseSection
tourConfig Json?
// { tourId, entryRoute, requiresTrainingProject, stepCount }
// Same one-JSON-column idiom as videoConfig / slideConfig: every writer spreads
// the previous value so a partial save cannot drop keys it does not own.

// CourseSectionProgress
maxStepIndex Int @default(0)   // server-clamped, monotonic — mirrors maxSlideIndex

// Project
trainingForMemberId String? @unique
```

Migration is additive: one new enum value, three nullable/defaulted columns, no backfill, no existing
row changing meaning.

**Steps are not in the database.** `tourConfig.tourId` names a file under
`docs/courses/<course>/walkthroughs/<tourId>.steps.json`. The server resolves it and inlines the step
array into the learner payload **only when the section is unlocked** — the same omission rule that
already withholds `contentJson`, `videoConfig`, and `slides`. `stepCount` is denormalized onto
`tourConfig` at seed time so the completion guard does not need to read the file.

Completion, enforced in `completeSection`'s existing per-kind switch:
`maxStepIndex === tourConfig.stepCount - 1`. Byte-for-byte the shape of the SLIDES guard.

### API

```
POST   /api/outreach/courses/sections/:sid/tour-progress   { stepIndex } → clamped maxStepIndex
POST   /api/outreach/courses/sections/:sid/tour-breakage    { stepId, anchor, pathname }
GET    /api/outreach/courses/sections/:sid/tour-breakages   editor view, admin/author only
POST   /api/training-project                                 ensureTrainingProject → { projectId }
```

`tour-progress` clamps exactly as `recordSlideProgress` does: monotonic, bounded by `stepCount`,
nothing more. There is no wall-clock rule — moving through a tour quickly is moving through it
quickly, and a time gate would punish that while stopping no one.

### Learner handoff

The WALKTHROUGH section in `CoursePlayerPage` renders a **launch card**, not the tour itself: title,
step count, estimated minutes, and an honest line that the learner is about to leave the course page
and drive the real app. If `requiresTrainingProject`, launching first calls `POST /api/training-project`
and waits.

Launching writes `{ sectionId, tourId, stepIndex, returnTo }` to `sessionStorage` and starts the
provider. The dock persists across every route change. The learner may **Pause**, which collapses the
overlay to a resumable pill and leaves them free to look around; **Resume** restores the step.
Finishing the last step navigates back to `returnTo` and calls `completeSection`, landing the learner
on the next section with the usual reward envelope.

---

## Part 2 — The curriculum

One required course plus four role-gated electives: 12 walkthroughs, 10 videos, 11 quizzes.

### Constellation 101 — required, ~45 min

| Module | Sections |
|---|---|
| **M1 Landing in Constellation** | CONTENT intro · WT `first-look` (8 steps, read-only) · V01 *Why Constellation exists* 2:30 · Q01 4q |
| **M2 Projects, tasks, the board** | V02 *Anatomy of a task* 3:10 · WT `board-basics` (10) · WT `your-first-task` (12, hands-on) · Q02 6q |
| **M3 Milestones, blockers, dependencies** | CONTENT *three ways work stalls* · WT `blocked-and-unblocked` (10) · V03 *Reading milestone health* 2:40 · Q03 5q |
| **M4 XP, ranks, quests, doubloons** | SLIDES rank-ladder deck · WT `rewards-tour` (8) · Q04 4q |
| **M5 Staying in the loop** | WT `comms-tour` (9) · V04 *Constellation and Slack* 2:20 · CONTENT *where to go next* · Q05 final 8q @ 80% |

M2 is the module the whole engine exists for. `your-first-task` has the learner really create a task,
assign themselves, set priority and a due date, drag it across the board, log time, and leave a
comment — six `api`-advance steps, every one a real call against their own training project.

Modules are `sequential: true`; M1–M5 are all `isRequired: true`.

### Electives

Each is its own `Course` with its own slug, assigned by role rather than taken by everyone.

| Course | Length | Content |
|---|---|---|
| `constellation-vault-and-crs` | ~30 min | 2 modules · V05, V06 · WT `vault-checkout`, `change-request` · 2 quizzes |
| `constellation-outreach-and-blog` | ~30 min | 2 modules · V07, V08 · WT `crm-and-campaigns`, `blog-editor` · 2 quizzes |
| `constellation-admin-tools` | ~25 min | 1 module · V09 · WT `admin-tour` · 1 quiz — **admin-gated**, steps target admin-only surfaces |
| `constellation-authoring` | ~20 min | 1 module · V10 · WT `course-authoring` · 1 quiz |

`constellation-admin-tools` is the one elective whose walkthrough can be reached only by a member
whose role grants it. The launch card checks the same permission the target route does and, for a
non-admin, renders as a locked explanation rather than a launch button.

### Content home

`docs/courses/` is the single source of truth for both machine-readable and human-readable content:

```
docs/courses/
  README.md                              production status table
  ANCHORS.md                             the anchor registry, human-readable
  constellation-101/
    course.json                          modules + section order → seed input
    content/C01-what-constellation-is.md CONTENT section bodies
    slides/S01-rank-ladder.outline.md    deck outline (built externally, imported as PDF)
    videos/V01-why-constellation.md      shot list + timed, word-for-word VO
    quizzes/Q01-orientation.json         prompts, options, keys, explanations
    quizzes/README.md                    every bank, readable, for review
    walkthroughs/first-look.steps.json   step data, CI-checked against anchors
    walkthroughs/README.md               why each tour is shaped that way
  constellation-vault-and-crs/ · constellation-outreach-and-blog/
  constellation-admin-tools/ · constellation-authoring/
```

Quiz banks are written twice on purpose: the `.json` is what the seed installs, the directory's
`README.md` renders every bank in prose for review. The seed treats `.json` as authoritative and the
check script verifies that every question id appears in both, so the two cannot silently diverge.

Rationale is one `README.md` per directory rather than one note per asset. The decisions worth
recording are almost always about how two tours or two quizzes *differ*, and per-asset files
fragment exactly that.

`npm run seed:courses` reads `docs/` from the repo working tree and upserts by course slug and
section id. **It therefore cannot run from a deployed backend build**, which has no `docs/`
directory. That is deliberate: installing or updating a course is an authoring act performed from a
checkout, not a runtime operation.

The seed is idempotent and non-destructive toward learners: it upserts course, module, and section
rows, and never touches `CourseEnrollment`, `CourseSectionProgress`, or `CourseQuizAttempt`. Removing
a section from `course.json` archives it rather than deleting it, because deleting a section deletes
the progress rows of everyone who completed it.

---

## Files

| Action | File |
|---|---|
| Modify | `backend/prisma/schema.prisma` + one additive migration |
| New | `backend/src/services/trainingSandboxService.ts` |
| New | `backend/src/services/tourStepService.ts` (resolve + validate step files) |
| Modify | `backend/src/services/courseProgressService.ts` (payload, clamp, completion guard) |
| Modify | `backend/src/api/courses.ts` (3 routes), `backend/src/api/projects.ts` (1 route) |
| Modify | `backend/src/services/rewardService.ts` (suppress rewards in training projects) |
| Modify | `backend/src/slack/scheduler.ts` (30-day training sweep) |
| Modify | ~11 backend/frontend sites for the training-project exclusion sweep |
| New | `src/clubpm/tour/TourProvider.jsx`, `TourOverlay.jsx`, `useAnchorRect.js`, `tourAnchors.js` |
| New | `scripts/check-tour-anchors.js` |
| Modify | `src/App.js` (provider), `src/api/clubPmClient.js` (dispatch + methods) |
| Modify | `src/pages/ClubPM/CoursePlayerPage.jsx`, `CourseEditorPage.jsx`, `CourseSectionRail.jsx` |
| Modify | ~15 component files for `data-tour-id` attributes |
| Modify | `public/clubpm-theme.css` (scrim, coach card, dock) |
| New | `docs/courses/**` — **already written, ahead of implementation**: 5 `course.json`, 10 video scripts, 11 quiz banks, 3 content bodies, 1 deck outline, 6 `.steps.json` for Constellation 101, and 6 fully-specified elective tour outlines |
| New | `backend/scripts/seedCourses.ts` + `npm run seed:courses` |

No new npm dependencies. The overlay is SVG and CSS; the runtime is React context.

## Verification

**Unit** (pure, `npx tsx`):

- `tourStepService.test.ts` — step clamp accepts forward, rejects backward, rejects past `stepCount`;
  completion is false below the last step and true at it; a malformed step file is rejected with the
  file name in the error.
- `trainingSandboxService.test.ts` — `ensureTrainingProject` called twice yields one project; the
  fixture produces all four task statuses; reward suppression fires for a training-project task.
- `check-tour-anchors.js` — a step referencing an unknown anchor exits non-zero; a registry entry
  with no component exits non-zero.

**Build gates:** `npm run build` at root and `npx tsc --noEmit` in `backend/` (after
`npx prisma generate`) at the end of every phase.

**Manual:**

1. Launch `first-look` and confirm the scrim blocks every click outside the spotlight, and that the
   spotlit element is genuinely clickable.
2. Confirm a `route` step navigates on its own and finds its anchor after the lazy chunk loads.
3. Complete `your-first-task` end to end; confirm each `api` step advances only on a real 2xx, and
   that the created task exists in the training project and nowhere else.
4. Rename one `data-tour-id` in a component and confirm `npm test` fails naming the step.
5. Delete the anchor at runtime (devtools) and confirm the step degrades within 8s, offers Skip, and
   files a breakage report visible in the editor.
6. Pause mid-tour, navigate away, reload the page, and confirm Resume restores the same step.
7. Confirm a locked WALKTHROUGH section's learner payload carries no `tourConfig` and no steps.
8. Confirm the section will not complete before the last step and does immediately after.
9. Walk the exclusion checklist: confirm the training project appears in none of the eleven sites.
10. Complete Constellation 101 and confirm the training project is archived and course XP granted
    exactly once.
11. Re-run `npm run seed:courses` and confirm no enrollment or progress row changes.
