---
pdfDriveFileId: 1kt_zRc-ugKDe71h8mcj4JNMmceWDxYR5
pdfTitle: DNS of a violent expiratory event
citation: Fabregat, A., Gisbert, F., Vernet, A., Dutta, S., Mittal, K., & Pallarès, J. (2021). Direct numerical simulation of the turbulent flow generated during a violent expiratory event. Physics of Fluids, 33(3), 035122. https://doi.org/10.1063/5.0042086
promptText: M1 and M2 gave you one picture of the air in front of a face - a steady buoyant plume that rises past the chin and sweeps exhalate away. This paper gives you a different one - a single exhalation resolved directly, in full, over about a second and a half. Read it for the flow, not the droplets. In at least 200 words - how does this paper's picture of an exhaled jet differ from the steady plume, what timescale does each picture belong to, and what does that difference mean for where you put a sensor? Be concrete about the sensor question. Two pods 15 cm apart do not see the same thing, and you should be able to say why.
minWords: 200
rubric:
  - id: unsteady
    point: Characterises the exhaled flow as unsteady, directed and momentum-driven rather than steady and buoyancy-driven. Full credit requires both halves - that it is a transient event with a beginning and an end (the simulated exhalation lasts about 0.4 s), and that it leaves the mouth as a horizontal jet whose motion is set by its own momentum, not by buoyancy. Quoting the Richardson number as very small, or noting the roughly 4.8 m/s peak exit velocity against the plume's 0.3-0.4 m/s, both count as evidence.
    weight: 3
  - id: timescale
    point: Describes the two-stage evolution and attaches a timescale to it - a jet while the mouth is still pushing, then, once the exhalation stops, a decelerating puff that is progressively turned upward by buoyancy as its own momentum decays. Credit any correct statement of order - fractions of a second for the jet, order one second for the transition, with the simulation itself running to about 1.65 s. A learner who says the exhalate simply rises immediately has missed the paper's central result.
    weight: 2
  - id: position
    point: Explains why a fixed sensor's answer depends on where it is - a directed jet has an axis, so a probe on that axis sees a fast, high-concentration, short-duration pulse while a probe a few centimetres off-axis sees a smaller, later, smeared one, and a probe above the mouth sees nothing until buoyancy has turned the puff. Credit any concrete reasoning about direction, distance or arrival time. A generic statement that concentration varies in space is partial credit.
    weight: 3
  - id: pods
    point: Connects the result back to ARES pod placement. Any of the following earns full credit - the chin pod sits close to the mouth and near the exhalation axis, so it samples the pulse rather than a mean, which is why sample rate matters; the top pod only sees exhalate after buoyancy has carried it up, so it is a delayed and diluted version of the same event and not an independent reference; a per-breath rebreathed fraction computed from readings taken at different points in the cycle is comparing things that were never simultaneous.
    weight: 2
  - id: limits
    point: Names at least one honest limitation of transferring this paper to ARES. The strongest is that a violent expiratory event is not a resting breath - the paper simulates a cough, so its velocities and momentum bound the extreme case rather than describing normal breathing, and ARES mostly measures the gentle end. Also credit - the ambient is quiescent, with no body plume present at all, so the paper never shows the jet interacting with an HTBP; the paper's interest is droplet transport rather than CO2; or that its inflow is a clean pipe rather than a mouth with a tongue, teeth and lips.
    weight: 2
referenceSummary: |
  This paper is a direct numerical simulation of a single violent expiratory event - a cough -
  resolved without a turbulence model, and it exists to describe the flow rather than the
  physiology. The setup is deliberately simple. Warm, moist air is injected through a circular
  orifice representing the mouth into initially still air. The exhalation lasts about 0.4 s: the
  velocity ramps linearly from zero to a peak of about 4.8 m/s at roughly 0.15 s, then decays
  linearly back to zero. Exhaled air is at 34 C and 85 percent relative humidity against an
  ambient of 15 C and 65 percent. Buoyancy enters through the Boussinesq approximation in the
  vertical momentum equation, as in the M1 paper. The governing dimensionless groups are a
  Reynolds number of 6,000 based on the peak velocity and the orifice diameter, and a Richardson
  number of 5.61 x 10^-4. The simulation is carried to about 1.65 s.

  That Richardson number is the whole contrast with M1 in one figure. Ri is the ratio of buoyant
  to inertial forces, and at 5.6 x 10^-4 it says that at the moment air leaves the mouth,
  momentum beats buoyancy by roughly three orders of magnitude. The human thermal body plume of
  M1 and M2 is the opposite limit - there is no momentum source at all, and buoyancy is the only
  thing driving the flow. Both are correct descriptions of air near a face. They simply belong to
  different moments.

  The result is a two-stage evolution, and this is what a good summary must carry. While the mouth
  is still pushing, the exhalate is a horizontal turbulent jet that penetrates forward into the
  quiescent air along a well-defined axis. When the exhalation stops, there is nothing left to
  sustain the jet, and it becomes a puff: a finite slug of warm, CO2-laden, humid air that keeps
  moving forward on the momentum it already has, decelerating and spreading as it entrains
  surrounding air. As its momentum decays, the small buoyancy that was always present stops being
  negligible, and the puff bends upward - it becomes a thermal. The companion study on the same
  flow field reports that transport is dominated by the hydrodynamic drag of this jet-to-plume
  evolution up to roughly 0.75 s. So the sequence is jet, then puff, then buoyant rise, over
  something under two seconds, and only at the very end does it start to look like the picture M1
  describes.

  For instrumentation, the consequence is that a fixed sensor's reading is a statement about
  geometry as much as about concentration. A directed jet has an axis. A probe on that axis, close
  to the mouth, sees a fast-rising, high-amplitude, short-lived pulse. A probe a few centimetres
  off that axis sees a lower peak, arriving later, smeared by entrainment. A probe above the head
  sees nothing at all until buoyancy has had a second or more to turn the puff upward, and by then
  the signal has been diluted by everything the puff entrained on the way. Three sensors on one
  head are therefore not three samples of one quantity; they are three different views of a
  moving structure, separated in time as well as in space. This is the reason the chin pod needs a
  sample rate fast enough to resolve a breath rather than average over one, the reason the top pod
  cannot be treated as a clean simultaneous reference for a chin reading taken during an
  exhalation, and part of the reason cross-pod lag can be used at all to infer which pod is
  downstream.

  The honest limitation is scale. This is a cough, not a resting breath, and the paper says so in
  its title. A peak of 4.8 m/s is more than ten times the body plume's velocity and well above
  quiet tidal breathing, so the paper bounds the violent end of the range rather than describing
  the condition ARES will usually measure. Its ambient is quiescent, with no thermal body plume
  present, so it never shows the jet interacting with an HTBP - which is precisely the interaction
  that matters at a real chin. And its scientific interest is airborne droplet and aerosol
  transport rather than CO2. What transfers is the structure - unsteady, directed, momentum first
  and buoyancy second - not the magnitudes.
---

## Annotated bibliography

### Fabregat, A., Gisbert, F., Vernet, A., Dutta, S., Mittal, K., & Pallarès, J. (2021). Direct numerical simulation of the turbulent flow generated during a violent expiratory event. *Physics of Fluids*, 33(3), 035122.

The assigned reading. A direct numerical simulation of a cough — "direct" meaning the turbulence is
resolved rather than modelled, which is expensive and is why the domain is small and the run is short.

Read it for the **flow field**: the jet during exhalation, the transition to a puff when the mouth
stops, and the buoyant turning that follows. The droplet and aerosol material is the reason the paper
was written and is not what this section is assessing.

Note the author list. **S. Dutta is the first author of M1's paper**, so the two readings in this
course that appear to disagree about what air in front of a face does are, in part, by the same
person. They do not actually disagree — they resolve different timescales — and noticing that is a
good sign you have read both properly.

### Fabregat, A., Gisbert, F., Vernet, A., Ferré, J. A., Mittal, K., Dutta, S., & Pallarès, J. (2021). Direct numerical simulation of turbulent dispersion of evaporative aerosol clouds produced by an intense expiratory event. *Physics of Fluids*, 33(3), 033329. https://doi.org/10.1063/5.0045416

Companion paper, same group, **same DNS flow field**, published in the same issue. It is open access
via PubMed Central (PMC8060975), which the assigned paper is not.

Listed for a specific reason: it restates the flow setup — the 0.4 s exhalation, the 4.8 m/s peak, the
34 °C / 85 % exhalate against 15 °C / 65 % ambient, Re = 6,000, Ri = 5.61 × 10⁻⁴, the run to 1.65 s —
in a freely readable form, and it is where several of the numbers in this section's reference summary
were verified. If the Drive PDF is unavailable to you, read the companion for the flow description
and note in your submission that you did.

Its own contribution is aerosol evaporation, which is not this course's subject.

### Dutta, S., et al. (2026). Gravity and human respiration. *npj Biological Physics and Mechanics*, 3, 3. https://doi.org/10.1038/s44341-026-00033-x

M1's paper, and the thing this one is being read against. Relevant here for its **mouth boundary
condition**, which is the direct point of comparison: a periodic inflow–outflow cycle with a 4.00047 s
period — 3.0115 s of exhalation and 0.98897 s of inhalation — imposed as a time-varying velocity at
the mouth, with exhalate at 37 °C and 5.0 % CO₂.

Put the two side by side and the difference in modelling philosophy is stark. Dutta et al. run many
breathing cycles to see what the *environment* settles into and accept a coarser view of any single
breath. Fabregat et al. resolve one event completely and stop after 1.65 s. Neither could answer the
other's question.

### `ARES_7_30_26.pptx`, slides 3 and 11. Internal deck, Purdue SEARCH / ARES team.

The current pod layout, and the two changes already planned for it: relocating the top pod backwards
out of the plume, and cutting pod height so the body stops shadowing the flow it samples.

Read alongside this paper because the paper supplies an argument the deck does not make. The deck's
case for moving the top pod is that it sits in the plume. This paper adds a second, independent
reason: even a perfectly positioned reference pod is not sampling *simultaneously* with the chin,
because the structure being measured takes a finite time to arrive.

### `docs/courses/ares-101/GLOSSARY.md` §2

The rebreathed-fraction definition and its three standing caveats. The second caveat — `C_top` is a
reference, not a datum — is the one this paper stress-tests hardest.

## Synthesis

M1 and M2 taught a steady picture, and they were right to. A plume that is always there, always
rising, always sweeping the face is the correct description of what the air around a body does over
minutes, and it is the description you need to understand why removing gravity is a catastrophe. It
is also, if you take it literally at the scale of one breath, wrong.

This paper is the correction, and the useful thing is that it does not overturn the steady picture —
it nests inside it.

**The nesting is by timescale.** At the instant air leaves a mouth it carries real momentum, and the
Richardson number of 5.6 × 10⁻⁴ says buoyancy is not merely secondary but negligible, smaller than
inertia by something like a factor of eighteen hundred. The exhalate is a jet, and a jet does not care
which way is up. Then the mouth stops. Nothing sustains the jet, so it decays into a puff — still
moving forward, still spreading, but now decelerating. And as the momentum bleeds away, the buoyancy
that was always there and never mattered stops being negligible, and the puff begins to climb. Over
something under two seconds, the flow hands itself from the regime this paper describes to the regime
M1 describes.

The two papers are not competitors. They are the same story at two zoom levels, and the crossover is
around a second — which, since a breath is four seconds, means both regimes are present in every
breathing cycle you will ever measure.

**Why this matters for a headset rather than for a fluid dynamicist.** A steady-flow picture makes an
implicit promise: that a sensor's reading is a property of a place. Put a probe at the chin and it
tells you the CO₂ at the chin. That promise holds for a steady field and fails for a transient one.

In a transient field, a reading is a property of a place *and a time*, and the two are coupled by the
speed at which the structure travels. Two pods 15 cm apart on a head are not sampling one field at two
points. They are watching one moving object pass, at two stations, at two different moments — and the
object is changing as it goes, entraining ambient air and diluting itself the whole way.

Once you see it that way, three things about the ARES design stop being arbitrary:

**Sample rate is a physics requirement, not a nicety.** A breath is four seconds and the pulse inside
it is much shorter. Sample slowly and you do not get a noisy version of the peak — you get an average,
which is a different quantity with a smaller value, and you will never know you missed anything. The
ARES 1 deck makes exactly this argument for its ≥ 3 Hz rate: at 1 Hz you miss the peaks. This paper is
the reason that argument is correct.

**Cross-pod lag is a real signal.** If the exhalate is a coherent structure moving through space, then
the delay between two pods seeing it is information — it tells you which pod is downstream and how
fast the air is moving. That only works because the flow is transient. In a perfectly steady field
there would be no arrival time to compare. M8's airflow model is built on this, and M6's transport
delay has to be subtracted out first or the plumbing will fabricate an airflow direction that is not
there.

**"Simultaneous" is doing more work in the rebreathed-fraction formula than it looks.** The formula
subtracts a top reading from a chin reading as though both describe the same instant of the same air.
During an exhalation they do not: the chin is inside the event and the top pod has not seen it yet.
The formula is best understood as describing a *cycle-averaged* condition, not an instantaneous one,
and a per-breath figure computed from raw samples is measuring something the model was not written
for.

**Where the transfer stops, and say so in your submission.** A cough is not a breath. Four point eight
metres per second is more than ten times the plume, and a resting tidal exhalation is far gentler —
the paper is bounding the violent end of the range, not describing the condition a subject will
usually be in. Just as importantly, the paper's ambient is *quiescent*. There is no body in the
domain, no metabolic heat, no HTBP for the jet to run into. The one interaction that matters most at a
real chin — a directed jet meeting a rising plume — is exactly the thing neither paper simulates.

That gap is worth noticing, because it is not a gap in the literature that someone else will close.
It is a gap a headset with three fast sensors on one head is unusually well placed to measure.
