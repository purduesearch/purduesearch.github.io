import React, { useState } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  ReferenceLine,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import AnalyticsCard from '../AnalyticsCard';
import { axisProps, gridProps, tooltipProps, legendProps, getThemeColors } from '../analyticsTheme';

const CSV_COLUMNS = [
  { key: 'start', label: 'Bucket start' },
  { key: 'label', label: 'Bucket' },
  { key: 'created', label: 'Created' },
  { key: 'completed', label: 'Completed' },
  { key: 'net', label: 'Net (created - completed)' },
];

function isEmpty(rows) {
  return !rows.length || rows.every(r => !r.created && !r.completed);
}

/**
 * Work arriving vs work leaving, per bucket. `net` is created minus completed, so it
 * goes negative in the buckets where the team is draining the backlog — hence the zero
 * reference line, which is the only place the sign of that series is readable.
 */
export default function ThroughputCard({ data = [] }) {
  const [chartType, setChartType] = useState('bar');
  const c = getThemeColors();

  const empty = isEmpty(data);

  return (
    <AnalyticsCard
      title="Throughput"
      subtitle="Created above completed means the backlog is growing."
      chartTypes={['bar', 'line']}
      chartType={chartType}
      onChartTypeChange={setChartType}
      csv={empty ? null : { filename: 'throughput.csv', rows: data, columns: CSV_COLUMNS }}
      height={260}
    >
      {empty ? (
        <div className="pm-an-empty">
          <i className="fas fa-arrow-right-arrow-left" aria-hidden="true" />
          <p>No tasks were created or completed in this range.</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid {...gridProps()} />
            <XAxis dataKey="label" {...axisProps({ minTickGap: 12 })} />
            <YAxis allowDecimals={false} {...axisProps()} />
            <Tooltip {...tooltipProps()} />
            <Legend {...legendProps()} />
            <ReferenceLine y={0} stroke={c.border} />

            {/* Rendered one series at a time rather than as two fragments: recharts
                discovers its series by walking `children`, and a Fragment wrapper is a
                needless bet on how deeply it flattens. */}
            {chartType === 'bar' ? (
              <Bar dataKey="created" name="Created" fill={c.amber} radius={[3, 3, 0, 0]} maxBarSize={22} />
            ) : (
              <Line type="monotone" dataKey="created" name="Created" stroke={c.amber} strokeWidth={2} dot={false} />
            )}

            {chartType === 'bar' ? (
              <Bar dataKey="completed" name="Completed" fill={c.teal} radius={[3, 3, 0, 0]} maxBarSize={22} />
            ) : (
              <Line type="monotone" dataKey="completed" name="Completed" stroke={c.teal} strokeWidth={2} dot={false} />
            )}

            <Line
              type="monotone"
              dataKey="net"
              name="Net"
              stroke={c.violet}
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </AnalyticsCard>
  );
}
