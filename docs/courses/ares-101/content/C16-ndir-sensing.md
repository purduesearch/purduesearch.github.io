# C16 — How an NDIR sensor sees CO₂

> CONTENT section · ARES 101 · M5 · ~5 min read
> Seeded into `contentJson` as rich text. Depends on `GLOSSARY.md` §5 (the units convention) and
> nothing else. M1–M4 are helpful but not required.
> This is the module where the firmware becomes real. Every current-state claim below names a file
> and, where it is a single constant, a line. If you change one of those constants, change this file
> in the same commit.

---

## The whole idea, in one sentence

Shine infrared light through air, measure how much of it comes out the other side, and the light that
went missing tells you how much CO₂ was in the way.

Everything else in this module is a consequence of that sentence being harder than it sounds.

## Beer–Lambert

Light passing through an absorbing gas does not lose a fixed *amount* per centimetre. It loses a
fixed *fraction* per centimetre — which means the loss compounds, and the transmitted intensity falls
exponentially with both concentration and distance:

```
I = I₀ · e^(−k · C · L)
```

`I₀` is the light that set out, `I` is the light that arrived, `C` is the CO₂ concentration, `L` is
the path length, and `k` is a constant of the gas and the wavelength band you chose.

Rearranged into the form you actually compute with:

```
ln(I₀ / I) = k · C · L
```

That left-hand side is the **absorbance**. Absorbance is linear in concentration. Transmission is
not, and confusing the two is the first mistake everyone makes with this instrument.

Here is why it matters, using the numbers V14 works through. Take a 5 cm path and a `k` of
4 × 10⁻⁶ ppm⁻¹ cm⁻¹:

| CO₂ | Absorbance `k·C·L` | Light transmitted | Light absorbed |
|---|---|---|---|
| 400 ppm | 0.008 | 99.20 % | 0.80 % |
| 1,000 ppm | 0.020 | 98.02 % | 1.98 % |
| 5,000 ppm | 0.100 | 90.48 % | 9.52 % |
| 50,000 ppm | 1.000 | 36.79 % | 63.21 % |
| 200,000 ppm | 4.000 | 1.83 % | 98.17 % |

Read the first and last rows together. Over a 500-fold change in concentration, the *fraction of
light removed* changes only 123-fold, and almost all of that compression happens at the top of the
range. At 200,000 ppm the detector has 1.8 % of the light left to work with, and another 1,000 ppm
barely moves it. At 400 ppm the detector has to resolve eight parts in a thousand of a signal that is
otherwise unchanged.

**One optical design cannot be excellent at both ends.** Hold that thought — it is the reason the
sensor on the headset reports in steps of 10 ppm, and by the end of this module that will look like a
consequence rather than a defect.

## Why 4.26 µm

CO₂ absorbs infrared light because the molecule has vibrational modes whose motion changes its
electric dipole. The strongest of them is the **asymmetric stretch**: the two oxygen atoms moving the
same direction while the carbon moves the other, so one bond lengthens as the other shortens. That
mode sits at about **4.26 µm**, and it is the most powerful CO₂ absorption feature in the accessible
infrared.

The band is chosen for a second reason that matters more than its strength. Nitrogen and oxygen are
**homonuclear diatomics** — two identical atoms, a perfectly symmetric charge distribution, no dipole
moment to change when they vibrate. They are essentially transparent in the infrared. So 99 % of the
air in front of the sensor does nothing at all at 4.26 µm, and the sensor is looking at a nearly
empty background.

Water is the one real neighbour. Its bending mode sits near 6.3 µm and its stretching modes near
2.7 µm, so 4.26 µm falls in the gap between them. That separation is why NDIR CO₂ sensing works in
humid air at all, and it is not perfect — see cross-sensitivity below.

## The four parts

"Non-dispersive" is a statement about what the instrument does **not** have. A dispersive
spectrometer spreads light into a spectrum with a grating or a prism and reads a wavelength off a
position. An NDIR sensor has no grating. It selects its wavelength with a **fixed optical bandpass
filter** and reads one number.

That leaves four parts:

1. **A source.** Classical NDIR uses a heated filament — a small incandescent lamp, broadband,
   cheap, slow to modulate, and with a finite life. GSS, the manufacturer of the sensor on the
   headset, describes the SprintIR family as using a **solid-state mid-infrared LED** instead. That
   single choice is why the part can update quickly and run on very little power, and why the
   calibration routine in the firmware does not have to wait out a lamp warming up.
2. **An optical path.** The volume of air the light crosses. Length `L` in Beer–Lambert.
3. **A bandpass filter** centred on 4.26 µm, typically a fraction of a micron wide.
4. **A detector** that turns the arriving infrared into a current.

A two-channel design adds a **reference channel**: a second filter at a wavelength nothing in the gas
absorbs, looking at the same source through the same path. Divide the active channel by the reference
and everything common to both — the source dimming with age, dust on the window, drift in the
detector's gain — divides out. It is the same trick M2 plays with the top pod: you cannot trust an
absolute measurement, so you measure a ratio against something that shares the error.

## Path length is the trade

`k · C · L` is a product, so path length and concentration are interchangeable in the physics and are
not interchangeable in the engineering.

- **Long path, ambient work.** At 5 cm, 400 ppm removes 0.8 % of the light — small but measurable.
  Double the path and you double the absorbance, which buys you resolution near ambient for free.
- **Long path, high concentration.** At 5 cm, 200,000 ppm leaves 1.8 % of the light. Double the path
  and you are down to 0.03 %, which is noise. The instrument saturates.
- **Short path.** At 1 cm, 200,000 ppm still transmits 45 % — comfortable. But 400 ppm now removes
  only 0.16 %, and to see 10 ppm of change you must resolve four parts in a hundred thousand.

And the path has to fit inside something you can wear on a head, which sets a hard ceiling long
before the physics does. **Range, resolution, and size are one trade with three names.**

## Temperature and pressure

An NDIR sensor does not count *what fraction of the molecules* are CO₂. It counts **how many CO₂
molecules are in its optical path**, which is a number density:

```
N_CO₂ = x · P / (k_B · T)
```

with `x` the mole fraction, `P` total pressure, `T` absolute temperature. Both `P` and `T` move the
answer at fixed `x`:

- **Pressure.** Take the sensor to 950 hPa and there are 6 % fewer molecules of everything in the
  path, so 6 % less absorption, so a sensor calibrated at sea level and reporting mole fraction reads
  **low**. V14 works this correction and lands one non-obvious consequence: because the raw signal
  tracks number density, the *uncorrected* reading multiplied by the calibration pressure gives you
  the true **partial pressure** regardless of where you are standing. Which quantity you want decides
  whether you correct at all.
- **Temperature.** Warmer air is less dense at fixed pressure, so the same effect runs the other way,
  plus the absorption line shapes themselves change with temperature. Sensors compensate internally;
  the compensation is not perfect and is one of the things a calibration is checking.

There is a second-order term worth knowing the name of: **pressure broadening**. Collisions widen
absorption lines, so at lower pressure the same molecules absorb over a narrower range of
wavelengths. Inside a fixed filter bandwidth that changes the effective `k` slightly, which is why a
real correction uses the manufacturer's coefficient rather than the clean `P_cal / P` ratio. The
ratio is the first-order term and it is the right one to reason with.

## Cross-sensitivity

Anything else that absorbs inside the filter's passband is indistinguishable from CO₂. In ordinary
air the honest list is short — 4.26 µm is a well-chosen window — but it is not empty:

- **Water vapour.** The wings of its bands reach in, and humid air is denser in absorbers generally.
  More seriously, water that *condenses* on an optical surface is not a spectroscopic problem, it is
  an opaque one.
- **Nitrous oxide and carbon monoxide** absorb near 4.5 and 4.6 µm respectively. Not a concern in a
  bedroom; potentially one in a cave, a vehicle cabin, or a lab.
- **Anything that fogs, films, or dusts the window** looks exactly like more CO₂, because it removes
  light in both the numerator and — in a single-channel sensor — nothing cancels it.

Being able to say "this reading rose, and here is why it was not CO₂" is a skill M10 makes a whole
module out of.

## T90, filtering, and the cost of a quiet number

**T90** is the time a sensor takes to reach 90 % of its new reading after the gas at its inlet
changes in a step. It is a property of the sensor — its optical volume, how fast gas exchanges
through it, its electronics, and its digital filter. `GLOSSARY.md` §2 keeps it strictly separate from
**transport delay**, which is the time gas takes to get from the sampling inlet to the sensor through
tubing. That is plumbing, it is M6's subject, and the two are corrected differently.

Every NDIR reading is noisy, and the standard cure is a digital low-pass filter: average the last N
measurements before reporting. This is not free. A filter that removes noise removes fast changes,
because to a filter those are the same thing. The trade is exact and it has a direction:

**More filtering buys you precision and costs you time resolution.** If the thing you are trying to
see oscillates — and a breath oscillates, at roughly 0.25 Hz for an adult at rest — then a filter
slower than the oscillation does not merely delay the signal. It erases it.

That is not a hypothetical for this project. V14 does the arithmetic, and the answer depends on a
datasheet detail nobody on this team has measured.

## Quantisation

The last thing that happens to a reading before you see it is that it becomes an integer.

A sensor reporting in steps of 10 ppm cannot represent 405 ppm. It reports 400 or 410, and a real
5 ppm change produces no change at all in the output. The step size is the sensor's **resolution**,
and it is a different quantity from its accuracy and from its noise — a sensor can be repeatable to
one step and wrong by fifty.

Two numbers to carry:

- **Worst-case quantisation error is half a step.** ±5 ppm on a 10 ppm grid.
- **Its standard deviation is step / √12**, or 2.9 ppm on a 10 ppm grid, if you assume the true value
  is equally likely to sit anywhere within a step.

And one consequence that is specific to this project. The rebreathing measurement is
`C_chin − C_top` — a **difference of two quantised readings**, each carrying its own independent
quantisation error. Errors add in quadrature, so the difference carries √2 times the noise of either
sensor: about 4.1 ppm on a 10 ppm grid. Whether that matters depends entirely on how big the signal
is, and V14 makes you decide rather than telling you.

---

## Current state: the SprintIR-6S-20 %, exactly as the firmware speaks to it

The headset carries three **GSS SprintIR-6S-20 %** sensors, one per pod. They replaced the SenseAir
S8/S88 parts that ARES 1 used. Each speaks the GSS **ASCII protocol over UART at 9600 8N1** — a
letter, an optional space-separated parameter, terminated `\r\n`. Every response is one
`\r\n`-terminated line **with a leading space**, and an unrecognised command is answered `?`.

There is no I²C on these parts and no bus addressing of any kind. That single fact drives most of
what follows.

### `Z` returns raw counts, not ppm

The command to read the latest measurement is `Z`. What comes back is **not a ppm figure**. It is a
raw count, and the firmware multiplies it:

```
ppm = raw × multiplier
```

The multiplier is **not hardcoded**. At boot the firmware asks each sensor for its own, using the
`.` command, and stores the reply. A 0–5 % part answers 1 and reports ppm directly; the **0–20 %
part answers 10**; a 0–100 % part answers 100. Probing rather than assuming means the same firmware
runs on any variant, and it means a mis-shipped part is caught at boot instead of producing readings
that are wrong by a factor of ten.

It also means **the 0–20 % part quantises to 10 ppm**, and that outdoor ambient arrives on the wire
looking like this:

```
→  Z\r\n
←  " Z 00040\r\n"        raw 40 × multiplier 10 = 400 ppm
```

Which is the whole of the last two sections made concrete: the part was specified for a 0–200,000 ppm
range, the range set the multiplier, and the multiplier is the resolution. Nobody chose "10 ppm
steps". They chose 20 % full scale, and 10 ppm steps came with it.

### Warm-up is derived from uptime, because there is nothing to ask

The SenseAir parts ARES 1 used exposed a status register with a warm-up bit — you could ask the
sensor whether it was ready. **GSS exposes no such bit.** So the firmware counts instead:
`co2WarmingUp()` is simply `millis() < 30000`. For the first 30 seconds after power-on, every CO₂
reading is suppressed, `co2Warmup[i]` is set, and the app and dashboard show "warming up" rather than
a number.

Thirty seconds is not arbitrary but it is not measured either. It comes from two things added
together: the part's quoted sub-30-second start-up, and the digital filter needing roughly its own
setting in seconds to converge. The filter is set to **32** (`A 32`), the GSS general-purpose
recommendation.

Suppressing rather than displaying is the right call and it is worth saying why. An unconverged
filter output is not a bad reading — it is a *plausible* reading that is wrong, which is the kind
this project cannot afford. A blank labelled "warming up" cannot be mistaken for data.

### `K 0` goes first at boot, or the other two sensors are corrupt

Sensor 1 owns its own UART. **Sensors 2 and 3 share one**, and because GSS parts have no bus
addressing they can never both be live on it. So `co2Port()` calls `end()`, then `begin()` with the
target sensor's pins, waits, and drains the receive buffer before every single access. Two sensors,
one port, strictly one at a time.

Now the failure this creates. GSS sensors **ship in streaming mode** — mode `K 1`, in which the
sensor transmits a measurement line continuously, unprompted, forever. Put a streaming sensor on a
shared port and it does not merely produce noise on its own channel: its unsolicited lines are
sitting in the buffer when the firmware re-pins the port and asks the *other* sensor a question, and
the reply the parser reads is the wrong sensor's.

So `probeAndInitCO2()` sends **`K 0` first**, before anything else, up to three times — because a
streaming sensor is mid-line when you start and a command has to land on a clean boundary. Only once
the sensor is quiet does the rest of the sequence run:

| Order | Command | What it does |
|---|---|---|
| 1 | `K 0` | command mode — **stop streaming**, retried up to 3× |
| 2 | `.` | report the ppm multiplier — and double as the presence probe |
| 3 | `A 32` | set the digital filter |
| 4 | `@ 0` | disable automatic baseline correction (M10 explains why) |
| 5 | `K 2` | polling mode — speak only when asked |

Step 2 is doing two jobs on purpose. A valid reply to `.` proves the sensor is physically there
*and* tells the firmware how to scale it, so presence detection and configuration are the same round
trip. A sensor that does not answer is marked absent and skipped on every subsequent poll, which is
why the headset runs with any subset of its sensors fitted.

### What happens to a reading after that

The three CO₂ sensors are read one per pass of a six-step state machine — steps 0–2 read the SHT45s,
steps 3–5 read the CO₂ sensors, one step per `loop()` call so no single iteration blocks. A failed
read is retried three times. A successful one has the per-pod **software offset** added
(`co2Offset[]`, held in NVS), then lands in the 30-column CSV every 5 seconds and goes out over BLE
in the `LIVE` characteristic at about 1 Hz.

Two consequences of those rates are worth writing down now, because they bound what any later model
can do. At 1 Hz you have four samples per breath at 15 breaths per minute — thin but usable. At the
CSV's 0.2 Hz you have less than one sample per breath, so **breathing is below Nyquist in the logged
file** and cannot be recovered from it at all. M8's respiration model has to read the live stream,
not the CSV.

### Pressure arrives and is not used

The phone sends ambient pressure to the headset over the BLE `PHONE` characteristic. The firmware
stores it in `phonePressure`, writes it into the JSON snapshot and the CSV's `press_hpa` column —
and never applies it to a CO₂ reading. There is no pressure correction anywhere in the firmware or
in the app's science models today.

There is one at the **display** layer, and it is worth knowing about precisely because it is not in
either of those places. `correctedCO2()` in `app/lib/services/co2_correction.dart` multiplies by
`1013.25 / press_hpa`, and `home_screen.dart` applies it to the pod cards when the `showCorrected`
toggle is on. So the number on the card can differ by several percent from `co2_ppm3` in the CSV for
the same instant, and nothing in the payload, the file, or the UI records which convention a given
number was taken under. M9 makes that a lesson about data contracts.

The data is already there and the correction is one multiply. V14 shows you what it is worth at a
field site, and the answer is large enough to move a reading across the app's danger threshold.

---

## What's next

**Open-path laser spectroscopy.** L05's paper is the reason this section exists. JPL's Portable
Tunable Laser Spectrometer has been operating on the ISS since September 2025, and it does not have
a sample line, a pump, or a filter. A tunable laser is swept across an individual absorption line,
the line shape is fitted, and the concentration falls out of the fit. The numbers to compare against
the part on the headset: **±0.003 mmHg accuracy and precision — about 4 ppm at sea level — at 2 Hz,
in 13 × 8 × 8 cm, under 800 g and under 3 W.** Four ppm is better than one quantisation step of the
sensor we have.

It also does not use the 4.26 µm band. CO₂ and water are measured together near **2.68 µm** with an
interband cascade laser through a single 9 cm pass, and oxygen near **760 nm** with a VCSEL,
bounced seven times between two mirrors for a 56 cm effective path and read by wavelength modulation
spectroscopy at the second harmonic. Different band, different laser, different technique, same Beer–
Lambert law at the bottom of it.

**Oxygen and bioeffluents in the pod.** The next-generation pod on the 7/30 deck adds a **SEN0465**
oxygen channel — closing the loop on respiratory exchange at the face rather than only tracking the
CO₂ half of it — and a **BME680**, which replaces the SHT45 and adds barometric pressure and a VOC
channel in one package. The deck records an open problem with the oxygen part in plain language: it
is very large, and it may have to become a separate attachment rather than fit in the pod.

Note what a BME680 quietly fixes. It puts a **barometer in every pod**, which means the pressure
correction stops depending on a phone being connected.

**The variant question, which is genuinely open.** The 20 % part covers 0–200,000 ppm and resolves
10 ppm. The 5 % part covers 0–50,000 ppm and resolves 1 ppm. Undiluted exhaled breath is about
40,000 ppm, and a chin pod samples air that has already mixed, so it is worth asking out loud whether
ARES ever needs the top 150,000 ppm of its range — and what a factor of ten in resolution would be
worth to a measurement that is a small difference between two pods. The deliverables document says
"order 3× SprintIR CO₂ sensors" and does not name a variant. Nobody has written down the reasoning
either way. This is not a recommendation; it is a question with a stated trade, and answering it
properly needs the bench data E02 has you take.

---

**Sources.** Current state — the sensor part, the ASCII protocol and framing, `Z` returning raw
counts, the `.`-probed multiplier and the 10 ppm quantisation, the 30-second uptime-derived warm-up
and the absent status bit, the `K 0`-first boot order and the shared-UART corruption it prevents, the
`A 32` filter, `@ 0`, `K 2`, the shared-port teardown in `co2Port()`, the six-step state machine, the
software offset, the 5-second CSV row and the ~1 Hz BLE `LIVE` notify, and `phonePressure` being
logged but never applied: `C:\Users\Henry\Documents\ARES\ARES2ESP32\CLAUDE.md` §"Sensor Architecture"
and §"Hardware Pinout", and `src/main.cpp` — the constants at lines 49–76, `co2Port()` at 316,
`co2Command()` at 332, `co2ParseValue()` at 349, `readCO2()` at 363, `probeAndInitCO2()` at 403,
`applyCO2Offset()` at 573, `co2WarmingUp()` at 584, the state machine at 600–651, and the notify and
logging cadences in `loop()`. Pod positions and the SenseAir-to-SprintIR replacement:
`ARES_7_30_26.pptx` slide 3. The next-generation pod, the SEN0465 oxygen channel, the BME680, and the
open problem with the oxygen part's size: `ARES_7_30_26.pptx` slide 11. PTLS performance, dimensions,
mass, power, wavelengths, path lengths, and technique: Sanders et al. (2026), ICES-2026-75, §II and
Table 1 (`SOURCES.md`, `sanders2026`). The unspecified SprintIR variant in the procurement task:
`ARES_CO2_Headset_Summer2026_Deliverables.docx` §2.3.4. Units and the ppm ↔ mmHg conversion:
`GLOSSARY.md` §5. The illustrative `k` and every number in the Beer–Lambert table are computed in
`videos/V14-decoding-a-reading.md`, which states where the constant comes from — it is a worked
teaching value, not a published GSS figure.
