import React, { useState } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import AnalyticsCard from '../AnalyticsCard';
import { axisProps, gridProps, tooltipProps, legendProps, getThemeColors } from '../analyticsTheme';

const METRICS = [
  { key: 'count', short: 'Tasks', label: 'Tasks completed' },
  { key: 'points', short: 'Points', label: 'Story points' },
  { key: 'hours', short: 'Hours', label: 'Hours logged' },
];

const CSV_COLUMNS = [
  { key: 'start', label: 'Bucket start' },
  { key: 'label', label: 'Bucket' },
  { key: 'count', label: 'Tasks completed' },
  { key: 'points', label: 'Story points' },
  { key: 'hours', label: 'Hours logged' },
  { key: 'rolling', label: 'Rolling avg (tasks)' },
];

function isEmpty(rows) {
  return !rows.length || rows.every(r => !r.count && !r.points && !r.hours);
}

/**
 * Throughput per bucket with a 3-bucket trailing mean laid over it.
 *
 * The metric switcher sits in the card header, not in the `⋯` menu: it changes what the
 * bars mean, so the reader needs to see which one is active without opening anything.
 *
 * `rolling` is always the trailing mean of the *task count* — `computeVelocity` derives
 * it from `count` alone. On the points and hours views it therefore gets its own
 * right-hand axis, so a count-scaled line is never read against an hours-scaled bar.
 */
export default function VelocityCard({ data = [] }) {
  const [metric, setMetric] = useState('count');
  const [chartType, setChartType] = useState('bar');
  const c = getThemeColors();

  const empty = isEmpty(data);
  const active = METRICS.find(m => m.key === metric) || METRICS[0];
  const sharedAxis = metric === 'count';
  const rollingAxis = sharedAxis ? 'metric' : 'rolling';

  const switcher = (
    <div className="pm-an-seg" role="group" aria-label="Velocity metric">
      {METRICS.map(m => (
        <button
          key={m.key}
          type="button"
          className={`pm-an-seg-btn${metric === m.key ? ' is-active' : ''}`}
          aria-pressed={metric === m.key}
          title={m.label}
          onClick={() => setMetric(m.key)}
        >
          {m.short}
        </button>
      ))}
    </div>
  );

  return (
    <AnalyticsCard
      title="Velocity"
      subtitle={`${active.label} per bucket, with a 3-bucket trailing mean.`}
      chartTypes={['bar', 'line']}
      chartType={chartType}
      onChartTypeChange={setChartType}
      headerAside={switcher}
      csv={empty ? null : { filename: 'velocity.csv', rows: data, columns: CSV_COLUMNS }}
      height={260}
    >
      {empty ? (
        <div className="pm-an-empty">
          <i className="fas fa-chart-column" aria-hidden="true" />
          <p>Nothing was completed in this range, so there is no velocity to show.</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid {...gridProps()} />
            <XAxis dataKey="label" {...axisProps({ minTickGap: 12 })} />
            <YAxis yAxisId="metric" allowDecimals={metric !== 'count'} {...axisProps()} />
            {sharedAxis ? null : (
              <YAxis yAxisId="rolling" orientation="right" {...axisProps()} />
            )}
            <Tooltip {...tooltipProps()} />
            <Legend {...legendProps()} />

            {chartType === 'bar' ? (
              <Bar
                yAxisId="metric"
                dataKey={metric}
                name={active.label}
                fill={c.teal}
                radius={[3, 3, 0, 0]}
                maxBarSize={36}
              />
            ) : (
              <Line
                yAxisId="metric"
                type="monotone"
                dataKey={metric}
                name={active.label}
                stroke={c.teal}
                strokeWidth={2}
                dot={false}
              />
            )}

            <Line
              yAxisId={rollingAxis}
              type="monotone"
              dataKey="rolling"
              name="Rolling avg (tasks)"
              stroke={c.amber}
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
