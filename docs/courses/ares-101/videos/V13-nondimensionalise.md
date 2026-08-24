# V13 — Worked problem: non-dimensionalise it

| | |
|---|---|
| **Course / section** | ARES 101 · M3 · "Worked problem: non-dimensionalise it" |
| **Runtime** | 8:20 |
| **Format** | Tablet handwriting over slide backdrop + VO |
| **Backdrop** | Static slide: left third is a schematic head in profile with `Lc` drawn across its width; right two thirds is the writing area. From 05:40 the backdrop swaps to a clean redraw of Fig. 5A |
| **Prerequisite on screen** | Nothing. `Lc`, `Vc` and `ν` are all written out before use |
| **Recorded** | ☐ |

## Purpose

C14 asserts three things about the paper's method: that non-dimensionalising produces exactly one
dimensionless group in the viscous term, that gravity and ambient temperature are the same knob, and
that the two famous numbers on Fig. 5A are simulation outputs. This is where a viewer earns all three
with a pencil.

Part 3 is the reason the video exists. **The 14 % is an efficiency reduction inside a simulation, not
a measured physiological outcome, and the 0.38g is a value read off a modelled curve.** Both go on
screen with that qualification attached, in writing, not only in the voice-over. A viewer who leaves
able to compute Re but still saying "gas exchange drops 14 % in microgravity" has missed the module.

## Values used, and where they come from

**`Lc` is `1/6 m`, not 0.15 m.** The curriculum plan and two earlier drafts of `GLOSSARY.md` carried
0.15 m; the paper's Materials and Methods states one sixth of a metre, and the paper's own reported
Reynolds number is what settles it. See `GLOSSARY.md` §6, corrected 2026-08-09. If a future edit
reverts this, the arithmetic below stops reproducing the paper.

| Symbol | Value | Source |
|---|---|---|
| `Lc` | 1/6 m = 0.166667 m | Dutta et al., Materials and Methods — average human head width |
| `Vc` | 0.2816 m/s | Dutta et al., Materials and Methods — **constructed**, not measured |
| `gc` | 0.4745 m/s² | `GLOSSARY.md` §6 — buoyant acceleration of 37 °C air in a 22 °C room |
| `ν` | 1.53 × 10⁻⁵ m²/s | `GLOSSARY.md` §4, dry air at 295 K (21.9 °C) |
| `ν` (paper's) | 1.52 × 10⁻⁵ m²/s | Dutta et al., stated in the Methods |
| `g_Mars / g_Earth` | 3.71 / 9.81 = 0.378 | `GLOSSARY.md` §4 |
| `ΔT_ref` | 15 K | held fixed by the paper even when ambient is varied |

Every result below was recomputed at review:

| Quantity | Working | Value | On screen as |
|---|---|---|---|
| `Vc` cross-check, `√(gc·Lc)` | √(0.4745 / 6) = √0.0790833 | 0.281217 m/s | **0.2812** vs the paper's 0.2816 |
| `Vc·Lc` | 0.2816 × 0.166667 | 0.0469333 m²/s | 4.693 × 10⁻² |
| `Re`, course `ν` | 0.0469333 / 1.53 × 10⁻⁵ | 3,067.54 | **≈ 3,070** |
| `Re`, paper's `ν` | 0.0469333 / 1.52 × 10⁻⁵ | 3,087.72 | **3,087.7** vs the paper's 3,087.71 |
| Gap between the two | (3,087.72 − 3,067.54) / 3,067.54 | 0.00658 | **0.7 %** |
| `1/Re` | 1 / 3,087.72 | 3.239 × 10⁻⁴ | ≈ 3 × 10⁻⁴ |
| `Re` if `Lc` were 0.15 m | 0.2816 × 0.15 / 1.52 × 10⁻⁵ | 2,778.9 | **2,779 — 10 % off the paper** |
| Breathing cycles simulated | 275 / 4.00047 | 68.74 | ≈ 69 cycles |
| `ĝ_eff` at 1g, 22 °C | (37 − 22) / 15 | 1.000 | 1.00 |
| `ĝ_eff` at 1g, 27 °C | (37 − 27) / 15 | 0.667 | 0.67 |
| `ĝ_eff` at 1g, 32 °C | (37 − 32) / 15 | 0.333 | 0.33 |
| `ĝ_eff` at 1g, 37 °C | (37 − 37) / 15 | 0.000 | 0.00 |
| Ambient giving `ĝ_eff` = 0.378 | 37 − 0.378 × 15 = 37 − 5.67 | 31.33 °C | **≈ 31.3 °C** |

That last row is a **derivation, not a paper result.** It follows from the paper's own scaling and the
paper does not state it. It is flagged as a derivation on screen and in the narration, and it is the
single most useful thing in this video for the ARES test plan. Do not let it be quoted as Dutta et al.

## Shot list

| Time | On screen | What is written |
|---|---|---|
| 00:00–00:34 | Backdrop, head schematic, `Lc` bracketed across the head | The question, boxed: *why does this equation have only one number in it?* |
| 00:34–01:28 | Board | The dimensional momentum equation written out, each term named |
| 01:28–02:22 | Board, scale list building in the right margin | The four scales: `x/Lc`, `u/Vc`, `t·Vc/Lc`, `p/ρVc²`; substitution into the viscous term |
| 02:22–02:42 | **PAUSE CARD 1** over dimmed board | "The viscous term picks up a coefficient. Write it, in terms of `ν`, `Vc` and `Lc`." |
| 02:42–03:20 | Board | `ν/(Vc·Lc)` written, then boxed and relabelled `1/Re` |
| 03:20–03:56 | Board, buoyancy term isolated | `gc·Lc / Vc²`, then `Vc = √(gc·Lc)` substituted, then the whole coefficient collapsing to `1` |
| 03:56–04:14 | **PAUSE CARD 2** over dimmed board | "`Lc = 1/6 m`. `Vc = 0.2816 m/s`. `ν = 1.53 × 10⁻⁵ m²/s`. Compute Re." |
| 04:14–05:06 | Board, two-column comparison | `4.693 × 10⁻² / 1.53 × 10⁻⁵ = 3,067.5`; beside it `/ 1.52 × 10⁻⁵ = 3,087.7`; the paper's `3087.71` written underneath |
| 05:06–05:40 | Board, `1/Re` isolated | `1/Re = 3.2 × 10⁻⁴`, then the DNS-affordability line |
| 05:40–06:12 | **Backdrop swaps to a redraw of Fig. 5A**; both curves drawn | `ĝ_eff = (g/g_E) × (T_body − T_amb)/15 K` written across the top |
| 06:12–06:30 | **PAUSE CARD 3** over the figure | "Where on this axis does a 1g room at 32 °C sit? And at 37 °C?" |
| 06:30–07:04 | Figure, four tick marks appearing on the axis | `1.00`, `0.67`, `0.33`, `0.00` placed against 22, 27, 32, 37 °C |
| 07:04–07:52 | Figure, the 0.38g vertical line and the 14 % bracket drawn | `0.38g` and `−14 %`, each with its qualifier written beneath in full |
| 07:52–08:20 | Figure held; one line written across the bottom | `37 − 0.378 × 15 = 31.3 °C` |

## Visual edits

| Time | Edit | Why |
|---|---|---|
| 00:26 | **Boxed question** pinned top-left for the whole video | Same rule as V11 and V12. The question never leaves the frame |
| 00:48 | Each term of the dimensional equation gets a **margin label in plain English** as it is spoken — "stuff speeding up", "stuff pushing stuff", "pressure", "stickiness", "buoyancy" | Five symbols with five English names is the difference between a wall and a sentence |
| 01:40 | The four scales written as a **fixed list in the right margin**, and left there for the rest of Part 1 | Every substitution in the next ninety seconds refers back to them |
| 02:22 | **Pause card 1**, board dimmed, the scale list still legible behind it | A pause the viewer cannot act on is a pause they skip |
| 03:04 | `ν/(Vc·Lc)` **boxed**, then the box relabelled `1/Re` with the old label still faintly visible underneath | Re is not a magic constant. It is the leftover of a substitution, and the viewer just did the substitution |
| 03:44 | `Vc = √(gc·Lc)` substituted into `gc·Lc/Vc²` **in slow motion**, terms cancelling one at a time until only `1` is left, which then **pulses** | This is the whole trick of the paper's scaling. Cancelling it by hand is worth the eight seconds |
| 03:52 | **Lower third:** "`Vc` was chosen to make this coefficient 1" | The choice was deliberate. Say so on screen or it looks like luck |
| 04:36 | The two Reynolds numbers written **side by side in different colours**, then a small `0.7 %` between them | Two nearly-equal numbers is the point; a single number would hide it |
| 04:56 | The paper's printed `Re = 3087.71 ≈ 3100` written **underneath, in quotation marks**, with a tick beside the matching column | Reproducing a paper's own number is how you know you read its methods correctly |
| 05:14 | `Lc = 0.15 m → Re = 2,779` written in **grey and struck through**, with "10 % off — wrong `Lc`" beside it | The error this course actually made. Show it being caught rather than pretending it never happened |
| 05:44 | `ĝ_eff` formula written across the top of Fig. 5A and **left there** for the rest of the video | Everything in Part 3 is read against that one expression |
| 06:12 | **Pause card 3.** Two empty boxes, labelled `32 °C` and `37 °C` | Asking for two values catches the viewer who gets the first and assumes the pattern |
| 07:10 | `−14 %` drawn as a bracket on the figure, and **immediately annotated in full**: "simulated net CO₂ exhalation, against a no-inefficiency maximum" | The qualifier is not a footnote. It goes on the same line as the number, at the same size |
| 07:26 | `0.38g` vertical line drawn, then the words **"the simulation predicts"** written *in front of it*, so the line reads as a phrase | Grammar as a teaching device. The number is the object of a verb, not a fact standing alone |
| 07:40 | A small **greyed-out silhouette of a person** appears beside the figure with a red diagonal through it, held 4 s | Nobody was measured. One image says it faster than a sentence |
| 08:00 | The 31.3 °C line written, then a **dashed box labelled DERIVED — NOT IN THE PAPER** drawn around it | Same convention as V12's dashed ASSUMPTION box. One glyph carries the honesty point |

## Narration

**[00:00 — the question]**

Open the paper's Materials and Methods and you find a momentum equation with almost nothing in it.
One coefficient on the viscous term. One on the buoyancy term. No density, no viscosity, no gravity
written anywhere.

*(beat)*

That is not the equation being simplified. That is the equation being *scaled*, and the scaling is
where the paper hides its cleverest move. We are going to do the scaling, get the Reynolds number out
of it, and then use what we learn to read the two most-quoted numbers in the whole paper correctly.

**[00:34 — the dimensional equation]**

Start with what the paper is actually solving. Incompressible Navier–Stokes, Boussinesq.

*(writing, naming each term)*

Stuff speeding up. Stuff carrying stuff. Pressure pushing. Stickiness — that is nu, the kinematic
viscosity, times the second derivative. And buoyancy, which is the only place gravity appears at all.

Every one of those terms has units of acceleration. Metres per second squared.

**[01:28 — the four scales]**

Now pick a ruler and a stopwatch.

Lengths get divided by `Lc`. The paper takes `Lc` as one sixth of a metre — the average width of a
human head. Velocities get divided by `Vc`. Time by `Lc` over `Vc`. Pressure by rho `Vc` squared.

*(pause)*

Substitute those into the viscous term and out front you get nu, over `Vc` times `Lc`.

**[02:22 — pause 1]**

Your turn, and it is one line. The viscous term picks up a coefficient. Write it, in terms of nu,
`Vc` and `Lc`.

*(pause — hold the card)*

**[02:42 — Reynolds appears]**

Nu over `Vc` `Lc`.

And that grouping has a name, which you already know. Flip it up the other way — `Vc` `Lc` over
nu — and it is the Reynolds number. So the coefficient on the viscous term is one over Re.

*(beat)*

Notice what just happened, because it is worth more than the algebra. Re did not arrive from a
textbook. It is the leftover of a substitution. It is what is still standing after you divide the
equation by its own scales, which is exactly why it is the thing that tells you which term matters.

**[03:20 — the buoyancy trick]**

Now the buoyancy term, and this is the one to watch.

Its coefficient comes out `gc` `Lc` over `Vc` squared, where `gc` is the buoyant acceleration a
parcel of 37-degree air feels in a 22-degree room. Nought point four seven four five metres per second
squared, from the glossary.

*(beat)*

But look at how the paper defines `Vc`. It is not a measured velocity. It is the square root of `gc`
times `Lc`. So substitute it in.

*(writing, cancelling)*

`Vc` squared is `gc` `Lc`. So the coefficient is `gc` `Lc` over `gc` `Lc`.

One.

*(pause)*

`Vc` was chosen to make that number one. And that is why the equation looks empty: after this scaling
the *only* free parameter left in the momentum balance is one over Re, and a dimensionless effective
gravity between zero and one. Everything else was absorbed on purpose.

While we are here — check `Vc` yourself. Root of nought point four seven four five over six is nought
point two eight one two. The paper says nought point two eight one six. Four in the ten-thousandths.
Their number is real.

**[03:56 — pause 2]**

Numbers. `Lc` is one sixth of a metre. `Vc` is nought point two eight one six metres per second. And
nu, from the glossary, air at twenty-two Celsius, is one point five three times ten to the minus five.

Compute Re.

*(pause — hold the card)*

**[04:14 — the Reynolds number]**

Numerator first. Nought point two eight one six times one sixth is four point six nine three times ten
to the minus two.

Divide by one point five three times ten to the minus five. Three thousand and sixty-seven point five.

*(beat)*

Now do it again with the paper's own viscosity, which is one point five two, slightly cooler air.
Three thousand and eighty-seven point seven.

And the paper prints three thousand and eighty-seven point seven one.

*(pause)*

Which is what reproducing a method looks like. Two viscosities a percent apart, two Reynolds numbers
under a percent apart, both rounding to about three thousand one hundred, and one of them landing on
the paper's own figure to five digits. Nothing here was taken on faith.

One warning, because this course got it wrong first. If you use `Lc` equals nought point one five
metres — which two earlier drafts of the glossary did — you get two thousand seven hundred and
seventy-nine. Ten percent off. The paper's own Reynolds number is what catches that, and it is the
reason to always reproduce a stated number before trusting the length scale you assumed.

**[05:06 — what Re ≈ 3,100 buys you]**

So what does three thousand one hundred mean here?

One over Re is about three times ten to the minus four. So the viscous term is a tiny correction
almost everywhere in this room, and it only matters in the thin layers right against the skin. That
is the physical reading.

*(beat)*

The practical reading is better. At Re of three thousand you can resolve the turbulence directly
instead of modelling it. That is why this is a direct numerical simulation rather than a RANS run,
and why about eleven thousand elements and a million grid points was enough. Push Re up two orders of
magnitude and this paper does not exist in this form.

The Reynolds number is not just a description of the flow. It is the number that decided what kind of
study this could be.

**[05:40 — one knob]**

Part three. Figure 5A, and the two numbers everyone quotes off it.

First, the axis. We said the momentum equation has one free parameter besides Re: an effective
gravity between nought and one. Here it is.

*(writing across the top)*

Effective gravity equals `g` over Earth `g`, times body temperature minus ambient, over fifteen
kelvin. Fifteen because that is the reference range the paper fixes and then holds fixed, even when it
warms the room.

*(beat)*

Read that. Gravity and the temperature difference are not two variables. They are one. Halving `g` and
halving delta-T do the identical thing to this equation.

**[06:12 — pause 3]**

So: a one-g room at thirty-two Celsius. Where does it sit on this axis? And at thirty-seven?

*(pause — hold the card)*

**[06:30 — the collapse]**

Thirty-two. Thirty-seven minus thirty-two is five. Over fifteen is nought point three three.

Thirty-seven. Thirty-seven minus thirty-seven is zero. Over fifteen is zero.

*(beat)*

Zero. Not close to zero — zero. A one-g room at body temperature has the same effective gravity as
deep space. That is Figure 6's headline result, and you just derived it from the definition of the
axis without running anything.

Twenty-two gives one. Twenty-seven gives nought point six seven. So the red temperature curve and the
blue gravity curve on this figure are not two experiments that happened to agree. They are one curve,
plotted twice.

*(pause)*

Which is a real insight and also a caution. That equivalence is largely *built into the scaling*. What
the simulations add is that the CO₂ fields agree too — and those depend on the mouth boundary
condition and the breathing waveform, not only on this equation. Give the paper credit for the second
thing, not the first.

**[07:04 — what the two numbers do and do not say]**

Now the numbers, carefully.

Fourteen percent. The paper says warm temperatures and microgravity each reduce respiratory redox gas
exchange efficiency by approximately fourteen percent.

*(writing the qualifier at full size)*

Here is what that is. It is the drop in **net simulated CO₂ exhalation** — the cumulative CO₂ that
actually left the breathing zone over about sixty-nine simulated breathing cycles — measured against a
theoretical maximum with no transport inefficiency at all.

*(beat)*

Here is what it is not. It is not a measured drop in anybody's gas exchange. It is not a change in
lung function, or alveolar diffusion, or oxygen uptake. No person was measured in this study. No
mannequin either. Fourteen percent is the model's own accounting of how much of what it exhaled it
then breathed back in.

*(the silhouette with the red diagonal appears)*

Second number. Nought point three eight g, the minimum gravity for Earth-normal exchange, marked as a
vertical line on the same figure.

That is a value read off a curve in a two-dimensional simulation, where the curve leaves its one-g
plateau. The paper gives no uncertainty band on it and states no numerical criterion for
"Earth-normal". That it lands on Mars surface gravity to two figures is genuinely striking, and it is
a coincidence in a model output — because there is no measurement at partial gravity anywhere in this
paper, or anywhere else. Every point between nought and one on that blue curve is another simulation.

*(pause)*

So say it with the verb. **The simulation predicts approximately nought point three eight g.** Four
extra words, and they are the difference between describing this project accurately and overselling
it.

**[07:52 — the number that is ours to test]**

One last line, and this one is not in the paper.

If effective gravity really is the only knob, then set it to nought point three seven eight — Mars —
and solve backwards for the room temperature that gives you the same value at one g.

*(writing)*

Thirty-seven minus nought point three seven eight times fifteen. Thirty-one point three Celsius.

*(the dashed DERIVED box is drawn)*

Dashed box, because Dutta et al. never wrote that down. It follows from their own scaling, and it says
something we can act on: **the model claims a thirty-one-degree room at one g is respiratorily Mars.**
The paper separately reports noticeable impairment at thirty-two degrees, which brackets it nicely.

You cannot rent a microgravity chamber. You can heat a room to thirty-one degrees, put three pods on a
head, and find out whether the curve has the shape this figure says it does.

That is the whole reason the headset exists.

*(hold, fade)*

---

**Word count:** ~1,640 · **Target pace:** 150 wpm + three 18-second pauses + written-arithmetic dwell
≈ 8:20

## Notes for the recorder

- **Do not shorten the qualifier at 07:10.** "Simulated net CO₂ exhalation, against a no-inefficiency
  maximum" must be written at the same size as `−14 %` and stay on screen as long as the number does.
  A qualifier in smaller type is a qualifier nobody reads, and Q14 tests exactly this distinction.
- The cancellation at 03:44 should be genuinely slow. It is one line of algebra and it is the single
  idea the first half of the video exists to deliver — if it goes past at normal writing speed the
  viewer sees a result instead of a choice.
- The struck-through `Lc = 0.15 m` at 05:14 stays in. Showing a course correcting its own arithmetic
  teaches more about reading methods than any amount of assertion that you should check things.
- The 31.3 °C derivation must never be spoken without "not in the paper" or "this follows from their
  scaling" attached. If the ad-lib drifts, re-record the line. It is the one number in this video a
  viewer could plausibly go and misattribute.
- `ĝ_eff` is written as "effective gravity" in speech throughout — do not say "g-hat-eff" out loud,
  it is unintelligible at 150 wpm. The symbol stays on the board.
- Every number is in the table above. If the tablet disagrees with that table, the tablet is wrong.
