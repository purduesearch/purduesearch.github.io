# V11 — Worked problem: is the plume buoyant?

| | |
|---|---|
| **Course / section** | ARES 101 · M1 · "Worked problem: is the plume buoyant?" |
| **Runtime** | 7:20 |
| **Format** | Tablet handwriting over slide backdrop + VO |
| **Backdrop** | Static slide: standing human silhouette, left third of frame; writing area is the right two thirds |
| **Prerequisite on screen** | Nothing — every value used is written out before it is used |
| **Recorded** | ☐ |

## Purpose

M1 asserts that Gr and Ra are enormous for a human body and that Pe collapses when gravity does. This
is where those claims get earned. The viewer should leave able to reproduce all three numbers on
paper, and — more importantly — able to say which one broke when gravity was removed and why the other
one did not.

The second half is the one that matters. Most people arrive believing microgravity somehow stops CO₂
from moving. The arithmetic here shows that diffusion is untouched. It is convection that dies, and
diffusion is roughly four thousand times too slow to cover for it.

## Property values used, and where they come from

**Every value below is `GLOSSARY.md` §4. Do not re-interpolate from another property table** — the
glossary's rows are already corrected for the curvature that linear interpolation over 50 K spacing
introduces, and a video that quotes a different `ν` will disagree with C12 for no visible reason.

Film temperature: `T_film = (T_surface + T_∞)/2 = (310.15 + 295.15)/2 = 302.65 K` (29.5 °C).
Interpolating the glossary table between its 300 K and 305 K rows, at 53 % of the way:

| Symbol | Value at `T_film` = 302.65 K | Source |
|---|---|---|
| `ν` | 1.6165 × 10⁻⁵ m²/s | `GLOSSARY.md` §4, interpolated 300 → 305 K |
| `α` | 2.2871 × 10⁻⁵ m²/s | `GLOSSARY.md` §4, interpolated 300 → 305 K |
| `Pr = ν/α` | 0.7068 | computed, not read off |
| `β = 1/T_film` | 3.3041 × 10⁻³ K⁻¹ | ideal gas, at film temperature |
| `D` (CO₂ in air) | 1.6 × 10⁻⁵ m²/s | `GLOSSARY.md` §4, treated constant over 295–305 K |
| `g` | 9.81 m/s² | Earth |
| `ΔT` | 15 K | 37 °C body reference against a 22 °C room |
| `L` | 1.7 m | body height, for the whole-body plume |

Results the narration states, each recomputed at review:

| Quantity | Value | Rounded on screen as |
|---|---|---|
| `Gr` | 9.1414 × 10⁹ | 9.1 × 10⁹ |
| `Ra = Gr·Pr` | 6.4611 × 10⁹ | 6.5 × 10⁹ |
| `V_buoy = √(g·β·ΔT·L)` | 0.9091 m/s | 0.91 m/s |
| `Pe` (V = 0.3 m/s, L = 0.2 m) | 3,750 | ≈ 4 × 10³ |
| `t_adv = L/V` | 0.667 s | 0.7 s |
| `t_diff = L²/D` | 2,500 s | 42 min |
| `Gr` at Mars (0.378 g) | 3.4554 × 10⁹ | 3.5 × 10⁹ |
| `V_buoy` ratio at Mars, `√(g_M/g)` | 0.6150 | 0.61 |

## Shot list

| Time | On screen | What is written |
|---|---|---|
| 00:00–00:38 | Backdrop only, silhouette | The question, boxed: *is buoyancy actually driving this flow, or is it a rounding error?* |
| 00:38–01:32 | Backdrop + property table pinned right | `T_film` calculation, then the eight-row value table |
| 01:32–02:00 | Property table dims to 40 % | `Gr = gβΔTL³/ν²` written large, symbols labelled one at a time |
| 02:00–02:20 | **PAUSE CARD 1** over dimmed board | "Your turn. Substitute and get Gr." — values stay legible |
| 02:20–03:02 | Board | Substitution line by line, then `Gr ≈ 9.1 × 10⁹` circled |
| 03:02–03:44 | Board, Gr result held top-right | `Pr = 0.7068`, `Ra = Gr·Pr ≈ 6.5 × 10⁹`, then the Ra ≈ 10⁹ transition note |
| 03:44–04:36 | Fresh board | `Pe = VL/D`, substitution, `Pe = 3,750`; then the two timescales side by side |
| 04:36–04:56 | **PAUSE CARD 2** over dimmed board | "Set g = 0. What happens to Gr, to Ra, and to Pe? Answer all three." |
| 04:56–05:52 | Board, three-column answer | `Gr → 0`, `Ra → 0`, `V → 0` so `Pe → 0`; `D` untouched, ringed |
| 05:52–06:40 | Backdrop + small Mars glyph | `g_M/g = 0.378`, `Gr_M ≈ 3.5 × 10⁹`, `√0.378 = 0.615`, plume 0.35 → 0.215 m/s |
| 06:40–07:05 | Everything wiped; one line remains | `t_diff / t_adv = Pe` |

## Visual edits

| Time | Edit | Why |
|---|---|---|
| 00:30 | **Boxed question** stays pinned in the top-left corner for the entire video, never removed | Seven minutes of arithmetic loses people. The question they are answering should never leave the frame |
| 00:52 | Each property value **fades in as it is named**, and the `T_film` cell gets a thin amber ring held for 4 s | The single most common error in this calculation is evaluating β at ambient and ν at film temperature. Ring the thing that fixes it |
| 01:40 | `Gr` written large; **each symbol underlined and labelled in the margin** as it is spoken — `g`, `β`, `ΔT`, `L`, `ν` | Course rule: every symbol defined at first use. This is that, on screen |
| 01:52 | The `L³` exponent **pulses once**, and "`L` is a choice — say which one" appears beneath in small caps | Gr moves by orders of magnitude with `L`. It is the fastest way to be wrong while looking right |
| 02:00 | **Pause card 1**, full-width, board dimmed but values still readable behind it | A pause the viewer cannot act on is a pause they skip. Leave them the numbers |
| 02:56 | `Gr ≈ 9.1 × 10⁹` **circled**, then `10⁹` alone highlighted | The exponent is the result. The mantissa is not |
| 03:30 | `Ra ≈ 1708` appears in **grey, struck through**, beside a small two-plate diagram, then wipes | Pre-empting the misconception with a picture beats denying it in prose |
| 04:04 | The two timescales rendered as **two horizontal bars to scale** — 0.7 s barely visible, 42 min running off frame | 3,750 is an abstraction. Two bars is not |
| 04:36 | **Pause card 2**. Three empty labelled boxes: `Gr`, `Ra`, `Pe` | Asking for three answers stops the viewer guessing one and moving on |
| 05:24 | `D = 1.6 × 10⁻⁵ m²/s` **ringed in teal and left on screen** while everything around it is struck out | This is the payload of the video. The one quantity gravity does not touch |
| 05:40 | **Lower third:** "microgravity does not stop the CO₂ — it stops the air" | The sentence the quiz tests |
| 06:20 | The 0.38g vertical line drawn onto a **miniature of Fig. 5A**, with Mars marked on it | Connects the arithmetic to the figure M3 will read properly |
| 06:52 | Final line `t_diff / t_adv = Pe` written, then everything else fades to leave only it | Recaps the whole video in one identity |

## Narration

**[00:00 — the question]**

A person standing in a room is warm, and the air around them is not. So there is buoyancy. The
question is whether that buoyancy is actually driving the flow around them, or whether it is a small
correction on top of something else.

*(beat)*

We are going to answer that with two dimensionless numbers, and then we are going to turn gravity off
and do it again. The second answer is the one worth staying for.

**[00:38 — properties]**

First, the values, because a derivation with a wrong constant reads perfectly and teaches the wrong
thing.

Body surface reference, 37 degrees Celsius. Room, 22. So delta-T is 15 kelvin, and the film
temperature — the average of the two — is 302.65 kelvin, about 29 and a half Celsius.

*(pause)*

Evaluate everything there. Kinematic viscosity nu, 1.6165 times ten to the minus five metres squared
per second. Thermal diffusivity alpha, 2.2871 times ten to the minus five. Their ratio is the Prandtl
number, 0.7068. And beta, the thermal expansion coefficient, is just one over the absolute
temperature for an ideal gas — 3.3041 times ten to the minus three per kelvin.

All four at the film temperature. Not some at film and some at ambient. It is not a large error if you
mix them, but it is an irreproducible one, and irreproducible is worse.

Characteristic length: body height, 1.7 metres. Say that out loud every time, because you are about
to see why.

**[01:32 — Grashof]**

Grashof number. Buoyancy over viscosity.

Gr equals g, times beta, times delta-T, times L cubed, all over nu squared.

*(beat)*

g is gravity. Beta converts a temperature difference into a density difference. Delta-T is how much
hotter you are than the room. L is the length scale. Nu squared in the denominator is viscosity
resisting, twice.

And notice the L cubed. Cube the length and you move the answer by three orders of magnitude, which is
why a Grashof number quoted without its length scale means nothing at all.

**[02:00 — pause 1]**

Your turn. Everything you need is on the board. Substitute and get Gr.

*(pause — hold the card)*

**[02:20 — the substitution]**

L cubed: 1.7 cubed is 4.913.

Numerator: 9.81, times 3.3041 times ten to the minus three, times 15, times 4.913. That is 2.3887.

Denominator: nu squared, 1.6165 times ten to the minus five, squared — 2.613 times ten to the minus
ten.

*(beat)*

Divide. Nine point one four times ten to the ninth.

Nine billion. Buoyancy is not a correction to the flow around a person. Buoyancy is the flow around a
person.

**[03:02 — Rayleigh]**

Rayleigh is Grashof times Prandtl — buoyant driving against diffusive damping instead of just viscous
damping.

9.1414 times ten to the ninth, times 0.7068. Six point four six times ten to the ninth. Call it
6.5 billion.

*(pause)*

Now, one thing to be careful about, because this is where people get told something false.

There is no critical Rayleigh number for a heated vertical surface in open air. Any temperature
difference at all drives some flow. The famous critical value, seventeen hundred and eight, belongs to
a fluid trapped between two plates and heated from below — different geometry, different problem.

What Ra tells you here is how vigorous the flow is. And around ten to the ninth, a buoyant boundary
layer on a vertical surface goes turbulent. We are at six times that. So the plume on a standing
person is not a gentle laminar drift. It is a turbulent column, and it is fast enough that the CFD
puts three to four tenths of a metre per second at the top of the head.

**[03:44 — Péclet]**

Second question. When the air does move, does it actually beat diffusion at carrying CO₂?

Péclet number. V L over D. Velocity times length, over the diffusivity of CO₂ in air, which is
1.6 times ten to the minus five metres squared per second.

Take the plume at 0.3 metres per second, and take the breathing zone in front of a face as 0.2 metres.

*(beat)*

0.3 times 0.2 is 0.06. Divided by 1.6 times ten to the minus five. Three thousand, seven hundred and
fifty.

Advection beats diffusion by almost four thousand to one. But that ratio is easier to feel as two
times.

Advection clears that 0.2 metres in L over V — two thirds of a second.

Diffusion alone clears it in L squared over D. 0.2 squared is 0.04, over 1.6 times ten to the minus
five, is two thousand five hundred seconds. Forty-two minutes.

*(pause)*

Same air. Same CO₂. Two thirds of a second, or forty-two minutes.

**[04:36 — pause 2]**

Set g to zero. Not small — zero.

What happens to Grashof? To Rayleigh? And to Péclet? Answer all three before I do.

*(pause — hold the card)*

**[04:56 — the collapse]**

Grashof. g is a factor in the numerator, so Gr goes to zero. Nothing subtle about it.

Rayleigh is Gr times Pr, so Ra goes to zero with it.

Péclet is the interesting one. D did not change. Diffusivity is a molecular property — it has no idea
whether it is in orbit. What changed is V. No buoyancy means no plume means no velocity, so Pe goes to
zero because its numerator did.

*(beat)*

So which transport mechanism survived?

Diffusion. Entirely intact. Two thousand five hundred seconds to clear the region in front of a face.

And a resting breath takes about four seconds. Over those forty-two minutes you will take
six hundred and twenty-five more of them, every one re-injecting CO₂ into a volume that is clearing
six hundred times slower than you are filling it.

*(pause)*

That is the CO₂ bubble. Not a failure of the life support system. Not a leak. Just diffusion being
the only mechanism left, and diffusion being far too slow.

Say it the right way round: **microgravity does not stop the CO₂ from moving. It stops the air from
moving.**

**[05:52 — Mars]**

One more, because gravity is not a switch.

Mars is 3.71 metres per second squared. Divided by 9.81, that is 0.378 — thirty-eight percent of
Earth.

Grashof is linear in g, so Grashof on Mars is 0.378 times nine point one four billion. Three point
five billion. Still large. Still turbulent.

*(beat)*

But the plume speed does not scale with g. It scales with the square root of g, because the buoyant
velocity scale is the square root of g beta delta-T L. Root of 0.378 is 0.615.

So a plume that runs at 0.35 metres per second here runs at about 0.215 on Mars. Not gone. Weaker.

And that is why the paper's threshold sits at 0.38g rather than at zero. Mars is not microgravity — it
is right on the edge of where the arithmetic says the plume stops being good enough. M3 reads that
result properly off Figure 5A.

**[06:40 — close]**

One line to take away.

*(writing)*

t-diffusive over t-advective equals Péclet.

That is not a new formula. It is the same Péclet number, read as a question: how many times faster
does the flow clear this space than diffusion would on its own?

On Earth, four thousand.

*(beat)*

In orbit, zero — and be careful with that, because zero here does not mean "nothing gets cleared". It
means there is no advective time left to divide by. The flow contributes nothing, so diffusion is the
whole budget, and the whole budget is forty-two minutes.

*(hold, fade)*

---

**Word count:** ~1,070 · **Target pace:** 150 wpm + two 20-second pauses + written-arithmetic dwell
≈ 7:20

## Notes for the recorder

- **Do not round early.** Write 9.1414 × 10⁹ on the board and *then* say "call it nine point one".
  Rounding at the substitution step and then quoting a precise Ra is how a viewer catches you being
  sloppy and stops trusting the rest.
- The pause at 04:36 asks for three answers on purpose. A viewer who answers only "Gr goes to zero"
  and unpauses is the exact viewer Q12 catches out. If the card feels long on screen, it isn't.
- The `Ra = 1708` strike-through at 03:30 is not padding. Every intro heat-transfer course teaches
  Rayleigh–Bénard first, so half the audience arrives with a critical Rayleigh number they are about
  to misapply.
- The 0.91 m/s buoyant velocity scale is deliberately **not** stated in the narration, only used
  implicitly for the Mars square-root argument. If you want to add it, add the honest caveat with it:
  √(gβΔTL) = 0.91 m/s is an upper bound on the whole-body scale, and the CFD's 0.3–0.4 m/s at the
  crown is what wall friction and entrainment cost you. Dimensional analysis gives the scale, not the
  number.
- Every property value is in the table above. If a value on the tablet disagrees with that table,
  the tablet is wrong.
