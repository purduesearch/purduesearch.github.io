# C18 — Measuring air you cannot see

> CONTENT section · ARES 101 · M7 · ~5 min read
> Seeded into `contentJson` as rich text. Assumes the plume velocity scale from M2 (0.3–0.4 m/s at the
> crown) and the pump and sampling numbers from M6. CTA, King's law and overheat ratio are defined in
> `GLOSSARY.md` §1 — expanded at first use here, not redefined.

---

## The problem, stated before the solution

Every module so far has measured a **concentration**. CO₂ in ppm, humidity in %RH, a number that
describes what the air *is*.

This module measures what the air is *doing*. And the reason it exists is that M2's whole argument was
about motion: the plume carries exhaled CO₂ away from the face, and the CO₂ bubble is what forms when
that motion stops. A headset that measures three concentrations and no velocities can tell you the
bubble is there. It cannot tell you why, and it cannot tell you which way anything went.

So: how do you measure air moving at **0.3 m/s**?

Sit with how slow that is. It is walking pace divided by four. It will not move a hair. It will not
register on a handheld vane anemometer, most of which do not start turning until about 0.5 m/s. There
is no pressure to measure — dynamic pressure is `½ρV²`, and at 0.3 m/s in air that is
`0.5 × 1.2 × 0.09 = 0.054 Pa`, about half a millionth of an atmosphere. A pitot tube and a good
manometer will tell you nothing. This is not a limitation of cheap instruments. It is why Zhou et al.,
in the paper assigned to this module, write that a wind tunnel is *not an appropriate calibration
facility below about 1 m/s* — the pressure difference the whole method rests on has fallen into the
noise.

What you can still do is **heat something and watch how fast the air steals the heat.**

## Thermal anemometry from first principles

Put a small electrically heated element in still air. It reaches some temperature where the power you
put in equals the heat leaving by conduction, convection and radiation. Now blow gently on it. Fresh
cool air arrives faster, carries heat away faster, and the element cools.

That is the entire principle. Two ways to use it:

- **Hold the current constant** and watch the element's temperature (and therefore its resistance)
  fall as the flow rises. This is **constant-current anemometry**, CCA.
- **Hold the temperature constant** and watch the *power you have to supply* rise as the flow rises.
  This is **constant-temperature anemometry**, CTA, and it is what ARES uses.

The measured quantity in CTA is electrical power, and the relationship between it and velocity is
**King's law** — an empirical fit, not a derivation:

```
E² = A + B·Vⁿ
```

`E` is the bridge voltage, `V` is velocity, and `A`, `B` and `n` are constants found by calibration.
They are **per-probe**, and they are only valid over the velocity range they were fitted on.
`GLOSSARY.md` §1 fixes this form for the whole course.

Three things about that equation are worth more attention than they usually get.

**`A` is the still-air term.** At `V = 0` the element still loses heat — by conduction into its
supports and by natural convection off its own hot surface. `A` is that floor. It is not a fitting
artefact and it does not go away.

**`n` is not 0.5.** The textbook value comes from the classical heat-transfer correlation for a
cylinder in cross-flow at moderate Reynolds number, and it is a high-velocity idealisation. Zhou et al.
fit ten calibration points between 0.1 and 1.0 m/s and get `n` between **0.5578 and 0.7074** across
temperature and humidity conditions, and quote the standing recommendation that below 1 m/s "values of
`n` in the range from 0.5 to 1 would be more appropriate". If you assume 0.5 because a textbook said
so, you have introduced an error you will never see, because the curve will still look like a good fit.

**The response is `Vⁿ`, so sensitivity collapses at the top and is best at the bottom.** Differentiate:
`dE²/dV ∝ V^(n−1)`, and with `n < 1` that grows without bound as `V → 0`. A thermal anemometer is
*most* sensitive exactly in the regime ARES cares about. That is the good news in this module, and it
is the only piece of good news, so hold onto it.

## Why constant temperature, and not constant current

The stock answer is frequency response, and it is correct as far as it goes. In CCA the element has to
physically heat up and cool down for the reading to change, so the measurement is rate-limited by the
element's thermal mass. In CTA a feedback loop restores the temperature almost as fast as the flow
disturbs it, so the element never charges or discharges its heat capacity, and the bandwidth becomes a
property of the *amplifier* instead of the *wire*. That buys one to two orders of magnitude.

Be careful about applying that argument here, though, because the naive version of it does not survive
contact with the numbers. Breathing happens at roughly **0.2–0.5 Hz**. The FS7's own datasheet t63 is
**about 200 ms**, a corner near 0.8 Hz. A constant-current instrument would be adequate for a
*sinusoid* at breathing rate, and anyone who tells you CTA is required because 0.3 Hz is fast has not
checked.

The reasons CTA actually wins for this application are these, in order of how much they bite:

1. **The interesting signal is in the edges, not the fundamental.** An exhalation is not a sine wave;
   it is a jet that switches on over tens of milliseconds. M8's breath-detection work lives on those
   onsets. A 200 ms smear does not shift a 0.3 Hz sinusoid much, and it destroys the edge.
2. **CCA is dangerous at low velocity.** Constant current into an element that is being cooled less and
   less means the element gets hotter and hotter. At the bottom of our range that is a burnout risk and
   at best a wildly varying overheat. CTA self-limits: less cooling, less power, same temperature.
3. **CTA keeps the overheat ratio fixed, so the calibration constants stay meaningful.** In CCA the
   element's temperature moves as you traverse the velocity range, which moves the air properties at
   the film temperature, which moves the heat-transfer coefficient — so the curve you fitted is a fit
   to a moving target. In CTA the element sits at one temperature and only the power moves.

Reason 3 is the one that matters for a course about trusting numbers, and it is why the glossary
defines **overheat ratio** at all.

## Overheat: the trade you cannot avoid

The **overheat ratio** is how much hotter than the surrounding air the element is held. Raise it and
every good thing improves: more heat flux, more signal per unit velocity, better signal-to-noise, and
a stronger separation between the flow signal and ambient temperature drift.

Then raise it further and three things go wrong.

**You heat the air you are measuring.** A hot element in slow-moving air makes its own buoyant plume.
In a module whose entire subject is a buoyant plume, that is not a detail — it is the central irony of
the instrument, and it deserves an estimate rather than a shrug.

Take the FS7 at its datasheet nominal **ΔT = 30 K**, a 22 °C room, and the sensor's 6.9 mm length as
the characteristic length. The buoyant velocity scale for a heated surface is `√(g·β·ΔT·L)`, with `β`
evaluated at the film temperature of 37 °C = 310 K, so `β = 3.23 × 10⁻³ K⁻¹`:

```
V_buoyant ≈ √(9.81 × 3.23×10⁻³ × 30 × 0.0069) = √(6.55×10⁻³) ≈ 0.081 m/s
```

The same result arrives from the other direction. The ratio of natural to forced convection is
`Gr/Re²`. At 0.3 m/s that comes out around **0.07** — forced convection wins comfortably. At 0.05 m/s
it comes out around **2.6** — natural convection wins. The crossover sits at about **0.08 m/s**, the
same number.

So: **below roughly 0.08 m/s, the FS7 is measuring its own plume more than yours.** And the velocity
range this course has been quoting since `GLOSSARY.md` §5 is **0.05–0.4 m/s**. The bottom of the
stated range is below the crossover.

That is a real finding and it should change how the range is quoted, but state its assumptions with
it, because they are load-bearing. The characteristic length is a *choice*: 6.9 mm is the whole chip,
and the heated region is smaller. Take `L = 2 mm` instead and the crossover falls to 0.044 m/s. So the
honest sentence is: *the useful floor is somewhere between about 0.04 and 0.08 m/s depending on the
heated length, and nobody on this project has measured which.*

**You burn the part.** IST give the FS7 a **maximum heater voltage of 3 V at 0 m/s**, alongside a
nominal operating range of **2 V to 5 V at ΔT = 30 K over 0–100 m/s**. Read those two lines together
and the constraint is clear: still air is the dangerous case, because there is nothing carrying the
heat away, and the overheat trim on the board has to be set so that the *zero-flow* voltage stays under
the limit. Set the overheat for the sensitivity you want at 0.3 m/s and you may have set it past the
still-air limit without noticing.

**You make the temperature-drift problem worse, not better.** A hotter element does put more distance
between signal and ambient — but it also drives the air properties further from the ones your
calibration assumed. Zhou et al. measure the size of that on a research-grade instrument, and the
number is in the next section.

## Why calibration is the hard part

Everything above says a thermal anemometer *should* work well at 0.3 m/s. The reason M7 exists as its
own module is that turning `E` into a velocity you can defend is much harder than getting `E`.

**There is no easy reference velocity below 1 m/s.** A wind tunnel cannot help — the dynamic pressure
is gone, and at low fan speeds the flow pulsates and is neither steady nor uniform enough to be a
standard. Zhou et al.'s answer is the one the field has converged on: stop generating a flow, and
**move the probe through still air instead.** By the reciprocity principle a probe travelling at
0.3 m/s through stagnant air is in the same condition as a stationary probe in a 0.3 m/s stream, and
now the reference velocity is a *length divided by a time* — two quantities you can measure to
laboratory accuracy with a grating scale and a clock. Their rig is a 9.4 m enclosed chamber on a belt
drive, and it holds velocity to **0.000989 m/s**.

**The calibration is only valid at the temperature and humidity it was taken at.** This is the result
from the paper that the ARES team should read on its own account, and it is worth quoting in full
force: using a curve fitted at one air temperature to read velocities at another costs up to
**5.672 % per degree Celsius**, and a humidity mismatch costs up to **1.2676 % per percentage point of
relative humidity**.

Now put a bench-calibrated anemometer on a headset, on a human head, inside a 37 °C thermal-stress
session. A ten-degree mismatch is not a corner case; it is Tuesday. And a CTA cannot tell the
difference — its output responds to the air's ability to carry heat away, and it has no way to know
whether that changed because the air moved faster or because it got cooler. **Velocity and temperature
are indistinguishable at the output.** Every anemometer reading needs an air temperature recorded
beside it, which is one of the very few things ARES already does for free, because every pod carries an
SHT45.

**The fit itself is the last few percent.** Zhou et al. fit both modified King's law and Van der Hegge
Zijnen's mixed-convection formula to the same ten points, and get maximum relative errors of **5.214 %**
and **8.527 %**. Those are the residuals of a research-grade CTA in a metrology-grade rig. Nobody
should hold ARES to better, and nobody should quote an ARES air-speed figure to three significant
figures.

## Current state: the FS7 and the custom CTA board

**The sensor** is the **IST AG FS7.0.1L.195**, a platinum thin-film thermal mass flow sensor. From the
datasheet in the Drive `CTAs` folder:

| | |
|---|---|
| Size | 6.9 × 2.4 × 0.20 mm (0.60 mm at the heater) |
| Range | 0 to 100 m/s |
| Response sensitivity | 0.01 m/s |
| Accuracy | < 3 % of measured value, *dependent on the electronics and the calibration* |
| Response time | t63 ≈ 200 ms |
| Temperature sensitivity | < 0.1 %/K, *dependent on the electronics* |
| Heater | R_H(0 °C) = 45 Ω ±1 % |
| Reference element | R_S(0 °C) = 1200 Ω ±1 % |
| Nominal drive | 2–5 V at ΔT = 30 K; **max 3 V at 0 m/s** |
| Connection | 3 pins — heater, temperature sensor, ground — on 195 mm PTFE-insulated AWG 30/7 leads |

Read the two qualifiers on that table before anything else. **Accuracy and temperature sensitivity are
both "dependent on the electronics".** A datasheet number that is a property of your circuit and not of
the part is not a specification you have been given; it is a target you have been set. The 3 % and the
0.1 %/K belong to the board, and the board is ours.

Note also the range: **0 to 100 m/s** on a part being asked to resolve 0.3. Response sensitivity is
0.01 m/s, so there is resolution in hand, but the whole interesting band is the bottom 0.4 % of scale.

**The board** is a custom single-channel CTA in the Drive `CTAs` folder
(`FS7.0.1l.195 CTA.kicad_sch` and `.kicad_pcb`). Its topology, read off the schematic:

- **The sensor arm.** A 50 Ω series resistor feeds the FS7's 45 Ω heater to ground. The junction
  between them is the sense node.
- **The reference arm.** A 1.2 kΩ resistor feeds a node held down by the FS7's own 1.2 kΩ platinum
  reference element in parallel with a 10 kΩ resistor. Because the reference element is on the same
  die as the heater and sees the same air, **this arm tracks ambient temperature** — which is the
  mechanism that keeps the *overheat* roughly constant as the room changes, rather than the absolute
  temperature.
- **The comparison.** A 1 kΩ trim pot sits across the heater and its wiper feeds the inverting input
  of a TL071; the reference node feeds the non-inverting input. **That pot is the overheat control** —
  it sets what fraction of the heater voltage has to match the reference before the loop is satisfied.
- **The loop.** The op-amp output drives an NPN emitter follower through a 100 Ω base resistor, and the
  emitter supplies the top of the bridge. Flow cools the heater, its resistance falls, the sense node
  falls, the op-amp drives harder, more current restores the temperature. A 1.5 MΩ feedback resistor
  gives a DC loop gain in the thousands against the wiper's few-hundred-ohm source impedance, and a
  47 pF cap across it puts a pole near 2.3 kHz — that capacitor is the difference between a CTA and an
  oscillator, and it is the part of the board nobody should adjust casually.
- **The output** is the op-amp output on a two-pin header. Note that this is one V_BE **above** the
  bridge top, and V_BE drifts about −2 mV/K, so the recorded `E` carries a small ambient-temperature
  term that the fitted constants will silently absorb.

Also read off the schematic and worth knowing before you build one: there is a 5 V regulator on the
board, and **on this sheet its output is not connected to the op-amp or to the bridge** — the op-amp is
powered from the raw input rail. Whether that is intentional headroom for the heater or an oversight is
a question for whoever drew it, and it is exactly the kind of thing you find by reading a schematic
instead of trusting a block diagram.

**The mechanical fit** into the headset arm, the PCB layout, and the 3D model are on slide 12 of the
7/30 deck. One channel per board, one sensor per channel.

## The three open questions

These are open. Nobody on the team has answered them, this module is not going to answer them for
narrative tidiness, and two of them are things a member reading this could plausibly settle.

**1 · Should there be anemometers on the sides?**
Today the anemometry is on the arm. The cross-pod airflow model in M8 infers which pod sits downstream
from the *lag* between concentration traces — an indirect inference from a timing difference. Direct
side measurements would give a lateral velocity component instead of inferring one, at the cost of more
channels, more boards, more mass on a headset, and more calibration. Nobody has scoped it.

**2 · Will the chamber in-flow pump disturb the anemometer readings?**
Any pump that puts air into the test volume also stirs it, and an instrument that cannot distinguish a
velocity from a temperature certainly cannot distinguish your flow from the apparatus's. Unmeasured.

**3 · At what flow rate does the pump's contribution become negligible?**
This is the quantitative version of question 2 and it is `E04`. Note before you get there that the
question as written on the slide is **ambiguous** — "the pump" could be the test chamber's supply pump
or the headset's own sampling pump drawing 0.67 L/min through an inlet a few centimetres from the
anemometer, and the two differ by orders of magnitude in length scale. Part of what `E04` sends back to
the team is which question was actually being asked.

## What's next

**Anemometry moves into every pod.** The next-generation pod on slide 11 of the 7/30 deck adds the FS7
alongside the CO₂ sensor, so each pod reports **local air speed as well as local concentration**. That
turns M8's airflow model from an inference off a timing lag into a measurement, and it is what makes
NASA's flow-weighted inspired-CO₂ approach in M8 possible at all — you cannot weight by flow if you are
not measuring flow.

The same pod revision adds per-pod oxygen (SEN0465) and a BME680 for temperature, humidity, pressure and
VOCs, and cuts the pod's vertical height so it stops standing proud of its arm and shadowing the flow it
is sampling — the fix M2 asked for, arriving in the same part.

There is a fourth open concern on that slide, and it is a scheduling risk rather than a physics one:
**the oxygen sensors are large enough that they may have to become a separate pod attachment.** If that
happens, the pod grows again, and the low-profile goal and the oxygen goal are in direct conflict.

---

**Sources.** FS7 electrical, mechanical and response specifications: *FS7.0.1L.195 Thermal Mass Flow
Sensor* datasheet, Innovative Sensor Technology IST AG, in the Drive `CTAs` folder
(`fs7.0.1l.195 tech sheet.pdf`). Board topology, component values and the unconnected 5 V rail: read
directly from `FS7.0.1l.195 CTA.kicad_sch` in the same folder. Current-state hardware, the three open
questions, and the next-generation pod: `ARES_7_30_26.pptx` slides 11 and 12. Calibration difficulty,
the probe-moving reference method, the fitted `n` range of 0.5578–0.7074, the 5.672 %/°C and
1.2676 %/%RH sensitivities, and the 5.214 % / 8.527 % fit residuals: Zhou et al. (2024), *Applied
Sciences* 14(4), 1587 — see `lit/SOURCES.md`, `zhou2024`, and `L07`. Plume velocity scale of
0.3–0.4 m/s: `C13`. Pump flow of 0.67 L/min per pod: `C17`. Air properties and the definitions of
Gr, Re and the CTA terms: `GLOSSARY.md` §1, §3 and §4.
