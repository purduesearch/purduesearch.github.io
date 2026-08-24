---
pdfDriveFileId: PENDING_UPLOAD_SEE_SOURCES_MD_OPEN_ACTION_2
pdfTitle: Evaluation and Environmental Correction of Ambient CO2 Measurements from a Low-Cost NDIR Sensor (Martin et al., 2017)
citation: Martin, C. R., Zeng, N., Karion, A., Dickerson, R. R., Ren, X., Turpie, B. N., & Weber, K. J. (2017). Evaluation and environmental correction of ambient CO₂ measurements from a low-cost NDIR sensor. Atmospheric Measurement Techniques, 10(7), 2383–2395. https://doi.org/10.5194/amt-10-2383-2017
promptText: Six copies of one low-cost NDIR sensor, in one room, against a research-grade laser reference, for four weeks. This is the closest thing in the literature to the measurement ARES has never taken, and it is short - read Section 2.1 and 2.2, Section 4, Section 5 in full including Table 1, Section 6 in full, and Section 7. You may skim Section 1 and Section 3. Answer in at least 200 words, and answer all five parts. First, say what actually made these sensors read wrong. Distinguish the part that is fixed per unit from the part that moves with the environment, and use Table 1 to say which environmental variable mattered most - the numbers are right there and an answer that says temperature and humidity without checking has not read the table. Second, say what the paper found about applying one sensor's correction to another sensor, and what that implies for a headset carrying three pods. Section 6.3 is where this lives. Third, say what this calibration strategy costs. Be concrete about the equipment and the elapsed time, not just the money, and then say what a team that cannot afford it should do instead and what that cheaper strategy gives up. Fourth - and this is NOT in the paper, so do not go looking for it - explain automatic baseline correction. What does ABC assume about the environment the sensor lives in, why is that assumption reasonable in a ventilated office, why does it fail on a headset, and in which direction does the resulting error run. C21 and the ARES firmware are your sources for this part, and saying plainly that the paper does not cover it is worth marks rather than costing them. Fifth, transfer the result honestly. These are SenseAir K30 parts in a fixed rooftop room reporting 1-minute averages, and ARES is three GSS SprintIR parts on a moving head reporting at 1 Hz. Name one finding you would expect to carry across unchanged and one you would not, with a reason for each.
minWords: 200
rubric:
  - id: drift
    point: Explains what makes a low-cost NDIR sensor read wrong, and separates the fixed per-unit error from the environmentally-driven part. The fixed part - every K30 had its own distinct zero offset, some as much as 5 percent or 20 ppm from the reference, and the uncorrected RMSEs ran 5 to 21 ppm across six units while all six stayed inside the manufacturer's stated accuracy of plus or minus 30 ppm plus 3 percent of reading. The moving part - the difference between each K30 and the reference was not random noise, it carried two clear periodicities, roughly one day and roughly one week, which matched the diurnal and synoptic cycles in the chamber's temperature, pressure and water vapour. That non-randomness is the evidence that an environmental correction is possible at all. Full credit requires naming pressure as the largest environmental term from Table 1 - for K30-1 the successive correction went 6.9 uncorrected, 3.3 after zero and span, 2.7 after pressure, 2.7 after temperature which added nothing resolvable at two significant figures, and 2.1 after water vapour, with a simultaneous multivariate fit reaching 1.8. Credit for noting that zero and span alone is roughly half the total improvement and for the worst sensor, K30-4, is almost all of it at 20.8 down to 3.7. Credit also for the paper's honest limit on drift proper - a correction fitted on the first 15 days performed within 0.1 ppm of one fitted on all 28, so there is no baseline drift distinguishable from a straight line over weeks to a month, and the paper states that behaviour beyond one month is not known and would need at least a six-month study. An answer that asserts NDIR sensors drift badly without distinguishing offset from environmental response, or that claims the paper measured long-term drift, does not earn this point.
    weight: 3
  - id: per-unit
    point: States that the correction is per sensor and cannot be shared, using Section 6.3. The authors tested exactly this - they averaged the coefficients of five sensors, omitting the worst performer, and applied that single generalised correction to all six. The resulting RMSEs ranged from 3.1 ppm to 23.9 ppm and in some cases were worse than the uncorrected data, and averaging the five sensors' concentrations instead of their coefficients gave the same outcome. Their conclusion is that for each sensor an independent evaluation must be completed. Full credit connects this to ARES rather than restating it - three pods means three calibrations, a replacement sensor invalidates its pod's offset and nothing else, and a per-pod offset array with one entry per sensor is the correct data structure rather than a convenience. Strong answers notice that this is the reason the ARES offsets are stored per pod in NVS and that the same argument forbids anyone from copying one pod's offset onto another after a swap.
    weight: 2
  - id: cost
    point: Says concretely what this calibration strategy costs and what a cheaper one gives up. The cost is not the sensor. Every correction in the paper is regressed against a research-grade cavity-enhanced laser absorption analyser, itself calibrated against NIST-traceable gas standards at 369.19 and 429.68 ppm and separately corrected for its own 1.2 ppm of drift over 30 days. So the strategy requires co-locating each individual sensor with an instrument costing on the order of a hundred thousand US dollars, for long enough to capture the environmental variation you want to correct for - Section 6.2 says a regression period of about two weeks, because a few diurnal cycles plus one synoptic cycle is what makes the fit stabilise. That is per sensor, and it is two weeks of elapsed time. Full credit names both the reference instrument and the two-week duration. The cheaper alternatives and their costs - a fresh-air single-point zero costs nothing and fixes offset only, leaving span untouched, per C21. A certified reference gas, which is ARES deliverable 2.5.2, costs a cylinder and a fixture and gives a second point so span becomes measurable, but it is a laboratory condition and says nothing about how the sensor behaves across a day of real temperature and pressure. Cross-referencing three pods against each other costs nothing and can only detect disagreement, never accuracy, because there is no external claim in it. Any answer that says the strategy is expensive without naming what the expense buys, or that proposes an alternative with no stated loss, does not earn the point.
    weight: 2
  - id: abc
    point: Explains automatic baseline correction accurately and says why it is disabled on the ARES headset. This is not in the paper and an answer that says so explicitly should be credited rather than penalised. ABC is the sensor performing its own single-point calibration on a timer - over a multi-day window it records the lowest concentration it has observed, assumes that minimum was well-mixed outdoor air at about 400 ppm, and shifts its zero so that the minimum reads 400. The assumption is that the sensor is exposed to genuine fresh air at some point in every window. In a ventilated office on a continuously powered sensor that is reasonable and ABC is a good feature, because buildings do reach outdoor concentration overnight. On a headset it fails, because a headset is powered during sessions, is worn indoors, and sits inside the plume of the person wearing it, so the window minimum is not 400 but something more like 600 or 700. Full credit requires the direction of the error and the reason it is one-directional - the observed minimum is always above the assumed 400, so the correction is always downward, and every subsequent reading is biased low by the gap. Credit for naming the symptom recorded on slide 6 of the 7/30 deck, indoor readings drifting below 300 ppm, and for saying why that is the diagnostic - no real ambient air anywhere is below 300, so a sensor reporting it has re-zeroed against rebreathed air. Credit for the firmware facts - probeAndInitCO2 sends the ABC-off command to every sensor at every boot, unconditionally and with no setting to change it, and the enable op exists and is reachable from the app. The strongest answers make the comparison in C21 - the fresh-air zero and ABC make the same assumption about the air, and the difference is that a person standing outdoors can honour it and a timer cannot.
    weight: 3
  - id: transfer
    point: Transfers the result honestly, naming one finding that carries to ARES and one that does not, each with a reason. Carries across - per-unit zero offsets and the need for per-unit calibration, which is a property of manufacturing rather than of any particular part. The non-randomness of the environmental error, so a correction is worth building. The failure of generalised coefficients. And the ranking that puts zero and span first and pressure ahead of temperature, which follows from the physics in C16 and from the K30 compensating temperature internally while compensating pressure not at all. Does not carry across - almost everything about the magnitudes. The K30 is a 0 to 10,000 ppm part resolving 1 ppm and the SprintIR-6S-20 percent is a 0 to 200,000 ppm part resolving 10, so a 1.8 ppm RMSE is below one quantisation step of the ARES sensor and cannot be reproduced by it whatever the calibration. The paper's numbers are 1-minute averages and Section 2.1's Allan analysis puts the optimum averaging time near 3 minutes, which is a luxury a measurement of a 4-second breath does not have. And the chamber was a fixed room with a fan, whereas an ARES pod moves through a gradient. Credit for any defensible pair. The best single observation available, and worth extra credit if it appears - Section 6.1 reports frequent sign changes in the K30 minus reference difference at sunrise, and attributes them to the chamber not being well mixed at that hour combined with the K30s sitting 1 to 2 metres from the reference inlet. A spatial separation of 1 to 2 metres in a fanned room produced apparent sensor error. ARES pods are 8 centimetres apart in a gradient the project exists to measure, so co-location is not a solved problem for this headset either, and the deliberate outdoor fresh-air calibration is the one moment when all three pods really are in the same air.
    weight: 2
referenceSummary: |
  This is a peer-reviewed open-access paper in *Atmospheric Measurement Techniques*, from the
  University of Maryland with co-authors at NIST and NOAA, received December 2016 and published
  3 July 2017 under CC BY 3.0. It is short, it is unusually concrete, and it is assigned to M10
  because it is the closest thing in the literature to the measurement ARES has never taken - six
  copies of one low-cost NDIR CO₂ sensor, in one room, against a research-grade reference, for
  four weeks, with a table of what each correction step was worth.

  **The setup.** Six SenseAir K30 sensors, each paired with a Bosch BME280 for temperature,
  humidity and pressure and logged by a Raspberry Pi over UART. The K30 covers 0 to 10,000 ppm at
  0.5 Hz with 1 ppm resolution and a manufacturer-stated accuracy of plus or minus 30 ppm plus
  3 percent of reading. The reference is a Los Gatos Research LGR-24A-FGGA fast greenhouse gas
  analyser using cavity-enhanced absorption spectroscopy, which the paper is careful to say works
  on a different principle - a controlled cavity held at near-constant pressure and temperature,
  measuring the e-folding decay time rather than a transmitted intensity, and applying its own
  water-vapour correction to report a dry mole fraction. The K30, by contrast, "works in the
  ambient environment without any mechanism for keeping temperature or pressure constant" and
  makes no water-vapour correction at all. That contrast is the whole paper in one sentence - the
  expensive instrument removes the environment, and the cheap one has to be corrected for it.

  Two details from the setup are worth carrying. First, the reference was itself calibrated, with
  NIST-traceable standards at 369.19 and 429.68 ppm, and it was itself drifting - upward by over
  1.2 ppm across the 30 days, which the authors quantified with a periodic breathing-air tank and
  subtracted as a linear fit, leaving 0.2 ppm of residual. Even the hundred-thousand-dollar
  instrument needed a calibration and a drift correction. Second, the venue was chosen against the
  obvious choice - not an environmental chamber but a rooftop room with limited access, slightly
  ventilated and not temperature controlled, so that CO₂, temperature and humidity all tracked
  the outdoors. The authors state the reason plainly - rather than a multi-point calibration, this
  gave a realistic evaluation across the range of conditions the sensors would actually meet.

  **What they found before correcting anything.** Ambient CO₂ over the four weeks averaged just
  over 423 ppm with a standard deviation just under 21 ppm, and the diurnal swing ran from about
  10 ppm to over 100 ppm depending on the day. Every K30 tracked those swings. But each one had
  a **distinct zero offset**, several of them as much as 5 percent, or 20 ppm, from the reference,
  and the individual RMSEs ran from 5 to 21 ppm. All six were within the manufacturer's stated
  accuracy the entire time - the variation is the specification, not a fault.

  The most useful observation in the section is that the residual differences were **not random**.
  Each K30's difference from the reference carried two visible periodicities, one of roughly a
  day and one of roughly a week, which are the same two timescales as the temperature, pressure
  and water vapour records beside them. That is what licenses a correction - a random error can
  only be averaged down, but an error correlated with a measured variable can be removed.

  **The correction, and the table that matters.** Two methods were tried. A successive regression
  handles one variable at a time - first the K30 against the reference, which is the traditional
  zero and span correction, then the residual against pressure, then temperature, then water
  vapour mixing ratio. A multivariate linear regression fits all four at once and did slightly
  but consistently better. Table 1 gives every number, and for K30-1 the chain runs 6.9 ppm
  uncorrected, 3.3 after zero and span, 2.7 after pressure, 2.7 after temperature, 2.1 after
  water vapour, and 1.8 for the multivariate fit.

  Three readings of that table, in order of how often they are missed. **Zero and span is about
  half the total improvement**, and for the worst sensor in the set - K30-4, at 20.8 ppm
  uncorrected - it is almost all of it, dropping to 3.7 ppm in one step. A large uncorrected error
  is usually a large *offset*, which is the cheapest thing in the world to fix. **Pressure is the
  dominant environmental term** and temperature added nothing resolvable at two significant
  figures, which is exactly what you would expect from a part that compensates temperature
  internally and does not compensate pressure at all. And **water vapour is real but small**,
  worth 0.6 ppm in a rooftop room - a figure to hold lightly when thinking about a sensor that
  sits under a chin inside an exhaled breath.

  **Two results about the procedure itself, which are the ones a member should remember.** The
  regression period, Section 6.2 - the fit stabilises after a few days and is essentially complete
  in about two weeks, once a few diurnal cycles of varying amplitude and one synoptic cycle have
  been seen. Coefficients fitted on the first 15 days gave 1.9 ppm against 1.8 ppm for the full 28.
  From which the authors draw a conclusion about drift that is worth quoting carefully because it
  is frequently overstated in both directions - it is reasonable to assume that on weekly to
  monthly timescales there is either no noticeable baseline drift or that it is linear and removed
  by the regression, and the longer-term drift beyond one month "is not known at this time" and
  would require an evaluation of at least six months. So this paper is evidence that these sensors
  are stable for a month. It is not evidence about a year, and it does not claim to be.

  And Section 6.3, which is the single most transferable result in the paper. The authors averaged
  the coefficients of five sensors, omitting the poorest performer, and applied that one
  generalised correction to all six. The RMSEs came out between 3.1 and 23.9 ppm, **in some cases
  worse than the uncorrected data**. Averaging the five sensors' concentrations rather than their
  coefficients did the same. Their conclusion - for each sensor, an independent evaluation must be
  completed. Three pods on a headset means three calibrations, and a pod that gets a replacement
  sensor invalidates that pod's offset and no other.

  **What the strategy costs, which the paper never states as a price and a learner should.** Every
  correction here is regressed against a research-grade analyser on the order of a hundred
  thousand US dollars, itself calibrated against NIST-traceable cylinders, for a co-location period
  of about two weeks, per sensor. That is the real bill, and it is the reason the `cost` rubric
  point exists. ARES's fresh-air zero is free and fixes offset only. A certified reference gas,
  deliverable 2.5.2, buys a second point and therefore span, at the price of a cylinder and a
  fixture, and tells you nothing about environmental response. Cross-checking three pods against
  each other is free and can only ever detect disagreement, because there is no external claim in
  it. Each rung of that ladder buys a specific thing, and knowing which rung you are on is the
  skill this module is trying to install.

  **Time averaging, and the limit it implies for ARES.** Section 2.1's Allan variance analysis puts
  the K30's optimum averaging time near 3 minutes - 2-second data show a standard deviation
  comparable to the manufacturer's plus or minus 30 ppm, 10 seconds of averaging drops it sharply,
  and beyond about 200 seconds nothing improves. The paper uses 1 minute as a compromise, and
  after correction the six-sensor mean RMSE improves from 2.3 ppm at 1 minute to 2.0 at 10 minutes
  and 1.8 hourly, or 1.9, 1.6 and 1.5 with the poorest sensor removed. This is where a learner
  should feel the transfer fail. Every headline number in this paper is bought with averaging that
  ARES cannot spend - a breath is four seconds, `C16`'s digital filter argument says a filter
  slower than the oscillation erases it rather than delaying it, and `V16` shows the app's
  respiration model already sitting at the sampling floor. A 1.8 ppm RMSE is also below one
  quantisation step of the SprintIR-6S-20 percent, so it is not a target ARES can reach with the
  part it has, at any calibration effort.

  **The GSS connection, which is a single sentence and worth spotting.** Section 2 records that
  other NDIR sensors were evaluated before the K30 was selected, including the **COZIR ambient
  sensor from Gas Sensing Solutions** - the same manufacturer as the SprintIR on the ARES headset -
  at a manufacturer-specified accuracy of plus or minus 50 ppm plus 3 percent, and the Telaire
  T6615 at plus or minus 75 ppm. The K30 was chosen for the best specified accuracy and for
  reliability in initial testing. So the sensor family ARES uses appears in this paper only as a
  part that was considered and set aside for an ambient-monitoring application. That is not a
  criticism of the SprintIR, which was designed for speed and range rather than for parts-per-
  million ambient accuracy, and saying why is a good test of whether a learner has understood
  `C16`'s range-resolution-size trade.

  **Two gaps, stated rather than papered over.** First, this paper does not discuss automatic
  baseline correction anywhere, and no peer-reviewed open-access evaluation of ABC specifically was
  found when the module's sources were assembled - the substantive material on it is manufacturer
  documentation. The `abc` rubric point is therefore graded against `C21` and the ARES firmware,
  and the prompt says so; a learner who states that the paper is silent on it has read correctly.
  Second, and more subtly, this is a study of *ambient* monitoring at 400 to 500 ppm. The
  rebreathing measurement is a difference at the *edge* of that range, and nothing in this paper
  addresses error propagation through a subtraction, which is `C21`'s and `V17`'s subject and the
  reason M10 exists.

  **The one detail most likely to be skipped, and it is the best.** Section 6.1 notes frequent
  sign changes in the K30-minus-reference difference, clustered at sunrise, and attributes them to
  the chamber not being well mixed at that hour combined with each K30 sitting 1 to 2 metres from
  the reference inlet and having a different response time. A spatial separation of one to two
  metres, in a small ventilated room with a box fan running, produced errors large enough to see
  in the difference plot. ARES puts three pods 8 centimetres apart in a gradient the project was
  built to measure, and asks them to agree. Co-location is not a solved problem here either - which
  is precisely why the outdoor fresh-air calibration matters so much, because it is the one moment
  in the whole workflow when all three pods really are in the same air.
---

## Annotated bibliography

Short, by the rule in `lit/SOURCES.md`: nothing is cited until it has been resolved and read. This
paper's own reference list has not been independently verified against Crossref, so it is not
reproduced here.

### Martin, C. R., Zeng, N., Karion, A., Dickerson, R. R., Ren, X., Turpie, B. N., & Weber, K. J. (2017). Evaluation and environmental correction of ambient CO₂ measurements from a low-cost NDIR sensor. *Atmospheric Measurement Techniques*, 10(7), 2383–2395.

The assigned reading, and **you are being asked to read almost all of it** — it is thirteen pages
and about half of those are figures. Take it in this order.

1. **§2.1 and §2.2**, for the instruments and the experiment. §2.1 is the Allan variance analysis
   and it is where the averaging times come from.
2. **§4**, two pages, on what the sensors did before anybody corrected anything. The distinct zero
   offsets and the two periodicities are here.
3. **§5 and Table 1.** The correction itself. Table 1 is the highest-value object in the paper and
   the `drift` rubric point is graded against it.
4. **§6, all three subsections.** Time averaging, how long a regression needs to run, and the
   generalised-coefficients experiment. §6.3 is a third of a page and it is the result you will
   still remember in a year.
5. **§7**, the conclusions, to check your reading.

**Skim §1 and §3.** §1 is the urban-inversion motivation — real, and not what you are being asked
about. §3 is the reference analyser's own calibration and drift correction; read the first paragraph
and Fig. 3's caption, because the fact that the *reference* also needed calibrating is worth
noticing, and skip the rest.

**One warning about arithmetic.** The paper's RMSE figures are for **1-minute averages** and it says
so in every table caption. Quoting a 1.8 ppm figure without the averaging time attached is the single
easiest way to mislead somebody about what a low-cost NDIR sensor can do, and it is a mistake that
gets made about this paper often.

### `C21`, and the ARES firmware — `ARES2ESP32`, `CLAUDE.md` and `src/main.cpp`.

**Where the fourth rubric point is answered**, and the reason the prompt tells you not to hunt for
ABC in the paper. `C21`'s "Current state" section covers the two calibration mechanisms, the
incremental `co2_target` arithmetic, the `@ 0` at every boot, and the five-state cycle; `E07` has you
drive the whole thing on real hardware. If you have run `E07` before writing this, the `abc` and
`transfer` points will take you ten minutes.

### `C16`, for the physics the corrections are correcting.

Already assigned in M5. Beer–Lambert, why an NDIR sensor responds to pressure and temperature at
fixed mole fraction, and why the 20 % part quantises to 10 ppm. You cannot explain why pressure beat
temperature in Table 1 without it.

## Synthesis

### Why a paper about rooftop air-quality monitoring, for a headset

The obvious objection: this study is six sensors bolted to a table in a room, measuring 423 ppm
ambient air, for an urban greenhouse-gas inversion network. ARES is a wearable measuring a
150-to-2,000 ppm gradient across 8 cm of a moving face. Almost none of the numbers transfer.

That is true, and it is the argument for assigning it.

The numbers are not what this paper is for. What it is for is that it is the only document in the
course's source list where somebody **took six copies of one cheap sensor and found out how much they
disagreed** — and then, crucially, kept going and found out what each successive correction was
worth. Everything M10 asserts, this paper measured. Sensors of the same model have different zero
offsets: measured, 5 to 21 ppm RMSE, up to 20 ppm of pure offset. The error is systematic rather than
random: measured, two clean periodicities matching the environmental record. Zero and span is most of
the win: measured, 6.9 to 3.3 for a typical unit and 20.8 to 3.7 for the worst. You cannot share a
calibration between units: measured, and the failure is spectacular — up to 23.9 ppm, sometimes worse
than not correcting at all.

A member who has read this paper cannot afterwards believe that per-pod calibration is a nicety.

### The one thing the paper cannot tell you, and why the module still asks

`SOURCES.md` records the gap honestly: this paper never mentions automatic baseline correction, and
no peer-reviewed open-access evaluation of ABC was found. The substantive published material on ABC
is manufacturer documentation, which is not a source this course will grade against.

So the `abc` rubric point is graded against `C21` and the firmware, and the prompt tells the learner
that up front. That is a deliberate choice rather than an oversight, for two reasons. The first is
that ABC is the single most consequential calibration decision in the ARES firmware — one command,
`@ 0`, sent unconditionally at every boot — and a module on calibration that did not explain it would
have a hole in it. The second is that "the assigned reading does not cover this, here is where the
answer actually lives" is itself a skill worth exercising. A member who writes *the paper is silent
on ABC* and then explains it correctly from the firmware has done something better than a member who
finds a plausible-sounding sentence in the paper and stretches it.

### Where the transfer genuinely fails, and it is about time rather than about accuracy

The trap in this paper is its headline number. Median RMSE 9.6 ppm improving to 1.9 ppm sounds like
a target. It is not one, for two independent reasons a learner should be able to give.

**It is bought with averaging ARES cannot spend.** Every figure is a 1-minute average, and §2.1's
Allan analysis says the sensor's own optimum is closer to 3 minutes. A rooftop measuring a synoptic
CO₂ signal can average for three minutes and lose nothing. A headset measuring a four-second breath
cannot, and `C16` already gave the general form of that argument: a filter slower than the
oscillation does not delay the signal, it erases it.

**And 1.9 ppm is below one step of the ARES sensor.** The K30 resolves 1 ppm over a 10,000 ppm range;
the SprintIR-6S-20 % resolves 10 ppm over 200,000. No amount of calibration puts a 10 ppm-quantised
instrument at 1.9 ppm of a reference. The right conclusion is not that ARES's sensors are bad — they
were chosen for speed and range, which this paper's sensors do not have — but that the *achievable*
accuracy of the two systems is set by different constraints, and comparing the headline figures
directly is meaningless.

Which is worth stating in one line for whoever writes the error budget deliverable 2.5.9 asks for:
**this paper is the right template for the method and the wrong source for the target.**

### A note for whoever maintains this file

The load-bearing content is Table 1, §6.2's regression-period result, §6.3's generalised-coefficients
failure, and §2.1's Allan variance. Those four survive any amount of drift in the rest of the course.

The `abc` and `transfer` points are graded against **ARES**, not against the paper, so they will go
stale when the firmware or the sensor does. If ABC is ever enabled, if the SprintIR variant changes,
or if a barometer arrives in each pod with the BME680, re-read those two points against `C21` and fix
both files in the same commit.

**Sharing and availability.** This paper is CC BY 3.0 and freely readable at
`https://doi.org/10.5194/amt-10-2383-2017`, but it has **not been uploaded to the Drive `Papers`
folder**, so `pdfDriveFileId` above is a deliberately unmistakable placeholder and this section will
not render a document to a learner until somebody uploads the PDF and replaces that value. That is
open action 2 in `lit/SOURCES.md`, and the direct link there
(`https://amt.copernicus.org/articles/10/2383/2017/amt-10-2383-2017.pdf`) works from a script with no
bot check. The same folder-level sharing action every other row is waiting on applies here too — see
`SOURCES.md`, note E.
