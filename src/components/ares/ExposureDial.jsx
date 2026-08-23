import { useId, useMemo, useState } from 'react';
import { CO2_TIERS, STANDARD_PRESSURE_HPA } from './aresPhysics';
import { describeExposure } from '../../lib/ares/exposureModel';

/**
 * ExposureDial — the component that carries the page's whole argument: a
 * cabin within limits is not a face within limits. Reads out a chosen
 * concentration and session length in all three units the literature quotes
 * (ppm, mmHg, %), against the GLOSSARY §5 tier bands, plus the cumulative
 * dose those two sliders imply.
 */

const CONC_MIN_PPM = 400;
const CONC_MAX_PPM = 10000;
const CONC_STEP_PPM = 50;

const HOURS_MIN = 0.5;
const HOURS_MAX = 8;
const HOURS_STEP = 0.5;

// GLOSSARY §4's worked altitude example for the pressure-dependence note —
// not a real cabin setpoint, just the illustrative comparison pressure used
// to show that an NDIR reading drifts with ambient pressure.
const ALTITUDE_PRESSURE_HPA = 950;

const formatPpm = (n) => Number(n).toLocaleString('en-US');
const formatHours = (n) => Number(n).toLocaleString('en-US');
const formatHpa = (n) =>
  Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export default function ExposureDial() {
  const [ppm, setPpm] = useState(1000);
  const [hours, setHours] = useState(1);
  const [atAltitude, setAtAltitude] = useState(false);

  const pressureHpa = atAltitude ? ALTITUDE_PRESSURE_HPA : STANDARD_PRESSURE_HPA;

  const reading = useMemo(
    () => describeExposure({ ppm, hours, pressureHpa }),
    [ppm, hours, pressureHpa],
  );

  const concId = useId();
  const hoursId = useId();
  const pressureId = useId();

  const trackSpan = CONC_MAX_PPM - CONC_MIN_PPM;

  const bands = useMemo(
    () =>
      CO2_TIERS.map((tier, i) => {
        const start = Math.max(tier.ppm, CONC_MIN_PPM);
        const nextTier = CO2_TIERS[i + 1];
        const end = nextTier ? nextTier.ppm : CONC_MAX_PPM;
        return {
          ...tier,
          index: i,
          startPct: ((start - CONC_MIN_PPM) / trackSpan) * 100,
          widthPct: (Math.max(end - start, 0) / trackSpan) * 100,
        };
      }),
    [trackSpan],
  );

  const markerPct =
    ((Math.min(Math.max(ppm, CONC_MIN_PPM), CONC_MAX_PPM) - CONC_MIN_PPM) / trackSpan) * 100;

  const mmHgDisplay = reading.mmHg == null ? '—' : reading.mmHg.toFixed(2);

  return (
    <div className="ares-exposure-dial">
      <div className="ares-exposure-controls">
        <div className="ares-exposure-field">
          <label htmlFor={concId}>Concentration</label>
          <input
            id={concId}
            type="range"
            min={CONC_MIN_PPM}
            max={CONC_MAX_PPM}
            step={CONC_STEP_PPM}
            value={ppm}
            onChange={(e) => setPpm(Number(e.target.value))}
          />
          <span className="ares-exposure-field-value">{formatPpm(ppm)} ppm</span>
        </div>

        <div className="ares-exposure-field">
          <label htmlFor={hoursId}>Session length</label>
          <input
            id={hoursId}
            type="range"
            min={HOURS_MIN}
            max={HOURS_MAX}
            step={HOURS_STEP}
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
          />
          <span className="ares-exposure-field-value">{formatHours(hours)} hours</span>
        </div>

        <div className="ares-exposure-field ares-exposure-field-toggle">
          <label htmlFor={pressureId}>At altitude</label>
          <input
            id={pressureId}
            type="checkbox"
            role="switch"
            checked={atAltitude}
            aria-checked={atAltitude}
            onChange={(e) => setAtAltitude(e.target.checked)}
          />
          <span className="ares-exposure-field-value">
            {atAltitude ? formatHpa(ALTITUDE_PRESSURE_HPA) : formatHpa(STANDARD_PRESSURE_HPA)} hPa
          </span>
          <p className="ares-exposure-pressure-note">
            An NDIR sensor tracks partial pressure, so an uncorrected reading drifts with
            ambient pressure even when the mole fraction has not changed.
          </p>
        </div>
      </div>

      {/* Decorative proportional strip — purely a visual echo of the accessible
          legend below it, so it carries no independent information and is
          hidden from assistive tech rather than duplicated onto it. */}
      <div className="ares-tier-bar" aria-hidden="true">
        {bands.map((band) => (
          <div
            key={band.ppm}
            className={`ares-tier-bar-band ares-tier-bar-band-${band.index}${
              band.ppm === reading.tier.ppm ? ' ares-tier-bar-band-current' : ''
            }`}
            style={{ left: `${band.startPct}%`, width: `${band.widthPct}%` }}
          />
        ))}
        <div className="ares-tier-marker" style={{ left: `${markerPct}%` }} />
      </div>

      <ul className="ares-tier-legend">
        {bands.map((band) => {
          const isCurrent = band.ppm === reading.tier.ppm;
          return (
            <li
              key={band.ppm}
              className={`ares-tier-legend-item ares-tier-legend-item-${band.index}${
                isCurrent ? ' ares-tier-legend-item-current' : ''
              }`}
              aria-current={isCurrent ? 'true' : undefined}
            >
              <span className="ares-tier-swatch" aria-hidden="true" />
              <span className="ares-tier-legend-text">
                {formatPpm(band.ppm)} ppm — {band.label}
                {band.note ? ` (${band.note})` : ''}
              </span>
              {isCurrent && (
                <span className="ares-tier-legend-flag">
                  <i className="fas fa-caret-right" aria-hidden="true" /> Current reading
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="ares-exposure-readouts">
        <div className="ares-exposure-readout">
          <span className="ares-exposure-readout-label">ppm</span>
          <span className="ares-exposure-readout-value">{formatPpm(reading.ppm)}</span>
        </div>
        <div className="ares-exposure-readout">
          <span className="ares-exposure-readout-label">mmHg</span>
          <span className="ares-exposure-readout-value">{mmHgDisplay}</span>
        </div>
        <div className="ares-exposure-readout">
          <span className="ares-exposure-readout-label">%</span>
          <span className="ares-exposure-readout-value">{reading.percent.toFixed(2)}</span>
        </div>
        <div className="ares-exposure-readout ares-exposure-readout-dose">
          <span className="ares-exposure-readout-label">Dose</span>
          <span className="ares-exposure-readout-value">
            {formatPpm(reading.dose)} ppm·hours
          </span>
          <span className="ares-exposure-readout-note">
            over {formatHours(hours)} hours at {formatPpm(ppm)} ppm
          </span>
        </div>
      </div>

      <p className="ares-caption">
        A spacecraft's environmental control system measures the cabin. ARES measures
        the 20 cm in front of a face. A cabin within limits is not a face within
        limits, and the difference is the whole project.
      </p>

      <div className="ares-exposure-summary" aria-live="polite">
        {reading.summary}
      </div>
    </div>
  );
}
