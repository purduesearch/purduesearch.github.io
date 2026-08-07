# ARES 101 — Course Design, and the `LIT_REVIEW` Section Kind

Fifth spec in the course-system line, after modules, slides, AI generation, and walkthroughs. It
assumes those have shipped: a `CourseSection` belongs to a `CourseModule`, the learner payload
withholds locked sections' bodies, `completeSection` refuses premature completion per kind, and
`seedCourses.ts` installs a course from files under `docs/courses/`.

It is the first course in this repo about a **subject** rather than about Constellation itself.

## Context

ARES (Atmospheric Research and Experiment System) is a wearable CO₂ / biophysical sensing headset
built by a Purdue team under D. Marshall Porterfield, in partnership with SEARCH. It measures
CO₂, temperature, humidity, and airflow at three positions on the head to detect the **"CO₂ bubble"**
— a localized zone of rebreathed exhalate that forms in front of the face when buoyancy-driven
convection collapses, whether from microgravity or terrestrial heat stress.

The project spans an unusual range: buoyancy-driven fluid mechanics, respiratory physiology, NDIR
gas sensing, constant-temperature anemometry, embedded firmware, a Flutter app with ten physiology
models, human-subjects research ethics, and a cave expedition. A new member arrives with a calculus
and intro-physics background and is currently onboarded by conversation.

The knowledge exists, but it is scattered across four places that do not talk to each other:

| Source | Holds |
|---|---|
| Dutta, Tulodziecki, Schwertz, … Porterfield (2025), *Gravity and Human Respiration* | The CFD model, the HTBP, the 0.38g threshold, the 14% exchange penalty |
| `ARES_CO2_Presentation` (Spring 2026) | ARES 1, the Fincke incident, hypercapnia tiers, applications |
| `ARES_7_30_26.pptx` | ARES 2: pods, BLE contract, science engine, CTA, Lee pump, blockers |
| `ARES_CO2_Headset_Summer2026_Deliverables.docx` | Four tracks, 8 deliverables, ~80 subtasks, May 11 – Aug 19 2026 |
| `C:\Users\Henry\Documents\ARES\ARES2ESP32` | The firmware, the Flutter app, the actual current state |

This spec turns that into a course a new ARES member can take.

## Decisions

| Decision | Choice |
|---|---|
| Audience | **New ARES team members.** Purdue undergrads, mixed EE/ME/bio/CS. Calculus + intro physics assumed; fluid mechanics, physiology, and sensor theory are not. |
| Home | `docs/courses/ares-101/`, a seeded Constellation course. Same authoring standard as the five existing courses. |
| Module cut | **Eleven topic modules.** Each carries background → current ARES state → what's next, and is independently researchable. |
| Blog posts | **The module reading *is* the blog post.** One canonical text per module in `content/`, publish-quality. No parallel second text to keep in sync. |
| Literature review | Per-module `lit/Lnn` file: annotated bibliography + narrative synthesis + the reference summary and rubric for that module's `LIT_REVIEW` section. |
| Videos | **Worked problems**, tablet/whiteboard over a slide backdrop. Not screen capture — there is no UI to capture. |
| Video vs deck | **Exactly one per module, never both.** Deck where the content is looked up; video where a number is derived. |
| New section kind | `LIT_REVIEW` — hosts a PDF, takes a learner summary, returns Gemini feedback against an author-written reference summary. |
| Grading | **Formative.** Completion gates on a good-faith submission over a length floor, never on a score. |
| Walkthroughs | **None.** There is no ARES UI inside Constellation to tour. |

## Non-goals

- **Not a replacement for the papers.** The course teaches someone to read them, then hands them over.
- **Not a hardware build guide.** Assembly procedure lives in the deliverables doc and the field
  procedure, which are working documents with their own revision cycle.
- **Not a Flutter or ESP32 tutorial.** M8 and M9 teach the *architecture* and the data contract, not
  Dart or the Arduino framework.
- **No new question kind.** `LIT_REVIEW` is a section kind with its own submission model.
  `CourseQuestionKind` stays `SINGLE | MULTI | TRUE_FALSE` — free-response questions inside quizzes
  are a different feature and are not in scope.
- **Not a public course.** ARES 101 lives behind `/clubpm`. The eleven blog posts are what goes
  public, and only when someone chooses to publish them.

---

# Part 1 — The `LIT_REVIEW` section kind

## Why a new kind, and not a quiz

Reading a paper is the single most transferable skill this course teaches, and it is exactly what
multiple-choice cannot assess. A member who can pick "≈2×" from four options has not demonstrated
they read Figure 3; a member who can write four paragraphs on what Dutta et al. actually claim has.

The existing kinds cannot express this. `QUIZ` scores against `CourseAnswer.isCorrect`. `CONTENT`
takes no learner input at all. So: a new kind.

## The data model

```prisma
enum CourseSectionKind {
  CONTENT
  VIDEO
  QUIZ
  SLIDES
  WALKTHROUGH
  LIT_REVIEW      // new
}
```

`CourseSection` gains one nullable JSON column, following the `videoConfig` / `slideConfig` /
`tourConfig` idiom exactly — one column, and every writer spreads the previous value so a partial
save cannot drop keys it does not own:

```ts
// LIT_REVIEW: litConfig
{
  pdfDriveFileId: string,      // Drive file, same access model as CourseSlide images
  pdfTitle: string,
  citation: string,            // full citation rendered under the PDF pane
  promptText: string,          // what the learner is asked to produce
  minWords: number,            // the effort floor. Default 150.
  referenceSummary: string,    // author-written. NEVER serialized to a learner.
  rubric: Array<{
    id: string,                // stable, so feedback rows survive rubric edits
    point: string,             // "Identifies that the 2× figure is transient, not mean"
    weight: number
  }>
}
```

And one new model:

```prisma
model CourseLitSubmission {
  id           String        @id @default(cuid())
  sectionId    String
  section      CourseSection @relation(fields: [sectionId], references: [id], onDelete: Cascade)
  memberId     String
  member       Member        @relation(fields: [memberId], references: [id], onDelete: Cascade)
  text         String
  wordCount    Int
  // null until grading returns. A null here is a pending grade, not a failure.
  feedbackJson Json?
  gradedAt     DateTime?
  createdAt    DateTime      @default(now())

  @@index([sectionId, memberId])
}
```

Both relations need back-references — `litSubmissions CourseLitSubmission[]` on `Member` and on
`CourseSection` — or the schema will not validate. And `prisma generate` must run before `tsc`, or
the backend reports phantom type errors against a stale client.

**One row per attempt, never an update.** A member who resubmits after reading the feedback produces
a second row. The revision history is the most interesting artifact this section produces, and
overwriting it to save a row would throw it away.

### The serialization rule

`referenceSummary` and `rubric[].weight` are to `litConfig` what `isCorrect` is to `CourseAnswer`:
**they must never appear in a learner-facing payload.** `rubric[].point` may be shown *after* a
submission exists, because it is the feedback. Before submission, the learner sees the PDF, the
citation, and the prompt — nothing else.

This is a real risk, not a theoretical one: `litConfig` is one JSON column, and the natural
implementation of a section-fetch handler returns the whole column. The learner payload must strip
it explicitly, and that strip needs a test.

## API

```
POST   /api/courses/sections/:sid/lit-review/submit    { text } → { submission, feedback }
GET    /api/courses/sections/:sid/lit-review           learner's own submissions + feedback
```

`submit`:

1. Rejects text below `minWords`, with the count, before spending a Gemini call.
2. Writes the `CourseLitSubmission` row.
3. Marks `CourseSectionProgress` `COMPLETED`. **This happens before grading, not after.**
4. Calls `geminiService.generateJson()` with the paper's reference summary, the rubric, and the
   learner's text, asking for per-rubric-point feedback.
5. Writes `feedbackJson` + `gradedAt`, returns both.

Handlers read `req.memberId`, never `req.session.memberId` — the Bearer-token fallback makes session
reads `undefined` for Brave and Safari users, a bug class that has already appeared in 12 API files
in this repo.

### Failing soft is mandatory

If Gemini is unreachable, rate-limited, returns malformed JSON, or the complex-model daily quota is
spent, **step 3 has already happened.** The submission is saved, the section is complete, and the
response carries `feedback: null`. The UI renders "Feedback pending" and offers a retry.

This is not defensive coding, it is the design. Completion is gated on effort by decision; if an
outage in a third-party model could block a member's progress, the grade would be a gate after all.

A nightly sweep is deliberately **not** specified. Ungraded submissions stay ungraded until someone
retries. A cron that silently regrades weeks-old text would produce feedback nobody is expecting on
a paper nobody remembers reading.

## Frontend

| File | Role |
|---|---|
| `src/components/clubpm/courses/LitReviewSection.jsx` | Learner surface: PDF pane, composer with live word count, submit, feedback cards, prior attempts |
| `src/components/clubpm/courses/LitReviewBuilder.jsx` | Author surface: attach Drive PDF, write prompt, reference summary, rubric rows |
| `src/pages/ClubPM/CoursePlayerPage.jsx` | One case added to the kind switch |
| `src/pages/ClubPM/CourseEditorPage.jsx` | Mounts the builder |
| `src/api/clubPmClient.js` | `submitLitReview()`, `getLitReview()` |
| `public/clubpm-theme.css` | Appended at the bottom. ClubPM-only surface — nothing goes in `search-theme.css`. |

The PDF pane reuses whatever the slides workbench already does with Drive-hosted PDFs
(`deckImport.js`, `CourseSlidePlayer.jsx`). Building a second PDF path would be the wrong call.

Feedback renders as one card per rubric point, each labelled caught / partial / missed, plus a short
overall note. **No score is shown to the learner.** The number exists for officers, in the existing
`/:id/progress` payload; showing it to the member would re-establish the gate the design removed.

## Seeder

`seedCourses.ts` learns one new key: `litRef: "lit/L01-....md"`. That file's frontmatter carries the
citation, PDF Drive id, prompt, `minWords`, reference summary, and rubric; its body is the annotated
bibliography and synthesis, which is author material and is not installed into the database.

One file holds both because they are written together and drift apart if separated — the reference
summary is a distillation of the synthesis directly above it.

---

# Part 2 — The curriculum

## ARES 101 — eleven modules, ~3 h 40 m

Each module is background → current state → what's next. Each is a phase; each can be researched by
a different person without reading another module's sources.

### M1 · Gravity, buoyancy, and mass transport 🎬

Gravitational convection, the Boussinesq approximation, Grashof and Rayleigh numbers, the Péclet
number, advection versus diffusion, unstirred boundary layers. Faraday's candle, and why the
spherical flame in orbit is the same physics as the bubble.
**Current:** why ARES exists — bulk ECLSS sensors measure a quantity that is not the one that harms you.
**Next:** the 0.38g Mars threshold; heat stress as a terrestrial analog.
**Video:** compute Gr and Ra for a human at ΔT = 15 K, show buoyancy dominates; set g → 0, show Pe → 0.

### M2 · The human thermal body plume and the CO₂ bubble 🎬

HTBP structure and the ~0.3–0.4 m/s peak velocity at the crown; the respiratory breathing envelope;
Schlieren validation; what "rebreathing" means quantitatively.
**Current:** why three pods, and why *those* three positions — top as ambient reference, chin as the
exhale signal, chin-minus-top as the rebreathing measurement.
**Next:** moving the top pod backwards; room-reference nodes.
**Video:** derive rebreathed fraction from chin and top CO₂; show why a pod standing in the flow
corrupts the number it reports.

### M3 · Reading the CFD paper 🎬

How to read this class of paper: incompressible Navier–Stokes plus two advection–diffusion equations,
Boussinesq closure, non-dimensionalisation on Lc = 0.15 m and Vc = 0.2816 m/s, the novel
inflow–outflow mouth boundary condition, mesh and validation strategy, what the figures actually show.
**Current:** the specific prediction ARES exists to test — face-level CO₂ roughly double bulk cabin.
**Next:** mannequin-first validation anchoring a CFD model while IRB is pending.
**Video:** non-dimensionalise; compute Re; read the 0.38g threshold and the 14% penalty off Fig. 5A.

> M3 is the module most likely to be cut if eleven proves long. It is kept because the Porterfield
> paper is handed to every new member on day one, and "read this" is not onboarding.

### M4 · Hypercapnia and the body 📊

CO₂ dose–response by tier; ppm vs mmHg vs %; PaCO₂; cerebral vasodilation and intracranial pressure;
SANS; the near-doubling of headache odds per mmHg; adaptation masking symptoms; NASA's limit history
(2006 → 5 mmHg, 2010 → 4 mmHg); the Fincke incident as an open question, framed as an open question.
**Current:** the app's warn/danger thresholds and the ppm·hours dosimeter.
**Next:** EEG correlation.
**Deck:** reference tables people return to — this is lookup material, like the rank ladder deck.
**Exercise:** unit conversions, then compute exposure from a real session CSV.

### M5 · NDIR gas sensing 🎬

Beer–Lambert; the 4.26 µm CO₂ absorption band; NDIR architecture, source, path length, detector;
temperature and pressure dependence; cross-sensitivity; T90; digital filtering and quantisation.
**Current:** SprintIR-6S-20% — ASCII protocol, `Z` returns raw counts times a probed multiplier so
the hardware quantises to 10 ppm, 30 s uptime-derived warm-up, `K 0` first at boot or a streaming
sensor floods the shared UART.
**Next:** the JPL tunable laser spectrometer, WMS O₂ at 760 nm, SEN0465, BME680.
**Video:** Beer–Lambert; decode `Z 00040` at multiplier 10; pressure-correct a reading; extract T90
from a step-response trace.

### M6 · Sampling — pumps, tubing, and transport delay 🎬

Sample-line transport lag; Hagen–Poiseuille; splitting one flow into three matched streams with
balanced restriction; dead volume; dispersion in tubes; condensation; why pulsation matters.
**Current:** the Lee XP UXPB5400200A piezo disc pump — 20–22 kHz AC drive, PWM explicitly unsuitable,
drive power in mW as a monotonic flow proxy, and the `NOM` vs `MEAS` labelling rule that exists so an
estimate is never presented as a measurement.
**Next:** open-path sensing, which deletes the sampling loop entirely.
**Video:** given 2.00 L/min split three ways and known tubing ID and length, compute per-pod transport
delay, and show it must be subtracted before any cross-pod lag analysis means anything.

### M7 · Anemometry and the CTA circuit 📊

Thermal anemometry; King's law; constant-temperature versus constant-current; the Wheatstone bridge
with a feedback op-amp; overheat ratio; frequency response; calibration in the 0.05–0.4 m/s regime
where the interesting velocities live.
**Current:** FS7.0.1L.195 and the custom CTA board — schematic, layout, mechanical fit.
**Next:** anemometry in every pod, feeding flow-weighted inspired CO₂.
**Deck:** bridge topology, King's-law constants, the calibration curve.
**Exercise:** derive the flow rate above which pump inflow stops disturbing the anemometer reading —
**an open question on the 7/30 deck, not a teaching exercise.** Its answer goes back to the team.

### M8 · From signal to science 🎬

The ten physiology models and what each is grounded in: rebreathed fraction, Wells-Riley, ISO 7730
PMV/PPD, FFT respiration rate, cross-pod lag, MET and kcal from HR reserve, dosimetry, fatigue,
hydration, acclimatization.
**Current:** `app/lib/science/` — pure Dart, no Flutter dependencies, unit-tested.
**Next:** flow-weighted inspired CO₂ and ICARUS learned breath detection from NASA's ICWTS work;
Péronnet differential-CO₂ metabolic rate; moving-variance separation of breath- from room-scale signal.
**Video:** rebreathed fraction from a chin/top pair; respiration rate by FFT; then the same trace
where FFT fails, and why flow-weighting beats it.
**Exercise:** run the Dart unit tests; push a session CSV through the models.

### M9 · The system and the data contract 📊

Non-blocking polling state machines; shared-bus arbitration; GATT service and characteristic design;
sample rate versus loop rate; timestamping and clock sync; CSV schema design; NVS persistence.
**Current:** ESP32-S3; the six-step sensor state machine; three SHT45s across two I²C buses and three
SprintIRs across two UARTs, with `co2Port()` tearing down and rebuilding the shared port because GSS
sensors have no bus addressing; the 27-column CSV with a boot counter and a Unix epoch that arrives
over BLE; `LIVE` / `CAL_STATUS` / `STATUS` / `PUMP` / `PHONE` / `CMD`; the §0/§1 watch contracts.
**Next:** O₂ and BME680 channels entering the contract; the redesigned backboard.
**Deck:** the contract as reference — pinout, characteristics, CSV columns.
**Exercise:** trace one reading end to end, sensor to app screen.

### M10 · Calibration, error, and trusting a number 🎬

Accuracy versus precision; offset versus span; the fresh-air baseline; why ABC drifts indoors; sensor
drift; cross-sensor agreement; pressure and temperature correction; uncertainty propagation; what to
do when three sensors disagree.
**Current:** per-pod offsets in NVS; the lamp cycle; ABC disabled on boot because indoor use drives
the baseline below 300 ppm; the five-state cycle Idle → Pending → Running → OK → Fail.
**Next:** certified reference-gas validation and a per-sensor error budget (deliverable 5).
**Video:** three pods read 480 / 455 / 610 in fresh air — which are wrong, what the offset does, and
what the rebreathing model reports if you skip calibration.
**Exercise:** run a real fresh-air calibration.

### M11 · Doing the science 📊

Experimental design: controls, baselines, confounds, and why the analysis plan is written before the
data exists. IRB and human-subjects ethics — Belmont, informed consent, risk, why review takes 4–8
weeks. Analog environments: cave, supine/sleep, breathing mannequin, 37 °C thermal.
**Current:** the four summer tracks — Mammoth Cave with SEARCH, the Herrick lab sleep study, ARES 2
validation, EEG feasibility — and the two live blockers, IRB and procurement.
**Next:** the EEG roadmap; ICES and ASGSR; applications from sleep apnea to heat stress.
**Deck:** the roadmap and deliverable map.
**Exercise:** write the analysis plan for a mock session **before** seeing any data.

## Papers

**Exactly one document per module**, because each module has exactly one `LIT_REVIEW` section. Six
documents exist in the Drive `Papers` folder; five must be sourced.

| Module | Document assigned to its `LIT_REVIEW` section | Status |
|---|---|---|
| M1 | Dutta et al., *Gravity and Human Respiration* — introduction and Fig. 1 | In Drive |
| M2 | DNS of the turbulent flow generated during a violent expiratory event | In Drive |
| M3 | Dutta et al. — Materials and Methods, Results, Figs. 3–6 | In Drive |
| M4 | CO₂ and cognitive performance, or SANS | **To source** |
| M5 | Sanders et al., portable tunable laser spectrometer (ICES-2026-75) | In Drive |
| M6 | Sample-line response and transport lag in gas analysis | **To source** |
| M7 | Constant-temperature anemometry at low velocity | **To source** |
| M8 | Campbell et al., in-suit CO₂ washout / ICWTS (ICES-2026-499) | In Drive |
| M9 | Wearable multi-sensor system architecture and data contract | **To source** |
| M10 | NDIR calibration and automatic baseline correction drift | **To source** |
| M11 | Herrick Lab Testing Protocol | In Drive |

The Porterfield paper carries M1 and M3 as two different assignments — M1 asks what the *claim* is,
M3 asks whether the *method* supports it. Same PDF, different reference summaries and rubrics.

If no defensible peer-reviewed source is found for M9, that section falls back to the ARES firmware
`CLAUDE.md` as its document. Every module still gets a `LIT_REVIEW` section either way; what varies
is whether the document is a paper.

`On_the_role_of_transverse_motion_in_pseudo-steady_...` and `ARES_HTBP_Testing_Protocol.docx` are in
Drive and belong in the M2 and M11 bibliographies, but are not the assigned reading for any section.

**Every sourced paper must be verified to exist and be legally shareable before it enters a rubric.**
No citation is written from memory. A rubric built on a hallucinated paper is worse than no rubric,
because it grades members against a document they cannot find.

## Files

```
docs/courses/ares-101/
  course.json                 11 modules; estimatedMinutes must equal the sum of its modules'
  content/    C12–C22         the blog posts — one canonical text, course and public
  lit/        L01–L11         annotated bibliography · synthesis · reference summary · rubric
  videos/     V11–V17         worked-problem scripts (M1 M2 M3 M5 M6 M8 M10)
  slides/     S02–S05         deck outlines (M4 M7 M9 M11)
  quizzes/    Q12–Q22
  exercises/  E01–E08         M4–M11. M1–M3 carry their practice in the video.
  GLOSSARY.md                 HTBP · BTC · IBD · T90 · ABC · MET · PPD · Re · Gr · Ra · Pe · paper symbols
  README.md                   why the modules are cut where they are
```

Numbering continues the global convention across all courses — last existing are C11, Q11, S01, V10.
`lit/` and `exercises/` are new directories with new prefixes.

`docs/courses/README.md` gains an ARES 101 row, and its status table's stale "engine not built"
claims are corrected in the same commit.

## What this course does *not* get

- **No walkthroughs.** `scripts/check-tour-anchors.js` therefore has nothing to check here, and
  `tourAnchors.js` / `ANCHORS.md` are untouched.
- **No AI generation.** The modules are researched and written, not generated. `courseGenService`
  is not involved.

## Order of work

Phase 0 is the engine, in four sub-phases, because the repo's plan convention forbids a Prisma
migration and frontend changes in the same phase:

| Phase | Scope |
|---|---|
| 0a | Schema: enum value, `litConfig`, `CourseLitSubmission` + its back-relations on `Member` and `CourseSection`, migration, `prisma generate` |
| 0b | Backend: grading service, two routes, learner-payload strip + its test, seeder `litRef` |
| 0c | Frontend learner: `LitReviewSection.jsx`, player case, client methods, CSS |
| 0d | Frontend author: `LitReviewBuilder.jsx`, editor mount, officer score in the progress payload |
| 1 | `GLOSSARY.md` + `course.json` skeleton — fixes vocabulary and the section contract |
| 2–12 | One module each: lit review, blog post, video-or-deck, quiz, exercise, together |
| 13 | Publish the eleven posts to the public blog |

Phase 1 precedes the modules deliberately. Eleven independently-researched modules will otherwise
invent eleven vocabularies for the same plume.

`npm run build` (root) and `npx tsc --noEmit` (backend/) after every phase, per the repo convention.

## Verification

**Phase 0 is done when:** a seeded `LIT_REVIEW` section renders its PDF, rejects a 20-word
submission, accepts a 200-word one, returns per-rubric feedback, marks the section complete, and
— with `GEMINI_API_KEY` unset — *still* saves the submission and completes the section with
`feedback: null`. A test asserts `referenceSummary` never appears in the learner payload.

**Each content phase is done when:** the module's five artifacts exist, the lit review's citations
resolve to real retrievable documents, the quiz's answers are findable in that module's own content,
and the video's worked problem produces the number the script claims it produces. That last one is
not automatic — a derivation with a wrong constant will read perfectly and teach the wrong thing.

**The course is done when:** `npm run seed:courses` installs it, a member can complete all eleven
modules end to end, and `estimatedMinutes` on the course equals the sum of its modules. Nothing
validates that sum — it is checked by hand, as it is for the other five courses.

## Risks

| Risk | Mitigation |
|---|---|
| `referenceSummary` leaks to learners through the `litConfig` column | Explicit strip in the learner payload, with a test. Called out in 0b. |
| A sourced paper is paywalled or misattributed | Verify retrievability before writing the rubric. No citation from memory. |
| Eleven modules drift in vocabulary and depth | Phase 1's glossary lands first and is binding. |
| A worked-problem video teaches a wrong derivation | Every numeric result in a script is recomputed at review time, not trusted from drafting. |
| The current-state sections go stale as ARES 2 is built | Each module names the file or deck it drew current state from, so the drift is findable. This is a real, accepted cost: the hardware is changing weekly through August. |
