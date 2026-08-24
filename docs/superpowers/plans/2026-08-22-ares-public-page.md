# ARES Public Subteam Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a public ARES subteam presence at `/ares`, `/ares/the-science`, and `/ares/the-headset`, built from the ARES 101 curriculum, carried by eight interactive components.

**Architecture:** Three lazy React routes on the public site, styled by an on-demand `public/ares-theme.css` scoped under `.ares-page`. Every physical constant lives in one module (`src/components/ares/aresPhysics.js`) that mirrors the course's binding `GLOSSARY.md`. Each interactive splits into a pure model function in `src/lib/ares/` (unit-tested) and a presentational component in `src/components/ares/` (canvas/SVG, RTL smoke-tested). No backend, no auth, no ClubPM coupling.

**Tech Stack:** React 19, React Router 7, GSAP (already a dep), canvas 2D, hand-rolled SVG, Jest + @testing-library/react.

**Spec:** [`docs/superpowers/specs/2026-08-22-ares-public-subteam-page-design.md`](../specs/2026-08-22-ares-public-subteam-page-design.md)

---

## Global Constraints

Every task's requirements implicitly include this section.

**Publication clearance — the load-bearing constraint.** Spec §1 governs all prose, `alt` text, captions, and code comments that reach the browser. Read §1 before writing any user-visible string.

- **Never publish:** pump/flow figures (2.00 L/min, 0.67 L/min per pod, tube geometry), the anemometer/pump open questions, the astronaut medical passage, IRB status, purchasing problems, the CSV data contract, the sensor ASCII command protocol, part designations (`SprintIR-6S-20%` and any other), Drive file ids.
- **Cleared by review:** the "top pod is sitting in the plume" finding and its fix; the generalized how-to-read-a-simulation-result skill; physics figures minus part identity.
- **The rule:** if a sentence could not be reconstructed from spec §1.1 + §1.2, it does not belong on the page.

**House style** (from `docs/courses/ares-101/GLOSSARY.md` §7 and `CLAUDE.md`):

- `CO₂` with a subscript two (U+2082) in all prose. `CO2` only in identifiers and code.
- Numbers over 999 take a comma: `1,850 ppm`. Decimals use a point.
- ppm in prose; mmHg only when quoting a NASA limit, always with the ppm equivalent on first use; `%` only when quoting a published range.
- Pods are named **top**, **forehead**, **chin** — never by index.
- Font Awesome only, never emoji. **Icon class names must be string literals** — `scripts/fa-icon-scan.mjs` is a static scan (`SCAN_EXT` = `.js/.jsx/.ts/.tsx/.html/.css/.scss`), so `` `fas fa-${name}` `` produces a blank glyph. Write `className="fas fa-wind"`.
- Open questions stay open. Do not resolve unresolved science for narrative tidiness.

**Technical constraints:**

- All ARES CSS goes in `public/ares-theme.css`, **every selector scoped under `.ares-page`**. No bare element selectors. Design tokens declared on `.ares-page`, not `:root`.
- No constant, threshold, or conversion factor is written inline in JSX. Import from `aresPhysics.js`.
- Every `requestAnimationFrame` loop, `IntersectionObserver`, and event listener is cancelled on unmount.
- Every animated component honors `prefers-reduced-motion: reduce` with a meaningful static rendering.
- Sliders are native `<input type="range">`. Every interactive publishes state to an `aria-live="polite"` region.
- No imports from `src/clubpm/**` or `src/api/clubPmClient.js`. These pages must render logged out with the backend down.
- Do not add `data-tour-id` attributes. ARES is not taught by a Constellation course.

**Running tests on Windows:**

```bash
npm test -- --watchAll=false src/lib/ares/exposureModel.test.js
```

`npm test` runs `node scripts/check-tour-anchors.js` first; it should pass untouched. **`src/App.test.js` already fails on `main`** — a broken `main` field in the installed `react-router-dom` stops Jest resolving it. That failure predates this work. Confirm the failure list is *unchanged*, not empty.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/components/ares/aresPhysics.js` | Constants, conversions, dimensionless numbers, glossary map. Single source of truth. |
| `src/components/ares/aresPhysics.test.js` | Unit tests for the above. |
| `src/theme/loadTheme.js` | Generalized runtime stylesheet loader. |
| `src/theme/loadTheme.test.js` | Unit tests for the loader. |
| `src/clubpm/loadClubPmTheme.js` | **Modified** — thin wrappers over `loadTheme`. Signature unchanged. |
| `src/lib/ares/plumeModel.js` + test | Particle advection/diffusion state stepping. |
| `src/lib/ares/breathModel.js` + test | Breath-cycle concentration traces, `f_rb` over time. |
| `src/lib/ares/exposureModel.js` + test | Tier lookup, dose, pressure-corrected conversions. |
| `src/lib/ares/stepResponseModel.js` + test | Transport delay + T90 step response, 50 % crossing. |
| `src/lib/ares/beerLambert.js` + test | Absorbed fraction, detector signal. |
| `src/lib/ares/noisyDifference.js` + test | Error propagation for `chin − top`. |
| `src/components/ares/*.jsx` | Eight interactives + `AresStat` + `AresTerm`. Presentation only. |
| `src/pages/Ares.jsx` | Hub, 9 rail sections. |
| `src/pages/Ares/TheScience.jsx` | Physics deep-dive. |
| `src/pages/Ares/TheHeadset.jsx` | System deep-dive. |
| `public/ares-theme.css` | ~700 lines, `.ares-page`-scoped. |
| `src/App.js` | **Modified** — three routes. |
| `src/components/Navbar.jsx` | **Modified** — Teams entry + `TEAMS_PATHS`. |
| `src/components/Footer.jsx` | **Modified** — team link. |
| `scripts/minify-public-css.mjs` | **Modified** — add `ares-theme.css` to `TARGETS`. |
| `public/sitemap.xml`, `public/search-index.json`, `public/llms.txt` | **Modified** — registration. |

Why the `src/lib/ares/` split: canvas and SVG components are painful to assert against, but their *physics* is the part that can be silently wrong. Extracting pure model functions makes the correctness-critical half unit-testable and matches the existing convention (`src/lib/tourGeometry.js` + `tourGeometry.test.js`).

---

## Task 1: `aresPhysics.js` — the single source of truth

**Files:**
- Create: `src/components/ares/aresPhysics.js`
- Test: `src/components/ares/aresPhysics.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `AIR_PROPERTIES`, `DIFFUSIVITY_CO2`, `GRAVITY`, `CO2_TIERS`, `PLUME`, `NDIR_BAND`, `ANEMOMETRY_RANGE`, `STANDARD_PRESSURE_HPA`, `GLOSSARY_TERMS`, and functions `ppmToMmHg(ppm, pressureHpa?)`, `mmHgToPpm(mmHg, pressureHpa?)`, `airPropertiesAt(tempK)`, `grashof({ dT, L, tFilmK, g })`, `rayleigh({ dT, L, tFilmK, g })`, `peclet({ V, L })`, `reynolds({ V, L, tFilmK })`, `rebreathedFraction({ chin, top, exhaled })`, `tierFor(ppm)`, `dosePpmHours(ppm, hours)`.

Source of every value: `docs/courses/ares-101/GLOSSARY.md`. Read §3, §4 and §5 before starting.

- [ ] **Step 1: Write the failing tests**

Create `src/components/ares/aresPhysics.test.js`:

```js
import {
  AIR_PROPERTIES, DIFFUSIVITY_CO2, GRAVITY, CO2_TIERS, GLOSSARY_TERMS,
  ppmToMmHg, mmHgToPpm, airPropertiesAt, grashof, rayleigh, peclet,
  reynolds, rebreathedFraction, tierFor, dosePpmHours,
} from './aresPhysics';

describe('unit conversions (GLOSSARY §5)', () => {
  test('1 ppm is 7.60e-4 mmHg at one standard atmosphere', () => {
    expect(ppmToMmHg(1)).toBeCloseTo(7.6e-4, 6);
  });

  test('1 mmHg is about 1,316 ppm', () => {
    expect(mmHgToPpm(1)).toBeCloseTo(1315.8, 1);
  });

  test('the glossary conversion table round-trips', () => {
    // GLOSSARY §5 table: ppm -> mmHg at 1 atm
    expect(ppmToMmHg(400)).toBeCloseTo(0.30, 2);
    expect(ppmToMmHg(5000)).toBeCloseTo(3.8, 1);
    expect(ppmToMmHg(5300)).toBeCloseTo(4.0, 1);
    expect(ppmToMmHg(6600)).toBeCloseTo(5.0, 1);
  });

  test('conversion is pressure-dependent — 950 hPa converts against 713 mmHg', () => {
    // GLOSSARY §5: "A reading taken at 950 hPa converts against 713 mmHg, not 760."
    const atAltitude = ppmToMmHg(1_000_000, 950);
    expect(atAltitude).toBeCloseTo(712.6, 0);
  });
});

describe('property table (GLOSSARY §4)', () => {
  test('carries the three tabulated temperatures', () => {
    expect(AIR_PROPERTIES.map(r => r.tempK)).toEqual([295, 300, 305]);
  });

  test('295 K row matches the glossary exactly', () => {
    const row = AIR_PROPERTIES.find(r => r.tempK === 295);
    expect(row.nu).toBeCloseTo(1.53e-5, 9);
    expect(row.alpha).toBeCloseTo(2.15e-5, 9);
    expect(row.Pr).toBeCloseTo(0.712, 4);
    expect(row.beta).toBeCloseTo(3.39e-3, 6);
  });

  test('binary diffusivity of CO2 in air', () => {
    expect(DIFFUSIVITY_CO2).toBeCloseTo(1.6e-5, 9);
  });

  test('airPropertiesAt interpolates between tabulated rows', () => {
    const mid = airPropertiesAt(297.5);
    expect(mid.nu).toBeGreaterThan(1.53e-5);
    expect(mid.nu).toBeLessThan(1.59e-5);
  });

  test('airPropertiesAt clamps outside the tabulated range', () => {
    // The course only covers 295-305 K; do not extrapolate silently.
    expect(airPropertiesAt(250).nu).toBeCloseTo(1.53e-5, 9);
    expect(airPropertiesAt(400).nu).toBeCloseTo(1.64e-5, 9);
  });

  test('Mars gravity is 3.71 and orbit is 0', () => {
    expect(GRAVITY.earth).toBeCloseTo(9.81, 2);
    expect(GRAVITY.mars).toBeCloseTo(3.71, 2);
    expect(GRAVITY.orbit).toBe(0);
  });
});

describe('dimensionless numbers (GLOSSARY §3)', () => {
  const base = { dT: 10, L: 1.7, tFilmK: 300, g: GRAVITY.earth };

  test('Grashof uses beta = 1/T_film', () => {
    // Gr = g*beta*dT*L^3 / nu^2
    const { nu } = airPropertiesAt(300);
    const expected = (9.81 * (1 / 300) * 10 * Math.pow(1.7, 3)) / (nu * nu);
    expect(grashof(base)).toBeCloseTo(expected, -6);
  });

  test('Grashof scales as L cubed — the reason L must be stated', () => {
    const big = grashof({ ...base, L: 1.7 });
    const small = grashof({ ...base, L: 1 / 6 });
    expect(big / small).toBeCloseTo(Math.pow(1.7 / (1 / 6), 3), 0);
  });

  test('Grashof is zero in orbit', () => {
    expect(grashof({ ...base, g: GRAVITY.orbit })).toBe(0);
  });

  test('Rayleigh is Grashof times Prandtl', () => {
    const { Pr } = airPropertiesAt(300);
    expect(rayleigh(base)).toBeCloseTo(grashof(base) * Pr, -6);
  });

  test('Peclet is the mass-transport form, using D not alpha', () => {
    expect(peclet({ V: 0.3, L: 1.7 })).toBeCloseTo((0.3 * 1.7) / DIFFUSIVITY_CO2, 0);
  });

  test('Reynolds reproduces the CFD paper with Lc = 1/6 m', () => {
    // GLOSSARY §6: Vc = 0.2816 m/s, Lc = 1/6 m, nu = 1.52e-5 -> Re = 3087.71
    const re = reynolds({ V: 0.2816, L: 1 / 6, nu: 1.52e-5 });
    expect(re).toBeCloseTo(3087.7, 0);
  });
});

describe('rebreathed fraction (GLOSSARY §2)', () => {
  test('computes the two-compartment mixing fraction', () => {
    expect(rebreathedFraction({ chin: 1850, top: 400, exhaled: 40000 }))
      .toBeCloseTo((1850 - 400) / (40000 - 400), 6);
  });

  test('a contaminated top reference biases the result low', () => {
    // C13: a top pod standing in the plume shrinks the numerator.
    const honest = rebreathedFraction({ chin: 1850, top: 400, exhaled: 40000 });
    const contaminated = rebreathedFraction({ chin: 1850, top: 900, exhaled: 40000 });
    expect(contaminated).toBeLessThan(honest);
  });

  test('returns null rather than Infinity when the denominator vanishes', () => {
    expect(rebreathedFraction({ chin: 1850, top: 400, exhaled: 400 })).toBeNull();
  });
});

describe('tiers and dose (GLOSSARY §5, §2)', () => {
  test('tier boundaries match the glossary', () => {
    expect(CO2_TIERS.map(t => t.ppm)).toEqual([400, 1000, 2500, 5000, 5300, 6600]);
  });

  test('the NASA 2010 operational limit is labelled and is 5,300 ppm', () => {
    const nasa = CO2_TIERS.find(t => t.ppm === 5300);
    expect(nasa.label).toMatch(/NASA/);
    expect(nasa.label).toMatch(/2010/);
  });

  test('tierFor picks the band a reading falls in', () => {
    expect(tierFor(450).ppm).toBe(400);
    expect(tierFor(3000).ppm).toBe(2500);
    expect(tierFor(5400).ppm).toBe(5300);
  });

  test('dose is concentration times hours', () => {
    // GLOSSARY §2: 5,000 ppm for 1 h and 1,000 ppm for 5 h are the same dose.
    expect(dosePpmHours(5000, 1)).toBe(5000);
    expect(dosePpmHours(1000, 5)).toBe(5000);
  });
});

describe('glossary map', () => {
  test('defines the terms the pages mark up', () => {
    for (const term of ['HTBP', 'BTC', 'IBD', 'NDIR', 'CTA', 'T90', 'PaCO₂']) {
      expect(typeof GLOSSARY_TERMS[term]).toBe('string');
      expect(GLOSSARY_TERMS[term].length).toBeGreaterThan(20);
    }
  });

  test('carries no excluded part designations', () => {
    const all = Object.values(GLOSSARY_TERMS).join(' ');
    expect(all).not.toMatch(/SprintIR/i);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test -- --watchAll=false src/components/ares/aresPhysics.test.js
```

Expected: FAIL — `Cannot find module './aresPhysics'`.

- [ ] **Step 3: Implement `aresPhysics.js`**

Create `src/components/ares/aresPhysics.js`. Header block first — it is what stops the file drifting from the course:

```js
/**
 * ARES physical constants and formulas — the single source of truth for every
 * number on the public /ares pages.
 *
 * UPSTREAM: docs/courses/ares-101/GLOSSARY.md, which is *binding* on the ARES
 * 101 curriculum. If a value here disagrees with the glossary, fix the glossary
 * first and then this file — never the other way round, and never by editing a
 * number into a component.
 *
 * The reason this module exists at all is documented in
 * docs/courses/ares-101/README.md: ARES hardware changes weekly, so
 * current-state claims go stale, and a number typed inline is a claim nobody
 * can re-verify and nobody will dare to change.
 *
 * PUBLICATION CLEARANCE: this file is public. See spec §1 — no part
 * designations, no pump or flow figures, no protocol detail.
 */

/** Standard atmosphere. GLOSSARY §4. */
export const STANDARD_PRESSURE_HPA = 1013.25;
const STANDARD_PRESSURE_MMHG = 760;

/**
 * Dry air at 1 atm. GLOSSARY §4 — already corrected for the curvature that
 * makes naive interpolation of Incropera Table A.4 overshoot by 1-2 % near
 * 295 K. Take these values from here; do not re-interpolate.
 */
export const AIR_PROPERTIES = [
  { tempK: 295, nu: 1.53e-5, alpha: 2.15e-5, Pr: 0.712, beta: 3.39e-3 },
  { tempK: 300, nu: 1.59e-5, alpha: 2.25e-5, Pr: 0.707, beta: 3.33e-3 },
  { tempK: 305, nu: 1.64e-5, alpha: 2.32e-5, Pr: 0.707, beta: 3.28e-3 },
];

/** Binary diffusivity of CO2 in air at 298 K, 1 atm. GLOSSARY §4. */
export const DIFFUSIVITY_CO2 = 1.6e-5;

/** GLOSSARY §4. Mars is the 0.38 g referenced in M1 and M3. */
export const GRAVITY = { earth: 9.81, mars: 3.71, orbit: 0 };

/** C13 — Dutta et al. plume structure. */
export const PLUME = {
  crownVelocityMin: 0.3,
  crownVelocityMax: 0.4,
  developmentLengthM: 1.7,
};

/** GLOSSARY §1 — the CO2 absorption band NDIR selects with a bandpass filter. */
export const NDIR_BAND_M = 4.26e-6;

/** GLOSSARY §5 — the velocity regime the anemometry has to resolve. */
export const ANEMOMETRY_RANGE = { min: 0.05, max: 0.4 };

/** GLOSSARY §5 conversion table. Ascending; tierFor() relies on the order. */
export const CO2_TIERS = [
  { ppm: 400,  label: 'Outdoor ambient',                 note: 'The fresh-air baseline' },
  { ppm: 1000, label: 'Top of the mild tier',            note: null },
  { ppm: 2500, label: 'Mild / moderate boundary',        note: null },
  { ppm: 5000, label: 'Moderate / acute boundary',       note: 'Also the 8-hour occupational limit' },
  { ppm: 5300, label: "NASA's 2010 operational limit",   note: '4.0 mmHg' },
  { ppm: 6600, label: "NASA's 2006 operational limit",   note: '5.0 mmHg' },
];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Linear interpolation across AIR_PROPERTIES, clamped at both ends. The course
 * covers 295-305 K; clamping rather than extrapolating keeps a slider that runs
 * past the table from inventing physics.
 */
export function airPropertiesAt(tempK) {
  const rows = AIR_PROPERTIES;
  const t = clamp(tempK, rows[0].tempK, rows[rows.length - 1].tempK);
  for (let i = 0; i < rows.length - 1; i += 1) {
    const a = rows[i];
    const b = rows[i + 1];
    if (t >= a.tempK && t <= b.tempK) {
      const f = b.tempK === a.tempK ? 0 : (t - a.tempK) / (b.tempK - a.tempK);
      return {
        tempK: t,
        nu:    a.nu    + f * (b.nu    - a.nu),
        alpha: a.alpha + f * (b.alpha - a.alpha),
        Pr:    a.Pr    + f * (b.Pr    - a.Pr),
        beta:  a.beta  + f * (b.beta  - a.beta),
      };
    }
  }
  return { ...rows[rows.length - 1] };
}

/**
 * ppm is a mole fraction; mmHg is a partial pressure. Converting needs a total
 * pressure, and it is pressure-dependent for real — GLOSSARY §5.
 */
export function ppmToMmHg(ppm, pressureHpa = STANDARD_PRESSURE_HPA) {
  const totalMmHg = STANDARD_PRESSURE_MMHG * (pressureHpa / STANDARD_PRESSURE_HPA);
  return (ppm / 1e6) * totalMmHg;
}

export function mmHgToPpm(mmHg, pressureHpa = STANDARD_PRESSURE_HPA) {
  const totalMmHg = STANDARD_PRESSURE_MMHG * (pressureHpa / STANDARD_PRESSURE_HPA);
  return (mmHg / totalMmHg) * 1e6;
}

/**
 * Gr = g*beta*dT*L^3 / nu^2. GLOSSARY §3.
 *
 * beta is evaluated at the FILM temperature, and nu is read at the same
 * temperature. Mixing the two is the specific mistake the glossary calls out,
 * so tFilmK is a required argument rather than something derived silently.
 *
 * L is a CHOICE and must be stated by the caller. Gr scales as L^3.
 */
export function grashof({ dT, L, tFilmK, g = GRAVITY.earth }) {
  const { nu } = airPropertiesAt(tFilmK);
  const beta = 1 / tFilmK;
  return (g * beta * dT * Math.pow(L, 3)) / (nu * nu);
}

/** Ra = Gr * Pr. GLOSSARY §3. */
export function rayleigh({ dT, L, tFilmK, g = GRAVITY.earth }) {
  const { Pr } = airPropertiesAt(tFilmK);
  return grashof({ dT, L, tFilmK, g }) * Pr;
}

/**
 * Pe = V*L / D — the MASS-transport Peclet number, with D the CO2-in-air binary
 * diffusivity. A thermal Peclet V*L/alpha also exists and is not this; if one is
 * ever needed, name it peclet_thermal. GLOSSARY §3.
 */
export function peclet({ V, L }) {
  return (V * L) / DIFFUSIVITY_CO2;
}

/** Re = V*L / nu. GLOSSARY §3. nu overridable so M3's paper value reproduces. */
export function reynolds({ V, L, tFilmK = 300, nu }) {
  const viscosity = nu ?? airPropertiesAt(tFilmK).nu;
  return (V * L) / viscosity;
}

/**
 * f_rb = (C_chin - C_top) / (C_exhaled - C_top). GLOSSARY §2.
 *
 * Three caveats travel with this formula everywhere it is used, and any UI
 * showing the result must show them too:
 *   1. It is a two-compartment mixing model — chin air is assumed to be exactly
 *      reference air plus exhaled breath and nothing else.
 *   2. C_top is a reference, not a datum. A top pod standing in the plume
 *      shrinks the numerator and biases the answer LOW.
 *   3. It is a difference, so it inherits both sensors' errors.
 *
 * Returns null when the denominator vanishes rather than Infinity, so callers
 * render "—" instead of a nonsense number.
 */
export function rebreathedFraction({ chin, top, exhaled }) {
  const denominator = exhaled - top;
  if (denominator === 0) return null;
  return (chin - top) / denominator;
}

/** The tier band a reading falls in. Returns the lowest band for sub-ambient. */
export function tierFor(ppm) {
  let match = CO2_TIERS[0];
  for (const tier of CO2_TIERS) if (ppm >= tier.ppm) match = tier;
  return match;
}

/**
 * Cumulative exposure in ppm-hours. GLOSSARY §2 requires this to be reported
 * with its averaging interval: 5,000 ppm for one hour and 1,000 ppm for five
 * hours are the same dose and are not the same exposure.
 */
export function dosePpmHours(ppm, hours) {
  return ppm * hours;
}

/** Definitions for AresTerm tooltips. Verbatim sense from GLOSSARY §1. */
export const GLOSSARY_TERMS = {
  HTBP: 'Human thermal body plume — the buoyant column of warmed air that rises along a body because metabolic heat makes the air touching the skin less dense than the air around it.',
  BTC: 'Biothermal convection — convective air motion driven by metabolic heat. BTC is the mechanism; the HTBP is the structure it produces around a body.',
  IBD: 'Indirect biophysical diffusion — the transport regime left once biothermal convection has collapsed: molecular diffusion alone, with no bulk flow to carry the gas. It is slow.',
  NDIR: 'Non-dispersive infrared — a broadband infrared source, a fixed optical path, a bandpass filter at the gas’s absorption band, and a detector. "Non-dispersive" means there is no monochromator or grating; the filter selects the band.',
  CTA: 'Constant-temperature anemometry — measuring air velocity by holding a heated element at a fixed temperature and reading the electrical power needed to do so.',
  T90: 'The time for a sensor’s reading to reach 90 % of its final value after a step change in the gas it is exposed to. A property of the sensor, distinct from transport delay.',
  'PaCO₂': 'The partial pressure of CO₂ in arterial blood — the physiologically meaningful quantity. Symptoms track PaCO₂, not the ppm figure in the room.',
  Deadspace: 'A volume of gas that is inhaled again without having been refreshed. Anatomical deadspace (the conducting airways) and the external deadspace of the CO₂ bubble are different things.',
  Schlieren: 'An optical technique that makes density gradients in transparent media visible, and the experimental validation the 1 g plume simulations are checked against.',
};
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test -- --watchAll=false src/components/ares/aresPhysics.test.js
```

Expected: PASS, all suites.

If the Grashof or Reynolds assertions fail, **do not adjust the test tolerance** — re-read `GLOSSARY.md` §3 and §6. §6 carries a correction notice about `Lc = 1/6 m` and shows the arithmetic that confirms it.

- [ ] **Step 5: Commit**

```bash
git add src/components/ares/aresPhysics.js src/components/ares/aresPhysics.test.js
git commit -m "feat(ares): physical constants and formulas, sourced from GLOSSARY.md"
```

---

## Task 2: Generalize the theme loader and add `ares-theme.css`

**Files:**
- Create: `src/theme/loadTheme.js`, `src/theme/loadTheme.test.js`
- Create: `public/ares-theme.css`
- Modify: `src/clubpm/loadClubPmTheme.js` (rewrite as wrappers, exports unchanged)
- Modify: `scripts/minify-public-css.mjs` (`TARGETS` array, ~line 29)

**Interfaces:**
- Consumes: nothing.
- Produces: `loadTheme(href, marker) => Promise<void>` and `lazyWithTheme(href, marker) => (load) => () => Promise<Module>`. `loadClubPmTheme()` and `lazyWithClubPmTheme(load)` keep their exact current signatures.

Read `src/clubpm/loadClubPmTheme.js` first. Its behaviour is load-bearing and must be preserved exactly: one in-flight promise, resolve on `onerror` as well as `onload`, no-op when `document` is undefined, `<link>` appended to `<head>` so the cascade order holds.

- [ ] **Step 1: Write the failing tests**

Create `src/theme/loadTheme.test.js`:

```js
import { loadTheme, lazyWithTheme, __resetThemeCacheForTests } from './loadTheme';

describe('loadTheme', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    __resetThemeCacheForTests();
  });

  test('appends a stylesheet link carrying the marker attribute', async () => {
    const promise = loadTheme('/ares-theme.css?v=1', 'data-ares-theme');
    const link = document.head.querySelector('link[data-ares-theme]');
    expect(link).not.toBeNull();
    expect(link.rel).toBe('stylesheet');
    expect(link.getAttribute('href')).toBe('/ares-theme.css?v=1');
    link.onload();
    await promise;
  });

  test('resolves on error so a missing sheet degrades instead of hanging', async () => {
    const promise = loadTheme('/missing.css', 'data-missing-theme');
    document.head.querySelector('link[data-missing-theme]').onerror();
    await expect(promise).resolves.toBeUndefined();
  });

  test('appends only one link for repeated calls on the same href', async () => {
    const first = loadTheme('/ares-theme.css?v=1', 'data-ares-theme');
    loadTheme('/ares-theme.css?v=1', 'data-ares-theme');
    document.head.querySelector('link[data-ares-theme]').onload();
    await first;
    expect(document.head.querySelectorAll('link[data-ares-theme]')).toHaveLength(1);
  });

  test('two different themes each get their own link', async () => {
    loadTheme('/ares-theme.css?v=1', 'data-ares-theme');
    loadTheme('/clubpm-theme.css?v=1', 'data-clubpm-theme');
    expect(document.head.querySelector('link[data-ares-theme]')).not.toBeNull();
    expect(document.head.querySelector('link[data-clubpm-theme]')).not.toBeNull();
  });

  test('lazyWithTheme resolves to the module', async () => {
    const mod = { default: 'Component' };
    const wrapped = lazyWithTheme('/ares-theme.css?v=1', 'data-ares-theme')(
      () => Promise.resolve(mod),
    );
    const pending = wrapped();
    document.head.querySelector('link[data-ares-theme]').onload();
    await expect(pending).resolves.toBe(mod);
  });
});
```

Then create `src/clubpm/loadClubPmTheme.test.js`:

```js
import { loadClubPmTheme, lazyWithClubPmTheme } from './loadClubPmTheme';
import { __resetThemeCacheForTests } from '../theme/loadTheme';

describe('loadClubPmTheme compatibility wrapper', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    __resetThemeCacheForTests();
  });

  test('still uses the stable /clubpm-theme.css URL and data-clubpm-theme marker', async () => {
    const promise = loadClubPmTheme();
    const link = document.head.querySelector('link[data-clubpm-theme]');
    expect(link.getAttribute('href')).toBe('/clubpm-theme.css?v=1');
    link.onload();
    await promise;
  });

  test('lazyWithClubPmTheme keeps its single-argument signature', async () => {
    const mod = { default: 'Shell' };
    const pending = lazyWithClubPmTheme(() => Promise.resolve(mod))();
    document.head.querySelector('link[data-clubpm-theme]').onload();
    await expect(pending).resolves.toBe(mod);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test -- --watchAll=false src/theme/loadTheme.test.js src/clubpm/loadClubPmTheme.test.js
```

Expected: FAIL — `Cannot find module '../theme/loadTheme'`.

- [ ] **Step 3: Implement `src/theme/loadTheme.js`**

```js
/**
 * Loads a hand-written stylesheet from public/ on demand.
 *
 * Generalized from the ClubPM-only loader. Two sheets now use it:
 *   /clubpm-theme.css  — fetched by /clubpm/* routes
 *   /ares-theme.css    — fetched by /ares/* routes
 *
 * Why a runtime <link> rather than an `import './x.css'`:
 *   - search-theme.css is itself a static <link> in public/index.html, not a
 *     webpack import, so there is no CSS chunk graph to piggyback on.
 *   - Appending to <head> puts these sheets after style.min.css and
 *     search-theme.css, preserving the cascade order they rely on.
 *   - It keeps a stable public URL, which BlogPreviewFrame's iframe needs.
 *
 * CAUTION: both sheets end up in <head> in *visit order*, so a visitor who
 * hits /ares then /clubpm gets the opposite order from one who does the
 * reverse. clubpm-theme.css is a broad verbatim tail slice of the pre-split
 * stylesheet, so ares-theme.css scopes every selector under .ares-page and
 * cannot be affected either way. Keep it that way.
 *
 * The returned promise resolves once the sheet has applied, so callers can hold
 * rendering and avoid a flash of unstyled UI.
 */

const pending = new Map();

export function loadTheme(href, marker) {
  if (pending.has(href)) return pending.get(href);

  const promise = new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve();
      return;
    }

    if (document.querySelector(`link[${marker}]`)) {
      resolve();
      return;
    }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.setAttribute(marker, '');

    // Resolve on error too: a missing stylesheet should degrade to unstyled
    // rather than hang the route behind a Suspense fallback forever.
    link.onload = () => resolve();
    link.onerror = () => resolve();

    document.head.appendChild(link);
  });

  pending.set(href, promise);
  return promise;
}

/**
 * Wraps a React.lazy loader so the chunk resolves only after the stylesheet is
 * in place. Both fetches run in parallel; the Suspense fallback covers the wait.
 */
export function lazyWithTheme(href, marker) {
  return (load) => () => Promise.all([load(), loadTheme(href, marker)]).then(([mod]) => mod);
}

/** Test-only: clears the in-flight cache between cases. */
export function __resetThemeCacheForTests() {
  pending.clear();
}
```

- [ ] **Step 4: Rewrite `src/clubpm/loadClubPmTheme.js` as wrappers**

Replace the whole file. **Both export names and signatures must be unchanged** — `src/App.js` calls `lazyWithClubPmTheme` at roughly 20 sites and `BlogPreviewFrame` depends on the `/clubpm-theme.css` URL.

```js
/**
 * ClubPM stylesheet loading. The mechanism now lives in src/theme/loadTheme.js
 * and is shared with the ARES public pages; this file keeps the ClubPM-specific
 * href and marker, and the call signatures ~20 sites in App.js already use.
 *
 * public/search-theme.css used to carry every ClubPM rule too, so visitors who
 * only ever saw the marketing pages still downloaded ~65 kB (gzip) of dashboard
 * CSS. The ClubPM-only rules live in public/clubpm-theme.css, fetched here the
 * first time a /clubpm/* route loads.
 *
 * The href is a stable public URL because BlogPreviewFrame's iframe links it
 * directly. Do not change it.
 */
import { loadTheme, lazyWithTheme } from '../theme/loadTheme';

const HREF = '/clubpm-theme.css?v=1';
const MARKER = 'data-clubpm-theme';

export function loadClubPmTheme() {
  return loadTheme(HREF, MARKER);
}

export function lazyWithClubPmTheme(load) {
  return lazyWithTheme(HREF, MARKER)(load);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npm test -- --watchAll=false src/theme/loadTheme.test.js src/clubpm/loadClubPmTheme.test.js
```

Expected: PASS.

- [ ] **Step 6: Create `public/ares-theme.css` with tokens and the scope root**

Later tasks append to this file. Start it with the token block and a header stating the scoping rule:

```css
/*
 * ARES public pages — /ares, /ares/the-science, /ares/the-headset.
 *
 * Fetched on demand by src/theme/loadTheme.js, NOT linked from index.html, so
 * visitors who never open an ARES page never download it. That is why this file
 * exists separately from search-theme.css, which every visitor pays for.
 *
 * SCOPING RULE, and it is load-bearing: every selector below is nested under
 * .ares-page. Both runtime-loaded themes land in <head> in visit order, so
 * /ares -> /clubpm and /clubpm -> /ares produce opposite cascade orders, and
 * clubpm-theme.css is a broad verbatim tail slice of the pre-split stylesheet.
 * Scoping makes the order irrelevant. No bare element selectors. No unscoped
 * utility classes. Tokens on .ares-page, never on :root.
 *
 * Palette note: the SEARCH site is warm — cream, sand, Mars red. ARES reads as
 * a warm-toned instrument, not the usual cyan-on-black telemetry look.
 */

.ares-page {
  /* Instrument surfaces */
  --ares-panel:        #fff9f4;
  --ares-panel-sunk:   #ede3d8;
  --ares-grid-line:    rgba(122, 111, 104, 0.18);
  --ares-trace-chin:   #b83225;
  --ares-trace-top:    #3a5a78;
  --ares-trace-fore:   #c98a2b;

  /* Concentration ramp — cream to warm ochre, used by the tint effect */
  --ares-conc-0:       #f5efe6;
  --ares-conc-1:       #efe2cd;
  --ares-conc-2:       #e6d0ac;

  --ares-mono: 'JetBrains Mono', ui-monospace, monospace;
}
```

- [ ] **Step 7: Add `ares-theme.css` to the CSS minifier**

In `scripts/minify-public-css.mjs`, add to the `TARGETS` array (~line 29):

```js
const TARGETS = [
  'search-theme.css',
  'clubpm-theme.css',
  'style.min.css',
  'fa-subset.css',
  'ares-theme.css',
];
```

This matters and is easy to miss: the script **warns and skips** a target it cannot find rather than failing, so an omission here ships the sheet unminified with all its comments and nothing tells you.

- [ ] **Step 8: Verify the build still passes**

```bash
npm run build
```

Expected: build succeeds. In the `[minify-css]` output, confirm a line for `ares-theme.css`.

- [ ] **Step 9: Commit**

```bash
git add src/theme/ src/clubpm/loadClubPmTheme.js src/clubpm/loadClubPmTheme.test.js public/ares-theme.css scripts/minify-public-css.mjs
git commit -m "refactor(theme): generalize the on-demand stylesheet loader for ARES"
```

---

## Task 3: Routes, page shells, navigation, and registration

**Files:**
- Create: `src/pages/Ares.jsx`, `src/pages/Ares/TheScience.jsx`, `src/pages/Ares/TheHeadset.jsx`
- Modify: `src/App.js`, `src/components/Navbar.jsx`, `src/components/Footer.jsx`
- Modify: `public/sitemap.xml`, `public/search-index.json`, `public/llms.txt`

**Interfaces:**
- Consumes: `lazyWithTheme` from Task 2.
- Produces: three routed pages, each rendering `<div className="ares-page">` as its outermost element — every later task's CSS depends on that class being present.

This task delivers three navigable, styled-but-sparse pages. Content arrives in Tasks 11–12; components in Tasks 4–10.

- [ ] **Step 1: Create the hub shell**

`src/pages/Ares.jsx`. Follow the structure of `src/pages/AstroUSA.jsx` — `SEOHead`, `Navbar`, `SectionProgressRail`, `<main id="main-content">`, sections, `Footer`.

```jsx
import { useEffect } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import SEOHead from '../components/SEOHead';
import SectionProgressRail from '../components/SectionProgressRail';

const ARES_RAIL_SECTIONS = [
  { id: 'ares-problem',  label: 'The Problem' },
  { id: 'ares-gravity',  label: 'Gravity' },
  { id: 'ares-bubble',   label: 'The Bubble' },
  { id: 'ares-why',      label: 'Why It Matters' },
  { id: 'ares-headset',  label: 'The Headset' },
  { id: 'ares-trust',    label: 'Trusting a Number' },
  { id: 'ares-next',     label: 'What’s Next' },
  { id: 'ares-join',     label: 'Join' },
];

const Ares = () => {
  useEffect(() => {
    if (window.AOS) window.AOS.init({ once: true });
  }, []);

  return (
    <div className="ares-page">
      <SEOHead
        title="ARES — Atmospheric Research and Experiment System"
        description="A wearable CO₂ and biophysical sensing headset built to detect the localized zone of rebreathed air that forms in front of the face when buoyancy-driven convection collapses."
        canonical="/ares"
      />
      <Navbar />
      <SectionProgressRail sections={ARES_RAIL_SECTIONS} />

      <main id="main-content" className="ares-hero">
        <div className="container text-center">
          <h1 className="display-2 mb-4">ARES</h1>
          <p className="header-sub-title">
            Atmospheric Research and Experiment System — a wearable sensing headset
            measuring the air a person is actually breathing.
          </p>
        </div>
      </main>

      {ARES_RAIL_SECTIONS.map(({ id, label }) => (
        <section id={id} key={id}>
          <div className="container">
            <div className="title-wrap mb-4" data-aos="fade-up">
              <h2 className="section-title">{label}</h2>
            </div>
          </div>
        </section>
      ))}

      <Footer />
    </div>
  );
};

export default Ares;
```

The placeholder `.map()` over rail sections exists so the rail is wired and testable now; Task 11 replaces it with real sections. **Every `id` in `ARES_RAIL_SECTIONS` must exist in the DOM** or the rail's `IntersectionObserver` silently observes nothing.

- [ ] **Step 2: Create the two deep-dive shells**

`src/pages/Ares/TheScience.jsx` — same skeleton, `canonical="/ares/the-science"`, title `"ARES — The Science"`, rail sections:

```js
const SCIENCE_RAIL_SECTIONS = [
  { id: 'sci-regimes',    label: 'Regimes' },
  { id: 'sci-numbers',    label: 'The Numbers' },
  { id: 'sci-reading',    label: 'Reading a Result' },
  { id: 'sci-rebreath',   label: 'Rebreathed Fraction' },
  { id: 'sci-validation', label: 'Validation' },
];
```

`src/pages/Ares/TheHeadset.jsx` — `canonical="/ares/the-headset"`, title `"ARES — The Headset"`, rail sections:

```js
const HEADSET_RAIL_SECTIONS = [
  { id: 'hs-system',      label: 'The System' },
  { id: 'hs-sensing',     label: 'Sensing CO₂' },
  { id: 'hs-sampling',    label: 'Getting the Air There' },
  { id: 'hs-calibration', label: 'Calibration' },
  { id: 'hs-gallery',     label: 'Hardware' },
];
```

Both import `Navbar`, `Footer`, `SEOHead`, `SectionProgressRail` from `../../components/…` (one level deeper than the hub).

- [ ] **Step 3: Wire the routes in `src/App.js`**

Add the import near the other public lazy routes (after the `AstroUSA` line, ~line 29):

```js
import { lazyWithTheme } from './theme/loadTheme';

const ARES_THEME = ['/ares-theme.css?v=1', 'data-ares-theme'];
const Ares           = lazy(lazyWithTheme(...ARES_THEME)(() => import('./pages/Ares')));
const AresScience    = lazy(lazyWithTheme(...ARES_THEME)(() => import('./pages/Ares/TheScience')));
const AresHeadset    = lazy(lazyWithTheme(...ARES_THEME)(() => import('./pages/Ares/TheHeadset')));
```

Add the routes alongside the other program pages, after the `/astrousa/hydroponics` line (~line 158):

```jsx
<Route path="/ares" element={<PageWrapper><Ares /></PageWrapper>} />
<Route path="/ares/the-science" element={<PageWrapper><AresScience /></PageWrapper>} />
<Route path="/ares/the-headset" element={<PageWrapper><AresHeadset /></PageWrapper>} />
```

- [ ] **Step 4: Add ARES to the navigation**

In `src/components/Navbar.jsx`:

Add `/ares` to `TEAMS_PATHS` (line 14) — **without this the Teams underline indicator never lights on an ARES route**:

```js
const TEAMS_PATHS = ['/research', '/sa2tp', '/software', '/astrousa', '/ares'];
```

Add the dropdown entry after the ASTRO-USA link (~line 145):

```jsx
<Link className="teams-dropdown-item" to="/ares" onClick={handleTeamsLinkClick}>ARES</Link>
```

In `src/components/Footer.jsx`, add an ARES link wherever the other four teams are listed. Grep for `astrousa` to find the block.

- [ ] **Step 5: Register the pages for search and crawlers**

`public/sitemap.xml` — add after the `/astrousa/hydroponics` entry:

```xml
  <url><loc>https://purduesearch.org/ares</loc><lastmod>2026-08-22</lastmod><priority>0.9</priority><changefreq>monthly</changefreq></url>
  <url><loc>https://purduesearch.org/ares/the-science</loc><lastmod>2026-08-22</lastmod><priority>0.7</priority><changefreq>monthly</changefreq></url>
  <url><loc>https://purduesearch.org/ares/the-headset</loc><lastmod>2026-08-22</lastmod><priority>0.7</priority><changefreq>monthly</changefreq></url>
```

`public/search-index.json` — add three entries matching the existing shape:

```json
  {
    "title": "ARES",
    "path": "/ares",
    "section": "Teams",
    "excerpt": "A wearable CO₂ and biophysical sensing headset. On Earth a rising plume of body-warmed air continuously clears exhaled breath away from your face; when that convection collapses, the CO₂ stays where it was produced. ARES measures it.",
    "tags": ["ares", "co2", "carbon dioxide", "sensor", "wearable", "headset", "bioastronautics", "hypercapnia", "plume", "microgravity", "rebreathing"]
  },
  {
    "title": "ARES — The Science",
    "path": "/ares/the-science",
    "section": "Teams",
    "excerpt": "Buoyancy, diffusion, and the dimensionless numbers that decide which one moves a gas. How to read a simulation result, and what the rebreathed fraction actually assumes.",
    "tags": ["ares", "physics", "buoyancy", "grashof", "rayleigh", "peclet", "reynolds", "cfd", "diffusion", "convection", "schlieren"]
  },
  {
    "title": "ARES — The Headset",
    "path": "/ares/the-headset",
    "section": "Teams",
    "excerpt": "Three sensor pods, an infrared absorption measurement, and the difference between how long air takes to reach a sensor and how long the sensor takes to respond.",
    "tags": ["ares", "hardware", "ndir", "infrared", "anemometry", "calibration", "sensor pods", "transport delay"]
  }
```

`public/llms.txt` — add the three routes to the site outline, following the file's existing format.

- [ ] **Step 6: Verify the routes render**

```bash
npm run build
npm start
```

Visit `/ares`, `/ares/the-science`, `/ares/the-headset`. Confirm:
- Each page renders with the navbar and footer, no console errors.
- The Teams dropdown shows ARES and its underline lights on all three routes.
- DevTools Network shows `ares-theme.css` fetched on the first ARES route and **not** fetched on `/` or `/blog`.
- DevTools Elements shows `class="ares-page"` on the page's outermost div.

- [ ] **Step 7: Commit**

```bash
git add src/pages/Ares.jsx src/pages/Ares/ src/App.js src/components/Navbar.jsx src/components/Footer.jsx public/sitemap.xml public/search-index.json public/llms.txt
git commit -m "feat(ares): routes, page shells, navigation, and search registration"
```

---

## Task 4: Shared primitives — `AresStat` and `AresTerm`

**Files:**
- Create: `src/components/ares/AresStat.jsx`, `src/components/ares/AresTerm.jsx`
- Create: `src/components/ares/AresTerm.test.jsx`
- Modify: `public/ares-theme.css` (append)

**Interfaces:**
- Consumes: `GLOSSARY_TERMS` from `aresPhysics.js` (Task 1).
- Produces:
  - `<AresStat value={number|string} unit={string} label={string} source={string} decimals={number=0} />`
  - `<AresTerm term={string}>{children}</AresTerm>` — `term` must be a key of `GLOSSARY_TERMS`.

- [ ] **Step 1: Write the failing test**

Create `src/components/ares/AresTerm.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react';
import AresTerm from './AresTerm';

describe('AresTerm', () => {
  test('renders its children and exposes the definition', () => {
    render(<AresTerm term="HTBP">HTBP</AresTerm>);
    const el = screen.getByText('HTBP');
    expect(el).toHaveAttribute('data-tip', expect.stringContaining('Human thermal body plume'));
  });

  test('is focusable, so the definition is reachable without a mouse', () => {
    render(<AresTerm term="NDIR">NDIR</AresTerm>);
    expect(screen.getByText('NDIR')).toHaveAttribute('tabindex', '0');
  });

  test('renders children unchanged when the term is unknown', () => {
    render(<AresTerm term="NOT_A_TERM">fallback text</AresTerm>);
    expect(screen.getByText('fallback text')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npm test -- --watchAll=false src/components/ares/AresTerm.test.jsx
```

Expected: FAIL — `Cannot find module './AresTerm'`.

- [ ] **Step 3: Implement `AresTerm.jsx`**

```jsx
import { GLOSSARY_TERMS } from './aresPhysics';

/**
 * Inline glossary tooltip. Reuses the site's existing .abbr-tip / data-tip
 * idiom (see search-theme.css and the ASTRO-USA bioreactor prose) so ARES
 * matches the rest of the public site rather than inventing a second pattern.
 *
 * Definitions come from one map in aresPhysics.js, which is what a binding
 * glossary is for — one definition per term, not one per page that mentions it.
 *
 * tabIndex is not optional: a hover-only tooltip is invisible to keyboard and
 * touch users, and these terms are load-bearing for the prose around them.
 */
export default function AresTerm({ term, children }) {
  const definition = GLOSSARY_TERMS[term];
  if (!definition) return <>{children}</>;

  return (
    <span className="abbr-tip ares-term" data-tip={definition} tabIndex={0}>
      {children}
    </span>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- --watchAll=false src/components/ares/AresTerm.test.jsx
```

Expected: PASS.

- [ ] **Step 5: Implement `AresStat.jsx`**

```jsx
import { useEffect, useRef, useState } from 'react';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Instrument-panel stat tile. Counts up when scrolled into view, and exposes
 * where its number came from.
 *
 * Sourcing every number is the GLOSSARY §7 house rule carried onto the public
 * site: the ARES hardware changes weekly, so a figure whose origin nobody can
 * name is one nobody will dare to update.
 */
export default function AresStat({ value, unit, label, source, decimals = 0 }) {
  const numeric = typeof value === 'number';
  const [shown, setShown] = useState(numeric ? 0 : value);
  const ref = useRef(null);

  useEffect(() => {
    if (!numeric) return undefined;
    if (prefersReducedMotion()) {
      setShown(value);
      return undefined;
    }

    const el = ref.current;
    if (!el) return undefined;

    let raf = null;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      const start = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - start) / 900);
        // ease-out cubic
        setShown(value * (1 - Math.pow(1 - t, 3)));
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.4 });

    observer.observe(el);
    return () => {
      observer.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [numeric, value]);

  const display = numeric
    ? Number(shown).toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })
    : shown;

  return (
    <div className="ares-stat" ref={ref}>
      <div className="ares-stat-value">
        {display}
        {unit && <span className="ares-stat-unit">{unit}</span>}
      </div>
      <div className="ares-stat-label">{label}</div>
      {source && (
        <div className="ares-stat-source" title={source}>
          <i className="fas fa-book" aria-hidden="true" />
          <span className="ares-stat-source-text">{source}</span>
        </div>
      )}
    </div>
  );
}
```

Note `toLocaleString('en-US')` — it produces the thousands comma the house style requires (`1,850 ppm`).

- [ ] **Step 6: Append styles to `public/ares-theme.css`**

Every selector scoped under `.ares-page`. Include a `.ares-stat-value` rule using `var(--ares-mono)`, a `.ares-stat-source-text` that is visually hidden until hover/focus, and a `.ares-term` rule that inherits the existing `.abbr-tip` behaviour with a focus outline.

- [ ] **Step 7: Verify the build**

```bash
npm run build
npm test -- --watchAll=false src/components/ares/
```

Expected: build passes; ARES tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/components/ares/AresStat.jsx src/components/ares/AresTerm.jsx src/components/ares/AresTerm.test.jsx public/ares-theme.css
git commit -m "feat(ares): sourced stat tile and glossary tooltip primitives"
```

---

## Task 5: ★ PlumeSimulator — the gravity slider

**Files:**
- Create: `src/lib/ares/plumeModel.js`, `src/lib/ares/plumeModel.test.js`
- Create: `src/components/ares/PlumeSimulator.jsx`
- Modify: `public/ares-theme.css` (append)

**Interfaces:**
- Consumes: `grashof`, `rayleigh`, `GRAVITY`, `airPropertiesAt` from `aresPhysics.js`.
- Produces:
  - `createParticles(count, rng?) => Particle[]` where `Particle = { x, y, vx, vy, co2, age }`
  - `stepParticles(particles, { g, dt, width, height, sourceX, sourceY, rng? }) => Particle[]`
  - `regimeFor({ g }) => { gr, ra, verdict }` where `verdict` is `'buoyancy-dominated' | 'mixed' | 'diffusion-dominated'`
  - Component `<PlumeSimulator />`

Read `docs/courses/ares-101/content/C13-the-plume-and-the-bubble.md` first — it describes the flow the sim must reproduce qualitatively.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/ares/plumeModel.test.js`:

```js
import { createParticles, stepParticles, regimeFor } from './plumeModel';
import { GRAVITY } from '../../components/ares/aresPhysics';

/**
 * A seeded rng, so the diffusion term is deterministic under test. Without
 * this the "no net drift in orbit" assertion is a coin flip at about three
 * sigma — it passes most runs and fails occasionally in CI, which is worse
 * than failing outright.
 */
function seededRng(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const bounds = {
  dt: 0.05, width: 400, height: 500, sourceX: 200, sourceY: 380,
  rng: seededRng(),
};

describe('createParticles', () => {
  test('creates the requested count with the expected shape', () => {
    const ps = createParticles(50);
    expect(ps).toHaveLength(50);
    for (const p of ps) {
      expect(typeof p.x).toBe('number');
      expect(typeof p.y).toBe('number');
      expect(typeof p.co2).toBe('number');
    }
  });

  test('is deterministic when given a seeded rng', () => {
    const seeded = () => 0.5;
    expect(createParticles(5, seeded)).toEqual(createParticles(5, seeded));
  });
});

describe('stepParticles', () => {
  test('at 1 g the field acquires net upward motion', () => {
    let ps = createParticles(200, () => 0.5);
    for (let i = 0; i < 40; i += 1) ps = stepParticles(ps, { ...bounds, g: GRAVITY.earth });
    const meanVy = ps.reduce((s, p) => s + p.vy, 0) / ps.length;
    // Canvas y grows downward, so rising is negative vy.
    expect(meanVy).toBeLessThan(0);
  });

  test('in orbit there is no net vertical drift', () => {
    let ps = createParticles(200, () => 0.5);
    for (let i = 0; i < 40; i += 1) ps = stepParticles(ps, { ...bounds, g: GRAVITY.orbit });
    const meanVy = ps.reduce((s, p) => s + p.vy, 0) / ps.length;
    expect(Math.abs(meanVy)).toBeLessThan(0.05);
  });

  test('Mars sits between Earth and orbit', () => {
    const drift = (g) => {
      let ps = createParticles(200, () => 0.5);
      for (let i = 0; i < 40; i += 1) ps = stepParticles(ps, { ...bounds, g });
      return Math.abs(ps.reduce((s, p) => s + p.vy, 0) / ps.length);
    };
    const earth = drift(GRAVITY.earth);
    const mars = drift(GRAVITY.mars);
    const orbit = drift(GRAVITY.orbit);
    expect(mars).toBeLessThan(earth);
    expect(mars).toBeGreaterThan(orbit);
  });

  test('CO2 accumulates near the source in orbit and clears at 1 g', () => {
    const nearSource = (g) => {
      let ps = createParticles(300, () => 0.5);
      for (let i = 0; i < 80; i += 1) ps = stepParticles(ps, { ...bounds, g });
      return ps
        .filter(p => Math.hypot(p.x - bounds.sourceX, p.y - bounds.sourceY) < 60)
        .reduce((s, p) => s + p.co2, 0);
    };
    expect(nearSource(GRAVITY.orbit)).toBeGreaterThan(nearSource(GRAVITY.earth));
  });

  test('particles stay inside the bounds', () => {
    let ps = createParticles(100, () => 0.5);
    for (let i = 0; i < 100; i += 1) ps = stepParticles(ps, { ...bounds, g: GRAVITY.earth });
    for (const p of ps) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(bounds.width);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(bounds.height);
    }
  });

  test('does not mutate its input', () => {
    const ps = createParticles(10, () => 0.5);
    const snapshot = JSON.parse(JSON.stringify(ps));
    stepParticles(ps, { ...bounds, g: GRAVITY.earth });
    expect(ps).toEqual(snapshot);
  });
});

describe('regimeFor', () => {
  test('1 g is buoyancy-dominated', () => {
    expect(regimeFor({ g: GRAVITY.earth }).verdict).toBe('buoyancy-dominated');
  });

  test('orbit is diffusion-dominated with Gr of zero', () => {
    const r = regimeFor({ g: GRAVITY.orbit });
    expect(r.gr).toBe(0);
    expect(r.verdict).toBe('diffusion-dominated');
  });

  test('Grashof falls monotonically as gravity falls', () => {
    expect(regimeFor({ g: GRAVITY.earth }).gr)
      .toBeGreaterThan(regimeFor({ g: GRAVITY.mars }).gr);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test -- --watchAll=false src/lib/ares/plumeModel.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/ares/plumeModel.js`**

```js
/**
 * Particle model behind PlumeSimulator.
 *
 * THIS IS NOT A CFD SOLVE, and the component must say so on screen. It is a
 * visually-tuned advection-plus-diffusion model whose *regime* tracks the real
 * dimensionless numbers from aresPhysics.js. Presenting a tuned animation as a
 * simulation result is exactly the habit the course teaches against, so the
 * caption carries the word "illustrative" and the numbers beside it are real.
 *
 * Coordinates are canvas coordinates: y grows DOWNWARD, so rising air has
 * negative vy.
 */
import { grashof, rayleigh, GRAVITY } from '../../components/ares/aresPhysics';

/** Film temperature for a ~33 °C skin surface in a ~22 °C room. GLOSSARY §3. */
const T_FILM_K = 300;
const DELTA_T = 11;
/** Body height as the characteristic length. C13; GLOSSARY §3 requires stating it. */
const L_BODY = 1.7;

const BUOYANCY_GAIN = 0.9;
const DIFFUSION_GAIN = 6;
const DRAG = 0.96;
const CO2_DECAY = 0.995;

export function createParticles(count, rng = Math.random) {
  const particles = [];
  for (let i = 0; i < count; i += 1) {
    particles.push({
      x: rng() * 400,
      y: rng() * 500,
      vx: (rng() - 0.5) * 2,
      vy: (rng() - 0.5) * 2,
      co2: 0,
      age: rng() * 100,
    });
  }
  return particles;
}

/**
 * Advance one step. Returns a NEW array — the component holds particles in a
 * ref and re-renders nothing per frame, but purity keeps this testable.
 */
export function stepParticles(
  particles,
  { g, dt, width, height, sourceX, sourceY, rng = Math.random },
) {
  // Normalized buoyancy: 1 at Earth, 0 in orbit.
  const buoyancy = (g / GRAVITY.earth) * BUOYANCY_GAIN;

  return particles.map((p) => {
    const dxs = p.x - sourceX;
    const dys = p.y - sourceY;
    const distance = Math.hypot(dxs, dys) || 1;

    // Emission: particles close to the mouth pick up CO2.
    let co2 = p.co2 * CO2_DECAY;
    if (distance < 40) co2 = Math.min(1, co2 + 0.05);

    // Buoyant acceleration, strongest where the air is warm (near the body).
    const warmth = Math.exp(-distance / 220);
    let vy = p.vy - buoyancy * warmth * dt * 60;

    // Diffusion: the only transport left when buoyancy is gone. rng is
    // injectable so the model is deterministic under test.
    const wander = DIFFUSION_GAIN * dt;
    let vx = p.vx + (rng() - 0.5) * wander;
    vy += (rng() - 0.5) * wander;

    vx *= DRAG;
    vy *= DRAG;

    let x = p.x + vx;
    let y = p.y + vy;

    // Recycle a particle that leaves the frame back to the bottom, so the
    // field stays populated without growing the array.
    if (y < 0) { y = height; co2 = 0; }
    if (y > height) y = height;
    if (x < 0) x = 0;
    if (x > width) x = width;

    return { x, y, vx, vy, co2, age: p.age + 1 };
  });
}

/**
 * The real dimensionless numbers at this gravity, plus a plain-English verdict.
 * These are the figures shown beside the animation, and they are not tuned.
 */
export function regimeFor({ g }) {
  const args = { dT: DELTA_T, L: L_BODY, tFilmK: T_FILM_K, g };
  const gr = grashof(args);
  const ra = rayleigh(args);

  let verdict;
  if (gr >= 1e8) verdict = 'buoyancy-dominated';
  else if (gr >= 1e6) verdict = 'mixed';
  else verdict = 'diffusion-dominated';

  return { gr, ra, verdict, L: L_BODY, dT: DELTA_T };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test -- --watchAll=false src/lib/ares/plumeModel.test.js
```

Expected: PASS.

Run this file **three times** before moving on. The diffusion term is stochastic, and the tests pass a seeded `rng` precisely so it is not — if results vary between runs, an unseeded `Math.random()` has leaked into `stepParticles`. Fix the leak; do not loosen a threshold.

- [ ] **Step 5: Implement `PlumeSimulator.jsx`**

Structure, with the required scaffolding spelled out:

```jsx
import { useEffect, useRef, useState } from 'react';
import { createParticles, stepParticles, regimeFor } from '../../lib/ares/plumeModel';
import { GRAVITY } from './aresPhysics';

const WIDTH = 400;
const HEIGHT = 500;
const SOURCE = { x: 200, y: 380 };
const COUNT = 320;

const reduceMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function PlumeSimulator() {
  const [g, setG] = useState(GRAVITY.earth);
  const canvasRef = useRef(null);
  const particlesRef = useRef(createParticles(COUNT));
  const gRef = useRef(g);
  gRef.current = g;

  const regime = regimeFor({ g });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');

    if (reduceMotion()) {
      // Draw one settled frame and stop. No loop at all.
      drawFrame(ctx, particlesRef.current);
      return undefined;
    }

    let raf = null;
    let running = false;

    const loop = () => {
      // No rng passed — the live component wants real randomness. Only the
      // tests seed it.
      particlesRef.current = stepParticles(particlesRef.current, {
        g: gRef.current, dt: 1 / 60,
        width: WIDTH, height: HEIGHT,
        sourceX: SOURCE.x, sourceY: SOURCE.y,
      });
      drawFrame(ctx, particlesRef.current);
      raf = requestAnimationFrame(loop);
    };

    // Offscreen pause: a particle sim in a background tab is a battery bug.
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !running) {
        running = true;
        raf = requestAnimationFrame(loop);
      } else if (!entry.isIntersecting && running) {
        running = false;
        if (raf) cancelAnimationFrame(raf);
      }
    }, { threshold: 0.1 });

    observer.observe(canvas);

    return () => {
      observer.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // … render: canvas, head silhouette SVG overlay, slider, readout
}
```

`drawFrame(ctx, particles)` is a module-level function: clear, draw the head silhouette, then draw each particle as a dot whose alpha comes from `p.co2` and whose colour ramps from `--ares-conc-0` toward `--ares-conc-2`. Read the ramp colours as literals in the module — a canvas cannot read CSS custom properties.

The render must include:

```jsx
<label className="ares-slider-label" htmlFor="ares-gravity">
  Gravity
</label>
<input
  id="ares-gravity"
  type="range"
  min="0" max="9.81" step="0.01"
  value={g}
  onChange={(e) => setG(Number(e.target.value))}
  aria-describedby="ares-gravity-readout"
/>
<div className="ares-slider-ticks" aria-hidden="true">
  <span>Orbit</span><span>Mars</span><span>Earth</span>
</div>

<div id="ares-gravity-readout" className="ares-readout" aria-live="polite">
  <p>
    {g.toFixed(2)} m/s². Grashof {regime.gr.toExponential(1)}, Rayleigh{' '}
    {regime.ra.toExponential(1)} — {regime.verdict}.
  </p>
</div>

<p className="ares-caption">
  Illustrative particle model, not a CFD result. The Grashof and Rayleigh
  numbers beside it are computed for a 1.7 m characteristic length and an
  11 K surface-to-air difference.
</p>
```

The caption is required. So is naming `L` — GLOSSARY §3 says a number quoted without its `L` is meaningless.

- [ ] **Step 6: Add the static fallback**

Under `prefers-reduced-motion` the canvas draws one settled frame. Additionally render a `.ares-plume-fallback` block — three labelled static states (1 g / 0.38 g / 0 g) with their Grashof numbers and verdicts as text — shown by CSS when the viewport is too narrow for the canvas, mirroring the `loop-ring-fallback` pattern in `AstroUSA.jsx`.

- [ ] **Step 7: Append styles and verify**

```bash
npm run build
npm test -- --watchAll=false src/lib/ares/
```

Then `npm start`, open `/ares`, and check: the slider moves, the plume visibly stops rising near zero, CO₂ visibly pools at the face, the readout text updates, and scrolling the canvas out of view stops the loop (watch CPU in DevTools Performance).

- [ ] **Step 8: Commit**

```bash
git add src/lib/ares/plumeModel.js src/lib/ares/plumeModel.test.js src/components/ares/PlumeSimulator.jsx public/ares-theme.css
git commit -m "feat(ares): plume simulator with gravity slider and live regime readout"
```

---

## Task 6: ★ PodReadout — three pods and the rebreathed fraction

**Files:**
- Create: `src/lib/ares/breathModel.js`, `src/lib/ares/breathModel.test.js`
- Create: `src/components/ares/PodReadout.jsx`
- Modify: `public/ares-theme.css` (append)

**Interfaces:**
- Consumes: `rebreathedFraction` from `aresPhysics.js`.
- Produces:
  - `POD_POSITIONS` — `[{ id: 'top', label: 'Top', role, purpose }, { id: 'forehead', … }, { id: 'chin', … }]`
  - `breathTrace({ samples, contaminatedTop }) => { t: number[], chin: number[], top: number[], forehead: number[] }`
  - `sampleAt(trace, index) => { chin, top, forehead, fRb }`
  - Component `<PodReadout />`

Read `content/C13-the-plume-and-the-bubble.md` § "Current state: three pods" before starting. **Pods are named by position, never by index** — `GLOSSARY.md` §1 says firmware indices and physical positions are not guaranteed to correspond.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/ares/breathModel.test.js`:

```js
import { POD_POSITIONS, breathTrace, sampleAt } from './breathModel';

describe('POD_POSITIONS', () => {
  test('names the three pods by position, never by index', () => {
    expect(POD_POSITIONS.map(p => p.id)).toEqual(['top', 'forehead', 'chin']);
    for (const pod of POD_POSITIONS) {
      expect(pod.label).not.toMatch(/\d/);
      expect(typeof pod.purpose).toBe('string');
    }
  });

  test('the top pod is described as a reference and the chin as the signal', () => {
    expect(POD_POSITIONS.find(p => p.id === 'top').role).toBe('reference');
    expect(POD_POSITIONS.find(p => p.id === 'chin').role).toBe('signal');
  });
});

describe('breathTrace', () => {
  test('returns one value per sample on every channel', () => {
    const trace = breathTrace({ samples: 120, contaminatedTop: false });
    expect(trace.t).toHaveLength(120);
    expect(trace.chin).toHaveLength(120);
    expect(trace.top).toHaveLength(120);
    expect(trace.forehead).toHaveLength(120);
  });

  test('the chin swings far more than the top reference', () => {
    const { chin, top } = breathTrace({ samples: 240, contaminatedTop: false });
    const swing = (a) => Math.max(...a) - Math.min(...a);
    expect(swing(chin)).toBeGreaterThan(swing(top) * 3);
  });

  test('an honest top reference sits near outdoor ambient', () => {
    const { top } = breathTrace({ samples: 240, contaminatedTop: false });
    const mean = top.reduce((s, v) => s + v, 0) / top.length;
    expect(mean).toBeGreaterThan(380);
    expect(mean).toBeLessThan(650);
  });

  test('a top pod standing in the plume reads higher', () => {
    const honest = breathTrace({ samples: 240, contaminatedTop: false });
    const inPlume = breathTrace({ samples: 240, contaminatedTop: true });
    const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
    expect(mean(inPlume.top)).toBeGreaterThan(mean(honest.top));
  });
});

describe('sampleAt', () => {
  test('computes the rebreathed fraction at an index', () => {
    const trace = breathTrace({ samples: 240, contaminatedTop: false });
    const s = sampleAt(trace, 100);
    expect(s.fRb).toBeCloseTo((s.chin - s.top) / (40000 - s.top), 6);
  });

  test('a contaminated reference biases the fraction LOW, not merely noisy', () => {
    // C13: "a clean, stable, confidently wrong number", biased low. This is the
    // single most important assertion in the ARES front end.
    const honest = breathTrace({ samples: 240, contaminatedTop: false });
    const inPlume = breathTrace({ samples: 240, contaminatedTop: true });
    const meanF = (trace) => {
      let total = 0;
      for (let i = 0; i < trace.t.length; i += 1) total += sampleAt(trace, i).fRb;
      return total / trace.t.length;
    };
    expect(meanF(inPlume)).toBeLessThan(meanF(honest));
  });

  test('clamps an out-of-range index rather than returning undefined', () => {
    const trace = breathTrace({ samples: 60, contaminatedTop: false });
    expect(sampleAt(trace, 999).chin).toBe(trace.chin[59]);
    expect(sampleAt(trace, -5).chin).toBe(trace.chin[0]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test -- --watchAll=false src/lib/ares/breathModel.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/ares/breathModel.js`**

```js
/**
 * Breath-cycle traces behind PodReadout.
 *
 * Illustrative waveforms at physiologically plausible magnitudes, NOT recorded
 * ARES data. The component says so on screen.
 *
 * Pods are named by position — top, forehead, chin — and never by index.
 * GLOSSARY §1: the firmware indices and the physical positions are not
 * guaranteed to correspond.
 */
import { rebreathedFraction } from '../../components/ares/aresPhysics';

/** A full exhaled breath, ppm. Used as C_exhaled in the mixing model. */
export const EXHALED_PPM = 40000;

const AMBIENT_PPM = 420;
/** How much a top pod standing in the rising plume over-reads. C13. */
const PLUME_CONTAMINATION_PPM = 520;
const BREATH_PERIOD_SAMPLES = 60;

export const POD_POSITIONS = [
  {
    id: 'top',
    label: 'Top',
    role: 'reference',
    where: 'Above the crown',
    purpose: 'The reference — what the air would read if none of it had been breathed before. Chin minus top is the rebreathing measurement, and neither number means anything without the other.',
  },
  {
    id: 'forehead',
    label: 'Forehead',
    role: 'thermal',
    where: 'At the brow',
    purpose: 'Humidity and thermal load. The same collapse that traps CO₂ also traps heat and water vapour, and sweat onset is read off forehead humidity.',
  },
  {
    id: 'chin',
    label: 'Chin',
    role: 'signal',
    where: 'Below the jaw, in the breathing zone',
    purpose: 'The signal. This is where exhaled breath is, and where the CO₂ bubble forms.',
  },
];

/**
 * Deterministic pseudo-noise, so the traces are stable across renders and
 * across test runs without threading an rng through every caller.
 */
const wobble = (i, seed) => Math.sin(i * 0.7 + seed) * Math.cos(i * 0.31 + seed * 2);

export function breathTrace({ samples = 240, contaminatedTop = false } = {}) {
  const t = [];
  const chin = [];
  const top = [];
  const forehead = [];

  for (let i = 0; i < samples; i += 1) {
    const phase = (i % BREATH_PERIOD_SAMPLES) / BREATH_PERIOD_SAMPLES;

    // Exhalation is a fast, short-lived event, not a sine wave. Sharp rise,
    // slower decay — which is why the chin trace looks nothing like the top.
    const exhale = phase < 0.35
      ? Math.sin((phase / 0.35) * Math.PI) ** 2
      : 0.18 * Math.exp(-(phase - 0.35) * 6);

    t.push(i);
    chin.push(AMBIENT_PPM + exhale * 1800 + wobble(i, 1) * 25);
    top.push(
      AMBIENT_PPM
      + (contaminatedTop ? PLUME_CONTAMINATION_PPM : 0)
      + wobble(i, 5) * 18,
    );
    forehead.push(AMBIENT_PPM + exhale * 260 + wobble(i, 9) * 20);
  }

  return { t, chin, top, forehead };
}

export function sampleAt(trace, index) {
  const last = trace.t.length - 1;
  const i = Math.max(0, Math.min(last, index));
  const chin = trace.chin[i];
  const top = trace.top[i];
  return {
    index: i,
    chin,
    top,
    forehead: trace.forehead[i],
    fRb: rebreathedFraction({ chin, top, exhaled: EXHALED_PPM }),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test -- --watchAll=false src/lib/ares/breathModel.test.js
```

Expected: PASS.

- [ ] **Step 5: Implement `PodReadout.jsx`**

Required elements:

1. **An SVG head profile** with three pod markers positioned at crown, brow, and below the jaw. Each marker is a `<button>` (focusable, keyboard-activatable) that selects the pod and reveals its `where` and `purpose` from `POD_POSITIONS`.
2. **Three synchronized traces** drawn as SVG polylines using `--ares-trace-chin` / `-top` / `-fore`, with a vertical scrub cursor.
3. **A scrub control** — `<input type="range" min="0" max={samples-1}>` labelled "Breath cycle".
4. **A live readout** in `aria-live="polite"` naming all three pods and the current `f_rb` as a percentage.
5. **The contaminated-reference toggle** — a `<button aria-pressed>` labelled "Put the top pod in the plume". This is the interaction the clearance review was for; it must be prominent, not buried.
6. **The three caveats**, always visible beside the formula, from `GLOSSARY.md` §2: two-compartment mixing model; `C_top` is a reference, not a datum; it is a difference, so it inherits both sensors' errors.
7. **A caption** naming the finding:

```jsx
<p className="ares-caption">
  On the current headset the top pod sits at the crown — the top of a plume
  that has spent 1.7 m gathering everything it swept off the body. A reference
  standing in the exhaust does not add noise. It produces a clean, stable,
  confidently wrong number, biased low. The next revision moves it behind the
  crown. Illustrative waveforms, not recorded data.
</p>
```

Percentages render as `{(fRb * 100).toFixed(1)} %`.

- [ ] **Step 6: Append styles, then verify**

```bash
npm run build
npm test -- --watchAll=false src/lib/ares/
```

`npm start`, open `/ares`: scrub the breath cycle and watch chin spike while top stays flat; toggle the contamination and confirm `f_rb` visibly *falls*; tab to each pod marker and confirm focus is visible and Enter selects.

- [ ] **Step 7: Commit**

```bash
git add src/lib/ares/breathModel.js src/lib/ares/breathModel.test.js src/components/ares/PodReadout.jsx public/ares-theme.css
git commit -m "feat(ares): three-pod readout with live rebreathed fraction"
```

---

## Task 7: ★ ExposureDial

**Files:**
- Create: `src/lib/ares/exposureModel.js`, `src/lib/ares/exposureModel.test.js`
- Create: `src/components/ares/ExposureDial.jsx`
- Modify: `public/ares-theme.css` (append)

**Interfaces:**
- Consumes: `CO2_TIERS`, `tierFor`, `ppmToMmHg`, `dosePpmHours`, `STANDARD_PRESSURE_HPA` from `aresPhysics.js`.
- Produces: `describeExposure({ ppm, hours, pressureHpa }) => { ppm, mmHg, percent, tier, dose, summary }` and `<ExposureDial />`.

`summary` is the string the `aria-live` region announces, so it is tested rather than left to the component.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/ares/exposureModel.test.js`:

```js
import { describeExposure } from './exposureModel';

describe('describeExposure', () => {
  test('reports the same reading in all three units', () => {
    const r = describeExposure({ ppm: 5000, hours: 1 });
    expect(r.ppm).toBe(5000);
    expect(r.mmHg).toBeCloseTo(3.8, 1);
    expect(r.percent).toBeCloseTo(0.5, 3);
  });

  test('identifies the NASA 2010 operational limit band', () => {
    expect(describeExposure({ ppm: 5350, hours: 1 }).tier.label).toMatch(/NASA/);
  });

  test('outdoor ambient is the bottom band', () => {
    expect(describeExposure({ ppm: 420, hours: 1 }).tier.label).toMatch(/Outdoor ambient/);
  });

  test('equal doses from different exposures are equal', () => {
    // GLOSSARY §2 — the same dose is not the same exposure, which is why the
    // summary must carry the averaging interval.
    expect(describeExposure({ ppm: 5000, hours: 1 }).dose)
      .toBe(describeExposure({ ppm: 1000, hours: 5 }).dose);
  });

  test('the summary states the interval, not just the dose', () => {
    const r = describeExposure({ ppm: 1000, hours: 5 });
    expect(r.summary).toMatch(/5,000 ppm·hours/);
    expect(r.summary).toMatch(/5 hours/);
  });

  test('the summary uses thousands commas', () => {
    expect(describeExposure({ ppm: 1850, hours: 1 }).summary).toMatch(/1,850 ppm/);
  });

  test('pressure changes the partial pressure but not the ppm', () => {
    const sea = describeExposure({ ppm: 5000, hours: 1 });
    const altitude = describeExposure({ ppm: 5000, hours: 1, pressureHpa: 950 });
    expect(altitude.ppm).toBe(sea.ppm);
    expect(altitude.mmHg).toBeLessThan(sea.mmHg);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test -- --watchAll=false src/lib/ares/exposureModel.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/ares/exposureModel.js`**

```js
/**
 * Exposure description behind ExposureDial.
 *
 * The unit convention is GLOSSARY §5 and is not negotiable: ppm in prose,
 * mmHg only alongside a NASA limit, % only when quoting a published range.
 * All three are shown here because the whole point of the component is that
 * the same reading gets quoted three ways in the sources.
 */
import {
  tierFor, ppmToMmHg, dosePpmHours, STANDARD_PRESSURE_HPA,
} from '../../components/ares/aresPhysics';

const comma = (n, decimals = 0) =>
  Number(n).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

export function describeExposure({ ppm, hours, pressureHpa = STANDARD_PRESSURE_HPA }) {
  const mmHg = ppmToMmHg(ppm, pressureHpa);
  const percent = ppm / 10000;
  const tier = tierFor(ppm);
  const dose = dosePpmHours(ppm, hours);

  // GLOSSARY §2 requires the averaging interval to travel with the dose:
  // 5,000 ppm for one hour and 1,000 ppm for five hours are the same dose and
  // are not the same exposure.
  const summary =
    `${comma(ppm)} ppm — ${tier.label}. ` +
    `That is ${mmHg.toFixed(2)} mmHg partial pressure, or ${percent.toFixed(2)} %. ` +
    `Over ${comma(hours, hours % 1 ? 1 : 0)} hours the cumulative dose is ` +
    `${comma(dose)} ppm·hours.`;

  return { ppm, mmHg, percent, tier, dose, summary };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test -- --watchAll=false src/lib/ares/exposureModel.test.js
```

Expected: PASS.

- [ ] **Step 5: Implement `ExposureDial.jsx`**

Required elements:

1. **A concentration slider**, 400 → 10,000 ppm, step 50, labelled "Concentration".
2. **A session-length slider**, 0.5 → 8 hours, step 0.5, labelled "Session length".
3. **A tier track** rendering every entry in `CO2_TIERS` as a marked band, each with a **text label as well as a colour** — colour is never the only channel.
4. **Three unit readouts** — ppm, mmHg, % — in `var(--ares-mono)`.
5. **A dose readout** in ppm·hours, always with the interval.
6. **An `aria-live="polite"` region** rendering `describeExposure(...).summary` verbatim.
7. **The argument, in prose**, which is the reason the component exists:

```jsx
<p className="ares-caption">
  A spacecraft's environmental control system measures the cabin. ARES measures
  the 20 cm in front of a face. A cabin within limits is not a face within
  limits, and the difference is the whole project.
</p>
```

Optionally expose the pressure input as an "at altitude" toggle (1013 hPa / 950 hPa) with a one-line note that an NDIR sensor tracks partial pressure, so an uncorrected reading drifts with ambient pressure even when the mole fraction has not changed.

- [ ] **Step 6: Append styles and verify**

```bash
npm run build
npm test -- --watchAll=false src/lib/ares/
```

`npm start`, open `/ares`. Drag both sliders with the keyboard only. Confirm the tier label changes at 5,300 ppm and reads as the NASA 2010 limit.

- [ ] **Step 7: Commit**

```bash
git add src/lib/ares/exposureModel.js src/lib/ares/exposureModel.test.js src/components/ares/ExposureDial.jsx public/ares-theme.css
git commit -m "feat(ares): exposure dial with tier bands, unit conversion, and dose"
```

---

## Task 8: ★ DelayVsT90

**Files:**
- Create: `src/lib/ares/stepResponseModel.js`, `src/lib/ares/stepResponseModel.test.js`
- Create: `src/components/ares/DelayVsT90.jsx`
- Modify: `public/ares-theme.css` (append)

**Interfaces:**
- Consumes: nothing from `aresPhysics.js`.
- Produces: `transportDelay({ tubeLengthM, tubeIdMm, flowLpm }) => seconds`, `stepResponse({ tubeLengthM, tubeIdMm, flowLpm, t90Seconds, duration, samples }) => { t: number[], value: number[], tDelay, tFiftyCrossing, tNinety }`, and `<DelayVsT90 />`.

**Clearance, and it is the whole point of this task's framing:** ARES pump and flow figures were reviewed and **declined** (spec §1.3). Defaults here are generic and the component captions them "Illustrative values — not ARES hardware figures." **A later task must not substitute the real numbers.**

- [ ] **Step 1: Write the failing tests**

Create `src/lib/ares/stepResponseModel.test.js`:

```js
import { transportDelay, stepResponse } from './stepResponseModel';

const generic = { tubeLengthM: 1.0, tubeIdMm: 4, flowLpm: 1.0 };

describe('transportDelay', () => {
  test('is tube volume over volumetric flow rate', () => {
    // V = pi * r^2 * L; r = 2 mm = 0.002 m, L = 1 m -> 1.2566e-5 m^3 = 12.566 mL
    // Q = 1 L/min = 16.667 mL/s -> t_d = 0.754 s
    expect(transportDelay(generic)).toBeCloseTo(0.754, 2);
  });

  test('doubling the tube length doubles the delay', () => {
    expect(transportDelay({ ...generic, tubeLengthM: 2 }))
      .toBeCloseTo(transportDelay(generic) * 2, 4);
  });

  test('doubling the flow rate halves the delay', () => {
    expect(transportDelay({ ...generic, flowLpm: 2 }))
      .toBeCloseTo(transportDelay(generic) / 2, 4);
  });

  test('bore enters as the square of the radius', () => {
    expect(transportDelay({ ...generic, tubeIdMm: 8 }))
      .toBeCloseTo(transportDelay(generic) * 4, 4);
  });

  test('zero flow is guarded rather than returning Infinity', () => {
    expect(transportDelay({ ...generic, flowLpm: 0 })).toBeNull();
  });
});

describe('stepResponse', () => {
  const opts = { ...generic, t90Seconds: 2, duration: 10, samples: 500 };

  test('the sensor sees nothing before the gas arrives', () => {
    const { t, value, tDelay } = stepResponse(opts);
    for (let i = 0; i < t.length; i += 1) {
      if (t[i] < tDelay * 0.9) expect(value[i]).toBeCloseTo(0, 6);
    }
  });

  test('reaches 90 % exactly T90 after the gas arrives, not after t = 0', () => {
    // The distinction the whole component exists to teach.
    const r = stepResponse(opts);
    expect(r.tNinety - r.tDelay).toBeCloseTo(opts.t90Seconds, 1);
  });

  test('approaches but does not exceed the final value', () => {
    const { value } = stepResponse(opts);
    expect(Math.max(...value)).toBeLessThanOrEqual(1.0001);
    expect(value[value.length - 1]).toBeGreaterThan(0.98);
  });

  test('the 50 % crossing lies after the delay and before T90', () => {
    // GLOSSARY §2: measure t_d at the 50 % crossing, because dispersion
    // smears the step and "first movement" is not a repeatable landmark.
    const r = stepResponse(opts);
    expect(r.tFiftyCrossing).toBeGreaterThan(r.tDelay);
    expect(r.tFiftyCrossing).toBeLessThan(r.tNinety);
  });

  test('transport delay and T90 move independently', () => {
    const baseline = stepResponse(opts);
    const slowTube = stepResponse({ ...opts, tubeLengthM: 4 });
    const slowSensor = stepResponse({ ...opts, t90Seconds: 6 });

    // A longer tube moves the delay and leaves the sensor alone.
    expect(slowTube.tDelay).toBeGreaterThan(baseline.tDelay);
    // A slower sensor moves T90 and leaves the delay alone.
    expect(slowSensor.tDelay).toBeCloseTo(baseline.tDelay, 4);
    expect(slowSensor.tNinety).toBeGreaterThan(baseline.tNinety);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test -- --watchAll=false src/lib/ares/stepResponseModel.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/ares/stepResponseModel.js`**

```js
/**
 * Step response behind DelayVsT90.
 *
 * Two quantities that get conflated constantly, and separating them is the
 * entire point of the component (GLOSSARY §2):
 *
 *   transport delay  t_d ~ V_tube / Q   — a property of the PLUMBING
 *   T90                                 — a property of the SENSOR, measured
 *                                         from the ARRIVAL of the change
 *
 * Total observed lag is t_d + T90, and they are corrected differently:
 * transport delay is subtracted, T90 is deconvolved or lived with.
 *
 * CLEARANCE: ARES pump and flow figures are NOT public (spec §1.3). Callers
 * pass generic values and the component captions them as illustrative. Do not
 * substitute real hardware numbers here.
 */

/** Seconds for gas to travel the tube. Null when flow is zero. */
export function transportDelay({ tubeLengthM, tubeIdMm, flowLpm }) {
  if (!flowLpm) return null;
  const radiusM = (tubeIdMm / 1000) / 2;
  const volumeM3 = Math.PI * radiusM * radiusM * tubeLengthM;
  const flowM3PerS = flowLpm / 1000 / 60;
  return volumeM3 / flowM3PerS;
}

/**
 * Normalized 0 -> 1 step at t = 0 at the inlet.
 *
 * Before t_d the sensor reads nothing. After it, a first-order approach whose
 * time constant is chosen so the reading hits 90 % exactly t90Seconds later:
 * for 1 - e^(-t/tau) = 0.9, tau = t90 / ln(10).
 */
export function stepResponse({
  tubeLengthM, tubeIdMm, flowLpm, t90Seconds, duration = 10, samples = 500,
}) {
  const tDelay = transportDelay({ tubeLengthM, tubeIdMm, flowLpm }) ?? 0;
  const tau = t90Seconds / Math.log(10);

  const t = [];
  const value = [];
  let tFiftyCrossing = null;

  for (let i = 0; i < samples; i += 1) {
    const time = (i / (samples - 1)) * duration;
    const since = time - tDelay;
    const v = since <= 0 ? 0 : 1 - Math.exp(-since / tau);

    t.push(time);
    value.push(v);

    if (tFiftyCrossing === null && v >= 0.5) tFiftyCrossing = time;
  }

  return {
    t,
    value,
    tDelay,
    tFiftyCrossing,
    tNinety: tDelay + t90Seconds,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test -- --watchAll=false src/lib/ares/stepResponseModel.test.js
```

Expected: PASS.

- [ ] **Step 5: Implement `DelayVsT90.jsx`**

Required elements:

1. **An SVG plot** of `value` against `t`, with the two phases drawn distinctly — a flat "gas in transit" region up to `tDelay`, then the exponential approach.
2. **Three annotated landmarks:** `tDelay` (labelled "gas arrives"), `tFiftyCrossing` (labelled "measure the delay here — 50 % crossing"), and `tNinety` (labelled "90 % of final").
3. **Three sliders** — tube length (0.2–4 m), bore (2–8 mm), sensor T90 (0.5–8 s) — each with a visible `<label>`.
4. **An `aria-live="polite"` readout**: transport delay, T90, and total lag in seconds.
5. **The caption, verbatim:**

```jsx
<p className="ares-caption">
  Illustrative values — not ARES hardware figures. Transport delay is a
  property of the plumbing; T90 is a property of the sensor. Total observed
  lag is the sum of the two, and they are corrected differently: the delay is
  subtracted, the T90 is deconvolved or lived with. Because dispersion smears
  the step, the delay is measured at the 50 % crossing, not at first movement.
</p>
```

Animate the step by sweeping a playhead along `t` under `requestAnimationFrame`; under `prefers-reduced-motion` draw the whole curve at once with the landmarks marked.

- [ ] **Step 6: Append styles and verify**

```bash
npm run build
npm test -- --watchAll=false src/lib/ares/
```

`npm start`, open `/ares/the-headset`. Drag tube length and confirm the flat region grows while the curve's shape is unchanged; drag T90 and confirm the opposite.

- [ ] **Step 7: Commit**

```bash
git add src/lib/ares/stepResponseModel.js src/lib/ares/stepResponseModel.test.js src/components/ares/DelayVsT90.jsx public/ares-theme.css
git commit -m "feat(ares): transport delay versus T90 step response"
```

---

## Task 9: RegimePlayground and NdirBeam

**Files:**
- Create: `src/lib/ares/beerLambert.js`, `src/lib/ares/beerLambert.test.js`
- Create: `src/components/ares/RegimePlayground.jsx`, `src/components/ares/NdirBeam.jsx`
- Modify: `public/ares-theme.css` (append)

**Interfaces:**
- Consumes: `grashof`, `rayleigh`, `peclet`, `reynolds`, `airPropertiesAt`, `GRAVITY`, `NDIR_BAND_M` from `aresPhysics.js`.
- Produces: `absorbedFraction({ ppm, pathLengthM, absorptivity })`, `detectorSignal({ ppm, pathLengthM, absorptivity })`, and the two components.

`RegimePlayground` needs no new model module — it calls `aresPhysics.js` directly, which is already tested by Task 1.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/ares/beerLambert.test.js`:

```js
import { absorbedFraction, detectorSignal } from './beerLambert';

const path = { pathLengthM: 0.05, absorptivity: 1.2e-4 };

describe('absorbedFraction', () => {
  test('nothing is absorbed at zero concentration', () => {
    expect(absorbedFraction({ ppm: 0, ...path })).toBeCloseTo(0, 9);
  });

  test('absorption rises with concentration', () => {
    const low = absorbedFraction({ ppm: 400, ...path });
    const high = absorbedFraction({ ppm: 5000, ...path });
    expect(high).toBeGreaterThan(low);
  });

  test('absorption rises with path length', () => {
    const short = absorbedFraction({ ppm: 5000, ...path });
    const long = absorbedFraction({ ppm: 5000, ...path, pathLengthM: 0.2 });
    expect(long).toBeGreaterThan(short);
  });

  test('is bounded to the unit interval', () => {
    expect(absorbedFraction({ ppm: 1e9, ...path })).toBeLessThanOrEqual(1);
    expect(absorbedFraction({ ppm: 0, ...path })).toBeGreaterThanOrEqual(0);
  });

  test('is exponential, not linear — doubling the path is not double the absorption', () => {
    // 2,000 ppm deliberately: at 20,000 both values saturate near 1 and the
    // assertion passes without demonstrating anything.
    const single = absorbedFraction({ ppm: 2000, ...path });
    const doubled = absorbedFraction({ ppm: 2000, ...path, pathLengthM: 0.1 });
    expect(single).toBeGreaterThan(0.1);
    expect(single).toBeLessThan(0.9);
    expect(doubled).toBeLessThan(single * 2);
  });
});

describe('detectorSignal', () => {
  test('is the complement of the absorbed fraction', () => {
    const args = { ppm: 5000, ...path };
    expect(detectorSignal(args)).toBeCloseTo(1 - absorbedFraction(args), 9);
  });

  test('a full detector signal means no gas in the path', () => {
    expect(detectorSignal({ ppm: 0, ...path })).toBeCloseTo(1, 9);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test -- --watchAll=false src/lib/ares/beerLambert.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/ares/beerLambert.js`**

```js
/**
 * Beer-Lambert absorption behind NdirBeam.
 *
 * I/I0 = exp(-a * C * L). The absorptivity here is a display constant chosen so
 * the animation reads clearly across 0-10,000 ppm; it is not a published
 * coefficient for any specific sensor, and the component says so.
 *
 * CLEARANCE: principle only. No part designations, no protocol (spec §1.3).
 */

export function absorbedFraction({ ppm, pathLengthM, absorptivity }) {
  const transmitted = Math.exp(-absorptivity * ppm * pathLengthM * 100);
  return Math.min(1, Math.max(0, 1 - transmitted));
}

export function detectorSignal(args) {
  return 1 - absorbedFraction(args);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test -- --watchAll=false src/lib/ares/beerLambert.test.js
```

Expected: PASS.

- [ ] **Step 5: Implement `RegimePlayground.jsx`**

The component's *point* is the lesson, not the arithmetic. Required elements:

1. **Sliders:** ΔT (2–20 K), gravity (0–9.81 m/s²), and temperature (295–305 K, feeding `airPropertiesAt`).
2. **A characteristic-length control that is a labelled choice, not a free number** — two named presets side by side:
   - `Body height — 1.7 m` (what M1 uses for the whole-body plume)
   - `Head width — 1/6 m` (what the CFD paper non-dimensionalised on)
3. **Both results shown simultaneously**, so the reader sees the orders-of-magnitude gap without having to remember the previous value.
4. **Four readouts** — Gr, Ra, Pe, Re — in `var(--ares-mono)`, exponential notation.
5. **The lesson as prose:**

```jsx
<p className="ares-caption">
  Grashof scales as the cube of the characteristic length, so choosing body
  height rather than head width moves the answer by orders of magnitude. Both
  are correct. Neither is meaningful without saying which one you used — a
  dimensionless number quoted without its length scale is not a result.
</p>
```

6. A note that Pe here is the **mass-transport** Péclet number, using the CO₂-in-air binary diffusivity, and that a thermal Péclet also exists and is not this.

- [ ] **Step 6: Implement `NdirBeam.jsx`**

Required elements:

1. **An animated SVG optical path:** source → gas-filled path → bandpass filter → detector, with IR marked as 4.26 µm from `NDIR_BAND_M`.
2. **A concentration slider** (0–10,000 ppm) driving beam opacity through `absorbedFraction`, and a detector-signal bar through `detectorSignal`.
3. **A path-length slider** (10–200 mm), demonstrating that a longer path gives more absorption.
4. **An `aria-live` readout** of concentration, absorbed fraction, and detector signal as percentages.
5. **Prose explaining "non-dispersive":** there is no monochromator or grating; the bandpass filter selects the band.
6. **The pressure note**, which links this component to `ExposureDial`:

```jsx
<p className="ares-caption">
  An NDIR sensor measures the number of absorbing molecules in its optical
  path, which tracks partial pressure — so an uncorrected ppm reading drifts
  with ambient pressure even when the mole fraction has not changed.
  Illustrative absorptivity, chosen for legibility across this range.
</p>
```

Do not name a part, quote a protocol, or show a register.

- [ ] **Step 7: Append styles and verify**

```bash
npm run build
npm test -- --watchAll=false src/lib/ares/
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/ares/beerLambert.js src/lib/ares/beerLambert.test.js src/components/ares/RegimePlayground.jsx src/components/ares/NdirBeam.jsx public/ares-theme.css
git commit -m "feat(ares): dimensionless-number playground and NDIR absorption animation"
```

---

## Task 10: SystemDiagram and PodDisagreement

**Files:**
- Create: `src/lib/ares/noisyDifference.js`, `src/lib/ares/noisyDifference.test.js`
- Create: `src/components/ares/SystemDiagram.jsx`, `src/components/ares/PodDisagreement.jsx`
- Modify: `public/ares-theme.css` (append)

**Interfaces:**
- Consumes: nothing from `aresPhysics.js`.
- Produces: `propagateDifference({ sigmaA, sigmaB }) => number`, `differenceBudget({ chin, top, sigmaChin, sigmaTop }) => { difference, sigmaDifference, relativeError }`, and the two components.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/ares/noisyDifference.test.js`:

```js
import { propagateDifference, differenceBudget } from './noisyDifference';

describe('propagateDifference', () => {
  test('adds independent errors in quadrature', () => {
    expect(propagateDifference({ sigmaA: 3, sigmaB: 4 })).toBeCloseTo(5, 6);
  });

  test('the difference is noisier than EITHER input', () => {
    // C13 and M10: this is why per-pod calibration is not optional.
    const sigma = propagateDifference({ sigmaA: 30, sigmaB: 30 });
    expect(sigma).toBeGreaterThan(30);
  });

  test('equal inputs give a factor of root two', () => {
    expect(propagateDifference({ sigmaA: 30, sigmaB: 30 })).toBeCloseTo(30 * Math.SQRT2, 6);
  });
});

describe('differenceBudget', () => {
  test('reports the difference and its propagated error', () => {
    const b = differenceBudget({ chin: 1850, top: 420, sigmaChin: 30, sigmaTop: 30 });
    expect(b.difference).toBe(1430);
    expect(b.sigmaDifference).toBeCloseTo(30 * Math.SQRT2, 4);
  });

  test('relative error explodes as the two readings converge', () => {
    const wide = differenceBudget({ chin: 1850, top: 420, sigmaChin: 30, sigmaTop: 30 });
    const narrow = differenceBudget({ chin: 480, top: 420, sigmaChin: 30, sigmaTop: 30 });
    expect(narrow.relativeError).toBeGreaterThan(wide.relativeError);
  });

  test('a vanishing difference does not produce Infinity', () => {
    const b = differenceBudget({ chin: 420, top: 420, sigmaChin: 30, sigmaTop: 30 });
    expect(Number.isFinite(b.relativeError) || b.relativeError === null).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test -- --watchAll=false src/lib/ares/noisyDifference.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/ares/noisyDifference.js`**

```js
/**
 * Error propagation behind PodDisagreement.
 *
 * The rebreathed fraction is a DIFFERENCE of two readings, so it inherits both
 * sensors' errors — GLOSSARY §2, caveat three. Independent errors add in
 * quadrature, which means the difference of two readings is noisier than
 * either one of them. That is why three pods disagreeing is normal, and why
 * per-pod calibration is not optional.
 */

export function propagateDifference({ sigmaA, sigmaB }) {
  return Math.hypot(sigmaA, sigmaB);
}

export function differenceBudget({ chin, top, sigmaChin, sigmaTop }) {
  const difference = chin - top;
  const sigmaDifference = propagateDifference({ sigmaA: sigmaChin, sigmaB: sigmaTop });
  const relativeError = difference === 0 ? null : Math.abs(sigmaDifference / difference);
  return { difference, sigmaDifference, relativeError };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test -- --watchAll=false src/lib/ares/noisyDifference.test.js
```

Expected: PASS.

- [ ] **Step 5: Implement `PodDisagreement.jsx`**

Required elements:

1. **Three readings with error bars** — top, forehead, chin — drawn in SVG, plus a fourth bar for `chin − top` with its own, visibly larger, error bar.
2. **A per-pod noise slider** (10–80 ppm) driving all four.
3. **An `aria-live` readout** of the difference, its uncertainty, and the relative error as a percentage.
4. **A second panel on automatic baseline correction**, principle only: a firmware routine periodically re-zeroes to the lowest concentration seen over a multi-day window, on the assumption the sensor meets fresh outdoor air at some point in it — and a headset that spends its life within a metre of a CO₂ source cannot rely on that assumption.
5. **The caption:**

```jsx
<p className="ares-caption">
  Independent errors add in quadrature, so the difference of two readings is
  noisier than either one. Three pods disagreeing is not a fault — it is what
  three independent instruments do. Deciding how much of the disagreement is
  real is what calibration is for.
</p>
```

- [ ] **Step 6: Implement `SystemDiagram.jsx`**

Hand-rolled SVG, ~8 nodes, **block level only**. Not mxGraph: there is no draw.io source for ARES, and `AstroFlowDiagram` carries five documented gotchas that only pay off when decoding someone else's XML.

Blocks are named **by function**: three pods (top / forehead / chin) → aggregation → on-body logging → application → analysis. Edges animate a travelling dash on scroll into view, disabled under `prefers-reduced-motion`.

**Excluded from this diagram (spec §1.3):** bus names and timings, characteristic UUIDs, CSV column names, part designations, sample rates tied to specific hardware. Hovering a block reveals a one-sentence functional description and nothing more.

Provide a `<figcaption>` and a visually-hidden `<ol>` describing the same chain in text, so the diagram is not the only way to get the information.

- [ ] **Step 7: Append styles and verify**

```bash
npm run build
npm test -- --watchAll=false src/lib/ares/
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/ares/noisyDifference.js src/lib/ares/noisyDifference.test.js src/components/ares/SystemDiagram.jsx src/components/ares/PodDisagreement.jsx public/ares-theme.css
git commit -m "feat(ares): system block diagram and noisy-difference error visual"
```

---

## Task 11: The hub page

**Files:**
- Modify: `src/pages/Ares.jsx` (replace the placeholder sections from Task 3)
- Modify: `public/ares-theme.css` (append)

**Interfaces:**
- Consumes: every component from Tasks 4–10.
- Produces: the finished `/ares`.

**Before writing any prose, read:** spec §1 (all of it), `content/C12-how-gravity-moves-air.md`, and `content/C13-the-plume-and-the-bubble.md`. The prose on this page is *new writing for a public audience*, not the course text pasted in — the course was written for a new ARES engineer.

- [ ] **Step 1: Lazy-load the components**

```jsx
import { lazy, Suspense } from 'react';

const PlumeSimulator  = lazy(() => import('../components/ares/PlumeSimulator'));
const ExposureDial    = lazy(() => import('../components/ares/ExposureDial'));
const PodReadout      = lazy(() => import('../components/ares/PodReadout'));
const PodDisagreement = lazy(() => import('../components/ares/PodDisagreement'));
```

Each is wrapped in a `<Suspense>` with a skeleton fallback, following the `AstroFlowDiagram` usage in `AstroUSA.jsx` (~line 361):

```jsx
<Suspense fallback={
  <div className="ares-lazy-shell" aria-busy="true">
    <div className="ares-spinner" aria-hidden="true" />
    <span>Loading…</span>
  </div>
}>
  <PlumeSimulator />
</Suspense>
```

- [ ] **Step 2: Write the eight sections**

Replace the placeholder `.map()`. Section ids must match `ARES_RAIL_SECTIONS` exactly.

| id | Contains |
|---|---|
| `ares-problem` | The framing: on Earth you are continuously ventilated by a system nobody designed. An `AresStat` row — `0.3–0.4 m/s` crown velocity (source: Dutta et al.), `5,300 ppm` NASA 2010 limit (source: GLOSSARY §5), `3` sensor pods, `1.7 m` of accumulated buoyancy. |
| `ares-gravity` | `<PlumeSimulator />` plus prose on <AresTerm term="BTC">biothermal convection</AresTerm> and what remains when it stops (<AresTerm term="IBD">IBD</AresTerm>). |
| `ares-bubble` | The thesis. The chin-to-nostril path, the 45° exit, the breathing envelope, and the honest note that the microgravity half is a model extrapolated past where its <AresTerm term="Schlieren">Schlieren</AresTerm> validation exists — "and that gap is what ARES was built to close." CFD figure slot (Task 13). |
| `ares-why` | `<ExposureDial />` plus the cabin-vs-face argument. |
| `ares-headset` | `<PodReadout />` plus the three pods and their roles. |
| `ares-trust` | `<PodDisagreement />` plus why three sensors disagreeing is normal. |
| `ares-next` | Direction only: moving the top pod out of the plume, reducing pod height, room-reference nodes. **No IRB status, no purchasing, no schedule risk.** |
| `ares-join` | CTA to `/contact`, partnership credit to the Purdue lab under D. Marshall Porterfield, and links to both deep-dives. |

The thesis sentence, which the page is built around:

```jsx
<p className="ares-thesis">
  The CO₂ bubble is not CO₂ appearing. It is a ventilation structure
  disappearing.
</p>
```

- [ ] **Step 3: Alternate section backgrounds**

Follow the site pattern — alternate sections carry `style={{ background: 'var(--color-bg-sand)' }}`, as `AstroUSA.jsx` does. The concentration-tint effect (Task 13) layers on top of this.

- [ ] **Step 4: Verify**

```bash
npm run build
npm start
```

Open `/ares`. Walk every rail dot and confirm it scrolls to a real section. Check the browser console is clean. Read the page top to bottom against spec §1.3 and confirm nothing excluded appears.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Ares.jsx public/ares-theme.css
git commit -m "feat(ares): hub page content and component composition"
```

---

## Task 12: The two deep-dive pages

**Files:**
- Modify: `src/pages/Ares/TheScience.jsx`, `src/pages/Ares/TheHeadset.jsx`
- Modify: `public/ares-theme.css` (append)

**Interfaces:**
- Consumes: `RegimePlayground`, `NdirBeam`, `SystemDiagram`, `DelayVsT90`, `PodDisagreement`, `AresStat`, `AresTerm`.
- Produces: the two finished deep-dives.

- [ ] **Step 1: Build `/ares/the-science`**

| id | Contains |
|---|---|
| `sci-regimes` | Buoyancy versus diffusion. What changes and what does not when gravity goes away — convection stopping and transport stopping are different things. |
| `sci-numbers` | `<RegimePlayground />`, plus the ratio each number expresses. |
| `sci-reading` | **The generalized skill** (spec §1.2 item 2): what a model claims versus what it shows; the passive-scalar assumption; the Boussinesq approximation stated in words before symbols; why an unvalidated result is a picture rather than a finding. **Written as a general method. Do not walk through the Dutta et al. paper section by section** — that is C14 and C14 is internal. |
| `sci-rebreath` | The `f_rb` formula derived, with all three caveats. Reuses the copy from `breathModel.js`'s doc comment. |
| `sci-validation` | Schlieren imaging as validation, and the honest limit: nobody has flown a Schlieren rig and a volunteer, so the microgravity half is extrapolation. Open questions stay open. |

- [ ] **Step 2: Build `/ares/the-headset`**

| id | Contains |
|---|---|
| `hs-system` | `<SystemDiagram />` plus a block-level walk of the chain. |
| `hs-sensing` | `<NdirBeam />` plus what <AresTerm term="NDIR">NDIR</AresTerm> means and why 4.26 µm. |
| `hs-sampling` | `<DelayVsT90 />` plus the <AresTerm term="T90">T90</AresTerm>-versus-transport-delay distinction. Generic values only. |
| `hs-calibration` | `<PodDisagreement />` plus calibration philosophy and the baseline-correction assumption. |
| `hs-gallery` | Hardware photo slots — see Step 3. |

- [ ] **Step 3: Photo and figure slots that degrade gracefully**

`public/ares/` is empty and **no ARES image exists in the repo**. The pages must look finished with zero photographs.

Build a small local component in `TheHeadset.jsx`:

```jsx
function AresFigure({ src, alt, caption, credit }) {
  const [failed, setFailed] = useState(!src);

  if (failed) {
    return (
      <figure className="ares-figure ares-figure-empty">
        <div className="ares-figure-placeholder" role="img" aria-label={alt}>
          <i className="fas fa-camera" aria-hidden="true" />
          <span>{alt}</span>
        </div>
        {caption && <figcaption>{caption}</figcaption>}
      </figure>
    );
  }

  return (
    <figure className="ares-figure">
      <img loading="lazy" src={src} alt={alt} onError={() => setFailed(true)} />
      {caption && (
        <figcaption>
          {caption}
          {credit && <span className="ares-figure-credit">{credit}</span>}
        </figcaption>
      )}
    </figure>
  );
}
```

The `onError` fallback is what keeps a missing file from rendering a broken-image icon. Style `.ares-figure-placeholder` as a deliberate dashed-border panel, not an error state.

**Every third-party figure must carry a `credit` string, and none may be committed until spec §7's copyright check has been done by a human.** Ship the slots empty; the files land later.

- [ ] **Step 4: Verify**

```bash
npm run build
npm start
```

Open both pages. Confirm the empty figure slots read as intentional, and that both pages' rails work.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Ares/ public/ares-theme.css
git commit -m "feat(ares): science and headset deep-dive pages"
```

---

## Task 13: Signature effects — gravity drain and concentration tint

**Files:**
- Create: `src/hooks/useAresScrollEffects.js`
- Modify: `src/pages/Ares.jsx`
- Modify: `public/ares-theme.css` (append)

**Interfaces:**
- Consumes: `gsap` (already a dependency).
- Produces: `useAresScrollEffects(heroRef, tintRefs)`.

Look at `src/hooks/useFlowAnimations.js` first — it is the existing GSAP hook and sets the pattern for registration and cleanup in this codebase.

- [ ] **Step 1: Implement the hook**

```js
import { useEffect } from 'react';

/**
 * The two scroll effects specific to the ARES hub.
 *
 * 1. GRAVITY DRAIN — the hero's background particle drift is coupled to scroll
 *    position, so crossing out of the opening sections kills the upward motion.
 *    The page performs its own subject rather than describing it.
 *
 * 2. CONCENTRATION TINT — section backgrounds walk from cream toward warm
 *    ochre through the bubble and exposure sections, reading as accumulation.
 *
 * Both are disabled entirely under prefers-reduced-motion — not slowed, not
 * shortened. A scroll-coupled animation is exactly what that setting is for.
 *
 * GSAP is imported dynamically so it does not enter the /ares initial chunk.
 */
export default function useAresScrollEffects(heroRef, tintRef) {
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;

    let ctx = null;
    let cancelled = false;

    (async () => {
      const { gsap } = await import('gsap');
      const { ScrollTrigger } = await import('gsap/ScrollTrigger');
      if (cancelled) return;

      gsap.registerPlugin(ScrollTrigger);

      ctx = gsap.context(() => {
        if (heroRef.current) {
          gsap.to(heroRef.current, {
            '--ares-drift': 0,
            ease: 'none',
            scrollTrigger: {
              trigger: heroRef.current,
              start: 'top top',
              end: 'bottom top',
              scrub: true,
            },
          });
        }

        if (tintRef.current) {
          gsap.fromTo(tintRef.current,
            { backgroundColor: 'var(--ares-conc-0)' },
            {
              backgroundColor: 'var(--ares-conc-2)',
              ease: 'none',
              scrollTrigger: {
                trigger: tintRef.current,
                start: 'top 80%',
                end: 'bottom 40%',
                scrub: true,
              },
            });
        }
      });
    })();

    return () => {
      cancelled = true;
      if (ctx) ctx.revert();
    };
  }, [heroRef, tintRef]);
}
```

`gsap.context()` + `ctx.revert()` is the cleanup that matters — Framer Motion's `AnimatePresence` unmounts the page on navigation, and an un-reverted ScrollTrigger keeps firing against detached nodes.

- [ ] **Step 2: Wire it into the hub**

In `src/pages/Ares.jsx`, add `heroRef` and `tintRef`, attach them to the hero `<main>` and the `ares-bubble` section, and call `useAresScrollEffects(heroRef, tintRef)`.

`PlumeSimulator` reads the `--ares-drift` custom property from its container each frame and multiplies its buoyancy term by it, so the hero's drift responds to scroll. Read it with `getComputedStyle(el).getPropertyValue('--ares-drift')` once per frame in the draw loop, defaulting to `1` when unset or unparseable.

- [ ] **Step 3: Verify both settings**

```bash
npm run build
npm start
```

Open `/ares` and scroll — the hero drift should visibly die. Then in DevTools → Rendering → *Emulate CSS prefers-reduced-motion: reduce*, reload, and confirm **nothing** animates: no drift, no tint walk, no count-up, no particle motion, and the page still communicates every point.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useAresScrollEffects.js src/pages/Ares.jsx public/ares-theme.css
git commit -m "feat(ares): gravity-drain and concentration-tint scroll effects"
```

---

## Task 14: Verification pass

**Files:**
- Modify: any file that fails a check below.
- Modify: `CLAUDE.md` (add ARES to the file-structure and CSS sections)

This task ships nothing new. It runs spec §10 and fixes what it finds. **Do not skip it** — four of the six checks below are invisible in a single-route dev-server test.

- [ ] **Step 1: Full automated run**

```bash
npm run build
npm test -- --watchAll=false
npm run check:icons
```

`npm run check:icons` reports any Font Awesome icon referenced in source that the subset does not carry. **If it reports an interpolated icon name in an ARES file, fix the JSX to use a string literal** — `scripts/fa-icon-scan.mjs` is a static scan and a template-built class renders blank.

`src/App.test.js` fails for a pre-existing reason (broken `main` field in the installed `react-router-dom`). Confirm the failure list is unchanged, not empty.

- [ ] **Step 2: Every number traces to `aresPhysics.js`**

```bash
grep -rnE '[0-9]{3,}' src/pages/Ares.jsx src/pages/Ares/ src/components/ares/*.jsx
```

Every hit must be a layout value (an SVG coordinate, a viewBox, a pixel size) — not a physical quantity. Any physical constant found in JSX moves to `aresPhysics.js` and gets a test.

- [ ] **Step 3: Clearance re-read**

Re-read spec §1.3, then read all three rendered pages top to bottom, **including image `alt` text, `figcaption`s, `data-tip` contents, and the visually-hidden diagram description**. Confirm nothing excluded appears. Then:

```bash
grep -rniE 'sprintir|l/min|lee_pump|IRB|capstone|CSV|UUID' src/pages/Ares.jsx src/pages/Ares/ src/components/ares/
```

Expected: no hits in user-visible strings. A hit inside a doc comment explaining *why* something is excluded is fine.

- [ ] **Step 4: Theme load-order pass**

This is the check that a single-route test cannot make. In a browser:

1. Load `/ares` → navigate to `/clubpm/login` → navigate back to `/ares`.
2. In a fresh tab, load `/clubpm/login` → navigate to `/ares` → back to `/clubpm/login`.

In both orders confirm: ARES pages look identical, ClubPM login looks identical, and DevTools → Elements → Computed shows no ARES token leaking onto a ClubPM node or vice versa. Any leak means a selector in `ares-theme.css` escaped `.ares-page` — find it and scope it.

- [ ] **Step 5: Accessibility pass**

- Keyboard only, no mouse: reach and operate every slider, every pod marker, every toggle, on all three pages. Focus must be visible throughout.
- With a screen reader (NVDA on Windows), confirm each interactive's `aria-live` region announces on change and that the announcements are sentences, not number fragments.
- Confirm no interactive conveys its state by colour alone.
- Run Lighthouse on `/ares` — accessibility score should match the other program pages'.

- [ ] **Step 6: Backend-down and mobile passes**

- Log out, stop the backend, and load all three routes. They must render fully. Any network call to the API is a bug — these pages must not import from `src/clubpm/**` or `src/api/clubPmClient.js`.
- On a real phone: check layout at 360 px wide, that the canvas components are legible or correctly fall back, and — via DevTools remote Performance — that scrolling a canvas out of view actually stops its `requestAnimationFrame` loop.

- [ ] **Step 7: Update `CLAUDE.md`**

Add to the file-structure tree: `src/pages/Ares.jsx` + `Ares/`, `src/components/ares/`, `src/lib/ares/`, `src/theme/loadTheme.js`, `public/ares-theme.css`.

Add to the CSS conventions section: `public/ares-theme.css` is the third stylesheet, fetched on demand by `/ares/*`, **scoped under `.ares-page`** because both runtime-loaded themes land in `<head>` in visit order.

Update the "Which file does a new rule go in?" guidance to mention the ARES routes, and note that `scripts/minify-public-css.mjs` carries a hardcoded `TARGETS` list that any new public stylesheet must be added to.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore(ares): verification pass and CLAUDE.md updates"
```

---

## Self-Review Notes

**Spec coverage.** §1 clearance → Global Constraints + Tasks 11/12/14. §2 routes/nav/registration → Task 3. §3 file layout → all tasks. §3.1 `aresPhysics.js` → Task 1. §4 CSS delivery and `.ares-page` scoping → Task 2, checked in Task 14 Step 4. §5.1–§5.9 components → Tasks 4–10. §6.1 motion/perf → the canvas tasks + Task 14 Step 6. §6.2 a11y → every component task + Task 14 Step 5. §6.3 house style → Global Constraints. §7 assets → Task 12 Step 3. §8 visual direction → Tasks 2, 4, 13. §9 out of scope → Global Constraints + Task 14 Step 6. §10 verification → Task 14. Every spec section maps to at least one task.

**Ordering.** Tasks 1–3 are foundational and strictly sequential. Tasks 5–10 are mutually independent once Tasks 1–4 land, so they parallelize across subagents. Tasks 11–12 need 4–10. Task 13 needs 11. Task 14 needs everything.

**Interface consistency.** `aresPhysics.js` exports are named identically everywhere they are consumed: `grashof`/`rayleigh`/`peclet`/`reynolds` take an options object, `airPropertiesAt` takes a bare number, `rebreathedFraction` takes `{ chin, top, exhaled }`. `loadTheme(href, marker)` is two positional arguments in Task 2 and is spread from `ARES_THEME` in Task 3. `stepResponse` returns `tDelay`/`tFiftyCrossing`/`tNinety` and Task 8's component annotates exactly those three.
