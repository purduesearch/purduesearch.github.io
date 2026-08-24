# S02 — Hypercapnia reference (deck outline)

| | |
|---|---|
| **Course / section** | ARES 101 · M4 · "Hypercapnia reference deck" |
| **Kind** | SLIDES — built as a deck, exported to PDF, imported through the slides workbench |
| **Slides** | 12 |
| **Narration** | Optional. If recorded, sync per-slide start times in the workbench. |
| **Overlay questions** | 2 (slides 4 and 9) |
| **Built** | ☐ |

## Why a deck and not a video

Two of these slides are lookup tables, and they are the reason this section exists in this form.

**Slide 3 (the dose–response tiers)** and **slide 4 (the unit conversions)** are the two slides
people will screenshot and keep. Somebody sizing an experiment needs the tier boundaries; somebody
reading a NASA document in mmHg and an app reading in ppm needs the conversion, and needs it in about
four seconds. A video makes both un-scannable — you cannot skim to 3:40 to check whether 2,500 ppm is
1.9 or 19 mmHg, and if you could, you would still have to watch it again next month.

A deck keeps them as images the learner can page back to, and the slides workbench extracts the text,
so "4 mmHg" stays searchable across the whole course.

The rest of the module carries the argument. `C15` is the prose, `L04` is where the evidence gets
contested, and `E01` is where the conversions get used. This deck is the thing you reopen afterwards.

## Slides

### 1 · Title
"What CO₂ does to you." Subtitle: *reference deck — the tiers, the units, and the one open question.*
No body text.

### 2 · The chain, in one line
Large, single sentence across the slide:

**Air in front of your face → alveolar partial pressure → PaCO₂ → symptoms.**

Underneath, small: *Symptoms track PaCO₂, not the ppm figure in the room. Everything else on this
deck is about how far the room number is from that.*

Sets up why slide 4 exists at all. Nothing else on the slide.

### 3 · The dose–response tiers
**The screenshot slide.** Full-bleed table, three columns, no footer, no decoration, no logo.

| Tier | Concentration | Reported effects |
|---|---|---|
| **Mild** | 1,000–2,500 ppm | Headache · fatigue and lethargy · reduced concentration · mild cognitive decline · vision disturbances (SANS) |
| **Moderate** | 2,500–5,000 ppm | Significant headache · impaired decision-making · increased intracranial pressure · reduced cerebral perfusion · signs of respiratory distress |
| **Acute** | > 5,000 ppm | Confusion and disorientation · sudden speech difficulty · cerebral vasodilation · loss of coordination · potential neurological event |

Two anchors along the bottom edge, small: **420 ppm** outdoor ambient · **5,000 ppm** the 8-hour
occupational limit.

> One caption line, in the footer, and it does not get cut for space:
> *Operational triage bands from an internal ARES synthesis — not a clinical staging system. Symptoms
> listed are reported at roughly these exposures, not guaranteed at them. Slide 10 is why that
> caveat is here.*

### 4 · The unit triangle
**The second screenshot slide.** Also full-bleed, also no decoration.

Top third — the three quantities, one line each:
- **ppm** — a *mole fraction*. Out of a million molecules of air, this many are CO₂.
- **mmHg** — a *partial pressure*. Needs a total pressure to compute. This is the physiological one.
- **%** — ppm ÷ 10,000. Only when quoting a datasheet or a paper's own figure.

Middle — the formula, large and monospaced:

```
p_CO₂ [mmHg] = (C [ppm] / 1,000,000) × 760      (at 1 atm)

  1 ppm  = 7.60 × 10⁻⁴ mmHg        1 mmHg = 1,316 ppm        1 % = 10,000 ppm
```

Bottom — the table:

| ppm | mmHg at 1 atm | What it is |
|---|---|---|
| 420 | 0.32 | Outdoor ambient |
| 1,000 | 0.76 | Top of the mild tier |
| 2,500 | 1.9 | Mild / moderate boundary |
| 5,000 | 3.8 | Moderate / acute boundary; 8-hour occupational limit |
| 5,300 | 4.0 | **NASA operational limit, 2010–present** |
| 6,600 | 5.0 | NASA operational limit, 2006–2010 |
| 200,000 | 152 | Full scale of the SprintIR-6S-20 % |

One line under it, bold: **The conversion is pressure-dependent.** 2,140 ppm is 1.63 mmHg at sea
level and 1.53 mmHg at 950 hPa.

**Overlay question (SINGLE):** *An app reads 2,500 ppm. What partial pressure of CO₂ is that at sea
level?*
→ **1.9 mmHg.** (2,500 × 7.60 × 10⁻⁴.) Distractors: 0.19 mmHg · 19 mmHg · 3.3 mmHg.
*Rewind to slide 4 on a wrong answer.*

### 5 · Why partial pressure, not ppm
Diagram, left to right, four boxes with arrows: **ambient p_CO₂ → alveolar p_CO₂ → PaCO₂ → symptom.**

Under the arrows, the things that sit between the first box and the third, as small labels on the
arrows themselves: *ventilation rate · metabolic rate · dead space · **rebreathed fraction***. The
last one in the course's accent colour — it is the only one ARES measures, and it is what M2 defined.

Closing line: *the room number is a proxy at two removes.*

### 6 · What it does inside a head
Simple sagittal head outline, three callouts pinned to it. Mechanism first, symptoms second — the
point of the slide is that these are one mechanism, not a list.

- **CO₂ dilates cerebral vessels** → cerebral blood flow rises
- **Rigid skull** → more volume means **more intracranial pressure**
- → headache · pressure behind the eyes · decrements in concentration and decision-making

Bottom strip, separated by a rule: **SANS** — optic disc oedema, globe flattening, refractive shift,
in a large fraction of long-duration crew. Elevated CO₂ is a **hypothesised co-factor**, pushing ICP
the same direction as the cephalad fluid shift. *Not an established cause. This deck never writes it
as one.*

### 7 · The ISS history
Three stat blocks across the top, big numerals:

| ~420 ppm | 2,000–5,000 ppm | ~38.7 % |
|---|---|---|
| Earth ambient | Typical ISS bulk CO₂ | ISS crew reporting headaches, Expeditions 2–31 |

Below, four bullets:
- CO₂ monitors deployed on ISS in 2001; averages around 5,000 ppm, well above Earth ambient.
- **For every 1 mmHg increase, the odds of a crew headache nearly doubled.**
- NASA lowered the limit twice after flight surgeons saw the correlation: **2006 → 5 mmHg**,
  **2010 → 4 mmHg**.
- Both were reductions in a **bulk cabin** limit, decided on symptom data. Nobody had measured the
  air in front of a face.

### 8 · Adaptation masks it
Single quotation, large, most of the slide:

> Astronauts reported not realising CO₂ was elevated **until the scrubbers came back on.**

One line beneath: *A crew member's report of feeling fine is not a measurement. It is a sensor with a
slow, unknown, downward-drifting baseline — the exact failure mode M10 teaches you to distrust in a
$50 NDIR part.*

### 9 · Bulk is not face
Two panels side by side, deliberately the same scale.

**Left — what ECLSS measures.** A cabin schematic with a wall-mounted sensor. Caption: *CDRA,
Vozdukh, CAMRAS. Bulk removal from the bulk atmosphere. Working exactly as designed.*

**Right — what nobody measures.** A head with the CO₂ bubble in front of the face, three ARES pods
marked. Caption: *A localized deadspace bulk removal does not address. Simulated face-level CO₂ in
microgravity is ~2× bulk cabin levels — and that is a model output, not a measurement.*

Bottom, full width: **"The cabin is within limits" and "this person's air is within limits" are two
different claims. Only the first has ever been checked.**

**Overlay question (SINGLE):** *ISS bulk CO₂ reads 3,000 ppm, comfortably inside NASA's operational
limit. What does that tell you about the CO₂ the crew member at the workstation is inhaling?*
→ **Very little.** ECLSS measures the bulk cabin; the modelled quantity of interest is a localized
deadspace in front of the face that bulk removal does not reach.
*Rewind to slide 9 on a wrong answer.*

### 10 · The cognition evidence is contested
Two columns, equal weight, no verdict banner.

| Satish et al. (2012) | Herbig et al. (2026) |
|---|---|
| 22 subjects, crossover | **398 adults**, randomised controlled trial |
| 600 / 1,000 / 2,500 ppm, 2.5 h | 1,200 / 2,750 / 4,200 ppm, ~2.5–3 h |
| One proprietary instrument (SMS) | Eight domains, established published tests |
| Moderate-to-large decrements from 1,000 ppm | **No systematic effect at any level tested** |

Closing line, centred: **The vascular effects are not in doubt. The size and threshold of the
cognitive effects at sub-5,000 ppm exposures are.**

Then, small: *L04 is the Herbig paper. Your job there is not to pick a winner — it is to say what
each design can and cannot establish.*

### 11 · The one open question
Dark slide. The incident, stated flat, no dramatisation:

7 January 2026 · ISS · Mike Fincke, four prior missions, 549 days in space · sudden loss of speech
after EVA prep · ~20 minutes · Crew-11 returned 15 January, NASA's first ISS medical evacuation ·
heart attack ruled out.

Centred, largest text on the slide:

> **STILL UNDIAGNOSED.**

Then, in the same size as the facts above it and not smaller:

**This is not evidence for the CO₂ hypothesis.** No cause has been established. No CO₂ measurement
exists from the air in front of his face — no instrument was there, which is the point. Symptom
alignment is not evidence of cause, and this deck's own tier table puts sudden speech difficulty
above 5,000 ppm, which is above the bulk range the ISS operates in.

Footer, as a question and only as a question: *Could localized CO₂ accumulation near the face be a
contributing factor that has gone unmeasured? Nobody knows. The measurement has never been taken.*

### 12 · What the app does with a number
Closing reference slide — the current-state numbers, so this deck answers "what does red mean" too.

| Behaviour | Numbers |
|---|---|
| **Alert thresholds** (per pod, 100 ppm hysteresis) | warn **1,000 ppm** · danger **2,000 ppm** |
| **Display colour bands** | green < 800 · amber 800–1,400 · red ≥ 1,400 |
| **Dosimeter** | ∫(CO₂ − 420 ppm) dt in **ppm·hours**, clamped at zero, split by activity |
| **Dose card status** | OK < 500 ppm·h · caution to 2,000 · danger above |

One line at the bottom, and leave it in: *the alert numbers and the colour numbers are different
numbers. That is real, it is in the code today, and it is worth knowing before a subject asks you why
the tile went red without a notification.*

## Production notes

- Build in Google Slides at 16:9, using the ARES palette (dark base, martian amber `#F59E0B`
  accent, alert red `#EF4444`). Export to PDF and import via the slides workbench.
- **Slides 3 and 4 are the ones people screenshot.** No footer, no logo, no decoration, type set
  large enough to read from a phone photo. If either one needs a second slide to breathe, split it —
  a twelve-slide deck that stays legible beats an eleven-slide one that does not.
- Slide 3's caveat caption and slide 11's "this is not evidence" paragraph are **content, not
  disclaimers.** They do not get shrunk to fit and they do not get moved to speaker notes. A learner
  who screenshots slide 3 without the caption, or slide 11 without that paragraph, has taken away
  something this module exists to prevent.
- Slide 11 is the emotional centre of the deck and the easiest one to get wrong. Resist the urge to
  add ominous artwork. The facts are enough, and dressing them up is what turns an open question into
  an implied answer.
- Speaker notes are typed per slide in the workbench after import; PDF export does not carry them.
- If narration is recorded, the two overlay questions still gate advancing. Do not restate their
  answers in the VO or the answer becomes free.
- Numbers on slides 3, 4, and 12 must agree with `C15`, `GLOSSARY.md` §5, and the app source. If the
  app's thresholds change, slide 12 changes in the same commit — see `README.md`, rule 2.
