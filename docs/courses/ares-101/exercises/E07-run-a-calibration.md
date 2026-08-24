---
promptText: "Run the exercise below and submit the six deliverables, labelled, in the order the page gives them. You need the headset, a phone with the app paired, and to physically go outside. There is no version of this you can do at a desk and that is the entire point of it, so an answer assembled from the example numbers on the page rather than from your own pods has not done the exercise. Do not press ABC ON - C21 explains why, and the button sits two rows below one you do need. If you press it anyway, say so and say what it did, because reporting it is recoverable and quietly leaving it enabled is not. Submit the before and after tables for all three pods with the on-the-grid column filled in. Then give the number this exercise exists to produce, the chin offset minus the top offset in ppm, and one sentence on what it means for every rebreathed fraction this headset would have reported before you started. Explain the two mechanisms in your own words: what FRESH AIR changed, what SET ALL changed, where each one lives, and which of the two showed you a state machine - and then say what neither of them fixed, because both are single-point calibrations and there is an error in the model of a sensor that a single point cannot reach. Report the freeze: how long the live readings were suspended, and what would have been in the CSV for that interval. Give your V17 recomputation from step 8 with both labels; yours will not match the worked scenario and the interesting question is which direction it misses in and by how much. Finish with one thing you would change about the procedure and its cost, to the same standard as E04 and E06 - a preference is not an argument, so if your answer is calibrate more often, say how often, say what it costs the person wearing it, and say what evidence would tell you the interval was right. Throughout, be honest about where you stood and how long you waited, because the calibration reference is a claim about the world and your account of the conditions is the only evidence that claim will ever have."
minWords: 300
passThreshold: 70
rubric:
  - id: offset-vs-span
    point: "THE DISTINCTION THIS EXERCISE EXISTS TO TEACH - weight it accordingly, and note that it has two halves which are easy to conflate. FIRST, the two mechanisms, which are structurally different and live in different places. FRESH AIR is the op fresh_air, sends G to each present sensor, and re-zeroes the SENSOR's own zero against its stored fresh-air value of 400 ppm by factory default; it persists inside the SprintIR, it is applied before Z ever answers, it is readable back only as the echoed new zero, and it is not reversible without another calibration. SET ALL is the op co2_target, which applies a SOFTWARE offset on the ESP32 - co2Offset[i] += (target - co2Ppm[i]), stored in NVS namespace cal under keys c0 to c2, added to every reading afterwards by applyCO2Offset(), fully readable back through the CAL_STATUS notify, and reversible by setting it to zero. The hardware op runs through the five-state cycle and the software op does not, which is the concrete answer to which of the two showed a state machine; software offsets are applied inline in the handler and return immediately, so the confirmation you actually get is the offset appearing in the sheet. Credit the observation that co2_target is INCREMENTAL rather than absolute, adding the discrepancy to whatever was already stored, because co2Ppm[i] is the already-offset reading and replacing would double-count. SECOND, and this is what separates a full answer from a competent one: BOTH are single-point calibrations, so both fit exactly one number. Model a sensor as reading equals (1 plus s) times C_true plus b; one known concentration can only fix b. The span error s survives everything done in this exercise, its effect grows in proportion to the reading, and the only thing that can measure it is a second known concentration - a certified reference gas, which is deliverable 2.5.2 and has not been run. Full credit requires both halves. Award partial for a correct account of the two mechanisms with no mention that neither touches span. Award missed for an answer treating FRESH AIR and SET ALL as two routes to the same result."
    weight: 4
  - id: fresh-air-assumption
    point: "The assumption underneath the whole procedure, and the reason step 2 is ten minutes of standing still. The calibration reference is a CLAIM ABOUT THE WORLD, not a property of the instrument: nothing on the headset knows whether you were outdoors, and the five-state machine can confirm that a command was accepted and that a sensor answered but has no state for the assumption was false. A calibration performed in a stairwell returns a clean green OK and leaves the headset worse than it was. Full credit requires that stated, plus at least two of the following four from C21. That 400 ppm is the sensors' stored value and is no longer the truth - global background passed 400 around 2015 and L10's paper measured just over 423 ppm on a rooftop across four weeks in spring 2016, so the anchor carries a systematic error of a couple of tens of ppm and growing. That outdoors is not the same as well mixed - not a doorway, a loading bay, a courtyard or a car park at 08:30 - because local CO2 within a metre of a person routinely runs 100 ppm above the regional value, which is this project's own premise arriving where it is inconvenient. That your own plume is on the headset you are calibrating, hence arm's length and upwind. And the settling argument, which is two clocks of which only one is short: the A 32 filter converges in roughly its own setting in seconds, while the air in the tubing is governed by C17's transport delay, so a reading still falling when you calibrate records the tail of your own indoor air as if it were the sky. The strongest available answer goes one step further and states the common-mode result: a baseline error SHARED by all three pods very nearly cancels in C_chin minus C_top, moving f_rb by well under a tenth of a percent, whereas one that DIFFERS between pods lands in the numerator at full size - which is why this exercise cares far more about the pods agreeing with each other than about all of them agreeing with the world. Award partial for an answer that follows the procedure faithfully but treats 400 ppm as a fact rather than as an imported claim."
    weight: 4
  - id: abc
    point: "ABC, graded as a substantive error rather than as a slip. The exercise warns about it twice and C21 explains why. probeAndInitCO2() sends the disable command to every sensor at every boot, unconditionally, with no setting to change it. Automatic baseline correction is the sensor running its own fresh-air calibration on a timer: over a multi-day window it records the lowest concentration it has seen, assumes that minimum was fresh air at 400 ppm, and shifts its zero so the minimum reads 400. On a wall in a ventilated office that is an excellent feature, because buildings really do reach outdoor concentration overnight and the assumption holds. On a headset the window's minimum is the quietest moment of a device that spends its powered hours indoors, on a face, inside the plume of the person wearing it - perhaps 600 or 700 ppm rather than 400 - so ABC assumes 700 was 400 and subtracts 300 from everything afterwards. Because the true minimum is always ABOVE the assumed value the correction runs one way only, always downward, and the symptom the team recorded is exactly what that predicts: indoor readings drifting below 300 ppm, which is below any real ambient concentration anywhere on Earth and is therefore the tell. A reading of 280 ppm in a room is not a low-CO2 room, it is a sensor that has re-zeroed itself against rebreathed air. The comparison that makes it land is that G and ABC make the SAME assumption and differ only in who guarantees it - the fresh-air zero is triggered by a person standing in a field, ABC by a timer that trusts a statistic, and on a wearable the person can honour the assumption and the timer cannot. Full credit for leaving it alone and being able to say all of that. Award full credit equally to a learner who pressed it, reported that they pressed it, and diagnosed what it did, because reporting it is recoverable. Award MISSED to any answer that records enabling ABC without recognising it as an error, that describes it as an alternative way of calibrating, or that recommends it as a convenience - this is the one judgement in the exercise that is not a matter of degree."
    weight: 3
  - id: chin-minus-top
    point: "The number this exercise exists to produce, and what it means. The chin offset minus the top offset in ppm, taken from the after table, plus one sentence on every rebreathed fraction the headset would have reported before the calibration. The reasoning to look for, from C21 and V17: the rebreathed fraction is a DIFFERENCE of two sensor readings, so what lands in its numerator is not either pod's error but the gap between them, b_top minus b_chin. Two pods off by minus 210 and minus 80 put 130 ppm into the numerator and neither pod is off by 130. If the learner's two offsets have opposite signs the error is larger than either one on its own; if they happen to be close, it very nearly cancels - both are creditable findings, and the second is not a failed exercise, it is a result about these two pods. The half most often missed: the numerator error is a FIXED number of ppm, so the relative damage grows as the signal shrinks, and on this project the smallest signal is the control condition every experiment subtracts from. V17 runs the same 130 ppm at three signal levels and finds the band flip at the baseline rather than at the peak. Full credit requires the difference computed correctly from the learner's own numbers, compared against V17's 130 ppm, and the fixed-error-worst-at-smallest-signal consequence stated. Award partial for the number reported with only a general remark that it makes the readings less trustworthy."
    weight: 3
  - id: procedure-observations
    point: "The things only doing this outdoors can teach, reported as observations rather than as a restatement of the page. The FREEZE - loop() skips updateSensorReadings() entirely while a job is pending or running, so no CSV rows and no history samples are produced for the duration, and the honest answer to what would have been in the file for that interval is nothing at all, a gap in the timestamps, rather than nulls or repeated values. A timed figure is expected and it should be short, because the GSS zero commands echo immediately and the roughly four seconds per sensor on slide 6 of the 7/30 deck describes the SenseAir lamp cycle these parts replaced. The PENDING state being one loop() iteration wide and therefore hard to catch at all. The WARM-UP interaction, which is the most common way to get a confusing non-result: co2_target needs a live reading because it computes its discrepancy against co2Ppm[i], so on a warming-up headset there is nothing to subtract, the firmware reports that there is no live reading to calibrate, and it applies nothing. The POWER-CYCLE check, offsets restored from NVS in setup(), on the principle the exercise states - a calibration that did not survive a power cycle is not a calibration, it is a session setting. And the cross-check between steps 4 and 5, that a large software offset written by SET ALL means either the hardware zero did not take or the air moved between the two steps. Full credit for the timed freeze plus two of the rest. Award missed for a submission carrying no real numbers, timings or conditions anywhere, because that is an answer written at a desk."
    weight: 2
  - id: v17-recomputation
    point: "Step 8, judged on method rather than on the answer, because the learner's pods will not reproduce V17's worked scenario and the interesting question is which direction theirs misses in. The five rows: f_rb from the calibrated pair as (C_chin minus C_top) over (38000 minus C_top), with C_exhaled taken as the app's shipped 38,000 ppm; the uncalibrated readings reconstructed per pod as C plus the negative of that pod's offset; f_rb from the uncalibrated pair by the same formula; the overstatement as the ratio of the two; and the label each of the two receives from the shipped bands - None below 0.2 percent, Low below 1, Moderate below 3, High at or above 3. Full credit for arithmetic that closes and for both labels reported. Extra credit, not required, for noticing that the overstatement splits into a large numerator term and a denominator term worth a fraction of a percent, or for observing that two offsets close to each other produce a small overstatement without that meaning either pod was accurate. Award partial for a computation reporting one f_rb rather than two. Award missed for one that quotes V17's 130 ppm or 11.5 percent as though it were the learner's own result."
    weight: 2
  - id: change-with-cost
    point: "Deliverable 6, to the standard E04 and E06 set and this exercise restates - a preference is not an argument. One change to the procedure, with its cost, and if the change is to calibrate more often it must name an interval, say what that costs the person wearing the headset, and say what evidence would tell you the interval was right. The strongest available changes, though any well-argued one earns the point: record the offsets and the date and place of every calibration, since C20 confirms the file does not record which offsets were in force and C21 notes that no calibration carries a date, at a cost of columns appended to the END of the CSV so that no existing index moves, plus a line in the session log; or replace ten minutes by the clock with a defined settling criterion, such as all three readings stable within one quantisation step across two minutes, at the cost of an open-ended stay outdoors on a still day; or GPS-tag or photograph the calibration location, at almost no cost, on the grounds that where you stood is the only term in the entire procedure that nothing can verify afterwards. Award missed for a change with no stated cost, and for calibrate more often offered without an interval, a cost and a test."
    weight: 2
referenceAnswer: |
  DRAFT - pending ARES team review. Drawn from the exercise text, C16, C17, C20, C21, V17 and
  GLOSSARY.md. It encodes claims about the calibration path that a drafter working from the course
  text rather than from the firmware will get wrong in places; check it against ARES2ESP32 before
  this course is published.

  NOTE FOR THE REVIEWER. This is the one exercise in the course whose submission cannot be produced
  at a desk, and the rubric leans on that in two places - it expects real timings and real
  conditions, and it awards missed where there are none. If the team decides a desk version is
  acceptable for members without hardware access, that decision belongs in the exercise body first
  and the rubric second, not the other way round.

  WHAT A GOOD SUBMISSION CONTAINS

  Six deliverables, two pages at most: the before and after tables for all three pods with the
  on-the-grid column filled in; the chin-minus-top offset with a sentence on what it means; the two
  mechanisms in the learner's own words; the freeze, timed, with what the CSV would hold for that
  interval; the V17 recomputation with both labels; and one change to the procedure with its cost.

  The exercise produces one number and a great deal of context. The number is the difference between
  two offsets. The context is the evidence that the number was obtained honestly, and on this
  exercise the context is genuinely half the grade, because nothing on the device can testify to it.

  ONE DEFENSIBLE SUBMISSION

  Not the answer - an answer, at the standard the rubric expects. A learner's real numbers will
  differ and that is the exercise working, not failing.

  BEFORE, outdoors, open playing field, 14 minutes after leaving the building, held at arm's length
  and upwind, readings stable for the last three minutes.

  Top 470 ppm, on the grid, stored offset 0.0. Forehead 505 ppm, NOT on the grid, stored offset
  minus 5.0 read from CAL_STATUS - the off-grid last digit is what said an offset was in force, and
  it is the only place that fact was visible. Chin 585 ppm, on the grid, stored offset 0.0. Spread
  115 ppm. Chin minus top, 115 ppm.

  AFTER the G zero, two minutes settled: top 415, forehead 405, chin 445. The sensors' own zeros
  moved a long way and did not land exactly on 400, which is expected - G zeroes against a stored
  value the truth now sits above, and the air moved during the walk.

  AFTER SET ALL to 400, all three read 400 and the stored offsets are: top minus 15.0, forehead
  minus 10.0, chin minus 45.0. The forehead's is minus 5.0 plus (400 minus 405), because co2_target
  is incremental. These are much smaller than the original 115 ppm spread, which is the check step 4
  exists to make possible - the hardware zero did most of the work and the software step corrected
  what was left.

  THE NUMBER: chin offset minus top offset = minus 45.0 minus (minus 15.0) = minus 30 ppm. Both
  figures belong in the report. Before the G zero, the two pods that go into the rebreathed fraction
  were 115 ppm apart in identical air. After it, the headset is applying a 30 ppm differential
  correction between them, and until today that 30 ppm was uncorrected instrument sitting in the
  numerator of every f_rb this headset reported - not either pod's error, but the gap between them,
  fixed in ppm and therefore doing its worst damage wherever the signal was smallest.

  THE TWO MECHANISMS. FRESH AIR sent G to each sensor and moved the SprintIR's own zero, inside the
  part, before Z answers, persisting in the sensor and readable back only as the echoed new zero.
  SET ALL ran co2_target, which added (400 minus the current reading) to the software offset held in
  ESP32 NVS namespace cal under keys c0 to c2 and applied by applyCO2Offset() after every read.
  Only the hardware op went through the five-state cycle; the software op returned inline with no
  state change at all, and the only confirmation was the new figure in the sheet. And what neither
  of them fixed: both are single-point calibrations, so both fit b and neither touches the span term
  s. Span needs a second known concentration, which is deliverable 2.5.2.

  THE FREEZE. Live readings suspended for about 3 seconds on a batch of three. No CSV rows and no
  history samples were written for that interval, so the file holds a gap in the timestamps rather
  than nulls. PENDING was never visibly caught - it is one loop() iteration wide.

  THE V17 RECOMPUTATION, two minutes of normal breathing with the headset worn. Calibrated: chin
  1,240 ppm, top 680 ppm. Uncalibrated, as C plus the negative of each pod's offset: chin 1,240 plus
  45 = 1,285, top 680 plus 15 = 695.

  f_rb calibrated = (1240 - 680) / (38000 - 680) = 560 / 37320 = 1.501 percent, which is Moderate.
  f_rb uncalibrated = (1285 - 695) / (38000 - 695) = 590 / 37305 = 1.582 percent, also Moderate.
  Overstatement = 1.582 / 1.501 = 1.054, so plus 5.4 percent, of which the numerator contributes
  590/560 = 1.0536 and the denominator 37320/37305 = 1.0004.

  No band flip here, and the reason is the point. The differential offset is 30 ppm against V17's
  130, so the overstatement is roughly a quarter of V17's. But run the same 30 ppm at a baseline
  signal instead - chin 730 against a top of 680, a 50 ppm difference - and it gives 50/37320 =
  0.134 percent, which the app calls None, against 80/37305 = 0.214 percent, which it calls Low.
  A factor of 1.60 and a band crossed, from a headset whose peak-signal overstatement was 5 percent.
  Smaller offsets did not make the problem go away; they moved it to a smaller signal.

  A REVIEWER'S NOTE. Step 8 asks for the uncalibrated pair as C plus the negative of the offset,
  which is well defined only when there are offsets to undo. A learner whose pods came out of the
  hardware zero already at 400 will have offsets near zero and nothing to reconstruct, and must
  reason from the pre-calibration spread instead. That is a correct submission, not an incomplete
  one. Grade the reasoning, not the shape of the arithmetic.

  ONE CHANGE, WITH ITS COST. Record the three offsets, the date, and the location of every
  calibration in the session log, and add the offsets as columns at the END of the CSV. Reason: C20
  confirms the file does not record which offsets were in force, so two sessions taken under
  different calibrations are structurally identical and not comparable, and C21 notes no calibration
  carries a date at all. Cost: a schema change that every existing consumer must be told about, kept
  safe only by appending, plus about a minute of the operator's time per calibration. What it does
  not buy: any check on whether the air was really 400 ppm, which remains unverifiable by anything
  the device can do.

  WHY THIS SUBMISSION IS SHAPED THIS WAY

  Two things to look for in a learner's answer. It reports conditions - where, how long, how settled
  - because those are the only evidence the calibration reference has, and a submission without them
  is asking to be taken on trust about the one claim the instrument cannot check. And it states what
  the procedure did NOT fix, twice: span, which no single point can reach, and the location
  assumption, which no state machine can represent. A learner who leaves this exercise believing the
  headset is now correct has learned the wrong half of it.
---

# E07 — Run a fresh-air calibration

> ASSIGNMENT section · ARES 101 · M10 · ~2 min to read, 60–75 minutes to do
> This body is seeded into `contentJson` as the learner-facing context; the frontmatter above is the
> section's `assignmentConfig`, and its `rubric` and `referenceAnswer` are author-only — they are never
> served to a learner. Depends on `C21` (offset versus span, the fresh-air
> assumption, the two calibration mechanisms, ABC) and `V17` (the arithmetic you are about to
> reproduce on real hardware). `C16` for the warm-up and the 10 ppm grid.
>
> **You need the headset, a phone with the app paired, and to physically go outside.** There is no
> version of this exercise you can do at a desk, and the reason is the entire point of it.
>
> Do not press **ABC ON**. `C21` explains why; the button is two rows below one you do need.

---

## The task

**Calibrate all three pods against outdoor air, then bring the headset inside and prove the
calibration held.**

Along the way you will watch the five-state cycle run, find out which of the two calibration
mechanisms actually uses it, and finish by recomputing `V17`'s numbers with your own pods' offsets
instead of the worked ones.

The measurement you are producing is one line long:

> **The difference between the chin pod's offset and the top pod's offset**, in ppm, because `C21`
> says that number lands directly in the numerator of every rebreathed fraction this headset ever
> reports.

Everything else is the procedure that gets you there honestly.

## Before you leave the building

Read this section indoors, because two of these will cost you a second trip.

- **Charge it, and bring the phone.** The offsets are written to NVS on the headset, but you cannot
  trigger a calibration or read the offsets back without the app.
- **Take a note of the offsets that are already there.** Open the calibration sheet
  (`app/lib/widgets/calibration_sheet.dart`) and write down all three CO₂ offsets *before* you touch
  anything. They come from the `CAL_STATUS` notify and they are the only record that exists —
  nothing in the CSV says what was in force when a file was written.
- **Check the last digit of each pod's live reading.** The SprintIR-6S-20 % quantises to 10 ppm
  (`C16`), so a reading that is not a multiple of ten means that pod already carries a non-zero
  software offset. `V17` opens on exactly this. If you see one, the previous entry has already told
  you what it is.
- **Plan for 20 minutes outdoors.** The sensor is warm in 30 seconds and the *air in the tubing* is
  not. See "settling", below.
- **Pick somewhere that is actually outdoors.** Not a doorway, not a loading bay, not a courtyard
  between two buildings, not a car park at 08:30. Open ground, moving air, nothing running nearby.

## The procedure

### 1 · Power on, and wait out the warm-up

The first 30 seconds after power-on produce no CO₂ readings at all. `co2WarmingUp()` is
`millis() < 30000`, `co2Ok[i]` stays false, the warm-up bit is set instead, and the app shows
"warming up" rather than a number.

This matters here rather than just being trivia, because **`co2_target` needs a live reading**. It
computes `co2Offset[i] += (target − co2Ppm[i])`, so with no valid `co2Ppm[i]` there is nothing to
subtract; the firmware returns `no live CO2 reading to calibrate` and applies nothing. Trying to
calibrate a warming-up headset is the most common way to get a confusing non-result.

### 2 · Settle, and be honest about how long

Two clocks are running and only one of them is short.

- **The sensor's** — the digital filter is set to 32 (`A 32`), so a step change takes roughly its own
  setting in seconds to converge.
- **The plumbing's** — every pod samples through a tube at whatever the pump is doing, and `C17`'s
  transport delay applies. The air the chin sensor is measuring right now came from the inlet some
  time ago.

Give it **ten minutes standing still outside**, holding the headset at arm's length, upwind of
yourself, off the ground. Then watch the three readings for two more minutes and only proceed when
all three have stopped trending.

If a reading is still falling when you calibrate, you are recording the tail of your own indoor air
as if it were the sky.

### 3 · Record the "before" table

Three pods, one reading each, taken at the same moment.

| Pod | Reading (ppm) | On the 10 ppm grid? | Stored offset before |
|---|---|---|---|
| Top | | | |
| Forehead | | | |
| Chin | | | |

Then write down, immediately, two derived numbers:

- **The spread** — highest minus lowest.
- **The chin-minus-top gap** — the one that matters, and the one you will compare against 130 ppm at
  the end.

### 4 · Run the hardware zero, and watch the state machine

In the calibration sheet, use **FRESH AIR** with the pod selector on **all** (the app sends
`sensor: 0` for all, `1`–`3` for a specific pod). It will ask you to confirm; it should.

That op is `fresh_air`, which sends `G` to each present sensor. `G` re-zeroes the sensor against its
own stored fresh-air value — 400 ppm by factory default — and echoes back the new zero point.

Now watch the chip at the top of the sheet, because this is the only part of this exercise you
cannot see any other way:

```
IDLE → PENDING → RUNNING → OK
                        ↘ FAIL
```

`applyCalibration()` validates the request and sets `PENDING`. `processCalJob()`, called from
`loop()`, moves it to `RUNNING`, sends the commands, and lands on `OK` or `FAIL` with a short message
attached. **`OK` and `FAIL` are alternative endings, not sequential steps** — slide 6 of the 7/30
deck draws them in a chain and the code does not — and neither returns to `IDLE` on its own. The
terminal state sits there until the next job is queued, with an age counter so the UI can fade it.

Two things to notice while it runs, both of which are easy to miss and both of which you should write
down:

- **The live readings freeze.** `loop()` skips `updateSensorReadings()` entirely while a job is
  `PENDING` or `RUNNING`, so no CSV rows and no history samples are produced for the duration. Time
  how long the freeze lasts. On the SprintIRs it should be short; the deck's "~4 s per sensor" figure
  describes the SenseAir lamp cycle these parts replaced.
- **How long you had to look to catch `PENDING`.** It is one `loop()` iteration wide.

Wait two more minutes after `OK` before reading anything. The zero moved; the 32-sample filter has
not caught up yet.

### 5 · Now do it the other way, and notice the difference

With the readings settled again, use **Known CO₂ (ppm)** — enter `400`, and **SET ALL**.

That is `co2_target`, and it does something structurally different: it applies a **software** offset
on the ESP32, stored in NVS namespace `cal` under keys `c0`–`c2`, added to every reading afterwards
by `applyCO2Offset()`.

**Watch the state chip.** It does not move. Software offsets are applied inline in the handler and
return immediately — there is no `PENDING`, no `RUNNING`, no `OK`. The five-state cycle belongs to
the hardware ops only. If you were expecting a green `OK` to confirm your calibration landed, this is
the moment to notice that the confirmation you actually get is the offset appearing in the sheet.

And here is the check that makes step 4 worth having done. **If the `G` zero worked, the software
offset this step applies should be small** — the readings were already near 400, so there is little
left to correct. If `SET ALL` writes a large offset, either the hardware zero did not take or the
air moved between the two steps. Record both numbers and say which you think it was.

### 6 · Record the "after" table

| Pod | Reading after `G` (ppm) | Reading after `SET ALL` (ppm) | Stored offset after |
|---|---|---|---|
| Top | | | |
| Forehead | | | |
| Chin | | | |

**And the number this exercise exists to produce:**

```
chin offset − top offset  =  ______ ppm
```

### 7 · Bring it inside, and check that it held

Walk in, sit down, and let it settle for five minutes.

You should see three things:

1. **All three pods reading close to each other** — a spread much smaller than the one you wrote down
   in step 3.
2. **A plausible indoor value.** A quiet room with people in it is usually somewhere between 600 and
   1,200 ppm. If a pod is reporting under 400 indoors, something is wrong and `C21`'s ABC section
   tells you what it looks like.
3. **The offsets still in the sheet.**

Then **power-cycle the headset**, wait out the warm-up, and confirm the offsets are still there. They
are restored from NVS in `setup()`. A calibration that did not survive a power cycle is not a
calibration, it is a session setting — which is `Q20`'s point about the pump, arriving somewhere it
costs more.

### 8 · Redo `V17` with your own numbers

Take your chin and top offsets, and one moment of real wear data — put the headset on, breathe
normally for two minutes, and read the chin and top pods.

Compute, exactly as `V17` does, with `C_exhaled` = 38,000 ppm:

| | Working | Your value |
|---|---|---|
| `f_rb` from the **calibrated** readings | `(C_chin − C_top) / (38000 − C_top)` | |
| The uncalibrated readings | `C + (−offset)` for each pod | |
| `f_rb` from the **uncalibrated** pair | same formula | |
| The overstatement | ratio of the two | |
| The label each one gets | None <0.2 % · Low <1 % · Moderate <3 % · High ≥3 % | |

`V17`'s worked scenario produces a 130 ppm differential offset and an 11.5 % overstatement. Yours
will not match, and the interesting question is which direction it misses in and by how much.

## When it says FAIL

`runCalOnSensor()` writes a short message with the result, and there are exactly four ways to get
`FAIL`. Work them in this order.

| Message | What it means | Check first |
|---|---|---|
| `S{n} not present` | That sensor was never detected at boot | The boot log — `probeAndInitCO2()` prints `S{n} multiplier: x10` for every sensor it finds. A pod that is absent at boot is **never retried**, so this is a power-cycle, not a retry |
| `S{n} cal: no response` | `G` went out and nothing came back before the timeout | Wiring, and then the shared port. CO₂ sensors 2 and 3 share one UART; `co2Port()` tears it down and re-pins it before every access |
| `S{n} cal: bad reply '...'` | Something came back and it did not parse as `G <digits>` | The buffer had somebody else's line in it. This is the `K 0` failure from `C16` — a sensor left streaming corrupts its **neighbour's** reads, not its own. Power-cycle and watch the boot log |
| `no CO2 sensors present` | A batch job found nothing to run on | All three failed to probe. Power, then wiring, then the boot log |

Two more things about `FAIL` that are not error messages:

**A batch is all-or-nothing in its verdict.** `sensor: 0` runs every *present* sensor and reports
`OK` only if all of them succeeded. Two out of three gives you `FAIL` with the message
`2/3 sensors OK` — so read the message, not just the colour. Two pods really were calibrated.

**And the failure that has no state.** The five-state machine can tell you that a command was
accepted and that a sensor answered. It cannot tell you that the air was 400 ppm. A calibration
performed in a stairwell returns a clean, green `OK` and leaves the headset **worse** than it was.
There is no state for "the assumption was false", and there is no way to add one — which is why step
2 of this procedure is ten minutes of standing still.

## What to hand in

Two pages at most.

1. **The before and after tables**, all three pods, with the "on the grid?" column filled in.
2. **The chin-minus-top offset**, and one sentence on what it means for every `f_rb` this headset
   would have reported before you started.
3. **The two mechanisms, in your own words.** What did `FRESH AIR` change, what did `SET ALL` change,
   where does each one live, and which one showed you a state machine? Three sentences.
4. **The freeze.** How long were the live readings suspended, and what would have been in the CSV for
   that interval?
5. **Your `V17` recomputation** from step 8, with the two labels.
6. **One thing you would change about the procedure**, with its cost. Same standard as `E04` and
   `E06`: a preference is not an argument. If your answer is "calibrate more often", say how often,
   say what it costs the person wearing it, and say what evidence would tell you the interval was
   right.

---

## Why this is worth an hour outdoors

Because everything in `C21` and `V17` is arithmetic until you have watched a pod's reading move by
two hundred ppm as a consequence of a button you pressed, and because two of the things this
procedure teaches cannot be taught any other way.

The first is that **the calibration reference is a claim about the world, not a property of the
instrument.** Nothing on the headset knows whether you were outdoors. The whole edifice — three
offsets, every rebreathed fraction, the entire summer's data — rests on one person having stood in
the right place for ten minutes, and the device records only that a command succeeded.

The second is what a **result you cannot see** looks like. Steps 4 and 5 both change the number on
the card. One of them announced itself with a state machine, a colour and a confirmation dialog; the
other silently altered every reading the headset will ever take and told you nothing but a new figure
in a text field. Neither is written into the CSV. `E06` had you notice that the offsets are applied
before logging and never recorded; this is the hour where you are the person who applied them.

Deliverable 2.5.2 will do the same thing again with a certified reference gas, and the only
difference will be that the assumption comes with a certificate.
