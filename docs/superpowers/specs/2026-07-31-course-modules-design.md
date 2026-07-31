# Course Modules — Design

## Roadmap context

This spec is the first of three that together make up the course-system upgrade. They are
sequenced so each one ships something usable and the later ones build on shapes the earlier
ones establish:

| # | Spec | Why this order |
|---|---|---|
| 1 | **Modules** (this document) | Smallest schema change; establishes the whole-tree structure write that the AI generator needs as its landing target. |
| 2 | **Slides** — deck upload, audio-linked progression, overlay questions | A new `CourseSectionKind`. Nothing in modules cares about `kind`, so it drops in without touching this work. |
| 3 | **AI course generation** from long prompts | Designed last, once it knows exactly what it may emit: a module tree of CONTENT / VIDEO / QUIZ / SLIDES sections. |

Two findings from exploration that belong to later specs but are recorded here so they are not
rediscovered:

- The Google bot account is authorized with `drive.file` only (`backend/src/api/googleAuth.ts:13`) —
  per-file access to files the app itself created. An uploaded `.pptx` / `.pdf` is therefore
  reachable; an arbitrary **Google Slides link** from a member's own Drive is not, without adding a
  scope and re-consenting the bot account. Spec 2 must decide this explicitly.
- `sectionPlan.ts` (`validateSectionPlan` / `buildDocFromPlan`) is the pattern spec 3 should follow:
  the model emits a validated high-level plan, never raw TipTap JSON, and a deterministic builder
  maps it into schema-valid nodes. The course generator is the same idea one level up — a plan of
  modules and sections rather than a plan of document sections.

## Context

Courses today are a flat, ordered list of `CourseSection` rows per `Course`. The learner gate in
`backend/src/services/courseProgressService.ts:33` already enforces strict order: a section is
unlocked only when every **required** section with a lower `order` is `COMPLETED`.

So "modules that must be completed in order" is not, at bottom, new enforcement — the enforcement
exists. What is missing is **structure**: a course of eighteen sections is one undifferentiated
ladder, in the editor rail and in the learner rail alike. Modules add a grouping the author can
name, and — as the one genuinely new capability — the option to relax ordering *inside* a group
while keeping a hard gate *between* groups.

## Decisions

| Decision | Choice |
|---|---|
| Module representation | A real `CourseModule` table. Modules are addressable, carry their own settings, and give the AI generator something to emit. |
| Intra-module ordering | Per-module `sequential` boolean, **default `true`** — so migrated courses behave exactly as they do today. |
| Module completion | **Derived** from section progress. No `CourseModuleProgress` table. |
| Module rewards (XP / doubloons) | **Out.** Considered and declined; without them there is nothing a progress row would store. |
| Module extras | `isRequired`, `estimatedMinutes`, `summary` (the locked-module teaser). |
| "Blogs" as a section type | **Nothing new.** CONTENT sections already are blog-editor documents (`BlogEditor` + Yjs, `docType: "COURSE_SECTION"`). No blog-post reference or import. |
| Editor layout | Nested rail — modules as collapsible groups in the existing left rail, two drag levels. Main column unchanged. |
| Learner layout | Accordion rail in the existing single-screen player. No separate course-map route. |
| Structure writes | One whole-tree endpoint replaces the sections-order endpoint. |

## Non-goals

- Module completion rewards, and therefore any `RewardEventType` or reward-config change.
- Any change to grading, the video clamp, the reward wiring, or the collaborative editing stack.
- Section kinds. `SLIDES` belongs to spec 2; this design must simply not obstruct it, and does not —
  the gate and the rail are `kind`-agnostic.
- `CourseProgressDashboard.jsx`. Its completion matrix stays section-columned. Grouping its column
  headers by module is a nice-to-have that blocks nothing.
- A course-map landing route for learners.

## Data model

One migration, in `backend/prisma/schema.prisma`.

```prisma
model CourseModule {
  id               String   @id @default(cuid())
  courseId         String
  course           Course   @relation(fields: [courseId], references: [id], onDelete: Cascade)
  order            Int
  title            String
  summary          String?
  estimatedMinutes Int?
  isRequired       Boolean  @default(true)
  sequential       Boolean  @default(true)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  sections CourseSection[]

  // An index, NOT a unique constraint — the structure write rewrites the whole
  // set in one transaction, which a unique constraint would force into a
  // two-pass shuffle. Same reasoning as CourseSection's existing index.
  @@index([courseId, order])
}
```

`CourseSection` changes:

- gains `moduleId String` + `module CourseModule @relation(fields: [moduleId], references: [id], onDelete: Cascade)`
- its `order` becomes **order within the module**
- its index changes from `@@index([courseId, order])` to `@@index([moduleId, order])`
- `courseId` **stays**. Dropping it would rewrite every course-scoped section query for no gain, and
  it remains the cheap path for "all sections in this course".

`Course` gains `modules CourseModule[]`.

### Migration

Three statements in one migration, and the middle one is a data backfill:

1. Create `CourseModule`; add `CourseSection.moduleId` as **nullable**.
2. For every existing course, insert exactly one module — `title: "Course content"`, `order: 0`,
   `sequential: true`, `isRequired: true`, `summary: null` — and set every one of that course's
   sections to point at it. Section `order` values are left untouched, which is what makes the
   result identical: a single sequential module over the same ordered list is the current rule.
3. Make `moduleId` non-null and add the foreign key + index; drop the old section index.

**The acceptance test for the migration is that nothing changes.** A course that gated a certain way
on the morning of the deploy gates exactly that way after it.

## The gate

`isSectionUnlocked` stays a pure function in `courseProgressService.ts` — unit-testable without a DB,
which is what its existing test file relies on. It grows a modules argument and one new sibling.

```ts
export interface GateModule {
  id: string;
  order: number;
  isRequired: boolean;
  sequential: boolean;
}

export interface GateSection {
  id: string;
  moduleId: string;
  order: number;
  isRequired: boolean;
}

/** Every required section in the module is COMPLETED. Vacuously true when it has none. */
export function isModuleComplete(
  sections: GateSection[],
  progressBySectionId: ProgressLookup,
  moduleId: string
): boolean;

export function isSectionUnlocked(
  modules: GateModule[],
  sections: GateSection[],
  progressBySectionId: ProgressLookup,
  section: GateSection
): boolean;
```

A section is unlocked when **both** hold:

1. **Between modules (always).** Every *required* module with a strictly lower `order` is complete.
2. **Within its module (only if `sequential`).** Every *required* section in the same module with a
   strictly lower `order` is `COMPLETED`.

Ties on `order` do not block each other at either level, matching the existing rule.

`ProgressLookup` is the union the current signature already accepts —
`Record<string, GateProgress | undefined> | Map<string, GateProgress | undefined>`.

### Consequences that are correct but surprising

- **A module with zero required sections is vacuously complete and never gates.** This is the right
  answer (a module of optional readings should not trap anyone), but an author who marks every
  section optional has silently built a no-op gate. The editor shows a warning on such a module.
- **An empty module never gates**, for the same reason. Empty modules are allowed — you are mid-edit
  — and flagged in the editor, not rejected by the API.
- **Module completion is derived on every read.** It is computed from the same progress rows the
  section gate already loads, so it costs no extra query, and it cannot drift from the section rows
  the way a stored aggregate can.

## API

`backend/src/api/courses.ts` + `backend/src/services/courseService.ts`.

```
POST   /api/courses/:id/modules       create  { title, summary?, estimatedMinutes?, isRequired?, sequential? }
PATCH  /api/courses/modules/:mid      update  any of those fields
DELETE /api/courses/modules/:mid      delete the module AND its sections (cascade)
PUT    /api/courses/:id/structure     [{ moduleId, sectionIds: string[] }, ...] — the whole tree
```

`POST /api/courses/:id/sections` gains a **required** `moduleId`, validated to belong to `:id`.

`GET /api/courses/:id` returns `modules[]` with their sections nested, so the editor loads one tree.

Two ordering rules that would otherwise be left to the implementer:

- **A new module appends.** `POST /modules` assigns `order = (max existing order) + 1`. Authors
  reposition by dragging, not by passing an index.
- **A new course is born with one module.** `POST /api/courses` creates the course *and* a
  `"Course content"` module at `order: 0` — the same shape the migration produces. Without this,
  every new course starts in a state where `POST /sections` cannot succeed, and the editor would
  need a special empty case that exists for one click.

`CourseModule.estimatedMinutes` and `Course.estimatedMinutes` are independent author-entered fields.
The course figure is **not** derived from the modules: partially-filled module estimates would make a
course look shorter than it is, and silently overwriting an author's course-level number is worse
than leaving two fields that can disagree.

### Why `PUT /:id/structure` replaces `PUT /:id/sections/order`

A nested drag produces a whole-tree state on the client regardless, and a whole-set write is the only
shape that cannot leave a section orphaned between two modules when a cross-container drop applies
half of its effect. The handler, in one transaction:

- rejects the payload unless the module ids are exactly this course's modules and the section ids are
  exactly this course's sections, each appearing once — a partial payload is a bug, not a
  partial update
- rewrites every module's `order` from its array position
- rewrites every section's `moduleId` and `order` from its position in the nested array

It is also, deliberately, the endpoint spec 3's generator will POST its finished tree to.

`DELETE /api/courses/modules/:mid` cascades to its sections, and through them to
`CourseSectionProgress`, `CourseQuizAttempt`, and `CourseQuestion` — exactly as deleting a section
does today. The client confirms with the section count named in the prompt.

## Learner payload

`getLearnerCourse` returns a new `modules[]` alongside the existing `sections[]`. Each entry:

```
{ id, order, title, summary, estimatedMinutes, isRequired, sequential,
  locked, completed, sectionIds[], completedCount, requiredCount }
```

**Module metadata is sent whether or not the module is locked** — that is the teaser. Section bodies
are still withheld by the existing rule (`contentJson` / `videoConfig` are attached only to unlocked
sections), so the gate is unchanged in strength. The teaser exposes only author-written module
fields; nothing derived from locked section content is included.

`LearnerSection` gains `moduleId`. Everything else about the payload is untouched.

Note the deliberate asymmetry with the editor: `GET /api/courses/:id` **nests** sections inside
modules, because the editor's job is to render and rewrite a tree. The learner payload keeps
`sections[]` **flat** and adds `modules[]` beside it, because `CoursePlayerPage` selects, resumes,
and completes by section id — nesting it would rewrite `nextSelection`, the section lookup, and the
progress bar for no benefit the rail cannot get from `moduleId` plus the module list.

## Frontend

### Editor — nested rail

`src/components/clubpm/courses/CourseSectionRail.jsx` becomes two-level:

- one `DndContext`; a `SortableContext` over the module list, plus one per module over its sections
- a droppable on each module body, so an **empty module is still a drop target** — without this,
  emptying a module makes it permanently unfillable by drag
- modules collapsed by default except the selected one; a six-module course otherwise produces a rail
  taller than the viewport
- drag ends produce the full nested array and call `PUT /:id/structure`, optimistically with rollback,
  matching how the rail already handles reorder

`ProjectDetail.jsx` already runs custom `@dnd-kit` collision detection with member chips dropping onto
task cards and blocker bins, so cross-container dropping is established ground in this codebase.

### Editor — module settings

New `src/components/clubpm/courses/CourseModuleSettings.jsx`, rendered in the main column when a
module header is selected. Fields: title, summary, estimated minutes, `isRequired`, `sequential`.
Plus the two authoring warnings — "this module has no sections" and "every section here is optional,
so this module never blocks the next one".

`CourseEditorPage.jsx`'s main-column switch gains a module case alongside `CONTENT` / `VIDEO` /
`QUIZ`. The AI panel is hidden for it — there is no document to anchor to, the same reasoning that
hides it for `QUIZ`.

### Player — accordion rail

`LearnerRail` in `CoursePlayerPage.jsx` groups by module. Completed modules collapse to a title and a
checkmark; the current module is expanded; a locked module renders title, summary, and
"N sections · M min" behind a padlock and does not open.

**One migration-induced bug to fix in the same change:** `nextSelection`
(`CoursePlayerPage.jsx:102`) advances with `s.order > current.order`. Once `order` is per-module, that
comparison is meaningless across a module boundary and "mark complete & continue" can jump backwards.
It must compare `(moduleOrder, sectionOrder)` lexicographically. This is silent if missed — it
produces a wrong-but-plausible next section, not an error.

### Client + CSS

`src/api/clubPmClient.js` gains `createCourseModule`, `updateCourseModule`, `deleteCourseModule`,
`saveCourseStructure`; `reorderCourseSections` is removed with its endpoint.

CSS appends to `public/clubpm-theme.css` only — nothing here renders outside `/clubpm/*`. New blocks:
`pm-course-module-group`, `pm-course-module-head`, `pm-course-module-settings`,
`pm-course-learn-module`, `pm-course-learn-module-locked`.

## Files

| Action | File |
|---|---|
| Modify | `backend/prisma/schema.prisma` |
| New | `backend/prisma/migrations/<ts>_course_modules/migration.sql` (create + backfill + non-null) |
| Modify | `backend/src/services/courseService.ts` (module CRUD, `saveStructure`, course-create default module) |
| Modify | `backend/src/services/courseProgressService.ts` (gate, `isModuleComplete`, learner payload) |
| Modify | `backend/src/services/courseProgressService.test.ts` |
| Modify | `backend/src/api/courses.ts` (4 routes added, `sections/order` removed, `sections` create validated) |
| New | `src/components/clubpm/courses/CourseModuleSettings.jsx` |
| Modify | `src/components/clubpm/courses/CourseSectionRail.jsx` (nested DnD) |
| Modify | `src/pages/ClubPM/CourseEditorPage.jsx` (module case in the main-column switch) |
| Modify | `src/pages/ClubPM/CoursePlayerPage.jsx` (accordion rail, lexicographic advance) |
| Modify | `src/api/clubPmClient.js` |
| Modify | `public/clubpm-theme.css` |

Roughly four phases under the ≤50-tool-call rule in `CLAUDE.md`: (1) schema + migration + gate +
tests, (2) API + client, (3) editor rail + module settings, (4) player rail + CSS. The migration and
the frontend deliberately land in different phases.

## Verification

**Unit** — new cases in the existing `backend/src/services/courseProgressService.test.ts` (pure,
`npx tsx`, no DB, no test framework):

- `sequential: true` module reproduces today's rule exactly — section 2 locked until section 1 is done
- `sequential: false` module — every section unlocked from the start, in any order
- required module N blocks every section of module N+1, in both `sequential` modes
- a non-required module never blocks the modules after it
- a module whose sections are all optional never blocks
- an empty module never blocks
- `isModuleComplete` ignores non-required sections
- lexicographic `(moduleOrder, sectionOrder)` advance picks the first section of the next module, not
  a lower-ordered section of a previous one

**Build gates** — `npm run build` at repo root, `npx tsc --noEmit` in `backend/`. Run
`npx prisma generate` before the backend check or `tsc` reports phantom errors against the stale
client.

**Manual walkthrough** (`npm start` + `cd backend && npm run dev`):

1. **Migration fidelity.** Before migrating, note the gate state of an existing multi-section course.
   Migrate. Confirm it has one "Course content" module, the same section order, and identical
   locking.
2. Create a second module, drag a section into it, reload, confirm the tree persisted.
3. Drag the last section out of a module, confirm the now-empty module is still a drop target and
   shows its warning.
4. Set module 2 to free order; as a learner, confirm both its sections are open at once and module 3
   stays locked until the required ones are done.
5. Mark module 2 non-required; confirm module 3 unlocks without finishing module 2.
6. As a learner, confirm a locked module shows its title, summary, and counts — and that devtools
   shows no `contentJson` for any of its sections.
7. Complete the last section of a module and confirm "mark complete & continue" lands on the first
   section of the next module.
8. Delete a module holding two sections; confirm the confirmation names the count and that the
   learner rail recovers.
