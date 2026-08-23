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
