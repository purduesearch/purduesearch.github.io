# ARES 101 — Glossary and conventions

> **This file is binding on all eleven modules.** A term defined here is used exactly this way
> everywhere in the course. If a module needs a different meaning, the fix is to change this file and
> the modules that already used the old one — not to redefine the term locally.

It exists because eleven modules are researched and written independently. Without a shared
vocabulary, eleven authors invent eleven names for the same plume, and a learner who finishes M2
cannot read M8.

Contents:

1. [Acronyms and named concepts](#1-acronyms-and-named-concepts)
2. [Quantitative definitions the course reuses](#2-quantitative-definitions-the-course-reuses)
3. [Dimensionless numbers — the definition this course uses](#3-dimensionless-numbers--the-definition-this-course-uses)
4. [The property table](#4-the-property-table)
5. [Units — the convention, fixed once](#5-units--the-convention-fixed-once)
6. [Symbols](#6-symbols)
7. [House style](#7-house-style)

---

## 1. Acronyms and named concepts

| Term | Definition as used in this course |
|---|---|
| **ARES** | Atmospheric Research and Experiment System — the wearable CO₂ / biophysical sensing headset this course is about. **ARES 1** is the first-generation build; **ARES 2** is the current one. Write the generation whenever a claim is generation-specific. |
| **HTBP** | **Human thermal body plume.** The buoyant column of warmed air that rises along a body because metabolic heat makes the air touching the skin less dense than the air around it. It is the transport mechanism that carries exhaled CO₂ away from the face on Earth. Not "thermal plume", not "body plume" — HTBP, expanded at first use in each module. |
| **BTC** | **Biothermal convection.** Convective air motion driven by metabolic heat. BTC is the *mechanism*; the HTBP is the *structure* BTC produces around a human body. Use BTC when talking about the physics, HTBP when talking about the flow you would measure. |
| **IBD** | **Indirect biophysical diffusion.** The mass-transport regime that remains once BTC has collapsed: transport by molecular diffusion alone, with no bulk flow to carry the gas. IBD is slow. It is what is left in microgravity, and it is why the CO₂ does not simply go away. |
| **CO₂ bubble** | The localized region of elevated, previously-exhaled CO₂ that persists in front of the face when BTC cannot clear it. Not a physical bubble with a surface — a concentration field with no sharp boundary. Say "the CO₂ bubble" in prose and "the localized rebreathing deadspace" when precision matters. |
| **Deadspace** | A volume of gas that is inhaled again without having been refreshed. In this course, *anatomical* deadspace (the conducting airways) and the *external* deadspace of the CO₂ bubble are different things and must be named separately. |
| **Rebreathing** | Inhaling air that was previously exhaled. Quantified as the **rebreathed fraction** — see §2. |
| **Pod** | One sensor cluster on the headset. There are three: **top**, **forehead**, **chin**. Always name the pod, never "sensor 1 / 2 / 3" in prose — the firmware indices and the physical positions are not guaranteed to correspond, and M9 explains why. |
| **NDIR** | **Non-dispersive infrared.** The CO₂ sensing method used by the headset: a broadband IR source, a fixed optical path, a bandpass filter at the gas's absorption band, and a detector. "Non-dispersive" means there is no monochromator or grating — the filter selects the band. |
| **SprintIR** | The Gas Sensing Solutions (GSS) NDIR CO₂ sensor family used in ARES. The specific part is the **SprintIR-6S-20%**. Its ASCII command protocol is covered in M5 and M9. |
| **T90** | The time for a sensor's reading to reach 90 % of its final value after a step change in the gas it is exposed to. A property of **the sensor**. Distinct from transport delay — see §2. |
| **Transport delay** | The time for gas to physically travel from the sampling inlet to the sensor through the tubing. A property of **the plumbing**. Distinct from T90; M6 exists partly to keep these apart. |
| **ABC** | **Automatic baseline correction.** A firmware routine inside the sensor that periodically re-zeros the reading to the lowest concentration it has seen over a multi-day window, on the assumption that the sensor is exposed to fresh outdoor air (~400 ppm) at some point in that window. ARES disables ABC at boot; M10 explains why. |
| **CTA** | **Constant-temperature anemometry.** Measuring air velocity by holding a heated element at a fixed temperature and reading the electrical power required to do so. Contrast with constant-current anemometry, where the current is fixed and the element's temperature varies. |
| **King's law** | The empirical relation between the heat lost by a heated element and the flow past it, of the form `E² = A + B·Vⁿ`, with `E` the bridge voltage, `V` the velocity, and `n` an exponent near 0.5 fitted at calibration. The constants `A`, `B`, and `n` are **per-probe** and only valid over the velocity range they were fitted on. |
| **Overheat ratio** | How much hotter than the ambient fluid a CTA element is held, expressed as a resistance ratio. Higher gives more sensitivity and worse self-heating of the air being measured. |
| **ECLSS** | **Environmental Control and Life Support System.** The spacecraft subsystem that scrubs CO₂, controls temperature and humidity, and manages cabin atmosphere. ECLSS sensors measure **bulk cabin** concentrations, which is the quantity ARES exists to distinguish from face-level concentration. |
| **SANS** | **Spaceflight-associated neuro-ocular syndrome.** A cluster of ocular and neurological findings in long-duration crew — optic disc oedema, globe flattening, refractive shift. Elevated CO₂ is one hypothesised **co-factor**, not an established cause. Write it that way. |
| **PaCO₂** | The partial pressure of CO₂ in **arterial blood**. The physiologically meaningful quantity: symptoms track PaCO₂, not the ppm figure in the room. |
| **Hypercapnia** | Elevated CO₂ in the blood. In this course, "hypercapnia" describes the physiological state and "elevated CO₂" describes the environment. Do not use them interchangeably. |
| **MET** | **Metabolic equivalent of task.** 1 MET is the resting metabolic rate, conventionally 3.5 mL O₂ · kg⁻¹ · min⁻¹, equivalently about 58 W/m² of body surface area. Activity intensities are multiples of it. |
| **PMV / PPD** | **Predicted mean vote / predicted percentage dissatisfied**, the thermal-comfort indices of **ISO 7730**. PMV runs −3 (cold) to +3 (hot), 0 being neutral. PPD is the modelled percentage of occupants dissatisfied at a given PMV; its floor is about 5 % even at PMV = 0, because you cannot satisfy everyone. |
| **Wells-Riley** | The airborne-infection model relating infection risk to quanta emission, ventilation rate, and exposure time. Used in M8 as an example of a model with a standard behind it. |
| **Schlieren imaging** | An optical technique that visualises density gradients in transparent media, which is how the HTBP is imaged experimentally. It is the **validation** for the CFD work in M1 and M3 — a simulation with no counterpart in a Schlieren image is a picture, not a result. |
| **Passive scalar** | A modelling assumption in which a species is transported by the flow but does not itself alter the flow. The CFD paper treats CO₂ this way. It is an assumption, and M3 asks the learner to say so. |
| **Boussinesq approximation** | Treating density as constant everywhere except in the buoyancy term of the momentum equation. Valid while temperature differences are small enough that density varies by a few percent. State it in words before symbols. |
| **IRB** | Institutional Review Board. The Purdue committee that must approve any research involving human subjects **in writing, in advance**. |
| **NOM / MEAS** | The labelling rule for reported flow. `MEAS` means a value came from a flow sensor. `NOM` means it is a nominal estimate derived from drive power. M6 explains why this distinction is enforced in the UI: an estimate presented as a measurement is how a study gets a result nobody can reproduce. |

---

## 2. Quantitative definitions the course reuses

### Rebreathed fraction

Defined in M2, reused unchanged in M8 and M10. Given a chin-pod reading, a top-pod reading used as
the ambient reference, and an assumed exhaled-breath concentration:

```
f_rb = (C_chin − C_top) / (C_exhaled − C_top)
```

All three concentrations in ppm. `f_rb` is dimensionless; report it as a percentage.

Three things travel with this formula everywhere it appears, and a module that uses it without them
is incomplete:

1. It is a **two-compartment mixing model**. It assumes the air at the chin is a mixture of exactly
   two things — reference air and exhaled breath — and nothing else.
2. `C_top` is a **reference**, not a datum. If the top pod is standing in the plume rather than above
   it, `C_top` is too high, the numerator shrinks, and the computed fraction is biased **low**.
3. It inherits the error of **both** sensors, because it is a difference. M10's error-budget argument
   rests on this.

### T90 versus transport delay

For a step change in the gas at the sampling inlet at t = 0:

- **Transport delay** `t_d` — the time before the sensor sees *any* change. Set by tube volume and
  volumetric flow rate: `t_d ≈ V_tube / Q`.
- **T90** — measured **from the arrival of the change**, the further time to reach 90 % of the new
  steady reading. Set by the sensor's optics, its internal volume, and its digital filter.

Total observed lag is `t_d + T90`, and the two are corrected differently: transport delay is
subtracted, T90 is deconvolved or lived with. Because dispersion smears the step, measure `t_d` at
the **50 % crossing**, not at first movement.

### ppm·hours (dose)

Cumulative exposure: concentration in ppm integrated over time in hours. Used by the app's
dosimeter. Report it with the averaging interval, because 5,000 ppm for one hour and 1,000 ppm for
five hours are the same dose and are not the same exposure.

---

## 3. Dimensionless numbers — the definition this course uses

Each of these has variants in the literature. **These are the forms this course uses.** A module that
needs another form says so explicitly and gives it.

| Number | Definition | What it is the ratio of | Where it appears |
|---|---|---|---|
| **Re** — Reynolds | `Re = V·L / ν` | inertial to viscous forces | M3 (flow regime of the CFD domain), M6 (tube flow) |
| **Gr** — Grashof | `Gr = g·β·ΔT·L³ / ν²` | buoyancy to viscous forces | M1 (is the plume buoyant?) |
| **Ra** — Rayleigh | `Ra = Gr · Pr = g·β·ΔT·L³ / (ν·α)` | buoyant driving to diffusive damping | M1 (onset of convection) |
| **Pe** — Péclet | `Pe = V·L / D` | advective to **diffusive mass** transport | M1 (advection versus diffusion) |
| **Pr** — Prandtl | `Pr = ν / α` | momentum to thermal diffusivity | as the bridge from Gr to Ra |

Notes that prevent the two most likely mistakes:

- **Péclet is the mass-transport Péclet here**, with `D` the binary diffusivity of CO₂ in air. A
  thermal Péclet number `V·L/α` also exists and is **not** what this course means by Pe. If a module
  needs it, write `Pe_thermal` and define it in place.
- **β is the thermal expansion coefficient**, `β = 1/T` for an ideal gas with `T` in **kelvin**,
  evaluated at the **film temperature** `T_film = (T_surface + T_∞)/2`. Evaluate `ν` and `α` at
  `T_film` too. A derivation that evaluates β at ambient and ν at film temperature is not wrong by
  much, but it is not reproducible, so do it the same way every time.
- **L is the characteristic length and it is a choice.** State it. M1 uses body height (1.7 m) for
  the whole-body plume; M3 uses the paper's `Lc = 0.15 m` (head width) because that is what the paper
  non-dimensionalised on. Gr scales as `L³`, so the choice moves the answer by orders of magnitude
  and a number quoted without its `L` is meaningless.

---

## 4. The property table

**Use these values.** They are what M1's and M3's worked problems are computed from, and a video that
quotes a different `ν` will disagree with the reading beside it for no visible reason.

Dry air at 1 atm:

| T (K) | T (°C) | ν (m²/s) | α (m²/s) | Pr | β = 1/T (K⁻¹) |
|---|---|---|---|---|---|
| 295 | 21.9 | 1.53 × 10⁻⁵ | 2.15 × 10⁻⁵ | 0.712 | 3.39 × 10⁻³ |
| 300 | 26.9 | 1.59 × 10⁻⁵ | 2.25 × 10⁻⁵ | 0.707 | 3.33 × 10⁻³ |
| 305 | 31.9 | 1.64 × 10⁻⁵ | 2.32 × 10⁻⁵ | 0.707 | 3.28 × 10⁻³ |

Binary diffusivity of CO₂ in air at 298 K, 1 atm: **D = 1.6 × 10⁻⁵ m²/s**. It scales roughly as
`T^1.75` and inversely with pressure; over the 295–305 K range of this course, treat it as constant.

**Source and caveat.** Air properties are interpolated from a standard thermophysical property table
for gases at atmospheric pressure (Incropera et al., *Fundamentals of Heat and Mass Transfer*,
Table A.4); the binary diffusivity is the standard tabulated CO₂–air value (see Cussler, *Diffusion:
Mass Transfer in Fluid Systems*, Ch. 5). Table A.4's rows are 50 K apart, so **linear interpolation
between them overshoots by roughly 1–2 % near 295 K** — the values above are already corrected for
that curvature. Take them from this table rather than re-interpolating, and if you do check them
against your own copy and disagree, fix this table, not your module.

Two more constants used more than once:

| Quantity | Value | Note |
|---|---|---|
| `g` | 9.81 m/s² | Earth. Mars is 3.71 m/s², which is the 0.38 g in M1 and M3. |
| Standard atmosphere | 101.325 kPa = 760 mmHg = 1013.25 hPa | The basis of every ppm ↔ mmHg conversion below |

---

## 5. Units — the convention, fixed once

CO₂ concentration is quoted three ways in the sources this course draws on. Mixing them inside one
paragraph is the single most reliable way to confuse a reader. So:

| Use | When | Example |
|---|---|---|
| **ppm** | **Always, in prose.** This is the course's working unit. | "face-level CO₂ reached 1,850 ppm" |
| **mmHg** | **Only when quoting a NASA limit or a partial-pressure result**, and always with the ppm equivalent alongside on first use. | "NASA's 2010 operational limit of 4 mmHg (≈ 5,300 ppm)" |
| **%** | **Only when quoting a datasheet range or a paper's own figure.** Never invent a % figure. | "the SprintIR-6S-20% covers 0–20 % (0–200,000 ppm)" |

### The conversion, at sea level

CO₂ concentration is a **mole fraction**; mmHg is a **partial pressure**. Converting between them
requires a total pressure, and the course's default is one standard atmosphere:

```
p_CO₂ [mmHg] = (C [ppm] / 1,000,000) × 760 mmHg

  1 ppm  = 7.60 × 10⁻⁴ mmHg
  1 mmHg = 1,316 ppm
  1 %    = 10,000 ppm
```

| Concentration | Partial pressure at 1 atm | What it is |
|---|---|---|
| 400 ppm | 0.30 mmHg | Outdoor ambient — the fresh-air baseline |
| 1,000 ppm | 0.76 mmHg | Top of the "mild" tier (M4) |
| 2,500 ppm | 1.9 mmHg | Mild / moderate boundary (M4) |
| 5,000 ppm | 3.8 mmHg | Moderate / acute boundary (M4); also the 8-hour occupational TLV |
| 5,300 ppm | 4.0 mmHg | **NASA's 2010 operational limit** |
| 6,600 ppm | 5.0 mmHg | **NASA's 2006 operational limit** |
| 200,000 ppm | 152 mmHg | Full scale of the SprintIR-6S-20 % |

**The conversion is pressure-dependent, and that matters twice in this course.** A reading taken at
950 hPa (M5's pressure-correction problem, and any session at altitude) converts against 713 mmHg,
not 760. And an NDIR sensor measures the *number of absorbing molecules in its optical path*, which
tracks partial pressure — so an uncorrected ppm reading drifts with ambient pressure even when the
mole fraction has not changed. Say which one you mean.

### Other units

- Velocity in **m/s**. The plume's peak is 0.3–0.4 m/s; the anemometry regime of interest is
  0.05–0.4 m/s.
- Flow rate in **L/min**. The pump is 2.00 L/min free flow, 0.67 L/min per pod after a three-way split.
- Temperature in **°C** in prose, **K** in any formula containing β, Gr, Ra, or an absolute ratio.
  A ΔT is the same number either way; say which scale anyway.
- Pressure in **hPa** for ambient and **mbar** only when quoting a pump datasheet (they are the same
  unit; the datasheets say mbar).
- Time in **s**; sample rates in **Hz**.

---

## 6. Symbols

| Symbol | Meaning | Units |
|---|---|---|
| `C` | CO₂ concentration | ppm |
| `p_CO₂` | CO₂ partial pressure | mmHg |
| `f_rb` | rebreathed fraction | — |
| `V` | velocity | m/s |
| `Q` | volumetric flow rate | L/min (convert to m³/s in formulas) |
| `L`, `Lc` | characteristic length | m |
| `Vc` | characteristic velocity | m/s |
| `ΔT` | temperature difference, surface to ambient | K |
| `β` | thermal expansion coefficient, `1/T_film` | K⁻¹ |
| `ν` | kinematic viscosity of air | m²/s |
| `α` | thermal diffusivity of air | m²/s |
| `D` | binary diffusivity, CO₂ in air | m²/s |
| `g` | gravitational acceleration | m/s² |
| `t_d` | transport delay | s |
| `E` | CTA bridge voltage | V |
| `A`, `B`, `n` | King's-law constants | per-probe |

Paper-specific symbols that appear in M3 keep the paper's own notation and are defined at first use
in that module: `Lc = 0.15 m`, `Vc = 0.2816 m/s`.

---

## 7. House style

- **CO₂ with a subscript two** (`CO₂`, U+2082) in prose. Not `CO2`. The exception is code, filenames,
  and identifiers, where `CO2` is what the firmware actually calls it — quote those verbatim.
- **Numbers over 999 take a comma**: 1,850 ppm. Decimals use a point.
- **Font Awesome, never emoji**, in anything that reaches JSX. Markdown prose uses ordinary
  punctuation and no decorative icons.
- **Every module says three things**: the background concept, the current ARES state, and what comes
  next. A module that only teaches theory has not met the brief.
- **Every `content/Cnn` file ends with a `Sources` line** naming the deck, document, or code file its
  current-state section drew from. The hardware changes weekly; this is how the drift gets found.
- **Never invent a citation.** Every source must be verified retrievable before it is cited. See
  `lit/SOURCES.md`.
- **Open questions stay open.** Several things in this course are genuinely unresolved — the
  anemometer/pump interaction in M7, the Fincke incident in M4. Write them as open. A course that
  resolves an open question for narrative tidiness teaches a member something the team does not know.
