# Session prompts — ASSIGNMENT sections & score gating

Ten sessions. Copy one prompt per fresh session, in order. Each is self-contained: it names its own
reading, its own scope boundary, and its own verification.

**Plan:** `docs/superpowers/plans/2026-08-23-course-assignment-sections.md`
**Spec:** `docs/superpowers/specs/2026-08-23-course-assignment-sections-design.md`

| Session | Phase | Scope | Weight |
|---|---|---|---|
| 1 | 1 | Prisma schema, migration, courseService plumbing | light |
| 2 | 2 | Pure logic + tests (extraction, grading, gate) | medium |
| 3 | 3 | courseProgressService wiring | medium |
| 4 | 4 | API routes + client wrappers | heavy |
| 5 | 5 | Learner UI | medium |
| 6 | 6 | Author UI | heavy |
| 7 | 7 | Seeder + E08 worked example | heavy |
| 8 | 8.1–8.2 | E01, E02 content migration (ungated) | heavy |
| 9 | 8.3–8.4 | E04, E05 content migration (ungated) | heavy |
| 10 | 8.5–8.6, 8.7 | E06, E07 (gated), docs, final verification | heavy |

Sessions 8 and 9 could in principle be merged, and should not be: each exercise runs 12–18 KB and its
dependency articles run longer, and the rubrics are `L11`-depth prose. Two per session is the ceiling
at which the writing stays good rather than getting shorter as context fills.

**Before Session 1**, cut the branch:

```bash
git checkout -b course-assignment-sections
```

Sessions 1–7 each end with a green build. Sessions 8–10 are content work with no code changes.

---

## Session 1 — Prisma schema and data layer

```
Execute Phase 1 (Tasks 1.1, 1.2, 1.3) of
docs/superpowers/plans/2026-08-23-course-assignment-sections.md.

Read the plan's header, Global Constraints, and Phase 1 in full before starting. Read spec
§3 (docs/superpowers/specs/2026-08-23-course-assignment-sections-design.md) for why the
submission model is renamed rather than duplicated.

Scope: backend/prisma/schema.prisma, one new migration, backend/src/services/courseService.ts,
and mechanical renames of prisma.courseLitSubmission call sites. Do not touch React, route
handlers, or course content.

Critical:
- backend/prisma/schema.prisma is 1,661 lines. Grep for model and enum names; do not read it whole.
- The CourseWorkSubmission rename MUST carry @@map("CourseLitSubmission") so it emits no DDL.
  Verify this with the prisma migrate diff in Task 1.1 Step 6 before applying. If the diff
  proposes an ALTER TABLE ... RENAME, the @@map is wrong — fix it, do not accept the rename.
- Run `npx prisma generate` after every schema edit before trusting tsc. A stale client
  produces phantom type errors that will send you chasing nothing.
- The Prisma delegate is named from the MODEL, not the mapped table, so call sites become
  prisma.courseWorkSubmission. Field names and where clauses are unchanged.

Done when: `cd backend && npx tsc --noEmit` is clean and three commits exist.
```

---

## Session 2 — Pure logic and tests

```
Execute Phase 2 (Tasks 2.1, 2.2, 2.3) of
docs/superpowers/plans/2026-08-23-course-assignment-sections.md.

Read the plan's Global Constraints and Phase 2 in full, plus spec §4 and §5
(docs/superpowers/specs/2026-08-23-course-assignment-sections-design.md). §5's table is the
whole feature — implement it exactly.

Scope: three new files under backend/src/services/ (documentTextService, rubricGrading,
assignmentService) plus their .test.ts files, and a refactor of litReviewService.ts to
delegate. No DB access, no HTTP, no React. Everything here is unit-testable and runs without
a database.

Critical:
- pdf-parse MUST be imported as "pdf-parse/lib/pdf-parse.js". Importing the package root runs
  a bundled debug harness that reads a test PDF off disk and throws in production.
- decideCompletion's fail-open branch is load-bearing, not a convenience. A gated section whose
  grading produced no score completes anyway. Read the comment in the plan and keep it.
- Extraction must NEVER return ok with an empty string. A scanned PDF extracts to nothing, and
  under a gate that would block a learner with a zero they cannot diagnose. Return EMPTY with a
  message naming the cause.
- When moving parseGradingResponse into rubricGrading.ts, keep its doc comment verbatim — it
  explains why the function iterates the rubric rather than the model's array, which is the one
  thing about it a future reader must not undo.
- litReviewService must keep exporting countWords and LitFeedback; courseProgressService.ts
  lines 8-11 import them and must keep compiling untouched. Note that `export { x } from "..."`
  does NOT bring x into local scope — gradeSubmission calls gradeAgainstRubric, so it needs a
  real import too.

Done when: all three test files pass via `npx tsx src/services/<name>.test.ts`,
`cd backend && npx tsc --noEmit` is clean, and three commits exist.
```

---

## Session 3 — Progress service wiring

```
Execute Phase 3 (Tasks 3.1, 3.2) of
docs/superpowers/plans/2026-08-23-course-assignment-sections.md.

Read the plan's Global Constraints and Phase 3 in full, plus spec §5.

Scope: backend/src/services/courseProgressService.ts only. It is 1,414 lines — grep for
function names, do not read it whole.

Critical:
- ORDER MATTERS in submitWork and it is non-negotiable: create the submission row FIRST, then
  call Gemini inside a try/catch that swallows every failure, THEN decide completion. Moving
  the grading call above the create turns fail-open into fail-closed and a Gemini outage would
  strand a cohort. The existing submitLitReview has this ordering and a comment explaining it;
  carry both forward.
- maxAttempts is deliberately NOT honoured for these kinds. A capped gate can permanently
  strand a learner.
- isSectionUnlocked must not change. The gate is entirely about when COMPLETED gets written.
- Task 3.2 adds a per-course query for work submissions. Put it beside the existing SLIDES
  query and follow its reasoning: one query for the whole course, not one per section, because
  this runs on every learner page load.

Expected mid-state: after Task 3.1, tsc reports errors in backend/src/api/courses.ts because it
still calls submitLitReview. That is correct — Session 4 fixes them. Do not fix them here.

Done when: `cd backend && npx tsc --noEmit` reports errors ONLY in courses.ts, and two commits
exist.
```

---

## Session 4 — API routes and client wrappers

```
Execute Phase 4 (Tasks 4.1, 4.2, 4.3) of
docs/superpowers/plans/2026-08-23-course-assignment-sections.md.

Read the plan's Global Constraints and Phase 4 in full, plus spec §6.

Scope: backend/src/api/courses.ts and src/api/clubPmClient.js. Both sides of the wire in one
session so the payload shapes cannot drift. Do not touch React components.

Critical:
- courses.ts is 1,621 lines. Grep by route path (e.g. rg '"/sections/:sid' ) — do not read it whole.
- Always read req.memberId, NEVER req.session.memberId. Session reads are undefined for
  Bearer-token users and silently break them.
- Submissions arrive as multipart, never base64 JSON — app.ts uses express.json() at the
  default 100 kb limit and would reject a real PDF outright.
- assignmentConfig is written WHOLE. The handout routes must spread the previous column value
  before writing their three keys, or they clobber the author's rubric.
- Pass documentTextService's rejection message through verbatim. Flattening it to "bad file"
  destroys the entire point of typing those failures.
- In clubPmClient.js, confirm post() handles FormData: it must pass the body through untouched
  and OMIT the Content-Type header so the browser sets the multipart boundary. Follow whatever
  uploadVaultFile() already does in that file rather than inventing a pattern.
- In the officer progress query, scorePct null and scorePct 0 must stay distinct — one is
  "never graded", the other is "graded badly".

Done when: `cd backend && npx tsc --noEmit` is clean, `npm run build` (repo root) is clean, and
three commits exist.
```

---

## Session 5 — Learner UI

```
Execute Phase 5 (Tasks 5.1, 5.2) of
docs/superpowers/plans/2026-08-23-course-assignment-sections.md.

Read the plan's Global Constraints and Phase 5 in full, plus spec §7. Task 5.1 contains the
complete AssignmentSection component — use it rather than improvising.

Scope: src/components/clubpm/courses/AssignmentSection.jsx (new),
src/components/clubpm/courses/LitReviewSection.jsx, src/pages/ClubPM/CoursePlayerPage.jsx,
and public/clubpm-theme.css. Do NOT touch the builders — that is Session 6.

Critical:
- New CSS goes in public/clubpm-theme.css, appended at the bottom. Never search-theme.css —
  every public visitor downloads that file.
- GREP THE .clubpm-app BLOCK FOR ANY TOKEN BEFORE USING IT. search-theme.css's :root does not
  declare --color-text-muted, and assuming a token exists has cost this repo six agent passes
  and two invisible SVG strokes. --pm-surface and --pm-elevated are also not what CLAUDE.md
  claims — verify before use.
- Font Awesome icons only, never emoji.
- The score renders ONLY when section.passThreshold != null. On an ungated section it stays
  hidden — that preserves a deliberate existing design decision. Update LitReviewSection's doc
  comment, which currently states the score is never rendered.
- A BLOCKED outcome gets a NEUTRAL toast, not toast.error. The learner did the work; it just
  did not clear the bar, and revisions are unlimited.
- In CoursePlayerPage, add `&& selected.kind !== 'ASSIGNMENT'` to the generic trailing content
  block (~line 411) or the context body renders twice. Match the LIT_REVIEW block at ~line 386
  exactly for how contentJson is rendered and what onSubmitted receives — read it, do not guess
  the names.

Done when: `npm run build` is clean and two commits exist.
```

---

## Session 6 — Author UI

```
Execute Phase 6 (Tasks 6.1, 6.2, 6.3) of
docs/superpowers/plans/2026-08-23-course-assignment-sections.md.

Read the plan's Global Constraints and Phase 6 in full, plus spec §7.

Scope: src/components/clubpm/courses/{RubricEditor,AssignmentBuilder}.jsx (new),
LitReviewBuilder.jsx, CourseSectionRail.jsx, CourseProgressDashboard.jsx,
src/pages/ClubPM/CourseEditorPage.jsx, public/clubpm-theme.css.

Critical:
- passThreshold is a COLUMN ON THE SECTION, not a key inside litConfig or assignmentConfig.
  Save it through the section-update path the builder already uses for title. Read how
  CourseEditorPage passes onSave before wiring it; thread a second prop if needed.
- The builder must spread the previous config value on save, or it clobbers the handout keys
  the upload route wrote.
- Keep LitReviewBuilder's author-only warning banner ("Never sent to learners…") and reproduce
  it in AssignmentBuilder. It is the only visible signal that reference answers and rubrics are
  withheld server-side.
- Keep the RubricEditor <small> explaining that ids never change so feedback survives a reword.
  It belongs with the control.
- In CourseProgressDashboard, render a null score as "—", never as "0%". Under a gate, null
  means the learner was passed through unscored (fail-open) and an officer should look.
- Grep CourseEditorPage for LIT_REVIEW and mirror every hit for ASSIGNMENT.
- Same CSS rules as Session 5: clubpm-theme.css only, grep tokens before using them.

Done when: `npm run build` is clean and three commits exist.
```

---

## Session 7 — Seeder support and the E08 worked example

```
Execute Phase 7 (Tasks 7.1, 7.2) of
docs/superpowers/plans/2026-08-23-course-assignment-sections.md.

Read the plan's Global Constraints and Phase 7 in full, plus spec §8.

Scope: backend/scripts/seedCourses.ts, docs/courses/ares-101/exercises/E08-write-an-analysis-plan.md,
docs/courses/ares-101/course.json.

This session is half plumbing, half subject-matter writing. Do Task 7.1 completely and verify it
compiles before starting Task 7.2.

Critical:
- DO NOT RETYPE THE RUBRIC REGEX in readLitConfig. Move it verbatim with its comment. That
  comment documents a real bug: \Z is not a JavaScript escape, so it matched a literal "Z" and
  silently truncated a rubric at any capital Z in a point ("send Z", "Van der Hegge Zijnen").
  A retyped copy reintroduces it.
- Unlike readLitConfig, readAssignmentConfig INSTALLS THE BODY — for an assignment the body is
  learner-facing context, not author material.
- Before writing E08's frontmatter, read the exercise end to end plus content/C22-*.md (its
  stated dependency) and lit/L11-herrick-protocol.md (whose rubric formatting you are matching:
  two-space indent under `rubric:`, quoted point values, referenceAnswer last as a block scalar
  so it runs to the closing --- without escaping).
- E08 deliberately places synthetic data at the bottom behind a "do not read until your plan is
  written" instruction. That is LEARNER-FACING and stays in the body. Verify nothing else in the
  body is an answer key; if something is, move it into referenceAnswer rather than deleting it.
- E08's rubric must weight "states what result would count as NOT supporting the hypothesis"
  highest — that is the entire point of the exercise.
- The rubric and reference answer you write are DRAFTS for ARES-team review. Say so in your
  final report; do not present them as authoritative.

Done when: `cd backend && npx tsc --noEmit` is clean, `npm run seed:courses` installs E08 with
no pending-ref warning, and two commits exist.

Then verify end to end in the running app: the context body renders, a pasted answer submits,
grading returns per-point feedback, a below-threshold score leaves the section blocked, and a
passing score unlocks the next one. Report what you actually observed.
```

---

## Sessions 8–10 — Content migration

These three sessions are **subject-matter writing, not engineering**. No code changes. Each one
repeats Task 7.2's shape against two exercises. Read `docs/courses/ares-101/lit/L11-herrick-protocol.md`
first in every one of them — it is the quality bar and the formatting template.

**The rule that applies to all three:** answer sections in a body are **copied** into `referenceAnswer`,
never moved. E01's header states why they stay put — *"a learner who has to go looking will not check
their work."* Grading still needs ground truth, so the config gets a copy. See spec §8.1.

**Only E06 and E07 are gated.** E01, E02, E04 and E05 publish their answers in the body by design, so a
`passThreshold` on them would be a control that controls nothing.

### Session 8 — E01 and E02 (both ungated)

```
Execute Tasks 8.1 and 8.2 of
docs/superpowers/plans/2026-08-23-course-assignment-sections.md — convert
exercises/E01-exposure-from-a-session.md and exercises/E02-bench-test-a-sensor.md to ASSIGNMENT
sections.

Read spec §8 and §8.1 first, then docs/courses/ares-101/lit/L11-herrick-protocol.md — its
frontmatter is your formatting template and its rubric depth is the quality bar. Then read
docs/courses/ares-101/exercises/E08-write-an-analysis-plan.md, converted in the previous
session, as the worked example to imitate.

BOTH OF THESE ARE UNGATED. Omit passThreshold entirely from both frontmatter blocks. Each file
publishes its answers in the learner-facing body on purpose, so a gate would be bypassed by
scrolling.

For each of the two exercises:
1. Read it in full, plus its dependency articles — E01 needs content/C15-*.md and GLOSSARY.md
   §5; E02 needs content/C16-*.md and videos/V14-decoding-a-reading.md.
2. COPY the answer section into referenceAnswer. Do NOT move or delete it — the body keeps it.
   E01's is "## Answers" (~line 111); E02's is "## Answers — the worked example" (~line 252).
3. Prepend the frontmatter block: promptText, minWords, rubric, referenceAnswer. No passThreshold.
4. In course.json, flip kind CONTENT -> ASSIGNMENT and bodyRef -> assignmentRef.
5. Run `cd backend && npm run seed:courses` and confirm no pending-ref warning.
6. Commit separately: "feat(ares-101): convert E0n to an assignment section".

Rubric guidance:
- E01 — dosimetry arithmetic against C15's tiers and thresholds. Weight the METHOD and the
  stated assumptions above the arithmetic; a right number from a wrong method is not the skill.
  Note the file's own warning that its data is synthetic and must never be quoted as real.
- E02 — a real bench procedure (deliverable subtasks 2.3.7 and 2.5.2) written so a person can
  run it. Weight whether a reader could audit a session against what was written, and whether
  C16's warm-up window and the "." multiplier are handled.

Do not touch code. Do not write exercises/E03-measure-the-delay.md — it does not exist,
course.json line ~264 references it, and both are deliberately left alone.

These rubrics and reference answers are DRAFTS encoding claims about ARES physics drawn from the
course text alone. Flag them as needing ARES-team review in your final report, and call out
specifically anything you were unsure about.
```

### Session 9 — E04 and E05 (both ungated)

```
Execute Tasks 8.3 and 8.4 of
docs/superpowers/plans/2026-08-23-course-assignment-sections.md — convert
exercises/E04-pump-disturbance-threshold.md and exercises/E05-run-the-models.md to ASSIGNMENT
sections.

Follow the same six steps and the same rules as the E01/E02 session: read spec §8 and §8.1,
then lit/L11-herrick-protocol.md as the template and quality bar, then E08 as the worked
example. COPY answer sections into referenceAnswer, never move them. One commit per exercise.

BOTH OF THESE ARE UNGATED. Omit passThreshold from both.

Dependencies to read: E04 needs content/C18-*.md, C17 and C13. E05 needs content/C19-*.md and
C13; videos/V16-rebreathing-and-respiration.md is helpful but not required.

Rubric guidance:
- E04 IS NOT A TEACHING PROBLEM WITH A KNOWN ANSWER. It is open question 3 from
  ARES_7_30_26.pptx slide 11, handed over unmodified; nobody on the ARES team has answered it
  and there is no correct number. The file's "## One worked attempt" (~line 186) is ONE
  PERSON'S ATTEMPT shown so learners know what defensible looks like — it is not a key, and
  your referenceAnswer must say so explicitly or the grader will treat it as ground truth and
  mark down better answers. The rubric judges the ARGUMENT: does it engage C17's 0.67 L/min
  per-pod split and 3.0 mm bore, does it compare against C13's 0.3-0.4 m/s plume, does it state
  its assumptions and their direction of error. The answer goes back to the ARES team; say so
  in promptText.
- E05 — three paths through the exercise, and EVERYBODY does the hand computation regardless of
  which they took, because the hand computation is the exercise and running the code is only
  how you check yourself. Weight interpretation over the numbers.

Do not touch code. Do not write E03. Flag every rubric as a draft needing ARES-team review.
```

### Session 10 — E06, E07 (both gated), docs, and final verification

```
Execute Tasks 8.5, 8.6, and 8.7 of
docs/superpowers/plans/2026-08-23-course-assignment-sections.md — convert
exercises/E06-trace-a-reading.md and exercises/E07-run-a-calibration.md, then update the docs
and run final verification.

Follow the same six steps and rules as the two previous content sessions: read spec §8 and
§8.1, lit/L11-herrick-protocol.md, and E08 as the worked example.

THESE TWO ARE THE GATED ONES — set passThreshold: 70 on both. Neither file has an answer
section in its body, which is exactly why they can carry a real gate. Verify that before you
write the frontmatter: grep each for "## Answers", "## One worked attempt", "## Self-check". If
you find one, stop and report it rather than gating a section whose answers are visible.

Dependencies to read: E06 needs content/C20-*.md and C16. E07 needs content/C21-*.md,
videos/V17-three-pods-disagree.md, and C16.

Rubric guidance:
- E06 — a pure READING exercise across two repositories (ARES2ESP32's src/main.cpp and app/lib/,
  plus this course). No code is written and nothing is run. Weight completeness of the chain
  from sensor to screen, and naming where error enters at each hop. A trace that skips a stage
  has missed the point.
- E07 — requires the headset, a paired phone, and physically going outside; there is no desk
  version, and the file says that is the entire point. Weight the offset-versus-span distinction
  and the fresh-air assumption from C21. Treat pressing "ABC ON" as a substantive error rather
  than a slip — C21 explains why and the exercise warns about it twice.

Then Task 8.7:
- Grep docs/courses/ares-101/README.md for "exercise" and "CONTENT" and rewrite the sections
  describing exercises as read-only content. They are now submitted and graded, and that README
  is someone's teaching material — retitle and rewrite rather than leaving stale prose.
- Update CLAUDE.md: add ASSIGNMENT to any section-kind list, note documentTextService.ts and
  assignmentService.ts under services, and record that pdf-parse must be imported from
  pdf-parse/lib/pdf-parse.js.

Final verification — run all of these and report actual output, not a summary:
  npm run build
  cd backend && npx tsc --noEmit
  cd backend && npx tsx src/services/assignmentService.test.ts
  cd backend && npx tsx src/services/rubricGrading.test.ts
  cd backend && npx tsx src/services/documentTextService.test.ts
  cd backend && npx tsx src/services/courseProgressService.test.ts
  node scripts/check-tour-anchors.js

Do not touch code beyond the docs updates. Do not write E03.

Close by listing every rubric and reference answer written across sessions 7-10 as a single
review queue for the ARES team, with the ones you were least confident about first.
```

---

## Notes for whoever runs these

**Sessions 8–10 produce content, not correctness.** A rubric that is wrong about ARES physics still
compiles, still seeds, and still grades — it just grades wrongly. The tests in this plan cannot catch
that; only an ARES-team read can. The failure is bounded (an empty rubric grades as `null`, which under
a gate means fail-open) but a *wrong* rubric is worse than an empty one, because it looks authoritative.

**If a session runs long, stop at a task boundary and commit.** Every task in the plan ends with a
green build and its own commit, so a half-finished session resumes cleanly at the next task rather than
mid-file.

**Session 3 deliberately ends with a red typecheck** — errors confined to `courses.ts`, which Session 4
repairs. That is the one place in this plan where "clean build" is not the exit condition.
