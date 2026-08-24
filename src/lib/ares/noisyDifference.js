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
