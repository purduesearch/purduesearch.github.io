# E07 — Run a fresh-air calibration

> CONTENT section · ARES 101 · M10 · ~2 min to read, 60–75 minutes to do
> Seeded into `contentJson` as rich text. Depends on `C21` (offset versus span, the fresh-air
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
