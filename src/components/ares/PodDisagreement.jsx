import { useId, useMemo, useState } from 'react';
import { differenceBudget } from '../../lib/ares/noisyDifference';

/**
 * PodDisagreement — makes GLOSSARY §2's third rebreathed-fraction caveat
 * ("it is a difference, so it inherits both sensors' errors") visible rather
 * than asserted. Three pod readings with their own error bars sit next to a
 * fourth bar for chin minus top, whose error bar is always larger, because
 * independent errors add in quadrature (src/lib/ares/noisyDifference.js).
 *
 * Illustrative pod readings — NOT recorded ARES data. Chosen to sit in a
 * plausible range (a chin reading well into rebreathed air, an
 * outdoor-ambient top reading) purely so the bars read naturally; every
 * number below is a display choice for this component, not a physical
 * constant and not a logged measurement. The on-screen copy says so too.
 */
const ILLUSTRATIVE_TOP_PPM = 420;
const ILLUSTRATIVE_FOREHEAD_PPM = 900;
const ILLUSTRATIVE_CHIN_PPM = 1850;

const NOISE_MIN_PPM = 10;
const NOISE_MAX_PPM = 80;
const NOISE_DEFAULT_PPM = 30;

/* Chart layout only — SVG coordinates and pixel sizes, not physical
   quantities. VALUE_DOMAIN_MAX_PPM fixes the chart's horizontal scale so it
   does not rescale as the noise slider moves. ERROR_BAR_EXAGGERATION
   stretches every whisker by the same factor so the whiskers stay legible at
   chart size — the ratio between the difference whisker and the reading
   whiskers, the whole point of this chart, is unaffected because every
   whisker uses the same factor. */
const CHART_WIDTH = 680;
const CHART_HEIGHT = 284;
const CHART_MARGIN_TOP = 24;
const CHART_MARGIN_LEFT = 140;
const ROW_HEIGHT = 60;
const BAR_HEIGHT = 22;
const VALUE_DOMAIN_MAX_PPM = 2100;
const ERROR_BAR_EXAGGERATION = 5;

const PLOT_WIDTH = CHART_WIDTH - CHART_MARGIN_LEFT - 90;
const PX_PER_PPM = PLOT_WIDTH / VALUE_DOMAIN_MAX_PPM;

const numberFmt = (v, decimals = 0) =>
  Number.isFinite(v)
    ? v.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })
    : '—';

function ErrorBarRow({ index, label, value, sigma, highlight }) {
  const rowTop = CHART_MARGIN_TOP + index * ROW_HEIGHT;
  const barY = rowTop + 26;
  const centerY = barY + BAR_HEIGHT / 2;
  const barWidth = Math.max(0, value * PX_PER_PPM);
  const barEndX = CHART_MARGIN_LEFT + barWidth;
  const whiskerHalf = Math.max(0, sigma * PX_PER_PPM * ERROR_BAR_EXAGGERATION);
  const capTop = centerY - 9;
  const capBottom = centerY + 9;

  return (
    <g className={highlight ? 'ares-pod-row ares-pod-row-difference' : 'ares-pod-row'}>
      {highlight && (
        <rect
          className="ares-pod-row-highlight"
          x={4}
          y={rowTop - 4}
          width={CHART_WIDTH - 8}
          height={ROW_HEIGHT - 6}
          rx={8}
        />
      )}
      <text
        className="ares-pod-row-label"
        x={CHART_MARGIN_LEFT - 14}
        y={centerY + 4}
        textAnchor="end"
      >
        {label}
      </text>
      <rect
        className="ares-pod-bar"
        x={CHART_MARGIN_LEFT}
        y={barY}
        width={barWidth}
        height={BAR_HEIGHT}
        rx={3}
      />
      <line
        className="ares-pod-whisker"
        x1={barEndX - whiskerHalf}
        x2={barEndX + whiskerHalf}
        y1={centerY}
        y2={centerY}
      />
      <line
        className="ares-pod-whisker-cap"
        x1={barEndX - whiskerHalf}
        x2={barEndX - whiskerHalf}
        y1={capTop}
        y2={capBottom}
      />
      <line
        className="ares-pod-whisker-cap"
        x1={barEndX + whiskerHalf}
        x2={barEndX + whiskerHalf}
        y1={capTop}
        y2={capBottom}
      />
      <text className="ares-pod-row-value" x={CHART_MARGIN_LEFT} y={barY - 8}>
        {numberFmt(value)} ppm ± {numberFmt(sigma, 1)}
      </text>
    </g>
  );
}

export default function PodDisagreement() {
  const idBase = useId();
  const [noise, setNoise] = useState(NOISE_DEFAULT_PPM);

  const budget = useMemo(
    () =>
      differenceBudget({
        chin: ILLUSTRATIVE_CHIN_PPM,
        top: ILLUSTRATIVE_TOP_PPM,
        sigmaChin: noise,
        sigmaTop: noise,
      }),
    [noise],
  );

  const noiseId = `${idBase}-noise`;
  const titleId = `${idBase}-chart-title`;

  const rows = [
    { key: 'top', label: 'Top', value: ILLUSTRATIVE_TOP_PPM, sigma: noise, highlight: false },
    {
      key: 'forehead',
      label: 'Forehead',
      value: ILLUSTRATIVE_FOREHEAD_PPM,
      sigma: noise,
      highlight: false,
    },
    { key: 'chin', label: 'Chin', value: ILLUSTRATIVE_CHIN_PPM, sigma: noise, highlight: false },
    {
      key: 'difference',
      label: 'Chin − top',
      value: budget.difference,
      sigma: budget.sigmaDifference,
      highlight: true,
    },
  ];

  const relativeErrorText =
    budget.relativeError === null ? '—' : `${numberFmt(budget.relativeError * 100, 1)} %`;

  const summary =
    `At ${noise} ppm of per-pod noise: chin minus top differs by ` +
    `${numberFmt(budget.difference)} ppm, with a propagated uncertainty of ` +
    `±${numberFmt(budget.sigmaDifference, 1)} ppm — a relative error of ` +
    `${relativeErrorText}.`;

  return (
    <div className="ares-pod-disagreement">
      <div className="ares-pod-slider-field">
        <label htmlFor={noiseId}>Per-pod noise (σ) — {noise} ppm</label>
        <input
          id={noiseId}
          type="range"
          min={NOISE_MIN_PPM}
          max={NOISE_MAX_PPM}
          step={1}
          value={noise}
          onChange={(e) => setNoise(Number(e.target.value))}
        />
        <p className="ares-pod-slider-note">
          Illustrative readings, not recorded ARES data — chosen only to show
          how the four bars respond as per-pod sensor noise grows.
        </p>
      </div>

      <svg
        className="ares-pod-disagreement-chart"
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        role="img"
        aria-labelledby={titleId}
      >
        <title id={titleId}>
          Bar chart comparing top, forehead, and chin pod CO₂ readings with
          error bars, and the chin-minus-top difference with a visibly larger
          error bar.
        </title>
        <line
          className="ares-pod-axis"
          x1={CHART_MARGIN_LEFT}
          x2={CHART_MARGIN_LEFT}
          y1={CHART_MARGIN_TOP - 14}
          y2={CHART_MARGIN_TOP + rows.length * ROW_HEIGHT - 24}
        />
        {rows.map((row, i) => (
          <ErrorBarRow
            key={row.key}
            index={i}
            label={row.label}
            value={row.value}
            sigma={row.sigma}
            highlight={row.highlight}
          />
        ))}
      </svg>

      <p aria-live="polite" className="ares-pod-disagreement-readout">
        {summary}
      </p>

      <div className="ares-pod-baseline">
        <p className="ares-pod-baseline-lead">
          <strong>A note on automatic baseline correction.</strong> Many CO₂
          sensors correct their own drift by periodically re-zeroing to the
          lowest concentration they have seen over a multi-day window, on the
          assumption that the sensor meets genuinely fresh outdoor air at some
          point in that window.
        </p>
        <p>
          A headset pod spends its life within about a metre of a CO₂ source —
          the wearer&rsquo;s own breath. It can go a multi-day window without
          ever seeing outdoor air, so the &ldquo;lowest concentration
          seen&rdquo; is not a fresh-air baseline at all — it is just
          whichever moment happened to be least crowded. Re-zeroing to that
          point does not remove the drift; it quietly redefines zero to a
          value that was never actually ambient air.
        </p>
      </div>

      <p className="ares-caption">
        Independent errors add in quadrature, so the difference of two readings is
        noisier than either one. Three pods disagreeing is not a fault — it is what
        three independent instruments do. Deciding how much of the disagreement is
        real is what calibration is for.
      </p>
    </div>
  );
}
