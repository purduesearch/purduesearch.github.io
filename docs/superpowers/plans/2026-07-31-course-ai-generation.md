# AI Course Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a long prompt (plus optional reference material and blog posts) into a DRAFT course — modules, sections, real content bodies, and real quiz questions — with the author reviewing and editing the outline before the expensive half runs.

**Architecture:** Two stages behind a `CourseGenJob` row. Stage 1 is one model call producing a validated `CoursePlan`; the author edits it; stage 2 walks the approved outline creating rows through `courseService` and generating one body per section. The client polls the job. `coursePlan.ts` is to courses what `sectionPlan.ts` is to documents: the model emits a plan, never raw TipTap JSON, and a deterministic builder turns it into schema-valid rows.

**Tech Stack:** Prisma + PostgreSQL, Express (ESM TypeScript — relative imports end in `.js`), `geminiService` (`generateJsonComplex`), React 19.

**Spec:** `docs/superpowers/specs/2026-07-31-course-ai-generation-design.md`
**Depends on:** the modules plan and the slides plan having shipped (this emits module trees and can name `SLIDES`).

## Global Constraints

- **The model never emits TipTap JSON.** It emits a validated plan; `buildDocFromPlan` turns it into nodes. Same contract `sectionPlan.ts` already enforces.
- **Caps are the cost ceiling:** ≤ 8 modules, ≤ 10 sections per module, ≤ 50 sections total, and a hard **60 model calls per job** checked in the loop.
- **Calls are sequential.** The Gemini limiter is a sliding window; parallel section calls trip it and turn a slow job into a failed one.
- **Model fallback is not failure.** `generateJsonComplex` auto-falls back to the standard model when the 25/day complex quota is spent (`geminiService.ts:42-53`). The job continues; nothing surfaces an error for it.
- **`PATCH /:jobId` re-validates.** The review screen is a convenience, not a trust boundary — a hand-built 40-module payload must be clamped server-side.
- **Every route is scoped to `req.memberId`.** Read `req.memberId`, never `req.session.memberId` — session reads are `undefined` for Bearer users.
- **Generated courses are DRAFT.** Never published, never assigned, no notifications.
- **A section's body call sees only** the course title, its module title, its own brief, and the reference material. QUIZ additionally sees its own module's generated content. Nothing else.
- **Backend is ESM TypeScript:** every relative import ends in `.js`. Run `npx prisma generate` before any `tsc`.
- **Verification gate after every phase:** `npm run build` at root **and** `npx tsc --noEmit` in `backend/`.

---

# Phase 1 — The plan schema

## Task 1: coursePlan.ts

**Files:**
- Create: `backend/src/services/coursePlan.ts`
- Create: `backend/src/services/coursePlan.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export type PlanSectionKind = "CONTENT" | "VIDEO" | "QUIZ" | "SLIDES";
  export interface PlanCourseSection {
    kind: PlanSectionKind; title: string; brief: string; isRequired?: boolean;
    questionCount?: number; passThreshold?: number; slideCount?: number;
  }
  export interface PlanCourseModule {
    title: string; summary?: string; estimatedMinutes?: number;
    isRequired?: boolean; sequential?: boolean; sections: PlanCourseSection[];
  }
  export interface CoursePlan { title: string; summary?: string; modules: PlanCourseModule[]; }
  export function validateCoursePlan(raw: unknown): CoursePlan;
  export function planSectionCount(plan: CoursePlan): number;
  export const MAX_MODULES: 8;
  export const MAX_SECTIONS_PER_MODULE: 10;
  export const MAX_TOTAL_SECTIONS: 50;
  ```
  Tasks 3 and 4 both depend on this exact shape.

- [ ] **Step 1: Write the failing tests**

Create `backend/src/services/coursePlan.test.ts`:

```ts
// Pure-logic tests for coursePlan. No DB / no network required.
// Run: cd backend && npx tsx src/services/coursePlan.test.ts
import {
  validateCoursePlan, planSectionCount,
  MAX_MODULES, MAX_SECTIONS_PER_MODULE, MAX_TOTAL_SECTIONS,
} from "./coursePlan.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}
function eq(name: string, a: unknown, b: unknown) {
  if (JSON.stringify(a) === JSON.stringify(b)) passed++;
  else { failed++; console.error(`  ✗ ${name}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); }
}

const mod = (title: string, sections: unknown[]) => ({ title, sections });
const sec = (kind: string, title = "S", brief = "b") => ({ kind, title, brief });

console.log("validateCoursePlan — shape");
{
  const plan = validateCoursePlan({
    title: "Orbital Mechanics",
    summary: "A primer",
    modules: [mod("Basics", [sec("CONTENT"), sec("QUIZ")])],
  });
  eq("keeps the title", plan.title, "Orbital Mechanics");
  eq("keeps the summary", plan.summary, "A primer");
  eq("keeps one module", plan.modules.length, 1);
  eq("keeps both sections", plan.modules[0]!.sections.length, 2);
  eq("keeps the kinds", plan.modules[0]!.sections.map((s) => s.kind), ["CONTENT", "QUIZ"]);
}

console.log("validateCoursePlan — rejection and clamping");
{
  const plan = validateCoursePlan({
    title: "T",
    modules: [mod("M", [sec("CONTENT"), sec("PODCAST"), sec("SLIDES"), { title: "no kind" }])],
  });
  eq("drops unknown kinds and kindless entries",
    plan.modules[0]!.sections.map((s) => s.kind), ["CONTENT", "SLIDES"]);

  const many = validateCoursePlan({
    title: "T",
    modules: Array.from({ length: 20 }, (_, i) => mod(`M${i}`, [sec("CONTENT")])),
  });
  eq("clamps module count", many.modules.length, MAX_MODULES);

  const wide = validateCoursePlan({
    title: "T",
    modules: [mod("M", Array.from({ length: 30 }, () => sec("CONTENT")))],
  });
  eq("clamps sections per module", wide.modules[0]!.sections.length, MAX_SECTIONS_PER_MODULE);

  const huge = validateCoursePlan({
    title: "T",
    modules: Array.from({ length: 8 }, (_, i) =>
      mod(`M${i}`, Array.from({ length: 10 }, () => sec("CONTENT")))),
  });
  check("clamps the total", planSectionCount(huge) <= MAX_TOTAL_SECTIONS);

  eq("garbage becomes an empty plan", validateCoursePlan(null).modules.length, 0);
  eq("a plan with no title still parses", validateCoursePlan({ modules: [] }).title, "Untitled course");
}

console.log("validateCoursePlan — per-kind fields");
{
  const plan = validateCoursePlan({
    title: "T",
    modules: [mod("M", [
      { kind: "QUIZ", title: "Q", brief: "b", questionCount: 900, passThreshold: 400 },
      { kind: "QUIZ", title: "Q2", brief: "b", questionCount: 0, passThreshold: -5 },
      { kind: "SLIDES", title: "S", brief: "b", slideCount: 999 },
    ])],
  });
  const [q1, q2, s] = plan.modules[0]!.sections;
  check("questionCount clamps high", (q1!.questionCount ?? 0) <= 20);
  check("questionCount clamps low", (q2!.questionCount ?? 0) >= 1);
  check("passThreshold clamps to 0-100",
    (q1!.passThreshold ?? 0) <= 100 && (q2!.passThreshold ?? 0) >= 0);
  check("slideCount clamps", (s!.slideCount ?? 0) <= 60);
}

console.log("validateCoursePlan — empty modules survive");
{
  const plan = validateCoursePlan({ title: "T", modules: [mod("Empty", []), mod("Full", [sec("CONTENT")])] });
  eq("an empty module is kept for the author to fill", plan.modules.length, 2);
  eq("planSectionCount counts only real sections", planSectionCount(plan), 1);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd backend && npx tsx src/services/coursePlan.test.ts
```

Expected: FAIL — the module does not exist.

- [ ] **Step 3: Write the validator**

Create `backend/src/services/coursePlan.ts`:

```ts
// Shared "course plan" schema for AI course generation.
//
// The model never emits Prisma rows or TipTap JSON. It emits a CoursePlan — an
// ordered tree of modules and typed section stubs, each carrying a `brief` that
// is the ONLY thing stage 2's per-section call sees. courseGenService maps every
// entry into real rows through courseService, so output is always schema-valid
// and the ordering/default rules are the same ones the editor uses.
//
// The caps here are the cost ceiling: the outline is what stands between a
// careless prompt and forty model calls.

export type PlanSectionKind = "CONTENT" | "VIDEO" | "QUIZ" | "SLIDES";

export interface PlanCourseSection {
  kind: PlanSectionKind;
  title: string;
  /** What this section must cover. Stage 2's per-section prompt is built from it. */
  brief: string;
  isRequired?: boolean;
  questionCount?: number;  // QUIZ
  passThreshold?: number;  // QUIZ
  slideCount?: number;     // SLIDES
}

export interface PlanCourseModule {
  title: string;
  summary?: string;
  estimatedMinutes?: number;
  isRequired?: boolean;
  sequential?: boolean;
  sections: PlanCourseSection[];
}

export interface CoursePlan {
  title: string;
  summary?: string;
  modules: PlanCourseModule[];
}

export const MAX_MODULES = 8;
export const MAX_SECTIONS_PER_MODULE = 10;
export const MAX_TOTAL_SECTIONS = 50;

const KINDS: readonly PlanSectionKind[] = ["CONTENT", "VIDEO", "QUIZ", "SLIDES"];

function clampStr(v: unknown, max: number): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;
}

function clampInt(v: unknown, min: number, max: number): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  return Math.max(min, Math.min(max, Math.round(v)));
}

function validateSection(raw: unknown): PlanCourseSection | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  if (!KINDS.includes(o.kind as PlanSectionKind)) return null;
  const title = clampStr(o.title, 200);
  if (!title) return null;

  const sec: PlanCourseSection = {
    kind: o.kind as PlanSectionKind,
    title,
    brief: clampStr(o.brief, 2000) ?? title,
  };
  if (typeof o.isRequired === "boolean") sec.isRequired = o.isRequired;

  if (sec.kind === "QUIZ") {
    sec.questionCount = clampInt(o.questionCount, 1, 20) ?? 5;
    sec.passThreshold = clampInt(o.passThreshold, 0, 100) ?? 80;
  }
  if (sec.kind === "SLIDES") {
    sec.slideCount = clampInt(o.slideCount, 1, 60) ?? 10;
  }
  return sec;
}

/**
 * Coerce arbitrary model JSON into a safe CoursePlan. Drops unknown kinds and
 * untitled entries, clamps every count, and enforces the module/section caps —
 * including the running total, so eight full modules cannot exceed the ceiling.
 *
 * Never throws. Garbage in yields an empty plan, which the caller reports as a
 * failed outline rather than a crash.
 */
export function validateCoursePlan(raw: unknown): CoursePlan {
  const root = (raw ?? {}) as Record<string, unknown>;
  const rawModules: unknown[] = Array.isArray(root.modules) ? root.modules : [];

  const modules: PlanCourseModule[] = [];
  let total = 0;

  for (const item of rawModules.slice(0, MAX_MODULES)) {
    const o = (item ?? {}) as Record<string, unknown>;
    const title = clampStr(o.title, 200);
    if (!title) continue;

    const mod: PlanCourseModule = { title, sections: [] };
    const summary = clampStr(o.summary, 500);
    if (summary) mod.summary = summary;
    const minutes = clampInt(o.estimatedMinutes, 0, 600);
    if (minutes !== undefined) mod.estimatedMinutes = minutes;
    if (typeof o.isRequired === "boolean") mod.isRequired = o.isRequired;
    if (typeof o.sequential === "boolean") mod.sequential = o.sequential;

    const rawSections: unknown[] = Array.isArray(o.sections) ? o.sections : [];
    for (const s of rawSections.slice(0, MAX_SECTIONS_PER_MODULE)) {
      if (total >= MAX_TOTAL_SECTIONS) break;
      const parsed = validateSection(s);
      if (!parsed) continue;
      mod.sections.push(parsed);
      total += 1;
    }

    // An empty module is KEPT — the author may be planning to fill it by hand,
    // and the modules gate treats it as never-blocking, which is safe.
    modules.push(mod);
  }

  return {
    title: clampStr(root.title, 200) ?? "Untitled course",
    ...(clampStr(root.summary, 500) ? { summary: clampStr(root.summary, 500)! } : {}),
    modules,
  };
}

/** How many sections stage 2 will actually write — the call-count estimate. */
export function planSectionCount(plan: CoursePlan): number {
  return plan.modules.reduce((n, m) => n + m.sections.length, 0);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd backend && npx tsx src/services/coursePlan.test.ts && npx tsc --noEmit
```

Expected: PASS, `0 failed`, `tsc` clean.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/coursePlan.ts backend/src/services/coursePlan.test.ts
git commit -m "feat(courses): validated CoursePlan schema for AI generation

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# Phase 2 — The job and the outline stage

## Task 2: CourseGenJob schema

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/<timestamp>_course_gen_job/migration.sql`

**Interfaces:**
- Produces: `CourseGenStatus` enum and `CourseGenJob` model. Tasks 3–5 read and write them.

- [ ] **Step 1: Add the enum and model**

Append to the courses block in `backend/prisma/schema.prisma`:

```prisma
enum CourseGenStatus {
  OUTLINING
  AWAITING_REVIEW
  GENERATING
  DONE
  FAILED
}

model CourseGenJob {
  id            String          @id @default(cuid())
  createdById   String
  createdBy     Member          @relation("CourseGenJobCreator", fields: [createdById], references: [id], onDelete: Cascade)
  status        CourseGenStatus @default(OUTLINING)
  prompt        String
  reference     String?
  sourcePostIds String[]        @default([])
  // A validated CoursePlan (see coursePlan.ts), editable by the author while
  // AWAITING_REVIEW.
  outline       Json?
  // Set once stage 2 has created the course — including on a cancelled run,
  // where the partial course is deliberately kept.
  courseId      String?
  progress      Int             @default(0)
  stepLabel     String?
  error         String?
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt

  @@index([createdById, createdAt])
}
```

Add the back-relation to `model Member`, beside its other course relations:

```prisma
  courseGenJobs CourseGenJob[] @relation("CourseGenJobCreator")
```

- [ ] **Step 2: Migrate**

```bash
cd backend && npx prisma migrate dev --name course_gen_job && npx prisma generate && npx tsc --noEmit
```

Everything is additive; the generated SQL needs no hand-editing. Read it and confirm there is no `DROP`.

- [ ] **Step 3: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(courses): CourseGenJob table for AI course generation

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: The outline stage

**Files:**
- Create: `backend/src/services/courseGenService.ts`
- Modify: `backend/src/services/aiOutreachService.ts:96,113` (export the two prompt constants)

**Interfaces:**
- Consumes: `validateCoursePlan`, `planSectionCount` (Task 1); `generateJsonComplex`, `todayContext` (`geminiService.ts`); the `CourseGenJob` model (Task 2).
- Produces:
  ```ts
  export async function startOutline(input: {
    memberId: string; prompt: string; reference?: string; sourcePostIds?: string[];
  }): Promise<{ id: string }>;
  export async function runOutline(jobId: string): Promise<void>;
  export async function getJob(jobId: string, memberId: string, isAdmin: boolean);
  export async function listJobs(memberId: string);
  export async function reviseOutline(jobId: string, memberId: string, outline: unknown);
  export async function cancelJob(jobId: string, memberId: string);
  export async function sweepStaleJobs(): Promise<number>;
  ```
  Task 4 adds `runGeneration`; Task 5 wires all of these to routes.

- [ ] **Step 1: Export the blog prompt constants**

In `backend/src/services/aiOutreachService.ts`, change `const BLOG_PLAN_SCHEMA` (line 96) and `const BLOG_PLAN_RULES` (line 113) to `export const`. Nothing else changes — the course generator reuses the exact section vocabulary the blog generator already produces good output with, rather than inventing a parallel one that drifts.

- [ ] **Step 2: Write the outline stage**

Create `backend/src/services/courseGenService.ts`:

```ts
import { prisma } from "../db/prisma.js";
import { generateJsonComplex, todayContext } from "./geminiService.js";
import { validateCoursePlan, planSectionCount, type CoursePlan } from "./coursePlan.js";
import { docToPlainText } from "./blogAiService.js";

// Stage 1 is one call and takes seconds. Stage 2 is one call per section and
// takes minutes, which is why the job lives in a table and the client polls.

/** Hard ceiling on model calls per job, checked in stage 2's loop. */
export const MAX_CALLS_PER_JOB = 60;

/** A job in OUTLINING or GENERATING older than this was killed by a restart. */
const STALE_JOB_MS = 15 * 60 * 1000;

async function loadSourcePosts(ids: string[]): Promise<string> {
  if (!ids.length) return "";
  const posts = await prisma.blogPost.findMany({
    where: { id: { in: ids.slice(0, 5) }, status: "PUBLISHED" },
    select: { title: true, contentJson: true },
  });
  return posts
    .map((p) => `### ${p.title}\n${docToPlainText(p.contentJson).slice(0, 6000)}`)
    .join("\n\n");
}

export async function startOutline(input: {
  memberId: string; prompt: string; reference?: string; sourcePostIds?: string[];
}) {
  return prisma.courseGenJob.create({
    data: {
      createdById: input.memberId,
      status: "OUTLINING",
      prompt: input.prompt.slice(0, 20000),
      reference: input.reference?.slice(0, 40000) ?? null,
      sourcePostIds: (input.sourcePostIds ?? []).slice(0, 5),
      stepLabel: "Drafting the outline…",
    },
    select: { id: true },
  });
}

/**
 * Stage 1. One model call; on success the job parks in AWAITING_REVIEW until the
 * author approves. Never throws — a failure is recorded on the row, because the
 * caller is a fire-and-forget `void` and has nowhere to report to.
 */
export async function runOutline(jobId: string): Promise<void> {
  try {
    const job = await prisma.courseGenJob.findUnique({ where: { id: jobId } });
    if (!job || job.status !== "OUTLINING") return;

    const sourceText = await loadSourcePosts(job.sourcePostIds);
    const prompt = `You design training courses for Purdue SEARCH (Students for the Exploration and Research of Space), a university engineering club.
${todayContext()}

Design a course from this brief:
${job.prompt}
${job.reference ? `\nReference material the course MUST be grounded in:\n${job.reference.slice(0, 20000)}` : ""}
${sourceText ? `\nExisting club writing to draw on:\n${sourceText}` : ""}

Return ONLY a JSON object:
{
  "title": string,
  "summary": string,
  "modules": [{
    "title": string,
    "summary": string,          // one line; shown to learners BEFORE the module unlocks
    "estimatedMinutes": number,
    "isRequired": boolean,      // false only for genuinely optional side material
    "sequential": boolean,      // false when the sections inside can be done in any order
    "sections": [{
      "kind": "CONTENT" | "VIDEO" | "QUIZ" | "SLIDES",
      "title": string,
      "brief": string,          // 1-3 sentences: exactly what this section must cover
      "isRequired": boolean,
      "questionCount": number,  // QUIZ only, 3-10
      "passThreshold": number,  // QUIZ only, usually 80
      "slideCount": number      // SLIDES only, 8-20
    }]
  }]
}

Rules:
- 3-6 modules, 2-5 sections each. Build a real progression: teach, then practise, then check.
- End most modules with a QUIZ section that tests THAT module's material.
- Use CONTENT for written material, SLIDES where a deck genuinely suits the topic, and VIDEO only
  where a recorded demonstration is the point. Do not scatter kinds for variety.
- "brief" is the single most important field: it is the only instruction the writer of that section
  will receive. Make each one specific and non-overlapping.
- Ground everything in the brief and the reference material. Do NOT invent facts, numbers, names,
  partnerships, or club history.
- Avoid filler adjectives ("cutting-edge", "comprehensive", "exciting").`;

    const raw = await generateJsonComplex<unknown>(prompt, undefined, { maxOutputTokens: 8192 });
    const plan = validateCoursePlan(raw);

    if (!plan.modules.length || planSectionCount(plan) === 0) {
      await prisma.courseGenJob.update({
        where: { id: jobId },
        data: { status: "FAILED", error: "The model did not return a usable outline — try a more specific brief" },
      });
      return;
    }

    await prisma.courseGenJob.update({
      where: { id: jobId },
      data: {
        status: "AWAITING_REVIEW",
        outline: plan as unknown as object,
        progress: 0,
        stepLabel: `Outline ready — ${plan.modules.length} modules, ${planSectionCount(plan)} sections`,
      },
    });
  } catch (err) {
    console.error("[courseGen] runOutline error:", err);
    await prisma.courseGenJob.update({
      where: { id: jobId },
      data: { status: "FAILED", error: "Outline generation failed — try again in a minute" },
    }).catch(() => {});
  }
}

function assertOwner(job: { createdById: string } | null, memberId: string, isAdmin: boolean) {
  if (!job) return false;
  return job.createdById === memberId || isAdmin;
}

export async function getJob(jobId: string, memberId: string, isAdmin: boolean) {
  const job = await prisma.courseGenJob.findUnique({ where: { id: jobId } });
  return assertOwner(job, memberId, isAdmin) ? job : null;
}

export async function listJobs(memberId: string) {
  return prisma.courseGenJob.findMany({
    where: { createdById: memberId },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
}

/**
 * Replace the outline with the author's edited version. Re-validates: the review
 * screen is a convenience, not a trust boundary, and a hand-built request must
 * not be able to smuggle in a 40-module plan.
 */
export async function reviseOutline(jobId: string, memberId: string, outline: unknown) {
  const job = await prisma.courseGenJob.findUnique({ where: { id: jobId } });
  if (!job || job.createdById !== memberId) return null;
  if (job.status !== "AWAITING_REVIEW") return null;
  const plan = validateCoursePlan(outline);
  return prisma.courseGenJob.update({
    where: { id: jobId },
    data: { outline: plan as unknown as object },
  });
}

export async function cancelJob(jobId: string, memberId: string) {
  const job = await prisma.courseGenJob.findUnique({ where: { id: jobId } });
  if (!job || job.createdById !== memberId) return null;
  if (job.status === "DONE") return job;
  // Stage 2 checks status between sections and stops. Sections already written
  // stay — a partial draft is more useful than deleting the author's work.
  return prisma.courseGenJob.update({
    where: { id: jobId },
    data: { status: "FAILED", error: "Cancelled" },
  });
}

/**
 * Jobs run in the API process, so a restart abandons anything in flight. Sweep
 * them to FAILED at startup rather than leaving a spinner that never resolves.
 */
export async function sweepStaleJobs(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_JOB_MS);
  const { count } = await prisma.courseGenJob.updateMany({
    where: { status: { in: ["OUTLINING", "GENERATING"] }, updatedAt: { lt: cutoff } },
    data: { status: "FAILED", error: "Interrupted by a server restart — start a new generation" },
  });
  return count;
}
```

- [ ] **Step 3: Verify it compiles**

```bash
cd backend && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/courseGenService.ts backend/src/services/aiOutreachService.ts
git commit -m "feat(courses): AI outline stage and job lifecycle

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# Phase 3 — Body generation

## Task 4: The generation loop

**Files:**
- Modify: `backend/src/services/courseGenService.ts` (append)

**Interfaces:**
- Consumes: `courseService.createCourse` / `createModule` / `createSection` / `updateSection` / `replaceQuestions`; `buildDocFromPlan`, `validateSectionPlan` (`sectionPlan.ts`); `BLOG_PLAN_SCHEMA`, `BLOG_PLAN_RULES` (Task 3 Step 1); `docToPlainText`.
- Produces: `export async function runGeneration(jobId: string): Promise<void>`. Task 5 calls it.

- [ ] **Step 1: Add the per-section generators**

First add these to the **import block at the top** of `courseGenService.ts` — not to the bottom of
the file, where they would be hoisted but unreadable:

```ts
import * as courseService from "./courseService.js";
import { buildDocFromPlan, validateSectionPlan } from "./sectionPlan.js";
import { BLOG_PLAN_SCHEMA, BLOG_PLAN_RULES } from "./aiOutreachService.js";
import { EMPTY_DOC, markdownToTiptapJson } from "./blogRender.js";
import type { PlanCourseSection } from "./coursePlan.js";
```

Then append the generators to the end of the file:

```ts
interface SectionContext {
  courseTitle: string;
  moduleTitle: string;
  reference: string;
}

/** CONTENT — the blog generator pointed at a section brief. */
async function generateContentBody(sec: PlanCourseSection, ctx: SectionContext) {
  const prompt = `You are writing one section of a training course for Purdue SEARCH, a university engineering club.
${todayContext()}

Course: ${ctx.courseTitle}
Module: ${ctx.moduleTitle}
Section: ${sec.title}
This section must cover: ${sec.brief}
${ctx.reference ? `\nReference material to ground this in:\n${ctx.reference.slice(0, 12000)}` : ""}

${BLOG_PLAN_SCHEMA}

Compose the section:
- Do NOT open with a hero — this is a section inside a course, not a standalone article.
- Open with a short richText intro, then develop 3-5 body sections (~450-700 words total).
- Teach concretely: name the specific concepts, steps, or components a learner must come away with.
- Use a callout for anything safety-critical or easy to get wrong.
- Do NOT end with a social-media CTA.

${BLOG_PLAN_RULES}`;

  const raw = await generateJsonComplex<unknown>(prompt, undefined, { maxOutputTokens: 8192 });
  const plan = raw ? validateSectionPlan(raw) : { sections: [] };
  // Never leave a section empty: an author would rather edit thin prose than
  // stare at a blank editor wondering whether generation ran.
  if (!plan.sections.length) {
    return markdownToTiptapJson(`## ${sec.title}\n\n${sec.brief}`);
  }
  return buildDocFromPlan(plan);
}

/** SLIDES — a slide outline as prose. No CourseSlide rows: there is no deck. */
async function generateSlideOutline(sec: PlanCourseSection, ctx: SectionContext) {
  const count = sec.slideCount ?? 10;
  const prompt = `You are outlining a slide deck for one section of a Purdue SEARCH training course.
${todayContext()}

Course: ${ctx.courseTitle}
Module: ${ctx.moduleTitle}
Section: ${sec.title}
The deck must cover: ${sec.brief}
${ctx.reference ? `\nReference material:\n${ctx.reference.slice(0, 8000)}` : ""}

Return ONLY a JSON object: { "slides": [{ "title": string, "bullets": string[], "notes": string }] }
- Exactly ${count} slides.
- 2-5 short bullets per slide. Bullets are phrases, not paragraphs.
- "notes" is what the presenter says for that slide: 2-3 sentences.
- Ground everything in the brief and reference. Do NOT invent facts or numbers.`;

  const raw = await generateJsonComplex<{ slides?: { title?: string; bullets?: string[]; notes?: string }[] }>(
    prompt, undefined, { maxOutputTokens: 8192 }
  );
  const slides = Array.isArray(raw?.slides) ? raw!.slides!.slice(0, 60) : [];
  if (!slides.length) return markdownToTiptapJson(`## ${sec.title}\n\n${sec.brief}`);

  const md = [
    `## Slide outline — ${sec.title}`,
    "",
    "*Build this deck, then import it in the Slides workbench.*",
    "",
    ...slides.flatMap((s, i) => [
      `### ${i + 1}. ${(s.title ?? "Untitled slide").slice(0, 200)}`,
      ...(s.bullets ?? []).slice(0, 8).map((b) => `- ${String(b).slice(0, 300)}`),
      s.notes ? `\n> **Speaker notes:** ${String(s.notes).slice(0, 800)}` : "",
      "",
    ]),
  ].join("\n");
  return markdownToTiptapJson(md);
}

/** QUIZ — grounded in the content THIS module just produced. */
async function generateQuizQuestions(
  sec: PlanCourseSection, ctx: SectionContext, moduleContent: string
) {
  const count = sec.questionCount ?? 5;
  const prompt = `You are writing a quiz for one module of a Purdue SEARCH training course.
${todayContext()}

Course: ${ctx.courseTitle}
Module: ${ctx.moduleTitle}
This quiz must test: ${sec.brief}

The module's teaching material (test ONLY what this covers):
${moduleContent.slice(0, 16000)}

Return ONLY a JSON object:
{ "questions": [{
    "prompt": string,
    "kind": "SINGLE" | "MULTI" | "TRUE_FALSE",
    "explanation": string,
    "points": number,
    "answers": [{ "text": string, "isCorrect": boolean }]
}] }

Rules:
- Exactly ${count} questions.
- SINGLE has exactly one correct answer among 4 options. MULTI has 2-3 correct among 5.
  TRUE_FALSE has exactly the two options "True" and "False", one correct.
- Every question MUST be answerable from the material above. Do not test outside it.
- "explanation" says why the right answer is right, in one or two sentences.
- Wrong options must be plausible, not filler. No "none of the above".
- points is 1 unless a question is genuinely harder, then 2.`;

  const raw = await generateJsonComplex<{ questions?: unknown[] }>(
    prompt, undefined, { maxOutputTokens: 8192 }
  );
  const rows = Array.isArray(raw?.questions) ? raw!.questions! : [];

  // Validate here rather than trusting the model: a question with no correct
  // answer grades as unanswerable, and one with two correct answers under SINGLE
  // is unpassable. Both are silent until a learner hits them.
  const KINDS = new Set(["SINGLE", "MULTI", "TRUE_FALSE"]);
  return rows.slice(0, 20).flatMap((r, order) => {
    const o = (r ?? {}) as Record<string, unknown>;
    const prompt2 = typeof o.prompt === "string" ? o.prompt.trim().slice(0, 1000) : "";
    const kind = KINDS.has(String(o.kind)) ? String(o.kind) : "SINGLE";
    const answers = (Array.isArray(o.answers) ? o.answers : [])
      .slice(0, 6)
      .map((a, i) => {
        const ao = (a ?? {}) as Record<string, unknown>;
        return {
          order: i,
          text: typeof ao.text === "string" ? ao.text.trim().slice(0, 500) : "",
          isCorrect: ao.isCorrect === true,
        };
      })
      .filter((a) => a.text);
    const correct = answers.filter((a) => a.isCorrect).length;
    if (!prompt2 || answers.length < 2 || correct < 1) return [];
    if (kind !== "MULTI" && correct !== 1) return [];
    return [{
      order,
      prompt: prompt2,
      kind: kind as "SINGLE" | "MULTI" | "TRUE_FALSE",
      explanation: typeof o.explanation === "string" ? o.explanation.slice(0, 1000) : null,
      points: typeof o.points === "number" && o.points >= 1 && o.points <= 5 ? Math.round(o.points) : 1,
      answers,
    }];
  });
}
```

- [ ] **Step 2: Add the loop**

Append:

```ts
/**
 * Stage 2. Walks the approved outline creating real rows through courseService,
 * so ordering, defaults, and the born-with-a-module rule are the same code the
 * editor uses.
 *
 * Calls are SEQUENTIAL: the Gemini limiter is a sliding window, and firing a
 * dozen section calls at once turns a slow job into a failed one.
 *
 * Never throws — it is invoked as fire-and-forget and records failure on the row.
 */
export async function runGeneration(jobId: string): Promise<void> {
  let calls = 0;
  try {
    const job = await prisma.courseGenJob.findUnique({ where: { id: jobId } });
    if (!job || job.status !== "GENERATING") return;

    const plan = job.outline as unknown as CoursePlan;
    const totalSections = planSectionCount(plan);
    const reference = job.reference ?? "";

    const course = await courseService.createCourse({
      title: plan.title,
      summary: plan.summary,
      createdById: job.createdById,
    });
    // createCourse seeds one "Course content" module; the plan supplies its own,
    // so drop the placeholder rather than leaving an empty module at the top.
    const seeded = await prisma.courseModule.findMany({ where: { courseId: course.id } });
    for (const m of seeded) await courseService.deleteModule(m.id);

    await prisma.courseGenJob.update({
      where: { id: jobId }, data: { courseId: course.id, progress: 2 },
    });

    let done = 0;
    for (const planModule of plan.modules) {
      const mod = await courseService.createModule({
        courseId: course.id,
        title: planModule.title,
        summary: planModule.summary ?? null,
        estimatedMinutes: planModule.estimatedMinutes ?? null,
        isRequired: planModule.isRequired ?? true,
        sequential: planModule.sequential ?? true,
      });

      // Accumulated as the module's CONTENT sections are written, then handed to
      // that module's quiz. This is the ONE place stage 2 looks at earlier
      // output, and it is bounded to a single module on purpose.
      let moduleContent = "";

      for (const planSection of planModule.sections) {
        const fresh = await prisma.courseGenJob.findUnique({
          where: { id: jobId }, select: { status: true },
        });
        if (fresh?.status !== "GENERATING") return;  // cancelled between sections
        if (calls >= MAX_CALLS_PER_JOB) {
          await prisma.courseGenJob.update({
            where: { id: jobId },
            data: { status: "FAILED", error: "Hit the generation call limit — the partial course was kept" },
          });
          return;
        }

        await prisma.courseGenJob.update({
          where: { id: jobId },
          data: {
            stepLabel: `Writing ${done + 1} of ${totalSections} — ${planSection.title}`,
            progress: Math.min(98, 2 + Math.round((done / Math.max(1, totalSections)) * 96)),
          },
        });

        const section = await courseService.createSection({
          courseId: course.id,
          moduleId: mod.id,
          title: planSection.title,
          kind: planSection.kind,
          isRequired: planSection.isRequired ?? true,
          ...(planSection.kind === "QUIZ"
            ? { passThreshold: planSection.passThreshold ?? 80 }
            : {}),
        });

        const ctx: SectionContext = {
          courseTitle: plan.title, moduleTitle: planModule.title, reference,
        };

        if (planSection.kind === "CONTENT") {
          const doc = await generateContentBody(planSection, ctx);
          calls += 1;
          await courseService.updateSection(section.id, { contentJson: doc });
          moduleContent += `\n\n## ${planSection.title}\n${docToPlainText(doc)}`;
        } else if (planSection.kind === "SLIDES") {
          const doc = await generateSlideOutline(planSection, ctx);
          calls += 1;
          await courseService.updateSection(section.id, { contentJson: doc });
          moduleContent += `\n\n## ${planSection.title}\n${docToPlainText(doc)}`;
        } else if (planSection.kind === "VIDEO") {
          // A placeholder, not a call — there is nothing to generate until the
          // author supplies a YouTube id.
          await courseService.updateSection(section.id, {
            contentJson: markdownToTiptapJson(
              `## ${planSection.title}\n\n*Add the video for this section.*\n\n${planSection.brief}`
            ),
          });
        } else if (planSection.kind === "QUIZ") {
          const questions = await generateQuizQuestions(planSection, ctx, moduleContent);
          calls += 1;
          if (questions.length) {
            await courseService.replaceQuestions(section.id, questions, "quiz");
          }
          await courseService.updateSection(section.id, { contentJson: EMPTY_DOC });
        }

        done += 1;
      }
    }

    await prisma.courseGenJob.update({
      where: { id: jobId },
      data: { status: "DONE", progress: 100, stepLabel: "Done", error: null },
    });
  } catch (err) {
    console.error("[courseGen] runGeneration error:", err);
    await prisma.courseGenJob.update({
      where: { id: jobId },
      data: { status: "FAILED", error: "Generation failed partway — the partial course was kept" },
    }).catch(() => {});
  }
}
```

Check `courseService.replaceQuestions`'s actual parameter shape before wiring this up and match it exactly — it is the same function the quiz builder's whole-set `PUT` uses, and its `id`-forwarding behavior is what keeps response rows intact.

- [ ] **Step 3: Verify it compiles**

```bash
cd backend && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/courseGenService.ts
git commit -m "feat(courses): AI body generation for content, slides and quizzes

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Routes and the startup sweep

**Files:**
- Create: `backend/src/api/courseGen.ts`
- Modify: `backend/src/app.ts`

**Interfaces:**
- Consumes: everything from Tasks 3–4.
- Produces: the six routes under `/api/outreach/courses/generate`. Task 6 calls them.

- [ ] **Step 1: Write the router**

Create `backend/src/api/courseGen.ts`:

```ts
import { Router, type Request, type Response } from "express";
import { requireAuth } from "./auth.js";
import { prisma } from "../db/prisma.js";
import * as gen from "../services/courseGenService.js";

export const courseGenRouter = Router();
courseGenRouter.use(requireAuth);

async function isAdmin(memberId?: string): Promise<boolean> {
  if (!memberId) return false;
  const m = await prisma.member.findUnique({ where: { id: memberId }, select: { isAdmin: true } });
  return !!m?.isAdmin;
}

// POST / — start stage 1. Returns immediately; the client polls GET /:jobId.
courseGenRouter.post("/", async (req: Request, res: Response) => {
  try {
    const { prompt, reference, sourcePostIds } = req.body as {
      prompt?: string; reference?: string; sourcePostIds?: string[];
    };
    if (!prompt?.trim() || prompt.trim().length < 20) {
      res.status(400).json({ error: "Describe the course you want in a sentence or two" });
      return;
    }
    const job = await gen.startOutline({
      memberId: req.memberId!,
      prompt: prompt.trim(),
      reference: reference?.trim() || undefined,
      sourcePostIds: Array.isArray(sourcePostIds) ? sourcePostIds : [],
    });
    // Fire and forget: the work outlives this request, and its only report
    // channel is the job row.
    void gen.runOutline(job.id);
    res.status(202).json({ id: job.id });
  } catch (error) {
    console.error("POST /outreach/courses/generate error:", error);
    res.status(500).json({ error: "Could not start generation" });
  }
});

courseGenRouter.get("/", async (req: Request, res: Response) => {
  try {
    res.json(await gen.listJobs(req.memberId!));
  } catch (error) {
    console.error("GET /outreach/courses/generate error:", error);
    res.status(500).json({ error: "Failed to list jobs" });
  }
});

courseGenRouter.get("/:jobId", async (req: Request, res: Response) => {
  try {
    const job = await gen.getJob(req.params.jobId as string, req.memberId!, await isAdmin(req.memberId));
    if (!job) { res.status(404).json({ error: "Job not found" }); return; }
    res.json(job);
  } catch (error) {
    console.error("GET /outreach/courses/generate/:jobId error:", error);
    res.status(500).json({ error: "Failed to get job" });
  }
});

// PATCH /:jobId — the author's edited outline. Re-validated server-side.
courseGenRouter.patch("/:jobId", async (req: Request, res: Response) => {
  try {
    const updated = await gen.reviseOutline(
      req.params.jobId as string, req.memberId!, (req.body as { outline?: unknown }).outline
    );
    if (!updated) { res.status(409).json({ error: "That job is not awaiting review" }); return; }
    res.json(updated);
  } catch (error) {
    console.error("PATCH /outreach/courses/generate/:jobId error:", error);
    res.status(500).json({ error: "Failed to save the outline" });
  }
});

// POST /:jobId/run — approve the outline and start stage 2.
courseGenRouter.post("/:jobId/run", async (req: Request, res: Response) => {
  try {
    const jobId = req.params.jobId as string;
    const job = await gen.getJob(jobId, req.memberId!, false);
    if (!job) { res.status(404).json({ error: "Job not found" }); return; }
    if (job.status !== "AWAITING_REVIEW") {
      res.status(409).json({ error: "That job is not awaiting review" });
      return;
    }
    await prisma.courseGenJob.update({
      where: { id: jobId },
      data: { status: "GENERATING", progress: 1, stepLabel: "Creating the course…", error: null },
    });
    void gen.runGeneration(jobId);
    res.status(202).json({ ok: true });
  } catch (error) {
    console.error("POST /outreach/courses/generate/:jobId/run error:", error);
    res.status(500).json({ error: "Could not start generation" });
  }
});

courseGenRouter.delete("/:jobId", async (req: Request, res: Response) => {
  try {
    const cancelled = await gen.cancelJob(req.params.jobId as string, req.memberId!);
    if (!cancelled) { res.status(404).json({ error: "Job not found" }); return; }
    res.json({ ok: true });
  } catch (error) {
    console.error("DELETE /outreach/courses/generate/:jobId error:", error);
    res.status(500).json({ error: "Could not cancel that job" });
  }
});
```

- [ ] **Step 2: Mount it and sweep at startup**

In `backend/src/app.ts`, mount the router. **It must be registered before `coursesRouter`**, or `coursesRouter`'s `GET /:id` swallows `/generate` as a course id:

```ts
import { courseGenRouter } from "./api/courseGen.js";
// …
// BEFORE the coursesRouter mount — otherwise GET /:id matches "generate".
app.use("/api/outreach/courses/generate", courseGenRouter);
```

Then, beside the other startup work:

```ts
// Jobs run in this process, so a restart abandons anything in flight. Failing
// them explicitly beats a progress bar that never moves.
void import("./services/courseGenService.js").then(async ({ sweepStaleJobs }) => {
  const n = await sweepStaleJobs();
  if (n) console.log(`[courseGen] swept ${n} stale job(s) after restart`);
});
```

- [ ] **Step 3: Verify and smoke test**

```bash
cd backend && npx tsc --noEmit && npm run dev
```

`POST` a short brief, poll `GET /:jobId`, and confirm it reaches `AWAITING_REVIEW` with a populated `outline`. Then `POST /:jobId/run` and watch `stepLabel` and `progress` advance.

- [ ] **Step 4: Commit**

```bash
git add backend/src/api/courseGen.ts backend/src/app.ts
git commit -m "feat(courses): AI generation routes and stale-job sweep

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# Phase 4 — The authoring flow

## Task 6: Generation modal, outline review, and progress

**Files:**
- Create: `src/components/clubpm/courses/CourseGenModal.jsx`
- Create: `src/components/clubpm/courses/CourseOutlineReview.jsx`
- Modify: `src/api/clubPmClient.js`, `src/components/clubpm/courses/CoursesTab.jsx`, `public/clubpm-theme.css`

**Interfaces:**
- Consumes: the routes from Task 5.
- Produces: `CourseGenModal` with props `{ open, onClose }`, navigating to `/clubpm/courses/:courseId` on completion.

- [ ] **Step 1: Add the client wrappers**

In `src/api/clubPmClient.js`, beside the other course helpers:

```js
export const startCourseGen    = (data)   => post('/api/outreach/courses/generate', data);
export const listCourseGenJobs = ()       => get('/api/outreach/courses/generate');
export const getCourseGenJob   = (jobId)  => get(`/api/outreach/courses/generate/${jobId}`);
export const saveCourseGenOutline = (jobId, outline) =>
  patch(`/api/outreach/courses/generate/${jobId}`, { outline });
export const runCourseGen      = (jobId)  => post(`/api/outreach/courses/generate/${jobId}/run`, {});
export const cancelCourseGen   = (jobId)  => del(`/api/outreach/courses/generate/${jobId}`);
```

- [ ] **Step 2: Write CourseOutlineReview.jsx**

A controlled component: `{ outline, onChange, disabled }`, where `outline` is the `CoursePlan`. It renders module cards, each with an editable title, summary, and estimated-minutes field, an `isRequired` and a `sequential` checkbox, and a list of section rows. Each section row has an editable title, a kind `<select>` (CONTENT / VIDEO / QUIZ / SLIDES), an editable brief `<textarea>`, an `isRequired` checkbox, and a delete button. Each module has "Add section"; the card list has "Add module". Reorder with the same `@dnd-kit` idiom `CourseSectionRail` uses, or with up/down buttons if that proves simpler — reordering here is a nicety, not load-bearing, because the author can reorder in the real editor afterwards.

Every edit calls `onChange(nextOutline)` with a new object; the modal debounces `saveCourseGenOutline` by 800 ms.

Two things the component must show plainly, because they are the author's only cost signal before the expensive stage:

```jsx
// The section count IS the call count, and the call budget is the real
// constraint (25 complex-model requests a day, then it silently falls back to
// the weaker model). Show it.
const sectionCount = outline.modules.reduce((n, m) => n + m.sections.length, 0);
```

```jsx
// The brief is the ONLY instruction the writer of that section receives. An
// author who leaves it as the model wrote it gets what the model planned; one
// who sharpens it gets what they wanted. Say so next to the field.
```

- [ ] **Step 3: Write CourseGenModal.jsx**

Three screens in one modal, driven by the job's `status`:

| Status | Screen |
|---|---|
| *(none)* | **Brief** — prompt textarea (min 20 chars, enforced client- and server-side), optional reference textarea, multi-select of published blog posts. "Draft the outline" → `startCourseGen` → poll. |
| `OUTLINING` | Spinner with `stepLabel`. |
| `AWAITING_REVIEW` | `CourseOutlineReview` + "Generate course" → `runCourseGen`. |
| `GENERATING` | `cpm-progress-bar` at `progress`, `stepLabel` beneath, Cancel → `cancelCourseGen`. |
| `DONE` | "Open the course" → `navigate(/clubpm/courses/${job.courseId})`. |
| `FAILED` | The `error` string and a "Start over" button. |

Polling:

```jsx
// Poll only while the job is doing something. A terminal status must stop the
// interval, or the modal quietly hammers the API for as long as it stays open.
useEffect(() => {
  if (!jobId) return undefined;
  if (job && !['OUTLINING', 'GENERATING'].includes(job.status)) return undefined;
  const t = setInterval(() => {
    getCourseGenJob(jobId).then(setJob).catch(() => {});
  }, 2000);
  return () => clearInterval(t);
}, [jobId, job?.status]);
```

Closing the modal mid-generation does **not** cancel — the job keeps running. Say so in the close confirmation.

- [ ] **Step 4: Wire it into CoursesTab**

Add "Generate with AI" beside the existing new-course action, opening the modal. Below the course grid, render any of the member's non-terminal jobs from `listCourseGenJobs()` as a row with its `stepLabel` and a "Resume" button that reopens the modal on that job — this is what makes closing the modal safe.

- [ ] **Step 5: Style it**

Append to `public/clubpm-theme.css`: `pm-course-gen-modal`, `pm-course-gen-brief`, `pm-course-gen-outline`, `pm-course-gen-module-card`, `pm-course-gen-section-row`, `pm-course-gen-progress`, `pm-course-gen-jobs`. Reuse `cpm-card`, `cpm-form-input`, `cpm-progress-bar`, and `cpm-tag` rather than restyling them.

- [ ] **Step 6: Verify and walk through**

```bash
cd "c:/Users/Henry/Documents/Antigravity/purduesearch.github.io" && npm run build
```

Then, with both servers running:
1. Generate an outline from a three-paragraph brief; confirm modules and mixed section kinds.
2. Rename a module, change a section CONTENT → QUIZ, delete one, add one, sharpen a brief. Generate, and confirm the course matches the **edited** outline exactly.
3. Watch `stepLabel` advance and `progress` reach 100; open the course.
4. Confirm it is DRAFT, has the right module/section tree, that CONTENT sections have real multi-section bodies, and that QUIZ questions have a correct answer and an explanation.
5. Confirm a QUIZ's questions test material from **its own module**.
6. Cancel mid-run; confirm it stops between sections and the partial course opens fine.
7. Restart the backend mid-run; confirm the job flips to FAILED with the restart message.
8. Close the modal mid-run; confirm the CoursesTab row appears and Resume reopens it.
9. `curl` a `PATCH` with a 40-module outline and confirm the stored plan is clamped to 8.

- [ ] **Step 7: Final verification gate and commit**

```bash
cd backend && npx prisma generate && npx tsc --noEmit && npx tsx src/services/coursePlan.test.ts
cd .. && npm run build
```

```bash
git add src/components/clubpm/courses/CourseGenModal.jsx src/components/clubpm/courses/CourseOutlineReview.jsx src/api/clubPmClient.js src/components/clubpm/courses/CoursesTab.jsx public/clubpm-theme.css
git commit -m "feat(courses): AI course generation modal with outline review

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```
