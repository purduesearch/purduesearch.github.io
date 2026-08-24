# S05 — The roadmap and the deliverable map (deck outline)

| | |
|---|---|
| **Course / section** | ARES 101 · M11 · "Roadmap and deliverables deck" |
| **Kind** | SLIDES — built as a deck, exported to PDF, imported through the slides workbench |
| **Slides** | 14 |
| **Narration** | Optional. See production notes — most of this deck is read, not listened to. |
| **Overlay questions** | 2 (slides 8 and 9) |
| **Built** | ☐ |

## Why a deck and not a video

Because this is the deck somebody opens to **remember what they signed up for**, and that is a
look-up, not a derivation.

The test in `README.md` rule 1 is whether the content is derived or looked up. Nothing here is
derived. "Which deliverable is the wear comfort assessment in" and "when does the cave window close"
and "what exactly are the two blockers" are questions with answers, and a member asks them in the
middle of doing something else — in a meeting, halfway through a subtask, the week they join. A video
answers none of those in under three seconds.

Two slides in particular earn the format. **Slide 3 (the deliverable map)** is the one a new member
screenshots on their first day and keeps, because it is the only place all eight deliverables, their
windows and their tracks sit together. **Slide 13 (the applications grid)** is the one that gets pasted
into a funding conversation, an outreach email, or a recruitment pitch, because it is the answer to
"why should anyone outside this field care".

`C22` is where all of this is *taught* — why the analysis plan comes first, what Belmont actually
requires, what each analog environment is analogous to. Read that once. Then this deck is the thing
you reopen.

**One standing rule for whoever builds it and whoever maintains it.** Slides 3 through 7 are copied
from `ARES_CO2_Headset_Summer2026_Deliverables.docx`, and slides 10 and 11 from `ARES_7_30_26.pptx`
slides 16 and 17. **Those documents are the source of truth, not this deck.** The deliverables document
is a working document with its own revision cycle, and the blocker board changes weekly. Two
consequences. Put a **revision date on every one of those slides** — the deck is a snapshot and it
should look like one. And when a deliverable moves, revise this deck in the same commit; see
`README.md`, rule 2. A stale roadmap is worse than no roadmap, because people plan against it.

## Slides

### 1 · Title
"Doing the science." Subtitle: *the roadmap — four tracks, eight deliverables, two blockers, and the
two rules that are not negotiable.*

Footer, small, and keep it: *snapshot of the deliverables document as of \<date\>. The document is the
original.*

### 2 · The priority order, and why it is that order
Four numbered lanes, large, in order, exactly as the document states them:

> **(1) SA2TP Cave Tests → (2) Finalize ARES 2 → (3) Sleep Experiments → (4) EEG Implementation**

Under each, one line of *why it sits there*, which the document implies and does not say:

- **Cave first** — it is the only track with an external partner, an external site and a date somebody
  else set. Everything else can slip within the team; this cannot.
- **ARES 2 second** — it is upstream of the sleep study. Deliverable 5's validation is a precondition
  of the IRB submission (3.6.1), not a parallel activity.
- **Sleep third** — gated on a review the team does not control the clock of.
- **EEG last** — explicitly *planning and feasibility only*, and the document says to work it "only
  after those deliverables are on track."

Bottom strip: **tracks run in parallel where capacity allows; the priority order is what breaks ties
when it does not.**

### 3 · The deliverable map
The reference slide. One table, full bleed, nothing else on the slide.

| # | Deliverable | Track | Start | End | Tasks |
|---|---|---|---|---|---|
| 1 | ARES 1 hardware and software preparation | Cave | 11 May | 30 May | 9 |
| 2 | Cave deployment, analysis, Parks Service engagement | Cave | 2 Jun | 18 Jul | 10 |
| 3 | ARES 2 electronics design and sensor procurement | ARES 2 | 11 May | 20 Jun | 10 |
| 4 | ARES 2 assembly and sensor integration | ARES 2 | 16 Jun | 18 Jul | 11 |
| 5 | ARES 2 testing and validation | ARES 2 | 7 Jul | 8 Aug | 12 |
| 6 | Sleep experiments: IRB approval and lab setup | Sleep | 11 May | 18 Jul | 10 |
| 7 | Sleep experiments: session execution and analysis | Sleep | 21 Jul | 15 Aug | 12 |
| 8 | EEG implementation (planning and feasibility) | EEG | 1 Aug | TBD | 8 |

Draw it **as a Gantt as well as a table** if it fits — four coloured lanes, 11 May to 19 August across
the bottom. The overlaps are the content: D4 starts before D3 ends, D5 starts before D4 ends, and D7
starts three days after D6 finishes with no slack at all between them.

Caption, small: *subtask numbering is Track.Deliverable.Subtask — 2.4.3 is Track 2, Deliverable 4,
Subtask 3. Priorities inside each deliverable are HIGH (required) · MEDIUM (important) · LOW
(enhancement).*

### 4 · Track 1 — the cave
Left half, what happens: ARES 1 gets a new sewn backing for cave humidity and abrasion, control-system
bugfixes, and a written field procedure. Then handoff to **Sam Waymire**, SEARCH Astronaut Training
lead, for deployment to **Mammoth Cave**, producing a 3D airflow and CO₂ map. Post-collection: analysis
against the lab baseline, a structured findings report, and a professional approach to the Parks
Service for continued site access.

Right half, one callout, boxed:

> **The deliverable is a procedure, not a data set.** 1.1.5 requires a document good enough that Sam
> can run the device with no on-site engineering support; 1.1.6 requires a full dry run to prove it.
> On a device you can support in person, the procedure is a convenience. On one you cannot, it *is*
> the instrument.

Bottom, in the alert colour, and **do not cut it** — this is a live discrepancy, not a footnote:

> **Two project sources disagree on when the cave test happens.** The deliverables document runs the
> deployment 2 June – 18 July. `ARES_7_30_26.pptx` slide 7 says the SEARCH partnership goes into
> Mammoth Cave **in the Fall**. Ask before planning against either.

### 5 · Track 2 — ARES 2
Two columns.

**Build** (D3, D4): CTA circuit requirements → schematic → boards; three SprintIRs ordered, with tubing
inner diameter and material confirmed at order time; an O₂ sensor selected on accuracy, range, warm-up,
power and size; intake and formal handover from the capstone team, including CAD, schematics, firmware
source and the known-issues list.

**Prove** (D5): five dimensions — measurement accuracy against a **certified reference gas** (2.5.2),
**T90** by step change (2.5.5), battery life under full load, a 1 m drop test, and a 30-minute wear
comfort assessment. Plus EMI between the CTA circuits and the gas sensors (2.5.11), and the end-to-end
pipeline check sensor → controller → file (2.5.8).

One callout across the bottom, in the accent colour:

> **The device must pass every HIGH-priority check before it is used in any human-subject experiment,
> and the document says plainly: do not proceed to sleep experiments with unresolved validation
> failures.** D5 is not the last engineering task. It is the gate.

Small note: *this track is what `C16` through `C21` describe as "current state". Deliverable 5 is where
the numbers those modules ask for finally get taken.*

### 6 · Track 3 — the sleep study
Split by deliverable.

**D6 — approval and setup.** Draft and submit the IRB application; one named person watching the
portal with a 48-hour response commitment; book Herrick lab time and get access; finalise the procedure
document; set the room up and run a full cable check; dry-run the whole thing with a non-enrolled team
member; prepare consent forms and briefing materials; recruit against the approved criteria; **and
define the analysis plan (3.6.9)**.

**D7 — sessions.** Written approval confirmed; consent taken per protocol; device donned and all
channels confirmed reading before the session starts; session run exactly as approved, with deviations
logged; **data backed up to two locations immediately after each session**; participant debriefed;
data processed and compared against the D5 baseline.

Callout: *"Any deviation should be noted in the session log and, if significant, reported to the IRB."*
A protocol you departed from and recorded is a study. A protocol you departed from and did not record
is not.

### 7 · Track 4 — EEG
Eight subtasks, none of them an implementation task, and that is the point of the slide.

Scope the science first — what neural signals are actually relevant to CO₂ exposure and sleep state,
and what would EEG answer that CO₂ alone cannot. Then: dry-electrode consumer systems versus clinical
wet-electrode; electrode placement that does not collide with the pods; whether this needs an IRB
amendment or a fresh submission; a combined block diagram with a shared clock or trigger; optionally a
bench proof of concept; signal-processing tooling; and a written roadmap for next term.

Boxed, centre:

> **The deliverable is a roadmap, not a demo.** An EEG channel bolted on before anyone has decided what
> question it answers produces a second stream nobody can interpret next to the first — which is a more
> expensive way of not knowing.

Small note at the bottom, because it connects to M9: *"how do two independent devices get a common
clock" is `C20`'s question one device further out. The headset already solved its version — one device
that knows the wall clock, and monotonic interpolation from there.*

### 8 · The first rule: the analysis plan comes before the data
The deliverable text at the top, verbatim and in quotes, then the reasoning underneath as three lines,
then the overlay question.

> **3.6.9** — *Define the data analysis plan before running experiments: specify which CO₂ metrics will
> be extracted, how spatial distribution will be quantified, and what statistical comparisons will be
> made.*
> *↳ Pre-defining the analysis plan prevents outcome-driven data selection after collection.*

Three lines, large:

1. One sleep session offers **~288 defensible analyses** — 3 pod pairs × 6 statistics × 4 windows
   × 4 baselines.
2. Twenty independent comparisons at `p < 0.05` on pure noise give a significant result **64 % of the
   time**: `1 − 0.95²⁰`.
3. So choosing after you look is not one analysis. It is all of them, with the winner reported — and
   **nothing in the write-up records that it happened**, including for you.

**Overlay question (SINGLE):** *Why is the analysis plan written before the data exists?*
→ **Because after you have seen the data you cannot tell — and neither can a reader — whether the
metric you chose was the right one or the one that worked.** Writing it first converts an invisible
property of your judgement into a visible property of a document.
Distractors: *because the IRB requires it · because it saves time during analysis · because it stops
researchers from falsifying results.* The last one is the tempting wrong answer and is worth a rewind:
the rule is not aimed at dishonesty. It is aimed at a bias that operates perfectly well in an honest
person, which is why "I would notice" is not a defence.
*Rewind to this slide on a wrong answer.*

Bottom strip, in the accent colour, large:

**A plan with no possible negative result is not a plan.** Caption: *write the number that would make
you say "no" — before you look. That is `E08`.*

### 9 · The second rule: no session before written approval
One sentence on the slide, set as large as it will go.

> **No session with an enrolled human subject before written IRB approval is in hand.**

Underneath, small, three consequences rather than a restatement: data collected without approval cannot
be analysed, cannot be published, and cannot be retrospectively approved. It is not a fast start; it is
a session that did not happen, plus a serious problem for the advisor whose name is on the protocol.

Right column, headed **what you *can* do now** — bench work, the breathing mannequin, 3.6.6's full
setup dry run with a non-enrolled team member, and 2.5.10's explicitly non-IRB lab wear session. With
the caveat attached: **whether something counts as human-subjects research is the IRB's determination,
not the team's.** Ask the office, in writing, before the quick test on a friend becomes data you want
to show somebody.

**Overlay question (SINGLE):** *The IRB reviewer emails to say the protocol looks fine and formal
approval should come through next week. A participant is already scheduled for Thursday. What happens
Thursday?*
→ **Nothing happens Thursday.** Written approval in hand is the condition (3.7.1), and an encouraging
email is not it. Reschedule.
Distractors: *run it but hold the data unanalysed until approval lands · run it as a dry run and
re-enrol the participant afterwards · run it with a team member instead of the participant.* The second
is the dangerous one and deserves the rewind — a "dry run" with someone you intend to enrol, following
the study protocol, collecting study data, is the study. The third distractor is genuinely different
and worth saying out loud in the explanation: swapping in a **non-enrolled team member** for a setup
rehearsal is exactly what 3.6.6 describes and is fine. What is not fine is doing it with the person you
are about to enrol.
*Rewind to this slide on a wrong answer.*

### 10 · The blocker board
Two panels, straight off slide 16 of the 7/30 deck, with its status labels kept exactly as written.

| | **IRB approval & trainings** — *In progress* | **Component ordering** — *Delayed* |
|---|---|---|
| | Human-subjects review required before collecting participant breath and biometric data | Long lead times on key sensors and circuit components |
| | Required research-ethics / IRB training modules being completed | Orders **repeatedly cancelled or misplaced** |
| | Study protocol and consent materials under preparation | Procurement delays pushing assembly and bench testing |

Bottom bar, quoted from the deck: *what unblocks us — finish the IRB training modules and secure
approval, and lock in suppliers / place orders for long-lead parts in parallel.*

Then one honest line under it, in the alert colour, and this is the line that makes the slide worth
including rather than decorative:

> **The session window (D7) opened 21 July. This board is dated 30 July and still has IRB approval in
> progress.** A schedule gated on a review nobody on the team controls the clock of is why 3.6.1 says
> submit early and 3.6.2 says answer the reviewers within 48 hours.

### 11 · The workarounds, and what each one costs
Three rows, from slide 17. **The cost column is this deck's addition and is the reason the slide
exists** — a workaround with an unstated cost is how the next problem gets made.

| Workaround | What it buys | What it costs |
|---|---|---|
| Repurpose the **ARES 1 SprintIRs** | Three CO₂ channels on ARES 2 with no lead time | Takes them out of **Track 1's device** — the summer's top priority, field-bound, and needing to be demonstrably working before handoff |
| Place difficult orders **through the capstone team** | A purchasing route that is not cancelling orders | A dependency on a group that **disperses at end of term**. Put an expiry date next to it — and get the CAD, schematics, firmware and known-issues list first (2.4.1) |
| **External funding** | Removes the money constraint, and slide 7 names streamlining the funding and recruitment pipeline as part of the SEARCH collaboration | Solves lead time only where lead time is a money problem. It does nothing about a twelve-week queue |

Footnote in the alert colour: *`C16` records that the SprintIRs **replaced** the SenseAir S8/S88 parts
ARES 1 used, while slide 17 refers to the ARES 1 SprintIRs. Either ARES 1 was retrofitted or one
statement is loose — and which one is true decides whether row 1 costs the cave deployment its
instrument. Check before anybody unscrews anything.*

### 12 · Four analogs, and what each one is analogous to
Reference table. The framing line goes above it, large: **the useful question is never "is it like
space" — it is "which term is it reproducing".**

| Analog | Reproduces | Does not reproduce | Good for |
|---|---|---|---|
| **Cave** (Mammoth, with SEARCH) | Ventilation-poor volume, long duration, elevated stratified ambient | Buoyancy loss — 1g and cold, so `ĝ_eff` is at maximum | Field validation; accumulation in an unventilated space |
| **Supine sleep** (Herrick) | Posture — the plume leaves the chest rather than sweeping past the chin | Anything about gravity. The plume is redirected, not removed | Long controlled exposure; the sleep-apnea application |
| **Breathing mannequin** | The full physiological range, with the exhalate **known exactly** | A person — no metabolism, no skin temperature field, no HTBP | Anchoring the CFD model; no consent form |
| **37 °C thermal** | `ĝ_eff` itself. Gravity and ΔT enter as a product (`C14`) | The rest of microgravity; adds heat stress as its own confound | The only Earth condition that reproduces the *mechanism* |

Bottom strip, in the accent colour:

**The condition that best reproduces the physics is the one we cannot run yet.** Caption: *Purdue
safety caps testing below 35 °C pending IRB confirmation, so the Herrick protocol proposes 20–30 °C to
start. Meanwhile the mannequin needs no approval at all — which is why `C14` says the mannequin comes
before the person.*

### 13 · Beyond the ISS — the applications grid
Six cards, two rows of three, from slide 10 of the `ARES_CO2_Presentation` deck. **No emoji** — set
each card with a heading and two lines. The mechanism line goes across the top of the slide, because it
is what ties all six together:

> **Bulk measurement misses face-level exposure, and the plume that normally protects you can be
> removed by posture, by heat, or by confinement.**

| | |
|---|---|
| **Sleep apnea** — horizontal posture weakens the HTBP; the model predicts rebreathing events that could trigger episodes, and ARES-style sensing could identify high-risk positions | **Automotive cabins** — small sealed volumes, drowsy driving linked to elevated cabin CO₂; occupant-level rather than bulk-cabin sensing is what responsive ventilation needs |
| **Athlete monitoring** — breathing rates surge under load and face-level dynamics change with them; wearable CO₂ could inform training and recovery | **Heat stress and climate** — the Porterfield model collapses the HTBP at 37 °C ambient at full Earth gravity. Populations already averaging body temperature are in the same regime |
| **Submarines and confined spaces** — submariners, miners, cockpit crews; fixed sensors miss face-level peaks and the operational stakes are high | **Clinical respiratory monitoring** — ICU, anaesthesia recovery and COPD lean on bulk air and SpO₂ proxies; face-level CO₂ is a more direct view of gas exchange |

Callout under **heat stress**, because it is the one to lead with and the only one that is not an
extrapolation: *this is the same simulation, not a speculative extension — see `C12` and `C14`.*

### 14 · Where the work is going
Closing slide. Three items and one sentence, and no bullet lists beyond that.

**Near term** — the mannequin, because it needs no approval and its exhalate is known exactly.
**This term** — approval, then sessions, then the analysis plan you already wrote.
**Next term** — the EEG roadmap, and a conference abstract (3.7.11). ICES is the venue this project's
own sources name; **ASGSR is not named in any project document**, so if you hear it proposed, that is a
decision somebody still has to make.

Then, alone at the bottom, set large:

> Somebody is eventually going to ask you how you know. The only good answer is the one you can walk
> them through.

## Production notes

- Build in Google Slides at 16:9, using the ARES palette (dark base, martian amber `#F59E0B` accent,
  alert red `#EF4444`). Export to PDF and import via the slides workbench.
- **Slides 3 and 13 are the ones people screenshot.** No footer, no logo, type large enough to survive
  a phone photo of a laptop screen. If slide 3 needs to be split into a table slide and a Gantt slide
  to stay legible, split it — a fifteen-slide deck that reads beats a fourteen-slide one that does not.
- **Put a revision date on slides 3–7, 10 and 11.** This deck is a snapshot of two documents that
  change. A roadmap slide with no date is the single easiest way for a new member to plan against a
  schedule that moved in June.
- **Slides 8 and 9 carry rules, and rules do not get design.** Big type, one statement, white space.
  Do not add an illustration, do not add a second column of nuance, and do not soften "no session
  before written approval is in hand" into guidance. It is the one slide in this course that is an
  instruction rather than an explanation.
- **The alert-coloured lines on slides 4, 10 and 11 are content, not disclaimers.** They do not get
  shrunk and they do not move to speaker notes. A learner who takes away the deliverable map without
  the cave-date discrepancy has taken away a plan that two project documents disagree about.
- **Slide 11's cost column is this deck's own analysis, not the 7/30 deck's.** Mark it as such in the
  speaker notes so a future maintainer does not go looking for it in the source and conclude the deck
  is wrong.
- Speaker notes are typed per slide in the workbench after import; PDF export does not carry them.
- If narration is recorded, both overlay questions still gate advancing. Do not restate either answer
  in the VO, or the answers become free.
- Numbers on slides 3–7 come from `ARES_CO2_Headset_Summer2026_Deliverables.docx`; slides 10 and 11
  from `ARES_7_30_26.pptx` slides 16 and 17; slide 4's cave detail from slide 7; slide 13 from
  `ARES_CO2_Presentation (1).pptx` slide 10; slide 12's Herrick figures from the *Herrick Labs Research
  Protocol*. If a deliverable moves or the blocker board changes, this deck is revised in the same
  commit — see `README.md`, rule 2.
