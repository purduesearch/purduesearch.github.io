# S03 — CTA circuit reference (deck outline)

| | |
|---|---|
| **Course / section** | ARES 101 · M7 · "CTA circuit reference deck" |
| **Kind** | SLIDES — built as a deck, exported to PDF, imported through the slides workbench |
| **Slides** | 12 |
| **Narration** | Optional. If recorded, sync per-slide start times in the workbench. |
| **Overlay questions** | 1 (slide 3) |
| **Built** | ☐ |

## Why a deck and not a video

Two of these slides are **diagrams somebody will open while holding a board**, and that is the whole
argument.

**Slide 4 (the bridge topology)** and **slide 8 (the calibration curve)** are the ones that get
reopened. A member probing the board with a multimeter needs to know which node is which, and they need
it in the same posture as the probes — glanceable, static, scrollable back to. A member fitting King's
law to ten points needs to see what a good fit and a bad extrapolation look like next to each other.
Neither of those is a thing you scrub a video for. You cannot hold a paused frame next to a
oscilloscope, and you certainly cannot search it.

The rest of the module carries the argument. `C18` is the prose and the derivations, `L07` is where
the calibration problem gets its evidence, and `E04` is where the open question gets attacked. This
deck is the thing you reopen at the bench afterwards.

**One standing rule for whoever builds it.** Slides 4, 5, 6 and 10 contain numbers read off
`FS7.0.1l.195 CTA.kicad_sch` and `fs7.0.1l.195 tech sheet.pdf` in the Drive `CTAs` folder. **The
schematic is the source of truth, not this deck.** If the board is revised, these slides are revised in
the same commit, or the deck starts lying to somebody holding a different board.

## Slides

### 1 · Title
"Anemometry and the CTA circuit." Subtitle: *reference deck — the bridge, the loop, the curve, and
three questions nobody has answered.* No body text.

### 2 · Why 0.3 m/s is hard
The framing slide. Three panels, left to right, each a method with a red cross through it and one line
of why:

| Vane anemometer | Pitot tube | Wind tunnel calibration |
|---|---|---|
| Most do not start turning until ~0.5 m/s | Dynamic pressure at 0.3 m/s is **0.054 Pa** — half a millionth of an atmosphere | Below ~1 m/s the flow pulsates and is not steady or uniform enough to be a standard |

Then, full width along the bottom, the one that survives:

**Heat something. Measure how fast the air steals the heat.**

Small caption: *the plume we are chasing is 0.3–0.4 m/s (M2). Everything on this deck is about
resolving that band.*

### 3 · CTA or CCA
Two columns, same layout, so the difference is the only thing that moves.

| **Constant current** (CCA) | **Constant temperature** (CTA) |
|---|---|
| Fix the current. The element's temperature — and resistance — moves with the flow. | Fix the temperature. The **power needed to hold it** moves with the flow. |
| Rate-limited by the element's thermal mass | Feedback restores temperature almost as fast as flow disturbs it |
| Overheat varies across the velocity range → the calibration is a fit to a moving target | Overheat stays fixed → `A`, `B`, `n` mean something |
| At low flow, less cooling at fixed current means a **hotter and hotter element** | Self-limiting: less cooling, less power, same temperature |

**Overlay question (SINGLE):** *A CTA and a CCA are both watching a heated element. What does the
feedback loop in the CTA take out of the measurement path?*
→ **The element's thermal mass.** Because the loop holds the temperature fixed, the element never has
to heat up or cool down for the reading to change, so the bandwidth is set by the amplifier rather than
by the wire.
Distractors: *the fluid's thermal conductivity · the ambient temperature dependence · the need for
calibration.* The last one is the tempting wrong answer and it is worth a rewind — a CTA needs
calibration exactly as much as a CCA does, and slides 7 to 9 are about how much.
*Rewind to slide 3 on a wrong answer.*

Then, below the fold and **do not cut it for space**, because it is the honest half:

> At breathing rate — 0.2 to 0.5 Hz — bandwidth alone would not decide this. The FS7's own t63 is
> ~200 ms. The reasons CTA wins **here** are that the breath signal lives in onsets of tens of
> milliseconds, that CCA is a burnout risk at the bottom of our range, and that a fixed overheat is
> what makes a calibration curve portable.

### 4 · The bridge
**The screenshot slide.** Full-bleed schematic diagram, drawn clean, no footer, no logo. This is the
one people open at the bench.

Draw it as a bridge, top node **V_BRIDGE**, both arms down to ground, with the op-amp straddling them:

```
                         V_IN (raw)
                            │
                  ┌─────────┼──────────┐
                  │         │          │
                 R3        Q1 (BC547)  │   R3 = 1 kΩ  ── start-up path
                 1k     collector      │   Q1 emitter follower
                  │         │          │
                  └────► V_BRIDGE ◄────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
             R1 50 Ω                    R4 1.2 kΩ
              │                           │
          ┌── SENSE ───┐               UPLUS ─────────────► U1 pin 3  (+)
          │            │                  │
      FS7 heater   R2 1 kΩ trim      ┌────┴────┐
      R_H = 45 Ω     (across          │         │
          │         the heater)   FS7 ref.    R5 10 kΩ
          │            │  wiper    R_S=1.2k     │
         GND          GND  └──────► U1 pin 2 (−)│
                                               GND
```

Callouts, one line each, pinned to the nodes:

- **R1 + heater** — the sensor arm. The heater is the thing the air cools.
- **R4 + (R_S ∥ R5)** — the reference arm. `R_S` is the FS7's own platinum reference element, on the
  same die as the heater, seeing the same air. **This is what makes the loop hold a constant
  *overheat* rather than a constant absolute temperature.**
- **R2** — the overheat trim. See slide 6.
- **U1 = TL071**, powered from the raw rail, V− at ground.

Footer line, small: *values read from `FS7.0.1l.195 CTA.kicad_sch`, 2026-05-22 revision.*

### 5 · The loop, drawn as a loop
Same information, different picture, and it is worth a slide of its own because the bridge diagram
makes this hard to see. Six boxes in a **ring**, arrows one way round:

**air moves faster → heater cools → R_H falls → SENSE falls → op-amp output rises → Q1 drives
V_BRIDGE up → more current through the heater → temperature restored**

Two labels on the ring:

- On the op-amp box: **1.5 MΩ feedback into a few-hundred-ohm wiper — DC loop gain in the thousands.**
  That is what "constant" in constant-temperature means.
- On the same box, in the accent colour: **47 pF across the feedback, pole ≈ 2.3 kHz.** Caption:
  *this capacitor is the difference between a CTA and an oscillator. Do not adjust it casually.*

One line at the bottom: **What you record is the op-amp output**, which sits one V_BE above V_BRIDGE.
V_BE drifts about −2 mV/K, so the recorded `E` carries a small ambient-temperature term that the fitted
constants absorb silently.

### 6 · Overheat — one pot, two ceilings
Left half: what turning R2 does. Wiper toward the sense node → the loop is satisfied sooner → **cooler
element, less sensitivity**. Wiper toward ground → **hotter element, more signal.**

Right half, the two ceilings, as a pair of hard stops:

| Ceiling | Number | What happens past it |
|---|---|---|
| **Electrical** | Heater **max 3 V at 0 m/s** (nominal band 2–5 V at ΔT = 30 K, 0–100 m/s) | Still air is the dangerous case — nothing is carrying the heat away. Set the trim for the sensitivity you want at 0.3 m/s and you can be past the still-air limit without seeing it. |
| **Physical** | Self-generated buoyancy ≈ **0.04–0.08 m/s** | Below that the sensor is measuring its own plume more than yours |

Bottom strip, and it does not get shrunk: **the course quotes an anemometry range of 0.05–0.4 m/s. The
bottom of that range is below the buoyancy crossover.** The crossover depends on which heated length
you take — 6.9 mm gives 0.08 m/s, 2 mm gives 0.044 — and **nobody on this project has measured which**.
`C18` has the derivation.

### 7 · King's law, and what each constant is
The equation, large and monospaced, alone in the top third:

```
E² = A + B · Vⁿ
```

Then one row per constant, with an icon:

| | Is | And therefore |
|---|---|---|
| **A** | The still-air term — conduction into the supports plus natural convection off the element | It is not a fitting artefact. It does not go away at V = 0. |
| **B** | The scale of the forced-convection term | Per-probe. Carries the overheat setting inside it. |
| **n** | The exponent | **Not 0.5.** Zhou et al. fit 0.5578–0.7074 below 1 m/s. |

Bottom, in the accent colour and large enough to read from a phone:

**`dE²/dV ∝ V^(n−1)`, and `n < 1`, so sensitivity is *highest* at the low end.**
*The one piece of good news in this module: a thermal anemometer is most sensitive exactly where ARES
needs it.*

Footer, small: *`A`, `B` and `n` are per-probe and are only valid over the range they were fitted on.
`GLOSSARY.md` §1 fixes this form for the whole course.*

### 8 · The calibration curve
**The second screenshot slide.** Full-bleed plot, no decoration.

`E` on the vertical axis, `V` on the horizontal, 0 to 1.0 m/s. Draw:

- Ten calibration points at 0.1, 0.2, … 1.0 m/s — Zhou et al.'s actual spacing.
- The fitted `E² = A + B·Vⁿ` curve through them, solid.
- **Shade the 0.3–0.4 m/s band** in the accent colour and label it *the plume (M2)*.
- A dashed continuation of the curve **below 0.1 m/s**, marked with a warning rule and the caption
  *extrapolated — no calibration points here.*
- On the same axes, in a muted colour, a straight-line fit through the same points, diverging badly at
  the bottom. Caption: *assuming n = 0.5 or fitting a line looks fine and is wrong where it matters.*

One line under the plot: **The curve is steepest at the left.** That is the sensitivity result from
slide 7, and it is also why an error in `A` costs you most at the velocities you care about.

Bottom strip, three numbers, big:

| 0.02236 m/s | 5.214 % | 8.527 % |
|---|---|---|
| Best absolute fit error, modified King's law | Max relative error, King's law | Max relative error, Van der Hegge Zijnen |

Caption: *research-grade CTA, metrology-grade rig, ten points. Nobody should hold ARES to better, and
nobody should quote an ARES air-speed to three significant figures.*

### 9 · The calibration belongs to its temperature and humidity
Dark slide. Two numbers, as large as they will go, side by side:

| **5.672 % per °C** | **1.2676 % per %RH** |
|---|---|
| Velocity error from using a curve fitted at a different air temperature | Velocity error from using a curve fitted at a different humidity |

Beneath, three bullets:

- **A CTA cannot tell velocity from temperature.** Its output responds to the air's ability to carry
  heat away. It has no way to know whether that changed because the air moved faster or because it got
  cooler. Zhou et al. state it plainly: *in non-isothermal flows the responses to velocity and
  temperature are indistinguishable.*
- Those figures are the **residual on a research-grade Dantec Streamline**. Do not assume the reference
  arm on slide 4 makes the problem go away — it holds the *overheat* roughly constant, which removes the
  first-order term and not the rest.
- **Bench-calibrate, then wear it on a head, then run a 37 °C thermal session.** A ten-degree mismatch
  is not a corner case.

Closing line, full width: **Every anemometer reading needs an air temperature recorded beside it.**
Small: *which ARES already gets for free — there is an SHT45 in every pod.*

### 10 · The FS7 envelope
Pure reference table. The part, as specified.

**IST AG FS7.0.1L.195** — platinum thin-film thermal mass flow sensor

| | |
|---|---|
| Size | 6.9 × 2.4 × 0.20 mm (0.60 mm at the heater) |
| Range | 0 to 100 m/s |
| Response sensitivity | 0.01 m/s |
| Accuracy | < 3 % of measured value — **dependent on the electronics and the calibration** |
| Response time | t63 ≈ 200 ms (step 0 → 10,000 sccm) |
| Operating temperature | −20 °C to +150 °C |
| Temperature sensitivity | < 0.1 %/K — **dependent on the electronics** |
| Heater | R_H(0 °C) = 45 Ω ±1 % |
| Reference element | R_S(0 °C) = 1200 Ω ±1 % |
| Drive | 2–5 V nominal at ΔT = 30 K; **max 3 V at 0 m/s** |
| Connection | 3 pins — heater · temperature sensor · ground — 195 mm PTFE AWG 30/7 |
| Part / order no. | 103705 (former ref. 050.00216) |

Two callouts along the bottom, both in the accent colour:

- **"Dependent on the electronics" appears twice.** Those two lines are not specifications you were
  given. They are targets you were set, and the board is ours.
- **0 to 100 m/s, and we want 0.3.** The entire band of interest is the bottom **0.4 %** of scale.

### 11 · Three open questions
Dark slide. No answers on it, and none anywhere else in this course. Three numbered blocks, equal
weight:

**1 · Should there be anemometers on the sides?**
Today the anemometry is on the arm. M8 infers which pod is downstream from the *lag* between
concentration traces. Side sensors would measure a lateral component instead of inferring one — at the
cost of channels, boards, mass, and calibration. *Not scoped.*

**2 · Will the chamber in-flow pump disturb the anemometer readings?**
Any pump that puts air into a test volume also stirs it, and an instrument that cannot separate
velocity from temperature certainly cannot separate your flow from the apparatus's. *Not measured.*

**3 · At what flow rate does the pump's contribution become negligible?**
The quantitative form of question 2. **This is `E04`, and the answer goes back to the team.**

Footer, and leave it in: *the question on the 7/30 slide is ambiguous about which pump — the chamber's
supply or the headset's own 0.67 L/min sampling draw. Those differ by orders of magnitude in length
scale. Saying which one you answered is part of the answer.*

### 12 · Where this goes
Closing slide. The next-generation pod from slide 11 of the 7/30 deck, as a diagram of one pod with
four labels:

- **Anemometry into every pod** — each pod reports local air speed, not just concentration. This is
  what turns M8's airflow model from an inference off a timing lag into a measurement, and it is what
  makes NASA's flow-weighted inspired-CO₂ approach possible at all: *you cannot weight by flow if you
  are not measuring flow.*
- **Oxygen (SEN0465)** — closing the loop on respiratory exchange at the face.
- **BME680** — temperature, humidity, pressure and VOCs in one package.
- **Low profile** — vertical height cut so the pod stops standing proud of its arm and shadowing the
  flow it samples. The fix M2 asked for, arriving in the same part.

One line at the bottom, and it is a real risk rather than a flourish: **the oxygen sensors may be large
enough to need a separate pod attachment** — in which case the low-profile goal and the oxygen goal are
in direct conflict, in the same revision.

## Production notes

- Build in Google Slides at 16:9, using the ARES palette (dark base, martian amber `#F59E0B` accent,
  alert red `#EF4444`). Export to PDF and import via the slides workbench.
- **Slides 4 and 8 are the ones people screenshot.** No footer, no logo, type set large enough to read
  from a phone photo taken over a bench. If either needs a second slide to breathe, split it — a
  thirteen-slide deck that stays legible beats a twelve-slide one that does not.
- **Slide 4 must be redrawn, not pasted from KiCad.** A KiCad export at slide scale is unreadable, and
  the point of the slide is the four-node structure, not the layout. Redraw it with the node names from
  the schematic so a member can move between the two without translating.
- **Slide 11 gets no answers, no hedging, and no "we think".** It is the slide that tells a new member
  the project has unfinished edges they are allowed to work on. Adding a speculative answer removes the
  invitation.
- Slide 3's honest caveat and slide 6's bottom strip are **content, not disclaimers.** They do not get
  shrunk and they do not move to speaker notes. A learner who screenshots slide 6 without the last line
  has taken away a velocity range this module exists to question.
- Speaker notes are typed per slide in the workbench after import; PDF export does not carry them.
- If narration is recorded, the overlay question still gates advancing. Do not restate its answer in the
  VO or the answer becomes free.
- Numbers on slides 4, 5, 6 and 10 come from the KiCad schematic and the IST datasheet in the Drive
  `CTAs` folder; slides 7, 8 and 9 come from `zhou2024`. If the board is revised, this deck is revised
  in the same commit — see `README.md`, rule 2.
