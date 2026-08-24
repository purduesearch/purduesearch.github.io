import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { transportDelay, stepResponse } from '../../lib/ares/stepResponseModel';
import usePrefersReducedMotion from '../../hooks/usePrefersReducedMotion';

/**
 * Transport delay vs. T90 — the two quantities that get conflated constantly.
 *
 * Transport delay is a property of the plumbing (how long gas takes to reach
 * the sensor); T90 is a property of the sensor (how long it takes to react
 * once the gas is there). The plot below draws them as two visually distinct
 * phases of one curve: a flat "nothing happening yet" region up to the delay,
 * then an exponential rise measured from the moment the gas arrives.
 *
 * Flow is held fixed and generic (1.0 L/min) — it is not exposed as a slider.
 * All defaults here are illustrative; see the caption and the model's own
 * doc comment in stepResponseModel.js for the clearance note.
 */

const FLOW_LPM = 1.0; // fixed, illustrative — not user-adjustable in this component
const VIEW_W = 640;
const VIEW_H = 300;
const PAD = { left: 44, right: 18, top: 54, bottom: 34 };
const PLOT_W = VIEW_W - PAD.left - PAD.right;
const PLOT_H = VIEW_H - PAD.top - PAD.bottom;
const SAMPLES = 300;
const SWEEP_PERIOD_MS = 4000;

const fmtSeconds = (n) => (
  Number.isFinite(n)
    ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—'
);

export default function DelayVsT90() {
  const tubeLengthId = useId();
  const boreId = useId();
  const t90Id = useId();

  const [tubeLengthM, setTubeLengthM] = useState(1.0);
  const [tubeIdMm, setTubeIdMm] = useState(4);
  const [t90Seconds, setT90Seconds] = useState(2);
  const [playheadT, setPlayheadT] = useState(0);

  const reducedMotion = usePrefersReducedMotion();
  const wrapRef = useRef(null);

  const result = useMemo(() => {
    const delay = transportDelay({ tubeLengthM, tubeIdMm, flowLpm: FLOW_LPM }) ?? 0;
    const duration = Math.max(4, (delay + t90Seconds) * 1.3);
    return stepResponse({
      tubeLengthM, tubeIdMm, flowLpm: FLOW_LPM, t90Seconds, duration, samples: SAMPLES,
    });
  }, [tubeLengthM, tubeIdMm, t90Seconds]);

  const { t, value, tDelay, tFiftyCrossing, tNinety } = result;
  const duration = t.length ? t[t.length - 1] : 1;
  const totalLag = tDelay + t90Seconds;

  // Sweeping playhead is decoration layered on top of the always-drawn static
  // curve below — skipping it under reduced motion loses no information, it
  // just stops the motion. Cancelled on unmount and gated offscreen.
  useEffect(() => {
    if (reducedMotion) return undefined;
    const el = wrapRef.current;
    if (!el) return undefined;

    let raf = null;
    let start = null;
    let active = false;

    const tick = (now) => {
      if (start === null) start = now;
      const phase = ((now - start) % SWEEP_PERIOD_MS) / SWEEP_PERIOD_MS;
      setPlayheadT(phase * duration);
      raf = requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !active) {
        active = true;
        start = null;
        raf = requestAnimationFrame(tick);
      } else if (!entry.isIntersecting && active) {
        active = false;
        if (raf !== null) cancelAnimationFrame(raf);
        raf = null;
      }
    }, { threshold: 0.15 });

    observer.observe(el);

    return () => {
      observer.disconnect();
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [reducedMotion, duration]);

  const xScale = (tt) => PAD.left + (tt / duration) * PLOT_W;
  const yScale = (vv) => PAD.top + (1 - vv) * PLOT_H;

  const splitIndex = useMemo(() => {
    const idx = t.findIndex((tt) => tt >= tDelay);
    return idx === -1 ? t.length - 1 : idx;
  }, [t, tDelay]);

  // Memoized on the data they actually depend on (t/value from the fixed
  // `result` memo, splitIndex, duration) — NOT on the xScale/yScale closures
  // above, which are new function identities every render. The sweeping
  // playhead calls setPlayheadT every animation frame (~60/s), so without
  // this these two 300-point slice+map+join passes, plus the SVG diffing a
  // 300-point `points` string, would redo on every frame even though the
  // curve itself hasn't changed. Scale math is inlined from `duration` alone
  // so the memo doesn't need to depend on those unstable closures.
  const flatPoints = useMemo(() => {
    const scaleX = (tt) => PAD.left + (tt / duration) * PLOT_W;
    const scaleY = (vv) => PAD.top + (1 - vv) * PLOT_H;
    return t
      .slice(0, splitIndex + 1)
      .map((tt, i) => `${scaleX(tt)},${scaleY(value[i])}`)
      .join(' ');
  }, [t, value, splitIndex, duration]);

  const risePoints = useMemo(() => {
    const scaleX = (tt) => PAD.left + (tt / duration) * PLOT_W;
    const scaleY = (vv) => PAD.top + (1 - vv) * PLOT_H;
    return t
      .slice(splitIndex)
      .map((tt, i) => `${scaleX(tt)},${scaleY(value[splitIndex + i])}`)
      .join(' ');
  }, [t, value, splitIndex, duration]);

  const playheadIndex = duration > 0
    ? Math.min(SAMPLES - 1, Math.max(0, Math.round((playheadT / duration) * (SAMPLES - 1))))
    : 0;
  const playheadValue = value[playheadIndex] ?? 0;
  const showPlayhead = !reducedMotion;

  const fiftyT = tFiftyCrossing ?? tDelay;
  const xDelay = xScale(tDelay);
  const xFifty = xScale(fiftyT);
  const xNinety = xScale(tNinety);
  const yDelayPt = yScale(0);
  const yFiftyPt = yScale(0.5);
  const yNinetyPt = yScale(0.9);

  return (
    <div className="ares-delay-vs-t90" ref={wrapRef}>
      <div className="ares-dvt90-controls">
        <div className="ares-dvt90-slider">
          <label htmlFor={tubeLengthId}>Tube length</label>
          <input
            id={tubeLengthId}
            type="range"
            min={0.2}
            max={4}
            step={0.1}
            value={tubeLengthM}
            onChange={(e) => setTubeLengthM(Number(e.target.value))}
          />
          <span className="ares-dvt90-slider-value">{tubeLengthM.toFixed(1)} m</span>
        </div>

        <div className="ares-dvt90-slider">
          <label htmlFor={boreId}>Tube bore</label>
          <input
            id={boreId}
            type="range"
            min={2}
            max={8}
            step={0.5}
            value={tubeIdMm}
            onChange={(e) => setTubeIdMm(Number(e.target.value))}
          />
          <span className="ares-dvt90-slider-value">{tubeIdMm.toFixed(1)} mm</span>
        </div>

        <div className="ares-dvt90-slider">
          <label htmlFor={t90Id}>Sensor T90</label>
          <input
            id={t90Id}
            type="range"
            min={0.5}
            max={8}
            step={0.1}
            value={t90Seconds}
            onChange={(e) => setT90Seconds(Number(e.target.value))}
          />
          <span className="ares-dvt90-slider-value">{t90Seconds.toFixed(1)} s</span>
        </div>

        <div className="ares-dvt90-flow-note">
          <i className="fas fa-water" aria-hidden="true" />
          <span>Flow held fixed at 1.0 L/min (illustrative)</span>
        </div>
      </div>

      <svg
        className="ares-dvt90-plot"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        role="img"
        aria-label="Plot of sensor reading against time. A flat region shows gas still in transit; an exponential rise follows once it arrives."
      >
        {/* Phase backgrounds — visually distinct without reading a label */}
        <rect
          className="ares-dvt90-zone-transit"
          x={PAD.left}
          y={PAD.top}
          width={Math.max(0, xDelay - PAD.left)}
          height={PLOT_H}
        />
        <rect
          className="ares-dvt90-zone-arrived"
          x={xDelay}
          y={PAD.top}
          width={Math.max(0, VIEW_W - PAD.right - xDelay)}
          height={PLOT_H}
        />

        {/* Gridlines at value 0 and 1 */}
        <line className="ares-dvt90-grid" x1={PAD.left} y1={yScale(0)} x2={VIEW_W - PAD.right} y2={yScale(0)} />
        <line className="ares-dvt90-grid" x1={PAD.left} y1={yScale(1)} x2={VIEW_W - PAD.right} y2={yScale(1)} />
        <text className="ares-dvt90-axis-label" x={PAD.left - 8} y={yScale(0) + 4} textAnchor="end">0</text>
        <text className="ares-dvt90-axis-label" x={PAD.left - 8} y={yScale(1) + 4} textAnchor="end">1</text>
        <text className="ares-dvt90-axis-label" x={PAD.left} y={VIEW_H - 10} textAnchor="start">0 s</text>
        <text className="ares-dvt90-axis-label" x={VIEW_W - PAD.right} y={VIEW_H - 10} textAnchor="end">
          {duration.toFixed(1)} s
        </text>

        {/* The two phases, styled distinctly */}
        <polyline className="ares-dvt90-trace-flat" points={flatPoints} />
        <polyline className="ares-dvt90-trace-rise" points={risePoints} />

        {/* Landmark: gas arrives (transport delay) */}
        <g className="ares-dvt90-landmark ares-dvt90-landmark-delay">
          <line x1={xDelay} y1={PAD.top} x2={xDelay} y2={VIEW_H - PAD.bottom} />
          <circle cx={xDelay} cy={yDelayPt} r={4} />
          <rect x={PAD.left} y={6} width={8} height={8} />
          <text x={PAD.left + 12} y={14}>gas arrives</text>
        </g>

        {/* Landmark: 50% crossing — where the delay is actually measured */}
        <g className="ares-dvt90-landmark ares-dvt90-landmark-fifty">
          <line x1={xFifty} y1={PAD.top} x2={xFifty} y2={VIEW_H - PAD.bottom} />
          <circle cx={xFifty} cy={yFiftyPt} r={4} />
          <rect x={PAD.left} y={20} width={8} height={8} />
          <text x={PAD.left + 12} y={28}>measure the delay here — 50 % crossing</text>
        </g>

        {/* Landmark: 90% of final (T90, measured from arrival) */}
        <g className="ares-dvt90-landmark ares-dvt90-landmark-ninety">
          <line x1={xNinety} y1={PAD.top} x2={xNinety} y2={VIEW_H - PAD.bottom} />
          <circle cx={xNinety} cy={yNinetyPt} r={4} />
          <rect x={PAD.left} y={34} width={8} height={8} />
          <text x={PAD.left + 12} y={42}>90 % of final</text>
        </g>

        {showPlayhead && (
          <g className="ares-dvt90-playhead">
            <line
              x1={xScale(playheadT)}
              y1={PAD.top}
              x2={xScale(playheadT)}
              y2={VIEW_H - PAD.bottom}
            />
            <circle cx={xScale(playheadT)} cy={yScale(playheadValue)} r={5} />
          </g>
        )}
      </svg>

      <p aria-live="polite" className="ares-dvt90-readout">
        Transport delay is {fmtSeconds(tDelay)} s, sensor T90 is {fmtSeconds(t90Seconds)} s,
        for a total observed lag of {fmtSeconds(totalLag)} s.
      </p>

      <p className="ares-caption">
        Illustrative values — not ARES hardware figures. Transport delay is a
        property of the plumbing; T90 is a property of the sensor. Total observed
        lag is the sum of the two, and they are corrected differently: the delay is
        subtracted, the T90 is deconvolved or lived with. Because dispersion smears
        the step, the delay is measured at the 50 % crossing, not at first movement.
      </p>
    </div>
  );
}
