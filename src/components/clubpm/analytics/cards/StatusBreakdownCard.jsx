import React, { useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import AnalyticsCard from '../AnalyticsCard';
import {
  tooltipProps,
  legendProps,
  getThemeColors,
  STATUS_COLORS,
  PRIORITY_COLORS,
  categorical,
} from '../analyticsTheme';

const DIMENSIONS = [
  { key: 'status', short: 'Status', label: 'status', source: 'statusBreakdown' },
  { key: 'priority', short: 'Priority', label: 'priority', source: 'priorityBreakdown' },
  { key: 'assignee', short: 'Assignee', label: 'assignee', source: 'assigneeBreakdown' },
];

const CSV_COLUMNS = [
  { key: 'key', label: 'Key' },
  { key: 'label', label: 'Label' },
  { key: 'value', label: 'Tasks' },
];

/**
 * Colors come from `analyticsTheme`, not from the `color` the derivation layer already
 * put on each row: the hook's copy is a plain hex constant, while the theme's is
 * resolved from the live ClubPM token, so only the theme tracks a palette change.
 */
function colorFor(dimension, row, index, c) {
  if (dimension === 'status') return STATUS_COLORS[row.key] || c.textSecondary;
  if (dimension === 'priority') return PRIORITY_COLORS[row.key] || c.textSecondary;
  if (row.key === '__unassigned__') return c.textSecondary;
  return categorical(index);
}

/**
 * One donut, three readings. The dimension switcher lives in the card header rather
 * than the `⋯` menu because it changes what the slices *are*; a reader glancing at the
 * card has to be able to tell a priority split from an assignee split without opening
 * anything.
 *
 * The center label is an absolutely positioned HTML overlay. The previous
 * implementation put a bare `<text>` inside `<PieChart>`, which recharts does not
 * position against the pie's center — it landed wherever the SVG's own coordinate
 * origin happened to be, so it drifted with every container resize.
 */
export default function StatusBreakdownCard({ data = {} }) {
  const [dimension, setDimension] = useState('status');
  const c = getThemeColors();

  const active = DIMENSIONS.find(d => d.key === dimension) || DIMENSIONS[0];
  const rows = Array.isArray(data[active.source]) ? data[active.source] : [];
  const shown = rows.filter(r => r.value > 0);
  const total = shown.reduce((s, r) => s + r.value, 0);
  const empty = !total;

  const done = rows.find(r => r.key === 'DONE');
  const completionPct = total ? Math.round(((done ? done.value : 0) / total) * 100) : 0;

  const centerValue = dimension === 'status' ? `${completionPct}%` : String(total);
  const centerCaption = dimension === 'status'
    ? 'complete'
    : `${total === 1 ? 'task' : 'tasks'} by ${active.label}`;

  const switcher = (
    <div className="pm-an-seg" role="group" aria-label="Breakdown dimension">
      {DIMENSIONS.map(d => (
        <button
          key={d.key}
          type="button"
          className={`pm-an-seg-btn${dimension === d.key ? ' is-active' : ''}`}
          aria-pressed={dimension === d.key}
          onClick={() => setDimension(d.key)}
        >
          {d.short}
        </button>
      ))}
    </div>
  );

  return (
    <AnalyticsCard
      title="Breakdown"
      subtitle={`Every task in range, split by ${active.label}.`}
      headerAside={switcher}
      csv={empty ? null : { filename: `breakdown-${dimension}.csv`, rows, columns: CSV_COLUMNS }}
      height={260}
    >
      {empty ? (
        <div className="pm-an-empty">
          <i className="fas fa-chart-pie" aria-hidden="true" />
          <p>There are no tasks in this range to break down.</p>
        </div>
      ) : (
        <div className="pm-an-donut" style={{ position: 'relative', width: '100%', height: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
              <Pie
                data={shown}
                dataKey="value"
                nameKey="label"
                innerRadius="58%"
                outerRadius="82%"
                paddingAngle={2}
                stroke="none"
                isAnimationActive={false}
              >
                {shown.map((row, i) => (
                  <Cell key={row.key} fill={colorFor(dimension, row, i, c)} />
                ))}
              </Pie>
              <Tooltip {...tooltipProps({ cursor: false })} />
              <Legend {...legendProps()} />
            </PieChart>
          </ResponsiveContainer>

          {/* Sits over the hole, ignores the pointer so slice hovers still reach the
              chart underneath. Bottom padding matches the legend's share of the box so
              the label centers on the ring rather than on the container. */}
          <div
            className="pm-an-donut-center"
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              bottom: 34,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              textAlign: 'center',
            }}
          >
            <span style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.1, color: c.textPrimary }}>
              {centerValue}
            </span>
            <span style={{ fontSize: 11, color: c.textSecondary, marginTop: 2 }}>
              {centerCaption}
            </span>
          </div>
        </div>
      )}
    </AnalyticsCard>
  );
}
