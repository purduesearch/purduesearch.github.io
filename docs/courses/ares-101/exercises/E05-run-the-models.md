# E05 — Run the models

> CONTENT section · ARES 101 · M8 · ~2 min to read, 30–60 minutes at a keyboard
> Seeded into `contentJson` as rich text. Depends on `C19` (the ten models and the grounding ladder)
> and `C13` (the rebreathed-fraction definition). `V16` is helpful but not required.
>
> **Three paths through this exercise, and all three end in the same place.** Path A runs the test
> suite. Path B runs one model without the test suite, for when path A will not start — which on
> Windows it very often will not, and the reason is given below. Path C needs nothing but this page
> and a calculator. **Everybody does the hand computation regardless of which path they took**, because
> the hand computation is the exercise and running the code is only how you check yourself.

---

## Why this exercise exists

`C19` told you that `app/lib/science/` is plain Dart with no user-interface dependency, and that this
is deliberate: a model with no UI dependency can be tested without a device. That is a claim about the
codebase, and you should not take claims about a codebase on trust when the codebase is thirty seconds
away.

More to the point, this is the fastest way into the repository. The science layer is the one part of
ARES you can read, run and modify without a headset, without Bluetooth, without a subject, and without
understanding the firmware. Ten short files. Every one of them is a function that takes numbers and
returns numbers.

**Start with `rebreathing`.** It is twenty-two lines including comments, it is the model `C13`
already defined for you, and it is the one every other CO₂ result in the app is built on.

## Path A — run the test suite

```bash
git clone <the ARES repo>
cd ARES2ESP32/app
flutter pub get
flutter test test/science/
```

Ten test files, and they should run in seconds. Then narrow to one:

```bash
flutter test test/science/rebreathing_test.dart
```

If that works, skip to **The hand computation**.

## Path B — when `flutter test` will not start

On a Windows machine without Developer Mode enabled, `flutter test` stops before running anything:

```
Building with plugins requires symlink support.

Please enable Developer Mode in your system settings. Run
  start ms-settings:developers
to open settings.
```

**This was reproduced on a real machine while writing this exercise**, so if you hit it you have not
done anything wrong. Two options.

Enable Developer Mode, which is a genuine machine-wide setting change and is your call to make. Or —
and this is the better lesson — **notice that you do not need the test runner at all.**

Look at the top of `lib/science/rebreathing.dart`:

```dart
import 'constants.dart';
```

That is the entire dependency list. Not Flutter, not Riverpod, not a plugin — one sibling file that
itself imports nothing. The reason `flutter test` needs plugin symlinks is that it is prepared to run
*widget* tests, and none of them are yours. So run the model directly with the Dart VM instead.

Create `app/tool/hand_check.dart`:

```dart
import '../lib/science/rebreathing.dart';
import '../lib/science/constants.dart';

void main() {
  final f = computeRebreathedFraction(co2Chin: 1000, co2Top: 500);
  print('kExhaledCo2Ppm       = $kExhaledCo2Ppm');
  print('f(chin=1000, top=500) = $f  -> ${(f * 100).toStringAsFixed(4)}%  "${rebreathingLabel(f)}"');
}
```

Then:

```bash
flutter pub get     # still needed once, for the package config
dart run tool/hand_check.dart
```

That path was run while writing this exercise and it works. Delete the file when you are done, or keep
it — it is a scratchpad, not a contribution.

**The transferable point is worth more than the workaround.** `C19` argued that a dependency-free
science layer is testable without a device. Path B is that argument being cashed: the thing that
blocked you was a *plugin* dependency belonging to the app, and the model was reachable anyway because
it does not have one. That is what the boundary is for.

## Path C — no Dart at all

You do not need it. The whole file is reproduced under **The source, in full** below. Read it and do
the arithmetic. You will lose nothing except the satisfaction of watching it agree with you.

---

## The source, in full

`app/lib/science/constants.dart`:

```dart
/// Reference CO2 concentration in exhaled breath (ppm).
const double kExhaledCo2Ppm = 38000;

/// Typical outdoor/fresh-air CO2 baseline (ppm).
const double kOutdoorCo2Ppm = 420;
```

`app/lib/science/rebreathing.dart`:

```dart
import 'constants.dart';

/// Rebreathed fraction: fraction of inhaled air previously exhaled.
///
/// Formula: f = (co2Chin - co2Top) / (kExhaledCo2Ppm - co2Top), clamped 0..1.
/// Uses Chin pod as exhaled-air proxy and Top pod as ambient.
double computeRebreathedFraction({
  required double co2Chin,
  required double co2Top,
}) {
  final denom = kExhaledCo2Ppm - co2Top;
  if (denom <= 0) return 0.0;
  return ((co2Chin - co2Top) / denom).clamp(0.0, 1.0);
}

/// Human-readable label for a rebreathed fraction (0..1).
String rebreathingLabel(double fraction) {
  if (fraction < 0.002) return 'None';
  if (fraction < 0.01) return 'Low';
  if (fraction < 0.03) return 'Moderate';
  return 'High';
}
```

And the test whose arithmetic you are about to reproduce, from
`app/test/science/rebreathing_test.dart`:

```dart
test('computes correct fraction: f = (chin - top) / (exhaled - top)', () {
  // f = (1000 - 500) / (38000 - 500) = 500 / 37500 ≈ 0.01333
  final f = computeRebreathedFraction(co2Chin: 1000, co2Top: 500);
  expect(f, closeTo(500 / 37500, 1e-6));
});
```

---

## The hand computation

### 1 · Reproduce the test

Take the test's inputs — chin 1,000 ppm, top 500 ppm — and compute the rebreathed fraction by hand
from `C13`'s formula. Then read the label off `rebreathingLabel`.

Write down four things: the numerator, the denominator, the fraction to six decimal places, and the
label. Then check them against the test's own comment, and against the program output if you ran one.

You should get exact agreement, not approximate. This is a two-line function; if you are off, one of
you is wrong and it is worth finding out which.

### 2 · Explain the two clamps

The function has two guards and neither is decoration. For each, write one sentence saying **what
physical situation produces it**:

- `if (denom <= 0) return 0.0;`
- `.clamp(0.0, 1.0)`

The test file gives you a hint on the second: there is a case called *"clamps to 0 when chin < top
(sensor noise)"*. Say why chin below top is a thing that will genuinely happen on a real headset, and
what `C13` and `M10` say about the size of the disagreement between two uncalibrated pods.

### 3 · Find the discrepancy

This is the part with teeth, and it is why the exercise names this model.

`V12` — M2's worked problem — computes a rebreathed fraction using an exhaled-breath concentration of
**40,000 ppm**. The shipped constant is **38,000 ppm**.

Take `V12`'s own readings, chin 1,850 and top 700, and compute the fraction **both ways**. Then read
the label off `rebreathingLabel` for each.

Then answer, in a sentence each:

1. Which of the two constants is correct?
2. What is the smallest change in the **chin reading** that would move the label across the
   High/Moderate boundary, at each constant? How does that compare to the SprintIR's 10 ppm
   quantisation step from `C16`?
3. Does the ventilation risk tier in `wells_riley.dart` flip too? Work it out rather than guessing —
   the thresholds are in the file and `C19` quotes them.

Question 1 is not rhetorical and it does not have the answer you expect. Think about what would have
to be true for either number to be *correct* rather than *defensible*.

### 4 · Then read one more model, and question something

Open any second file in `lib/science/` and read it end to end. Then write down **one design decision
you would question**, with a reason.

`C19` will have primed you for several, so if you want the exercise to be worth doing, either pick one
`C19` does not mention, or pick one it does and say something `C19` does not — how you would test
whether it matters, or what you would change it to, or why on reflection you think it is fine.

## What to hand in

Half a page.

1. **Which path you took** — A, B or C — and, if B, whether the symlink error is what stopped you.
2. **The four numbers from step 1**, and whether they matched.
3. **The two clamps**, one sentence each.
4. **The step 3 table** — two constants, two fractions, two labels, the two boundary chin values, and
   your answers to the three questions.
5. **One design decision you would question**, with a reason and, ideally, with the test you would run
   to settle it.

---

## Answers

**Do steps 1 to 3 before reading this.** Step 4 has no answer key by design.

### Step 1

```
numerator    = 1000 − 500                 =    500 ppm
denominator  = 38000 − 500                = 37500 ppm
f            = 500 / 37500                = 0.013333
label        = 0.01 ≤ 0.013333 < 0.03     → "Moderate"
```

Run through the Dart VM, the same call prints `0.013333333333333334`, which is the same number to
every digit either of you can defend. The test asserts `closeTo(500 / 37500, 1e-6)`, so it is checking
the identical arithmetic — the test is not an independent oracle, it is a regression guard. Worth
noticing: a test written as `closeTo(500/37500, ...)` will keep passing if somebody changes
`kExhaledCo2Ppm`, because the literal `37500` came from `38000 − 500` at the time it was written.

### Step 2

**`denom <= 0`** happens when the top pod reads at or above the assumed exhaled concentration — 38,000
ppm, which is 3.8 %. Nothing a person is standing in reads that unless the sensor has failed or the
headset is inside a CO₂ source. Without the guard the function would divide by zero or, worse, return
a large negative fraction from a negative denominator. It is a division guard, not a physical
statement, and returning 0.0 is the safe direction: it under-reports rather than emitting nonsense.

**`clamp(0.0, 1.0)`** has two ends and they fail for different reasons. The **lower** end is the one
that happens constantly: chin below top. A rebreathed fraction cannot be negative, but two independent
NDIR sensors reading genuinely uniform air will disagree — `C13` notes the difference inherits both
sensors' errors, and `M10` builds the error budget around exactly that. A hundred ppm of disagreement
between uncalibrated pods is unremarkable, and in still uniform air that lands the raw numerator at
−100 and the fraction at −0.0027. Clamping to zero is correct and it also **hides** the disagreement,
which is why per-pod calibration is not optional. The **upper** end only triggers if the chin exceeds
the assumed exhaled concentration, which means the assumption was wrong for that subject.

### Step 3

| | `C_exhaled` = 38,000 | `C_exhaled` = 40,000 |
|---|---|---|
| Numerator | 1,150 | 1,150 |
| Denominator | 37,300 | 39,300 |
| `f_rb` | 0.030831 | 0.029262 |
| As a percentage | **3.083 %** | **2.926 %** |
| `rebreathingLabel` | **"High"** | **"Moderate"** |
| Chin reading on the 3 % boundary | 1,819 ppm | 1,879 ppm |
| `classifyVentilationRisk` | high | high |

**1 · Which is correct?** Neither, and that is the answer. Both are plausible mixed-expired
concentrations — end-tidal CO₂ in a healthy adult is around 5 %, and mixed expired gas is lower
because the last part of a breath is diluted by anatomical deadspace, so anything from roughly 3.5 %
to 4.5 % is defensible. Neither figure was measured on the subject whose data is being processed.
For a number to be *correct* here you would need a capnograph on that person, and at that point you
would not need the constant. So the honest statement is that `f_rb` is a fraction computed against an
assumed reference, and it should never be quoted without saying which reference. `V12` says the same
thing about the same number and it is worth having arrived at it twice.

**2 · The boundary.** Solve `0.03 = (C_chin − 700) / (C_exhaled − 700)`. At 38,000 the boundary sits
at 1,819 ppm; at 40,000, at 1,879 ppm. The constant moves the High/Moderate threshold by **60 ppm**,
and the SprintIR-6S-20 % quantises to 10 ppm (`C16`), so the entire disagreement between two
reasonable assumptions is **six of the smallest steps the sensor can take.** The label is a
finer-grained judgement than the choice of constant supports.

**3 · The tier does not flip.** `classifyVentilationRisk` puts the boundary between moderate and high
at `f = 0.02`, and both fractions are comfortably above it. Two models, one shared input assumption,
different sensitivities to it — which is the useful generalisation: **the same assumption is load-
bearing in one model and irrelevant in another, and you cannot tell which without checking.** Check
before you decide how carefully to argue about a constant.

### A note on what you just did

You have now verified one of the ten models in `C19`'s table against its own source, found a live
inconsistency between the course and the code, and quantified what it costs.

That took about half an hour. `C19` puts four of the ten models on the bottom rung of the grounding
ladder and three more on the middle rung with chosen constants around a sound core. **Every one of
those is available to be checked the same way**, and none of them has been. If you are looking for a
first contribution to ARES, that is where it is: not writing a new model, but reading an existing one
and writing down what it actually assumes.
