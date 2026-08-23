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
