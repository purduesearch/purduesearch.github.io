# ASSIGNMENT sections and opt-in score gating — design

**Date:** 2026-08-23
**Status:** Approved, ready for implementation
**Affects:** `backend/` (Prisma, courses API, course services), `src/` (ClubPM course player + editor), `docs/courses/ares-101/`

---

## 1. What this builds

A new course section kind, `ASSIGNMENT`, made of three stacked parts:

1. **Context** — a rich-text body, authored exactly like a `CONTENT` section, that sets up the work.
2. **Handout** *(optional)* — one downloadable file: a rubric, a dataset, a starter template.
3. **Submission** — the learner uploads a document (PDF / DOCX / TXT / MD) or pastes text. Uploads are
   converted to plain text, graded against an author-written rubric by the same Gemini path
   `LIT_REVIEW` already uses, and returned as per-point feedback.

Plus a cross-cutting change: **opt-in score gating** on both `ASSIGNMENT` and `LIT_REVIEW`. When an
author sets a pass threshold, a learner does not advance until they clear it.

## 2. Why the gating change needs justifying

`LIT_REVIEW` today deliberately does *not* gate on score, and two comments say so explicitly:

- `courseProgressService.submitLitReview` writes the submission and marks the section `COMPLETED`
  *before* calling Gemini, because "Completion is gated on effort by design; if a third-party model
  outage could hold it up, the score would be a gate after all."
- `LitReviewSection.jsx` hides the score from the learner, because "a member who saw '48%' would read
  it as a fail no matter what the copy said."

Both are correct *given no gate exists*. This design adds a gate, so it must answer what those
comments were protecting against. It does, in three ways:

1. **The gate is opt-in and off by default.** `passThreshold` is `null` on every existing section, and
   `null` means "no gate". Every ares-101 `LIT_REVIEW` section behaves exactly as it does today.
2. **A grading failure can never block a learner** (§5, fail-open). The write-before-grade ordering is
   *kept*, which is what makes fail-open real rather than aspirational.
3. **The score becomes visible exactly when a gate exists.** The reason for hiding it — that a number
   invents a pass/fail where none exists — stops applying the moment a real threshold does exist.
   Under a gate, hiding the score would leave a learner told "not yet" with no way to know how far off
   they are.

## 3. Data model

### 3.1 New enum value

```prisma
enum CourseSectionKind {
  CONTENT
  VIDEO
  QUIZ
  SLIDES
  WALKTHROUGH
  LIT_REVIEW
  ASSIGNMENT   // new
}
```

### 3.2 New column: `CourseSection.assignmentConfig`

Follows the established one-JSON-column-per-kind idiom (`videoConfig` / `slideConfig` / `tourConfig` /
`litConfig`), including its rule: **every writer spreads the previous value**, so a partial save cannot
drop keys it does not own.

```ts
interface AssignmentConfig {
  promptText: string;          // the instruction shown under the context body
  handoutDriveFileId: string;  // "" when no handout
  handoutName: string;
  handoutMimeType: string;
  minWords: number;            // effort floor, default 150
  referenceAnswer: string;     // AUTHOR-ONLY
  rubric: { id: string; point: string; weight: number }[];  // AUTHOR-ONLY
}
```

`referenceAnswer` and `rubric` are withheld from learners by `sanitizeAssignmentConfig()`, which is
built **by construction** from the safe keys rather than by deleting the secret ones — copying
`sanitizeLitConfig`'s reasoning verbatim, so that a future author-side key does not ship to every
learner by default.

### 3.3 Submission storage: generalize, do not duplicate

`CourseLitSubmission` already holds exactly what an assignment submission needs — a per-attempt row
never updated in place, with `text`, `wordCount`, `feedbackJson`, `gradedAt` — and the officer progress
matrix already reads it. Rather than add a near-identical second model plus a duplicate
service/API/history/officer path, the model is **renamed** and given two nullable columns:

```prisma
model CourseWorkSubmission {
  // ...unchanged fields...
  fileName     String?   // null when the learner pasted text
  fileMimeType String?

  @@map("CourseLitSubmission")
}
```

`@@map` pins the table name, so **the rename emits no DDL**. The migration is purely two
`ADD COLUMN`s. The relation field on `CourseSection` becomes `workSubmissions`.

The uploaded file itself is **discarded after extraction** — only the extracted text is stored.
`fileName` / `fileMimeType` are kept so an officer can see *what* was turned in.

### 3.4 Gating uses an existing column

`CourseSection.passThreshold` already exists and is currently QUIZ-only. It is reused as-is:

- `null` → no gate (current behaviour for every existing section)
- non-null → the learner must score at least this percentage to advance

No new column. `isSectionUnlocked` keys purely on `status === "COMPLETED"` and **needs no change at
all** — the entire gate is a question of when `COMPLETED` gets written.

## 4. Text extraction

New service: `backend/src/services/documentTextService.ts`. One responsibility, no DB access.

```ts
type ExtractResult =
  | { ok: true; text: string }
  | { ok: false; reason: "UNSUPPORTED" | "EMPTY" | "FAILED"; message: string };

export async function extractText(
  buffer: Buffer, mimeType: string, fileName: string
): Promise<ExtractResult>;
```

| Input | Handling |
|---|---|
| `application/pdf` | `pdf-parse` |
| `.docx` (`…wordprocessingml.document`) | `mammoth` raw text |
| `text/plain`, `text/markdown`, `.md` | `buffer.toString("utf8")` |
| legacy `.doc`, `.pages`, images, anything else | `UNSUPPORTED`, with a message naming the fix |

Two new backend dependencies, both pure JS with no native build step: `pdf-parse` and `mammoth`.
`pdf-parse` must be imported as `pdf-parse/lib/pdf-parse.js`; importing the package root runs a
bundled debug test-file read that throws in production.

**The scanned-PDF trap gets an explicit guard.** A scanned or photographed PDF extracts to roughly
nothing. Left alone it would submit as an empty answer and grade as a zero — and under a gate that is a
learner blocked by a file format they cannot diagnose. Extraction yielding fewer than `minWords`
returns `EMPTY` and the submission is refused *before* Gemini is called, with a message that names the
likely cause and the two ways out (a text-based PDF, or pasting the answer).

Extracted text is clamped to 60,000 characters before it reaches a prompt.

## 5. Completion and gating logic

The decision is isolated as one pure function so it can be tested exhaustively:

```ts
export type CompletionOutcome = "COMPLETE" | "BLOCKED" | "COMPLETE_UNGRADED";

export function decideCompletion(input: {
  passThreshold: number | null;
  hasFeedback: boolean;
  scorePct: number | null;
}): CompletionOutcome;
```

| `passThreshold` | grading | outcome | status written |
|---|---|---|---|
| `null` | either | `COMPLETE` | `COMPLETED` — today's behaviour, untouched |
| set | scored, `≥` threshold | `COMPLETE` | `COMPLETED` |
| set | scored, `<` threshold | `BLOCKED` | left `IN_PROGRESS` |
| set | **failed** | `COMPLETE_UNGRADED` | `COMPLETED`, flagged to officers |

**Fail-open is load-bearing.** The submission row is still written and grading still runs inside a
try/catch that swallows every failure — rate limit, quota, network, malformed JSON. A Gemini outage
during a cohort session cannot strand anyone, because the failure path lands on `COMPLETE_UNGRADED`
rather than `BLOCKED`.

The officer progress matrix already distinguishes `scorePct: null` ("never graded") from `0` ("graded
badly"), so surfacing the flag needs **no new column** — only a badge shown when the section is gated
and the latest submission is unscored.

**Retries are unlimited.** A learner reads their per-point feedback, revises, and resubmits until they
clear the bar. Each attempt is a new row, so revision history is preserved. `maxAttempts` is *not*
honoured for these kinds: a capped gate can permanently strand a learner, which would contradict §2.2.

Rewards fire on first completion only, via the existing `firstCompletion` guard. A `BLOCKED` outcome is
not a completion and grants nothing.

## 6. API

All under the existing `coursesRouter` (mounted at `/api/outreach/courses`).

```
POST   /sections/:sid/assignment    learner; multipart(file) OR json({text}) → submit + grade
GET    /sections/:sid/assignment    learner; own attempts, newest first
POST   /sections/:sid/handout       author; multipart(file) → Drive, stores id on assignmentConfig
DELETE /sections/:sid/handout       author; clears the handout keys
```

Handout upload reuses the multer→Drive pattern already in `courses.ts` for slide decks and audio
(`uploadStreamToDrive`, then `makeDriveFilePublic`), so link-sharing is handled server-side rather than
being a warning in help text — which is the failure mode `LitReviewBuilder`'s pasted-file-id field has
today. Learner download is `drive.google.com/uc?export=download&id=<id>`.

Submission bodies arrive as multipart, never base64 JSON: `app.ts` uses `express.json()` at the default
100 kb limit and would reject a real document outright. Limit: 15 MB, one file.

`buildGradingPrompt` and `parseGradingResponse` move from `litReviewService.ts` into a shared
`rubricGrading.ts` — both are already generic over citation / reference text / rubric / submission.
Both kinds keep using `generateJson` (standard model, 30 RPM), **not** `generateJsonComplex`: a cohort
working through a module would exhaust the 25-requests-per-day complex lane in an afternoon and starve
every other AI feature sharing it.

## 7. Frontend

**New**
- `src/components/clubpm/courses/AssignmentSection.jsx` — learner surface: handout card, upload
  dropzone + paste-text tab, submit, feedback, history.
- `src/components/clubpm/courses/AssignmentBuilder.jsx` — author surface.
- `src/components/clubpm/courses/RubricEditor.jsx` — extracted from `LitReviewBuilder` so both
  builders share one rubric editor.

**Modified**
- `CoursePlayerPage.jsx` — dispatch `ASSIGNMENT`; render `contentJson` *above* the submission UI,
  mirroring how `LIT_REVIEW` does it, and exclude `ASSIGNMENT` from the generic trailing content block
  so the body is not rendered twice.
- `CourseEditorPage.jsx` — `ASSIGNMENT` in the kind picker; mount `AssignmentBuilder`.
- `CourseSectionRail.jsx` — icon for the new kind.
- `CourseProgressDashboard.jsx` — score column and "ungraded" badge for both gated kinds.
- `LitReviewBuilder.jsx` — pass-threshold field; use the shared `RubricEditor`.
- `LitReviewSection.jsx` — render score and threshold when `passThreshold` is set.
- `clubPmClient.js` — `submitAssignment`, `listAssignmentSubmissions`, `uploadAssignmentHandout`,
  `deleteAssignmentHandout`.

**Paste-as-well-as-upload is deliberate.** The submission is text either way — the file is only an
input method — and without a paste path the feature cannot be exercised locally or in author preview
without hand-crafting PDFs.

CSS goes to `public/clubpm-theme.css` under `.pm-assign-*`. This is a ClubPM-only surface, so it must
not go in `search-theme.css`, which every public visitor downloads.

## 8. Content migration — 7 ares-101 exercises

Each `exercises/E*.md` gains a frontmatter block carrying its config, with the **existing body kept as
the learner-facing context** — the same one-file pattern `lit/L*.md` uses, and for the same reason: the
reference answer is a distillation of the exercise directly below it, and split across two files they
drift.

```yaml
---
promptText: "…"
minWords: 250
passThreshold: 70
rubric:
  - id: negative-result
    point: "…"
    weight: 3
referenceAnswer: |
  …
---
```

`course.json` flips each section's `kind` from `CONTENT` to `ASSIGNMENT` and replaces `bodyRef` with
`assignmentRef`. The seeder gains `readAssignmentConfig`, which **shares** `readLitConfig`'s
frontmatter parser rather than copying it — that parser's comments document a real bug where a `\Z`
(no such escape in JavaScript) silently truncated a rubric at any capital Z, and duplicating the regex
duplicates the hazard.

### 8.1 Which exercises get a gate, and why not all of them

Five of the seven exercises publish their answers **in the learner-facing body, deliberately**:

| File | Answer section | Nature |
|---|---|---|
| `E01-exposure-from-a-session.md` | `## Answers` | full worked key |
| `E02-bench-test-a-sensor.md` | `## Answers — the worked example` | full worked key |
| `E04-pump-disturbance-threshold.md` | `## One worked attempt` | shown on purpose — no key exists |
| `E05-run-the-models.md` | `## Answers` | full worked key |
| `E08-write-an-analysis-plan.md` | `## Self-check — synthetic outcomes` | data, behind a "do not read yet" instruction |
| `E06`, `E07` | — | none |

E01's header states the reasoning: *"Do not move them to a second file; a learner who has to go looking
will not check their work."* That is a considered pedagogical decision and this feature does not get to
reverse it for its own convenience.

A score gate on a section whose answers sit two screens below the composer is not a gate. So the
migration splits:

- **Gated** (`passThreshold` set): `E06`, `E07`, `E08` — argued deliverables that go back to the team,
  with no key in the body.
- **Ungated** (`passThreshold: null`): `E01`, `E02`, `E04`, `E05` — self-check computations. They still
  become `ASSIGNMENT` sections: the submission is recorded, the file is extracted, AI feedback is
  returned. There is simply no gate to game, so the visible keys stay exactly where their authors put
  them.

This is what the opt-in gate in §3.4 is *for*. A course where every section is gated was never the
goal; a course where the author chooses per section is.

**Answer keys are COPIED into `referenceAnswer`, never moved.** Grading needs ground truth even on an
ungated section, because feedback is the point there. The body keeps its key for self-check; the config
gets a copy. Anyone editing one must edit the other — that duplication is deliberate, and noted here so
a later reader does not "fix" it by deleting one.

**Scope note.** Seven files exist; `course.json` references eight. `exercises/E03-measure-the-delay.md`
was never written. The dangling reference is left exactly as it is — writing a missing exercise is a
separate content task, not part of this one.

**Authorship note.** The reference answers and rubrics in this migration are *drafted from each
exercise's existing prose* and must be reviewed by the ARES team before the course is published. They
are shaped like `L11`'s, but they encode subject-matter claims about ARES physics that a drafter
working from the course text alone will get wrong in places. A section whose rubric is empty or whose
reference answer is missing grades as `null` — which under a gate means fail-open every time, so a
half-finished migration degrades to today's behaviour rather than blocking anyone.

## 9. Testing

Pure functions get the repo's existing inline-harness treatment — `npx tsx src/services/<x>.test.ts`,
no test framework, matching `courseProgressService.test.ts`.

| Target | Coverage |
|---|---|
| `decideCompletion` | all four rows of §5's table, plus threshold boundary (`score === threshold` passes) |
| `sanitizeAssignmentConfig` | proves `referenceAnswer` and `rubric` never appear in a learner payload, including when extra author keys are present |
| `documentTextService` | per-format extraction, `EMPTY` on a text-free PDF, `UNSUPPORTED` on legacy `.doc`, 60k clamp |
| `rubricGrading` | existing `parseGradingResponse` cases, now shared: invented ids dropped, skipped ids scored `missed`, weights applied |

Per `CLAUDE.md`'s phase rule, `npm run build` (repo root) and `npx tsc --noEmit` (backend/) run between
every phase.

## 10. Out of scope

- Writing `E03-measure-the-delay.md`.
- OCR for scanned PDFs. The guard in §4 explains the failure instead.
- Officer manual-override of a gate. Fail-open plus unlimited retries means no learner can be stranded,
  so there is nothing to override.
- Honouring `maxAttempts` on these kinds (see §5).
