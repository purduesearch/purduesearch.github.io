---
pdfDriveFileId: 1RHGKt4JX2oV6wd0HcGDySoXoZepTHW5c
pdfTitle: Gravity and Human Respiration
citation: Dutta, S., Tulodziecki, D., Schwertz, H., Kadomtsev, A., Parik, A., Chen, Y.-C., D'Agostino, D. P., Dagar, M., Tabetah, M., Rubins, K., Alexander, D., & Porterfield, D. M. (2026). Gravity and human respiration: biophysical limitations in mass transport and exchange in spaceflight environments. npj Biological Physics and Mechanics, 3, 3. https://doi.org/10.1038/s44341-026-00033-x
promptText: This is the paper the whole ARES project is built on. Read the Abstract, the Introduction, and the Results — you do not need the Materials and Methods for this assignment, and you will read them properly in M3. In your own words, in at least 200 words - What does this paper claim? State the mechanism it proposes, what it says happens when that mechanism is removed, and how big an effect it reports. Then answer the harder half - what would have to be true for the claim to be wrong? Name something specific that, if someone measured it and got a different answer, would undermine the paper. "More data is needed" is not an answer; name the measurement.
minWords: 200
rubric:
  - id: plume
    point: States the mechanism - metabolic heat warms the air touching the body, the warmed air is less dense and rises under gravity, and this human thermal body plume (HTBP) carries exhaled CO2 up and away from the face on Earth. Naming buoyancy or biothermal convection as the driver is required; using the paper's HTBP/BTC vocabulary is a bonus, not a requirement.
    weight: 2
  - id: collapse
    point: States that microgravity removes buoyancy, so the plume collapses and the transport it provided stops. Full credit requires recognising that transport becomes diffusion-only rather than ceasing altogether - the paper calls this indirect biophysical diffusion (IBD). A summary that says microgravity stops CO2 from moving has the physics backwards and earns partial credit at most.
    weight: 2
  - id: bubble
    point: Identifies the consequence the paper is actually reporting - a localized region of elevated, previously-exhaled CO2 that persists immediately in front of the face and head, which the paper calls a CO2 bubble or an environmental breathing deadspace, and which leads to sustained rebreathing.
    weight: 2
  - id: magnitude
    point: Gives the roughly two-fold figure AND qualifies it correctly. The paper's number is a comparison of transient peaks in its own simulation - above 2.5 percent in microgravity against below 1.5 percent at 1g - not a mean concentration, not a measured value, and not a ratio against bulk cabin CO2. A learner who quotes 2x without any of that qualification gets partial credit; a learner who states the 2.5 / 1.5 percent pair or explicitly flags it as a transient peak gets full credit.
    weight: 3
  - id: bulk
    point: Recognises that this is a problem bulk ECLSS does not address - CDRA, Vozdukh and CAMRAS regulate the cabin-wide atmosphere and can be fully within limits while the air at a crew member's face is not, because the quantity they measure and the quantity that reaches a face come apart once the plume is gone.
    weight: 2
  - id: heat
    point: Connects the same collapse to terrestrial heat stress - raising ambient air toward 37 C shrinks the temperature difference that drives buoyancy, so the paper reports 1g at 37 C as equivalent to microgravity, which extends the claim beyond spaceflight to heatwaves and confined warm spaces.
    weight: 1
  - id: falsifier
    point: Names at least one specific, checkable thing that would undermine the claim, rather than a generic call for more data. Credit any of - a direct measurement of face-level CO2 in microgravity that does not exceed cabin CO2; Schlieren or PIV imaging showing a plume that does not collapse as predicted; showing that real cabin ventilation already supplies enough forced airflow to substitute for the plume; showing that the two-dimensional simulation domain changes the answer in three dimensions; or showing that crew head motion disrupts the bubble faster than it forms. Credit a well-reasoned falsifier the paper itself does not raise, provided it is real and specific.
    weight: 3
referenceSummary: |
  The paper's central claim is mechanistic. On Earth, metabolic heat keeps the air in contact
  with the human body warmer, and therefore less dense, than the surrounding room air. Under
  gravity that density difference produces a persistent upward flow along the body: biothermal
  convection (BTC), and the airflow structure it generates, the human thermal body plume (HTBP).
  The authors argue that this plume is not incidental to breathing but is a functional part of
  respiratory gas exchange - it sweeps exhaled CO2 up along the body and away from the face and
  continuously replaces the air in the breathing zone with fresh air. Their CFD simulations put
  the plume's peak velocity at 0.3-0.4 m/s at the top of the head, with the flow at the base of
  the chin directed upward toward the nasal openings and then away from the face.

  The second half of the claim is what happens when that mechanism is removed. Buoyancy requires
  gravity, so in microgravity the HTBP does not form. The paper is careful about what this does
  and does not mean, and so should a good summary be: transport does not stop, it degrades to
  molecular diffusion alone, which the authors term indirect biophysical diffusion (IBD).
  Diffusion is isotropic and slow. The result in their simulations is that exhaled CO2 no longer
  leaves the vicinity of the head; it accumulates as a localized environmental breathing
  deadspace immediately in front of the face - the "CO2 bubble" - which the subject then
  rebreathes. The authors ground this in Faraday's candle: a candle flame is teardrop-shaped in
  1g and a dim sphere in microgravity for exactly the same reason, because a candle, like a body,
  is a self-generating convection system whose driving heat comes from the process it supplies.
  The spherical flame observed in microgravity combustion experiments is offered as an
  experimentally observed instance of the same physics, and previously published Schlieren
  imaging of human subjects as the validation for the 1g plume.

  On magnitude, the paper reports that in its 1g simulation the transient CO2 exposure at the
  face never rises above 1.5 percent, whereas the microgravity simulation shows transient
  exposures above 2.5 percent - roughly a doubling of effective exposure. Three qualifications
  travel with that figure and a strong summary carries at least one of them: it is a comparison
  of transient peaks within a breathing cycle rather than a mean; it is a simulation result
  rather than a measurement on a person; and it is a microgravity-versus-1g comparison, not a
  ratio against bulk cabin concentration. The paper separately reports that both microgravity and
  elevated ambient temperature reduce net respiratory gas exchange efficiency by approximately
  14 percent, and places the minimum gravity for Earth-normal exchange at approximately 0.38g,
  which is Mars surface gravity.

  The claim's practical edge is aimed at life support. Existing and emerging ECLSS - the paper
  names CDRA, Vozdukh, TAS and CAMRAS - are bulk systems that regulate and scrub the cabin
  atmosphere as a whole. The authors argue that even a perfectly functioning bulk system fails to
  address a deadspace that exists at the scale of a face, and that this resolves a long-standing
  discrepancy: crew have complained about air quality for decades on vehicles whose atmospheric
  monitoring showed compliance. They reinforce the argument with an operational observation, that
  astronauts spend most of their day stationary - restrained at gloveboxes, on exercise equipment,
  at meals, and in crew quarters during seven to eight hours of sleep - which is precisely the
  condition under which a bubble has time to form. Finally, the authors generalise off Earth
  orbit entirely. Because gravity and the temperature difference enter the buoyancy term as a
  product, raising ambient air temperature toward body temperature suppresses the plume at full
  Earth gravity, and their 1g / 37 C simulation reproduces the microgravity result. Terrestrial
  heat stress, they argue, is respiratorily the same regime, which matters as heatwaves above
  37 C become common.
---

## Annotated bibliography

A deliberately short list. The rule in `lit/SOURCES.md` is that nothing is cited until it has been
resolved and read, so this bibliography contains only documents that were. **The assigned paper's own
reference list is not reproduced here** — those entries are real, but they have not been individually
verified against Crossref the way the rows in `SOURCES.md` were, and a bibliography that mixes
verified with assumed teaches the wrong habit. If you follow one of the paper's citations, verify it
yourself before you quote it.

### Dutta, S., Tulodziecki, D., Schwertz, H., Kadomtsev, A., Parik, A., Chen, Y.-C., D'Agostino, D. P., Dagar, M., Tabetah, M., Rubins, K., Alexander, D., & Porterfield, D. M. (2026). Gravity and human respiration: biophysical limitations in mass transport and exchange in spaceflight environments. *npj Biological Physics and Mechanics*, 3, 3.

The assigned reading, and the founding document of the ARES project. For **this** section, only the
Abstract, the Introduction (through "A Biophysical Approach to Gravitational Biology"), and the
Results matter — they carry the entire claim. The Discussion sections "Gravity and Human Respiration
in Space" and "Bioastronautics and Biophysical Countermeasures" carry the ECLSS argument, and
"Thermal Respiratory Stress on Earth" carries the heat-stress extension.

The Materials and Methods are **deliberately out of scope here**. M3 assigns the same PDF and asks
whether the method supports what M1 asked you to state. Reading it now will not hurt you, but the
rubric for this section does not reward it.

Note for whoever maintains this file: the Drive copy is currently the Research Square preprint
(`10.21203/rs.3.rs-7926384/v1`, posted 29 November 2025). The version of record is open access at
`https://www.nature.com/articles/s44341-026-00033-x.pdf` and is what the `citation` field points at.
Figure numbering and the Fig. 5A location of the 0.38g threshold are unchanged between the two. See
`SOURCES.md` note A.

### Faraday, M. (1861). *The Chemical History of a Candle*. Royal Institution Christmas Lectures, London.

Public domain, freely readable, and about a hundred pages. It is the source of the analogy the paper
builds on, and the paper cites it as such. Faraday works out that a candle flame is teardrop-shaped
because hot gas rises and cool air is drawn in beneath it to replace it, and then — in the closing
lecture — draws the comparison to human respiration himself.

Worth reading because it is the clearest demonstration in the bibliography that the candle is not a
teaching device the authors reached for. The comparison is a hundred and sixty years old, and what
the 2026 paper adds is the case Faraday could not have considered: what the same system does when
you remove the gravity.

### Fabregat, A., Gisbert, F., Vernet, A., Dutta, S., Mittal, K., & Pallarès, J. (2021). Direct numerical simulation of the turbulent flow generated during a violent expiratory event. *Physics of Fluids*, 33(3), 035122. https://doi.org/10.1063/5.0042086

Not read for this section — it is M2's assigned paper — but listed because it is the natural
counterweight to this one and shares an author (S. Dutta). Dutta et al. (2026) model breathing as a
periodic boundary condition feeding a quasi-steady buoyant plume. Fabregat et al. resolve a single
violent exhalation directly, and get a fast, directed, unsteady jet that becomes a buoyant puff.

Both pictures are correct at their own timescale, and holding them together is what M2 is for. If
this section's paper leaves you thinking the air in front of a face is a smooth steady flow, that is
the gap M2 closes.

### `ARES_CO2_Presentation` (Spring 2026). Internal deck, Purdue SEARCH / ARES team.

The team's own framing of the same claim, and the source of several figures this course quotes:
Earth ambient at roughly 420 ppm, typical ISS bulk at 2,000–5,000 ppm, the ~38.7 % of ISS crew across
Expeditions 2–31 who reported headaches, and the NASA operational-limit history.

Read it **critically alongside the paper**, because slide 5 compresses the result into "simulated
face-level CO₂ in microgravity is ~2× higher than bulk cabin levels", and that is not what the paper
reports. The paper's 2× is microgravity transient peak against 1g transient peak. This is a small
drift, and it is exactly the kind that a summary written from a deck rather than from a paper will
reproduce. The `magnitude` rubric point exists because of it.

### `docs/courses/ares-101/GLOSSARY.md`

Binding on this whole course. HTBP, BTC, IBD, CO₂ bubble, deadspace, ECLSS and the ppm/mmHg/percent
convention are all fixed there, and this section's rubric uses them in exactly that sense. If your
summary uses "thermal plume" or "body plume", you will not be marked down — the rubric asks for the
mechanism, not the acronym — but the rest of the course will use HTBP and expect you to recognise it.

## Synthesis

There is a shape to this paper that is easy to miss on a first read, because the abstract front-loads
the spaceflight application. The argument is actually in three moves, and each one is a different kind
of claim.

**The first move is physics, and it is not new.** Warm bodies in cool air generate buoyant plumes.
This has been known for as long as anyone has thought about it, imaged with Schlieren photography for
decades, and is uncontroversial. Nothing in the paper's first half would surprise a heat-transfer
engineer.

**The second move is physiological reframing, and it is the paper's real thesis.** Human respiration
is conventionally taught as an internal problem — alveolar diffusion, ventilation-perfusion matching,
the mechanics of the chest wall. The environment enters as a boundary condition and is assumed
benign: the air outside your face is the air in the room. Dutta et al. argue that this assumption is
a *gravitational* one. The plume is what makes it true, the plume is a consequence of `g`, and
therefore a piece of respiratory physiology that everyone treats as free is in fact being supplied by
a force that a spacecraft does not have.

Once that reframing is accepted, the rest follows almost mechanically. Remove `g`, remove the plume;
remove the plume, remove the sweep; remove the sweep, and the exhalate stays where it was produced.
The reason the paper leans so hard on Faraday's candle is that the candle makes this chain visible in
a system nobody has an intuition to defend. Nobody believes a flame is spherical in orbit because
combustion chemistry changed. Once you accept the flame, the body is the same argument.

**The third move is the engineering consequence, and it is the one ARES exists to act on.** If the
CO₂ bubble is real, then the entire monitoring architecture of a spacecraft is measuring the wrong
place. Not measuring it badly — measuring the wrong place. CDRA and CAMRAS are competent systems
solving a cabin-scale problem, and the paper's point is that a cabin-scale solution cannot reach a
face-scale deadspace. That is why the paper's Discussion spends a long, oddly specific passage
enumerating gloveboxes, treadmill harnesses, dinner tables and 2.1 m³ crew quarters. It reads like
padding. It is not: the claim requires that crew be *stationary*, because head motion would stir the
bubble away, and the passage is establishing that they are, for most of the day.

The three moves have very different evidential status, and a good critical reading separates them.
The first is textbook. The second is a well-supported reinterpretation with a validated 1g simulation
behind it — Schlieren imaging of real human subjects is the paper's answer to "did you check this
against anything real". The third rests entirely on a simulation of a condition nobody has yet
measured. The 2.5 percent versus 1.5 percent transient figures, the 14 percent exchange penalty, and
the 0.38g threshold are all outputs of a model. They are plausible, internally consistent, and
unverified.

That is not a criticism of the paper, which is explicit about being a modelling study. It is the
reason the ARES headset exists: **the claim generates a specific, falsifiable, measurable prediction,
and nobody has taken the measurement.** A learner who finishes this section understanding that
distinction — between the parts of the argument that are established and the part that is a testable
prediction — has got what M1 is for. The `falsifier` rubric point is there to force it.

The heat-stress extension is worth a final note, because it is the part of the paper most likely to
be skimmed and it is the part that makes the work testable at Purdue. Gravity and ΔT enter the
buoyancy term as a product, so a 37 °C room at 1g is the same buoyancy condition as a 22 °C room in
microgravity. If that equivalence holds, the whole claim becomes checkable in a heated chamber with a
volunteer and three sensors, at a cost of nothing. If it does not hold, the equivalence itself is the
first thing that needs explaining. Either way it is where the measurement starts, and it is why M11's
summer tracks include a 37 °C thermal condition and a cave rather than a launch.
