---
pdfDriveFileId: 1vcpQGZnoja8l6ctQH7Ed1-RlYkC4wXAV
pdfTitle: Portable Tunable Laser Spectrometer on the ISS (Sanders et al., ICES-2026-75)
citation: Sanders, I. C., Christensen, L. E., Ryan, S. R., Zhong, F., Silver, J., Reyes-Newell, A., Hovde, C., & Opsahl, P. (2026). Portable Tunable Laser Spectrometer (PTLS) technology demonstration on the International Space Station: performance and science objectives. ICES-2026-75. 55th International Conference on Environmental Systems, Rio Grande, Puerto Rico, 12-16 July 2026.
promptText: M5 taught you an NDIR sensor that pulls air down a tube to a filtered detector and reports an integer. This paper describes an instrument JPL is flying on the ISS right now that does none of those things. Read it and answer in at least 200 words. First, what does open-path laser sensing actually do that NDIR with a sample line cannot - be specific about what "open path" means physically and name the consequences the authors claim for it. Second, quote the performance and the envelope - accuracy, precision, cadence, response time, size, mass, power - and put each next to the equivalent property of the SprintIR-6S-20% from C16, converting units where you have to. Third, and this is the part that matters most, read Section IV. The authors compare two instruments at opposite ends of one module and find that one of them sees something the other does not. Say what that difference was, what caused it, and why it is the same argument ARES makes for putting three pods on one head rather than one sensor on a wall. Finally, be concrete about what it would cost ARES to switch. Name at least two specific things that would have to exist that do not, and then say what ARES could adopt from this paper without any new hardware at all.
minWords: 200
rubric:
  - id: openpath
    point: Explains what open path means physically and what it buys. The optical measurement region is ambient air moving freely through a vented cover - there is no pump, no sample line, no inlet filter, and no sample cell to fill, so the gas the laser interrogates is the gas that was there. Credit the consequences the paper itself claims - non-invasive monitoring, reduced measurement hysteresis, fewer wall effects so sticky molecules can be measured, no active cleaning of the optical surfaces, and an instrument explicitly designed not to disturb the airflow it is measuring. Full credit connects at least one of these back to M5 or M6 rather than only listing them - the two that transfer hardest are that transport delay is not a quantity that exists for this instrument at all, and that with no tubing there is nothing for dispersion to smear or condensation to block.
    weight: 2
  - id: performance
    point: Quotes the numbers correctly and compares like with like. CO2 accuracy and precision are both plus or minus 0.003 mmHg, at a 2 Hz cadence with a 1 second response time, against the instrument's own requirement of plus or minus 0.012 mmHg at 1 Hz. Size is approximately 13 x 8 x 8 cm, mass under 800 g, power under 3 W, running on ISS power or two 18650 cells. Full credit requires at least one honest conversion rather than two lists side by side. The strongest available - 0.003 mmHg is about 4 ppm at one atmosphere, which is better than a single quantisation step of the SprintIR-6S-20%, so the flight instrument's total error is smaller than the smallest change the headset's sensor can represent. Credit also for noticing that 2 Hz beats the headset's roughly 1 Hz BLE stream and its 0.2 Hz CSV, and for noticing that Table 1 reports COTS optical sensors at plus or minus 0.15 mmHg with a 10 to 30 second response, which is the class the SprintIR belongs to.
    weight: 2
  - id: gradients
    point: Reads Section IV and gets the spatial argument right. The two deployed instruments sit at opposite ends of the US Lab. Overnight, Instrument 2 next to Node 2 sees high-frequency CO2 fluctuations on sub-20-second timescales with a 60-second moving variance typically 50 to 100 times higher than Instrument 1, and a power spectral density enhanced by more than a factor of 7 at the 10 to 100 second timescales, while Instrument 1 at the other end sees its night-time variability roughly halve. The cause is that the crew quarters open into Node 2 and act as localized sources while overnight airflow is weak. Full credit states the consequence in the authors' own terms - a transition from a diffusion-dominated regime overnight to a convection-enhanced well-mixed regime when the crew are active - and connects it to ARES. The connection is that two identical instruments in one room disagreed by up to two orders of magnitude in variance because of where they were, which is the same claim ARES makes at a scale of centimetres instead of metres. The very strongest answers notice that the paper's own Introduction states the thesis outright - that limited information exists on how crew behaviour, ventilation and confined spaces affect local concentrations in ways a single sensor at a fixed position does not capture - and that PTLS is still a fixed sensor, so a head-mounted instrument is the logical extension of the paper's own argument rather than a competitor to it.
    weight: 3
  - id: cost
    point: Is concrete about what switching would require, and names at least two specific missing things rather than saying it would be expensive. Any real ones earn the point. The strongest available - PTLS is not a purchasable part but six hand-built flight units from JPL and Southwest Sciences; a distributed-feedback interband cascade laser at 2.68 micrometres and a VCSEL at 760 nm, neither of which is a component ARES can drop onto a pod; a seven-pass mirror stack giving a 56 cm effective path that has to stay aligned on a moving head; lock-in detection at the second harmonic of a 90 kHz modulation on top of a 50 Hz current ramp; non-linear least-squares Voigt fitting against HITRAN line parameters using on-board temperature and pressure, which is real computation rather than a multiply; and a 13 x 8 x 8 cm envelope that is larger than the ARES backboard, let alone a pod. Naming the laser safety classifications (3R and 1M) as a review burden for a device worn on a head also earns credit. Partial credit only for a general statement about cost or complexity with no specific named requirement.
    weight: 2
  - id: adopt
    point: Names something ARES could take from this paper without new hardware. This is the point that separates a summary from a useful review, and several answers are right. The analysis is the cheapest - high-pass filtering the CO2 trace and computing a 60-second moving variance, or a day-versus-night power spectral density, are things that could run on session data that already exists, and the paper demonstrates that the variance is the signal rather than noise to be smoothed away. Reporting natively in partial pressure rather than ppm, which is what Table 1 does and what M4 argues is the physiologically meaningful quantity, costs nothing and is one multiply. The distributed-node idea - several instruments in one volume, meshed, with one acting as a reference - is already on the ARES roadmap as room-reference nodes and this paper is evidence it works. Credit a learner who instead argues that the transferable lesson is negative, that the paper shows how much instrument it takes to reach 4 ppm and therefore that ARES should stop implying its NDIR pods can resolve small gradients, provided the argument is made rather than asserted.
    weight: 2
referenceSummary: |
  This is a conference paper from the 55th International Conference on Environmental Systems
  describing an instrument that is currently operating on the International Space Station. The
  Portable Tunable Laser Spectrometer is a collaboration between NASA's Jet Propulsion Laboratory and
  Southwest Sciences Inc. Six identical units were fabricated and calibrated in early 2025. Two
  launched on SpX-33 in August 2025 and have operated continuously in the US Laboratory since
  September 2025; two more, with software upgrades and battery capability, launched on NG-24 in April
  2026; the final two undergo further environmental and performance testing before launching in late
  2026 or early 2027. The deployment is a multi-year technology demonstration with three stated aims -
  assessing instrument and network performance, analysing time series as it relates to crew health,
  and running focused experiments in which crew relocate the instruments.

  The motivation stated in the Introduction is the one this whole course is built on, arriving from
  NASA rather than from ARES. Cabin gas composition on the ISS is assessed by sensors such as the
  Major Constituent Analyzer, but limited information exists on how crew behaviour, ventilation and
  confined spaces affect local concentrations in ways that a single sensor at a fixed position does
  not capture. Tunable laser spectroscopy is argued to fill that gap on the strength of sensitivity,
  low power, fast response and insusceptibility to drift, and PTLS in particular because it is small
  and portable enough for crew to move it.

  The instrument is approximately 13 by 8 by 8 cm, under 800 g, and draws less than 3 W, running
  either from ISS 120 VDC utility outlets or from two 18650 lithium-ion cells. It contains two
  spectrometer assemblies. Carbon dioxide and water are measured together near 2.68 micrometres using
  a distributed-feedback interband cascade laser through a single 9 cm pass onto an extended InGaAs
  detector, by scanned direct absorption - the laser is tuned with a sawtooth over about 2.5
  wavenumbers and the individual lines are fitted with Voigt functions using HITRAN parameters and
  on-board temperature and pressure. Oxygen is measured near 760 nm with a vertical-cavity
  surface-emitting laser, bounced seven times between two mirrors for a 56 cm effective path onto a
  silicon photodiode, using wavelength modulation spectroscopy - a 50 Hz current ramp with a 90 kHz
  modulation imposed on top, demodulated at the second harmonic - because the oxygen absorbance is
  weak and WMS is what makes the precision requirement reachable at the low end. It is an open-path
  design: the optical components sit under a vented cover so ambient air flows through the measurement
  region. The paper lists the advantages of open path over closed path as non-invasive monitoring,
  reduced measurement hysteresis, and fewer wall effects, which makes sticky molecules measurable.
  There is no active cleaning of the optical surfaces, and the instrument was explicitly designed to
  be unintrusive, measuring in situ without disturbing the airflow.

  Table 1 is the performance comparison and it is where a reader from M5 should stop and do
  arithmetic. PTLS reports CO2 accuracy and precision both at plus or minus 0.003 mmHg, at 2 Hz
  cadence with a 1 second response time, against its own requirement of plus or minus 0.012 mmHg at
  1 Hz. Oxygen is plus or minus 0.012 PSIA accuracy and plus or minus 0.006 PSIA precision. For
  context the table gives the Orion CO2 requirement as plus or minus 0.3 mmHg, the commercial lunar
  requirement as plus or minus 0.02, LAM at plus or minus 0.31, and COTS optical sensors at plus or
  minus 0.15 mmHg with a 10 to 30 second response time - which is the class the headset's NDIR part
  belongs to. Converted, 0.003 mmHg is about 4 ppm at one atmosphere, which is smaller than the 10 ppm
  quantisation step of the SprintIR-6S-20%. The flight instrument's total error is finer than the
  smallest change the headset's sensor is able to represent. The authors also note that PTLS achieves
  two orders of magnitude better oxygen accuracy than LAM despite using the same underlying technology
  and wavelengths, and attribute that to the optical design and to the open-path geometry.

  The on-orbit results in Section IV are the most useful part of the paper for ARES, and they are a
  spatial argument. The two deployed instruments sit at opposite ends of the US Lab, one adjacent to
  Node 1 and one adjacent to Node 2. A typical 24-hour series shows CO2 ranging roughly 1.4 to 1.9
  mmHg with cycles of about 80 to 100 minutes consistent with crew metabolic loading and removal by
  ventilation and the nearby four-bed scrubber; water vapour oscillates in phase over 7.3 to 8.6 mmHg;
  oxygen is anti-correlated and comparatively stable at 147 to 148 mmHg. Instrument 1 shows a
  pronounced CO2 spike most mornings coincident with the crew's Daily Planning Conference, a localized
  injection from people gathering nearby. The striking result is overnight. Instrument 2, next to Node
  2, sees persistent high-frequency fluctuations on sub-20-second timescales whose 60-second moving
  variance runs typically 50 to 100 times higher than Instrument 1's, and whose power spectral density
  at 10 to 100 second timescales is enhanced by more than a factor of 7 at night; Instrument 1, at the
  far end of the same module, sees its night-time variability roughly halve instead. The cause is that
  the crew quarters vent into Node 2 and act as localized sources while overnight airflow is weak and
  ventilation-driven, and the authors note the magnitude scales with the number of crew in the
  quarters. Their summary is that the diurnal structure reveals a transition from a diffusion-dominated
  regime overnight to a convection-enhanced, well-mixed regime during crew-active periods.

  That sentence is M1 restated as a flight measurement, and the two-instrument disagreement is the
  ARES thesis at the scale of a module rather than a face. Two identical, drift-insensitive, 4 ppm
  instruments in one room reported atmospheres differing by up to two orders of magnitude in variance,
  purely because of where they were and who was near them. A learner who takes only one thing from
  this paper should take that. The reading it does not support is that PTLS makes ARES unnecessary:
  PTLS is still a sensor fixed to a wall, or at best hand-carried, and its own Introduction states
  that a single sensor at a fixed position is what fails to capture local concentration. A
  head-mounted instrument is the continuation of that argument, not a competitor to it. What ARES
  cannot claim is parity of instrument quality - the honest comparison in the other direction is that
  it takes an interband cascade laser, a seven-pass mirror stack, 90 kHz lock-in detection, Voigt
  fitting against HITRAN, and a 13 by 8 by 8 cm enclosure to reach 4 ppm, and the headset is not going
  to get there with a filtered detector and a ten-count multiplier. What it can take from this paper
  today, with no new hardware, is the analysis - moving variance and day-versus-night spectral content
  as the signal rather than as noise to be filtered out - and the habit of reporting in partial
  pressure, which is what Table 1 does throughout and what M4 argues is the quantity that matters.
---

## Annotated bibliography

Short by the rule in `lit/SOURCES.md`: nothing is cited here until it has been resolved and read.
The assigned paper's own eight-item reference list is not reproduced. Six of those eight are prior
ICES proceedings and a JSSE paper on PTLS itself, and none has been independently verified against
Crossref the way `SOURCES.md`'s rows were.

### Sanders, I. C., Christensen, L. E., Ryan, S. R., Zhong, F., Silver, J., Reyes-Newell, A., Hovde, C., & Opsahl, P. (2026). Portable Tunable Laser Spectrometer (PTLS) technology demonstration on the International Space Station. ICES-2026-75.

The assigned reading. It is twelve pages and reads quickly. Take it in this order: the Introduction,
then §II with Figure 1 and **Table 1**, then skip to **§IV**, then the Summary. Come back to the
spectroscopy in §II if you want it.

Table 1 and §IV are where the assignment lives. Table 1 is the only place in this course where the
headset's sensor is put next to a flight instrument on the same axes, and §IV is the only place in
this course where the ARES premise is *measured* rather than modelled — Dutta et al. simulate a
gradient, and this paper reports one, in flight, between two real instruments.

Two things to know before you start §II so you do not stall in it. **Wavelength modulation
spectroscopy** is a lock-in technique: you wobble the laser wavelength fast, and read the detector at
a multiple of the wobble frequency, which throws away everything that is not changing at that rate.
It is used here because the oxygen line is weak. And a **Voigt function** is the shape an absorption
line actually has once you account for both thermal motion and collisions; fitting one is how you
turn a measured line shape into a concentration. Neither is on the exam and neither is required for
any rubric point.

The one number in the paper that is easy to misread is the CO₂ figure in Table 1, because it is in
millimetres of mercury while everything in M5 is in parts per million. Convert it. That conversion is
the `performance` rubric point and it is three lines of arithmetic.

### Dutta, S., et al. (2026). Gravity and human respiration. *npj Biological Physics and Mechanics*, 3, 3.

Already assigned in M1 and M3, and relevant here for one comparison only. Dutta et al. predict a
spatial CO₂ structure from a simulation; Sanders et al. measure one in flight. They are about
different length scales — a face against a module — and putting them next to each other is the
clearest way to see what kind of claim each one is. See `SOURCES.md`, `dutta2026`.

### Campbell, C., et al. (2026). In-suit CO₂ Washout Test System (ICWTS). ICES-2026-499.

Not assigned here — it is M8's paper — and listed because it is the companion piece. Sanders et al.
is NASA measuring the atmosphere *around* a crew member; Campbell et al. is NASA measuring the
atmosphere *inside a helmet*. Between them they bracket ARES on both sides, and a learner who reads
both will notice that neither one measures the volume immediately in front of an unhelmeted face,
which is the gap this project sits in. See `SOURCES.md`, `campbell2026`.

## Synthesis

### Why this paper, for a module about a $50 NDIR part

The obvious objection to assigning this paper is that ARES cannot build it, will not build it, and
will never own one. That is correct, and it is not a reason to skip it.

M5 is the module where the firmware becomes real, and the risk in that module is a specific kind of
tunnel vision. A member who spends a week learning the GSS ASCII protocol, the multiplier, the
warm-up window and the `K 0` boot order will come out of it fluent in one instrument and with no
sense of where it sits. `Z` returning raw counts feels like the natural order of things until you
have seen an instrument that reports partial pressure directly, at 2 Hz, with a total error smaller
than one of our counting steps.

The paper does two jobs at once. It calibrates a learner's expectations about what CO₂ measurement
can be, and — in §IV — it hands the project the closest thing to independent evidence its premise has.

### The result that should change how the team talks

Section IV is worth more to ARES than the whole of §II.

Two identical PTLS units, at opposite ends of one module, reported atmospheres that differ by up to
two orders of magnitude in 60-second moving variance overnight — because one of them was next to the
crew quarters and one was not. Not a different mean; a different *character*. One
instrument saw a stirred, quiet volume and the other saw a volume being fed by sleeping people
through a vent.

Every time somebody in this club is asked "why not just use the cabin sensor", that is the answer,
and it now has a citation with flight data behind it instead of a simulation. The phrasing to reach
for is the authors' own: overnight the volume is **diffusion-dominated**, and during crew activity it
is **convection-enhanced and well mixed**. M1 named those two regimes — IBD and BTC — and predicted
that the first one is what you get when the second one fails. This paper watched the switch happen
twice a day, at 2 Hz, for months.

### The two ways to overclaim, and why the rubric weights `gradients` highest

There is a bad version of the above, and it will get said in a meeting. It goes: *NASA measured CO₂
gradients on the ISS, which proves the CO₂ bubble.*

It does not. Sanders et al. measured **module-scale** structure driven by ventilation and by where
crew sleep. The CO₂ bubble is a **face-scale** structure driven by the collapse of a body's own
thermal plume. Those are different phenomena at different length scales, and the paper contains no
measurement at the scale of a face — because there was no instrument at the scale of a face, which
is the whole point of the project it is being read for.

The other overclaim runs in the opposite direction and is more common among people who have just read
Table 1: *this instrument is a hundred times better than ours, so what are we doing.* Also wrong, and
the reason is in the same Introduction. PTLS is fixed to a wall. Its own authors write that a single
sensor at a fixed position does not capture how crew behaviour and confined spaces affect local
concentration — and then deploy six sensors at fixed positions, because that is what is flyable
today. A wearable instrument is the version of that argument that follows the person, and it is worth
building even at 10 ppm resolution, provided nobody claims 4 ppm.

The `gradients` rubric point carries the highest weight because it is the only one where a learner
can get the physics right and the inference wrong, and where getting the inference wrong is something
this team will actually do in public.

### What "open path" is really worth here

It is easy to read open path as a convenience — no pump to fail, no tubing to buy. It is more than
that, and M6 is where the size of it lands.

An open-path instrument has **no transport delay**. Not a small one: the quantity does not exist,
because there is no path from an inlet to a cell. Everything M6 spends a module on — matched line
lengths, dead volume, dispersion smearing a step, condensation, the difference between transport
delay and T90 — is a set of problems created entirely by the decision to move gas to the sensor
instead of putting the sensor in the gas. Delete the tube and you delete the problem class.

That is why "open-path sensing eventually deletes the sampling loop" appears in M6's what's-next, and
why this paper is the evidence that the sentence is not wishful. The instrument exists, it is flying,
and it has been running unattended in a crewed vehicle since September 2025 with no active cleaning
of its optical surfaces.

### A note for whoever maintains this file

The two numbers most likely to go stale are the deployment status — four units flying as of this
writing, two more due late 2026 or early 2027 — and Table 1's comparison rows, which are pinned to
requirements that change. Neither is load-bearing for any rubric point; the accuracy, cadence and
envelope figures are.

Sharing state is the same open action as every other row in the manifest: nothing in the Drive
`Papers` folder is shared, so this file id renders a Google sign-in wall rather than the paper until
someone sets the folder to "Anyone with the link · Viewer". See `SOURCES.md`, note E and Open
actions.
