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
