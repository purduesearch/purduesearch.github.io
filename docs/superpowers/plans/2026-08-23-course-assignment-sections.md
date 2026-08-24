# ASSIGNMENT Sections & Score Gating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `ASSIGNMENT` course section kind (context body + optional handout download + document-upload submission graded by AI against a rubric) and opt-in score-based progression gating for both `ASSIGNMENT` and `LIT_REVIEW`.

**Architecture:** `ASSIGNMENT` follows the established one-JSON-column-per-kind idiom already used by `videoConfig` / `slideConfig` / `tourConfig` / `litConfig`. Gating reuses the existing `CourseSection.passThreshold` column and changes *only when* `COMPLETED` is written — `isSectionUnlocked` is untouched. The existing `CourseLitSubmission` model is renamed to `CourseWorkSubmission` with `@@map` (no DDL) so both kinds share one grading, history, and officer path.

**Tech Stack:** Node 20 / Express / Prisma / PostgreSQL / TypeScript (backend); React 19 / React Router 7 / plain CSS custom properties (frontend); Gemini via `geminiService.generateJson`; `pdf-parse` + `mammoth` for text extraction; multer + Google Drive for the handout.

**Spec:** `docs/superpowers/specs/2026-08-23-course-assignment-sections-design.md` — read it before Phase 1. It carries the *why*, especially §2 (why reversing a documented design decision is justified here) and §5 (the fail-open table). Every phase runs in a fresh session; the spec is the shared context.

## Global Constraints

- **Backend is ESM.** Every relative import must carry a `.js` extension, including imports of `.ts` files (`import { x } from "./foo.js"`). This is not optional — the build fails without it.
- **`req.memberId`, never `req.session.memberId`.** Session reads are `undefined` for Bearer-token users and silently break them. Only `auth.ts` may touch `req.session`.
- **Config columns are written whole, never key-by-key.** Every writer of `assignmentConfig` spreads the previous value, matching `slideConfig` / `tourConfig` / `litConfig`.
- **Learner payloads are built by construction, not by deletion.** `sanitizeAssignmentConfig` lists the safe keys; it must never spread the raw column and delete secrets.
- **AI grading uses `generateJson`, never `generateJsonComplex`.** The complex lane is 25 requests *per day* and is shared with every other AI feature.
- **New ClubPM CSS goes in `public/clubpm-theme.css`.** Never `search-theme.css` — every public visitor downloads that file.
- **Icons are Font Awesome `<i className="fas fa-…" aria-hidden="true" />`.** Never emoji.
- **After every phase:** `npm run build` (repo root) **and** `cd backend && npx tsc --noEmit`. Fix all errors before the next phase.
- **After any `schema.prisma` edit:** run `npx prisma generate` before trusting `tsc` — a stale client produces phantom type errors.
- **Never edit a migration that has been applied.** Add a new one.
- Commit after each task. Branch: `course-assignment-sections`.

---

## Phase 1 — Schema & data layer

**Context for this session:** Prisma only. You will not touch React or route handlers.

### Task 1.1: Rename the submission model and add the new columns

**Files:**
- Modify: `backend/prisma/schema.prisma:262`, `:2043`, `:2134-2152`, `:1926-1933`, `:1998-2054`
- Create: `backend/prisma/migrations/20260824000000_course_assignment_sections/migration.sql`

**Interfaces:**
- Produces: Prisma model `CourseWorkSubmission` (mapped to table `CourseLitSubmission`) with new `fileName: String?` and `fileMimeType: String?`; `CourseSectionKind.ASSIGNMENT`; `CourseSection.assignmentConfig: Json?`; relation fields `Member.workSubmissions` and `CourseSection.workSubmissions`.

- [ ] **Step 1: Add the enum value**

In `backend/prisma/schema.prisma`, at the `CourseSectionKind` enum (~line 1926):

```prisma
enum CourseSectionKind {
  CONTENT
  VIDEO
  QUIZ
  SLIDES
  WALKTHROUGH
  LIT_REVIEW
  ASSIGNMENT
}
```

- [ ] **Step 2: Add the `assignmentConfig` column**

In `model CourseSection`, immediately after the `litConfig` block (~line 2029), add:

```prisma
  // ASSIGNMENT: { promptText, handoutDriveFileId, handoutName, handoutMimeType,
  //               minWords, referenceAnswer, rubric: [{ id, point, weight }] }
  // Same one-column idiom as videoConfig / slideConfig / tourConfig / litConfig:
  // every writer spreads the previous value so a partial save cannot drop keys
  // it does not own.
  //
  // `referenceAnswer` and `rubric` are AUTHOR-ONLY. The learner payload builds
  // its own object from the safe keys (see sanitizeAssignmentConfig) rather than
  // deleting the secret ones off this column.
  assignmentConfig Json?
```

- [ ] **Step 3: Rename the submission model**

Replace `model CourseLitSubmission { … }` (lines 2134-2152) with:

```prisma
/// One learner's attempt at a LIT_REVIEW or ASSIGNMENT section.
///
/// Named for "work submitted", not for the literature review it started as:
/// ASSIGNMENT sections write rows here too, so one grading pipeline, one
/// history drawer, and one officer progress column serve both kinds.
///
/// @@map pins the original table name, so the rename emits no DDL.
model CourseWorkSubmission {
  id           String        @id @default(cuid())
  sectionId    String
  section      CourseSection @relation(fields: [sectionId], references: [id], onDelete: Cascade)
  memberId     String
  member       Member        @relation(fields: [memberId], references: [id], onDelete: Cascade)
  text         String
  wordCount    Int
  // Null for a pasted answer. The uploaded file itself is discarded after
  // extraction — these two keep a record of WHAT was turned in.
  fileName     String?
  fileMimeType String?
  // Null means grading has not run — a PENDING grade, never a failed one. Under
  // a score gate this is the fail-open case: the section completes anyway and is
  // flagged to officers. See the design doc §5.
  feedbackJson Json?
  gradedAt     DateTime?
  createdAt    DateTime      @default(now())

  // One row PER ATTEMPT, never updated in place. A member who resubmits after
  // reading their feedback produces a second row; that revision history is the
  // most interesting thing these sections produce.
  @@index([sectionId, memberId])
  @@map("CourseLitSubmission")
}
```

- [ ] **Step 4: Update both back-relations**

`backend/prisma/schema.prisma:262` (inside `model Member`):

```prisma
  workSubmissions   CourseWorkSubmission[]
```

`backend/prisma/schema.prisma:2043` (inside `model CourseSection`):

```prisma
  workSubmissions CourseWorkSubmission[]
```

- [ ] **Step 5: Write the migration by hand**

Create `backend/prisma/migrations/20260824000000_course_assignment_sections/migration.sql`:

```sql
-- New section kind.
ALTER TYPE "CourseSectionKind" ADD VALUE IF NOT EXISTS 'ASSIGNMENT';

-- Per-kind config column, matching the litConfig / slideConfig idiom.
ALTER TABLE "CourseSection" ADD COLUMN IF NOT EXISTS "assignmentConfig" JSONB;

-- Record of what was uploaded. The file itself is discarded after extraction.
-- The model rename to CourseWorkSubmission is @@map'd, so no table rename here.
ALTER TABLE "CourseLitSubmission" ADD COLUMN IF NOT EXISTS "fileName" TEXT;
ALTER TABLE "CourseLitSubmission" ADD COLUMN IF NOT EXISTS "fileMimeType" TEXT;
```

- [ ] **Step 6: Generate the client and verify the rename emitted no table DDL**

```bash
cd backend
npx prisma generate
npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-migrations prisma/migrations --shadow-database-url "$SHADOW_DATABASE_URL" --script
```

Expected: no `ALTER TABLE … RENAME` in the output. If the diff proposes a table rename, `@@map` is
missing or misspelled — fix it rather than accepting the rename.

- [ ] **Step 7: Apply and confirm compilation**

```bash
cd backend && npx prisma migrate dev --name course_assignment_sections && npx tsc --noEmit
```

Expected: `tsc` reports errors **only** in files still referencing `prisma.courseLitSubmission` — those are fixed in Task 1.2. Note them; do not fix them here.

- [ ] **Step 8: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(courses): add ASSIGNMENT kind, assignmentConfig, and CourseWorkSubmission"
```

### Task 1.2: Point existing call sites at the renamed model

**Files:**
- Modify: `backend/src/services/courseProgressService.ts` (all `prisma.courseLitSubmission` uses)
- Modify: `backend/src/api/courses.ts:1281-1290` (officer progress query)

**Interfaces:**
- Consumes: `CourseWorkSubmission` from Task 1.1.
- Produces: a compiling backend. No behaviour change.

- [ ] **Step 1: Find every call site**

```bash
cd backend && grep -rn "courseLitSubmission" src/
```

- [ ] **Step 2: Rename each accessor**

Replace `prisma.courseLitSubmission` with `prisma.courseWorkSubmission` at every hit. The Prisma
delegate name is the camelCase of the *model* name, not the mapped table, so this is the only change
needed — field names, `where` clauses, and `select` shapes are all unchanged.

- [ ] **Step 3: Verify**

```bash
cd backend && npx tsc --noEmit
```

Expected: clean, zero errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src
git commit -m "refactor(courses): point lit submission call sites at CourseWorkSubmission"
```

### Task 1.3: Thread `assignmentConfig` through courseService

**Files:**
- Modify: `backend/src/services/courseService.ts:28-52` (`CreateSectionInput` / `UpdateSectionInput`), `:130-150` (`sectionSelect`), `:420-440` (`createSection`), `:460-480` (`updateSection`)

**Interfaces:**
- Produces: `CreateSectionInput.assignmentConfig?: Record<string, unknown> | null` and the same on `UpdateSectionInput`; `assignmentConfig` present on every section payload the authoring tree returns.

- [ ] **Step 1: Add the field to both input interfaces**

In `CreateSectionInput` and `UpdateSectionInput`, immediately after the `litConfig` line in each:

```ts
  assignmentConfig?: Record<string, unknown> | null;
```

- [ ] **Step 2: Add it to `sectionSelect`**

After the `litConfig: true,` line (~line 143):

```ts
  // Same reason as slideConfig / tourConfig / litConfig: the ASSIGNMENT builder
  // reads the reference answer and rubric straight off this column. This select
  // feeds the AUTHORING tree only — the learner payload is built separately, by
  // construction, in courseProgressService.
  assignmentConfig: true,
```

- [ ] **Step 3: Write it in `createSection`**

After the `litConfig:` line inside the `data: { … }` object:

```ts
      assignmentConfig: (input.assignmentConfig ?? undefined) as Prisma.InputJsonValue | undefined,
```

- [ ] **Step 4: Write it in `updateSection`**

After the `litConfig` block:

```ts
  // Whole merged object, like litConfig — the builder spreads the previous
  // value, so this column is never patched key-by-key here.
  if (input.assignmentConfig !== undefined) {
    data.assignmentConfig =
      input.assignmentConfig === null
        ? Prisma.DbNull
        : (input.assignmentConfig as Prisma.InputJsonValue);
  }
```

- [ ] **Step 5: Verify and commit**

```bash
cd backend && npx tsc --noEmit
git add backend/src/services/courseService.ts
git commit -m "feat(courses): thread assignmentConfig through courseService"
```

---

## Phase 2 — Pure logic and its tests

**Context for this session:** pure TypeScript, no DB, no HTTP, no React. Everything here is unit-testable with the repo's inline harness. Read spec §4 and §5 first.

### Task 2.1: Document text extraction

**Files:**
- Create: `backend/src/services/documentTextService.ts`
- Create: `backend/src/services/documentTextService.test.ts`
- Modify: `backend/package.json`

**Interfaces:**
- Produces: `extractText(buffer, mimeType, fileName) → Promise<ExtractResult>`, `MAX_EXTRACTED_CHARS`, and the `ExtractResult` union. Consumed by Phase 3's `submitAssignment` and Phase 4's route.

- [ ] **Step 1: Install the two parsers**

```bash
cd backend && npm install pdf-parse@1.1.1 mammoth@1.8.0
```

- [ ] **Step 2: Write the failing test**

Create `backend/src/services/documentTextService.test.ts`:

```ts
// Pure-logic unit tests for documentTextService. No DB required.
// Run: cd backend && npx tsx src/services/documentTextService.test.ts
//
// Excluded from the production build (tsconfig `exclude` covers *.test.ts).
// Uses the same tiny inline assertion harness as courseProgressService.test.ts.

import { extractText, MAX_EXTRACTED_CHARS } from "./documentTextService.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}

console.log("extractText — plain text and markdown");
{
  const txt = await extractText(Buffer.from("hello world", "utf8"), "text/plain", "a.txt");
  check("txt extracts", txt.ok && txt.text === "hello world");

  const md = await extractText(Buffer.from("# Title\n\nbody", "utf8"), "text/markdown", "a.md");
  check("md extracts", md.ok && md.text.includes("body"));

  // Browsers frequently send .md as application/octet-stream — the extension
  // must be enough on its own, or a real submission is rejected as unsupported.
  const byExt = await extractText(Buffer.from("body", "utf8"), "application/octet-stream", "a.md");
  check("md by extension", byExt.ok === true);
}

console.log("extractText — unsupported formats name the fix");
{
  const doc = await extractText(Buffer.from("x"), "application/msword", "old.doc");
  check("legacy .doc rejected", !doc.ok && doc.reason === "UNSUPPORTED");
  check("message names the fix", !doc.ok && /\.docx|PDF/i.test(doc.message));

  const png = await extractText(Buffer.from("x"), "image/png", "shot.png");
  check("image rejected", !png.ok && png.reason === "UNSUPPORTED");
}

console.log("extractText — a file with no readable text is EMPTY, not ok-with-nothing");
{
  const blank = await extractText(Buffer.from("   \n\t  ", "utf8"), "text/plain", "blank.txt");
  check("whitespace-only is EMPTY", !blank.ok && blank.reason === "EMPTY");
  // This is the scanned-PDF path: it must never return ok with an empty string,
  // or the submission grades as a zero and a gated learner is stuck.
  check("EMPTY message mentions scans", !blank.ok && /scan/i.test(blank.message));
}

console.log("extractText — long input is clamped");
{
  const huge = "word ".repeat(MAX_EXTRACTED_CHARS);
  const res = await extractText(Buffer.from(huge, "utf8"), "text/plain", "big.txt");
  check("clamped to the cap", res.ok && res.text.length <= MAX_EXTRACTED_CHARS);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
```

- [ ] **Step 3: Run it to confirm it fails**

```bash
cd backend && npx tsx src/services/documentTextService.test.ts
```

Expected: FAIL — `Cannot find module './documentTextService.js'`.

- [ ] **Step 4: Implement**

Create `backend/src/services/documentTextService.ts`:

```ts
/**
 * Turn an uploaded document into plain text for AI grading.
 *
 * One responsibility, no DB access. Every failure is a typed result rather than
 * a throw, because the caller has to turn each one into a message a learner can
 * act on — "we couldn't read that" is useless when the real answer is "your PDF
 * is a scan".
 */

/** Anything longer is clamped before it reaches a prompt. */
export const MAX_EXTRACTED_CHARS = 60_000;

export type ExtractResult =
  | { ok: true; text: string }
  | { ok: false; reason: "UNSUPPORTED" | "EMPTY" | "FAILED"; message: string };

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot).toLowerCase();
}

/**
 * Browsers are unreliable about MIME types for .md and .txt — Chrome sends
 * application/octet-stream for .md on some platforms. Trust the extension when
 * the MIME type is generic, or real submissions get rejected as unsupported.
 */
function kindOf(mimeType: string, fileName: string): "pdf" | "docx" | "text" | null {
  const ext = extensionOf(fileName);
  if (mimeType === "application/pdf" || ext === ".pdf") return "pdf";
  if (mimeType === DOCX_MIME || ext === ".docx") return "docx";
  if (mimeType.startsWith("text/") || ext === ".txt" || ext === ".md" || ext === ".markdown") {
    return "text";
  }
  return null;
}

function clamp(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > MAX_EXTRACTED_CHARS ? trimmed.slice(0, MAX_EXTRACTED_CHARS) : trimmed;
}

/**
 * The message for a file that parsed but yielded nothing. Names the likely cause
 * and both ways out, because under a score gate this is otherwise a learner
 * blocked by a file format they cannot diagnose.
 */
const EMPTY_MESSAGE =
  "We could not read any text from that file. If it is a scan or a photo of a " +
  "page, the text is an image — export a text-based PDF, or paste your answer instead.";

export async function extractText(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<ExtractResult> {
  const kind = kindOf(mimeType ?? "", fileName ?? "");
  if (!kind) {
    return {
      ok: false,
      reason: "UNSUPPORTED",
      message:
        `We cannot read "${fileName}". Submit a PDF, a Word .docx, or a plain-text ` +
        `.txt / .md file — or paste your answer instead. (Legacy .doc files are not ` +
        `supported: open it in Word and "Save As" .docx or PDF.)`,
    };
  }

  let raw = "";
  try {
    if (kind === "text") {
      raw = buffer.toString("utf8");
    } else if (kind === "docx") {
      const mammoth = await import("mammoth");
      raw = (await mammoth.extractRawText({ buffer })).value ?? "";
    } else {
      // MUST be the deep path. Importing the package root runs a bundled debug
      // harness that reads a test PDF off disk and throws in production.
      const mod = await import("pdf-parse/lib/pdf-parse.js");
      const pdfParse = (mod.default ?? mod) as (b: Buffer) => Promise<{ text: string }>;
      raw = (await pdfParse(buffer)).text ?? "";
    }
  } catch (err) {
    console.error(`[documentText] ${kind} parse failed for "${fileName}":`, err);
    return {
      ok: false,
      reason: "FAILED",
      message:
        "That file could not be opened — it may be password-protected or corrupt. " +
        "Try re-exporting it, or paste your answer instead.",
    };
  }

  const text = clamp(raw);
  if (!text) return { ok: false, reason: "EMPTY", message: EMPTY_MESSAGE };
  return { ok: true, text };
}
```

- [ ] **Step 5: Run the tests**

```bash
cd backend && npx tsx src/services/documentTextService.test.ts
```

Expected: PASS, `13 passed, 0 failed`.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/documentTextService.ts backend/src/services/documentTextService.test.ts backend/package.json backend/package-lock.json
git commit -m "feat(courses): add document text extraction for assignment submissions"
```

### Task 2.2: Extract shared rubric grading

**Files:**
- Create: `backend/src/services/rubricGrading.ts`
- Modify: `backend/src/services/litReviewService.ts`

**Interfaces:**
- Produces: `RubricPoint`, `RubricResult`, `RubricFeedback`, `buildGradingPrompt(opts)`, `parseGradingResponse(raw, rubric)`, `normalizeRubric(raw)`, `countWords(text)`, `gradeAgainstRubric(opts)`.
- `litReviewService.ts` keeps `LitRubricPoint` / `LitFeedback` as re-exported aliases so no existing importer breaks.

- [ ] **Step 1: Create the shared module**

Create `backend/src/services/rubricGrading.ts` and move `buildGradingPrompt`, `parseGradingResponse`, `countWords`, and the `VERDICTS` set out of `litReviewService.ts` verbatim, renaming the types (`LitRubricPoint` → `RubricPoint`, `LitRubricResult` → `RubricResult`, `LitFeedback` → `RubricFeedback`). **Keep every existing comment** — the `parseGradingResponse` doc comment explains why it iterates the rubric rather than the model's array, which is the one thing about that function a future reader must not undo.

Generalize `buildGradingPrompt`'s wording so it serves both kinds by taking the nouns as parameters:

```ts
export function buildGradingPrompt(opts: {
  /** "a student's written summary of a research paper" / "a student's assignment submission" */
  workDescription: string;
  /** The paper's citation, or the assignment's prompt. */
  subject: string;
  /** Label for the ground truth: "REFERENCE SUMMARY" / "REFERENCE ANSWER". */
  referenceLabel: string;
  referenceText: string;
  rubric: RubricPoint[];
  submission: string;
}): string {
  const rubricLines = opts.rubric.map((r) => `- id "${r.id}": ${r.point}`).join("\n");
  return [
    `You are giving feedback on ${opts.workDescription},`,
    "for an undergraduate engineering club's training course.",
    "",
    opts.subject,
    "",
    `${opts.referenceLabel} (written by the course author — treat as ground truth):`,
    opts.referenceText,
    "",
    "RUBRIC POINTS — judge the student's work against each one:",
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
    "'overall' is at most three sentences: what the work does well, then the",
    "single most useful next step.",
  ].join("\n");
}
```

Add the rubric normalizer lifted from `gradeSubmission`'s body:

```ts
/** Keep only well-formed points, and floor every weight at 1. */
export function normalizeRubric(raw: unknown): RubricPoint[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is RubricPoint =>
      !!r && typeof (r as RubricPoint).id === "string" && typeof (r as RubricPoint).point === "string")
    .map((r) => ({ ...r, weight: Number.isFinite(r.weight) && r.weight > 0 ? r.weight : 1 }));
}
```

And the shared grading call:

```ts
/**
 * Grade one submission. Returns null when grading could not run — a missing
 * rubric, missing ground truth, or a Gemini response that would not parse.
 *
 * Uses `generateJson` (standard model, 30 RPM) rather than `generateJsonComplex`
 * (25 requests PER DAY). A cohort working through one module would exhaust the
 * complex lane in an afternoon and starve every other AI feature sharing it.
 *
 * Throws only if Gemini itself throws; the caller treats that identically to a
 * null return. It must never abort the submission.
 */
export async function gradeAgainstRubric(opts: {
  workDescription: string;
  subject: string;
  referenceLabel: string;
  referenceText: string;
  rubric: RubricPoint[];
  submission: string;
}): Promise<RubricFeedback | null> {
  if (!opts.rubric.length) return null;
  if (!opts.referenceText.trim()) return null;
  const { generateJson } = await import("./geminiService.js");
  const raw = await generateJson<unknown>(buildGradingPrompt(opts));
  return parseGradingResponse(raw, opts.rubric);
}
```

- [ ] **Step 2: Rewrite `litReviewService.ts` to delegate**

Keep `DEFAULT_MIN_WORDS`, `LitConfig`, `LearnerLitConfig`, and `sanitizeLitConfig` exactly as they are.
Replace the moved functions with re-exports so no importer breaks — `courseProgressService.ts:8-11`
imports `countWords` and `LitFeedback` from here and must keep compiling untouched:

```ts
// Value imports, because gradeSubmission below calls them. The re-export block
// is separate: a bare `export { … } from` does NOT bring a name into this
// module's scope, so importing and re-exporting are both required.
import { gradeAgainstRubric, normalizeRubric, type RubricFeedback } from "./rubricGrading.js";

export {
  buildGradingPrompt,
  parseGradingResponse,
  countWords,
  normalizeRubric,
  gradeAgainstRubric,
  type RubricPoint as LitRubricPoint,
  type RubricResult as LitRubricResult,
  type RubricFeedback as LitFeedback,
} from "./rubricGrading.js";
```

Rewrite `gradeSubmission` as a thin adapter:

```ts
export async function gradeSubmission(
  config: unknown,
  submission: string
): Promise<RubricFeedback | null> {
  const c = (config ?? {}) as Partial<LitConfig>;
  return gradeAgainstRubric({
    workDescription: "a student's written summary of a research paper",
    subject: `Paper: ${typeof c.citation === "string" ? c.citation : ""}`,
    referenceLabel: "REFERENCE SUMMARY",
    referenceText: typeof c.referenceSummary === "string" ? c.referenceSummary : "",
    rubric: normalizeRubric(c.rubric),
    submission,
  });
}
```

- [ ] **Step 3: Write the shared tests**

Create `backend/src/services/rubricGrading.test.ts` using the same inline harness as Task 2.1's test. Cover:

```ts
import { parseGradingResponse, normalizeRubric, countWords } from "./rubricGrading.js";

const rubric = [
  { id: "a", point: "Names the claim", weight: 2 },
  { id: "b", point: "Names the method", weight: 1 },
];

console.log("parseGradingResponse — scoring");
{
  const all = parseGradingResponse(
    { points: [{ id: "a", verdict: "caught", comment: "" }, { id: "b", verdict: "caught", comment: "" }], overall: "" },
    rubric
  );
  check("all caught is 100", all?.scorePct === 100);

  const half = parseGradingResponse(
    { points: [{ id: "a", verdict: "partial", comment: "" }, { id: "b", verdict: "missed", comment: "" }], overall: "" },
    rubric
  );
  // partial on weight 2 = 1 of 3 total.
  check("partial is half weight", Math.abs((half?.scorePct ?? 0) - 33.33) < 0.01);

  // An id the model invented has no author-written point behind it.
  const invented = parseGradingResponse(
    { points: [{ id: "zzz", verdict: "caught", comment: "" }], overall: "" },
    rubric
  );
  check("invented ids dropped", invented?.points.length === 2);
  check("invented ids score nothing", invented?.scorePct === 0);

  // A point the model skipped must not read as free credit.
  const skipped = parseGradingResponse(
    { points: [{ id: "a", verdict: "caught", comment: "" }], overall: "" },
    rubric
  );
  check("skipped point is missed", skipped?.points.find((p) => p.id === "b")?.verdict === "missed");

  check("garbage returns null", parseGradingResponse("nope", rubric) === null);
}

console.log("normalizeRubric — weights floored at 1");
{
  check("zero weight floored", normalizeRubric([{ id: "a", point: "x", weight: 0 }])[0]?.weight === 1);
  check("malformed dropped", normalizeRubric([{ point: "no id" }]).length === 0);
  check("non-array is empty", normalizeRubric(null).length === 0);
}

console.log("countWords");
{
  check("empty is zero", countWords("   ") === 0);
  check("counts tokens", countWords("one two  three\nfour") === 4);
}
```

- [ ] **Step 4: Run tests and typecheck**

```bash
cd backend && npx tsx src/services/rubricGrading.test.ts && npx tsc --noEmit
```

Expected: all pass; `tsc` clean.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/rubricGrading.ts backend/src/services/rubricGrading.test.ts backend/src/services/litReviewService.ts
git commit -m "refactor(courses): extract shared rubric grading from litReviewService"
```

### Task 2.3: Assignment config sanitizer and the completion decision

**Files:**
- Create: `backend/src/services/assignmentService.ts`
- Create: `backend/src/services/assignmentService.test.ts`

**Interfaces:**
- Produces: `AssignmentConfig`, `LearnerAssignmentConfig`, `sanitizeAssignmentConfig(raw)`, `gradeAssignment(config, submission)`, `decideCompletion(input)`, `CompletionOutcome`, `DEFAULT_ASSIGNMENT_MIN_WORDS`. All consumed by Phase 3.

- [ ] **Step 1: Write the failing test**

Create `backend/src/services/assignmentService.test.ts`:

```ts
// Pure-logic unit tests for assignmentService. No DB required.
// Run: cd backend && npx tsx src/services/assignmentService.test.ts

import { sanitizeAssignmentConfig, decideCompletion } from "./assignmentService.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}

console.log("sanitizeAssignmentConfig — author material never reaches a learner");
{
  const full = {
    promptText: "Write the plan",
    handoutDriveFileId: "abc123",
    handoutName: "rubric.pdf",
    handoutMimeType: "application/pdf",
    minWords: 250,
    referenceAnswer: "THE ANSWER",
    rubric: [{ id: "a", point: "SECRET CRITERION", weight: 2 }],
    // A key nobody has invented yet. Built by construction, so it must not
    // survive — this is the whole reason the function does not spread-and-delete.
    gradingNotes: "FUTURE SECRET",
  };
  const safe = sanitizeAssignmentConfig(full)!;
  const json = JSON.stringify(safe);

  check("prompt survives", safe.promptText === "Write the plan");
  check("handout survives", safe.handoutDriveFileId === "abc123");
  check("minWords survives", safe.minWords === 250);
  check("referenceAnswer withheld", !json.includes("THE ANSWER"));
  check("rubric withheld", !json.includes("SECRET CRITERION"));
  check("unknown author key withheld", !json.includes("FUTURE SECRET"));
  check("no extra keys at all", Object.keys(safe).length === 5);
}

console.log("sanitizeAssignmentConfig — defaults");
{
  check("null in, null out", sanitizeAssignmentConfig(null) === null);
  const bare = sanitizeAssignmentConfig({})!;
  check("minWords defaults", bare.minWords === 150);
  check("missing strings are empty", bare.promptText === "" && bare.handoutDriveFileId === "");
  check("zero minWords defaults", sanitizeAssignmentConfig({ minWords: 0 })!.minWords === 150);
}

console.log("decideCompletion — no gate means today's behaviour, always");
{
  const g = (o: object) => decideCompletion({ passThreshold: null, hasFeedback: true, scorePct: 0, ...o });
  check("ungated + low score completes", g({ scorePct: 3 }) === "COMPLETE");
  check("ungated + no feedback completes", g({ hasFeedback: false, scorePct: null }) === "COMPLETE");
}

console.log("decideCompletion — a gate that is met, missed, or unscorable");
{
  const g = (scorePct: number | null, hasFeedback = true) =>
    decideCompletion({ passThreshold: 70, hasFeedback, scorePct });

  check("above threshold completes", g(85) === "COMPLETE");
  check("exactly at threshold completes", g(70) === "COMPLETE");
  check("just below is blocked", g(69.99) === "BLOCKED");
  check("zero is blocked", g(0) === "BLOCKED");

  // Fail-open. A Gemini outage must never strand a cohort — see design doc §5.
  check("grading failure completes ungraded", g(null, false) === "COMPLETE_UNGRADED");
  check("feedback with no number completes ungraded", g(null, true) === "COMPLETE_UNGRADED");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
cd backend && npx tsx src/services/assignmentService.test.ts
```

Expected: FAIL — `Cannot find module './assignmentService.js'`.

- [ ] **Step 3: Implement**

Create `backend/src/services/assignmentService.ts`:

```ts
/**
 * Assignment sections: the pure parts.
 *
 * Mirrors litReviewService's split — everything here is a pure function or one
 * isolated Gemini call, and the DB work lives in courseProgressService beside
 * every other learner mutation, because that is where the unlock gate is.
 */
import {
  gradeAgainstRubric,
  normalizeRubric,
  type RubricFeedback,
  type RubricPoint,
} from "./rubricGrading.js";

/** The effort floor when an author has not set one. */
export const DEFAULT_ASSIGNMENT_MIN_WORDS = 150;

/** The whole author-written column. NEVER serialize this to a learner. */
export interface AssignmentConfig {
  promptText: string;
  handoutDriveFileId: string;
  handoutName: string;
  handoutMimeType: string;
  minWords: number;
  referenceAnswer: string;
  rubric: RubricPoint[];
}

/** The subset a learner may see. */
export interface LearnerAssignmentConfig {
  promptText: string;
  handoutDriveFileId: string;
  handoutName: string;
  handoutMimeType: string;
  minWords: number;
}

/**
 * Build the learner-safe view of `assignmentConfig`.
 *
 * BY CONSTRUCTION, not by deletion — the same rule as sanitizeLitConfig. A
 * future author-side key (grading notes, a model override, a second reference
 * answer) would ship to every learner by default if this stripped known secrets
 * off a spread of the column instead.
 */
export function sanitizeAssignmentConfig(raw: unknown): LearnerAssignmentConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Partial<AssignmentConfig>;
  const minWords = Number(c.minWords);
  return {
    promptText: typeof c.promptText === "string" ? c.promptText : "",
    handoutDriveFileId: typeof c.handoutDriveFileId === "string" ? c.handoutDriveFileId : "",
    handoutName: typeof c.handoutName === "string" ? c.handoutName : "",
    handoutMimeType: typeof c.handoutMimeType === "string" ? c.handoutMimeType : "",
    minWords:
      Number.isFinite(minWords) && minWords > 0
        ? Math.floor(minWords)
        : DEFAULT_ASSIGNMENT_MIN_WORDS,
  };
}

/** Grade one assignment submission. Null when grading could not run. */
export async function gradeAssignment(
  config: unknown,
  submission: string
): Promise<RubricFeedback | null> {
  const c = (config ?? {}) as Partial<AssignmentConfig>;
  return gradeAgainstRubric({
    workDescription: "a student's submission for a written assignment",
    subject: `Assignment: ${typeof c.promptText === "string" ? c.promptText : ""}`,
    referenceLabel: "REFERENCE ANSWER",
    referenceText: typeof c.referenceAnswer === "string" ? c.referenceAnswer : "",
    rubric: normalizeRubric(c.rubric),
    submission,
  });
}

export type CompletionOutcome = "COMPLETE" | "BLOCKED" | "COMPLETE_UNGRADED";

/**
 * Decide whether a submission completes its section.
 *
 * This is the whole of the score gate. `isSectionUnlocked` is untouched by this
 * feature — it keys on status === "COMPLETED", so gating is entirely a question
 * of when COMPLETED gets written.
 *
 * THE FAIL-OPEN CASE IS LOAD-BEARING. A gated section whose grading did not
 * produce a score completes anyway, flagged for officer review, because the
 * alternative is a Gemini outage stranding a whole cohort mid-course. The
 * write-before-grade ordering in submitWork is what makes that real rather than
 * aspirational; do not reorder it. See the design doc §5.
 */
export function decideCompletion(input: {
  passThreshold: number | null;
  hasFeedback: boolean;
  scorePct: number | null;
}): CompletionOutcome {
  // No gate configured: completion is gated on effort, exactly as before.
  if (input.passThreshold == null) return "COMPLETE";
  if (!input.hasFeedback || typeof input.scorePct !== "number") return "COMPLETE_UNGRADED";
  return input.scorePct >= input.passThreshold ? "COMPLETE" : "BLOCKED";
}
```

- [ ] **Step 4: Run the tests**

```bash
cd backend && npx tsx src/services/assignmentService.test.ts && npx tsc --noEmit
```

Expected: `21 passed, 0 failed`; `tsc` clean.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/assignmentService.ts backend/src/services/assignmentService.test.ts
git commit -m "feat(courses): add assignment config sanitizer and completion gate logic"
```

---

## Phase 3 — Progress service wiring

**Context for this session:** `backend/src/services/courseProgressService.ts` only (1,414 lines — grep, do not read whole). Read spec §5 first.

### Task 3.1: Generalize submission and apply the gate

**Files:**
- Modify: `backend/src/services/courseProgressService.ts:1300-1414` (replace `submitLitReview` / `listLitSubmissions`)

**Interfaces:**
- Consumes: `decideCompletion`, `sanitizeAssignmentConfig`, `gradeAssignment`, `DEFAULT_ASSIGNMENT_MIN_WORDS` (Task 2.3); `countWords` (Task 2.2); `gradeSubmission`, `sanitizeLitConfig`, `DEFAULT_MIN_WORDS` (existing).
- Produces: `submitWork(sectionId, memberId, input)`, `listWorkSubmissions(sectionId, memberId)`, `WorkSubmissionView`. Consumed by Phase 4.

- [ ] **Step 1: Add the imports**

`courseProgressService.ts` already imports from `litReviewService.js` at lines 8-11:

```ts
import {
  sanitizeLitConfig, countWords, gradeSubmission, DEFAULT_MIN_WORDS,
  type LearnerLitConfig, type LitFeedback,
} from "./litReviewService.js";
```

Leave that exactly as it is — `countWords` and `LitFeedback` are re-exported aliases after Task 2.2, so
it keeps compiling. Add two more imports beneath it:

```ts
import {
  sanitizeAssignmentConfig,
  gradeAssignment,
  decideCompletion,
  DEFAULT_ASSIGNMENT_MIN_WORDS,
  type LearnerAssignmentConfig,
} from "./assignmentService.js";
import type { RubricFeedback } from "./rubricGrading.js";
```

`RubricFeedback` and `LitFeedback` are the same type — the alias exists only so the existing lit code
keeps reading naturally. New code in this file uses `RubricFeedback`.

- [ ] **Step 2: Replace `submitLitReview` with the generalized `submitWork`**

Delete `submitLitReview` (lines 1320-1393) and its `LitSubmissionView` interface, and write:

```ts
export interface WorkSubmissionView {
  id: string;
  text: string;
  wordCount: number;
  fileName: string | null;
  fileMimeType: string | null;
  feedback: RubricFeedback | null;
  gradedAt: Date | null;
  createdAt: Date;
}

/**
 * Record a learner's submission for a LIT_REVIEW or ASSIGNMENT section, grade
 * it, and decide whether it completes the section.
 *
 * ORDER MATTERS, and it is the same order as before this feature existed: the
 * submission row is written BEFORE Gemini is called, and grading runs inside a
 * try/catch that swallows everything. That is what makes the score gate's
 * fail-open case real — a third-party outage lands on COMPLETE_UNGRADED rather
 * than holding a learner at BLOCKED. Do not move the grading call above the
 * create, and do not let a grading throw escape.
 *
 * A resubmission writes a NEW row and re-grades, but does not re-fire rewards —
 * `firstCompletion` is false the second time through. Retries are unlimited:
 * `maxAttempts` is deliberately NOT honoured here, because a capped gate can
 * strand a learner permanently.
 */
export async function submitWork(
  sectionId: string,
  memberId: string,
  input: { text: string; fileName?: string | null; fileMimeType?: string | null }
) {
  const ctx = await requireUnlockedSection(sectionId, memberId);
  if (!ctx.ok) return { error: ctx.error, status: ctx.status };
  const { section, enrollment, progress } = ctx;

  const isLit = section.kind === "LIT_REVIEW";
  const isAssignment = section.kind === "ASSIGNMENT";
  if (!isLit && !isAssignment) {
    return { error: "Section does not accept submissions", status: 400 } as const;
  }

  const config = (isLit ? section.litConfig : section.assignmentConfig) ?? {};
  const minWords = isLit
    ? sanitizeLitConfig(config)?.minWords ?? DEFAULT_MIN_WORDS
    : sanitizeAssignmentConfig(config)?.minWords ?? DEFAULT_ASSIGNMENT_MIN_WORDS;

  const body = typeof input.text === "string" ? input.text.trim() : "";
  const wordCount = countWords(body);
  if (wordCount < minWords) {
    // Refused before spending a Gemini call, and the message carries both
    // numbers so the composer does not have to guess what it is short by.
    return {
      error: `Write at least ${minWords} words — you have ${wordCount}.`,
      status: 400,
    } as const;
  }

  const submission = await prisma.courseWorkSubmission.create({
    data: {
      sectionId,
      memberId,
      text: body,
      wordCount,
      fileName: input.fileName ?? null,
      fileMimeType: input.fileMimeType ?? null,
    },
  });

  let feedback: RubricFeedback | null = null;
  try {
    feedback = isLit
      ? await gradeSubmission(config, body)
      : await gradeAssignment(config, body);
  } catch (err) {
    // Rate limit, quota, network, malformed JSON — all the same outcome. The
    // submission already counted; this only decides whether feedback exists yet,
    // and under a gate it decides fail-open rather than blocked.
    console.error(`[course-work] grading failed for ${section.kind} ${sectionId}:`, err);
  }
  if (feedback) {
    await prisma.courseWorkSubmission.update({
      where: { id: submission.id },
      data: { feedbackJson: feedback as unknown as Prisma.InputJsonValue, gradedAt: new Date() },
    });
  }

  const outcome = decideCompletion({
    passThreshold: section.passThreshold,
    hasFeedback: !!feedback,
    scorePct: feedback?.scorePct ?? null,
  });

  const firstCompletion = outcome !== "BLOCKED" && progress.status !== "COMPLETED";
  if (firstCompletion) {
    await prisma.courseSectionProgress.update({
      where: { id: progress.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
  } else if (outcome === "BLOCKED" && progress.status === "NOT_STARTED") {
    await prisma.courseSectionProgress.update({
      where: { id: progress.id },
      data: { status: "IN_PROGRESS" },
    });
  }
  await prisma.courseEnrollment.update({
    where: { id: enrollment.id },
    data: { lastSectionId: sectionId },
  });

  const effects = firstCompletion
    ? await applyCourseSideEffects(memberId, { courseId: section.courseId, sectionId })
    : { actorReward: null, progressMilestones: [] as CourseProgressMilestone[] };

  return {
    submission: {
      id: submission.id,
      text: submission.text,
      wordCount: submission.wordCount,
      fileName: submission.fileName,
      fileMimeType: submission.fileMimeType,
      feedback,
      gradedAt: feedback ? new Date() : null,
      createdAt: submission.createdAt,
    } satisfies WorkSubmissionView,
    feedback,
    // True when the submission landed but feedback did not. The UI says
    // "Feedback pending" and offers a retry; it does not say "failed".
    gradingPending: !feedback,
    outcome,
    // Only meaningful when the section is gated; the learner UI shows the score
    // and threshold exactly when passThreshold is non-null.
    passThreshold: section.passThreshold,
    scorePct: feedback?.scorePct ?? null,
    alreadyComplete: !firstCompletion && outcome !== "BLOCKED",
    ...effects,
  };
}
```

- [ ] **Step 3: Replace `listLitSubmissions` with `listWorkSubmissions`**

```ts
/** This member's own attempts on this section, newest first. */
export async function listWorkSubmissions(sectionId: string, memberId: string) {
  const ctx = await requireUnlockedSection(sectionId, memberId);
  if (!ctx.ok) return { error: ctx.error, status: ctx.status };

  const rows = await prisma.courseWorkSubmission.findMany({
    where: { sectionId, memberId },
    orderBy: { createdAt: "desc" },
  });
  return {
    passThreshold: ctx.section.passThreshold,
    submissions: rows.map((r) => ({
      id: r.id,
      text: r.text,
      wordCount: r.wordCount,
      fileName: r.fileName,
      fileMimeType: r.fileMimeType,
      feedback: (r.feedbackJson ?? null) as RubricFeedback | null,
      gradedAt: r.gradedAt,
      createdAt: r.createdAt,
    })) satisfies WorkSubmissionView[],
  };
}
```

- [ ] **Step 4: Verify**

```bash
cd backend && npx tsc --noEmit
```

Expected: errors only in `backend/src/api/courses.ts`, which still calls `submitLitReview`. Leave them for Phase 4.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/courseProgressService.ts
git commit -m "feat(courses): generalize submissions and apply the score gate"
```

### Task 3.2: Serve `assignmentConfig` in the learner payload

**Files:**
- Modify: `backend/src/services/courseProgressService.ts:337-345` (`LearnerSection`), `:508-513` (the unlocked-section block), `:456-475` (score fields)

**Interfaces:**
- Produces: `LearnerSection.assignmentConfig?: LearnerAssignmentConfig | null` and `LearnerSection.bestScorePct` now populated for LIT_REVIEW/ASSIGNMENT as well as QUIZ.

- [ ] **Step 1: Extend the `LearnerSection` interface**

After the `litConfig` line (~344):

```ts
  assignmentConfig?: LearnerAssignmentConfig | null;
```

- [ ] **Step 2: Populate it, only when unlocked**

Immediately after the existing `if (s.kind === "LIT_REVIEW") { … }` block (~line 513):

```ts
      if (s.kind === "ASSIGNMENT") {
        // Built by construction from the five safe keys — referenceAnswer and
        // rubric are to this column what isCorrect is to CourseAnswer, and a
        // locked section carries no config at all.
        out.assignmentConfig = sanitizeAssignmentConfig(s.assignmentConfig);
      }
```

- [ ] **Step 3: Fetch the learner's own best score for gated sections**

The existing `bestScorePct` is computed from `courseQuizAttempt` rows only, so a gated
LIT_REVIEW/ASSIGNMENT section reports `null` and the player cannot render progress toward the
threshold. Before the `learnerSections` map, add one query for the whole course:

```ts
  // One query for every submission-bearing section in the course rather than one
  // per section — this runs on every learner page load, same reasoning as the
  // SLIDES query above.
  const workSectionIds = sections
    .filter((s) => s.kind === "LIT_REVIEW" || s.kind === "ASSIGNMENT")
    .map((s) => s.id);
  const workRows = workSectionIds.length && enrollment
    ? await prisma.courseWorkSubmission.findMany({
        where: { sectionId: { in: workSectionIds }, memberId },
        select: { sectionId: true, feedbackJson: true },
      })
    : [];
  const bestWorkScore = new Map<string, number | null>();
  for (const r of workRows) {
    const score = (r.feedbackJson as { scorePct?: number } | null)?.scorePct;
    if (typeof score !== "number") continue;
    const seen = bestWorkScore.get(r.sectionId);
    if (seen == null || score > seen) bestWorkScore.set(r.sectionId, score);
  }
```

Then inside the map, replace the `bestScorePct` / `attemptsUsed` lines with:

```ts
      attemptsUsed: mine.length || workRows.filter((r) => r.sectionId === s.id).length,
      bestScorePct: scores.length
        ? Math.max(...scores)
        : bestWorkScore.get(s.id) ?? null,
```

- [ ] **Step 4: Verify and commit**

```bash
cd backend && npx tsc --noEmit
git add backend/src/services/courseProgressService.ts
git commit -m "feat(courses): serve assignment config and gated scores in the learner payload"
```

---

## Phase 4 — API layer and client wrappers

**Context for this session:** `backend/src/api/courses.ts` (1,621 lines — grep by route path) and `src/api/clubPmClient.js`. Both sides of the wire in one session so the shapes cannot drift.

### Task 4.1: Submission routes

**Files:**
- Modify: `backend/src/api/courses.ts:1167-1210` (replace the lit-review routes)

**Interfaces:**
- Consumes: `submitWork`, `listWorkSubmissions` (Task 3.1); `extractText`, `MAX_EXTRACTED_CHARS` (Task 2.1).
- Produces: `POST/GET /sections/:sid/work`, and the retained `POST/GET /sections/:sid/lit-review` aliases.

- [ ] **Step 1: Add the multer instance**

Beside `slideUpload` / `audioUpload` (~line 781):

```ts
// Assignment documents arrive as multipart, never base64 JSON — app.ts's
// default 100 kb express.json() limit would reject a real PDF outright.
const submissionUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
});
```

- [ ] **Step 2: Replace the lit-review POST with a shared work route**

Replace the handler at line 1169 with:

```ts
// A learner's submission for a LIT_REVIEW or ASSIGNMENT section. Accepts either
// multipart (a document, extracted to text here) or JSON ({ text }) for a pasted
// answer. Completion and the score gate are decided by the service — see
// submitWork and the design doc §5.
coursesRouter.post(
  "/sections/:sid/work",
  submissionUpload.single("file"),
  async (req: Request, res: Response) => {
    const requestStartedAt = new Date();
    try {
      let text: string;
      let fileName: string | null = null;
      let fileMimeType: string | null = null;

      if (req.file) {
        const { extractText } = await import("../services/documentTextService.js");
        const extracted = await extractText(
          req.file.buffer,
          req.file.mimetype,
          req.file.originalname
        );
        if (!extracted.ok) {
          // The service's message names the likely cause and the way out; pass it
          // through verbatim rather than flattening it to "bad file".
          res.status(400).json({ error: extracted.message, reason: extracted.reason });
          return;
        }
        text = extracted.text;
        fileName = req.file.originalname;
        fileMimeType = req.file.mimetype;
      } else {
        const body = req.body as { text?: string };
        if (typeof body.text !== "string") {
          res.status(400).json({ error: "Attach a file or write an answer" });
          return;
        }
        text = body.text;
      }

      const result = await progressService.submitWork(req.params.sid as string, req.memberId!, {
        text,
        fileName,
        fileMimeType,
      });
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
            outcome: result.outcome,
            passThreshold: result.passThreshold,
            scorePct: result.scorePct,
            alreadyComplete: result.alreadyComplete,
          },
          result
        )
      );
    } catch (error) {
      console.error("POST /outreach/courses/sections/:sid/work error:", error);
      res.status(500).json({ error: "Failed to save your submission" });
    }
  }
);

coursesRouter.get("/sections/:sid/work", async (req: Request, res: Response) => {
  try {
    const result = await progressService.listWorkSubmissions(req.params.sid as string, req.memberId!);
    if (isServiceError(result)) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json(result);
  } catch (error) {
    console.error("GET /outreach/courses/sections/:sid/work error:", error);
    res.status(500).json({ error: "Failed to load your submissions" });
  }
});
```

- [ ] **Step 3: Delete the old lit-review routes**

Remove the now-superseded `POST` and `GET` `/sections/:sid/lit-review` handlers. The frontend is
updated in Task 4.3 in the same session, and these are learner-session endpoints with no external
consumers, so there is nothing to deprecate gracefully.

- [ ] **Step 4: Verify and commit**

```bash
cd backend && npx tsc --noEmit
git add backend/src/api/courses.ts
git commit -m "feat(courses): add unified work-submission routes with file extraction"
```

### Task 4.2: Handout upload routes and the officer progress column

**Files:**
- Modify: `backend/src/api/courses.ts` (add handout routes near the slide routes; extend the progress query at `:1281-1340`)

**Interfaces:**
- Produces: `POST/DELETE /sections/:sid/handout`; progress matrix cells gain `workScorePct`, `workAttempts`, `workUngraded`.

- [ ] **Step 1: Add the handout routes**

```ts
const handoutUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
});

// The optional download on an ASSIGNMENT section — a rubric, a dataset, a
// starter template. Uploaded through the bot account and made link-readable
// server-side, which is the failure mode LitReviewBuilder's pasted-file-id
// field has today: an author who forgets to share the file ships every learner
// a sign-in wall.
coursesRouter.post(
  "/sections/:sid/handout",
  handoutUpload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const sid = req.params.sid as string;
      if (!(await requireSectionAccess(req, res, sid))) return;
      if (!req.file) { res.status(400).json({ error: "file is required" }); return; }

      const { Readable } = await import("node:stream");
      const drive = await import("../services/driveService.js");
      const folderId = await drive.ensureClubPmRootFolder();
      if (!folderId) { res.status(503).json({ error: "Drive is not configured" }); return; }

      const uploaded = await drive.uploadStreamToDrive(
        Readable.from(req.file.buffer),
        req.file.mimetype,
        req.file.originalname,
        folderId
      );
      if (!uploaded) { res.status(502).json({ error: "Could not upload to Drive" }); return; }
      await drive.makeDriveFilePublic(uploaded.fileId);

      const section = await prisma.courseSection.findUnique({
        where: { id: sid },
        select: { assignmentConfig: true },
      });
      // Spread the previous value — this column is never patched key-by-key.
      const next = {
        ...((section?.assignmentConfig ?? {}) as Record<string, unknown>),
        handoutDriveFileId: uploaded.fileId,
        handoutName: req.file.originalname,
        handoutMimeType: req.file.mimetype,
      };
      const saved = await courseService.updateSection(sid, { assignmentConfig: next });
      res.json(saved);
    } catch (error) {
      console.error("POST /outreach/courses/sections/:sid/handout error:", error);
      res.status(500).json({ error: "Failed to attach that handout" });
    }
  }
);

coursesRouter.delete("/sections/:sid/handout", async (req: Request, res: Response) => {
  try {
    const sid = req.params.sid as string;
    if (!(await requireSectionAccess(req, res, sid))) return;
    const section = await prisma.courseSection.findUnique({
      where: { id: sid },
      select: { assignmentConfig: true },
    });
    const prev = (section?.assignmentConfig ?? {}) as Record<string, unknown>;
    const fileId = typeof prev.handoutDriveFileId === "string" ? prev.handoutDriveFileId : "";
    if (fileId) {
      const drive = await import("../services/driveService.js");
      // Best-effort: a Drive delete that fails must not block clearing the
      // reference, or the section is stuck pointing at a file forever.
      await drive.deleteDriveFile(fileId).catch(() => false);
    }
    const saved = await courseService.updateSection(sid, {
      assignmentConfig: { ...prev, handoutDriveFileId: "", handoutName: "", handoutMimeType: "" },
    });
    res.json(saved);
  } catch (error) {
    console.error("DELETE /outreach/courses/sections/:sid/handout error:", error);
    res.status(500).json({ error: "Failed to remove that handout" });
  }
});
```

- [ ] **Step 2: Widen the officer progress query to both kinds**

At line ~1281, replace the `litSectionIds` / `litRows` / `latestLit` block:

```ts
    // Newest first, so the FIRST row seen for a (member, section) pair is that
    // member's latest attempt and every later row is a prior revision.
    const workSectionIds = sections
      .filter((s) => s.kind === "LIT_REVIEW" || s.kind === "ASSIGNMENT")
      .map((s) => s.id);
    const workRows = workSectionIds.length
      ? await prisma.courseWorkSubmission.findMany({
          where: { sectionId: { in: workSectionIds } },
          orderBy: { createdAt: "desc" },
          select: { sectionId: true, memberId: true, feedbackJson: true },
        })
      : [];
    const latestWork = new Map<string, { scorePct: number | null; attempts: number }>();
    for (const r of workRows) {
      const key = `${r.memberId}:${r.sectionId}`;
      const seen = latestWork.get(key);
      if (seen) { seen.attempts += 1; continue; }
      const fb = r.feedbackJson as { scorePct?: number } | null;
      latestWork.set(key, {
        // Null when grading never ran. Distinct from a score of 0, and the UI
        // must not conflate them — one is "not graded", the other is "graded
        // badly". Under a score gate the null case is the fail-open path: the
        // learner was passed through unscored and an officer should look.
        scorePct: typeof fb?.scorePct === "number" ? fb.scorePct : null,
        attempts: 1,
      });
    }
```

Then replace the per-section cell loop:

```ts
        for (const s of sections) {
          if (s.kind !== "LIT_REVIEW" && s.kind !== "ASSIGNMENT") continue;
          const work = latestWork.get(`${e.memberId}:${s.id}`);
          if (!work) continue;
          cells[s.id]!.workScorePct = work.scorePct;
          cells[s.id]!.workAttempts = work.attempts;
          // Completed on a gated section with no score = fail-open. Officers
          // review these; nobody else can tell them apart from a real pass.
          cells[s.id]!.workUngraded =
            s.passThreshold != null &&
            work.scorePct == null &&
            cells[s.id]!.status === "COMPLETED";
        }
```

Update the `cells` type annotation to `workScorePct?: number | null; workAttempts?: number; workUngraded?: boolean;` and add `passThreshold: true` to the `sections` select if it is not already there.

- [ ] **Step 3: Verify and commit**

```bash
cd backend && npx tsc --noEmit
git add backend/src/api/courses.ts
git commit -m "feat(courses): add handout upload routes and officer gating column"
```

### Task 4.3: Client wrappers

**Files:**
- Modify: `src/api/clubPmClient.js:640-644`

**Interfaces:**
- Produces: `submitWork(sectionId, { text, file })`, `listWorkSubmissions(sectionId)`, `uploadAssignmentHandout(sectionId, file)`, `deleteAssignmentHandout(sectionId)`. Consumed by Phases 5 and 6.

- [ ] **Step 1: Replace the lit helpers**

```js
// A LIT_REVIEW or ASSIGNMENT submission. A File goes up as multipart so the
// backend can extract its text; a pasted answer goes up as JSON. Never base64 —
// the backend's express.json() limit is 100 kb.
export const submitWork = (sectionId, { text, file } = {}) => {
  if (file) {
    const form = new FormData();
    form.append('file', file);
    return post(`/api/outreach/courses/sections/${sectionId}/work`, form);
  }
  return post(`/api/outreach/courses/sections/${sectionId}/work`, { text });
};
export const listWorkSubmissions = (sectionId) =>
  get(`/api/outreach/courses/sections/${sectionId}/work`);

export const uploadAssignmentHandout = (sectionId, file) => {
  const form = new FormData();
  form.append('file', file);
  return post(`/api/outreach/courses/sections/${sectionId}/handout`, form);
};
export const deleteAssignmentHandout = (sectionId) =>
  del(`/api/outreach/courses/sections/${sectionId}/handout`);
```

- [ ] **Step 2: Confirm `post()` handles FormData**

Read `src/api/clubPmClient.js`'s `post` helper. If it unconditionally sets `Content-Type: application/json` and calls `JSON.stringify`, add a `FormData` branch that passes the body through untouched and **omits the Content-Type header entirely** — the browser must set it so the multipart boundary is included. Follow whatever pattern `uploadVaultFile()` already uses in this file.

- [ ] **Step 3: Verify and commit**

```bash
npm run build
git add src/api/clubPmClient.js
git commit -m "feat(courses): add work-submission and handout client wrappers"
```

---

## Phase 5 — Learner UI

**Context for this session:** `src/components/clubpm/courses/` and `CoursePlayerPage.jsx`. Read spec §7. Do not touch the builder — that is Phase 6.

### Task 5.1: `AssignmentSection` component

**Files:**
- Create: `src/components/clubpm/courses/AssignmentSection.jsx`
- Modify: `public/clubpm-theme.css` (append `.pm-assign-*` rules at the bottom)

**Interfaces:**
- Consumes: `submitWork`, `listWorkSubmissions` (Task 4.3); `section.assignmentConfig`, `section.passThreshold` from the learner payload (Task 3.2).
- Produces: default-exported `<AssignmentSection section preview onSubmitted />`.

- [ ] **Step 1: Build the component**

Create `src/components/clubpm/courses/AssignmentSection.jsx`. It shares `LitReviewSection`'s data flow
(load history on mount, submit, reload) and its `VERDICT_META` map:

```jsx
import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { submitWork, listWorkSubmissions } from '../../../api/clubPmClient';

const wordsIn = (text) => String(text ?? '').trim().split(/\s+/).filter(Boolean).length;

const VERDICT_META = {
  caught:  { label: 'Caught it', icon: 'fas fa-circle-check' },
  partial: { label: 'Partly',    icon: 'fas fa-circle-half-stroke' },
  missed:  { label: 'Missed',    icon: 'fas fa-circle-xmark' },
};

const ACCEPT = '.pdf,.docx,.txt,.md';

/**
 * Context, an optional handout, and a place to turn work in.
 *
 * The score is rendered ONLY when the section is gated (`passThreshold` is set),
 * matching LitReviewSection. Ungated, a visible number would invent a pass/fail
 * the design does not have; gated, withholding it would leave a learner told
 * "not yet" with no idea how far off they are.
 */
export default function AssignmentSection({ section, preview, onSubmitted }) {
  const config = section.assignmentConfig ?? {};
  const minWords = config.minWords ?? 150;
  const gated = section.passThreshold != null;

  const [mode, setMode] = useState('upload');   // 'upload' | 'paste'
  const [file, setFile] = useState(null);
  const [text, setText] = useState('');
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(!preview);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (preview) { setLoading(false); return; }
    try {
      const res = await listWorkSubmissions(section.id);
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
  // A file's word count is unknown until the server extracts it, so the upload
  // path gates on "a file is chosen" rather than on a count.
  const canSubmit = mode === 'upload' ? !!file : words >= minWords;

  const handleSubmit = async () => {
    if (!canSubmit || saving) return;
    setSaving(true);
    try {
      const res = await submitWork(section.id, mode === 'upload' ? { file } : { text });
      setFile(null);
      setText('');
      await load();
      if (res?.outcome === 'BLOCKED') {
        // Neutral, never toast.error — the learner did the work, it just did not
        // clear the bar yet, and there are unlimited revisions.
        toast('Not quite yet — read the feedback below and submit a revision.');
      } else if (res?.outcome === 'COMPLETE_UNGRADED') {
        toast('Submitted. Feedback is still pending — this section is complete either way.');
      } else if (gated) {
        toast.success('Submitted — you have passed this section.');
      } else {
        toast.success('Submitted — feedback below.');
      }
      onSubmitted?.();
    } catch (err) {
      toast.error(err?.message ?? 'Could not save your submission');
    } finally {
      setSaving(false);
    }
  };

  const latest = submissions[0] ?? null;
  const score = latest?.feedback?.scorePct ?? null;
  const passed = gated && typeof score === 'number' && score >= section.passThreshold;

  return (
    <div className="pm-assign">
      {config.handoutDriveFileId && (
        <a
          className="pm-assign-handout"
          href={`https://drive.google.com/uc?export=download&id=${config.handoutDriveFileId}`}
          target="_blank"
          rel="noreferrer"
        >
          <i className="fas fa-file-arrow-down" aria-hidden="true" />
          <span>{config.handoutName || 'Download the handout'}</span>
        </a>
      )}

      {config.promptText && <p className="pm-assign-prompt">{config.promptText}</p>}

      {gated && (
        <p className="pm-assign-gate">
          <i className="fas fa-lock" aria-hidden="true" />
          {' '}You need {section.passThreshold}% to continue. Revise and resubmit as many times as
          you like — every attempt is kept.
        </p>
      )}

      {preview ? (
        <p className="pm-assign-empty">
          <i className="fas fa-eye" aria-hidden="true" /> Author preview — submissions are not recorded.
        </p>
      ) : (
        <>
          <div className="pm-assign-composer">
            <div className="pm-assign-tabs" role="tablist">
              <button
                type="button" role="tab" aria-selected={mode === 'upload'}
                className={mode === 'upload' ? 'is-active' : undefined}
                onClick={() => setMode('upload')}
              >
                <i className="fas fa-paperclip" aria-hidden="true" /> Upload a file
              </button>
              <button
                type="button" role="tab" aria-selected={mode === 'paste'}
                className={mode === 'paste' ? 'is-active' : undefined}
                onClick={() => setMode('paste')}
              >
                <i className="fas fa-keyboard" aria-hidden="true" /> Write it here
              </button>
            </div>

            {mode === 'upload' ? (
              <div className="pm-assign-drop">
                <input
                  type="file"
                  accept={ACCEPT}
                  aria-label="Your submission"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <small>PDF, Word .docx, or plain text. We read the text out of it to grade it.</small>
              </div>
            ) : (
              <>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={16}
                  placeholder="Write your answer here."
                  aria-label="Your submission"
                />
                <span className={words < minWords ? 'pm-assign-count is-short' : 'pm-assign-count'}>
                  {words} / {minWords} words
                </span>
              </>
            )}

            <button
              type="button"
              className="clubpm-btn-primary"
              onClick={handleSubmit}
              disabled={!canSubmit || saving}
            >
              {saving ? 'Sending…' : latest ? 'Submit a revision' : 'Submit'}
            </button>
          </div>

          {loading && <p className="pm-assign-empty">Loading your submissions…</p>}

          {!loading && latest && (
            <div className="pm-assign-feedback">
              <h3>
                <i className="fas fa-comment-dots" aria-hidden="true" /> Feedback on your latest submission
              </h3>

              {gated && typeof score === 'number' && (
                <p className={passed ? 'pm-assign-score is-pass' : 'pm-assign-score is-short'}>
                  <strong>{score}%</strong> · {section.passThreshold}% to pass
                  {!passed && ' — not yet. The points below are where the marks are.'}
                </p>
              )}

              {!latest.feedback ? (
                <p className="pm-assign-empty">
                  Feedback is still pending. This section is already complete — submit a
                  revision later to try again.
                </p>
              ) : (
                <>
                  {latest.feedback.overall && (
                    <p className="pm-assign-overall">{latest.feedback.overall}</p>
                  )}
                  <ul className="pm-assign-points">
                    {latest.feedback.points.map((p) => {
                      const meta = VERDICT_META[p.verdict] ?? VERDICT_META.missed;
                      return (
                        <li key={p.id} className={`pm-assign-point is-${p.verdict}`}>
                          <span className="pm-assign-point-verdict">
                            <i className={meta.icon} aria-hidden="true" /> {meta.label}
                          </span>
                          <span className="pm-assign-point-comment">{p.comment}</span>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>
          )}

          {!loading && submissions.length > 1 && (
            <details className="pm-assign-history">
              <summary>
                {submissions.length - 1} earlier submission{submissions.length === 2 ? '' : 's'}
              </summary>
              {submissions.slice(1).map((s) => (
                <article key={s.id}>
                  <h4>
                    {new Date(s.createdAt).toLocaleString()} · {s.wordCount} words
                    {s.fileName ? ` · ${s.fileName}` : ''}
                  </h4>
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

- [ ] **Step 2: Style it**

Append to the bottom of `public/clubpm-theme.css` under a `/* === Course assignment sections === */`
header. Reuse the existing `.pm-lit-*` visual language (they sit in the same player) with
`.pm-assign-` prefixes. Use only tokens declared on `.clubpm-app`: `--pm-surface`, `--pm-elevated`,
`--pm-accent-teal`, `--pm-accent-amber`, `--pm-text-muted`. **Grep the `.clubpm-app { … }` block for
any token before using it** — `search-theme.css`'s `:root` does not declare `--color-text-muted`, and
assuming a token exists has cost this repo real debugging time.

- [ ] **Step 3: Verify**

```bash
npm run build
```

Expected: builds clean, no unused-import warnings.

- [ ] **Step 4: Commit**

```bash
git add src/components/clubpm/courses/AssignmentSection.jsx public/clubpm-theme.css
git commit -m "feat(courses): add the learner assignment section"
```

### Task 5.2: Wire it into the player and show gated scores on lit reviews

**Files:**
- Modify: `src/pages/ClubPM/CoursePlayerPage.jsx:9` (import), `:386-420` (dispatch)
- Modify: `src/components/clubpm/courses/LitReviewSection.jsx`

- [ ] **Step 1: Dispatch `ASSIGNMENT` in the player**

Import `AssignmentSection` beside `LitReviewSection`. Add, immediately after the `LIT_REVIEW` blocks:

```jsx
              {selected.kind === 'ASSIGNMENT' && selected.contentJson && (
                <SectionBody doc={selected.contentJson} />
              )}

              {selected.kind === 'ASSIGNMENT' && (
                <AssignmentSection
                  section={selected}
                  preview={course.preview}
                  onSubmitted={reload}
                />
              )}
```

Use whatever the surrounding `LIT_REVIEW` block at line 386 actually uses to render `contentJson` and
whatever it passes as `onSubmitted` — match it exactly rather than inventing names.

- [ ] **Step 2: Exclude `ASSIGNMENT` from the generic content block**

Line ~411 currently reads `selected.kind !== 'QUIZ' && selected.kind !== 'LIT_REVIEW' && selected.contentJson`.
Add `&& selected.kind !== 'ASSIGNMENT'`, or the context body renders twice.

- [ ] **Step 3: Point `LitReviewSection` at the new client helpers**

Swap `submitLitReview(section.id, text)` → `submitWork(section.id, { text })` and
`listLitSubmissions` → `listWorkSubmissions`.

- [ ] **Step 4: Show the score on a gated lit review**

In `LitReviewSection.jsx`, update the doc comment — its current text says the score is deliberately
never rendered, which stops being true here:

```jsx
/**
 * A paper, a composer, and the feedback on what the learner wrote.
 *
 * The score is rendered ONLY when the section is gated (`passThreshold` is set).
 * On an ungated section it stays hidden, because completion is gated on effort
 * and a visible number would re-establish a gate the design deliberately does
 * not have — a member who saw "48%" would read it as a fail no matter what the
 * copy said. Under a real gate the opposite is true: withholding the number
 * leaves a learner told "not yet" with no way to know how far off they are.
 * Officers see the score for both cases in the course progress view.
 */
```

Then render the score block and handle `outcome` on submit, exactly as in Task 5.1 step 1 items 3
and 5.

- [ ] **Step 5: Verify and commit**

```bash
npm run build
git add src/pages/ClubPM/CoursePlayerPage.jsx src/components/clubpm/courses/LitReviewSection.jsx
git commit -m "feat(courses): dispatch assignment sections and show gated scores"
```

---

## Phase 6 — Author UI

**Context for this session:** `src/components/clubpm/courses/` builders, `CourseEditorPage.jsx`, `CourseSectionRail.jsx`, `CourseProgressDashboard.jsx`.

### Task 6.1: Extract the shared rubric editor

**Files:**
- Create: `src/components/clubpm/courses/RubricEditor.jsx`
- Modify: `src/components/clubpm/courses/LitReviewBuilder.jsx:104-144`

**Interfaces:**
- Produces: `<RubricEditor points={[{id,point,weight}]} onChange={(next) => …} placeholder="…" />`, default export. Consumed by Task 6.2.

- [ ] **Step 1: Move the `<fieldset className="pm-lit-builder-rubric">` block into `RubricEditor.jsx`**

Keep `emptyPoint()` (the `r${Date.now().toString(36)}` id generator) and the trailing `<small>` that
explains why ids never change — that note is why feedback survives a reword, and it belongs with the
control.

- [ ] **Step 2: Use it from `LitReviewBuilder`**

Replace the inlined fieldset with `<RubricEditor points={cfg.rubric} onChange={(rubric) => set('rubric', rubric)} />`.

- [ ] **Step 3: Add the pass-threshold field to `LitReviewBuilder`**

Beside the "Minimum words" field:

```jsx
      <label>
        Pass mark (%)
        <input
          type="number"
          min="0"
          max="100"
          value={cfg.passThreshold ?? ''}
          onChange={(e) => set('passThreshold', e.target.value === '' ? null : Number(e.target.value))}
        />
        <small>
          Leave blank for no gate — the section completes on effort and the learner never sees a
          score, which is how every existing section behaves. Set a number and the learner must
          reach it to continue; they will see their score, and they can revise as many times as
          they like. If AI grading is unavailable the submission passes anyway and is flagged for
          your review, so an outage never strands anyone.
        </small>
      </label>
```

`passThreshold` is a **column on the section**, not a key inside `litConfig` — save it through the
section-update path the builder already uses for `title`, not through `onSave`'s config object.
Check how `CourseEditorPage` passes `onSave` and thread a second `onSaveSection` prop if needed.

- [ ] **Step 4: Verify and commit**

```bash
npm run build
git add src/components/clubpm/courses/RubricEditor.jsx src/components/clubpm/courses/LitReviewBuilder.jsx
git commit -m "refactor(courses): extract RubricEditor and add lit-review pass mark"
```

### Task 6.2: `AssignmentBuilder`

**Files:**
- Create: `src/components/clubpm/courses/AssignmentBuilder.jsx`
- Modify: `src/pages/ClubPM/CourseEditorPage.jsx`, `src/components/clubpm/courses/CourseSectionRail.jsx`

- [ ] **Step 1: Build the builder**

Model on `LitReviewBuilder.jsx`. Fields, in order: prompt text (textarea), handout (file input →
`uploadAssignmentHandout`, showing the current `handoutName` with a remove button →
`deleteAssignmentHandout`), minimum words, pass mark (same copy as Task 6.1 step 3), then an `<hr />`
and the author-only warning banner reading exactly as `LitReviewBuilder`'s does, then reference answer
(textarea) and `<RubricEditor />`.

Validation before save: prompt text required, reference answer required, at least one non-empty rubric
point — mirroring `LitReviewBuilder.handleSave`. Save via
`onSave({ ...initial, ...cfg, rubric, minWords: Number(cfg.minWords) || 150 })`, spreading the previous
value so the handout keys written by the upload route are not clobbered.

- [ ] **Step 2: Register the kind in the editor**

In `CourseEditorPage.jsx`, add `ASSIGNMENT` to the section-kind picker (label: "Assignment") and mount
`<AssignmentBuilder>` where `<LitReviewBuilder>` is mounted for `LIT_REVIEW`. Grep for `LIT_REVIEW` in
that file and mirror every hit.

- [ ] **Step 3: Add the rail icon**

In `CourseSectionRail.jsx`, find the kind→icon map and add `ASSIGNMENT: 'fas fa-file-pen'`.

- [ ] **Step 4: Verify and commit**

```bash
npm run build
git add src/components/clubpm/courses/AssignmentBuilder.jsx src/pages/ClubPM/CourseEditorPage.jsx src/components/clubpm/courses/CourseSectionRail.jsx
git commit -m "feat(courses): add the assignment builder and register the kind"
```

### Task 6.3: Officer progress dashboard

**Files:**
- Modify: `src/components/clubpm/courses/CourseProgressDashboard.jsx`

- [ ] **Step 1: Rename the cell fields and add the flag**

Grep for `litScorePct` / `litAttempts` and rename to `workScorePct` / `workAttempts` to match Task 4.2.

- [ ] **Step 2: Render the fail-open badge**

Where a cell shows a score, add:

```jsx
{cell.workUngraded && (
  <span className="pm-assign-ungraded" title="Passed without a score — AI grading was unavailable. Worth a manual read.">
    <i className="fas fa-triangle-exclamation" aria-hidden="true" /> Ungraded
  </span>
)}
```

`workScorePct === null` and `workScorePct === 0` must stay visually distinct — one is "never graded",
the other is "graded badly". Render `null` as `—`, never as `0%`.

- [ ] **Step 3: Style, verify, commit**

Append `.pm-assign-ungraded` to `public/clubpm-theme.css` using `--pm-accent-amber`.

```bash
npm run build
git add src/components/clubpm/courses/CourseProgressDashboard.jsx public/clubpm-theme.css
git commit -m "feat(courses): surface gated scores and fail-open flags to officers"
```

---

## Phase 7 — Seeder support and the first migrated exercise

**Context for this session:** `backend/scripts/seedCourses.ts` and `docs/courses/ares-101/`. Read spec §8.

### Task 7.1: Teach the seeder to read assignment frontmatter

**Files:**
- Modify: `backend/scripts/seedCourses.ts:48-115` (`readLitConfig`), `:170-230` (the section loop)

**Interfaces:**
- Produces: `parseFrontmatter(file)` → `{ front: string; body: string }`, `parseRubricBlock(front)`, `parseBlockScalar(front, key)`, `readAssignmentConfig(file)`.

- [ ] **Step 1: Extract the shared frontmatter helpers**

Pull the scalar reader, the rubric-block parser, and the block-scalar reader out of `readLitConfig`
into standalone functions, and have `readLitConfig` call them.

**Do not retype the rubric regex.** Move it verbatim, with its comment. That comment documents a real
bug: `\Z` is not a JavaScript escape, so it matched a literal `Z` and silently truncated a rubric at
any capital Z in a point ("send Z", "Van der Hegge Zijnen"). A retyped copy will reintroduce it.

Also return the **body** (everything after the closing `---`), which `readLitConfig` currently discards
but `readAssignmentConfig` needs as the learner-facing context.

- [ ] **Step 2: Add `readAssignmentConfig`**

```ts
/**
 * Read an `exercises/E0n-*.md` file into an assignmentConfig plus its body.
 *
 * Unlike readLitConfig, the BODY IS INSTALLED: for an assignment it is the
 * learner-facing context that sets up the work, not author material. Only the
 * frontmatter's referenceAnswer and rubric are withheld, and they are withheld
 * by courseProgressService building the learner payload from safe keys — not by
 * anything here.
 */
function readAssignmentConfig(file: string): {
  config: Record<string, unknown>;
  body: string;
  passThreshold: number | null;
} {
  const { front, body } = parseFrontmatter(file);
  const scalar = (key: string) => readScalar(front, key);
  const minWords = Number(scalar("minWords"));
  const threshold = Number(scalar("passThreshold"));
  const rubric = parseRubricBlock(front);
  const referenceAnswer = parseBlockScalar(front, "referenceAnswer");

  // Fail the seed loudly rather than install a section that grades against
  // nothing — same rule as readLitConfig.
  if (!rubric.length) throw new Error(`${path.basename(file)}: no rubric points`);
  if (!referenceAnswer) throw new Error(`${path.basename(file)}: no referenceAnswer`);

  return {
    config: {
      promptText: scalar("promptText"),
      handoutDriveFileId: scalar("handoutDriveFileId"),
      handoutName: scalar("handoutName"),
      handoutMimeType: scalar("handoutMimeType"),
      minWords: Number.isFinite(minWords) && minWords > 0 ? minWords : 150,
      referenceAnswer,
      rubric,
    },
    body,
    passThreshold: Number.isFinite(threshold) && threshold > 0 ? threshold : null,
  };
}
```

- [ ] **Step 3: Handle the kind in the section loop**

Beside the existing `LIT_REVIEW` branches (~line 204):

```ts
      if (s.kind === "ASSIGNMENT" && s.assignmentRef) {
        const file = resolveRef(dir, doc.slug, s.assignmentRef);
        if (file) {
          const { config, body, passThreshold } = readAssignmentConfig(file);
          data.assignmentConfig = config;
          data.contentJson = courseBodyToDoc(body);
          // course.json's explicit passThreshold wins; the file's is the default.
          if (s.passThreshold == null && passThreshold != null) {
            data.passThreshold = passThreshold;
          }
        }
      }
```

Add `assignmentRef?: string` to the section type in this file's `course.json` shape.

- [ ] **Step 4: Verify**

```bash
cd backend && npx tsc --noEmit && npm run check:courses
```

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/seedCourses.ts
git commit -m "feat(courses): teach the seeder to read assignment frontmatter"
```

### Task 7.2: Migrate E08 as the worked example

**Files:**
- Modify: `docs/courses/ares-101/exercises/E08-write-an-analysis-plan.md`
- Modify: `docs/courses/ares-101/course.json:498-505`

- [ ] **Step 1: Read the exercise in full**

Read `E08-write-an-analysis-plan.md` end to end, plus `content/C22-*.md` (the article it depends on)
and `lit/L11-herrick-protocol.md` (whose rubric shape you are matching). E08 is the best-suited of the
seven: its deliverable is a one-page written analysis plan, which is exactly what an ASSIGNMENT grades.

- [ ] **Step 2: Copy the self-check section into `referenceAnswer` — do not move it**

E08's `## Self-check — synthetic outcomes` (line ~196) is **learner-facing and stays in the body**,
behind its "do not read until your plan is written" instruction. Copy it into `referenceAnswer` as
ground truth for grading, alongside a prose statement of what a good plan contains.

This duplication is deliberate — see spec §8.1. The body keeps its self-check; the config gets a copy
so grading has something to judge against. Never *move* an answer section out of a body: E01's header
states the reasoning for keeping them in place, and it applies to all of them.

- [ ] **Step 3: Add the frontmatter**

Prepend a `---` block with `promptText`, `minWords: 300`, `passThreshold: 70`, a `rubric:` list, and a
`referenceAnswer: |` block scalar. Match `L11`'s formatting exactly: two-space indentation under
`rubric:`, quoted `point:` values, `referenceAnswer` last so it can run to the closing `---` without
escaping.

The rubric must reward the thing this exercise exists for — **stating what result would count as not
supporting the hypothesis** — with the highest weight. Draw the other points from the exercise's own
stated requirements (the three 3.6.9 items: which CO₂ metrics, how spatial distribution is quantified,
what statistical comparisons).

- [ ] **Step 4: Flip the section in `course.json`**

```json
        {
          "order": 3,
          "title": "Exercise: write an analysis plan",
          "kind": "ASSIGNMENT",
          "isRequired": true,
          "assignmentRef": "exercises/E08-write-an-analysis-plan.md"
        }
```

- [ ] **Step 5: Seed and verify end to end**

```bash
cd backend && npm run seed:courses
```

Then start the app, open the section as a learner, and confirm: the context body renders, the composer
accepts a pasted answer, grading returns per-point feedback, a below-threshold score leaves the section
blocked, and a passing score unlocks the next one.

- [ ] **Step 6: Commit**

```bash
git add docs/courses/ares-101/exercises/E08-write-an-analysis-plan.md docs/courses/ares-101/course.json
git commit -m "feat(ares-101): convert E08 to an assignment section"
```

---

## Phase 8 — Migrate the remaining six exercises

**Context for this session:** `docs/courses/ares-101/` only. No code changes. This is subject-matter writing.

**⚠ These rubrics and reference answers are DRAFTS.** They encode claims about ARES physics drawn from
the course text alone. They must be reviewed by the ARES team before the course is published. A section
whose rubric is empty grades as `null`, which under a gate means fail-open — so a half-reviewed
migration degrades to today's behaviour rather than blocking anyone.

**Four of these six get NO gate.** See spec §8.1. E01, E02, E04 and E05 publish their answers in the
learner-facing body by design, so a `passThreshold` on them would be a control that controls nothing.
They still become `ASSIGNMENT` sections — submission recorded, feedback returned — with
`passThreshold: null`. Only E06 and E07 are gated.

**Answer keys are COPIED into `referenceAnswer`, never moved.** Grading needs ground truth even on an
ungated section, because feedback is the whole point there. The body keeps its key; the config gets a
copy. E01's header states why the keys stay put: *"Do not move them to a second file; a learner who has
to go looking will not check their work."*

**`E03-measure-the-delay.md` does not exist.** `course.json:264` references it. Leave both alone —
writing a missing exercise is a separate content task.

### Task 8.1 – 8.6: One task per exercise

Repeat Task 7.2's steps for each, in this order. Each is its own task and its own commit.

| Task | File | Module | Depends on | Gate | Answer section in body |
|---|---|---|---|---|---|
| 8.1 | `E01-exposure-from-a-session.md` | M4 | `C15`, `GLOSSARY.md` §5 | none | `## Answers` (~111) |
| 8.2 | `E02-bench-test-a-sensor.md` | M5 | `C16`, `V14` | none | `## Answers — the worked example` (~252) |
| 8.3 | `E04-pump-disturbance-threshold.md` | M7 | `C18`, `C17`, `C13` | none | `## One worked attempt` (~186) |
| 8.4 | `E05-run-the-models.md` | M8 | `C19`, `C13` | none | `## Answers` (~232) |
| 8.5 | `E06-trace-a-reading.md` | M9 | `C20`, `C16` | **70** | none |
| 8.6 | `E07-run-a-calibration.md` | M10 | `C21`, `V17`, `C16` | **70** | none |

Rubric guidance, drawn from each exercise's own stated purpose:

- **E01** — dosimetry arithmetic against `C15`'s tiers and thresholds. Weight the *method* and the
  stated assumptions above the arithmetic; a right number from a wrong method is not the skill.
- **E02** — a real bench procedure (deliverable subtasks 2.3.7 and 2.5.2) written to be run. Weight
  whether a reader could audit a session against what was written, and whether the warm-up window and
  the `.` multiplier from `C16` are handled.
- **E04** — **open question 3 from `ARES_7_30_26.pptx` slide 11, handed over unmodified. Nobody on the
  ARES team has answered it, and there is no correct number.** The rubric judges the *argument*: does
  it engage `C17`'s 0.67 L/min per-pod split and 3.0 mm bore, does it compare against `C13`'s
  0.3–0.4 m/s plume, does it state its assumptions and their direction of error. `referenceAnswer` is
  a copy of the file's "one worked attempt" plus a statement of what makes an attempt defensible —
  explicitly *not* a key. The answer goes back to the ARES team; say so in `promptText`.
- **E05** — three paths, and everybody does the hand computation regardless of which they took, because
  the hand computation is the exercise. Weight interpretation over the numbers.
- **E06** — a pure reading exercise across two repos (`ARES2ESP32` `src/main.cpp` and `app/lib/`, plus
  this course). No code is written or run. Weight completeness of the chain from sensor to screen, and
  naming where error enters at each hop.
- **E07** — requires the headset, a paired phone, and physically going outside. Weight the offset-versus-
  span distinction and the fresh-air assumption from `C21`. The rubric should treat pressing **ABC ON**
  as a substantive error, not a slip: `C21` explains why, and the exercise warns about it twice.

For each:

- [ ] Read the exercise in full, plus every `content/C*.md` article named in the dependency table above
- [ ] **Copy** any answer section into `referenceAnswer`; leave the body untouched
- [ ] Add the frontmatter block, matching `L11`'s formatting exactly
- [ ] Set `passThreshold` per the Gate column — omit the key entirely for the ungated four
- [ ] Flip `kind` to `ASSIGNMENT` and `bodyRef` to `assignmentRef` in `course.json`
- [ ] Run `cd backend && npm run seed:courses` and confirm the section installs with no pending-ref warning
- [ ] Commit: `git commit -m "feat(ares-101): convert E0n to an assignment section"`

### Task 8.7: Update the course documentation

**Files:**
- Modify: `docs/courses/ares-101/README.md`, `CLAUDE.md`

- [ ] **Step 1: Update the course README**

Grep `docs/courses/ares-101/README.md` for "exercise" and "CONTENT" and rewrite the sections that
describe exercises as read-only content. They are now submitted and graded, and the README is
someone's teaching material.

- [ ] **Step 2: Update `CLAUDE.md`**

Add `ASSIGNMENT` to any list of section kinds, note `documentTextService.ts` and `assignmentService.ts`
under the services list, and record that `pdf-parse` must be imported from `pdf-parse/lib/pdf-parse.js`.

- [ ] **Step 3: Final verification**

```bash
npm run build && cd backend && npx tsc --noEmit
cd backend && npx tsx src/services/assignmentService.test.ts
cd backend && npx tsx src/services/rubricGrading.test.ts
cd backend && npx tsx src/services/documentTextService.test.ts
cd backend && npx tsx src/services/courseProgressService.test.ts
node scripts/check-tour-anchors.js
```

Expected: all clean.

- [ ] **Step 4: Commit**

```bash
git add docs/courses/ares-101/README.md CLAUDE.md
git commit -m "docs: record assignment sections in the course README and CLAUDE.md"
```
