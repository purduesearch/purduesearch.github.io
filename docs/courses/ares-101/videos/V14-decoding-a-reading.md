# V14 — Worked problem: decoding a reading

| | |
|---|---|
| **Course / section** | ARES 101 · M5 · "Worked problem: decoding a reading" |
| **Runtime** | 9:10 |
| **Format** | Tablet handwriting over slide backdrop + VO |
| **Backdrop** | Static slide: left third is a schematic NDIR cell — source, path bracketed `L`, filter, detector — with the writing area to its right. From 03:30 the backdrop swaps to a terminal window showing a live GSS exchange. From 06:50 it swaps to a blank board with a barometer drawn top-left |
| **Prerequisite on screen** | Nothing. `k`, `L` and the multiplier are all written out before use |
| **Recorded** | ☐ |

## Purpose

C16 asserts four things a reader has to take on trust: that absorbance is linear and transmission is
not, that the 10 ppm step size is a *consequence* of choosing a 0–20 % part rather than a defect, that
a digital filter can erase the signal you came for, and that a pressure correction is worth doing.
This is where a viewer earns all four with a pencil.

Part 2 is the reason the video exists, and its punchline is the quantisation: **at 10 ppm resolution
a 5 ppm real change is invisible.** That goes on screen in writing, at full size, not only in the
voice-over.

Part 3 carries the one genuinely surprising result in the module: the uncorrected reading is already
the right answer if what you wanted was partial pressure, and correcting it would make it wrong.
A viewer who leaves able to multiply by 1013.25/950 but unable to say *which quantity* they just
computed has missed it.

## Values used, and where they come from

| Symbol | Value | Source |
|---|---|---|
| `k` | 4.0 × 10⁻⁶ ppm⁻¹ cm⁻¹ | **Teaching value, derived on screen** from one calibration point in Part 1. Not a published GSS constant — GSS does not publish an effective band-averaged absorption coefficient, and the SprintIR's path length is not in the datasheet we hold |
| `L` | 5.0 cm | Chosen for the worked instrument. **Not the SprintIR's path length**, which is unpublished. Said aloud at 00:50 |
| Multiplier, 0–20 % part | 10 | `src/main.cpp:403–423` — probed with `.` at boot, not hardcoded |
| Multiplier, 0–5 % / 0–100 % part | 1 / 100 | `src/main.cpp:93–96` comment |
| Digital filter | `A 32` | `src/main.cpp:62` |
| Warm-up | 30,000 ms | `src/main.cpp:67` |
| BLE `LIVE` notify | ~1 Hz | `src/main.cpp`, `loop()` |
| CSV row interval | 5,000 ms | `src/main.cpp:699` |
| Breathing rate, adult at rest | 15 breaths/min = 0.25 Hz | Stated as an assumption on screen |
| Standard atmosphere | 1013.25 hPa = 760 mmHg | `GLOSSARY.md` §4 |
| App danger threshold | 2,000 ppm | `C15` current state (`app/lib/services/threshold_service.dart`) |
| M2's worked pair | chin 1,850 ppm · top 700 ppm · exhaled 40,000 ppm | `V12`, reused unchanged |

Every result below was recomputed at review:

| Quantity | Working | Value | On screen as |
|---|---|---|---|
| Absorbance at the calibration point | `−ln 0.9802` | 0.020000 | 0.0200 |
| `k` | `0.0200 / (1,000 × 5.0)` | 4.000 × 10⁻⁶ | 4 × 10⁻⁶ ppm⁻¹ cm⁻¹ |
| Absorbance of the unknown | `−ln 0.9048` | 0.100041 | 0.1000 |
| Unknown concentration | `0.100041 / (4.0 × 10⁻⁶ × 5.0)` | 5,002 ppm | **5,000 ppm** |
| Transmission at 400 ppm | `e^(−0.008)` | 0.992032 | 99.20 % — 0.80 % absorbed |
| Transmission at 50,000 ppm | `e^(−1.0)` | 0.367879 | 36.79 % |
| Transmission at 200,000 ppm | `e^(−4.0)` | 0.018316 | **1.83 %** |
| Absorbed-fraction span, 400 → 200,000 ppm | `0.981684 / 0.007968` | 123.2 | **123× for a 500× range** |
| Same at `L` = 1 cm, 200,000 ppm | `e^(−0.8)` | 0.449329 | 44.9 % |
| Same at `L` = 1 cm, 400 ppm | `1 − e^(−0.0016)` | 0.0015987 | **0.16 % absorbed** |
| Decode ` Z 00040` | `40 × 10` | 400 ppm | **400 ppm** |
| Neighbouring codes | `39 × 10`, `41 × 10` | 390, 410 ppm | 390 · **405 ✗** · 410 |
| Quantisation σ, one sensor | `10 / √12` | 2.887 ppm | 2.9 ppm |
| Quantisation σ, chin − top | `√2 × 2.887` | 4.083 ppm | **4.1 ppm** |
| `f_rb`, M2's pair | `(1,850 − 700) / (40,000 − 700)` | 0.0292621 | **2.93 %** |
| `f_rb` quantisation band | `1,140/39,300` to `1,160/39,300` | 2.9008 – 2.9517 % | ±0.87 % relative |
| Filter case A — τ | `32 / ln 10` | 13.8975 s | — |
| Filter case A — `f_c` | `1 / (2π × 13.8975)` | 0.011452 Hz | 0.011 Hz |
| Filter case A — gain at 0.25 Hz | `1 / √(1 + 21.8306²)` | 0.045760 | **4.6 %** |
| Filter case A — a 200 ppm swing | `200 × 0.04576` | 9.15 ppm | **9 ppm — one step** |
| Filter case B — τ | `(32/20) / ln 10` | 0.694875 s | — |
| Filter case B — `f_c` | `1 / (2π × 0.694875)` | 0.229045 Hz | 0.23 Hz |
| Filter case B — gain at 0.25 Hz | `1 / √(1 + 1.09149²)` | 0.675530 | **68 %** |
| Filter case B — a 200 ppm swing | `200 × 0.67553` | 135.1 ppm | **135 ppm** |
| Ratio between the two cases | `135.1 / 9.15` | 14.8 | **15×** |
| Pressure factor | `1013.25 / 950` | 1.0665789 | 1.0666 |
| True mole fraction | `1,890 × 1.0665789` | 2,015.83 ppm | **2,016 ppm** |
| Under-read, as a fraction of truth | `125.83 / 2,015.83` | 0.06242 | **6.2 % low** |
| Correction, as a fraction of the reading | `125.83 / 1,890` | 0.06658 | **+6.7 %** |
| Partial pressure, from the raw reading | `1,890 × 10⁻⁶ × 760` | 1.43640 mmHg | **1.436 mmHg** |
| Partial pressure, the long way | `2,015.83 × 10⁻⁶ × 712.559` | 1.43640 mmHg | **identical** |
| Ambient in mmHg at 950 hPa | `950 × 760 / 1013.25` | 712.559 mmHg | 712.6 mmHg |
| Fraction of NASA's 4 mmHg limit | `1.4364 / 4` | 0.3591 | 36 % |
| Quantisation step after correction | `10 × 1.0666` | 10.67 ppm | 10.7 ppm |

**Two things in that table are assumptions, not facts, and both are flagged on screen.** The
single-pole model of the `A 32` filter is a modelling choice made to get an order of magnitude — GSS
does not publish the filter's transfer function in anything this team holds. And the two candidate
readings of what `A 32` means, 32 seconds against 32 samples at the part's update rate, are
**genuinely unresolved**: nobody on this team has measured it. Deliverable 2.5.5 says measure T90 with
a step change, and this video is the argument for why that task matters more than its priority label
suggests. Do not let the narration collapse the two cases into one answer.

## Shot list

| Time | On screen | What is written |
|---|---|---|
| 00:00–00:34 | Backdrop, NDIR cell schematic, `L` bracketed across the path | The question, boxed: *what is actually in the number?* |
| 00:34–01:20 | Board | `I = I₀ e^(−kCL)`, then rearranged to `ln(I₀/I) = kCL`, absorbance boxed |
| 01:20–01:38 | **PAUSE CARD 1** over dimmed board | "1,000 ppm through 5.0 cm transmits 98.02 % of the light. Find `k`." |
| 01:38–02:14 | Board | `−ln 0.9802 = 0.0200`; `k = 0.0200 / 5,000 = 4 × 10⁻⁶` boxed |
| 02:14–02:44 | Board | The unknown: `−ln 0.9048 = 0.1000`; `C = 0.1000 / 2 × 10⁻⁵ = 5,000 ppm` |
| 02:44–03:30 | Board, five-row table building downward | The transmission table: 400 · 1,000 · 5,000 · 50,000 · 200,000 ppm against 99.20 · 98.02 · 90.48 · 36.79 · **1.83** % |
| 03:30–04:04 | **Backdrop swaps to a terminal**; the exchange typed live | `→ Z` … `← " Z 00040"`, then `40 × 10 = 400 ppm` written beside it |
| 04:04–04:22 | **PAUSE CARD 2** over the terminal | "The same sensor is asked to report 405 ppm. What does it send?" |
| 04:22–05:02 | Terminal, three codes drawn as a number line | `39 → 390` · `40 → 400` · `41 → 410`, with **405** written between two ticks and struck through |
| 05:02–05:38 | Board beside the terminal | `σ = 10/√12 = 2.9 ppm`; then `chin − top` written, `√2 × 2.9 = 4.1 ppm` boxed |
| 05:38–06:10 | Board, M2's pair recalled in the margin | `f_rb = 1,150 / 39,300 = 2.93 %`, then the ±10 ppm band written as `2.90 – 2.95 %` |
| 06:10–06:50 | Board split into two columns headed **32 s?** and **1.6 s?** | Both `f_c` values, both gains at 0.25 Hz, and the two swing figures `9 ppm` / `135 ppm` |
| 06:50–07:10 | **Backdrop swaps to the blank board**; barometer drawn top-left | `950 hPa` written under the barometer; `Z` reads `1,890 ppm` written beside it |
| 07:10–07:28 | **PAUSE CARD 3** over dimmed board | "Calibrated at 1013.25 hPa, measured at 950. Is the reading high or low, and by how much?" |
| 07:28–08:10 | Board | `1013.25/950 = 1.0666`; `1,890 × 1.0666 = 2,016 ppm`; then `2,000` written underneath with the threshold line drawn through it |
| 08:10–08:52 | Board, two columns | `1,890 × 10⁻⁶ × 760 = 1.436` beside `2,016 × 10⁻⁶ × 712.6 = 1.436`, then an equals sign drawn between them and circled |
| 08:52–09:10 | Board held; one line across the bottom | `p = C_reported × P_calibration` |

## Visual edits

| Time | Edit | Why |
|---|---|---|
| 00:26 | **Boxed question** pinned top-left for the whole video | Same rule as V11–V13. The question never leaves the frame |
| 00:44 | On the schematic, the arrow through the cell **thins visibly** as it crosses the gas, and the thinning is drawn as *exponential*, not linear | The exponential is the entire content of Part 1. Draw it before writing it |
| 00:58 | **Lower third:** "`L` = 5.0 cm is our worked instrument. GSS does not publish the SprintIR's path length" | The one place a viewer could walk away with a false fact about the real part. Say it in writing, once, early |
| 01:52 | `k` written, then a **small tag beside it: "we just measured this"** | `k` arrives from a calibration point, not from a table. That is how every real instrument gets its constant, and the tag is the whole lesson |
| 02:56 | In the transmission table, the **99.20 % and 1.83 % rows are boxed together** and the span `123×` written between them, next to `500×` for the concentrations | Two numbers side by side make the compression visible; either alone hides it |
| 03:18 | The bottom row of the table **greys out** and `L = 1 cm` is written beside it, with `44.9 %` replacing `1.83 %` and `0.16 %` replacing `0.80 %` | The path-length trade shown as an edit to a table the viewer already read, rather than as a second table |
| 03:34 | The terminal shows the response **with its leading space visible**, highlighted | Every GSS response has one. It is the first thing that breaks a hand-rolled parser |
| 04:30 | `405` written on the number line, then **struck through**, then a **hard-edged red X** placed on it, held 3 s | This is the punchline of the video. Give it the dwell |
| 04:46 | **Lower third at full size:** "at 10 ppm resolution, a 5 ppm real change is invisible" | Verbatim. Not paraphrased, not shortened, not in smaller type |
| 05:10 | `10 ppm` **traced back** to the multiplier, and the multiplier traced back to `0–20 %` on the part number, drawn as two arrows | Resolution is downstream of a purchasing decision. One picture says that; a sentence does not |
| 05:44 | The `±0.87 %` band drawn as a **thin grey ribbon** around `2.93 %` — deliberately narrow | An honest picture. Quantisation is *not* the dominant error here, and drawing it fat to make the point louder would be a lie |
| 06:04 | Then the same ribbon drawn against a **50 ppm** difference instead, where it is nearly as wide as the signal | The contrast is the teaching. Same noise, two signals, opposite verdicts |
| 06:14 | The two filter columns get **different coloured headers and a question mark in each**, and neither is ticked | Neither case is the answer. If one column ends up ticked in the edit, the shot is wrong |
| 06:44 | **Lower third:** "single-pole model · nobody here has measured this · deliverable 2.5.5" | The assumption, the gap, and the fix, in one line |
| 07:34 | `1013.25 / 950` written, then the result **annotated twice**: "+6.7 % of the reading" and "6.2 % of the truth" | Two correct percentages for one correction. Showing both is the only way to stop someone quoting the wrong one |
| 07:58 | The `2,000 ppm` threshold drawn as a **horizontal line**, with `1,890` plotted below it and `2,016` above, and the app's alert bell drawn once — greyed on the left, lit on the right | The consequence is not "the number moved". It is "the wearer was told something different" |
| 08:36 | The equals sign between the two partial-pressure columns drawn **slowly**, then circled, then held 5 s in silence | This is the result nobody expects. Silence does more for it than narration |
| 09:00 | `p = C_reported × P_calibration` written, then `P_actual` written beneath and **crossed out** | The absent variable is the point |

## Narration

**[00:00 — the question]**

A pod on the headset says one thousand eight hundred and ninety parts per million. Before you can do
anything with that number — put it in a paper, alert somebody, subtract it from another pod — you
have to know what is actually in it.

*(beat)*

There are three answers hiding in that reading. There is physics, which is Beer–Lambert. There is a
protocol decision, which is where the resolution comes from. And there is a missing correction, which
is worth more than you would guess. We are going to pull all three out, in that order.

**[00:34 — Beer–Lambert]**

Start with the physics, and it is one equation.

*(writing)*

Light in, `I` nought. Light out, `I`. And in between, `I` equals `I` nought times `e` to the minus `k`
`C` `L`.

`C` is the concentration. `L` is how far the light travelled through the gas. `k` is a property of
the molecule and the wavelength you chose to look at.

*(beat)*

Notice it is an exponential, not a straight line. Light does not lose a fixed *amount* per
centimetre. It loses a fixed *fraction* per centimetre, and fractions compound.

So take the log of both sides and flip it up the right way.

*(writing)*

Log of `I` nought over `I` equals `k` `C` `L`. That left-hand side has a name — absorbance — and here
is why we bother. **Absorbance is linear in concentration. Transmission is not.** Every mistake in
this part of the module is a version of forgetting that.

One thing to say out loud before we use numbers. Our path length is five centimetres, and that is a
worked instrument, not the sensor on the headset. G S S does not publish the SprintIR's path length,
and we are not going to invent one.

**[01:20 — pause 1]**

Your turn. A thousand parts per million, through five centimetres, transmits ninety-eight point nought
two percent of the light.

Find `k`.

*(pause — hold the card)*

**[01:38 — the constant]**

Minus the natural log of nought point nine eight nought two. Nought point nought two, exactly.

Divide by `C` `L` — a thousand times five is five thousand — and `k` is four times ten to the minus
six, per part per million, per centimetre.

*(beat)*

Now look at what just happened, because it is how every real instrument gets its constant. We did not
find `k` in a table. We measured a known gas and solved backwards. That is a calibration, and you have
just done one.

**[02:14 — the unknown]**

Same cell, unknown gas. It transmits ninety point four eight percent.

*(writing)*

Minus log of nought point nine nought four eight is nought point one nought nought. Divide by `k` `L`
— four times ten to the minus six, times five, is two times ten to the minus five.

Five thousand parts per million.

**[02:44 — the table nobody draws]**

Now the thing this equation is actually trying to tell you. Watch the transmission as we walk up the
range.

*(writing the table)*

Four hundred: ninety-nine point two percent gets through. A thousand: ninety-eight. Five thousand:
ninety point five. Fifty thousand: thirty-six point eight.

Two hundred thousand parts per million — full scale on the part we own — one point eight percent.

*(pause)*

Read the top and the bottom together. The concentration went up by a factor of five hundred. The
fraction of light removed went up by a factor of a hundred and twenty-three. And nearly all of that
compression is at the top.

So at four hundred parts per million you are trying to see eight parts in a thousand of your light
disappear. At two hundred thousand you have one point eight percent of your light left and another
thousand parts per million barely moves it.

*(the bottom row greys, `L` = 1 cm is written)*

Shorten the path to one centimetre and it flips. Full scale is now a comfortable forty-five percent
transmission — but four hundred parts per million removes nought point one six percent, and to see a
ten-parts-per-million change you need to resolve four parts in a hundred thousand.

**One optical design cannot be excellent at both ends.** Hold on to that, because in about ninety
seconds it stops being a general remark about instruments and becomes a specific fact about our data.

**[03:30 — what comes back on the wire]**

Part two. Here is the actual conversation between the firmware and one sensor.

*(the terminal)*

We send `Z`, which means "give me your latest measurement". And back comes — space, `Z`, zero zero
zero four zero.

*(beat)*

Every G S S response has that leading space. It is the first thing that breaks a parser somebody
wrote in a hurry.

But look at the number. Forty. That is not parts per million. `Z` returns **raw counts**, and the
firmware multiplies them by a per-sensor multiplier that it asked the sensor for, at boot, with a
single full stop. The zero to twenty percent part answers ten.

Forty times ten. **Four hundred parts per million.** Outdoor ambient.

**[04:04 — pause 2]**

So here is the question, and it is not a trick.

The same sensor sits in air at four hundred and five parts per million. What does it send?

*(pause — hold the card)*

**[04:22 — the punchline]**

It sends forty. Or forty-one. It cannot send four hundred and five, because there is no code for it.

*(the number line; 405 struck through; the red X)*

Thirty-nine is three hundred and ninety. Forty is four hundred. Forty-one is four hundred and ten.
There is nothing in between and there never will be.

*(beat)*

**At ten parts per million resolution, a five parts per million real change is invisible.** Not noisy.
Not hard to see. Absent from the output.

*(the arrows are drawn)*

And now trace where the ten came from. Ten is the multiplier. The multiplier is ten because the part
is the zero to twenty percent variant. Nobody sat down and decided this instrument should quantise to
ten parts per million — somebody ordered a sensor with a two hundred thousand parts per million range,
and the resolution came in the same box. That is the trade from Part 1, arriving as a purchase order.

**[05:02 — how much does it cost you]**

Fair question: how much does that actually cost us? Let us not just assert that it is bad.

*(writing)*

If the true value is equally likely to sit anywhere inside a step, the standard deviation of the
quantisation error is the step over root twelve. Ten over three point four six. **Two point nine parts
per million.**

And the measurement this project cares about is chin minus top — a difference. Two sensors, two
independent quantisation errors, adding in quadrature. Root two times two point nine.

**Four point one parts per million** on the difference.

*(M2's pair, in the margin)*

So take the pair from M2. Chin eighteen fifty, top seven hundred, exhaled breath forty thousand.
Rebreathed fraction is eleven fifty over thirty-nine thousand three hundred — two point nine three
percent.

*(the thin grey ribbon)*

Push the quantisation through it and the answer moves between two point nine nought and two point
nine five percent. Under one percent, relative.

*(pause)*

Which is honest, and it is not the answer you were expecting me to give. **Quantisation is not what is
wrong with the rebreathing number.** M10's calibration errors are ten times larger and they are the
thing to worry about.

*(the ribbon is redrawn against 50 ppm)*

But watch it against a small signal. Two pods in the same fresh air, differing by fifty parts per
million. Now the four point one is nearly a tenth of the whole thing, and a genuine five-part
difference between two pods is simply not in the data.

Same instrument, same noise, two completely different verdicts. Which is why "what is the resolution"
is never the right question. The right question is **"what is the resolution, next to the signal I
came for."**

**[06:10 — the filter, and the thing nobody here has measured]**

One more way a reading is not the gas, and this one is about time rather than amplitude.

The firmware sends `A 32` at boot — G S S's digital filter, at its general-purpose setting. A filter
kills noise by averaging, and averaging is exactly what kills a fast change, because to a filter those
are the same thing.

*(the two columns appear)*

Here is the problem. There are two ways to read what thirty-two means, and they give completely
different answers.

Read it as thirty-two **seconds** of settling — which is what the comment in our own firmware assumes
— and treating it as a single-pole filter puts the corner at about nought point nought one one hertz.
Breathing is nought point two five hertz. The gain there is four point six percent. A two hundred
parts per million breath swing arrives as **nine parts per million** — which is one quantisation step.
The breathing signal is gone.

Read it as thirty-two **samples** at the part's own update rate — one point six seconds — and the
corner is nought point two three hertz. The gain at breathing rate is sixty-eight percent. The same
swing arrives as **a hundred and thirty-five parts per million**. Perfectly usable.

*(beat)*

Fifteen times apart. One of those is a headset that can see you breathe and one is not, and it is the
same line of code.

*(the lower third)*

I am not going to tell you which it is, because nobody on this team knows. The single-pole model is
mine, chosen to get an order of magnitude. The measurement that settles it is in the deliverables
already — subtask two point five point five, measure T ninety with a step change — and it is twenty
minutes of bench work. That is the highest-value twenty minutes in this module.

**[06:50 — the correction nobody applies]**

Part three. Take the headset to a field site.

*(the barometer, the reading)*

Ambient is nine hundred and fifty hectopascals. The chin pod reads one thousand eight hundred and
ninety parts per million. The sensor was calibrated at one atmosphere.

Remember what the sensor physically does. It counts absorbing molecules in its optical path. At nine
fifty there are fewer molecules of everything.

**[07:10 — pause 3]**

So: is that reading high or low, and by how much?

*(pause — hold the card)*

**[07:28 — the arithmetic]**

Low. Fewer molecules, less absorption, a smaller number.

*(writing)*

Ten thirteen point two five over nine fifty. One point nought six six six.

Eighteen ninety times that is **two thousand and sixteen parts per million**.

*(the two annotations)*

And say that carefully, because there are two right percentages here. The correction adds six point
seven percent *to the reading*. The uncorrected reading is six point two percent *below the truth*.
Same correction, two denominators. People quote these interchangeably and they are not the same
number.

*(the threshold line, the bell)*

Now the part that matters. The app's danger threshold is two thousand. Eighteen ninety is under it —
no alert. Two thousand and sixteen is over it. The correction did not move a number in a spreadsheet.
It moved whether the person wearing this was told anything.

And the firmware does not do it. Ambient pressure already arrives from the phone, gets logged into the
`press_hpa` column, and is never applied to a CO₂ reading. The data is there. The multiply is not.

**[08:10 — the result nobody expects]**

One last thing, and it is the best thing in this module.

We wanted a mole fraction, so we corrected. But suppose what you actually wanted was **partial
pressure** — which, from M4, is the quantity a body responds to.

*(left column)*

Take the raw uncorrected reading, eighteen ninety, and multiply by the calibration pressure, seven
hundred and sixty millimetres. One point four three six millimetres of mercury.

*(right column)*

Now do it the long way. Corrected mole fraction, two thousand and sixteen, times the *actual* ambient
pressure at nine fifty hectopascals, which is seven hundred and twelve point six millimetres.

*(the equals sign is drawn, slowly, then circled — hold)*

One point four three six.

*(silence)*

Identical. And not by luck. The sensor's signal tracks number density, and number density is partial
pressure over `k` `T`, so the reading times the calibration pressure gives you partial pressure and
the actual ambient pressure cancels straight out.

*(writing the final line, then crossing out `P_actual`)*

`p` equals `C` reported, times `P` calibration. The pressure where you are standing is not in that
equation.

**[08:52 — what to take away]**

So which is it — correct, or do not correct?

*(beat)*

**Whichever quantity you asked for.** If you are comparing against another site's parts per million, or
against a tier boundary, or against another pod, you want mole fraction, and you must correct. If you
are asking what this person's lungs saw, you want partial pressure, and the raw reading already gave
it to you — correcting first and *then* converting would double-count the pressure and hand you an
answer that is six percent wrong in the confident direction.

One reading. Two right answers. The instrument cannot tell you which one you meant.

*(hold, fade)*

---

**Word count:** ~1,760 · **Target pace:** 150 wpm + three 18-second pauses + written-arithmetic dwell
and one deliberate 5-second silence at 08:36 ≈ 9:10

## Notes for the recorder

- **The lower third at 04:46 is verbatim.** "At 10 ppm resolution, a 5 ppm real change is invisible."
  Not "roughly invisible", not "hard to see". Q16 tests this and E02 depends on it.
- **Do not tick either filter column at 06:14.** The two readings of `A 32` are genuinely unresolved
  and the video's job is to leave a viewer wanting to measure it, not to leave them with a number they
  will repeat. If the ad-lib drifts toward "so it is probably the fast one", re-record.
- The five-second silence at 08:36 is in the script on purpose. Two columns of arithmetic landing on
  the same value is a result the viewer has to notice for themselves; narrating over it converts a
  discovery into an announcement.
- The `L` = 5.0 cm caveat at 00:58 must be spoken *and* written. The single most likely way this video
  does damage is a viewer quoting five centimetres as the SprintIR's path length in a report.
- `k` is written as "kay" throughout and never called an extinction coefficient out loud — the word is
  used three different ways in three different fields and none of them help here.
- The grey ribbon at 05:44 must stay narrow. Drawing quantisation as a dominant error to make the
  segment feel more dramatic would contradict M10, which is where the real error budget lives.
- Every number is in the values table above. If the tablet disagrees with that table, the tablet is
  wrong.
