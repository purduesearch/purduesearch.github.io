# C15 — What CO₂ does to you

> CONTENT section · ARES 101 · M4 · ~5 min read
> Seeded into `contentJson` as rich text. Depends on `GLOSSARY.md` §5 (the units convention) and
> nothing else — M4 is independent of M1–M3 and can be read first.
> The numbers in the dose–response table and the ISS history are quoted from an internal deck, not
> from a consensus clinical source. That is stated in the text on purpose. Do not "tidy" it away.

---

## The only module about the person

Everything else in this course is about air, or about the instruments that measure air. This one is
about what happens inside a human when the number goes up, and it exists because a measurement with
no consequence attached is a hobby.

It is also the module where you will be asked to hold two things at once. Elevated CO₂ does real
things to a body, and the evidence for *how much* of it does *what*, at the levels a spacecraft or an
office actually reaches, is genuinely contested. A course that gave you only the first half would be
easier to write and would make you worse at this work.

## The dose, by tier

The ARES project works from three operational bands:

| Tier | Concentration | What is reported at this level |
|---|---|---|
| **Mild** | 1,000–2,500 ppm | Headache · fatigue and lethargy · reduced concentration · mild cognitive decline · vision disturbances (SANS) |
| **Moderate** | 2,500–5,000 ppm | Significant headache · impaired decision-making · increased intracranial pressure · reduced cerebral perfusion · signs of respiratory distress |
| **Acute** | above 5,000 ppm | Confusion and disorientation · sudden speech difficulty · cerebral vasodilation · loss of coordination · potential neurological event |

Read that table the way its authors meant it — as a triage aid for deciding whether a reading is
worth acting on — and not as a clinical staging system. It is a synthesis assembled for an internal
presentation. The boundaries are round numbers. The symptoms listed in a tier are things *reported*
in the literature at roughly those exposures, not things that reliably happen to a given person at a
given concentration, and the literature they are drawn from disagrees with itself in places this
module will get to.

Two anchors worth memorising, because they are the ones that keep recurring:

- **5,000 ppm** is the 8-hour occupational exposure limit in most jurisdictions. It is also the
  moderate/acute boundary above.
- **420 ppm** is outdoor ambient. Everything above is something a room, a vehicle, or a spacecraft
  did.

## The unit triangle

CO₂ gets quoted three ways and the three are quietly different kinds of quantity. `GLOSSARY.md` §5
fixes the convention this course uses; here is why it exists.

**ppm is a mole fraction.** Out of a million molecules of air, this many are CO₂. It says nothing
about how many molecules there are in total.

**mmHg is a partial pressure.** The pressure the CO₂ alone would exert. To get it from ppm you need
a total pressure, and at one standard atmosphere:

```
p_CO₂ [mmHg] = (C [ppm] / 1,000,000) × 760

  1 ppm  = 7.60 × 10⁻⁴ mmHg
  1 mmHg = 1,316 ppm
  1 %    = 10,000 ppm
```

**% is just ppm divided by 10,000**, and appears in this course only when a datasheet or a paper used
it.

| Concentration | At 1 atm |
|---|---|
| 420 ppm | 0.32 mmHg |
| 1,000 ppm | 0.76 mmHg |
| 2,500 ppm | 1.9 mmHg |
| 5,000 ppm | 3.8 mmHg |
| 5,300 ppm | 4.0 mmHg — NASA's 2010 operational limit |
| 6,600 ppm | 5.0 mmHg — NASA's 2006 operational limit |

The conversion depends on total pressure, and that is not a footnote. A reading of 2,140 ppm is
1.63 mmHg at sea level and 1.53 mmHg at 950 hPa. Same mole fraction, six percent less gas arriving
at a lung. E01 makes you do this arithmetic, and M5 makes you correct a sensor for it.

## Why partial pressure is the quantity that matters

Here is the chain that connects a number on a headset to a symptom in a person, and every step of it
is a partial pressure, not a mole fraction.

CO₂ in the air in front of your face exerts a partial pressure. That air reaches your alveoli, where
it sets an alveolar partial pressure. Your blood equilibrates against the alveolar gas, giving
**PaCO₂** — the partial pressure of CO₂ in arterial blood. Symptoms track PaCO₂. They do not track
the ppm figure in the room, except through this chain.

Two consequences follow immediately and both matter for this project.

**The room number is a proxy at two removes.** Between the ambient reading and PaCO₂ sit your
ventilation rate, your metabolic rate, your dead space, and how much of what you just exhaled you
are inhaling again. The last of those is the whole subject of this course.

**Pressure changes the answer without changing the ppm.** Take the same 2,000 ppm to altitude and the
partial pressure falls, so less CO₂ crosses into blood. This is the physical reason the course
insists on saying which unit you mean. It is also why an NDIR sensor — which counts absorbing
molecules in its optical path, and therefore tracks partial pressure — drifts with ambient pressure
even when the mole fraction has not moved. M10 makes that a correction; here it is a caution.

## What elevated CO₂ does inside a head

The mechanism that ties most of the symptom list together is vascular.

CO₂ is a potent **cerebral vasodilator**. Raise arterial CO₂ and cerebral blood vessels dilate,
cerebral blood flow rises, and intracranial volume rises with it. In a rigid skull, more volume means
more pressure, so raised PaCO₂ raises **intracranial pressure**. That is the plausible common root
of the headache, the pressure-behind-the-eyes reports, and the harder-to-pin decrements in
concentration and decision-making.

It also puts CO₂ next to **SANS** — spaceflight-associated neuro-ocular syndrome, the cluster of
optic disc oedema, globe flattening, and refractive shift seen in a large fraction of long-duration
crew. The headline mechanism for SANS is the cephalad fluid shift of microgravity. Elevated CO₂ is a
**hypothesised co-factor**, because it pushes intracranial pressure in the same direction. It is not
an established cause, and this course writes it that way every time.

The ARES deck reports a specific dose–response finding worth carrying: across ISS Expeditions 2–31,
about 38.7 % of astronauts reported headaches, and **for every 1 mmHg increase in cabin CO₂ the odds
of a crew headache nearly doubled**. That is an odds ratio from operational data, not from a
controlled exposure, and it is one of the more robust human-spaceflight results on this topic — which
is a comment on how thin the field is as much as on how strong that result is.

## Adaptation, and why self-report is not a monitor

The most operationally important fact in this module is not a threshold. It is this:

> Astronauts reported not realising CO₂ had been elevated **until the scrubbers came back on** and
> they suddenly felt better.

Chronic exposure blunts the subjective signal. The headache and the fog become the baseline, and the
comparison that would reveal them is unavailable, because you cannot compare yourself to a version of
yourself you have not been for three weeks.

Everything about how you treat a wearable follows from that. A crew member's report of feeling fine
is not a measurement. It is the output of a sensor with a slow, unknown, downward-drifting baseline,
which is exactly the failure mode M10 spends a whole module teaching you to distrust in a $50 NDIR
part.

NASA acted on this twice: the operational CO₂ limit was lowered to 5 mmHg in **2006** and to 4 mmHg
in **2010**, after flight surgeons saw the headache correlation. Note what those decisions were and
were not. They were reductions in a **bulk cabin** limit, made on symptom data, without anyone ever
having measured the concentration in the volume immediately in front of a crew member's face.

## Bulk is not face

Typical ISS bulk CO₂ runs roughly 2,000–5,000 ppm — five to twelve times outdoor ambient — and the
ECLSS hardware that manages it (CDRA, Vozdukh, CAMRAS) is a bulk system by design. It scrubs the
cabin.

The Dutta paper's Discussion makes the argument this project is built on, and it is worth having in
the authors' framing: even in a cabin with a perfectly regulated O₂/CO₂ balance, the localized
deadspace immediately in front of the face is **not addressed by bulk removal**, so respiration can
be significantly impaired inside an atmosphere that is, by every instrument on board, within limits.
The paper's own reasons for expecting that to be common are behavioural rather than exotic:
astronauts spend most of the day deliberately anchored in one place — foot restraints at a workstation,
arms inside a glovebox for hours, harnessed to a treadmill, six crew around a dinner table for ninety
minutes, and seven to eight hours zipped into a crew quarter about the size of a phone box.

So "cabin CO₂ is within limits" and "the air this person is breathing is within limits" are two
different claims, and only the first one has ever been checked. That gap is the entire reason there
is a headset.

## The evidence on cognition is contested, and you need to know that

The tier table above lists cognitive decrements at 1,000–2,500 ppm. That claim comes from a real
literature, and that literature does not agree with itself.

The best-known positive result is Satish et al. (2012): 22 subjects, 2.5-hour exposures at 600,
1,000 and 2,500 ppm, scored on the Strategic Management Simulation, reporting moderate-to-large
decrements in decision-making at 1,000 ppm and larger ones at 2,500 ppm. It is the study most of the
"CO₂ makes you dumber" coverage traces back to, and its design — small, crossover, one proprietary
instrument — is also what its critics point at.

The largest controlled test to date points the other way. Herbig et al. (2026) ran a randomised
controlled trial with **398 adults** across eleven exposure combinations of CO₂ (up to 4,200 ppm),
VOCs, and cabin pressure, measuring eight cognitive domains with established, published tests. They
found effects in two domains, neither aligned with the air-quality conditions, and concluded there
was no evidence of systematic negative effects at those levels. That paper is your lit review for
this module, and the assignment is not to decide who is right — it is to work out what each design
can and cannot establish.

Hold the honest position, which is narrower than either headline: **CO₂'s vascular effects are not
in doubt; the size and threshold of its cognitive effects at sub-5,000 ppm exposures are.** ARES does
not need to resolve that to be worth building. It measures a quantity nobody has measured, in a place
nobody has measured it, and both sides of the cognition argument have been arguing about bulk room
concentrations the whole time.

## The Fincke incident

On 7 January 2026, aboard the ISS, veteran NASA astronaut Mike Fincke — four prior missions, 549 days
in space, then flying with Crew-11 — was eating dinner after EVA preparation when he abruptly lost the
ability to speak. No pain and no warning; crewmates saw he was in distress and all six responded. The
episode lasted about twenty minutes. In his own words, "it was completely out of the blue. It was
just amazingly quick." Crew-11 returned to Earth on 15 January in NASA's first ISS medical
evacuation. A heart attack was ruled out. As of this writing, **doctors have no diagnosis.**

The ARES presentation deck notes that sudden speech difficulty appears in its acute tier and argues
that Fincke's symptom "aligns with acute cerebrovascular effects documented under elevated CO₂
conditions." You are going to hear that argument made in this project, so here is how to hold it.

**The Fincke incident is not evidence for the CO₂ hypothesis.** It is an undiagnosed medical event.
No cause has been established, no CO₂ measurement exists from the volume in front of his face — no
such instrument was there, which is the whole point — and an event with no diagnosis cannot support a
mechanism. Symptom alignment is not evidence of cause: a large number of conditions produce sudden
transient aphasia, several of them far more common than hypercapnia, and the deck's own tier table
places sudden speech difficulty above 5,000 ppm, which is above the bulk cabin range the ISS
operates in.

What the incident actually is, is the **open question that motivates the work**. A veteran crew
member had a serious neurological event in an environment where a specific, physically plausible,
completely unmeasured exposure exists. The honest statement of the project's premise is a question,
and it is the one the deck itself ends on: *could localized CO₂ accumulation near the face be a
contributing factor that has gone unmeasured?* Nobody knows. Nobody can know, because the measurement
has never been taken.

That is a good reason to build an instrument. It is not a result, and if you present it as one to a
reviewer, a funder, or a professor, you will be corrected in public and you will deserve it. The
value of the incident to this project is that it makes the absence of data intolerable — not that it
fills it.

## Current state: what the app does with a number

The Flutter app turns all of the above into three concrete behaviours.

**Threshold alerts.** `ThresholdConfig` ships with a **warn at 1,000 ppm** and a **danger at
2,000 ppm**, evaluated per pod, with 100 ppm of hysteresis on each so a reading hovering on a
boundary does not spam notifications. Those are the numbers a wearer is actually told about.

**Display bands.** The colour scale is a different set of numbers: green below 800 ppm, amber
800–1,400, red at or above 1,400. That mismatch — 1,000/2,000 for alerts, 800/1,400 for colour — is
real and is in the code today. It is worth knowing about before you try to explain to a subject why
their tile went red without a notification.

**The dosimeter.** Exposure is accumulated as **ppm·hours**: the trapezoidal integral of
(CO₂ − 420 ppm) over time, with samples below baseline clamped to zero so clean air cannot pay off a
debt. It is broken down by activity code — still, walking, exercising — with each interval attributed
to the activity at its start. The insight card reads OK below 500 ppm·h, caution to 2,000, and danger
above. Note what the baseline subtraction means: the dosimeter reports **excess** exposure, not total
inhaled CO₂, so a ppm·hours figure from ARES is not comparable to one computed against zero.

E01 has you compute one of these by hand from a synthetic session, because a metric you have never
computed yourself is a metric you cannot sanity-check.

## What's next: EEG

The summer deliverables carry a fourth track, and it is deliberately scoped as **planning and
feasibility only** — no implementation tasks are defined, because none should be until the questions
below are answered.

The goal is to correlate brainwave activity with CO₂ exposure during the sleep sessions, which would
put a direct neurophysiological measurement next to the environmental one for the first time in this
project. The work this summer is to define what neural signals are actually relevant to CO₂ exposure
and sleep state; to evaluate dry-electrode consumer systems against clinical wet-electrode ones for a
headset that already occupies the forehead and crown; to consult on electrode placement that does not
collide with the ARES pods; to determine whether EEG requires an amendment to the sleep-study IRB
application or a fresh submission; and to sketch how two independent devices get a common clock.

The deliverable is a written roadmap, not a demo. That is the right shape for it. An EEG channel
bolted on before anyone has decided what question it answers would produce a second stream of data
nobody can interpret next to the first, which is a more expensive way of not knowing.

---

**Sources.** Dose–response tiers, the ISS history (bulk range, the 38.7 % headache figure across
Expeditions 2–31, the ~2× headache odds per mmHg, the 2006 → 5 mmHg and 2010 → 4 mmHg limit
reductions, the scrubbers-back-on adaptation report, and the SANS co-factor framing), and the Fincke
incident narrative and its symptom-alignment argument: `ARES_CO2_Presentation (1).pptx` slides 2–4.
The bulk-ECLSS argument, the named ECLSS systems, and the anchored-posture reasoning: Dutta et al.
(2026), *Gravity and Human Respiration*, Discussion §§"Gravity and Human Respiration in Space" and
"Bioastronautics and Biophysical Countermeasures" (`SOURCES.md`, `dutta2026`). Units, the conversion
table, and the property constants: `GLOSSARY.md` §§4–5. The cognition literature: Satish et al.
(2012) and Herbig et al. (2026) (`SOURCES.md`, `satish2012` and `herbig2026`). Current state — warn
and danger thresholds and the 100 ppm hysteresis: `app/lib/services/threshold_service.dart`; colour
bands: `app/lib/theme/ares_theme.dart`; the ppm·hours integral, the 420 ppm baseline, the clamp, and
the activity breakdown: `app/lib/science/dosimeter.dart` and `app/lib/science/constants.dart`; the
dose card's 500 / 2,000 ppm·h status bands: `app/lib/screens/insights_screen.dart`. What's next — the
EEG track's scope and its eight planning subtasks: `ARES_CO2_Headset_Summer2026_Deliverables.docx`,
Track 4 (§4.8.1–4.8.8).
