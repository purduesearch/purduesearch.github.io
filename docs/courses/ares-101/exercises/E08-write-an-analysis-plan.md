# E08 — Write an analysis plan, before the data exists

> CONTENT section · ARES 101 · M11 · ~2 min to read, 45–60 minutes to do
> Seeded into `contentJson` as rich text. Depends on `C22` (why the plan comes first, controls versus
> baselines, the confound list), `C21` (the error budget, and why a difference inherits both pods'
> errors), `C13` (the rebreathed-fraction definition), `C20` (what the file records and what it does
> not), and `L11` (the protocol this session would run under).
>
> **There is synthetic data at the bottom of this file. Do not read it until your plan is written.**
> That instruction is not a formality — it is the entire exercise. If you scroll first, you will have
> demonstrated the exact failure `C22` is about, on yourself, in about four seconds.

---

## The task

**Write the data analysis plan for a mock session, before any data exists, and include the one thing
deliverable 3.6.9 does not ask for.**

3.6.9 requires you to specify which CO₂ metrics will be extracted, how spatial distribution will be
quantified, and what statistical comparisons will be made. You will do all three. Then you will add a
fourth item, which is the one this exercise is actually for:

> **State what result would count as *not* supporting the hypothesis.**

A plan with no possible negative result is not a plan. It is a description of whatever happens, written
in advance.

Your output is **one page**, dated, and it goes back to the team. The Herrick protocol
(`L11`) contains no analysis plan at all — that is the biggest gap in it — so this is not a teaching
exercise with a filed-away answer. It is the missing page.

## The scenario you are planning for

You are planning **one session, one subject**, in the Herrick chamber, under the protocol you read in
`L11`. Assume the study is approved and the device has passed Deliverable 5. Everything below is fixed
before you start writing; nothing below is data.

| | |
|---|---|
| Subject | One, supine on the chamber's sleeping surface, wearing ARES 2 |
| Conditions | Three room setpoints — 22 °C, 26 °C, 30 °C — in that order |
| Per condition | 20 minutes of recording, preceded by a full recalibration of all three pods against the Aranet ambient reading, per `L11` |
| Baseline | 20 minutes upright and seated in the same room at 22 °C, before the first condition |
| Instruments | Three ARES pods (top, forehead, chin), one Aranet logging ambient CO₂, humidity, pressure and temperature at 1-minute intervals |
| Streams | BLE `LIVE` at ~1 Hz; `data.csv` at 0.2 Hz; both are recorded |
| Hypothesis | Rebreathing at the chin increases as the room warms, because a warmer room reduces effective gravity and weakens the plume that clears exhalate from the breathing zone (`C14`) |

The pods are roughly **8 cm apart** along the face. That figure comes from this course
(`L10`'s rubric), not from a measurement of the assembled headset — if you are running this for real,
measure yours and write the number down.

## What your plan must contain

Six fields. Write them in this order and answer each in two or three sentences — this is a page, not a
report.

```
ANALYSIS PLAN — ARES Herrick session
Written by:                        Date:
Session this plan governs:

1. METRICS
2. SPATIAL QUANTIFICATION
3. BASELINE AND COMPARISON
4. STATISTICAL TREATMENT
5. WHAT WOULD NOT SUPPORT THE HYPOTHESIS
6. PRE-SPECIFIED EXCLUSIONS
```

### 1 · Metrics

Name every quantity you will extract, precisely enough that **two people would compute the same
number**. That bar is higher than it sounds, and each of these has to be pinned:

- **Which stream.** `C20`: breathing is above Nyquist in the 1 Hz `LIVE` stream and below it in the
  0.2 Hz CSV. If a metric is breath-scale, it cannot come from the file. Say which one you are using
  and why.
- **Which window.** The whole 20 minutes, or the last 10, or the steadiest 5? Decide now. "The steadiest
  five minutes" is a defensible choice and it is also a choice you must define by a rule rather than by
  eye, or you have smuggled the data back into the plan.
- **Which reduction.** Mean, median, peak, 95th percentile, ppm·hours. Each answers a different
  question. Pick the ones you can justify against the hypothesis and *drop the rest* — you are allowed
  three metrics, not eleven.
- **Which constant.** If you report a rebreathed fraction, `C13`'s formula needs `C_exhaled`, and `C19`
  records that the app uses 38,000 ppm while `V12` worked with 40,000. State yours.

### 2 · Spatial quantification

3.6.9 asks specifically "how spatial distribution will be quantified", and there are three honest
answers. Choose one, and say why.

- **Pairwise differences.** `C_chin − C_top`, in ppm. Simple, and it is what the rebreathing formula
  already uses.
- **The rebreathed fraction.** `C13`'s `f_rb`, dimensionless. Comparable across sessions and rooms in a
  way ppm is not, and it inherits an assumed constant.
- **A gradient.** ppm per centimetre along the pod axis, using the ~8 cm spacing. This is the one that
  speaks the CFD model's language, and it is the one most sensitive to the pod separation figure being
  wrong.

Before you choose, read `C13` on the top pod again. It is currently sitting *in* the plume, which biases
the reference high and every difference computed from it low. Your plan should say whether it accounts
for that, or does not and knows it does not.

### 3 · Baseline and comparison

Name the comparison as a sentence of the form *X versus Y, within Z*. Then answer two questions the
plan is not finished without.

**Is your baseline a baseline or a control?** `C22` separates them: a baseline gives you a change to
report, a control closes off an alternative explanation. The upright 22 °C block is a baseline. The
Aranet ambient trace is a control, and it is the one that closes off "the room filled up" — which,
because `L11`'s facility criteria deliberately keep the room closed, is the most likely alternative
explanation you face.

**What does the fixed 22 → 26 → 30 order cost you?** Temperature is confounded with elapsed time, with
room CO₂ accumulation, and with the subject settling. You cannot fix that within one session. You can
state it, and you can say what you would do across sessions.

### 4 · Statistical treatment

This is where the plan is most often wrong, and it is wrong in one specific way.

Twenty minutes at 1 Hz gives you **1,200 samples per condition**. Those are not 1,200 independent
observations. Consecutive CO₂ readings are heavily correlated — `C16`'s digital filter is set to 32,
transport delay and chamber flush add more (`C17`), and the physical quantity itself moves on the scale
of a breath and a room. The decorrelation time is tens of seconds, so the *effective* sample size in
20 minutes is somewhere around forty, not twelve hundred.

Feed 1,200 into a t-test and it will hand you `p < 10⁻³⁰` for a 2 ppm difference, because a t-test
believes what you tell it about n. That is **pseudoreplication**, it is the most common statistical
error in wearable-sensor work, and it produces a number that looks like overwhelming evidence and is an
artefact of a sampling rate.

Then the harder question, and the one your plan has to face honestly: **what is your unit of
replication?** One subject, three conditions. It is not 1,200. It is arguably not even 3. For a
single-session pilot the defensible plan is usually:

- **Report effect sizes with an uncertainty, not a p-value.** The difference in ppm and in `f_rb`
  between conditions, alongside the instrument uncertainty from `C21`'s error budget.
- **Say what would need to be true to test it.** How many subjects, and which paired test you would run
  when you have them.

Writing "no inferential test is appropriate for a single session; here is the descriptive comparison and
here is what an inferential design would require" is a **correct and complete** answer to field 4, and a
better one than a p-value computed on autocorrelated samples. If you do propose a test, say what the
unit of replication is and how you handled the autocorrelation — a block bootstrap or an
effective-sample-size correction are both fine, and either is fine to name without implementing.

### 5 · What would not support the hypothesis

The field this exercise exists for. It has two parts, and the second is the one people skip.

**A threshold.** A number, decided now. *If `C_chin − C_top` at 30 °C exceeds the 22 °C value by less
than N ppm, that is a result against the hypothesis.* Whatever N is, write it.

**Whether your instrument could tell.** Now go and find out whether N is inside your resolution.
`C21` is the arithmetic: uncalibrated pods put a fixed 130 ppm into the numerator, quantisation
contributes about 4.1 ppm to a difference, and the pod-to-pod residual after calibration is **not
known**, because Deliverable 2.5.2 has not been run. Recalibration between conditions, which `L11`
requires, means the offset difference may move between your conditions — so part of your between-
condition effect may be a between-calibration artefact.

If N is smaller than the uncertainty on the difference, **your session cannot answer the question**, and
the most valuable output of this whole exercise is discovering that on paper rather than after a night in
a chamber. Say so in the plan, and say what would fix it.

The test of whether you have written this field properly: **is there a plausible outcome that would make
you report a negative result?** If every outcome you can imagine gets written up as some form of
support, go back to the threshold.

### 6 · Pre-specified exclusions

What you will throw away, decided before you can see which direction throwing it away helps.

At minimum: the first 30 seconds after power-on, where `C16` suppresses CO₂ entirely; any interval where
`co2Warmup` is set; the calibration windows themselves, where `C21` records that sensor reads are
suspended in `CAL_PENDING` and `CAL_RUNNING` so rows simply stop; and any pod flagged absent at boot.
Then decide, now, what you will do about a dropped BLE link, a gap in the file, and a subject who moves
or wakes.

"Exclude obviously bad data" is not an exclusion rule. It is permission to decide later.

## What to hand in

One page, with all six fields filled and a date on it, plus two sentences at the end recording anything
you could not decide and why. Commit it, or e-mail it, or put it in the shared drive — **the only thing
that matters is that it is timestamped before the session it governs.** A plan you wrote first and
cannot prove you wrote first is worth exactly as much as one you wrote afterwards.

Send it to the team. `L11` establishes that the Herrick protocol has no analysis plan; the next revision
should, and a good one from this exercise is a genuine contribution rather than homework.

---

## Self-check — synthetic outcomes

**Stop. Do not read past this line until your plan is written and dated.**

Below are two outcomes for the session above. **Both are invented for this exercise.** No session has
been run, these are not measurements, and nothing here should ever be quoted as an ARES result. They
exist so you can find out whether your plan would have survived contact with a number.

### Outcome A

| Condition | Chin mean | Top mean | `C_chin − C_top` | Aranet ambient |
|---|---|---|---|---|
| Upright baseline, 22 °C | 745 ppm | 690 ppm | 55 ppm | 680 ppm |
| Supine, 22 °C | 910 ppm | 800 ppm | 110 ppm | 790 ppm |
| Supine, 26 °C | 1,180 ppm | 1,010 ppm | 170 ppm | 1,000 ppm |
| Supine, 30 °C | 1,540 ppm | 1,265 ppm | 275 ppm | 1,250 ppm |

### Outcome B

| Condition | Chin mean | Top mean | `C_chin − C_top` | Aranet ambient |
|---|---|---|---|---|
| Upright baseline, 22 °C | 730 ppm | 690 ppm | 40 ppm | 685 ppm |
| Supine, 22 °C | 905 ppm | 800 ppm | 105 ppm | 795 ppm |
| Supine, 26 °C | 1,160 ppm | 1,070 ppm | 90 ppm | 1,060 ppm |
| Supine, 30 °C | 1,480 ppm | 1,355 ppm | 125 ppm | 1,340 ppm |

### Four questions to ask your own plan

**1 · Which outcome is which, by your own criterion?** Do not answer by looking at the trend. Answer by
reading field 5 of the page you already wrote and applying the threshold that is on it. If you find
yourself constructing a reason why B is really support after all, you have just watched the mechanism
`C22` describes operate on you, on data you know is fake, with a written plan in front of you. That is
worth more than getting it right.

**2 · Does your control do anything?** The ambient column rises by roughly 560 ppm across both tables,
because a person is sealed in a room. Every *absolute* chin figure in both tables is mostly that. If your
metric was a chin mean rather than a difference, both outcomes look like strong support and neither one
tells you anything about a plume. This is the single most useful thing the synthetic data can show you.

**3 · Is the effect inside your instrument?** In A the difference grows by 165 ppm from the 22 °C supine
condition to 30 °C. In B it grows by 20 ppm. Now apply `C21`: 20 ppm is inside the range a change in the
pod-to-pod offset difference could produce, and `L11` recalibrates between every condition. So B's small
positive trend is not evidence of anything, and — this is the part worth sitting with — **your plan should
have said so before you saw it**, because the uncertainty was knowable in advance and the data was not.

**4 · What would you now change about the design?** Write it down. That answer is the actual output of
this exercise, and it is what goes back to the team alongside the plan.

---

## One defensible plan

Not the answer — **an** answer, written to the standard the field expects, so you have something to
compare shape against. Read it after you have written yours.

```
ANALYSIS PLAN — ARES Herrick session
Written by: <name>                 Date: <date>
Session this plan governs: subject 01, single session, three temperature conditions

1. METRICS
   Primary: mean of (C_chin − C_top) in ppm, over the final 10 minutes of each 20-minute
   condition, from the 1 Hz BLE LIVE stream. Secondary: rebreathed fraction f_rb from C13
   with C_exhaled = 38,000 ppm (app constant, C19), same window, same stream. Tertiary,
   descriptive only: Aranet ambient CO2 mean over the same window.

2. SPATIAL QUANTIFICATION
   Pairwise chin-minus-top difference, in ppm. Chosen over a gradient because the pod
   separation has not been measured on this headset, and over f_rb as the primary because
   f_rb inherits an assumed exhaled constant. f_rb is reported alongside for comparability
   with other sessions. Noted limitation: C13 records that the top pod currently sits in the
   plume, so every difference here is biased low by an unknown amount. Not corrected.

3. BASELINE AND COMPARISON
   Supine 30 C versus supine 22 C, within subject, same session, same headset. The upright
   22 C block is the baseline for reporting change. The Aranet trace is the control for the
   alternative explanation that the closed room is filling up; it is expected to rise, and
   the primary metric is a difference precisely so that it cancels. Stated confound: the
   fixed 22 -> 26 -> 30 order confounds temperature with elapsed time and with room CO2
   accumulation. Not addressable within one session; conditions to be counterbalanced across
   subjects once there is more than one.

4. STATISTICAL TREATMENT
   No inferential test. n = 1 subject; the 1,200 samples per condition are autocorrelated on
   a scale of tens of seconds (A 32 filter, transport delay, chamber flush) and are not
   independent observations, so a t-test over them would be pseudoreplication. Report the
   difference in ppm and in f_rb per condition, with the C21 uncertainty attached. An
   inferential design would need >= 12 subjects with counterbalanced condition order and a
   paired comparison on the per-subject condition means.

5. WHAT WOULD NOT SUPPORT THE HYPOTHESIS
   If (C_chin − C_top) at 30 C exceeds the 22 C supine value by less than 50 ppm, this
   session does not support the hypothesis. 50 ppm is chosen as roughly twice the largest
   pod-to-pod offset change plausible across a recalibration; it is provisional because
   deliverable 2.5.2 has not been run and the real per-pod residual is unknown. If the
   difference is flat or falls, that is a result against the hypothesis and will be reported
   as one. Explicit caveat recorded in advance: an effect between 0 and 50 ppm is
   uninterpretable with this instrument, not weak evidence, and will be reported as
   uninterpretable.

6. PRE-SPECIFIED EXCLUSIONS
   Exclude: the first 30 s after power-on; any sample with co2Warmup set; all rows inside a
   CAL_PENDING or CAL_RUNNING window; any pod flagged absent at boot; and any condition where
   the BLE link dropped for more than 60 s cumulative. If the subject wakes or leaves the
   surface, that condition is excluded whole and re-run rather than trimmed. The three per-pod
   calibration offsets are recorded in the session log at every condition boundary, because
   C20 confirms the file does not record them.

Undecided: whether to report the peak as well as the mean. Deferring to the team, before the
session rather than after it.
```

Two things to notice about it. Field 5 nominates a **number**, admits the number is provisional, and
pre-commits to reporting an in-between result as uninterpretable rather than as weak support — which is
the only thing that stops a 20 ppm rise becoming a finding. And field 6's last line is a change to the
*procedure*, not to the analysis: writing the plan is what surfaced it, which is the second-order reason
3.6.9 exists.
