# C20 — Sensor to screen, end to end

> CONTENT section · ARES 101 · M9 · ~5 min read
> Seeded into `contentJson` as rich text. Depends on `C16` (the SprintIR's ASCII protocol, the `.`
> multiplier, the 30-second warm-up) and `GLOSSARY.md` §5. `C17` and `C19` are useful but not required.
> This module is the taught version of the firmware repository's own `CLAUDE.md`. Every current-state
> claim names a file and, where it is a single constant, a line. **If you change one of those, change
> this file in the same commit.**

---

## Three devices, and the thing that actually matters

The system is a headset, a phone, and — optionally — a watch.

```
Garmin watch   ⇄   Flutter phone app   ⇄   ESP32-S3 headset
 (Connect IQ)         (app/, Dart)           (src/, C++)
```

That picture is on slide 2 of the 7/30 deck and it is the least interesting thing about the
architecture. Three boxes and two arrows is a diagram anyone could draw before writing a line of code.

**What matters is what travels along the arrows, and who is allowed to change it.** Every arrow above
is a boundary between two codebases written in different languages, compiled by different toolchains,
released on different schedules, and — this is the load-bearing part — **capable of being updated
independently of each other.** A phone app updates from the App Store. Firmware updates when somebody
finds a USB cable. There is no moment at which you can assume both sides are current.

Everything in this module follows from that. A contract between two codebases that can drift apart is
a different kind of object from a function signature inside one program, and it fails in a different
way: silently, in the field, producing numbers rather than errors.

## Blocking, and why the firmware refuses to do it

Start with the simplest possible firmware. Read all six sensors, write a row, repeat:

```c
loop() {
  read_sht(TOP); read_sht(FOREHEAD); read_sht(CHIN);
  read_co2(1);   read_co2(2);        read_co2(3);
  log_row();
}
```

This is correct, it is readable, and it is what almost everyone writes first. The problem is the word
`read`. Every one of those calls **blocks**: it sends something, then sits in a loop waiting for a
reply that arrives at the other device's convenience, and until it returns, nothing else in the program
happens at all.

Put the real numbers on it. A CO₂ read gives the sensor `CO2_RESP_TIMEOUT_MS` — **500 ms**
(`src/main.cpp:56`) — to answer, and `readCO2WithRetry()` will try **three times** with a 50 ms gap
(`main.cpp:587`). Each attempt also pays a 25 ms settle after re-pinning the shared port
(`co2Port()`, `main.cpp:323`). So one CO₂ sensor that has come unplugged costs

```
3 × (25 ms + 500 ms) + 2 × 50 ms  ≈  1.7 s
```

before the program moves on. Three of them, in one iteration, is about **five seconds** in which the
device is not a device. It is not answering BLE. It is not writing the SD card. It is not sampling the
other sensors. And the failure that produces this is the most ordinary one there is: a connector
worked loose.

That is why `updateSensorReadings()` is a **state machine** rather than a sequence.

### The six-step machine

`updateSensorReadings()` (`main.cpp:600`) does not read the sensors. It reads **one** sensor and
returns. A module-level integer, `sensorStep`, remembers where it got to:

| Step | What it does |
|---|---|
| 0 | read the top SHT45 (shared `Wire`) |
| 1 | read the forehead SHT45 (dedicated `Wire1Bus`) |
| 2 | read the chin SHT45 (shared `Wire`) |
| 3 | read CO₂ sensor 1 |
| 4 | read CO₂ sensor 2 |
| 5 | read CO₂ sensor 3, wrap `sensorStep` to 0, and **return `true`** |

That returned `true` is the only signal in the system that a *complete* set of readings now exists, and
it is what gates a CSV row (`main.cpp:1699`) and a history sample.

Be precise about what this buys, because the usual summary — "it makes the firmware non-blocking" — is
not true. Each step still blocks. What the machine changes is **how much of the program one bad sensor
can hold hostage**: the worst iteration is now one sensor's worst case (~1.7 s) rather than six
(~5 s), and every other thing `loop()` does — the button debounce, the calibration job, the BLE
notifies, the pump tick, the SD retry — gets a turn in between. The block is bounded and amortised, not
removed.

This is the classic embedded structure and it has a name: a **super-loop with cooperative
interleaving**. Each subsystem runs a short slice and yields by returning. There is no scheduler, no
preemption, and no thread that can be starved by another, because there is only one thread. What you
pay for that simplicity is that every slice must be *voluntarily* short, and nothing enforces it. The
paper in `L09` is largely about what you get instead if you let a real-time operating system enforce
it for you.

The firmware knows this is a risk and instruments it. `loop()` brackets each section with `micros()`
and prints a `[SLOW LOOP]` line with the per-section breakdown whenever one iteration exceeds 100 ms
(`main.cpp:1733`), plus a `[GAP]` line when the task was not scheduled for over 200 ms — which is what
a WiFi/BLE radio coexistence stall looks like from inside. **A design that depends on everyone
behaving needs a way to find out who did not.**

## Buses, addressing, and why two of the sensors cannot be on at once

"Bus" means several devices sharing one set of wires. That only works if a device can tell when it is
being spoken to, which means it needs an **address**.

- **I²C** has addressing built in. Two wires, and every transaction opens with a 7-bit address, so a
  dozen parts can share the pair and each answers only to its own.
- **UART** has none. It is two wires — one direction each — and a byte on the line is simply *there*.
  There is no header, no address, no arbitration, and no way for a receiver to know the byte was not
  meant for it.

So a UART link is strictly **point to point**, and the SprintIR speaks UART. `C16` establishes the
consequence for the protocol; here is the consequence for the wiring. The ESP32-S3 has three usable
UARTs, one of which is spoken for by the pump driver board, and there are three CO₂ sensors. The
arithmetic does not work, so two of them share a port and the firmware arbitrates by hand:

```c
HardwareSerial &co2Port(int idx) {          // main.cpp:316
  if (idx == 0) return CO2Serial1;          // sensor 1 owns UART1 outright
  CO2Serial2.end();                          // tear the port down
  CO2Serial2.begin(SENSOR_BAUD, SERIAL_8N1,  // rebuild it on the other sensor's pins
                   idx == 1 ? CO2_2_RX : CO2_3_RX,
                   idx == 1 ? CO2_2_TX : CO2_3_TX);
  CO2Serial2.setTimeout(CO2_RESP_TIMEOUT_MS);
  delay(25);
  while (CO2Serial2.available()) CO2Serial2.read();   // drain whatever is stale
  return CO2Serial2;
}
```

Read the last two lines again, because they are the ones that matter. The `delay(25)` is for the
hardware to settle after re-pinning. The **drain** is because bytes from the *other* sensor may still
be sitting in the receive buffer, and a parser cannot tell one sensor's ` Z 00040` from another's. The
whole safety of the scheme rests on the invariant that **only one of the two sensors is ever live on
that port**, and the drain is what recovers when that invariant was violated a moment ago.

`C16` gives the boot-time half of the same problem: GSS parts ship in streaming mode, so
`probeAndInitCO2()` sends `K 0` first, up to three times, before anything else (`main.cpp:409`). A
sensor still streaming when the port is re-pinned does not corrupt its own channel. It corrupts its
**neighbour's**.

The I²C side has a smaller version of the same story, and it is why the pinout table has an oddity in
it. Two SHT45s share the `Wire` bus at different pin pairs, so `readSharedWireSensor()` calls
`Wire.end()`, re-`begin()`s on the target pins, and constructs a fresh driver object every read
(`main.cpp:283`). The forehead SHT45 does not go through any of that: it has its own `TwoWire(1)`
instance, brought up once in `setup()` (`main.cpp:1464`) and left open for the life of the device. One
sensor gets a dedicated bus and holds state between reads; two share a bus that is demolished and
rebuilt every time. **The three pods are not symmetric in software even though they are symmetric on
the drawing**, and anybody comparing pod-to-pod timing should know which one is which.

## A GATT service is a contract, not an API

Bluetooth Low Energy does not have function calls. What it has is **GATT**: a small hierarchy of
named values that a client can read, write, or subscribe to.

- A **service** is a UUID that groups related values. ARES has one: `4fafc201-…`.
- A **characteristic** is a UUID naming a single value inside that service, with permissions —
  readable, writable, or **notify**, which means the peripheral pushes the value when it changes.
- The value itself is **an array of bytes**. GATT has no opinion about what they mean.

That last point is the whole of this section. The transport guarantees delivery and nothing else. What
byte 12 *means* exists in exactly two places: `sendBleNotify()` in `src/main.cpp` and
`parseLivePacket()` in `app/lib/services/ble_service.dart`. Neither can check the other. There is no
schema, no version negotiation, no type system spanning C++ and Dart — just two functions that have to
agree, in two repositories' worth of separation, forever.

Three techniques make that survivable, and all three are in the ARES payloads.

**1 · Sentinels rather than absence.** Every optional field has a reserved value meaning "no data":
`0xFFFFFFFF` for a CO₂ reading, `INT16_MIN` for a temperature, `NAN` for a float, `0xFF` for SpO₂. The
field is always present and always the same width, so offsets never move. The alternative — omitting
absent fields — makes every offset depend on the data, which means a parser must understand the
content before it can find the content.

**2 · Length-gated parsing for compatibility.** The inbound `PHONE` payload grew from 17 bytes to 33 to
37 to 47 as GNSS, then an event string, then a clock, then watch biometrics were added. The firmware
never checks a version number. It checks a **length**:

```c
if (val.size() < 17) return;                       // main.cpp:1270
if (val.size() >= 33) memcpy(ev, d+17, 16);        // event block
if (val.size() >= 37) memcpy(&epoch, d + 33, 4);   // clock block
if (val.size() >= 47) { /* the six watch fields */ }
```

Each block is parsed only if the packet is long enough to contain it. An old phone talking to new
firmware sends 17 bytes and works. A new phone talking to old firmware sends 47 and the extra 30 are
ignored. **New fields go on the end, and only on the end** — which is the same rule as the CSV below,
for the same reason.

**3 · A validity flag *and* a sentinel, required to agree.** The pump payload carries both: bit 3 of
byte 0 says "this flow figure was measured", and the float itself is `NAN` when there is no reading.
`parsePumpPacket()` requires both before it will show a value. That is deliberate belt-and-braces
against the one failure this project cannot tolerate — a **nominal estimate rendered as a
measurement**. `GLOSSARY.md` calls this the `NOM` / `MEAS` rule, and the pump telemetry is where it is
enforced in bytes.

There are six characteristics. Four push data out, two take data in:

| Characteristic | Direction | Size | What it carries |
|---|---|---|---|
| `LIVE` | notify, ~1 Hz | 26 B | CO₂ ×3, temp ×3, humidity ×3, warm-up bitmask, logging/SD flags |
| `CAL_STATUS` | notify, on change | 38 B | calibration state machine + the nine stored offsets |
| `STATUS` | notify, ~10 s | 10 B | SD free KB, SD total KB, battery mV |
| `PUMP` | notify, ~1 Hz | 28 B | Lee driver telemetry — power, pressure, flow, frequency, errors |
| `PHONE` | write, 1 Hz | ≤47 B | GNSS, pressure, activity, event, **epoch**, and the watch biometrics |
| `CMD` | write, on demand | 6–7 B | calibration ops, pump ops, logging toggle, clear |

Notice the rates. They are not the same, and they are not the same as the sensors'.

## Sample rate, loop rate, and the rate you get to keep

There are **five** distinct rates in this system and confusing any two of them produces a wrong answer
about what the data can support.

| Rate | Value | Set by |
|---|---|---|
| Loop rate | uncontrolled — as fast as one slice takes | whatever `loop()` did that pass |
| Per-sensor sample rate | one full six-step cycle | the state machine, indirectly |
| BLE `LIVE` notify | **1 Hz** | a `millis()` gate, `main.cpp:1708` |
| CSV row | **0.2 Hz** (every 5 s) | `logData()`'s throttle, `main.cpp:699` |
| Phone → headset `PHONE` write | **1 Hz** | a Dart `Timer.periodic`, `sensor_service.dart:103` |

The notify and the log are **decoupled from the sampling** — each is a `millis()` gate that publishes
whatever the latest values happen to be. That means the same reading can be sent twice, or a reading
can be replaced before it is ever sent, and neither is a bug. It is the standard trade: publishing on a
fixed cadence keeps the consumer's timeline regular, at the cost of the producer's timeline being
approximate.

Now the consequence that bounds every model in `C19`. A resting adult breathes at about 0.25 Hz.
Nyquist says you need to sample above **twice** the frequency you want to reconstruct:

- At the 1 Hz `LIVE` rate you get about **four samples per breath**. Thin, but above Nyquist, so a
  breathing signal is in principle recoverable.
- At the 0.2 Hz CSV rate you get about **0.8 samples per breath** — below Nyquist. Breathing is not
  merely noisy in the logged file, it is **absent**, and worse, it aliases: a 0.25 Hz signal sampled at
  0.2 Hz reappears as a slow 0.05 Hz wander that looks exactly like a real trend.

So `C19`'s respiration model must read the live stream and cannot be re-derived from `data.csv`
afterwards. That is not a limitation of the model. It is a decision that was made when somebody picked
5,000 in `logData()`.

## Three clocks, and none of them knows what time it is

An ESP32-S3 has no real-time clock and no battery to keep one running. All it has is `millis()` — a
counter of milliseconds since power-on. That is a **monotonic** clock: it moves forward at a steady
rate and it is excellent for measuring intervals. It is not a **wall clock**: it cannot tell you the
date, and it restarts from zero on every power cycle.

Which produces the problem that a CSV timestamp column of `00:14:32` cannot solve. Fourteen minutes
into *what*? There have been forty runs.

ARES answers it twice over, with a cheap mechanism and an accurate one.

### The boot counter — cheap, always present, and enough

In `setup()`, before anything else touches the sensors:

```c
prefs.begin("sys", false);                  // main.cpp:1436
bootId = prefs.getUShort("boot", 0) + 1;    // read, increment,
prefs.putUShort("boot", bootId);            // write back
prefs.end();
```

Read the last value out of flash, add one, put it back. `bootId` goes into every CSV row
(`main.cpp:784`). It is two bytes, it costs one flash write per power cycle, and it needs no phone, no
network and no clock.

What it buys is that **rows from different runs are never confusable**. Without it, two sessions that
both start at `00:00:05` are indistinguishable in a concatenated file, and a plot of one experiment
can silently contain another. With it, `(boot, timestamp)` is a total order and a unique key: sort by
boot then by elapsed time and you have the true sequence of every row ever written, with no wall clock
anywhere in the system.

Two honest limits. `uint16` wraps at 65,535 power cycles — not a practical concern, but it is not
infinite. And a boot counter tells you rows are from *different* runs and their *order*; it cannot tell
you the gap between them. If you need "this session was Tuesday afternoon", you need the epoch.

### The epoch — accurate, and it arrives from outside

There is no clock on the headset, so the wall-clock time is **imported**. Bytes 33–36 of the `PHONE`
payload are a Unix timestamp the phone writes once a second, and the firmware records both the value
and the local `millis()` at which it arrived (`main.cpp:1309`):

```c
phoneEpoch     = epoch;
phoneEpochRxMs = millis();
```

At row-write time it reconstructs the current wall clock from the monotonic one (`main.cpp:787`):

```c
epoch_now = phoneEpoch + (millis() - phoneEpochRxMs) / 1000
```

Three things are worth extracting from those two lines, because they are the general pattern and not
an ARES quirk.

**The wall clock comes from the device that has one.** A phone's clock is network-synchronised and
disciplined continuously; an ESP32's crystal is a few tens of parts per million and free-running. Every
system with a cheap node and a rich node ends up doing this, and it is why `L09` treats time alignment
as a first-class architectural concern rather than a detail.

**The monotonic clock is what you interpolate with.** The reconstruction uses `millis()` *differences*,
never `millis()` absolute values, so the arithmetic is immune to the fact that zero means nothing. The
epoch supplies the offset; the local clock supplies the elapsed time. Neither could do the job alone.

**It is refreshed every second and therefore barely drifts.** With the phone rewriting every second
(`sensor_service.dart:103`), the accumulated error is one second's worth of crystal drift —
microseconds — plus the resolution loss of that integer division by 1000. The bound on the *whole* file
is not the crystal; it is the 5-second row spacing.

And the failure mode is explicit rather than silent. `phoneFreshUntilMs` marks the phone data stale
10 s after the last write (`main.cpp:1301`), and a row written with stale data puts **`null`** in the
`epoch` column rather than an extrapolation. A headset that ran alone all afternoon produces a file
with a full `boot` column and an empty `epoch` column, which is exactly the honest description of what
it knows. Offline recovery is then: true wall clock is `epoch` where present, and otherwise
`boot` + elapsed `timestamp`, anchored to whatever else you can date.

## The CSV is a schema, and schemas are hard to take back

`data.csv` has a two-row header written once, when the file does not already exist
(`initCSV()`, `main.cpp:659`):

```
,,TOP,,,,FOREHEAD,,,,CHIN,,,,,,,,,,,,,,,,,,,
timestamp,,temp_f1,hum1,co2_ppm1,,temp_f2,hum2,co2_ppm2,,temp_f3,hum3,co2_ppm3,
lat,lon,alt_m,press_hpa,activity,event,hr,spo2,resp,hdg,atemp_f,accel_mg,boot,epoch,
pump_mw,pump_mbar,pump_lpm
```

**30 columns, of which 27 are named.** The three unnamed ones are spacers that make the first header
row line the pod-name labels up over the right groups in a spreadsheet. The 7/30 deck says "27-column
CSV" and the firmware's own notes say 30; both are right, about different things, and this is exactly
the kind of drift that a file like this exists to pin down.

The design decision worth learning is not the column list. It is this line from the firmware's notes,
about the three pump columns:

> The three pump columns are **appended last** so every pre-existing column index is unchanged.

Once a file format has been written to an SD card in a drawer, a spreadsheet somebody keeps, an
analysis script, and a plot in a slide deck, its **column indices are load-bearing**. Insert a column
in the middle and every script that says "column 14 is latitude" now reads something else, and — this
is the bad part — it does not crash. It plots longitude as latitude and produces a picture. So new
fields go on the end, always, and the six watch/health columns that *were* inserted in the middle
(`hr` through `accel_mg`, between `event` and `boot`) were inserted at a point where the format had
not yet escaped, which was the last moment that was free.

The header is also written **only if the file does not exist**, and `data.csv` is appended to
thereafter. So a card carrying rows from an older firmware keeps that firmware's header while new rows
arrive in the new shape. There is no version marker in the file to catch it. The mitigations are the
boot counter and the discipline of appending, and neither is a substitute for reading the header before
you trust a column index.

## NVS, and why a setting that forgets is a data-integrity bug

**NVS** — non-volatile storage — is the ESP32's key-value store in flash, reached through the
`Preferences` API. ARES uses three namespaces: `cal` for the nine sensor offsets and the battery trim,
`sys` for the boot counter, and `pump` for the airflow settings.

The obvious argument for persistence is convenience: nobody wants to re-enter nine calibration offsets
after changing a battery. That argument is true and it is not the important one.

Here is the important one, in the firmware's own words about the pump namespace:

> NVS namespace `pump` (`en`, `pwr`, `mode`, `psp`) restores the airflow setting on boot **so a power
> cycle cannot silently change the sampling rate mid-study.**

Follow what happens without it. A session is running at 60 % pump power. The battery is swapped, or a
brownout resets the board, and the pump comes back at its default. The sampling flow rate changes,
which changes the transport delay through the tubing (`C17`), which changes the phase relationship
between the pods, which is the quantity `C19`'s airflow model infers direction from. Every number after
that point was measured by a **different instrument** than the numbers before it.

And nothing in the file says so. The CSV records `pump_mw` per row, so in this particular case a
careful analyst could notice — but only if they thought to look, and only because somebody had already
decided that airflow is a covariate worth logging on every row. The general shape of the bug is worse:
**an instrument that reconfigures itself without recording that it did produces a dataset with an
invisible discontinuity in it.** That is not an inconvenience. It is a result that cannot be
reproduced, by anybody, ever, including the person who took it.

Which is why "does this setting survive a power cycle, and if it changes, does the file know?" is a
question worth asking about **every** configurable quantity in the system. Work through the current
answers and one of them is uncomfortable:

| Setting | Survives a power cycle? | Recorded in the file? |
|---|---|---|
| CO₂ / temperature / humidity offsets | yes, NVS `cal` | **no** |
| Pump enable, power, mode, setpoint | yes, NVS `pump` | yes — `pump_mw`, `pump_mbar`, `pump_lpm` |
| Boot counter | yes, NVS `sys` | yes — `boot` |
| Logging on/off | **no** — `loggingEnabled = true` on boot | implicitly: rows stop |
| The sensors' own digital filter and ABC state | no — re-sent every boot by `probeAndInitCO2()` | no |

The offsets row is the one to sit with. They persist, they are applied to every reading before it is
logged (`applyCO2Offset()`, `main.cpp:573`), and **the file does not record which offsets were in
force.** Two runs with different calibrations produce two files that look identical in structure and
are not comparable, and the only way to find out is to have written it down somewhere else. `M10`
returns to this; `E06` makes you notice it yourself.

---

## Current state: the system as built

The headset is an **ESP32-S3** (`esp32-s3-devkitc-1`), PlatformIO with the Arduino framework, and no
RTOS in the sense `L09` means — the sensor path is the super-loop described above. Three FreeRTOS
facilities are used alongside it: a mutex each for the SD card and the BLE globals, and one background
task, `sdSpaceTask`, which exists because `freeClusterCount()` blocks for over fifteen seconds on a
large card and was freezing `loop()` every ten seconds from the status notify (`main.cpp:678`). Free
space is now tracked incrementally as rows are written, and the notify is a pure cache read.

**Sensors and buses.** Three SHT45 temperature/humidity parts and three SprintIR-6S-20 % CO₂ parts,
one of each per pod:

| Pod | SHT45 | I²C bus | CO₂ | UART |
|---|---|---|---|---|
| Top | #1, GPIO1/2 | `Wire`, shared — torn down and rebuilt each read | #1 | `CO2Serial1`, dedicated |
| Forehead | #2, GPIO3/9 | **`Wire1Bus`, a dedicated `TwoWire(1)`, stays open** | #2 | `CO2Serial2`, shared |
| Chin | #3, GPIO35/36 | `Wire`, shared | #3 | `CO2Serial2`, shared |

**Startup probing** (`setup()`, `main.cpp:1463–1494`) touches every sensor exactly once. Anything that
does not answer has its `*Present` / `*Ready` flag left `false` and is skipped on every subsequent poll,
silently and permanently until the next boot. So the firmware runs with any subset of sensors fitted,
which is what makes bench work with one pod on the desk possible. The cost is that a sensor that comes
loose *after* boot is retried three times per cycle forever, and a sensor that was loose *at* boot is
never retried at all. Both behaviours are defensible; neither is announced to the user beyond a serial
line.

**A note the glossary promised.** `GLOSSARY.md` says to name pods, never "sensor 1 / 2 / 3", because
firmware indices and physical positions are not guaranteed to correspond. Here is why. The index-to-pod
mapping lives in exactly two places — the pin `#define`s at the top of `main.cpp` and the label row of
the CSV header — and **nothing checks them against the wiring.** Swap two connectors on the bench and
every layer downstream keeps its labels: the CSV still says `co2_ppm3` is CHIN, the app still draws the
third card as CHIN, and the rebreathed fraction is now computed from the wrong end of the head. There
is no probe that can detect this, because the sensors are identical. It is a wiring convention held in
place by care.

**Storage.** `data.csv` on an SD card over SPI, `SdFs` so FAT16, FAT32 and exFAT all mount, written
every 5 s. `tryInitSD()` retries every 2 s from `loop()` so a card inserted later is picked up
(`main.cpp:1119`). A separate in-RAM ring buffer holds **720 samples at 5 s each — one hour**
(`HIST_LEN`, `HIST_PERIOD_MS`, `main.cpp:171`), serving `/history` and `/history.csv`. The phone keeps
its own, longer history: `live_history.dart` trims to a **24-hour** window at a minimum 2-second
interval. The 7/30 deck's "24-hour rolling history buffer" is that one, not the firmware's.

**The BLE contract.** Service `4fafc201-…` with the six characteristics tabled above. Their UUIDs are
declared twice — `main.cpp:211–240` and the `k*UUID` constants at `ble_service.dart:9–24` — and the
comment in both files says to change them together. MTU is set to 64 so the 38-byte `CAL_STATUS`
notify plus its 3-byte ATT header fits in one packet (`main.cpp:1547`).

**The phone app** is `ares_headset`, Flutter with **Riverpod**, and it is the primary surface for new
work. `services/` holds the runtime singletons — `ble_service` for the link, `sensor_service` for the
phone's own GPS, barometer and accelerometer, `pump_service`, `garmin_service`, plus session, history,
calibration, threshold, insights, report and WiFi-sync services. `science/` holds the ten physiology
models `C19` covers, deliberately free of Flutter imports so they can be unit-tested as plain Dart.

**The watch bridge** is optional and symmetric: the watch sends the **§0 biometrics** contract in
(HR and zones, SpO₂, steps, respiration, GNSS, ambient temperature), and the phone sends the **§1 CO₂
snapshot** back out (all three pods, the max, temperatures and humidities) so the wrist can display
readings it has no BLE path to. Native `MethodChannel` plugins on both platforms wrap the Connect IQ
mobile SDK; diagnostics come back over the event channel tagged `__diag` and are surfaced by
long-pressing the GARMIN status pill, because the Codemagic build toolchain gives no console.

**The web dashboard** at `192.168.4.1` (SSID `ARES`) is **legacy and explicitly low-priority**. It
predates the app, it is kept working for headless and debug access, and new UI belongs in Flutter. It
is worth knowing it exists mainly because it is a second consumer of the same data with a *third*
representation of it — a JSON object with its own key names, in which sensor values are **strings** and
a failed read is the literal text `"Sensor Error"`.

**One place where the same quantity has two values, and the file cannot tell you which.** The phone
reads its own barometer, sends the pressure to the headset in the `PHONE` payload, and the firmware
logs it to `press_hpa` and — as `C16` says — never applies it to a CO₂ reading. But the *app* does, at
the display layer: `correctedCO2()` (`co2_correction.dart:3`) multiplies by `1013.25 / press_hpa`, and
`home_screen.dart:1111` uses it for the pod cards when the `showCorrected` toggle is on. So the number
on the card can be several percent different from the number in the CSV for the same instant, the
science models in `science/` consume the uncorrected one, and **nothing in the payload, the file, or
the UI records which convention a given number was taken under.** That is the `NOM` / `MEAS` problem
again, in a place where nobody has yet applied the `NOM` / `MEAS` fix.

---

## What's next

**More channels entering the same contract.** The next-generation pod on slide 13 of the 7/30 deck adds
a **SEN0465 oxygen** sensor and a **BME680** — VOCs, and a barometer in every pod — with CO, VSCs and
airspeed also named, in custom boards about **25 % smaller** than today's pods. Every one of those is a
new field in the `LIVE` payload, a new column on the end of the CSV, a new key in the JSON, and a new
card in the app. The length-gating and the append-only column rule are what make that a day's work
rather than a coordinated flag-day release of three codebases. This is the first time this course can
say a design decision has already paid for itself, so it is worth saying: **the contract was built to
be extended, and it is about to be.**

Note what a barometer per pod does to the section above. The pressure correction stops depending on a
phone being connected, which means it can move into the firmware, which means it can be applied *before*
the value is logged — and at that point the CSV and the card finally agree.

**A smaller backboard, with a screen.** The same slide has a redesigned back circuit board at **half**
the current size, carrying a new **LCD display**. A local display is a fourth consumer of the live
values, on the far side of no link at all, and it will want the same numbers the app is showing under
the same conventions. Which is the whole subject of this module arriving as a work item.

**The open architectural question, stated as a question.** Nothing above forces the sensor path to stay
a super-loop. `L09`'s review is unambiguous that bare-metal super-loops "degrade rapidly with
complexity" past a few sensors, and the pod on slide 13 roughly doubles the sensor count. Nobody on this
project has written down whether the ESP32-S3's FreeRTOS — already present, already used for the SD
space task and two mutexes — should take over acquisition, or whether the state machine scales fine and
the review is describing a different kind of system. It is a real decision with a real cost either way,
and it is currently being made by default.

---

**Sources.** Current state — the three-part architecture and the data-flow direction, the file layout,
the pinout and bus assignments, the dedicated `TwoWire(1)` for the forehead SHT45, the shared-UART
teardown, the startup-probing behaviour, the GSS command table, the six BLE characteristics and their
full payload layouts, the CSV header and the append-last rule, the boot counter and epoch semantics,
the NVS namespaces and the pump-persistence rationale, the WiFi AP routes and JSON keys, the Flutter
`services/` and `science/` layout, and the Garmin §0/§1 contracts:
`C:\Users\Henry\Documents\ARES\ARES2ESP32\CLAUDE.md`, in full. Code specifics — the constants at
`src/main.cpp:49–76`, `readSharedWireSensor()` at 283, `co2Port()` at 316, `readCO2()` at 363,
`probeAndInitCO2()` at 403, `applyCO2Offset()` at 573, `readCO2WithRetry()` at 587,
`updateSensorReadings()` at 600, `initCSV()` at 659, `sdSpaceTask()` at 678, `logData()` at 696 with
the boot and epoch writes at 784–793, `recordHistory()` at 830, `tryInitSD()` at 1119,
`sendBleNotify()` at 1151, `sendStatusNotify()` at 1198, `buildPumpPacket()` at 1217, the `PHONE`
length gates at 1270–1299, the boot-counter increment at 1436, the sensor probes at 1463–1494, the
GATT setup at 1553–1616, and the `loop()` cadences and `[SLOW LOOP]` / `[GAP]` diagnostics at
1620–1740. App specifics — `app/lib/services/ble_service.dart` (UUID constants at 9–24,
`parseLivePacket()` at 300), `app/lib/services/sensor_service.dart:103` for the 1 Hz `PHONE` write,
`app/lib/services/live_history.dart:41` for the 24-hour window, `app/lib/services/co2_correction.dart:3`
and `app/lib/screens/home_screen.dart:1111` for the display-layer pressure correction, and
`app/lib/screens/home_screen.dart:30` for the pod labels. The five-layer platform picture and the
logging/connectivity claims: `ARES_7_30_26.pptx` slides 2 and 4. App services and the watch bridge:
slides 8 and 9. The next-generation pods, the added channels, the 25 % pod reduction, and the
half-size backboard with an LCD: slide 13. Bare-metal-versus-RTOS scaling: Toptsis et al. (2026),
*Electronics* 15(2), 295, Table 8 (`SOURCES.md`, `toptsis2026`). The SprintIR protocol facts this
module builds on, including the `K 0`-first boot order and the 10 ppm quantisation: `C16`.
