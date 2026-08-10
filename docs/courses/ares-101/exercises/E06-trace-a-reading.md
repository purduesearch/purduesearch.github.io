# E06 — Trace a reading end to end

> CONTENT section · ARES 101 · M9 · ~2 min to read, 60–90 minutes with two files open
> Seeded into `contentJson` as rich text. Depends on `C20` (the state machine, the buses, the BLE
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
