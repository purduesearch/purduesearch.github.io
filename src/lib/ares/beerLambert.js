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
  // The *100 is a display-only scaling factor, not a unit conversion the
  // physics requires: NdirBeam's ABSORPTIVITY_DISPLAY was chosen assuming a
  // centimetre-scale path, so this folds the metre (pathLengthM) input back
  // up by 100x before it reaches that constant. Without it, the component's
  // full 10-200 mm slider range would only ever produce a few percent of
  // absorption — nowhere near visually saturating — since a real
  // metre-scale absorptivity this small stays deep in Beer-Lambert's linear
  // regime across NDIR's whole illustrative concentration sweep.
  const transmitted = Math.exp(-absorptivity * ppm * pathLengthM * 100);
  return Math.min(1, Math.max(0, 1 - transmitted));
}

export function detectorSignal(args) {
  return 1 - absorbedFraction(args);
}
