# Authoring — walkthrough outline

`.steps.json` authored in the final implementation phase.

## `course-authoring` — 7 steps, 3 real API calls

No training project needed — a draft course is its own disposable object. The tour creates one and
leaves it in DRAFT, which is harmless: unpublished courses are invisible to everyone but their
author.

| # | Anchor | Advance | Copy |
|---|---|---|---|
| 1 | `outreach.tab.courses` | `click` | "Every course, draft and published. Yours will be a draft and nobody else will see it." |
| 2 | `courses.new` | `api` POST `/api/outreach/courses` | "Make one. Title it anything." |
| 3 | `course.editor.rail` | `next` | "Modules on the left, sections inside them. Modules gate — finish one to unlock the next." |
| 4 | `course.editor.addsection` | `api` POST `/api/outreach/courses/:id/sections` | "Add a CONTENT section. Prose is for the 'why' — the thing someone reads once." |
| 5 | `course.editor.addsection` | `api` POST `/api/outreach/courses/:id/sections` | "Now a QUIZ. Notice WALKTHROUGH isn't offerable here — tour steps are repo files, reviewed like code." |
| 6 | `course.editor.preview` | `next` | "Preview opens the learner view with everything unlocked and nothing recorded. Always read your own course this way before assigning it." |
| 7 | `course.editor.assign` | `next` | "Assign with a due date and members get notified. **Don't assign this one** — leave it in draft." |

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
