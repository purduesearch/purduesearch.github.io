# V12 — Worked problem: rebreathed fraction

| | |
|---|---|
| **Course / section** | ARES 101 · M2 · "Worked problem: rebreathed fraction" |
| **Runtime** | 6:20 |
| **Format** | Tablet handwriting over slide backdrop + VO |
| **Backdrop** | Static slide: head in profile facing left, three labelled pod markers — top, forehead, chin. Writing area is the right two thirds |
| **Prerequisite on screen** | Nothing. The formula is written out before it is used |
| **Recorded** | ☐ |

## Purpose

C13 defines the rebreathed fraction. This is where a learner computes one, and then watches it break.

The second half is the point. The formula is three subtractions and a divide — nobody needs six
minutes to learn it. What they need six minutes for is the fact that a reference sensor standing in
the wrong place does not produce a noisy answer, it produces a clean answer that is wrong by a third,
and wrong in a predictable direction. That is the argument for moving the top pod, and it is worth
more than the arithmetic.

## Numbers used, and where they come from

The chin, top and exhaled figures are the ones the M2 task specifies. **The 40,000 ppm exhaled-breath
assumption is a choice, not a measurement, and the script says so on screen** — Dutta et al. use
50,000 ppm (5.0 %) as their mouth boundary condition, and the script shows what that does to the
answer.

| Input | Value | Note |
|---|---|---|
| `C_chin` | 1,850 ppm | measured at the chin pod |
| `C_top` | 700 ppm | measured at the top pod, used as the ambient reference |
| `C_exhaled` | 40,000 ppm | **assumed**, ≈ 4 % — a mixed-expired figure, not end-tidal |
| `C_top` (contaminated case) | 1,100 ppm | top pod standing in the plume; `C_chin` unchanged |
| `C_exhaled` (sensitivity case) | 50,000 ppm | the paper's own 5.0 % boundary condition |

Every result below was recomputed at review:

| Quantity | Working | Value | On screen as |
|---|---|---|---|
| `f_rb`, clean reference | 1,150 / 39,300 | 0.0292621 | **2.93 %** |
| Consistency check | 0.0292621 × 40,000 + 0.9707379 × 700 | 1,850.00 ppm | 1,850 ppm |
| `p_CO₂` at the chin | 1,850 × 7.60 × 10⁻⁴ | 1.406 mmHg | 1.41 mmHg |
| `f_rb`, contaminated reference | 750 / 38,900 | 0.0192802 | **1.93 %** |
| Under-report | 1 − (0.0192802 / 0.0292621) | 0.3411 | **34 % low** |
| `f_rb` at `C_exhaled` = 50,000 | 1,150 / 49,300 | 0.0233266 | **2.33 %** |
| Effect of that assumption | (2.93 − 2.33) / 2.93 | 0.203 | **20 % lower** |

## Shot list

| Time | On screen | What is written |
|---|---|---|
| 00:00–00:30 | Backdrop, three pod markers | The question, boxed: *how much of your next breath did you already breathe?* |
| 00:30–01:10 | Backdrop | The formula, written large; `C_chin`, `C_top`, `C_exhaled` labelled onto the three markers |
| 01:10–01:28 | **PAUSE CARD 1** over dimmed board | "1,850 at the chin. 700 at the top. Assume 40,000 exhaled. Compute `f_rb`." |
| 01:28–02:06 | Board | `1850 − 700 = 1150`; `40000 − 700 = 39300`; `1150/39300 = 0.0293` → **2.93 %** |
| 02:06–02:44 | Board, result held | Consistency check written backwards: `0.0293 × 40,000 + 0.9707 × 700 = 1,850` |
| 02:44–03:14 | Board wiped; assumption box drawn | `C_exhaled = 40,000` boxed, then `50,000` beneath it, then `2.33 %` |
| 03:14–03:36 | Backdrop, top pod marker pulses | Plume arrow drawn from ankle to crown, passing straight through the top marker |
| 03:36–03:54 | **PAUSE CARD 2** over dimmed board | "The top pod is in the plume and reads 1,100, not 700. Chin is unchanged. Recompute — and predict the direction before you do." |
| 03:54–04:44 | Board, two columns | `750/38,900 = 1.93 %` beside the earlier `2.93 %`; then `1 − 1.93/2.93 = 34 %` |
| 04:44–05:24 | Board, both results held | The direction argument: numerator shrinks, denominator barely moves |
| 05:24–06:00 | Fresh board, four bullets | Where the mixing model breaks |
| 06:00–06:20 | Backdrop, top marker slides backwards behind the crown | One line: `a reference is a claim about where the sensor is` |

## Visual edits

| Time | Edit | Why |
|---|---|---|
| 00:24 | **Boxed question** pinned top-left for the whole video | Same rule as V11. The question never leaves the frame |
| 00:38 | Each term in the formula **draws a line to its pod marker** on the head diagram as it is named, lines held for the rest of the segment | The formula is abstract; the head is not. Bind them once and the rest of the video is easier |
| 00:56 | **`C_top` marker ringed amber**, with "reference, not datum" beside it, held 4 s | Planting the pin that gets pulled at 03:14. The viewer should feel slightly warned |
| 01:10 | **Pause card 1**, board dimmed, the three input values still legible behind it | A pause the viewer cannot act on is a pause they skip |
| 01:56 | `2.93 %` **circled**, and — beside it, smaller — `1.41 mmHg` | Course units rule: ppm in prose, mmHg alongside on first use. Model the habit |
| 02:20 | The consistency check written **right to left**, arriving at 1,850 and landing on the original chin value with a tick | Shows the arithmetic closing on itself. Also quietly teaches: check your answer by rebuilding the input |
| 02:50 | `C_exhaled = 40,000` inside a **dashed box labelled ASSUMPTION**, unlike every other value, which is solid | One glyph carries the entire honesty point. Keep the dashed box on screen through 03:14 |
| 03:20 | Plume arrow **animated** from ankle to crown, growing in width and colour saturation as it rises, passing directly through the top pod marker | The whole design flaw in one drawing. Do not cut away from it early |
| 03:36 | **Pause card 2.** Two boxes: one for the number, one labelled "higher or lower?" | Asking for the direction separately is what catches the viewer who computes correctly and never notices the bias |
| 04:20 | The two results side by side, then a **downward red arrow** between them labelled `−34 %` | Two numbers is data. An arrow is a finding |
| 04:56 | Numerator and denominator **highlighted in different colours**, numerator shrinking 1,150 → 750 while denominator moves 39,300 → 38,900 | The asymmetry *is* the explanation. Show it rather than assert it |
| 05:12 | **Lower third:** "a contaminated reference does not add noise — it biases the answer low" | The sentence Q13 tests |
| 06:08 | Top pod marker **slides backwards** behind the crown, out of the plume arrow, which is still drawn | Ends on the fix, not the fault |

## Narration

**[00:00 — the question]**

Here is a question you can only answer with two sensors: how much of the breath you are about to take
did you already breathe?

*(beat)*

Not "is the room stuffy". That is one sensor. This is a different question, and it needs a
measurement and a reference.

**[00:30 — the formula]**

Rebreathed fraction. `f_rb` equals `C_chin` minus `C_top`, over `C_exhaled` minus `C_top`.

*(pause)*

Three concentrations, all in parts per million. `C_chin` is what the chin pod reads — the air about to
go in. `C_top` is the top pod, and it is the reference: what the air would be if none of it had been
breathed before. `C_exhaled` is a full breath.

The logic is a mixture. The air at your chin is some blend of reference air and your own exhalate.
The numerator is how far above the reference the chin sits. The denominator is how far above the
reference a *pure* breath would sit. Divide, and you get the mixing ratio.

*(beat)*

And notice what `C_top` is doing. It appears twice, in both the numerator and the denominator, and
the entire result is measured relative to it. It is not a data point. It is a claim about the world —
the claim that the air above your head is air nobody has breathed. Remember that in about two minutes.

**[01:10 — pause 1]**

Chin pod, 1,850 parts per million. Top pod, 700. Assume exhaled breath is 40,000.

Compute the rebreathed fraction.

*(pause — hold the card)*

**[01:28 — the arithmetic]**

Numerator: 1,850 minus 700 is 1,150.

Denominator: 40,000 minus 700 is 39,300.

1,150 over 39,300.

*(beat)*

Nought point nought two nine three. Two point nine three percent.

So roughly three percent of the air arriving at that chin was already in someone's lungs. Not much.
That is a normal room, a normal person, an ordinary afternoon.

And in the units NASA writes limits in, 1,850 ppm is 1.41 millimetres of mercury at sea level. Both
units, first time, every time — that is the house rule and it exists because mixing them is the
fastest way to confuse a reader.

**[02:06 — the check]**

Quick check, and get into this habit.

If 2.93 percent of the mixture is exhaled breath at 40,000 ppm, and the other 97.07 percent is
reference air at 700, then the mixture should be nought point nought two nine three times forty
thousand, plus nought point nine seven nought seven times seven hundred.

*(beat)*

Eleven seventy, plus six hundred and eighty. Eighteen fifty.

Which is the chin reading we started with. The arithmetic closes.

**[02:44 — the assumption]**

Before we go on: one of those three numbers was not measured.

Chin and top came off sensors. Forty thousand ppm exhaled is an assumption — about four percent, a
reasonable mixed-expired figure for a resting adult. Dutta et al., in the paper you read for this
module, use five percent. Fifty thousand.

Run it again with fifty thousand and the numerator does not change — 1,150 — but the denominator
becomes 49,300, and the answer is two point three three percent.

*(pause)*

Same two sensors. Same two readings. Twenty percent lower, purely from a number nobody measured.

That is not a reason to distrust the model. It is a reason to publish the assumption next to the
result, every single time. A rebreathed fraction reported without its `C_exhaled` is not a
measurement, it is a rumour.

**[03:14 — the plume]**

Now the interesting part.

Where is the top pod? On top of the head.

And where, from M1, is the plume fastest and most loaded?

*(beat — the plume arrow draws)*

On top of the head. The plume has climbed the whole body, gathering everything it swept off the way
up, including whatever exhalate the breathing envelope carried past the face. The top pod is not
sampling room air. It is standing in the exhaust.

**[03:36 — pause 2]**

So suppose it reads 1,100 instead of 700. The chin is unchanged at 1,850 — the plume is not
contaminating the chin reading, only the reference.

Recompute. And before you do the arithmetic, predict: does the reported fraction come out higher or
lower?

*(pause — hold the card)*

**[03:54 — the collapse]**

Numerator: 1,850 minus 1,100 is 750.

Denominator: 40,000 minus 1,100 is 38,900.

750 over 38,900. One point nine three percent.

*(beat)*

Against two point nine three. Divide one by the other and you are reporting sixty-six percent of the
true value.

**Thirty-four percent low.**

**[04:44 — why low, specifically]**

And the direction is not luck. Look at what a contaminated reference does to the two halves of the
fraction.

The numerator is chin minus top. It is a difference between two numbers that are close together, so
raising the reference by four hundred takes a third of it away — 1,150 becomes 750.

The denominator is exhaled minus top. Exhaled is forty thousand. Raising the reference by four
hundred barely touches it — 39,300 becomes 38,900, about one percent.

*(pause)*

So the numerator collapses and the denominator does not. The fraction can only go down.

That is the sentence to take out of this video: **a contaminated reference does not add noise. It
biases the answer low** — and it biases it low in the measurement the whole project exists to make.

An honest instrument that is thirty-four percent under-reporting rebreathing is worse than a broken
one, because a broken one looks broken.

*(beat)*

Which is exactly why the next revision of the headset moves the top pod backwards, behind the crown,
out of the rising column. Not for tidiness. For this.

**[05:24 — where the model breaks]**

Four places this formula stops being true, and you should know all four before you quote a number
from it.

*(writing)*

One. It is a **two-compartment** model. Reference air plus your exhalate, and nothing else. Put a
second person in front of the subject and their breath gets counted as the subject's own.

Two. It assumes the two readings are **simultaneous**. They are not — the sample has to travel down
a tube to reach the sensor, and if the tube lengths differ, so do the arrival times. M6 measures that
delay and M8 corrects for it.

Three. `C_exhaled` is treated as **one constant**. A real breath is not: the first air out is
airway gas at near-ambient CO₂, and the last is alveolar gas at much more. Which part the chin pod
catches depends on when you sampled.

Four. It is a **difference**, so it inherits both sensors' errors. Two pods that disagree by a hundred
ppm for purely instrumental reasons put that hundred ppm straight into a numerator that was only
eleven hundred to begin with. M10 turns that into an error budget.

**[06:00 — close]**

Three subtractions and a divide. The arithmetic was never the hard part.

*(beat — the top marker slides back)*

The hard part is that a reference is a claim about where your sensor is. Get the claim wrong and
every number downstream is wrong with it, cleanly, quietly, and in one direction.

*(hold, fade)*

---

**Word count:** ~980 · **Target pace:** 150 wpm + two 18-second pauses + written-arithmetic dwell
≈ 6:20

## Notes for the recorder

- **The prediction half of pause 2 is the whole video.** A viewer who computes 1.93 % but never asks
  which direction the bias runs has missed it. If the card needs to be on screen longer than 18
  seconds, leave it longer.
- Do not soften "thirty-four percent low" into "about a third". The specific number is what makes it
  land as a finding rather than a caveat.
- The dashed ASSUMPTION box at 02:50 should be visually different from every other annotation in the
  video — different line style, not just a different colour. It is the only place a value on the
  board did not come from an instrument.
- `f_rb` here is **uncorrected for transport delay**. Say "uncorrected" if you ad-lib anything around
  the M6 reference; V16 in M8 redoes this problem with the correction applied, and the two videos
  should not appear to disagree.
- Every number is in the table above. If the tablet disagrees with that table, the tablet is wrong.
