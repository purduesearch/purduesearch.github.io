# V15 — Worked problem: transport delay

| | |
|---|---|
| **Course / section** | ARES 101 · M6 · "Worked problem: transport delay" |
| **Runtime** | 9:40 |
| **Format** | Tablet handwriting over slide backdrop + VO |
| **Backdrop** | Static slide: a side-on headset outline with three pods marked **top**, **forehead**, **chin**, three tubes drawn running back to a single pump on the backboard, and the writing area to its right. From 04:30 the backdrop swaps to the same outline with the tubes redrawn as three resistors in parallel. From 06:20 it swaps to a two-trace time axis (chin above, top below) with the writing area beneath |
| **Prerequisite on screen** | Nothing. Bore, lengths, and the split are all written out before use |
| **Recorded** | ☐ |

## Purpose

`C17` makes four claims a reader has to take on trust: that transport delay and T90 are different
quantities, that three tubes off one manifold do **not** split the flow evenly, that delay therefore
scales as the *square* of line length, and that an unmatched set of lines corrupts M8's cross-pod lag.
This is where a viewer earns all four with a pencil.

Part 3 is the reason the video exists. The conclusion to land, in writing, at full size:

> **Matched line lengths are not cosmetic. An unmatched set fabricates an airflow direction that is
> not there.**

A viewer who leaves able to compute `V / Q` but unable to say what an unmatched set does to a
scientific claim has missed it.

## Values used, and where they come from

**Read this before anything else: no tubing has been cut yet.** The bore and the three lengths are
worked teaching values chosen to be plausible for a headset, and they are stated as such on screen at
00:52. The *method* transfers to the real dimensions; the *seconds* do not.

| Symbol | Value | Source |
|---|---|---|
| Tube inner diameter `d` | 3.0 mm | **Worked assumption.** Deliverable 2.3.4 says "confirm tubing inner diameter … at time of order" — it has not been confirmed. Said aloud and captioned at 00:52 |
| Line lengths, top / forehead / chin | 0.25 / 0.35 / 0.45 m | **Worked assumption**, chosen so the pods sit at plausibly different distances from the backboard |
| Pump free flow `Q_total` | 2.00 L/min | `ARES_7_30_26.pptx` slide 15 (1.70 L/min continuous) |
| Stall pressure | 210 mbar | slide 15 (150 mbar continuous) |
| Chin-to-top pod separation | 0.22 m | **Worked assumption** — approximate chin-to-crown height |
| Plume velocity | 0.35 m/s | `GLOSSARY.md` §5, mid-range of M2's 0.3–0.4 m/s |
| Kinematic viscosity `ν` | 1.53 × 10⁻⁵ m²/s | `GLOSSARY.md` §4, dry air at 295 K |
| Dynamic viscosity `μ` | 1.83 × 10⁻⁵ Pa·s | `ν × ρ` at 295 K, 1 atm |
| Diffusivity `D`, CO₂ in air | 1.6 × 10⁻⁵ m²/s | `GLOSSARY.md` §4 |
| Pod chamber volume | 2.0 mL | **Worked assumption.** No chamber has been drawn |
| BLE `LIVE` notify / CSV row | ~1 Hz / 0.2 Hz | `C16` current state |
| Breathing rate, adult at rest | 0.25 Hz | `V14`, reused unchanged |

Every result below was recomputed at review:

| Quantity | Working | Value | On screen as |
|---|---|---|---|
| Tube cross-section | `π × (1.5 mm)²` | 7.06858 mm² | **7.07 mL per metre** |
| Naive per-line flow | `2.00 / 3` | 0.666667 L/min | 0.67 L/min = 11.11 mL/s |
| Naive `t_d`, top | `1.76715 / 11.1111` | 0.159043 s | 0.159 s |
| Naive `t_d`, forehead | `2.47400 / 11.1111` | 0.222660 s | 0.223 s |
| Naive `t_d`, chin | `3.18086 / 11.1111` | 0.286278 s | 0.286 s |
| Naive spread, chin − top | `0.286278 − 0.159043` | 0.127235 s | **0.127 s** |
| Mean velocity in tube | `11.1111 mL/s ÷ 7.06858 mm²` | 1.5719 m/s | 1.57 m/s |
| Reynolds number | `1.5719 × 0.003 / 1.53e−5` | 308.216 | **Re ≈ 308 — laminar** |
| Entrance length | `0.05 × 308.2 × 3.0 mm` | 46.2324 mm | ≈ 46 mm |
| ΔP, 0.45 m line | `128 × 1.83e−5 × 0.45 × 11.111e−6 / (π × (3e−3)⁴)` | 46.0253 Pa | **46 Pa = 0.46 mbar** |
| ΔP as a fraction of stall | `0.460 / 210` | 0.00219 | **0.2 % of stall** |
| Conductance share, top | `(1/0.25) / (1/0.25 + 1/0.35 + 1/0.45)` | 0.440559 | 44.1 % |
| Conductance share, forehead | as above | 0.314685 | 31.5 % |
| Conductance share, chin | as above | 0.244755 | 24.5 % |
| Real flow, top | `2.00 × 0.440559` | 0.881119 L/min | **0.88 L/min** |
| Real flow, forehead | `2.00 × 0.314685` | 0.629371 L/min | **0.63 L/min** |
| Real flow, chin | `2.00 × 0.244755` | 0.489510 L/min | **0.49 L/min** |
| Short-to-long flow ratio | `0.881119 / 0.489510` | 1.7999 | **1.8×** |
| Real `t_d`, top | `1.76715 / 14.6853` | 0.120334 s | **0.120 s** |
| Real `t_d`, forehead | `2.47400 / 10.4895` | 0.235855 s | **0.236 s** |
| Real `t_d`, chin | `3.18086 / 8.15851` | 0.389883 s | **0.390 s** |
| Real spread, chin − top | `0.389883 − 0.120334` | 0.269549 s | **0.270 s** |
| Understatement by the naive split | `0.269549 / 0.127235` | 2.1186 | **2.1×** |
| Delay ratios | `0.120334 : 0.235855 : 0.389883` | 1 : 1.960 : 3.240 | **1 : 1.96 : 3.24** |
| Length-squared ratios | `1 : (0.35/0.25)² : (0.45/0.25)²` | 1 : 1.96 : 3.24 | **identical** |
| True cross-pod lag | `0.22 / 0.35` | 0.628571 s | **0.629 s** |
| Measured lag, unmatched | `0.628571 + 0.120334 − 0.389883` | 0.359022 s | **0.359 s** |
| Inferred plume velocity | `0.22 / 0.359022` | 0.612775 m/s | **0.61 m/s** |
| Velocity overestimate | `(0.612775 − 0.35) / 0.35` | 0.750786 | **75 % high** |
| Still air — measured lag | `0 + 0.120334 − 0.389883` | −0.269549 s | **−0.270 s (top first)** |
| Still air — fabricated velocity | `0.22 / 0.269549` | 0.816179 m/s | **0.82 m/s downward** |
| Matched set, each line 0.45 m | `3.18086 / 11.1111` | 0.286278 s | 0.286 s, **all three** |
| Matched set, differential | `0.286278 − 0.286278` | 0 | **zero** |
| Chin line mean velocity | `8.15851 mL/s ÷ 7.06858 mm²` | 1.15419 m/s | 1.15 m/s |
| Taylor–Aris `K` | `1.6e−5 + (1.5e−3)²(1.15419)² / (48 × 1.6e−5)` | 3.91882 × 10⁻³ m²/s | 3.9 × 10⁻³ m²/s |
| `K / D` | `3.91882e−3 / 1.6e−5` | 244.926 | **245× molecular** |
| Step spread, `σ_x` | `√(2 × 3.91882e−3 × 0.389883)` | 0.0552789 m | 5.5 cm |
| Step spread, `σ_t` | `0.0552789 / 1.15419` | 0.047894 s | **48 ms** |
| 10–90 % rise from dispersion | `2.5631 × 0.047894` | 0.122757 s | **0.12 s** |
| Taylor–Aris validity, `a²/D` | `(1.5e−3)² / 1.6e−5` | 0.140625 s | vs 0.390 s — **ratio 2.8** |
| Centreline first arrival | `0.389883 / 2` | 0.194941 s | **0.195 s — exactly half** |
| Chamber `τ`, top | `2.0 / 14.6853` | 0.136190 s | 0.136 s |
| Chamber 90 %, top | `2.302585 × 0.136190` | 0.313590 s | 0.31 s |
| Chamber `τ`, chin | `2.0 / 8.15851` | 0.245143 s | 0.245 s |
| Chamber 90 %, chin | `2.302585 × 0.245143` | 0.564462 s | **0.56 s** |

**Three things in that table are modelling choices, not facts, and all three are flagged on screen.**
The conductance split assumes the three lines share one plenum and one outlet pressure, which is what
a manifold is *for* but is not what a badly made tee does. The Taylor–Aris estimate is used at a
residence time only 2.8 times its own validity threshold, so 48 ms is an order of magnitude and not a
result. And the pump is assumed to deliver its full 2.00 L/min because the computed 0.46 mbar line
drop is 0.2 % of stall — which is self-consistent, and is still an assumption until somebody measures
the flow.

## Shot list

| Time | On screen | What is written |
|---|---|---|
| 00:00–00:36 | Backdrop, three tubes traced from pods to pump | The question, boxed: *when did this air leave your face?* |
| 00:36–01:04 | Board | Two clocks drawn side by side: `t_d = V/Q` labelled **plumbing**, `T90` labelled **sensor**; `t_d + T90` written beneath and circled |
| 01:04–01:24 | Board | `A = π(1.5 mm)² = 7.07 mm²`, then rewritten as **7.07 mL per metre** and boxed |
| 01:24–01:42 | **PAUSE CARD 1** over dimmed board | "2.00 L/min, three lines, 3.0 mm bore. How long does air take to travel 0.45 m?" |
| 01:42–02:20 | Board | `2.00/3 = 0.67 L/min = 11.11 mL/s`; `0.45 × 7.07 = 3.18 mL`; `3.18/11.11 = 0.286 s` |
| 02:20–02:52 | Board, three-row table | 0.25 / 0.35 / 0.45 m against **0.159 · 0.223 · 0.286 s**, spread `0.127 s` written beside it |
| 02:52–03:30 | Board | `Re = 1.57 × 0.003 / 1.53e−5 = 308`, boxed **laminar**; then `ΔP = 46 Pa = 0.46 mbar` and `210 mbar` written under it with a slash between |
| 03:30–04:30 | Board | Hagen–Poiseuille written out, `d⁴` circled hard; then `R ∝ L/d⁴` |
| 04:30–04:48 | **Backdrop swaps to the parallel-resistor redraw**; **PAUSE CARD 2** | "Three tubes, one manifold, different lengths. Does each get a third of the flow?" |
| 04:48–05:36 | Board beside the resistors | `1/0.25 : 1/0.35 : 1/0.45` → `44.1 % · 31.5 % · 24.5 %` → **0.88 · 0.63 · 0.49 L/min**, `1.8×` boxed |
| 05:36–06:20 | Board, the naive table overwritten in a second colour | **0.120 · 0.236 · 0.390 s**; spread **0.270 s**; then `1 : 1.96 : 3.24` written under it and `t ∝ L²` boxed |
| 06:20–06:40 | **Backdrop swaps to the two-trace time axis**; chin trace drawn, then top trace | `0.22 m ÷ 0.35 m/s = 0.629 s` written between the two traces |
| 06:40–07:00 | **PAUSE CARD 3** over the traces | "Now add the tubing. What lag does the headset actually record?" |
| 07:00–07:44 | Traces redrawn shifted, board beneath | `0.629 + 0.120 − 0.390 = 0.359 s`; then `0.22/0.359 = 0.61 m/s` beside the true `0.35 m/s`, and **75 % high** |
| 07:44–08:36 | Traces wiped; both redrawn **flat and simultaneous**, then shifted by the tubing only | `true lag = 0`; `0.120 − 0.390 = −0.270 s`; **top pod first**; `0.22/0.2695 = 0.82 m/s` with a **downward** arrow drawn on the headset outline |
| 08:36–09:06 | Board | All three lengths struck through and rewritten `0.45 · 0.45 · 0.45`; `0.286 s` written three times; the differences written as `0 · 0 · 0` and boxed |
| 09:06–09:26 | Board, a step drawn arriving smeared | `centreline = 2 × mean`; `0.390 / 2 = 0.195 s` marked on the rising edge, `50 %` marked at `0.390 s` |
| 09:26–09:40 | Board held; one line across the bottom | *Match the lengths. Measure the delay. Subtract the common part.* |

## Visual edits

| Time | Edit | Why |
|---|---|---|
| 00:28 | **Boxed question** pinned top-left for the whole video | Same rule as V11–V14. The question never leaves the frame |
| 00:44 | The two clocks are drawn in **two different colours**, and those colours are used for `t_d` and `T90` for the rest of the video | This module exists to keep two quantities apart. Colour does it in the periphery, where a label does not |
| 00:52 | **Lower third:** "3.0 mm bore and 0.25 / 0.35 / 0.45 m are worked assumptions. No tubing has been cut" | The single most likely way this video does damage is somebody quoting 0.39 s as the chin pod's delay in a report |
| 02:34 | In the three-row table, the top and chin rows are **boxed together** and `0.127 s` written between them | The spread is the quantity, not the individual delays. Show it as a gap |
| 03:12 | `Re = 308` is written, then **`2,300` written beside it and struck through** | Laminar is a conclusion, not an assumption. Show the threshold it was compared against |
| 03:22 | `0.46 mbar` and `210 mbar` drawn as **two bars to scale** — the small one nearly invisible | Nobody believes "0.2 %" until they see one bar disappear. This kills the "is the tubing choking the pump" question for good |
| 03:56 | In Hagen–Poiseuille, `d⁴` is circled and **"halve the bore → 16× the resistance"** written beside it | The fourth power is the reason a kink is not a small problem |
| 05:04 | The three tubes on the backdrop **thicken and thin** to match their conductance shares as the percentages are written | The flow split is a picture before it is arithmetic |
| 05:28 | `1.8×` written, then the **0.88 and 0.49 figures traced back to the shortest and longest tubes** with two arrows | The short line steals from the long one. One picture says that |
| 06:02 | The naive delays are **not erased** — the real ones are written above them in a second colour, both visible | The comparison *is* the lesson. Erasing the first answer hides that the obvious calculation was wrong |
| 06:12 | `t ∝ L²` boxed, and **"a 10 % length error is a 21 % delay error"** written under it | The sensitivity is what an assembler needs. The proportionality alone does not tell them how careful to be |
| 07:30 | On the two traces, the tubing shift is drawn as **two arrows of visibly different length**, chin's longer | The mechanism is that one signal is delayed more than the other. Two unequal arrows say it without words |
| 07:38 | `0.61 m/s` written beside `0.35 m/s`, and the **plume drawn twice on the headset outline, once at each speed** | A 75 % error in an inferred velocity is abstract. Two plumes at different speeds is not |
| 08:00 | The two flat traces are drawn **genuinely identical**, held 3 s in silence before the tubing shift is applied | The viewer has to believe there is nothing there before they can be shown something being manufactured |
| 08:20 | **Lower third at full size:** "matched line lengths are not cosmetic — an unmatched set fabricates an airflow direction that is not there" | Verbatim. Not paraphrased, not shortened, not in smaller type |
| 08:28 | The **downward arrow** drawn on the headset, then a **hard-edged red X** placed on it, held 3 s | This is the punchline. Give it the dwell |
| 08:52 | The three `0.286 s` figures written, then the word **"late"** written beside them and **"different"** written and struck through | Matching does not remove the delay. It removes the *difference*, which is the only part that matters |
| 09:16 | The smeared step drawn with its **first movement and its 50 % point both marked**, and the gap between them labelled `2×` | The factor of two is exact and is the entire justification for E03's 50 % rule |
| 09:20 | **Lower third:** "Taylor–Aris at 2.8× its validity threshold · this is an order of magnitude, not a result" | The assumption and its weakness, in one line, where a viewer will quote the number from |

## Narration

**[00:00 — the question]**

Three pods, three tubes, one pump. A pod reports eighteen hundred parts per million.

*(beat)*

Here is a question nobody asks and everybody should. **When** was that air at your face?

Not "is the number right" — M5 did that. When did the gas the sensor is looking at leave the place we
claimed to be measuring? Because it did not teleport. It came down a tube.

**[00:36 — two clocks]**

Before any arithmetic, two quantities, and the whole module is about not mixing them up.

*(writing, two colours)*

M5 gave you **T90** — how long the sensor takes to reach ninety percent of a new reading once the gas
at *its* inlet changes. That is a property of the sensor.

This is the other one. **Transport delay.** How long the gas takes to get from the tip of the tube,
where we wanted to measure, to the sensor's inlet in the first place. That is a property of the
plumbing.

*(circling)*

What you actually see is the sum. And they are corrected completely differently — a transport delay is
a pure shift, so you subtract it and you are done. A T90 is a smear, so you deconvolve it or you live
with it. Subtract when you should have deconvolved and the distortion is still there. Deconvolve when
you should have subtracted, and you invent structure that was never in the gas.

**[01:04 — the only geometry you need]**

One number carries the whole video.

*(writing)*

Three millimetre bore. Radius one point five. Area is pi r squared — seven point nought seven square
millimetres.

*(rewriting)*

And here is the useful form: seven point nought seven **millilitres per metre** of tube. That is how
much air a metre of this line is holding at any moment.

One thing said out loud before we use it. Three millimetres, and the lengths I am about to use, are
worked numbers. Nobody has cut this tubing. Deliverable two point three point four literally says
"confirm tubing inner diameter" — it has not been confirmed. The method is what transfers.

**[01:24 — pause 1]**

Your turn. Two litres a minute, split three ways, three millimetre bore.

How long does air take to travel forty-five centimetres?

*(pause — hold the card)*

**[01:42 — the obvious answer]**

Two divided by three is nought point six seven litres a minute. In useful units, eleven point one one
millilitres per second.

*(writing)*

Volume in the line: nought point four five metres times seven point nought seven is three point one
eight millilitres.

Divide. **Nought point two eight six seconds.**

*(the table builds)*

Do the other two. Twenty-five centimetres gives nought point one five nine. Thirty-five gives nought
point two two three. Forty-five gives nought point two eight six.

*(the box)*

So the three pods are not late by the same amount. There is a **hundred and twenty-seven millisecond**
spread across the set, purely because the tubes are different lengths.

Hold that number. It is wrong, and it is wrong in the safe direction, which is the worst kind.

**[02:52 — two checks before we trust any of this]**

Two quick sanity checks, because I have just used a formula I have not justified.

*(writing)*

Reynolds number. Mean velocity one point five seven metres a second, times three millimetres, over the
kinematic viscosity. **Three hundred and eight.** Transition in a pipe is around twenty-three hundred.
We are laminar with a factor of seven in hand.

*(the two bars)*

And is the tubing choking the pump? Hagen–Poiseuille on the longest line gives forty-six pascals.
Nought point four six millibar. The pump stalls at **two hundred and ten**.

*(beat)*

Nought point two percent. The tubing is not the limit and it never will be. Which is worth knowing,
because it means every problem left in this video is about the *balance* between the lines and never
about the total.

**[03:30 — the fourth power]**

Now look properly at what Poiseuille is telling us.

*(writing)*

Pressure drop is one twenty-eight, mu, `L`, `Q`, over pi `d` to the **fourth**.

*(circling `d⁴`)*

Fourth power. Halve the bore, and the resistance goes up by *sixteen*. That is why a kink is not a
minor problem and why "confirm the inner diameter" is its own line in the deliverables.

Strip it down: resistance is proportional to length over `d` to the fourth. A tube is a resistor.

**[04:30 — pause 2]**

Which sets up the question this video is really about.

Three tubes. One manifold. Different lengths.

Does each one get a third of the flow?

*(pause — hold the card)*

**[04:48 — no]**

No. And this is the part that catches people who have done everything else right.

Three tubes off one manifold are three resistors in **parallel** — same pressure across all of them.
Parallel resistors do not split current evenly. They split it in proportion to their **conductance**,
which is one over `L`.

*(writing, the tubes thickening and thinning)*

One over nought point two five, one over nought point three five, one over nought point four five.
Normalise. Forty-four percent, thirty-one and a half, twenty-four and a half.

*(the flows)*

So the real flows are nought point eight eight, nought point six three, and nought point four nine
litres a minute.

*(the arrows, `1.8×` boxed)*

The short line is pulling **one point eight times** what the long line gets. It is stealing from it.

**[05:36 — and now both effects compound]**

Go back to `t_d` equals `V` over `Q` and watch what happens.

*(writing above the old numbers, second colour)*

The long line holds **more** gas. And it receives **less** flow. Both push the same way.

Top: nought point one two nought seconds. Forehead: nought point two three six. Chin: **nought point
three nine nought.**

*(the spread)*

Spread across the set: **two hundred and seventy milliseconds.** The naive calculation said a hundred
and twenty-seven. It was wrong by a factor of two point one, and it was wrong *low*.

*(the ratios)*

And look at the ratios — one, one point nine six, three point two four. Those are the squares of one,
one point four, one point eight. Which are the length ratios.

*(boxing)*

**Transport delay goes as the square of line length.** Not linear. Squared, because length hurts you
twice. A ten percent length error is a twenty-one percent delay error.

**[06:20 — what this does to actual science]**

Part three, and this is why the module exists.

*(the two traces)*

M8 detects which pod is downstream by cross-correlating two pods and reading off the lag. In a plume
rising at nought point three five metres a second, over a chin-to-top separation of twenty-two
centimetres, the true lag is **nought point six two nine seconds.** Chin first, top second. Air is
going up.

**[06:40 — pause 3]**

So: add the tubing. What lag does the headset actually record?

*(pause — hold the card)*

**[07:00 — the plume case]**

The chin's signal is held up nought point three nine nought seconds by its tube. The top's is held up
only nought point one two nought.

*(writing)*

Six two nine, plus one two nought, minus three nine nought. **Nought point three five nine seconds.**

*(the two plumes drawn)*

Still chin first. Still upward. The direction survives — and the *number* does not. Invert it for
velocity: twenty-two centimetres over nought point three five nine is **nought point six one metres a
second**, against a truth of nought point three five.

**Seventy-five percent high.** In a paper, that is a plume moving nearly twice as fast as it is.

**[07:44 — and now the case that should worry you]**

But that was the easy case, because there was a real signal to corrupt.

*(the traces wiped, redrawn flat and identical — hold, silence)*

Now: **no flow.** Still air. Plume collapsed. The IBD regime from M1 — which is, let me point out, the
exact condition this entire project exists to study. The two pods see the same thing at the same time.
True lag: zero.

*(the tubing shift applied)*

Apply the tubing. One two nought minus three nine zero.

*(writing)*

**Minus nought point two seven zero seconds.**

*(beat)*

Negative. The **top** pod sees it first. By a quarter of a second, consistently.

*(the downward arrow, then the red X)*

So M8 looks at that, inverts it, and reports air moving from the top of the head down to the chin at
**nought point eight two metres a second.**

There is no air moving. There is no plume. The subject is lying still in a sealed room and the
instrument has just reported a confident, high-velocity **downward** airflow — with a direction, with a
magnitude, and with a beautifully tight error bar, because this artefact is a property of the tubing.
It is identical on every subject. It repeats perfectly across every session. It survives every
consistency check you would think to run, because **it is not noise. It is geometry.**

*(the lower third)*

Matched line lengths are not cosmetic. An unmatched set fabricates an airflow direction that is not
there.

**[08:36 — the fix, which is embarrassingly cheap]**

*(the lengths struck through and rewritten)*

Cut all three to the length of the longest. Forty-five, forty-five, forty-five.

Equal resistances, so equal flows — nought point six seven each, genuinely this time. Equal volumes.
Nought point two eight six seconds, three times.

*(the differences written as zeros)*

Differential delay: **zero.**

*(the word "late" written)*

And yes, everything is now late by nought point two eight six seconds — including the two lines that
used to be quicker. That cost is very close to nothing, and here is why. The measurement is chin
*minus* top. A delay common to both **cancels out of a difference exactly.** The only time the absolute
delay matters is when you line a pod up against something that is not another pod — an anemometer, a
breath marker, a video frame — and then it is one known constant that you subtract once.

Common-mode delay is free. Differential delay is not. Trade one for the other every time.

**[09:06 — one last thing, and it is why E03 says fifty percent]**

*(the smeared step)*

The step does not arrive as a step. Laminar flow is a parabola — gas on the centreline moves at
**twice** the mean, gas at the wall does not move at all — and diffusion smears between them the whole
way down. Dispersion, about two hundred and forty-five times molecular.

*(marking the edge)*

So on that chin line, the first molecules arrive at **nought point one nine five seconds** — exactly
half the volumetric delay. The fifty percent crossing arrives at nought point three nine zero.

*(the `2×` label)*

If you measure transport delay off first movement, you are not slightly early. You are early by a
factor of two, systematically, every single time.

*(the lower third)*

Fifty percent crossing. Always.

**[09:26 — what to take away]**

Three sentences.

Transport delay is `V` over `Q`, and both of them are set by things you can control with a pair of
scissors.

Lines on a shared manifold do not split evenly, so delay goes as length **squared**.

And an unmatched set does not add noise to M8's airflow direction — it **manufactures one**, cleanly,
repeatably, in a way no statistic will ever flag.

*(the final line)*

Match the lengths. Measure the delay. Subtract the common part.

*(hold, fade)*

---

**Word count:** ~1,830 · **Target pace:** 150 wpm + three 18-second pauses + written-arithmetic dwell
and one deliberate 3-second silence at 08:00 ≈ 9:40

## Notes for the recorder

- **The lower third at 08:20 is verbatim.** "Matched line lengths are not cosmetic — an unmatched set
  fabricates an airflow direction that is not there." Q17 tests this and E03 depends on it.
- **The 00:52 caption must be spoken *and* written.** No tubing has been cut. If a viewer leaves
  quoting 0.39 s as the chin pod's real transport delay, this video has done net harm, and that is the
  single most likely failure.
- **Do not erase the naive delays at 06:02.** The whole beat is that a competent, obvious calculation
  gave an answer that was too small by a factor of two. Erasing the first answer converts a correction
  into an announcement.
- **The three seconds of silence at 08:00 are in the script on purpose.** The viewer has to be
  convinced there is genuinely nothing in those two traces before they are shown something being
  fabricated out of them. Narrating over it kills the beat.
- Say **"still air"**, never "no signal". There is a signal — it is a correct measurement of a real
  atmosphere that happens to be uniform. That is the point: the instrument does not fail on garbage,
  it fails on a perfectly good null result.
- Do not let the ad-lib round 0.269549 to "about a quarter of a second" *and* then divide by it. Use
  0.270 for display and the full figure for arithmetic, or the fabricated velocity comes out 0.88
  instead of 0.82.
- `t_d` is said as "transport delay" throughout, never "lag" — "lag" is reserved for the cross-pod
  quantity in Part 3, and using one word for both undoes the video.
- Every number is in the values table above. If the tablet disagrees with that table, the tablet is
  wrong.
