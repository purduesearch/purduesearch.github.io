# C12 — How gravity moves air

> CONTENT section · ARES 101 · M1 · ~5 min read
> Seeded into `contentJson` as rich text. Headings become `<h2>`; the property values quoted here
> come from `GLOSSARY.md` §4 and must not be restated from another table.

---

## The question this course is built on

Put a warm object in cool air and the air around it starts to move. That is not a small effect and
it is not an exotic one — it is happening to you right now, and it is the only reason the air in
front of your face is not the air you exhaled thirty seconds ago.

Take the object away from gravity and the motion stops. The warmth is still there. The metabolism is
still there. The air simply has no reason to go anywhere.

Everything ARES measures follows from that sentence. This module is the physics behind it.

## Buoyancy, in the smallest number of steps

Air expands when you heat it. A parcel of air at 37 °C sitting in a room at 22 °C is less dense than
its surroundings, and a less dense parcel in a gravitational field feels a net upward force — its
weight is less than the weight of the fluid it displaces. That is buoyancy, and gravity is in the
statement twice: once in the weight of the parcel and once in the weight of what it displaced. Take
`g` to zero and the difference vanishes with it.

Your surface is not uniform: the CFD model in Dutta et al. puts the feet and legs at 30–33 °C and the
head, neck and chest at 35–37 °C. Room air sits at 22 °C. So there is a permanent thin layer of warm,
light air in contact with you, permanently being pushed upward, permanently being replaced from below
by cooler air. That is **biothermal convection (BTC)**, and the column of moving air it produces is
the **human thermal body plume (HTBP)**.

Throughout this course the driving temperature difference is written **ΔT = 15 K**, which is the
37 °C body reference against a 22 °C room the paper uses. It is the top of the range, not an average
over the skin, and it is quoted the same way everywhere so that two worked problems agree.

The distinction matters and the glossary is strict about it: BTC is the mechanism, the HTBP is the
structure. You calculate BTC. You measure the HTBP.

## Saying it in words before symbols: the Boussinesq approximation

The honest version of the physics is unpleasant — density varies with temperature, so it varies in
space and time, and it appears in every term of the momentum equation.

The Boussinesq approximation is the observation that you almost never need all of that. Over the
temperature range a human body imposes on a room, air's density changes by about 5 %. Five percent is
negligible in the inertia term. It is *not* negligible in the buoyancy term, because in the buoyancy
term the 5 % is the entire effect — with no density difference there is no force at all.

So: **treat density as constant everywhere except where it is multiplied by gravity.** That is the
whole approximation. It turns a compressible problem into an incompressible one with a body force,
and it is why every simulation in this course, including the paper you are about to read, solves the
incompressible Navier–Stokes equations rather than the full compressible set.

It holds while temperature differences stay small. It would not hold for the candle flame we get to
in a moment, where the gas is hundreds of degrees hotter than the room, and that is worth
remembering: the analogy between a body and a candle is physical, but the closure is not shared.

## Grashof and Rayleigh: how hard is buoyancy trying?

Buoyancy pushes. Viscosity resists. The ratio of those two is the **Grashof number**:

```
Gr = g·β·ΔT·L³ / ν²
```

`g` is gravitational acceleration, `β` the thermal expansion coefficient of air (`1/T` in kelvin for
an ideal gas), `ΔT` the surface-to-ambient temperature difference, `L` a characteristic length, and
`ν` the kinematic viscosity. Multiply by the Prandtl number `Pr = ν/α`, with `α` the thermal
diffusivity, and you get the **Rayleigh number**:

```
Ra = Gr · Pr = g·β·ΔT·L³ / (ν·α)
```

Ra is the ratio of buoyant driving to *diffusive damping* — how hard the buoyancy pushes against
both the fluid's stickiness and its tendency to smear the temperature difference away before it can
do any work.

For a standing human — ΔT = 15 K, L = 1.7 m — these come out around **Gr ≈ 9 × 10⁹** and
**Ra ≈ 6.5 × 10⁹**. V11 derives both, so the numbers are not the point here. Two things about them
are:

- They are enormous. Buoyancy is not a correction to the flow around a person. Buoyancy *is* the
  flow around a person.
- `L` appears cubed. A number quoted without saying what length it used is meaningless, and this
  course uses body height for the whole-body plume and the paper's own head-width scale when reading
  the paper. Different choices, both stated, three orders of magnitude apart.

One clarification, because it is the most common thing to get wrong: for a heated vertical surface
in open air there is **no critical Rayleigh number for onset**. Any nonzero ΔT drives some flow. The
famous critical value, Ra ≈ 1708, belongs to a completely different geometry — a fluid layer trapped
between two plates and heated from below, where the fluid genuinely has to overcome a threshold
before it starts moving. What Ra tells you along a body is *how vigorous* the flow is, and near
10⁹ it tells you it has gone turbulent.

## Advection, diffusion, and the Péclet number

There are exactly two ways a molecule of CO₂ can get from your mouth to somewhere else.

**Advection**: the bulk air moves and takes the molecule with it. **Diffusion**: the molecule
random-walks its way down a concentration gradient while the air stays put.

The **Péclet number** is the ratio:

```
Pe = V·L / D
```

with `V` a flow velocity, `L` a length, and `D` the binary diffusivity of CO₂ in air,
1.6 × 10⁻⁵ m²/s. Over the breathing zone in front of a face — take `L` = 0.2 m and the plume's
0.3 m/s — Pe comes out near **4 × 10³**.

That number is easier to feel as two timescales. Advection clears a 0.2 m region in `L/V` ≈ 0.7
seconds. Diffusion alone clears the same region in `L²/D` ≈ 2,500 seconds, which is about
**42 minutes**. Same volume of air, same CO₂, same body — the difference between two-thirds of a
second and most of an hour is the difference between having a plume and not having one.

Now put the breathing cycle next to it. A resting breath takes about four seconds. On Earth,
clearance is six times faster than resupply and the exhalate is gone before the next breath. Without
the plume, clearance is six hundred times *slower* than resupply, and the concentration in front of
the face just climbs.

That accumulating region is the **CO₂ bubble**. It is not a bubble in the sense of having a surface —
it is a concentration field with no sharp edge — but it sits in front of the face and it does not
leave.

## The rate-limiting step: unstirred boundary layers

There is a subtlety underneath all of this that generalises far beyond respiration.

Even in a well-stirred room, the air immediately against a surface is not moving — the no-slip
condition holds it there. Every exchange across that surface has to cross a thin layer where
transport is diffusive no matter how fast the bulk flow is. That is the **unstirred boundary layer**,
and because diffusion is slow, it is very often the step that sets the overall rate.

Convection does not remove the boundary layer. It makes it **thinner**. A faster flow compresses the
diffusive layer, shortens the distance a molecule must random-walk, and raises the exchange rate.
That is the actual mechanism by which "wind speed" changes gas exchange, whether the surface is a
leaf taking up CO₂, a root taking up oxygen, or the air in front of a nose.

Kill the convection and the boundary layer grows without bound. There is no longer a bulk flow to
limit it, and the diffusive length becomes the size of the whole region. This is what Dutta et al.
call **indirect biophysical diffusion (IBD)** — not an absence of transport, but transport reduced to
its slowest available mechanism.

Write that down, because it is the single most-missed point in this module: **microgravity does not
stop CO₂ from moving. It stops the air from moving.** Diffusion continues. It is just four thousand
times too slow to matter on the timescale of a breath.

## Faraday's candle, and why it is not an analogy

Michael Faraday's Christmas lectures on the chemical history of a candle spend a good part of one
evening explaining that a candle flame is teardrop-shaped because hot combustion gas rises and cool
air is drawn in underneath to replace it. He then closes the series by drawing the comparison to human
breathing directly: both are slow oxidations that depend on air arriving and products leaving.

Light the same candle inside a glovebox on a spacecraft and it burns as a dim blue sphere. That is not
a thought experiment — it is what the candle-flame experiments flown in microgravity actually
observed, and it is the image Dutta et al. put beside their own results.

The flame did not change shape because a different kind of physics applies in orbit. It changed shape
because a candle is a **self-generating convection system** — the heat that drives the flow is
produced by the flow's own product — and remove buoyancy and the only thing left to bring oxygen in
and carry CO₂ out is diffusion, which has no preferred direction. A diffusion-limited flame is
spherical because diffusion is isotropic.

A human body is the same kind of system. Metabolic heat is generated inside and drives the flow that
supplies it. Dutta et al. describe the body as "a chimney turned inside out". So when the paper puts a
teardrop flame next to a 1g plume and a spherical flame next to a microgravity plume, that is not an
illustrative picture chosen because it is memorable. It is **the same governing equations at a
different scale**, and the spherical flame is direct experimental evidence for the mechanism the
paper simulates.

## Why ARES exists at all

Here is the current state, and it is a short argument.

The International Space Station controls cabin CO₂. It does it with real hardware — CDRA, Vozdukh,
CAMRAS — and it does it well enough to hold the bulk atmosphere at a set point. ISS ambient CO₂ runs
up to about 4,000 ppm, roughly ten times Earth's outdoor level, and the ECLSS keeps it there
deliberately.

Every one of those systems measures and scrubs **the bulk cabin**. None of them measures the twenty
centimetres in front of a crew member's face.

On Earth that distinction does not exist, because the plume guarantees that the air at your face is
the cabin air. In microgravity the plume is gone, and the two quantities come apart. Dutta et al.'s
simulations put transient face-level exposure in microgravity above 2.5 % against below 1.5 % at 1g —
roughly double — while the bulk atmosphere the ECLSS is regulating never sees it.

So the situation is: a well-controlled cabin, a compliant life-support system, a sensor reading
inside limits, and a crew member who has been complaining about the air for four decades. Scott Kelly
called CO₂ "the bane of his existence" across a one-year mission. The measurement everyone trusted was
answering a different question from the one being asked.

**ARES is the instrument that measures the other quantity.** Not cabin CO₂ — face CO₂, at the three
places on a head where the difference between them shows up. That is the whole thesis of the project,
and every design decision in the next ten modules is downstream of it.

## What comes next

Two directions, both of which turn up again later in this course.

**The 0.38g threshold.** Gravity is not a switch. Gr scales linearly with `g`, so it falls off
smoothly as gravity is reduced, and the plume weakens smoothly with it. Dutta et al. put the minimum
gravity for Earth-normal respiratory exchange at approximately **0.38g** — which is, to two figures,
the surface gravity of Mars. That is not a curiosity. It says a Mars surface habitat sits exactly on
the boundary, and nobody has measured which side of it a real person is on. M3 reads that result off
the paper's Figure 5A and says precisely what it does and does not claim.

**Heat stress is the same regime.** Look again at Gr and notice that `g` and `ΔT` enter as a product.
You can drive the group to zero by removing gravity, or you can drive it to zero by removing the
temperature difference — raise ambient air to 37 °C and the buoyancy that powers the plume goes away
at full Earth gravity. The paper simulates this directly and finds the two conditions equivalent:
same collapsed breathing envelope, same accumulation in front of the face.

Which means the CO₂ bubble is not only a spaceflight problem. It is a heatwave problem, a cave
problem, a sleep problem, and a cabin-of-a-parked-car problem. The regions that already average 37 °C
in their hottest months are, respiratorily speaking, running a microgravity experiment on their
populations every summer.

That is also why ARES can be validated on Earth at all. You cannot rent a microgravity chamber. You
can heat a room.

---

**Sources.** Background physics: Dutta et al. (2026), *Gravity and Human Respiration*, Introduction
and "Gravitational Biophysics of Mass Transport"; property values from `GLOSSARY.md` §4. Current
state — the ECLSS argument, the ~4,000 ppm ISS figure, the bulk-versus-face distinction, and the
>2.5 % / <1.5 % transient comparison: same paper, Discussion §"Gravity and Human Respiration in
Space" and §"Bioastronautics and Biophysical Countermeasures", plus `ARES_CO2_Presentation` slides 4
and 5. What's next — the 0.38g threshold and the 37 °C equivalence: same paper, Results
§"Gravitational, Thermal, and Redox Dynamics of the HTBP" (Fig. 5A) and §"Gravity and Thermal Redox
Stress" (Fig. 6).
