# C13 — The plume and the bubble

> CONTENT section · ARES 101 · M2 · ~5 min read
> Seeded into `contentJson` as rich text. Assumes HTBP, BTC, IBD and the candle analogy are already
> defined — see M1 and `GLOSSARY.md`. Do not re-explain them here.

---

## What the plume actually looks like

M1 established that a warm body in a cool room generates a buoyant plume, and that the plume is what
carries exhaled CO₂ away from the face. That is the mechanism. This module is about the *shape*,
because where you put a sensor depends entirely on the shape.

Start at the floor. Room air at 22 °C reaches the ankles, touches skin that Dutta et al.'s model puts
at 30–33 °C for the feet and legs, warms, and starts to rise. As it travels up the leg it stays in
contact with warm surface the whole way, so it keeps gaining buoyancy. By the torso it is moving
faster and it has entrained cooler room air on its outer edge, so the layer is thicker. At the chest
and neck the surface is warmer still — 35–37 °C — and the body's cross-section is narrowing, so the
flow from all around the torso converges.

The result is that the plume is **weakest at the ankles and strongest at the crown**, and it is worth
being clear about why, because it is not obvious and it turns out to matter:

1. **Buoyancy accumulates.** Every element of warm surface adds buoyant force to a layer that is
   already moving. For a heated vertical surface the velocity scale grows as the square root of the
   distance travelled, so a plume that has climbed 1.7 m is faster than one that has climbed 0.2 m —
   not because the head is doing more work, but because the legs and torso already did theirs.
2. **The warmest surfaces are at the top.** Head, neck and chest run several degrees hotter than the
   legs, so the buoyancy per unit area is largest exactly where the flow is already fastest.
3. **The geometry converges.** A body is wide at the shoulders and narrow at the crown. Flow gathered
   from the whole torso has to leave through a smaller area.

Dutta et al.'s simulation puts the maximum at **0.3–0.4 m/s at the top of the head**. Hold onto that
number; it recurs in M7, where it is the velocity range the anemometry circuit has to resolve, and it
is going to be the reason a sensor gets moved later on this page.

## The chin-to-nose path, and the breathing envelope

The interesting part of the flow is not the column above the head. It is what happens at the face.

Air rising up the front of the torso reaches the underside of the jaw and has to go somewhere. In the
1g simulation it turns at the base of the chin and runs upward across the mouth and toward the
nostrils, which sit at the bottom of the nose's protuberance — and then it leaves the face,
travelling up and outward at roughly 45°. The paper images this as a distinct band separating two
regions of faster-moving air, and calls it the **respiratory breathing envelope**.

Read the geometry carefully, because it is doing something specific. The plume does not simply blow
past the face. It arrives at the chin, sweeps the region directly in front of the mouth, delivers
fresh air to the nostrils, and carries whatever was there away at an angle that does not bring it
back. That is a ventilation system, and nobody designed it.

The envelope is what collapses. In the microgravity simulation the band is gone: the projected air
velocities in front of the face are too low to move anything, and exhaled CO₂ accumulates where it was
produced. Same in the 1g / 37 °C case. The paper's Figure 6 puts the three conditions side by side and
the envelope is present in exactly one of them.

So the CO₂ bubble is not really "CO₂ appearing". It is **a ventilation structure disappearing.**

## Did anyone check this against reality?

A CFD result is a picture until someone shows it matches something measured, and this is a habit worth
building now because M3 makes it an explicit skill.

The 1g half of this paper does have a validation: **Schlieren imaging**. Schlieren photography makes
density gradients in transparent media visible — you light a subject, and because warm air bends light
differently from cool air, the plume shows up as structure in what looks like empty space. It has been
used on human subjects for decades, and the plume it shows is a real photograph of a real person, not
a model output.

Dutta et al. compare their 1g flow field against previously published Schlieren imaging of human
subjects and get the same redistribution pattern. That is a genuine validation, and it is the strongest
evidence in the paper.

It is also, by construction, **only available at 1g**. Nobody has flown a Schlieren rig and a
volunteer. The microgravity half of the paper — the collapsed envelope, the bubble, the doubled
transient exposure — is a model extrapolated past the range where its validation exists. That is not a
flaw in the work. It is the gap ARES was built to close.

## Rebreathed fraction — the definition the rest of the course uses

Everything above is qualitative. Here is the number.

If the air arriving at your mouth is a mixture of two things — fresh reference air, and air you
already exhaled — then the **rebreathed fraction** is the share of that mixture that came from your
own breath:

```
f_rb = (C_chin − C_top) / (C_exhaled − C_top)
```

`C_chin` is CO₂ measured at the chin, in the air about to be inhaled. `C_top` is the reference:
what the air would be if none of it had been breathed before. `C_exhaled` is the concentration of a
full breath. All three in ppm, `f_rb` dimensionless, reported as a percentage. V12 works a real one.

The formula is a two-line piece of algebra with three assumptions buried in it, and the glossary
requires all three to travel with it everywhere it is used:

**It is a two-compartment mixing model.** It assumes the chin air is exactly reference air plus
exhaled breath and nothing else. A third source — another person, a vent, a scrubber outlet — is not
represented, and the formula will silently attribute that third source to your own breath.

**`C_top` is a reference, not a datum.** The whole thing is calibrated against the claim that `C_top`
is un-rebreathed air. If it is not, the numerator shrinks and the answer comes out too low. This is
not a hypothetical, as the next section explains.

**It is a difference, so it carries both sensors' errors.** Subtracting two noisy readings gives a
result noisier than either one. If the two pods disagree by 100 ppm for instrumental reasons, that
error lands directly in the numerator. M10 builds the error budget; the reason per-pod calibration is
not optional starts here.

## Current state: three pods, and why those three places

ARES 2 carries three sensor pods on the headset. Each pairs a CO₂ sensor with temperature and humidity
sensing, and each has a job that follows directly from the flow structure above.

| Pod | Where | What it is for |
|---|---|---|
| **Chin** | Below the jaw, in the breathing zone | The signal. This is where exhaled breath is, and where the CO₂ bubble forms |
| **Top** | Above the crown | The reference. `C_top` in the formula above |
| **Forehead** | At the brow | Humidity and thermal load — sweat onset, and the skin-side of the thermal picture |

The chin pod is the measurement. Everything M1 and M2 have said predicts that if a bubble exists, the
chin is where it is, and that a person's rebreathing shows up as chin CO₂ rising above the room while
the room itself does not change.

The top pod is what makes that statement meaningful. A chin reading of 1,850 ppm means nothing on its
own — it could be a rebreathing event, or it could be a badly ventilated room. **Chin minus top is the
rebreathing measurement**, and neither number is interesting without the other.

The forehead pod is not part of that subtraction. It is there because the same collapse that traps CO₂
also traps heat and water vapour, and because M8's hydration model reads sweat onset off forehead
humidity.

And now the problem, which the team found before this course was written: **the top pod is sitting in
the plume.** Reread the first section. Peak plume velocity, and peak plume CO₂ loading, occur at the
top of the head — the plume has spent 1.7 m gathering everything it swept off the body, including
whatever exhalate the breathing envelope carried up past the face. A sensor at the crown is not
sampling room air. It is standing in the exhaust.

The current pod hardware makes it worse: the pod body is tall enough to stand proud of its arm, so it
partly shadows the flow it is trying to sample.

## What's next

**Move the top pod backwards.** The next revision relocates it behind the crown, out of the rising
column, so that it samples air the body has not already processed. The same redesign cuts the pod's
vertical height so it stops standing in the flow it is measuring. Both changes are about one thing:
making `C_top` an honest reference.

It is worth being precise about the cost of not doing it, because it is the least intuitive result in
this module. A contaminated reference does not add noise. It produces a clean, stable, confidently
wrong number, and it is wrong in a specific direction — **biased low**. A headset with a top pod in the
plume will systematically under-report rebreathing, which is to say it will systematically under-report
the exact phenomenon the project exists to detect. V12 puts numbers on it.

**Room-reference nodes.** Even a perfectly placed top pod is still on the subject, and everything on
the subject is within a metre and a half of a CO₂ source. The longer-term plan borrows an argument the
JPL laser-spectrometer team makes for the ISS — that one fixed sensor cannot see a spatial gradient,
so you want a mesh of them. That is already the case for three pods on a head; it extends naturally to
reference nodes placed around the subject rather than on them, which would give a true room baseline
that no amount of pod repositioning can.

**One thing this module has quietly oversimplified.** Everything above treats the flow as steady — a
plume that is always there, doing the same thing. A single exhalation is not steady. It is a fast,
directed, short-lived jet that pushes into the plume, is disrupted by it, and only then behaves like
something buoyant. Which picture applies depends entirely on the timescale you are asking about, and
the paper assigned to this section's literature review is the one that resolves the fast end of it.
Read it with the sensor-placement question in mind.

---

**Sources.** Plume structure, the 0.3–0.4 m/s crown velocity, the chin-to-nostril path, the 45°
breathing envelope, the body-surface temperature gradient, and the Schlieren validation: Dutta et al.
(2026), *Gravity and Human Respiration*, Results §"Simulating BTC and the HTBP under 1g and in
Microgravity", §"HTBP Airflow Morphology" (Fig. 4), and §"Gravity and Thermal Redox Stress" (Fig. 6).
Rebreathed-fraction definition and its three caveats: `GLOSSARY.md` §2. Current state — the three pod
positions and their roles: `ARES_7_30_26.pptx` slide 3. The top-pod relocation, the pod height
reduction, and the room-reference-node direction: `ARES_7_30_26.pptx` slides 3, 11 and 18.
