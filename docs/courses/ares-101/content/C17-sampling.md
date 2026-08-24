# C17 — Getting the air to the sensor

> CONTENT section · ARES 101 · M6 · ~5 min read
> Seeded into `contentJson` as rich text. Depends on `C16` — specifically its T90 section — and on
> `GLOSSARY.md` §2, which keeps transport delay and T90 apart. M1's plume and M2's pod geometry are
> helpful but not required.
> This module is about everything between the air you care about and the sensor that reads it. Every
> current-state claim below names a deck slide, a deliverable subtask, or a file and line. If you
> change a tube, a fitting, or a pump constant, change this file in the same commit.

---

## The whole idea, in one sentence

The sensor does not measure the air at your chin. It measures the air that *used to be* at your chin,
a fraction of a second ago, after it has been dragged down a tube, blurred, and mixed.

Everything in this module is a consequence of that sentence. M5 taught you to distrust the number.
This module teaches you to distrust the *time* on it.

## Two clocks, and they are not the same clock

`C16` ended on **T90**: the time a sensor takes to reach 90 % of its new reading after the gas at its
inlet changes in a step. It is a property of the sensor — its optical volume, its electronics, its
digital filter.

This module is about a different quantity that arrives at the same moment and is constantly confused
with it. **Transport delay** is the time the gas takes to get from the place you wanted to sample to
the sensor's inlet in the first place. It is a property of the **plumbing**.

`GLOSSARY.md` §2 fixes the definitions and it is worth restating here in full, because the whole
module hangs off them. For a step change in the gas at the sampling tip at `t = 0`:

- **Transport delay** `t_d` — the time before the sensor sees *any* change at all. Set by the volume
  between the tip and the sensor, and by the volumetric flow rate: `t_d ≈ V / Q`.
- **T90** — measured **from the arrival of the change**, the further time to reach 90 % of the new
  steady reading. Set by the sensor.

What you actually observe is `t_d + T90`, one number, and nothing in the data separates them.

**They are corrected differently, and that is why the distinction is not pedantry.** A transport delay
is a pure shift: the signal is correct, it is just late, so you subtract it and the signal is right
again. A T90 is a *distortion*: the signal has been smeared through a low-pass filter, and undoing it
means deconvolution or accepting the loss. Subtracting a delay you should have deconvolved leaves the
distortion in place. Deconvolving a delay you should have subtracted invents structure that was never
there.

There is a third thing, and most people never name it, so it gets blamed on the sensor. **Mixing
volumes in the plumbing produce a lag of their own**, and it looks exactly like T90 because it *is* a
first-order lag — see dead volume, below. So the honest taxonomy is three terms, not two:

| Term | Where it comes from | What it does to a step | How you undo it |
|---|---|---|---|
| Transport delay | Volume between the tip and the sensor | Shifts it later | Subtract |
| Plumbing lag | Dead volume that mixes rather than displaces | Rounds the corner | Deconvolve, or design it out |
| T90 | The sensor itself | Rounds the corner | Deconvolve, or live with it |

Only the first one is transport delay. `V15` measures all three on paper and `E03` measures the sum on
the bench.

## What sets the flow through a tube

Air is pulled down the sample line by a pressure difference, and for slow flow in a round tube the
relationship between that pressure difference and the flow you get is **Hagen–Poiseuille**:

```
ΔP = 128 · μ · L · Q / (π · d⁴)
```

`μ` is the dynamic viscosity of air, `L` the tube length, `Q` the volumetric flow rate, and `d` the
**inner** diameter. Two features of that expression drive the rest of this module.

**The fourth power.** Resistance goes as `d⁻⁴`. Halving a tube's bore does not double its resistance,
it multiplies it by sixteen. This is why "confirm tubing inner diameter" appears in the deliverables
as its own line item, and why a kinked tube is not a small problem.

**It is linear in `Q`.** Double the pressure, double the flow. That makes a tube a well-behaved
resistor, which is what lets us reason about three of them in parallel in a moment.

Poiseuille is only valid while the flow is **laminar** — smooth, layered, no turbulent mixing — which
is a claim you have to check rather than assume. The check is the Reynolds number (`GLOSSARY.md` §3):

```
Re = V · d / ν
```

For the worked geometry in `V15` — 3.0 mm bore, 0.67 L/min — the mean velocity is 1.57 m/s and
**Re ≈ 308**. Transition to turbulence in a pipe is around 2,300, so we are comfortably laminar with
a factor of seven in hand. Good news for predictability, and the source of a problem two sections
down.

One consequence to note now: it takes a while for the profile to settle after the inlet. The entrance
length is roughly `0.05 · Re · d`, about **46 mm** here — so the first 5 cm of each line is still
developing, and everything after it is fully developed Poiseuille flow.

## Splitting one flow three ways, and why "matched" is hard

One pump serves three pods. The 2.00 L/min it moves has to be divided into three sample streams, and
the obvious arithmetic is that each pod gets 0.67 L/min.

That arithmetic is wrong, and the way it is wrong is the most useful thing in this module.

Three tubes hanging off a common manifold are three resistors in parallel across the same pressure
difference. They do not each take a third of the flow. **They take a share inversely proportional to
their resistance**, and resistance goes as `L / d⁴`. So if the three lines are different lengths — and
they will be, because the pods are at different distances from the backboard — the short line steals
flow from the long one.

Work it through for lines of 0.25, 0.35 and 0.45 m at the same bore, and the split is
**0.88 / 0.63 / 0.49 L/min**, not 0.67 each. The shortest line gets nearly 1.8 times what the longest
one gets.

Now put that together with `t_d = V / Q`. The long line holds *more* gas **and** receives *less* flow.
Both effects push the same way, and they compound into a result worth memorising:

> **Transport delay scales as the square of line length**, when lines share a manifold.

A 10 % length error is a 21 % delay error. Lines of 0.25 / 0.35 / 0.45 m give delays in the ratio
1 : 1.96 : 3.24 — which is exactly `1 : (0.35/0.25)² : (0.45/0.25)²`. `V15` computes the seconds and
then shows what those seconds do to a scientific claim.

This is what "balanced restriction" means and why it is genuinely hard. You are not trying to make
three tubes look tidy. You are trying to make three **resistances** equal, and resistance depends on
length, on bore, on every fitting, on every bend, and on how much dust has collected in each filter
since the last session. The cheap way to balance three resistances is to make the three lines
physically identical — same bore, same length, same fittings — and route the slack rather than cut it
out. The expensive way is to add a deliberate restriction to each short line until they match, which
works, and which drifts the moment anything gets dirty.

**Cut all three to the length of the longest.** That is the whole recommendation, and the next section
explains why the extra delay you take on costs nothing.

## Common-mode delay is free; differential delay is not

If all three lines are the same length, every pod's reading is late by the same amount — 0.29 s for
the worked geometry. That sounds like a defect and it is very nearly free, because of what ARES
actually computes.

The headline measurement is `C_chin − C_top`, a **difference between two pods**. A delay common to
both cancels out of the difference exactly. So does a delay common to all three. What does *not*
cancel is the part where one pod is later than another, and that is precisely what unmatched lines
create.

The absolute delay only starts to matter when you line a pod's reading up against something that is
**not** another pod: an anemometer channel, a breath marker, a video frame, a wall clock. Then 0.29 s
is a real offset and you subtract it. It is a single known number, it is the same every session, and
subtracting it is one line of analysis.

Differential delay is the opposite of that in every respect. It is invisible, it is not written down
anywhere, it does not average away, and it corrupts the one quantity the project exists to produce.

## Dead volume

**Dead volume** is any volume in the sample path that gas has to fill and empty rather than simply
pass through: a fitting with a shoulder in it, an over-sized chamber, a tee with a stub, the gap
around a sensor that the flow does not sweep.

A tube in laminar flow mostly *displaces* — new gas pushes old gas along in front of it. A chamber
mostly *mixes* — new gas stirs into what is already there. Those two behave completely differently
when a step arrives. A displacement volume delays the step. **A mixing volume rounds it off into an
exponential**, with time constant

```
τ = V / Q
```

and it needs `2.3 τ` to get to 90 % of the new value. For a 2 mL pod chamber at 0.67 L/min that is
τ = 0.18 s and about 0.41 s to 90 %.

Look at what just happened. **That is a T90 of 0.41 s that has nothing to do with the sensor.** It is
plumbing, it will be measured as if it were the sensor's, and it will be blamed on the sensor. Worse,
because `τ = V / Q`, the unbalanced split from the previous section makes each pod's plumbing lag
different too — the chin's chamber, at 0.49 L/min, takes 0.56 s to 90 % where the top's takes 0.31 s.

Dead volume is the one item on this list you fix by drawing rather than by computing. Sweep every
volume, no stubs, no shoulders, minimum bore consistent with not restricting the flow.

## Dispersion, or why the step arrives blurred

Here is where being safely laminar turns around and bites.

In fully developed laminar flow the velocity profile is a parabola: the gas on the centreline moves
at **twice** the mean velocity, and the gas at the wall does not move at all. So if you introduce a
perfectly sharp concentration step at the tip, it does not arrive as a step. The centre of it arrives
early, the edges arrive late, and molecular diffusion smears sideways between the fast and slow
streamlines the whole way down. The combination is called **Taylor–Aris dispersion**, and its
effective diffusivity is

```
K = D + a² · U² / (48 · D)
```

with `a` the tube radius, `U` the mean velocity and `D` the molecular diffusivity of CO₂ in air. For
the chin line in `V15`'s geometry, `K` comes out about **245 times** molecular diffusion. The tube is
not a pipe carrying a signal; it is a short chromatography column.

Two numbers follow, and both matter to `E03`:

- The step arrives with a standard deviation of about **48 ms**, so its 10–90 % rise takes roughly
  **0.12 s** — comparable to the differential delay we were worrying about above.
- Because the centreline runs at twice the mean, **the very first molecules arrive at half the
  transport delay.** For a chin line whose volumetric delay is 0.390 s, first movement shows up at
  0.195 s.

That second one is the reason `E03` tells you to read the delay off the **50 % crossing** and not off
first movement. First movement is not slightly early. It is early by a factor of two, systematically,
every time. The 50 % crossing recovers the mean transit time, which is the quantity `t_d = V / Q`
actually predicts.

A caveat, stated rather than buried: Taylor–Aris assumes the gas has had time to diffuse across the
tube, `t ≫ a² / D`. Here that threshold is 0.14 s against a residence time of 0.39 s — a factor of
2.8, which is *the same order*, not "much greater than". Treat the 48 ms as a decent estimate, not a
result. Measuring it is `E03`.

## Condensation

Exhaled breath leaves the mouth at about 35 °C and essentially saturated. Room-temperature tubing is
colder than that. Saturated air at 35 °C carries about **39.5 g of water per cubic metre**; at 22 °C
it can only hold **19.4 g**. The difference has to go somewhere, and in a tube it goes onto the wall.

Take the upper bound first, because it is alarming and it is the wrong number. If a chin line carried
*pure* saturated breath at 0.49 L/min, it would deposit about **0.6 g of water per hour** — enough to
visibly wet a 3 mm bore and eventually to slug it.

Now the honest version. The chin pod samples air that is mostly ambient with a few percent breath in
it. At 3 % breath into 22 °C air at 50 % RH, the mixture carries about 10.6 g/m³, which is 55 % RH at
22 °C. **No condensation at all.** The alarming number was an upper bound on a case that does not
occur.

So the real rule is not "breath condenses". It is: **condensation is set by the coldest surface in the
path, not by the source.** The cases that flip it are a cold environment, an already-humid room, a
line routed against something cold, or a subject exercising rather than sleeping. That makes it a
seasonal and site-specific failure, which is the worst kind — it will work all summer on the bench and
fail on the first cold night in the field.

Two consequences for design. A film of water on an optical window looks exactly like more CO₂
(`C16`, cross-sensitivity), and it is not a spectroscopic error you can correct — it is an opaque one.
And a droplet in a 3 mm bore is a partial blockage, which changes that line's resistance, which
changes its share of the split, which changes its transport delay. Condensation does not just add
noise. **It quietly re-tunes the geometry this whole module depends on.**

## Pulsation, and why it matters more than it sounds

Every positive-displacement pump — diaphragm, peristaltic, piston — moves gas in strokes. The flow it
produces is not steady; it is a mean with a ripple on top at the stroke frequency, typically tens of
hertz for a small DC diaphragm pump.

Ripple in `Q` is ripple in `t_d = V / Q` and in `τ = V / Q`. So a pulsing pump modulates both the
delay and the plumbing lag at its stroke rate, and modulates how well the sensor's chamber is swept.
That would be tolerable if it stayed at its own frequency. It does not, and the reason is `C16`'s
sampling rates.

The headset streams at about **1 Hz** over BLE and writes the CSV at **0.2 Hz**. Anything above
0.5 Hz that is not filtered out before sampling does not disappear — it **aliases**, folding down to
a low frequency indistinguishable from real signal. Run the arithmetic on a 30 Hz diaphragm pump
sampled at 1 Hz and the ripple lands at exactly **0 Hz**: a pure DC offset that changes whenever you
change the pump setting. Let the stroke rate drift to 30.3 Hz — which it will, with battery voltage
and back pressure — and the alias moves to **0.3 Hz**, sitting on top of the 0.25 Hz breathing signal
that M8 is built to extract.

That is the failure mode: not noise you can see, but a wandering artefact at breathing rate whose
frequency depends on the battery.

An ultrasonic disc pump has no strokes. Its ripple is at its **drive frequency, 20–22 kHz**, five
orders of magnitude above the breathing band and far above anything the tube's own compliance passes.
Alias 21 kHz into a 1 Hz sampler and you also get 0 Hz — but it is a *constant* 0 Hz, from a frequency
that is locked to a mechanical resonance rather than to a motor's supply voltage, and its amplitude at
the sensor is already smoothed to nothing by the volume between the pump and the pod.

"Pulsation-free" on the deck is not a comfort feature. It is the reason the pump cannot forge a
breathing signal.

---

## Current state: the Lee XP disc pump, exactly as the firmware drives it

The 7/30 deck replaces the current sampling pump with a **Lee XP Series UXPB5400200A**: a 29 mm
piezoelectric disc, 5 g, **2.00 L/min free flow** (1.70 L/min continuous), **210 mbar stall pressure**
(150 mbar continuous), **under 1 W** continuous drive power, quieter than 10 dB, rated −25 to 55 °C
over 0–95 % RH.

Put the stall pressure next to the tubing arithmetic before going further. A 0.45 m line at 3 mm bore
and 0.67 L/min drops about **46 Pa — 0.46 mbar**. Against 210 mbar of stall pressure that is
essentially nothing, which tells you two useful things: the pump is running near free flow, so the
2.00 L/min figure is a reasonable working assumption; and **the tubing is not what limits the flow**.
The balance between the lines is the problem, never the total.

### PWM cannot drive this pump, and the reason is worth understanding

Lee state it plainly in their own documentation: *"PWM drives of the type commonly used to drive DC
motors are not suitable for driving the disc pumps."* The legacy `PUMP_GATE_PIN` gate drive therefore
**cannot** run this part, and a Lee driver PCB is **mandatory** — `UXPB5400200A` is a bare pump, and
the `B` in the part number means no drive electronics in the box.

It would be easy to file that under "the vendor says so". Do not. The reason is a genuine difference
in what the two devices are, and a member who understands it will not try to save a board.

**A DC motor is an inertial low-pass filter, and PWM exploits that.** A gate drive chops the supply at
a carrier frequency chosen to be far *above* anything the motor can respond to — the firmware's legacy
channel runs at 5 kHz, 8-bit, on GPIO4. The winding inductance and the rotor's inertia average that
chopping into a smooth effective voltage, so duty cycle maps to average voltage maps to speed. The
motor never "hears" the carrier; that is the entire design intent.

**A piezoelectric disc pump is the opposite kind of device: a resonator that must be driven *at* its
resonance.** The pumping action is a standing acoustic wave in a shallow cavity, sustained by driving
the disc at its mechanical resonance of 20–22 kHz. The frequency is not a carrier to be filtered away
— it *is* the mechanism. Drive it off-resonance and the amplitude collapses, because a high-Q
resonator responds to almost nothing else.

Now hold the two side by side and the incompatibility is not subtle:

- **Wrong frequency.** The gate drive's fundamental sits at its 5 kHz carrier. The pump needs
  20–22 kHz. Duty cycle changes the pulse widths, not the fundamental.
- **Wrong shape.** The pump needs a **bipolar AC** waveform, up to about **48 Vrms**. A gate drive
  produces a unipolar switched output referenced to ground, with a large DC component. A piezo is a
  capacitor: hold DC across it and it deflects once and then does no further work.
- **Wrong amplitude.** 48 Vrms is roughly fifteen times the ESP32's logic rail, and it has to swing
  negative. Nothing on the headset's digital side can source that.
- **Wrong load.** A piezo at resonance is a reactive, capacitive load drawing large circulating
  current. A low-side MOSFET sized to sink a small DC motor's current is not a bipolar reactive
  driver, and slamming a hard edge into a capacitor produces a current spike, not pumping.
- **No feedback.** The disc's resonance **moves** with temperature, back pressure and load, so the
  driver continuously tracks it — searching for and locking onto resonance by watching drive current
  and phase. A duty-cycle register has no measurement to track with and no loop to close.

So the legacy channel is still configured in `setup()`, but it now boots at **zero duty**
(`pumpDuty = 0`), kept only so a legacy DC pump can still be fitted. Fitting an XP pump to it does not
under-drive the pump. It does nothing at all.

The driver board is reached over **UART0 at 115200 8N1** (TX GPIO15, RX GPIO16), re-pinned off the ROM
boot-log pins because UART1 and UART2 are already taken by the three CO₂ sensors. The protocol is
Lee's TG003 register interface, and it is two lines long:

```
write:  "#W<reg>,<value>\n"
read:   "#R<reg>\n"   ->   reply containing ",<value>\n"
```

Two boards speak it — the General Purpose drive PCB (`UEKA0300000AA`, device type 2) and the Smart
Pump Module carrier (device type 3) — so `lee_pump.cpp` targets the register contract rather than one
board, and reports which one answered.

### The command is power, not flow — and that is why the app says `NOM`

**The driver has no flow setpoint unless a flow sensor is fitted.** In manual mode you command
**drive power in milliwatts**, 0–1000, clamped in firmware by `PUMP_POWER_MAX_MW` rather than trusted
from the phone. The app presents a percentage and `pumpSetPowerPercent()` converts it.

Drive power is **monotonic in flow**: more power always gives more flow, and less always gives less.
That is a real and useful property — it means a slider behaves the way a user expects, and it means
you can order two settings without calibrating anything.

**Monotonic is not the same as calibrated, and this is the sentence to hold on to.** Monotonic tells
you the *direction*, never the *value*. The map from milliwatts to litres per minute depends on back
pressure, on tubing bore and length, on how loaded the inlet filter is, on ambient temperature and
pressure, and on the individual disc. 500 mW is reliably more flow than 400 mW and is not any
particular number of litres per minute.

So the firmware refuses to pretend. `PUMP_HAS_FLOW_SENSOR` defaults to **0**, and stays off until a
flow sensor is physically wired to the driver's `REGISTER_MEAS_FLOW`. With it off, the L/min figure
the system reports is `percent × PUMP_NOMINAL_MAX_LPM` — a nominal free-flow estimate scaled off the
datasheet's 2.0 L/min — and the flow-measured flag in the BLE packet stays clear, so
`pump_card.dart` renders the badge **`NOM`** instead of **`MEAS`**. The same flag surfaces as
`pump_lpm_measured` in the web JSON, and the CSV's `pump_lpm` column carries the estimate when no
sensor is fitted.

**Here is why that labelling rule exists, and it is the most important sentence in this module: an
estimate presented as a measurement is how a study gets a result nobody can reproduce.**

Sit with the mechanism, because the danger is not obvious. The nominal estimate is not noisy. It is a
deterministic function of the number you typed, so it agrees with itself perfectly, session after
session, across every subject. In a spreadsheet it will look like the *cleanest column in the file* —
no scatter, no drift, no outliers — and every derived quantity that divides by flow will inherit that
false steadiness. Per-pod transport delay is `V / Q`. Chamber flush time is `V / Q`. Every one of them
is computed against a number that was never measured, and every one of them will be quoted to three
figures.

Then somebody fits a flow sensor, finds the real throughput was 1.2 L/min against a filter that had
been loading up all summer, and every delay in every prior session was wrong by two thirds — with
nothing in the archive to reconstruct the truth from, because the recorded flow was only ever an echo
of the command. The `NOM` badge is four pixels of UI standing between this project and that outcome.

The same reasoning governs `PUMP_GP_PRESSURE_ON_ANA2`: set it to 0 on a bare General Purpose board so
the system does not report a phantom pressure from an unconnected analog input. And the pump's BLE
payload carries **both** a validity flag and a NAN/`0xFFFF` sentinel for every optional field, with
`parsePumpPacket()` requiring both to agree before it shows a value. Belt and braces, on purpose.

### Telemetry, persistence, and failure

`pumpPoll()` runs from `loop()` on a **200 ms** tick and reads exactly **one** register per tick, 8 in
rotation, so a full telemetry refresh takes about **1.6 s** and no single `loop()` iteration ever
blocks on more than one ~60 ms UART transaction. This is the same non-blocking discipline the CO₂
state machine follows in `C16`, for the same reason.

**Three consecutive failed reads trigger a re-probe** rather than more hammering; a board that stays
silent clears `present`, and the app locks its controls instead of showing stale values.

The enable state, power, mode and pressure setpoint persist in the NVS namespace `pump`
(`en`, `pwr`, `mode`, `psp`), so a power cycle mid-study cannot silently change the sampling rate —
and `pumpStoreSettings()` additionally writes them to the driver board's own NVS. A **PID pressure
mode** closing the loop on the board's pressure sensor is wired up and reachable, but manual power is
the primary control path.

### The tubing, as the deliverables actually specify it

The sample lines are not built yet, and the deliverables describe them in three places:

- **2.3.4** orders the sensors and notes: *"SprintIR sensors require specific tubing for gas sampling —
  confirm tubing inner diameter and material compatibility at time of order."*
- **2.4.4** *"Route and cut SprintIR sampling tubing to length for each sensor position; secure tubing
  to headset frame with no kinks, ensuring tip placement at intended sampling locations."*
- The deliverable's own overview adds that routing *"must reach the intended sampling locations on the
  headset without kinking, restricting airflow, or creating pressure artifacts."*

Read 2.4.4 again with this module in hand. **"Cut to length for each sensor position" is an
instruction to produce three different lengths**, and nothing in the document says to match them.
Nothing anywhere in the deliverables measures transport delay, either. The T90 subtask, **2.5.5**,
says to *"introduce step change in CO₂ concentration and record time from step to 90 % of final
reading"* — which, performed on the assembled headset with tubing fitted, measures `t_d + T90` and
labels the sum T90.

None of that is a criticism of whoever wrote the document; it is what a working document looks like
before somebody has done this module. It is written here so it gets fixed. `E03` is the fix, and the
concrete change to request is one sentence in 2.4.4: **cut all three lines to the length of the
longest, and record that length.**

---

## What's next

**The custom 3-way manifold.** The 7/30 deck replaces the current tee with a printed 3-way splitter,
so one pump feeds all three pods through *matched* streams with balanced restriction. A printed
manifold is the right answer to the balance problem for a reason worth naming: geometry that is
identical by construction cannot be mis-cut on assembly night. Whatever it is, it will still be worth
measuring — `E03` is how you check it, and a manifold makes the check pass rather than making it
unnecessary.

**An isolated pump bay, for an acoustic reason.** Lee specify nitrile O-rings, a nylon M2 bolt and a
threaded stud, and the deck records why: **metal fasteners couple the 20–22 kHz drive into the shell
as audible noise.** The drive frequency sits at the very top of adult hearing, the shell is a large
flat radiator, and a rigid metal path turns a silent pump into an audible one. On a device intended to
be worn *while sleeping*, that is a study-ending defect rather than an annoyance. The backboard gets a
compliant, isolated bay.

**A ≤ 3 µm inlet filter ahead of the pump.** It protects the disc, and it is also the component most
likely to invalidate the flow assumption in this module, because a filter's resistance rises as it
loads. On a pump commanded in milliwatts with no flow sensor, a slowly clogging filter reduces the
real flow while the reported `NOM` figure does not move at all. Filter condition belongs in the
session log.

**Per-pod anemometry, which turns the delay into something checkable.** The next-generation pod puts an
FS7 flow sensor in every pod (M7). Once each pod reports local air speed as well as concentration,
the cross-pod lag M8 infers from concentration has an independent measurement to be checked against —
and a fabricated airflow direction of the kind `V15` constructs stops being invisible.

**Open-path sensing, which deletes this module.** L05's PTLS has no pump, no sample line, no inlet
filter and no sample cell. Transport delay is not a small quantity for that instrument; it is a
quantity that does not exist, along with dispersion, condensation, dead volume and matched line
lengths. Every problem in this module is created by the decision to move the gas to the sensor instead
of putting the sensor in the gas. It is worth knowing that the entire problem class is optional.

---

**Sources.** Pump part number, 2.00 L/min free flow and 1.70 continuous, 210 mbar stall and 150
continuous, 29 mm disc and 5 g, under 1 W, under 10 dB, −25 to 55 °C at 0–95 % RH, the 20–22 kHz
≤ 48 Vrms drive requirement, the custom 3-way printed manifold replacing the tee, the nitrile
O-ring / nylon M2 / threaded stud compliant mounting and the metal-fastener noise-coupling rationale,
and the ≤ 3 µm inlet filter: `ARES_7_30_26.pptx` slide 15. The next-generation pod's per-pod FS7
anemometry: slide 11. Lee's PWM statement, the mandatory driver PCB, the bare-pump `B` suffix, the two
driver boards and their device types, the TG003 register syntax, UART0 at 115200 8N1 on GPIO15/16, the
`PUMP_POWER_MAX_MW` clamp, `PUMP_NOMINAL_MAX_LPM = 2.0`, `PUMP_HAS_FLOW_SENSOR` defaulting to 0,
`PUMP_GP_PRESSURE_ON_ANA2`, and the register map: `C:\Users\Henry\Documents\ARES\ARES2ESP32\include\lee_pump.h`.
The 200 ms poll tick, one register per tick with 8 in rotation, the 60 ms response timeout, the
`PUMP_FAIL_LIMIT` of 3 and the re-probe, `pumpNominalLpm()`, `pumpSetPowerPercent()`, and the `pump`
NVS namespace: `src/lee_pump.cpp`. The legacy 5 kHz 8-bit LEDC channel on `PUMP_GATE_PIN` (GPIO4)
booting at `pumpDuty = 0`: `src/main.cpp:39`, `:267–271`, `:1455–1458`. The `NOM` / `MEAS` badge:
`app/lib/widgets/pump_card.dart:22–23`, `:340`, `:498`; the flow-measured flag:
`app/lib/services/ble_service.dart:244`; `pump_lpm_measured` and the CSV's `pump_lpm` column, plus
the BLE `PUMP` characteristic layout: the ARES firmware `CLAUDE.md` §"Pump", §"Web Interface" and
§"Data Logging". Tubing specification and routing: `ARES_CO2_Headset_Summer2026_Deliverables.docx`
subtasks 2.3.4, 2.4.4 and 2.5.5, and Deliverable 4's overview. Sensor sample rates and the T90
definition: `C16`. The T90 / transport delay split, the property table, the plume velocity and the
units convention: `GLOSSARY.md` §2, §3, §4 and §5. Every tubing number in this file — bore, lengths,
delays, Reynolds number, pressure drop, dispersion and chamber flush — is computed in
`videos/V15-transport-delay.md`, which states which values are measured and which are worked teaching
assumptions. **No tubing has been cut yet: the 3.0 mm bore and the 0.25 / 0.35 / 0.45 m lengths are
worked assumptions, not the headset's dimensions.**
