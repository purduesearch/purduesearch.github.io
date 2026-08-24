import { useId, useState } from 'react';
import { NDIR_BAND_UM } from './aresPhysics';
import { absorbedFraction, detectorSignal } from '../../lib/ares/beerLambert';
import usePrefersReducedMotion from '../../hooks/usePrefersReducedMotion';

/**
 * Slider ranges are UI parameters chosen for this component, not physical
 * constants — aresPhysics.js has no opinion on how wide an NDIR demo slider
 * should sweep. Named here (never typed into markup) so they read as
 * deliberate choices rather than magic numbers scattered through the JSX.
 */
const CONCENTRATION_PPM_MIN = 0;
const CONCENTRATION_PPM_MAX = 10000;
const PATH_LENGTH_MM_MIN = 10;
const PATH_LENGTH_MM_MAX = 200;

/**
 * Display-only absorptivity — see src/lib/ares/beerLambert.js. Chosen so the
 * beam animation reads clearly across the full 0-10,000 ppm / 10-200 mm
 * sweep this component offers; it is not a published coefficient for any
 * real sensor, and the on-page caption says so too.
 */
const ABSORPTIVITY_DISPLAY = 1.2e-4;

// NDIR_BAND_UM (aresPhysics.js) is already the metre->micron conversion,
// computed once there; this just formats it for display.
const BAND_UM = NDIR_BAND_UM.toFixed(2);

const pct = (v) => (Number.isFinite(v) ? `${(v * 100).toFixed(1)} %` : '—');

export default function NdirBeam() {
  const idBase = useId();
  const [ppm, setPpm] = useState(2000);
  const [pathLengthMm, setPathLengthMm] = useState(50);
  const reducedMotion = usePrefersReducedMotion();

  const pathLengthM = pathLengthMm / 1000;
  const absorbed = absorbedFraction({
    ppm,
    pathLengthM,
    absorptivity: ABSORPTIVITY_DISPLAY,
  });
  const signal = detectorSignal({
    ppm,
    pathLengthM,
    absorptivity: ABSORPTIVITY_DISPLAY,
  });

  const beamOpacity = Number.isFinite(signal) ? Math.max(0.08, signal) : 1;
  const signalBarPct = Number.isFinite(signal) ? signal * 100 : 0;

  const concId = `${idBase}-conc`;
  const pathId = `${idBase}-path`;

  const readout = Number.isFinite(absorbed) && Number.isFinite(signal)
    ? `At ${ppm.toLocaleString('en-US')} ppm over a ${pathLengthMm} mm path, ` +
      `${pct(absorbed)} of the beam is absorbed and the detector receives ` +
      `${pct(signal)} of the source signal.`
    : 'Absorption cannot be computed for this reading.';

  return (
    <div className="ares-ndir-beam">
      <svg
        className={
          reducedMotion ? 'ares-ndir-svg' : 'ares-ndir-svg ares-ndir-svg-animated'
        }
        viewBox="0 0 640 180"
        role="img"
        aria-label={`Schematic of an NDIR optical path: infrared source, gas cell, ${BAND_UM} micron bandpass filter, detector.`}
      >
        {/* Source */}
        <g className="ares-ndir-source">
          <circle cx="60" cy="90" r="26" />
          <text x="60" y="140" textAnchor="middle" className="ares-ndir-label">
            IR source
          </text>
        </g>

        {/* Beam: source -> gas cell (always full intensity) */}
        <line
          x1="86" y1="90" x2="220" y2="90"
          className="ares-ndir-beam-line ares-ndir-beam-line-in"
        />

        {/* Gas cell */}
        <g className="ares-ndir-gas-cell">
          <rect
            x="220" y="50" width="160" height="80" rx="6"
            style={{ '--ares-ndir-conc': Math.min(1, ppm / CONCENTRATION_PPM_MAX) }}
          />
          <text x="300" y="150" textAnchor="middle" className="ares-ndir-label">
            gas-filled path
          </text>
        </g>

        {/* Beam: inside gas cell, opacity falls with absorption */}
        <line
          x1="220" y1="90" x2="380" y2="90"
          className="ares-ndir-beam-line ares-ndir-beam-line-cell"
          style={{ opacity: beamOpacity }}
        />

        {/* Beam: gas cell -> filter, already attenuated */}
        <line
          x1="380" y1="90" x2="470" y2="90"
          className="ares-ndir-beam-line ares-ndir-beam-line-out"
          style={{ opacity: beamOpacity }}
        />

        {/* Bandpass filter */}
        <g className="ares-ndir-filter">
          <rect x="462" y="50" width="16" height="80" />
          <text x="470" y="40" textAnchor="middle" className="ares-ndir-label">
            {BAND_UM} µm bandpass filter
          </text>
        </g>

        {/* Beam: filter -> detector */}
        <line
          x1="478" y1="90" x2="560" y2="90"
          className="ares-ndir-beam-line ares-ndir-beam-line-out"
          style={{ opacity: beamOpacity }}
        />

        {/* Detector */}
        <g className="ares-ndir-detector">
          <rect x="560" y="65" width="40" height="50" rx="4" />
          <text x="580" y="140" textAnchor="middle" className="ares-ndir-label">
            detector
          </text>
        </g>
      </svg>

      <div className="ares-ndir-detector-bar" aria-hidden="true">
        <div
          className="ares-ndir-detector-bar-fill"
          style={{ width: `${signalBarPct}%` }}
        />
      </div>

      <div className="ares-ndir-controls">
        <div className="ares-slider-field">
          <label htmlFor={concId}>
            CO₂ concentration — {ppm.toLocaleString('en-US')} ppm
          </label>
          <input
            id={concId}
            type="range"
            min={CONCENTRATION_PPM_MIN}
            max={CONCENTRATION_PPM_MAX}
            step={50}
            value={ppm}
            onChange={(e) => setPpm(Number(e.target.value))}
          />
        </div>

        <div className="ares-slider-field">
          <label htmlFor={pathId}>
            Optical path length — {pathLengthMm} mm
          </label>
          <input
            id={pathId}
            type="range"
            min={PATH_LENGTH_MM_MIN}
            max={PATH_LENGTH_MM_MAX}
            step={5}
            value={pathLengthMm}
            onChange={(e) => setPathLengthMm(Number(e.target.value))}
          />
        </div>
      </div>

      <p aria-live="polite" className="ares-ndir-readout">
        {readout}
      </p>

      <p className="ares-ndir-prose">
        "Non-dispersive" is the part of NDIR most readers get wrong: it does
        not mean simple, it means there is no monochromator and no grating
        splitting the light into a spectrum. A broadband infrared source
        floods the whole gas path, and a fixed bandpass filter — tuned to the
        {' '}{BAND_UM} µm CO₂ absorption band — is what selects the band the
        detector actually reads.
      </p>

      <p className="ares-caption">
        An NDIR sensor measures the number of absorbing molecules in its
        optical path, which tracks partial pressure — so an uncorrected ppm
        reading drifts with ambient pressure even when the mole fraction has
        not changed. Illustrative absorptivity, chosen for legibility across
        this range.
      </p>
    </div>
  );
}
