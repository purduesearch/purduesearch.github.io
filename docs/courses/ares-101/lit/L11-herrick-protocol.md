---
pdfDriveFileId: PENDING_PDF_EXPORT_SEE_SOURCES_MD_NOTE_D
pdfTitle: Herrick Labs Research Protocol (ARES internal working document)
citation: SEARCH ARES team. Herrick Labs Research Protocol. Internal working document, last revised 2 March 2026. Not published; circulated within the ARES team and Herrick Laboratories.
promptText: "Read this one differently from the other ten. Every previous document in this course was a published paper - peer reviewed, fixed, and written to persuade a stranger. This is an internal working document written by your own team, it has not been reviewed by anybody outside it, and it is going to be executed. Reading a protocol critically is a different skill from reading a paper, and it is the one that matters most, because a paper you misread wastes an afternoon and a protocol you did not question wastes a subject's night. Nothing here is settled just because it is written down - the document says so itself in several places, with phrases like 'to be determined' and 'pending IRB confirmation'. Read the whole thing; it is four pages. Answer in at least 200 words and answer all four parts. First, say what the protocol controls for. Go through Section 2 and Section 3 and name the specific variables it holds fixed or measures independently, and for each one say what alternative explanation it is closing off - a control that does not rule anything out is decoration. Second, describe the measurement procedure in enough detail that somebody could tell whether a session had followed it: what the subject does, for how long, at what temperatures, and what happens before each condition. Third, identify a genuine gap - something the protocol does not control for, does not specify, or specifies in a way this course has taught you will not survive contact with the hardware. One real gap argued properly is worth far more than a list. Use the course: C21 on calibration and error propagation, C17 on sampling and flow, C16 on the sensor, C20 on what the file does and does not record, and C22 on analysis plans and confounds are all fair game, and the gap you find will probably be in one of them. Fourth, propose one change you would make before running a subject, and state the reason and the cost. A change with no stated reason is a preference, and a change with no stated cost has not been thought through. Your answer goes back to the team - this document is live, and the point of assigning it is that the next revision should be better than this one."
minWords: 200
rubric:
  - id: controls
    point: "Names what the protocol actually controls for, with the alternative explanation each control closes off, rather than listing section headings. The substantive ones - thermal control, a room with precise temperature monitoring adjustable across at least a 10 degree C range, good wall insulation, and standard office lighting only if it does not add heat to the space, which together hold the ambient half of the effective-gravity group fixed within a condition. Ventilation control, the room kept effectively closed during collection so CO2 accumulates toward a background near 400 ppm used as a stated reference condition, and flushable back to baseline between trials, which closes off the alternative that a rising chin reading is just a leaky room. Independent instrumentation, the Aranet sensors giving ambient CO2, humidity, pressure and temperature at one-minute intervals, used both to set CFD boundary conditions and to support calibration - this is the control that separates a subject effect from a room effect, and it is the most important one in the document. Calibration control, a complete recalibration of the ARES sensors at the start of every temperature condition, because NDIR response moves with temperature. Flow control, a fixed 0.5 L/min set once at calibration and not changed during testing, against a factory calibration taken at 25 degrees C, 1013 mbar and 0.2 L/min. Breathing control, isolated subject performing controlled mouth breathing rather than resting respiration, which fixes the exhalate path the CFD model assumes. And the anemometer test's own within-subject design, one minute without the headset then one minute with ARES operating, which is a paired baseline aimed squarely at the confound of the instrument disturbing the thing it measures. Geometry is also controlled loosely - a rectangular room is preferred for sensor placement and alignment with the CFD domain. Credit an answer that names four or five of these with their purposes. An answer that lists them without saying what each rules out has not made the distinction C22 draws between a baseline and a control."
    weight: 2
  - id: procedure
    point: "Describes the measurement procedure concretely enough that a reader could audit a session against it. Two tests. The anemometer test - the subject records anemometer readings for one minute with no headset to establish a baseline, then repeats the measurement with ARES operating, capturing airflow velocities at locations near the mouth, and the two conditions are compared to decide whether pump-induced draw creates a local velocity differential that needs compensating in interpretation. The CO2 collection - the subject is isolated in the chamber and records CO2 during controlled mouth breathing for approximately two to five minutes, with the exact duration depending on room size and other characteristics stated as to be determined; measurements are repeated across a range of environmental temperatures, proposed initially as 20 to 30 degrees C because Purdue safety guidelines require testing below 35 degrees C pending IRB confirmation; each temperature condition begins with a complete calibration of the ARES sensors; and multiple trials may be performed to evaluate consistency and support comparison with CFD predictions. Full credit requires the calibration-before-each-condition step and the temperature range with its reason, because those two are what the third rubric point turns on. Credit also for noticing what the instrument set is - ARES with three SprintIRs on the central facial region plus onboard battery, pumps, SD and serial logging in a backpack unit, alongside the Aranets and the anemometers."
    weight: 2
  - id: gap
    point: "Identifies a genuine gap and argues it, rather than listing several unargued. Any of the following earns full credit if it is reasoned. The strongest available, and the one this module most wants found - the protocol recalibrates at every temperature setpoint, so a comparison across temperatures is a comparison across calibrations, and per C21 the error that lands in the numerator of a rebreathed fraction is the difference between two pods' offsets. If that difference changes when the pods are re-zeroed, the between-condition effect and the between-calibration artefact arrive together and nothing separates them, and per C20 the CSV does not record which offsets were in force. Equally strong - there is no analysis plan anywhere in the document. No metric is named, no comparison is specified, no statistical test is chosen, and no result is nominated as the one that would not support the hypothesis. That is exactly deliverable 3.6.9, it is the whole subject of C22 and E08, and the protocol as written permits the outcome-driven selection 3.6.9 exists to prevent. Also strong - the calibration reference is the Aranet's ambient reading, but the subject is isolated in a closed room whose CO2 is deliberately allowed to accumulate, so the air being used as truth contains the subject's own exhalate, and the reference drifts upward over the session in the same direction as the signal. And - the fixed 0.5 L/min is asserted rather than measured; per C17 the Lee driver commands drive power in milliwatts, PUMP_HAS_FLOW_SENSOR defaults to 0, and the reported figure is a nominal estimate the app labels NOM, so no flow rate in this protocol can currently be verified, and the 0.5 L/min figure additionally does not reconcile with the 2.00 L/min pump split three ways that C17 describes. Other legitimate gaps - no sample size, number of subjects or number of trials; no order or randomisation across temperature conditions, so a fixed ascending order confounds temperature with elapsed time and with room CO2 accumulation; no settling time after a setpoint change, and changing a room's temperature requires moving air, which perturbs the plume being measured; no transport delay or T90 allowance before recording, per C16 and C17; no defined anemometer positions beyond near the mouth, so the test is not repeatable; no humidity control, though calibration and the anemometry are both humidity-sensitive; no abort criteria, no sensor-failure procedure and no data backup requirement, where deliverable 3.7.5 requires two locations immediately; and the document's own statement that the CFD model's corner outflow boundary may not be practical to replicate and is therefore not required, which is a knowing departure from the boundary conditions the study exists to validate. One further observation worth extra credit - this protocol describes a chamber study of controlled mouth breathing, and Track 3 of the deliverables is a sleep study. Those are not the same experiment, and no document in the source set describes the sleep session procedure. An answer naming a gap this course did not teach still earns the point provided it is real and argued."
    weight: 3
  - id: change
    point: "Proposes one specific change to be made before a subject is run, with both a reason and a cost. The change must be actionable - a sentence somebody could paste into the next revision - rather than a direction to be more careful. Examples that earn full credit. Record the three per-pod calibration offsets in the session log at every condition boundary, and add them as columns to the file: reason, it is the only way a between-temperature comparison can be separated from a between-calibration artefact, and per C20 nothing currently records them; cost, two lines in the log and a schema change that per C20 must be appended to the end of the CSV so no existing column index moves. Or - write the analysis plan before the first session per 3.6.9, naming the metric, the pod pair, the window, the baseline, the test, and the result that would count as not supporting the hypothesis: reason, C22's argument that with roughly 288 defensible analyses available a chosen-afterwards metric is not one test but all of them; cost, an afternoon, and the loss of the freedom to change your mind after looking, which is the point. Or - randomise or counterbalance the order of temperature conditions: reason, otherwise temperature is confounded with elapsed time and with the room's own CO2 accumulation; cost, more flushing time between trials and a longer session. Or - state a settling time after each setpoint change and after the subject enters, justified against the sensor's own warm-up and the sample line's transport delay: reason, C16 and C17; cost, minutes per condition, multiplied by every condition. Or - specify anemometer positions by measurement rather than as near the mouth: reason, repeatability across sessions and subjects; cost, a fixture. Credit any well-argued change, including one this course did not suggest. Do not credit a change with no stated cost, and do not credit an instruction to take more care."
    weight: 3
referenceSummary: |
  **This is not a paper, and the first thing to notice is what that changes.** The *Herrick Labs
  Research Protocol* is an internal ARES working document, roughly four pages, last revised 2 March
  2026, circulated inside the team and to Herrick Laboratories. It has had no external review. It is
  written to be *executed* rather than to persuade, which means it states intentions rather than
  results, and it is explicitly unfinished in places — "to be determined", "pending IRB
  confirmation", "if permitted by Herrick Laboratories", "may not be practical in the facility and is
  therefore not required". Those phrases are the document being honest, and they are also the places
  a critical reader should stop.

  **What it is for.** Section 1 restates the project's premise: in microgravity, absent
  buoyancy-driven convection, exhaled CO₂ does not disperse, transport becomes isotropically
  diffusion-driven, and a concentrated CO₂ bubble forms around the head — with the flame-in-orbit
  comparison `C12` makes. It names the physiological stakes as regional hypoxia, headaches and sleep
  apnea, and it makes the terrestrial argument: as ambient approaches body temperature near 37 °C the
  thermal gradient vanishes, the plume breaks down, and CO₂ stagnates. It then states the purpose
  plainly — Porterfield and colleagues built a CFD model of plume evolution across gravitational
  states and temperature gradients, and **the ARES headset was engineered specifically to validate
  that model**, by replicating its boundary conditions and assumptions while capturing CO₂
  concentration, local temperature, relative humidity and airflow velocity in a controlled
  environment.

  Note the terminology, because it differs from this course's. The protocol writes **HBTP** (Human
  Body Thermal Plume); `GLOSSARY.md` fixes **HTBP** (human thermal body plume). Same structure, and a
  learner should not be marked down for either, but this course uses HTBP everywhere.

  **The instruments, and what each is there for.** Three: the ARES headset itself, with three
  high-speed SprintIR CO₂ sensors along the central facial region, an onboard battery, integrated
  pumps, and both SD-card and serial logging in a backpack unit. **Aranet** sensors, giving
  independent ambient CO₂, humidity, pressure and temperature at one-minute intervals, used to
  establish CFD boundary conditions and to support calibration. And **anemometers**, recording local
  airflow velocities, both to test the CFD predictions and — the protocol says this explicitly — to
  assess whether pump-induced draws from the ARES system influence the measurements and require
  compensation. That third instrument exists to answer open question 2 from `C18`.

  **The calibration section is the most consequential page in the document.** It states that previous
  ARES trials focused on qualitative plume structure and that Herrick's controlled environment is what
  makes rigorous quantitative validation possible. SprintIRs are factory-calibrated at 25 °C,
  1013 mbar and a 0.2 L/min flow rate; ARES operates at a **fixed 0.5 L/min**, described as a balance
  between accuracy, gas-exchange efficiency and response time, set once during calibration and not
  changed thereafter. Because temperature strongly influences NDIR behaviour, **calibration is
  repeated at every environmental temperature used in the experiment**: the factory point serves as
  the reference zero, and at each new setpoint the Aranet's ambient CO₂ enables a **one-point
  calibration** so that ARES matches the true room concentration before collection begins. The
  document says this is sufficient for the present study and avoids the logistics of compressed
  gases, and notes that pure nitrogen or certified span gases would allow a full two-point
  calibration in future work — characterising linearity and temperature-dependent drift across the
  range.

  Read that against `C21` and three things follow that the protocol does not say. A one-point
  calibration fits one number and therefore corrects **offset only**; span survives untouched, which
  is precisely why deliverable 2.5.2 exists and why the document's own "future work" sentence is the
  right instinct. The Aranet is being used as the external standard, so the whole calibration chain
  now rests on the Aranet's own accuracy, and nothing in the protocol says how the Aranet is
  calibrated or how often. And most importantly: **recalibrating at every setpoint means every
  temperature condition carries its own set of per-pod offsets.** `C21`'s central result is that the
  error landing in the numerator of a rebreathed fraction is the *difference* between two pods'
  offsets, so if that difference moves when the pods are re-zeroed, a between-temperature effect and a
  between-calibration artefact arrive together — and per `C20` the CSV does not record which offsets
  were in force. This is the single best gap in the document and the one the `gap` rubric point most
  wants found.

  There is a second, subtler problem with the same section. The reference used for the one-point
  calibration is the Aranet's ambient reading, and Section 2's facility criteria require the room to
  be **closed during collection so CO₂ accumulates**. The subject is isolated in that room. So the air
  being treated as truth contains the subject's own exhalate, and the calibration reference drifts
  upward across the session in the same direction as the signal being measured. When the calibration
  happens relative to the subject entering is not stated.

  **Facility criteria.** Stable thermal control and minimal external airflow, to match the CFD
  boundary conditions. Precise temperature monitoring, adjustable across at least a 10 °C range, with
  capability to ~85 °C described as valuable for future studies but not required. Ventilation control
  is called out as especially important: effectively closed during collection so CO₂ accumulates
  toward a background near 400 ppm used as a reference condition, while still allowing a flush back to
  baseline between trials. A **rectangular room** is preferred for sensor placement and alignment with
  the CFD domain, and the walls should be well insulated. The CFD model's **outflow boundary at a
  corner of the room** is acknowledged as probably impractical to replicate and is therefore **not
  required** — a knowing departure from the boundary conditions the study exists to validate, stated
  openly, which is exactly the kind of thing a critical reader should notice and weigh rather than
  either ignore or condemn. The system is self-powered so no outlets are needed, and standard office
  lighting is acceptable provided it does not add significant heat.

  **The tests.** Two, both in Section 3, both short.

  *Anemometer tests* assess whether the ARES pump intake produces measurable airflow disturbance near
  the face. The subject records anemometer readings for one minute **without** the headset to
  establish a baseline, then repeats with ARES operating, capturing velocities near the mouth.
  Comparing the two indicates whether pump-induced draw introduces local velocity differentials
  requiring compensation in interpretation. Structurally this is a paired within-subject design and it
  is the right shape for the question. What it lacks is defined positions — "near the mouth" is not a
  coordinate, so two sessions are not comparable, and neither are two subjects.

  *CO₂ data collection* isolates the subject in the chamber and records CO₂ during **controlled mouth
  breathing** for approximately two to five minutes, the duration depending on room size and other
  characteristics "to be determined". Measurements are taken across the range of temperatures Herrick
  permits: Purdue safety guidelines require testing **below 35 °C pending IRB confirmation**, so an
  initial **20–30 °C** range is proposed, expected to reveal temperature-dependent changes in the
  plume and in CO₂ accumulation. Each temperature condition begins with a complete recalibration, and
  multiple trials may be performed to evaluate consistency and support comparison against CFD.

  Two observations about that range. It is the right decision on safety and it is also, per `C14` and
  `C22`, the reason this study cannot reach the condition it most wants: effective gravity goes to
  zero at 37 °C, and 30 °C is a partial sweep along the curve rather than a reach for its end. And
  controlled mouth breathing is a deliberate, defensible choice — it fixes the exhalate path the CFD
  model assumes, and the paper's mouth boundary condition in `C14` is a mouth — but it means the
  measurement is of controlled mouth breathing rather than of resting respiration, and any write-up
  has to say which.

  **What is not in the document at all.** No sample size, no number of subjects, no number of trials
  beyond "multiple may be performed". No order or counterbalancing across temperature conditions, so
  a fixed ascending sweep confounds temperature with elapsed time and with the room's own CO₂
  accumulation. No settling time after a setpoint change — and changing a room's temperature means
  moving air, which perturbs the plume being measured. No transport-delay or T90 allowance before
  recording (`C16`, `C17`). No humidity control, though both the NDIR correction and the anemometer
  calibration are humidity-sensitive — `zhou2024` puts the latter at up to 1.2676 % per %RH. No abort
  criteria, no sensor-failure procedure, no data-backup requirement, where deliverable 3.7.5 requires
  two locations immediately after every session. And, most importantly, **no analysis plan**: no
  metric named, no comparison specified, no test chosen, and no statement of what result would fail to
  support the hypothesis. That is deliverable 3.6.9, and `E08` is where the learner writes the missing
  page.

  One structural observation worth crediting generously if a learner makes it: **this is a chamber
  study of controlled mouth breathing, and Track 3 of the deliverables is a sleep study.** Those are
  not the same experiment, and no document in the course's source set describes the sleep-session
  procedure. Whether this protocol is meant to become that, or to sit beside it, is a real open
  question.

  **How to grade this section.** The document is a good-faith working draft by the learner's own team
  and it is going to be revised, so an answer that reads it generously and criticises it precisely is
  the target. Reward specificity and reasoning over volume: one gap argued through the hardware beats
  five listed. Reward a learner who quotes the protocol's own hedges back — "to be determined",
  "pending IRB confirmation", "not required" — because noticing where a document already knows it is
  incomplete is most of the skill. Do **not** reward a learner who treats it as a bad paper. It is not
  a paper. It is the thing a paper is made out of, and the reason it is assigned is that the next
  revision should be better than this one.
---

## Annotated bibliography

Short, by the rule in `lit/SOURCES.md`: nothing is cited until it has been resolved and read.

### SEARCH ARES team. *Herrick Labs Research Protocol*. Internal working document, last revised 2 March 2026.

The assigned reading, and **you are being asked to read all of it** — it is about four pages, in four
parts: an introduction and research objectives, an experimental setup section covering materials,
calibration and facility criteria, and a testing section with two procedures.

Read it in file order; it is short enough that there is no reading strategy to give you. What there is
instead is a **reading posture**, and it is the point of the section:

1. **Section 2, "Calibration", is the highest-value page in the document.** Read it twice, with `C21`
   open. Every rubric point except `procedure` touches it.
2. **Read every hedge as a live question rather than as filler.** "To be determined", "pending IRB
   confirmation", "if permitted by Herrick Laboratories", "may not be practical … and is therefore not
   required". Four of those, in four pages, and each one is a decision that has not been made.
3. **Ask of every control: what would this rule out?** `C22` separates a baseline from a control on
   exactly that test, and the protocol contains both without distinguishing them.

### `C22`, and deliverable subtask 3.6.9

**Where the missing page is specified.** The protocol has no analysis plan; 3.6.9 requires one and
says why; `C22` explains the reasoning the deliverable only asserts; `E08` makes you write it. If you
do `E08` before this review, the `gap` and `change` points will take ten minutes.

### `C21`, and `C20`'s "NVS" section

**Where the calibration critique comes from.** `C21` gives offset versus span, why a single-point
calibration fixes only one of them, and the result that the error in a difference is the *difference*
of the two pods' biases. `C20` supplies the other half: the offsets persist in NVS, they are applied
to every reading before it is logged, and **the file does not record which ones were in force**. Put
those two together with "calibration must be repeated at each environmental temperature" and the gap
writes itself.

### `C17`, for the flow rate the protocol asserts

The protocol fixes 0.5 L/min. `C17` establishes that the Lee driver commands **drive power in
milliwatts**, that `PUMP_HAS_FLOW_SENSOR` defaults to 0, and that the reported litres-per-minute figure
is a nominal estimate the app is required to badge `NOM` rather than `MEAS`. So the flow rate in this
protocol is currently an intention, not a measurement — which is the exact failure mode `C17` says the
badge exists to prevent.

### `ARES_HTBP_Testing_Protocol.docx` — a *different* document, in the Drive `Papers` tree

**Not the assigned reading**, and worth naming so nobody grades against the wrong file. `SOURCES.md`
note C records that the plan's working title for this section, "Herrick Lab Testing Protocol", is not
the document's real title, and that `ARES_HTBP_Testing_Protocol.docx` is a separate document. If your
copy has that filename, you have the wrong one.

## Synthesis

### Why the last document in the course is not a paper

Ten `LIT_REVIEW` sections have handed you published work: Dutta twice, Fabregat, Herbig, Sanders,
Deming, Zhou, Campbell, Toptsis, Martin. Every one of those was peer reviewed, finished, and written by
strangers to persuade other strangers. You read them to extract a claim, check a method, and decide
how far a result travels.

This one is your own team's plan for what happens in a room, and it is going to be carried out.

That inverts the whole relationship. A published paper is a **fixed object you are trying to
understand**; you cannot change it, and being wrong about it costs you an afternoon. A protocol is a
**draft you are being invited to improve**, it will be executed on a person, and being wrong about it
costs a subject's session — and, because the flaw is usually in the design rather than in the
execution, costs it in a way nobody discovers until the analysis.

Three habits follow, and they are the section's real content.

**Read for what is missing, not for what is claimed.** A paper's gaps are usually in its discussion
section, hedged and visible. A protocol's gaps are silences. There is no sentence in this document
saying "we have not decided how many subjects", because a document does not usually announce what it
does not contain. The missing analysis plan is the loudest silence here and it is invisible on a first
read, because nothing draws attention to it.

**Trace every assertion to whether the instrument can honour it.** "We maintain a fixed flow rate of
0.5 L/min" is a perfectly reasonable sentence that this course has already taught you to challenge:
`C17` says the pump is commanded in milliwatts and that no flow sensor is fitted, so the sentence
describes an intention. That is not a criticism of whoever wrote it. It is what happens when a document
about *what we will do* is written beside a system that is still being built, and catching it is
precisely why a protocol should be read by somebody who knows the hardware.

**Read the hedges as the agenda.** "To be determined", "pending IRB confirmation", "if permitted",
"not required" — four in four pages. Each one is an open decision, and a document is being unusually
honest when it marks them. The right response is to ask who is going to close them and by when, not to
treat the phrase as boilerplate.

### The one thing this protocol gets conspicuously right

It is worth saying, because the assignment is critical and the document deserves better than to be
read as a list of faults.

**The anemometer test is a genuinely good piece of experimental design.** One minute without the
headset, then one minute with it, on the same subject, in the same place. That is a paired
within-subject comparison aimed directly at the confound that the instrument disturbs the thing it is
measuring — and it is exactly open question 2 from `C18`, which the 7/30 deck left unanswered and
`E04` attacks on paper. Somebody thought about how the apparatus could fake its own result and built
the control that detects it, in three sentences.

Hold that up against the rest. A team capable of designing that test is capable of writing the missing
analysis plan; it simply has not been asked to yet. Which is what `E08` is for, and what your review
goes back to the team to prompt.

### A note for whoever maintains this file

Everything here is graded against a **living internal document**, which makes this the most
drift-prone lit review in the course by a wide margin. Three specific fragilities:

- **The rubric quotes the protocol's own numbers** — 0.2 and 0.5 L/min, 25 °C and 1013 mbar, 20–30 °C,
  below 35 °C, one to two minutes and two to five minutes. If the protocol is revised, re-read all four
  rubric points against it and fix them in the same commit.
- **The `gap` and `change` points are graded partly against ARES rather than against the document.** If
  the offsets ever get logged to the CSV, if a flow sensor is fitted, or if an analysis plan is added to
  the protocol, the best answers to both points stop being available and the rubric must be rewritten.
  That would be excellent news.
- **If the protocol is superseded by a sleep-session procedure**, this section should be reassigned to
  that document rather than kept on a chamber protocol nobody is running. The reading skill this
  section teaches transfers unchanged; only the file does not.

**Sharing and availability.** `SOURCES.md` note D records the problem: the document is
`application/vnd.google-apps.document`, a native Google Doc rather than a PDF, it is owned by another
account, and it sits outside the `Papers` folder. Both consequences bite. `drive.google.com/file/d/<id>/preview`
is the wrong URL form for a native Doc, so the existing id will not render in a `LIT_REVIEW` pane the
way a PDF id does; and the sharing setting is not the team's to change. The fix is one step that
resolves both — **export it to PDF and upload that PDF to `Papers`**, as an export rather than a copy so
the original stays its owner's working document. Until that happens, `pdfDriveFileId` above is a
deliberately unmistakable placeholder rather than a plausible-looking wrong id, on exactly the reasoning
in `SOURCES.md` notes G through I: `readLitConfig()` only checks that the field is non-empty, so a fake
that looks like an id fails silently in front of a learner months later, and a fake that cannot possibly
be an id fails visibly to whoever next reads this file. The module seeds; the rubric and reference
summary are installed and will grade correctly the moment the real id lands.
