# ARES — public subteam page

**Date:** 2026-08-22
**Status:** approved design, not yet implemented
**Source material:** [`docs/courses/ares-101/`](../../courses/ares-101/)

Build a public subteam presence for ARES at `/ares`, `/ares/the-science`, and `/ares/the-headset`,
drawn from the ARES 101 curriculum. Eight interactive components carry the teaching; the page performs
its own subject matter rather than describing it.

---

## 1. The binding constraint: publication clearance

**ARES 101 is an internal course.** `docs/courses/ares-101/README.md` § *Published readings* is a
reviewed, per-module clearance table, and it governs this page. Nothing reaches the public site that
the table marks internal unless it appears in §1.2 below.

This section is the part of the spec that a later author is most likely to breach by accident, because
the course reads as a coherent body of writing and the boundary is invisible from inside it.

### 1.1 Cleared without qualification

| Source | Content |
|---|---|
| `content/C12-how-gravity-moves-air.md` | Buoyancy, biothermal convection, diffusion, the regime question |
| `content/C13-the-plume-and-the-bubble.md` | Plume structure, the breathing envelope, the three pods, rebreathed fraction |
| `GLOSSARY.md` §1–§6 | Named concepts, the property table, the units convention, symbols |

### 1.2 Cleared by review on 2026-08-22 (curated technical layer)

Three items that the clearance table marks internal were reviewed individually and approved:

1. **"The top pod is sitting in the plume."** C13's finding that the reference pod stands in the
   body's own exhaust, that this biases rebreathing measurements *low* rather than merely noisy, and
   the planned relocation behind the crown plus the pod-height reduction. Source: `ARES_7_30_26.pptx`
   slides 3, 11, 18. Published as engineering self-critique — it is the most credibility-building
   material on the page.
2. **How to read a simulation result.** C14's skill, *generalized*: what a model claims, the
   passive-scalar and Boussinesq assumptions, why an unvalidated result is a picture rather than a
   finding. Rewritten as a general method, **not** as a tour of the Dutta et al. paper. C14 itself is
   internal because it teaches one specific paper; the transferable skill is not.
3. **Physics figures, minus part identity.** 0.3–0.4 m/s crown velocity, 1.7 m plume development
   length, the 4.26 µm absorption band, the 0.05–0.4 m/s anemometry regime, the whole `GLOSSARY.md` §4
   property table, and the §5 conversion table including NASA's 5,300 ppm / 4 mmHg limit.

### 1.3 Excluded — do not publish

Declined at review, or excluded by the clearance table:

- **Pump and flow figures.** 2.00 L/min free flow, 0.67 L/min per pod, the three-way split, tube
  geometry. Reviewed and declined. See §5.4 for what `DelayVsT90` does instead.
- **The anemometer/pump interaction open questions** (M7). Excluded with the pump figures.
- **The astronaut medical passage** (C15). A named NASA astronaut's January 2026 *undiagnosed* medical
  event. Real, identifiable person's health; not ours to place beside a CO₂ hypothesis.
- **Operational candour** (C22). IRB approval outstanding against a slipping schedule, component
  orders "repeatedly cancelled or misplaced", purchasing routed through the capstone team.
- **The data contract** (C20). CSV schema, bus timing, characteristic UUIDs.
- **The sensor command protocol** (C16). ASCII commands, register semantics.
- **Part designations.** `SprintIR-6S-20%`, the pump part, specific ICs. The *principle* is cleared;
  the *bill of materials* is not.
- **Anything from `lit/SOURCES.md`.** Drive file ids, folder structure, `PENDING_…` placeholders.

### 1.4 The rule for a later author

> If a sentence on this page could not be reconstructed from §1.1 and §1.2, it does not belong here.
> Adding "just one more detail" from a module is how a curated page becomes an uncurated one.

Where the page makes a current-state claim about ARES hardware, it carries the same `Sources`
discipline the course uses: the JSX comment names the deck slide or content file it came from, so the
drift is findable when the hardware changes.

---

## 2. Routes, navigation, and registration

### 2.1 Routes

Added to `src/App.js` as lazy public routes inside `<PageWrapper>`, alongside the other program pages:

```
/ares               src/pages/Ares.jsx             hub, 9 rail sections
/ares/the-science   src/pages/Ares/TheScience.jsx  physics deep-dive
/ares/the-headset   src/pages/Ares/TheHeadset.jsx  system deep-dive
```

Each is wrapped in `lazyWithTheme('/ares-theme.css?v=1', 'data-ares-theme')(...)` — see §4.

### 2.2 Navigation

`src/components/Navbar.jsx`:

- Add `ARES` as a fifth entry in the Teams dropdown, after `ASTRO-USA`.
- Add `/ares` to the `TEAMS_PATHS` array, or the Teams underline indicator will not light on any ARES
  route.

`src/components/Footer.jsx` — add ARES wherever the other four teams are listed.

### 2.3 Registration

Three files outside the React tree must be updated in the same commit, or the page exists but is
unreachable by search and invisible to crawlers:

- **`public/sitemap.xml`** — three `<url>` entries. `/ares` at priority 0.9 (peer of the other team
  hubs), the two deep-dives at 0.7. `lastmod` = merge date.
- **`public/search-index.json`** — three entries with `section: "Teams"`, matching the existing shape
  (`title`, `path`, `section`, `excerpt`, `tags`). Tags should carry the terms a member would actually
  type: `ares`, `co2`, `carbon dioxide`, `sensor`, `wearable`, `headset`, `bioastronautics`,
  `hypercapnia`, `plume`, `microgravity`.
- **`public/llms.txt`** — add the three routes to the site outline.

Each page renders `<SEOHead>` with a canonical path, as every other program page does.

---

## 3. File layout

```
src/pages/
  Ares.jsx                        hub
  Ares/
    TheScience.jsx
    TheHeadset.jsx

src/components/ares/
  aresPhysics.js                  constants, formulas, glossary map — §3.1
  PlumeSimulator.jsx        ★     canvas particle field + gravity slider
  PodReadout.jsx            ★     head schematic, breath scrub, live f_rb
  DelayVsT90.jsx            ★     animated step response
  ExposureDial.jsx          ★     ppm ↔ mmHg ↔ %, tier bands, dose
  RegimePlayground.jsx            Gr / Ra / Pe / Re
  NdirBeam.jsx                    Beer–Lambert absorption
  SystemDiagram.jsx               block diagram
  PodDisagreement.jsx             noisy-difference error visual
  AresStat.jsx                    sourced count-up stat tile
  AresTerm.jsx                    glossary tooltip wrapper

src/theme/
  loadTheme.js                    generalized from loadClubPmTheme.js — §4

public/
  ares-theme.css                  ~700 lines, scoped under .ares-page
  ares/                           photos and figures — §7
```

### 3.1 `aresPhysics.js` — single source of truth

Every ARES number on the public site is defined here once and imported. **No physical constant,
threshold, or conversion factor is written into JSX.**

This is not stylistic. `docs/courses/ares-101/README.md` documents the exact failure it prevents: ARES
hardware changes weekly, current-state claims go stale, and a number typed inline is a claim nobody
can re-verify and nobody will dare change. `GLOSSARY.md` is *binding* on the course for the same
reason — this module is that glossary's counterpart on the public site.

Exports:

```js
AIR_PROPERTIES    // ν, α, Pr, β at 295/300/305 K        GLOSSARY §4
DIFFUSIVITY_CO2   // 1.6e-5 m²/s                          GLOSSARY §4
GRAVITY           // { earth: 9.81, mars: 3.71, orbit: 0 } GLOSSARY §4
CO2_TIERS         // 400 / 1,000 / 2,500 / 5,000 / 5,300 / 6,600 ppm, labelled
                  //                                        GLOSSARY §5
PLUME             // crownVelocity 0.3–0.4 m/s, developmentLength 1.7 m   C13
NDIR_BAND         // 4.26e-6 m                             GLOSSARY §1
ANEMOMETRY_RANGE  // 0.05–0.4 m/s                          GLOSSARY §5

ppmToMmHg(ppm, pressureHpa?)    // GLOSSARY §5 — pressure-dependent, default 1 atm
mmHgToPpm(mmHg, pressureHpa?)
grashof({ dT, L, T_film, g })   // GLOSSARY §3
rayleigh(...)  peclet(...)  reynolds(...)
rebreathedFraction({ chin, top, exhaled })  // GLOSSARY §2
tierFor(ppm)                    // → { label, band }
dosePpmHours(ppm, hours)        // GLOSSARY §2

GLOSSARY_TERMS   // { HTBP: 'Human thermal body plume — …', BTC, IBD, NDIR,
                 //   CTA, T90, PaCO₂, hypercapnia, deadspace, … }
```

Every export carries a comment naming its `GLOSSARY.md` section or `content/Cnn` file. The file opens
with a header block stating that `GLOSSARY.md` is upstream and that a disagreement is fixed there
first.

**β is evaluated at film temperature** (`T_film = (T_surface + T_∞)/2`), and `ν` and `α` are read at
the same temperature, per `GLOSSARY.md` §3. Getting this inconsistent is the specific mistake the
glossary calls out; `grashof()` takes `T_film` explicitly rather than deriving it silently, so a
caller cannot get it wrong by omission.

---

## 4. CSS delivery

`public/search-theme.css` is a render-blocking `<link>` in `index.html` — every visitor downloads it,
and `CLAUDE.md` requires it stay lean. ~700 lines of particle-sim and instrument-readout styling
should not reach someone reading the blog.

So ARES follows the ClubPM precedent: **`public/ares-theme.css`, fetched on demand by the `/ares/*`
lazy routes.**

### 4.1 Generalize the loader

`src/clubpm/loadClubPmTheme.js` already does exactly this job for ClubPM. Extract the mechanism to
`src/theme/loadTheme.js`:

```js
export function loadTheme(href, marker) { … }        // the existing implementation, parameterized
export function lazyWithTheme(href, marker) { … }    // wraps a React.lazy loader
```

`src/clubpm/loadClubPmTheme.js` keeps both of its current exports as thin wrappers over
`loadTheme('/clubpm-theme.css?v=1', 'data-clubpm-theme')`. **Do not change its call signature or the
`data-clubpm-theme` attribute** — `App.js` calls `lazyWithClubPmTheme` at ~20 sites, and
`BlogPreviewFrame`'s iframe depends on the stable `/clubpm-theme.css` URL.

Preserve the existing behaviour exactly: single in-flight promise, resolve on `onerror` as well as
`onload` (a missing stylesheet must degrade to unstyled, not hang a route behind Suspense forever),
and a no-op when `document` is undefined.

### 4.2 Scope every rule under `.ares-page`

Both sheets are appended to `<head>` at runtime, so their relative order depends on which route the
visitor hit first. `/ares` → `/clubpm` and `/clubpm` → `/ares` produce opposite orders, and
`clubpm-theme.css` is a verbatim tail slice with broad selectors.

**Every selector in `ares-theme.css` is nested under a `.ares-page` root class** set on each ARES
page's outermost element. Load order then cannot matter in either direction. No bare element
selectors, no unscoped utility classes.

Design tokens are declared on `.ares-page` (not `:root`) for the same reason.

---

## 5. The components

Eight interactives (§5.1–§5.8) plus two shared primitives (§5.9). The interactives are `React.lazy`
behind `<Suspense>` with a skeleton fallback, following the `AstroFlowDiagram` pattern; the two
primitives are small and imported directly. Shared requirements in §6.

★ = the four core pieces.

### 5.1 ★ PlumeSimulator — `/ares` §3

**Shows:** a canvas particle field around a head-and-shoulders silhouette. A slider drags `g` from
1.00 (Earth) through 0.38 (Mars) to 0. At 1 g the plume rises, sweeps the chin, and carries exhalate
up and out at ~45°. As `g` falls the upward drift dies, the breathing envelope disappears, and
exhaled CO₂ accumulates in front of the face as a tinted concentration field.

**Live readout:** `Gr`, `Ra`, and a regime verdict ("buoyancy-dominated" / "diffusion-dominated"),
computed from `aresPhysics.js` at the current `g`. Values update as the slider moves.

**The teaching:** the CO₂ bubble is not CO₂ appearing — it is a ventilation structure disappearing.
That sentence is the page's thesis and this component is its proof.

**Not a CFD solve.** A visually-tuned advection-plus-diffusion particle model whose *regime* tracks
the real dimensionless numbers. Labelled "illustrative" in the caption. A simulation presented as a
result is the exact habit C14 teaches against, and this page must not commit it.

**Fallback:** three static SVG frames (1 g / 0.38 g / 0 g) side by side with the same readouts —
which is also the `prefers-reduced-motion` rendering.

### 5.2 ★ PodReadout — `/ares` §6

**Shows:** an SVG head profile with the three pods — **top**, **forehead**, **chin** — named as
positions, never as indices (`GLOSSARY.md` §1: firmware indices and physical positions are not
guaranteed to correspond). Hovering or focusing a pod reveals what it measures and why it is there.

A scrubbable breath-cycle timeline drives three synchronized concentration traces. Chin spikes on
exhalation; top stays near its reference; forehead carries humidity and thermal load.

**Live readout:** `f_rb = (C_chin − C_top) / (C_exhaled − C_top)`, recomputed as the scrub moves.

**Carries the three caveats** (`GLOSSARY.md` §2 requires them to travel with the formula everywhere):
two-compartment mixing model; `C_top` is a reference, not a datum; it is a difference, so it inherits
both sensors' errors.

**A second mode** demonstrates §1.2 item 1: toggle "top pod in the plume" and watch `C_top` rise, the
numerator shrink, and `f_rb` fall — a clean, stable, confidently wrong number, biased low. This is the
most important interaction on the site and the reason the finding was cleared.

### 5.3 ★ ExposureDial — `/ares` §5

**Shows:** a concentration dial from 400 ppm to 10,000 ppm. Reads out simultaneously in **ppm**
(prose unit), **mmHg** (partial pressure), and **%**, with tier bands from `GLOSSARY.md` §5 marked on
the track: outdoor ambient 400 · mild ceiling 1,000 · mild/moderate 2,500 · moderate/acute and the
8-hour occupational TLV 5,000 · **NASA 2010 operational limit 5,300** · NASA 2006 limit 6,600.

A session-length input yields cumulative dose in **ppm·hours**, always reported with its averaging
interval — 5,000 ppm for one hour and 1,000 ppm for five hours are the same dose and are not the same
exposure.

**The teaching:** a cabin within limits is not a face within limits. That is the entire argument for
the project, and it is the one number a visitor should leave with.

**Pressure dependence is real, not decorative.** The mmHg conversion takes ambient pressure; a reading
at 950 hPa converts against 713 mmHg, not 760.

### 5.4 ★ DelayVsT90 — `/ares/the-headset`

**Shows:** a step change in gas at a sampling inlet at `t = 0`. The gas travels the tube — nothing at
the sensor for `t_d ≈ V_tube / Q` — then the sensor's reading rises exponentially toward the new value,
reaching 90 % after a further `T90`. Two quantities, drawn as two visually distinct phases.

**The teaching:** transport delay is a property of *the plumbing*; T90 is a property of *the sensor*.
They are conflated constantly, and M6 exists in the course partly to keep them apart. Total observed
lag is `t_d + T90`, and they are corrected differently — transport delay is subtracted, T90 is
deconvolved or lived with. Because dispersion smears the step, `t_d` is measured at the **50 %
crossing**, not at first movement; the component marks that crossing.

**Values are illustrative and user-set.** Tube length and flow rate are sliders with generic defaults,
captioned **"Illustrative values — not ARES hardware figures."** ARES pump and flow figures were
reviewed and declined (§1.3). The physics is exact; the hardware is not disclosed. Do not later
"improve" this by substituting the real numbers.

### 5.5 RegimePlayground — `/ares/the-science`

**Shows:** `Gr`, `Ra`, `Pe`, `Re` computed live from `AIR_PROPERTIES` as the user sets ΔT,
characteristic length `L`, and `g`.

**The teaching, which is the point of the component:** `L` is a *choice*, and it must be stated.
`Gr` scales as `L³`, so choosing body height (1.7 m) versus the CFD paper's head-width scale
(`Lc = 1/6 m`) moves the answer by orders of magnitude. **A number quoted without its `L` is
meaningless.** The component presents `L` as a labelled choice with both named options preset, and
shows the two results side by side.

`Pe` here is the **mass-transport** Péclet number with `D` the CO₂-in-air binary diffusivity. If a
thermal Péclet is ever added it must be labelled `Pe_thermal`.

### 5.6 NdirBeam — `/ares/the-headset`

**Shows:** an animated optical path — broadband IR source → gas-filled path → bandpass filter at
4.26 µm → detector. A concentration slider drives the absorbed fraction (Beer–Lambert) and the
resulting detector signal.

Explains what "non-dispersive" means: there is no monochromator or grating; the filter selects the
band.

**Principle only.** No part numbers, no protocol, no register semantics (§1.3).

One honest note worth including: an NDIR sensor measures the number of absorbing molecules in its
optical path, which tracks *partial pressure* — so an uncorrected ppm reading drifts with ambient
pressure even when the mole fraction has not changed. This connects directly to `ExposureDial`'s
pressure input.

### 5.7 SystemDiagram — `/ares/the-headset`

**Shows:** hand-rolled animated SVG. Three pods → aggregation → logging → application. Block level
only.

**SVG, not mxGraph.** `AstroFlowDiagram` uses mxGraph because it decodes draw.io XML that someone else
maintains, and `CLAUDE.md` documents five gotchas it must observe to do so (`Object.assign(window, mx)`
before decode, named-style registration, custom shape registration, `position: relative` on the
container, the refresh/tick/fit sequence). There is no ARES `.xml`, the diagram is ~8 fixed nodes, and
SVG animates with CSS at no bundle cost.

**Excluded from this diagram:** bus names and timings, characteristic UUIDs, CSV columns, part
designations (§1.3). Blocks are named by function.

### 5.8 PodDisagreement — `/ares` §7 and `/ares/the-headset`

**Shows:** three noisy pod readings with error bars, and the derived `chin − top` difference plotted
beside them with its own, visibly larger, error bar.

**The teaching:** the difference of two noisy readings is noisier than either. This is why per-pod
calibration is not optional, and why three sensors disagreeing is normal rather than alarming.

Also covers what automatic baseline correction does — periodically re-zeroing to the lowest
concentration seen over a multi-day window, on the assumption the sensor meets fresh outdoor air at
some point in it — and why a headset that spends its life near a CO₂ source cannot rely on that
assumption. Principle only; no firmware detail.

### 5.9 AresStat and AresTerm — shared primitives

**`AresStat`** — an instrument-panel stat tile. Counts up on scroll into view (instant under
`prefers-reduced-motion`), renders value and unit in JetBrains Mono (already loaded by
`index.html`), and exposes its source on hover/focus. Sourcing every number on the page is the
`GLOSSARY.md` §7 house rule carried across.

**`AresTerm`** — wraps the site's existing `.abbr-tip` / `data-tip` idiom, pulling definitions from
`GLOSSARY_TERMS` so HTBP, BTC, IBD, NDIR, CTA, T90 and PaCO₂ are defined in place. One map, one
definition per term, which is what a binding glossary is for. Must be focusable and readable by
keyboard, not hover-only.

---

## 6. Cross-cutting requirements

Every component in §5 satisfies all of these. They are listed once rather than repeated per component.

### 6.1 Motion and performance

- **`prefers-reduced-motion: reduce`** — no looping animation, no count-up, no particle advection.
  Each component renders a meaningful static state instead. `search-theme.css` already carries a
  reduced-motion block; ARES honors it rather than re-implementing it.
- **Offscreen pause.** Canvas and `requestAnimationFrame` loops are gated by `IntersectionObserver`
  and stop when the component leaves the viewport. A particle sim running in a background tab is a
  battery bug.
- **Cleanup.** Every `rAF`, observer, and listener is cancelled on unmount. Framer Motion's
  `AnimatePresence` unmounts pages on navigation, so a leaked loop survives the page that owns it.
- **Lazy.** Eight components behind `React.lazy`, so `/ares`'s initial payload stays close to the
  other program pages'.

### 6.2 Accessibility

- **Native controls.** All sliders are `<input type="range">` — keyboard operation, screen-reader
  announcement, and touch support come free and correct.
- **`aria-live` readouts.** Each interactive publishes its current state as text in a polite live
  region. A non-sighted visitor can operate `ExposureDial` and hear the tier change.
- **Non-canvas fallback** for every canvas component, following the `loop-ring-fallback` precedent on
  `AstroUSA.jsx`.
- **Colour is never the only channel.** Tier bands, regime verdicts, and pod states carry text labels
  as well as colour.
- **Focus-visible** is already handled globally in `search-theme.css`; ARES must not override it.

### 6.3 House style, inherited from the course

- **`CO₂` with a subscript two** in all prose. `CO2` only in identifiers.
- **Font Awesome, never emoji** (`CLAUDE.md` and `GLOSSARY.md` §7 both).
- **Numbers over 999 take a comma.** 1,850 ppm.
- **ppm in prose**; mmHg only when quoting a NASA limit, always with the ppm equivalent on first use;
  `%` only when quoting a published range.
- **Pods are named by position** — top, forehead, chin. Never by index.
- **Open questions stay open.** Where the science is unresolved, the page says so. It does not resolve
  anything for narrative tidiness.

---

## 7. Assets

`public/ares/` does not exist yet, and **no ARES image exists anywhere in the repo today.** The pages
must therefore ship complete and presentable with zero photographs, and improve as files arrive.

- **Hardware photos** — hero and a gallery on `/ares/the-headset`. Slots render a styled placeholder
  (not a broken image) until files land.
- **CFD / deck figures** — `/ares` §4 and `/ares/the-science`. **Each figure needs a copyright check
  before publishing.** Dutta et al. figures are third-party; deck figures may embed third-party
  material. This is a human gate, not a build step, and it is listed in §10.
- **No team photos** in this scope.

Generated visuals — the eight components — are the primary art direction, not a stopgap. They are also
the only visuals guaranteed to be correct and license-clean.

---

## 8. Visual direction

The site palette is warm: cream `#f5efe6`, sand `#ede3d8`, Mars red `#b83225`, dark navy `#12121c`,
Oswald headings, Lato body. **ARES reads as a warm-toned instrument, not the conventional
cyan-on-black telemetry look.** Readouts use Mars red and navy against cream; JetBrains Mono for
numerals.

Four effects specific to these pages:

1. **Gravity drains out of the page.** A GSAP scroll trigger couples the hero's background particle
   field to scroll position; crossing from §2 into §3 kills the upward drift. The page performs its
   subject. Disabled entirely under `prefers-reduced-motion`.
2. **Concentration tint.** Section backgrounds walk from cream toward warm ochre across §4–§5, reading
   as accumulation, using the existing palette rather than fighting it.
3. **The live glossary layer.** `AresTerm` throughout the prose.
4. **Sourced stat tiles.** `AresStat` — every number carries its unit and its source.

`SectionProgressRail` is reused unchanged on all three pages (it hides itself below 1100 px).

---

## 9. Out of scope

- **No ClubPM integration.** No auth, no API calls, no links into `/clubpm` course content. These are
  public marketing/education pages and must render for a logged-out visitor with the backend down.
- **No tour anchors.** `scripts/check-tour-anchors.js` covers ClubPM UI taught by Constellation
  courses. ARES public pages are not taught by any course, so `tourAnchors.js` and
  `docs/courses/ANCHORS.md` are untouched. Do not add `data-tour-id` attributes here.
- **No changes to ARES 101 itself.** The course's four open production gaps (un-imported decks,
  unrecorded videos, M6's three missing files, unshared lit-review PDFs) are separate work tracked in
  its README. This page does not depend on any of them and must not be blocked by them.
- **No blog posts.** Publishing C12/C13 to `/blog` is a separate, already-cleared action.
- **No backend work.**

---

## 10. Verification

Automated, run from the repo root after each implementation phase:

```bash
npm run build        # must pass; watch the bundle delta on /ares chunks
npm test
```

> `src/App.test.js` already fails on `main` for an unrelated reason — a broken `main` field in the
> installed `react-router-dom` package prevents Jest from resolving it. That failure predates this
> work. Confirm the failure list is unchanged rather than empty, and do not try to fix it here.

Manual, and none of it is optional:

1. **Every number on the page traces to `aresPhysics.js`, and every constant there traces to
   `GLOSSARY.md`.** Grep the ARES JSX for bare numerals in prose. This is the check that keeps the
   page from drifting away from the course the way the course warns its own modules will.
2. **Walk all three routes with `prefers-reduced-motion: reduce` set.** Nothing animates; every
   component still communicates its point.
3. **Keyboard-only pass.** Reach and operate every slider, scrub, and pod without a mouse.
4. **Load-order pass.** Visit `/ares` → `/clubpm` → `/ares`, and `/clubpm` → `/ares` → `/clubpm`.
   Neither theme may leak into the other. This is what `.ares-page` scoping (§4.2) exists to prevent,
   and it is invisible in a single-route test.
5. **Backend-down pass.** Load all three routes logged out with the API unreachable.
6. **Mobile pass.** Canvas components on a real phone — check both layout and that offscreen pausing
   actually stops the loop.
7. **Re-read §1 against the finished pages.** Confirm nothing from §1.3 appears anywhere in the
   rendered text, image captions, or `alt` attributes.

Requiring a human before launch:

- **Copyright clearance on every third-party figure** (§7).
- **A read-through by someone on the ARES team** for factual accuracy on current-state claims — the
  hardware changes weekly and this spec was written against sources dated 2026-07-30.

---

## 11. Summary of decisions

| Decision | Choice | Why |
|---|---|---|
| Content scope | Cleared physics + curated technical layer | §1; per-item review 2026-08-22 |
| Page shape | Hub + two deep-dives | Mirrors AstroUSA; gives nine interactives room |
| Nav | Fifth Teams entry | ARES is a peer subteam, not a Research project |
| Interactives | All eight | Requested; four are core |
| CSS | Lazy `ares-theme.css`, scoped `.ares-page` | Keeps the render-blocking sheet lean; load order is visit-dependent |
| Block diagram | Hand-rolled SVG | No draw.io source; avoids five documented mxGraph gotchas |
| Constants | `aresPhysics.js`, single source of truth | The drift failure the course README documents |
| Pump figures | Excluded; illustrative values instead | Reviewed and declined |
