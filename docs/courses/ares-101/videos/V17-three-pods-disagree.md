# V17 — Worked problem: three pods disagree

| | |
|---|---|
| **Course / section** | ARES 101 · M10 · "Worked problem: three pods disagree" |
| **Runtime** | 10:10 |
| **Format** | Tablet handwriting over slide backdrop + VO |
| **Backdrop** | Static slide: a head outline with **top**, **forehead** and **chin** pods marked, each with an empty reading box beside it, writing area to the right. From 03:12 the backdrop swaps to a **two-column comparison board** — `UNCALIBRATED` on the left, `CALIBRATED` on the right, with `f_rb = (C_chin − C_top) / (C_exhaled − C_top)` printed across the top of both. From 04:56 it swaps to a **label-band chart**: a vertical axis 0–4 % with the four rebreathing bands drawn as horizontal stripes, three empty signal-level rows beneath. From 06:44 it swaps to a **calibration graph** — true ppm on x, reading on y, both axes 0–2,000, the 1:1 line drawn faintly. From 07:52 it swaps to the blank board with a barometer drawn top-left |
| **Prerequisite on screen** | Nothing. The rebreathed-fraction formula is rewritten before use |
| **Recorded** | ☐ |

## Purpose

`C21` makes a claim in bold that a reader is entitled to disbelieve: that an uncalibrated headset
does not produce a noisy result, it produces a **confidently wrong** one. This is where a viewer
earns it with a pencil.

The video has one structural idea and everything in it is a consequence:

> **Rebreathed fraction is a difference of two sensor readings, so it carries both sensors' errors —
> and what lands in the numerator is not either pod's error, it is the gap between them.**

Part 1 turns three disagreeing fresh-air readings into three offsets. Part 2 computes the rebreathed
fraction from the uncalibrated pair and from the calibrated pair and puts the two answers side by
side. Part 3 runs the same defect at three signal levels and finds the tier flip where nobody expects
it — at the *baseline*, not at the peak. Parts 4 and 5 are the two errors calibration does **not**
fix: span, and pressure.

A viewer who leaves able to apply an offset but unable to say why a shared error cancels and an
unshared one does not has missed the point of the module.

## Values used, and where they come from

**Three of these are shipped constants and the rest are worked teaching values.** The distinction is
captioned on screen at 00:26 and again at 05:56.

| Symbol | Value | Source |
|---|---|---|
| Fresh-air readings, top / forehead / chin | 480 / 455 / 610 ppm | **Worked scenario.** Not measured — the spread deliverable 2.5.2 will actually find is unknown |
| Assumed fresh-air truth | **400 ppm** | **Shipped.** The SprintIR's stored fresh-air value that `G` zeroes against; also the app's `co2_target` default |
| Stored offsets before calibration | top 0.0, forehead **−5.0**, chin 0.0 ppm | **Worked assumption**, chosen so the forehead reading is off the 10 ppm grid |
| Sensor quantisation | 10 ppm | `C16`, SprintIR-6S-20 % |
| `C_chin`, calibrated | 1,850 ppm | `V12` and `V16`, reused unchanged so all three videos compare |
| `C_top`, calibrated | 700 ppm | `V12` and `V16`, reused unchanged |
| `kExhaledCo2Ppm` | **38,000 ppm** | **Shipped constant.** `app/lib/science/constants.dart:2` |
| Rebreathing label bands | None <0.2 % · Low <1 % · Moderate <3 % · High ≥3 % | **Shipped.** `rebreathing.dart` `rebreathingLabel()` |
| Span error used in Part 4 | `s` = +0.03 | **Worked value.** It is the K30's specified span term in `L10`'s paper, borrowed to show the *size* of the effect. GSS's figure for the SprintIR is not something this course has verified |
| Ambient pressure | 950 hPa | `V14`, reused unchanged |
| Standard atmosphere | 1013.25 hPa | `GLOSSARY.md` §4 |
| Display-layer correction | `× 1013.25 / press_hpa` | **Shipped.** `app/lib/services/co2_correction.dart` |

### Part 1 — from three readings to three offsets

The app's `co2_target` op is **incremental**: `co2Offset[i] += (target − co2Ppm[i])`, where
`co2Ppm[i]` is the reading *already carrying* the stored offset.

| Pod | Reads | On the 10 ppm grid? | Stored offset | Correction `400 − reading` | New stored offset | Implied raw |
|---|---|---|---|---|---|---|
| Top | 480 | yes | 0.0 | **−80** | **−80.0** | 480 |
| Forehead | 455 | **no** | −5.0 | **−55** | **−60.0** | 460 |
| Chin | 610 | yes | 0.0 | **−210** | **−210.0** | 610 |

Checks, all exact: `480 − 80 = 400`; `460 − 60 = 400`; `610 − 210 = 400`.

| Quantity | Working | Value | On screen as |
|---|---|---|---|
| Spread of the three | `610 − 455` | 155 ppm | **155 ppm apart** |
| Mean of the three | `1545 / 3` | 515 ppm | 515 — **and 515 is not the answer** |
| Mean's own error | `515 − 400` | +115 ppm | +115 |
| Top-to-chin gap | `610 − 480` | 130 ppm | **130 ppm** — boxed, reappears at 04:14 |

### Part 2 — the same session, twice

`C_chin` = 1,850 and `C_top` = 700 are the **calibrated** values. The uncalibrated readings are what
the pods report before the offsets are applied: `raw = calibrated − offset`.

| Pod | Calibrated | Offset | Uncalibrated raw |
|---|---|---|---|
| Chin | 1,850 | −210 | **2,060** |
| Top | 700 | −80 | **780** |

| Quantity | Working | Value | On screen as |
|---|---|---|---|
| Numerator, calibrated | `1850 − 700` | 1,150 ppm | 1,150 |
| Denominator, calibrated | `38000 − 700` | 37,300 ppm | 37,300 |
| **`f_rb`, calibrated** | `1150 / 37300` | 0.0308311 | **3.083 % — "High"** |
| Numerator, uncalibrated | `2060 − 780` | 1,280 ppm | 1,280 |
| Denominator, uncalibrated | `38000 − 780` | 37,220 ppm | 37,220 |
| **`f_rb`, uncalibrated** | `1280 / 37220` | 0.0343901 | **3.439 % — "High"** |
| Overstatement | `1280×37300 / (37220×1150)` | 1.115435 | **11.54 % too high** |
| — from the numerator | `1280 / 1150` | 1.1130435 | +11.30 % |
| — from the denominator | `37300 / 37220` | 1.0021494 | +0.21 % |
| **Numerator error** | `b_top − b_chin = −80 − (−210)` | **+130 ppm** | **130 ppm — and neither pod is off by 130** |
| As a share of the signal | `130 / 1150` | 0.113043 | 11.3 % of the signal |

### Part 3 — the same 130 ppm at three signal levels

The numerator error is a **fixed 130 ppm**. The denominator factor is a fixed
`1 + 80/37220 = 1.0021494`. So the whole result is:

```
f_uncal / f_cal = (Δ + 130) / Δ  ×  1.0021494        with Δ = C_chin − C_top, calibrated
```

| Case | `C_chin` cal | `C_top` cal | Δ | `f_rb` cal | Label | `C_chin` raw | `C_top` raw | Δ raw | `f_rb` uncal | Label | Overstatement |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **A — peak rebreathing** | 1,850 | 700 | 1,150 | `1150/37300` = **3.083 %** | High | 2,060 | 780 | 1,280 | `1280/37220` = **3.439 %** | High | **+11.5 %** |
| **B — moderate** | 1,150 | 700 | 450 | `450/37300` = **1.206 %** | Moderate | 1,360 | 780 | 580 | `580/37220` = **1.558 %** | Moderate | **+29.2 %** |
| **C — baseline** | 750 | 700 | 50 | `50/37300` = **0.134 %** | **None** | 960 | 780 | 180 | `180/37220` = **0.484 %** | **Low** | **×3.61** |

Case C's factor, exactly: `(180/50) × 1.0021494 = 3.6077`.

### Part 4 — the error a single-point calibration cannot touch

A sensor with span error `s` and zeroed at 400 ppm reads `C + s·(C − 400)`.

| Quantity | Working | Value | On screen as |
|---|---|---|---|
| Chin, `s` = 0.03, after the fresh-air zero | `1850 + 0.03 × 1450` | 1,893.5 ppm | 1,893.5 |
| Top, same | `700 + 0.03 × 300` | 709.0 ppm | 709.0 |
| Measured difference | `1893.5 − 709.0` | 1,184.5 ppm | 1,184.5 |
| Error in the difference | `1184.5 − 1150` | +34.5 ppm | **= 0.03 × 1150 exactly** |
| `f_rb` | `1184.5 / 37291` | 0.0317637 | **3.176 % — "High"** |
| Overstatement | `1.03 × 37300/37291` | 1.0302485 | **+3.02 %** |

The point on screen: **a shared span error costs a fixed 3 % of the difference, at every signal
level.** Run it at Case C: `50 × 1.03 = 51.5`, error +1.5 ppm, still 3 %. Compare that with the zero
error's ×3.61 in the same row.

### Part 5 — the pressure correction at 950 hPa

| Quantity | Working | Value | On screen as |
|---|---|---|---|
| Pressure factor `k` | `1013.25 / 950` | 1.0665789 | 1.0666 — **+6.66 % on every reading** |
| Chin, corrected | `1850 × k` | 1,973.171 ppm | 1,973 |
| Top, corrected | `700 × k` | 746.605 ppm | 747 |
| Difference, corrected | `1150 × k` | 1,226.566 ppm | **1,226.6 — up 76.6 ppm** |
| Denominator | `38000 − 746.605` | 37,253.4 ppm | 37,253 |
| **`f_rb`, corrected** | `1226.566 / 37253.4` | 0.0329249 | **3.293 % — "High"** |
| Change from the uncorrected calibrated answer | `k × 37300/37253.4` | 1.0679133 | **+6.79 %** |

Note the two figures deliberately differ: the correction is +6.66 % on each *reading* and +6.79 % on
`f_rb`, because the denominator's `− C_top` term grows too.

### The summary table — what cancels, what does not

This is the last thing on screen and the reason the video exists.

| Error, present on both pods | Form | What it does to `C_chin − C_top` | In this problem |
|---|---|---|---|
| Shared zero error — a stale 400 ppm baseline | additive, equal | **cancels exactly** | 25 ppm each → 0 ppm; moves `f_rb` by 0.067 % |
| **Different** zero errors — uncalibrated pods | additive, unequal | **survives at full size**, as `b_top − b_chin` | **130 ppm → +11.5 %** |
| Shared span error | multiplicative, equal | **scales it** by `s` | 3 % → +3.02 % |
| Pressure correction | multiplicative, equal | **scales it** by `k` | +6.66 % → +6.79 % |
| Independent random noise | random | `σ√2`, adds in quadrature | 2.9 → **4.1 ppm** |

And the two error magnitudes on one line, for `f_rb` = 3.083 %:

| | Effect on `f_rb` |
|---|---|
| Quantisation noise, σ = 2.9 ppm per pod | ±0.011 pp — **0.35 % of the answer** |
| Sensor noise at five times that, σ = 5 ppm | ±0.019 pp — **0.61 % of the answer** |
| Two uncalibrated pods | **+11.5 % of the answer** |
| Ratio | **about nineteen times** |

The sensitivity used for those: `∂f/∂C_chin = 1/37300 = 2.681 × 10⁻⁵` per ppm and
`∂f/∂C_top = (1850 − 38000)/37300² = −2.598 × 10⁻⁵` per ppm, combined in quadrature as
`3.733 × 10⁻⁵` per ppm of per-pod noise.

## Shot list

| Time | On screen | What is written |
|---|---|---|
| 00:00–00:26 | Backdrop, three empty reading boxes | `480` into the top box, `455` into the forehead box, `610` into the chin box, one at a time |
| 00:26–00:40 | Boxes held; a cloud and a tree drawn beside the head | *genuine outdoor air* written under the head, then underlined |
| 00:40–00:58 | **PAUSE CARD 1** over dimmed board | "Same air, three sensors. Which one is right, and how do you know?" |
| 00:58–01:24 | Board | `610 − 455 = 155 ppm apart`; then `(480+455+610)/3 = 515`, then a hard line struck through `515` |
| 01:24–01:44 | Board | `400` written large, circled, and labelled `the claim, not a measurement`; arrows from it to all three boxes |
| 01:44–02:14 | The forehead box circled | `455`; then `45.5 × 10` written and crossed out; then `10 ppm grid` written and `455` circled again with `somebody has calibrated this pod` beside it |
| 02:14–02:56 | Board, three rows | `400 − 480 = −80`; `400 − 455 = −55`, then `−5 + (−55) = −60` on the next line; `400 − 610 = −210`. Then the three checks `480−80=400`, `460−60=400`, `610−210=400` ticked |
| 02:56–03:12 | Board; `130` written between the top and chin rows | `610 − 480 = 130`, boxed and left on screen |
| 03:12–03:30 | **Backdrop swaps to the two-column comparison board** | The formula copied once across the top; `1,850` and `700` written in the right column, `2,060` and `780` in the left |
| 03:30–03:48 | **PAUSE CARD 2** | "Compute the rebreathed fraction both ways. `C_exhaled` = 38,000. Which label does each one get?" |
| 03:48–04:14 | Both columns filled downward simultaneously | Right: `1150`, `37300`, `0.03083`, **`3.083 % High`**. Left: `1280`, `37220`, `0.03439`, **`3.439 % High`** |
| 04:14–04:38 | Board beneath the two columns | `1280 − 1150 = 130`; the boxed `130` from 02:56 slid down beside it; `−80 − (−210) = +130` |
| 04:38–04:56 | Board | `130 / 1150 = 11.3 %`; `× 1.00215 → 11.5 %`; then, very large, `neither pod is off by 130` |
| 04:56–05:16 | **Backdrop swaps to the label-band chart**; Case A plotted as two dots, 3.083 and 3.439, both in the High stripe | `A` written beside them; a bracket labelled `+11.5 %` |
| 05:16–05:34 | Case B plotted, 1.206 and 1.558, both in the Moderate stripe | `B`; bracket labelled `+29.2 %` |
| 05:34–05:56 | Case C plotted, 0.134 in None and 0.484 in Low, **with the band line drawn between them** | `C`; bracket labelled `× 3.61`; the None/Low line thickened |
| 05:56–06:24 | Chart held; the three brackets side by side | `Δ = 1150 → 450 → 50` written under the three cases, and `error = 130 ppm` written once, unchanged, under all three |
| 06:24–06:44 | Board corner | `±0.011` and `+11.5 %` written one above the other, then `19 ×` between them |
| 06:44–07:10 | **Backdrop swaps to the calibration graph**; a line drawn through the origin above the 1:1 line | `reading = (1+s)·C + b`; `s` and `b` labelled on the graph — `b` as a vertical shift, `s` as a tilt |
| 07:10–07:32 | The line pulled down until it crosses the 1:1 line **at 400** | `one point fixes one number`; the residual gap at 1,850 drawn as a vertical arrow |
| 07:32–07:52 | Board beside the graph | `1850 + 0.03×1450 = 1893.5`; `700 + 0.03×300 = 709`; `1184.5 − 1150 = 34.5`; `= 3 % of 1150` boxed. Then `50 × 1.03 = 51.5` written small underneath |
| 07:52–08:12 | **Backdrop swaps to the blank board**, barometer drawn | `950 hPa`; `1013.25 / 950 = 1.0666` |
| 08:12–08:28 | **PAUSE CARD 3** | "Both pods are read at 950 hPa. The correction multiplies both by 1.0666. Does it cancel in the difference?" |
| 08:28–08:36 | Board | `NO` written at full board height |
| 08:36–09:06 | Board | `1150 × 1.0666 = 1226.6`; `+76.6 ppm`; then `1226.6 / 37253 = 0.03293` → **`3.293 %`**; `+6.79 %` beside it |
| 09:06–09:30 | **The summary table drawn as five rows**, one at a time | `cancels` · `130 ppm` · `× 1.03` · `× 1.0666` · `√2 σ` |
| 09:30–10:10 | Board cleared; two lines across the bottom | *An uncalibrated headset is not noisy.* / *It is confidently wrong, and it is worst where the signal is smallest.* |

## Visual edits

| Time | Edit | Why |
|---|---|---|
| 00:26 | **Lower third:** "480 / 455 / 610 is a worked scenario. Nobody has measured the real spread — that is deliverable 2.5.2" | The whole video is built on these three numbers and a viewer must not leave quoting them as a finding |
| 01:16 | The struck-through `515` is **left on screen for the rest of Part 1** | Averaging three biased sensors is the single most common wrong instinct here. Leave the corpse visible |
| 01:30 | The circled `400` gets an arrow to **each** of the three boxes, drawn slowly, one at a time | One external claim makes all three sensors knowable at once. Show it arriving three times |
| 01:52 | `455` is written again with the **last digit in a second colour** | The whole tell is one digit. Colour it |
| 02:44 | The three checks are ticked **left to right in silence** | Arithmetic that closes is worth three seconds of nothing |
| 02:56 | `130` is boxed and **not erased when the backdrop swaps at 03:12** — it is carried across and parked in the corner | It is the answer to Part 2 and it is on screen before the question is asked |
| 03:48 | The two columns are filled **in parallel, line by line**, never one column then the other | The comparison is the lesson. Same operation, two inputs, two answers |
| 04:20 | The parked `130` slides down and lands **exactly on** the `1280 − 1150` result | Two independent routes to one number. Make them touch |
| 04:50 | `neither pod is off by 130` written at full board height, held 3 s in silence | This is the sentence people misremember. It gets the space |
| 05:44 | Case C's two dots are plotted and then the **None/Low band line is drawn between them**, thickened | The tier flip is at the baseline, not the peak. One line makes it a picture |
| 05:56 | **Lower third:** "the calibration error is the same 130 ppm in all three rows" | The constancy of the error is the whole of Part 3 |
| 06:16 | The three `Δ` values are written **descending** and the three brackets **ascending** in size | The inverse relationship should be visible before it is said |
| 06:34 | `±0.011` is written in a thin, light stroke and `+11.5 %` in a heavy one | Two error bars, drawn at their true relative weight |
| 07:20 | The calibration line is **animated** downward until it crosses the 1:1 line at 400, and the residual gap at 1,850 is left as an arrow | "A single point fixes one number" is a statement about geometry. Show the geometry |
| 07:46 | `50 × 1.03 = 51.5` written **directly beneath** Case C's `× 3.61` from the previous backdrop, recalled as a small inset | Span versus zero at the same signal level, in one glance |
| 08:28 | The `NO` is written at full board height | Every instinct says a common factor cancels. It cancels in a *ratio*, not in a difference |
| 08:58 | `3.083` and `3.293` written side by side and a bracket drawn between them labelled `same air, same second` | Nothing physical changed. Only a convention |
| 09:02 | **Lower third:** "the CSV never takes this correction; the pod card can" | `C16` and `C20`'s data-contract point, arriving where it costs something |
| 09:12 | The five summary rows are drawn with **`cancels` in one colour and everything else in another** | One row is different in kind from the other four |
| 09:36 | Final two lines held for the full 30 s, no further writing | Q21 tests both halves and `C21` prints the first one in bold |

## Narration

**[00:00 — three numbers]**

Three sensor pods. One above the crown, one at the brow, one under the chin. They are eight
centimetres apart on the same headset, and right now they are all sampling the same air.

*(writing, one box at a time)*

The top pod says four eighty. The forehead says four fifty-five. The chin says **six hundred and
ten.**

*(beat)*

And I have taken this headset outdoors. Genuinely outdoors — a field, not a doorway, held at arm's
length, upwind of me, with five minutes to settle.

**[00:40 — pause 1]**

So: same air, three sensors, three answers.

Which one is right, and how do you know?

*(pause — hold the card)*

**[00:58 — the honest answer]**

They disagree by a hundred and fifty-five parts per million.

*(writing)*

And here is the answer nobody likes: **from these three numbers alone, you cannot tell.** You know
at least two of them are wrong, because they cannot all be describing the same air. You do not know
which. And you certainly do not fix it by averaging.

*(writing, then the line through it)*

Five fifteen. That is the mean, and it is not the truth — it is a biased average of three biased
instruments, and the only thing averaging has done is make the error look like a result.

**[01:24 — the thing that makes it solvable]**

What breaks the deadlock is not more data. It is a **claim from outside**.

*(writing, circling)*

Four hundred parts per million. That is what the sensor's own fresh-air value says well-mixed
outdoor air is. It is not a measurement I took; it is an assumption I am importing, and everything
that follows is only as good as it.

*(the three arrows)*

But import it once and all three sensors become knowable **at the same instant**. That is what a
calibration reference is. Not a better sensor. An outside claim.

**[01:44 — the digit that gives the game away]**

Before we use it — look again at the forehead pod.

*(circling)*

Four hundred and **fifty-five**.

M5 told you this part reports raw counts times a multiplier, and on the twenty percent variant the
multiplier is ten. Every number this sensor can produce is a multiple of ten. Four eighty, fine. Six
ten, fine.

Four fifty-five is not on the grid.

*(writing)*

Which means the number on that card is not what the sensor said. It has already had a software
offset added to it. Somebody has calibrated this pod before, and the last digit is the only place
that fact is visible.

It does **not** tell you what the offset is. For that you have to read the calibration status
characteristic, and when you do, it says minus five.

**[02:14 — three offsets]**

Now the arithmetic, and it is the easiest arithmetic in this course.

*(writing, three rows)*

Top: four hundred minus four eighty is **minus eighty.**

Forehead: four hundred minus four fifty-five is minus fifty-five — and because the app's calibrate-
to-a-known-value operation *adds* to whatever is already stored, the new offset is minus five plus
minus fifty-five, which is **minus sixty.**

Chin: four hundred minus six ten is **minus two hundred and ten.**

*(the three checks)*

Check them. Four eighty minus eighty, four hundred. Raw four sixty minus sixty, four hundred. Six
ten minus two hundred and ten, four hundred.

*(silence, three ticks)*

Three pods, one number.

**[02:56 — one more number before we move on]**

Keep one thing from this board.

*(writing, boxing)*

The top pod and the chin pod — the two that go into the rebreathing measurement — are a hundred and
thirty parts per million apart.

Remember that. It is the whole video.

**[03:12 — the same session, twice]**

Part two. The headset goes on a subject.

*(the two columns)*

The chin pod is reading eighteen fifty and the top pod seven hundred — **after** the offsets. Before
them, the same instant, the same air, those pods report twenty sixty and seven eighty.

Two columns. Same subject, same second, same formula. One has been calibrated and one has not.

**[03:30 — pause 2]**

Compute the rebreathed fraction both ways. Exhaled constant, thirty-eight thousand.

Then look up the label each one gets.

*(pause — hold the card)*

**[03:48 — both answers]**

*(filling both columns in parallel)*

Calibrated. Eighteen fifty minus seven hundred, **eleven fifty**. Thirty-eight thousand minus seven
hundred, thirty-seven thousand three hundred. Divide: nought point nought three nought eight three.
**Three point nought eight three percent. High.**

Uncalibrated. Twenty sixty minus seven eighty, **twelve eighty**. Thirty-eight thousand minus seven
eighty, thirty-seven thousand two twenty. Divide: **three point four three nine percent. Also
High.**

*(beat)*

Same band. Now look at how far apart they are.

**[04:14 — and here is the thing to take away]**

*(writing)*

Twelve eighty minus eleven fifty. **A hundred and thirty.**

*(the boxed 130 slides down and lands on it)*

That is the number I asked you to keep, and it did not come from the session at all. It came from
two pods standing on a table in a field.

*(writing)*

Because look at where it comes from algebraically. The error in a difference is the **difference of
the errors**. Minus eighty, minus minus two hundred and ten. Plus a hundred and thirty.

**[04:38 — the sentence]**

A hundred and thirty over eleven fifty is **eleven point three percent** of the signal, and the
denominator moves a fraction of a percent more, so the headset overstates this subject's rebreathing
by **eleven and a half percent.**

*(writing, full height, then silence)*

**Neither pod is off by a hundred and thirty.** One is off by eighty. One is off by two hundred and
ten. The error that lands in your result is a number that does not describe either sensor.

*(hold)*

That is what it means for a measurement to be a difference. You do not inherit one sensor's accuracy.
You inherit the *disagreement*.

**[04:56 — now do it three times]**

Part three, and this is where it stops being an academic eleven percent.

*(the chart, case A)*

Case A is what we just did. Peak rebreathing, eleven fifty of signal. Three point oh eight becomes
three point four four. Both High. Eleven and a half percent.

*(case B)*

Case B: an ordinary moment in the same session. Chin eleven fifty, top seven hundred — four hundred
and fifty of signal. One point two one becomes one point five six. Both Moderate. But now the
overstatement is **twenty-nine percent.**

*(case C, drawn slowly)*

Case C. The subject is sitting upright in a ventilated room with the fan on. The chin pod reads
seven fifty against a top of seven hundred. **Fifty parts per million of signal.** Nought point one
three four percent — the app calls that **None**.

Uncalibrated? Nought point four eight four percent. **Low.**

*(the band line drawn between the two dots)*

Three point six times too high, and it has crossed a band. A subject with essentially no rebreathing
is reported as having some.

**[05:56 — why the pattern**]

*(writing under the three cases)*

And nothing changed between those rows. The error is the same hundred and thirty parts per million
in all three. What changed is what it is being compared against — eleven fifty, then four fifty,
then fifty.

*(the descending numbers, the ascending brackets)*

**A fixed error in a difference does its worst damage where the signal is smallest.** And on this
project the smallest signal is the *control* condition. It is the upright baseline you subtract the
supine session from. It is the fresh-air night you compare the cave night to.

The place this defect hurts most is the place your experiment gets its meaning from.

**[06:24 — versus the noise]**

One number to kill an objection.

*(the two strokes)*

The sensor quantises to ten parts per million, so each pod carries about two point nine of
quantisation noise; through this formula that is about **one hundredth of a percentage point** on an
answer of three point oh eight. Give it five ppm per pod instead — five times the quantisation floor
— and it is two hundredths.

*(the ratio written between them)*

Against eleven and a half percent of calibration error. **Nineteen times.**

So no: an uncalibrated headset does not give you a scattered plot that a reader would know to
distrust. The noise is invisible. The error is enormous. And it is *smooth*.

**[06:44 — what calibration did not fix]**

Part four, and it is short, because there is one thing that survived everything we just did.

*(the graph, the line)*

Model a sensor as a straight line. `Reading equals one plus s, times the truth, plus b`. `b` shifts
the line up. `s` tilts it.

*(the line pulled down to cross at 400)*

A fresh-air calibration gives you **one point** — four hundred. So you can slide the line until it
touches the truth at four hundred. That is one number, and it fixes `b`.

*(the residual arrow)*

The tilt is still there.

*(writing)*

Three percent of span, say. At eighteen fifty the chin now reads **eighteen ninety-three point five**
— it was zeroed at four hundred, so the span error is three percent of the fourteen hundred and
fifty ppm between here and there. Top pod, seven hundred: **seven hundred and nine.** Difference:
eleven eighty-four point five.

*(boxing)*

Thirty-four and a half ppm of error — which is **exactly three percent of eleven fifty.** A shared
span error costs you a fixed *percentage* of the difference. Run it at Case C: fifty becomes fifty-one
point five. Still three percent.

*(beat)*

Which is a genuinely different animal from the zero error. A zero error is a fixed **number** of
ppm, so it explodes as the signal shrinks. A span error is a fixed **fraction**, so it does not.
Single-point calibration removes the one that explodes. It cannot touch the other, and the only
thing that can is a second known concentration in a cylinder.

**[07:52 — pressure]**

Last part.

*(the barometer)*

You take this headset to nine hundred and fifty hectopascals. M5 showed you why an NDIR reading is
low there — fewer molecules in the path — and the correction, which the app can apply on the pod
cards, is ten thirteen point two five over nine fifty. **One point oh six six six.**

Both pods get multiplied by it. The same factor.

**[08:12 — pause 3]**

So. A common factor on both readings.

Does it cancel in the difference?

*(pause — hold the card)*

**[08:28 — no]**

*(full height)*

**No.**

A common *additive* error cancels in a difference. A common *multiplicative* factor does not — it
scales it.

*(writing)*

Eleven fifty times one point oh six six six is **twelve twenty-six point six.** The difference grew
by seventy-six point six parts per million, which is more than half the size of the calibration
error we spent the first half of this video on.

*(the fraction)*

Rebreathed fraction: twelve twenty-six point six over thirty-seven thousand two fifty-three. **Three
point two nine three percent.** Against three point oh eight three.

*(the bracket)*

Six point eight percent apart. Same air. Same second. Same sensors, both properly calibrated. The
only difference is whether somebody had a toggle switched on — and the correction lives in the app's
display layer, so the pod card can take it and the CSV never does. Nothing in the file records which
convention a number was taken under.

**[09:06 — the whole video in five rows]**

*(the table, one row at a time)*

A zero error both pods **share** — a stale four hundred, wrong for everybody — cancels exactly.
Nothing.

A zero error they **don't** share survives at full size. A hundred and thirty parts per million.

A span error they share scales the difference by three percent.

A pressure correction scales it by six and two-thirds percent.

And random noise adds in quadrature — root two times either sensor, four point one ppm, and
irrelevant next to any of the others.

*(beat)*

One of those five is free. The others are the error budget, and only one of them has been measured.

**[09:30 — the two sentences]**

*(the final lines)*

An uncalibrated headset is not noisy.

*(beat)*

It is confidently wrong — and it is worst exactly where the signal is smallest, which is your
baseline.

*(hold, fade)*

---

**Word count:** ~1,880 · **Target pace:** 150 wpm + three 18-second pauses + written-arithmetic dwell
and two deliberate 3-second silences at 02:50 and 04:50 ≈ 10:10

## Notes for the recorder

- **The 00:26 caption is not optional.** 480 / 455 / 610 is a scenario. If a viewer leaves quoting
  "the pods are 155 ppm apart" as a finding about ARES hardware, this video has done net harm. The
  real spread is deliverable 2.5.2 and nobody has taken it.
- **Do not erase the struck-through `515`.** Averaging three biased sensors is the wrong instinct
  everybody has, and the correction only sticks if the wrong answer stays visible next to the right
  one. Same discipline as `V15` at 06:02 and `V16` at 01:38.
- **The `130` must be boxed at 02:56 and physically carried across the backdrop swap.** The whole
  video is the moment at 04:20 when a number derived from a field measurement lands on top of a
  number derived from a session. If that edit is cut, cut Part 4 instead.
- **`neither pod is off by 130` gets the full board and three seconds of silence.** It is the one
  sentence a viewer is most likely to nod at and not absorb. Give it the room.
- **Case C is the point of Part 3, not Case A.** If time is short, shorten Case B. The tier flip is
  at the baseline and the baseline is what the experiment subtracts from — that is the beat that
  changes how somebody runs a session.
- **Say "the difference of the errors", never "the sum".** The signs matter and a viewer who
  remembers it as a sum will not be able to say why two equally-wrong pods give a perfect answer.
- **Part 4's per-pod numbers, 1,893.5 and 709.0, are exact arithmetic and the real sensor would
  round them to its 10 ppm grid.** Do not caption this — it is a distraction — but do not let a
  viewer's question about it go unanswered if it comes up in a session: the *difference* result,
  exactly 3 % of 1,150, is a property of the model and does not depend on the grid.
- **The `NO` at 08:28 is the second beat people misremember**, for the same reason as `V16`'s `0` at
  04:20 and in the opposite direction. There, an instinct said a common delay must cost something and
  it cost nothing. Here, an instinct says a common factor must cancel and it does not. Both beats are
  about the difference between a difference and a ratio. If both videos are being recorded in one
  session, say so out loud.
- **Do not say the headset is broken or the data is worthless.** It is not: every number in this
  video is fixable in five minutes with a field and a phone, which is exactly what `E07` has the
  viewer do next. A viewer who leaves distrusting the instrument has learned the wrong thing. The
  lesson is that calibration is not hygiene, it is part of the measurement.
- Say **"span"**, not "gain", on first use, then use both. The app and the deliverables document both
  say span.
- Every number is in the values tables above. If the tablet disagrees with those tables, the tablet
  is wrong.
