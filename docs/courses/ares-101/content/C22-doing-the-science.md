# C22 — Doing the science

> CONTENT section · ARES 101 · M11 · ~5 min read
> Seeded into `contentJson` as rich text. This module closes the course and assumes all ten before it:
> the plume from `C13`, the model's prediction from `C14`, the exposure tiers from `C15`, the sensor
> from `C16`, the sampling loop from `C17`, the anemometers from `C18`, the models from `C19`, the data
> contract from `C20`, and — most of all — the error budget from `C21`.
> Two things in here are rules rather than material: the analysis plan comes before the data, and no
> session runs on an enrolled human subject before written IRB approval is in hand. Everything else is
> the reasoning behind them.

---

## The module that decides whether any of it counted

Ten modules have been about producing a number you can defend. This one is about the thing that
happens after: turning a set of defensible numbers into a claim about the world, and doing it in a way
that somebody who does not trust you can check.

That is a different skill and it fails in a different way. A miscalibrated sensor produces a wrong
number, and `C21` showed you how to find it. A badly designed study produces a *right* number in
answer to a question nobody asked, or a number that was always going to come out that way, and there
is no instrument you can point at it afterwards.

The good news is that almost all of the protection is procedural and almost all of it is free. It just
has to happen in the right order.

## The rule: the analysis plan is written before the data exists

The deliverables document already requires this. Subtask **3.6.9** says:

> *Define the data analysis plan before running experiments: specify which CO₂ metrics will be
> extracted, how spatial distribution will be quantified, and what statistical comparisons will be
> made.*

with a one-line note underneath it:

> *↳ Pre-defining the analysis plan prevents outcome-driven data selection after collection.*

That note is correct and it is an assertion. It tells you the rule and not the reason, and a rule you
have been told but not shown is a rule you will break the first time it is inconvenient. So here is
the mechanism.

### Why it is not a rule about honesty

The instinctive reading of "outcome-driven data selection" is that it is about cheating — somebody
looked at the data, found the answer they wanted, and reported that one. Cheating certainly exists. It
is not what this rule is for, and treating it as an anti-cheating measure is why people think it does
not apply to them.

The rule is about the fact that **you cannot tell the difference afterwards, including from the
inside.**

Count the analyses available from one sleep session. The headset writes 30 columns every five seconds
across three pods, for eight hours. Before you have made a single dishonest choice, you have:

- **Which pods.** Chin minus top, chin minus forehead, forehead minus top — three defensible pairs.
- **Which statistic.** Mean, median, peak, 95th percentile, ppm·hours, time above a threshold,
  rebreathed fraction — call it six.
- **Which window.** The whole night, the first hour, the deepest hour, supine-only intervals — four.
- **Which baseline.** Pre-session upright, the subject's own earlier night, another subject, the
  ambient reference — four.

Three times six times four times four is **288 comparisons**, and every one of them is something a
competent person could argue for in good faith. Now the arithmetic that matters. If you run twenty
genuinely independent comparisons on data where nothing is going on, and you call `p < 0.05`
significant, the probability that at least one comes out significant is

```
1 − 0.95²⁰ = 0.64
```

**Sixty-four percent.** Not because anyone cheated. Because you asked twenty questions of noise and
noise answers. Choose the metric after seeing the data and you have not run one test, you have run all
288 and reported the winner, and nothing in the write-up records that you did — because from where you
are standing it genuinely felt like one analysis.

A plan written in advance converts that from an invisible property of your judgement into a visible
property of a document. It does not make you honest. It makes your honesty **checkable**, which is a
much more useful thing for it to be.

### The part of the plan that does the work

Everything in 3.6.9 is necessary. One thing not in 3.6.9 is what makes the rest of it mean anything,
and it is the point of this module's exercise:

> **State, before you look, what result would count as *not* supporting the hypothesis.**

If the hypothesis is "the CO₂ bubble forms around a supine sleeping subject", write down the number
that would have to come back for you to say it did not. Chin-minus-top below some value. A rebreathed
fraction indistinguishable from the upright baseline. No monotonic trend with room temperature.
Whichever it is, write the threshold and write it first.

Two things happen when you do. You find out immediately whether your instrument can even resolve the
distinction — and after `C21` you know that a 130 ppm calibration difference sitting on top of a 50 ppm
control signal means the answer is sometimes *no*. And you discover whether you have a hypothesis at
all, because a claim with no possible negative result is not a hypothesis, it is a description of
whatever happens.

**A plan with no possible negative result is not a plan.** `E08` makes you write one.

## Controls, baselines, and confounds

Three words that get used interchangeably and should not be.

A **baseline** is the same thing measured under the reference condition, so you can report a change.
For ARES that is usually within-subject: the same person, same headset, same calibration, upright in a
cool room, half an hour before the session.

A **control** is a condition included specifically to rule out an alternative explanation. It is not
about reporting a change — it is about closing a door. If room CO₂ climbs all night in a closed
chamber, then chin CO₂ climbing all night is explained by the room, and the control that closes that
door is the independent ambient measurement.

A **confound** is anything that varies alongside the thing you are manipulating, so that its effect and
your effect arrive together and cannot be separated after the fact.

This project has a specific list, and four of them are sharp enough to be worth naming.

**The room fills up.** The Herrick protocol deliberately keeps the space closed so CO₂ can accumulate
toward a background near 400 ppm and be used as a reference condition. That is a sensible control on
ventilation, and it makes ambient CO₂ a function of how long the subject has been in the room. Any
metric that is an absolute concentration inherits that trend. Any metric that is a *difference between
pods* mostly does not — which is one more reason `C13`'s formula is a difference, and one more reason
the top pod has to be an honest reference.

**Temperature moves the sensor as well as the plume.** `C14`'s effective-gravity collapse means warming
the room is how you simulate low gravity at 1g, so temperature is the independent variable of the whole
experiment. It is also, from `C16` and `C18`, a direct input to the NDIR reading and to the anemometer
calibration. The manipulation and the instrument error are the same knob. The only defence is to
recalibrate at every setpoint, which the Herrick protocol does, and which creates the next one.

**Recalibrating between conditions makes the conditions non-comparable.** This is the nastiest confound
in the project and it is a direct consequence of `C21`. A one-point calibration at each temperature
setpoint sets a new per-pod offset at each setpoint. So a comparison across temperatures is a comparison
across *calibrations*, and any drift in the offset difference between the chin and top pods lands
directly in the numerator of every rebreathed fraction. The fix is not to stop recalibrating — it is to
**record every offset with every session**, which `C20` says the file currently does not do. Two lines
in the session log close it.

**The subject knows.** A person wearing a research device, in a lab, being measured, breathes
differently. Mouth-breathing on command, which is what the Herrick CO₂ protocol asks for, is not
resting respiration. That is a legitimate design choice — it controls the exhalate path, which the CFD
model assumes — and it also means the measurement is of controlled mouth breathing rather than of
sleep, and the write-up has to say which.

## Human-subjects research

The moment a person is enrolled, this stops being an engineering project with a volunteer in it.

### Belmont, in the terms this study actually faces

The Belmont Report gives three principles, and each one turns into something concrete here.

**Respect for persons.** The subject decides, with enough information to decide, and can stop at any
moment without explaining. On an overnight sleep study, "at any moment" has to be operationally real —
somebody the subject can reach at 03:00, and a way out of the headset that does not need a second
person.

**Beneficence.** Minimise harm, and be specific about what the harms are rather than concluding there
are none. ARES does not add CO₂ to anybody, so the exposure risk is the room's, not the device's. What
the device does add is: a mass on the head during sleep, tubing near the face, skin contact for hours,
a warm environment at elevated setpoints, and disrupted sleep in a study whose subject is sleep. Purdue
safety guidance already caps this at **below 35 °C pending IRB confirmation**, which is why the Herrick
protocol proposes an initial 20–30 °C range.

**Justice.** The people who bear the burden should be drawn fairly and should be among those who stand
to benefit. On a university team the failure mode is not exotic, it is convenience: enrolling the same
four people who are already in the room every Tuesday, which is both a justice problem and a
statistical one.

### Consent is a process, not a form

The form records that the conversation happened. It is not the conversation.

Two things about this project make the process version matter more than usual. The first is that the
risks are cumulative and boring rather than dramatic — nobody is going to be alarmed by "you will wear
a headband", and the discomfort that actually ends sessions shows up at hour four. The second comes
straight from `C15`: **adaptation blunts the subjective signal.** Astronauts reported not realising CO₂
had been elevated until the scrubbers came back on. So "tell us if you start to feel unwell" is a
monitoring plan built on an instrument this course has already taught you to distrust. It belongs in
the protocol, and it cannot be the only thing in it.

### Why review takes four to eight weeks, and cannot be compressed

Because it is not a queue you can pay to skip. An IRB is a committee with a meeting schedule, a
submission window before each meeting, and a workload; a full-board study waits for a meeting, and a
revision request sends it back around. Typical review cycles at Purdue run **4–8 weeks**, and the
deliverables document is explicit that revision requests add more.

Two consequences the summer plan already encodes. Subtask **3.6.1** notes that ARES 2 validation
(Deliverable 5) should be complete before submission, because the board will want to know the device
has been tested for safety and comfort — so hardware validation is not parallel to the IRB, it is
upstream of it. And **3.6.2** assigns one named person to watch the portal and respond within 48 hours,
because the one part of the timeline the team controls is its own latency.

### The hard rule

Subtask **3.7.1** is the first line of the session-execution deliverable, and it is worth stating in
the plainest available form:

> **No session with an enrolled human subject may take place before written IRB approval is in hand.**
> Not "approval is expected". Not "the reviewer said it looks fine". In hand, in writing, before
> scheduling.

This is not a formality that a sufficiently careful team can reason its way around. Data collected
without approval cannot be analysed, cannot be published, and cannot be retrospectively approved; it is
not a fast start, it is a session that did not happen, plus a serious institutional problem for the
advisor whose name is on the protocol.

What *is* allowed, and is how the work keeps moving, is everything that is not a human subject in the
regulatory sense. Bench work, the mannequin, and the team's own dry runs — subtask **3.6.6**'s full
setup rehearsal with a non-enrolled team member, and **2.5.10**'s explicitly non-IRB lab wear session —
all proceed now. One caution, though: **whether an activity counts as human-subjects research is the
IRB's determination, not the team's.** The safe path when a "quick test on a friend" starts to look
like data you might want to show somebody is to ask the office, in writing, before you take it.

## Analog environments, and what each one is analogous to

You cannot rent microgravity. Every environment in this project is a partial substitute, and the useful
question about each is not "is it like space" but **which specific term is it reproducing.**

| Analog | What it reproduces | What it does not | What it is good for |
|---|---|---|---|
| **Cave** (Mammoth, with SEARCH) | Ventilation-poor volume, extended duration, elevated and stratified ambient CO₂, a real field environment | Buoyancy loss — it is 1g and cold, so `ĝ_eff` is at its maximum | Instrument-in-the-field validation, and accumulation in an unventilated space |
| **Supine sleep** (Herrick) | Posture: a lying body's plume leaves the chest rather than sweeping up past the chin, so `C13`'s breathing envelope is disrupted | Anything about gravity itself. The plume is weakened and redirected, not removed | Long-duration exposure in a controlled room, and the sleep-apnea application |
| **Breathing mannequin** | The full physiological range — tidal volume, rate, exhaled concentration — swept at will | A person. No metabolism, no skin temperature field, no HTBP | Anchoring the CFD model against something whose input is *known exactly*, with no consent form |
| **37 °C thermal** | `ĝ_eff` itself. Per `C14`, gravity and ΔT enter as a product, so a body-temperature room zeroes the same group microgravity zeroes | The rest of microgravity, and it introduces heat stress as its own confound | The only Earth condition that reproduces the mechanism rather than a symptom |

Read the last two rows together, because they contain the project's central scheduling irony. The
mannequin needs no approval and is available today. The 37 °C condition is the one that actually
reproduces the physics — and Purdue safety caps testing below 35 °C pending IRB confirmation, so the
condition this whole project is built to test is the one furthest from being run. The near-term path is
therefore the one `C14` already described: **the mannequin comes before the person**, and it is
characterisation you can do while approval is pending rather than a consolation prize.

---

## Current state: four tracks, two blockers, three workarounds

### The four tracks

`ARES_CO2_Headset_Summer2026_Deliverables.docx` organises everything between **11 May and 19 August
2026** into four parallel tracks and eight deliverables, with a stated priority order:

> **(1) SA2TP Cave Tests → (2) Finalize ARES 2 → (3) Sleep Experiments → (4) EEG Implementation**

| # | Deliverable | Track | Window |
|---|---|---|---|
| 1 | ARES 1 hardware and software preparation | Cave | 11 May – 30 May |
| 2 | Cave deployment, analysis, Parks Service engagement | Cave | 2 Jun – 18 Jul |
| 3 | ARES 2 electronics design and sensor procurement | ARES 2 | 11 May – 20 Jun |
| 4 | ARES 2 assembly and sensor integration | ARES 2 | 16 Jun – 18 Jul |
| 5 | ARES 2 testing and validation | ARES 2 | 7 Jul – 8 Aug |
| 6 | Sleep experiments: IRB approval and lab setup | Sleep | 11 May – 18 Jul |
| 7 | Sleep experiments: session execution and analysis | Sleep | 21 Jul – 15 Aug |
| 8 | EEG implementation (planning and feasibility) | EEG | 1 Aug – TBD |

**Track 1 — the cave.** ARES 1 gets a new sewn backing, control-system bugfixes, and a written field
procedure, then goes to Sam Waymire, the SEARCH Astronaut Training lead, for deployment. The 7/30 deck
describes the partnership as sending members into **Mammoth Cave** to produce a 3D airflow and CO₂ map,
and as extending to exercise and HTBP experiments and to the funding and recruitment pipeline. Note a
schedule discrepancy worth resolving rather than smoothing over: the deliverables document runs the
cave deployment 2 June – 18 July, and the 7/30 deck says the SEARCH partnership goes into the cave **in
the Fall**. Both are project sources and they do not agree; ask before you plan around either.

The design decision to notice in Track 1 is that the deliverable is a *procedure*, not a data set.
1.1.5 and 1.1.6 require a document good enough that Sam can run the device without on-site engineering
support, and a full dry run to prove it. That is what field work costs: on a device you can support in
person, the procedure is a convenience; on one you cannot, it is the instrument.

**Track 2 — ARES 2.** Everything `C16` through `C21` describes as "current state" is this track. Three
SprintIRs, an oxygen channel, the CTA circuits, the intake handover from the capstone team, and then
Deliverable 5's five-dimensional validation: accuracy against a certified reference gas (2.5.2), T90
(2.5.5), battery life, drop test, and a 30-minute wear assessment. The rule attached to it is worth
reading twice — *do not proceed to sleep experiments with unresolved validation failures*, and the
device must pass every HIGH-priority check before it is used on any human subject.

**Track 3 — the Herrick sleep study.** The IRB application, the lab booking, the procedure document,
the consent materials, and then the sessions themselves. The protocol for the room is `L11`'s reading.

**Track 4 — EEG.** Scoped as planning and feasibility only, and correctly so. See *What's next*.

### The two live blockers

Slide 16 of the 7/30 deck is titled *Current blockers*, and says two items are gating progress toward
participant testing.

**IRB approval and trainings — in progress.** Human-subjects review is required before collecting
participant breath and biometric data; the required research-ethics training modules were still being
completed; the study protocol and consent materials were under preparation.

**Component ordering — delayed.** Long lead times on key sensors and circuit components, orders
**repeatedly cancelled or misplaced**, and procurement delays pushing assembly and bench testing.

The deck's own summary: *finish the IRB training modules and secure approval, and lock in suppliers and
place orders for long-lead parts in parallel.*

Put those two next to the table above and the honest reading is uncomfortable. The session-execution
window opened on **21 July**. The blocker board on **30 July** still had IRB approval in progress. That
is a schedule that has either compressed or moved, and this file records the state of the sources
rather than guessing which — but a new member should know that the summer's headline deliverable was
gated on a review nobody on the team controls the clock of, which is exactly why 3.6.1 says to submit
as early as possible and 3.6.2 says to answer the reviewers within 48 hours.

### The three workarounds

Slide 17 records what the team is doing about the procurement half, and they are worth stating with
their costs attached, because a workaround with an unstated cost is how the next problem gets made.

**Repurposing the ARES 1 SprintIRs.** Parts already in hand beat parts on order, and this is the
fastest route to three working CO₂ channels on ARES 2. The cost is that it takes them out of ARES 1,
which is **Track 1's device and the summer's top priority**, field-bound and needing to be
demonstrably working before handoff. One thing to check before anybody unscrews anything: `C16` records
that the SprintIRs *replaced* the SenseAir S8/S88 parts ARES 1 used, while slide 17 refers to the ARES
1 SprintIRs. Either ARES 1 was retrofitted or one of those statements is loose, and which one is true
decides whether this workaround costs the cave deployment its instrument.

**Placing challenging orders through the capstone team.** The capstone team has an established
purchasing route and is already handing ARES 2 over under 2.4.1. Using their quotes gets around orders
that keep getting cancelled. The cost is a dependency on a group that **disperses at the end of its
term** — which is exactly why 2.4.1 says to get the CAD, the schematics, the firmware source and the
known-issues list *before* they go, and why a procurement path that runs through them needs an expiry
date written next to it.

**External funding.** Slide 7 names streamlining the funding and recruitment pipeline as part of the
SEARCH collaboration. Money solves lead time only where lead time is a money problem; it does nothing
about a part with a twelve-week queue.

None of the three is a bad call. All three are the correct response to a real constraint. What makes
them worth writing down in a course is that **a workaround changes the experiment**, and the change is
invisible unless somebody records it: a repurposed sensor arrives with a calibration history nobody
wrote down (`C21`), and a part substituted for availability is a part whose datasheet nobody re-read.

---

## What's next

**The EEG roadmap.** Track 4 is deliberately scoped as planning and feasibility — eight subtasks,
none of them an implementation task. Define what neural signals are actually relevant to CO₂ exposure
and sleep state; evaluate dry-electrode consumer systems against clinical wet-electrode ones for a
headset that already occupies the forehead and crown; consult on electrode placement that does not
collide with the pods; determine whether EEG needs an amendment to the sleep-study IRB or a fresh
submission; sketch how two independent devices get a common clock. **The deliverable is a written
roadmap, not a demo**, and that is the right shape: an EEG channel bolted on before anyone has decided
what question it answers produces a second stream nobody can interpret next to the first.

Note that the clock question is `C20`'s question again, one device further out. Two instruments with
independent free-running clocks produce two files that cannot be aligned after the fact, and the fix is
the same one the headset already uses — one device that knows the wall clock, and monotonic
interpolation from there.

**Publishing.** Subtask **3.7.11** names a summary suitable for a conference abstract or an internal
research report, with representative figures, and does not name a venue. The one conference this
project's own sources name is **ICES**, the International Conference on Environmental Systems — both of
the NASA papers on slide 18, `sanders2026` and `campbell2026`, are ICES-2026 numbers, and it is where
this class of work is presented. ASGSR is the obvious second candidate for gravitational-biology
results and **no project document names it**, so if you hear it proposed, that is a decision somebody
still has to make rather than a plan already in place.

**Where this goes beyond spaceflight.** Slide 10 of the `ARES_CO2_Presentation` deck is the answer to
"why should anyone outside this field care", and it is worth knowing because you will be asked. Every
one of these follows from the same mechanism: **bulk measurement misses face-level exposure, and the
plume that normally protects you can be removed by posture, by heat, or by confinement.**

- **Sleep apnea.** Horizontal posture weakens the HTBP, so CO₂ may accumulate near the face in ways
  resembling microgravity, and the model predicts rebreathing events that could trigger apnea episodes.
  ARES-style sensing could identify high-risk sleeping positions. This is also the application the
  Herrick study is closest to.
- **Automotive cabins.** Small sealed volumes, and drowsy driving is linked to elevated cabin CO₂.
  Occupant-level rather than bulk-cabin measurement is what a responsive ventilation system would need.
- **Athlete and fitness monitoring.** Breathing rates surge under load and face-level CO₂ dynamics
  change with them; wearable measurement could inform training and recovery.
- **Heat stress and climate.** The one to lead with. The Porterfield model says a 37 °C ambient
  collapses the HTBP at full Earth gravity, so every population that already averages body temperature
  in its hottest months is, respiratorily, in the same regime as an astronaut. This is not a
  speculative extension — it is the same simulation.
- **Submarines and confined spaces.** Submariners, miners, and pilots in cockpits, where fixed sensors
  miss face-level peaks and the operational stakes are high.
- **Clinical respiratory monitoring.** ICU, anaesthesia recovery and COPD monitoring lean on bulk air
  and SpO₂ proxies; face-level CO₂ is a more direct view of gas exchange.

**And the thing this course was actually for.** Every one of those applications is a claim, and each
one is only worth as much as the measurement behind it. Which brings the eleven modules back to one
sentence: the reason to know how a plume forms, how an NDIR sensor quantises, how far a sample line
delays a step, and why two pods must be calibrated separately is that **somebody is eventually going to
ask you how you know**, and the only good answer is the one you can walk them through.

---

**Sources.** The analysis-plan requirement and its rationale note, the four tracks, the eight
deliverables and their windows, the stated priority order, the IRB rule, the 4–8 week review estimate,
the 48-hour reviewer-response assignment, the ARES-2-validation-before-submission note, the dry-run and
non-IRB wear-session subtasks, the conference-abstract subtask, and the EEG track's eight planning
subtasks: `ARES_CO2_Headset_Summer2026_Deliverables.docx` — §3.6.9 and its sub-bullet, §3.7.1, §3.6.1,
§3.6.2, §3.6.6, §2.5.10, §3.7.11, §§4.8.1–4.8.8, Deliverables 1–8 and the timeline summary table.
Current state — the Mammoth Cave partnership with the SEARCH Astronaut Training team, Sam Waymire, the
3D airflow and CO₂ map, and the funding and recruitment pipeline: `ARES_7_30_26.pptx` slide 7. The two
blockers, their status, and the "what unblocks us" line: slide 16. The three workarounds: slide 17. The
two ICES 2026 papers and the mannequin-first argument: slide 18, drawing on Campbell et al.,
ICES-2026-499 and Sanders et al., ICES-2026-75 (`lit/SOURCES.md`, `campbell2026`, `sanders2026`).
Applications beyond spaceflight, in all six categories: `ARES_CO2_Presentation (1).pptx` slide 10. The
closed-room reference condition, the recalibration at each temperature setpoint, the controlled
mouth-breathing procedure, the 20–30 °C proposed range and the Purdue below-35 °C safety guidance:
*Herrick Labs Research Protocol*, §2 "Calibration" and "Facility Criteria" and §3 "CO₂ Data Collection"
(`lit/SOURCES.md`, `herrick2026`) — this module's `LIT_REVIEW` document, read critically in `L11`. The
effective-gravity collapse that makes a 37 °C room an analog: `C14`. Adaptation blunting self-report,
and the exposure tiers: `C15`. The SprintIR-replacing-SenseAir note underlying the workaround
discrepancy: `C16`. The offsets not being recorded in the file: `C20` and `C21`. The 288-comparison
count and the `1 − 0.95²⁰` figure are worked arithmetic on this project's own data shape, not a quoted
result.
