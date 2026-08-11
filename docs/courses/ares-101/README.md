# ARES 101 — why the course is cut this way

ARES is a wearable CO₂ and biophysical sensing headset built by a Purdue team under D. Marshall
Porterfield, in partnership with SEARCH. It measures CO₂, temperature, humidity, and airflow at three
positions on the head, to detect the **CO₂ bubble** — the localized zone of rebreathed exhalate that
forms in front of the face when buoyancy-driven convection collapses, whether from microgravity or
from terrestrial heat stress.

This course takes a new member from "what is a CO₂ bubble" to being able to contribute to a summer
deliverable. It is the first course in `docs/courses/` about a **subject** rather than about
Constellation itself.

Design spec:
[`../../superpowers/specs/2026-08-07-ares-course-design.md`](../../superpowers/specs/2026-08-07-ares-course-design.md)
Implementation plan:
[`../../superpowers/plans/2026-08-07-ares-101-curriculum.md`](../../superpowers/plans/2026-08-07-ares-101-curriculum.md)

**Read [`GLOSSARY.md`](GLOSSARY.md) before writing any module.** It is binding: it fixes HTBP, BTC,
IBD, the rebreathed-fraction formula, the dimensionless-number definitions, the shared property
table, and the units convention. It landed before the modules deliberately — eleven independently
researched modules will otherwise invent eleven vocabularies for the same plume.

---

## Two rules a later author will otherwise break

### 1. Exactly one of video-or-deck per module. Never both, never neither.

Each module's section 1 is **either** a `VIDEO` (`videos/Vnn-*.md`) **or** a `SLIDES` deck
(`slides/Snn-*.outline.md`). The choice is made per module and is already fixed in
[`course.json`](course.json):

- **Video** where a *number is derived*. Worked problems, tablet handwriting over a slide backdrop
  with voice-over. M1, M2, M3, M5, M6, M8, M10.
- **Deck** where the content is *looked up*. Reference tables and diagrams people come back to. M4,
  M7, M9, M11.

Every deck outline carries a "Why a deck and not a video" section. If the honest answer is not "this
is reference material people return to", it should have been a video — change the section kind in
`course.json` rather than writing a deck nobody will reopen.

Adding the other one "as a bonus" breaks the 20-minute module budget and the `estimatedMinutes` sum
below.

### 2. Every current-state claim names its source.

Each `content/Cnn` file ends with a `Sources` line naming the deck, document, or code file its
current-state section drew from — `ARES_7_30_26.pptx` slide 11, `src/main.cpp`, deliverable 2.5.2,
and so on.

This is not citation hygiene. The ARES hardware is changing weekly through August 2026, so the
current-state sections of this course **will** go stale. Naming the source is what makes the drift
findable when it does: someone who changes the pump can grep this directory for `lee_pump` and find
every sentence that now needs rewriting. A current-state paragraph with no source is a claim nobody
can re-verify and nobody will dare to change.

The same applies to the `Sources:` line in each module task of the plan. If you draw on something the
plan did not list, add it to the file's `Sources` line.

---

## Why the modules are cut where they are

Eleven modules, each **background → current ARES state → what's next**, each independently
researchable without reading another module's sources. The cut follows the physical path a CO₂
molecule takes and then the path a *number* takes, which is why it is not the same as the order the
team built things in.

| Module | Why it is its own module |
|---|---|
| **M1 · Gravity, buoyancy, and mass transport** | The physics that makes any of this a problem. Everything else is downstream of "warm air rises, and in orbit it doesn't." Cut from M2 because a learner who has not separated *convection stopping* from *transport stopping* mis-reads every result that follows. |
| **M2 · The human thermal body plume and the CO₂ bubble** | The specific flow around a specific human, and the justification for three pods at three positions. Separate from M1 because M1 is regime-independent physics and M2 is a body. |
| **M3 · Reading the CFD paper** | Method, not phenomenon. It exists because the Porterfield paper is handed to every new member on day one, and "read this" is not onboarding. The module most likely to be cut if eleven proves long; kept for exactly that reason. |
| **M4 · Hypercapnia and the body** | Why the number matters at all. The only module about the human rather than the air. Cut from M1–M3 because physiology has no overlap with fluid mechanics in either sources or prerequisites. |
| **M5 · NDIR gas sensing** | How the concentration becomes a voltage becomes an integer. The first module where the firmware becomes real. |
| **M6 · Sampling — pumps, tubing, and transport delay** | Everything between the air and the sensor. Separated from M5 because sensor response time and transport delay are different quantities that get conflated constantly, and separating them into two modules is what forces the distinction. |
| **M7 · Anemometry and the CTA circuit** | The other sensor. A different physical principle, a different circuit, and a different open question — and its exercise answers a live question from the 7/30 deck rather than teaching one. |
| **M8 · From signal to science** | Where readings become physiology: the ten models. This is the module that shows why the previous four mattered. |
| **M9 · The system and the data contract** | Architecture: buses, timing, characteristics, CSV columns. Split from M5 and M8 because it is the module someone re-opens while writing code, and it should be findable on its own. |
| **M10 · Calibration, error, and trusting a number** | The discipline that decides whether any of the above produces a result. Deliberately late: it lands hardest once the learner has seen how many stages a reading passes through. |
| **M11 · Doing the science** | Experimental design, human-subjects ethics, and the four summer tracks. Closes the course, and carries the final. |

Order matters in three places and only three:

- **M1 → M2 → M3.** M2 assumes HTBP, BTC, IBD, and the candle analogy are already defined. M3 assumes
  M2's plume structure.
- **M5 → M6.** M6's whole first section rests on T90 being a sensor property already understood.
- **M2, M6, M7 → M8.** M8 combines rebreathed fraction, transport delay, and flow velocity.

M4, M9, M10, and M11 depend on the glossary and little else. If a module has to be reordered or
rewritten, those are the cheap ones.

---

## The section contract

Every module is these sections, in this order:

| # | Kind | File | Minutes | What it is |
|---|---|---|---|---|
| 0 | `CONTENT` | `content/Cnn-<slug>.md` | 5 | The reading. Publish-quality prose — this *is* the blog post. |
| 1 | `VIDEO` or `SLIDES` | `videos/Vnn-<slug>.md` / `slides/Snn-<slug>.outline.md` | 5 | Worked problem, or reference deck. Never both. |
| 2 | `LIT_REVIEW` | `lit/Lnn-<slug>.md` | 6 — **8 for M1–M3** | The paper, its bibliography, the reference summary and rubric. |
| 3 | `CONTENT` | `exercises/Enn-<slug>.md` | 2 | The hands-on. **Omitted for M1–M3.** |
| 4 | `QUIZ` | `quizzes/Qnn-<slug>.json` | 2 | 5–7 questions. |

Every module totals **20 minutes** either way: 5 + 5 + 8 + 2 for M1–M3, and 5 + 5 + 6 + 2 + 2 for
M4–M11. That is **52 sections** across eleven modules, not 55 — M1–M3 carry their practice in the
video, and there is no hardware to touch yet at that point in the course.

`course.json`'s course-level `estimatedMinutes` (220) must equal the sum of its modules' (11 × 20).
**Nothing validates that sum.** If you add or remove a section, update the module estimate *and* the
course total, then run:

```bash
node -e "const c=require('./docs/courses/ares-101/course.json'); const sum=c.modules.reduce((s,m)=>s+m.estimatedMinutes,0); console.log('modules',c.modules.length,'sections',c.modules.reduce((s,m)=>s+m.sections.length,0),'sum',sum,'declared',c.estimatedMinutes); if(sum!==c.estimatedMinutes) throw new Error('estimatedMinutes mismatch');"
```

Expected: `modules 11 sections 52 sum 220 declared 220`.

---

## Asset numbering — fixed, do not deviate

Numbering is **global across all courses**; these continue from the existing C11, Q11, S01, V10.
`lit/` and `exercises/` are new directories with new prefixes. Every filename below is already
referenced by `course.json`, so a module task fills in files that are pointed at, not files it names.

| Module | Reading | Video / Deck | Lit review | Exercise | Quiz |
|---|---|---|---|---|---|
| M1 Gravity, buoyancy, mass transport | C12 | **V11** | L01 | — | Q12 |
| M2 The HTBP and the CO₂ bubble | C13 | **V12** | L02 | — | Q13 |
| M3 Reading the CFD paper | C14 | **V13** | L03 | — | Q14 |
| M4 Hypercapnia and the body | C15 | **S02** | L04 | E01 | Q15 |
| M5 NDIR gas sensing | C16 | **V14** | L05 | E02 | Q16 |
| M6 Sampling: pumps, tubing, delay | C17 | **V15** | L06 | E03 | Q17 |
| M7 Anemometry and the CTA circuit | C18 | **S03** | L07 | E04 | Q18 |
| M8 From signal to science | C19 | **V16** | L08 | E05 | Q19 |
| M9 The system and the data contract | C20 | **S04** | L09 | E06 | Q20 |
| M10 Calibration, error, trust | C21 | **V17** | L10 | E07 | Q21 |
| M11 Doing the science | C22 | **S05** | L11 | E08 | Q22 |

---

## File formats

- **`content/Cnn-*.md` and `exercises/Enn-*.md`** — open with the authoring header that
  `stripAuthoringHeader()` removes: an H1 carrying the file's id, an optional blockquote of
  maintainer notes, then a `---` rule. See `../constellation-101/content/C01-what-constellation-is.md`.
  The learner sees none of it.
- **`videos/Vnn-*.md`** — the format is set by `../constellation-101/videos/V02-anatomy-of-a-task.md`:
  metadata table, Purpose, shot list, Visual edits, word-for-word Narration. **ARES videos differ in
  one way:** the format is *tablet handwriting over a slide backdrop + VO*, not screen capture — there
  is no UI to capture — so the shot-list columns are `Time | On screen | What is written`.
- **`slides/Snn-*.outline.md`** — the format is set by
  `../constellation-101/slides/S01-rank-ladder.outline.md`: metadata table, "Why a deck and not a
  video", numbered slides, Production notes.
- **`quizzes/Qnn-*.json`** — matches `../constellation-101/quizzes/Q01-orientation.json` exactly.
  Every question carries an `explanation`. Pass thresholds are **75 with unlimited attempts** for
  module quizzes and **80 with 3 attempts** for Q22, the course final.
- **`lit/Lnn-*.md`** — YAML frontmatter is the section's `litConfig`, body is the annotated
  bibliography and synthesis. `referenceSummary` **must be the last key in the frontmatter** — the
  seeder reads it to the closing `---`. The reference summary and the rubric weights are **never**
  serialized to a learner; the body is author material and is not installed at all.

Sources for every `LIT_REVIEW` are recorded in [`lit/SOURCES.md`](lit/SOURCES.md): module → document →
DOI → Drive file id. **Never invent a citation.** A rubric built on a hallucinated paper grades
members against a document they cannot find.

---

## What this course does not get

- **No walkthroughs.** There is no ARES UI inside Constellation to tour, so
  `scripts/check-tour-anchors.js` has nothing to check here and `tourAnchors.js` / `ANCHORS.md` are
  untouched.
- **No AI generation.** The modules are researched and written, not generated.
- **Not a replacement for the papers.** The course teaches someone to read them, then hands them over.
- **Not a hardware build guide, and not a Flutter or ESP32 tutorial.** M8 and M9 teach the
  architecture and the data contract, not Dart or the Arduino framework.
- **Not public.** ARES 101 lives behind `/clubpm`. The eleven readings are what can go public, and
  only when someone chooses to publish them.

---

## Verification

```bash
cd backend && npm run check:courses && npm run seed:courses
```

`check:courses` validates that every CONTENT body converts to a real TipTap document, without needing
a database. `seed:courses` installs the course; expect `✓ ares-101: 11 modules`.

Beyond that, three things nothing automates:

1. **Every number spoken in V11–V17 must be recomputed at review time.** A derivation with a wrong
   constant reads perfectly and teaches the wrong thing. Use the property table in `GLOSSARY.md`.
2. **Every quiz answer must be findable in that module's own content.** If it is not, the question is
   wrong, not the learner.
3. **Every `pdfDriveFileId` must render in a private browser window** at
   `https://drive.google.com/file/d/<id>/preview`. An unshared file renders as a sign-in wall inside
   the course, not as the paper.

### Status as of 2026-08-11

`check:courses` passes, `seed:courses` installs `✓ ares-101: 11 modules`, `npm run build` passes, and
`estimatedMinutes` sums to 220. **Item 1 above is done** — every number in `V11`–`V17` was recomputed
against `GLOSSARY.md` §4 and the four corrections that came out of it are in those files.

Two things still block a learner taking this course end to end, and both are unfinished work from
earlier tasks rather than anything wrong with the modules that are written:

- **M6 is three files short.** `lit/L06-sample-line-response.md`, `exercises/E03-measure-the-delay.md`
  and `quizzes/Q17-sampling.json` do not exist. `course.json` already points at all three, so the
  seeder installs those sections **empty** and says so on every run. `C17` and `V15` are written and
  correct. Because modules are `sequential`, an empty Q17 means nobody gets past M6.
- **No `LIT_REVIEW` PDF is viewable by a learner.** The Drive `Papers` folder and its files are
  owner-only, so all eleven sections render a Google sign-in wall; five PDFs were never uploaded, and
  `L07`, `L09`, `L10` and `L11` still carry literal `PENDING_…` strings where a file id belongs. The
  fix is [`lit/SOURCES.md`](lit/SOURCES.md) *Open actions* 1–3, which need a human in a browser.

Until both are cleared the course should stay `"status": "DRAFT"`.

---

## Published readings

Each `content/Cnn` file is publish-quality prose by design and can be posted to the public blog at
`purduesearch.org`. **Publishing is per-module and is the author's call** — these were written for a
new ARES engineer and several read as too technical for the public site.

Reviewed 2026-08-11. Nothing has been posted yet: the two selected readings are cleared for
publication and are waiting on someone to paste them into the blog editor. Tick the box and fill the
slug when that happens.

| Module | Reading | Published? | Slug | Decision |
|---|---|---|---|---|
| M1 | C12 — How gravity moves air | ☐ **selected** | — | Publish. General fluid mechanics, no ARES-internal detail anywhere in it, and the one reading that stands entirely on its own for a lay audience. |
| M2 | C13 — The plume and the bubble | ☐ **selected** | — | Publish. Plume structure and the pod rationale are interesting to a general reader and disclose nothing sensitive. |
| M3 | C14 — Reading the CFD paper | ☐ | — | Internal. Teaches how to read one specific paper; no standalone value off the course. |
| M4 | C15 — What CO₂ does to you | ☐ **hold — author's call** | — | **Not cleared.** The physiology is excellent public writing, but the reading discusses a named NASA astronaut's January 2026 **undiagnosed** medical event at length. The section handles it responsibly and explicitly refuses to treat it as evidence — but that is a real, identifiable person's health on the club's public site, next to a CO₂ hypothesis. Publish only with that section cut, or not at all. Not a call to make by default. |
| M5 | C16 — NDIR sensing | ☐ | — | Internal. Firmware protocol detail. |
| M6 | C17 — Sampling | ☐ | — | Internal. Hardware detail. |
| M7 | C18 — Anemometry | ☐ | — | Internal. Circuit detail and three open questions. |
| M8 | C19 — Signal to science | ☐ | — | Internal. Model-by-model tour of the app. |
| M9 | C20 — The system | ☐ | — | Internal. This *is* the data contract. |
| M10 | C21 — Calibration | ☐ | — | Internal. Bench procedure. |
| M11 | C22 — Doing the science | ☐ **hold** | — | **Not cleared.** The experimental-design and research-ethics half is the best public writing in the course, but "Current state" airs live operational problems: IRB approval outstanding against a slipping schedule, component orders "repeatedly cancelled or misplaced", and a workaround that routes purchasing through the capstone team. That is internal candour and should not go out under the club's public brand. Publishable only as an extract of the first two thirds. |

**Why this differs from the plan.** Task 14 nominated M1, M2, M4 and M11 as the strongest candidates.
M1 and M2 hold up. M4 and M11 do not survive review for the reasons above — both are excellent
*internal* writing, and in both cases what disqualifies them is a specific section rather than the
piece as a whole.
