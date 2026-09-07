import React from 'react';
import {
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import AnalyticsCard from '../AnalyticsCard';
import { axisProps, gridProps, tooltipProps, legendProps, STATUS_COLORS } from '../analyticsTheme';

/**
 * Render order is stack order: recharts stacks the first `<Area>` at the bottom, so
 * this array reads bottom-to-top exactly as written.
 */
const BANDS = [
  { key: 'TODO', label: 'To Do' },
  { key: 'IN_PROGRESS', label: 'In Progress' },
  { key: 'BLOCKED', label: 'Blocked' },
  { key: 'DONE', label: 'Done' },
];

const CSV_COLUMNS = [{ key: 'date', label: 'Date' }, ...BANDS.map(b => ({ key: b.key, label: b.label }))];

function isEmpty(rows) {
  return !rows.length || rows.every(r => !BANDS.some(b => r[b.key] > 0));
}

/**
 * Cumulative flow diagram. There is no chart-type switch: a CFD *is* a stacked area —
 * rendered as lines or bars it stops being the thing it is named after.
 */
export default function CumulativeFlowCard({ data = [] }) {
  const empty = isEmpty(data);

  return (
    <AnalyticsCard
      title="Cumulative flow"
      subtitle="Widening bands above DONE mean work in progress is accumulating."
      csv={empty ? null : { filename: 'cumulative-flow.csv', rows: data, columns: CSV_COLUMNS }}
      height={260}
    >
      {empty ? (
        <div className="pm-an-empty">
          <i className="fas fa-layer-group" aria-hidden="true" />
          <p>No tasks existed during this range, so there is no flow to plot.</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid {...gridProps()} />
            <XAxis dataKey="label" {...axisProps({ minTickGap: 24 })} />
            <YAxis allowDecimals={false} {...axisProps()} />
            <Tooltip {...tooltipProps()} />
            <Legend {...legendProps()} />

            {BANDS.map(band => (
              <Area
                key={band.key}
                type="monotone"
                dataKey={band.key}
                name={band.label}
                stackId="cfd"
                stroke={STATUS_COLORS[band.key]}
                fill={STATUS_COLORS[band.key]}
                fillOpacity={0.35}
                strokeWidth={1.5}
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </AnalyticsCard>
  );
}
