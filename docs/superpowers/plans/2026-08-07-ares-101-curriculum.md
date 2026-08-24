# ARES 101 Curriculum Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write an eleven-module Constellation course that takes a new ARES team member from "what is a CO₂ bubble" to being able to contribute to a summer deliverable.

**Architecture:** Content-only. Every artifact is a file under `docs/courses/ares-101/`, installed by the existing `npm run seed:courses`. Each module is one task producing five files that ship together: the reading, the paper review, a video script *or* a deck outline, an exercise, and a quiz bank.

**Tech Stack:** Markdown and JSON. No application code. Verification is `npm run check:courses` (validates every CONTENT body converts to a real TipTap document) plus `npm run seed:courses`.

## Prerequisite

**Tasks 3 onward depend on `docs/superpowers/plans/2026-08-07-lit-review-section-kind.md` being complete.** That plan adds the `LIT_REVIEW` section kind and the seeder's `litRef` support. Tasks 1 and 2 here can run in parallel with it; everything after cannot be seeded until it lands.

## Global Constraints

- **Design spec:** `docs/superpowers/specs/2026-08-07-ares-course-design.md`. Read it before starting any module.
- **Audience:** a Purdue undergraduate who has taken calculus and intro physics. Assume **no** fluid mechanics, **no** respiratory physiology, **no** sensor theory. Every symbol is defined at first use or it goes in the glossary.
- **Every module carries three things:** the background concept, the current ARES state, and what comes next. A module that only teaches theory has not met the brief.
- **Never invent a citation.** Every source must be verified to exist and be retrievable before it is cited. A rubric built on a hallucinated paper grades members against a document they cannot find.
- **Current-state claims come from a named source.** Each `content/Cnn` file ends with a `Sources` line naming the deck, document, or code file its current-state section drew from, so drift is findable when the hardware changes.
- **Font Awesome, never emoji**, in any JSX-adjacent copy. Markdown prose may use ordinary punctuation.
- **Numbering is global across all courses.** Do not renumber existing assets.
- Update `docs/courses/ares-101/course.json`'s module `estimatedMinutes` **and** the course total whenever a section is added or removed. Nothing validates that sum.
- After every module task: `cd backend && npm run check:courses`, then `npm run seed:courses`. Both must pass before the next module.

## Asset numbering — fixed, do not deviate

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

M1–M3 have no exercise: their videos carry the practice, and there is no hardware to touch yet.

## The module section contract

Every module is five sections in this order, and every module task builds all of them:

| # | Kind | File | Minutes | What it is |
|---|---|---|---|---|
| 0 | `CONTENT` | `content/Cnn-<slug>.md` | 5 | The reading. Publish-quality prose — this *is* the blog post. |
| 1 | `VIDEO` or `SLIDES` | `videos/Vnn-<slug>.md` / `slides/Snn-<slug>.outline.md` | 5 | Worked problem, or reference deck. Never both. |
| 2 | `LIT_REVIEW` | `lit/Lnn-<slug>.md` | 6 (8 for M1–M3) | The paper, its bibliography, the reference summary and rubric. |
| 3 | `CONTENT` | `exercises/Enn-<slug>.md` | 2 | The hands-on. Omitted for M1–M3. |
| 4 | `QUIZ` | `quizzes/Qnn-<slug>.json` | 2 | 5–7 questions. |

Module total is 20 minutes either way.

## File formats

**`content/Cnn-*.md` and `exercises/Enn-*.md`** — start with the authoring header that `stripAuthoringHeader` removes, exactly as `docs/courses/constellation-101/content/C01-what-constellation-is.md` does. Read that file before writing your first one.

**`videos/Vnn-*.md`** — the format is set by `docs/courses/constellation-101/videos/V02-anatomy-of-a-task.md`: a metadata table, a Purpose section, a Shot list table, a Visual edits table, and word-for-word Narration. ARES videos differ in one way: **Format is `Tablet handwriting over slide backdrop + VO`**, so the shot list columns are `Time | On screen | What is written`.

**`slides/Snn-*.outline.md`** — the format is set by `docs/courses/constellation-101/slides/S01-rank-ladder.outline.md`: metadata table, a "Why a deck and not a video" section, numbered slides, and Production notes. Keep the "Why a deck" section honest — if the answer is not "this is reference material people look up", it should have been a video.

**`quizzes/Qnn-*.json`** — match `docs/courses/constellation-101/quizzes/Q01-orientation.json` exactly. Read it before writing.

**`lit/Lnn-*.md`** — frontmatter is the section config, body is the bibliography. Format:

```markdown
---
pdfDriveFileId: <the id from drive.google.com/file/d/THIS/view>
pdfTitle: <short title>
citation: <full citation>
promptText: <what the learner is asked to write>
minWords: 200
rubric:
  - id: <short stable slug>
    point: <what a good summary must contain>
    weight: 2
referenceSummary: |
  Several paragraphs. Everything after the pipe, two-space indented, to the
  closing ---. This is the ground truth the learner is graded against and it
  is NEVER sent to a learner.
---

## Annotated bibliography

### <Citation>
What it contributes, and which part of this module uses it.

## Synthesis

The narrative that ties the sources together. The reference summary above is a
distillation of this.
```

`referenceSummary` **must be the last key in the frontmatter** — the seeder reads it to the closing `---`.

---

### Task 1: Scaffold, glossary, and course.json

**Files:**
- Create: `docs/courses/ares-101/GLOSSARY.md`, `docs/courses/ares-101/README.md`, `docs/courses/ares-101/course.json`
- Create (empty dirs, via their first file): `content/`, `videos/`, `slides/`, `lit/`, `exercises/`, `quizzes/`
- Modify: `docs/courses/README.md`

**Interfaces:**
- Consumes: nothing.
- Produces: `docs/courses/ares-101/course.json` with 11 modules and 52 sections, all `bodyRef` / `videoRef` / `deckRef` / `litRef` / `quizRef` paths matching the numbering table above. Every later task fills in files this file already points at.

- [ ] **Step 1: Read the existing course for format**

Read `docs/courses/constellation-101/course.json` and `docs/courses/constellation-101/content/C01-what-constellation-is.md` in full. Everything in this plan follows their shape.

- [ ] **Step 2: Write the glossary**

Create `docs/courses/ares-101/GLOSSARY.md`. It is binding on all eleven modules — a term defined here is used exactly this way everywhere. Include at minimum:

| Term | Must define |
|---|---|
| HTBP | Human thermal body plume — the buoyant airflow driven by metabolic heat |
| BTC | Biothermal convection — thermal convection driven by metabolic heat |
| IBD | Indirect biophysical diffusion — the diffusion-limited regime when convection is absent |
| CO₂ bubble | The localized rebreathing deadspace in front of the face |
| Rebreathed fraction | Share of inhaled air that was previously exhaled |
| Pod | One sensor cluster on the headset (top / forehead / chin) |
| NDIR | Non-dispersive infrared — the CO₂ sensing method |
| T90 | Time to reach 90% of a final reading after a step change |
| ABC | Automatic baseline correction |
| CTA | Constant-temperature anemometry |
| ECLSS | Environmental Control and Life Support System |
| SANS | Spaceflight-associated neuro-ocular syndrome |
| MET | Metabolic equivalent of task |
| PMV / PPD | Predicted mean vote / predicted percentage dissatisfied (ISO 7730) |
| Re, Gr, Ra, Pe | Reynolds, Grashof, Rayleigh, Péclet numbers — with the definition each module uses |

Also fix the units convention once, here: **ppm for concentrations in prose, mmHg only when quoting a NASA limit, % only when quoting a datasheet range.** Give the conversion at sea level.

- [ ] **Step 3: Write the course README**

Create `docs/courses/ares-101/README.md` explaining why the modules are cut where they are, and stating the two rules a later author will otherwise break: exactly one of video-or-deck per module, and current-state claims must name their source.

- [ ] **Step 4: Write course.json**

Create `docs/courses/ares-101/course.json`. Header:

```json
{
  "slug": "ares-101",
  "title": "ARES 101",
  "summary": "Why a CO₂ bubble forms in front of an astronaut's face, how the ARES headset measures it, and what the team is building next. Eleven modules: the physics, the physiology, the sensors, the system, and the science.",
  "estimatedMinutes": 220,
  "status": "DRAFT",
  "xpOverride": 600,
  "doubloonOverride": 200,
  "modules": [ ... ]
}
```

Each module follows this shape — this is M1, with no exercise. Reproduce it for all eleven, substituting from the numbering table:

```json
    {
      "order": 0,
      "title": "Gravity, buoyancy, and mass transport",
      "summary": "Why warm air rises, what carries a gas when it doesn't, and why any of this is a spaceflight problem.",
      "estimatedMinutes": 20,
      "isRequired": true,
      "sequential": true,
      "sections": [
        {
          "order": 0,
          "title": "How gravity moves air",
          "kind": "CONTENT",
          "isRequired": true,
          "bodyRef": "content/C12-how-gravity-moves-air.md"
        },
        {
          "order": 1,
          "title": "Worked problem: is the plume buoyant?",
          "kind": "VIDEO",
          "isRequired": true,
          "videoRef": "videos/V11-is-the-plume-buoyant.md",
          "videoConfig": { "youtubeId": null, "lockSeek": true, "allowedRates": [1, 1.25, 1.5] }
        },
        {
          "order": 2,
          "title": "Read: Gravity and Human Respiration (the claim)",
          "kind": "LIT_REVIEW",
          "isRequired": true,
          "litRef": "lit/L01-gravity-and-human-respiration-claim.md"
        },
        {
          "order": 3,
          "title": "Check yourself: buoyancy and diffusion",
          "kind": "QUIZ",
          "isRequired": true,
          "quizRef": "quizzes/Q12-buoyancy.json",
          "passThreshold": 75,
          "maxAttempts": null
        }
      ]
    }
```

Modules with an exercise insert it at `order: 3` and move the quiz to `order: 4`:

```json
        {
          "order": 3,
          "title": "Exercise: <what they do>",
          "kind": "CONTENT",
          "isRequired": true,
          "bodyRef": "exercises/E01-<slug>.md"
        },
```

Modules with a deck instead of a video use:

```json
        {
          "order": 1,
          "title": "<deck title>",
          "kind": "SLIDES",
          "isRequired": true,
          "slideConfig": { "sourceKind": "PDF", "sourceName": "<slug>.pdf", "autoAdvance": false },
          "deckRef": "slides/S02-<slug>.outline.md"
        },
```

The final module's quiz is the course final — give `Q22` `"passThreshold": 80` and `"maxAttempts": 3`, matching how `constellation-101` ends.

- [ ] **Step 5: Verify course.json parses and the sum is right**

Run: `node -e "const c=require('./docs/courses/ares-101/course.json'); const sum=c.modules.reduce((s,m)=>s+m.estimatedMinutes,0); console.log('modules',c.modules.length,'sections',c.modules.reduce((s,m)=>s+m.sections.length,0),'sum',sum,'declared',c.estimatedMinutes); if(sum!==c.estimatedMinutes) throw new Error('estimatedMinutes mismatch');"`

Expected: `modules 11 sections 52 sum 220 declared 220`

- [ ] **Step 6: Add the row to the courses README**

In `docs/courses/README.md`, add to the Courses table:

```
| `ares-101` | Role: ARES team | ~3 h 40 m | Scaffolded · modules in progress |
```

- [ ] **Step 7: Commit**

```bash
git add docs/courses/ares-101 docs/courses/README.md
git commit -m "docs(ares-101): scaffold, glossary, and course.json"
```

---

### Task 2: Source and verify the five missing papers

**Files:**
- Create: `docs/courses/ares-101/lit/SOURCES.md`

**Interfaces:**
- Consumes: nothing.
- Produces: `SOURCES.md` — a table of module → paper → DOI → Drive file id, which every later `lit/Lnn` file's frontmatter reads its `pdfDriveFileId` and `citation` from.

Six documents already exist in the Drive `Papers` folder (`1RMU0bzBpK_-HSsUYrsKJ31kyCddbkmtn`). Five must be found.

- [ ] **Step 1: Record what already exists**

Create `docs/courses/ares-101/lit/SOURCES.md` with a table, filling the Drive file ids for the six known documents by listing the Drive folder:

| Module | Document | DOI / source | Drive file id |
|---|---|---|---|
| M1 | Dutta et al., *Gravity and Human Respiration* — intro + Fig. 1 | `10.xxxx/...` | `1RHGKt4JX2oV6wd0HcGDySoXoZepTHW5c` |
| M2 | DNS of a violent expiratory event | — | `1kt_zRc-ugKDe71h8mcj4JNMmceWDxYR5` |
| M3 | Dutta et al. — Methods, Results, Figs. 3–6 | same | `1RHGKt4JX2oV6wd0HcGDySoXoZepTHW5c` |
| M5 | Sanders et al., PTLS, ICES-2026-75 | — | `1vcpQGZnoja8l6ctQH7Ed1-RlYkC4wXAV` |
| M8 | Campbell et al., ICWTS, ICES-2026-499 | — | `1OzdK0KPj9i87jCsERj-UPJKayFQvmgXq` |
| M11 | Herrick Lab Testing Protocol | internal | `1kjHjWjdENSDzMKbvTvvgtEIz3sPBPgXvoWk7cXvtVlg` |

- [ ] **Step 2: Find the five missing papers**

Search for one open-access, retrievable paper for each. Requirements: peer-reviewed or a recognised conference proceeding, freely readable, and genuinely about the module's topic at a level an undergraduate can follow.

| Module | What is needed |
|---|---|
| M4 | CO₂ exposure and cognitive performance, or SANS and CO₂ as a co-factor |
| M6 | Sample-line transport lag / response time in gas analysis |
| M7 | Constant-temperature anemometry at low velocities (< 1 m/s) |
| M9 | Wearable multi-sensor system architecture and its data contract |
| M10 | NDIR calibration, drift, and automatic baseline correction |

For each: record title, authors, year, venue, DOI, and a URL that resolves. **Open each URL and confirm it loads the paper you think it is.** A DOI that 404s, or resolves to a different paper, is a failed source — find another.

- [ ] **Step 3: Handle the M9 fallback**

If no defensible peer-reviewed source is found for M9 after a genuine search, record that in `SOURCES.md` and assign M9's `LIT_REVIEW` section the ARES firmware `CLAUDE.md` instead (upload it to the Drive Papers folder as a PDF). The design spec allows this explicitly. Do not pad the table with a paper that is only loosely related.

- [ ] **Step 4: Upload and record**

Upload each verified PDF to the Drive `Papers` folder, set link-sharing to "anyone with the link can view" (an unshared file renders as a sign-in wall inside the course, not as the paper), and record the file id in `SOURCES.md`.

- [ ] **Step 5: Verify every id resolves**

For each row, open `https://drive.google.com/file/d/<id>/preview` in a private window. Every one must render the PDF without a sign-in prompt.

- [ ] **Step 6: Commit**

```bash
git add docs/courses/ares-101/lit/SOURCES.md
git commit -m "docs(ares-101): verified source manifest for all eleven lit reviews"
```

---

### Task 3: M1 — Gravity, buoyancy, and mass transport

**Files:**
- Create: `content/C12-how-gravity-moves-air.md`, `videos/V11-is-the-plume-buoyant.md`, `lit/L01-gravity-and-human-respiration-claim.md`, `quizzes/Q12-buoyancy.json` (all under `docs/courses/ares-101/`)

**Interfaces:**
- Consumes: `GLOSSARY.md` and `lit/SOURCES.md` from Tasks 1–2.
- Produces: the vocabulary M2 and M3 build on — HTBP, BTC, IBD, and the candle analogy. M2 assumes all four are already defined.

**Sources:** Dutta et al. Introduction and "Gravitational Biophysics of Mass Transport"; `ARES_CO2_Presentation` slide 5.

- [ ] **Step 1: Write the reading — `content/C12-how-gravity-moves-air.md`**

Cover, in this order: gravitational convection and buoyancy; the Boussinesq approximation stated in words before symbols; Grashof and Rayleigh as the ratio of buoyancy to viscosity; advection versus diffusion and the Péclet number; the unstirred boundary layer as the rate-limiting step; Faraday's candle and the spherical flame in orbit as the *same physics*, not an illustration of it.

Then **current state**: this is why ARES exists at all — bulk ECLSS sensors measure cabin CO₂, which is not the quantity that reaches a face. Then **what's next**: the 0.38g threshold (Mars) and terrestrial heat stress as the same regime.

End with a `Sources` line naming the paper sections used.

- [ ] **Step 2: Write the video script — `videos/V11-is-the-plume-buoyant.md`**

The worked problem: for a standing human at ΔT = 15 K, with characteristic length 1.7 m, compute Grashof and Rayleigh and show buoyancy dominates. Then set g → 0 and show Ra → 0 and Pe → 0: the same body, the same metabolism, no plume.

**Recompute every number in the script before writing it down.** State the values of β, ν, and α you used, at what temperature, and cite the property table. A derivation with a wrong constant reads perfectly and teaches the wrong thing.

Runtime target 6–8 minutes. Include at least two pause points where the viewer is asked to do the next step before it is shown.

- [ ] **Step 3: Write the lit review — `lit/L01-gravity-and-human-respiration-claim.md`**

The assignment is the paper's **claim**, not its method — M3 handles the method against the same PDF. `promptText`: what does this paper claim, and what would have to be true for the claim to be wrong?

Rubric (5–6 points), each with a stable id:
- `plume` — states that metabolic heat drives a buoyant plume that carries exhaled CO₂ away from the face on Earth
- `collapse` — states that microgravity removes buoyancy, so the plume collapses
- `bubble` — identifies the resulting localized deadspace in front of the face
- `magnitude` — gives the ~2× face-level figure **and** notes it is a transient peak (>2.5% vs >1.5%), not a mean
- `bulk` — recognises that bulk ECLSS does not address this
- `heat` — connects the same collapse to 37 °C terrestrial conditions

`referenceSummary`: 3–4 paragraphs, written from the paper's Abstract, Introduction, and Results. `minWords: 200`.

- [ ] **Step 4: Write the quiz — `quizzes/Q12-buoyancy.json`**

6 questions. At least one must test the misconception that microgravity *removes* CO₂ transport entirely (it does not — diffusion remains; it is convection that stops). Every answer must be findable in `C12` or `V11`.

- [ ] **Step 5: Verify**

```bash
cd backend && npm run check:courses && npm run seed:courses
```
Expected: `check:courses` passes; `✓ ares-101: 11 modules`.

Then open the module in the player and confirm all four sections render and unlock in order.

- [ ] **Step 6: Commit**

```bash
git add docs/courses/ares-101
git commit -m "docs(ares-101): M1 — gravity, buoyancy, and mass transport"
```

---

### Task 4: M2 — The human thermal body plume and the CO₂ bubble

**Files:**
- Create: `content/C13-the-plume-and-the-bubble.md`, `videos/V12-rebreathed-fraction.md`, `lit/L02-expiratory-flow.md`, `quizzes/Q13-plume.json`

**Interfaces:**
- Consumes: HTBP, BTC, IBD, and the candle analogy from M1 — defined, not re-explained.
- Produces: the rebreathed-fraction definition M8 reuses, and the pod-position rationale M5 and M9 assume.

**Sources:** Dutta et al. "Simulating BTC and the HTBP" and "HTBP Airflow Morphology"; `ARES_7_30_26.pptx` slide 3; the DNS expiratory-event paper.

- [ ] **Step 1: Write the reading — `content/C13-the-plume-and-the-bubble.md`**

Plume structure from ankle to crown; the 0.3–0.4 m/s peak velocity at the top of the head and why the maximum is *there*; the chin-to-nose path that feeds the nasal openings; the respiratory breathing envelope; Schlieren imaging as the experimental validation of a simulation.

Define **rebreathed fraction** quantitatively here — this is the definition M8 will use.

**Current state:** the three pods and why *those* positions. Top = ambient reference, chin = the exhale signal, chin-minus-top = the rebreathing measurement. Forehead = humidity and thermal load. **What's next:** moving the top pod backwards so it samples reference air rather than plume, and room-reference nodes around the subject.

- [ ] **Step 2: Write the video script — `videos/V12-rebreathed-fraction.md`**

Worked problem: given chin CO₂ of 1,850 ppm, top-pod CO₂ of 700 ppm, and an assumed exhaled-breath concentration of 40,000 ppm, compute the rebreathed fraction. Then show the failure mode: if the top pod sits *in* the plume rather than above it, the reference is contaminated and the computed fraction is too low — which is exactly why the pod is moving backwards.

State the mixing-model assumption explicitly and say where it breaks.

- [ ] **Step 3: Write the lit review — `lit/L02-expiratory-flow.md`**

Paper: the DNS expiratory-event study. `promptText`: how does this paper's picture of an exhaled jet differ from the steady plume in M1, and what does that difference mean for where you put a sensor?

Rubric points on: the jet as unsteady and directed rather than steady; the timescale over which it disperses; why a single fixed sensor position gives a different answer than another; and the connection back to pod placement. `minWords: 200`.

- [ ] **Step 4: Write the quiz — `quizzes/Q13-plume.json`**

6 questions, at least one on why the *top* pod is the reference and what happens to every downstream number if that reference is wrong.

- [ ] **Step 5: Verify**

```bash
cd backend && npm run check:courses && npm run seed:courses
```

- [ ] **Step 6: Commit**

```bash
git add docs/courses/ares-101
git commit -m "docs(ares-101): M2 — the plume and the CO2 bubble"
```

---

### Task 5: M3 — Reading the CFD paper

**Files:**
- Create: `content/C14-reading-the-cfd-paper.md`, `videos/V13-nondimensionalise.md`, `lit/L03-gravity-and-human-respiration-method.md`, `quizzes/Q14-cfd.json`

**Interfaces:**
- Consumes: M1's vocabulary and M2's plume structure.
- Produces: the "what ARES is testing" framing every later module refers back to.

**Sources:** Dutta et al. Materials and Methods, Results, Figs. 3–6.

> This module teaches *how to read the paper*, not the phenomenon. It exists because the Porterfield paper is handed to every new member on day one, and "read this" is not onboarding.

- [ ] **Step 1: Write the reading — `content/C14-reading-the-cfd-paper.md`**

Walk the paper's structure as a *method*: what incompressible Navier–Stokes plus two advection–diffusion equations means physically; why CO₂ is modelled as a passive scalar and what that assumes; the Boussinesq closure and its validity range; non-dimensionalisation on Lc = 0.15 m (head width) and Vc = 0.2816 m/s; the novel inflow–outflow mouth boundary condition and why it is the paper's real contribution; how Fig. 3, Fig. 4, Fig. 5, and Fig. 6 each answer a different question.

Teach one transferable skill explicitly: **how to check whether a simulation was validated against anything real.** Here, the answer is Schlieren imaging of human subjects.

**Current state:** the specific prediction ARES exists to test. **What's next:** mannequin-first validation — a breathing mannequin sweeps the physiological range with no human subjects and anchors the CFD model, which is a way to keep characterising the headset while IRB approval is pending.

- [ ] **Step 2: Write the video script — `videos/V13-nondimensionalise.md`**

Worked problem in three parts: (1) non-dimensionalise the momentum equation and show where Re appears; (2) compute Re from Vc·Lc/ν with ν for air at 22 °C, and say what regime that puts the flow in; (3) read the 0.38g threshold and the 14% exchange penalty off Fig. 5A and state precisely what each one does and does not claim.

Part 3 is the important one: the 14% figure is an efficiency reduction in the simulation, not a measured physiological outcome. Say so on screen.

- [ ] **Step 3: Write the lit review — `lit/L03-gravity-and-human-respiration-method.md`**

Same PDF as L01, different assignment. `promptText`: does the method support the claim? Name one thing the model assumes that you would want checked against real measurement.

Rubric points on: identifying CFD as the method; the passive-scalar treatment of CO₂ as an assumption; the mouth boundary condition as the novel element; naming the validation used; and naming at least one genuine limitation. `minWords: 250` — this is the most demanding review in the course.

Credit a learner who names a limitation the paper itself does not, provided it is real. Say so in the rubric point's wording.

- [ ] **Step 4: Write the quiz — `quizzes/Q14-cfd.json`**

6 questions on method rather than result. One must distinguish "the simulation predicts" from "the study measured".

- [ ] **Step 5: Verify**

```bash
cd backend && npm run check:courses && npm run seed:courses
```

- [ ] **Step 6: Commit**

```bash
git add docs/courses/ares-101
git commit -m "docs(ares-101): M3 — reading the CFD paper"
```

---

### Task 6: M4 — Hypercapnia and the body

**Files:**
- Create: `content/C15-what-co2-does.md`, `slides/S02-hypercapnia-reference.outline.md`, `lit/L04-co2-and-cognition.md`, `exercises/E01-exposure-from-a-session.md`, `quizzes/Q15-hypercapnia.json`

**Interfaces:**
- Consumes: the units convention from `GLOSSARY.md`.
- Produces: the threshold values M8's dosimeter section and M10's error-budget discussion both cite.

**Sources:** `ARES_CO2_Presentation` slides 3–4; Dutta et al. Discussion "Gravity and Human Respiration in Space"; the M4 paper from `SOURCES.md`.

- [ ] **Step 1: Write the reading — `content/C15-what-co2-does.md`**

Dose–response by tier (mild 1,000–2,500 ppm, moderate 2,500–5,000, acute >5,000); the unit triangle of ppm, mmHg, and %; PaCO₂ and why arterial partial pressure is the physiologically meaningful quantity; cerebral vasodilation and intracranial pressure; SANS; the near-doubling of headache odds per mmHg; adaptation masking symptoms — astronauts reported not realising CO₂ was elevated until scrubbers came back on; NASA lowering limits twice (2006 → 5 mmHg, 2010 → 4 mmHg).

Handle the **Fincke incident carefully**. It is an unexplained January 2026 medical event with no diagnosis. Present it as the open question that motivates the work, explicitly *not* as evidence for the CO₂ hypothesis. Write the sentence that says so.

**Current state:** the app's warn and danger thresholds, and the ppm·hours dosimeter by activity. **What's next:** EEG correlation.

- [ ] **Step 2: Write the deck outline — `slides/S02-hypercapnia-reference.outline.md`**

10–12 slides. This is a deck because it is a lookup table people return to — the dose–response tiers and the unit conversions are the two slides that will be screenshotted. Give them room.

Include two overlay questions, following S01's pattern: one on the ppm/mmHg conversion, one on why bulk cabin CO₂ being "within limits" does not mean face-level CO₂ is.

- [ ] **Step 3: Write the lit review — `lit/L04-co2-and-cognition.md`**

Use the M4 paper from `SOURCES.md`. Rubric on: the exposure levels studied; the outcome measured; effect size; and at least one limitation of generalising the result to spaceflight. `minWords: 200`.

- [ ] **Step 4: Write the exercise — `exercises/E01-exposure-from-a-session.md`**

Give a short table of CO₂ readings over a session (make it up, but make it physiologically plausible and say in the file that it is synthetic). The learner converts ppm to mmHg, computes ppm·hours, and states which exposure tier the session falls in. Provide the answers in a collapsed section at the bottom.

- [ ] **Step 5: Write the quiz — `quizzes/Q15-hypercapnia.json`**

6 questions. One must be the unit conversion. One must test that the Fincke incident is undiagnosed.

- [ ] **Step 6: Verify**

```bash
cd backend && npm run check:courses && npm run seed:courses
```

- [ ] **Step 7: Commit**

```bash
git add docs/courses/ares-101
git commit -m "docs(ares-101): M4 — hypercapnia and the body"
```

---

### Task 7: M5 — NDIR gas sensing

**Files:**
- Create: `content/C16-ndir-sensing.md`, `videos/V14-decoding-a-reading.md`, `lit/L05-portable-laser-spectrometer.md`, `exercises/E02-bench-test-a-sensor.md`, `quizzes/Q16-ndir.json`

**Interfaces:**
- Consumes: the units convention from `GLOSSARY.md`.
- Produces: the SprintIR protocol facts M9's data-contract deck and M10's calibration module both build on.

**Sources:** `C:\Users\Henry\Documents\ARES\ARES2ESP32\CLAUDE.md` "Sensor Architecture"; `ARES_7_30_26.pptx` slides 3 and 11; ICES-2026-75.

- [ ] **Step 1: Write the reading — `content/C16-ndir-sensing.md`**

Beer–Lambert; the 4.26 µm CO₂ absorption band and why that wavelength; NDIR architecture — source, path, filter, detector; path length as the accuracy/size trade; temperature and pressure dependence; cross-sensitivity; T90; digital filtering as a noise/latency trade; quantisation.

**Current state, in detail** — this is the module where the firmware becomes real: SprintIR-6S-20% over ASCII at 9600 8N1; `Z` returns **raw counts**, multiplied by a per-sensor multiplier probed with `.` at boot rather than hardcoded, which is why the 0–20% part quantises to 10 ppm and ambient 400 ppm arrives as `Z 00040`; the 30-second uptime-derived warm-up, because GSS exposes no warm-up status bit; and `K 0` sent first at boot, because GSS sensors ship in streaming mode and one streaming sensor floods the shared UART and corrupts the other two.

**What's next:** the JPL tunable laser spectrometer (±0.003 mmHg at 2 Hz, 13 × 8 × 8 cm, sub-3 W, no pump and no sample line), WMS O₂ at 760 nm, and the SEN0465 / BME680 additions to the next-generation pod.

- [ ] **Step 2: Write the video script — `videos/V14-decoding-a-reading.md`**

Three worked parts: (1) Beer–Lambert — given absorbance and path length, get concentration; (2) decode `Z 00040` at multiplier 10 to 400 ppm, then explain why the same sensor cannot report 405; (3) pressure-correct a reading taken at 950 hPa and show the size of the error if you do not.

Part 2's punchline is the quantisation: at 10 ppm resolution, a 5 ppm real change is invisible. Put it on screen.

- [ ] **Step 3: Write the lit review — `lit/L05-portable-laser-spectrometer.md`**

Paper: Sanders et al., ICES-2026-75. `promptText`: what does open-path laser sensing do that NDIR with a sample line cannot, and what would it cost ARES to switch?

Rubric on: open-path meaning no pump and no sample line; the quoted accuracy and rate; the size/power envelope; the argument that a single fixed sensor misses local gradients — and that this is *the same argument* ARES makes for three pods on one head. `minWords: 200`.

- [ ] **Step 4: Write the exercise — `exercises/E02-bench-test-a-sensor.md`**

The bench-test procedure from deliverable 2.3.7 and 2.5.2, written as something a learner can actually run: expose a sensor to a known reference concentration, record measured versus known, compute error, and compare across all three sensors. Include what to do when there is no reference gas available (ambient outdoor air ≈ 420 ppm) and what that substitution costs you.

- [ ] **Step 5: Write the quiz — `quizzes/Q16-ndir.json`**

7 questions. One on the multiplier, one on why `K 0` goes first, one on T90.

- [ ] **Step 6: Verify**

```bash
cd backend && npm run check:courses && npm run seed:courses
```

- [ ] **Step 7: Commit**

```bash
git add docs/courses/ares-101
git commit -m "docs(ares-101): M5 — NDIR gas sensing"
```

---

### Task 8: M6 — Sampling: pumps, tubing, and transport delay

**Files:**
- Create: `content/C17-sampling.md`, `videos/V15-transport-delay.md`, `lit/L06-sample-line-response.md`, `exercises/E03-measure-the-delay.md`, `quizzes/Q17-sampling.json`

**Interfaces:**
- Consumes: T90 from M5 — transport delay and sensor response time are different quantities and the reading must say so.
- Produces: the delay correction M8's cross-pod lag model depends on.

**Sources:** `ARES_7_30_26.pptx` slide 15; `include/lee_pump.h` and `src/lee_pump.cpp`; the ARES firmware `CLAUDE.md` "Pump" section.

- [ ] **Step 1: Write the reading — `content/C17-sampling.md`**

Transport lag as distinct from sensor response time; Hagen–Poiseuille and what sets flow through a tube; splitting one flow into three matched streams and why balanced restriction is hard; dead volume; dispersion smearing a sharp concentration step; condensation; why pulsation-free flow matters when you are measuring a signal that oscillates at breathing rate.

**Current state:** the Lee XP UXPB5400200A — a 29 mm piezoelectric disc, 2.00 L/min free flow (1.70 continuous), 210 mbar stall, under 1 W, driven by a 20–22 kHz AC waveform. Lee state plainly that PWM drives of the kind used for DC motors are unsuitable, so the legacy `PUMP_GATE_PIN` gate drive cannot run it and a Lee driver PCB is mandatory. The driver commands **drive power in milliwatts**, which is monotonic in flow but is not a flow setpoint; L/min is only a measurement when a flow sensor is fitted, and otherwise the reported figure is a nominal estimate that the app must label `NOM` rather than `MEAS`.

Write the sentence that says why that labelling rule exists: an estimate presented as a measurement is how a study gets a result nobody can reproduce.

**What's next:** the custom 3-way printed manifold replacing the tee; the isolated pump bay with nitrile O-rings and a nylon M2 bolt, because metal fasteners couple the 20–22 kHz drive into the shell as audible noise; the ≤3 µm inlet filter; and open-path sensing eventually deleting the sampling loop entirely.

- [ ] **Step 2: Write the video script — `videos/V15-transport-delay.md`**

Worked problem: 2.00 L/min split three ways gives 0.67 L/min per line. Given a tubing inner diameter and a length per pod, compute the volumetric transport delay for each. Show that the three delays differ if the lines differ in length — and that this difference lands directly on top of the cross-pod lag M8 uses to detect which pod is downstream.

The conclusion to land: **matched line lengths are not cosmetic.** An unmatched set fabricates an airflow direction that is not there.

- [ ] **Step 3: Write the lit review — `lit/L06-sample-line-response.md`**

Use the M6 paper from `SOURCES.md`. Rubric on: the distinction between transport delay and response time; what governs each; how the paper measured it; and what it implies for a three-line sampling manifold. `minWords: 200`.

- [ ] **Step 4: Write the exercise — `exercises/E03-measure-the-delay.md`**

Measure transport delay empirically: introduce a sharp CO₂ step at a pod inlet (a breath at the tube tip works), log, and read the delay off the trace. Have the learner compare measured against the computed value from V15 and account for the difference. Note that dispersion means the step arrives smeared, and tell them to use the 50% crossing rather than first movement.

- [ ] **Step 5: Write the quiz — `quizzes/Q17-sampling.json`**

6 questions. One must test that transport delay and T90 are different things.

- [ ] **Step 6: Verify**

```bash
cd backend && npm run check:courses && npm run seed:courses
```

- [ ] **Step 7: Commit**

```bash
git add docs/courses/ares-101
git commit -m "docs(ares-101): M6 — sampling, pumps, and transport delay"
```

---

### Task 9: M7 — Anemometry and the CTA circuit

**Files:**
- Create: `content/C18-anemometry.md`, `slides/S03-cta-reference.outline.md`, `lit/L07-cta-low-velocity.md`, `exercises/E04-pump-disturbance-threshold.md`, `quizzes/Q18-cta.json`

**Interfaces:**
- Consumes: the plume velocity scale from M2 (0.3–0.4 m/s) — that is the range the circuit must resolve.
- Produces: the flow-velocity channel M8's flow-weighted rebreathing section depends on.

**Sources:** `ARES_7_30_26.pptx` slides 11–12; the Drive `CTAs` folder; the M7 paper from `SOURCES.md`.

- [ ] **Step 1: Write the reading — `content/C18-anemometry.md`**

Thermal anemometry from first principles: a heated element loses heat to passing flow, so the power needed to hold its temperature is a measure of velocity. King's law and its exponent. Constant-temperature versus constant-current, and why CTA wins on frequency response. The Wheatstone bridge with a feedback op-amp as the mechanism that holds temperature. Overheat ratio and the trade against self-heating the very air you are measuring. Why calibration in the 0.05–0.4 m/s regime is genuinely hard — that is where King's law is least linear and where the interesting velocities live.

**Current state:** the FS7.0.1L.195 and the custom CTA board — bridge, amplifier, sensor headers, and the mechanical fit into the arm. State the three open questions from the 7/30 deck honestly, as open: should there be anemometers on the sides; will the chamber in-flow pump disturb the anemometer readings; and at what flow rate does the pump's contribution become negligible.

**What's next:** anemometry moving into every pod, so each reports local air speed rather than concentration alone, feeding the cross-pod airflow model.

- [ ] **Step 2: Write the deck outline — `slides/S03-cta-reference.outline.md`**

10–12 slides: bridge topology, the feedback loop drawn as a loop, King's-law form with the constants named, a calibration curve, the FS7's spec envelope, and the three open questions as their own slide. A deck because the topology diagram and the calibration curve are things people come back to look at.

One overlay question on why constant-temperature beats constant-current for a signal that changes at breathing rate.

- [ ] **Step 3: Write the lit review — `lit/L07-cta-low-velocity.md`**

Use the M7 paper from `SOURCES.md`. Rubric on: the physical principle; why low velocity is the hard regime; what calibration approach the paper used; and what its result implies for measuring a 0.3 m/s plume. `minWords: 200`.

- [ ] **Step 4: Write the exercise — `exercises/E04-pump-disturbance-threshold.md`**

**This exercise answers a live open question from the 7/30 deck, not a teaching exercise.** The learner estimates the flow rate above which the sampling pump's inflow becomes negligible against the ambient flow the anemometer is meant to measure: given the pump's per-pod draw (0.67 L/min), the inlet geometry, and the induced velocity at the anemometer's position, find the ambient velocity at which pump-induced flow is under some stated fraction — have them pick and justify the fraction.

State in the file that the answer goes back to the ARES team, and that a well-reasoned answer with stated assumptions is worth more than a confident number.

- [ ] **Step 5: Write the quiz — `quizzes/Q18-cta.json`**

6 questions. One on the overheat ratio trade-off.

- [ ] **Step 6: Verify**

```bash
cd backend && npm run check:courses && npm run seed:courses
```

- [ ] **Step 7: Commit**

```bash
git add docs/courses/ares-101
git commit -m "docs(ares-101): M7 — anemometry and the CTA circuit"
```

---

### Task 10: M8 — From signal to science

**Files:**
- Create: `content/C19-signal-to-science.md`, `videos/V16-rebreathing-and-respiration.md`, `lit/L08-in-suit-co2-washout.md`, `exercises/E05-run-the-models.md`, `quizzes/Q19-models.json`

**Interfaces:**
- Consumes: the rebreathed-fraction definition from M2, transport delay from M6, flow velocity from M7.
- Produces: nothing later modules depend on — M9 onward are independent of this one.

**Sources:** `C:\Users\Henry\Documents\ARES\ARES2ESP32\app\lib\science\` (read the actual Dart files); `ARES_7_30_26.pptx` slide 10; ICES-2026-499.

- [ ] **Step 1: Write the reading — `content/C19-signal-to-science.md`**

The ten models, each in a short paragraph naming what it computes and what it is grounded in: rebreathing (chin versus top), Wells-Riley (ventilation and infection risk), PMV/PPD (ISO 7730 thermal comfort), respiration (breath rate by FFT of the chin trace), airflow (cross-pod lag and downstream detection), metabolic (MET and kcal from HR reserve plus CO₂), dosimeter (ppm·hours by activity), fatigue (body-battery drain against CO₂), hydration (sweat onset from forehead humidity), acclimatization (multi-day HR and altitude AMS scoring).

Be honest about which are well-grounded and which are heuristics. Wells-Riley and PMV have standards behind them; the fatigue correlation does not.

**Current state:** `app/lib/science/` — pure Dart, no Flutter dependencies, unit-tested. Say why that boundary exists: a model with no UI dependency can be tested without a device.

**What's next:** NASA's ICWTS work ports directly — flow-weighted inspired CO₂ (convolving a bidirectional flow sensor with inspired CO₂ instead of time-averaging, which is what M7's anemometers make possible), and ICARUS learned breath detection as a successor to the FFT respiration model. Also Péronnet differential-CO₂ metabolic rate and moving-variance separation of breath-scale from room-scale signal.

- [ ] **Step 2: Write the video script — `videos/V16-rebreathing-and-respiration.md`**

Two worked problems. First: rebreathed fraction from a chin/top pair, reusing M2's definition and now correcting for the transport delay from M6. Second: respiration rate by FFT of a chin CO₂ trace — show the transform, find the peak, convert to breaths per minute.

Then the payoff: show a second trace where the FFT gives a wrong answer — motion artifact, or a breath-hold — and explain why a learned breath detector counts it correctly and a threshold or a transform does not. That is the case for the ICARUS approach, made with a picture rather than an assertion.

- [ ] **Step 3: Write the lit review — `lit/L08-in-suit-co2-washout.md`**

Paper: Campbell et al., ICES-2026-499. `promptText`: NASA measures the same quantity in a spacesuit that ARES measures on a head. Which of their methods would you port, and what would it require?

Rubric on: flow-weighting versus time-averaging and why the difference matters; the learned breath detector and the problem it solves; the mannequin-first validation strategy; and identifying what ARES would need to add to adopt any of them. `minWords: 250`.

- [ ] **Step 4: Write the exercise — `exercises/E05-run-the-models.md`**

Clone the ARES repo, `cd app`, `flutter pub get`, `flutter test`. Read one model's Dart source and its test, then hand-compute the same result from the test's inputs and confirm the two agree. Name `rebreathing` as the model to start with — it is the shortest and the one M2 already defined.

Include what to do without a Flutter install: read the source and the test, and do the hand computation anyway.

- [ ] **Step 5: Write the quiz — `quizzes/Q19-models.json`**

7 questions. One must distinguish a standards-grounded model from a heuristic.

- [ ] **Step 6: Verify**

```bash
cd backend && npm run check:courses && npm run seed:courses
```

- [ ] **Step 7: Commit**

```bash
git add docs/courses/ares-101
git commit -m "docs(ares-101): M8 — from signal to science"
```

---

### Task 11: M9 — The system and the data contract

**Files:**
- Create: `content/C20-the-system.md`, `slides/S04-data-contract.outline.md`, `lit/L09-wearable-architecture.md`, `exercises/E06-trace-a-reading.md`, `quizzes/Q20-system.json`

**Interfaces:**
- Consumes: the SprintIR protocol facts from M5.
- Produces: nothing later modules depend on.

**Sources:** `C:\Users\Henry\Documents\ARES\ARES2ESP32\CLAUDE.md` in full; `src/main.cpp`; `ARES_7_30_26.pptx` slides 2, 4, 8, 9, 13.

- [ ] **Step 1: Write the reading — `content/C20-the-system.md`**

Architecture concepts first: why a non-blocking polling state machine instead of blocking reads; shared-bus arbitration; GATT service and characteristic design as a contract between two codebases; sample rate versus loop rate; timestamping and clock synchronisation across three devices; CSV schema design as a decision you cannot easily undo; NVS persistence and why a setting that resets on power cycle is a data-integrity problem.

**Current state:** the ESP32-S3; the six-step sensor state machine advancing one step per `loop()` so no iteration blocks; three SHT45s across two I²C buses, with SHT45 #2 on a dedicated `TwoWire(1)` because the shared bus is torn down and rebuilt each read; three SprintIRs across two UARTs, where `co2Port()` calls `end()` then `begin()` with the target pins and drains RX before every access because GSS sensors have no bus addressing and must never share a live port; startup probing that lets the firmware run with any subset of sensors present; the 27-column CSV with a boot counter separating power cycles and a Unix epoch arriving over BLE; the `LIVE` / `CAL_STATUS` / `STATUS` / `PUMP` characteristics outbound and `PHONE` / `CMD` inbound; the WiFi AP dashboard at 192.168.4.1, explicitly legacy; the Flutter app with Riverpod as the primary surface; and the Garmin bridge's §0 biometrics-in and §1 CO₂-out contracts.

**What's next:** O₂ and BME680 channels entering the contract, and the redesigned backboard with an LCD at half the size.

- [ ] **Step 2: Write the deck outline — `slides/S04-data-contract.outline.md`**

12–14 slides: the three-device data-flow diagram, the pinout tables, the BLE characteristic table, the CSV column map, and the JSON key list. Pure reference — this is the deck someone opens while writing code against the firmware.

One overlay question on why sensors 2 and 3 cannot share a live UART.

- [ ] **Step 3: Write the lit review — `lit/L09-wearable-architecture.md`**

Use the M9 source from `SOURCES.md` — a paper if Task 2 found one, otherwise the ARES firmware `CLAUDE.md` as a PDF. If it is the `CLAUDE.md`, the prompt changes to: document the sensor-to-file path in your own words, and name one design decision you would question.

Rubric on: the sensing-to-storage path; at least one bus or timing constraint and why it exists; the separation between device and app responsibilities; and one substantiated critique. `minWords: 200`.

- [ ] **Step 4: Write the exercise — `exercises/E06-trace-a-reading.md`**

Trace one chin CO₂ reading end to end and write down every transformation it undergoes: the `Z` command, raw counts, the multiplier, the warm-up suppression, the digital filter, the CSV column it lands in, the BLE characteristic it streams over, and the app card it renders on. Name the file and line for each hop.

This is a reading exercise, not a coding one, and it is the fastest way to learn the codebase.

- [ ] **Step 5: Write the quiz — `quizzes/Q20-system.json`**

7 questions. One on the boot counter's purpose, one on why the epoch arrives over BLE rather than from the device.

- [ ] **Step 6: Verify**

```bash
cd backend && npm run check:courses && npm run seed:courses
```

- [ ] **Step 7: Commit**

```bash
git add docs/courses/ares-101
git commit -m "docs(ares-101): M9 — the system and the data contract"
```

---

### Task 12: M10 — Calibration, error, and trusting a number

**Files:**
- Create: `content/C21-calibration.md`, `videos/V17-three-pods-disagree.md`, `lit/L10-ndir-calibration-drift.md`, `exercises/E07-run-a-calibration.md`, `quizzes/Q21-calibration.json`

**Interfaces:**
- Consumes: NDIR behaviour from M5, the rebreathed-fraction computation from M2/M8.
- Produces: nothing later modules depend on.

**Sources:** `ARES_7_30_26.pptx` slide 6; the firmware's GSS command table (`G`, `@ 0`, `@ 1.0 8.0`); deliverable subtasks 2.5.2–2.5.5.

- [ ] **Step 1: Write the reading — `content/C21-calibration.md`**

Accuracy versus precision, with a worked distinction rather than the dartboard picture; offset versus span error and why a single-point calibration only fixes one of them; the fresh-air baseline and what assumption it rests on; drift; cross-sensor agreement and why three sensors reading differently is the normal case, not a fault; pressure and temperature correction; uncertainty propagation through a difference — the key result being that a *difference* of two noisy sensors is noisier than either, which is exactly what rebreathed fraction is.

Say the consequence plainly: **the rebreathing measurement is a difference, so it inherits both sensors' errors.** That is why per-pod calibration is not optional.

**Current state:** per-pod software offsets stored in NVS; the SenseAir lamp cycle (~4 s per sensor) anchoring each pod to an outdoor baseline; ABC disabled on boot, because indoor use drives the automatic baseline below 300 ppm, which is below any real ambient; the five-state cycle Idle → Pending → Running → OK → Fail, and the dashboard polling status during blocking writes so progress stays visible.

**What's next:** certified reference-gas validation and a documented per-sensor error budget (deliverable 5).

- [ ] **Step 2: Write the video script — `videos/V17-three-pods-disagree.md`**

Worked problem: three pods read 480, 455, and 610 ppm in genuine fresh air. Which are wrong, and by how much? Apply the offsets. Then the payoff — compute rebreathed fraction from the uncalibrated pair and from the calibrated pair, and show how different the two answers are. Finish with the pressure correction arithmetic at 950 hPa.

Land the conclusion: an uncalibrated headset does not produce a noisy result, it produces a **confidently wrong** one.

- [ ] **Step 3: Write the lit review — `lit/L10-ndir-calibration-drift.md`**

Use the M10 paper from `SOURCES.md`. Rubric on: what causes NDIR drift; what ABC assumes about the environment; why that assumption fails indoors; and what an alternative calibration strategy would cost. `minWords: 200`.

- [ ] **Step 4: Write the exercise — `exercises/E07-run-a-calibration.md`**

Run a real fresh-air calibration on the headset: take it genuinely outdoors, wait for the readings to settle, trigger the per-pod calibration from the app, and watch the five-state cycle. Record before and after for all three pods. Then bring it inside and re-read — the learner should see the offsets holding.

Include the failure case: what "Fail" means and what to check first.

- [ ] **Step 5: Write the quiz — `quizzes/Q21-calibration.json`**

6 questions. One must test why ABC is disabled on boot.

- [ ] **Step 6: Verify**

```bash
cd backend && npm run check:courses && npm run seed:courses
```

- [ ] **Step 7: Commit**

```bash
git add docs/courses/ares-101
git commit -m "docs(ares-101): M10 — calibration, error, and trust"
```

---

### Task 13: M11 — Doing the science

**Files:**
- Create: `content/C22-doing-the-science.md`, `slides/S05-roadmap.outline.md`, `lit/L11-herrick-protocol.md`, `exercises/E08-write-an-analysis-plan.md`, `quizzes/Q22-final.json`

**Interfaces:**
- Consumes: everything. This module closes the course.
- Produces: nothing.

**Sources:** `ARES_CO2_Headset_Summer2026_Deliverables.docx` (all four tracks); `ARES_7_30_26.pptx` slides 7, 16, 17, 18; `ARES_CO2_Presentation` slide 10; the Herrick Lab Testing Protocol.

- [ ] **Step 1: Write the reading — `content/C22-doing-the-science.md`**

Experimental design: controls and baselines; confounds; and the central discipline — **the analysis plan is written before the data exists.** Say why: pre-defining which metrics will be extracted and which comparisons will be made is what prevents outcome-driven data selection after collection. The deliverables document already requires this (subtask 3.6.9); explain the reasoning the document only asserts.

Human-subjects research: the Belmont principles; informed consent as a process rather than a form; risk assessment; and why IRB review takes 4–8 weeks and cannot be compressed. State the hard rule: **no session with an enrolled human subject before written approval is in hand.**

Analog environments and what each one is analogous *to*: the cave (ventilation-poor, extended duration), supine sleep (weakened plume from posture), the breathing mannequin (full physiological range, no subjects), and 37 °C thermal (buoyancy suppressed at 1g).

**Current state:** the four summer tracks — Mammoth Cave with the SEARCH Astronaut Training team, the Herrick lab sleep study, ARES 2 validation, EEG feasibility — and the two live blockers, IRB approval and training modules, and component procurement with repeatedly cancelled or misplaced orders. Include the workarounds honestly: repurposing the ARES 1 SprintIRs, placing difficult orders through the capstone team, and external funding.

**What's next:** the EEG roadmap; ICES and ASGSR; and the applications beyond spaceflight — sleep apnea, automotive cabins, athlete monitoring, heat stress and climate, submarines and confined spaces, and clinical respiratory monitoring.

- [ ] **Step 2: Write the deck outline — `slides/S05-roadmap.outline.md`**

12–14 slides: the four tracks with their timelines, the deliverable map, the blocker board, the applications grid, and a closing slide on where the work is going. Reference material — this is the deck someone opens to remember what they signed up for.

Two overlay questions: one on why the analysis plan comes first, one on the IRB rule.

- [ ] **Step 3: Write the lit review — `lit/L11-herrick-protocol.md`**

Document: the Herrick Lab Testing Protocol. `promptText`: read the protocol and identify what it controls for, what it does not, and one thing you would add before running a subject.

Rubric on: naming the controlled variables; naming the measurement procedure; identifying a genuine gap; and proposing a change with a stated reason. `minWords: 200`.

This is the only lit review whose document is an internal working document rather than a paper. Say so in the section's intro prose — reading a protocol critically is a different skill from reading a paper, and it is the one that matters most before someone runs a session.

- [ ] **Step 4: Write the exercise — `exercises/E08-write-an-analysis-plan.md`**

Write the analysis plan for a mock sleep session **before** seeing any data. Specify: which CO₂ metrics will be extracted, how spatial distribution will be quantified across the three pods, what the comparison baseline is, what statistical test will be applied, and what result would count as *not* supporting the hypothesis.

That last item is the point of the exercise. A plan with no possible negative result is not a plan.

- [ ] **Step 5: Write the final quiz — `quizzes/Q22-final.json`**

10 questions drawing from all eleven modules — this is the course final. `passThreshold: 80`, `maxAttempts: 3`, matching how `constellation-101` ends. Cover at minimum: the plume mechanism (M1/M2), the CFD claim versus method distinction (M3), a hypercapnia threshold (M4), the multiplier or `K 0` (M5), transport delay versus T90 (M6), the CTA principle (M7), a model's grounding (M8), a bus constraint (M9), why ABC is off (M10), and the IRB rule (M11).

- [ ] **Step 6: Verify**

```bash
cd backend && npm run check:courses && npm run seed:courses
```

- [ ] **Step 7: Commit**

```bash
git add docs/courses/ares-101
git commit -m "docs(ares-101): M11 — doing the science"
```

---

### Task 14: Publish and close out

**Files:**
- Modify: `docs/courses/README.md`, `docs/courses/ares-101/course.json`

**Interfaces:**
- Consumes: all eleven modules.
- Produces: a published course and eleven public blog posts.

- [ ] **Step 1: Full-course verification**

```bash
cd backend && npm run check:courses && npm run seed:courses
cd .. && npm run build
```

Then, as an admin, take the whole course end to end in the player on a **non-admin test account**:

- All 52 sections render.
- Sections unlock in order; a locked module shows only its teaser.
- Every `LIT_REVIEW` section's PDF loads without a sign-in prompt.
- Every quiz's answers are findable in that module's own content — if one is not, the quiz question is wrong, not the learner.
- The course closes out and grants its reward on the final quiz.

- [ ] **Step 2: Check every video script's arithmetic**

For each of `V11`–`V17`, recompute every number the narration states. This is the check nothing automated will do, and a derivation with a wrong constant reads perfectly while teaching the wrong thing. Fix any that are wrong and re-verify.

- [ ] **Step 3: Confirm the estimatedMinutes sum**

Run: `node -e "const c=require('./docs/courses/ares-101/course.json'); const sum=c.modules.reduce((s,m)=>s+m.estimatedMinutes,0); if(sum!==c.estimatedMinutes) throw new Error('mismatch: '+sum+' vs '+c.estimatedMinutes); console.log('ok', sum);"`

Expected: `ok 220`

- [ ] **Step 4: Publish the eleven readings to the public blog**

Each `content/Cnn` file is publish-quality prose by design. For each, create a post in the Constellation blog editor, paste the body (without the authoring header), set the title and slug, and publish.

**This is optional per module and is the author's call.** These were written for a new ARES engineer and read as technical for `purduesearch.org`. Publish the ones that stand on their own — M1, M2, M4, and M11 are the strongest candidates — and leave the rest internal. Record which were published in `docs/courses/ares-101/README.md`.

- [ ] **Step 5: Update the courses README**

Change the `ares-101` row to its final state:

```
| `ares-101` | Role: ARES team | ~3 h 40 m | Content written · installed by seed:courses |
```

- [ ] **Step 6: Commit**

```bash
git add docs/courses
git commit -m "docs(ares-101): publish and close out the curriculum"
```

---

## Done when

- `npm run seed:courses` installs `ares-101` with 11 modules and 52 sections.
- `npm run check:courses` passes — every CONTENT body converts to a real TipTap document.
- A non-admin account can complete all eleven modules end to end and receives the course reward.
- Every citation in `lit/SOURCES.md` resolves to a retrievable document, and every `pdfDriveFileId` renders in a private browser window.
- Every number spoken in `V11`–`V17` has been recomputed and confirmed.
- `course.json`'s `estimatedMinutes` equals the sum of its modules'.
