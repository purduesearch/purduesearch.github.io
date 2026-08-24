---
pdfDriveFileId: 1OzdK0KPj9i87jCsERj-UPJKayFQvmgXq
pdfTitle: In-suit CO2 Washout Test System (ICWTS) for CO2 Washout Verification in Spacesuits (Campbell et al., ICES-2026-499)
citation: Campbell, C., Whalen, P., Christensen, L., Sanders, I., & Watson, C. (2026). In-suit CO₂ Washout Test System (ICWTS) for CO₂ washout verification in spacesuits. ICES-2026-499. 55th International Conference on Environmental Systems, Rio Grande, Puerto Rico, 12-16 July 2026.
promptText: NASA has been measuring the same physical quantity inside a spacesuit that ARES measures on a head, and has been at it since Gemini. This paper is their current answer. Read it and answer in at least 250 words. First, explain the difference between a Flow Weighted Average and a Time Weighted Average of inspired CO2, and say in your own words why the distinction is physiologically meaningful rather than a bookkeeping preference. Then read Section IV before you recommend porting it, and say what the authors actually concluded about the flow sensor they built to make FWA possible - what failed, what the data reduction showed, and what they recommend deploying instead. Second, describe the breath detection problem. Say what the NESC found wrong with the previous method, what specifically corrupts an in-suit CO2 waveform, and what a learned breath detector does that a fixed elapsed time or a threshold does not. Connect that to C19's finding that the ARES respiration model cannot output zero. Then state the authors' own caveat about how their detector behaved at resting metabolic rates and what caused it. Third, describe the mannequin-first validation strategy from Figure 4 - what IRMA is for, what the human-in-the-loop testing is reduced to, and what job the CFD model does at the end of the chain. Say why that ordering is the right one when human subjects are the scarce resource. Fourth, and this is the part that is really being asked: pick one method from this paper that ARES should port, and specify what it would require - hardware, a sensor ARES does not have, a change to the data contract, a validation step, or all four. Be concrete. Finally, name one thing about this system that makes a direct comparison to ARES unfair, in either direction.
minWords: 250
rubric:
  - id: fwa
    point: Gets flow weighting right, and then reads Section IV. A Time Weighted Average averages inspired CO2 over clock time. A Flow Weighted Average is, in the paper's own words, basically a convolution of the flow and the measured inspired PPCO2, so each moment of the CO2 trace is weighted by how much gas was actually moving into the subject at that moment. The physiological argument is the one C13 already makes - what loads the blood is the CO2 in the gas you actually inhale, so a time average charges the subject equally for gas that was never breathed, and it does so most badly exactly when the waveform is least square. Full credit requires the second half. The authors built the MG-220 mouthguard with a bi-directional mass flow anemometer specifically to enable FWA, and Section IV reports that those flow sensors were especially sensitive to moisture in the flow path and had to be frequently replaced during the test series, that post-test data reduction confirmed a baseline measurement gave a similar and acceptable result to the FWA computed from the flow sensors, and that the benefit does not offset the materials and labor costs or the difficulty of deploying to the community at large. All three of the deployable configurations in Table 3 use the baseline method and none carries a flow sensor. A learner who recommends porting FWA without noticing that NASA de-scoped it has read the abstract and not the paper. Credit a learner who notices the third definition too - baseline here means 20 to 80 percent of the inspiratory trough as set by the inflection points in the PPCO2 trace, which is a definition ARES does not currently have any equivalent of.
    weight: 3
  - id: icarus
    point: Describes the breath detection problem and what a detector buys. The NESC finding was the reliance on a fixed elapsed time to obtain the desired breath count. The failure mode is that the CO2 waveform does not reliably look like the expected pseudo-square wave with a clear baseline on inspiration - the paper lists a poor performing suit, low ventilation flow, excessively high metabolic rates with the associated minute volumes, pressure pulses from pressure-volume work against the suit, and poor subject to suit indexing. The answer was a neural-network breath recognition model, trained on breaths from several suited tests, that identifies each breath as it happens and counts up in real time so the team can confirm 60 breaths with a 30 breath minimum for a test point, those counts having been set by the NASA and SME community to lower the standard deviation. The structural point, and the one that matters most for ARES, is that a detector counts events in time whereas a transform integrates over a window - so a detector can report zero breaths and an FFT cannot, which is exactly C19's finding that the ARES respiration model's lowest possible output is 6.09 BrPM. Full credit requires stating the authors' own caveat honestly: the algorithm, while acceptable, tended to over-represent the number of good breaths captured, specifically at resting metabolic rates, and the cause was traced to the 6 ACFM ventilation being more than adequate for the reduced minute volume and interfering with sampling of the inspiratory flow, given a side-stream sample port sitting about an eighth of an inch proud of the oral entry plane. A learned model inherits the geometry of the rig that trained it. Credit a learner who draws the conclusion that ARES cannot simply download ICARUS - it would have to train its own on its own pod geometry.
    weight: 2
  - id: mannequin
    point: Describes the validation chain in Figure 4 and says why it is ordered that way. The In-suit Respiration Mannequin Assembly sweeps the physiological range - breaths per minute, tidal volume, end-tidal CO2, breathing pattern - because a mannequin can be commanded to any combination of those and held there, whereas a human subject cannot. Human-in-the-loop testing is reduced to a small number of discrete point verifications rather than being the primary data source. The CFD model is then developed and correlated against the mannequin data and used to carry the result to conditions nobody can test on the ground - gas composition from air to oxygen, absolute pressure scaling, and g-field from 1g to partial and micro gravity. Full credit says why the ordering is right: human subjects are the scarce, slow, ethically constrained and least repeatable element, so they are spent on verifying a model rather than on mapping a space. Credit a learner who connects this to ARES's own situation, where C14 argues for exactly the same mannequin-first sequence and where the immediate motivation is that it keeps characterisation moving while IRB approval is pending.
    weight: 2
  - id: port
    point: Names one method and specifies concretely what adopting it would cost. Any well-argued choice earns the point; the specificity is what is being graded, not the choice. Strong candidates and what each actually requires. Flow weighting needs a bi-directional flow sensor at the sampling point, which M7's per-pod FS7 is not - the FS7 reads speed with no directional discrimination, so inspiration and expiration are indistinguishable to it, and that is a hardware gap and not a firmware one. Learned breath detection needs labelled training data from ARES's own geometry, which means a mannequin or a reference capnograph to label against, plus a decision about where inference runs, plus a much faster CO2 channel than the 0.5 Hz live history C19 documents. The Nafion sample line is the cheapest thing in the paper and directly addresses C17's condensation section, costing one component and a line item. Pressure compensation of the CO2 reading over a wide range is already half-built in the ARES firmware and the paper shows what a completed version looks like. A per-reading fault stack with named failure modes is a data-contract change M9 would have to carry. Peronnet differential-CO2 metabolic rate would move C19's metabolic model off the 220-minus-age rule of thumb, but it needs a controlled ventilation volume with an inlet and an outlet, which a headset does not have and a mannequin chamber does. Partial credit for naming a method without naming what it would cost; no credit for a list of methods with no requirement attached to any of them.
    weight: 3
  - id: limits
    point: Names a specific asymmetry between the two systems, in either direction. Real ones, any of which earns the point. The suit is a closed, instrumented, pressure-controlled volume with a known ventilation flow rate of 6 ACFM at a known inlet CO2 concentration, so NASA can compute a mass balance and a metabolic rate from an inlet-outlet difference; a head in a room has no control volume and no boundary conditions at all. ICWTS measures at the mouth through a thermoformed mouthguard or a nasal cannula, physically coupled to the airway, where ARES samples ambient air near the face and never touches the subject - which is why ARES can run a subject overnight and ICWTS test points are short. NASA is verifying a suit against a written requirement in NASA-STD-3001; ARES is characterising a phenomenon, and those are different jobs with different error budgets. Their software is written to NPR 7150.2 Class C safety-critical requirements because it is used to control a hypercapnia hazard in real time. Their subject pool is 20 people with measured VO2peak. And in ARES's favour: ARES measures at three positions simultaneously and can see a spatial gradient, whereas ICWTS measures at one point in the airway and infers the field from CFD. Partial credit for a general statement that NASA has more money, with no specific named difference.
    weight: 2
referenceSummary: |
  This is a conference paper from the 55th International Conference on Environmental Systems, written
  by a team from NASA Johnson Space Center, NASA Jet Propulsion Laboratory and Amentum. It describes
  the In-suit CO₂ Washout Test System, the hardware and methods NASA now uses to verify that a
  spacesuit clears exhaled CO₂ away from a crewmember's face fast enough. It is assigned to M8 because
  it is the same measurement problem ARES has, attacked by people who have been at it since Gemini,
  and because its conclusions section is an unusually honest account of a method that did not survive
  contact with a test series.

  Start with what "CO₂ washout" means for a suit, because it is precisely ARES's problem in a smaller
  box. A pressurised suit is an anthropomorphic vessel around a human, and the life support system
  pushes a deliberate ventilation flow of low-CO₂ gas into the helmet, around the head, entraining the
  crewmember's expired breath and pushing it down into the suit volume while backfilling the oro-nasal
  region with fresh inlet gas. That is the washout. The quantity being verified is the inspired
  partial pressure of CO₂, PICO2, against a requirement in NASA-STD-3001. Note what this is not: it is
  not the bulk CO₂ concentration of the suit volume. It is the CO₂ in the gas actually entering the
  airway, which is the same distinction between a bulk ECLSS reading and a face-level reading that M1
  gives as the reason ARES exists at all.

  Historically this was measured with an external mass spectrometer or a medical gas analyser fed by a
  long capillary line from the oro-nasal region, and the paper is candid about how badly that worked.
  A nasal cannula is comfortable enough to wear but impedes a proper Valsalva manoeuvre, produces a
  corrupted waveform whenever the subject moves relative to it, and cannot support a flow-weighted
  calculation at the subject interface. A mouthpiece fixes the flow measurement but disturbs the flow
  field, stops the subject speaking, and is uncomfortable enough that it limits how long a test point
  can run. Neither problem has a clean answer, and both are recognisable to anyone who has tried to
  put an instrument in a breathing zone without changing the breathing zone.

  The system that replaces them has two halves. ICWTS-100 is the suit-services interface: inlet and
  outlet mass flow meters, inlet and outlet CO₂ and O₂ partial pressure sensors, inlet and outlet
  humidity and temperature, inlet absolute pressure, differential pressure across the suit volume, an
  outlet particle counter, and separate lab-reference sensors. Everything converges through a National
  Instruments cDAQ on a LabVIEW application written to NPR 7150.2 Class C safety-critical
  requirements, because the displayed data is used in real time to control a hypercapnia hazard on a
  live human subject in an uncharacterised suit. ICWTS-200 is the breath-by-breath oro-nasal
  measurement, and it exists in two forms.

  The one that worked is a commercial portable capnography unit, of the kind used in ambulances,
  customised for the job. A small pump draws a side-stream sample from a mouthpiece through an NDIR
  cuvette measuring at 4,300 nm, with an in-line mass flow sensor and a pressure sensor inside the
  cuvette. A two-foot Nafion inlet line drops the dewpoint of the 37 °C saturated expired gas to that
  of the suit volume, which is how they keep condensation out of the sample line — a direct and
  cheaply portable answer to the problem C17 raises. The cuvette has a reference channel that tares
  the optics and control electronics out of the measurement. The integral pressure transducer
  compensates the reading over 10 to 23.5 psia, far wider than clinical capnography ever needs, and
  one unit was calibrated down to 4 psia for mannequin work. The sensor covers 0.1 to 60.8 mmHg with
  accuracy concentrated below 20 mmHg, which is where the standard's limit sits. The flow sensor
  closes a loop on the pump to hold the sample flow at, for example, 500 mL/min, automatically
  compensating for a longer inlet line or added resistance until the loop can no longer close, at
  which point it raises a fault. The telemetry stream carries raw and corrected CO₂, cuvette pressure
  and temperature, sample flow, inspired CO₂, respiration rate, sample rate, firmware and protocol
  versions, and a named fault stack covering pump failure, pressure and IR sensor failures, source
  failure, calibration data failure, out-of-range temperature, low flow and no breathing detected. It
  costs about a quarter of a laboratory instrument and needs one USB port for both power and data.

  The one that did not work is more instructive. The fiber-coupled tunable laser spectrometer measures
  CO₂ and water vapour at 100 Hz as a main-stream measurement straight across the subject's oral flow,
  with the laser off-boarded outside the suit and only a fibre and a low-power detector inside — the
  same TLS lineage as the Portable TLS instrument that M5's paper describes, with two of the same JPL
  authors. It failed for two reasons and both are the sort of thing no design review catches. The
  fibre needed to carry those wavelengths is more brittle than ordinary silica, and everything had to
  pass through an Apollo-era feed-port with a 0.300-inch opening and almost no strain relief, so it
  kept fracturing. And off-boarding the laser removed the heating that had been keeping the optics
  warm, so the 37 °C saturated expiratory flow fogged them within a few breaths — extendable to about
  fifteen breaths with anti-fog, which was not enough for a test point. The best instrument in the
  paper produced no data.

  Two methodological ideas run through the whole thing. The first is the averaging question. The paper
  defines three quantities: a Flow Weighted Average, which is essentially a convolution of flow with
  measured inspired CO₂; a Time Weighted Average, which is an ordinary average over clock time; and a
  baseline, defined here as the 20 to 80 percent portion of the trough formed during inspiration, set
  by the inflection points in the CO₂ trace. FWA is the physiologically right one, because it weights
  each moment of CO₂ by how much gas was actually being drawn in at that moment. The MG-220
  mouthguard — a thermoformable SCUBA mouthpiece with a side-stream sample port and a bi-directional
  mass flow anemometer — was built to make FWA possible at the subject interface.

  And then Section IV retires it. The flow sensors turned out to be especially sensitive to moisture
  in the flow path and had to be replaced frequently through the test series. Post-test data reduction
  confirmed that a baseline measurement made with the same mouthguard gave a similar and acceptable
  result to the FWA computed from the flow sensors. The flow sensors do make it easier to detect the
  start and end of inspiration, but the authors conclude that the benefit does not offset the
  fabrication, calibration and replacement overhead, or the difficulty of deploying such a thing to
  the wider community. All three configurations they recommend for deployment use the baseline method,
  and none of them carries a flow sensor. That is what a methods trade looks like when it is done
  properly: build the better measurement, then measure whether it was worth it, then publish the
  answer even when the answer is that it was not.

  The second idea is breath detection. The NESC assessment found that the previous method relied on a
  fixed elapsed time to accumulate the required number of breaths, which fails whenever the waveform
  stops looking like a breath — and the paper lists the conditions that do it: a poorly performing
  suit, low ventilation flow, high metabolic rates with large minute volumes, pressure pulses from
  pressure-volume work against the suit, and poor indexing of the subject inside the suit. Any of
  these destroys the expected pseudo-square wave with a clear inspiratory baseline. The answer was a
  neural-network breath recognition model, trained on breaths from several suited tests, which detects
  each breath as an event and counts up live so the team can confirm 60 breaths, with a 30-breath
  minimum, for each test point. Those counts were set by the NASA and subject-matter-expert community
  to bring the standard deviation down given how variable a human is.

  The honest footnote matters as much as the method. The detector, while acceptable, tended to
  over-represent the number of good breaths, and specifically so at resting metabolic rates. The cause
  was traced not to the model but to the plumbing: at rest the 6 ACFM ventilation was more than
  adequate for the subject's reduced minute volume, and it interfered with sampling of the inspiratory
  flow because the side-stream port sat about an eighth of an inch proud of the mouthguard's oral
  entry plane. The fix is to recess the port and retrain. The transferable lesson is that a learned
  detector inherits the geometry of the rig that trained it, so ARES could not adopt this model — only
  the approach.

  The validation strategy is the last thing to take from the paper, and it is the one ARES is already
  copying without having read it. Figure 4 puts a breathing mannequin, IRMA, at the front: it sweeps
  the physiological range of breaths per minute, tidal volume, end-tidal CO₂ and breathing pattern,
  because a mannequin can be commanded to any point in that space and held there. Human-in-the-loop
  testing is reduced to a small number of discrete verification points. A CFD model is then developed
  and correlated against the mannequin data, and only then used to translate the result to conditions
  nobody can produce on the ground — gas composition from air to oxygen, absolute pressure scaling,
  and the g-field from 1g to partial and micro gravity. The ordering is deliberate. Human subjects are
  the slow, scarce, ethically constrained, least repeatable element, so they are spent verifying a
  model rather than mapping a space. That is the identical argument C14 makes for ARES, where the
  immediate benefit is that characterisation keeps moving while IRB approval is pending.

  The initial deployment was a retest of the ISS EMU, treated as the gold standard for suited washout
  performance, with 20 subjects — 16 male, 4 female, mean age 37.3, mean VO₂peak 39.97 mL/kg/min —
  across nine test points from resting to 3,000 BTU/hr, at 6 ACFM of breathing air and 4.3 psid. Four
  of the six objectives were met. The metabolic rate computation from differential CO₂ using the
  Péronnet tables, with the respiratory exchange ratio assumed at 0.85, worked. The attempt to
  *measure* that exchange ratio from differential O₂ instead of assuming it did not, because the
  as-implemented O₂ accuracy was not good enough — which is a live warning for the oxygen channel on
  the next-generation ARES pod. And the nasal cannula turned out to be unusable above about
  1,200 BTU/hr, because the subject transitions to mouth breathing and the cannula's reading is
  suppressed by the split flow.
---

## Annotated bibliography

Short, by the rule in `lit/SOURCES.md`: nothing is cited here that has not been resolved and read.
The assigned paper cites fourteen references, seven of them companion ICES-2026 papers from the same
programme — ICARUS itself is one of them, ICES-2026-262. **None of those has been independently
retrieved**, so none is listed below. Where this rubric relies on ICARUS, it relies on what
ICES-2026-499 says about it, and it says so.

### Campbell, C., Whalen, P., Christensen, L., Sanders, I., & Watson, C. (2026). In-suit CO₂ Washout Test System (ICWTS) for CO₂ washout verification in spacesuits. ICES-2026-499.

The assigned reading, about fifteen pages including figures. **Read it in this order**, because the
section that changes your answer is at the back:

1. **§I Introduction**, all of it. The definition of washout, the history, the cannula-versus-
   mouthpiece trade, the four objectives, and the paragraph defining FWA, TWA and baseline. Two
   rubric points are reachable from this section alone.
2. **Figure 4** and the paragraph above it. The mannequin-first chain. One page, one rubric point.
3. **§II**, the ICWTS-200 NDIR subsection carefully and the FC-TLS subsection carefully. Skim
   ICWTS-100 — the sensor inventory matters less than the fact that it is a *control volume*.
4. **§IV Conclusion**, carefully, twice. This is where the flow sensor is retired, and a learner who
   skips it will write a confident recommendation the authors themselves rejected.

You can skim the objective-by-objective lists in §III. They are a test report, and the summary at the
end of the section carries what you need.

One reading warning. The paper uses **PPCO2** for partial pressure of CO₂ in mmHg throughout, where
this course uses ppm in prose (`GLOSSARY.md` §5). The conversion is there: 1 mmHg ≈ 1,316 ppm at one
atmosphere. But do not convert their numbers casually — a spacesuit runs at 4.3 psid, roughly 19 psia,
so the total pressure their partial pressures sit inside is **not** one atmosphere. The mmHg figure is
the physiologically meaningful one and that is exactly why they use it. This is the pressure-dependence
caveat from `GLOSSARY.md` §5 turning up in a real document.

### Sanders, I. C., Christensen, L. E., et al. (2026). Portable Tunable Laser Spectrometer (PTLS) technology demonstration on the International Space Station. ICES-2026-75.

Not the assigned reading — it is M5's — but worth two minutes beside this one. The FC-TLS that failed
here is the same JPL tunable-laser lineage as PTLS, and Christensen and Sanders are authors on both.
Reading them together is the cheapest way to see that an instrument's performance envelope and its
*deployability* are separate properties: the same spectroscopy that works beautifully as an open-path
instrument on the ISS could not survive a 0.300-inch feed-port and a warm wet mouth. See
`SOURCES.md`, `sanders2026`.

### `C:\Users\Henry\Documents\ARES\ARES2ESP32\app\lib\science\`

The ten model files. You need `respiration.dart` open for the `icarus` rubric point — specifically
the fact that its output is a bin index times a bin width, which is why it has no representation for
zero. `C19` does the arithmetic; the source is four screens long and worth reading directly.

## Synthesis

### Why this paper and not a physiology paper

M8 is the module where a member first sees ten numbers coming out of an app, and the temptation is to
treat the app as the subject. It is not. The subject is the question *how do you come to trust a
derived quantity*, and this paper is the best available answer because it is a group with sixty years
of institutional practice, writing down what they tried, in a document short enough to read in an
evening.

It is also the only reading in the course where the authors **retire their own best idea in the
conclusions**, which is why the `fwa` rubric point is worth three.

### The trap, and it is deliberate

The abstract sells flow weighting. The introduction sells flow weighting. Objective 1 is flow
weighting. The mouthguard was designed and fabricated in two configurations to support flow weighting.
A learner who reads the front of this paper will write a confident recommendation that ARES adopt FWA.

Then §IV says the flow sensors kept failing on moisture, that a simpler baseline measurement gave an
acceptable answer anyway, and that all three deployable configurations use the baseline method with no
flow sensor at all.

**Both halves are correct and they are not in tension.** FWA *is* the physiologically right quantity.
It is also, on this hardware, in this environment, not worth what it costs — and the way they
established that was to build it, run twenty subjects through it, and compare. That is the shape of a
real engineering result and it is almost never what a paper's abstract looks like.

The reason this belongs in ARES 101 rather than in a methods seminar is that ARES is about to face the
same decision. M7 is putting an FS7 in every pod. Somebody will propose flow-weighting the
rebreathed fraction with it. The right response is not "NASA does it" and it is not "NASA gave up on
it" — it is to notice that the **FS7 is not the sensor this needs.** It reads speed with no direction
(`C18`), and flow weighting requires knowing which way the gas is going. That is a hardware gap, and
finding it before somebody spends a semester on firmware is what this reading is for.

### The one idea that is free

The **Nafion sample line**. Two feet of it, ahead of the cuvette, to drop a 37 °C saturated sample's
dewpoint to ambient before it reaches an optical surface.

`C17` spends a section on condensation and concludes, correctly, that the real ARES risk is low
because the chin pod samples mostly ambient air with a few percent breath in it — but also that it is
a seasonal, site-specific failure that will work all summer and fail on the first cold night. Nafion
is a one-component answer to exactly that, it is standard practice in respiratory gas sampling, and
it costs a line item.

It is also worth noticing *where* the condensation actually bit in this paper: not in the sample line
they had protected, but on the **optics of the instrument they had not** — because off-boarding the
laser removed the heat that was keeping them dry. A mitigation that is present in one path and absent
in another is how a known failure mode comes back.

### What to be careful about claiming

**Do not port ICARUS.** You cannot; the model is not published and would not transfer if it were. The
paper is explicit that the detector's misbehaviour at rest was caused by a sample port an eighth of an
inch out of position, which means the model had learned the waveform that particular geometry
produces. The transferable thing is the **architecture** — detect breaths as events, then compute
per-breath quantities — and that architecture is worth adopting on its own merits even with a much
simpler detector than a neural network. `C19`'s point is not that ARES needs machine learning. It is
that a window-averaged transform structurally cannot report an apnea, and an event counter
structurally can.

**Do not read the 6 ACFM ventilation as a nuisance parameter.** It is the thing that makes their
metabolic-rate computation possible: a known flow into a closed volume with an inlet and an outlet is
a mass balance, and a mass balance is why they can get a metabolic rate out of a CO₂ difference using
the Péronnet tables. ARES has no control volume. Any proposal to port their metabolic method has to
start by producing one, which is a mannequin chamber, not a headset.

### A note for whoever maintains this file

The load-bearing facts here are: FWA as a convolution of flow with inspired CO₂; the Section IV
retirement of the flow sensor and the three baseline-method configurations in Table 3; the NESC
fixed-time finding; the neural-network detector with its 60-breath target and 30-breath minimum; the
resting-rate over-count traced to a port an eighth of an inch proud; the Figure 4 mannequin-first
chain; the Péronnet metabolic computation at an assumed RER of 0.85; and the failed differential-O₂
exchange-ratio measurement. Everything else — the cDAQ model number, the subject anthropometrics, the
fault-stack contents — is context and can go stale without breaking a rubric point.

**Sharing and availability.** This document is in the Drive `Papers` folder as
`1OzdK0KPj9i87jCsERj-UPJKayFQvmgXq`, so unlike `L07` this section has a real file id. It is **not yet
shared**, so as things stand a learner opening this section sees a Google sign-in wall rather than the
paper. That is open action 1 in `lit/SOURCES.md` — folder-level sharing on `Papers`, which covers this
row and every other one. Until it is done, this section is not shippable, and neither is any other
`LIT_REVIEW` in the course.
