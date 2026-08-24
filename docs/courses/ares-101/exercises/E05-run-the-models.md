---
promptText: "Work the exercise below and submit your answers here, labelled by step so a reader can follow them. There are three paths through it and all three are equally acceptable: path A runs the Flutter test suite, path B runs one model directly through the Dart VM when the test runner will not start, and path C uses nothing but this page and a calculator. Say which one you took, and if it was B say whether the symlink error is what stopped you. Then note the thing that decides how you should spend your time: EVERYBODY DOES THE HAND COMPUTATION REGARDLESS OF WHICH PATH THEY TOOK, because the hand computation IS the exercise and running the code is only how you check yourself. An answer that reports program output with no arithmetic behind it has skipped the exercise, whichever path produced the output. What carries the most weight here is not the numbers but what you make of them. Step 3 asks which of the two exhaled-CO2 constants is correct; that question is not rhetorical and it does not have the answer you expect, so think about what would have to be true for either number to be CORRECT rather than merely DEFENSIBLE. Work out whether the ventilation tier flips rather than guessing - the thresholds are in the file and C19 quotes them. Then read a second model in lib/science/ end to end and write down one design decision you would question, with a reason and, ideally, with the test you would run to settle it; step 4 has no answer key by design, so either pick something C19 does not mention or say something about it that C19 does not. Write at least 250 words. The answers to steps 1 to 3 are published at the bottom of the page on purpose, because a learner who has to go looking for them will not check their work - this section is not gated and you may read them the moment you are done. Reading them first turns a thirty-minute exercise into a five-minute one and teaches you nothing."
minWords: 250
rubric:
  - id: constant
    point: "THE INTERPRETATION THIS EXERCISE EXISTS FOR - weight it accordingly, and the exercise flags it in advance by saying the question does not have the answer you expect. Step 3, question 1: which of the two exhaled-CO2 constants is correct, the shipped 38,000 ppm or the 40,000 ppm V12 worked with. The answer is NEITHER, and that being the answer is the point. Full credit needs the correct-versus-defensible distinction made explicitly and at least one physiological reason behind it: end-tidal CO2 in a healthy adult runs around 5 percent, mixed expired gas is lower because the last part of a breath is diluted by anatomical deadspace, so anything from roughly 3.5 to 4.5 percent is defensible, and both figures sit in that band. Neither was measured on the subject whose data is being processed. The closing move is what separates a full answer from a partial one - for a number to be CORRECT here you would need a capnograph on that person, and at that point you would not need the constant at all, so the honest statement is that a rebreathed fraction is a fraction computed against an ASSUMED REFERENCE and should never be quoted without saying which reference. Award partial to an answer that picks one constant and argues it is better supported while still acknowledging neither is measured. Award missed to an answer that names one as correct and stops, because that is the expected wrong answer and the whole step is built to catch it. Extra credit for noticing that V12 arrives at the same conclusion about the same number, and that it is worth having got there twice by different routes."
    weight: 4
  - id: clamps
    point: "Step 2, and the reason it is worth more than its length suggests: it asks what PHYSICAL SITUATION produces each guard, not what the guard does, and the two clamps fail for entirely different reasons. The denominator guard fires when the top pod reads at or above the assumed exhaled concentration - 38,000 ppm, which is 3.8 percent, and nothing a person is standing in reads that unless the sensor has failed or the headset is inside a CO2 source. Without it the function would divide by zero or, worse, return a large negative fraction from a negative denominator. It is a division guard rather than a physical statement, and returning zero is the safe direction because it under-reports instead of emitting nonsense. The clamp has two ends and full credit requires them to be distinguished. The LOWER end is the one that fires constantly: chin below top. A rebreathed fraction cannot be negative, but two independent NDIR sensors reading genuinely uniform air will disagree - per C13 the difference inherits both sensors' errors and M10 builds its error budget around exactly that - and a hundred ppm of disagreement between uncalibrated pods is unremarkable, which in still uniform air puts the raw numerator at minus 100 and the fraction near minus 0.0027. The observation that earns the point is that clamping to zero is correct AND ALSO HIDES the disagreement, which is why per-pod calibration is not optional. The UPPER end only triggers if the chin exceeds the assumed exhaled concentration, which means the assumption was wrong for that subject. Partial credit for an answer that describes both guards correctly but treats the clamp as one thing with one cause."
    weight: 3
  - id: sensitivity
    point: "Step 3, questions 2 and 3, which are one idea approached from two directions - how far does the choice of constant actually propagate. Question 2 is arithmetic with a conclusion attached: solving the 3 percent boundary for the chin reading puts it at 1,819 ppm under 38,000 and 1,879 ppm under 40,000, so the constant moves the High-Moderate threshold by 60 ppm, and since the SprintIR-6S-20 percent quantises to 10 ppm per C16 the entire disagreement between two reasonable assumptions is SIX of the smallest steps the sensor can take - which means the label is a finer-grained judgement than the choice of constant supports. Question 3 must be WORKED rather than guessed, because the exercise says so: classifyVentilationRisk bins the fraction at 0.5 percent and 2 percent, both fractions here are comfortably above 0.02, and the tier does NOT flip. Full credit requires the generalisation that follows, in some form - two models, one shared input assumption, and completely different sensitivities to it, so the same assumption is load-bearing in one place and irrelevant in another and you cannot tell which without checking, which is what tells you how carefully to argue about a constant. Credit generously an answer that goes further and notices something C19 does not put this way: the app carries TWO different threshold ladders over the same quantity, rebreathingLabel at 0.002, 0.01 and 0.03 and classifyVentilationRisk at 0.005 and 0.02, so the same fraction can be Moderate on one scale and high on the other by construction. Partial credit for the 60 ppm figure with no comparison to the quantisation step, or for asserting the tier does not flip without working it."
    weight: 3
  - id: question-a-model
    point: "Step 4, which has no answer key by design and is the step most likely to be skipped. Reads a SECOND file in lib/science/ end to end and names ONE design decision to question, with a reason and ideally with the test that would settle it. The bar the exercise sets is that C19 will have primed the learner for several, so the answer must either pick something C19 does not mention or say something about it that C19 does not - how you would test whether it matters, what you would change it to, or why on reflection you think it is fine, which is a legitimate and underused answer. Any of these earns full credit if it is argued: PMV implements ISO 7730 faithfully but takes six inputs of which the headset measures one and a half, with mean radiant temperature falling back to air temperature and air velocity defaulting to a constant 0.1 m/s until the M7 anemometers land, so a standard implemented on estimated inputs is not a standard-grade result. The dosimeter's activityBreakdown attributes each trapezoidal segment to the activity code of the EARLIER of its two samples, so a segment straddling the moment a subject stands up is charged entirely to sitting - noise over a long session, a bias over one with many short activity changes. The dosimeter's 420 ppm baseline is defensible and should still be stated whenever a dose is quoted. The file called wells_riley.dart does not implement Wells-Riley - there is no quanta emission rate, no exposure time and no infector in it, and there could not be, since the headset does not know whether anybody in the room is infectious; it bins a rebreathed fraction per Rudnick and Milton, which its own doc comment says accurately while the filename and the deck do not. Or the metabolic model, built on heart-rate reserve and a rule of thumb. Award full credit for a decision this course never mentions provided it is real and argued. Award partial for a decision named with no reason, and missed for an answer that does not open a second file."
    weight: 3
  - id: numbers
    point: "The hand computation. Everybody does it whichever path they took, so its ABSENCE is a missed regardless of how the answer was produced - a paste of program output with no arithmetic behind it has skipped the exercise - but its weight here is deliberately low, because a right number from a method nobody can see is not what this exercise teaches. Step 1 wants four things written down: numerator 1,000 minus 500 is 500 ppm, denominator 38,000 minus 500 is 37,500 ppm, the fraction to six decimal places is 0.013333, and the label is Moderate since 0.01 is at or below 0.013333 which is below 0.03. Step 3 wants the table: numerator 1,150 both ways; denominators 37,300 and 39,300; fractions 0.030831 and 0.029262, that is 3.083 percent and 2.926 percent; labels High and Moderate respectively; boundary chin values 1,819 and 1,879 ppm; and the ventilation tier high in both columns. Do not withhold credit for a difference in the last decimal place, and do not require six decimals if the working is visible. Award missed only for an error in KIND - inverting the fraction, using the chin rather than the top pod in the denominator, or dropping a factor of ten. Extra credit, not required for full marks, for the observation that the Dart test is not an independent oracle: it asserts closeTo of 500 over 37,500, which is the identical arithmetic, so it is a regression guard rather than a check, and because the literal 37,500 came from 38,000 minus 500 at the time it was written the test would keep passing if somebody changed the constant it exists downstream of."
    weight: 2
  - id: path
    point: "Says which path was taken - A, B or C - and, if B, whether the symlink error is what stopped it. This is worth crediting rather than treating as bookkeeping, because the three paths are not equivalent in what they demonstrate and the exercise wants that noticed. Full credit for the path stated plus any engagement with the transferable point path B is built to make: C19 argued that lib/science/ has no user-interface dependency and is therefore testable without a device, and path B is that argument being cashed - the thing that blocked flutter test was a PLUGIN dependency belonging to the app, symlink support for widget tests that are not yours, and the model was reachable anyway through the Dart VM because rebreathing.dart imports exactly one sibling file that itself imports nothing. That is what the boundary is for, and a learner who ran path A or C can still make the point by reading the import list. Credit equally an answer that took path C: the exercise says so explicitly, the whole source is reproduced on the page, and nothing is lost except the satisfaction of watching the program agree with you. Do not credit an answer that reports a path but shows no arithmetic - that is covered by the numbers field and should fail there."
    weight: 2
referenceAnswer: |
  DRAFT - pending ARES team review. Drawn from the exercise body and from C13, C16, C19 and V12,
  with V16 as background. It encodes claims about the ARES app's current source that the team
  should check against the repository before this course is published, since two of the numbers
  graded here are constants somebody can change in one line.

  WHAT A GOOD ANSWER CONTAINS

  Five labelled items, half a page. The arithmetic is the smallest part of it.

  The exercise offers three paths - run the test suite, run one model through the Dart VM, or use
  nothing but the page and a calculator - and they are equally acceptable. What is NOT optional is
  the hand computation: everybody does it regardless of path, because the hand computation is the
  exercise and running the code is only how you check yourself. An answer that reports program
  output with no arithmetic behind it has skipped the exercise even if the output is right.

  Weight interpretation over the numbers. The numbers here are four divisions and they are not
  hard. What separates a good answer is what the learner makes of them: that neither exhaled-CO2
  constant is correct and the question of which is better is the wrong question; that a 60 ppm
  disagreement between two reasonable assumptions is six quantisation steps and therefore finer
  than the label it moves; that the same assumption is load-bearing in one model and irrelevant in
  the next; and that a clamp which fixes a number can also hide the thing you needed to see.

  THE WORKED ANSWERS

  Copied from the exercise body, which publishes them on purpose - a learner who has to go looking
  for the answers will not check their work. They are ground truth for grading, not a template a
  learner has to match. Step 4 has no answers here or in the body, by design.

  STEP 1 - REPRODUCE THE TEST

      numerator    = 1000 - 500              =   500 ppm
      denominator  = 38000 - 500             = 37500 ppm
      f            = 500 / 37500             = 0.013333
      label        = 0.01 <= 0.013333 < 0.03 -> Moderate

  Through the Dart VM the same call prints 0.013333333333333334, the same number to every digit
  either of you can defend. Worth noticing, and worth extra credit if a learner gets there: the
  test asserts closeTo of 500 over 37500, which is the identical arithmetic, so it is a regression
  guard rather than an independent oracle - and because the literal 37500 came from 38000 minus 500
  at the time it was written, the test would keep passing if somebody changed kExhaledCo2Ppm.

  STEP 2 - THE TWO CLAMPS

  The denominator guard, denom at or below zero, happens when the top pod reads at or above the
  assumed exhaled concentration of 38,000 ppm, which is 3.8 percent. Nothing a person is standing
  in reads that unless the sensor has failed or the headset is inside a CO2 source. Without the
  guard the function would divide by zero or return a large negative fraction from a negative
  denominator. It is a division guard, not a physical statement, and returning 0.0 is the safe
  direction because it under-reports rather than emitting nonsense.

  The clamp to 0..1 has two ends and they fail for different reasons. The LOWER end is the one that
  happens constantly: chin below top. A rebreathed fraction cannot be negative, but two independent
  NDIR sensors reading genuinely uniform air will disagree - C13 notes the difference inherits both
  sensors' errors, and M10 builds its error budget around exactly that. A hundred ppm of
  disagreement between uncalibrated pods is unremarkable, and in still uniform air that puts the raw
  numerator at minus 100 and the fraction at about minus 0.0027. Clamping to zero is correct and it
  also HIDES the disagreement, which is why per-pod calibration is not optional. The UPPER end only
  triggers if the chin exceeds the assumed exhaled concentration, which means the assumption was
  wrong for that subject.

  STEP 3 - THE DISCREPANCY, on V12's readings of chin 1,850 and top 700

                                  C_exhaled = 38,000     C_exhaled = 40,000
      numerator                          1,150                  1,150
      denominator                       37,300                 39,300
      f_rb                            0.030831               0.029262
      as a percentage                  3.083 %                2.926 %
      rebreathingLabel                    High                Moderate
      chin on the 3 % boundary       1,819 ppm              1,879 ppm
      classifyVentilationRisk             high                   high

  1 - WHICH IS CORRECT. Neither, and that is the answer. Both are plausible mixed-expired
  concentrations: end-tidal CO2 in a healthy adult is around 5 percent, and mixed expired gas is
  lower because the last part of a breath is diluted by anatomical deadspace, so anything from
  roughly 3.5 to 4.5 percent is defensible. Neither figure was measured on the subject whose data
  is being processed. For a number to be CORRECT here you would need a capnograph on that person,
  and at that point you would not need the constant. So the honest statement is that f_rb is a
  fraction computed against an assumed reference and should never be quoted without saying which
  reference. V12 says the same thing about the same number, and it is worth having arrived at it
  twice.

  2 - THE BOUNDARY. Solve 0.03 = (C_chin - 700) / (C_exhaled - 700). At 38,000 the boundary sits at
  1,819 ppm; at 40,000, at 1,879 ppm. The constant moves the High-Moderate threshold by 60 ppm, and
  the SprintIR-6S-20 percent quantises to 10 ppm per C16, so the entire disagreement between two
  reasonable assumptions is six of the smallest steps the sensor can take. The label is a
  finer-grained judgement than the choice of constant supports.

  3 - THE TIER DOES NOT FLIP. classifyVentilationRisk puts the boundary between moderate and high
  at f = 0.02, and both fractions are comfortably above it. Two models, one shared input
  assumption, different sensitivities to it - which is the useful generalisation: the same
  assumption is load-bearing in one model and irrelevant in another, and you cannot tell which
  without checking. Check before you decide how carefully to argue about a constant.

  STEP 4 - NO KEY, BY DESIGN

  The learner reads a second file in lib/science/ and names one design decision they would
  question. There is no right answer and the grader must not supply one. What follows is a list of
  decisions that are real and gradeable, so that an answer landing any of them can be recognised -
  it is NOT a list of the acceptable answers, and a decision this course never mentions earns full
  credit provided it is argued.

  PMV is ISO 7730:2005 implemented faithfully, including the numerically stable bisection for the
  clothing-surface temperature, and it takes six inputs of which the headset measures one and a
  half. Mean radiant temperature falls back to air temperature because there is no globe
  thermometer; air velocity defaults to a constant 0.1 m/s until M7's anemometers land; metabolic
  rate comes from a bottom-rung model; clothing insulation is typed in. The algorithm is a standard
  and the answer is not.

  The dosimeter's activityBreakdown charges each trapezoidal segment to the activity code of the
  EARLIER of its two samples, so a segment straddling the moment a subject stands up is charged
  entirely to sitting - noise over a long session, a bias over one with many short activity
  changes. Its 420 ppm baseline is a defensible choice that should still be stated whenever a dose
  is quoted.

  wells_riley.dart does not implement Wells-Riley. There is no quanta emission rate, no exposure
  time and no infector in the file, and there could not be, because the headset does not know
  whether anybody in the room is infectious. It bins a rebreathed fraction into three tiers per
  Rudnick and Milton, which its own doc comment states accurately while the filename and the status
  deck do not. The design decision to question is the NAME, and the cost of it is that somebody
  repeats the slide.

  And one this course does not put this way, which is worth extra credit if a learner finds it: the
  app carries two different threshold ladders over the same quantity. rebreathingLabel breaks at
  0.002, 0.01 and 0.03; classifyVentilationRisk breaks at 0.005 and 0.02. The same fraction can
  therefore be Moderate on one scale and high on the other by construction, and nothing in either
  file acknowledges the other.

  HOW TO GRADE THIS SECTION

  Do not privilege path A. A learner who took path C and did the arithmetic on paper has done the
  exercise; a learner who ran the test suite and pasted a green tick has not. The path is worth
  crediting for what it demonstrates about the science layer's boundary, not for how much software
  was installed.

  Grade question 1 of step 3 strictly and everything numerical generously. Naming one constant as
  correct and stopping is the expected wrong answer and the step is built to catch it; a slip in
  the last decimal place of a fraction is not worth a comment.

  Reward a learner who says a decision is fine on reflection, with a reason, exactly as much as one
  who proposes a change. Step 4 asks for a design decision QUESTIONED, and concluding that it
  survives the question is a legitimate outcome that the phrasing of the step invites and almost
  nobody takes.

  A NOTE FOR WHOEVER MAINTAINS THIS FILE

  This rubric is graded against constants and thresholds that live in one line each of a repository
  outside this one. kExhaledCo2Ppm at 38,000, the rebreathingLabel breaks at 0.002, 0.01 and 0.03,
  the classifyVentilationRisk breaks at 0.005 and 0.02, and C16's 10 ppm quantisation are all load
  bearing here, and three of the four also appear in the learner-facing body below. If any of them
  changes, fix the body and this block in the same commit - and note that if the app ever adopts
  40,000 ppm, or reconciles its two threshold ladders, the whole of step 3 stops being a live
  discrepancy and the exercise needs a new one.
---

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
