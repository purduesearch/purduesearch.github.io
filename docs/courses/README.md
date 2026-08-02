# Constellation Courses — Content Source

This directory is the **single source of truth** for Constellation's onboarding curriculum. Course
structure, walkthrough steps, quiz banks, and video scripts all live here and are installed into the
database by `npm run seed:courses`.

Design spec: [`../superpowers/specs/2026-08-02-constellation-walkthrough-course-design.md`](../superpowers/specs/2026-08-02-constellation-walkthrough-course-design.md)

## Why the files, and not the editor

Walkthrough steps point at UI elements by anchor id (`nav.projects`, `board.column.TODO`). If those
steps lived in the database, renaming a nav link would produce a clean pull request and a tour that
breaks silently in production. Because they live here, `scripts/check-tour-anchors.js` runs on every
build and fails it, naming the step that broke.

The corollary: **authoring a walkthrough means editing a file and opening a PR.** The course editor
shows walkthrough steps read-only.

## Layout

```
docs/courses/
  README.md                  this file
  ANCHORS.md                 the anchor vocabulary — every id a step may reference
  <course-slug>/
    course.json              modules + section order — the seed's input
    content/                 Cnn-<slug>.md      CONTENT section bodies
    slides/                  Snn-<slug>.outline.md   deck outlines (built externally, imported as PDF)
    videos/                  Vnn-<slug>.md      shot list + word-for-word VO
    quizzes/                 Qnn-<slug>.json    seed input (authoritative)
                             README.md          all banks, readable, for review
    walkthroughs/            <tourId>.steps.json   step data, CI-checked
                             README.md             why each step is shaped that way
```

`.json` is authoritative for quizzes; the `README.md` beside them renders every bank in prose so
questions can be argued about without reading JSON. The check script verifies that every question id
appears in both, so the two cannot silently drift.

Rationale lives in one `README.md` per directory rather than one file per asset. Per-asset notes
fragment the reasoning that connects them — the interesting decisions are almost always about how two
tours differ, not about one in isolation.

## Courses

| Slug | Required? | Length | Status |
|---|---|---|---|
| `constellation-101` | **Yes — every member** | ~45 min | Content written · engine not built |
| `constellation-vault-and-crs` | Role: CAD / hardware | ~30 min | Content written · engine not built |
| `constellation-outreach-and-blog` | Role: comms | ~30 min | Content written · engine not built |
| `constellation-admin-tools` | Role: officers (admin-gated) | ~25 min | Content written · engine not built |
| `constellation-authoring` | Role: content authors | ~20 min | Content written · engine not built |

## Production status

Videos are the only part of this curriculum that a human must physically produce. Everything else
installs from these files.

| ID | Title | Course | Runtime | Recorded? |
|---|---|---|---|---|
| V01 | Why Constellation exists | 101 | 2:30 | ☐ |
| V02 | Anatomy of a task | 101 | 3:10 | ☐ |
| V03 | Reading a milestone's health | 101 | 2:40 | ☐ |
| V04 | Constellation and Slack, together | 101 | 2:20 | ☐ |
| V05 | What the Vault is for | Vault | 3:00 | ☐ |
| V06 | The life of a change request | Vault | 3:20 | ☐ |
| V07 | Contacts, campaigns, and follow-ups | Outreach | 3:00 | ☐ |
| V08 | Writing and publishing a post | Outreach | 3:30 | ☐ |
| V09 | What officers can do that others can't | Admin | 2:50 | ☐ |
| V10 | Building a course | Authoring | 3:00 | ☐ |

**Total runtime: 29:20 across 10 videos.**

### Recording conventions

Every video in this curriculum is a **screen capture with voice-over**. No face cam, no intro sting,
no music bed. Reasons: they must be re-recordable by whoever inherits this when the UI changes, and a
30-second branded intro on a 2:30 explainer wastes a tenth of the runtime.

- **Capture:** 1920×1080, the ClubPM dark theme, browser chrome cropped out.
- **Account:** record from a seeded demo member, never a real one. No real names, no real Slack
  handles, no real contact records on screen.
- **Cursor:** enable click highlighting. A tutorial where you cannot see the click is not a tutorial.
- **Pacing:** the scripts are timed at roughly 150 words per minute with deliberate pauses written
  in. If a take runs long, cut a sentence rather than speeding up.
- **Upload:** YouTube, unlisted, then paste the id into the section's `videoConfig.youtubeId`.

Scripts are word-for-word on purpose. Read them. Improvising against a live UI is how a 2:30 video
becomes 5:00 and how the quiz that follows stops matching what was said.

## Quizzes

11 quiz sections, 57 questions total. Every question carries an `explanation` shown after grading —
a question whose wrong answer teaches nothing is a filter, not a lesson.

Pass thresholds are 75% for module quizzes and 80% for the Constellation 101 final. `maxAttempts` is
null (unlimited) everywhere except the final, which allows 3. Unlimited retries on a module quiz is
deliberate: the quiz is there to make the material stick, and a locked-out learner just messages
someone for the answers.

## Walkthroughs

12 tours, 106 steps total.

| Tour | Course | Steps | Hands-on? |
|---|---|---|---|
| `first-look` | 101 | 8 | No — read-only |
| `board-basics` | 101 | 10 | No — read-only |
| `your-first-task` | 101 | 12 | **Yes** — 6 real API calls |
| `blocked-and-unblocked` | 101 | 10 | **Yes** — 4 real API calls |
| `rewards-tour` | 101 | 8 | Partly — claims one quest |
| `comms-tour` | 101 | 9 | No — read-only |
| `vault-checkout` | Vault | 9 | **Yes** |
| `change-request` | Vault | 8 | **Yes** |
| `crm-and-campaigns` | Outreach | 9 | **Yes** |
| `blog-editor` | Outreach | 8 | **Yes** |
| `admin-tour` | Admin | 8 | No — read-only, admin-gated |
| `course-authoring` | Authoring | 7 | **Yes** |

Every hands-on step runs against the learner's own **training project** — a seeded, private,
throwaway project hidden from every real view in the product. Nothing a learner does inside a
walkthrough touches club data or mints real XP.

`.steps.json` files are written for `constellation-101` only — six tours, 57 steps, ready to seed. The
six elective tours are fully specified in their `walkthroughs/README.md` (every step, its anchor, and
how it advances); their `.steps.json` is transcribed in the final implementation phase, once the
anchor registry has been proven against the required course.

Three elective steps reference anchors not yet in `ANCHORS.md` — flagged in place. The registry entry
and the step must land in the same commit, or the check script fails the build, which is the system
working.
