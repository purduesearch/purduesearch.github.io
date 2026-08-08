# ARES 101 — Source Manifest

The verified document list for all eleven `LIT_REVIEW` sections. Every `lit/Lnn-*.md`
file reads its `pdfDriveFileId`, `pdfTitle`, and `citation` frontmatter **from this table**
and nowhere else.

**The rule this file exists to enforce:** never invent a citation. Every row below was
verified by resolving its DOI or source and confirming it loads the document the row
claims. Rows that could not be fully verified say so in the open text, rather than being
quietly presented as complete.

---

## The manifest

| Module | Document | Citation key | DOI / source | Drive file id | State |
|---|---|---|---|---|---|
| M1 | Dutta et al., *Gravity and Human Respiration* — the claim | `dutta2026` | `10.1038/s44341-026-00033-x` | `1RHGKt4JX2oV6wd0HcGDySoXoZepTHW5c` | In Drive · **preprint copy, see note A** · **not shared, see note E** |
| M2 | Fabregat et al., DNS of a violent expiratory event | `fabregat2021` | `10.1063/5.0042086` | `1kt_zRc-ugKDe71h8mcj4JNMmceWDxYR5` | In Drive · **not shared** |
| M3 | Dutta et al. — the method (same PDF as M1) | `dutta2026` | `10.1038/s44341-026-00033-x` | `1RHGKt4JX2oV6wd0HcGDySoXoZepTHW5c` | In Drive · **preprint copy, see note A** · **not shared** |
| M4 | Satish et al., CO₂ and decision-making performance | `satish2012` | `10.1289/ehp.1104789` | — **upload needed** | Verified · **not uploaded** |
| M5 | Sanders et al., PTLS on ISS, ICES-2026-75 | `sanders2026` | ICES-2026-75 | `1vcpQGZnoja8l6ctQH7Ed1-RlYkC4wXAV` | In Drive · **not shared** |
| M6 | Deming et al., delays of gas-phase compounds in tubing | `deming2019` | `10.5194/amt-12-3453-2019` | — **upload needed** | Verified · **not uploaded** |
| M7 | Zhou et al., hot-wire calibration facility at 0.1–1.0 m/s | `zhou2024` | `10.3390/app14041587` | — **upload needed** | Verified · **not uploaded** |
| M8 | Campbell et al., ICWTS, ICES-2026-499 | `campbell2026` | ICES-2026-499 | `1OzdK0KPj9i87jCsERj-UPJKayFQvmgXq` | In Drive · **not shared** |
| M9 | Toptsis et al., embedded software architectures for multi-sensor wearables | `toptsis2026` | `10.3390/electronics15020295` | — **upload needed** | Verified · **not uploaded** |
| M10 | Martin et al., evaluation and correction of a low-cost NDIR sensor | `martin2017` | `10.5194/amt-10-2383-2017` | — **upload needed** | Verified · **not uploaded** |
| M11 | *Herrick Labs Research Protocol* (internal) | `herrick2026` | internal working document | `1kjHjWjdENSDzMKbvTvvgtEIz3sPBPgXvoWk7cXvtVlg` | In Drive · **Google Doc, not a PDF, see note D** · **not shared** |

**No row is ready to render in the course yet.** Two things must happen in a browser
before any `LIT_REVIEW` section works — see *Open actions* at the bottom. They are not
optional polish: an unshared file renders as a Google sign-in wall inside the player, not
as the paper.

---

## Full citations

Use these verbatim in each `lit/Lnn-*.md` `citation:` field.

**`dutta2026`** — Dutta, S., Tulodziecki, D., Schwertz, H., Kadomtsev, A., Parik, A.,
Chen, Y.-C., D'Agostino, D. P., Dagar, M., Tabetah, M., Rubins, K., Alexander, D., &
Porterfield, D. M. (2026). Gravity and human respiration: biophysical limitations in mass
transport and exchange in spaceflight environments. *npj Biological Physics and
Mechanics*, 3, 3. https://doi.org/10.1038/s44341-026-00033-x

**`fabregat2021`** — Fabregat, A., Gisbert, F., Vernet, A., Dutta, S., Mittal, K., &
Pallarès, J. (2021). Direct numerical simulation of the turbulent flow generated during a
violent expiratory event. *Physics of Fluids*, 33(3), 035122.
https://doi.org/10.1063/5.0042086

**`satish2012`** — Satish, U., Mendell, M. J., Shekhar, K., Hotchi, T., Sullivan, D.,
Streufert, S., & Fisk, W. J. (2012). Is CO₂ an indoor pollutant? Direct effects of
low-to-moderate CO₂ concentrations on human decision-making performance. *Environmental
Health Perspectives*, 120(12), 1671–1677. https://doi.org/10.1289/ehp.1104789

**`sanders2026`** — Sanders, I. C., Christensen, L. E., Ryan, S. R., Zhong, F., Silver,
J., Reyes-Newell, A., Hovde, C., & Opsahl, P. (2026). Portable Tunable Laser Spectrometer
(PTLS) technology demonstration on the International Space Station: performance and
science objectives. ICES-2026-75. *55th International Conference on Environmental
Systems*, Rio Grande, Puerto Rico, 12–16 July 2026.

**`deming2019`** — Deming, B. L., Pagonis, D., Liu, X., Day, D. A., Talukdar, R.,
Krechmer, J. E., de Gouw, J. A., Jimenez, J. L., & Ziemann, P. J. (2019). Measurements of
delays of gas-phase compounds in a wide variety of tubing materials due to gas–wall
interactions. *Atmospheric Measurement Techniques*, 12(6), 3453–3461.
https://doi.org/10.5194/amt-12-3453-2019

**`zhou2024`** — Zhou, T., Zhang, Z., Tian, Y., Xi, Z., Dou, X., Liu, W., Zhang, G., &
Gao, C. (2024). A calibration facility for hot-wire anemometers in extremely low speed
with air temperature and humidity variable and controllable. *Applied Sciences*, 14(4),
1587. https://doi.org/10.3390/app14041587

**`campbell2026`** — Campbell, C., Whalen, P., Christensen, L., Sanders, I., & Watson, C.
(2026). In-suit CO₂ Washout Test System (ICWTS) for CO₂ washout verification in
spacesuits. ICES-2026-499. *55th International Conference on Environmental Systems*, Rio
Grande, Puerto Rico, 12–16 July 2026.

**`toptsis2026`** — Toptsis, M., Karkanis, N., Giannakoulas, A., & Kaifas, T. (2026). A
review of embedded software architectures for multi-sensor wearable devices: sensor
fusion techniques and future research directions. *Electronics*, 15(2), 295.
https://doi.org/10.3390/electronics15020295

**`martin2017`** — Martin, C. R., Zeng, N., Karion, A., Dickerson, R. R., Ren, X.,
Turpie, B. N., & Weber, K. J. (2017). Evaluation and environmental correction of ambient
CO₂ measurements from a low-cost NDIR sensor. *Atmospheric Measurement Techniques*,
10(7), 2383–2395. https://doi.org/10.5194/amt-10-2383-2017

**`herrick2026`** — SEARCH ARES team. *Herrick Labs Research Protocol*. Internal working
document, last revised 2 March 2026.

---

## How each row was verified

The bar was: resolve the DOI, obtain the actual document, and read enough of it to confirm
it is the paper the citation claims and that it teaches the module's topic. A DOI that
404s or lands on a different paper is a failed source.

| Row | DOI resolves | Full text obtained | Freely readable | Content confirmed on topic |
|---|---|---|---|---|
| `dutta2026` | yes → nature.com | yes, PDF read | yes, CC BY 4.0 | yes — Figs. 1–6, the 0.38 g threshold at Fig. 5A |
| `fabregat2021` | yes → pubs.aip.org | yes, in Drive | via Drive copy | yes — DNS of a violent expiratory event |
| `satish2012` | yes → EHP/ACS | yes, PDF read | yes, EHP is US public domain | yes — 600/1,000/2,500 ppm, nine decision-making scales |
| `sanders2026` | n/a (conference no.) | yes, in Drive | via Drive copy | yes — open-path TLS, ±0.003 mmHg at 2 Hz, 13 × 8 × 8 cm, <3 W |
| `deming2019` | yes → amt.copernicus.org | yes, PDF read | yes, CC BY 4.0 | yes — step-change delay measurement, 14 tubing materials |
| `zhou2024` | yes → mdpi.com | yes, PDF read | yes, CC BY 4.0 | yes — 0.10–1.0 m/s rig, modified King's law fits |
| `campbell2026` | n/a (conference no.) | yes, in Drive | via Drive copy | yes — FWA vs TWA, ICARUS breath detection, IRMA mannequin |
| `toptsis2026` | yes → mdpi.com | yes, PDF read | yes, CC BY 4.0 | yes — §3.1 SPI/I²C/UART, timestamping, bare-metal vs RTOS |
| `martin2017` | yes → amt.copernicus.org | yes, PDF read | yes, CC BY 3.0 | yes — six SenseAir K30s, RMSE 9.6 → 1.9 ppm after correction |
| `herrick2026` | n/a (internal) | yes, read via Drive | Drive, restricted | yes — calibration, facility criteria, anemometer and CO₂ tests |

Metadata for every DOI was independently cross-checked against the Crossref record, and
open-access status against Unpaywall, so no citation field here is written from memory.

---

## The five papers that had to be found, and why each one

### M4 — `satish2012`

The module teaches dose–response by tier, and the lit-review rubric asks for exposure
levels, outcome, effect size, and a limitation on generalising to spaceflight. This paper
answers all four directly: 22 subjects, 2.5-hour exposures at 600, 1,000 and 2,500 ppm,
scored on nine Strategic Management Simulation scales, with moderate-to-large decrements
at 1,000 ppm and larger ones at 2,500 ppm.

It is also the easiest limitation exercise in the course — one small ground-based cohort,
one instrument, sedentary office conditions, no microgravity, and CO₂ delivered without
the co-varying ventilation changes that accompany it in a real cabin.

Chosen over a SANS review because the module already covers SANS from the deck and the
Dutta discussion, and because a cognitive-outcome study gives a learner something concrete
to argue with.

### M6 — `deming2019`

Chosen for the mechanism the module cares about: the paper measures sample-line delay by
applying a concentration step and comparing the tubing-plus-instrument response against
the instrument alone, which **is** the transport-delay-versus-response-time distinction
that M6 exists to teach. It reads delay off the 90% crossing, and the 50% crossing for
materials with different kinetics — the same convention `E03-measure-the-delay.md` tells
the learner to use.

**Stated honestly:** the paper's delay mechanism is gas–wall partitioning of volatile
organics, and CO₂ does not partition to walls the way those compounds do. ARES's dominant
delay is volumetric transit plus dispersion. The transferable content is real — the paper
describes tubing acting "roughly as a chromatography column, effectively smearing the time
profile", which is dispersion — but whoever writes `L06` should say plainly in the section
intro that ARES's lines are dominated by a mechanism this paper treats as the trivial
case. Do not let a learner conclude that PFA-versus-steel is their CO₂ problem.

No open-access peer-reviewed paper on capnography sample-line transport delay was found;
the closest (Anesthesia & Analgesia, 1994) is paywalled and fails the "freely readable"
requirement.

### M7 — `zhou2024`

The best available fit, and close to exact. The rig covers 0.10–1.0 m/s, which brackets
the 0.3–0.4 m/s plume velocity M2 establishes, and the paper fits both modified King's law
and Van der Hegge Zijnen's formula to the calibration data — so a learner sees King's law
used rather than only asserted.

It also carries a result the ARES team should read on its own account: a temperature
mismatch between calibration site and application site contributes up to 5.67% error per
°C, and humidity up to 1.27% per %RH. A headset calibrated at bench temperature and worn
on a warm head is exactly that mismatch.

Rejected: *Simplified Calibration Method for Constant-Temperature Hot-Wire Anemometry*
(Appl. Sci. 10, 9058) — correct topic, but its velocity range is 20–80 m/s, two orders of
magnitude above the regime that matters here.

### M9 — a real paper was found; the fallback is not needed

Task 2 allows assigning the ARES firmware `CLAUDE.md` if no defensible peer-reviewed
source exists. One does, so the fallback is **not** taken.

`toptsis2026` is squarely on the module's topic rather than adjacent to it. Its §3.1
covers SPI, I²C and UART as wired sensor interfaces; it treats high-resolution timestamping
against a common hardware timer and RTOS synchronisation primitives as the mechanism for
keeping heterogeneous sensor streams temporally consistent; and §5 contrasts bare-metal
against RTOS architectures. Those map directly onto what M9 teaches — three SHT45s across
two I²C buses, three SprintIRs across two UARTs that cannot share a live port, a
non-blocking state machine advancing one step per `loop()`, and an epoch arriving over BLE.

**One authoring constraint.** It is a review, and §4 spends substantial space on
Kalman-family sensor fusion — EKF, UKF, particle filters — which is past what the course
assumes (calculus and intro physics). `L09`'s `promptText` must scope the learner to the
architecture material (§2, §3, §5, §7) and say so explicitly, or a reader will stall in
§4 and conclude the course lied about its prerequisites.

If a future author decides the review is too general to support the "document the
sensing-to-storage path" rubric point, the `CLAUDE.md` fallback remains available and the
design spec still permits it. That is a judgement call about teaching, not a sourcing
failure.

### M10 — `martin2017`

Six SenseAir K30 NDIR sensors against a cavity-enhanced laser absorption reference:
individual RMSE of 5–21 ppm uncorrected, median RMSE improving from 9.6 ppm to 1.9 ppm
after multivariate correction for temperature, humidity and pressure. It is the right
paper for three of the module's four rubric points — what makes an NDIR sensor read wrong,
what a real calibration strategy looks like, and what that strategy costs, which here is
a research-grade analyser to calibrate against.

The paper also evaluates and sets aside the GSS COZIR, a sibling of the SprintIR the
headset actually uses, so the sensor family is the one the learner is holding.

**One gap, stated rather than papered over:** the paper does not discuss automatic
baseline correction. No peer-reviewed open-access evaluation of ABC specifically was found
— the substantive material on it is manufacturer documentation. So the rubric point on
"what ABC assumes about the environment and why that assumption fails indoors" must be
answerable from `C21` and the firmware, not from the paper. Write `L10`'s rubric so a
learner who read only the paper can still reach four of the points, and cover ABC in the
reading.

---

## Notes

**A. M1/M3 — the Drive PDF is the preprint; the published version now exists.**
The Drive copy is the Research Square preprint (`10.21203/rs.3.rs-7926384/v1`, posted
29 November 2025). The paper was published on 2 February 2026 in *npj Biological Physics
and Mechanics* 3, 3 — peer-reviewed, CC BY 4.0, free at
`https://www.nature.com/articles/s44341-026-00033-x.pdf`.

The version of record should replace the preprint in Drive before M1 and M3 are written.
Checked already, so the swap is safe: the published version keeps **Fig. 1 through Fig. 6**
with the same numbering, and still places the 0.38 g threshold at **Fig. 5A** — both of
which the M1 and M3 task specs reference by number.

Cite the published version either way. A rubric should not point a learner at a preprint
when the peer-reviewed article is open access.

**B. Dutta author-name spelling.** The preprint cover renders the sixth author as
"Dominick P. D'Agostino"; the published version has "Dominic P. D'Agostino". The
published spelling is used above.

**C. M11 title.** The plan calls this document "Herrick Lab Testing Protocol". Its actual
title is **"Herrick Labs Research Protocol"**. The manifest uses the real title. Note that
`ARES_HTBP_Testing_Protocol.docx` is a *different* document and is not the assigned
reading for any section.

**D. M11 is a Google Doc, not a PDF, and is owned by another account.**
`1kjHjWjdENSDzMKbvTvvgtEIz3sPBPgXvoWk7cXvtVlg` is `application/vnd.google-apps.document`,
owned by `akcaembo@gmail.com`, and lives outside the `Papers` folder. Two consequences:

- `drive.google.com/file/d/<id>/preview` is the wrong URL form for a native Google Doc, so
  the id will not render in a `LIT_REVIEW` pane the way a PDF id does.
- Sharing it is not Henry's to change; it belongs to its owner.

Fix by exporting it to PDF and uploading that PDF to `Papers`, which resolves both the URL
form and the ownership question in one step. Do it as an export rather than a copy, so the
original stays the owner's working document. Record the new id here when it exists.

**E. Nothing in `Papers` is shared.** Verified two ways: the Drive permissions API returns
a single `owner` entry and no `type: anyone` permission for the folder and for every file
in it, and an unauthenticated request to each
`https://drive.google.com/file/d/<id>/preview` returns HTTP 401 with a sign-in page. As
things stand, every `LIT_REVIEW` section in this course would show a learner a Google
login screen.

---

## Open actions

These two need a human in a browser. They could not be completed from here: the Drive
tooling available in this session can read files and list permissions but cannot change
sharing, and uploading a multi-megabyte PDF is not something it can carry.

**1. Share the `Papers` folder — "Anyone with the link · Viewer".**
Folder `1RMU0bzBpK_-HSsUYrsKJ31kyCddbkmtn`. Setting it on the folder propagates to files
inside it, which is why it is worth doing at the folder level rather than per file.
`herrick2026` is owned by another account and needs either its owner's action or the PDF
export in note D.

**2. Upload the five verified PDFs to `Papers`, then fill their ids into the manifest.**
All five are open access and legally redistributable — four CC BY, and `satish2012` is US
government public domain.

| Suggested filename | Download from |
|---|---|
| `Satish-2012-CO2-and-decision-making.pdf` | https://escholarship.org/content/qt222631x2/qt222631x2.pdf |
| `Deming-2019-tubing-delays.pdf` | https://amt.copernicus.org/articles/12/3453/2019/amt-12-3453-2019.pdf |
| `Zhou-2024-hot-wire-low-speed-calibration.pdf` | https://www.mdpi.com/2076-3417/14/4/1587/pdf |
| `Toptsis-2026-wearable-embedded-architectures.pdf` | https://www.mdpi.com/2079-9292/15/2/295/pdf |
| `Martin-2017-low-cost-NDIR-evaluation.pdf` | https://amt.copernicus.org/articles/10/2383/2017/amt-10-2383-2017.pdf |

The `satish2012` link is the LBNL eScholarship deposit of the peer-reviewed article — it
carries the same DOI and states its publication in *Environmental Health Perspectives* on
its cover page. It is the author manuscript rather than the journal's typeset PDF; if the
typeset version is preferred, take it from PubMed Central (PMC3548274) in a browser.

**3. Then verify each id in a private window.** Open
`https://drive.google.com/file/d/<id>/preview` signed out, for all eleven rows. Each must
render the document with no sign-in prompt. Update the **State** column to `ready` as each
one passes.

Until step 3 passes for a row, that module's `LIT_REVIEW` section is not shippable, no
matter what its `lit/Lnn` file says.
