# S04 — The data contract (deck outline)

| | |
|---|---|
| **Course / section** | ARES 101 · M9 · "Data contract reference deck" |
| **Kind** | SLIDES — built as a deck, exported to PDF, imported through the slides workbench |
| **Slides** | 14 |
| **Narration** | Optional, and probably not worth recording. See production notes. |
| **Overlay questions** | 1 (slide 6) |
| **Built** | ☐ |

## Why a deck and not a video

Because **eleven of these fourteen slides are tables somebody will have open in a second window while
writing code**, and there is no version of that which is a video.

The test in `README.md` rule 1 is whether the content is *derived* or *looked up*. Nothing here is
derived. A byte offset is not reasoned to; it is read off. When you are writing a parser for the `LIVE`
characteristic you need to know that humidity starts at byte 18 and is `int16` scaled by ten, you need
it in under three seconds, and you need to be able to keep it on screen while you type. Scrubbing a
video for that is not slower — it is unusable.

`C20` is where this material is *taught*: why the state machine exists, why UART has no addressing, why
a boot counter is the cheap half of a timestamp. Read that first, once. Then this deck is what you
reopen for the next two years.

**One standing rule for whoever builds it and whoever maintains it.** Every number on slides 4 through
13 is copied from `src/main.cpp`, `app/lib/services/ble_service.dart`, or the firmware repository's
`CLAUDE.md`. **The code is the source of truth, not this deck.** If a payload gains a field or a column
moves, this deck is revised in the same commit — see `README.md`, rule 2. A stale reference deck is
worse than no reference deck, because people trust it and do not check.

## Slides

### 1 · Title
"The system and the data contract." Subtitle: *reference deck — three devices, five buses, six
characteristics, thirty columns.* No body text.

Small footer, and keep it: *every table here is a copy. `src/main.cpp` and `ble_service.dart` are the
originals.*

### 2 · The three devices, and what crosses each arrow
The orientation slide, redrawn from slide 2 of the 7/30 deck but with the payloads named, because the
payloads are the point.

```
   Garmin watch          Flutter phone app             ESP32-S3 headset
   (Connect IQ)            (app/, Dart)                  (src/, C++)
        │                        │                             │
        │──── §0 biometrics ────►│                             │
        │   HR+zones, SpO₂,      │──── PHONE (≤47 B, 1 Hz) ───►│
        │   steps, respiration,  │     GNSS, pressure,         │
        │   GNSS, ambient temp   │     activity, event,        │
        │                        │     epoch, biometrics       │
        │                        │                             │
        │                        │──── CMD (6–7 B, on demand) ►│
        │                        │     calibration, pump,      │
        │                        │     logging, clear          │
        │◄─── §1 CO₂ snapshot ───│                             │
        │   3 pods + max,        │◄─── LIVE (26 B, ~1 Hz) ─────│
        │   temp, humidity       │◄─── CAL_STATUS (38 B) ──────│
        │                        │◄─── STATUS (10 B, ~10 s) ───│
        │                        │◄─── PUMP (28 B, ~1 Hz) ─────│
                                                               │
                                              SD: data.csv, 30 cols, every 5 s
                                              WiFi AP 192.168.4.1 (legacy)
```

Three callouts along the bottom, one line each:

- **The watch is optional.** Everything works without it; the six health columns write `null`.
- **The phone is optional too.** Without it there is no wall clock, so the `epoch` column writes
  `null` and `boot` + elapsed time is all you have.
- **Each arrow is a boundary between two codebases that ship independently.** That is the whole reason
  this deck exists.

### 3 · The five rates
Reference card. One table, nothing else, because this is the slide that settles arguments.

| Rate | Value | Set by |
|---|---|---|
| `loop()` iteration | uncontrolled | whatever that pass did |
| One full sensor cycle | six `loop()` iterations | `updateSensorReadings()`, `main.cpp:600` |
| BLE `LIVE` notify | **1 Hz** | `main.cpp:1708` |
| BLE `STATUS` notify | **0.1 Hz** (10 s) | `main.cpp:1715` |
| BLE `PUMP` notify | **1 Hz** | `main.cpp:1724` |
| Pump register poll | one register / 200 ms, 8 in rotation → **≈1.6 s** full refresh | `pumpPoll()` |
| CSV row | **0.2 Hz** (5 s) | `logData()`, `main.cpp:699` |
| Firmware history ring | 5 s × 720 = **1 hour** | `main.cpp:171` |
| Phone `PHONE` write | **1 Hz** | `sensor_service.dart:103` |
| Phone history window | **24 hours**, ≥2 s spacing | `live_history.dart:41` |

Bottom strip, in the accent colour, large:

**Breathing is ~0.25 Hz. Four samples per breath over BLE. Below Nyquist in the CSV.**
Caption: *a respiration model reads the live stream. It cannot be recovered from `data.csv` afterwards
— see `C19`.*

### 4 · Pinout — I²C, and the asymmetric pod
Reference table, exactly as wired.

| Pod | Sensor | SDA | SCL | Bus |
|---|---|---|---|---|
| Top | SHT45 #1 | GPIO1 | GPIO2 | `Wire` — shared, re-inited each read |
| Forehead | SHT45 #2 | GPIO3 | GPIO9 | **`Wire1Bus` — dedicated `TwoWire(1)`, stays open** |
| Chin | SHT45 #3 | GPIO35 | GPIO36 | `Wire` — shared, re-inited each read |

Callout, accent colour: **The forehead pod is not software-symmetric with the other two.** It holds
bus state between reads; the other two are demolished and rebuilt every time
(`readSharedWireSensor()`, `main.cpp:283`). Anyone comparing pod-to-pod timing or read latency should
know which one they are holding.

Second callout, smaller, and it belongs on this slide because this is where somebody looks at the
board: **the forehead housing has a larger air gap than the other two and reads noticeably cooler.**
That is a placement artefact, not a firmware bug, and it is not corrected anywhere.

### 5 · Pinout — UART
The busiest slide, and the one slide 6 asks a question about.

| Device | RX | TX | Port | Sharing |
|---|---|---|---|---|
| CO₂ #1 | GPIO18 | GPIO17 | `CO2Serial1` (UART1) | dedicated, stays open |
| CO₂ #2 | GPIO5 | GPIO14 | `CO2Serial2` (UART2) | **shared** — re-pinned per access |
| CO₂ #3 | GPIO8 | GPIO7 | `CO2Serial2` (UART2) | **shared** — re-pinned per access |
| Lee pump driver | GPIO16 | GPIO15 | `PumpSerial` (UART0) | dedicated, 115200 8N1 |

CO₂ links are **9600 8N1, GSS ASCII protocol**.

Below the table, the arbitration in four lines, set as code:

```c
CO2Serial2.end();                     // tear down
CO2Serial2.begin(baud, 8N1, rx, tx);  // rebuild on the other sensor's pins
delay(25);                            // let it settle
while (available()) read();           // DRAIN — the load-bearing line
```

Footer note, small but do not cut it: *UART0 is free only because `ARDUINO_USB_CDC_ON_BOOT=1` puts
Arduino's `Serial` on the native USB port. UART0 is re-pinned off the ROM boot-log pins (43/44); stray
boot text on 15/16 is harmless because the driver only acts on `#`-prefixed lines.*

### 6 · Why they cannot both be live
The one slide on this deck that is an argument rather than a table, and it earns its place because
every other slide's numbers depend on the reader believing it.

Two columns:

| **I²C** | **UART** |
|---|---|
| Two wires, shared | Two wires, one direction each |
| Every transaction opens with a **7-bit address** | **No address. No header. No arbitration.** |
| A part answers only to its own address | A byte on the line is simply *there* |
| A dozen parts share one pair | Strictly point to point |

Then, full width: **GSS SprintIR parts have no bus addressing of any kind.** Two of them live on one
port and the firmware guarantees by hand that only one is ever speaking.

**Overlay question (SINGLE):** *CO₂ sensors 2 and 3 share one UART. `co2Port()` tears the port down,
re-pins it, waits 25 ms, and then drains the receive buffer before every single access. What is the
drain for?*
→ **Bytes from the other sensor may still be sitting in the buffer, and nothing in the data says which
sensor sent them.** UART carries no address, so a reply that arrives at the wrong moment parses
perfectly and belongs to the wrong pod.
Distractors: *to clear the sensor's internal error state · to let the 25 ms settling delay take effect ·
to reset the parser after a `?` response.* The tempting wrong answer is the first — it sounds like
housekeeping, and this is not housekeeping, it is the only thing standing between you and a chin
reading labelled forehead.
*Rewind to slide 6 on a wrong answer.*

Below the fold, and it is the half that makes the rule bite: **this is also why `probeAndInitCO2()`
sends `K 0` before anything else.** GSS parts ship in streaming mode. A sensor left streaming does not
corrupt its own channel — it corrupts its **neighbour's**, by filling the shared buffer with lines the
parser will attribute to whoever was asked last. `C16` has the boot sequence.

### 7 · Pinout — SPI, and everything else
Short reference table. Low drama, high lookup value.

| Signal | Pin |
|---|---|
| SD CS | GPIO10 |
| SD MOSI | GPIO13 |
| SD MISO | GPIO11 |
| SD SCK | GPIO12 |
| Boot button (logging toggle, active-low, 50 ms debounce) | GPIO0 |
| Battery ADC (100 kΩ / 47 kΩ divider) | GPIO6 |
| Legacy DC-pump gate — **`pumpDuty = 0`, off by default** | GPIO4 |

Callout: **GPIO4 cannot drive the Lee XP pump.** It is a piezoelectric disc pump driven at resonance
by its own board over UART0; motor-style PWM is explicitly unsuitable. The channel survives so a legacy
DC pump can still be fitted. `C17` has the full argument.

### 8 · The GATT contract
The service, and the six characteristics, as one table. This is the slide people screenshot.

**Service `4fafc201-1fb5-459e-8fcc-c5c9c331914b`**

| Characteristic | UUID suffix | Direction | Size | Cadence | Carries |
|---|---|---|---|---|---|
| `LIVE` | `…26a8` | notify | 26 B | ~1 Hz | CO₂ ×3, temp ×3, RH ×3, warm-up, flags |
| `CAL_STATUS` | `…1a8d` | notify | 38 B | on change | cal state + nine offsets |
| `STATUS` | `…3b4c` | notify | 10 B | ~10 s | SD free/total KB, battery mV |
| `PUMP` | `…f601` | notify | 28 B | ~1 Hz | Lee driver telemetry |
| `PHONE` | `…7518` | write | ≤47 B | 1 Hz | GNSS, pressure, activity, event, epoch, biometrics |
| `CMD` | `…1a8c` | write | 6–7 B | on demand | calibration, pump, logging, clear |

Two callouts, both in the accent colour:

- **Every UUID is declared twice** — `main.cpp:211–240` and `ble_service.dart:9–24`. Nothing checks
  that they match. Change them together or the app simply never finds the characteristic.
- **MTU is set to 64** (`main.cpp:1547`), because the 38-byte `CAL_STATUS` notify plus a 3-byte ATT
  header has to fit in one packet.

### 9 · `LIVE` — 26 bytes, little-endian
Byte-map slide. Draw it as a ruler with the offsets marked, not just a table, because the reader is
usually counting into a buffer.

| Offset | Type | Field | "No data" sentinel |
|---|---|---|---|
| 0–11 | `uint32` ×3 | CO₂ per pod, ppm | `0xFFFFFFFF` |
| 12–17 | `int16` ×3 | temperature, °F ×10 | `INT16_MIN` |
| 18–23 | `int16` ×3 | humidity, % ×10 | `INT16_MIN` |
| 24 | `uint8` | warm-up bitmask — bit0 = top, bit1 = forehead, bit2 = chin | — |
| 25 | `uint8` | flags — bit0 logging enabled, bit1 SD ready | — |

Bottom strip: **CO₂ is 32-bit on purpose.** The 0–20 % part reaches 200,000 ppm, which overflows the
`uint16` the SenseAir build used. The width was changed in firmware state, `HistSample.co2`, this
payload, and `parseLivePacket()` — four places, one change.

Footer: *mirrored in `sendBleNotify()` (`main.cpp:1151`) and `parseLivePacket()`
(`ble_service.dart:300`).*

### 10 · `PHONE` — 47 bytes, and how it grew
The compatibility slide. Same ruler treatment, with the four length gates drawn as brackets down the
side.

| Offset | Type | Field | Sentinel | Gate |
|---|---|---|---|---|
| 0–3 | `float32` | latitude | `NAN` | ≥ 17 |
| 4–7 | `float32` | longitude | `NAN` | ≥ 17 |
| 8–11 | `float32` | altitude, m | `NAN` | ≥ 17 |
| 12–15 | `float32` | pressure, hPa | `NAN` | ≥ 17 |
| 16 | `uint8` | activity class | — | ≥ 17 |
| 17–32 | `char[16]` | event string | — | ≥ 33 |
| 33–36 | `uint32` | **epoch, Unix seconds** | — | ≥ 37 |
| 37–38 | `int16` | heart rate, bpm | `INT16_MIN` | ≥ 47 |
| 39 | `uint8` | SpO₂, % | `0xFF` | ≥ 47 |
| 40 | `uint8` | respiration, breaths/min | `0xFF` | ≥ 47 |
| 41–42 | `int16` | heading, deg | `INT16_MIN` | ≥ 47 |
| 43–44 | `int16` | ambient temp, °F ×10 | `INT16_MIN` | ≥ 47 |
| 45–46 | `int16` | accel magnitude, milli-g | `INT16_MIN` | ≥ 47 |

Full-width strip along the bottom, and it is the transferable rule on the whole deck:

**No version byte. The length *is* the version.** Each block parses only if the packet is long enough
to contain it (`main.cpp:1270–1299`). Old phone + new firmware works. New phone + old firmware works.
**New fields go on the end, and only on the end.**

Small caption: *phone data is considered stale 10 s after the last write. A row written with stale
data puts `null` in `epoch` rather than extrapolating.*

### 11 · `PUMP` and `CMD`
Two half-slides side by side. Both are lookup tables; neither needs commentary.

**`PUMP`, 28 bytes out:**

| Offset | Type | Field |
|---|---|---|
| 0 | `uint8` | flags — b0 present, b1 enabled, b2 pressure valid, **b3 flow measured**, b4 comms OK |
| 1 | `uint8` | device type — 0 unknown, 2 GP board, 3 Smart Pump Module |
| 2 | `uint8` | mode — 0 manual power, 1 PID pressure |
| 3 | `uint8` | commanded power percent, 0–100 |
| 4–7 | `float32` | setpoint (mW manual / mbar PID) |
| 8–11 | `float32` | measured drive power, mW |
| 12–15 | `float32` | measured pressure, mbar |
| 16–19 | `float32` | flow, L/min — **measured only when b3 set** |
| 20–21 | `uint16` | drive frequency, Hz |
| 22–23 | `uint16` | drive voltage, V ×100 |
| 24–25 | `uint16` | drive current, mA |
| 26 | `uint8` | driver error code |
| 27 | `uint8` | driver firmware, major ≪ 4 \| minor |

**`CMD` pump packet — `[0x20][subop][float32 LE]`:**

| subop | Meaning | Value |
|---|---|---|
| 1 | enable / disable | ≠ 0 = on |
| 2 | set power percent | 0–100 |
| 3 | set power milliwatts | 0–1000 |
| 4 | set control mode | 0 manual, 1 PID |
| 5 | set target pressure | mbar |
| 6 | persist to driver NVS | ignored |

*`CMD` calibration packet is `[0x10][op][sensor][float32 LE]`; op 1–7 = co2_target, co2_offset,
temp_offset, hum_offset, fresh_air, abc_on, abc_off. `sensor` is 0 for all, else 1–3.*

Bottom strip, accent colour: **byte 0 bit 3 and the `NAN` in bytes 16–19 must agree before the app
shows a flow figure.** A validity flag *and* a sentinel, deliberately redundant, so a nominal estimate
can never render as a measurement. `GLOSSARY.md` calls it the `NOM` / `MEAS` rule.

Second strip: **every value is clamped in `lee_pump.cpp` and never trusted from the phone**, and the
firmware emits a fresh `PUMP` notify after each accepted command so the app never has to assume.

### 12 · `data.csv` — the column map
Full-bleed reference slide. Number every column, because "column 14" is how people talk about this file.

| # | Column | # | Column | # | Column |
|---|---|---|---|---|---|
| 1 | `timestamp` | 11 | `temp_f3` | 21 | `spo2` |
| 2 | *(spacer)* | 12 | `hum3` | 22 | `resp` |
| 3 | `temp_f1` | 13 | `co2_ppm3` | 23 | `hdg` |
| 4 | `hum1` | 14 | `lat` | 24 | `atemp_f` |
| 5 | `co2_ppm1` | 15 | `lon` | 25 | `accel_mg` |
| 6 | *(spacer)* | 16 | `alt_m` | 26 | **`boot`** |
| 7 | `temp_f2` | 17 | `press_hpa` | 27 | **`epoch`** |
| 8 | `hum2` | 18 | `activity` | 28 | `pump_mw` |
| 9 | `co2_ppm2` | 19 | `event` | 29 | `pump_mbar` |
| 10 | *(spacer)* | 20 | `hr` | 30 | `pump_lpm` |

Header row 1 labels the groups: columns 3–5 **TOP**, 7–9 **FOREHEAD**, 11–13 **CHIN**.

Three callouts:

- **30 columns, 27 named.** Three are spacers that align the pod labels in a spreadsheet. The 7/30 deck
  says 27 and the firmware notes say 30; both are right about different things.
- **`timestamp` is `HH:MM:SS` since boot, not wall clock.** Pair it with `boot` for a unique key. Use
  `epoch` when it is present.
- **The three pump columns were appended last so no pre-existing index moved.** New columns go on the
  end. Always. An inserted column does not crash a script — it makes it plot the wrong thing.

Footer, small: *`null` is written for any unavailable value. The header is written only if the file does
not already exist, so a card can carry an old header above new rows.*

### 13 · The `/datatest` JSON keys
The legacy dashboard's contract, kept because it is a third representation of the same data and people
still hit it from a laptop.

`GET /datatest`, polled every 500 ms from `192.168.4.1`:

```
logging_status                      "Reading" / "Not Reading"
sht1_temp  sht1_hum                 Top
sht2_temp  sht2_hum                 Forehead
sht3_temp  sht3_hum                 Chin
co2_1  co2_2  co2_3                 ppm, up to 200,000
co2_1_warmup  co2_2_warmup  co2_3_warmup   all_warm
watch_fresh                         phone/watch data within the last 10 s
latitude  longitude  altitude_m  pressure_hpa  activity
heart_rate  spo2  respiration  heading  ambient_temp_f  accel_mg
pump_present  pump_enabled                     booleans
pump_device_type  pump_mode  pump_error        integers
pump_percent  pump_setpoint  pump_mw  pump_mbar  pump_lpm  pump_hz
pump_lpm_measured                   false when pump_lpm is the nominal estimate
```

Other routes: `/` `/test_style.css` `/test_script.js` `/history` `/history.csv` `/cal_status`, and
`POST` to `/calibrate` `/clear` `/pump`.

Two callouts:

- **Sensor values are strings here, not numbers**, and a failed read is the literal text
  `"Sensor Error"`. The BLE payload uses typed sentinels for the same conditions. Same data, three
  encodings — this is what "no shared schema" costs.
- **Legacy and low-priority.** Kept working for headless and debug access. Build new UI in the Flutter
  app.

### 14 · What changes, and where the truth lives
Closing slide, two halves.

**Left — what is about to enter the contract**, from slide 13 of the 7/30 deck:

- **SEN0465 oxygen** and **BME680** (VOCs, pressure, temperature, humidity) per pod, plus CO, VSCs and
  airspeed named on the same slide. Pods about **25 % smaller**.
- **Redesigned backboard at half the size, with an LCD** — a fourth consumer of the live values, on the
  far side of no link at all.
- Each of those is: a field on the end of `LIVE`, a column on the end of `data.csv`, a key in the JSON,
  a card in the app. **The length gates and the append-last rule are what make that a day's work.**

**Right — the maintenance contract**, as a short list, and it is the reason this slide is not optional:

| If you change… | …change these, same commit |
|---|---|
| A BLE payload layout | `main.cpp`, `ble_service.dart`, this deck, `C20` |
| A characteristic UUID | `main.cpp:211–240`, `ble_service.dart:9–24` |
| A CSV column | `initCSV()` **and** the `/clear` handler's duplicate header, this deck |
| A pin assignment | `main.cpp` defines, the firmware `CLAUDE.md` pinout, slides 4–7 |

Closing line, full width: **Nothing in this system validates that the two sides of a contract agree.
The only mechanism is that somebody remembered.**

## Production notes

- Build in Google Slides at 16:9, ARES palette (dark base, martian amber `#F59E0B` accent, alert red
  `#EF4444`). Export to PDF and import via the slides workbench.
- **Set every table in the monospace face**, at a size that survives a phone photo taken over a bench.
  If a table does not fit legibly, split the slide — a fifteen-slide deck that can be read beats a
  fourteen-slide one that cannot.
- **Slides 9, 10, 11 and 12 are byte and column maps and should be drawn as rulers**, with offsets
  running along an axis, not only as tables. Someone counting into a buffer wants to *see* where byte
  24 falls.
- **Slide 6 is the only slide with an argument on it**, and it is the only one with an overlay question.
  Do not add questions to the reference slides; there is nothing to reason about on them and a quiz
  question about a byte offset tests memory, not understanding.
- **Do not record narration for slides 4–13.** Reading a table aloud is worse than useless — it makes
  the deck feel like a video and invites people to sit through it instead of searching it. If narration
  is recorded at all, record slides 2, 3, 6 and 14 and leave the rest silent.
- **Slide 14's maintenance table is content, not a footer.** It is the thing that keeps every other
  slide true. Do not shrink it, and do not move it to speaker notes.
- Speaker notes are typed per slide in the workbench after import; PDF export does not carry them.
- Every number on slides 4–13 comes from `src/main.cpp`, `app/lib/services/ble_service.dart`, or the
  firmware `CLAUDE.md`. **Diff this deck against those files whenever the BLE or CSV contract moves.**
