---
promptText: "Run the bench test described below on three SprintIR-6S-20 percent sensors and submit the write-up. What you are producing is deliverable subtasks 2.3.7 and 2.5.2 as a document somebody else could audit: your acceptance criterion, the state you put the sensors in, the reference you used and its stated uncertainty, one table of results, the three pairwise differences, and a pass or fail against the criterion you wrote first. Write the acceptance criterion BEFORE you measure anything, put a number in it, and put it at the top of what you submit - it is ninety seconds of work and it is the only thing standing between you and deciding after the fact that whatever you happened to measure was acceptable. Record the setup in enough detail that a reader could tell whether a session had followed it: the multiplier each sensor reported when you sent the full stop command, the boot sequence you sent and in what order, the filter setting, how long you warmed up and in what gas, how many readings you took per sensor and over what interval, and the ambient pressure and temperature at the time. Then do the part people skip - compare the sensors against EACH OTHER and not only against the reference, and report chin minus top, because that is the rebreathing measurement taken in gas with no rebreathing in it. Finish by applying your own criterion and recording the verdict, even if the verdict is inconvenient. If the sensors are not available to you yet, submit the same document with the measured columns empty and your criterion, procedure and expected verdicts filled in; the procedure and the criterion are what this section grades, and they are what has to exist before the sensors do. Write at least 250 words. The worked example at the bottom of the page is invented data, published so you can see the shape of the answer - this section is not gated, but read it after you have written yours rather than before, and never quote its numbers as a real bench result."
minWords: 250
rubric:
  - id: criterion
    point: "THE DISCIPLINE THIS EXERCISE IS BUILT ON - weight it accordingly. An acceptance criterion that exists before the data, is stated with numbers, and covers BOTH questions rather than one. The exercise's own example is that each sensor shall read within plus or minus 100 ppm of the reference, and that no two sensors shall differ from each other by more than 50 ppm. Any figures are creditable provided both halves are there and provided the answer makes clear the criterion was written first. The second half is the one that matters and the one most answers omit: a criterion bounding only each sensor's error against the reference would pass the worked example outright, because all three sensors are individually inside plus or minus 100 ppm while forehead and chin differ by 131 ppm - every sensor acceptable, the instrument not. Full credit also requires the criterion to be APPLIED at the end, with a pass or fail recorded against each half. Award missed for a criterion written after the numbers, for one containing no figure, or for anything of the form the readings should look reasonable, which is not a criterion but permission to decide later. The learner's criterion does not have to be the right one; it has to exist before the data does. M11 makes an entire module out of the same discipline under the name the analysis plan is written before the data exists, and this is the smallest possible version of it."
    weight: 3
  - id: pairwise
    point: "The comparison the project runs on, and the reason this is a three-sensor exercise rather than an accuracy check. Reports all three pairwise differences and singles out chin minus top. Full credit needs the INTERPRETATION and not just the subtraction: in gas that is uniform by construction, whatever chin minus top reads is a fixed offset sitting underneath every rebreathed-fraction figure these three sensors will ever produce, it is not noise, and it will not average away - repeating a systematic error just gives you a very precise wrong answer. In the worked example the differences are forehead minus top at 69 ppm, top minus chin at 62 ppm, forehead minus chin at 131 ppm, and chin minus top at minus 62 ppm. The strongest answers cost it out against the rebreathed fraction using M2's pair of chin 1,850 ppm, top 700 ppm and exhaled 40,000 ppm: the true figure is 1,150 over 39,300, or 2.93 percent, the biased one is 1,088 over 39,300, or 2.77 percent, so f_rb comes out about 5.4 percent low every time - against under one percent relative from quantisation in V14. Calibration error is the dominant term and it is the one you can actually do something about, which is M10's whole argument derived from three rows of a table. An answer that computes each sensor's error against the reference and stops has answered the easier of the two questions the exercise names in its opening paragraph."
    weight: 3
  - id: procedure-auditable
    point: "Could a reader audit a session against what was written. The setup has to be RECORDED and not merely performed: 9600 8N1 over a USB-to-UART adapter at 3.3 V logic; K 0 sent FIRST at every power-up, before anything else, because GSS parts ship streaming and a streaming sensor talks over your terminal exactly as it talks over the headset's shared UART; then the full stop probe, then A 32, then at-sign zero to disable automatic baseline correction, then K 2 for polling - the same sequence the firmware runs at boot, so the bench numbers describe the sensor the headset actually uses. The filter setting must appear in the write-up: a result taken at a different filter is not comparable to one taken at A 32, and per the exercise that is the single most common way two people's numbers fail to agree. Also required for full credit - ten readings per sensor over about a minute rather than one, all three sensors exposed in one chamber simultaneously so a drifting reference cannot be mistaken for a sensor difference, and the ambient pressure and temperature recorded, since bench-testing at 950 hPa against sensors calibrated at 1013 lays a systematic 6 to 7 percent over every error before the sensors have done anything, and V14 part 3 carries the correction. Credit the safety rule too: gas is presented in a bag, a loose hood, or a small vented chamber, and a cylinder is never sealed to a sensor, because pressure changes the reading and enough of it damages the part. Extra credit, not required for full marks, for two observations - that subtask 2.3.7's instruction to verify I2C communication cannot be followed because there is no I2C on a SprintIR, it being UART only with no bus addressing of any kind, which is precisely why sensors 2 and 3 must share one port torn down and re-pinned before every access, and that the fix is to say so rather than quietly implement around it; and for running the T90 step change of subtask 2.5.5 at the terminal on a bare sensor and repeating it at A 4, since the two readings of A 32 differ by roughly fifteen times and nobody on this team has measured which is right."
    weight: 3
  - id: multiplier
    point: "Handles the full stop command and what comes back. Sending the full stop asks a sensor for its ppm multiplier, and it is the first thing to check because it tells you which part you were actually shipped: a 0 to 20 percent SprintIR answers 10, a 0 to 5 percent part answers 1, and a 0 to 100 percent part answers 100. Full credit requires the multiplier to be recorded for all three sensors AND the stop rule to be stated - if a sensor answers anything other than 10, stop, because you have a variant you did not order and every reading it produces will be wrong by that factor until somebody notices. That is also why the firmware probes rather than hardcodes: the same firmware then runs on any variant, and a mis-shipped part is caught at boot instead of quietly producing readings that are off by ten. Credit also for knowing what Z returns - raw counts, not ppm, so ppm is raw times multiplier and a reply of space Z 00200 from a 0 to 20 percent part is 2,000 ppm - and for the leading space every GSS response carries, which the firmware's parser skips explicitly and a parser written in a hurry does not. An answer that reports ppm figures without ever establishing the multiplier has skipped the most basic fact about the parts sitting on the bench."
    weight: 2
  - id: warmup
    point: "Handles the warm-up window, and knows whose behaviour it is. The 30 seconds is a FIRMWARE suppression derived from uptime - per C16 the GSS parts expose no ready bit, unlike the SenseAir parts ARES 1 used, so the firmware simply counts milliseconds and blanks every CO2 reading while the count is short. At a terminal nothing suppresses anything, so numbers appear immediately and some of them are nonsense. Full credit requires the write-up to record a wait, and for that wait to be long enough: 30 seconds for the part, then a further two minutes in the gas about to be measured, because with A 32 the filter has its own settling time on top of the part's start-up and the 30-second figure is those two added together rather than anything measured. Award missed for a procedure that starts recording at power-on, or that treats warmed up as a state the sensor reports rather than a wait the operator takes responsibility for. Credit an answer that notices the settling time is exactly the quantity subtask 2.5.5 asks somebody to measure, and that until it is measured both the 30 seconds and the two minutes are estimates."
    weight: 2
  - id: mean-and-sd
    point: "Ten readings, and the two different questions the mean and the standard deviation answer. Mean minus known is the sensor's BIAS, how wrong it is; the standard deviation is its NOISE, how repeatable it is; a sensor can be quiet and wrong or noisy and right on average, a calibration fixes only the first, and one reading cannot tell them apart. Full credit also requires the reference's own uncertainty to bound what is claimed from the result. Against the worked example's certified 2,000 ppm cylinder stated at plus or minus 2 percent, so plus or minus 40 ppm: the top sensor at minus 26 ppm is inside the reference's uncertainty and cannot be distinguished from a perfect one with this equipment, so correcting it would be calibrating against noise; the forehead at plus 43 ppm is just outside, suggestive rather than established, and wants a second cylinder or a second session before anyone acts on it; the chin at minus 88 ppm is more than twice the reference uncertainty and is real. Credit reading the noise column against the quantisation floor from V14, which is 10 over the square root of 12, or 2.9 ppm - all three example standard deviations sit well above it, so all three are dominated by real measurement noise rather than by the step size. And the chin's 28 ppm, two to three times the other two, is worth chasing BEFORE its bias, because a loose connector, a draught across the chamber, or a sensor sitting where the gas has not mixed will all produce it and none of them is fixed by an offset."
    weight: 2
  - id: single-point-limits
    point: "Knows what the reference actually used can and cannot establish, and protects the evidence. If outdoor air stood in for a certified gas, full credit needs the method - genuinely outside and away from buildings, vehicles, vents and people, standing downwind of the sensors, not talking near them since a breath is about a hundred times the concentration being used as the reference, and several minutes to equilibrate to outdoor temperature as well as outdoor gas, with the known value taken as roughly 420 ppm - plus at least two of its four costs. Those costs are: it is one reading and it is near zero, so it catches an OFFSET error and says nothing about SPAN, whether a sensor right at 420 ppm is also right at 5,000; a common-mode error is undetectable, since three sensors all reading 480 ppm in a pocket of air that really is 480 ppm look perfect and may all be sixty high; the uncertainty in the known value is tens of ppm, so no honest claim is better than about plus or minus 30 ppm on the reference itself and any sensor error smaller than that cannot be seen, meaning you can catch a badly wrong sensor but cannot certify a good one; and the global background is now a little above 420 ppm and rising two to three ppm a year, which says something about this reference's precision before you start. The fourth cost must appear for full credit even in a certified-gas session, because it is what deliverable 2.5.2 turns on: applying a software offset destroys the evidence. The firmware's co2 target operation computes each sensor's offset so that its displayed value becomes the number you typed, so doing that at 420 ppm on all three makes them agree at 420 ppm BY CONSTRUCTION, and anyone who tests the headset later and finds the pods agreeing in fresh air has learned nothing, because you made it true with a keystroke. Calibrating is fine and M10 has you do it; calibrating and then citing the resulting agreement as a validation result is not. Record the before values, always - the pre-calibration table is the measurement and the post-calibration table is the configuration."
    weight: 2
referenceAnswer: |
  DRAFT - pending ARES team review. Drawn from the exercise body, C16 and V14. It encodes claims
  about the SprintIR parts, the firmware's boot sequence and the deliverables document that the team
  should check before this course is published.

  THE PROCEDURE IS REAL AND THE NUMBERS ARE SYNTHETIC. The worked example below was invented to be
  arithmetically clean and to contain one sensor of each interesting kind. No bench session, no
  cylinder and no sensors produced it, and it must never be quoted as a bench result. What IS real is
  the procedure it illustrates: deliverable subtasks 2.3.7 and 2.5.2, written out as something a
  person can actually run.

  WHAT A GOOD SUBMISSION CONTAINS

  A document somebody else could audit a session against. Concretely, seven things:

  1. The acceptance criterion, with numbers, stated as having been written before the measurement,
     and covering BOTH the per-sensor error against the reference and the sensor-to-sensor agreement.
  2. The reference used and its stated uncertainty - a certified cylinder with a percentage, or
     outdoor air with an honest statement of what that costs.
  3. The state the sensors were put in: the boot sequence in order, the multiplier each one reported,
     the filter setting, and the warm-up and settling wait.
  4. One results table - sensor, multiplier, known, mean of ten, standard deviation, error in ppm,
     error as a percentage.
  5. The three pairwise differences, with chin minus top called out.
  6. Ambient pressure and temperature at the time.
  7. The verdict against the criterion from item 1, recorded even when it is inconvenient.

  The test to apply while grading is the one the assignment asks for: could a reader who was not
  there tell whether a session had followed this document. A write-up that reports numbers without
  the filter setting, the multiplier, the wait, or the reference's uncertainty fails that test no
  matter how tidy the arithmetic is, because none of its numbers can be compared to anybody else's.

  THE WORKED EXAMPLE

  Copied from the exercise body, which publishes it on purpose. It is ground truth for grading and
  not a template a learner has to match - a learner running real sensors will produce different
  numbers, and the verdicts are what should be compared, not the figures.

  THE SYNTHETIC DATA

  Reference: certified 2,000 ppm, stated uncertainty plus or minus 2 percent, so plus or minus
  40 ppm. Ten Z readings per sensor over 60 seconds, A 32, all three in one chamber, ambient
  1,012 hPa.

      Sensor    Multiplier  Known  Mean of 10   SD   Error   Error %
      Top          10       2,000    1,974      12    -26     -1.3 %
      Forehead     10       2,000    2,043       9    +43     +2.2 %
      Chin         10       2,000    1,912      28    -88     -4.4 %

  READING IT

  Your calibration is never better than your reference. The cylinder is plus or minus 40 ppm. So:

  TOP, minus 26 ppm. Inside the reference's own uncertainty. You cannot distinguish this sensor from
  a perfect one with this equipment. Do not correct it - you would be calibrating against noise.

  FOREHEAD, plus 43 ppm. Just outside. Suggestive, not established. Repeat it with a second cylinder
  or a second session before you act.

  CHIN, minus 88 ppm. More than twice the reference uncertainty. This one is real.

  That distinction is the whole reason the procedure says to record the reference's uncertainty.
  Without it, three numbers all look equally meaningful and you will spend an afternoon correcting a
  sensor that was fine.

  THE NOISE COLUMN

  Quantisation alone would give a standard deviation of 10 over the square root of 12, or 2.9 ppm, on
  a 10 ppm grid (V14). All three sensors are well above that, so all three are dominated by real
  measurement noise rather than by the step size - the quantisation is not what is limiting you here.

  The chin's 28 ppm stands out on its own, at two to three times the other two. Noise that high is
  worth chasing before you chase its bias: a loose connector, a draught across the chamber, or a
  sensor sitting where the gas has not mixed will all do it, and none of them is fixed by an offset.

  THE PAIRWISE DIFFERENCES - THE PART THAT MATTERS

      forehead - top    = 2,043 - 1,974 = +69 ppm
      top - chin        = 1,974 - 1,912 = +62 ppm
      forehead - chin   = 2,043 - 1,912 = +131 ppm

  And the one the project runs on:

      chin - top        = 1,912 - 1,974 = -62 ppm

  In gas that is uniform by construction, the rebreathing measurement reads minus 62 ppm. That is not
  noise and it will not average away. It is a fixed offset that will sit underneath every session
  these three sensors ever record.

  HOW MUCH DOES THAT COST

  Take M2's worked pair: chin 1,850 ppm, top 700 ppm, exhaled breath 40,000 ppm.

      true      f_rb = (1,850 - 700) / (40,000 - 700) = 1,150 / 39,300 = 2.93 %
      with the bias   = (1,150 - 62) / 39,300         = 1,088 / 39,300 = 2.77 %

  The rebreathed fraction comes out 5.4 percent low, every time, in a way no amount of repetition
  will reveal - because repeating a systematic error just gives you a very precise wrong answer.

  Now put that next to V14's quantisation result. Quantisation moved the same figure by under one
  percent, relative. This cross-sensor offset moves it by more than five. CALIBRATION ERROR IS THE
  DOMINANT TERM, AND IT IS THE ONE YOU CAN ACTUALLY DO SOMETHING ABOUT. That is M10's entire
  argument, derived from three rows of a table.

  AGAINST THE ACCEPTANCE CRITERION

  The example criterion was: within plus or minus 100 ppm of the reference, and no two sensors
  differing by more than 50 ppm.

  All three are within plus or minus 100 ppm of the reference. FIRST HALF: PASS.
  Forehead and chin differ by 131 ppm. Top and chin differ by 62 ppm. SECOND HALF: FAIL.

  Which is exactly the result the criterion was written to catch, and exactly the one you would have
  talked yourself out of noticing if you had written the criterion afterwards. Every sensor is
  individually acceptable. The instrument is not.

  WHAT YOU DO ABOUT IT

  Not in this exercise - this one is measurement only. The offsets go in with co2 offset or co2
  target, they persist in NVS, and M10 runs the real calibration and its five-state cycle.

  The one thing to carry out of here: you now have a BEFORE table. Whatever the headset reads after
  calibration means something only because this table exists.

  HOW TO GRADE THIS SECTION

  Grade the document, not the numbers. A learner with no cylinder, or no sensors at all, can write a
  submission that earns full marks on criterion, procedure-auditable, multiplier, warmup and
  single-point-limits, and that is the intended outcome - the procedure and the criterion are the
  deliverable and they have to exist before the hardware does. A learner with real sensors will
  produce figures that look nothing like the worked example's, and should be judged on whether the
  verdicts follow from their own numbers and their own reference uncertainty.

  Three failures are worth naming explicitly in feedback whenever they appear:

  An acceptance criterion that bounds only each sensor against the reference. It is the failure the
  worked example is built to expose, and it passes a headset whose rebreathing measurement is already
  wrong by 62 ppm.

  A write-up nobody could reproduce - no filter setting, no multiplier, no wait, no reference
  uncertainty, no ambient pressure. Every number in it is incomparable to every number anyone else
  will ever take.

  Calibrating and then citing the resulting agreement as evidence. Record the before values, always.
  The pre-calibration table is the measurement; the post-calibration table is the configuration.

  Be generous about the optional work. T90 and the A 4 comparison are extra credit rather than
  requirements, and so is spotting that there is no I2C on a SprintIR - but an answer that does
  either has done something the team has not done yet, and the feedback should say so.

  This section is UNGATED and that is deliberate. The worked example sits in the learner-facing body
  below the composer, so a score gate here would be a control that controls nothing. Feedback is the
  whole product.
---

# E02 — Bench-test a sensor

> ASSIGNMENT section · ARES 101 · M5 · ~2 min to read, 60–90 minutes at the bench
> This body is seeded into `contentJson` as the learner-facing context; the frontmatter above is the
> section's `assignmentConfig`, and its `rubric` and `referenceAnswer` are author-only — they are
> never served to a learner. Depends on `C16` (the GSS command table, the multiplier,
> the warm-up window) and `V14` (quantisation, the pressure correction).
> **This is a real procedure, and the numbers in the worked example are synthetic.** The procedure is
> deliverable subtasks 2.3.7 and 2.5.2 written out as something a person can actually run. The
> example table at the bottom is invented — it was written to be arithmetically clean and to contain
> one sensor of each interesting kind. It is not a real bench session and must never be quoted as one.
> The answers sit at the bottom under a rule. TipTap has no collapsible-section node, so they cannot
> literally be folded away — the rule and the warning are the separation.
> **This section carries no `passThreshold`, on purpose.** The worked example is published below the
> composer by design, so a score gate here would be a control that controls nothing — see the design
> doc §8.1. The `referenceAnswer` above is a *copy* of the worked example, not a move: edit one and
> you must edit the other.

---

## What you are doing

Taking three CO₂ sensors and finding out, with numbers, **whether each one is telling the truth and
whether they agree with each other.** Those are two different questions and this exercise is mostly
about the second one.

Here is why the second one matters more than it sounds. The headline ARES measurement is
`C_chin − C_top` — a **difference between two sensors**. A difference does not care whether both
sensors are ten percent high; it cares enormously whether one is high and the other is low. Two
sensors that are each within spec and wrong in opposite directions produce a rebreathing number that
is confidently, reproducibly, invisibly wrong.

By the end you will have a table you can hand to someone, and an opinion about whether the headset
should be believed.

## Before you touch anything: write down your acceptance criterion

**Decide what "pass" means before you measure.** Write it in your notebook, with a number, now.

Something like: *each sensor shall read within ±100 ppm of the reference, and no two sensors shall
differ from each other by more than 50 ppm.*

You will be tempted to skip this because it feels like paperwork. It is not paperwork — it is the
only thing standing between you and deciding after the fact that whatever you happened to measure was
acceptable. M11 makes an entire module out of this discipline under the name "the analysis plan is
written before the data exists". This is the smallest possible version of it, and it takes ninety
seconds.

Your criterion does not have to be right. It has to exist before the data does.

## What you need

- Three SprintIR-6S-20 % sensors. **Bare sensors on the bench, not fitted to the headset** — you want
  the sensor, not the sensor plus the tubing, and M6 explains why those are different experiments.
- A USB-to-UART adapter, 3.3 V logic, and a serial terminal. **9600 8N1.**
- A CO₂ reference. In order of preference:
  1. A certified reference gas cylinder with a stated concentration and a stated uncertainty.
  2. Outdoor ambient air. See the fallback section — it is usable and it costs you specific things.
- A way to present the gas without pressurising the sensor: a gas bag, a loose-fitting hood, or a
  small chamber with a vent. **Never seal a cylinder to a sensor.** Pressure changes the reading (see
  `C16`, and `V14` Part 3) and enough of it damages the part.
- A notebook. Not a spreadsheet you will start later.

## The procedure

### 1 · Identify each part

Power a sensor, open the terminal at 9600 8N1, and send `K 0` followed by `.`.

```
→  K 0
←  (the sensor acknowledges the mode change on one line)
→  .
←  " . 00010"
```

Note the **leading space** on that reply. Every GSS response has one, and the firmware's parser skips
it explicitly (`co2ParseValue()`); a parser you write in a hurry will not.

The reply to `.` is the **ppm multiplier**, and it is the first thing you check because it tells you
what you actually received. A 0–20 % part answers **10**. A 0–5 % part answers 1 and a 0–100 % part
answers 100. If a sensor answers anything other than 10, stop — you have a variant you did not order,
and every reading it produces will be wrong by that factor until somebody notices.

Record the multiplier for all three. This is also the reason the firmware probes rather than
hardcodes it (`C16`, current state).

Send `K 0` **first**, before anything else, every time. GSS sensors ship streaming, and a streaming
sensor will talk over your terminal exactly the way it talks over the headset's shared UART.

### 2 · Put all three in the same known state

Same sequence the firmware runs at boot, so your bench numbers describe the sensor the headset
actually uses:

```
K 0          command mode — stop streaming
.            read the multiplier   (step 1)
A 32         digital filter, GSS general-purpose setting
@ 0          automatic baseline correction OFF
K 2          polling mode
```

Write down that you did this. A bench result taken at a different filter setting is not comparable to
one taken at `A 32`, and this is the single most common way two people's numbers fail to agree.

### 3 · Warm up, then wait longer than you think

The firmware suppresses readings for **30 seconds** after power-on. At the terminal nothing suppresses
anything, so you will see numbers immediately and some of them will be nonsense.

Wait 30 seconds for the part, then a further two minutes in the gas you are about to measure before
you record anything. With `A 32` the filter has its own settling time, and you are about to find out
in step 6 how long that actually is.

### 4 · Expose to the reference

Present the reference gas to all three sensors — ideally simultaneously in one chamber, so a drifting
reference cannot be mistaken for a sensor difference.

Then **take ten readings per sensor over about a minute**, by sending `Z` repeatedly:

```
→  Z
←  " Z 00200"        raw 200 × multiplier 10 = 2,000 ppm
```

Ten, not one. One reading gives you a number. Ten give you a **mean and a standard deviation**, and
those answer two separate questions:

- the **mean minus the known value** is the sensor's *bias* — how wrong it is,
- the **standard deviation** is its *noise* — how repeatable it is.

A sensor can be quiet and wrong, or noisy and right on average, and a calibration only fixes the
first. One reading cannot tell them apart.

### 5 · Do the arithmetic

For each sensor:

```
error      = mean − known
error %    = error / known × 100
```

Then **compare the sensors against each other**, which is the part people skip:

```
forehead − top,   top − chin,   forehead − chin
```

And then the one that matters:

```
chin − top      ← this is the rebreathing measurement, with no rebreathing happening
```

Whatever that number is, it is the offset sitting under every rebreathed-fraction figure the headset
will ever produce, before anything real is measured.

### 6 · Optional but high value: measure T90

This is deliverable subtask 2.5.5 and `V14` argues it is the best twenty minutes in the module,
because the answer is genuinely unknown to this team and the two plausible answers differ by about
fifteen times.

Method: with a sensor sitting in ambient, poll `Z` as fast as the terminal will go — at 9600 baud a
`Z` round trip is about 14 ms of wire time, so 10–20 Hz is comfortable — then introduce a **step**
change in gas at the sensor's inlet and keep logging until the reading is flat. A single exhale
directed at the inlet is a perfectly good step: breath is roughly 40,000 ppm against an ambient of
about 400.

Read off the time from the step to **90 % of the final value**. That is T90.

Three warnings:

- **Do it at the terminal, not through the headset.** The firmware's BLE stream runs at about 1 Hz and
  its CSV at 0.2 Hz. If the true T90 is around 1.6 seconds, neither of those can see it, and you will
  measure your own logging rate.
- **Do it on a bare sensor with gas applied at its inlet.** With tubing fitted you measure transport
  delay *plus* T90, which is a different quantity — `GLOSSARY.md` §2.
- **Then repeat the whole thing with `A 4` instead of `A 32`.** The difference between the two runs is
  the digital filter's contribution, isolated. That single comparison settles what `A 32` means, which
  is the open question `V14` leaves standing.

### 7 · Write it down properly

One table, and it goes back to the team:

| Sensor | Multiplier | Known (ppm) | Mean of 10 | SD | Error (ppm) | Error (%) |
|---|---|---|---|---|---|---|

Plus the three pairwise differences, the filter setting, the ambient pressure and temperature at the
time, and your acceptance criterion with a pass or fail against it.

Ambient pressure is on that list for a reason. If you bench-test at 950 hPa and the sensors were
calibrated at 1013, every one of your errors carries a systematic 6–7 % on top of whatever the sensors
are actually doing. `V14` Part 3 has the correction.

---

## When there is no reference gas

There often is not. The usable substitute is **outdoor air**, and it is worth doing — but it is a
weaker measurement in specific ways, and knowing which ways is most of the point of this section.

**The method.** Take the sensors genuinely outside, well away from buildings, vehicles, vents and
people. Set them down, stand **downwind of them**, and do not talk near them — a breath is about a
hundred times the concentration you are trying to use as a reference. Wait several minutes for them
to equilibrate to outdoor temperature as well as outdoor gas. Then take your ten readings as before.

Treat the known value as roughly **420 ppm**, which is what the app's dosimeter uses as its baseline.
Note that the real global background is now a little above that and rising by two to three parts per
million a year, which tells you something about the precision of this reference before you even start.

**What the substitution costs you, in order of how much it should worry you:**

1. **It is one point, and it is near zero.** A single-point check catches an **offset** error. It says
   nothing at all about **span** — whether a sensor that is right at 420 ppm is also right at 5,000.
   Those are independent failure modes and M10 separates them properly.
2. **You cannot detect a common-mode error.** If you are standing in a pocket of air that is genuinely
   480 ppm because of a car that idled past, and all three sensors read 480, you will conclude that all
   three are perfect. They may all be sixty parts per million high. Nothing in the measurement can tell
   you.
3. **Your uncertainty in the "known" is tens of ppm.** With a certified gas you know the reference to a
   few percent and can resolve a sensor error of 40 ppm. With outdoor air you cannot honestly claim
   better than about ±30 ppm on the reference itself, so **any sensor error smaller than that is
   undetectable**. You can catch a badly wrong sensor. You cannot certify a good one.
4. **If you then apply a software offset, you have destroyed the evidence.** The firmware's
   `co2_target` operation computes each sensor's offset so that its displayed value becomes the number
   you typed. Do that at 420 ppm on all three and they will agree at 420 ppm afterwards — **by
   construction**. Agreement at that point is no longer evidence of anything, and anyone who tests the
   headset later and finds the pods agreeing in fresh air has learned nothing, because you made it true
   with a keystroke.

Point 4 is the one to be careful about. Calibrating is fine and it is what M10 has you do. What is not
fine is calibrating and then citing the resulting agreement as a validation result. **Record the
before values. Always.** The pre-calibration table is the measurement; the post-calibration table is
the configuration.

---

## A note on the deliverables document

Subtask 2.3.7 reads: *"bench test all three units against a known CO₂ reference concentration; verify
readings, response time, and I²C/UART communication."*

**There is no I²C on a SprintIR.** It is UART only, ASCII, 9600 8N1, and it has no bus addressing of
any kind. That is not a pedantic correction — it is the reason sensors 2 and 3 on the headset have to
share one UART that gets torn down and re-pinned before every single access, and the reason `K 0` has
to go first at boot. A part with I²C addressing would have had none of those problems.

Working documents contain errors. Fix them where you find them and say so, rather than quietly
implementing around them.

---

## Answers — the worked example

**Stop here if you have a bench session to run.** Everything below is worked out on invented data, and
reading it first will tell you what the shape of the answer looks like before you have found it
yourself.

### The synthetic data

**These numbers are made up.** They are not from a real bench session, a real cylinder, or real
sensors. They were written so the arithmetic is clean and so that each of the three sensors
illustrates a different verdict.

Reference: **certified 2,000 ppm, stated uncertainty ±2 %** — so ±40 ppm. Ten `Z` readings per sensor
over 60 seconds, `A 32`, all three in one chamber, ambient 1,012 hPa.

| Sensor | Multiplier | Known | Mean of 10 | SD | Error | Error % |
|---|---|---|---|---|---|---|
| Top | 10 | 2,000 | 1,974 | 12 | **−26** | −1.3 % |
| Forehead | 10 | 2,000 | 2,043 | 9 | **+43** | +2.2 % |
| Chin | 10 | 2,000 | 1,912 | 28 | **−88** | −4.4 % |

### Reading it

**Your calibration is never better than your reference.** The cylinder is ±40 ppm. So:

- **Top, −26 ppm.** Inside the reference's own uncertainty. You cannot distinguish this sensor from a
  perfect one with this equipment. Do not "correct" it — you would be calibrating against noise.
- **Forehead, +43 ppm.** Just outside. Suggestive, not established. Repeat it with a second cylinder or
  a second session before you act.
- **Chin, −88 ppm.** More than twice the reference uncertainty. This one is real.

That distinction is the whole reason step 4 says to record the reference's uncertainty. Without it,
three numbers all look equally meaningful and you will spend an afternoon correcting a sensor that was
fine.

### The noise column

Quantisation alone would give a standard deviation of `10 / √12 = 2.9` ppm on a 10 ppm grid (`V14`).
All three sensors are well above that, so all three are dominated by real measurement noise rather than
by the step size — the quantisation is not what is limiting you here.

The chin's 28 ppm stands out on its own, at two to three times the other two. Noise that high is worth
chasing before you chase its bias: a loose connector, a draught across the chamber, or a sensor sitting
where the gas has not mixed will all do it, and none of them is fixed by an offset.

### The pairwise differences — the part that matters

```
forehead − top    = 2,043 − 1,974 = +69 ppm
top − chin        = 1,974 − 1,912 = +62 ppm
forehead − chin   = 2,043 − 1,912 = +131 ppm
```

And the one the project runs on:

```
chin − top        = 1,912 − 1,974 = −62 ppm
```

**In gas that is uniform by construction, the rebreathing measurement reads −62 ppm.** That is not
noise and it will not average away. It is a fixed offset that will sit underneath every session these
three sensors ever record.

### How much does that cost?

Take M2's worked pair: chin 1,850 ppm, top 700 ppm, exhaled breath 40,000 ppm.

```
true      f_rb = (1,850 − 700) / (40,000 − 700) = 1,150 / 39,300 = 2.93 %
with the bias   = (1,150 − 62) / 39,300         = 1,088 / 39,300 = 2.77 %
```

The rebreathed fraction comes out **5.4 % low**, every time, in a way no amount of repetition will
reveal — because repeating a systematic error just gives you a very precise wrong answer.

Now put that next to `V14`'s quantisation result. Quantisation moved the same figure by under one
percent, relative. This cross-sensor offset moves it by more than five. **Calibration error is the
dominant term, and it is the one you can actually do something about.** That is M10's entire argument,
and you have just derived it from three rows of a table.

### Against the acceptance criterion

The example criterion at the top was: within ±100 ppm of the reference, and no two sensors differing by
more than 50 ppm.

- All three are within ±100 ppm of the reference. **First half: pass.**
- Forehead and chin differ by 131 ppm. Top and chin differ by 62 ppm. **Second half: fail.**

Which is exactly the result the criterion was written to catch, and exactly the one you would have
talked yourself out of noticing if you had written the criterion afterwards. Every sensor is
individually acceptable. The instrument is not.

### What you do about it

Not in this exercise — this one is measurement only. The offsets go in with `co2_offset` or
`co2_target`, they persist in NVS, and M10 runs the real calibration and its five-state cycle.

The one thing to carry out of here: **you now have a before table.** Whatever the headset reads after
calibration means something only because this table exists.
