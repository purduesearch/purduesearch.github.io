# Course Slides Sections — Design

Second of three specs in the course-system upgrade. Assumes
`docs/superpowers/specs/2026-07-31-course-modules-design.md` has shipped; nothing here depends on
module *behavior*, only on the fact that a section belongs to a module.

## Context

A `CourseSection` is CONTENT, VIDEO, or QUIZ. Club training material is mostly slide decks, and today
they get flattened into prose or uploaded to Drive and linked out of the course entirely — at which
point the gate, the questions, and the progress tracking all stop applying.

This adds a `SLIDES` kind: a rendered deck the learner pages through, optionally driven by a
narration track, with the same in-flow questions VIDEO sections already have.

## Decisions

| Decision | Choice |
|---|---|
| Deck ingest | Three entry points — `.pdf` upload, `.pptx` upload, Google Slides link — collapsing into **one** pipeline. |
| Google Slides link | Requires widening the bot account's OAuth scope to `drive.readonly` and re-consenting it. |
| Normalization | Everything becomes a **PDF** server-side, then renders in the browser. |
| Rendering | `pdfjs-dist` in the editor at import time. Each page → a PNG uploaded to Drive, plus its extracted text. |
| Audio | **One** narration track per deck plus an author-recorded `startSec` per slide. Not per-slide clips. |
| Questions | Reuse `CourseQuestion` with a new `slideIndex`, exactly as `videoTimestampSec` works for VIDEO. |
| Completion | Reach the last slide **and** answer every overlay question. Audio is not separately gated. |
| Progress clamp | Monotonic + bounded by deck length. Not time-based. |

## Non-goals

- Editing slides in-app. A deck is imported, not authored; fixing a typo means re-importing.
- Per-slide audio clips, slide transitions, animations, or embedded video inside a slide.
- Server-side rasterization. Considered and declined — see below.
- Speaker-notes extraction from PPTX. PDF export does not carry them; authors type notes per slide
  in the workbench, which is also where AI-generated slide outlines (spec 3) land.
- Changing how VIDEO or QUIZ sections work.

## Why one PDF pipeline

The three ingest paths differ only in how a PDF is obtained:

| Source | How the server gets a PDF |
|---|---|
| `.pdf` upload | The browser already has it. **No server round-trip at all.** |
| `.pptx` upload | Drive `files.create` with `mimeType: application/vnd.google-apps.presentation` converts on upload (allowed under `drive.file` — we created the file), then `files.export` to `application/pdf`. |
| Google Slides link | `extractFileId` on the URL, then `files.export` to `application/pdf`. **This is the step that needs `drive.readonly`** — the file was not created by us. |

So the backend exposes exactly one conversion endpoint whose response body is a PDF, and the browser
does the same thing with it in all three cases. A second pipeline via the Slides API
(`presentations.pages.getThumbnail`) was rejected for this reason: it would render link-sourced decks
by a different code path than uploaded ones, and its thumbnail URLs expire in ~30 minutes anyway.

**Rasterizing on the server was rejected** because it needs `node-canvas` — a native module that must
compile on the deploy host — and the backend has no image-rasterizing dependency today. Rendering in
the browser also yields each page's text in the same pass, which the learner side uses for
accessibility and spec 3's generator uses for grounding.

### The scope change is the one thing that needs a human

`backend/src/api/googleAuth.ts:13` currently requests `["drive.file", "openid", "email"]`. Adding
`https://www.googleapis.com/auth/drive.readonly` means **an admin must reconnect the bot account** —
the existing refresh token does not carry the new scope, and nothing detects that until an export
fails. Two consequences the implementation must handle:

- `drive.readonly` lets the bot account read **everything it can see**, not just course decks. That
  is a real widening and should be stated in the connect screen.
- A linked deck must be visible to the bot account. `getBotAccountEmail()` already exists; the link
  form surfaces that address with "share the deck with this account first", and a failed export
  returns that message rather than a bare 403.

The `.pdf` and `.pptx` paths work **without** the new scope. If the re-consent has not happened, only
the link field is disabled — the feature is not blocked on it.

## Data model

```prisma
enum CourseSectionKind {
  CONTENT
  VIDEO
  QUIZ
  SLIDES     // new
}

model CourseSlide {
  id          String        @id @default(cuid())
  sectionId   String
  section     CourseSection @relation(fields: [sectionId], references: [id], onDelete: Cascade)
  index       Int           // 0-based position in the deck
  imageUrl    String        // Drive direct-view URL of the rendered page
  imageFileId String        // kept so a re-import can delete what it replaces
  text        String?       // extracted page text — a11y, search, AI grounding
  notes       String?       // author-written speaker notes, shown beneath the deck
  startSec    Int?          // narration start time; null when unsynced
  width       Int?
  height      Int?          // natural PNG size, so the stage reserves the right box

  @@index([sectionId, index])
}
```

- `CourseSection.slideConfig Json?` — `{ sourceKind: "PDF"|"PPTX"|"GSLIDES", sourceName, audioUrl, audioFileId, audioDurationSec, autoAdvance }`. One JSON column, same idiom as `videoConfig`, and every writer must spread the previous value so a partial save cannot drop keys it does not own.
- `CourseQuestion.slideIndex Int?` — non-null means an overlay question on that slide. Exactly mirrors `videoTimestampSec`; a question row has at most one of the two set.
- `CourseSectionProgress.maxSlideIndex Int @default(0)` — the server-clamped high-water mark.

Migration is additive: a new enum value, a new table, three nullable/defaulted columns. No backfill,
and no existing row changes meaning.

## Import pipeline

```
author picks .pdf ──────────────────────────────┐
author picks .pptx ─→ POST …/deck/source ─→ PDF ─┼─→ pdfjs-dist in the browser
author pastes link ─→ POST …/deck/source ─→ PDF ─┘        │
                                                          ├─ page → canvas → PNG blob
                                                          └─ page → text layer → string
                                                                    │
                              POST …/slides  (multipart, ONE PER PAGE, with index + text)
                                                                    │
                                            server → uploadImageToDrive → CourseSlide row
```

**One request per page, multipart — not a batch of base64.** `app.ts` uses `express.json()` at its
default **100 kb** limit (a known trap in this codebase), so a 30-page deck posted as base64 JSON
would 413. Per-page multipart also gives an honest progress bar and lets a failed page be retried
alone. It mirrors `uploadVaultFile`'s XHR-with-progress pattern.

Re-importing replaces the deck: existing `CourseSlide` rows are deleted and their Drive files removed
by `imageFileId`. Questions are **not** deleted — a `slideIndex` past the new deck's end is clamped to
the last slide and flagged in the workbench, because silently dropping an author's questions on a
re-import is worse than a stale pointer they can see.

### Where the images live, honestly

Rendered slides go to Drive via `uploadImageToDrive`, which makes them publicly readable and returns
a direct-view URL — the same treatment blog images already get. So a slide image URL is unguessable
but not access-controlled.

The gate still works as designed: those URLs are only ever serialized for **unlocked** sections, so a
learner cannot discover a locked deck. But a URL that leaks is readable without a session. This is
consistent with how every other image in the product behaves, and course decks are internal training
material rather than secrets. Stated here so it is a decision rather than an accident. Anything
genuinely confidential does not belong in a course deck.

## Audio and sync

One narration file per deck, uploaded to Drive, referenced from `slideConfig.audioUrl`.

Timings are author-recorded, not inferred: the workbench plays the track with the deck beside it and
a **"Slide starts here"** button (also bound to `Space`) that writes the audio's current time into
the visible slide's `startSec`. Each `startSec` is also directly editable as a number, because
recording a 40-slide deck by ear and then needing to nudge slide 27 by two seconds is the normal case.

At learn time, `timeupdate` picks the last slide whose `startSec` is ≤ the current time. Slides with
a null `startSec` are simply never auto-selected — an unsynced deck plays as a manual deck with
background narration, which is a reasonable partial state rather than a broken one.

## Learner experience

`CourseSlidePlayer.jsx`, structurally parallel to `LockedVideoPlayer`:

- image stage, prev/next, `n / total`, keyboard arrows, and the current slide's notes beneath
- when narration exists: an audio element with a scrub bar, plus an auto-advance toggle
- **overlay questions** — arriving at a slide with an unanswered question shows the question over the
  stage and blocks advancing until it is answered. Reuses `answeredPopupIds` and
  `POST /sections/:sid/popup-answer` unchanged; only the trigger differs (slide index, not timestamp)
- progress pings `POST /sections/:sid/slide-progress { index }`

**The clamp is simpler than video's, deliberately.** Video's clamp exists because watch time can be
fabricated; there is no equivalent for slides — paging through fast is just reading fast. So the
server accepts any index that is monotonically increasing and within the deck, and nothing more.
Pretending otherwise would add a wall-clock rule that punishes fast readers and stops no one.

Completion: `maxSlideIndex === slides.length - 1` **and** every question with a `slideIndex` is in
`answeredPopupIds`. Enforced server-side in `completeSection`, which already refuses premature
completion for VIDEO.

`LearnerSection` gains `slides` and `slideConfig`, attached **only when unlocked** — the same
omission rule that already withholds `contentJson` and `videoConfig`.

## Authoring surface

`CourseSlidesWorkbench.jsx` replaces the main column for a SLIDES section, matching
`CourseVideoWorkbench`'s layout language:

1. **Source row** — three tabs (Upload PDF / Upload PowerPoint / Google Slides link), the current
   deck's name and slide count, and a "Replace deck" action with a confirm. The link tab is disabled
   with an explanation when the bot account lacks `drive.readonly`.
2. **Import progress** — per-page, cancellable. A cancelled import leaves the previous deck intact,
   because slides are only swapped in after every page has uploaded.
3. **Slide grid** — thumbnails with per-slide notes and start time, click to select.
4. **Narration** — audio upload, waveform-free scrub bar, and the sync mode described above.
5. **Overlay questions** — the existing `QuestionForm` and per-question save, with "Add question on
   this slide" seeding `slideIndex` from the selected slide (mirroring the video workbench's
   "Add pop-up at current time").

Sections 3–5 render nothing but an empty state until a deck exists. `CourseEditorPage`'s main-column
switch gains a `SLIDES` case; the AI panel stays available (a SLIDES section keeps its prose body,
which spec 3 uses for generated slide outlines and which renders beneath the deck like VIDEO notes).

## API

```
POST   /api/outreach/courses/sections/:sid/deck/source   multipart .pptx | { url } → application/pdf
POST   /api/outreach/courses/sections/:sid/slides        multipart page PNG + { index, text, width, height }
PUT    /api/outreach/courses/sections/:sid/slides        [{ id, notes, startSec }] — metadata only, whole set
DELETE /api/outreach/courses/sections/:sid/slides        drop the deck (rows + Drive files)
POST   /api/outreach/courses/sections/:sid/audio         multipart audio → slideConfig.audioUrl
DELETE /api/outreach/courses/sections/:sid/audio
POST   /api/outreach/courses/sections/:sid/slide-progress { index } → clamped maxSlideIndex
GET    /api/outreach/courses/sections/:sid/slides        editor: full rows. learner: via the learn payload only
```

`deck/source` streams a PDF rather than returning JSON, so the browser can hand it straight to
`pdfjs`. It is the only endpoint here that talks to Drive's conversion machinery.

## Files

| Action | File |
|---|---|
| Modify | `backend/prisma/schema.prisma` + one additive migration |
| Modify | `backend/src/api/googleAuth.ts` (add `drive.readonly` to the scope list) |
| Modify | `backend/src/services/driveService.ts` (`convertToPdf`, `exportFileAsPdf`) |
| New | `backend/src/services/courseSlideService.ts` |
| Modify | `backend/src/api/courses.ts` (8 routes) |
| Modify | `backend/src/services/courseProgressService.ts` (payload, clamp, completion) |
| New | `src/components/clubpm/courses/deckImport.js` (pdfjs render + upload loop) |
| New | `src/components/clubpm/courses/CourseSlidesWorkbench.jsx` |
| New | `src/components/clubpm/courses/CourseSlidePlayer.jsx` |
| Modify | `src/pages/ClubPM/CourseEditorPage.jsx`, `CoursePlayerPage.jsx`, `CourseSectionRail.jsx` (SECTION_KINDS), `src/api/clubPmClient.js`, `public/clubpm-theme.css` |
| Add dep | `pdfjs-dist` (frontend, lazy-loaded, ClubPM-only) |

## Verification

**Unit** (`backend/src/services/courseSlideService.test.ts`, pure, `npx tsx`):
- the slide clamp accepts a forward index, rejects a backward one, and rejects one past the deck
- completion is false with an unanswered overlay question even at the last slide
- a question whose `slideIndex` exceeds a re-imported deck clamps to the last slide
- `slideConfig` writers preserve keys they do not set

**Build gates:** `npm run build` at root, `npx tsc --noEmit` in `backend/` after `npx prisma generate`.

**Manual:**
1. Import a 10-page PDF; confirm ten slides with images and extracted text, and a progress bar that
   reaches 100%.
2. Import a `.pptx`; confirm the same, and that the Drive conversion produced the right page count.
3. Before re-consenting the bot account, confirm the link tab is disabled with an explanation. After
   re-consenting, paste a Slides URL **not** shared with the bot account and confirm the error names
   the bot email; share it and confirm the import succeeds.
4. Upload narration, sync four slides by tapping, reload, confirm the times persisted.
5. As a learner, confirm slides auto-advance with the audio and that the notes track the slide.
6. Add a question on slide 3; as a learner confirm advancing past slide 3 is blocked until answered.
7. Confirm the section will not complete before the last slide, and does immediately after.
8. Re-import a shorter deck; confirm old Drive files are gone and an out-of-range question is flagged.
9. Confirm a locked SLIDES section's payload carries no `slides` and no `slideConfig`.
