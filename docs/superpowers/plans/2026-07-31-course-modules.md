# Course Modules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group a course's flat section list into ordered `CourseModule`s that gate each other, with a per-module toggle for whether sections inside must be done in order.

**Architecture:** A new `CourseModule` table owns sections; `CourseSection.order` becomes order-within-module. The gate in `courseProgressService.ts` stays a pure function and grows a modules argument. Module completion is derived from section progress, never stored. One whole-tree endpoint (`PUT /:id/structure`) replaces the sections-order endpoint so a cross-module drag cannot half-apply. The editor rail becomes two-level `@dnd-kit`; the learner rail becomes an accordion whose locked modules still show a teaser.

**Tech Stack:** Prisma + PostgreSQL, Express (TypeScript, ESM — note the `.js` suffixes on relative imports), React 19, `@dnd-kit/core` + `@dnd-kit/sortable`, plain CSS custom properties.

**Spec:** `docs/superpowers/specs/2026-07-31-course-modules-design.md`

## Global Constraints

- **Migration acceptance test: nothing changes.** A course that gated a certain way before the deploy gates exactly that way after it. `sequential` and `isRequired` both default to `true` for this reason.
- **Module completion is derived, never stored.** There is no `CourseModuleProgress` table and no module reward. Do not add one.
- **The gate stays pure.** `isSectionUnlocked` and `isModuleComplete` take plain data, touch no Prisma client, and are tested with no DB.
- **Locked content stays withheld by omission, not by UI.** A locked section's `contentJson` / `videoConfig` are never serialized. Module *metadata* (title, summary, counts) is always serialized — that is the teaser — but nothing derived from locked section bodies goes into it.
- **No new section kinds.** `SLIDES` belongs to a later spec. Nothing here may special-case `kind`.
- **Backend is ESM TypeScript:** every relative import ends in `.js` (e.g. `import { prisma } from "../db/prisma.js"`).
- **CSS goes to `public/clubpm-theme.css` only**, appended at the bottom. Nothing in this feature renders outside `/clubpm/*`.
- **Run `npx prisma generate` in `backend/` after any schema change and before any `tsc` run**, or `tsc` reports phantom errors against a stale client.
- **Verification gate after every phase:** `npm run build` at repo root **and** `npx tsc --noEmit` in `backend/`. Fix all errors before the next phase.
- **Font Awesome for icons, never emoji** (`<i className="fas fa-lock" aria-hidden="true" />`).

**One spec verification item is covered manually, deliberately.** The spec lists the lexicographic
`(moduleOrder, sectionOrder)` advance among the unit tests. It ends up in `CoursePlayerPage`'s
`nextSelection` — a React callback, not a pure backend function — and the repo's frontend Jest setup
is not usable (`App.test.js` fails to resolve `react-router-dom` against a pre-existing broken `main`
field). Task 9 therefore removes the arithmetic entirely by making the server return globally sorted
sections, and Task 10's walkthrough step 6 is its acceptance test. Do not add a frontend test
framework to close this.

---

# Phase 1 — The gate and the schema

Pure logic first, so the rule is proven before any table exists.

## Task 1: Rewrite the gate as module-aware pure functions

**Files:**
- Modify: `backend/src/services/courseProgressService.ts:14-50`
- Test: `backend/src/services/courseProgressService.test.ts:28-64` (extend; do not replace the file)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  ```ts
  export type ProgressLookup =
    | Record<string, GateProgress | undefined>
    | Map<string, GateProgress | undefined>;

  export interface GateModule { id: string; order: number; isRequired: boolean; sequential: boolean; }
  export interface GateSection { id: string; moduleId: string; order: number; isRequired: boolean; }
  export interface GateProgress { status: CourseProgressStatus; }

  export function isModuleComplete(
    sections: GateSection[], progress: ProgressLookup, moduleId: string
  ): boolean;

  export function isSectionUnlocked(
    modules: GateModule[], sections: GateSection[], progress: ProgressLookup, section: GateSection
  ): boolean;
  ```
  `isSectionUnlocked`'s signature changes — it gains a leading `modules` argument and `GateSection` gains `moduleId`. Tasks 5 updates its two callers.

- [ ] **Step 1: Write the failing tests**

Replace the `isSectionUnlocked` test blocks in `backend/src/services/courseProgressService.test.ts` (lines 28 through the end of the optional-sections block, ending at the line before `// ── gradeQuestion`) with the following. Leave the file's header, `check`/`eq` helpers, and every other test block untouched.

```ts
// ── isSectionUnlocked / isModuleComplete ─────────────────────

const mod = (id: string, order: number, sequential = true, isRequired = true): GateModule =>
  ({ id, order, sequential, isRequired });
const sec = (id: string, moduleId: string, order: number, isRequired = true): GateSection =>
  ({ id, moduleId, order, isRequired });
const done = (): GateProgress => ({ status: "COMPLETED" });
const started = (): GateProgress => ({ status: "IN_PROGRESS" });

console.log("isSectionUnlocked — inside a sequential module");
{
  const modules = [mod("m1", 0)];
  const sections = [sec("a", "m1", 0), sec("b", "m1", 1), sec("c", "m1", 2)];
  const u = (s: GateSection, p: ProgressLookup = {}) => isSectionUnlocked(modules, sections, p, s);

  check("first section is always unlocked", u(sections[0]!));
  check("second is locked while the first is unstarted", !u(sections[1]!));
  check("second is locked while the first is only in progress", !u(sections[1]!, { a: started() }));
  check("second unlocks once the first is complete", u(sections[1]!, { a: done() }));
  check("third stays locked while the second is incomplete", !u(sections[2]!, { a: done() }));
  check("third unlocks once both predecessors are complete", u(sections[2]!, { a: done(), b: done() }));
  check("a Map of progress works the same as a record", u(sections[1]!, new Map([["a", done()]])));
  check("a section's own status never gates itself", u(sections[0]!, { a: started() }));
}

console.log("isSectionUnlocked — optional sections never block");
{
  const modules = [mod("m1", 0)];
  const sections = [sec("intro", "m1", 0, false), sec("safety", "m1", 1), sec("test", "m1", 2)];
  const u = (s: GateSection, p: ProgressLookup = {}) => isSectionUnlocked(modules, sections, p, s);

  check("an unstarted optional section does not block what follows", u(sections[1]!));
  check("a required section still blocks what follows", !u(sections[2]!));
  check("completing the required one unlocks the rest", u(sections[2]!, { safety: done() }));
}

console.log("isSectionUnlocked — a free-order module");
{
  const modules = [mod("m1", 0, false)];
  const sections = [sec("a", "m1", 0), sec("b", "m1", 1), sec("c", "m1", 2)];
  const u = (s: GateSection) => isSectionUnlocked(modules, sections, {}, s);

  check("every section of a free-order module is open at once", u(sections[0]!) && u(sections[1]!) && u(sections[2]!));
}

console.log("isSectionUnlocked — between modules");
{
  const modules = [mod("m1", 0), mod("m2", 1, false), mod("m3", 2)];
  const sections = [
    sec("a", "m1", 0), sec("b", "m1", 1),
    sec("c", "m2", 0), sec("d", "m2", 1),
    sec("e", "m3", 0),
  ];
  const u = (s: GateSection, p: ProgressLookup = {}) => isSectionUnlocked(modules, sections, p, s);

  check("module 2 is locked while module 1 is unfinished", !u(sections[2]!, { a: done() }));
  check(
    "finishing module 1 opens BOTH sections of the free-order module 2",
    u(sections[2]!, { a: done(), b: done() }) && u(sections[3]!, { a: done(), b: done() })
  );
  check(
    "module 3 is locked while module 2 is unfinished",
    !u(sections[4]!, { a: done(), b: done(), c: done() })
  );
  check(
    "module 3 unlocks once modules 1 and 2 are complete",
    u(sections[4]!, { a: done(), b: done(), c: done(), d: done() })
  );
}

console.log("isSectionUnlocked — modules that never gate");
{
  const optionalMod = [mod("m1", 0, true, false), mod("m2", 1)];
  const optionalSecs = [sec("a", "m1", 0), sec("b", "m2", 0)];
  check(
    "a non-required module never blocks the module after it",
    isSectionUnlocked(optionalMod, optionalSecs, {}, optionalSecs[1]!)
  );

  const allOptional = [mod("m1", 0), mod("m2", 1)];
  const allOptionalSecs = [sec("a", "m1", 0, false), sec("b", "m1", 1, false), sec("c", "m2", 0)];
  check(
    "a module whose sections are all optional never blocks",
    isSectionUnlocked(allOptional, allOptionalSecs, {}, allOptionalSecs[2]!)
  );

  const withEmpty = [mod("m1", 0), mod("m2", 1)];
  const onlyLater = [sec("c", "m2", 0)];
  check(
    "an empty module never blocks",
    isSectionUnlocked(withEmpty, onlyLater, {}, onlyLater[0]!)
  );
}

console.log("isModuleComplete");
{
  const sections = [sec("a", "m1", 0), sec("b", "m1", 1, false), sec("c", "m2", 0)];

  check("incomplete while a required section is unfinished", !isModuleComplete(sections, {}, "m1"));
  check(
    "complete once every REQUIRED section is done, optional ones ignored",
    isModuleComplete(sections, { a: done() }, "m1")
  );
  check("an empty module is vacuously complete", isModuleComplete(sections, {}, "m-none"));
  check("sections of other modules are ignored", isModuleComplete(sections, { c: done() }, "m2"));
}
```

Update the import block at the top of the file to pull in the new names:

```ts
import {
  isSectionUnlocked,
  isModuleComplete,
  gradeQuestion,
  computeScorePct,
  clampVideoProgress,
  VIDEO_BOOTSTRAP_GRACE_SEC,
  type GateModule,
  type GateSection,
  type GateProgress,
  type ProgressLookup,
  type GradableQuestion,
} from "./courseProgressService.js";
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd backend && npx tsx src/services/courseProgressService.test.ts
```

Expected: FAIL — `isModuleComplete` is not exported, and `GateModule` / `ProgressLookup` do not exist.

- [ ] **Step 3: Implement the gate**

In `backend/src/services/courseProgressService.ts`, replace the block from `export interface GateSection` through the closing brace of `isSectionUnlocked` (lines 14–50) with:

```ts
/** The minimum a section must expose for the gate to reason about it. */
export interface GateSection {
  id: string;
  moduleId: string;
  /** Order WITHIN its module — not within the course. */
  order: number;
  isRequired: boolean;
}

/** The minimum a module must expose for the gate to reason about it. */
export interface GateModule {
  id: string;
  order: number;
  isRequired: boolean;
  /** When true, sections inside must be completed in `order`. */
  sequential: boolean;
}

export interface GateProgress {
  status: CourseProgressStatus;
}

export type ProgressLookup =
  | Record<string, GateProgress | undefined>
  | Map<string, GateProgress | undefined>;

function lookup(progress: ProgressLookup, id: string): GateProgress | undefined {
  return progress instanceof Map ? progress.get(id) : progress[id];
}

/**
 * A module is complete when every *required* section in it is COMPLETED.
 *
 * A module with no required sections — including one with no sections at all —
 * is vacuously complete and therefore never gates. That is deliberate: a module
 * of optional readings must not trap anyone, and an empty module is a normal
 * mid-edit state, not an error. The editor warns about both.
 */
export function isModuleComplete(
  sections: GateSection[],
  progress: ProgressLookup,
  moduleId: string
): boolean {
  for (const s of sections) {
    if (s.moduleId !== moduleId) continue;
    if (!s.isRequired) continue;
    if (lookup(progress, s.id)?.status !== "COMPLETED") return false;
  }
  return true;
}

/**
 * A section is unlocked when BOTH hold:
 *
 *   1. Between modules (always): every *required* module with a strictly lower
 *      `order` is complete.
 *   2. Within its module (only when the module is `sequential`): every
 *      *required* section in the same module with a strictly lower `order` is
 *      COMPLETED.
 *
 * Ties on `order` do not block each other at either level.
 *
 * Pure: `modules` and `sections` are the full sets for the course, `progress`
 * maps section id → the learner's progress row (missing = NOT_STARTED).
 */
export function isSectionUnlocked(
  modules: GateModule[],
  sections: GateSection[],
  progress: ProgressLookup,
  section: GateSection
): boolean {
  const own = modules.find((m) => m.id === section.moduleId);

  // 1. Earlier required modules must be complete.
  if (own) {
    for (const m of modules) {
      if (m.id === own.id) continue;
      if (!m.isRequired) continue;
      if (m.order >= own.order) continue;
      if (!isModuleComplete(sections, progress, m.id)) return false;
    }
  }

  // 2. Earlier required siblings, only when the module is sequential.
  if (!own || own.sequential) {
    for (const s of sections) {
      if (s.id === section.id) continue;
      if (s.moduleId !== section.moduleId) continue;
      if (!s.isRequired) continue;
      if (s.order >= section.order) continue;
      if (lookup(progress, s.id)?.status !== "COMPLETED") return false;
    }
  }

  return true;
}
```

Note the `!own ||` in rule 2: a section whose module is missing from `modules` falls back to sequential, the stricter answer. Silently unlocking on bad input would be the wrong direction to fail.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd backend && npx tsx src/services/courseProgressService.test.ts
```

Expected: PASS, with a non-zero passed count and `failed = 0`. `tsc` will still report errors in `getLearnerCourse` and `isSectionUnlockedForMember` — those two callers are updated in Task 5, so do **not** run the backend build gate yet.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/courseProgressService.ts backend/src/services/courseProgressService.test.ts
git commit -m "feat(courses): module-aware gate as pure functions

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: CourseModule table + migration with backfill

**Files:**
- Modify: `backend/prisma/schema.prisma:1916-1968` (the `Course` and `CourseSection` models)
- Create: `backend/prisma/migrations/<timestamp>_course_modules/migration.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: Prisma models `CourseModule` (fields `id, courseId, order, title, summary, estimatedMinutes, isRequired, sequential, createdAt, updatedAt`, relation `sections`) and `CourseSection.moduleId` / `CourseSection.module`. Tasks 3–5 query these.

- [ ] **Step 1: Add the model to the schema**

In `backend/prisma/schema.prisma`, add to `model Course` (inside the relations block, beside `sections` and `enrollments`):

```prisma
  modules     CourseModule[]
```

Insert this new model immediately after `model Course`'s closing brace:

```prisma
model CourseModule {
  id               String   @id @default(cuid())
  courseId         String
  course           Course   @relation(fields: [courseId], references: [id], onDelete: Cascade)
  order            Int
  title            String
  // The teaser line shown on a LOCKED module. Author-written, so it is safe to
  // serialize to a learner who cannot yet open the module's sections.
  summary          String?
  estimatedMinutes Int?
  isRequired       Boolean  @default(true)
  // When false, sections inside may be completed in any order. Defaults to true
  // so migrated courses keep their pre-module behavior exactly.
  sequential       Boolean  @default(true)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  sections CourseSection[]

  // An index, NOT a unique constraint — saveStructure rewrites the whole set in
  // one transaction, which a unique constraint would force into a two-pass
  // shuffle. Same reasoning as CourseSection's.
  @@index([courseId, order])
}
```

In `model CourseSection`, add the two relation lines after `course` and change the index:

```prisma
  moduleId      String
  module        CourseModule      @relation(fields: [moduleId], references: [id], onDelete: Cascade)
```

Replace its trailing index:

```prisma
  // `order` is order WITHIN the module, not within the course.
  @@index([moduleId, order])
```

Leave `courseId` / `course` on `CourseSection` in place — dropping them would rewrite every course-scoped section query for no gain.

- [ ] **Step 2: Generate the migration file without applying it**

```bash
cd backend && npx prisma migrate dev --create-only --name course_modules
```

This writes `backend/prisma/migrations/<timestamp>_course_modules/migration.sql`. It will contain an `ALTER TABLE "CourseSection" ADD COLUMN "moduleId" TEXT NOT NULL` that **would fail on any non-empty table** — the next step fixes that.

- [ ] **Step 3: Rewrite the generated SQL to add-backfill-then-constrain**

Replace the entire contents of the generated `migration.sql` with:

```sql
-- CreateTable
CREATE TABLE "CourseModule" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "estimatedMinutes" INTEGER,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "sequential" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseModule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CourseModule_courseId_order_idx" ON "CourseModule"("courseId", "order");

ALTER TABLE "CourseModule" ADD CONSTRAINT "CourseModule_courseId_fkey"
    FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add the column nullable so the backfill has somewhere to write.
ALTER TABLE "CourseSection" ADD COLUMN "moduleId" TEXT;

-- Backfill: exactly one module per existing course, holding all of its sections
-- at their current order values. A single sequential module over the same
-- ordered list IS the pre-module rule, so gating is unchanged.
-- The id is derived from the course id rather than a cuid: it is deterministic,
-- unique (course ids are), and obvious in a debugging session.
INSERT INTO "CourseModule" ("id", "courseId", "order", "title", "isRequired", "sequential", "createdAt", "updatedAt")
SELECT 'mod_' || "id", "id", 0, 'Course content', true, true, NOW(), NOW()
FROM "Course";

UPDATE "CourseSection" SET "moduleId" = 'mod_' || "courseId";

-- Now it can be constrained.
ALTER TABLE "CourseSection" ALTER COLUMN "moduleId" SET NOT NULL;

ALTER TABLE "CourseSection" ADD CONSTRAINT "CourseSection_moduleId_fkey"
    FOREIGN KEY ("moduleId") REFERENCES "CourseModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "CourseSection_moduleId_order_idx" ON "CourseSection"("moduleId", "order");

DROP INDEX IF EXISTS "CourseSection_courseId_order_idx";
```

- [ ] **Step 4: Apply the migration and regenerate the client**

```bash
cd backend && npx prisma migrate dev && npx prisma generate
```

Expected: the migration applies cleanly. If the local DB has no courses, the backfill is a no-op — that is fine, but note it, because it means Step 5 proves nothing until you have seed data.

- [ ] **Step 5: Verify the backfill on real rows**

If the local DB has no courses, create one with two sections through the running app first, then roll back and re-apply — or simply run this check against a DB that has courses:

```bash
cd backend && npx prisma db execute --stdin <<'SQL'
SELECT c.title AS course, m.title AS module, m."sequential", count(s.id) AS sections
FROM "Course" c
JOIN "CourseModule" m ON m."courseId" = c.id
LEFT JOIN "CourseSection" s ON s."moduleId" = m.id
GROUP BY c.title, m.title, m."sequential";
SQL
```

Expected: exactly one `Course content` row per course, `sequential = true`, and a section count matching what that course had before.

- [ ] **Step 6: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(courses): CourseModule table + one-module-per-course backfill

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# Phase 2 — Service layer and API

## Task 3: Module CRUD and the whole-tree structure write

**Files:**
- Modify: `backend/src/services/courseService.ts` (types at 27-46, `createCourse` at 148, `createSection` at 202, `reorderSections` at 250)

**Interfaces:**
- Consumes: `CourseModule` / `CourseSection.moduleId` from Task 2.
- Produces:
  ```ts
  // moduleSelect is module-private (not exported) — mirrors sectionSelect.
  export class StructureMismatchError extends Error {}
  export interface CreateModuleInput { courseId: string; title: string; summary?: string | null;
    estimatedMinutes?: number | null; isRequired?: boolean; sequential?: boolean; }
  export interface UpdateModuleInput { title?: string; summary?: string | null;
    estimatedMinutes?: number | null; isRequired?: boolean; sequential?: boolean; }
  export interface StructureModule { moduleId: string; sectionIds: string[]; }

  export async function listModules(courseId: string);        // modules, sections nested, both order asc
  export async function createModule(input: CreateModuleInput);
  export async function updateModule(id: string, input: UpdateModuleInput);
  export async function deleteModule(id: string): Promise<void>;
  export async function saveStructure(courseId: string, tree: StructureModule[]);  // returns listModules()
  ```
  `CreateSectionInput` gains a required `moduleId: string`. `reorderSections` is **deleted**. Task 4 wires all of these to routes.

- [ ] **Step 1: Add the module types and select**

In `backend/src/services/courseService.ts`, add after `UpdateSectionInput` (line 46):

```ts
export interface CreateModuleInput {
  courseId: string;
  title: string;
  summary?: string | null;
  estimatedMinutes?: number | null;
  isRequired?: boolean;
  sequential?: boolean;
}

export interface UpdateModuleInput {
  title?: string;
  summary?: string | null;
  estimatedMinutes?: number | null;
  isRequired?: boolean;
  sequential?: boolean;
}

/** One module's slot in a whole-tree structure write. */
export interface StructureModule {
  moduleId: string;
  sectionIds: string[];
}

/**
 * Thrown when a structure payload is not an exact permutation of the course's
 * modules and sections. A partial payload is a client bug, not a partial
 * update — applying it would silently orphan whatever it omitted.
 */
export class StructureMismatchError extends Error {}
```

Add `moduleId: string;` to `CreateSectionInput` (it is **required** — a section cannot exist outside a module).

Add beside `sectionSelect` (line 85):

```ts
const moduleSelect = {
  id: true,
  courseId: true,
  order: true,
  title: true,
  summary: true,
  estimatedMinutes: true,
  isRequired: true,
  sequential: true,
} satisfies Prisma.CourseModuleSelect;
```

Add `moduleId: true,` to `sectionSelect`.

- [ ] **Step 2: Implement module CRUD**

Add a new section after `deleteCourse` (line 198):

```ts
// ── Modules ──────────────────────────────────────────────────

/** The authoring tree: modules in order, each with its sections in order. */
export async function listModules(courseId: string) {
  return prisma.courseModule.findMany({
    where: { courseId },
    orderBy: { order: "asc" },
    select: {
      ...moduleSelect,
      sections: { orderBy: { order: "asc" }, select: sectionSelect },
    },
  });
}

/** A new module always appends; authors reposition by dragging, not by index. */
export async function createModule(input: CreateModuleInput) {
  const last = await prisma.courseModule.findFirst({
    where: { courseId: input.courseId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  return prisma.courseModule.create({
    data: {
      courseId: input.courseId,
      order: (last?.order ?? -1) + 1,
      title: input.title,
      summary: input.summary ?? null,
      estimatedMinutes: input.estimatedMinutes ?? null,
      isRequired: input.isRequired ?? true,
      sequential: input.sequential ?? true,
    },
    select: { ...moduleSelect, sections: { orderBy: { order: "asc" }, select: sectionSelect } },
  });
}

export async function updateModule(id: string, input: UpdateModuleInput) {
  const data: Prisma.CourseModuleUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.summary !== undefined) data.summary = input.summary;
  if (input.estimatedMinutes !== undefined) data.estimatedMinutes = input.estimatedMinutes;
  if (input.isRequired !== undefined) data.isRequired = input.isRequired;
  if (input.sequential !== undefined) data.sequential = input.sequential;
  return prisma.courseModule.update({
    where: { id },
    data,
    select: { ...moduleSelect, sections: { orderBy: { order: "asc" }, select: sectionSelect } },
  });
}

/** Cascades to its sections, and through them to questions, progress and attempts. */
export async function deleteModule(id: string) {
  await prisma.courseModule.delete({ where: { id } });
}

/**
 * Rewrite the whole module/section tree for a course in one transaction.
 *
 * A nested drag produces a whole-tree state on the client anyway, and a
 * whole-set write is the only shape that cannot leave a section orphaned
 * between two modules when a cross-container drop applies half its effect.
 *
 * The payload must be an EXACT permutation of the course's modules and
 * sections — every id present exactly once, no strangers. Anything else throws
 * StructureMismatchError, which the route turns into a 400.
 */
export async function saveStructure(courseId: string, tree: StructureModule[]) {
  const [modules, sections] = await Promise.all([
    prisma.courseModule.findMany({ where: { courseId }, select: { id: true } }),
    prisma.courseSection.findMany({ where: { courseId }, select: { id: true } }),
  ]);

  const knownModules = new Set(modules.map((m) => m.id));
  const knownSections = new Set(sections.map((s) => s.id));

  const seenModules = new Set<string>();
  const seenSections = new Set<string>();
  for (const entry of tree) {
    if (!knownModules.has(entry.moduleId) || seenModules.has(entry.moduleId)) {
      throw new StructureMismatchError(`Unknown or duplicated module ${entry.moduleId}`);
    }
    seenModules.add(entry.moduleId);
    for (const sid of entry.sectionIds) {
      if (!knownSections.has(sid) || seenSections.has(sid)) {
        throw new StructureMismatchError(`Unknown or duplicated section ${sid}`);
      }
      seenSections.add(sid);
    }
  }
  if (seenModules.size !== knownModules.size || seenSections.size !== knownSections.size) {
    throw new StructureMismatchError("Structure payload must list every module and section exactly once");
  }

  const writes: Prisma.PrismaPromise<unknown>[] = [];
  tree.forEach((entry, moduleIndex) => {
    writes.push(
      prisma.courseModule.update({ where: { id: entry.moduleId }, data: { order: moduleIndex } })
    );
    entry.sectionIds.forEach((sid, sectionIndex) => {
      writes.push(
        prisma.courseSection.update({
          where: { id: sid },
          data: { moduleId: entry.moduleId, order: sectionIndex },
        })
      );
    });
  });
  await prisma.$transaction(writes);

  return listModules(courseId);
}
```

- [ ] **Step 3: Make a new course born with one module, and sections require one**

Replace the body of `createCourse` (line 148) so the module is created with the course:

```ts
export async function createCourse(input: CreateCourseInput) {
  const slug = await ensureUniqueCourseSlug(input.slug ?? input.title);
  // A course is born with one module. Without it, POST /sections could never
  // succeed on a fresh course and the editor would need an empty-state branch
  // that exists for exactly one click.
  return prisma.course.create({
    data: {
      title: input.title,
      slug,
      summary: input.summary ?? null,
      coverImageUrl: input.coverImageUrl ?? null,
      estimatedMinutes: input.estimatedMinutes ?? null,
      status: "DRAFT",
      createdById: input.createdById,
      modules: { create: { order: 0, title: "Course content" } },
    },
    include: courseInclude,
  });
}
```

Replace `createSection` (line 202) so `order` is scoped to the module:

```ts
export async function createSection(input: CreateSectionInput) {
  const last = await prisma.courseSection.findFirst({
    where: { moduleId: input.moduleId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  return prisma.courseSection.create({
    data: {
      courseId: input.courseId,
      moduleId: input.moduleId,
      order: (last?.order ?? -1) + 1,
      title: input.title,
      kind: input.kind ?? "CONTENT",
      isRequired: input.isRequired ?? true,
      contentJson: asJson(input.contentJson ?? EMPTY_DOC),
      videoConfig: (input.videoConfig ?? undefined) as Prisma.InputJsonValue | undefined,
      passThreshold: input.passThreshold ?? null,
      maxAttempts: input.maxAttempts ?? null,
    },
    select: sectionSelect,
  });
}
```

Delete `reorderSections` entirely (lines 243–283, including its doc comment) — `saveStructure` replaces it.

- [ ] **Step 4: Point getCourse at the tree**

Replace `getCourse` (line 128) so the authoring view returns modules with sections nested, and no flat `sections` array:

```ts
export async function getCourse(id: string) {
  const course = await prisma.course.findUnique({ where: { id }, include: courseInclude });
  if (!course) return null;
  // The authoring view is a tree: the rail renders it and writes it back whole.
  // The client derives its own flat list where it needs one.
  return { ...course, modules: await listModules(id) };
}
```

Leave `getCourseBySlug` as it is — it has no callers, and changing dead code adds risk without benefit.

- [ ] **Step 5: Verify it compiles**

```bash
cd backend && npx prisma generate && npx tsc --noEmit
```

Expected: errors ONLY in `backend/src/api/courses.ts` (calls `reorderSections`, omits `moduleId`) and `backend/src/services/courseProgressService.ts` (the two gate callers). Both are fixed in Tasks 4 and 5. Any error in `courseService.ts` itself must be fixed now.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/courseService.ts
git commit -m "feat(courses): module CRUD and whole-tree structure write

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Module routes

**Files:**
- Modify: `backend/src/api/courses.ts` (guards near 33, sections routes at 203-250)

**Interfaces:**
- Consumes: `listModules`, `createModule`, `updateModule`, `deleteModule`, `saveStructure`, `StructureMismatchError`, `CreateSectionInput.moduleId` from Task 3.
- Produces: routes `POST /:id/modules`, `PATCH /modules/:mid`, `DELETE /modules/:mid`, `PUT /:id/structure`. Task 6 wraps them in the client.

- [ ] **Step 1: Add a module-scoped access guard**

Add after `requireSectionAccess` (line 47):

```ts
// Same guard, entered from a module id. Returns the module or null.
async function requireModuleAccess(req: Request, res: Response, moduleId: string) {
  const mod = await prisma.courseModule.findUnique({
    where: { id: moduleId },
    include: { course: { select: { id: true, createdById: true } } },
  });
  if (!mod) {
    res.status(404).json({ error: "Module not found" });
    return null;
  }
  if (mod.course.createdById !== req.memberId && !(await isAdmin(req.memberId))) {
    res.status(403).json({ error: "Forbidden" });
    return null;
  }
  return mod;
}
```

- [ ] **Step 2: Add the module routes**

Insert immediately before the `// ── Sections ───` banner (line 201):

```ts
// ── Modules ──────────────────────────────────────────────────

coursesRouter.post("/:id/modules", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    if (!(await requireCourseAccess(req, res, id))) return;
    const { title, summary, estimatedMinutes, isRequired, sequential } = req.body as {
      title?: string;
      summary?: string | null;
      estimatedMinutes?: number | null;
      isRequired?: boolean;
      sequential?: boolean;
    };
    if (!title?.trim()) {
      res.status(400).json({ error: "title is required" });
      return;
    }
    const created = await courseService.createModule({
      courseId: id,
      title: title.trim(),
      summary,
      estimatedMinutes,
      isRequired,
      sequential,
    });
    res.status(201).json(created);
  } catch (error) {
    console.error("POST /outreach/courses/:id/modules error:", error);
    res.status(500).json({ error: "Failed to create module" });
  }
});

coursesRouter.patch("/modules/:mid", async (req: Request, res: Response) => {
  try {
    const mid = req.params.mid as string;
    if (!(await requireModuleAccess(req, res, mid))) return;
    res.json(await courseService.updateModule(mid, req.body));
  } catch (error) {
    console.error("PATCH /outreach/courses/modules/:mid error:", error);
    res.status(500).json({ error: "Failed to update module" });
  }
});

// Deletes the module AND its sections (and their questions, progress and quiz
// attempts, by cascade). The client confirms with the section count named.
coursesRouter.delete("/modules/:mid", async (req: Request, res: Response) => {
  try {
    const mid = req.params.mid as string;
    if (!(await requireModuleAccess(req, res, mid))) return;
    await courseService.deleteModule(mid);
    res.json({ ok: true });
  } catch (error) {
    console.error("DELETE /outreach/courses/modules/:mid error:", error);
    res.status(500).json({ error: "Failed to delete module" });
  }
});

// PUT /:id/structure — the whole module/section tree, one transaction. Replaces
// the old sections-order endpoint: a cross-module drag must not half-apply.
coursesRouter.put("/:id/structure", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    if (!(await requireCourseAccess(req, res, id))) return;
    const { tree } = req.body as { tree?: courseService.StructureModule[] };
    if (!Array.isArray(tree)) {
      res.status(400).json({ error: "tree must be an array" });
      return;
    }
    res.json(await courseService.saveStructure(id, tree));
  } catch (error) {
    if (error instanceof courseService.StructureMismatchError) {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error("PUT /outreach/courses/:id/structure error:", error);
    res.status(500).json({ error: "Failed to save course structure" });
  }
});
```

- [ ] **Step 3: Require moduleId on section create, and delete the order route**

In `POST /:id/sections` (line 203), add `moduleId` to the destructured body type and validate it belongs to this course:

```ts
    const { moduleId, title, kind, isRequired, videoConfig, passThreshold, maxAttempts } = req.body as {
      moduleId?: string;
      title?: string;
      kind?: CourseSectionKind;
      isRequired?: boolean;
      videoConfig?: Record<string, unknown> | null;
      passThreshold?: number | null;
      maxAttempts?: number | null;
    };
    if (!title?.trim()) {
      res.status(400).json({ error: "title is required" });
      return;
    }
    if (!moduleId?.trim()) {
      res.status(400).json({ error: "moduleId is required" });
      return;
    }
    const owns = await prisma.courseModule.findFirst({
      where: { id: moduleId, courseId: id },
      select: { id: true },
    });
    if (!owns) {
      res.status(400).json({ error: "moduleId does not belong to this course" });
      return;
    }
    const section = await courseService.createSection({
      courseId: id,
      moduleId,
      title: title.trim(),
      kind,
      isRequired,
      videoConfig,
      passThreshold,
      maxAttempts,
    });
```

Delete the whole `PUT /:id/sections/order` handler (lines 235–250, including its comment).

- [ ] **Step 4: Verify it compiles**

```bash
cd backend && npx tsc --noEmit
```

Expected: errors ONLY in `courseProgressService.ts` (the two gate callers), fixed in Task 5.

- [ ] **Step 5: Commit**

```bash
git add backend/src/api/courses.ts
git commit -m "feat(courses): module routes and whole-tree structure endpoint

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Learner payload with modules

**Files:**
- Modify: `backend/src/services/courseProgressService.ts:161-180` (`LearnerSection`), `194-300` (`getLearnerCourse`), `304-...` (`isSectionUnlockedForMember`)

**Interfaces:**
- Consumes: `isSectionUnlocked`, `isModuleComplete`, `GateModule`, `GateSection` (Task 1); the `CourseModule` table (Task 2).
- Produces:
  ```ts
  export interface LearnerModule {
    id: string; order: number; title: string; summary: string | null;
    estimatedMinutes: number | null; isRequired: boolean; sequential: boolean;
    locked: boolean; completed: boolean;
    sectionIds: string[]; completedCount: number; requiredCount: number;
  }
  ```
  `LearnerSection` gains `moduleId: string`. `getLearnerCourse`'s return gains `modules: LearnerModule[]`, and its `sections` array is sorted by `(module.order, section.order)`. Tasks 9 consumes both.

- [ ] **Step 1: Add the LearnerModule interface**

Add above `LearnerSection` (line 161):

```ts
/**
 * A module as the learner sees it. Sent in FULL even when locked — that is the
 * teaser. Every field here is either author-written (title, summary,
 * estimatedMinutes) or a count; nothing is derived from a locked section's body,
 * which is still withheld by omission on the section itself.
 */
export interface LearnerModule {
  id: string;
  order: number;
  title: string;
  summary: string | null;
  estimatedMinutes: number | null;
  isRequired: boolean;
  sequential: boolean;
  locked: boolean;
  completed: boolean;
  sectionIds: string[];
  completedCount: number;
  requiredCount: number;
}
```

Add `moduleId: string;` to `LearnerSection`, directly under `id`.

- [ ] **Step 2: Load modules and sort sections globally in getLearnerCourse**

In `getLearnerCourse`, replace the section query (around line 212) with a modules-then-sections load:

```ts
  const modules = await prisma.courseModule.findMany({
    where: { courseId: course.id },
    orderBy: { order: "asc" },
  });
  const moduleOrder = new Map(modules.map((m) => [m.id, m.order]));

  // Sorted by (module order, section order) so the player can treat array
  // position as course position — which is what makes "mark complete &
  // continue" work across a module boundary.
  const sections = (
    await prisma.courseSection.findMany({ where: { courseId: course.id } })
  ).sort((a, b) => {
    const ma = moduleOrder.get(a.moduleId) ?? 0;
    const mb = moduleOrder.get(b.moduleId) ?? 0;
    return ma !== mb ? ma - mb : a.order - b.order;
  });
```

- [ ] **Step 3: Feed the new gate signature and build the module list**

Replace the `gateSections` / `gateProgress` block and add a `gateModules` beside them:

```ts
  const gateModules: GateModule[] = modules.map((m) => ({
    id: m.id,
    order: m.order,
    isRequired: m.isRequired,
    sequential: m.sequential,
  }));
  const gateSections: GateSection[] = sections.map((s) => ({
    id: s.id,
    moduleId: s.moduleId,
    order: s.order,
    isRequired: s.isRequired,
  }));
  const gateProgress = new Map<string, GateProgress | undefined>(
    sections.map((s) => [s.id, byId.get(s.id)])
  );
```

In the `learnerSections` map, replace the `unlocked` line with:

```ts
    const unlocked = preview || isSectionUnlocked(gateModules, gateSections, gateProgress, {
      id: s.id,
      moduleId: s.moduleId,
      order: s.order,
      isRequired: s.isRequired,
    });
```

and add `moduleId: s.moduleId,` to the `out` object literal, directly under `id: s.id,`.

Then build the module list after `learnerSections`:

```ts
  const learnerModules: LearnerModule[] = modules.map((m) => {
    const own = sections.filter((s) => s.moduleId === m.id);
    // A module is locked when none of its sections is unlocked. A module with no
    // sections has nothing to open, so it reads as locked=false — consistent
    // with it never gating anything either.
    const anyOpen = own.some((s) => !learnerSections.find((ls) => ls.id === s.id)?.locked);
    return {
      id: m.id,
      order: m.order,
      title: m.title,
      summary: m.summary,
      estimatedMinutes: m.estimatedMinutes,
      isRequired: m.isRequired,
      sequential: m.sequential,
      locked: own.length > 0 && !anyOpen,
      completed: isModuleComplete(gateSections, gateProgress, m.id),
      sectionIds: own.map((s) => s.id),
      completedCount: own.filter((s) => byId.get(s.id)?.status === "COMPLETED").length,
      requiredCount: own.filter((s) => s.isRequired).length,
    };
  });
```

Add `modules: learnerModules,` to the returned object, directly above `sections: learnerSections,`.

- [ ] **Step 4: Update the second gate caller**

`isSectionUnlockedForMember` (line 304) calls `isSectionUnlocked` with the old signature. Replace its body with:

```ts
export async function isSectionUnlockedForMember(
  sectionId: string,
  memberId: string
): Promise<boolean> {
  const section = await prisma.courseSection.findUnique({
    where: { id: sectionId },
    select: { id: true, moduleId: true, order: true, isRequired: true, courseId: true },
  });
  if (!section) return false;

  const [modules, sections, enrollment] = await Promise.all([
    prisma.courseModule.findMany({
      where: { courseId: section.courseId },
      orderBy: { order: "asc" },
      select: { id: true, order: true, isRequired: true, sequential: true },
    }),
    prisma.courseSection.findMany({
      where: { courseId: section.courseId },
      select: { id: true, moduleId: true, order: true, isRequired: true },
    }),
    prisma.courseEnrollment.findUnique({
      where: { courseId_memberId: { courseId: section.courseId, memberId } },
      select: { id: true },
    }),
  ]);

  const progressRows = enrollment
    ? await prisma.courseSectionProgress.findMany({ where: { enrollmentId: enrollment.id } })
    : [];
  const byId = new Map(progressRows.map((p) => [p.sectionId, p]));

  // No sort needed here: the gate reasons about `order` fields, not array
  // position. Only the learner payload needs a globally-sorted array.
  return isSectionUnlocked(
    modules,
    sections,
    new Map(sections.map((s) => [s.id, byId.get(s.id)])),
    section
  );
}
```

- [ ] **Step 5: Verify the whole backend compiles and the unit tests still pass**

```bash
cd backend && npx prisma generate && npx tsc --noEmit && npx tsx src/services/courseProgressService.test.ts
```

Expected: `tsc` clean, tests all pass.

- [ ] **Step 6: Manual smoke test of the payload**

Start `cd backend && npm run dev`, open an existing published course's learner endpoint, and confirm:
- `modules` has one entry per module with `sectionIds` populated
- a locked module still carries `title` / `summary` / counts
- every section under a locked module has **no** `contentJson` and **no** `videoConfig` key

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/courseProgressService.ts
git commit -m "feat(courses): learner payload carries modules with locked teasers

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# Phase 3 — Editor

## Task 6: Client wrappers

**Files:**
- Modify: `src/api/clubPmClient.js:477-480`

**Interfaces:**
- Consumes: the routes from Task 4.
- Produces: `createCourseModule(courseId, data)`, `updateCourseModule(moduleId, data)`, `deleteCourseModule(moduleId)`, `saveCourseStructure(courseId, tree)`. `reorderCourseSections` is **removed**. Tasks 8 and 9 import these.

- [ ] **Step 1: Replace the section-order wrapper with the module wrappers**

Replace line 480 (`export const reorderCourseSections = …`) with:

```js
export const createCourseModule = (courseId, data)  => post(`/api/outreach/courses/${courseId}/modules`, data);
export const updateCourseModule = (moduleId, data)  => patch(`/api/outreach/courses/modules/${moduleId}`, data);
export const deleteCourseModule = (moduleId)        => del(`/api/outreach/courses/modules/${moduleId}`);
// tree: [{ moduleId, sectionIds: [] }, …] — must list EVERY module and section
// of the course exactly once, or the server 400s rather than half-applying.
export const saveCourseStructure = (courseId, tree) => put(`/api/outreach/courses/${courseId}/structure`, { tree });
```

- [ ] **Step 2: Verify nothing still imports the removed function**

```bash
cd "c:/Users/Henry/Documents/Antigravity/purduesearch.github.io" && grep -rn "reorderCourseSections" src/
```

Expected: one hit, in `src/pages/ClubPM/CourseEditorPage.jsx` — removed in Task 8. No other file.

- [ ] **Step 3: Commit**

```bash
git add src/api/clubPmClient.js
git commit -m "feat(courses): client wrappers for module CRUD and structure

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: Nested editor rail

**Files:**
- Modify: `src/components/clubpm/courses/CourseSectionRail.jsx` (whole file — `SECTION_KINDS` and `SectionRow` survive)

**Interfaces:**
- Consumes: nothing from earlier tasks (pure presentation).
- Produces: `CourseSectionRail` with a new prop contract:
  ```
  modules            [{ id, title, summary, isRequired, sequential, estimatedMinutes, sections: [] }]
  selectedId         id of the selected section OR module
  selectedKind       'section' | 'module'
  canEdit            boolean
  onSelectSection    (sectionId) => void
  onSelectModule     (moduleId) => void
  onSaveStructure    (tree) => Promise      tree = [{ moduleId, sectionIds[] }]
  onAddModule        () => Promise
  onAddSection       (moduleId, kind) => Promise
  onUpdateSection    (sectionId, patch) => Promise
  onDeleteSection    (section) => Promise
  onDeleteModule     (module) => Promise
  ```
  `SECTION_KINDS` keeps its current shape and export — `CoursePlayerPage` and `CourseEditorPage` both import it.

- [ ] **Step 1: Replace the imports and add the tree helpers**

Replace lines 1–34 with:

```jsx
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// CourseSectionKind → the badge + icon shown on each rail row. Keys match the
// Prisma enum exactly; anything unknown falls back to CONTENT so a future kind
// added server-side degrades to a readable row instead of a blank badge.
export const SECTION_KINDS = {
  CONTENT: { label: 'Content', icon: 'fas fa-align-left' },
  VIDEO:   { label: 'Video',   icon: 'fas fa-video' },
  QUIZ:    { label: 'Quiz',    icon: 'fas fa-list-check' },
};

const kindMeta = (kind) => SECTION_KINDS[kind] ?? SECTION_KINDS.CONTENT;

// Two kinds of draggable share one DndContext, so their ids are namespaced.
// Without this a module and a section could collide on id, and drag-end could
// not tell which level the user grabbed.
const modId  = (id) => `mod:${id}`;
const secId  = (id) => `sec:${id}`;
const dropId = (id) => `drop:${id}`;
const rawId  = (v) => String(v).slice(String(v).indexOf(':') + 1);
const isMod  = (v) => String(v).startsWith('mod:');
const isSec  = (v) => String(v).startsWith('sec:');
const isDrop = (v) => String(v).startsWith('drop:');

/** modules[] → the wire shape saveStructure expects. */
const toTree = (modules) =>
  modules.map((m) => ({ moduleId: m.id, sectionIds: (m.sections ?? []).map((s) => s.id) }));

function moveItem(list, from, to) {
  const next = list.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Apply a section drag to the module tree locally, so the rail can render the
 * result before the structure PUT returns. Returns a NEW modules array, or null
 * when the drag is a no-op.
 */
function moveSection(modules, activeSectionId, overId) {
  const fromModule = modules.find((m) => (m.sections ?? []).some((s) => s.id === activeSectionId));
  if (!fromModule) return null;

  const toModuleId = isDrop(overId)
    ? rawId(overId)
    : isSec(overId)
      ? modules.find((m) => (m.sections ?? []).some((s) => s.id === rawId(overId)))?.id
      : isMod(overId)
        ? rawId(overId)
        : null;
  if (!toModuleId) return null;

  const moving = fromModule.sections.find((s) => s.id === activeSectionId);
  const stripped = modules.map((m) => ({
    ...m,
    sections: (m.sections ?? []).filter((s) => s.id !== activeSectionId),
  }));
  const target = stripped.find((m) => m.id === toModuleId);
  if (!target) return null;

  // Dropping ON a section inserts at that section's position; dropping on a
  // module body (or the module header) appends.
  const index = isSec(overId)
    ? Math.max(0, target.sections.findIndex((s) => s.id === rawId(overId)))
    : target.sections.length;

  const nextSections = target.sections.slice();
  nextSections.splice(index, 0, moving);
  return stripped.map((m) => (m.id === toModuleId ? { ...m, sections: nextSections } : m));
}
```

- [ ] **Step 2: Keep SectionRow, add ModuleGroup**

Leave `SectionRow` (current lines 36–110) exactly as it is except for one change — its `useSortable` id must be namespaced:

```jsx
  } = useSortable({ id: secId(section.id), disabled: !canEdit });
```

Add after `SectionRow`:

```jsx
/**
 * One module: a draggable header plus its sections. The body is a droppable in
 * its own right so an EMPTY module is still a drop target — without that,
 * emptying a module makes it permanently unfillable by drag.
 */
function ModuleGroup({
  module: mod, expanded, selectedSectionId, isSelected, canEdit,
  onToggle, onSelectModule, onSelectSection, onUpdateSection,
  onDeleteSection, onDeleteModule, onAddSection,
}) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: modId(mod.id), disabled: !canEdit });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: dropId(mod.id) });

  const [addOpen, setAddOpen] = useState(false);
  const addRef = useRef(null);
  useEffect(() => {
    if (!addOpen) return undefined;
    const onDoc = (e) => { if (addRef.current && !addRef.current.contains(e.target)) setAddOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setAddOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [addOpen]);

  const sections = mod.sections ?? [];
  const ids = sections.map((s) => secId(s.id));
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  // Both warnings are authoring mistakes the gate treats as "never blocks".
  const warning = sections.length === 0
    ? 'This module has no sections, so it never blocks the next one.'
    : sections.every((s) => !s.isRequired)
      ? 'Every section here is optional, so this module never blocks the next one.'
      : null;

  return (
    <div ref={setNodeRef} style={style} className={`pm-course-module-group${isSelected ? ' is-selected' : ''}`}>
      <div
        className="pm-course-module-head"
        onClick={() => onSelectModule(mod.id)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectModule(mod.id); } }}
        aria-current={isSelected ? 'true' : undefined}
      >
        {canEdit && (
          <i
            className="fas fa-grip-vertical pm-course-rail-grip"
            aria-hidden="true"
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
          />
        )}
        <button
          type="button"
          className="pm-course-module-toggle"
          onClick={(e) => { e.stopPropagation(); onToggle(mod.id); }}
          aria-expanded={expanded}
          aria-label={expanded ? `Collapse ${mod.title}` : `Expand ${mod.title}`}
        >
          <i className={`fas ${expanded ? 'fa-chevron-down' : 'fa-chevron-right'}`} aria-hidden="true" />
        </button>
        <span className="pm-course-module-title" title={mod.title}>{mod.title}</span>
        <span className="pm-course-module-meta">
          {sections.length}
          {!mod.sequential && <span className="cpm-tag">any order</span>}
          {!mod.isRequired && <span className="cpm-tag">optional</span>}
        </span>
        {warning && (
          <i
            className="fas fa-triangle-exclamation pm-course-module-warn"
            title={warning}
            aria-label={warning}
          />
        )}
        {canEdit && (
          <span className="pm-course-module-actions">
            <span className="pm-course-rail-add-wrap" ref={addRef}>
              <button
                type="button"
                className="pm-course-rail-add"
                onClick={(e) => { e.stopPropagation(); setAddOpen((o) => !o); }}
                aria-haspopup="menu"
                aria-expanded={addOpen}
                aria-label={`Add a section to ${mod.title}`}
                title="Add a section to this module"
              >
                <i className="fas fa-plus" aria-hidden="true" />
              </button>
              {addOpen && (
                <div className="pm-course-rail-add-pop" role="menu">
                  {Object.entries(SECTION_KINDS).map(([kind, meta]) => (
                    <button
                      key={kind}
                      type="button"
                      role="menuitem"
                      onClick={(e) => { e.stopPropagation(); setAddOpen(false); onAddSection(mod.id, kind); }}
                    >
                      <i className={meta.icon} aria-hidden="true" /> {meta.label}
                    </button>
                  ))}
                </div>
              )}
            </span>
            <button
              type="button"
              className="pm-course-rail-del"
              onClick={(e) => { e.stopPropagation(); onDeleteModule(mod); }}
              title="Delete module"
              aria-label={`Delete module ${mod.title}`}
            >
              <i className="fas fa-trash" aria-hidden="true" />
            </button>
          </span>
        )}
      </div>

      {expanded && (
        <div
          ref={setDropRef}
          className={`pm-course-module-body${isOver ? ' is-over' : ''}`}
        >
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            {sections.length === 0 ? (
              <p className="pm-course-module-empty">
                Empty{canEdit ? ' — drag a section here, or use +' : ''}
              </p>
            ) : sections.map((section) => (
              <SectionRow
                key={section.id}
                section={section}
                isSelected={section.id === selectedSectionId}
                canEdit={canEdit}
                onSelect={onSelectSection}
                onToggleRequired={(s) => onUpdateSection?.(s.id, { isRequired: !s.isRequired })}
                onDelete={onDeleteSection}
              />
            ))}
          </SortableContext>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Replace the default export**

Replace the current default export (lines 112–221) with:

```jsx
/**
 * Two-level course structure: modules in order, each holding its sections.
 *
 * One DndContext drives both levels. Module ids and section ids are namespaced
 * (`mod:` / `sec:`) so drag-end can tell which level was grabbed, and each
 * module body is a `drop:` droppable so an empty module remains a drop target.
 *
 * Every drag produces the WHOLE tree and hands it to `onSaveStructure` — the
 * server rejects anything less, deliberately, so a cross-module move cannot
 * half-apply.
 */
export default function CourseSectionRail({
  modules = [],
  selectedId,
  selectedKind = 'section',
  canEdit = false,
  onSelectSection,
  onSelectModule,
  onSaveStructure,
  onAddModule,
  onAddSection,
  onUpdateSection,
  onDeleteSection,
  onDeleteModule,
}) {
  // Collapsed by default except the module holding the selection — a six-module
  // course otherwise makes a rail taller than the viewport.
  const [expanded, setExpanded] = useState(() => new Set());

  const selectedModuleId = useMemo(() => {
    if (selectedKind === 'module') return selectedId;
    return modules.find((m) => (m.sections ?? []).some((s) => s.id === selectedId))?.id ?? null;
  }, [modules, selectedId, selectedKind]);

  useEffect(() => {
    if (selectedModuleId) setExpanded((prev) => new Set(prev).add(selectedModuleId));
  }, [selectedModuleId]);

  const toggle = useCallback((moduleId) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) next.delete(moduleId); else next.add(moduleId);
      return next;
    });
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const moduleIds = useMemo(() => modules.map((m) => modId(m.id)), [modules]);

  const handleDragEnd = useCallback((event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    if (isMod(active.id)) {
      // Module reorder. Dropping a module onto a section means "onto that
      // section's module", which is the only sane reading of that gesture.
      const overModuleId = isMod(over.id) ? rawId(over.id)
        : isDrop(over.id) ? rawId(over.id)
        : modules.find((m) => (m.sections ?? []).some((s) => s.id === rawId(over.id)))?.id;
      if (!overModuleId) return;
      const from = modules.findIndex((m) => m.id === rawId(active.id));
      const to = modules.findIndex((m) => m.id === overModuleId);
      if (from < 0 || to < 0 || from === to) return;
      onSaveStructure?.(toTree(moveItem(modules, from, to)));
      return;
    }

    if (isSec(active.id)) {
      const next = moveSection(modules, rawId(active.id), over.id);
      if (next) onSaveStructure?.(toTree(next));
    }
  }, [modules, onSaveStructure]);

  return (
    <aside className="pm-course-rail" aria-label="Course structure">
      <div className="pm-course-rail-head">
        <span className="pm-course-rail-heading">Structure</span>
        {canEdit && (
          <button
            type="button"
            className="pm-course-rail-add"
            onClick={() => onAddModule?.()}
            title="Add a module"
            aria-label="Add a module"
          >
            <i className="fas fa-plus" aria-hidden="true" />
          </button>
        )}
      </div>

      {modules.length === 0 ? (
        <p className="pm-course-rail-empty">
          No modules yet.{canEdit ? ' Use + to add the first one.' : ''}
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={moduleIds} strategy={verticalListSortingStrategy}>
            <div className="pm-course-rail-list">
              {modules.map((mod) => (
                <ModuleGroup
                  key={mod.id}
                  module={mod}
                  expanded={expanded.has(mod.id)}
                  isSelected={selectedKind === 'module' && mod.id === selectedId}
                  selectedSectionId={selectedKind === 'section' ? selectedId : null}
                  canEdit={canEdit}
                  onToggle={toggle}
                  onSelectModule={onSelectModule}
                  onSelectSection={onSelectSection}
                  onUpdateSection={onUpdateSection}
                  onDeleteSection={onDeleteSection}
                  onDeleteModule={onDeleteModule}
                  onAddSection={onAddSection}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </aside>
  );
}
```

- [ ] **Step 4: Verify it compiles**

```bash
cd "c:/Users/Henry/Documents/Antigravity/purduesearch.github.io" && npm run build
```

Expected: FAIL — `CourseEditorPage.jsx` still passes the old props and imports `reorderCourseSections`. That is Task 8. No error may originate inside `CourseSectionRail.jsx` itself.

- [ ] **Step 5: Commit**

```bash
git add src/components/clubpm/courses/CourseSectionRail.jsx
git commit -m "feat(courses): two-level editor rail with cross-module drag

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: Module settings panel + editor wiring

**Files:**
- Create: `src/components/clubpm/courses/CourseModuleSettings.jsx`
- Modify: `src/pages/ClubPM/CourseEditorPage.jsx` (imports at 6-15, state at 109-120, load at 168-183, rail handlers at 271-329, render at 449-540)

**Interfaces:**
- Consumes: `createCourseModule` / `updateCourseModule` / `deleteCourseModule` / `saveCourseStructure` (Task 6); the rail prop contract (Task 7); `GET /:id` returning `modules` (Task 3).
- Produces: nothing consumed downstream.

- [ ] **Step 1: Write CourseModuleSettings.jsx**

```jsx
import React, { useEffect, useState } from 'react';

/**
 * The module's authoring surface, shown in the main column when a module header
 * is selected — the same slot CONTENT / VIDEO / QUIZ switch into.
 *
 * Text fields commit on blur, toggles commit immediately. The page's debounced
 * autosave owns section titles and prose; module fields are not part of it, so
 * they save themselves.
 */
export default function CourseModuleSettings({ module: mod, canEdit, onUpdate, sectionCount }) {
  const [title, setTitle] = useState(mod.title ?? '');
  const [summary, setSummary] = useState(mod.summary ?? '');
  // Kept as a string so an emptied input round-trips to null rather than NaN.
  const [minutes, setMinutes] = useState(mod.estimatedMinutes == null ? '' : String(mod.estimatedMinutes));

  useEffect(() => {
    setTitle(mod.title ?? '');
    setSummary(mod.summary ?? '');
    setMinutes(mod.estimatedMinutes == null ? '' : String(mod.estimatedMinutes));
  }, [mod.id, mod.title, mod.summary, mod.estimatedMinutes]);

  const commit = (patch) => { if (canEdit) onUpdate(mod.id, patch); };

  const allOptional = sectionCount > 0 && (mod.sections ?? []).every((s) => !s.isRequired);

  return (
    <div className="pm-course-module-settings">
      <label className="cpm-form-label" htmlFor={`mod-title-${mod.id}`}>Module title</label>
      <input
        id={`mod-title-${mod.id}`}
        className="cpm-form-input"
        value={title}
        disabled={!canEdit}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => { if (title.trim() && title !== mod.title) commit({ title: title.trim() }); }}
      />

      <label className="cpm-form-label" htmlFor={`mod-summary-${mod.id}`}>
        Summary <span className="pm-course-module-hint">Shown to learners even while this module is locked.</span>
      </label>
      <textarea
        id={`mod-summary-${mod.id}`}
        className="cpm-form-input"
        rows={2}
        value={summary}
        disabled={!canEdit}
        onChange={(e) => setSummary(e.target.value)}
        onBlur={() => { if (summary !== (mod.summary ?? '')) commit({ summary: summary.trim() || null }); }}
      />

      <label className="cpm-form-label" htmlFor={`mod-min-${mod.id}`}>Estimated minutes</label>
      <input
        id={`mod-min-${mod.id}`}
        className="cpm-form-input"
        type="number"
        min="0"
        value={minutes}
        disabled={!canEdit}
        onChange={(e) => setMinutes(e.target.value)}
        onBlur={() => {
          const next = minutes.trim() === '' ? null : Math.max(0, parseInt(minutes, 10) || 0);
          if (next !== mod.estimatedMinutes) commit({ estimatedMinutes: next });
        }}
      />

      <div className="pm-course-module-toggles">
        <label>
          <input
            type="checkbox"
            checked={!!mod.isRequired}
            disabled={!canEdit}
            onChange={(e) => commit({ isRequired: e.target.checked })}
          />
          <span>Required — this module blocks the ones after it</span>
        </label>
        <label>
          <input
            type="checkbox"
            checked={!!mod.sequential}
            disabled={!canEdit}
            onChange={(e) => commit({ sequential: e.target.checked })}
          />
          <span>Sections must be completed in order</span>
        </label>
      </div>

      {sectionCount === 0 && (
        <p className="pm-course-module-warning">
          <i className="fas fa-triangle-exclamation" aria-hidden="true" /> This module has no sections,
          so it never blocks the next one.
        </p>
      )}
      {allOptional && (
        <p className="pm-course-module-warning">
          <i className="fas fa-triangle-exclamation" aria-hidden="true" /> Every section here is optional,
          so this module never blocks the next one.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Rework CourseEditorPage state to hold a tree**

Change the import block (lines 11–15) — swap `reorderCourseSections` for the module wrappers and add the settings component:

```jsx
import CourseModuleSettings from '../../components/clubpm/courses/CourseModuleSettings';
```
```jsx
import {
  getCourse, updateCourse, publishCourse, archiveCourse, deleteCourse,
  createCourseSection, updateCourseSection, deleteCourseSection,
  createCourseModule, updateCourseModule, deleteCourseModule, saveCourseStructure,
  getCourseCollabWsUrl,
} from '../../api/clubPmClient';
```

Replace the `sections` state (line 110) with a modules tree plus a derived flat list, and add a selection-kind flag:

```jsx
  const [modules, setModules] = useState([]);
  const [selectedSectionId, setSelectedSectionId] = useState(null);
  const [selectedModuleId, setSelectedModuleId] = useState(null);
  // 'section' | 'module' — which of the two ids above the main column follows.
  const [selectedKind, setSelectedKind] = useState('section');
```

Insert **above** the existing `selectedSection` memo (line 150) — `selectedSection` reads `sections`, and a `const` must be declared before it is read:

```jsx
  // The flat list every existing handler already reasons about, derived from the
  // tree rather than fetched separately, so the two can never disagree.
  const sections = useMemo(() => modules.flatMap((m) => m.sections ?? []), [modules]);

  const selectedModule = useMemo(
    () => modules.find((m) => m.id === selectedModuleId) ?? null,
    [modules, selectedModuleId]
  );
```

Keep `selectedSection` itself exactly as it is — it reads from `sections`, which now derives from `modules`.

Change `hasDocument` so a module selection shows no editor and no AI panel:

```jsx
  const sectionKind = selectedSection?.kind ?? 'CONTENT';
  const hasDocument = selectedKind === 'section' && !!selectedSection && sectionKind !== 'QUIZ';
```

Update the load effect (lines 168–183) to read `c.modules`:

```jsx
        const list = c.modules ?? [];
        setModules(list);
        setSelectedSectionId((prev) => prev ?? list[0]?.sections?.[0]?.id ?? null);
```

- [ ] **Step 3: Rewrite the rail handlers**

Replace `handleAddSection`, `handleUpdateSection`, `handleDeleteSection` and `handleReorderSections` (lines 283–329) with:

```jsx
  const handleSelectSection = useCallback(async (sectionId) => {
    if (selectedKind === 'section' && sectionId === stateRef.current.sectionId) return;
    if (questionsDirty && !window.confirm('This section has unsaved questions. Leave anyway?')) return;
    if (dirty) await handleSave({ silent: true });
    setQuestionsDirty(false);
    setSelectedKind('section');
    setSelectedSectionId(sectionId);
  }, [dirty, handleSave, questionsDirty, selectedKind]);

  const handleSelectModule = useCallback(async (moduleId) => {
    if (questionsDirty && !window.confirm('This section has unsaved questions. Leave anyway?')) return;
    if (dirty) await handleSave({ silent: true });
    setQuestionsDirty(false);
    setSelectedKind('module');
    setSelectedModuleId(moduleId);
  }, [dirty, handleSave, questionsDirty]);

  const handleAddModule = useCallback(async () => {
    try {
      const created = await createCourseModule(id, { title: 'New module' });
      setModules((prev) => [...prev, { ...created, sections: created.sections ?? [] }]);
      setSelectedKind('module');
      setSelectedModuleId(created.id);
    } catch {
      toast.error('Could not add that module');
    }
  }, [id]);

  const handleUpdateModule = useCallback(async (moduleId, patch) => {
    try {
      const updated = await updateCourseModule(moduleId, patch);
      setModules((prev) => prev.map((m) => (
        m.id === moduleId ? { ...m, ...updated, sections: updated.sections ?? m.sections } : m
      )));
    } catch {
      toast.error('Could not update that module');
    }
  }, []);

  const handleDeleteModule = useCallback(async (mod) => {
    const count = (mod.sections ?? []).length;
    const detail = count === 0
      ? 'This module is empty.'
      : `This deletes ${count} section${count === 1 ? '' : 's'} and all learner progress in them.`;
    if (!window.confirm(`Delete "${mod.title}"? ${detail} This cannot be undone.`)) return;
    try {
      await deleteCourseModule(mod.id);
      setModules((prev) => prev.filter((m) => m.id !== mod.id));
      if (selectedModuleId === mod.id) { setSelectedKind('section'); setSelectedModuleId(null); }
    } catch {
      toast.error('Delete failed');
    }
  }, [selectedModuleId]);

  const handleAddSection = useCallback(async (moduleId, kind) => {
    const meta = SECTION_KINDS[kind] ?? SECTION_KINDS.CONTENT;
    try {
      const created = await createCourseSection(id, {
        moduleId, title: `New ${meta.label.toLowerCase()} section`, kind,
      });
      setModules((prev) => prev.map((m) => (
        m.id === moduleId ? { ...m, sections: [...(m.sections ?? []), created] } : m
      )));
      setSelectedKind('section');
      setSelectedSectionId(created.id);
    } catch {
      toast.error('Could not add that section');
    }
  }, [id]);

  const handleUpdateSection = useCallback(async (sectionId, patch) => {
    try {
      const updated = await updateCourseSection(sectionId, patch);
      setModules((prev) => prev.map((m) => ({
        ...m,
        sections: (m.sections ?? []).map((s) => (s.id === sectionId ? { ...s, ...updated } : s)),
      })));
    } catch {
      toast.error('Could not update that section');
    }
  }, []);

  const handleDeleteSection = useCallback(async (section) => {
    if (!window.confirm(`Delete "${section.title}" and everything in it? This cannot be undone.`)) return;
    try {
      await deleteCourseSection(section.id);
      setModules((prev) => {
        const next = prev.map((m) => ({
          ...m, sections: (m.sections ?? []).filter((s) => s.id !== section.id),
        }));
        if (section.id === stateRef.current.sectionId) {
          setSelectedSectionId(next.flatMap((m) => m.sections ?? [])[0]?.id ?? null);
        }
        return next;
      });
    } catch {
      toast.error('Delete failed');
    }
  }, []);

  // Optimistic whole-tree write, rolled back if the server rejects the payload.
  const handleSaveStructure = useCallback(async (tree) => {
    const previous = modules;
    const byId = new Map(modules.map((m) => [m.id, m]));
    const sectionById = new Map(modules.flatMap((m) => (m.sections ?? []).map((s) => [s.id, s])));
    setModules(tree.map((entry) => ({
      ...byId.get(entry.moduleId),
      sections: entry.sectionIds.map((sid) => sectionById.get(sid)).filter(Boolean),
    })));
    try {
      const fresh = await saveCourseStructure(id, tree);
      if (Array.isArray(fresh)) setModules(fresh);
    } catch {
      setModules(previous);
      toast.error('Could not save that move');
    }
  }, [id, modules]);
```

Delete the old `handleSelectSection` (lines 273–281) — it is replaced above.

- [ ] **Step 4: Rewire the render**

Replace the `<CourseSectionRail …>` call with:

```jsx
        <CourseSectionRail
          modules={modules}
          selectedId={selectedKind === 'module' ? selectedModuleId : selectedSectionId}
          selectedKind={selectedKind}
          canEdit={canEditDoc}
          onSelectSection={handleSelectSection}
          onSelectModule={handleSelectModule}
          onSaveStructure={handleSaveStructure}
          onAddModule={handleAddModule}
          onAddSection={handleAddSection}
          onUpdateSection={handleUpdateSection}
          onDeleteSection={handleDeleteSection}
          onDeleteModule={handleDeleteModule}
        />
```

In the main column, add the module branch ahead of the section branch. Replace `{selectedSection ? (` with:

```jsx
          {selectedKind === 'module' && selectedModule ? (
            <CourseModuleSettings
              key={selectedModule.id}
              module={selectedModule}
              canEdit={canEditDoc}
              onUpdate={handleUpdateModule}
              sectionCount={(selectedModule.sections ?? []).length}
            />
          ) : selectedSection ? (
```

and change the trailing empty-state text to `Add a module or section from the rail to start authoring.`

Finally, guard the AI panel at the bottom of the file — it dereferences `selectedSection.id`, which is null on a module selection:

```jsx
      {hasDocument && selectedSection && (
        <BlogAiPanel
```

- [ ] **Step 5: Verify the build passes**

```bash
cd "c:/Users/Henry/Documents/Antigravity/purduesearch.github.io" && npm run build
```

Expected: PASS with no errors. Warnings about unused imports must be resolved, not ignored.

- [ ] **Step 6: Manual walkthrough of the editor**

With `npm start` and `cd backend && npm run dev`:
1. Open an existing course — it shows one `Course content` module with every section inside.
2. Add a module; it appends. Rename it, give it a summary and 20 minutes; reload and confirm all three persisted.
3. Drag a section from module 1 into module 2. Reload; confirm it stayed.
4. Drag the last section out of a module; confirm the now-empty module still accepts a drop, shows its "Empty" line, and shows the warning icon.
5. Reorder the modules by their grips; reload and confirm.
6. Uncheck "Sections must be completed in order" on a module and confirm the `any order` chip appears in the rail.
7. Delete a module holding two sections; confirm the prompt names the count.

- [ ] **Step 7: Commit**

```bash
git add src/components/clubpm/courses/CourseModuleSettings.jsx src/pages/ClubPM/CourseEditorPage.jsx
git commit -m "feat(courses): module settings surface and tree-based editor state

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# Phase 4 — Learner view and styling

## Task 9: Accordion learner rail

**Files:**
- Modify: `src/pages/ClubPM/CoursePlayerPage.jsx:21-57` (`LearnerRail`), `90-111` (`nextSelection`)

**Interfaces:**
- Consumes: `modules[]` and globally-sorted `sections[]` from Task 5.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Fix the advance rule**

`nextSelection` uses `s.order > current.order`. `order` is now per-module, so across a module boundary that comparison is meaningless and "mark complete & continue" can land on an earlier section. The server now returns `sections` sorted by `(module.order, section.order)`, so **array position is course position** — use the index.

Replace the body of `nextSelection` (lines 90–111) with:

```jsx
  const nextSelection = useCallback((payload, { preserveSelection, advance }) => {
    const sections = payload?.sections ?? [];
    if (!sections.length) return null;

    const currentIndex = preserveSelection
      ? sections.findIndex((s) => s.id === selectedIdRef.current && !s.locked)
      : -1;

    if (currentIndex >= 0) {
      const current = sections[currentIndex];
      if (!advance) return current.id;
      // The server returns sections ordered by (module order, section order), so
      // "after this one" is simply a later array index — which is what makes
      // advancing across a module boundary land in the right place. Comparing
      // `order` here would compare two different modules' local indices.
      const onward = sections
        .slice(currentIndex + 1)
        .find((s) => !s.locked && s.status !== 'COMPLETED');
      return (onward ?? current).id;
    }

    const firstOpen = sections.find((s) => !s.locked && s.status !== 'COMPLETED');
    const resume = sections.find((s) => s.id === payload.enrollment?.lastSectionId && !s.locked);
    return (firstOpen ?? resume ?? sections.find((s) => !s.locked) ?? sections[0])?.id ?? null;
  }, []);
```

- [ ] **Step 2: Replace LearnerRail with the accordion**

Replace `LearnerRail` (lines 15–57) with:

```jsx
/**
 * The learner rail, grouped by module.
 *
 * A locked module still shows its title, summary and counts — that teaser is
 * author-written metadata the server sends deliberately. Its sections are still
 * padlocked and genuinely have nothing behind them: the server withholds
 * `contentJson` and `videoConfig` for locked sections, so this is a label for a
 * real gate, not a UI-only one.
 */
function LearnerRail({ modules, sections, selectedId, onSelect }) {
  const selectedModuleId = modules.find(
    (m) => m.sectionIds.includes(selectedId)
  )?.id ?? null;

  const [collapsed, setCollapsed] = useState(() => new Set());
  const toggle = (id) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const byId = new Map(sections.map((s) => [s.id, s]));

  return (
    <nav className="pm-course-learn-rail" aria-label="Course modules">
      {modules.map((mod, moduleIndex) => {
        // Finished modules collapse by default; the current one stays open.
        const isOpen = !collapsed.has(mod.id)
          && !mod.locked
          && (mod.id === selectedModuleId || !mod.completed);
        const own = mod.sectionIds.map((sid) => byId.get(sid)).filter(Boolean);

        return (
          <section
            key={mod.id}
            className={[
              'pm-course-learn-module',
              mod.locked ? 'is-locked' : '',
              mod.completed ? 'is-done' : '',
            ].filter(Boolean).join(' ')}
          >
            <button
              type="button"
              className="pm-course-learn-module-head"
              onClick={() => !mod.locked && toggle(mod.id)}
              disabled={mod.locked}
              aria-expanded={mod.locked ? undefined : isOpen}
            >
              <span className="pm-course-learn-module-num">{moduleIndex + 1}</span>
              <span className="pm-course-learn-module-title">{mod.title}</span>
              {mod.locked
                ? <i className="fas fa-lock" aria-hidden="true" title="Locked" />
                : mod.completed
                  ? <i className="fas fa-circle-check" aria-hidden="true" title="Completed" />
                  : <i className={`fas ${isOpen ? 'fa-chevron-down' : 'fa-chevron-right'}`} aria-hidden="true" />}
            </button>

            {/* The teaser: shown for a locked module, which has no rows to show. */}
            {mod.locked && (
              <div className="pm-course-learn-module-teaser">
                {mod.summary && <p>{mod.summary}</p>}
                <span className="cpm-tag">
                  {mod.sectionIds.length} section{mod.sectionIds.length === 1 ? '' : 's'}
                  {mod.estimatedMinutes ? ` · ${mod.estimatedMinutes} min` : ''}
                </span>
              </div>
            )}

            {!mod.locked && (
              <div className="pm-course-learn-module-meta">
                <span>{mod.completedCount} of {mod.sectionIds.length}</span>
                {!mod.sequential && <span className="cpm-tag">any order</span>}
                {!mod.isRequired && <span className="cpm-tag">Optional</span>}
              </div>
            )}

            {!mod.locked && isOpen && (
              <ol>
                {own.map((section, index) => {
                  const meta = kindMeta(section.kind);
                  const done = section.status === 'COMPLETED';
                  const locked = section.locked;
                  return (
                    <li key={section.id}>
                      <button
                        type="button"
                        className={[
                          'pm-course-learn-rail-item',
                          section.id === selectedId ? 'is-selected' : '',
                          done ? 'is-done' : '',
                          locked ? 'is-locked' : '',
                        ].filter(Boolean).join(' ')}
                        onClick={() => !locked && onSelect(section.id)}
                        disabled={locked}
                        aria-current={section.id === selectedId ? 'true' : undefined}
                        title={locked ? 'Finish the sections above to unlock this one' : section.title}
                      >
                        <span className="pm-course-learn-rail-num">{index + 1}</span>
                        <i className={meta.icon} aria-hidden="true" />
                        <span className="pm-course-learn-rail-title">{section.title}</span>
                        {locked && <i className="fas fa-lock" aria-hidden="true" title="Locked" />}
                        {!locked && done && <i className="fas fa-circle-check" aria-hidden="true" title="Completed" />}
                        {!section.isRequired && <span className="cpm-tag">Optional</span>}
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 3: Pass modules to the rail**

Add beside the `sections` memo (line 130):

```jsx
  const modules = useMemo(() => course?.modules ?? [], [course]);
```

and update the call site:

```jsx
        <LearnerRail modules={modules} sections={sections} selectedId={selectedId} onSelect={setSelectedId} />
```

- [ ] **Step 4: Verify the build passes**

```bash
cd "c:/Users/Henry/Documents/Antigravity/purduesearch.github.io" && npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/ClubPM/CoursePlayerPage.jsx
git commit -m "feat(courses): accordion learner rail with locked-module teasers

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 10: Styling and the full gate walkthrough

**Files:**
- Modify: `public/clubpm-theme.css` (append at the bottom)

**Interfaces:**
- Consumes: the class names emitted in Tasks 7–9.
- Produces: nothing.

- [ ] **Step 1: Append the styles**

Add at the very bottom of `public/clubpm-theme.css`. Use the existing ClubPM tokens (`--pm-surface`, `--pm-elevated`, `--pm-accent-teal`, `--pm-accent-amber`, `--pm-font-display`) rather than literal colors — grep an existing `pm-course-rail-*` block first and match its idiom.

```css
/* === Course modules — editor rail ========================== */

.pm-course-module-group {
  border: 1px solid var(--pm-border, rgba(255, 255, 255, 0.08));
  border-radius: 8px;
  margin-bottom: 8px;
  background: var(--pm-surface);
}
.pm-course-module-group.is-selected { border-color: var(--pm-accent-teal); }

.pm-course-module-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  cursor: pointer;
  font-family: var(--pm-font-display);
}
.pm-course-module-toggle {
  background: none;
  border: 0;
  color: inherit;
  cursor: pointer;
  padding: 2px 4px;
}
.pm-course-module-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pm-course-module-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  opacity: 0.7;
}
.pm-course-module-warn { color: var(--pm-accent-amber); }
.pm-course-module-actions { display: flex; gap: 4px; }

.pm-course-module-body {
  padding: 4px 8px 8px 22px;
  /* A real drop target even when empty — min-height is what makes an emptied
     module reachable by drag rather than permanently unfillable. */
  min-height: 34px;
  border-radius: 0 0 8px 8px;
}
.pm-course-module-body.is-over { background: rgba(0, 229, 204, 0.08); }
.pm-course-module-empty {
  margin: 0;
  padding: 6px 4px;
  font-size: 0.78rem;
  opacity: 0.55;
}

/* === Course modules — module settings ====================== */

.pm-course-module-settings { display: grid; gap: 8px; max-width: 640px; }
.pm-course-module-settings .cpm-form-label { margin-top: 6px; }
.pm-course-module-hint { font-weight: 400; opacity: 0.6; font-size: 0.78rem; }
.pm-course-module-toggles { display: grid; gap: 6px; margin-top: 8px; }
.pm-course-module-toggles label { display: flex; align-items: center; gap: 8px; }
.pm-course-module-warning {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--pm-accent-amber);
  font-size: 0.82rem;
  margin: 4px 0 0;
}

/* === Course modules — learner rail ========================= */

.pm-course-learn-module {
  border: 1px solid var(--pm-border, rgba(255, 255, 255, 0.08));
  border-radius: 8px;
  margin-bottom: 8px;
  background: var(--pm-surface);
}
.pm-course-learn-module.is-locked { opacity: 0.65; }
.pm-course-learn-module.is-done .pm-course-learn-module-head { opacity: 0.8; }

.pm-course-learn-module-head {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px;
  background: none;
  border: 0;
  color: inherit;
  cursor: pointer;
  font-family: var(--pm-font-display);
  text-align: left;
}
.pm-course-learn-module-head:disabled { cursor: default; }
.pm-course-learn-module-num { opacity: 0.6; }
.pm-course-learn-module-title { flex: 1; }

.pm-course-learn-module-teaser {
  padding: 0 10px 10px 34px;
  font-size: 0.8rem;
  opacity: 0.75;
}
.pm-course-learn-module-teaser p { margin: 0 0 6px; }
.pm-course-learn-module-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px 6px 34px;
  font-size: 0.75rem;
  opacity: 0.7;
}
.pm-course-learn-module ol {
  list-style: none;
  margin: 0;
  padding: 0 8px 8px;
}
```

- [ ] **Step 2: Full gate walkthrough**

This is the acceptance test for the whole feature. With `npm start` and `cd backend && npm run dev`, on a course with two modules:

1. **Migration fidelity.** An untouched pre-migration course still locks exactly as it did.
2. Set module 2 to free order. As a learner, finish module 1 and confirm **both** of module 2's sections open at once, in either order.
3. Set module 2 back to sequential; confirm its second section re-locks until the first is done.
4. Mark module 2 **not required**; confirm module 3 unlocks without finishing module 2.
5. Confirm a locked module shows its title, summary and counts — then open devtools, inspect the `/learn` response, and confirm **no** `contentJson` and **no** `videoConfig` on any section under it.
6. Complete the last section of a module; confirm "Mark complete & continue" lands on the **first section of the next module**, not an earlier one.
7. Make a module's sections all optional; confirm it stops gating and the editor warns.
8. Check the rail at a narrow window width — the module bodies must not overflow the rail.

- [ ] **Step 3: Final verification gate**

```bash
cd backend && npx prisma generate && npx tsc --noEmit && npx tsx src/services/courseProgressService.test.ts
cd .. && npm run build
```

Expected: all clean.

- [ ] **Step 4: Commit**

```bash
git add public/clubpm-theme.css
git commit -m "style(courses): module rail, settings and learner accordion

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```
