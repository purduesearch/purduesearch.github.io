---
promptText: "Write the one-page memo the exercise below specifies and submit it here. Read the header first, because this section is unlike every other exercise in the course. This is open question 3 from slide 11 of the 7/30 deck, handed to you unmodified. Nobody on the ARES team has answered it and there is no correct number, so there is no key at the bottom of the page saying what the number really was. The worked section below the rule is ONE PERSON'S ATTEMPT at the same question with the same information, shown so that nobody stalls on what this is supposed to look like - it is not an answer key, it contains at least one choice you should disagree with, and an attempt that diverges from it with a stated reason is worth more than one that reproduces it. Your answer goes back to the ARES team, so write it for somebody who will act on it. Hand in all six items: which question you answered, meaning which pump and which of the two flow-rate readings; your assumptions as a list; the two numbers; how the answer moves as the standoff moves over its plausible range; a recommendation somebody could act on this week; and the bench test that would confirm or refute you, together with the result that would refute you. State every assumption and say which direction each one pushes your answer - a confident number with no assumptions cannot be checked, cannot be improved when the geometry changes, cannot be argued with, and will be quietly ignored. Write at least 300 words. This section is not gated, and it could not be: there is nothing to gate against."
minWords: 300
rubric:
  - id: assumptions
    point: "THE POINT THIS EXERCISE IS FOR, and the file says so in its own words - a well-reasoned answer with stated assumptions is worth more than a confident number - so the rubric has to mean it. Full credit needs the assumptions present AS A LIST, and each one carrying a direction of error rather than only a value. Four must be there. WHICH SINK MODEL, hemispherical with Q over 2 pi r squared or spherical with Q over 4 pi r squared, with the geometric reason, because the two differ by a factor of two and the pod face is what decides which applies. THE STANDOFF r, with the answer saying whether it was measured off the CAD or estimated from the slide 11 pod photographs, because the exercise asks for that explicitly and nobody has written the number down. THE FRACTION f that defines negligible, named before anything is computed and argued from one of the four candidates the exercise offers - the FS7's own 0.01 m/s response sensitivity as a resolution floor, a conventional 5 percent of the reading, a fraction of the smallest velocity that has to be resolved, or a fraction of the calibration error already being carried, which per C18 is a fit residual near 5 percent and a temperature sensitivity of 5.672 percent per degree C. AND THE ORIENTATION assumed between the inlet axis and the ambient flow. Beyond the list, credit an answer that ranks its assumptions by how much they move the result and identifies the standoff as dominant, since the induced velocity goes as one over r squared and halving r quadruples everything above it. Award partial for a list that gives values without saying which way each biases the answer. Award missed for a memo that produces numbers with no assumption list, however good the numbers are."
    weight: 4
  - id: sink-model
    point: "Step 1, and the physical idea the whole estimate rests on. Converts the pump draw into a velocity AT A DISTANCE rather than treating a flow rate as though it were a velocity, and gets the inlet-is-a-sink argument right - air leaving a nozzle carries momentum in a direction and stays collimated, air entering an inlet arrives from every direction at once, so the same volumetric flow spreads over a surface growing as r squared and the induced velocity falls as one over r squared. This is why you can blow a candle out from across a table and cannot suck it out from an inch away. Full credit requires C17's numbers to be used rather than gestured at, the 0.67 L/min per-pod draw and the 3.0 mm bore, and the face velocity computed from them as flow over area, which comes to about 1.6 m/s - the number worth being shocked by, because at the inlet face the pump is moving air roughly five times faster than the plume the instrument exists to measure. Credit strongly an answer that sets the sink beside the jet it is not: run backwards as a jet the same inlet would still be doing about 1.6 m/s at 10 mm, since a round jet holds its exit velocity for roughly six diameters, while as a sink it is doing about 0.018 m/s - same pump, same hole, a factor near ninety, purely from the direction of the arrow. Award partial for a correct falloff law with no face velocity computed. Award missed for any answer that compares a flow rate in L/min directly against a velocity in m/s, which is the error the whole first step exists to prevent."
    weight: 3
  - id: orientation
    point: "Step 4, which the exercise says is worth more than steps 1 to 3 combined, and it is right. The FS7 measures a SPEED and has no directional discrimination whatsoever, so the induced flow does not add to the ambient flow arithmetically - it adds as a vector and the sensor reads the magnitude of the sum. Collinear, the error is first order and a 5 percent induced velocity is a 5 percent reading error. Perpendicular, the error is second order through the root of V squared plus u squared, so the same 5 percent induced velocity is a 0.125 percent reading error - forty times smaller, for free, from an orientation choice. Full credit requires both cases worked, a statement of which case the pod geometry is actually closer to, and the design consequence drawn out: the required standoff is about 11 mm if the inlet faces along the flow and about 4 mm if it faces across it, for the same tolerance, on a part whose entire design goal this revision is to make smaller. Extra credit, not required for full marks, for an answer that ATTACKS the perpendicular case rather than banking it - the flow near a face is a buoyant plume per C13, neither steady nor of guaranteed direction, and the head moves inside it, so the forty-times saving is an upper bound available only where the geometry can be guaranteed. An answer that says so is doing better engineering than the worked attempt below the rule and should be told so. Award missed for an answer that adds the induced and ambient velocities as scalars."
    weight: 3
  - id: plume-comparison
    point: "Compares the induced velocity against the velocities this instrument actually has to resolve, rather than against nothing. The comparison set is C13's 0.3 to 0.4 m/s plume at the crown, the 0.05 to 0.4 m/s anemometry band this course quotes in GLOSSARY.md section 5, the FS7's 0.01 m/s response sensitivity from C18, and C18's self-buoyancy crossover at roughly 0.04 to 0.08 m/s. Full credit requires the answer to be evaluated across a RANGE of standoffs rather than at one, because the sensitivity to r is more useful to the team than the answer at any single r - r is the thing they can still change - and requires the uncomfortable conclusion to be stated if the numbers produce it. At a 10 mm standoff with a 5 percent criterion the threshold ambient velocity lands near 0.36 m/s, which is INSIDE the plume band the instrument exists to measure, so the pump is neither comfortably negligible nor comfortably dominant but sitting on the boundary, which is the worst place for an unmeasured quantity to sit, because the answer then flips on a dimension nobody has written down. Credit generously an answer that pushes the evaluation to the BOTTOM of the band rather than the top: at 0.05 m/s ambient the same criterion demands roughly 27 mm of standoff, which no low-profile pod is going to give, and per C18 the FS7 is measuring its own buoyant plume down there anyway - the two problems stack in the same region, which is a finding the worked attempt below the rule does not reach. Partial credit for a single-standoff answer with no sensitivity."
    weight: 2
  - id: both-readings
    point: "Notices that the question as written on slide 11 is ambiguous in two separate ways, says which version is being answered, and then solves the inequality both ways. Ambiguity one is WHICH PUMP - the test chamber's supply pump, sitting perhaps a metre from the headset, or the headset's own sampling pump drawing through an inlet a centimetre or two from the anemometer element. Those differ by two orders of magnitude in length scale and they have different answers. Ambiguity two is WHOSE FLOW RATE - the maximum PUMP flow that can be drawn while the disturbance stays negligible, which is an upper bound on the pump, or the AMBIENT flow above which the pump's fixed contribution stops mattering, which is a lower bound on the velocity the instrument can be trusted at. Both readings are coherent, and they are the same inequality solved for different variables, so an answer that produces both numbers has done almost no extra work for the second. Full credit needs the choice of pump stated in one sentence, both flow-rate readings answered, and each number labelled with the conditions it was evaluated at, since neither means anything without its r, its f and its ambient velocity. Partial credit for one reading answered well and the other not mentioned. Extra credit for an answer that also attacks the chamber-supply version, which the exercise invites and nobody has done. Deciding which question is being answered is the first real piece of work in this exercise, and part of what goes back to the team is which question was actually being asked."
    weight: 2
  - id: nominal-flow
    point: "Treats the input flow rate as the estimate it is rather than as a measurement. Two separate problems here, and an answer earns full credit for either argued properly, more for both. FIRST, per C17 the Lee driver commands DRIVE POWER IN MILLIWATTS and not a flow setpoint, PUMP_HAS_FLOW_SENSOR defaults to 0 until a flow sensor is physically wired to the driver's measured-flow register, and the litres-per-minute figure the system reports is a percentage times a nominal maximum scaled off the datasheet - which is exactly why the app is required to badge it NOM rather than MEAS. So 0.67 L/min carries no more than one significant figure of authority and the entire memo inherits that. SECOND, and less often noticed, 0.67 is the NAIVE EQUAL three-way split of the pump's 2.00 L/min free flow, and C17's central result is that the split is not equal: parallel paths divide flow in inverse proportion to resistance, resistance rises with line length and as the inverse fourth power of bore, and for lines of 0.25, 0.35 and 0.45 m at the same bore the split comes out 0.88, 0.63 and 0.49 L/min rather than 0.67 each. The pod on the shortest line therefore draws about 31 percent more than the figure the exercise hands you, and because the required standoff goes as the square root of Q that alone moves an 11 mm answer to about 12.5 mm - and it moves it in the direction that makes the problem worse. Credit any answer naming either issue and stating its direction. Award missed for a memo that quotes 0.67 L/min to three significant figures with no qualification anywhere."
    weight: 2
  - id: the-test
    point: "Ends with a falsifiable prediction and an action, which is what makes a memo useful to somebody rather than interesting to nobody. Two halves, and both are stated deliverables of the exercise. THE TEST - put the headset in still air, log the anemometer with the pump OFF, then with the pump ON, and compare. No theory, twenty minutes, and it directly measures the quantity everybody has been arguing about. Full credit requires the answer to state what result would mean the estimate was WRONG, in numbers rather than in principle: if the estimate puts the disturbance at the real standoff above the FS7's 0.01 m/s resolution, then a null result refutes it, and this model puts the 0.01 m/s contour at about 13 mm of standoff, so a null result says either the standoff is larger than assumed or the pod body is steering the inflow in a way a point sink does not capture. If instead the trace shows a clear step, measure the step and the answer is in hand directly, with no model at all. THE RECOMMENDATION - one sentence somebody could act on this week, of the shape point the sampling inlet ACROSS the expected flow rather than along it and hold at least 11 mm between the inlet and the FS7 element, with the fallback stated for a pod that cannot give 11 mm, where the orientation stops being a nicety and becomes the mitigation. Award missed for a memo that ends at a number with no test and no recommendation, however good the number is: the estimate's real job is to predict what a bench test will show, and an estimate nobody can act on or refute has not done it."
    weight: 2
referenceAnswer: |
  DRAFT - pending ARES team review. Drawn from the exercise body and from C13, C17, C18 and
  GLOSSARY.md section 5. It encodes claims about ARES hardware and geometry that the team should
  check before this course is published.

  THIS IS NOT AN ANSWER KEY. READ THIS PARAGRAPH BEFORE GRADING ANYTHING.

  E04 is open question 3 from slide 11 of ARES_7_30_26.pptx, handed to the learner unmodified.
  Nobody on the ARES team has answered it. There is no correct number, there is no measurement to
  compare against, and no bench test has been run. The worked attempt reproduced below is ONE
  PERSON'S PASS at the question, printed in the learner-facing body under a heading that says
  exactly that, and copied here only so that grading has something concrete to reason against.
  Do NOT treat its numbers as ground truth and do NOT mark down an answer for disagreeing with
  them. An attempt that reaches different numbers by a stated route is not thereby wrong. An
  attempt that reaches BETTER numbers by attacking a choice the worked attempt made - and the
  section below lists the places where that is available - is a better answer than the worked
  attempt and should score higher than one that reproduces it.

  What is being graded is the ARGUMENT. Judge every field on whether the choice is named, whether
  the reason is given, and whether the direction of error is stated.

  WHAT MAKES AN ATTEMPT DEFENSIBLE

  Five things, in the order they matter.

  1. The assumptions are a visible list, and each one says which way it pushes the answer. This
     is the exercise's own headline claim and it outranks every number in the memo.
  2. The pump draw is converted into a VELOCITY AT A DISTANCE, using C17's 0.67 L/min per-pod
     figure and 3.0 mm bore, through a sink model that is named and justified.
  3. The result is compared against something real: C13's 0.3 to 0.4 m/s plume, the 0.05 to
     0.4 m/s band from GLOSSARY.md section 5, and the FS7's 0.01 m/s resolution from C18.
  4. The vector nature of the sum is handled - the FS7 reads a speed, so orientation changes the
     answer by more than any other single decision available to the designer.
  5. It ends with a bench test, a statement of what would refute it, and one actionable sentence.

  An attempt missing 1 is not defensible whatever else it contains. An attempt missing 5 has not
  produced the deliverable the exercise asked for.

  ONE WORKED ATTEMPT, COPIED FROM THE BODY

  This is the section printed below the rule in the learner-facing page. It is duplicated here on
  purpose - the body keeps it so a learner can see what the shape of an answer is, and the config
  gets a copy so grading has something to reason with. Anyone editing one must edit the other.

  ASSUMPTIONS. Hemispherical sink, because the inlet sits in the pod's outer face. Standoff r
  treated as unknown and swept from 5 to 30 mm. Negligible defined as 5 percent of the ambient
  velocity, chosen because it is conventional and because it sits comfortably above the FS7's
  0.01 m/s resolution across most of the band. Steady flow, no pulsation, inlet not shrouded.

  FACE VELOCITY. Q = 0.67 L/min = 1.117e-5 m3/s. The 3.0 mm bore gives A = 7.07e-6 m2, so
  u0 = Q / A = 1.58 m/s. At the inlet face the pump is moving air about five times faster than
  the plume the instrument is trying to measure.

  FALLOFF, with u(r) = Q / (2 pi r squared):

      r = 5 mm    u = 0.071 m/s     24 percent of a 0.3 m/s plume
      r = 10 mm   u = 0.018 m/s     5.9 percent
      r = 15 mm   u = 0.0079 m/s    2.6 percent
      r = 20 mm   u = 0.0044 m/s    1.5 percent
      r = 30 mm   u = 0.0020 m/s    0.66 percent

  The contrast with a jet is the point: a round jet holds its exit velocity for roughly six
  diameters, so run backwards this inlet would still be doing about 1.6 m/s at 10 mm. As a sink
  it is doing 0.018. Same pump, same hole, a factor of about ninety, purely from the direction of
  the arrow.

  THE TWO ANSWERS, with f = 0.05:

      V_ambient >= Q / (2 pi r squared f)   at r = 10 mm:  V >= 0.36 m/s
                                            at r = 20 mm:  V >= 0.089 m/s
      Q <= 2 pi r squared f V_ambient       at r = 10 mm, V = 0.3 m/s:  Q <= 0.57 L/min
      r >= root( Q / (2 pi f V) )           at V = 0.3 m/s:  r >= 10.9 mm

  Read those together. At a 10 mm standoff the threshold ambient velocity is 0.36 m/s, inside the
  plume band this instrument exists to measure - the pump is sitting exactly on the boundary,
  which is the worst place for an unmeasured quantity to sit. And 0.67 L/min against a 0.57 L/min
  ceiling is an overshoot of about 18 percent: not off by a factor of ten, but off by an amount a
  manifold revision or slightly lower drive power could plausibly close, which makes this a live
  design question rather than a theoretical one.

  ORIENTATION, which changes the conclusion. All of the above assumed the induced flow is
  collinear with the ambient flow, which is the worst case. Perpendicular:

      |V| = root(V squared + u squared) = 0.3 x root(1 + 0.059 squared) = 0.3005 m/s

  which is a 0.17 percent reading error from the same 5.9 percent induced velocity. To reach a
  5 percent READING error in the perpendicular case you would need u over V near 0.32, which
  happens at r near 4.3 mm. So the required standoff is 10.9 mm along the flow and 4.3 mm across
  it, for the same tolerance.

  RECOMMENDATION. Point the sampling inlet ACROSS the expected flow rather than along it, and hold
  at least 11 mm between the inlet and the FS7 element. If the pod cannot give 11 mm - and a
  low-profile pod may not - then the orientation is not a nicety, it is the mitigation.

  WHERE IT IS WEAKEST, in the worked attempt's own words. The standoff r is a guess and the answer
  scales as one over r squared, so it is by far the dominant uncertainty. The point-sink model
  ignores the pod body, which is a real surface that will steer the inflow. The 5 percent criterion
  is conventional rather than derived. And Q itself is NOM, not MEAS.

  WHAT WOULD REFUTE IT. Run the still-air test. If the anemometer reads the same with the pump on
  and off to within its 0.01 m/s resolution, then at the real standoff the disturbance is below
  0.01 m/s - which this model says requires r of at least 13 mm, and would tell you the standoff is
  larger than assumed or the inflow is being steered by the pod body. If it reads a clear step,
  measure the step and you have the answer directly, with no model at all.

  WHERE A LEARNER MAY LEGITIMATELY DISAGREE WITH THE ATTEMPT ABOVE

  The body tells the learner the attempt contains at least one choice they should disagree with.
  These are the ones available. An answer that lands any of them, with a reason, is ahead of the
  attempt and should be graded that way.

  THE STRONGEST. The attempt evaluates at V = 0.3 m/s, the TOP of the band. At the bottom of the
  band, 0.05 m/s, the same 5 percent criterion demands r of about 27 mm, which no low-profile pod
  will give - and per C18 the FS7's own self-buoyancy crossover sits at roughly 0.04 to 0.08 m/s,
  so down there the instrument is measuring its own plume as well as the pump's. The two failures
  stack in the same region, and the attempt above never goes looking for them.

  THE FLOW RATE IS TOO CLEAN. 0.67 L/min is the naive equal split of 2.00 L/min three ways, and
  C17 shows the split is not equal - 0.88, 0.63 and 0.49 L/min for lines of 0.25, 0.35 and 0.45 m
  at the same bore. The worst-case pod draws about 31 percent more than 0.67, and since r scales as
  the square root of Q the 10.9 mm becomes about 12.5 mm. Separately, the figure is NOM rather than
  MEAS, so no flow number in this memo can currently be verified at all.

  THE PERPENDICULAR SAVING IS AN UPPER BOUND. The forty-times reduction assumes the ambient flow
  direction is known and steady. Per C13 the flow near a face is a buoyant plume, and the head
  moves inside it. An answer that says the orientation argument only cashes where the geometry can
  be guaranteed, and that the collinear case is what should be designed to, is more conservative
  than the attempt and better engineering.

  THE SINK GEOMETRY IS ASSERTED. Hemispherical assumes the inlet sits flush in a large flat
  surface. A pod is small and its face is curved, so the effective solid angle is somewhere between
  the hemisphere and the full sphere, and the two bound a factor of two in u and a factor of root
  two in the required r. An answer that brackets it rather than picking one is doing the right
  thing.

  THE CRITERION IS CONVENTIONAL. 5 percent is borrowed, not derived. An argument that the right
  floor is the FS7's 0.01 m/s resolution, on the grounds that an error the instrument cannot see is
  negligible by definition, is at least as defensible - and it is stricter at the bottom of the
  band and looser at the top, which changes the shape of the answer rather than just its value. So
  is the C18 argument that pump disturbance below about 1 percent is not worth chasing because a
  5 percent fit residual and a 5.672 percent per degree C temperature sensitivity are already
  sitting there uncorrected.

  HOW TO GRADE THIS SECTION

  Reward the argument, not the agreement. A memo with different numbers, stated assumptions and a
  named test is a better submission than one that reproduces the table above, and the feedback
  should say so out loud - the learner has been told there is no key, and the grading has to behave
  as though that is true or the instruction was a lie.

  Reward a stated direction of error over a stated magnitude. Every number in this exercise rests
  on a dimension nobody has measured; what the team can use is knowing which way each guess pushes.

  Do not penalise an answer for taking the chamber-supply reading instead of the sampling-pump
  reading, provided it says which it took. The exercise explicitly permits it and nobody has done
  it.

  Do not penalise an answer that concludes the question cannot be answered until the standoff is
  measured and the still-air test is run, provided it says what to measure and what the test would
  show. That is the honest last word on the whole exercise, and the body says so.

  A NOTE FOR WHOEVER MAINTAINS THIS FILE

  This rubric is graded partly against hardware that is being designed right now. If the standoff
  between the inlet and the FS7 element is ever measured and written down, the assumptions point
  changes character, because the dominant uncertainty stops being a guess. If a flow sensor is
  fitted and the pump reports MEAS, the nominal-flow point loses half its content. If somebody runs
  the twenty-minute still-air test, this exercise stops being an open question and becomes a
  comparison against a measurement, and every rubric point here needs rewriting. All three would be
  excellent news, and all three are cheap.
---

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
