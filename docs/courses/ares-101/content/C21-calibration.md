# C21 — Calibration, error, and trusting a number

> CONTENT section · ARES 101 · M10 · ~5 min read
> Seeded into `contentJson` as rich text. Depends on `C16` (NDIR behaviour, quantisation, the GSS
> command set) and on the rebreathed fraction as `C13` defines it and `GLOSSARY.md` §2 fixes it.
> `C19` is helpful but not required.
> This module is about one sentence, and everything else in it is either the setup or the
> consequence. The sentence is at the top of the second section.

---

## The measurement this module is really about

Every module so far has treated a reading as a number. This one treats it as a number **plus a claim
about how wrong it might be**, because that is the only form in which a reading can be used to
support a result.

And it lands on ARES harder than it lands on most instruments, because of the shape of what ARES
measures.

> **The rebreathing measurement is a difference of two sensor readings, so it inherits both sensors'
> errors. That is why per-pod calibration is not optional.**

`f_rb = (C_chin − C_top) / (C_exhaled − C_top)`. The numerator is `C_chin − C_top`. Two independent
instruments, each with its own error, subtracted from each other — and the answer can be very much
smaller than either input. A 1,850 ppm chin reading minus a 700 ppm top reading is a 1,150 ppm
signal, and if the two sensors disagree with each other by 130 ppm for reasons that have nothing to
do with the air, 130 ppm of that 1,150 is instrument. In the baseline condition, where the chin
reads 750 against a top of 700, the signal is 50 ppm and the same 130 ppm of instrument is three
times the size of the thing being measured.

The rest of this reading is the vocabulary you need to say that precisely, and the arithmetic that
says how much it costs. `V17` works the whole thing on real numbers.

## Accuracy and precision, without the dartboard

The dartboard picture is fine and it teaches you nothing you can compute with. Here is the same
distinction on three sensors.

Put all three pods on a table outdoors, in air that is genuinely well mixed, and read them once a
second for five minutes. Suppose you get this:

| Pod | Mean over 5 min | Spread of the readings |
|---|---|---|
| Top | 480 ppm | ±10 ppm |
| Forehead | 455 ppm | ±10 ppm |
| Chin | 610 ppm | ±10 ppm |

**Precision** is the second column. It is how much a sensor's answer moves when nothing else does,
and it is a property you can measure without knowing the truth. All three of these pods are precise:
each of them lands within one quantisation step of its own average, every time.

**Accuracy** is how far the first column is from the truth, and you cannot measure it without an
external standard. There is no operation you can perform on those three columns that tells you what
the air actually was. The mean of the three is 515 ppm and the mean is not the answer; averaging
three biased instruments gives you a biased average, and it does it while looking reassuringly like
a result.

Two consequences worth carrying:

- **Precision is not evidence of accuracy.** A sensor that reads 610 every single time in 400 ppm
  air is a very precise instrument that is wrong by 210 ppm, and its steadiness is exactly what makes
  the error hard to notice.
- **Disagreement locates a problem, it does not identify it.** Those three pods disagree by 155 ppm,
  so you know at least two of them are wrong. Nothing in the data says which, or by how much. The
  moment you introduce an external claim — *this air is 400 ppm* — all three become knowable at once.

## Offset and span: a straight line has two ways to be wrong

Model any of these sensors as a straight line through the truth:

```
reading = (1 + s) · C_true + b
```

`b` is the **offset** (or zero) error, in ppm, and it is the same at every concentration. `s` is the
**span** (or gain) error, dimensionless, and its effect grows in proportion to the reading. A sensor
with `b = −20 ppm` and `s = +0.03` reads 20 ppm low everywhere and 3 % high on top of that.

Now the point of the section. **A single-point calibration fits one number, so it can only fix one
of them.** You expose the sensor to one known concentration, you observe the discrepancy, and you
apply a shift that makes the reading correct *at that concentration*. Everywhere else you have moved
the line by a constant, which corrects `b` exactly and leaves `s` untouched.

Work it through. Take a sensor with `s = +0.03` and no zero error at all, calibrate it in 400 ppm
air, and it reads `1.03 × 400 = 412` — so the calibration applies a shift of −12 ppm. Now put it in
1,850 ppm air:

| | Reading |
|---|---|
| True concentration | 1,850 ppm |
| Sensor's raw output, `1.03 × 1850` | 1,905.5 ppm |
| After the −12 ppm single-point shift | **1,893.5 ppm** |
| Residual error | **+43.5 ppm** |

The calibration removed 12 ppm of a 55.5 ppm error and left 43.5. And that residual is not a defect
in the procedure — it is the procedure working exactly as designed on a problem it was never able to
address. Fixing `s` requires a **second** known concentration, which means a certified gas, which is
deliverable 2.5.2 and is the subject of the last section of this file.

One mercy, and it matters more for ARES than the general case. A span error is *proportional*, so if
both pods share it, it costs you a fixed percentage of the difference rather than a fixed number of
ppm. With `s = 0.03` on both pods, a true 1,150 ppm difference is measured as 1,184.5 — 3 % high,
and it stays 3 % high whether the signal is 1,150 ppm or 50 ppm. Zero errors do not behave that
kindly, as the next section but two explains.

## The fresh-air baseline, and the assumption underneath it

A single-point calibration needs a known concentration, and buying one in a cylinder is expensive
and slow. So the standard field procedure uses the one reference gas that is free and everywhere:
**outdoor air**.

The claim is that well-mixed outdoor air, away from traffic, away from vegetation at night, and away
from anything breathing, is close enough to a global constant to serve as a calibration point. That
claim is largely true and it is worth knowing exactly how true, because two of the ways it fails are
things you will do by accident.

- **The value is not 400 ppm any more.** 400 is the number the sensors ship with, the number this
  course uses in prose, and the number the SprintIR's `G` command zeroes against. Global background
  passed 400 ppm around 2015 and has been rising by roughly 2–3 ppm a year since. The paper `L10`
  assigns measured a mean of just over 423 ppm on a Maryland rooftop across four weeks in spring
  2016. So the stored value carries a systematic error of a couple of tens of ppm, growing.
- **"Outdoors" is not the same as "well mixed".** Standing in a doorway, in a car park at 08:30, in
  a courtyard, or downwind of yourself does not give you background air. Local CO₂ within a metre of
  a person is routinely 100 ppm above the regional value, which is the entire premise of this
  project and is easy to forget while calibrating.
- **Your own plume is on the headset.** You are calibrating a device you are standing next to. Hold
  it at arm's length, upwind, and give it time.

Now — and this is the first place the difference-of-two-readings structure pays you back rather than
costing you — think about what a stale baseline value actually does. If all three pods are anchored
to 400 when the truth is 425, all three read 25 ppm low. `C_chin` and `C_top` are both 25 low, so
`C_chin − C_top` is **unchanged**: the numerator does not know. The denominator `C_exhaled − C_top`
grows by 25 out of 37,300, which moves `f_rb` by 0.067 %.

**A baseline error shared by every pod is common-mode and very nearly cancels. A baseline error that
differs between pods lands in the numerator at full size.** That single asymmetry is why this course
cares much more about the pods agreeing with each other than about all of them agreeing with the
world, and it is the reason the per-pod offsets exist.

## Drift

Calibration is not a thing you do; it is a thing that expires.

An NDIR sensor's zero moves over time for physical reasons that have nothing to do with the gas:
the source ages and emits less; the optical surfaces accumulate a film; the detector's gain and the
electronics' offsets follow their own slow curves; and in a two-channel design, the two channels do
not age identically. None of that is a fault. It is what a light source and a mirror do.

The honest state of knowledge, from `L10`'s paper: across four weeks, six sensors showed no baseline
drift distinguishable from a straight line — a correction fitted on the first fifteen days performed
within 0.1 ppm of one fitted on all twenty-eight. The same paper says plainly that drift beyond one
month "is not known at this time" and would need at least a six-month study. Nobody has run that
study on a SprintIR, and nobody on this team has run any version of it.

Which leaves the practical rule, and it is a rule about *records* rather than about hardware: a
calibration has a date, and a reading without one is a reading you cannot defend. ARES currently
stores the offsets and does not store when they were set. That is a gap and it is a cheap one to
close.

## Three sensors disagreeing is the normal case

The instinct on seeing 480, 455, and 610 in the same air is that something is broken. Usually
nothing is.

`L10`'s paper is the cleanest available evidence. Six copies of one low-cost NDIR part, in one room,
against a research-grade laser reference, for four weeks: **each sensor had its own distinct zero
offset**, some as much as 20 ppm — about 5 % — from the reference, and the uncorrected root-mean-square
errors ran from 5 to 21 ppm across the six. All six were inside the manufacturer's stated accuracy
the whole time. Unit-to-unit variation is not a failure of quality control; it is the specification.

Two things follow, and the second one is the surprising one.

**Every sensor needs its own calibration.** Martin et al. tested exactly this: they averaged the
correction coefficients from five of their six sensors and applied that single generalised
correction to all of them. The resulting errors ranged from 3.1 ppm to 23.9 ppm, and in some cases
were **worse than doing nothing at all**. Their conclusion is the one sentence to take from the
whole paper: for each sensor, an independent evaluation must be completed.

**And you cannot fix it in software after the fact, because the offsets are per-unit and unlabelled.**
A number in a file that came from an uncalibrated pod is not recoverable, because there is nothing
recorded that says how far off it was.

## The result the whole module exists for: error through a difference

Here is the arithmetic that makes calibration non-optional rather than good practice.

Errors come in two kinds and they combine through a subtraction in two completely different ways.

**Random error — independent, zero-mean, different every sample.** Two independent errors with
standard deviation `σ` each, subtracted, give a result with standard deviation `σ√2`. They add in
quadrature, and the difference is **noisier than either input**. From `C16`, quantisation alone puts
`σ = 10/√12 = 2.9 ppm` on each pod, so `C_chin − C_top` carries about **4.1 ppm** of quantisation
noise.

**Systematic error — a fixed bias per sensor.** These do not add in quadrature. They subtract
directly:

```
(C_chin + b_chin) − (C_top + b_top)  =  (C_chin − C_top) + (b_chin − b_top)
```

The error in the difference is **the difference of the biases**, which has three consequences you
should be able to state without looking:

1. If the two pods happen to share a bias, it **cancels exactly** — this is the common-mode result
   from the fresh-air section, and it is the same trick `C16`'s two-channel NDIR design plays with
   its reference channel.
2. If the biases differ, the error is the gap between them, and it is **not** either sensor's error.
   Two pods off by −210 and −80 ppm put **130 ppm** into the numerator. Neither pod is off by 130.
3. If the biases have opposite signs, the error is **larger than either one**. A +100 pod and a −100
   pod give you a 200 ppm error out of two sensors that individually look tolerable.

Now put the two kinds side by side on the same measurement — `C_chin` = 1,850, `C_top` = 700,
`C_exhaled` = 38,000, `f_rb` = 3.083 %:

| Error source | Size on each pod | Effect on `f_rb` |
|---|---|---|
| Quantisation, random | σ = 2.9 ppm | ±0.011 percentage points — **0.35 %** of the answer |
| Sensor noise at five times that floor | σ = 5 ppm | ±0.019 percentage points — **0.61 %** of the answer |
| Uncalibrated zero offsets | −210 and −80 ppm | **+11.5 %** of the answer |

Read the third row against the first two. **The random error is negligible and the calibration error
is about nineteen times larger.** An uncalibrated headset does not produce a scattered, obviously
untrustworthy result that a reader would know to discount. It produces a smooth, repeatable,
confident number that is wrong by 11.5 % and looks exactly like a measurement.

And one more property of that error, which `V17` makes the point of the whole video: the numerator
error is a **fixed 130 ppm** regardless of how much rebreathing there is. So the *relative* damage
grows as the signal shrinks. At a 1,150 ppm difference it is 11.5 %. At a 50 ppm difference — a
subject who is barely rebreathing at all, which is to say the control condition every experiment
depends on — it is a factor of 3.6, and it moves the reported result out of the app's "None" band
and into "Low".

**A fixed error in a difference does its worst damage where the signal is smallest, and the smallest
signal is your baseline.**

## Temperature and pressure

`C16` established why an NDIR sensor is sensitive to both: it counts molecules in an optical path,
which is a number density, so it responds to `P/T` at fixed mole fraction. Calibration is where you
either correct that or decide not to.

The evidence from `L10`'s six-sensor study is unusually specific about which term matters. Correcting
one sensor step by step, the root-mean-square error against the laser reference went:

| Correction applied, cumulatively | RMSE |
|---|---|
| Nothing | 6.9 ppm |
| Zero and span | 3.3 ppm |
| + atmospheric pressure | 2.7 ppm |
| + air temperature | 2.7 ppm |
| + water vapour | 2.1 ppm |
| Multivariate fit on all four at once | 1.8 ppm |

Three things to take from that table. **Zero and span is half the battle** — 6.9 to 3.3 in one step,
and for the worst of their six sensors it was 20.8 to 3.7. **Pressure is the biggest environmental
term** and temperature added nothing resolvable, which is what you would expect from a part that
compensates temperature internally and does not compensate pressure at all. And **water vapour is
real**, worth 0.6 ppm here — small in a rooftop room, and worth thinking about on a device that sits
under a chin inside an exhaled breath.

ARES has the pressure number and does not use it. The phone sends ambient pressure, the firmware
logs it in `press_hpa`, and nothing in the firmware applies it to a CO₂ reading; the only correction
that exists is a display-layer multiply by `1013.25 / press_hpa` in the Flutter app, applied to the
pod cards when a toggle is on and never to the logged file. `V17` computes what that is worth at
950 hPa and lands the part that matters here: a pressure correction is a **multiplicative**
common-mode factor, so unlike a shared zero error it does **not** cancel in a difference — it scales
it, by 6.8 % in the worked case.

---

## Current state: what the headset actually does about all of this

### Two calibration mechanisms, and they live in different places

| | Hardware zero | Software offset |
|---|---|---|
| Command / op | `G`, op `fresh_air` | ops `co2_offset` and `co2_target` |
| What it changes | the **sensor's own** zero point | `co2Offset[i]`, an ESP32 variable |
| Where it persists | inside the SprintIR | ESP32 NVS, namespace `cal`, keys `c0`–`c2` |
| When it is applied | inside the sensor, before `Z` answers | `applyCO2Offset()`, after the read |
| Can you read it back? | only the echoed new zero point | yes — `/cal_status` and the BLE `CAL_STATUS` notify carry all three as floats |
| Reversible? | not without another calibration | yes — set the offset back to 0 |

`G` zeroes the sensor against its stored fresh-air value, which is 400 ppm by factory default, and
echoes back the new zero point. The software offsets are simply added to each reading in ppm, clamped
to a valid range, and they mirror the `tempOffset` / `humOffset` pattern the SHT45s already use.

`co2_target` is the one worth understanding, because it is what the app's "calibrate to a known ppm"
control actually does, and it is **incremental**:

```
co2Offset[i] += (target − co2Ppm[i])
```

It adds the discrepancy to whatever offset is already stored, rather than replacing it. That is the
right behaviour — `co2Ppm[i]` is the *already-offset* reading, so replacing would double-count — and
it has a side effect that is useful to know: a pod that has been calibrated before can display a
reading that is **not a multiple of 10 ppm**, even though the sensor quantises to 10. An off-grid
reading is a fingerprint. It tells you an offset is in force. It does not tell you what the offset
is; for that you have to read `CAL_STATUS`.

GSS also offers `X <value>`, a zero against an arbitrary known gas, which would be the natural way
to use a calibration cylinder. It is **deliberately not wired up**. Calibrating to a known ppm stays
in software.

### ABC is disabled at boot, unconditionally

`probeAndInitCO2()` sends `@ 0` to every sensor at startup, every boot, with no setting to change it.
This is the single most important line in the calibration story and it needs its full explanation.

**Automatic baseline correction** is the sensor doing its own fresh-air calibration on a timer. Over
a multi-day window it records the lowest concentration it has seen, assumes that minimum was fresh
air at 400 ppm, and shifts its zero so that the minimum reads 400. In a ventilated office, on a
sensor that runs continuously, this is an excellent feature: buildings do reach outdoor concentration
overnight, the assumption holds, and the sensor stays calibrated for years without anyone touching it.

Now put it on a headset.

The window's minimum is not outdoor air. It is the quietest moment of a device that spends its
powered hours indoors, on a face, inside the plume of the person wearing it — a minimum of perhaps
600 or 700 ppm rather than 400. ABC assumes that 700 was 400 and subtracts 300 from everything
thereafter. And the arithmetic runs one way only: because the true minimum is always **above** the
assumed value, the correction is always **downward**. The symptom the team recorded on slide 6 of the
7/30 deck is exactly what that predicts — indoor readings drifting **below 300 ppm**, which is below
any real ambient concentration anywhere on Earth and is therefore the tell. A reading of 280 ppm in
a room is not a low-CO₂ room. It is a sensor that has re-zeroed itself against rebreathed air.

The comparison that makes it click:

> **`G` and ABC make the same assumption. The difference is who guarantees it.** The fresh-air zero
> assumes the air is 400 ppm and is triggered by a person who is standing outside holding the
> headset. ABC assumes the air reached 400 ppm at some point this week and is triggered by a timer
> that trusts a statistic. On a wearable, the person can honour the assumption and the timer cannot.

Two practical notes. The op to re-enable it exists — `abc_on` sends `@ 1.0 8.0`, two intervals in
days — and it is reachable from both the app and the web dashboard, so it is possible for somebody to
switch this on. Do not. And because ABC lives inside the sensor, a part that arrives from the factory
has it enabled; `@ 0` at every boot is what makes a fresh sensor safe, in the same way `K 0` at every
boot is what makes a fresh sensor quiet.

### The five states, and what the device does while it is calibrating

A calibration is queued, not executed inline. `applyCalibration()` validates the request and sets
`calJob.state = CAL_PENDING`; `processCalJob()`, called from `loop()`, moves it to `CAL_RUNNING`,
runs the op on one sensor or on all present sensors, and ends at `CAL_OK` or `CAL_FAIL` with a short
message and a completion timestamp.

| State | Meaning |
|---|---|
| `Idle` | nothing queued |
| `Pending` | accepted, waiting for `loop()` |
| `Running` | commands going out on the UART |
| `OK` | finished, all targeted sensors answered |
| `Fail` | finished, at least one did not |

Slide 6 draws these as a chain with four arrows. The code does not: `OK` and `Fail` are **alternative
endings**, not sequential steps, and neither returns to `Idle` on its own — the terminal state
persists until the next job is queued, with `age_ms` telling the UI how long ago it finished so a
banner can fade. Read the slide as a list of the five states rather than as a path.

Three details that matter to anyone actually running one:

- **Sensor reads are suspended while a calibration is pending or running.** `loop()` skips
  `updateSensorReadings()` entirely in those two states, so no CSV rows and no history samples are
  produced. The pause is short now, and it is real.
- **Batch is all-or-nothing in its reporting.** `sensor=all` runs every *present* sensor and reports
  `OK` only if every one of them succeeded; the message is `"2/3 sensors OK"` and the state is
  `Fail`. A missing pod fails the batch.
- **Status is pushed and polled.** The BLE `CAL_STATUS` characteristic notifies on every state
  change and carries all nine offsets; the legacy web dashboard polls `GET /cal_status` for the same
  JSON. Slide 6 calls this "live status feedback during blocking writes", which was written for the
  SenseAir parts — see below.

### One line on slide 6 is now historical

The deck says the fresh-air background calibration is a **SenseAir lamp cycle, about 4 seconds per
sensor**. That was true of ARES 1. The SprintIRs replaced those parts, and the GSS zero commands
echo their result immediately — there is no lamp to cycle — so calibration no longer blocks `loop()`
for seconds per sensor. The five-state cycle, the status polling, and the per-pod offsets are all
still exactly as the slide describes. The 4-second figure is not.

It is worth saying why the queue-and-poll machinery was kept anyway rather than collapsed into a
synchronous call: it costs almost nothing, it keeps the UI contract identical across a hardware
change, and the next sensor family may well block again.

---

## What's next

**A certified reference gas, which is the only thing that can measure span.** Deliverable 2.5.2 is
explicit: expose all three sensors to a certified reference concentration, record measured against
known, and calculate the error for each sensor. That is a second calibration point, and a second
point is what turns a single-point offset fix into a real two-point calibration with both `b` and `s`
determined. Everything in the "offset and span" section above is currently half-solved for exactly
this reason.

**A documented per-sensor error budget.** Deliverable 2.5.9 requires the validation results to be
compiled into a report with any item that misses its acceptance criteria flagged and a corrective
action written down. For this module that means a table with a row per pod and a column per error
term — zero, span, quantisation, temperature, pressure, humidity — with a measured number in it, so
that a stated `f_rb` can carry an uncertainty instead of a decimal place. Nobody can write that table
today because nobody has taken the measurements.

**T90 alongside it.** Deliverable 2.5.5 measures the step response, and it belongs in the same
session as 2.5.2 because it uses the same gas and the same fixture — introduce the step, record the
time to 90 % of the final reading, and confirm it meets what the experiment needs. `M6` owns the
concept; this is where the number gets taken.

**Two things worth logging that currently are not.** The offsets are applied to every reading before
it is written and no column records them, so two sessions taken with different calibrations produce
structurally identical, non-comparable files. And no calibration carries a date. Both are a column
each.

**And the open question `C16` left.** Whether ARES should be on the 5 % SprintIR variant rather than
the 20 % one is a calibration question as much as a range question: the 5 % part resolves 1 ppm
instead of 10, which divides the quantisation contribution to a difference by ten. That contribution
turns out to be the *smallest* term in the table above, which is an argument that resolution is not
where the wins are — but it is an argument that can only be made once 2.5.2 has produced the numbers
that go beside it.

---

**Sources.** Current state — the two calibration mechanisms and their op names (`fresh_air`,
`abc_on`, `abc_off`, `co2_offset`, `co2_target`), `G` zeroing against the stored ~400 ppm fresh-air
value, `@ 0` / `@ 1.0 8.0`, the deliberately unwired `X <value>`, the NVS namespace `cal` and keys
`c0`–`c2`, the incremental `co2_target` arithmetic, `applyCO2Offset()`'s clamp, ABC being disabled
unconditionally at boot and why, the `CalState` five-state enum, `applyCalibration()` /
`processCalJob()` / `runCalOnSensor()`, the batch all-or-nothing reporting, sensor reads being
suspended in `CAL_PENDING` and `CAL_RUNNING`, the `CAL_STATUS` notify on state change and the
`/cal_status` JSON, and the GSS zero commands echoing immediately where the SenseAir background
calibration needed a ~4 s lamp cycle: `C:\Users\Henry\Documents\ARES\ARES2ESP32\CLAUDE.md` §"Sensor
Architecture", §"Web Interface" and §"Common Gotchas", and `src/main.cpp` — `co2Offset[]` at 154, the
`CalType` / `CalState` enums and `calJob` at 159–168, `sendCalStatusNotify()` at 477,
`applyCalibration()` at 494, `processCalJob()` at 546, `applyCO2Offset()` at 573, `runCalOnSensor()`
at 443, `probeAndInitCO2()`'s `@ 0` at 430, the warm-up suppression at 636, the `/cal_status` handler
at 1081, the offset restore at 1430, and the calibration block in `loop()` at 1681–1695. The
calibration design, the per-pod NVS offsets, ABC disabled on boot to stop indoor sub-300 ppm drift,
the live status feedback, and the five-state cycle: `ARES_7_30_26.pptx` slide 6 — which also carries
the SenseAir lamp-cycle line noted above as historical. The certified-reference-gas validation, the
T90 measurement, and the validation report: `ARES_CO2_Headset_Summer2026_Deliverables.docx` subtasks
2.5.2, 2.5.5 and 2.5.9. Unit-to-unit zero offsets, the 5–21 ppm uncorrected RMSE range, the
step-by-step correction table, the failure of generalised coefficients, the four-week regression
stability and the unknown drift beyond one month, and the 423 ppm rooftop mean: Martin et al. (2017),
*Atmos. Meas. Tech.* 10, 2383–2395, §4, §5.1, §6.2, §6.3 and Table 1 (`lit/SOURCES.md`, `martin2017`)
— note that those are SenseAir K30 parts, not SprintIRs. Quantisation, the 10 ppm step and the
`step/√12` standard deviation, the pressure sensitivity of an NDIR reading, and the display-layer
`1013.25 / press_hpa` correction in `co2_correction.dart`: `C16`. The rebreathed-fraction formula and
its three caveats: `GLOSSARY.md` §2 and `C13`. The 38,000 ppm exhaled constant and the rebreathing
label bands: `V16`, from `app/lib/science/constants.dart` and `rebreathing.dart`. Every worked number
in this file is recomputed in `videos/V17-three-pods-disagree.md`; the 480 / 455 / 610 readings are a
worked teaching scenario, not a measurement — whether the real pods are that far apart is what
deliverable 2.5.2 exists to find out.
