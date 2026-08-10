# C19 — From signal to science

> CONTENT section · ARES 101 · M8 · ~5 min read
> Seeded into `contentJson` as rich text. Depends on `C13` for the rebreathed-fraction definition
> (reused here, not redefined), `C17` for transport delay, and `C18` for the flow-velocity channel.
> Every claim about a model below was read off the Dart source in
> `C:\Users\Henry\Documents\ARES\ARES2ESP32\app\lib\science\`, not off the deck. Where the deck and
> the code disagree, this file says so and follows the code.
> If you change a model, change this file in the same commit.

---

## Ten models, and a word on the deck

Slide 10 of the 7/30 deck is called **The science engine**, and under the title it says:

> *Ten physiology models convert cross-pod CO₂ and biometrics into validated, research-grounded
> metrics.*

Ten models is right. The grid below it is right. But **"validated, research-grounded" is not true of
all ten**, and it is the job of this module to say which.

That is not a criticism of whoever wrote the slide — it is a summary line on a status deck, not a
methods section, and the code underneath is in several places more honest than the slide above it. It
is a problem for *you*, because a slide is what gets shown to a sponsor, and a member who has read
only the slide will repeat the sentence. A course that presents ten models as equally validated has
taught somebody to trust a number they should not.

So this module does two things. It tells you what each of the ten computes. And it puts each one on a
ladder, so that when somebody asks "how confident are you in that figure", you have an answer better
than "the app says so."

## The ladder

Three rungs, and the distinction between them is not about how *good* a model is. It is about
**what you would have to do to prove it wrong.**

| Rung | What it means | How you would falsify it |
|---|---|---|
| **Standard** | An external, published, versioned specification exists. Somebody else wrote it down, a committee argued about it, and it has a document number. | Read the standard. If the code disagrees with the standard, the code is wrong. |
| **Published model** | A peer-reviewed model with a literature and a stated regime of validity. No committee, but a paper you can cite and a range it was tested over. | Find the paper. Check you are inside its regime. |
| **Heuristic** | Somebody chose a threshold or a mapping because it seemed reasonable. It may well be reasonable. There is nothing outside the repository to check it against. | You cannot, from outside. You can only measure the thing directly and compare. |

A heuristic is not worthless. `Moderate` at 2 % rebreathing is a perfectly sensible place to put a
label. The problem is only ever when a heuristic is quoted as though it were the top rung — when
"the model says the subject is fatigued" is offered as a finding rather than as a threshold somebody
picked in an afternoon.

Here is where the ten actually sit. The rest of this page is the argument for each row.

| Model | What it computes | Rung |
|---|---|---|
| PMV / PPD | Thermal comfort vote and percentage dissatisfied | **Standard** — ISO 7730:2005, implemented faithfully |
| Dosimeter | CO₂ exposure in ppm·hours, split by activity | **Standard** — it is a definition, not a model |
| Rebreathing | Rebreathed fraction from chin versus top | **Published model** — two-compartment mixing |
| Ventilation risk | Low / moderate / high tier from rebreathed fraction | **Published model** for the tiers · **heuristic** for the score |
| Respiration | Breath rate by FFT of the chin trace | **Published model** for the transform · **heuristic** for the pipeline |
| Airflow | Cross-pod lag and downstream detection | **Published model** for cross-correlation · **heuristic** for the thresholds |
| Metabolic | METs and kcal from heart-rate reserve plus CO₂ | **Heuristic**, built on a rule of thumb |
| Fatigue | Body-battery drain against CO₂ | **Heuristic** |
| Hydration | Sweat onset from forehead humidity | **Heuristic** |
| Acclimatization | Multi-day HR and altitude AMS scoring | **Heuristic** |

Four of the ten are heuristics end to end. Three more are a sound core wrapped in chosen constants.
That is a normal state for a project at this stage and it is not a reason to stop. It is a reason to
know which is which.

## The two that are standards

**PMV and PPD** are the real thing. `pmv.dart` implements Fanger's thermal-load equation from
**ISO 7730:2005 Annex A** — the full expression, with the clothing-surface temperature solved by the
numerically stable bisection-relaxation iteration from `pythermalcomfort` rather than by the naive
fixed-point loop the standard prints, which does not always converge. PMV is clamped to [−3, +3],
PPD follows the standard's `100 − 95·exp(−0.03353·PMV⁴ − 0.2179·PMV²)` and floors at 5 %, because
you cannot satisfy everybody. The comfort labels follow the ASHRAE 55 bands. If this code disagreed
with ISO 7730, the code would be wrong, and you could prove it in an afternoon with the standard
open.

Now the caveat, and it is the single most useful idea in this module.

**A standard implemented correctly on estimated inputs is not a standard-grade result.** PMV takes
six inputs. The headset measures one and a half of them. Air temperature, yes — an SHT45 in every
pod. Relative humidity, yes. **Mean radiant temperature**: the headset has no globe thermometer, so
the function's own documentation says *"pass `airTempC` when unknown"*, which is the correct fallback
and is also a guess. **Air velocity** defaults to 0.1 m/s — a constant, until M7's anemometers land.
**Metabolic rate** comes from the MET model, which is on the bottom rung. And **clothing insulation**
is a number somebody types in about what the subject is wearing.

So the algorithm is ISO 7730 and the *answer* is not. The chain is only as strong as the guess in
it, and the guess is not in the standard.

**The dosimeter** is on the top rung for a different and slightly cheeky reason: it is not really a
model. `computeDose()` is the trapezoidal area under `(CO₂ − baseline)` against time, with negative
excursions clamped to zero and the baseline defaulting to `kOutdoorCo2Ppm = 420`. That is the
definition of ppm·hours, computed correctly. There is nothing to validate — arithmetic is not a
hypothesis. The only judgement in it is the choice of 420 ppm as the floor, which is defensible and
should still be stated whenever a dose is quoted.

One implementation detail worth knowing before you read a breakdown: `activityBreakdown()` attributes
each trapezoidal segment to the activity code of the **earlier** of its two samples. So a segment
that straddles the moment a subject stands up is charged entirely to sitting. Over a long session
that is noise; over a session with a lot of short activity changes it is a bias, and it is the kind
of thing that only shows up when somebody asks why the numbers do not add up the way they expected.

## The middle rung, and the label problem

**Rebreathing** is `C13`'s definition, unchanged, and this is where you should notice that the course
is reusing it rather than restating it:

```
f_rb = (C_chin − C_top) / (C_exhaled − C_top)
```

`rebreathing.dart` computes exactly that and clamps the result to [0, 1]. The two-compartment mixing
model behind it is standard in the indoor-air literature, so the *structure* is a published model.
`C13`'s three caveats travel with it and are not repeated here.

What `C13` could not tell you, because it predates this module, is the value of `C_exhaled` the app
actually uses. It lives in `constants.dart`:

```dart
/// Reference CO2 concentration in exhaled breath (ppm).
const double kExhaledCo2Ppm = 38000;
```

**38,000 ppm — not the 40,000 ppm `V12` worked with.** Both are defensible mixed-expired figures and
neither was measured on a subject. `V16` computes what the difference does, and the answer is more
interesting than it sounds: on the very reading `V12` used, the two constants put the rebreathing
label on opposite sides of a tier boundary. Watch it before you quote a fraction to anybody.

**Ventilation risk** is where the naming goes wrong, and this is the example to remember.

The deck calls the model **Wells-Riley**. The file is called `wells_riley.dart`. Wells-Riley is a
real and famous airborne-infection model: it relates infection probability to the quanta emission
rate of an infector, the ventilation rate, the number of susceptibles, and the exposure duration.

**The code does not implement it, and it does not claim to.** Read the docstring:

> *Ventilation quality classification per Rudnick & Milton (2003) CO₂ model.*

That is accurate, and Rudnick & Milton is a real paper — it is the standard route from a rebreathed
fraction to a ventilation judgement. What `classifyVentilationRisk()` does is bin `f_rb` into three
tiers at 0.5 % and 2 %. There is no quanta emission rate anywhere in the file, no exposure time, no
infector. There could not be: the headset does not know whether anybody in the room is infectious.

Sitting beside it is `computeRelativeRiskScore()`, which returns `1 − exp(−k·f)` with
`k = ln 2 / 0.01`, chosen so the score reads 0.5 at 1 % rebreathing. That is a **presentation curve**
— a way to turn a fraction into something that fills a progress bar gracefully. It is not a risk in
any epidemiological sense, and the constant was picked to make the arithmetic land on a round number.

So: the code is honest, the filename is loose, and the deck label is an overclaim. **The failure mode
is naming a model after a famous equation you did not implement.** Nobody lied. Somebody reached for
a recognisable label, and by the time it reaches a slide the provenance is gone. If you present this
metric, say "ventilation tier from rebreathed fraction, thresholds after Rudnick & Milton". It is
four words longer and it is true.

**Respiration** and **airflow** both have an exact mathematical core and a pile of engineering
choices around it. A discrete Fourier transform is not a hypothesis; a Pearson cross-correlation is
not a hypothesis. What is chosen is everything else — the window length, the search band, the
resample rate, the confidence definition, the thresholds at which a lag becomes a direction. The
current state section below puts numbers on how much those choices matter, because for respiration
they matter more than anything else in this module.

## The four heuristics

Nothing below is wrong. All four are reasonable first passes, and all four would need a study behind
them before a number from any of them belonged in a paper.

**Metabolic.** `computeMets()` estimates HR_max as `220 − age` — the Fox formula, which is a
teaching rule of thumb with a population standard deviation of about ten beats per minute, so for an
individual it can be off by twenty. Resting HR is **hardcoded at 60 bpm** rather than taken from the
Garmin bridge, which supplies a real one. Heart-rate reserve is then mapped linearly onto 1 to 10
METs, which is a straight line drawn through two points because a straight line was needed. A small
bonus of up to 0.5 MET is added in proportion to the chin CO₂ excess. `computeKcal()` is
`METs × kg × hours`, which is the conventional approximation.

Three of `computeMets()`'s six parameters are not used in its body. `activityCode` and `weightKg`
are documented as accepted-but-unused. **`sex` is not documented, is never read, and is the only
reason the science layer imports anything from Flutter** — see the current state section. That is a
five-minute fix and it is a good first commit.

**Fatigue.** `isFatigueCorrelated()` returns true when body-battery drain is at least 10 units per
hour *and* average CO₂ is at least 1,500 ppm. Both thresholds are constants in the file. Body Battery
is a proprietary Garmin index with no published algorithm, so the input is a black box before the
threshold is applied to it. And the drain rate is computed from the **first and last** samples only,
not by a regression, so one bad endpoint moves it. The name is also doing work it should not: an
`AND` of two thresholds is a co-occurrence, not a correlation. The file does export a real Pearson
routine, `computePearsonCorrelation()`; it is simply not what this function calls.

**Hydration.** Sweat onset when the forehead-minus-ambient humidity gap is at least 7 %RH *and* still
rising at 0.5 %RH per minute. The source calls these thresholds "empirical", which is the honest word
for "chosen". The two-condition structure is good design — it stops a hot dry room from reading as
sweat — and the two numbers are the ones somebody would have to earn.

**Acclimatization.** `detectAmsRisk()` flags risk when resting HR exceeds `60 + 0.005 × altitude(m)`
by more than 20 bpm, above 1,500 m. **AMS is diagnosed clinically by the Lake Louise Score, a symptom
questionnaire.** Resting heart rate is a correlate of incomplete acclimatization, not a diagnostic
criterion, so this is a *hint* and the source is careful to call it one. The trend score is a
least-squares slope of resting HR against day index, mapped so that −10 bpm/day scores 1.0 and
+10 bpm/day scores 0.0. That mapping is a choice.

---

## Current state: `app/lib/science/`

Ten files, one per model, plus `constants.dart`. The models are **plain Dart functions on plain
data** — no widgets, no providers, no `BuildContext`. A separate `services/` layer subscribes to the
BLE stream and calls them; a `screens/` layer renders the results.

Say why that boundary exists, because it is the reason `E05` is a twenty-minute exercise and not a
two-day one: **a model with no UI dependency can be tested without a device.** `flutter test` runs
`test/science/` on your laptop with no headset, no Bluetooth, no subject, and no permissions dialog.
Ten test files, one per model. `E05` walks you through it — including what to do when the test runner
will not start, which on Windows is the common case and has a workaround that proves the point better
than the test suite does.

**The boundary has one hole, and it is worth seeing.** `metabolic.dart` imports
`../services/profile_service.dart`, which imports `flutter_riverpod` and `shared_preferences`. It
does that to name the `BiologicalSex` enum in a parameter that `computeMets()` never reads. So one
unused argument drags a state-management framework and a disk-persistence plugin into a directory
whose whole purpose is not to need them. Nine files out of ten import nothing but `dart:math`,
`dart:typed_data`, a sibling file, or `fftea`.

### The respiration model is bounded by its input, not by its maths

This is the part of the current state that will change what you do, so it gets numbers.

`respiration_service.dart` reads chin CO₂ (pod index 2) out of `liveHistoryProvider`, over a
**five-minute** window. `live_history.dart` enforces a **2.000-second minimum interval** between
stored samples. So the model's input arrives at **0.5 Hz**, whatever the BLE stream is doing.

Everything follows from that one number:

- **Nyquist for a 0.5 Hz acquisition is 0.25 Hz, which is 15.0 breaths per minute.** Any real rate
  above 15 brpm cannot be represented. It folds back down and is reported as a rate below 15.
- The model's search band is 0.1–0.7 Hz, so it will happily report anything from **6.09 to 41.95
  brpm** — a ceiling **2.8 times** its own acquisition Nyquist. Every value it can print above 15 is
  unreachable by an honest signal.
- A normal adult resting rate is 12–20 brpm. **Half of that range is above Nyquist.** A subject
  breathing at 18 is reported at 12; at 20, reported at 10; at 24, reported at 6.1. `V16` runs the
  sweep and draws the fold.
- The confidence figure does not save you. In `V16`'s sweep, 12 brpm and 18 brpm produce the
  *identical* reported rate at the *identical* confidence, because the two signals are genuinely
  indistinguishable once sampled at 0.5 Hz. There is no information left to tell them apart.
- **The model cannot report zero.** `brpm` is a bin index times a bin width; the lowest in-band bin
  is 6.09 brpm. It returns null only when the detrended trace has *exactly* zero energy in 307 bins,
  which happens for a mathematically perfect constant and never for real data. So a breath-hold
  produces a number, not a blank — and apnea detection is the point of the Herrick sleep study.

None of this is a bug in `respiration.dart`. The transform is correct, the resampling is correct, and
the file's own docstring says the outputs are **labelled experimental until fast CO₂ sensors land**
and that the pipeline is *"ready for 20 Hz sensors without code changes"*. The card in
`insights_screen.dart` prints `EXPERIMENTAL` beside every reading. The code knew. What was missing
was anyone having written down how large the limitation is, which is now above.

Two smaller things in the same file. Resampling to 4 Hz internally and zero-padding to 2,048 points
gives a bin spacing of 0.117 brpm, and the card prints one decimal place — but the **true** resolution
is `1/T` over a 298-second window, which is 0.201 brpm. Zero-padding interpolates the spectrum; it
does not add resolution, and printing to a tenth implies about twice the precision that is there. And
if the chin pod has fewer than ten valid CO₂ samples the service falls back to **forehead humidity**,
which an SHT45 cannot track at breathing rate at all.

### The airflow model cannot currently see what M6 warned about

`airflow_service.dart` calls `estimateAirflow()` with the default `resampleRateHz: 1.0`, so lags are
searched at whole-sample steps and come back **quantised to 1.000 second**, over a ±20 s window. The
UI calls a lag a direction once it exceeds ±0.5 s.

Put that next to `V15`. The genuine chin-to-top plume lag it works out is 0.629 s, and the artefact
that unmatched sample lines fabricate is 0.270 s. Both are smaller than one quantisation step. So at
today's resolution the model would round the real plume to 1 second — 59 % high — and round the
tubing artefact to zero, reporting "no flow" for both a real plume and a fabricated one.

That is not a reprieve. `resampleRateHz` is a call-site argument; raising it is a one-line change,
and the day somebody raises it **both** signals appear at once and only one of them is real. Match
the line lengths first. Note also that the 1 Hz grid is already finer than the 2 s data feeding it,
so everything between samples is linear interpolation.

The cross-correlation itself is carefully written and worth reading — it iterates outward from zero
lag so that a periodic signal's aliases lose the tie to the smallest lag, and it computes Pearson
correlation over each overlap window rather than z-scoring the full series, for a reason the comments
explain properly.

---

## What's next

Everything below comes from **ICES-2026-499**, NASA's In-suit CO₂ Washout Test System, which is this
module's literature review. NASA is measuring the same physical quantity inside a spacesuit that ARES
measures on a head, they have been at it since Gemini, and their current answers are directly
portable. Read the paper with a shopping list.

**Flow-weighted inspired CO₂, and NASA's own second thoughts about it.** ICWTS computes a **Flow
Weighted Average** — a convolution of a bidirectional flow measurement with inspired CO₂ — instead of
a Time Weighted Average. The distinction matters for exactly the reason `C13` gives: what harms you
is the CO₂ in the air you actually *inhale*, and a time average charges you equally for gas you never
breathed. Weight by flow and you get the physiologically meaningful number. M7's per-pod anemometers
are what would make this possible on the headset.

**And then read their conclusion.** The mouthguard flow sensors were so sensitive to moisture in the
flow path that they had to be replaced repeatedly during the test series, and the post-test data
reduction found that a simpler baseline measurement gave a *similar and acceptable* result. NASA's
recommendation is to drop the flow sensor. That is what a real methods trade looks like: they built
the better measurement, and then measured whether it was worth it. Do not port the FWA without
porting that finding.

**ICARUS, and learned breath detection.** The same programme trained a neural-network breath
recognition model on breaths from several suited tests, because the classical analysis relied on a
fixed elapsed time to accumulate a breath count and the waveforms were not reliably clean — a poorly
performing suit, a low ventilation flow, a high metabolic rate or a badly indexed subject all destroy
the expected pseudo-square wave with a clear inspiratory baseline. A detector counts breaths **as
events in time**. That is the structural fix for everything in the respiration section above: an
event counter can report zero, a transform cannot. `V16` makes the case with a picture. NASA's own
caveat travels with it — the detector over-counted good breaths at resting metabolic rates, traced to
a sample port sitting an eighth of an inch proud of the mouthguard's oral plane. A learned model
inherits the geometry of the thing that trained it.

**Péronnet differential-CO₂ metabolic rate.** ICWTS computes metabolic rate from the CO₂ difference
between the suit's ventilation inlet and outlet, using the Péronnet and Massicotte tables with an
assumed respiratory exchange ratio of 0.85. That is a route to a metabolic number that does not go
through `220 − age`, and it would move the metabolic model up a rung. It needs a controlled
ventilation volume, which a headset does not have — but the mannequin chamber does. Worth noting too
that NASA's attempt to *measure* the exchange ratio from differential O₂ failed on sensor accuracy,
which is a live warning for the SEN0465 oxygen channel on slide 11.

**Mannequin-first validation.** NASA's stated approach is a breathing mannequin sweeping the
physiological range, with human-in-the-loop testing as a small number of discrete verification
points, and CFD carrying the result to conditions nobody can test. That is the same argument `C14`
makes for ARES, arrived at independently by a programme with sixty years of practice — and it is what
keeps characterisation moving while IRB approval is pending.

**Moving-variance separation.** A last one that costs nothing: breath-scale signal and room-scale
signal live at different timescales, and a moving variance over a few-second window separates them
without a transform and without a band. It is a plausible cheap addition to the airflow model, and it
would not care about Nyquist the way an FFT does.

---

**Sources.** The ten models, their formulas, constants, thresholds and clamps:
`C:\Users\Henry\Documents\ARES\ARES2ESP32\app\lib\science\` — `rebreathing.dart`, `wells_riley.dart`,
`pmv.dart`, `respiration.dart`, `airflow.dart`, `metabolic.dart`, `dosimeter.dart`, `fatigue.dart`,
`hydration.dart`, `acclimatization.dart`, `constants.dart`, read 2026-08-10. The 2.000-second live
history interval: `app/lib/services/live_history.dart`. The five-minute windows, the chin-CO₂ pod
index, the forehead-humidity fallback and the default `resampleRateHz`:
`app/lib/services/respiration_service.dart` and `app/lib/services/airflow_service.dart`. The
`EXPERIMENTAL` labels, the one-decimal rendering and the ±0.5 s direction thresholds:
`app/lib/screens/insights_screen.dart`. The `flutter_riverpod` / `shared_preferences` imports reached
through `metabolic.dart`: `app/lib/services/profile_service.dart`. The ten model names and the
"validated, research-grounded" claim: `ARES_7_30_26.pptx` slide 10. The SEN0465 oxygen channel and
the per-pod FS7: slide 11. FWA versus TWA, the flow-sensor moisture failure and the recommendation to
drop it, the ICARUS breath-recognition model and its resting-rate over-count, the Péronnet metabolic
computation with RER 0.85, the failed differential-PPO₂ exchange-ratio measurement, and the
mannequin-first strategy: Campbell et al. (2026), ICES-2026-499, §I, §II and §IV — see
`lit/SOURCES.md`, `campbell2026`. Rebreathed-fraction definition and its caveats: `C13` and
`GLOSSARY.md` §2. Transport delay and the 0.629 / 0.270 s figures: `C17` and `V15`. Every arithmetic
result quoted above — the Nyquist fold, the band edges, the bin widths, the aliasing sweep — is
computed in `videos/V16-rebreathing-and-respiration.md`, which states which values are exact and
which depend on a synthetic trace.
