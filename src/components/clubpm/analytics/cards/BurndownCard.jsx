import React, { useId, useState } from 'react';
import {
  ComposedChart,
  Area,
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

const CSV_COLUMNS = [
  { key: 'date', label: 'Date' },
  { key: 'actual', label: 'Remaining (actual)' },
  { key: 'ideal', label: 'Remaining (ideal)' },
  { key: 'projected', label: 'Remaining (projected)' },
];

/**
 * A burndown of an empty project is a run of zero rows, not an absent array —
 * `computeBurndown` always emits one row per day. So "nothing to draw" means every
 * day is flat zero, not `!data.length`.
 */
function isEmpty(rows) {
  return !rows.length || rows.every(r => !r.actual && !r.ideal && !r.projected);
}

/**
 * Remaining open work per day against the project's real schedule.
 *
 * The `actual` series reads `Task.completedAt`. Before that column existed (Part B)
 * this line was permanently flat, because nothing in the payload said *when* a task
 * had finished — only that it currently was DONE.
 */
export default function BurndownCard({ data = [] }) {
  const [chartType, setChartType] = useState('area');
  const gradientId = `pm-an-burndown-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`;
  const c = getThemeColors();

  const empty = isEmpty(data);

  return (
    <AnalyticsCard
      title="Burndown"
      subtitle="Open work remaining, against the schedule it was planned on."
      chartTypes={['area', 'line']}
      chartType={chartType}
      onChartTypeChange={setChartType}
      csv={empty ? null : { filename: 'burndown.csv', rows: data, columns: CSV_COLUMNS }}
      height={260}
    >
      {empty ? (
        <div className="pm-an-empty">
          <i className="fas fa-chart-area" aria-hidden="true" />
          <p>No tasks in this range yet — there is nothing to burn down.</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={c.coral} stopOpacity={0.35} />
                <stop offset="100%" stopColor={c.coral} stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid {...gridProps()} />
            <XAxis dataKey="label" {...axisProps({ minTickGap: 24 })} />
            <YAxis allowDecimals={false} {...axisProps()} />
            <Tooltip {...tooltipProps()} />
            <Legend {...legendProps()} />

            {/* Ideal first so the two live series draw over it. */}
            <Line
              type="monotone"
              dataKey="ideal"
              name="Ideal"
              stroke={c.textSecondary}
              strokeWidth={1.5}
              strokeDasharray="5 5"
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />

            {chartType === 'area' ? (
              <Area
                type="monotone"
                dataKey="actual"
                name="Actual"
                stroke={c.coral}
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                dot={false}
                connectNulls={false}
              />
            ) : (
              <Line
                type="monotone"
                dataKey="actual"
                name="Actual"
                stroke={c.coral}
                strokeWidth={2}
                dot={false}
                connectNulls={false}
              />
            )}

            {/* `projected` is null for every past day, so this only draws forward of
                today; `connectNulls={false}` is what keeps it from bridging back. */}
            <Line
              type="monotone"
              dataKey="projected"
              name="Projected"
              stroke={c.teal}
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={false}
              connectNulls={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </AnalyticsCard>
  );
}
