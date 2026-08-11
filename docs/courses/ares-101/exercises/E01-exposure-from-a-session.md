# E01 — Exposure from a session

> CONTENT section · ARES 101 · M4 · ~2 min, plus about 15 minutes of arithmetic
> Seeded into `contentJson` as rich text. Depends on `C15` (the tiers, the app's thresholds and the
> dosimeter definition) and `GLOSSARY.md` §5 (the conversion).
> **The data in this file is synthetic.** It was written to be arithmetically clean and
> physiologically plausible; it is not a real ARES session and must never be quoted as one.
> The answers sit at the bottom under a rule. TipTap has no collapsible-section node, so they cannot
> literally be folded away — the rule and the warning are the separation. Do not move them to a
> second file; a learner who has to go looking will not check their work.

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
