# Kind-Specific Course Section Editors — Design

## Context

The course system (plan: `~/.claude/plans/create-a-plan-for-mellow-cloud.md`, phases 1–12) reuses
`BlogEditor` as the authoring surface for every `CourseSection`, regardless of `kind`. That was the
right call for CONTENT sections and the wrong one for the other two:

- `CourseEditorPage.jsx` renders `BlogEditor` in the wide main column for CONTENT, VIDEO **and**
  QUIZ sections.
- The surfaces that actually matter for VIDEO and QUIZ — `CourseVideoSettings` and
  `CourseQuizEditor` — are confined to the narrow fixed slide-over at `.cpm-blog-meta-panel`.
- For QUIZ sections the document is not merely secondary, it is **discarded**:
  `CoursePlayerPage.jsx:258` renders `contentJson` only when `kind !== 'QUIZ'`. Authors are given a
  collaborative rich-text editor whose output no learner ever sees.
- For VIDEO sections the document *is* rendered to learners, as prose beneath the player.

This design moves each kind's real authoring surface into the main column and removes the editor
where it has no output.

## Decisions

| Decision | Choice |
|---|---|
| VIDEO prose body | **Kept, demoted.** Collapsible "Notes shown under the video" below the workbench, still `BlogEditor` + collab. No learner-visible regression. |
| QUIZ prose body | **Dropped.** `BlogEditor` removed for QUIZ; `CoursePlayerPage` already ignores it. |
| Right-hand panels | Settings panel deleted (contents move inline). AI panel stays for CONTENT and VIDEO, hidden for QUIZ. |
| Scope | Pure relocation. No backend changes, no migration, no new endpoints, no AI question generation. |

## Non-goals

- AI-generated quiz questions. Considered and explicitly declined — it is a separate feature, not
  part of a layout change.
- Any change to the learner experience. `CoursePlayerPage.jsx` is untouched; its VIDEO prose render
  keeps working because the prose keeps its collab document and `contentJson` shape.
- Any change to gating, grading, the server-side video clamp, or reward wiring.

## Architecture

### Step 1 — untangle the shared question code

`CourseVideoSettings.jsx:6` imports `QuestionForm`, `blankQuestion`, `serializeQuestion` and
`validateQuestion` from `CourseQuizEditor.jsx`. The video surface depends on the quiz surface's
internals. Splitting the two workbenches makes that coupling worse, so extract it first:

| New file | Contents | Rationale |
|---|---|---|
| `src/components/clubpm/courses/questionModel.js` | `QUESTION_KINDS`, `blankQuestion`, `hydrate`, `serializeQuestion`, `validateQuestion` | Pure functions, no React. Currently untestable because they live in a component file. |
| `src/components/clubpm/courses/QuestionForm.jsx` | the shared prompt / kind / answers / explanation body | One form, two hosts — as today, but no longer smuggled through a sibling's module. |

Both workbenches then depend on these two modules and on neither each other.

The `_key` local-identity scheme (`new-N` for unsaved rows, the server `id` once persisted) moves
across unchanged — dnd-kit and React list identity both rely on it.

### Step 2 — `CourseVideoWorkbench.jsx` (replaces `CourseVideoSettings.jsx`)

Full-width main column, top to bottom:

1. **Source row** — YouTube URL/id input, parsed-id hint. Logic carried over verbatim, including the
   `durationSec: null` reset when the id changes, and `saveConfig` spreading `configRef.current` so
   the single `videoConfig` JSON column never loses keys this surface does not edit.
2. **Player** — `LockedVideoPlayer` in `preview` mode at the column's real width. It already draws
   pop-up markers on its scrub bar, so timestamp placement is visible without new code. It also
   remains the only thing that detects and persists `durationSec`, which the server's
   completion check depends on.
3. **Playback rules** — allowed-speed chips and the seek-lock toggle, laid out horizontally beneath
   the player rather than stacked in a 320px column.
4. **Pop-up questions** — existing per-question save model (`saveCourseQuestion`, one row at a time,
   so a half-edited sibling cannot wipe the rest — which a whole-set `PUT` would). One new
   affordance: **"Add pop-up at current time"**, seeding `videoTimestampSec` from the player's live
   position.
5. **Notes shown under the video** — collapsed `<details>` holding `BlogEditor` with the same
   `postId` / `collabWsUrl` / `docType="COURSE_SECTION"` wiring, preserving live cursors, comment
   threads, and the learner-side read-only render.

### Step 3 — `CourseQuizBuilder.jsx` (replaces `CourseQuizEditor.jsx`)

Full-width main column, no `BlogEditor`:

1. **Header strip** — pass mark %, max attempts (blank = unlimited, kept as a string so an empty
   input round-trips to `null` rather than `NaN`), and a derived summary line
   (`4 questions · 6 points · pass at 80%`).
2. **Question list** — the existing `@dnd-kit` sortable cards at full width, so answer rows stop
   wrapping.
3. **Footer** — "Add question" and "Save quiz". The whole-set `PUT` with `scope: 'quiz'` is
   unchanged: it forwards each saved question's `id`, which is what lets the server update in place
   rather than recreate — recreating would cascade away response rows and reset admin item analysis.

### Step 4 — `CourseEditorPage.jsx`

The main column becomes a switch on `selectedSection.kind`. `SectionSettingsPanel` is deleted.

```
CONTENT → BlogEditor              [settings: hidden]  [AI: shown]
VIDEO   → CourseVideoWorkbench    [settings: hidden]  [AI: shown — targets the prose body]
QUIZ    → CourseQuizBuilder       [settings: hidden]  [AI: hidden — no document to anchor to]
```

The settings button is removed entirely: CONTENT has nothing to configure (its current panel is a
placeholder that says so), and VIDEO/QUIZ settings are now inline.

The `openPanel` single-slot arbitration stays — the AI panel still needs it, and it is what stops
two `position: fixed` panels from silently stacking. `editorInstance` is cleared on section switch
so `BlogAiPanel` never holds a torn-down editor.

### Step 5 — `LockedVideoPlayer.jsx`

One optional prop: `onTimeUpdate(sec)`, fired from the 250 ms tick it already runs. Used only by the
workbench's "add pop-up at current time". No other change — the lock, the drift guard, the flush
cadence and the completion check are untouched.

## Save semantics

Deliberately split, unchanged from today:

- The page's 1500 ms debounced autosave owns **course title, section title, prose `contentJson`**.
- Questions save explicitly (they need a validation gate).
- `videoConfig` fields commit on blur / toggle.

One gap this exposes: the page `dirty` flag covers only the autosaved fields, so switching sections
with unsaved *questions* loses them silently. Add a confirm on section switch when the active
builder reports dirty, mirroring the existing `beforeunload` guard.

## CSS

Appends to `public/clubpm-theme.css` only — nothing in this feature renders outside `/clubpm/*`.

New blocks: `pm-course-workbench`, `pm-course-workbench-section`, `pm-course-quiz-builder`,
`pm-course-source-row`. The existing `pm-course-question-*` and `pm-course-answer-*` rules are
reused, with their panel-width assumptions (rules qualified by `cpm-blog-meta-panel` ancestry)
dropped so they lay out correctly at full width.

## Files

| Action | File |
|---|---|
| New | `src/components/clubpm/courses/questionModel.js` |
| New | `src/components/clubpm/courses/QuestionForm.jsx` |
| New | `src/components/clubpm/courses/CourseVideoWorkbench.jsx` |
| New | `src/components/clubpm/courses/CourseQuizBuilder.jsx` |
| New | `src/components/clubpm/courses/questionModel.test.js` |
| Delete | `src/components/clubpm/courses/CourseQuizEditor.jsx` |
| Delete | `src/components/clubpm/courses/CourseVideoSettings.jsx` |
| Modify | `src/pages/ClubPM/CourseEditorPage.jsx` |
| Modify | `src/components/clubpm/courses/LockedVideoPlayer.jsx` |
| Modify | `public/clubpm-theme.css` |

No backend files. No Prisma migration. No new API endpoints.

## Verification

**Unit** — `questionModel.test.js`:
- `validateQuestion` across SINGLE / MULTI / TRUE_FALSE: missing prompt, fewer than two answers,
  blank answer text, zero correct answers, and SINGLE with two correct answers.
- `serializeQuestion` assigns `order` from array position and forwards a saved `id` while omitting
  it for new rows.
- `blankQuestion('TRUE_FALSE')` produces exactly the True/False pair with one correct.

**Build gate** — `npm run build` at repo root.

**Manual walkthrough** (`npm start` + `cd backend && npm run dev`):
1. Create a course with one section of each kind.
2. QUIZ section: confirm no rich-text editor and no AI button; add two questions, save, reload,
   confirm they persist with their ids intact.
3. VIDEO section: paste an unlisted YouTube URL, confirm the player renders at full column width and
   records `durationSec`; scrub to ~0:15 and use "Add pop-up at current time", confirm the timestamp
   is seeded; save and confirm the marker appears on the scrub bar.
4. VIDEO notes: expand the collapsed notes, type, confirm the presence bar syncs; select text and
   leave a comment, confirm the thread saves (exercises the `COURSE_SECTION` docType wiring).
5. Open `/clubpm/outreach/courses/:slug/learn` and confirm the VIDEO section still renders its prose
   beneath the player.
6. Edit questions without saving, switch sections, confirm the new guard prompts.
