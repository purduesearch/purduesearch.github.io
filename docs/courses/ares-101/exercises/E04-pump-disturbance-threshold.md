# E04 — When does the pump disturb the anemometer?

> CONTENT section · ARES 101 · M7 · ~2 min to read, 45–90 minutes with a pencil
> Seeded into `contentJson` as rich text. Depends on `C18` (thermal anemometry, the FS7, the three open
> questions), `C17` (the pump, the 0.67 L/min per-pod split, the 3.0 mm bore) and `C13` (the 0.3–0.4 m/s
> plume).
>
> **This exercise is not a teaching problem with a known answer.** It is open question 3 from
> `ARES_7_30_26.pptx` slide 11, handed to you unmodified. Nobody on the ARES team has answered it.
> There is no key at the bottom of this file that says what the number really was, because there is no
> such number yet. The worked section below the rule is **one person's attempt**, shown so you know what
> a defensible attempt looks like — not so you can check yours against it.
>
> **Your answer goes back to the ARES team.** Write it to be read by somebody who will act on it.

---

## The question, as it was actually asked

Slide 11 of the 7/30 deck lists three current concerns for the next-generation pod. The third reads,
verbatim:

> *Will the chamber in-flow pump disturb the anemometer readings? And what is the maximum flow rate
> where the pump flow becomes negligible in the total flow*

That is the question. Before you can answer it you have to notice that **it is ambiguous in two
separate ways**, and deciding which version you are answering is the first real piece of work.

**Ambiguity one — which pump?** "The chamber in-flow pump" could mean the pump that supplies air to a
test chamber, sitting perhaps a metre from the headset, or the headset's **own sampling pump**, drawing
0.67 L/min per pod through an inlet that is a centimetre or two from the anemometer. Those are
different problems by two orders of magnitude in length scale, and they have different answers.

**Ambiguity two — whose flow rate?** "The maximum flow rate where the pump flow becomes negligible"
can be read either way and both readings are coherent:

- **the maximum *pump* flow** you can draw and still have the disturbance be negligible — an upper
  bound on the pump; or
- **the ambient flow** above which the pump's fixed contribution stops mattering — a lower bound on the
  velocity the instrument can be trusted at.

Answer both. They are the same inequality solved for different variables, so the second one costs you
almost nothing once you have the first.

**This exercise takes the sampling-pump reading**, because that is the one that is fully specified by
numbers this course has already given you, and because it is the one that constrains the pod design
that is being drawn right now. If you want to attack the chamber-supply version as well, do — say which
you did.

## What you are producing

A one-page memo with a number in it, and — this is the part that is worth more than the number — **an
explicit list of what you assumed.**

Say that out loud before you start, because it changes how you should spend your time:

> A well-reasoned answer with stated assumptions is worth more than a confident number.

A confident number with no assumptions cannot be checked, cannot be improved when the geometry changes,
and cannot be argued with. It will be quietly ignored. A number that arrives with "I modelled the inlet
as a hemispherical sink, I assumed a 10 mm standoff, and I called 5 % negligible" can be attacked on
any of three specific fronts, which means somebody can *use* it.

## What you are given

Everything here is established elsewhere in the course. Nothing is invented for this exercise.

| Quantity | Value | From |
|---|---|---|
| Pump total free flow | 2.00 L/min (1.70 continuous) | `C17` |
| Per-pod draw after the three-way split | **0.67 L/min** nominal | `C17` |
| Sample line / inlet bore | **3.0 mm** | `C17` |
| Plume velocity at the crown | **0.3–0.4 m/s** | `C13` |
| Anemometry band this course quotes | 0.05–0.4 m/s | `GLOSSARY.md` §5 |
| FS7 response sensitivity | 0.01 m/s | `C18` |
| FS7 self-buoyancy crossover | ≈ 0.04–0.08 m/s | `C18` |

And one thing you are **not** given, which you will have to decide and defend:

**The distance from the sampling inlet to the anemometer element.** In the next-generation pod both
live in the same pod body. Nobody has written the number down. Measure it off the CAD if you can get
it, estimate it from the pod photographs on slide 11 if you cannot, and **state which you did**.

## The method

### 1 · Convert the pump draw into a velocity field

The pump does not produce "a flow rate" at the anemometer. It produces a **velocity at a distance**,
and you need that before you can compare it to anything.

Start with the face velocity at the inlet itself — flow rate over area — and then work out how fast it
falls off with distance. The falloff is the whole exercise, and there is one physical idea you need to
get right to do it:

**An inlet is a sink, and a sink is not a jet run backwards.**

This is the reason you can blow a candle out from across a table and cannot suck it out from an inch
away. Air leaving a nozzle carries momentum in a direction, so it stays collimated and travels. Air
entering an inlet arrives from **every direction at once**, so the same volumetric flow is spread over a
spherical surface that grows as `r²`. Model the inlet as a point sink and the induced velocity is

```
u(r) = Q / (2π r²)      inlet flush in a surface — flow arrives over a hemisphere
u(r) = Q / (4π r²)      inlet standing free in the air — full sphere
```

Pick one and say why. The pod geometry decides it, and the two answers differ by a factor of two.

### 2 · Choose your fraction, and defend it

You need a definition of "negligible". Nobody has given you one, and picking it is part of the
assignment. Write it down before you compute anything, for the same reason `E02` makes you write an
acceptance criterion before you measure.

Candidates worth considering:

- **The instrument's own resolution.** The FS7 resolves 0.01 m/s. An error below that is invisible, so
  arguably negligible by definition. This is the most defensible floor and the easiest to justify.
- **A fraction of the reading** — 5 % is the conventional starting point.
- **A fraction of the smallest velocity you need to resolve.** Different from the previous one, and
  stricter at the bottom of the range.
- **A fraction of the calibration error you already carry.** `C18` puts the fit residual around 5 % and
  the temperature sensitivity at 5.672 % per °C. An argument that pump disturbance below 1 % is not
  worth chasing *because a larger error is already sitting there uncorrected* is a good argument, and
  it is the kind of thinking an error budget is for.

Any of these is fine. Choosing none of them is not.

### 3 · Solve the inequality, both ways

Your criterion is `u_pump ≤ f · V_ambient`. Substitute the sink model and you have one equation with
four quantities in it — `Q`, `r`, `f`, `V_ambient`. Solve it for `V_ambient` to get the velocity above
which the pump stops mattering. Solve it for `Q` to get the largest pump draw that keeps the
disturbance under your criterion at the velocity you actually care about.

Do it at `r` values across the plausible range rather than at one. The answer's *sensitivity to `r`* is
more useful to the team than the answer at any single `r`, because `r` is the thing they can still
change.

### 4 · Then check the geometry, because it may undo everything

Here is the step people skip, and it is worth more than steps 1 to 3 combined.

The FS7 measures a **speed**, not a velocity — it has no directional discrimination whatsoever. So the
pump's induced flow does not simply add to the ambient flow. It adds as a **vector**, and the sensor
reads the magnitude of the sum.

If the pump's induced flow is **collinear** with the ambient flow, the error is first order: a 5 %
induced velocity is a 5 % reading error.

If it is **perpendicular**, the error is second order: `|V| = √(V² + u²)`, and a 5 % induced velocity is
a **0.125 %** reading error. Forty times smaller, for free, from an orientation choice.

Work out both. Then say what the pod's actual geometry is and which case it is closer to. This is the
part of your memo that could change a drawing.

### 5 · Say how to test it

Your estimate's real job is to **predict what a bench test will show.** So end the memo by specifying
the test:

Put the headset in still air. Log the anemometer with the pump **off**, then with the pump **on**, and
compare. That is the entire experiment. It needs no theory, it takes twenty minutes, and it directly
measures the quantity everybody has been arguing about. If your estimate says the disturbance is
0.02 m/s and the anemometer resolves 0.01 m/s, then your estimate has just told you the test will show
something — which is a prediction, and predictions are falsifiable.

Say what result would mean your estimate was **wrong**. `M11` makes a module out of that discipline;
this is the small version.

## What to hand in

One page. It goes to the ARES team, so write it for somebody who will act on it.

1. **Which question you answered** — which pump, and which of the two flow-rate readings. One sentence.
2. **Your assumptions, as a list.** Sink model and why, standoff `r` and where it came from, fraction
   `f` and why, orientation.
3. **The two numbers** — the ambient velocity above which the pump is negligible, and the maximum pump
   draw that keeps it negligible at 0.3 m/s.
4. **The sensitivity** — how the answer moves as `r` moves over its plausible range.
5. **A recommendation**, in one sentence, that somebody could act on this week.
6. **The test** that would confirm or refute you, and what result would refute you.

---

## One worked attempt

**Stop here and do it yourself first.** What follows is one person's pass at the same question with the
same information. It is not an answer key. It is here so that nobody stalls on "what is this supposed
to look like", and it contains at least one choice you should disagree with.

**Assumptions, stated up front.** Hemispherical sink, because the inlet sits in the pod's outer face.
Standoff `r` treated as unknown and swept from 5 to 30 mm. "Negligible" defined as **5 % of the ambient
velocity**, chosen because it is conventional and because it is comfortably above the FS7's 0.01 m/s
resolution across most of the band. Steady flow, no pulsation, inlet not shrouded.

**Face velocity.** `Q = 0.67 L/min = 1.117 × 10⁻⁵ m³/s`. The 3.0 mm bore gives
`A = 7.07 × 10⁻⁶ m²`, so

```
u₀ = Q / A = 1.117×10⁻⁵ / 7.07×10⁻⁶ = 1.58 m/s
```

Which is a shock the first time you compute it: **at the inlet face the pump is moving air five times
faster than the plume we are trying to measure.** If the falloff were slow, this would be hopeless.

**How fast it falls off.** `u(r) = Q / (2πr²)`:

| `r` | `u_pump` | vs. a 0.3 m/s plume |
|---|---|---|
| 5 mm | 0.071 m/s | 24 % |
| 10 mm | 0.018 m/s | **5.9 %** |
| 15 mm | 0.0079 m/s | 2.6 % |
| 20 mm | 0.0044 m/s | 1.5 % |
| 30 mm | 0.0020 m/s | 0.66 % |

That falloff is the reason the problem is tractable at all, and it is worth seeing next to the jet it is
*not*. A round jet holds its exit velocity for roughly six diameters and then decays like `1/x`; at
10 mm this inlet, run backwards as a jet, would still be doing about 1.6 m/s. As a sink it is doing
0.018. **Same pump, same hole, a factor of ninety, purely from the direction of the arrow.**

**The two answers.** With `f = 0.05`:

```
V_ambient ≥ Q / (2π r² f)          →  at r = 10 mm:  V ≥ 0.36 m/s
                                      at r = 20 mm:  V ≥ 0.089 m/s

Q ≤ 2π r² f V_ambient               →  at r = 10 mm, V = 0.3 m/s:  Q ≤ 0.57 L/min
```

And the inverse of the first, which is the sentence to lead the memo with:

```
r ≥ √( Q / (2π f V) )  = √( 1.117×10⁻⁵ / (2π × 0.05 × 0.3) )  =  10.9 mm
```

**Read those three lines together, because they are uncomfortable.**

At a 10 mm standoff, the threshold ambient velocity is **0.36 m/s — inside the plume band this
instrument exists to measure.** The pump is not comfortably negligible and it is not comfortably
dominant. It is sitting exactly on the boundary, which is the worst place for an unmeasured quantity to
sit, because it means the answer flips depending on a dimension nobody has written down.

And 0.67 L/min against a 0.57 L/min ceiling is an overshoot of about **18 %**. The pump is not off by a
factor of ten. It is off by an amount that a manifold revision or a slightly lower drive power could
plausibly close — which makes this a live design question rather than a theoretical one.

**Then the geometry, which changes the conclusion.** All of the above assumed the pump's induced flow
is collinear with the ambient flow — worst case. Perpendicular:

```
|V| = √(V² + u²) = 0.3 × √(1 + 0.059²) = 0.3005 m/s      →  0.17 % reading error
```

The same 5.9 % induced velocity produces a **0.17 %** error in what the sensor reports. To reach a 5 %
*reading* error in the perpendicular case you would need `u/V ≈ 0.32`, which happens at `r ≈ 4.3 mm`.

So the required standoff is **10.9 mm if the inlet faces along the flow and 4.3 mm if it faces across
it**, for the same tolerance. Orientation is worth more than a factor of two in standoff on a part
whose entire design goal this revision is to get smaller.

**The recommendation.** Point the sampling inlet **across** the expected flow rather than along it, and
hold at least 11 mm between the inlet and the FS7 element. If the pod cannot give 11 mm — and a
low-profile pod may not — then the orientation is not a nicety, it is the mitigation.

**Where this is weakest, in order.** The standoff `r` is a guess and the answer scales as `1/r²`, so it
is by far the dominant uncertainty — halve `r` and everything above quadruples. The point-sink model
ignores the pod body, which is a real surface that will steer the inflow. The 5 % criterion is
conventional rather than derived. And `Q` itself is `NOM`, not `MEAS` — `C17` is explicit that the
per-pod figure is a nominal estimate from drive power with no flow sensor behind it, so treat 0.67 L/min
as having no more than one significant figure of authority.

**What would refute this.** Run the still-air test. If the anemometer reads the same with the pump on
and off, to within its 0.01 m/s resolution, then at whatever the real standoff is the disturbance is
below 0.01 m/s — which this model says requires `r ≥ 13 mm`, and would tell you the standoff is larger
than assumed or the inflow is being steered by the pod body. If it reads a clear step, measure the step
and you have the answer directly, with no model at all.

**Which is the honest last word on the whole exercise.** Every number above is a prediction about a
twenty-minute bench test that nobody has run. The estimate is worth doing because it tells you what to
look for and how precisely you need to look. It is not worth defending once somebody has the trace.
