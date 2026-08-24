---
pdfDriveFileId: PENDING_UPLOAD_SEE_SOURCES_MD_OPEN_ACTION_2
pdfTitle: A Review of Embedded Software Architectures for Multi-Sensor Wearable Devices (Toptsis et al., 2026)
citation: Toptsis, M., Karkanis, N., Giannakoulas, A., & Kaifas, T. (2026). A review of embedded software architectures for multi-sensor wearable devices: sensor fusion techniques and future research directions. Electronics, 15(2), 295. https://doi.org/10.3390/electronics15020295
promptText: This is a review of how multi-sensor wearables are built, and ARES is a multi-sensor wearable. Read it against the firmware rather than on its own, and answer in at least 200 words. IMPORTANT SCOPE - read Section 2, Section 3.1 and 3.3, Section 5 in full, and Section 7.2 and Section 9. You may SKIP Section 4 entirely and all of Section 6. Section 4 is Kalman-family sensor fusion (EKF, UKF, particle filters) and it is past what this course assumes you have had; nothing you are asked below depends on it, and a reader who tries to work through it will stall and conclude the course misled them about the prerequisites. Now, five things. First, trace the sensing-to-storage path in ARES in your own words, from the byte on a UART to the row on the SD card and the packet on the phone - name the state machine, the rates involved, and where in the path an offset, a suppression or a sentinel changes the number. Second, pick at least one bus or timing constraint from the firmware and explain why it exists, not just what it is; the shared UART and the six-step state machine are the two obvious candidates and either is a full answer if you get the reason right. Third, say where the boundary between headset and phone falls and why each responsibility sits where it does - the wall clock is the sharpest example and you should use it. Fourth, connect the paper to the firmware in both directions - name one thing the paper describes that ARES already does, and one thing it recommends that ARES does not do. Section 5 and Table 8 are where this lives. Fifth and most important, make one substantiated critique of an ARES design decision. Substantiated means you name the decision, say what it costs and in what circumstance, and say what you would do instead and what that would cost. A critique with no cost on both sides is a preference, not an argument.
minWords: 200
rubric:
  - id: pipeline
    point: Traces the sensing-to-storage path accurately end to end. The path is - probeAndInitCO2 establishes presence and the ppm multiplier at boot, updateSensorReadings advances sensorStep 0 to 5 one step per loop with steps 0 to 2 reading the SHT45s and 3 to 5 the CO2 sensors, readCO2WithRetry calls readCO2 up to three times, readCO2 calls co2Port to select the UART then co2Command to send Z and capture the reply then co2ParseValue to decode it, the raw count is multiplied by the per-sensor multiplier from the dot command, applyCO2Offset adds the NVS-stored software offset and clamps, the value lands in co2Ppm and co2Ok, and step 5 returns true which gates both a CSV row and a history sample. From there it goes two ways - logData writes a 30-column row every 5 seconds, and sendBleNotify packs a 26-byte LIVE payload at about 1 Hz which parseLivePacket in the Flutter app decodes into a LiveData object. Full credit requires naming at least three places where the number is changed or withheld rather than merely moved - the multiplier, the software offset, the warm-up suppression in the first 30 seconds which sets co2Warmup and leaves co2Ok false, and the 0xFFFFFFFF sentinel that a failed read becomes in the BLE payload while the CSV writes the string null for the same condition. Do not give full credit to an answer that says the reading goes to the SD card and the app without naming a transformation.
    weight: 3
  - id: constraint
    point: Explains at least one bus or timing constraint and why it exists. Either of the two main ones earns the point in full. The shared UART - CO2 sensors 2 and 3 share CO2Serial2, co2Port ends the port, re-begins it on the target sensor's pins, waits 25 ms and drains the receive buffer before every access, and the reason is that UART carries no addressing at all, so two live sensors on one port produce bytes that no receiver can attribute; the drain exists because the other sensor's stale bytes would parse perfectly as this sensor's answer. Strong answers connect this to the K 0 first boot order from C16 - a sensor left in GSS streaming mode corrupts its neighbour's reads, not its own. The state machine - one sensor per loop iteration rather than all six, because a blocking read of an absent CO2 sensor costs three retries at a 500 ms timeout plus settling, roughly 1.7 s, and six of those in one iteration would stall BLE notifies, SD logging and the button for about 5 s. Full credit for noticing what the state machine does not do, which is make anything non-blocking - each step still blocks, and what changes is that the worst iteration is one sensor's worst case rather than six. The paper's language for this is the super-loop with ISRs in Section 5.1. Credit also for the I2C variant - two SHT45s share Wire and are torn down and re-inited each read while the forehead sensor holds a dedicated TwoWire(1) open, so the three pods are not software-symmetric.
    weight: 2
  - id: boundary
    point: Says where the headset-phone boundary falls and why each responsibility sits on its side. The headset owns acquisition, arbitration, calibration offsets, logging and anything that must keep working alone; the phone owns the wall clock, GNSS, barometric pressure, the watch bridge, the physiology models, and the UI. The wall clock is the example that must appear for full credit - an ESP32-S3 has no RTC and no backup battery, so millis() is monotonic but has no zero point, and the epoch arrives in bytes 33 to 36 of the PHONE characteristic from the device whose clock is network-synchronised. Full credit requires the mechanism, not just the fact - the firmware stores phoneEpoch together with phoneEpochRxMs and reconstructs wall clock at write time as phoneEpoch plus the elapsed millis difference, so the imported value supplies the offset and the local monotonic clock supplies the interval. Credit for naming the complement - the boot counter in NVS, which needs no phone at all and makes rows from different runs distinguishable and orderable, so the pair of boot plus elapsed timestamp is a unique key even with no clock in the system. Credit for noting the honest failure mode, which is that stale phone data writes null in the epoch column rather than an extrapolation. The strongest answers observe that the boundary is drawn so the headset degrades rather than fails when the phone is absent.
    weight: 2
  - id: paper
    point: Connects the paper to the firmware in both directions, with specifics from the text rather than a general gesture. Things ARES already does that the paper describes - a tiered communication strategy with wired links for sensing and BLE for the phone, which is the hybrid architecture Section 3.3 says wearables adopt in practice; buffering to decouple acquisition from consumers, which ARES does with the 720-sample history ring and the incremental SD free-space cache; and the modular scalability argument in Section 7.2, which is the append-only CSV column rule and the length-gated PHONE payload. Things the paper recommends that ARES does not do - the biggest is the RTOS. Section 5.1 says bare-metal concurrency is managed by a super-loop with interrupt service routines that becomes difficult to maintain as complexity increases, and Table 8 rates the bare-metal super-loop as poor beyond a few sensors, degrading rapidly with complexity, and suitable for prototyping and simple devices, against an RTOS framework with preemptive priority scheduling recommended for deployable multi-sensor wearables at a cost of a few kilobytes of memory. Second, interrupt-driven acquisition - ARES polls, the paper's pipeline is triggered by a hardware interrupt into a high-priority task. Third and most relevant to ARES, high-resolution timestamping at acquisition against a common hardware timer - ARES timestamps at the row rather than at the sample, so a CSV row carries one time for six sensors read across six separate loop iterations. Partial credit for naming only the RTOS with no detail from Table 8.
    weight: 2
  - id: critique
    point: Makes one critique with a named decision, a stated cost, a circumstance in which the cost is paid, and an alternative with its own cost. Any defensible target earns the point; these are the strongest available and a learner is not expected to find all of them. The offsets are not recorded in the file - nine NVS-persisted calibration offsets are applied to every reading before it is logged and no column records which offsets were in force, so two runs with different calibrations produce structurally identical and non-comparable files. Timestamp granularity - one timestamp per row for six sensors sampled across six loop iterations, which is the paper's Section 2 point about a unified time base, and it matters at the moment M8 tries to infer flow direction from the lag between pods. The pressure correction is applied only at the display layer in the app, in co2_correction.dart via home_screen.dart, so the pod card can differ by several percent from the CSV for the same instant and nothing in the payload or the file records which convention a number was taken under. The index-to-pod mapping exists only in the pin defines and the CSV header label row and nothing can detect swapped connectors. A CSV header is written only when the file does not exist, so a card can carry an old header above new rows with no version marker. The CSV rate of 0.2 Hz puts breathing below Nyquist in the logged file. A sensor absent at boot is never retried. Reject as unsubstantiated any answer that says the firmware should use an RTOS or should be refactored with no cost named on either side.
    weight: 3
referenceSummary: |
  This is a peer-reviewed open-access review in *Electronics*, from the Department of Electrical and
  Computer Engineering at Democritus University of Thrace, published 9 January 2026 under CC BY. It
  surveys how multi-sensor wearable devices are built, at the level of software architecture rather
  than of any one algorithm, and it is assigned to M9 because M9 is the module in which ARES stops
  being a collection of sensors and becomes a system.

  It is important to be honest with a learner about what this paper is. It is a broad review, and the
  prose in several sections is general to the point of being unfalsifiable. It is not a study of one
  device with measurements in it, the way `campbell2026` or `zhou2024` are. What it does give, and what
  the module needs, is a vocabulary and a set of named trade-offs for the design decisions the ARES
  firmware has already made silently. A member who reads it will discover that half of what looks like
  arbitrary embedded fiddling in `main.cpp` is a recognised architectural pattern with a literature and
  a known failure mode.

  **Section 2, the real-time pipeline.** The paper frames the core problem as one of time, not
  throughput. Sensors run at different sampling rates and on independent clocks, so their data must be
  aligned in time before anything can be computed from it jointly, and the paper calls this "one of the
  most critical challenges". Its prescription has two halves. First, high-resolution timestamping -
  every sample is tagged, immediately upon acquisition, from a common high-resolution hardware timer,
  which establishes a unified time base across all streams. Second, RTOS synchronisation primitives -
  acquisition tasks signal an event flag or semaphore after depositing timestamped data in per-sensor
  circular buffers, and the consumer runs only when a complete and temporally consistent set is
  available. Table 3 contrasts three pipeline styles: a traditional polling pipeline with fixed buffers
  and software-layer timestamping, susceptible to buffer overflow; an RTOS plus ring-buffer pipeline
  with interrupt-driven high-priority acquisition and hardware timestamping; and an emerging
  middleware publish-subscribe approach. The point for ARES is uncomfortable and exact: ARES polls,
  ARES has no hardware timestamp per sample, and ARES timestamps at the row rather than at the reading,
  so one CSV row carries a single time for six sensors that were read in six separate `loop()`
  iterations spread over an indeterminate interval.

  **Section 3.1, the wired interfaces.** SPI is the high-throughput full-duplex choice, quoted at about
  10 Mbps over four wires, for parts like accelerometers where latency matters. I2C is the
  lower-bandwidth two-wire choice at roughly 100 kbps to 5 Mbps, and the paper names its actual
  advantage precisely - the ability to connect multiple slave devices to the same bus, reducing pin
  count. UART is described as a simple point-to-point link at about 1 Mbps over two wires, "primarily
  used for debugging and console output" but also for modules such as GPS receivers that emit a serial
  stream. BLE is the wireless leg, chosen for extremely low power and for an architecture "optimized
  for sending small, intermittent bursts of data". Section 3.3 concludes that wearables adopt hybrid
  architectures - high-speed wired links for sensing, low-power wireless for external connectivity -
  which is exactly the ARES shape.

  The gap between that description and the ARES headset is itself instructive and a learner should be
  encouraged to see it. The paper treats UART as the debug and GPS interface and treats I2C as the
  multi-device bus. ARES's primary measurement, CO2, arrives over three UARTs because the GSS SprintIR
  offers nothing else, which means the project inherits every consequence of a bus with no addressing:
  two sensors cannot share a live port, so `co2Port()` tears the port down, re-pins it, settles for
  25 ms and drains the receive buffer before every single access. That is not a pattern the review
  describes, because the review is written around motion sensors on SPI and environmental sensors on
  I2C. It is a reminder that a survey describes the centre of a field and a real project usually sits
  somewhere on its edge.

  **Section 5, the architectural choice.** This is the section the module leans on hardest. In
  bare-metal architectures firmware runs directly on the microcontroller with no operating system,
  which the paper credits with minimal memory footprint and very low processor overhead - attractive
  for ultra-low-power, resource-constrained devices. Then the criticism, and it describes ARES
  literally: "Concurrency is typically managed using a super-loop structure combined with interrupt
  service routines, which can become difficult to maintain as system complexity increases." Ensuring
  precise timing, deterministic behaviour and reliable synchronisation across multiple heterogeneous
  sensor streams "requires careful manual design and extensive testing", and bare-metal implementations
  "often suffer from limited scalability and increased risk of timing inconsistencies". An RTOS answers
  this with a preemptive priority-based scheduler, per-function tasks, semaphores, mutexes and message
  queues, plus tickless-idle power hooks.

  Table 8 is the compact form and it is the table to quote in an argument. Bare-metal super-loop:
  memory footprint minimal, under 2 KB; manual, non-deterministic timing; ISR-heavy and complex to
  scale; code entangled; power management is sleeping in the loop with custom code; maintainability
  "degrades rapidly with complexity"; overall suitability "prototyping, simple devices", and "poor
  beyond few sensors". RTOS-based framework: 2 to 10 KB; deterministic preemptive scheduling; native
  task synchronisation; high modularity; integrated tickless idle and sleep hooks; "recommended for
  deployable multi-sensor wearables". Section 5.3 adds the honest counterweight - adoption barriers are
  developer expertise, careful memory management and integration effort, and the paper's own listed
  research gaps include the absence of standardised benchmarks for comparing these architectures at
  all. So the recommendation is real, and the evidence behind it is a synthesis of practice rather than
  a measurement.

  **Sections 7 and 9.** Section 7.2 makes modular scalability an explicit design property - a
  well-built architecture accommodates new data streams "with minimal overhead" and without a system
  overhaul, and it names environmental sensors added alongside physiological ones as the case in point,
  which is precisely the SEN0465 and BME680 additions on the ARES roadmap. It also flags component
  variability and calibration as scaling problems in their own right. Section 9 concludes that
  lightweight fusion, RTOS-based architectures and mature communication protocols together support
  reliable deployment, and lists future directions - hardware-in-the-loop testing, on-device machine
  learning, adaptive fusion, energy harvesting, wireless security, standardisation and
  interoperability, and user-centred design. Of these, hardware-in-the-loop is the one an ARES member
  should notice: the paper describes it as integrating real sensors, microcontrollers and
  communication modules with simulated conditions, specifically to assess latency, synchronisation and
  fault tolerance - which is a description of a test rig ARES does not have and would benefit from.

  **Section 4 is out of scope for this course** and the prompt says so. It is a survey of fusion
  algorithms - complementary filters, EKF, UKF and square-root UKF, particle filters, and deep models -
  with Table 6 giving typical orientation errors of roughly 2 to 4 degrees for an EKF over
  accelerometer, gyroscope and magnetometer, and Table 11 rating embedded suitability as moderate for
  EKF, excellent for a complementary filter and limited for deep learning. It is competently done and
  it is about orientation estimation, which ARES does not do. A learner who wanders into it will spend
  forty minutes on Jacobian tuning and learn nothing that applies.

  **What a strong answer looks like.** The paper is a lens, not a source of results. The five rubric
  points are mostly about ARES, and the paper's job is to supply the names - super-loop, unified time
  base, hybrid communication architecture, modular scalability - and one genuine external judgement,
  which is Table 8's verdict that the architecture ARES uses is rated for prototypes and degrades
  rapidly past a few sensors, at exactly the moment the roadmap on slide 13 of the 7/30 deck roughly
  doubles the sensor count. The best answers hold both halves: that the review is describing a real
  limit ARES is walking toward, and that a review synthesising practice across a field is not the same
  evidence as a measurement, so "the paper says use an RTOS" is not on its own a reason to rewrite
  working firmware in the middle of a summer.
---

## Annotated bibliography

Short, by the rule in `lit/SOURCES.md`: nothing is cited until it has been resolved and read. The
assigned review's own reference list runs to 66 entries and none of them has been independently
verified against Crossref, so they are not reproduced here.

### Toptsis, M., Karkanis, N., Giannakoulas, A., & Kaifas, T. (2026). A review of embedded software architectures for multi-sensor wearable devices. *Electronics*, 15(2), 295.

The assigned reading, and **you are being asked to read about half of it.** Take it in this order and
skip what is not on the list.

1. **§2 Embedded System Constraints**, all of it, including Table 3. The timestamping and
   synchronisation argument is here, and it is the part of the paper that most directly indicts
   something ARES does.
2. **§3.1 and §3.3**, carefully. SPI, I2C and UART, Table 4, and the conclusion that wearables end up
   with hybrid wired-plus-wireless architectures.
3. **§5, all three subsections, and Table 8.** This is the highest-value section for M9 and the source
   of the only external judgement in the whole reading.
4. **§7.2**, for the modular-scalability and calibration-at-scale arguments.
5. **§9**, to check your reading, and for the hardware-in-the-loop paragraph.

**Skip §4 and §6 entirely.** §4 is Kalman-family sensor fusion — EKF, UKF, particle filters,
quaternion orientation estimation — and it assumes a background this course does not give you. Nothing
in the rubric touches it. §6 is power management and energy harvesting: piezoelectric, thermoelectric
and photovoltaic sources for wearables. It is interesting, it is not what you are being asked, and it
is thirty pages of reading you do not owe anybody today.

One warning about tone. Several passages in §7 are written in a general register — "a framework will be
better designed with these real-world deployment aspects in mind" — that does not tell you anything
specific. Do not spend time trying to extract a claim from those sentences. The load-bearing content of
this paper is in its tables and in §5, and you should read the tables closely and the connective prose
quickly.

### The ARES firmware repository. `ARES2ESP32`, `CLAUDE.md` and `src/main.cpp`.

**The document you are really comparing against**, and the reason `SOURCES.md` records that the
`CLAUDE.md` fallback for this module was considered and not taken. Four of the five rubric points are
about ARES rather than about the paper, and you cannot answer them from the paper. Have `main.cpp`
open beside the PDF; `C20` gives you the line numbers, and `E06` walks the same path one hop at a time
if you would rather do that first.

### Sanders et al. (2026), ICES-2026-75, and Campbell et al. (2026), ICES-2026-499.

Already assigned in M5 and M8. Both are relevant here for one thing only — they are examples of
instruments whose *data contracts* were designed rather than accreted, which is a useful contrast when
you are writing the `critique` rubric point. See `SOURCES.md`.

## Synthesis

### Why a general review, when the firmware is right there

The honest objection first: this paper is not about ARES, it contains no measurement of anything ARES
does, and a member could read `C20` and `main.cpp` and answer four of the five rubric points without
opening it.

That is true, and it is the argument for assigning it rather than against.

M9 is the module where a member first reads somebody else's code with real authority to judge it, and
the failure mode at that moment is not ignorance — it is **assuming the code is right because it
works**. Firmware that boots, logs, and streams is enormously persuasive. It carries no marks where a
decision was made under time pressure, no annotation distinguishing "this is the correct design" from
"this was what fit before the demo", and reading it alone teaches a member the shape of one system and
tells them nothing about which parts of that shape are choices.

The review supplies the missing axis. It says, in a table, that the architecture ARES uses is rated
for prototypes and simple devices and "degrades rapidly with complexity". That sentence is worth more
to a new member than any amount of code reading, because it converts an invisible default into a
decision somebody now has to defend.

### The one paragraph that should make an ARES member uncomfortable

Section 2's synchronisation argument, and specifically this: every sample tagged with a timestamp from
a common high-resolution hardware timer, immediately upon acquisition, establishing a unified time base
across all streams.

Now look at what ARES does. Six sensors are read in six separate `loop()` iterations. The interval
between the top pod's reading and the chin pod's reading in the same cycle is whatever those five
intervening iterations happened to cost — bounded above by roughly 1.7 s if a CO₂ sensor is failing and
retrying, unbounded in the sense that nothing measures it. Then one timestamp is written at the front
of the row, and the row asserts that all six numbers describe the same instant.

For temperature, that is fine. For the quantity this project exists to measure it may not be. `C19`'s
airflow model infers which pod is upstream from the **lag between concentration traces**. A lag
inference is a measurement of the time axis, and the time axis here has an unquantified per-sample
error built into the acquisition order. Nobody has measured how large it is. The instrumentation to
measure it — the `[SLOW LOOP]` timing print at `main.cpp:1733` — is already in the firmware and
already prints the per-section breakdown.

This is the highest-value thing in the whole reading, and it is one paragraph of a 29-page review.

### What the paper is right about, and where it stops being evidence

Table 8's verdict is a synthesis of practice. It is not an experiment, ARES is not in it, and Section
5.3's own admission is that standardised benchmarks for comparing these architectures **do not exist**
— that is listed as a research gap in the same section that makes the recommendation. So the correct
weight to give it is: a strong prior from a field's accumulated experience, not a result.

Which matters because the obvious critique to write is "ARES should move to FreeRTOS", and the obvious
critique is the weak one. FreeRTOS is already linked into the binary — the SD free-space scanner is a
pinned task and both the SD card and the BLE globals are guarded by mutexes. The sensor path is
bare-metal *by choice*, and moving it costs a rewrite of the acquisition layer, a new class of
concurrency bug in code that currently cannot have one because it is single-threaded, and a summer.
The `critique` rubric point exists to make a member say what a change costs, and this is the change
where that discipline bites hardest.

The stronger critiques are cheaper and more specific, and every one of them is visible from `C20`:
offsets applied but never recorded in the file; one timestamp per row for six sensors; a pressure
correction that exists only in the display layer so the card and the CSV disagree; a pod index bound to
a physical position by nothing but wiring care. Each of those can be fixed in an afternoon, each one
makes the data more trustworthy, and none of them requires believing a review.

### A note for whoever maintains this file

The load-bearing content here is Table 8, Table 3, Table 4, and the two quoted sentences from §5.1
about super-loops and about limited scalability. Everything else — the fusion tables, the power
sections, the wireless futures — is context and can go stale without breaking a rubric point.

The `pipeline`, `boundary` and `critique` points are graded against the **firmware**, not the paper, so
they will drift when the firmware does. If the acquisition path, the BLE payload, or the CSV schema
changes, re-read those three points against `C20` and fix both files together.

**Sharing and availability.** This paper is CC BY 4.0 and freely readable at
`https://doi.org/10.3390/electronics15020295`, but it has **not been uploaded to the Drive `Papers`
folder**, so `pdfDriveFileId` above is a deliberately unmistakable placeholder and this section will
not render a document to a learner until somebody uploads the PDF and replaces that value. That is open
action 2 in `lit/SOURCES.md`. The same folder-level sharing action every other row is waiting on
applies here too — see `SOURCES.md`, note E.
