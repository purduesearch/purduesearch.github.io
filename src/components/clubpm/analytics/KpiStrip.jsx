import React from 'react';

/**
 * `goodDirection` is declared per KPI rather than inferred from the sign of the delta.
 * A rising overdue count and a rising blocker count are bad news; a rising completion
 * percentage is good news, and the numbers themselves cannot tell the two apart.
 * `null` means the metric has no better or worse direction (hours logged), so its chip
 * shows the movement without passing judgement on it.
 */
const KPIS = [
  {
    key: 'completionPct',
    label: 'Completion',
    goodDirection: 'up',
    format: v => `${Math.round(v)}%`,
    formatDelta: d => `${Math.abs(d)} pts`,
  },
  {
    key: 'doneThisPeriod',
    label: 'Done this period',
    goodDirection: 'up',
    format: v => String(v),
    formatDelta: d => String(Math.abs(d)),
  },
  {
    key: 'avgCycleDays',
    label: 'Avg cycle time',
    goodDirection: 'down',
    format: v => `${v}d`,
    formatDelta: d => `${Math.abs(d)}d`,
  },
  {
    key: 'overdue',
    label: 'Overdue',
    goodDirection: 'down',
    format: v => String(v),
    formatDelta: d => String(Math.abs(d)),
  },
  {
    key: 'hoursLogged',
    label: 'Hours logged',
    goodDirection: null,
    format: v => `${v}h`,
    formatDelta: d => `${Math.abs(d)}h`,
  },
  {
    key: 'activeBlockers',
    label: 'Active blockers',
    goodDirection: 'down',
    format: v => String(v),
    formatDelta: d => String(Math.abs(d)),
  },
];

function deltaTone(delta, goodDirection) {
  if (delta === 0) return 'flat';
  if (!goodDirection) return 'flat';
  const rising = delta > 0;
  return (goodDirection === 'up') === rising ? 'good' : 'bad';
}

function DeltaChip({ delta, goodDirection, formatDelta }) {
  const tone = deltaTone(delta, goodDirection);
  const direction = delta === 0 ? 'flat' : delta > 0 ? 'up' : 'down';
  const icon =
    direction === 'up' ? 'fa-arrow-up' : direction === 'down' ? 'fa-arrow-down' : 'fa-minus';
  const spoken =
    direction === 'flat' ? 'no change' : `${direction} ${formatDelta(delta)} vs previous period`;

  return (
    <span className={`pm-an-kpi-delta is-${tone}`} title={spoken}>
      <i className={`fas ${icon}`} aria-hidden="true" />
      <span>{direction === 'flat' ? 'No change' : formatDelta(delta)}</span>
    </span>
  );
}

/**
 * The six headline numbers, fed straight from `useAnalyticsData().kpis`. Each entry is
 * `{ value, delta }`; a `null` delta (no preceding window to compare against) renders
 * no chip at all rather than a misleading zero.
 */
export default function KpiStrip({ kpis }) {
  const data = kpis || {};

  return (
    <div className="pm-an-kpis">
      {KPIS.map(({ key, label, goodDirection, format, formatDelta }) => {
        const entry = data[key] || {};
        const value = Number.isFinite(entry.value) ? entry.value : 0;
        const delta = Number.isFinite(entry.delta) ? entry.delta : null;

        return (
          <div className="pm-an-kpi" key={key}>
            <span className="pm-an-kpi-label">{label}</span>
            <span className="pm-an-kpi-value">{format(value)}</span>
            {delta === null ? null : (
              <DeltaChip delta={delta} goodDirection={goodDirection} formatDelta={formatDelta} />
            )}
          </div>
        );
      })}
    </div>
  );
}
