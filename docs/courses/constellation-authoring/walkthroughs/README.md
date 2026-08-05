# Authoring — walkthrough outline

This outline tracks the shipped `.steps.json` beside it. Keep them in step when you edit either.

## `course-authoring` — 9 steps, 3 real API calls

No training project needed — a draft course is its own disposable object. The tour creates one and
leaves it in DRAFT, which is harmless: unpublished courses are invisible to everyone but their
author.

| # | Anchor | Advance | Copy |
|---|---|---|---|
| 1 | `nav.courses` | `click` | "Every course, draft and published. Yours will be a draft and nobody else will see it." |
| 2 | `courses.new` | `api` POST `/api/outreach/courses` | "Make one. Title it anything." |
| 3 | `course.editor.rail` | `next` | "Modules on the left, sections inside them. Modules gate — finish one to unlock the next." |
| 4 | `course.editor.addsection` | `api` POST `/api/outreach/courses/:id/sections` | "Add a CONTENT section. Prose is for the 'why' — the thing someone reads once." |
| 5 | `course.editor.addsection` | `api` POST `/api/outreach/courses/:id/sections` | "Now a QUIZ. Notice WALKTHROUGH isn't offerable here — tour steps are repo files, reviewed like code." |
| 6 | `course.editor.preview` | `next` | "Preview opens the learner view with everything unlocked and nothing recorded. Always read your own course this way before assigning it." |
| 7 | `nav.courses` | `click` | "Assignment isn't in the editor — it's on the catalog page, because it's about people rather than content." |
| 8 | `courses.progress` | `click` *(optional)* | "Open the progress dashboard: who's enrolled, who's stalled, who never started. Officers only." |
| 9 | `courses.assign` | `next` *(optional)* | "Assign with a due date and members get notified. **Don't assign this one** — leave it in draft." |

**Design notes**

- **Step 5 is the step that carries the course.** The author will look for a "walkthrough" option,
  not find one, and be confused — so the tour explains it at exactly the moment they'd notice.
  Discovering a missing feature and getting the reason in the same beat is much better than a
  greyed-out control with no explanation.
- Step 7 tells the learner not to click, like the blog tour's publish step. Assigning a junk course to
  the whole club is recoverable but embarrassing, and both are avoidable by saying so.
- **No step exercises the AI generator.** It costs a real quota call against a shared daily budget
  (`GEMINI_COMPLEX_MODEL`, 25 requests/day), and a course taken by fifteen authors would burn it.
  V10 shows the generator on video instead — the right medium for something you should watch once and
  not everyone should run.
- Step 6 is `next` rather than `click` because Preview opens a new context. Sending the learner out of
  the editor mid-tour risks stranding them; V10 already showed what preview looks like.

**Correction, this pass:** the assign step used to target `course.editor.assign` on
`/clubpm/courses/:id/edit`. That button has never existed in the course editor — it lives on the
admin progress dashboard reached from the catalog, so the id was renamed `courses.assign` and steps
7 and 8 were added to actually walk there. Both new steps are `optional` because the dashboard and
the button are admin-only.
