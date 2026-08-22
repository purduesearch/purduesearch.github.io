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

/** C16 ("Why 4.26 µm") — the CO2 absorption band NDIR selects with a bandpass filter. */
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
  // Returns null rather than silently handing back the last row for a
  // non-finite input, so callers render "—" instead of a nonsense number.
  if (!Number.isFinite(tempK)) return null;
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
  // Returns null rather than a sign-flipped or zeroed result for a
  // non-physical pressure, so callers render "—" instead of a nonsense number.
  if (pressureHpa <= 0) return null;
  const totalMmHg = STANDARD_PRESSURE_MMHG * (pressureHpa / STANDARD_PRESSURE_HPA);
  return (ppm / 1e6) * totalMmHg;
}

export function mmHgToPpm(mmHg, pressureHpa = STANDARD_PRESSURE_HPA) {
  // Returns null rather than Infinity/NaN for a non-physical pressure, so
  // callers render "—" instead of a nonsense number.
  if (pressureHpa <= 0) return null;
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
 *
 * Returns null (never throws) when tFilmK is non-finite, propagating
 * airPropertiesAt's null rather than crashing on the destructure.
 */
export function grashof({ dT, L, tFilmK, g = GRAVITY.earth }) {
  const props = airPropertiesAt(tFilmK);
  if (props === null) return null;
  const { nu } = props;
  const beta = 1 / tFilmK;
  return (g * beta * dT * Math.pow(L, 3)) / (nu * nu);
}

/**
 * Ra = Gr * Pr. GLOSSARY §3.
 *
 * Returns null (never throws, never silently multiplies by 0) when tFilmK is
 * non-finite, propagating airPropertiesAt's/grashof's null.
 */
export function rayleigh({ dT, L, tFilmK, g = GRAVITY.earth }) {
  const props = airPropertiesAt(tFilmK);
  if (props === null) return null;
  const gr = grashof({ dT, L, tFilmK, g });
  if (gr === null) return null;
  return gr * props.Pr;
}

/**
 * Pe = V*L / D — the MASS-transport Peclet number, with D the CO2-in-air binary
 * diffusivity. A thermal Peclet V*L/alpha also exists and is not this; if one is
 * ever needed, name it peclet_thermal. GLOSSARY §3.
 */
export function peclet({ V, L }) {
  return (V * L) / DIFFUSIVITY_CO2;
}

/**
 * Re = V*L / nu. GLOSSARY §3. nu overridable so M3's paper value reproduces.
 *
 * An explicit nu short-circuits entirely — airPropertiesAt is never consulted,
 * so a garbage tFilmK cannot affect the result. Without an explicit nu, returns
 * null (never throws) when tFilmK is non-finite, propagating airPropertiesAt's
 * null rather than crashing on the property read.
 */
export function reynolds({ V, L, tFilmK = 300, nu }) {
  if (nu != null) return (V * L) / nu;
  const props = airPropertiesAt(tFilmK);
  if (props === null) return null;
  return (V * L) / props.nu;
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
