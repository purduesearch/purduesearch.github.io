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
    videos/                  Vnn-<slug>.md      shot list + visual edits + word-for-word VO
    quizzes/                 Qnn-<slug>.json    seed input (authoritative)
                             README.md          all banks, readable, for review (101 only)
    lit/                     Lnn-<slug>.md      LIT_REVIEW config (frontmatter) + bibliography (body)
    walkthroughs/            <tourId>.steps.json   step data, CI-checked
                             README.md             why each step is shaped that way
```

`.json` is authoritative for quizzes. `constellation-101/quizzes/README.md` additionally renders that
course's banks in prose so questions can be argued about without reading JSON.

> **Nothing checks the prose against the JSON.** `scripts/check-tour-anchors.js` validates tour
> anchors and nothing else — not question ids, not the quiz README, not any of the content or video
> files. Every consistency claim outside the anchor registry is maintained by hand, so edit the pair
> together or the drift is permanent and invisible.

Rationale lives in one `README.md` per directory rather than one file per asset. Per-asset notes
fragment the reasoning that connects them — the interesting decisions are almost always about how two
tours differ, not about one in isolation.

## Courses

| Slug | Required? | Length | Status |
|---|---|---|---|
| `constellation-101` | **Yes — every member** | ~50 min | Content written · installed by seed:courses |
| `constellation-vault-and-crs` | Role: CAD / hardware | ~40 min | Content written · installed by seed:courses |
| `constellation-outreach-and-blog` | Role: comms | ~40 min | Content written · installed by seed:courses |
| `constellation-admin-tools` | Role: officers (admin-gated) | ~30 min | Content written · installed by seed:courses |
| `constellation-authoring` | Role: content authors | ~25 min | Content written · installed by seed:courses |
| `ares-101` | Role: ARES team | ~3 h 40 m | 10 of 11 modules written · **decks not built, so it dead-ends at M4** · no video recorded · M6 short 3 files · lit-review PDFs unshared · DRAFT |

`estimatedMinutes` in each `course.json` is the sum of its modules' estimates; the lengths above are
those totals rounded. If you add or remove a section, update the module estimate **and** the course
total — nothing validates that for you.

`ares-101` is the first course here about a **subject** rather than about Constellation. Its assets
(C12–C22, V11–V17, S02–S05, Q12–Q22, L01–L11, E01–E08) continue the global numbering but are tracked
in [`ares-101/README.md`](ares-101/README.md) while they are written, so the per-asset tables below
still describe only the Constellation courses. Its glossary is binding on all eleven of its modules —
read [`ares-101/GLOSSARY.md`](ares-101/GLOSSARY.md) before authoring one.

## Reading content

11 CONTENT sections. Numbering is global and follows course-then-module order, the same convention as
`Vnn` and `Qnn`, so `C07` always sits between `C06` and `C08` no matter which course you're in.

| ID | Title | Course · module | Read |
|---|---|---|---|
| C01 | What Constellation is | 101 · M1 | ~2 min |
| C02 | The task, field by field | 101 · M2 | ~3 min |
| C03 | Three ways work stalls | 101 · M3 | ~3 min |
| C04 | What earns recognition, and what doesn't | 101 · M4 | ~3 min |
| C05 | Where to go next | 101 · M5 | ~2 min |
| C06 | How the Vault is organised | Vault · M1 | ~4 min |
| C07 | Raising and reviewing changes | Vault · M2 | ~4 min |
| C08 | The shape of the CRM | Outreach · M1 | ~4 min |
| C09 | From draft to public | Outreach · M2 | ~4 min |
| C10 | The officer's handbook | Admin · M1 | ~4 min |
| C11 | The authoring handbook | Authoring · M1 | ~4 min |

Each elective article sits **between its video and its walkthrough** (except C10 and C11, which follow
their tours — both electives teach judgement that only makes sense once you've seen the surface).
The pattern is deliberate: the video argues why, the article is the reference you scan, the
walkthrough builds the habit.

### The authoring header is stripped at seed time

Every article opens with the same three things, and **the learner sees none of them**:

```markdown
# C02 — The task, field by field          <- H1: the file's id, not the section title

> CONTENT section · 101 · M2 · ~3 min     <- blockquote: notes to whoever maintains this
> Reference companion to V02.

---                                        <- the rule that ends the header

You just watched a task get taken apart.   <- the body starts here
```

`stripAuthoringHeader()` removes exactly that shape — H1, optional blockquote, `---` — because the
player already renders the section title above the body, and a maintenance memo is not teaching
material. Keep the shape when you add an article. A body that starts with an ordinary heading or
quote is left untouched, so the strip can't eat real content.

The seed then converts the remaining markdown to a **TipTap document**. `contentJson` must be a real
document (`{ type: "doc", content: [...] }`) — the player renders it through `BlogEditor` read-only
and the course editor loads the same shape. Anything else displays as a blank page.

Supported: headings, paragraphs, bullet/ordered/task lists, blockquotes, GFM tables, code fences,
horizontal rules, and inline bold/italic/code/strike/link. Stick to that subset.

### Two rules for editing these

- **Don't restate numbers that live in code.** C04 deliberately contains no XP thresholds — they're
  on the S01 deck, generated from the `Rank` enum, so there is exactly one place for them to rot.
- **Prose goes stale silently.** Nothing checks that an article still describes the product. When a
  tab, button, or route is renamed, grep this directory for the old label.

`cd backend && npm run check:courses` validates the conversion for every article without needing a
database — and asserts it stays identical to the editor's own markdown converter.

## Production status

**Two** parts of this curriculum must be physically produced by a human, and neither is a file in
this tree. Everything else installs from these files.

- A `VIDEO` section needs a recording, uploaded and pasted into `videoConfig.youtubeId`. The
  `videos/Vnn-*.md` script is what someone records *from*.
- A `SLIDES` section needs a deck, built from its `slides/Snn-*.outline.md` and imported as a PDF
  through the slides workbench. The outline is not the deck.

**An un-imported deck is a hard stop, not a blank section.** `isDeckComplete()` returns false when a
section has zero slides, so a required `SLIDES` section inside a `sequential` module can never be
completed and every module after it stays locked — for every learner, silently. An unset `youtubeId`
is milder: the section says "No video has been set for this section yet" and completes on one click,
so the learner is only taught nothing.

Neither is visible to `seed:courses` or `check:courses`. The outline and the script both exist as
files; what is missing is database state. **The only check is taking the course end to end in the
player on a non-admin account.** Do that before marking any course `PUBLISHED`. `ares-101` shipped
four un-imported decks and dead-ended at its fourth module because this step was skipped; the same
applies to `S01` in `constellation-101`, which sits in exactly the same position.

| ID | Title | Course | Runtime | Recorded? |
|---|---|---|---|---|
| V01 | Why Constellation exists | 101 | 2:30 | ☐ |
| V02 | Anatomy of a task | 101 | 3:10 | ☐ |
| V03 | Milestones on the timeline | 101 | 1:50 | ☐ |
| V04 | Constellation and Slack, together | 101 | 2:20 | ☐ |
| V05 | What the Vault is for | Vault | 3:00 | ☐ |
| V06 | The life of a change request | Vault | 3:20 | ☐ |
| V07 | Contacts, campaigns, and follow-ups | Outreach | 3:00 | ☐ |
| V08 | Writing and publishing a post | Outreach | 3:30 | ☐ |
| V09 | What officers can do that others can't | Admin | 2:50 | ☐ |
| V10 | Building a course | Authoring | 3:00 | ☐ |

**Total runtime: 28:30 across 10 videos.**

V03 was rewritten and shortened when the Milestones & Updates tab was removed from the project view;
the script header records why. If this table and a script header ever disagree, **the script is
right** — it's the thing that gets recorded.

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

### Visual edits

Every script carries a **`## Visual edits`** table between its shot list and its narration: timecoded
post-production cues — callouts, labels, zooms, captions, comparison overlays — that annotate the
software while the voice-over runs.

They are separate from the shot list on purpose. The shot list says what to *capture*; visual edits
say what to *add afterwards*, so a re-record can reuse the annotation plan even if the framing
changes.

- **Nothing there changes the narration**, and nothing requires a second take unless the row says so.
- **Cues are timecoded to the shot they sit inside**, so they survive small timing drift.
- **A few are load-bearing**, not decorative — the side-by-side title comparison in V02, the
  simultaneous subtask/dependency colouring in V02, the radiating blast radius in V06, the greying
  rank badge in V09, the held five-cell grid in V10. Each is flagged in its own row. Cut anything
  else before cutting those.
- **Restraint is the house style.** No transitions for their own sake, one accent colour at a time,
  and red reserved for genuinely irreversible controls (there is exactly one: Publish, in V08).

## Quizzes

11 quiz sections, 57 questions total. Every question carries an `explanation` shown after grading —
a question whose wrong answer teaches nothing is a filter, not a lesson.

Pass thresholds are 75% for module quizzes and 80% for the Constellation 101 final. `maxAttempts` is
null (unlimited) everywhere except the final, which allows 3. Unlimited retries on a module quiz is
deliberate: the quiz is there to make the material stick, and a locked-out learner just messages
someone for the answers.

## Walkthroughs

12 tours, 119 steps total.

| Tour | Course | Steps | Hands-on? |
|---|---|---|---|
| `first-look` | 101 | 8 | No — read-only |
| `board-basics` | 101 | 10 | No — read-only |
| `your-first-task` | 101 | 13 | **Yes** — 6 real API calls |
| `blocked-and-unblocked` | 101 | 11 | **Yes** — 4 real API calls |
| `rewards-tour` | 101 | 8 | Partly — claims one quest |
| `comms-tour` | 101 | 9 | No — read-only |
| `vault-checkout` | Vault | 10 | **Yes** — 4 real API calls |
| `change-request` | Vault | 12 | **Yes** — 2 real API calls |
| `crm-and-campaigns` | Outreach | 12 | **Yes** — 2 real API calls |
| `blog-editor` | Outreach | 9 | **Yes** — 2 real API calls |
| `admin-tour` | Admin | 8 | No — read-only, admin-gated |
| `course-authoring` | Authoring | 9 | **Yes** — 3 real API calls |

Step counts here must match both the `.steps.json` file and the `stepCount` in the owning
`course.json`. The seed enforces the second pair and fails loudly on a mismatch; this table is the
one that can silently drift, so check it when you add a step.

Every hands-on step runs against the learner's own **training project** — a seeded, private,
throwaway project hidden from every real view in the product. Nothing a learner does inside a
walkthrough touches club data or mints real XP.

**All 12 `.steps.json` files are written and passing** — `node scripts/check-tour-anchors.js` reports
108 anchors registered, 108 rendered, 90 referenced by steps. Every anchor an elective step needs is
in `ANCHORS.md`.

The `walkthroughs/README.md` beside each set of step files is the rationale: every step, its anchor,
how it advances, and which lines are load-bearing. The check script compares **ids, not prose**, so
those outlines are the one thing nothing validates — when you edit a step file, edit the table too.
(An outline had already drifted once: the admin tour's step 5 was documented as `admin.events` while
the shipped file targets `admin.integrations`.)
