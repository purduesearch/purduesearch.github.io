# V16 — Worked problem: rebreathing and respiration rate

| | |
|---|---|
| **Course / section** | ARES 101 · M8 · "Worked problem: rebreathing and respiration rate" |
| **Runtime** | 10:40 |
| **Format** | Tablet handwriting over slide backdrop + VO |
| **Backdrop** | Static slide: a head outline with **chin** and **top** pods marked, writing area to its right. From 03:10 the backdrop swaps to a two-trace time axis (chin above, top below) with the writing area beneath. From 05:40 it swaps to an empty spectrum axis — frequency in Hz along the bottom, a second axis in BrPM beneath it, writing area to the right. From 08:50 it swaps to an empty **fold chart**: true rate 6–24 BrPM on x, reported rate 6–24 BrPM on y, with the 45° identity line drawn faintly |
| **Prerequisite on screen** | Nothing. The rebreathed-fraction formula is rewritten before use |
| **Recorded** | ☐ |

## Purpose

`C19` makes two claims a reader has to take on trust: that a number the app prints can be moved by a
constant nobody measured, and that the respiration model is bounded by its **input rate** rather than
by its mathematics. This is where a viewer earns both with a pencil.

Part 1 reuses `C13`'s rebreathed fraction — unchanged, not redefined — and adds `C17`'s transport
delay to it. Part 2 works the FFT respiration model forward, correctly, on a real subject. Part 3 is
the payoff and the reason the video exists:

> **The same model, the same subject, two different real breathing rates — and one identical
> reported number, at identical confidence. A transform integrates over a window. A detector counts
> events in time. Only one of those can say "zero".**

A viewer who leaves able to compute a rebreathed fraction but unable to say why NASA trained a neural
network to count breaths has missed the point of the module.

## Values used, and where they come from

**Two of these are shipped constants and the rest are worked teaching values.** The distinction is
captioned on screen at 00:48 and again at 05:52.

| Symbol | Value | Source |
|---|---|---|
| `C_chin` | 1,850 ppm | `V12`, reused unchanged so the two videos can be compared |
| `C_top` | 700 ppm | `V12`, reused unchanged |
| `kExhaledCo2Ppm` | **38,000 ppm** | **Shipped constant.** `app/lib/science/constants.dart:2` |
| `C_exhaled` (V12's value) | 40,000 ppm | `V12`, flagged there as an assumption |
| Rebreathing label bands | None <0.2 % · Low <1 % · Moderate <3 % · High ≥3 % | `rebreathing.dart` `rebreathingLabel()` |
| Ventilation tiers | low <0.5 % · moderate <2 % · high ≥2 % | `wells_riley.dart` |
| `t_d` chin | 0.389883 s | `V15`, unmatched lines |
| `t_d` top | 0.120334 s | `V15` |
| Differential delay | 0.269549 s | `V15` |
| Plume transit, chin → top | 0.628571 s | `V15` — 0.22 m at 0.35 m/s |
| Breathing rate | 0.25 Hz = 15.0 BrPM, period 4.000 s | `V15`, reused |
| Chin trace | 1,400 ± 450 ppm (950–1,850) | **Worked assumption**, chosen to peak at `V12`'s 1,850 |
| Top trace, pod in the plume | 700 ± 90 ppm (610–790) | **Worked assumption** — 20 % of the chin swing survives the 0.22 m transit |
| Live-history interval | 2.000 s | **Shipped constant.** `services/live_history.dart` `_minInterval` |
| Analysis window | 5 min | `services/respiration_service.dart` `_kWindowMinutes` |
| Internal resample rate | 4.0 Hz | `respiration.dart` `_kTargetRateHz` |
| Search band | 0.1–0.7 Hz | `computeRespirationRate()` defaults |
| Sensor quantisation | 10 ppm | `C16`, SprintIR-6S-20 % |

### Part 1 — rebreathing

| Quantity | Working | Value | On screen as |
|---|---|---|---|
| `f_rb` at `C_exhaled` = 38,000 | `1150 / 37300` | 0.0308311 | **3.083 % — "High"** |
| `f_rb` at `C_exhaled` = 40,000 | `1150 / 39300` | 0.0292621 | **2.926 % — "Moderate"** |
| `f_rb` at `C_exhaled` = 50,000 | `1150 / 49300` | 0.0233266 | 2.333 % — "Moderate" |
| Relative difference, 38 k vs 40 k | `0.0015690 / 0.0292621` | 0.053619 | **5.4 % higher** |
| Chin ppm on the 3 % boundary at 38,000 | `700 + 0.03 × 37300` | 1,819 ppm | 1,819 |
| Chin ppm on the 3 % boundary at 40,000 | `700 + 0.03 × 39300` | 1,879 ppm | 1,879 |
| Boundary shift | `1879 − 1819` | 60 ppm | **60 ppm = 6 sensor counts** |
| Ventilation tier, both constants | `f ≥ 0.02` | high | **unchanged** |
| Top-pod maximum slope | `90 × 2π × 0.25` | 141.372 ppm/s | 141 ppm/s |
| Top movement over the differential | `141.372 × 0.269549` | 38.106 ppm | **38 ppm** |
| Chin maximum slope | `450 × 2π × 0.25` | 706.858 ppm/s | 707 ppm/s |
| Peak `f_rb`, honest reference (top steady at 700) | `1150 / 37300` | 0.0308311 | **3.083 % — High** |
| Peak `f_rb`, reference in the plume, time-aligned | swept over one cycle | 0.0297166 | **2.972 % — Moderate** |
| Peak `f_rb`, in the plume **and** unmatched lines | swept over one cycle | 0.0289276 | **2.893 % — Moderate** |
| Cost of the contaminated reference | `(0.0308311 − 0.0297166) / 0.0308311` | 0.036136 | **3.6 % low** |
| Cost of the misalignment | `(0.0297166 − 0.0289276) / 0.0297166` | 0.026551 | **2.7 % low** |
| Both together | `(0.0308311 − 0.0289276) / 0.0308311` | 0.061727 | **6.2 % low** |
| Worst-instant misalignment error | at `t` = 2.886 s: 1.080 % vs 0.980 % | 0.102 | **10.2 % of the reading** |
| Misalignment cost with a **constant** reference | — | exactly 0 | **zero** |

### Part 2 — respiration

Window geometry, for the app's real five-minute window at its real 2.000-second cadence:

| Quantity | Working | Value | On screen as |
|---|---|---|---|
| Samples in the window | `300 / 2` | 150, spanning 298 s | 150 samples |
| Acquisition rate | `1 / 2.000` | 0.5 Hz | **0.5 Hz** |
| **Acquisition Nyquist** | `0.5 / 2` | 0.25 Hz | **0.25 Hz = 15.0 BrPM** |
| Resampled length `n` | `floor(298000 / 250) + 1` | 1,193 | 1,193 |
| FFT size | `nextPow2(1193)` | 2,048 | 2,048 |
| Bin spacing | `4.0 / 2048` | 0.001953125 Hz | 0.1172 BrPM per bin |
| True resolution | `1 / 298 s` | 0.0033557 Hz | **0.201 BrPM** |
| Lowest in-band bin | `k = 52` | 0.1015625 Hz | **6.09 BrPM** |
| Highest in-band bin | `k = 358` | 0.6992188 Hz | **41.95 BrPM** |
| Bins in band | `358 − 52 + 1` | 307 | 307 |
| Band top ÷ acquisition Nyquist | `0.6992 / 0.25` | 2.7969 | **2.8× Nyquist** |
| White-noise confidence floor | `3 / 307` | 0.009772 | **≈ 1 %** |
| Samples per breath at 12 BrPM | `(60/12) / 2` | 2.50 | 2.5 |
| Samples per breath at 15 BrPM | `(60/15) / 2` | 2.00 | **2.0 — the floor** |
| Samples per breath at 18 BrPM | `(60/18) / 2` | 1.67 | **1.67 — below the floor** |

Model output, running the pipeline exactly as `respiration.dart` does, on a clean sinusoid:

| True rate | Fold `\|f − 0.5\|` | Peak bin | Reported | Confidence | Card status |
|---|---|---|---|---|---|
| 10 BrPM | — | 85 | 9.96 | 84 % | CAUTION |
| 11 BrPM | — | 94 | 11.02 | 81 % | OK |
| **12 BrPM** | — | **102** | **11.95 → "12.0"** | **74 %** | **OK — correct** |
| 13 BrPM | — | 111 | 13.01 | 67 % | OK |
| 14 BrPM | — | 119 | 13.95 | 56 % | OK |
| 15 BrPM | at Nyquist | 128 | 15.00 | 91 % | OK |
| 16 BrPM | 0.2333 Hz | 119 | 13.95 | 56 % | OK |
| 17 BrPM | 0.2167 Hz | 111 | 13.01 | 67 % | OK |
| **18 BrPM** | **0.2000 Hz** | **102** | **11.95 → "12.0"** | **74 %** | **OK — 33.6 % low** |
| 19 BrPM | 0.1833 Hz | 94 | 11.02 | 81 % | OK |
| 20 BrPM | 0.1667 Hz | 85 | 9.96 | 84 % | CAUTION |
| 22 BrPM | 0.1333 Hz | 68 | 7.97 | 89 % | CAUTION |
| 24 BrPM | 0.1000 Hz | 52 | 6.09 | 84 % | CAUTION |

The reported rate is a **mirror about 15.0 BrPM**, and each mirrored pair carries the *same*
confidence to the percentage point. The bin indices and reported rates above are exact. The
confidences are for a clean single sinusoid and will be lower on real data.

Failure cases:

| Case | Peak bin | Reported | Confidence | Card | Truth |
|---|---|---|---|---|---|
| Breath-hold, whole window (40 ppm drift, 10 ppm quantised) | 52 | 6.09 BrPM | 22 % | CAUTION | **0 BrPM** |
| Quantisation noise only, no drift | 54 | 6.33 BrPM | 9 % | CAUTION | **0 BrPM** |
| Mathematically perfect constant | none | **null → "—"** | — | inactive | 0 BrPM |
| 150 s breathing at 12, then **148 s of apnea** | 102 | 11.95 → "12.0" | 59 % | **OK** | apnea |
| 15 BrPM sampled in phase (recovered swing 0 of 900 ppm) | 128 | 15.00 | **0 %** | OK | 15 BrPM |

**The confidence values in this second table depend on the synthetic trace and are illustrative.**
The structural results do not: the 6.09 BrPM floor, the impossibility of emitting zero, and the fact
that `null` is returned only for a signal with *exactly* zero energy in all 307 bins are properties
of the code and hold for any input.

One more exact result, and it is the one people disbelieve. At 15.0 BrPM you take **2.000 samples per
breath** — the theoretical floor — so what you recover depends entirely on where the sampling clock
falls in the cycle. Sweeping the starting phase, the recovered peak-to-peak swing of a true 900 ppm
oscillation runs:

| Starting phase | Recovered swing |
|---|---|
| 0 | **0 ppm** |
| π/8 | 344 ppm |
| π/4 | 636 ppm |
| 3π/8 | 832 ppm |
| π/2 | 900 ppm |

At 12 BrPM (2.5 samples per breath) the same sweep gives 814–856 ppm — stable. Two samples per breath
is not "a bit marginal". It is the point where the amplitude becomes a function of luck.

## Shot list

| Time | On screen | What is written |
|---|---|---|
| 00:00–00:30 | Backdrop, chin and top pods circled | The question, boxed: *how much of this breath did you already breathe?* |
| 00:30–00:48 | Board | `f_rb = (C_chin − C_top) / (C_exhaled − C_top)`, written large, `C13` written beside it |
| 00:48–01:06 | **PAUSE CARD 1** over dimmed board | "Chin 1,850. Top 700. The app's constant is 38,000. Compute `f_rb` and give it a label." |
| 01:06–01:44 | Board | `1850 − 700 = 1150`; `38000 − 700 = 37300`; `1150/37300 = 0.03083` → **3.083 %**; label bands written, `High` circled |
| 01:44–02:26 | Board, second column beside the first | `40000 − 700 = 39300`; `1150/39300 = 0.02926` → **2.926 %**; `Moderate` circled; the `3 %` boundary drawn as a line **between** the two results |
| 02:26–03:10 | Board | `1,819` and `1,879` written under the two columns; `1879 − 1819 = 60 ppm`; `60/10 = 6` and **"six sensor counts"** boxed |
| 03:10–03:30 | **Backdrop swaps to the two traces**; chin drawn oscillating 950–1,850, top drawn flat at 700 | `top = reference` written beside the flat trace |
| 03:30–04:04 | Traces; chin shifted right by a long arrow, top by a short one | `t_d` chin `0.390`, `t_d` top `0.120`, `difference 0.270 s` |
| 04:04–04:20 | **PAUSE CARD 2** | "The two samples share a timestamp but are 0.270 s apart in the air. With a flat reference, how big is the error in `f_rb`?" |
| 04:20–04:44 | Board | `0` written very large and boxed |
| 04:44–05:10 | Top trace **redrawn oscillating** 610–790, lagging the chin | `C13: the top pod is in the plume`; `90 ppm swing`; `lag 0.629 s` |
| 05:10–05:40 | Board | `141 ppm/s × 0.270 s = 38 ppm`; then the three-line ladder `3.083 → 2.972 → 2.893 %` with `−3.6 %` and `−2.7 %` written beside the arrows, and the `3 %` line drawn across it |
| 05:40–05:58 | **Backdrop swaps to the spectrum axis** | `2.000 s` written and circled; `fs = 0.5 Hz`; `Nyquist = 0.25 Hz`; `= 15.0 BrPM` boxed |
| 05:58–06:30 | Board beside the axis | `150 samples`, `n = 1193`, `nextPow2 → 2048`, `4.0/2048 = 0.001953 Hz` |
| 06:30–07:00 | Spectrum axis, band edges shaded in | `k = 52 → 6.09 BrPM`; `k = 358 → 41.95 BrPM`; `41.95 / 15.0 = 2.8` written between them |
| 07:00–07:16 | **PAUSE CARD 3** | "The model will report up to 42 BrPM from data sampled at 0.5 Hz. What is wrong with that?" |
| 07:16–07:56 | Spectrum axis; a single clean peak drawn at 0.199 Hz | `bin 102 = 0.1992 Hz`; `× 60 = 11.95`; **`12.0 BrPM · 74 %`** written as a card |
| 07:56–08:50 | Second trace drawn above at visibly higher frequency; the **same** peak drawn on the spectrum | `18 BrPM = 0.30 Hz`; `0.30 > 0.25`; `\|0.30 − 0.50\| = 0.20 Hz`; **`12.0 BrPM · 74 %`** written identically beside the first card |
| 08:50–09:30 | **Backdrop swaps to the fold chart**; the thirteen points plotted one at a time | The triangle traced through them; `15.0` marked at the apex; the 45° line diverging away above 15 |
| 09:30–10:04 | Chart held; a flat trace drawn in the corner | `breath-hold`; `6.09 BrPM · 22 % · CAUTION`; then `lowest bin = 6.09` and **`the model cannot print 0`** boxed |
| 10:04–10:24 | Corner trace redrawn: 150 s oscillating, then 148 s flat | `12.0 BrPM · 59 % · OK` written beside it, then a hard red circle around `OK` |
| 10:24–10:40 | Board cleared; one line across the bottom | *A transform averages a window. A detector counts events. Only one of them can say zero.* |

## Visual edits

| Time | Edit | Why |
|---|---|---|
| 00:24 | **Boxed question** pinned top-left for the whole video | Same rule as V11–V15 |
| 00:48 | **Lower third:** "38,000 ppm is the shipped constant. 40,000 was V12's teaching value. Neither was measured on a subject" | The whole of Part 1 turns on this and it must be established before the arithmetic, not after |
| 01:38 | The two results are written in **two columns side by side and neither is erased** | Same discipline as V15 at 06:02. The comparison is the lesson |
| 02:04 | The `3 %` label boundary drawn as a **horizontal line straight through the gap** between 2.926 and 3.083 | One line makes "the tier flipped" a picture instead of a claim |
| 02:16 | `High` and `Moderate` written in the app's own two severity colours | The viewer will next see these on a phone. Match them |
| 02:44 | `60 ppm` written, then **six 10 ppm tick marks drawn beside it** | `C16`'s quantisation made concrete. Six counts is a small number of counts |
| 03:18 | The top trace is drawn **flat and held flat for a full 12 seconds** before Part 1b starts | The viewer must believe the ideal case before being shown the real one |
| 04:20 | The `0` at the pause-2 answer is written **at full board height** | This is the counter-intuitive half of `C17`'s common-mode result and it deserves the space |
| 04:52 | The flat top trace is **erased and redrawn oscillating in a different colour**, the old flat line left ghosted underneath | The defect is a change to the reference, and showing the change beats describing it |
| 05:24 | The three-value ladder is drawn as **three rungs with the 3 % line crossing between the first and second** | Two independent defects, both biasing low, and the tier flips on the first one alone |
| 05:34 | **Lower third:** "both defects bias low, and they add" | The direction is the part that matters. An error that averages out is a different problem |
| 05:52 | **Lower third:** "2.000 s and 5 min are shipped constants. The traces are synthetic" | Part 2's headline result is a property of the code; the specific confidences are not |
| 06:44 | The out-of-band region of the spectrum axis is **shaded out**, and the region above 0.25 Hz is shaded a **second, different** colour | Two different kinds of unavailable. Out-of-band is a choice; above Nyquist is physics |
| 07:44 | The `12.0 BrPM · 74 %` card is drawn as a **replica of the app's insight card**, EXPERIMENTAL tag included | The viewer needs to recognise this object on a phone at 3 a.m. |
| 08:30 | The second card is drawn **identical to the first, then the two are slid together and overlaid** to show they match exactly | This is the punchline of Part 2. Do not narrate it — show the overlay and hold |
| 08:42 | The two source traces are left on screen **side by side, visibly different**, above the two identical cards | Different inputs, identical outputs. Both halves must be in frame at once |
| 09:20 | The fold chart's apex at 15.0 gets a **vertical dashed line down to the axis**, labelled `2 samples per breath` | The apex is not an arbitrary feature. It is the sampling floor |
| 09:26 | The 45° identity line is **thickened where the model is right and struck through above 15** | The chart is a report card. Mark it |
| 09:52 | `the model cannot print 0` written, then the **6.09 figure circled and an arrow drawn to the empty space below it** | The absence is the point. Point at the gap |
| 10:14 | A hard red circle around the word `OK` on the apnea card, held 3 s in silence | Green status on a 148-second apnea. Let it sit |
| 10:30 | **Lower third, full size:** "a transform averages a window · a detector counts events · only one of them can say zero" | Verbatim. Q19 tests it and L08 is built on it |

## Narration

**[00:00 — the question]**

Two pods. One under your chin, one above your head. The chin reads eighteen fifty, the top reads
seven hundred.

*(beat)*

How much of your next breath is air you already breathed?

**[00:30 — the formula, from M2]**

M2 gave you this and I am not going to re-derive it.

*(writing)*

Rebreathed fraction. `C_chin` minus `C_top`, over `C_exhaled` minus `C_top`. The numerator is how
much extra CO₂ is sitting at your face. The denominator is how much extra a *full* breath would put
there. The ratio is the share of the mixture that came out of you.

One thing before we use it. `C_exhaled` is not measured. Nobody put a capnograph on this subject.
It is a constant somebody typed, and the constant the app actually ships — it is right there in
`constants.dart` — is **thirty-eight thousand**. V12 worked this same problem at forty thousand.

Hold that thought.

**[00:48 — pause 1]**

Your turn. Eighteen fifty at the chin, seven hundred at the top, thirty-eight thousand exhaled.

Compute the fraction. Then look up its label.

*(pause — hold the card)*

**[01:06 — the answer]**

Numerator: eighteen fifty minus seven hundred is **eleven fifty**.

*(writing)*

Denominator: thirty-eight thousand minus seven hundred is **thirty-seven thousand three hundred**.

Divide. Nought point nought three nought eight three. **Three point nought eight three percent.**

*(the label bands)*

And the labels, straight out of `rebreathing.dart`. Under nought point two percent, None. Under one
percent, Low. Under three percent, Moderate. Three and above — **High**.

Three point zero eight is above three. This headset says **High**.

**[01:44 — now do it V12's way]**

Same two sensor readings. Same subject. Same second. Only the assumed constant changes.

*(writing, second column)*

Forty thousand minus seven hundred is thirty-nine thousand three hundred. Eleven fifty over
thirty-nine three hundred is **two point nine two six percent**.

*(the boundary line drawn between them)*

Under three. **Moderate.**

*(beat)*

Look at what just happened. Nothing physical changed. No sensor moved. The subject breathed exactly
the same breath. And the headset's verdict went from High to Moderate because of a constant that
nobody measured, that differs by five percent between two perfectly defensible values, and that is
written down in one place in one file.

**[02:26 — how close is that boundary, really?]**

Let us find out exactly where the line is.

*(writing)*

Set the fraction to nought point nought three and solve backwards for the chin reading. At
thirty-eight thousand: seven hundred plus nought point nought three times thirty-seven three hundred
— **eighteen nineteen**. At forty thousand: **eighteen seventy-nine**.

*(the tick marks)*

So the constant moves the High-Moderate boundary by **sixty parts per million**. And M5 told you the
SprintIR quantises to ten. Sixty ppm is **six counts.** The entire disagreement between two
reasonable assumptions is six of the smallest steps this sensor can take.

One thing that does *not* move, and it is worth saying because it stops this becoming a story about
everything being unreliable: the ventilation tier. Both fractions are above two percent, so
`wells_riley.dart` calls it high either way. Different models have different sensitivities to the
same assumption. Check yours; do not assume.

**[03:10 — part one B, and now the tubing]**

Second half of part one. M6 told you the air in that tube is late. Let us find out whether that
matters here.

*(the two traces)*

Chin trace, oscillating with the breath — nine fifty up to eighteen fifty, four second period.
Top trace: for now, flat at seven hundred. A perfect reference, exactly where it should be.

*(the two arrows)*

V15's numbers. The chin's air took **nought point three nine zero seconds** to come down its tube.
The top's took **nought point one two zero**. So two samples that carry the same timestamp are
describing air from moments **two hundred and seventy milliseconds** apart.

**[04:04 — pause 2]**

So: those two readings are misaligned by 0.270 seconds, and we are about to subtract them.

With that flat reference, how big is the error in the rebreathed fraction?

*(pause — hold the card)*

**[04:20 — zero]**

*(writing, full height)*

**Zero.**

Not small. Not negligible. Exactly zero, and here is why. The top reading is seven hundred at every
instant, so delaying it by anything at all changes nothing. And the chin's own delay just makes the
whole output late — the number is right, the timestamp is wrong. That is C17's rule arriving in a new
place: **common-mode delay is free.**

Which tells you something precise about where the error can possibly come from. **The misalignment
can only hurt you to the extent that the reference is moving.**

**[04:44 — and the reference is moving]**

*(the top trace redrawn oscillating)*

Except C13 already told us it is. The top pod is sitting in the plume. It is not reading room air —
it is reading a delayed, watered-down copy of your own breath, arriving nought point six two nine
seconds after the chin sees it. Call it ninety parts per million of swing where the chin has four
fifty.

Now redo the question.

*(writing)*

How fast is the top trace moving at its steepest? Ninety times two pi times nought two five —
**a hundred and forty-one ppm per second.** Times nought point two seven zero seconds of
misalignment: **thirty-eight parts per million.**

That thirty-eight ppm lands straight in a numerator that is about eleven fifty. Which is where the
whole of part one has been going.

**[05:10 — the ladder]**

*(the three rungs)*

Three numbers for the same subject on the same breath.

If the top pod were where it is supposed to be, and the tubes were matched — peak rebreathed
fraction, **three point nought eight three percent.** High.

Put the top pod in the plume, keep the tubes matched: **two point nine seven two.** Down three point
six percent. And — *(the line drawn)* — under three. **The tier just flipped, and no tubing was
involved.**

Now unmatch the tubes as well: **two point eight nine three.** Down another two point seven.

*(the lower third)*

Both defects bias **low**. Both. And they add. Six point two percent low between them, and this
project exists to detect rebreathing, so under-reporting it is the one direction we cannot afford to
be wrong in.

*(beat)*

One last thing before we move on, because it is easy to take the wrong lesson. Correcting the delay
does **not** fix the reference. Those are two separate defects with two separate fixes — match the
tubes, and move the pod. Doing one and declaring victory leaves the other one biasing every number
you publish.

**[05:40 — part two: the transform]**

Part two. Different model, same file directory. Breathing rate, straight out of the chin CO₂ trace.

The idea is honest and old: you breathe periodically, so the CO₂ at your chin oscillates, so take a
Fourier transform, find the biggest peak, and read the rate off it. `respiration.dart` does exactly
that and does it competently.

*(writing, circling)*

Before any of it — one number, and it decides everything that follows. The app's live history stores
a sample **once every two seconds.** Not once a second. Two.

*(writing)*

Sampling frequency, nought point five hertz. Nyquist — the highest frequency you can represent —
is half of that. **Nought point two five hertz.**

*(boxing)*

Which in the units of this problem is **fifteen breaths a minute.**

**[05:58 — the window]**

The rest is bookkeeping, and it is worth doing because the numbers get used.

*(writing)*

Five minute window at two second cadence: a hundred and fifty samples, spanning two hundred and
ninety-eight seconds. The model resamples internally to four hertz — eleven hundred and ninety-three
points — then zero-pads to the next power of two, **two thousand and forty-eight.**

Bin spacing: four over two thousand forty-eight. Nought point nought nought one nine five three
hertz.

*(beat)*

Careful with that one. That is the *bin* spacing, and it is fine as a bin spacing, but padding does
not create resolution. The real resolution is one over the window length — one over two ninety-eight
— which is nought point two oh one breaths a minute. The app prints one decimal place. It is
implying about twice the precision it has.

**[06:30 — the band]**

The model only looks between nought point one and nought point seven hertz. In bins, that is
fifty-two to three fifty-eight.

*(writing)*

Lowest thing it can report: **six point oh nine breaths a minute.** Highest: **forty-one point nine
five.**

**[07:00 — pause 3]**

So. The model will happily report anything up to forty-two breaths a minute.

The data arrives at half a hertz.

What is wrong with that?

*(pause — hold the card)*

**[07:16 — first, the case where it works]**

Before the bad news, credit where it is due. Here is a subject breathing at **twelve** a minute.
Nought point two hertz. Comfortably under the Nyquist limit — two and a half samples per breath.

*(the peak drawn)*

Transform it. One peak, bin one hundred and two, nought point one nine nine two hertz. Times sixty:
eleven point nine five.

*(the card)*

The app rounds it and shows **twelve point zero breaths a minute, seventy-four percent confidence.**
That is correct, to within a bin. The model works.

**[07:56 — and now the same model on a different subject]**

Second subject. Breathing at **eighteen** a minute. Perfectly ordinary — mildly elevated, exactly
what you would see in a slightly anxious person or someone who has just climbed the stairs.

*(writing)*

Eighteen a minute is nought point three hertz. And Nyquist is nought point two five.

*(beat)*

Nought point three is bigger than nought point two five. There are one point six seven samples per
breath. You are sampling below the floor, and a frequency above Nyquist does not vanish — it
**folds.** Nought point five minus nought point three is **nought point two.**

*(the same peak drawn)*

Nought point two hertz. Bin one hundred and two.

*(the second card, then the overlay)*

**Twelve point zero breaths a minute. Seventy-four percent confidence.**

*(hold)*

Same number. Same confidence. Same green status. Two subjects, one breathing at twelve and one at
eighteen — a fifty percent difference in respiratory rate, which is a clinically meaningful
difference — and the instrument cannot tell them apart. Not "struggles to". **Cannot.** Once you have
sampled at half a hertz, the information is not in the file. No better algorithm recovers it.

**[08:50 — the fold, all of it]**

Do it for the whole normal adult range and you get the shape of the problem.

*(the points plotted, the triangle traced)*

Ten reports ten. Twelve reports twelve. Fifteen reports fifteen. And then it turns over. Sixteen
reports fourteen. Eighteen reports twelve. Twenty reports **ten**. Twenty-four reports **six point
one**.

*(the identity line struck through above the apex)*

It is a mirror, hinged at fifteen. Above fifteen, faster breathing is reported as **slower**
breathing — which is the worst possible direction for the error to run, because a subject in
respiratory distress is breathing fast and this instrument will report them as calm.

And every mirrored pair carries the same confidence to the percentage point. The confidence number
does not know either.

**[09:30 — the other failure, and it is the one that matters at night]**

*(the flat trace)*

Last case. The subject stops breathing. A breath-hold, an apnea — the thing the Herrick sleep study
exists to catch.

The trace goes flat. Not perfectly flat: there is a slow drift and there is ten-ppm quantisation
noise, so there are a few tens of ppm of wobble in five minutes.

*(the card)*

The model reports **six point one breaths a minute at twenty-two percent confidence.**

*(the boxing)*

Why six point one? Because that is bin fifty-two. It is the lowest bin in the band. It is the
smallest number this model is capable of emitting.

*(the arrow into the empty space)*

**There is no zero.** The output is a bin index times a bin width, and no bin corresponds to "not
breathing". The function returns null only if all three hundred and seven bins hold *exactly* zero
energy, which requires a mathematically perfect constant — and real air, read by a real sensor, is
never that.

The one mercy is that six point one is outside the ten-to-twenty-five window, so the card at least
turns amber.

**[10:04 — unless the apnea is in the middle]**

*(the half-and-half trace)*

Which brings us to the case that should actually worry you.

Two and a half minutes of ordinary breathing at twelve a minute. Then two and a half minutes of
nothing at all.

*(the card, the red circle)*

**Twelve point zero breaths a minute. Fifty-nine percent confidence. Status: OK.**

*(three seconds of silence)*

A hundred and forty-eight seconds of apnea, and the instrument is green.

And there is nothing wrong with the transform. A Fourier transform tells you what frequencies were
present **somewhere in the window**. It does not tell you *when*, and it was never going to. The
periodicity really was there — for half the window.

**[10:24 — which is the whole argument]**

So here is why NASA trained a neural network to do this.

Their in-suit system had the same problem in a different suit: waveforms that stopped looking like
breaths when the ventilation was low or the subject was working hard, and an analysis that relied on
a fixed elapsed time to count them. Their answer was ICARUS — a learned **breath detector**, trained
on real breaths from real suited tests, that finds each breath as an event and counts it.

*(the final line)*

That is the difference, and it is structural, not a matter of one method being cleverer.

A transform averages a window. A detector counts events. Only one of them can say **zero**.

*(hold, fade)*

---

**Word count:** ~1,930 · **Target pace:** 150 wpm + three 18-second pauses + written-arithmetic dwell
and one deliberate 3-second silence at 10:14 ≈ 10:40

## Notes for the recorder

- **The 00:48 caption must be spoken *and* written.** 38,000 is what ships; 40,000 is what V12 used.
  If a viewer leaves thinking one of them is *the* right answer, Part 1 has done net harm. The point
  is that neither was measured.
- **Do not erase either column at 01:38.** Same rule as V15 at 06:02. Both answers on screen, both
  correct arithmetic, one tier apart.
- **The `0` at 04:20 is the beat people misremember.** Every instinct says a 0.270-second misalignment
  must cost something. It costs exactly nothing until the reference moves, and that is what makes the
  next beat land. Give it the full board and do not soften it.
- **The overlay at 08:30 is the video.** Two visibly different input traces, two output cards drawn
  separately, then slid on top of each other so the viewer sees them match. Do not narrate over the
  slide; let the picture make the claim. If this edit is cut for time, cut Part 1b instead.
- **The three seconds of silence at 10:14 are in the script on purpose**, for the same reason as
  V15's at 08:00. The viewer needs time to notice that the status is green.
- Say **"folds"**, not "aliases", on first use, then use both. "Fold" is the picture — the chart at
  08:50 literally folds at 15 — and a viewer who has the picture will not forget the mechanism.
- Do not say the respiration model is *broken*. It is not: the transform is correct and the file's
  own docstring says the outputs are experimental until fast CO₂ sensors land. The model is bounded
  by its input rate, and the fix is a faster sample, not better maths. A viewer who leaves distrusting
  the code has learned the wrong thing.
- Do not round 0.269549 to "about a quarter of a second" and then multiply by it. Use 0.270 for
  display and the full figure for arithmetic, or the 38 ppm comes out 35.
- `f_rb` is said as "rebreathed fraction" throughout, never "rebreathing rate" — there is a breathing
  *rate* in Part 2 and one word for both undoes the video.
- Every number is in the values tables above. If the tablet disagrees with those tables, the tablet is
  wrong.
