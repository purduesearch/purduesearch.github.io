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
