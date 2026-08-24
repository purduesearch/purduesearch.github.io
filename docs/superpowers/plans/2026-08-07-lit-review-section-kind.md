# LIT_REVIEW Section Kind Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `LIT_REVIEW` course section kind that hosts a PDF, accepts a learner's written summary, and returns Gemini feedback graded against an author-written reference summary — completing the section on effort, never on score.

**Architecture:** Pure grading logic lives in a new `litReviewService.ts` (no DB, no Express, unit-tested with the repo's inline assertion harness). The DB-touching mutation lives in `courseProgressService.ts`, where every other learner mutation already lives and where `requireUnlockedSection` is in scope. Routes in `courses.ts` follow the existing `isServiceError` / `withRewardEnvelope` idiom. The learner UI is one new component plus one case in the player's kind switch.

**Tech Stack:** Prisma + PostgreSQL, Express (TypeScript, ESM), React 19, `@google/generative-ai` via the existing `geminiService`. No test framework — tests are `.ts` files run with `npx tsx`.

## Global Constraints

- **Read `req.memberId`, never `req.session.memberId`.** Session reads are `undefined` for Bearer-token users (Brave, Safari). Only `auth.ts` may touch `req.session`.
- **`referenceSummary` and `rubric` must never reach a learner.** They are to `litConfig` what `CourseAnswer.isCorrect` is to an answer.
- **Completion happens before grading, always.** A Gemini outage must not block a member's progress.
- **CSS goes in `public/clubpm-theme.css` only**, appended at the bottom. Never `search-theme.css` — this surface is `/clubpm/*` only.
- **Run `npx prisma generate` after any schema edit**, before `tsc`. A stale client produces phantom type errors.
- After each task: `npm run build` (repo root) and `npx tsc --noEmit` (in `backend/`). Fix all errors before the next task.
- Backend is ESM: **every relative import ends in `.js`**, even when the source file is `.ts`.
- Font Awesome classes for icons, never emoji: `<i className="fas fa-book-open" aria-hidden="true" />`.

---

### Task 1: Schema and migration

**Files:**
- Modify: `backend/prisma/schema.prisma:1924-1930` (enum), `:1995-2038` (CourseSection), plus the `Member` model
- Create: `backend/prisma/migrations/<timestamp>_lit_review_section/migration.sql` (generated)

**Interfaces:**
- Consumes: nothing.
- Produces: `CourseSectionKind.LIT_REVIEW`; `CourseSection.litConfig: Json?`; `prisma.courseLitSubmission` with fields `id, sectionId, memberId, text, wordCount, feedbackJson, gradedAt, createdAt`.

- [ ] **Step 1: Add the enum value**

In `backend/prisma/schema.prisma`, change the `CourseSectionKind` enum:

```prisma
enum CourseSectionKind {
  CONTENT
  VIDEO
  QUIZ
  SLIDES
  WALKTHROUGH
  LIT_REVIEW
}
```

- [ ] **Step 2: Add `litConfig` to `CourseSection`**

Immediately after the `tourConfig` field and its comment block, add:

```prisma
  // LIT_REVIEW: { pdfDriveFileId, pdfTitle, citation, promptText, minWords,
  //               referenceSummary, rubric: [{ id, point, weight }] }
  // Same one-column idiom as videoConfig / slideConfig / tourConfig: every
  // writer spreads the previous value so a partial save cannot drop keys it
  // does not own.
  //
  // `referenceSummary` and `rubric` are AUTHOR-ONLY. The learner payload builds
  // its own object from the safe keys (see sanitizeLitConfig) rather than
  // deleting the secret ones off this column.
  litConfig     Json?
```

- [ ] **Step 3: Add the relation to `CourseSection`**

In the relations block of `CourseSection` (beside `questions`, `slides`, `progress`, `attempts`), add:

```prisma
  litSubmissions CourseLitSubmission[]
```

- [ ] **Step 4: Add the `CourseLitSubmission` model**

Add immediately after the `CourseSlide` model:

```prisma
model CourseLitSubmission {
  id           String        @id @default(cuid())
  sectionId    String
  section      CourseSection @relation(fields: [sectionId], references: [id], onDelete: Cascade)
  memberId     String
  member       Member        @relation(fields: [memberId], references: [id], onDelete: Cascade)
  text         String
  wordCount    Int
  // Null means grading has not run — a PENDING grade, never a failed one. The
  // submission counted for completion the moment it was written.
  feedbackJson Json?
  gradedAt     DateTime?
  createdAt    DateTime      @default(now())

  // One row PER ATTEMPT, never updated in place. A member who resubmits after
  // reading their feedback produces a second row; that revision history is the
  // most interesting thing this section produces.
  @@index([sectionId, memberId])
}
```

- [ ] **Step 5: Add the back-relation on `Member`**

Find the `model Member` block and add to its relation list (Prisma will not validate without it):

```prisma
  litSubmissions CourseLitSubmission[]
```

- [ ] **Step 6: Validate the schema**

Run: `cd backend && npx prisma validate`
Expected: `The schema at prisma\schema.prisma is valid 🚀`

If it reports a missing opposite relation field, Step 3 or Step 5 was skipped.

- [ ] **Step 7: Create the migration and regenerate the client**

Run: `cd backend && npx prisma migrate dev --name lit_review_section`
Expected: a new folder under `prisma/migrations/`, and `Your database is now in sync with your schema.`

Then run: `cd backend && npx prisma generate`
Expected: `Generated Prisma Client`

> Editing the schema without generating a migration passes every local check and 500s only in production. Do not skip Step 7.

- [ ] **Step 8: Verify the backend still compiles**

Run: `cd backend && npx tsc --noEmit`
Expected: no output (exit 0)

- [ ] **Step 9: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(courses): add LIT_REVIEW section kind and CourseLitSubmission"
```

---

### Task 2: Pure grading logic

**Files:**
- Create: `backend/src/services/litReviewService.ts`
- Test: `backend/src/services/litReviewService.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `DEFAULT_MIN_WORDS: number` (150)
  - `interface LitRubricPoint { id: string; point: string; weight: number }`
  - `interface LitConfig { pdfDriveFileId, pdfTitle, citation, promptText, minWords, referenceSummary, rubric }`
  - `interface LearnerLitConfig { pdfDriveFileId, pdfTitle, citation, promptText, minWords }`
  - `interface LitRubricResult { id: string; verdict: "caught" | "partial" | "missed"; comment: string }`
  - `interface LitFeedback { points: LitRubricResult[]; overall: string; scorePct: number }`
  - `sanitizeLitConfig(raw: unknown): LearnerLitConfig | null`
  - `countWords(text: string): number`
  - `buildGradingPrompt(opts: { citation, referenceSummary, rubric, submission }): string`
  - `parseGradingResponse(raw: unknown, rubric: LitRubricPoint[]): LitFeedback | null`

- [ ] **Step 1: Write the failing test**

Create `backend/src/services/litReviewService.test.ts`:

```ts
// Pure-logic unit tests for litReviewService. No DB, no network.
// Run: cd backend && npx tsx src/services/litReviewService.test.ts
//
// Excluded from the production build (tsconfig `exclude` covers *.test.ts).
// Same inline assertion harness as courseProgressService.test.ts.

import {
  sanitizeLitConfig,
  countWords,
  buildGradingPrompt,
  parseGradingResponse,
  DEFAULT_MIN_WORDS,
  type LitRubricPoint,
} from "./litReviewService.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}
function eq(name: string, a: unknown, b: unknown) {
  if (JSON.stringify(a) === JSON.stringify(b)) passed++;
  else { failed++; console.error(`  ✗ ${name}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); }
}

// ── sanitizeLitConfig — the leak guard ───────────────────────

const fullConfig = {
  pdfDriveFileId: "1RHGKt4",
  pdfTitle: "Gravity and Human Respiration",
  citation: "Dutta, S., et al. (2025).",
  promptText: "Summarise the paper's central claim.",
  minWords: 200,
  referenceSummary: "THE SECRET REFERENCE SUMMARY",
  rubric: [{ id: "r1", point: "THE SECRET RUBRIC", weight: 2 }],
};

const safe = sanitizeLitConfig(fullConfig);
eq("sanitize keeps the five learner-safe keys", Object.keys(safe ?? {}).sort(), [
  "citation", "minWords", "pdfDriveFileId", "pdfTitle", "promptText",
]);
check("sanitize drops referenceSummary", !JSON.stringify(safe).includes("SECRET REFERENCE"));
check("sanitize drops rubric", !JSON.stringify(safe).includes("SECRET RUBRIC"));
eq("sanitize keeps minWords", safe?.minWords, 200);
eq("sanitize defaults minWords when absent", sanitizeLitConfig({})?.minWords, DEFAULT_MIN_WORDS);
eq("sanitize defaults minWords when zero", sanitizeLitConfig({ minWords: 0 })?.minWords, DEFAULT_MIN_WORDS);
eq("sanitize returns null for null", sanitizeLitConfig(null), null);
eq("sanitize returns null for a string", sanitizeLitConfig("nope"), null);

// A key the author side adds later must NOT ship to learners by default. This
// is the whole reason sanitize builds by construction instead of deleting.
const withFutureSecret = { ...fullConfig, gradingNotes: "FUTURE SECRET" };
check(
  "sanitize ignores unknown keys",
  !JSON.stringify(sanitizeLitConfig(withFutureSecret)).includes("FUTURE SECRET")
);

// ── countWords ───────────────────────────────────────────────

eq("countWords empty", countWords(""), 0);
eq("countWords whitespace only", countWords("   \n\t "), 0);
eq("countWords single", countWords("plume"), 1);
eq("countWords collapses runs", countWords("the  human\n\nthermal   body plume"), 5);
eq("countWords trims", countWords("  two words  "), 2);

// ── parseGradingResponse ─────────────────────────────────────

const rubric: LitRubricPoint[] = [
  { id: "claim",  point: "States the central claim", weight: 2 },
  { id: "method", point: "Names the method",         weight: 1 },
  { id: "limit",  point: "Notes a limitation",       weight: 1 },
];

const good = parseGradingResponse({
  points: [
    { id: "claim",  verdict: "caught",  comment: "You got it." },
    { id: "method", verdict: "partial", comment: "Half there." },
    { id: "limit",  verdict: "missed",  comment: "Reread §4." },
  ],
  overall: "Solid first pass.",
}, rubric);

eq("parse keeps rubric order", good?.points.map((p) => p.id), ["claim", "method", "limit"]);
eq("parse carries overall", good?.overall, "Solid first pass.");
// caught 2/2 + partial 0.5/1 + missed 0/1 = 2.5 of 4 = 62.5
eq("parse scores caught full, partial half, missed zero", good?.scorePct, 62.5);

const missingPoint = parseGradingResponse({
  points: [{ id: "claim", verdict: "caught", comment: "Yes." }],
  overall: "",
}, rubric);
eq("parse fills a skipped rubric id as missed", missingPoint?.points.length, 3);
eq("parse marks the skipped ones missed", missingPoint?.points[2]?.verdict, "missed");

const invented = parseGradingResponse({
  points: [
    { id: "claim",    verdict: "caught", comment: "Yes." },
    { id: "invented", verdict: "caught", comment: "Not a real rubric point." },
  ],
  overall: "",
}, rubric);
eq("parse drops rubric ids the model invented", invented?.points.map((p) => p.id),
  ["claim", "method", "limit"]);

const badVerdict = parseGradingResponse({
  points: [{ id: "claim", verdict: "excellent", comment: "" }],
  overall: "",
}, rubric);
eq("parse coerces an unknown verdict to missed", badVerdict?.points[0]?.verdict, "missed");

eq("parse returns null for a non-object", parseGradingResponse("nope", rubric), null);
eq("parse returns null for null", parseGradingResponse(null, rubric), null);
eq("parse scores an empty rubric as 0, not NaN",
  parseGradingResponse({ points: [], overall: "" }, [])?.scorePct, 0);

// ── buildGradingPrompt ───────────────────────────────────────

const prompt = buildGradingPrompt({
  citation: "Dutta, S., et al. (2025).",
  referenceSummary: "The HTBP collapses in microgravity.",
  rubric,
  submission: "A learner wrote this.",
});
check("prompt carries the reference summary", prompt.includes("The HTBP collapses in microgravity."));
check("prompt carries every rubric id", rubric.every((r) => prompt.includes(`"${r.id}"`)));
check("prompt carries the submission", prompt.includes("A learner wrote this."));
check("prompt forbids invented ids", prompt.includes("Never invent a rubric id"));

// ── Report ───────────────────────────────────────────────────

console.log(`litReviewService: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx tsx src/services/litReviewService.test.ts`
Expected: FAIL — `Cannot find module './litReviewService.js'`

- [ ] **Step 3: Write the implementation**

Create `backend/src/services/litReviewService.ts`:

```ts
/**
 * Literature-review sections: the pure parts.
 *
 * Everything here is a pure function or one isolated Gemini call. The DB work
 * lives in courseProgressService.submitLitReview, beside every other learner
 * mutation, because that is where the unlock gate is.
 */

/** The effort floor when an author has not set one. */
export const DEFAULT_MIN_WORDS = 150;

export interface LitRubricPoint {
  /** Stable across rubric edits, so feedback rows survive rewording. */
  id: string;
  point: string;
  weight: number;
}

/** The whole author-written column. NEVER serialize this to a learner. */
export interface LitConfig {
  pdfDriveFileId: string;
  pdfTitle: string;
  citation: string;
  promptText: string;
  minWords: number;
  referenceSummary: string;
  rubric: LitRubricPoint[];
}

/** The subset a learner may see before submitting. */
export interface LearnerLitConfig {
  pdfDriveFileId: string;
  pdfTitle: string;
  citation: string;
  promptText: string;
  minWords: number;
}

export interface LitRubricResult {
  id: string;
  verdict: "caught" | "partial" | "missed";
  comment: string;
}

export interface LitFeedback {
  points: LitRubricResult[];
  overall: string;
  /** Officer-facing. The learner UI deliberately does not render it. */
  scorePct: number;
}

/**
 * Build the learner-safe view of `litConfig`.
 *
 * BY CONSTRUCTION, not by deletion. A future author-side key — grading notes, a
 * model override, a second reference summary — would ship to every learner by
 * default if this stripped known secrets off a spread of the column instead.
 * Same reasoning as the learner payload itself, which is built by omission.
 */
export function sanitizeLitConfig(raw: unknown): LearnerLitConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Partial<LitConfig>;
  const minWords = Number(c.minWords);
  return {
    pdfDriveFileId: typeof c.pdfDriveFileId === "string" ? c.pdfDriveFileId : "",
    pdfTitle: typeof c.pdfTitle === "string" ? c.pdfTitle : "",
    citation: typeof c.citation === "string" ? c.citation : "",
    promptText: typeof c.promptText === "string" ? c.promptText : "",
    minWords: Number.isFinite(minWords) && minWords > 0 ? Math.floor(minWords) : DEFAULT_MIN_WORDS,
  };
}

/** Whitespace-separated tokens. An empty or whitespace-only string is 0, not 1. */
export function countWords(text: string): number {
  return String(text ?? "").trim().split(/\s+/).filter(Boolean).length;
}

export function buildGradingPrompt(opts: {
  citation: string;
  referenceSummary: string;
  rubric: LitRubricPoint[];
  submission: string;
}): string {
  const rubricLines = opts.rubric.map((r) => `- id "${r.id}": ${r.point}`).join("\n");
  return [
    "You are giving feedback on a student's written summary of a research paper,",
    "for an undergraduate engineering club's training course.",
    "",
    `Paper: ${opts.citation}`,
    "",
    "REFERENCE SUMMARY (written by the course author — treat as ground truth):",
    opts.referenceSummary,
    "",
    "RUBRIC POINTS — judge the student's summary against each one:",
    rubricLines,
    "",
    "STUDENT SUBMISSION:",
    opts.submission,
    "",
    "For every rubric id listed above, decide whether the student caught it,",
    "partially caught it, or missed it. Be generous about wording and strict",
    "about substance: a different phrasing of the right idea is 'caught'; the",
    "right vocabulary around a wrong claim is 'missed'. Never invent a rubric id",
    "and never omit one.",
    "",
    "Write every comment TO the student, in the second person, in at most two",
    "sentences. The tone is a lab-mate reading a draft, not a grader assigning",
    "marks. When something is missed, name the section or figure to reread.",
    "",
    'Return JSON exactly in this shape:',
    '{"points":[{"id":"...","verdict":"caught|partial|missed","comment":"..."}],"overall":"..."}',
    "",
    "'overall' is at most three sentences: what the summary does well, then the",
    "single most useful next step.",
  ].join("\n");
}

const VERDICTS = new Set<LitRubricResult["verdict"]>(["caught", "partial", "missed"]);

/**
 * Turn the model's JSON into feedback, clamped to the author's rubric.
 *
 * Iterates the RUBRIC, never the model's array: an id the model invented has no
 * author-written point behind it and must be dropped, and a point the model
 * skipped must not silently vanish from the learner's feedback. Missing is
 * scored as `missed` — the alternative is a skipped point reading as free credit.
 */
export function parseGradingResponse(
  raw: unknown,
  rubric: LitRubricPoint[]
): LitFeedback | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const body = raw as { points?: unknown; overall?: unknown };

  const given = new Map<string, { verdict: LitRubricResult["verdict"]; comment: string }>();
  if (Array.isArray(body.points)) {
    for (const entry of body.points) {
      if (!entry || typeof entry !== "object") continue;
      const { id, verdict, comment } = entry as Record<string, unknown>;
      if (typeof id !== "string") continue;
      const v = verdict as LitRubricResult["verdict"];
      given.set(id, {
        verdict: typeof verdict === "string" && VERDICTS.has(v) ? v : "missed",
        comment: typeof comment === "string" ? comment : "",
      });
    }
  }

  const points: LitRubricResult[] = rubric.map((r) => {
    const hit = given.get(r.id);
    return { id: r.id, verdict: hit?.verdict ?? "missed", comment: hit?.comment ?? "" };
  });

  const total = rubric.reduce((s, r) => s + (r.weight > 0 ? r.weight : 0), 0);
  const earned = points.reduce((s, p, i) => {
    const w = (rubric[i]?.weight ?? 0) > 0 ? rubric[i]!.weight : 0;
    if (p.verdict === "caught") return s + w;
    if (p.verdict === "partial") return s + w / 2;
    return s;
  }, 0);

  return {
    points,
    overall: typeof body.overall === "string" ? body.overall : "",
    scorePct: total > 0 ? Math.round((earned / total) * 10000) / 100 : 0,
  };
}

/**
 * Grade one submission. Returns null when grading could not run — a missing
 * rubric, a missing reference summary, or a Gemini response that would not parse.
 *
 * Uses `generateJson` (standard model, 30 RPM) rather than `generateJsonComplex`
 * (25 requests PER DAY). A cohort working through one module would exhaust the
 * complex lane in an afternoon and starve every other AI feature sharing it.
 *
 * Throws only if Gemini itself throws; the caller treats that identically to a
 * null return. It must never abort the submission.
 */
export async function gradeSubmission(
  config: unknown,
  submission: string
): Promise<LitFeedback | null> {
  const c = (config ?? {}) as Partial<LitConfig>;
  const rubric = Array.isArray(c.rubric)
    ? c.rubric.filter(
        (r): r is LitRubricPoint =>
          !!r && typeof r.id === "string" && typeof r.point === "string"
      ).map((r) => ({ ...r, weight: Number.isFinite(r.weight) && r.weight > 0 ? r.weight : 1 }))
    : [];
  if (!rubric.length) return null;
  if (typeof c.referenceSummary !== "string" || !c.referenceSummary.trim()) return null;

  const { generateJson } = await import("./geminiService.js");
  const raw = await generateJson<unknown>(
    buildGradingPrompt({
      citation: typeof c.citation === "string" ? c.citation : "",
      referenceSummary: c.referenceSummary,
      rubric,
      submission,
    })
  );
  return parseGradingResponse(raw, rubric);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npx tsx src/services/litReviewService.test.ts`
Expected: `litReviewService: 27 passed, 0 failed`

- [ ] **Step 5: Verify compilation**

Run: `cd backend && npx tsc --noEmit`
Expected: no output

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/litReviewService.ts backend/src/services/litReviewService.test.ts
git commit -m "feat(courses): lit-review grading logic and its unit tests"
```

---

### Task 3: The learner mutation and the payload

**Files:**
- Modify: `backend/src/services/courseProgressService.ts` — imports, `LearnerSection` interface, `learnerSections` map, `completeSection`, plus new exports at the end

**Interfaces:**
- Consumes: `sanitizeLitConfig`, `countWords`, `gradeSubmission`, `DEFAULT_MIN_WORDS`, `LearnerLitConfig`, `LitFeedback` from Task 2.
- Produces:
  - `submitLitReview(sectionId: string, memberId: string, text: string)` → `{ error, status } | { submission, feedback, gradingPending, alreadyComplete, actorReward, progressMilestones }`
  - `listLitSubmissions(sectionId: string, memberId: string)` → `{ error, status } | { submissions: Array<{ id, text, wordCount, feedback, gradedAt, createdAt }> }`
  - `LearnerSection.litConfig?: LearnerLitConfig | null`

- [ ] **Step 1: Add the import**

At the top of `backend/src/services/courseProgressService.ts`, after the `trainingSandboxService` import:

```ts
import {
  sanitizeLitConfig, countWords, gradeSubmission, DEFAULT_MIN_WORDS,
  type LearnerLitConfig, type LitFeedback,
} from "./litReviewService.js";
```

A static import is safe here: `litReviewService` imports `geminiService` dynamically, so there is no cycle.

- [ ] **Step 2: Add `litConfig` to the `LearnerSection` interface**

In the `LearnerSection` interface, in the block commented `// Present ONLY when unlocked`, after `tourSteps?: TourStep[];`:

```ts
  litConfig?: LearnerLitConfig | null;
```

- [ ] **Step 3: Serialize the safe config for unlocked sections**

In `getLearnerCourse`, inside `learnerSections`' `if (unlocked) { ... }` block, after the `WALKTHROUGH` branch:

```ts
      if (s.kind === "LIT_REVIEW") {
        // Built by construction from the five safe keys — referenceSummary and
        // rubric are to this column what isCorrect is to CourseAnswer, and a
        // locked section carries no config at all.
        out.litConfig = sanitizeLitConfig(s.litConfig);
      }
```

- [ ] **Step 4: Refuse `completeSection` for lit reviews**

In `completeSection`, immediately after the existing `QUIZ` guard:

```ts
  if (section.kind === "LIT_REVIEW") {
    return {
      error: "Literature review sections complete by submitting a summary",
      status: 400,
    } as const;
  }
```

- [ ] **Step 5: Add `submitLitReview` and `listLitSubmissions`**

Append to the end of `backend/src/services/courseProgressService.ts`:

```ts
// ── Literature review ────────────────────────────────────────

export interface LitSubmissionView {
  id: string;
  text: string;
  wordCount: number;
  feedback: LitFeedback | null;
  gradedAt: Date | null;
  createdAt: Date;
}

/**
 * Record a learner's written summary of the section's paper, then grade it.
 *
 * ORDER MATTERS. The submission is written and the section is marked COMPLETED
 * *before* Gemini is called, and grading runs inside a try/catch that swallows
 * everything. Completion is gated on effort by design; if a third-party model
 * outage could hold it up, the score would be a gate after all.
 *
 * A resubmission writes a NEW row and re-grades, but does not re-fire rewards —
 * `firstCompletion` is false the second time through.
 */
export async function submitLitReview(sectionId: string, memberId: string, text: string) {
  const ctx = await requireUnlockedSection(sectionId, memberId);
  if (!ctx.ok) return { error: ctx.error, status: ctx.status };
  const { section, enrollment, progress } = ctx;

  if (section.kind !== "LIT_REVIEW") {
    return { error: "Section is not a literature review", status: 400 } as const;
  }

  const config = section.litConfig ?? {};
  const minWords = sanitizeLitConfig(config)?.minWords ?? DEFAULT_MIN_WORDS;
  const body = typeof text === "string" ? text.trim() : "";
  const wordCount = countWords(body);
  if (wordCount < minWords) {
    // Refused before spending a Gemini call, and the message carries both
    // numbers so the composer does not have to guess what it is short by.
    return {
      error: `Write at least ${minWords} words — you have ${wordCount}.`,
      status: 400,
    } as const;
  }

  const submission = await prisma.courseLitSubmission.create({
    data: { sectionId, memberId, text: body, wordCount },
  });

  const firstCompletion = progress.status !== "COMPLETED";
  if (firstCompletion) {
    await prisma.courseSectionProgress.update({
      where: { id: progress.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
  }
  await prisma.courseEnrollment.update({
    where: { id: enrollment.id },
    data: { lastSectionId: sectionId },
  });

  let feedback: LitFeedback | null = null;
  try {
    feedback = await gradeSubmission(config, body);
  } catch (err) {
    // Rate limit, quota, network, malformed JSON — all the same outcome. The
    // submission already counted; this only decides whether feedback exists yet.
    console.error("[lit-review] grading failed:", err);
  }
  if (feedback) {
    await prisma.courseLitSubmission.update({
      where: { id: submission.id },
      data: { feedbackJson: feedback as unknown as Prisma.InputJsonValue, gradedAt: new Date() },
    });
  }

  const effects = firstCompletion
    ? await applyCourseSideEffects(memberId, { courseId: section.courseId, sectionId })
    : { actorReward: null, progressMilestones: [] as CourseProgressMilestone[] };

  return {
    submission: {
      id: submission.id,
      text: submission.text,
      wordCount: submission.wordCount,
      feedback,
      gradedAt: feedback ? new Date() : null,
      createdAt: submission.createdAt,
    } satisfies LitSubmissionView,
    feedback,
    // True when the submission landed but feedback did not. The UI says
    // "Feedback pending" and offers a retry; it does not say "failed".
    gradingPending: !feedback,
    alreadyComplete: !firstCompletion,
    ...effects,
  };
}

/** This member's own attempts on this section, newest first. */
export async function listLitSubmissions(sectionId: string, memberId: string) {
  const ctx = await requireUnlockedSection(sectionId, memberId);
  if (!ctx.ok) return { error: ctx.error, status: ctx.status };

  const rows = await prisma.courseLitSubmission.findMany({
    where: { sectionId, memberId },
    orderBy: { createdAt: "desc" },
  });
  return {
    submissions: rows.map((r) => ({
      id: r.id,
      text: r.text,
      wordCount: r.wordCount,
      feedback: (r.feedbackJson ?? null) as LitFeedback | null,
      gradedAt: r.gradedAt,
      createdAt: r.createdAt,
    })) satisfies LitSubmissionView[],
  };
}
```

- [ ] **Step 6: Add the missing `Prisma` import**

`submitLitReview` references `Prisma.InputJsonValue`. Change the first import line of the file to:

```ts
import { Prisma, type CourseProgressStatus, type CourseQuestionKind } from "@prisma/client";
```

- [ ] **Step 7: Verify compilation and that existing tests still pass**

Run: `cd backend && npx tsc --noEmit`
Expected: no output

Run: `cd backend && npx tsx src/services/courseProgressService.test.ts`
Expected: the existing suite's `passed, 0 failed` line

- [ ] **Step 8: Commit**

```bash
git add backend/src/services/courseProgressService.ts
git commit -m "feat(courses): lit-review submission, completion, and learner payload"
```

---

### Task 4: Routes and API client

**Files:**
- Modify: `backend/src/api/courses.ts` (add two routes near the quiz-attempt route, ~line 1073)
- Modify: `src/api/clubPmClient.js` (beside `submitCourseQuiz`, ~line 632)

**Interfaces:**
- Consumes: `progressService.submitLitReview`, `progressService.listLitSubmissions` from Task 3.
- Produces:
  - `POST /api/outreach/courses/sections/:sid/lit-review` → `{ ok, submission, feedback, gradingPending, alreadyComplete, ...rewardEnvelope }`
  - `GET /api/outreach/courses/sections/:sid/lit-review` → `{ submissions }`
  - Client: `submitLitReview(sectionId, text)`, `listLitSubmissions(sectionId)`

- [ ] **Step 1: Add the routes**

In `backend/src/api/courses.ts`, immediately after the `POST /sections/:sid/quiz/attempts` route block closes:

```ts
// A learner's written summary of a LIT_REVIEW section's paper. Completion is
// recorded by the service before grading runs — see submitLitReview.
coursesRouter.post("/sections/:sid/lit-review", async (req: Request, res: Response) => {
  const requestStartedAt = new Date();
  try {
    const { text } = req.body as { text?: string };
    if (typeof text !== "string") {
      res.status(400).json({ error: "text is required" });
      return;
    }
    const result = await progressService.submitLitReview(
      req.params.sid as string,
      req.memberId!,
      text
    );
    if (isServiceError(result)) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json(
      await withRewardEnvelope(
        req.memberId!,
        requestStartedAt,
        {
          ok: true,
          submission: result.submission,
          feedback: result.feedback,
          gradingPending: result.gradingPending,
          alreadyComplete: result.alreadyComplete,
        },
        result
      )
    );
  } catch (error) {
    console.error("POST /outreach/courses/sections/:sid/lit-review error:", error);
    res.status(500).json({ error: "Failed to submit summary" });
  }
});

coursesRouter.get("/sections/:sid/lit-review", async (req: Request, res: Response) => {
  try {
    const result = await progressService.listLitSubmissions(
      req.params.sid as string,
      req.memberId!
    );
    if (isServiceError(result)) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json(result);
  } catch (error) {
    console.error("GET /outreach/courses/sections/:sid/lit-review error:", error);
    res.status(500).json({ error: "Failed to load submissions" });
  }
});
```

- [ ] **Step 2: Verify the backend compiles**

Run: `cd backend && npx tsc --noEmit`
Expected: no output

- [ ] **Step 3: Add the client methods**

In `src/api/clubPmClient.js`, immediately after the `submitCourseQuiz` export:

```js
// Lit-review submissions carry the reward envelope like every other completion,
// so `handleResponse` fires RewardFlux and the quest toasts with no extra wiring.
export const submitLitReview   = (sectionId, text) =>
  post(`/api/outreach/courses/sections/${sectionId}/lit-review`, { text });
export const listLitSubmissions = (sectionId) =>
  get(`/api/outreach/courses/sections/${sectionId}/lit-review`);
```

- [ ] **Step 4: Verify the frontend builds**

Run: `npm run build`
Expected: `Compiled successfully.` (warnings are acceptable; errors are not)

- [ ] **Step 5: Commit**

```bash
git add backend/src/api/courses.ts src/api/clubPmClient.js
git commit -m "feat(courses): lit-review submit and history routes"
```

---

### Task 5: The learner surface

**Files:**
- Create: `src/components/clubpm/courses/LitReviewSection.jsx`
- Modify: `src/pages/ClubPM/CoursePlayerPage.jsx` (import + one case in the kind switch)
- Modify: `src/components/clubpm/courses/CourseSectionRail.jsx:21-27` (`SECTION_KINDS`)
- Modify: `public/clubpm-theme.css` (append at the bottom)

**Interfaces:**
- Consumes: `submitLitReview`, `listLitSubmissions` from Task 4; `section.litConfig` from Task 3.
- Produces: default export `LitReviewSection({ section, preview, onSubmitted })`.

- [ ] **Step 1: Register the kind in the rail**

In `src/components/clubpm/courses/CourseSectionRail.jsx`, extend `SECTION_KINDS`:

```js
export const SECTION_KINDS = {
  CONTENT: { label: 'Content', icon: 'fas fa-align-left' },
  VIDEO:   { label: 'Video',   icon: 'fas fa-video' },
  QUIZ:    { label: 'Quiz',    icon: 'fas fa-list-check' },
  SLIDES:  { label: 'Slides',  icon: 'fas fa-file-powerpoint' },
  WALKTHROUGH: { label: 'Walkthrough', icon: 'fas fa-hand-pointer' },
  LIT_REVIEW:  { label: 'Paper review', icon: 'fas fa-book-open' },
};
```

- [ ] **Step 2: Create the component**

Create `src/components/clubpm/courses/LitReviewSection.jsx`:

```jsx
import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { submitLitReview, listLitSubmissions } from '../../../api/clubPmClient';

const wordsIn = (text) => String(text ?? '').trim().split(/\s+/).filter(Boolean).length;

const VERDICT_META = {
  caught:  { label: 'Caught it', icon: 'fas fa-circle-check' },
  partial: { label: 'Partly',    icon: 'fas fa-circle-half-stroke' },
  missed:  { label: 'Missed',    icon: 'fas fa-circle-xmark' },
};

/**
 * A paper, a composer, and the feedback on what the learner wrote.
 *
 * The score is deliberately NOT rendered. Completion is gated on effort, and a
 * visible number re-establishes the gate the design removed — a member who saw
 * "48%" would read it as a fail no matter what the copy said. Officers see the
 * score in the course progress view.
 */
export default function LitReviewSection({ section, preview, onSubmitted }) {
  const config = section.litConfig ?? {};
  const minWords = config.minWords ?? 150;

  const [text, setText] = useState('');
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(!preview);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (preview) { setLoading(false); return; }
    try {
      const res = await listLitSubmissions(section.id);
      setSubmissions(res?.submissions ?? []);
    } catch {
      // A history that will not load must not block a first submission.
      setSubmissions([]);
    } finally {
      setLoading(false);
    }
  }, [section.id, preview]);

  useEffect(() => { load(); }, [load]);

  const words = wordsIn(text);
  const short = words < minWords;

  const handleSubmit = async () => {
    if (short || saving) return;
    setSaving(true);
    try {
      const res = await submitLitReview(section.id, text);
      setText('');
      await load();
      if (res?.gradingPending) {
        toast('Summary saved. Feedback is still pending — this section is complete either way.');
      } else {
        toast.success('Summary saved — feedback below.');
      }
      onSubmitted?.();
    } catch (err) {
      toast.error(err?.message ?? 'Could not save your summary');
    } finally {
      setSaving(false);
    }
  };

  const latest = submissions[0] ?? null;

  return (
    <div className="pm-lit">
      {config.pdfDriveFileId ? (
        <div className="pm-lit-paper">
          <iframe
            title={config.pdfTitle || 'Paper'}
            src={`https://drive.google.com/file/d/${config.pdfDriveFileId}/preview`}
            allow="autoplay"
          />
          <p className="pm-lit-citation">
            {config.citation}
            {' '}
            <a
              href={`https://drive.google.com/file/d/${config.pdfDriveFileId}/view`}
              target="_blank"
              rel="noreferrer"
            >
              Open in a new tab <i className="fas fa-arrow-up-right-from-square" aria-hidden="true" />
            </a>
          </p>
        </div>
      ) : (
        <p className="pm-lit-empty">
          <i className="fas fa-triangle-exclamation" aria-hidden="true" />
          {' '}No paper has been attached to this section yet.
        </p>
      )}

      {config.promptText && <p className="pm-lit-prompt">{config.promptText}</p>}

      {preview ? (
        <p className="pm-lit-empty">
          <i className="fas fa-eye" aria-hidden="true" /> Author preview — submissions are not recorded.
        </p>
      ) : (
        <>
          <div className="pm-lit-composer">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={14}
              placeholder="Write your summary here."
              aria-label="Your summary"
            />
            <div className="pm-lit-composer-foot">
              <span className={short ? 'pm-lit-count is-short' : 'pm-lit-count'}>
                {words} / {minWords} words
              </span>
              <button
                type="button"
                className="clubpm-btn-primary"
                onClick={handleSubmit}
                disabled={short || saving}
                title={short ? `Write at least ${minWords} words` : undefined}
              >
                {saving ? 'Sending…' : latest ? 'Submit a revision' : 'Submit summary'}
              </button>
            </div>
          </div>

          {loading && <p className="pm-lit-empty">Loading your submissions…</p>}

          {!loading && latest && (
            <div className="pm-lit-feedback">
              <h3>
                <i className="fas fa-comment-dots" aria-hidden="true" /> Feedback on your latest summary
              </h3>
              {!latest.feedback ? (
                <p className="pm-lit-empty">
                  Feedback is still pending. This section is already complete — submit a
                  revision later to try again.
                </p>
              ) : (
                <>
                  {latest.feedback.overall && (
                    <p className="pm-lit-overall">{latest.feedback.overall}</p>
                  )}
                  <ul className="pm-lit-points">
                    {latest.feedback.points.map((p) => {
                      const meta = VERDICT_META[p.verdict] ?? VERDICT_META.missed;
                      return (
                        <li key={p.id} className={`pm-lit-point is-${p.verdict}`}>
                          <span className="pm-lit-point-verdict">
                            <i className={meta.icon} aria-hidden="true" /> {meta.label}
                          </span>
                          <span className="pm-lit-point-comment">{p.comment}</span>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>
          )}

          {!loading && submissions.length > 1 && (
            <details className="pm-lit-history">
              <summary>{submissions.length - 1} earlier submission{submissions.length === 2 ? '' : 's'}</summary>
              {submissions.slice(1).map((s) => (
                <article key={s.id}>
                  <h4>{new Date(s.createdAt).toLocaleString()} · {s.wordCount} words</h4>
                  <p>{s.text}</p>
                </article>
              ))}
            </details>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Wire it into the player**

In `src/pages/ClubPM/CoursePlayerPage.jsx`, add the import beside the other section components:

```jsx
import LitReviewSection from '../../components/clubpm/courses/LitReviewSection';
```

Then, in the render, immediately after the `WALKTHROUGH` block:

```jsx
              {selected.kind === 'LIT_REVIEW' && (
                <LitReviewSection
                  key={selected.id}
                  section={selected}
                  preview={course.preview}
                  // Submitting completes the section server-side, so the rail
                  // has to be refetched for the next one to unlock.
                  onSubmitted={() => load()}
                />
              )}
```

- [ ] **Step 4: Keep the notes reader from swallowing the section**

The existing prose block renders for every kind except `QUIZ`. A lit-review section's `contentJson` is legitimate intro prose and should still render — but it must come *before* the paper, not after. Change the reader's condition from:

```jsx
              {selected.kind !== 'QUIZ' && selected.contentJson && (
```

to:

```jsx
              {selected.kind !== 'QUIZ' && selected.kind !== 'LIT_REVIEW' && selected.contentJson && (
```

and add this block immediately *before* the `LIT_REVIEW` block from Step 3:

```jsx
              {selected.kind === 'LIT_REVIEW' && selected.contentJson && (
                <div className="pm-course-learn-reader">
                  <BlogEditor
                    key={`reader-${selected.id}`}
                    content={selected.contentJson}
                    editable={false}
                    theme={course.theme}
                  />
                </div>
              )}
```

- [ ] **Step 5: Add the styles**

Append to the bottom of `public/clubpm-theme.css`:

```css
/* === Course · literature review section ===================== */

.pm-lit { display: flex; flex-direction: column; gap: 1.25rem; }

.pm-lit-paper iframe {
  width: 100%;
  aspect-ratio: 8.5 / 11;
  max-height: 70vh;
  border: 1px solid var(--pm-border, rgba(255, 255, 255, 0.12));
  border-radius: 10px;
  background: #1a1a1a;
}
.pm-lit-citation {
  margin: 0.5rem 0 0;
  font-size: 0.85rem;
  color: var(--color-text-muted, #9aa4b2);
}
.pm-lit-citation a { color: var(--pm-accent-teal, #00e5cc); }

.pm-lit-prompt {
  margin: 0;
  padding: 0.85rem 1rem;
  border-left: 3px solid var(--pm-accent-amber, #f5a623);
  background: rgba(245, 166, 35, 0.08);
  border-radius: 0 8px 8px 0;
}

.pm-lit-composer textarea {
  width: 100%;
  resize: vertical;
  padding: 0.9rem 1rem;
  font: inherit;
  line-height: 1.6;
  color: inherit;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--pm-border, rgba(255, 255, 255, 0.12));
  border-radius: 10px;
}
.pm-lit-composer textarea:focus-visible {
  outline: 2px solid var(--pm-accent-teal, #00e5cc);
  outline-offset: 1px;
}
.pm-lit-composer-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-top: 0.6rem;
}
.pm-lit-count { font-family: var(--pm-font-mono, monospace); font-size: 0.85rem; }
.pm-lit-count.is-short { color: var(--pm-accent-amber, #f5a623); }

.pm-lit-feedback h3 { margin: 0 0 0.6rem; font-size: 1rem; }
.pm-lit-overall { margin: 0 0 0.9rem; }
.pm-lit-points { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.5rem; }
.pm-lit-point {
  display: grid;
  grid-template-columns: minmax(7rem, auto) 1fr;
  gap: 0.75rem;
  align-items: baseline;
  padding: 0.7rem 0.9rem;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
  border-left: 3px solid transparent;
}
.pm-lit-point.is-caught  { border-left-color: var(--pm-accent-teal, #00e5cc); }
.pm-lit-point.is-partial { border-left-color: var(--pm-accent-amber, #f5a623); }
.pm-lit-point.is-missed  { border-left-color: var(--pm-accent-coral, #ff6b6b); }
.pm-lit-point-verdict { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.04em; }

.pm-lit-history summary { cursor: pointer; font-size: 0.9rem; }
.pm-lit-history article { padding: 0.75rem 0; border-top: 1px solid var(--pm-border, rgba(255, 255, 255, 0.12)); }
.pm-lit-history h4 { margin: 0 0 0.35rem; font-size: 0.8rem; color: var(--color-text-muted, #9aa4b2); }
.pm-lit-history p { margin: 0; white-space: pre-wrap; }

.pm-lit-empty { color: var(--color-text-muted, #9aa4b2); font-size: 0.9rem; }

@media (max-width: 640px) {
  .pm-lit-point { grid-template-columns: 1fr; gap: 0.25rem; }
  .pm-lit-composer-foot { flex-direction: column; align-items: stretch; }
}
```

- [ ] **Step 6: Verify the build**

Run: `npm run build`
Expected: `Compiled successfully.`

- [ ] **Step 7: Commit**

```bash
git add src/components/clubpm/courses/LitReviewSection.jsx src/components/clubpm/courses/CourseSectionRail.jsx src/pages/ClubPM/CoursePlayerPage.jsx public/clubpm-theme.css
git commit -m "feat(courses): lit-review learner surface"
```

---

### Task 6: The authoring surface

**Files:**
- Create: `src/components/clubpm/courses/LitReviewBuilder.jsx`
- Modify: `src/pages/ClubPM/CourseEditorPage.jsx` (import + render for `LIT_REVIEW` sections)
- Modify: `backend/src/services/courseService.ts:121-141` (`sectionSelect`), `:28-50` (`CreateSectionInput` / `UpdateSectionInput`), `:412-456` (`createSection` / `updateSection`)

**Interfaces:**
- Consumes: `updateCourseSection` from `clubPmClient` (existing), `LitConfig` shape from Task 2.
- Produces: default export `LitReviewBuilder({ section, onSave })`; `litConfig` round-tripping through `PATCH /sections/:sid`.

- [ ] **Step 1: Carry `litConfig` on the authoring tree**

In `backend/src/services/courseService.ts`, add to `sectionSelect` after `tourConfig: true,`:

```ts
  // Same reason as slideConfig / tourConfig: the LIT_REVIEW builder reads the
  // reference summary and rubric straight off this column. This select feeds the
  // AUTHORING tree only — the learner payload is built separately, by
  // construction, in courseProgressService.
  litConfig: true,
```

- [ ] **Step 2: Accept `litConfig` on create and update**

Add to both `CreateSectionInput` and `UpdateSectionInput`:

```ts
  litConfig?: Record<string, unknown> | null;
```

In `createSection`'s `data` object, after the `slideConfig` line:

```ts
      litConfig: (input.litConfig ?? undefined) as Prisma.InputJsonValue | undefined,
```

In `updateSection`, after the `slideConfig` block:

```ts
  // Whole merged object, like slideConfig — the builder spreads the previous
  // value, so this column is never patched key-by-key here.
  if (input.litConfig !== undefined) {
    data.litConfig =
      input.litConfig === null ? Prisma.DbNull : (input.litConfig as Prisma.InputJsonValue);
  }
```

- [ ] **Step 3: Confirm the route already passes it through**

Read `backend/src/api/courses.ts` around the `PATCH /sections/:sid` handler (~line 396). If it destructures a fixed field list from `req.body`, add `litConfig` to it. If it forwards the whole body to `courseService.updateSection`, no change is needed.

Run: `cd backend && npx tsc --noEmit`
Expected: no output

- [ ] **Step 4: Create the builder**

Create `src/components/clubpm/courses/LitReviewBuilder.jsx`:

```jsx
import React, { useState } from 'react';
import toast from 'react-hot-toast';

const emptyPoint = () => ({ id: `r${Date.now().toString(36)}`, point: '', weight: 1 });

/**
 * Author surface for a LIT_REVIEW section.
 *
 * Everything below the divider — the reference summary and the rubric — is
 * withheld from learners by the server, which builds their payload from five
 * safe keys rather than stripping these off. Nothing here is hidden by CSS.
 */
export default function LitReviewBuilder({ section, onSave }) {
  const initial = section.litConfig ?? {};
  const [cfg, setCfg] = useState({
    pdfDriveFileId: initial.pdfDriveFileId ?? '',
    pdfTitle: initial.pdfTitle ?? '',
    citation: initial.citation ?? '',
    promptText: initial.promptText ?? '',
    minWords: initial.minWords ?? 150,
    referenceSummary: initial.referenceSummary ?? '',
    rubric: Array.isArray(initial.rubric) && initial.rubric.length ? initial.rubric : [emptyPoint()],
  });
  const [saving, setSaving] = useState(false);

  const set = (key, value) => setCfg((prev) => ({ ...prev, [key]: value }));
  const setPoint = (index, patch) =>
    setCfg((prev) => ({
      ...prev,
      rubric: prev.rubric.map((p, i) => (i === index ? { ...p, ...patch } : p)),
    }));

  const handleSave = async () => {
    if (!cfg.pdfDriveFileId.trim()) { toast.error('A Drive file id is required'); return; }
    if (!cfg.referenceSummary.trim()) { toast.error('A reference summary is required'); return; }
    const rubric = cfg.rubric.filter((p) => p.point.trim());
    if (!rubric.length) { toast.error('Add at least one rubric point'); return; }
    setSaving(true);
    try {
      // Spread the previous value, like every other *Config writer: a partial
      // save must not drop keys this form does not own.
      await onSave({ ...initial, ...cfg, rubric, minWords: Number(cfg.minWords) || 150 });
      toast.success('Paper review settings saved');
    } catch (err) {
      toast.error(err?.message ?? 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pm-lit-builder">
      <label>
        Drive file id
        <input value={cfg.pdfDriveFileId} onChange={(e) => set('pdfDriveFileId', e.target.value)} />
        <small>
          From the Drive URL: <code>drive.google.com/file/d/<b>THIS PART</b>/view</code>. The file
          must be link-shared, or every learner sees a sign-in wall instead of the paper.
        </small>
      </label>

      <label>
        Paper title
        <input value={cfg.pdfTitle} onChange={(e) => set('pdfTitle', e.target.value)} />
      </label>

      <label>
        Citation
        <input value={cfg.citation} onChange={(e) => set('citation', e.target.value)} />
      </label>

      <label>
        Prompt shown to the learner
        <textarea rows={3} value={cfg.promptText} onChange={(e) => set('promptText', e.target.value)} />
      </label>

      <label>
        Minimum words
        <input
          type="number"
          min="1"
          value={cfg.minWords}
          onChange={(e) => set('minWords', e.target.value)}
        />
        <small>The effort floor. A shorter submission is refused before Gemini is called.</small>
      </label>

      <hr />
      <p className="pm-lit-builder-warn">
        <i className="fas fa-user-shield" aria-hidden="true" />
        {' '}Never sent to learners — the server builds their payload from the fields above only.
      </p>

      <label>
        Reference summary
        <textarea
          rows={10}
          value={cfg.referenceSummary}
          onChange={(e) => set('referenceSummary', e.target.value)}
        />
        <small>The ground truth the learner&apos;s summary is judged against.</small>
      </label>

      <fieldset className="pm-lit-builder-rubric">
        <legend>Rubric points</legend>
        {cfg.rubric.map((p, i) => (
          <div key={p.id} className="pm-lit-builder-point">
            <input
              value={p.point}
              placeholder="e.g. Identifies that the 2× figure is transient, not a mean"
              onChange={(e) => setPoint(i, { point: e.target.value })}
            />
            <input
              type="number"
              min="1"
              value={p.weight}
              aria-label="Weight"
              onChange={(e) => setPoint(i, { weight: Number(e.target.value) || 1 })}
            />
            <button
              type="button"
              className="clubpm-btn-secondary"
              onClick={() => setCfg((prev) => ({
                ...prev,
                rubric: prev.rubric.filter((_, j) => j !== i),
              }))}
              aria-label="Remove point"
            >
              <i className="fas fa-trash" aria-hidden="true" />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="clubpm-btn-secondary"
          onClick={() => setCfg((prev) => ({ ...prev, rubric: [...prev.rubric, emptyPoint()] }))}
        >
          <i className="fas fa-plus" aria-hidden="true" /> Add point
        </button>
        <small>
          Ids are generated once and never change, so feedback already given stays attached
          when you reword a point.
        </small>
      </fieldset>

      <button type="button" className="clubpm-btn-primary" onClick={handleSave} disabled={saving}>
        {saving ? 'Saving…' : 'Save paper review settings'}
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Mount it in the editor**

In `src/pages/ClubPM/CourseEditorPage.jsx`, import the builder:

```jsx
import LitReviewBuilder from '../../components/clubpm/courses/LitReviewBuilder';
```

Find where the page branches on `section.kind` to render `CourseQuizBuilder` / `CourseSlidesWorkbench` / `CourseVideoWorkbench` / the walkthrough panel, and add a sibling branch. Reuse `handleUpdateSection` (defined around line 384) — it calls `updateCourseSection` and folds the result back into local state. Do not introduce a second patch path:

```jsx
      {section.kind === 'LIT_REVIEW' && (
        <LitReviewBuilder
          key={section.id}
          section={section}
          onSave={(litConfig) => handleUpdateSection(section.id, { litConfig })}
        />
      )}
```

- [ ] **Step 6: Add the builder styles**

Append to the bottom of `public/clubpm-theme.css`:

```css
/* === Course · literature review builder ===================== */

.pm-lit-builder { display: flex; flex-direction: column; gap: 1rem; max-width: 60rem; }
.pm-lit-builder label { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.9rem; }
.pm-lit-builder input,
.pm-lit-builder textarea {
  padding: 0.55rem 0.7rem;
  font: inherit;
  color: inherit;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--pm-border, rgba(255, 255, 255, 0.12));
  border-radius: 8px;
}
.pm-lit-builder small { color: var(--color-text-muted, #9aa4b2); font-size: 0.78rem; }
.pm-lit-builder hr { width: 100%; border: 0; border-top: 1px solid var(--pm-border, rgba(255, 255, 255, 0.12)); }
.pm-lit-builder-warn {
  margin: 0;
  padding: 0.6rem 0.8rem;
  border-radius: 8px;
  font-size: 0.85rem;
  color: var(--pm-accent-amber, #f5a623);
  background: rgba(245, 166, 35, 0.1);
}
.pm-lit-builder-rubric { border: 1px solid var(--pm-border, rgba(255, 255, 255, 0.12)); border-radius: 10px; padding: 0.9rem; }
.pm-lit-builder-point { display: grid; grid-template-columns: 1fr 5rem auto; gap: 0.5rem; margin-bottom: 0.5rem; }

@media (max-width: 640px) {
  .pm-lit-builder-point { grid-template-columns: 1fr; }
}
```

- [ ] **Step 7: Verify the build**

Run: `npm run build`
Expected: `Compiled successfully.`

- [ ] **Step 8: Commit**

```bash
git add src/components/clubpm/courses/LitReviewBuilder.jsx src/pages/ClubPM/CourseEditorPage.jsx backend/src/services/courseService.ts public/clubpm-theme.css
git commit -m "feat(courses): lit-review authoring surface"
```

---

### Task 7: The officer's view of the score

**Files:**
- Modify: `backend/src/api/courses.ts` — the `GET /:id/progress` handler (~line 1128)
- Modify: `src/components/clubpm/courses/CourseProgressDashboard.jsx:269-282`

**Interfaces:**
- Consumes: `CourseLitSubmission.feedbackJson.scorePct` from Tasks 1–3.
- Produces: each `rows[].cells[sectionId]` for a `LIT_REVIEW` section additionally carries `litScorePct: number | null` and `litAttempts: number`.

The learner never sees a score — completion is effort-gated, and a visible number would re-establish the gate the design removed. An officer reading the completion matrix does need to know whether a summary engaged with the paper, so the number surfaces here and only here.

- [ ] **Step 1: Load the latest submission per member per section**

In `GET /:id/progress`, immediately after the `const requiredCount = ...` line:

```ts
    // Newest first, so the FIRST row seen for a (member, section) pair is that
    // member's latest attempt and every later row is a prior revision.
    const litSectionIds = sections.filter((s) => s.kind === "LIT_REVIEW").map((s) => s.id);
    const litRows = litSectionIds.length
      ? await prisma.courseLitSubmission.findMany({
          where: { sectionId: { in: litSectionIds } },
          orderBy: { createdAt: "desc" },
          select: { sectionId: true, memberId: true, feedbackJson: true },
        })
      : [];
    const latestLit = new Map<string, { scorePct: number | null; attempts: number }>();
    for (const r of litRows) {
      const key = `${r.memberId}:${r.sectionId}`;
      const seen = latestLit.get(key);
      if (seen) { seen.attempts += 1; continue; }
      const fb = r.feedbackJson as { scorePct?: number } | null;
      latestLit.set(key, {
        // Null when grading never ran. Distinct from a score of 0, and the UI
        // must not conflate them — one is "not graded", the other is "graded badly".
        scorePct: typeof fb?.scorePct === "number" ? fb.scorePct : null,
        attempts: 1,
      });
    }
```

- [ ] **Step 2: Widen the cell type and fold the score in**

Change the `cells` declaration inside the `rows` map from:

```ts
        const cells: Record<string, { status: string; completedAt: Date | null; maxWatchedSec: number }> = {};
```

to:

```ts
        const cells: Record<string, {
          status: string;
          completedAt: Date | null;
          maxWatchedSec: number;
          litScorePct?: number | null;
          litAttempts?: number;
        }> = {};
```

Then, immediately after the loop that backfills `NOT_STARTED` cells:

```ts
        for (const s of sections) {
          if (s.kind !== "LIT_REVIEW") continue;
          const lit = latestLit.get(`${e.memberId}:${s.id}`);
          if (lit) {
            cells[s.id]!.litScorePct = lit.scorePct;
            cells[s.id]!.litAttempts = lit.attempts;
          }
        }
```

- [ ] **Step 3: Verify the backend compiles**

Run: `cd backend && npx tsc --noEmit`
Expected: no output

- [ ] **Step 4: Surface it in the matrix tooltip**

In `src/components/clubpm/courses/CourseProgressDashboard.jsx`, replace the cell body inside the `sections.map` (lines 269–282) with:

```jsx
                {sections.map((s) => {
                  const cell = r.cells[s.id] ?? { status: 'NOT_STARTED' };
                  const st = CELL_STATUS[cell.status] ?? CELL_STATUS.NOT_STARTED;
                  // Lit reviews complete on effort, so a completed cell says
                  // nothing about quality. The score is the officer's only signal.
                  const lit = s.kind === 'LIT_REVIEW' && cell.litAttempts
                    ? cell.litScorePct == null
                      ? ' · not graded'
                      : ` · ${cell.litScorePct}%${cell.litAttempts > 1 ? ` over ${cell.litAttempts} attempts` : ''}`
                    : '';
                  return (
                    <td key={s.id} className={`cpm-course-matrix-cell ${st.cls}`}>
                      <i
                        className={st.icon}
                        aria-hidden="true"
                        title={`${s.title}: ${st.label}${cell.completedAt ? ` (${fmtDate(cell.completedAt)})` : ''}${lit}`}
                      />
                      <span className="cpm-sr-only">{`${s.title}: ${st.label}${lit}`}</span>
                    </td>
                  );
                })}
```

- [ ] **Step 5: Verify the build**

Run: `npm run build`
Expected: `Compiled successfully.`

- [ ] **Step 6: Commit**

```bash
git add backend/src/api/courses.ts src/components/clubpm/courses/CourseProgressDashboard.jsx
git commit -m "feat(courses): surface lit-review scores in the officer progress matrix"
```

---

### Task 8: Seeder support and end-to-end verification

**Files:**
- Modify: `backend/scripts/seedCourses.ts:79-127`
- Create: `docs/courses/README.md` edit (add the `litRef` row to the layout block)

**Interfaces:**
- Consumes: `litConfig` column from Task 1.
- Produces: `course.json` sections may carry `litRef: "lit/Lnn-slug.md"`, whose YAML-ish frontmatter becomes `litConfig`.

- [ ] **Step 1: Add the frontmatter reader**

In `backend/scripts/seedCourses.ts`, above `seedCourse`:

```ts
/**
 * Read a `lit/Lnn-*.md` file into a litConfig.
 *
 * The file's frontmatter is the section config; its body is the annotated
 * bibliography and synthesis, which is author material and is NOT installed.
 * One file holds both because the reference summary is a distillation of the
 * synthesis directly below it, and split across two files they drift.
 *
 * `referenceSummary` is the frontmatter's last key and runs to the `---`, so it
 * can be several paragraphs without any escaping.
 */
function readLitConfig(file: string): Record<string, unknown> {
  const raw = fs.readFileSync(file, "utf8");
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) throw new Error(`${path.basename(file)}: no frontmatter block`);
  const front = match[1]!;

  const scalar = (key: string): string => {
    const m = front.match(new RegExp(`^${key}:[ \\t]*(.*)$`, "m"));
    return m ? m[1]!.trim().replace(/^["']|["']$/g, "") : "";
  };

  // rubric:
  //   - id: claim
  //     point: States the central claim
  //     weight: 2
  const rubric: { id: string; point: string; weight: number }[] = [];
  const rubricBlock = front.match(/^rubric:\r?\n([\s\S]*?)(?=^\S|\Z)/m)?.[1] ?? "";
  for (const chunk of rubricBlock.split(/^\s*-\s+/m).slice(1)) {
    const id = chunk.match(/id:[ \t]*(.*)/)?.[1]?.trim() ?? "";
    const point = chunk.match(/point:[ \t]*(.*)/)?.[1]?.trim() ?? "";
    const weight = Number(chunk.match(/weight:[ \t]*(.*)/)?.[1]?.trim() ?? 1);
    if (id && point) rubric.push({ id, point, weight: Number.isFinite(weight) && weight > 0 ? weight : 1 });
  }

  // referenceSummary is a block scalar: everything after `referenceSummary: |`
  // to the end of the frontmatter, with two-space indentation stripped.
  const summaryBlock = front.match(/^referenceSummary:[ \t]*\|\r?\n([\s\S]*)$/m)?.[1] ?? "";
  const referenceSummary = summaryBlock
    .split(/\r?\n/)
    .map((line) => line.replace(/^ {2}/, ""))
    .join("\n")
    .trim();

  const minWords = Number(scalar("minWords"));
  const config = {
    pdfDriveFileId: scalar("pdfDriveFileId"),
    pdfTitle: scalar("pdfTitle"),
    citation: scalar("citation"),
    promptText: scalar("promptText"),
    minWords: Number.isFinite(minWords) && minWords > 0 ? minWords : 150,
    referenceSummary,
    rubric,
  };

  // Fail the seed loudly rather than install a section that grades against
  // nothing — a learner would submit, get no feedback, and never know why.
  if (!config.pdfDriveFileId) throw new Error(`${path.basename(file)}: pdfDriveFileId is required`);
  if (!config.referenceSummary) throw new Error(`${path.basename(file)}: referenceSummary is required`);
  if (!config.rubric.length) throw new Error(`${path.basename(file)}: at least one rubric point is required`);
  return config;
}
```

- [ ] **Step 2: Use it in the section loop**

In `seedCourse`, immediately after the `if (s.kind === "SLIDES" && s.slideConfig) data.slideConfig = s.slideConfig;` line:

```ts
      if (s.kind === "LIT_REVIEW" && s.litRef) {
        data.litConfig = readLitConfig(path.join(dir, s.litRef));
      }
      if (s.kind === "LIT_REVIEW" && s.bodyRef) {
        // Intro prose above the paper, same conversion as a CONTENT body.
        data.contentJson = courseBodyToDoc(fs.readFileSync(path.join(dir, s.bodyRef), "utf8"));
      }
```

- [ ] **Step 3: Write a throwaway fixture and seed it**

Create `docs/courses/_littest/course.json`:

```json
{
  "slug": "lit-review-smoke-test",
  "title": "Lit review smoke test",
  "summary": "Temporary fixture. Delete after Task 8.",
  "estimatedMinutes": 5,
  "modules": [
    {
      "order": 0,
      "title": "Smoke",
      "estimatedMinutes": 5,
      "isRequired": true,
      "sequential": true,
      "sections": [
        {
          "order": 0,
          "title": "Read the paper",
          "kind": "LIT_REVIEW",
          "isRequired": true,
          "litRef": "lit/L00-smoke.md"
        }
      ]
    }
  ]
}
```

Create `docs/courses/_littest/lit/L00-smoke.md`:

```markdown
---
pdfDriveFileId: 1RHGKt4JX2oV6wd0HcGDySoXoZepTHW5c
pdfTitle: Gravity and Human Respiration
citation: Dutta, S., Tulodziecki, D., Schwertz, H., et al. (2025). Gravity and Human Respiration.
promptText: In your own words, what does this paper claim and how did it get there?
minWords: 10
rubric:
  - id: claim
    point: States that microgravity collapses the human thermal body plume
    weight: 2
  - id: method
    point: Names computational fluid dynamics as the method
    weight: 1
referenceSummary: |
  On Earth, metabolic heat drives a buoyant plume that carries exhaled CO2 away
  from the face. In microgravity there is no buoyancy, the plume collapses, and
  a CO2 bubble forms in front of the face. The authors show this with CFD and
  report roughly double the face-level CO2 exposure versus 1g.
---

Throwaway fixture. Delete this directory after Task 8.
```

Run: `cd backend && npm run seed:courses`
Expected: `✓ lit-review-smoke-test: 1 modules` and `seed:courses done`

- [ ] **Step 4: Verify the section end to end in the app**

Start the app (`npm start` at the root, `npm run dev` in `backend/`). As an admin, publish the smoke-test course from the course editor, open it in the player, and confirm:

1. The PDF renders in the iframe.
2. A 5-word submission is refused with `Write at least 10 words — you have 5.`
3. A 20-word submission is accepted, the section flips to Completed, and feedback cards appear.
4. Now stop the backend, unset `GEMINI_API_KEY` in `backend/.env`, restart, and submit again from a second account (or delete your progress row). **The submission must still save and the section must still complete**, with the toast reading `Summary saved. Feedback is still pending`. This is the single most important behaviour in this plan.
5. Open devtools → Network → the `/learn` response. Search the JSON for `referenceSummary` and for the text `microgravity collapses`. **Both must be absent.**

- [ ] **Step 5: Delete the fixture**

```bash
rm -rf docs/courses/_littest
```

The seeded course row stays in your local database; archive or delete it from the course editor. Nothing needs to be done on production, which never ran this seed.

- [ ] **Step 6: Document the new key**

In `docs/courses/README.md`, in the `## Layout` code block, add a line under `quizzes/`:

```
    lit/                     Lnn-<slug>.md      LIT_REVIEW config (frontmatter) + bibliography (body)
```

And in the same file, correct the status table: the course engine is built, so the five `Content written · engine not built` cells should read `Content written · installed by seed:courses`.

- [ ] **Step 7: Run every check**

```bash
cd backend && npx tsc --noEmit && npx tsx src/services/litReviewService.test.ts && npx tsx src/services/courseProgressService.test.ts && npm run check:courses
cd .. && npm run build
```

Expected: no type errors, both suites report `0 failed`, `check:courses` passes, `Compiled successfully.`

- [ ] **Step 8: Commit**

```bash
git add backend/scripts/seedCourses.ts docs/courses/README.md
git commit -m "feat(courses): seed LIT_REVIEW sections from lit/ files"
```

---

## Done when

- `npx tsx src/services/litReviewService.test.ts` reports 0 failures.
- A seeded `LIT_REVIEW` section renders its PDF, refuses a submission under `minWords`, accepts one over it, marks the section COMPLETED, and shows per-rubric feedback.
- With `GEMINI_API_KEY` unset, the same submission **still saves and still completes**, reporting `gradingPending: true`.
- `referenceSummary` and `rubric` appear nowhere in the `/learn` response.
- `npm run build` and `npx tsc --noEmit` are both clean.
