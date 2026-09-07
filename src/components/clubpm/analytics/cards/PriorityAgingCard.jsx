import React from 'react';
import {
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import AnalyticsCard from '../AnalyticsCard';
import { axisProps, gridProps, tooltipProps, legendProps, getThemeColors, PRIORITY_COLORS } from '../analyticsTheme';

const SERIES = [
  { key: 'LOW', label: 'Low' },
  { key: 'MEDIUM', label: 'Medium' },
  { key: 'HIGH', label: 'High' },
  { key: 'CRITICAL', label: 'Critical' },
];

const BUCKET_LABELS = {
  '<1w': 'Under 1 week',
  '1-2w': '1\u20132 weeks',
  '2-4w': '2\u20134 weeks',
  '>1mo': 'Over a month',
};

const CSV_COLUMNS = [
  { key: 'bucket', label: 'Age' },
  { key: 'LOW', label: 'Low' },
  { key: 'MEDIUM', label: 'Medium' },
  { key: 'HIGH', label: 'High' },
  { key: 'CRITICAL', label: 'Critical' },
  { key: 'total', label: 'Total' },
];

/**
 * Open tasks by age, stacked by priority.
 *
 * The read is the right-hand side: work aged past a month is expected in the low and
 * medium bands, but CRITICAL and HIGH mass out there means the things the project
 * called urgent are the things it is not finishing. The subtitle says so, because a
 * stacked bar chart does not announce its own thesis.
 */
export default function PriorityAgingCard({ data = [] }) {
  const c = getThemeColors();

  const rows = (Array.isArray(data) ? data : []).map(row => ({
    ...row,
    label: BUCKET_LABELS[row.bucket] || row.bucket,
  }));
  const empty = !rows.length || rows.every(r => !SERIES.some(s => r[s.key]));

  return (
    <AnalyticsCard
      title="Aging"
      subtitle="Critical and high work in the right-hand buckets is the signal to act on."
      csv={empty ? null : { filename: 'aging.csv', rows: data, columns: CSV_COLUMNS }}
      height={260}
    >
      {empty ? (
        <div className="pm-an-empty">
          <i className="fas fa-hourglass-half" aria-hidden="true" />
          <p>Nothing is open right now, so there is no aging work to chart.</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid {...gridProps()} />
            <XAxis dataKey="bucket" {...axisProps()} />
            <YAxis allowDecimals={false} {...axisProps()} />
            <Tooltip
              {...tooltipProps()}
              labelFormatter={value => BUCKET_LABELS[value] || value}
            />
            <Legend {...legendProps()} />

            {SERIES.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                stackId="aging"
                fill={PRIORITY_COLORS[s.key] || c.textSecondary}
                maxBarSize={54}
                // Only the top segment of a stack gets a rounded cap, or the corners
                // read as gaps between the bands.
                radius={i === SERIES.length - 1 ? [3, 3, 0, 0] : undefined}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </AnalyticsCard>
  );
}
