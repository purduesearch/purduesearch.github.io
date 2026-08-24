---
promptText: "Work the six tasks in the exercise below and submit your worked answers here, labelled by task number so a reader can follow them. Show your arithmetic rather than only your results. The point of this exercise is not the numbers - it is that the dosimeter in the app is a figure produced by a formula somebody wrote, and you cannot sanity-check a number you have never computed by hand. Four things carry more weight here than the arithmetic does. State your assumptions every time: which baseline your ppm-hours figure is computed against, what total pressure you converted with, what you took the sampling interval to be, and which activity each interval was attributed to. Say what your numbers MEAN and not only what they are - task 2 asks whether the subject's exposure actually changed or whether only the number changed, and that one sentence is worth more than the conversion above it. Answer both judgement questions in task 6 in full, because they are the reason the exercise exists and they are where a number stops being arithmetic and becomes a claim about a person. And treat the trace as what it is: the data in this file is synthetic, it was invented to be arithmetically clean, no session and no headset produced it, and nothing you compute from it may ever be quoted as an ARES result. Write at least 250 words. The answers are published at the bottom of the page on purpose, because a learner who has to go looking for them will not check their work - so this section is not gated and you may read them the moment you are done. Reading them first turns a fifteen-minute exercise into a two-minute one and teaches you nothing."
minWords: 250
rubric:
  - id: dose-method
    point: "ONE OF THE TWO POINTS THIS EXERCISE IS FOR, alongside pressure-reasoning - both outrank the arithmetic. Task 3. Computes the dose by a method a reader can see rather than producing a figure. Full credit needs four things visible: the excess over the 420 ppm baseline taken sample by sample rather than the raw ppm; the observation that nothing in this trace falls below baseline so the clamp to zero never fires; a trapezoid sum shown as working; and a sampling interval converted to HOURS, since ten minutes is one sixth of an hour and a sum left in minutes lands sixty times off. The answer is 1,880 ppm-hours and the tidiest route is first plus last over two, plus everything in between, all multiplied by one sixth - but twelve trapezoids summed one at a time is exactly as good and earns exactly as much. The half most answers skip is the baseline statement: integrated against zero instead of against 420 ppm the same trace gives 2,720 ppm-hours, both are defensible quantities, they are not the same quantity, ARES reports the first, and a ppm-hours figure quoted with no stated baseline is not comparable to anything. A correct figure with no working and no baseline named is partial credit at most, because the whole reason to compute this by hand is to be able to find an arithmetic slip - someone else's or your own - later."
    weight: 3
  - id: pressure-reasoning
    point: "Task 2, and the other half of what this exercise is for. The arithmetic is a total-pressure conversion first - 950 hPa is 712.6 mmHg, since 760 mmHg is 1013.25 hPa - and then 2,140 parts per million of that, which is about 1.52 to 1.53 mmHg, roughly 6.2 percent below the 1.63 mmHg sea-level figure. Accept either rounding without comment: the exercise body prints 1.53 and a careful recomputation gives 1.5249, and a learner who notices that discrepancy has done precisely the right thing and should be told so. The SENTENCE is what carries the weight. Full credit requires the answer to say that the subject's exposure genuinely changed, that this is not a units artefact, and to give the reason - the mole fraction is identical, 2,140 molecules out of a million are CO2 either way, but there are fewer molecules of everything, so fewer CO2 molecules reach the alveoli per breath, the partial pressure driving CO2 into blood is lower, and per C15 symptoms track PaCO2 rather than a ppm figure in a room. An answer that says only the number changed, or that treats the two figures as one exposure expressed two ways, has the physics backwards and is missed however clean the arithmetic above it is. Credit generously the closing observation that a ppm figure quoted without its ambient pressure is an incomplete statement about a person."
    weight: 3
  - id: bulk-vs-face
    point: "Task 6a, and it needs BOTH halves - the exercise asks why the statement is and is not reassuring, and the skill is holding the two at once. The setup: NASA's operational limit is 4 mmHg, about 5,300 ppm, and this session peaked at 1.63 mmHg, roughly 41 percent of it, so on that comparison it looks comfortable. Reassuring, and this half must be there: nothing in the trace is near an exposure NASA considers operationally unacceptable for a crew breathing it for months, and the whole session sits inside C15's mild tier. Not reassuring: the two figures are not the same kind of quantity. NASA's 4 mmHg is a BULK CABIN limit set on symptom data from cabin-wide monitors, and this is a CHIN POD - a measurement of air a few centimetres from a mouth, positioned deliberately to see exhaled breath. The premise of the whole project is that those two numbers come apart, and Dutta et al. model the face-level transient peak in microgravity at roughly twice bulk cabin levels, so setting a face-level reading beside a bulk limit and concluding fine is the exact comparison ARES exists to make impossible. Extra credit for the blunter version of the same argument: the app told this wearer they were in DANGER at 1:20, in a session whose peak is well under NASA's limit, and both statements come from real thresholds set for different purposes on different populations - a number is only reassuring relative to a stated question. An answer giving only the reassuring half, or only the sceptical half, is partial."
    weight: 3
  - id: confound
    point: "Task 6b. Gives two genuinely different physical explanations for the 800 ppm drop between 1:20 and 1:30 that are both consistent with this data, then names what would have had to be logged to tell them apart. The two: the subject stood up and moved, which drags fresh air past the face and re-establishes a strong human thermal body plume so the stagnant volume in front of the mouth is flushed and the chin pod stops seeing accumulated exhalate - a result about the SUBJECT; or the room ventilated, a door opened or an HVAC cycle started and the bulk concentration fell, with the activity change a coincidence or a consequence - a result about the ROOM. Two restatements of one explanation are not two explanations. On what would separate them, the top pod is the answer worth the most: it is the ambient reference, so if top and chin fall together the room changed, and if chin falls while top holds the subject changed - which is the reason M2 puts a pod up there at all. Also creditable: a room-reference node away from the subject, doing the same job with none of the plume contamination the top pod itself suffers from; and a timestamped event marker for door opened or HVAC on, free to log and impossible to reconstruct afterwards. Full credit needs the general lesson in some form - a single-channel trace supports far fewer conclusions than it appears to, so decide what you will need to distinguish BEFORE the session, because afterwards you are stuck with whatever you wrote down."
    weight: 3
  - id: attribution
    point: "Task 4. Splits the dose by activity using the rule the app actually implements - each interval is attributed to the activity recorded at its START - and lands walking at about 262 ppm-hours from the two intervals that begin on a walking sample, 1:30 to 1:40 contributing 133.3 and 1:40 to 1:50 contributing 128.3, with still taking the remaining 1,618 ppm-hours. Full credit requires the trap to be NAMED and not merely avoided: the 1:20 to 1:30 interval spans the largest single change in the whole trace and all 218 ppm-hours of it land under still, because its left-hand sample is still. That is a real property of the app's dosimeter rather than a mistake in it, and the consequence is the part worth writing down - a short sharp activity change gets its dose credited to the previous activity, and at ten-minute sampling that is a lot of dose in the wrong bucket, so per-activity dose that has to be accurate needs faster sampling. An answer that assigns the intervals correctly but never notices what the rule does to the 1:20 interval is partial credit; an answer that attributes 1:20 to 1:30 to walking has read the rule backwards."
    weight: 2
  - id: thresholds
    point: "Task 5. Places the session against C15's tiers and the app's own numbers, and gets the hysteresis right. Peak 2,140 ppm is the mild tier, 1,000 to 2,500 ppm. The time-weighted mean follows from the dose: 1,880 ppm-hours over 2 hours is a mean EXCESS of 940 ppm, so a mean concentration of 1,360 ppm, about 1.03 mmHg - also mild. The dose card reads CAUTION, because 1,880 ppm-hours sits in the 500 to 2,000 ppm-hours band, roughly 6 percent below the danger threshold, and a session twenty minutes longer at this level would have crossed it. Warn notifications: ONE. The threshold is 1,000 ppm with 100 ppm of hysteresis, so it fires once on the upward crossing at 0:30 with 1,180 ppm and never clears, because the reading never returns below 900 ppm and its lowest value afterwards is 1,120 ppm at 1:40. Danger notifications: ONE, firing at 1:20 with 2,140 ppm and clearing at 1:30 with 1,320 ppm, which is below 2,000 minus 100. Two warns is the expected wrong answer and it comes from reading the 1:30 dip as a clear - award partial rather than missed if the rest of the field is right, but say in the feedback that the alert clears 100 ppm BELOW the threshold, at 900 ppm, and the dip only reached 1,120."
    weight: 2
  - id: arithmetic
    point: "Task 1, and the lowest weight in this rubric on purpose - a right number from a method nobody can see is not the skill this exercise teaches. Converts the three sea-level readings by multiplying ppm by 7.60 x 10 to the minus 4, to two decimals as asked: 520 ppm is 0.40 mmHg, 2,140 ppm is 1.63 mmHg, and 1,400 ppm is 1.06 mmHg. Credit the field if the three figures are right and the conversion used is stated, and do not withhold credit for a difference in the last decimal place. Award missed only for a conversion wrong in kind - dividing where it should multiply, dropping a factor of a thousand, or converting with no total pressure at all, which is the error C15 and GLOSSARY.md section 5 both exist to prevent."
    weight: 1
referenceAnswer: |
  DRAFT - pending ARES team review. Drawn from the exercise body, C15 and GLOSSARY.md section 5. It
  encodes claims about ARES and about the app's current behaviour that the team should check before
  this course is published.

  THE DATA IS SYNTHETIC AND SO IS EVERY NUMBER BELOW. The trace in the exercise was invented to be
  arithmetically clean and physiologically plausible. No session, no subject and no headset produced
  it, and nothing computed from it may ever be quoted as an ARES result. A learner who says so has
  understood something. A learner who reports 1,880 ppm-hours as a measured figure has not.

  WHAT A GOOD ANSWER CONTAINS

  Six tasks, answered in order and labelled. The arithmetic is the smallest part of it. What
  separates a good answer from a merely complete one is that the METHOD and the ASSUMPTIONS are
  visible: which baseline the dose is computed against, what total pressure the conversion used, what
  the sampling interval was taken to be, and which activity each interval was attributed to. A right
  number produced by a method nobody can see is not the skill, because the reason to compute a
  dosimeter figure by hand is to be able to check somebody else's later.

  The two judgement questions in task 6 carry as much weight between them as tasks 1 to 5 do. They
  are where a learner either does or does not notice that a number is only meaningful next to a
  stated question, and that a single-channel trace supports far fewer conclusions than it appears to.

  THE WORKED ANSWERS

  Copied from the exercise body, which publishes them on purpose - a learner who has to go looking
  for the answers will not check their work. They are ground truth for grading, not a template a
  learner has to match: a different but correct route to the same figure is worth the same credit.

  1 - PARTIAL PRESSURES AT SEA LEVEL

  Multiply ppm by 7.60 x 10^-4.

      520 ppm    520 x 7.60e-4    = 0.40 mmHg
      2,140 ppm  2,140 x 7.60e-4  = 1.63 mmHg
      1,400 ppm  1,400 x 7.60e-4  = 1.06 mmHg

  2 - THE PEAK AT 950 hPa

  First convert the total pressure: 950 hPa x (760 mmHg / 1013.25 hPa) = 712.6 mmHg.

      p_CO2 = 2,140 x 10^-6 x 712.6 = 1.53 mmHg

  That is 6.2 percent lower than the 1.63 mmHg at sea level. (Recomputed exactly, 2,140 x 10^-6 x
  712.559 is 1.5249, so 1.52 and 1.53 are both right to the precision anybody should be quoting here.
  The body prints 1.53. Accept either, and credit a learner who spots the difference.)

  The sentence that matters: THE EXPOSURE GENUINELY CHANGED. This is not a units artefact. The mole
  fraction is identical - 2,140 out of a million molecules are CO2 either way - but there are fewer
  molecules of everything, so fewer CO2 molecules arrive at the alveoli per breath and the partial
  pressure driving CO2 into blood is lower. PaCO2 is what produces symptoms, and PaCO2 tracks partial
  pressure. A ppm figure quoted without its ambient pressure is an incomplete statement about a
  person.

  3 - THE DOSE

  Excess over the 420 ppm baseline, sample by sample:

      100, 340, 560, 760, 920, 1100, 1340, 1560, 1720, 900, 700, 840, 980   (ppm)

  Nothing is below baseline, so nothing clamps. With twelve intervals of dt = 10 min = 1/6 h, the
  trapezoid sum is easiest as (first + last)/2 plus everything in between:

      (100 + 980)/2                                       =    540
      340+560+760+920+1100+1340+1560+1720+900+700+840     = 10,740
                                                            -------
                                                             11,280
      dose = 11,280 x 1/6 h                               =  1,880 ppm-h

  1,880 PPM-HOURS.

  Worth noticing what that is not. Computed against zero instead of against the 420 ppm baseline, the
  same session gives 1,880 + (420 x 2 h) = 2,720 ppm-h. Both are defensible quantities; they are not
  the same quantity, and ARES reports the first. A ppm-hours figure with no stated baseline is not
  comparable to anything.

  4 - BY ACTIVITY

  Two intervals start on a walking sample - 1:30 to 1:40 and 1:40 to 1:50:

      1:30 -> 1:40   (900 + 700)/2 x 1/6  = 133.3
      1:40 -> 1:50   (700 + 840)/2 x 1/6  = 128.3
                                            -----
      walking                               261.7 ppm-h
      still      1,880 - 261.7            = 1,618.3 ppm-h

  STILL about 1,618 ppm-h, WALKING about 262 ppm-h.

  The attribution rule is the trap. The 1:20 to 1:30 interval spans the biggest single change in the
  whole trace, and all 218 ppm-h of it lands under still, because its left-hand sample is still. That
  is a real property of the app's dosimeter, not a mistake in it - but it means a short, sharp
  activity change gets its dose credited to the previous activity, and at ten-minute sampling that is
  a lot of dose in the wrong bucket. If you ever need per-activity dose to be accurate, sample faster.

  5 - PLACING THE SESSION

  Peak, 2,140 ppm - mild tier (1,000 to 2,500 ppm).

  Time-weighted mean - the mean excess is 1,880 ppm-h / 2 h = 940 ppm, so the mean concentration is
  940 + 420 = 1,360 ppm, which is 1.03 mmHg. Also the mild tier.

  Dose card - 1,880 ppm-h is in the CAUTION band (500 to 2,000 ppm-h), about 6 percent below the
  danger threshold. A session twenty minutes longer at this level would have crossed it.

  Warn notifications: ONE. The threshold is 1,000 ppm with 100 ppm of hysteresis, so the alert fires
  once, crossing upward at 0:30 (1,180 ppm), and never clears - the reading never returns below
  900 ppm. The lowest it reaches after that is 1,120 ppm at 1:40.

  Danger notifications: ONE. Fires at 1:20 (2,140 ppm), and clears at 1:30 (1,320 ppm, below
  2,000 - 100).

  If a learner answered two warns because the reading dipped at 1:30, the hysteresis is the thing to
  re-read: it clears 100 ppm BELOW the threshold, at 900 ppm, and the dip only reached 1,120.

  6a - "WELL UNDER NASA'S LIMIT"

  NASA's operational limit is 4 mmHg, or about 5,300 ppm. This session peaked at 1.63 mmHg - roughly
  41 percent of it. On that comparison the session looks comfortable.

  WHY IT IS REASSURING: nothing here is close to an exposure NASA considers operationally
  unacceptable for a crew breathing it for months, and the whole session sits inside the mild tier.

  WHY IT IS NOT: you are comparing quantities that are not the same quantity. NASA's 4 mmHg is a BULK
  CABIN limit, set on symptom data from cabin-wide monitors. This is a CHIN POD - a measurement of
  the air a few centimetres from a mouth, deliberately positioned to see exhaled breath. The whole
  premise of this project is that those two numbers come apart, and Dutta et al. model the face-level
  transient peak in microgravity as roughly twice bulk cabin levels. Putting a face-level reading
  next to a bulk limit and concluding "fine" is exactly the comparison ARES exists to make
  impossible.

  There is a second, blunter reason. The app told the wearer they were in DANGER at 1:20, in a
  session whose peak is well under NASA's limit. Both statements come from real thresholds and they
  point opposite ways, because they were set for different purposes on different populations. A
  number is only reassuring relative to a stated question.

  6b - THE DROP AT 1:30

  Two explanations, both consistent with this data:

  1. THE SUBJECT STOOD UP AND MOVED. The activity column says walking. Walking drags fresh air past
     the face and re-establishes a strong human thermal body plume, so the stagnant volume in front
     of the mouth is flushed and the chin pod stops seeing accumulated exhalate. On this reading the
     drop is about the SUBJECT.

  2. THE ROOM VENTILATED. Somebody opened the door, or an HVAC cycle started, and the room's bulk
     concentration fell. The subject stood up because the door opened. On this reading the drop is
     about the ROOM, and the activity change is a coincidence - or a consequence.

  Nothing in a single chin trace can separate those, and the difference matters: the first is a
  physiological result about rebreathing, the second is an artefact of the environment.

  What you would need logged:

  THE TOP POD. It is the ambient reference. If top and chin fall together, the room changed; if chin
  falls and top holds, the subject changed. This is the single most useful line in the answer, and it
  is the reason M2 puts a pod up there at all.

  A ROOM-REFERENCE NODE away from the subject, for the same reason with none of the plume
  contamination the top pod suffers from.

  AN EVENT MARKER - door opened, HVAC on - timestamped into the session. Free to log, impossible to
  reconstruct afterwards.

  The general lesson, and the one M11 makes an entire module out of: A SINGLE-CHANNEL TRACE SUPPORTS
  FAR FEWER CONCLUSIONS THAN IT APPEARS TO. Decide what you will need to distinguish before the
  session, because after it you are stuck with what you wrote down.

  HOW TO GRADE THIS SECTION

  Weight the method and the stated assumptions above the arithmetic, every time. This exercise exists
  because a metric nobody has computed by hand is a metric nobody can sanity-check, and the check is
  a method rather than a number.

  Be generous about route and strict about substance. Twelve trapezoids summed one at a time is the
  same answer as the tidy form. A learner who integrates against a different baseline and SAYS SO has
  answered better than one who lands on 1,880 with nothing stated. A learner who reaches 1.52 rather
  than 1.53 mmHg has rounded more carefully than the exercise body did.

  Two answers should not be credited however well the rest is written: treating the altitude result
  as a units artefact rather than a real change in exposure, and setting the chin-pod peak beside
  NASA's bulk cabin limit with no acknowledgement that they are different quantities. Those two are
  the failures the exercise was built to catch.

  This section is UNGATED and that is deliberate. The worked answers are two screens below the
  composer in the learner-facing body, so a score gate here would be a control that controls nothing.
  Feedback is the whole product; grade for what a lab-mate would say reading the draft.
---

# E01 — Exposure from a session

> ASSIGNMENT section · ARES 101 · M4 · ~2 min, plus about 15 minutes of arithmetic
> This body is seeded into `contentJson` as the learner-facing context; the frontmatter above is the
> section's `assignmentConfig`, and its `rubric` and `referenceAnswer` are author-only — they are
> never served to a learner. Depends on `C15` (the tiers, the app's thresholds and the
> dosimeter definition) and `GLOSSARY.md` §5 (the conversion).
> **The data in this file is synthetic.** It was written to be arithmetically clean and
> physiologically plausible; it is not a real ARES session and must never be quoted as one.
> The answers sit at the bottom under a rule. TipTap has no collapsible-section node, so they cannot
> literally be folded away — the rule and the warning are the separation. Do not move them to a
> second file; a learner who has to go looking will not check their work.
> **This section carries no `passThreshold`, on purpose.** The answers are published below the
> composer by design, so a score gate here would be a control that controls nothing — see the design
> doc §8.1. The `referenceAnswer` above is a *copy* of the `## Answers` section, not a move: edit one
> and you must edit the other.

---

## What you are doing

Reading a CO₂ trace and turning it into the three things anyone will actually ask you about a
session: **what partial pressure was this person exposed to, how much total exposure did they
accumulate, and does any of it matter.**

You need a calculator and about fifteen minutes. No headset, no app, no code.

The point is not the arithmetic. The point is that the dosimeter in the app is a number produced by a
formula somebody wrote, and you cannot sanity-check a number you have never computed by hand. When a
session comes back reading 400 ppm·hours and you think it should be 4,000, this is the skill that
tells you which one to trust.

## The data — synthetic, and here is what it represents

**These readings are made up.** They are not from a real session, a real subject, or a real headset.
They were written so that the numbers come out clean, and they are shaped like a real trace rather
than copied from one.

The scenario: one subject, seated at a desk in a small closed room, wearing the headset. This is the
**chin pod** — the pod that sees exhaled breath, so these readings run above room ambient by design.
Samples every ten minutes for two hours. The `Activity` column is what the app's activity classifier
would have recorded.

| Time | Chin CO₂ (ppm) | Activity |
|---|---|---|
| 0:00 | 520 | still |
| 0:10 | 760 | still |
| 0:20 | 980 | still |
| 0:30 | 1,180 | still |
| 0:40 | 1,340 | still |
| 0:50 | 1,520 | still |
| 1:00 | 1,760 | still |
| 1:10 | 1,980 | still |
| 1:20 | 2,140 | still |
| 1:30 | 1,320 | walking |
| 1:40 | 1,120 | walking |
| 1:50 | 1,260 | still |
| 2:00 | 1,400 | still |

Take the session as being at sea level unless a question says otherwise.

## What you need to know, in one place

**The conversion** (`GLOSSARY.md` §5), at one standard atmosphere:

```
p_CO₂ [mmHg] = (C [ppm] / 1,000,000) × 760
```

**The dosimeter**, exactly as `app/lib/science/dosimeter.dart` computes it: the trapezoidal integral
of the **excess** over a 420 ppm baseline, in ppm·hours.

```
dose = Σ  ( (Cᵢ − 420) + (Cᵢ₊₁ − 420) ) / 2  ×  Δt        Δt in hours
```

with any sample below 420 ppm contributing zero rather than a negative. Each interval is attributed
to the activity recorded at its **start** — so the 1:20 → 1:30 interval counts as *still*, not as
*walking*.

**The tiers** (`C15`): mild 1,000–2,500 ppm · moderate 2,500–5,000 · acute above 5,000.

**The app's numbers** (`C15`, current state): warn at 1,000 ppm, danger at 2,000 ppm, colour bands at
800 and 1,400 ppm, dose card OK below 500 ppm·h and caution to 2,000 ppm·h.

## The tasks

**1 · Convert three readings to partial pressure.** The first sample (520 ppm), the peak
(2,140 ppm), and the last sample (1,400 ppm). Give each in mmHg to two decimals.

**2 · Redo the peak at altitude.** The same session, run at a field site where ambient pressure is
950 hPa. What partial pressure does the 2,140 ppm peak correspond to now? By what percentage does it
differ from your sea-level answer, and — this is the part to write a sentence about — has the
subject's exposure actually changed, or has only the number changed?

**3 · Compute the dose.** Total exposure for the session in ppm·hours, using the formula above. Show
the trapezoid sum rather than just the answer; you want to be able to find your own arithmetic slip.

**4 · Split it by activity.** How much of the dose accumulated while still, and how much while
walking? Watch the attribution rule.

**5 · Place the session.** Which exposure tier does the peak fall in? Which tier does the
time-weighted mean fall in? What status would the app's dose card show? How many times would the
wearer have been sent a warn notification, and how many times a danger notification?

**6 · Two judgement questions.** No arithmetic; a few sentences each.

  **(a)** NASA's operational cabin limit is 4 mmHg. Compare it to this session's peak. Then explain
  why "well under NASA's limit" is *and is not* a reassuring statement about this particular trace.

  **(b)** The reading drops by more than 800 ppm between 1:20 and 1:30. Give two different physical
  explanations that are both consistent with this data, and say what you would need to have logged in
  order to tell them apart.

---

## Answers

**Stop here if you have not done the work.** Everything below is worked out. Reading it first turns a
fifteen-minute exercise into a two-minute one and teaches you nothing.

### 1 · Partial pressures at sea level

Multiply ppm by 7.60 × 10⁻⁴.

| Reading | Working | p_CO₂ |
|---|---|---|
| 520 ppm | 520 × 7.60 × 10⁻⁴ | **0.40 mmHg** |
| 2,140 ppm | 2,140 × 7.60 × 10⁻⁴ | **1.63 mmHg** |
| 1,400 ppm | 1,400 × 7.60 × 10⁻⁴ | **1.06 mmHg** |

### 2 · The peak at 950 hPa

First convert the total pressure: 950 hPa × (760 mmHg / 1013.25 hPa) = **712.6 mmHg**.

```
p_CO₂ = 2,140 × 10⁻⁶ × 712.6 = 1.53 mmHg
```

That is **6.2 % lower** than the 1.63 mmHg at sea level.

The sentence that matters: **the exposure genuinely changed.** This is not a units artefact. The mole
fraction is identical — 2,140 out of a million molecules are CO₂ either way — but there are fewer
molecules of everything, so fewer CO₂ molecules arrive at the alveoli per breath and the partial
pressure driving CO₂ into blood is lower. PaCO₂ is what produces symptoms, and PaCO₂ tracks partial
pressure. A ppm figure quoted without its ambient pressure is an incomplete statement about a person.

### 3 · The dose

Excess over the 420 ppm baseline, sample by sample:

```
100, 340, 560, 760, 920, 1100, 1340, 1560, 1720, 900, 700, 840, 980   (ppm)
```

Nothing is below baseline, so nothing clamps. With twelve intervals of Δt = 10 min = 1/6 h, the
trapezoid sum is easiest as *(first + last)/2 + everything in between*:

```
(100 + 980)/2                                              =    540
340+560+760+920+1100+1340+1560+1720+900+700+840            = 10,740
                                                             -------
                                                              11,280
dose = 11,280 × 1/6 h                                      =  1,880 ppm·h
```

**1,880 ppm·hours.**

Worth noticing what that is not. Computed against zero instead of against the 420 ppm baseline, the
same session gives 1,880 + (420 × 2 h) = **2,720 ppm·h**. Both are defensible quantities; they are
not the same quantity, and ARES reports the first. A ppm·hours figure with no stated baseline is not
comparable to anything.

### 4 · By activity

Two intervals start on a *walking* sample — 1:30 → 1:40 and 1:40 → 1:50:

```
1:30 → 1:40   (900 + 700)/2 × 1/6  = 133.3
1:40 → 1:50   (700 + 840)/2 × 1/6  = 128.3
                                     -----
walking                              261.7 ppm·h
still      1,880 − 261.7           = 1,618.3 ppm·h
```

**Still ≈ 1,618 ppm·h · walking ≈ 262 ppm·h.**

The attribution rule is the trap. The 1:20 → 1:30 interval spans the biggest single change in the
whole trace, and all 218 ppm·h of it lands under *still*, because its left-hand sample is still. That
is a real property of the app's dosimeter, not a mistake in it — but it means a short, sharp activity
change gets its dose credited to the previous activity, and at ten-minute sampling that is a lot of
dose in the wrong bucket. If you ever need per-activity dose to be accurate, sample faster.

### 5 · Placing the session

- **Peak, 2,140 ppm** — mild tier (1,000–2,500 ppm).
- **Time-weighted mean** — the mean excess is 1,880 ppm·h ÷ 2 h = 940 ppm, so the mean concentration
  is 940 + 420 = **1,360 ppm**, which is 1.03 mmHg. Also the mild tier.
- **Dose card** — 1,880 ppm·h is in the **caution** band (500 to 2,000 ppm·h), and about 6 % below
  the danger threshold. A session twenty minutes longer at this level would have crossed it.
- **Warn notifications: one.** The threshold is 1,000 ppm with 100 ppm of hysteresis, so the alert
  fires once, crossing upward at 0:30 (1,180 ppm), and never clears — the reading never returns below
  900 ppm. The lowest it reaches after that is 1,120 ppm at 1:40.
- **Danger notifications: one.** Fires at 1:20 (2,140 ppm), and clears at 1:30 (1,320 ppm, below
  2,000 − 100).

If you answered "two warns" because the reading dipped at 1:30, re-read the hysteresis: it clears
100 ppm *below* the threshold, at 900 ppm, and the dip only reached 1,120.

### 6a · "Well under NASA's limit"

NASA's operational limit is 4 mmHg, or about 5,300 ppm. This session peaked at 1.63 mmHg — roughly
41 % of it. On that comparison the session looks comfortable.

**Why it is reassuring:** nothing here is close to an exposure NASA considers operationally
unacceptable for a crew breathing it for months, and the whole session sits inside the mild tier.

**Why it is not:** you are comparing quantities that are not the same quantity. NASA's 4 mmHg is a
**bulk cabin** limit, set on symptom data from cabin-wide monitors. This is a **chin pod** — a
measurement of the air a few centimetres from a mouth, deliberately positioned to see exhaled breath.
The whole premise of this project is that those two numbers come apart, and Dutta et al. model the
face-level transient peak in microgravity as roughly twice bulk cabin levels. Putting a face-level
reading next to a bulk limit and concluding "fine" is exactly the comparison ARES exists to make
impossible.

There is a second, blunter reason. The app told the wearer they were in *danger* at 1:20, in a
session whose peak is well under NASA's limit. Both statements come from real thresholds and they
point opposite ways, because they were set for different purposes on different populations. A number
is only reassuring relative to a stated question.

### 6b · The drop at 1:30

Two explanations, both consistent with this data:

1. **The subject stood up and moved.** The activity column says walking. Walking drags fresh air past
   the face and re-establishes a strong human thermal body plume, so the stagnant volume in front of
   the mouth is flushed and the chin pod stops seeing accumulated exhalate. On this reading the drop
   is about the *subject*.
2. **The room ventilated.** Somebody opened the door, or an HVAC cycle started, and the room's bulk
   concentration fell. The subject stood up because the door opened. On this reading the drop is
   about the *room*, and the activity change is a coincidence — or a consequence.

Nothing in a single chin trace can separate those, and the difference matters: the first is a
physiological result about rebreathing, the second is an artefact of the environment.

What you would need logged:

- **The top pod.** It is the ambient reference. If top and chin fall together, the room changed; if
  chin falls and top holds, the subject changed. This is the single most useful line in the answer,
  and it is the reason M2 puts a pod up there at all.
- **A room-reference node** away from the subject, for the same reason with none of the plume
  contamination the top pod suffers from.
- **An event marker** — door opened, HVAC on — timestamped into the session. Free to log, impossible
  to reconstruct afterwards.

The general lesson, and it is the one M11 will make an entire module out of: **a single-channel trace
supports far fewer conclusions than it appears to.** Decide what you will need to distinguish before
the session, because after it you are stuck with what you wrote down.
