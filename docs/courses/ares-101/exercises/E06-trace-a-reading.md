---
promptText: "Work the exercise below and submit the five deliverables, labelled, in the order the page gives them. This is a pure reading exercise across two repositories - ARES2ESP32 (src/main.cpp and app/lib/) and this course - and you will not write a line of code and will not run anything. Give every one of the seventeen hops its own row: where it happens, the file and the line, whether the number was MOVED, CHANGED or WITHHELD, and what happens to it. A trace that skips a stage has missed the point of the exercise, so an omitted hop costs you more than a debatable classification of one you did trace. Two rows are filled in for you and they set the level of detail expected. Then say where error enters, hop by hop: the two most consequential things that happen to a chin reading are invisible in every layer above them, and naming them and saying what they cost is the whole difference between a trace and a table of contents. Carry the worked number all the way through - the sensor's raw reply is a Z line reading 00185, forty seconds after power-on, with a stored chin offset of minus 12 ppm. State its value at hops 5, 8, 11, 13 and 17 with units, and say what changes if the same reply arrives at 20 seconds instead of 40. Defend your count of how many times the reading is changed between the gas and the screen; reasonable people draw the line between an encoding and a change in different places, and saying why you drew yours where you did is the answer, not the number itself. Answer the swapped-connector question in three sentences. Finish with one hop you would change, naming what breaks, who has to be told, and what it buys - same standard as E04, where a preference is not an argument. Cite a file and a line for every claim you make about the code: an assertion with no line number behind it cannot be checked by the person reading your trace, which is the only thing a trace is for."
minWords: 300
passThreshold: 70
rubric:
  - id: chain
    point: "THE COMPLETENESS REQUIREMENT, and half the reason this exercise exists - weight it accordingly. All seventeen hops are present, each carries a file and a line, and none is silently dropped. A trace that skips a stage has missed the point, so score an omission harder than a debatable verb on a hop that was actually traced. Hops 1 and 5 were supplied and earn nothing. The hops people actually drop, and the ones to check for first, are these. Hop 6, readCO2WithRetry at main.cpp:587, three attempts with a 50 ms gap, which is a hop even on the pass where it succeeds first time. Hop 7, the warm-up gate at main.cpp:636 with co2WarmingUp at 584. Hop 10, where the six-step cycle returns true, and the answer must name BOTH consumers that return value gates - a CSV row and a history sample - because naming one is the common half-answer. Hop 12, recordHistory, which is a second and entirely separate store with its own type and its own no-data convention and is not the CSV. And hop 14, over the air, which is a real hop even though the exercise has already classified it as moved. Full credit also requires the two-language boundary at hops 13 to 15 to be crossed explicitly, naming sendBleNotify in C++ at main.cpp:1151 and parseLivePacket in Dart at ble_service.dart:300 and stating that nothing but a comment in each file connects them, which is what C20 means when it says a GATT service is a contract rather than an API. Award partial for a trace missing one or two hops and complete elsewhere. Award missed for a list of files or functions with no per-hop rows, which is the failure the exercise names in its own words as a table of contents."
    weight: 4
  - id: error-entry
    point: "THE OTHER HALF, weighted equally with completeness - every hop classified MOVED, CHANGED or WITHHELD, and the places where error enters named together with what each one costs. The verbs must be applied to every row and not only to the interesting ones. The substantive judgements to look for. Hop 1, the A 32 digital filter, is a CHANGE that happens inside the SprintIR before Z is ever answered, so every value downstream is a 32-sample low-pass output rather than an instantaneous measurement, nothing downstream can undo it, and nothing downstream is told it happened. Hop 5, the multiplier, is the CHANGE that creates the resolution - the 0 to 20 percent part multiplies raw counts by 10, so the reading arrives on a 10 ppm grid carrying a quantisation standard deviation of 2.9 ppm per C16, and about 4.1 ppm once two pods are subtracted per C21. Hop 7 is a WITHHOLDING rather than a flag on a value: for the first 30 seconds the reading is not taken at all, co2Ok stays false and co2Warmup is set on a separate channel, so a consumer that reads only the CO2 field sees an error sentinel and cannot distinguish a warm-up from a failure. Hop 8 is a CHANGE that is also a correction, and the correction is never recorded anywhere - per C20 the offsets persist in NVS namespace cal and no column in the file says which were in force, so two runs recorded a week apart are structurally identical and not comparable. Hop 11 is where the 5-second throttle puts the file at 0.2 Hz, below Nyquist for a 0.25 Hz breath, so breathing is not merely noisy in the CSV but absent, and aliases into a slow wander that looks exactly like a real trend. Hop 16 is an optional multiply by 1013.25 over press_hpa that exists only at the display layer and never reaches the file. Full credit needs at least four of those six named as places error enters, with the cost stated rather than the mechanism restated. Partial credit for a fully classified table that names two or three. Award missed if the verbs are assigned throughout but no hop is identified as a place where the number stops being the number that went in."
    weight: 4
  - id: worked-number
    point: "The worked number, carried the length of the chain with units, and arithmetic that closes. Raw Z 00185 is 185 counts, so at hop 5 the value is 185 times the multiplier 10, or 1,850 ppm. At hop 8 the stored chin offset of minus 12 is applied, giving 1,838 ppm - and the observation worth extra credit is that 1,838 is not a multiple of 10, which is precisely the off-grid fingerprint C21 and V17 describe: an off-grid reading tells you an offset is in force and does not tell you what it is. At hop 11 the CSV carries 1,838 in the chin CO2 column, co2_ppm3. At hop 13 the same 1,838 goes into the LIVE payload as an unsigned 32-bit little-endian value inside the leading CO2 block; credit an answer that names the byte offsets it read out of sendBleNotify and is internally consistent with the 26-byte layout C20 tables, rather than requiring one particular pair of numbers. At hop 17 the card shows 1,838 with the correction toggle off and, at the 950 hPa of C20 and V17, 1,838 times 1013.25 over 950, or about 1,960 ppm, with it on - roughly 122 ppm away from the number in the file for the same instant, with the science models under app/lib/science consuming the uncorrected one. Then the 20-second version, which is the real test of whether the trace was understood rather than transcribed: co2WarmingUp is millis under 30000, so at 20 seconds the read is never attempted, co2Ok is false, co2Warmup is set, and the absence is expressed five different ways down the chain - the string null in the CSV, 0xFFFFFFFF over BLE, minus 1 in the history ring, Dart null after parsing, and a warming-up state on the card. Award partial to an answer that gets 1,850 and 1,838 right but does not carry them past the CSV. Award missed to one that never states the 20-second case, because that case is the only place the trace is tested against a condition rather than a value."
    weight: 3
  - id: identity
    point: "The thing the exercise sends the learner looking for, and it is deliberately not on the list of four things it says earn no credit. Where in this chain the identity of the pod, chin as opposed to index 2, is actually established. The answer per C20 is that it is established in exactly two places and neither of them is a measurement: the pin defines at the top of main.cpp, and the label row of the CSV header. Nothing anywhere in the chain checks either against the wiring, because the three parts are identical and there is no probe that could tell them apart. So the swapped-connector question has an uncomfortable answer, and that answer is that NO HOP NOTICES. Every layer downstream keeps its labels - the CSV still calls co2_ppm3 CHIN, the app still draws the third card as CHIN, the offset stored under key c2 is still applied to whatever is now plugged into that port, and the rebreathed fraction is computed from the wrong end of the head with nothing anywhere raising an error. Full credit requires that conclusion stated plainly, plus the consequence GLOSSARY.md draws from it: name pods, never sensor 1 2 3, because the index-to-pod mapping is a wiring convention held in place by care rather than by anything the software can verify. Award partial for locating the two places but hedging the swapped-connector answer. Award missed for any answer supposing some layer would catch it."
    weight: 3
  - id: count
    point: "The count, and specifically its defence. The exercise says outright that reasonable people will differ on whether an encoding is a change, so the number on its own earns nothing and the line drawn earns everything. A defensible answer states the rule before applying it - for instance that a change is any operation after which a different physical quantity comes out than went in, which makes the A 32 filter, the multiplier and the offset changes, and makes the ASCII-to-integer parse, the little-endian packing and the Dart decode moves. Credit an answer that draws the line elsewhere and holds it consistently, including one arguing that the narrowing at the history ring is a change because it can lose information, or that the display-layer pressure correction is a change even though it is optional and never logged. Award missed for a bare number with no stated rule, and for a rule the answer's own table then contradicts."
    weight: 2
  - id: one-hop
    point: "Deliverable 5, held to the standard E04 sets and this exercise restates - a preference is not an argument. One hop the learner would change, with what breaks, who has to be told, and what it buys, all three of them and not just the first. The strongest available changes, though any well-argued one earns the point: log the three calibration offsets as columns so hop 8 stops being invisible, which per C20 means appending them to the END of the CSV so that no existing column index moves, and telling every consumer of the file including the analysis scripts and the legacy web dashboard; or make hop 12's no-data convention match hop 11's so that a new consumer does not have to learn five representations of one condition; or raise hop 11 above the 0.2 Hz that puts breathing below Nyquist, which costs SD write bandwidth and card life and changes the row spacing every existing script assumes. Award missed for a change with no cost stated, and for the answer that the contract should simply carry a version number or a schema, offered without saying what that costs across two codebases that are updated independently and can never be assumed to both be current."
    weight: 2
referenceAnswer: |
  DRAFT - pending ARES team review. Drawn from the exercise text, C16, C20, C21, V17 and
  GLOSSARY.md. It encodes claims about ARES firmware and app internals that a drafter working from
  the course text rather than from the repository will get wrong in places, and the line numbers
  below are the ones this course already cites. Check them against ARES2ESP32 before publishing.

  ONE CLAIM IN HERE IS EXPLICITLY UNVERIFIED. The exact byte offsets of the chin pod's CO2 field in
  the 26-byte LIVE payload, and which bit of byte 24 is the chin warm-up flag, are not stated
  anywhere in this course - C20 tables the payload's contents and its size but not its offsets. The
  rubric therefore asks for an answer that is internally consistent with what the learner read in
  sendBleNotify, not for a particular pair of numbers. If the team wants those graded exactly, put
  the real offsets in this reference answer and tighten the rubric point.

  WHAT A GOOD TRACE CONTAINS

  Five deliverables, two pages at most. The seventeen-row table with a file and a line on every row;
  the worked number stated at hops 5, 8, 11, 13 and 17 plus the 20-second variant; a defended count;
  the swapped-connector answer in three sentences; and one hop the learner would change with its
  cost. The standard throughout is that a reader could check any row without asking a question.

  Two things separate a good answer from a plausible one, and both are about the second and third
  verbs rather than the first. A trace made entirely of MOVED rows is a table of contents that has
  been reformatted. And the two most consequential things that happen to a chin reading, hop 1's
  filter and hop 5's multiplier, are both invisible in every layer above them - which is the general
  lesson and the reason the exercise picks a number rather than a diagram.

  THE CHAIN, HOP BY HOP

  0. The gas reaches the sensor. Out of scope; C17's transport delay lives here.
  1. GIVEN. The A 32 digital filter, set once in probeAndInitCO2 at main.cpp:427. CHANGED, inside
     the sensor, irreversibly, and unannounced.
  2. co2Port(2) at main.cpp:316. MOVED. CO2Serial2 is torn down, re-begun on the chin pins, given a
     25 ms settle, and drained of stale bytes - the drain is itself a WITHHOLDING of whatever the
     neighbour sensor left in the buffer, and an answer that notices that has read the function
     rather than its name.
  3. co2Command() at main.cpp:332 sends Z and captures the reply line, with CO2_RESP_TIMEOUT_MS of
     500 ms to answer. MOVED.
  4. co2ParseValue() at main.cpp:349 decodes the letter-and-digits framing to an integer, 185.
     MOVED - an ASCII encoding becomes a binary one and nothing about the quantity changes.
  5. GIVEN. readCO2() at main.cpp:376 applies the multiplier learned at boot from the . command:
     185 x 10 = 1,850 ppm. CHANGED, and this is where the 10 ppm grid comes from.
  6. readCO2WithRetry() at main.cpp:587. Three attempts, 50 ms apart. MOVED on success; on
     exhaustion the read is WITHHELD and co2Ok goes false.
  7. The warm-up gate at main.cpp:636, co2WarmingUp() at 584. WITHHELD for the first 30 seconds:
     the value is not taken at all, and co2Warmup is set on a separate channel instead.
  8. applyCO2Offset() at main.cpp:573, called at 642. CHANGED: 1,850 + (-12) = 1,838 ppm. Every
     consumer downstream sees the corrected number and none of them is told what the correction was.
  9. Landing in co2Ppm[2], co2Ok[2], co2Warmup[2]. MOVED.
  10. main.cpp:644 - the six-step cycle wraps and returns true. This is the only signal in the
      system that a complete set of readings exists, and it gates two consumers: a CSV row and a
      history sample. Name both.
  11. logData() at main.cpp:716-723 writes column co2_ppm3, the chin. MOVED, with a 5-second
      throttle that puts the file at 0.2 Hz. When co2Ok[2] is false the literal string null is
      written - a WITHHOLDING at the row level.
  12. recordHistory() at main.cpp:840. MOVED, with a type narrowing and a different no-data
      convention: minus 1 rather than null.
  13. sendBleNotify() at main.cpp:1151. MOVED into the LIVE payload as an unsigned 32-bit
      little-endian value; a failed read is sent as the sentinel 0xFFFFFFFF, and the warm-up bit for
      this pod rides in byte 24's bitmask beside a CO2 field that is simultaneously carrying its
      error sentinel. Two channels, one state.
  14. Over the air. MOVED, and it is still a hop.
  15. parseLivePacket() at ble_service.dart:300. MOVED - and this is the boundary, where a C++
      function and a Dart function agree with each other by comment alone, in two repositories that
      can be updated independently and never both be assumed current.
  16. home_screen.dart:1111. A branch on showCorrected, which reaches co2_correction.dart and
      multiplies by 1013.25 / press_hpa. MOVED down one side, CHANGED down the other.
  17. pod_card.dart:83 draws the number, with the colour decided at :26. MOVED.

  THE WORKED NUMBER

  Raw 185 counts. Hop 5: 185 x 10 = 1,850 ppm. Hop 8: 1,850 - 12 = 1,838 ppm. Hop 11: 1,838 in
  co2_ppm3. Hop 13: 1,838 as a little-endian uint32 in the CO2 block. Hop 17: 1,838 with the toggle
  off; 1,838 x 1013.25 / 950 = about 1,960 ppm with it on at 950 hPa, roughly 122 ppm away from the
  file for the same instant, and the science models consume the uncorrected 1,838.

  1,838 is not a multiple of 10. That is the fingerprint from C21 and V17: an off-grid reading says
  an offset is in force and says nothing about its size.

  At 20 seconds instead of 40, none of the above happens. co2WarmingUp() is millis() < 30000, the
  read is not attempted, co2Ok[2] is false and co2Warmup[2] is set. The one condition then appears
  as null in the CSV, 0xFFFFFFFF over BLE, minus 1 in the history ring, Dart null after parsing, and
  warming up on the card. Five representations of one state across four layers, none of them wrong
  and each idiomatic for its own layer - which is exactly what it costs anybody writing a sixth
  consumer.

  THE COUNT

  There is no correct number and the exercise says so. A defensible answer states its rule first.
  Under the rule that a change is any operation after which a different physical quantity comes out
  than went in, the count is three - hop 1, hop 5, hop 8 - plus a conditional fourth at hop 16 when
  the toggle is on. Under a stricter rule that counts any loss of information, the narrowing at hop
  12 makes it four or five. Both are creditable. A bare number is not.

  THE SWAPPED CONNECTORS

  No hop notices. Pod identity is fixed in exactly two places, the pin defines at the top of
  main.cpp and the CSV header's label row, and nothing in the chain compares either against the
  wiring, because the sensors are identical and no probe can distinguish them. The consequence is
  that every layer keeps its labels, the chin offset in NVS key c2 is applied to whatever is now on
  that port, and the rebreathed fraction is computed from the wrong end of the head silently. That
  is the reasoning behind GLOSSARY.md's rule to name pods rather than sensor numbers.

  ONE HOP TO CHANGE

  The strongest candidate is hop 8: log the three offsets. They are applied to every reading before
  anything downstream sees it and no column records them, so two sessions taken under different
  calibrations produce structurally identical, non-comparable files. What breaks: the CSV schema,
  which per C20 means appending the columns at the END so no existing index moves. Who has to be
  told: everyone holding an analysis script, the web dashboard, and anyone with an SD card in a
  drawer whose file now has a different header from the next one. What it buys: two sessions become
  comparable, and M10's error budget becomes writable from the file rather than from someone's
  memory. Any change argued to that standard earns the point; a change with no stated cost does not.
---

# E06 — Trace a reading end to end

> ASSIGNMENT section · ARES 101 · M9 · ~2 min to read, 60–90 minutes with two files open
> This body is seeded into `contentJson` as the learner-facing context; the frontmatter above is the
> section's `assignmentConfig`, and its `rubric` and `referenceAnswer` are author-only — they are never
> served to a learner. Depends on `C20` (the state machine, the buses, the BLE
> contract, the CSV schema) and `C16` (the GSS ASCII protocol, `Z`, the `.` multiplier, the warm-up).
>
> **This is a reading exercise. You will not write a line of code, and you will not run anything.**
> It is here because it is the fastest way anybody has found to learn a codebase, and because the
> people who can debug this system are the people who can say, without looking, what happens to a
> number between the sensor and the screen.
>
> You need two repositories open: `ARES2ESP32` (`src/main.cpp` and `app/lib/`), and this course.

---

## The task

**One chin-pod CO₂ reading. Follow it from the wire to the screen, and write down every single thing
that happens to it.**

Not "it goes to the app". Every hop, with a file and a line number, and — this is the part that is
worth the hour — a note at each hop saying whether the number was **moved**, **changed**, or
**withheld**.

Those three verbs are the whole exercise:

- **Moved** — the same value, in a different place or a different encoding. A `uint32` becomes four
  bytes little-endian. Nothing is lost and nothing is added.
- **Changed** — a different number comes out than went in. A multiply. An addition. A rounding.
- **Withheld** — the value exists and is deliberately not passed on. A suppression, a sentinel, a
  `null`.

Most people, asked to trace a reading, produce a list of files. A list of files is a table of contents.
The interesting content of this system lives entirely in the second and third verbs, and by the end of
this you should be able to say how many times a chin reading is changed before you see it, and by how
much.

## Why the chin pod specifically

Because it is the awkward one, and the awkward one is where the design is visible.

The chin pod is **CO₂ sensor index 2** in the firmware, which is the **third** sensor, which shares its
UART with sensor index 1, which is the forehead. It is also the pod whose number goes into the
numerator of the rebreathed fraction (`GLOSSARY.md` §2), so it is the reading this entire project is
built to obtain. If any hop in the chain is going to matter, it matters here.

Take one specific reading so you have something concrete to hold: **the sensor's raw reply is
` Z 00185`**, forty seconds after power-on, with a stored chin offset of `−12` ppm. Carry that through
every hop and say what it looks like at each one. You should be able to state, at the end, exactly what
appears in the CSV, exactly which four bytes go over BLE, and exactly what is drawn on the card.

## The hops, in order

You are filling in this table. Two rows are done for you, to show the level of detail expected —
everything else is yours.

| # | Where | File · line | Moved / changed / withheld | What happens |
|---|---|---|---|---|
| 0 | The gas reaches the sensor | — | — | *`C17`'s subject. Transport delay through the sample line. Out of scope here — start at the sensor's output.* |
| 1 | Inside the sensor: the digital filter | `main.cpp:427` sets it, at boot | **changed** | `A 32` was written once during `probeAndInitCO2()`. The filter runs **inside the SprintIR**, so by the time `Z` is answered the value is already a 32-sample low-pass output, not an instantaneous measurement. **Nothing downstream can undo this and nothing downstream knows it happened.** |
| 2 | Selecting the port | `co2Port(2)`, `main.cpp:316` | moved | | 
| 3 | Sending `Z`, capturing the line | `co2Command()`, `main.cpp:332` | | |
| 4 | Decoding `<letter> <digits>` | `co2ParseValue()`, `main.cpp:349` | | |
| 5 | Applying the multiplier | `readCO2()`, `main.cpp:376` | **changed** | `ppm = raw × co2Multiplier[2]`. The multiplier was learned at boot from the `.` command, not hardcoded. On the 0–20 % part it is 10, which is where the 10 ppm quantisation comes from — see `C16`. |
| 6 | Retry on failure | `readCO2WithRetry()`, `main.cpp:587` | | |
| 7 | The warm-up gate | `main.cpp:636`, `co2WarmingUp()` at 584 | | |
| 8 | The software offset | `applyCO2Offset()`, `main.cpp:573`, called at 642 | | |
| 9 | Landing in firmware state | `co2Ppm[2]`, `co2Ok[2]`, `co2Warmup[2]` | | |
| 10 | The cycle completes | `main.cpp:644` | | *What does the returned `true` gate? Name both consumers.* |
| 11 | The CSV row | `logData()`, `main.cpp:716–723` | | *Which numbered column? What is written when `co2Ok[2]` is false?* |
| 12 | The history ring | `recordHistory()`, `main.cpp:840` | | *Note the type change and the different "no data" convention.* |
| 13 | The BLE `LIVE` payload | `sendBleNotify()`, `main.cpp:1151` | | *Which byte offsets? Which bit of byte 24? What is sent when the read failed?* |
| 14 | Over the air | — | moved | |
| 15 | Decoding in Dart | `parseLivePacket()`, `ble_service.dart:300` | | |
| 16 | Reaching the widget | `home_screen.dart:1111` | | *There is a branch here. Both sides are real. Say what decides it.* |
| 17 | Drawn on the card | `pod_card.dart:83`, colour at `:26` | | |

Seventeen hops for one number, and the two most consequential things that happen to it are hops 1 and
5, both of which are invisible in every layer above them.

## Four things you should notice, and one you should go looking for

You will not get credit for finding these — they are here so you know the exercise has a floor. The
question at the end is about the thing that is *not* on this list.

**1 · The "no data" convention changes three times.** A failed read is `co2Ok[2] = false` in firmware
state, the string `null` in the CSV, `0xFFFFFFFF` in the BLE payload, `-1` in the history ring, and
Dart `null` after parsing. Five representations of one condition, across four layers. None of them is
wrong; each is idiomatic for its layer. Write down what that costs anybody writing a new consumer.

**2 · The offset is applied before everything.** Hop 8 happens before the CSV, before BLE, before the
history ring. Every consumer sees the corrected number, and **no consumer is told what the correction
was.** Now say what that means for two runs recorded a week apart.

**3 · Warm-up is a suppression, not a flag on a value.** During the first 30 seconds the reading is not
taken at all — `co2Ok[2]` stays false and `co2Warmup[2]` is set instead. So the warm-up bit in byte 24
travels beside a CO₂ field that is simultaneously carrying its error sentinel. Two channels describing
one state. Ask yourself what a consumer that reads only the CO₂ field would conclude.

**4 · Hop 16 is a branch and the CSV never takes it.** Find `showCorrected` and follow it to
`co2_correction.dart`. Then say plainly: at 950 hPa, what is the difference between the number on the
chin card and the number in `co2_ppm3` for the same instant, and which of the two does `C19`'s
rebreathed-fraction model consume?

**And the one to go looking for.** Somewhere in this chain there is a step where the identity of the
pod — *chin*, as opposed to *index 2* — is established. Find it. Write down every place that decision
is recorded, and then answer the question: **if two connectors were swapped on the bench, which hop
would notice?** `GLOSSARY.md` makes a rule about naming pods on the strength of the answer, and you are
now in a position to see why.

## What to hand in

Two pages at most.

1. **The completed table.** All seventeen rows, file and line for each, and every hop classified moved
   / changed / withheld.
2. **The worked number.** ` Z 00185`, 40 seconds after boot, chin offset `−12`. State the value at hops
   5, 8, 11, 13 and 17, with units, and say what changes if the same reply arrives at 20 seconds
   instead of 40.
3. **A count.** How many times is a chin reading changed between the gas and the screen? Defend your
   count — reasonable people will differ on whether an encoding is a change, and saying *why* you drew
   the line where you did is the answer.
4. **The swapped-connector question**, in three sentences.
5. **One hop you would change**, with the cost of changing it. Same standard as `E04`: a preference is
   not an argument. Name what breaks, who has to be told, and what it buys.

## How to actually do this without drowning

`src/main.cpp` is 1,740 lines and you should not read it front to back.

**Search, do not scroll.** Start from `co2Ppm` and find every reference to it. Six or seven results,
and they are most of your table. Then do the same for `co2Ok`, then `co2Warmup`. Following one variable
through a program is a different skill from reading the program, it is much faster, and it is the one
you want.

**Read the comments in this file.** Whoever wrote `main.cpp` left the reasoning inline — the block above
`co2Port()`, the block above `probeAndInitCO2()`, the note above `sdSpaceTask()`. They explain *why*,
which is the thing you cannot recover from the code. Treat them as part of the source.

**Cross the boundary once and carefully.** The jump from `sendBleNotify()` to `parseLivePacket()` is
the only place in this trace where you leave one language and enter another with nothing connecting
them but a comment. Put the two functions side by side on one screen. It is a thirty-second read and it
is the single clearest illustration in the whole codebase of what `C20` means by a contract.

**Do not go into `lee_pump.cpp`, the web dashboard, or the science models.** None of them is on this
path. The pump moves the gas that hop 0 is about; the dashboard is a parallel consumer; the science
models start where this trace ends. `C17`, `C19` and `M10` are their modules.

---

## Why this is worth an hour

Because every debugging conversation this project will have for the next two years is a version of
this trace, run backwards.

*The chin pod reads 200 ppm higher than the others.* Is that the gas, the sensor, the offset at hop 8,
or a swapped connector? *The app shows a value and the CSV shows `null` for the same second.* Which of
hops 11 and 13 is disagreeing, and why would they? *The plot has a slow oscillation nothing can
explain.* Is that breathing, aliased below Nyquist by hop 11's 5-second throttle?

None of those is answerable by someone who knows the system as three boxes and two arrows. All of them
are answerable in about a minute by someone who has done this once. That is the entire argument, and it
is why this exercise has no code in it.
