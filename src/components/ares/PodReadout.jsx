import { useId, useMemo, useState } from 'react';
import { POD_POSITIONS, breathTrace, sampleAt } from '../../lib/ares/breathModel';
import { PLUME } from './aresPhysics';

/**
 * PodReadout — the three-pod head diagram, the scrubbable breath cycle, and
 * the live rebreathed-fraction readout.
 *
 * This is the component the "top pod is in the plume" finding was cleared
 * for. Toggling "Put the top pod in the plume" does not add noise to the
 * trace — it produces a clean, stable, confidently wrong number, biased low.
 * The honest and contaminated traces are computed side by side so that
 * comparison is always on screen, not just at whatever scrub position the
 * visitor happens to land on.
 *
 * A negative rebreathed fraction is not hidden or clamped away here: with the
 * contaminated reference, f_rb is negative for most of the breath cycle. That
 * is rendered plainly, with the explanation that a negative value means the
 * reference is reading higher than the signal — itself direct evidence the
 * reference is contaminated, and a stronger demonstration of the finding than
 * a merely smaller positive number would be.
 */

// Display-only chart geometry and colour domain. Not physical constants —
// aresPhysics.js has none of these. samples=60 covers exactly one breath
// (breathModel.js's internal breath period), so the scrub control sweeps one
// full exhale/inhale rather than several repeats of the same waveform.
const SAMPLES = 60;
const PLOT_W = 560;
const PLOT_H = 160;
const PAD_X = 12;
const PAD_Y = 10;
const CHART_MIN_PPM = 350;
const CHART_MAX_PPM = 2300;

const xFor = (i) => PAD_X + (i / (SAMPLES - 1)) * (PLOT_W - PAD_X * 2);
const yFor = (ppm) => {
  const clamped = Math.min(CHART_MAX_PPM, Math.max(CHART_MIN_PPM, ppm));
  const frac = (clamped - CHART_MIN_PPM) / (CHART_MAX_PPM - CHART_MIN_PPM);
  return PAD_Y + (1 - frac) * (PLOT_H - PAD_Y * 2);
};
const pointsFor = (channel) => channel.map((v, i) => `${xFor(i)},${yFor(v)}`).join(' ');

const fmtPpm = (v) => Math.round(v).toLocaleString('en-US');
const fmtPct = (f) => `${(f * 100).toFixed(1)} %`;

/** The highest f_rb reached anywhere in a trace — where the measurement is meaningful. */
function peakFRb(trace) {
  let peak = null;
  for (let i = 0; i < trace.t.length; i += 1) {
    const f = sampleAt(trace, i).fRb;
    if (f !== null && (peak === null || f > peak)) peak = f;
  }
  return peak;
}

function liveSentence(current) {
  const chinTxt = `chin CO₂ ${fmtPpm(current.chin)} ppm`;
  const topTxt = `top (reference) CO₂ ${fmtPpm(current.top)} ppm`;
  const foreheadTxt = `forehead CO₂ ${fmtPpm(current.forehead)} ppm`;
  const base = `At this point in the breath cycle: ${chinTxt}, ${topTxt}, ${foreheadTxt}.`;

  if (current.fRb === null) {
    return `${base} Rebreathed fraction is undefined here — the exhaled reference and the top reading coincide.`;
  }
  if (current.fRb < 0) {
    return `${base} Rebreathed fraction reads ${fmtPct(current.fRb)}, which is not a physical result — it means the reference is reading higher than the signal, direct evidence the reference is contaminated.`;
  }
  return `${base} Rebreathed fraction is ${fmtPct(current.fRb)}.`;
}

export default function PodReadout() {
  const scrubId = useId();
  const [selectedPod, setSelectedPod] = useState('top');
  const [contaminatedTop, setContaminatedTop] = useState(false);
  const [scrub, setScrub] = useState(0);

  const honestTrace = useMemo(() => breathTrace({ samples: SAMPLES, contaminatedTop: false }), []);
  const contaminatedTrace = useMemo(() => breathTrace({ samples: SAMPLES, contaminatedTop: true }), []);
  const activeTrace = contaminatedTop ? contaminatedTrace : honestTrace;

  const current = sampleAt(activeTrace, scrub);
  const honestPeak = useMemo(() => peakFRb(honestTrace), [honestTrace]);
  const contaminatedPeak = useMemo(() => peakFRb(contaminatedTrace), [contaminatedTrace]);

  const chinPoints = useMemo(() => pointsFor(activeTrace.chin), [activeTrace]);
  const topPoints = useMemo(() => pointsFor(activeTrace.top), [activeTrace]);
  const foreheadPoints = useMemo(() => pointsFor(activeTrace.forehead), [activeTrace]);
  const cursorX = xFor(current.index);
  const baselineY = yFor(CHART_MIN_PPM);

  const selected = POD_POSITIONS.find((p) => p.id === selectedPod) ?? POD_POSITIONS[0];

  return (
    <div className="ares-pod-readout">
      <div className="ares-pod-head-wrap">
        <svg
          className="ares-pod-head-svg"
          viewBox="0 0 200 220"
          aria-hidden="true"
          focusable="false"
        >
          <path
            className="ares-pod-head-outline"
            d="M100,18
               C132,18 152,42 156,72
               C158,84 154,92 146,96
               C150,102 148,110 140,116
               C136,126 126,132 114,134
               L108,134
               C110,142 106,150 96,152
               L82,152
               C58,150 42,132 38,104
               C34,72 44,32 100,18 Z"
          />
          <line className="ares-pod-head-neck" x1="82" y1="152" x2="82" y2="196" />
          <line className="ares-pod-head-shoulder" x1="46" y1="196" x2="118" y2="196" />
        </svg>

        {POD_POSITIONS.map((pod) => (
          <button
            key={pod.id}
            type="button"
            className={`ares-pod-marker ares-pod-marker--${pod.id}${selectedPod === pod.id ? ' is-selected' : ''}`}
            aria-pressed={selectedPod === pod.id}
            onClick={() => setSelectedPod(pod.id)}
          >
            <span className="ares-pod-marker-dot" aria-hidden="true" />
            <span className="ares-pod-marker-label">{pod.label}</span>
          </button>
        ))}
      </div>

      <div className="ares-pod-detail">
        <h3 className="ares-pod-detail-title">
          {selected.label} pod <span className="ares-pod-detail-role">— {selected.role}</span>
        </h3>
        <p className="ares-pod-detail-where">{selected.where}</p>
        <p className="ares-pod-detail-purpose">{selected.purpose}</p>
      </div>

      <button
        type="button"
        className={`ares-pod-toggle${contaminatedTop ? ' is-active' : ''}`}
        aria-pressed={contaminatedTop}
        onClick={() => setContaminatedTop((v) => !v)}
      >
        <i className="fas fa-triangle-exclamation" aria-hidden="true" />
        Put the top pod in the plume
      </button>

      <ul className="ares-pod-legend">
        <li className="ares-pod-legend-item ares-pod-legend-item--chin">
          <span className="ares-pod-legend-swatch" aria-hidden="true" />
          Chin — signal
        </li>
        <li className="ares-pod-legend-item ares-pod-legend-item--top">
          <span className="ares-pod-legend-swatch" aria-hidden="true" />
          Top — reference
        </li>
        <li className="ares-pod-legend-item ares-pod-legend-item--forehead">
          <span className="ares-pod-legend-swatch" aria-hidden="true" />
          Forehead — thermal
        </li>
      </ul>

      <svg
        className="ares-pod-chart"
        viewBox={`0 0 ${PLOT_W} ${PLOT_H}`}
        aria-hidden="true"
        focusable="false"
      >
        <line
          className="ares-pod-chart-baseline"
          x1={PAD_X}
          x2={PLOT_W - PAD_X}
          y1={baselineY}
          y2={baselineY}
        />
        <polyline className="ares-pod-trace ares-pod-trace--forehead" points={foreheadPoints} />
        <polyline className="ares-pod-trace ares-pod-trace--top" points={topPoints} />
        <polyline className="ares-pod-trace ares-pod-trace--chin" points={chinPoints} />
        <line
          className="ares-pod-scrub-cursor"
          x1={cursorX}
          x2={cursorX}
          y1={PAD_Y}
          y2={PLOT_H - PAD_Y}
        />
      </svg>

      <div className="ares-pod-scrub-row">
        <label htmlFor={scrubId} className="ares-pod-scrub-label">Breath cycle</label>
        <input
          id={scrubId}
          type="range"
          min="0"
          max={SAMPLES - 1}
          value={scrub}
          onChange={(e) => setScrub(Number(e.target.value))}
          className="ares-pod-scrub"
        />
      </div>

      <div className="ares-pod-value">
        <span className={`ares-pod-value-number${current.fRb !== null && current.fRb < 0 ? ' is-negative' : ''}`}>
          {current.fRb === null ? '—' : fmtPct(current.fRb)}
        </span>
        <span className="ares-pod-value-tag">
          {current.fRb === null
            ? 'undefined at this point'
            : current.fRb < 0
              ? 'not physical — reference reads higher than signal'
              : 'rebreathed fraction, f_rb'}
        </span>
      </div>

      {current.fRb !== null && current.fRb < 0 && (
        <p className="ares-pod-negative-note">
          A negative rebreathed fraction is not a smaller measurement — it is the
          arithmetic saying the top pod is reading higher CO₂ than the chin pod
          at this instant. That can only happen if the reference itself has been
          contaminated, which is exactly what putting it in the plume does.
        </p>
      )}

      <p className="ares-pod-peak">
        Peak of this breath — honest reference:{' '}
        <strong>{honestPeak === null ? '—' : fmtPct(honestPeak)}</strong>
        {' · '}contaminated reference:{' '}
        <strong>{contaminatedPeak === null ? '—' : fmtPct(contaminatedPeak)}</strong>
      </p>

      <p className="ares-pod-live" aria-live="polite">
        {liveSentence(current)}
      </p>

      <div className="ares-pod-caveats">
        <p className="ares-pod-formula">
          f_rb = (C_chin − C_top) / (C_exhaled − C_top)
        </p>
        <ul className="ares-pod-caveat-list">
          <li>It is a two-compartment mixing model — chin air is assumed to be exactly reference air plus exhaled breath and nothing else.</li>
          <li>C_top is a reference, not a datum.</li>
          <li>It is a difference, so it inherits both sensors&rsquo; errors.</li>
        </ul>
      </div>

      <p className="ares-caption">
        On the current headset the top pod sits at the crown — the top of a plume
        that has spent {PLUME.developmentLengthM.toFixed(1)} m gathering everything
        it swept off the body. A reference standing in the exhaust does not add
        noise. It produces a clean, stable, confidently wrong number, biased low.
        The next revision moves it behind the crown. Illustrative waveforms, not
        recorded data.
      </p>
    </div>
  );
}
