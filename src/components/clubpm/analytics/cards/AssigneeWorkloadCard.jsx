import React from 'react';
import {
  BarChart,
  Bar,
  Cell,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import AnalyticsCard from '../AnalyticsCard';
import { axisProps, gridProps, tooltipProps, legendProps, getThemeColors, STATUS_COLORS } from '../analyticsTheme';

const SERIES = [
  { key: 'TODO', label: 'To Do' },
  { key: 'IN_PROGRESS', label: 'In Progress' },
  { key: 'BLOCKED', label: 'Blocked' },
  { key: 'DONE', label: 'Done' },
];

const CSV_COLUMNS = [
  { key: 'member', label: 'Member' },
  { key: 'TODO', label: 'To Do' },
  { key: 'IN_PROGRESS', label: 'In Progress' },
  { key: 'BLOCKED', label: 'Blocked' },
  { key: 'DONE', label: 'Done' },
  { key: 'total', label: 'Total' },
];

const MAX_ROWS = 12;
const NAME_LIMIT = 16;

const openOf = row => (row.TODO || 0) + (row.IN_PROGRESS || 0) + (row.BLOCKED || 0);

/** Truncated for the axis only — the tooltip is keyed on the untouched `member`. */
function truncate(name) {
  const str = String(name ?? '');
  return str.length > NAME_LIMIT ? `${str.slice(0, NAME_LIMIT - 1)}\u2026` : str;
}

/**
 * Open work per person, as horizontal stacked bars — one row per member, segmented by
 * status.
 *
 * "Unassigned" is a synthetic row from `computeWorkload`, not a member, so it is drawn
 * muted: it is real work that needs an owner, but reading it beside the people would
 * otherwise suggest someone is carrying it.
 *
 * The list is capped at twelve rows because the card has a fixed height and a project
 * with forty contributors would otherwise render forty two-pixel slivers; the overflow
 * is stated in a footer line rather than silently dropped.
 */
export default function AssigneeWorkloadCard({ data = [] }) {
  const c = getThemeColors();

  const all = (Array.isArray(data) ? data : [])
    .slice()
    .sort((a, b) => openOf(b) - openOf(a) || (b.total || 0) - (a.total || 0)
      || String(a.member).localeCompare(String(b.member)));

  const rows = all.slice(0, MAX_ROWS);
  const hidden = all.length - rows.length;
  const empty = !rows.length || rows.every(r => !r.total);

  // The chart owns the height it needs for its rows; the card's slot grows with it so
  // twelve members are not squeezed into the same box as two.
  const chartHeight = Math.min(400, Math.max(180, rows.length * 30 + 56));

  return (
    <AnalyticsCard
      title="Workload"
      subtitle="Open work per person, by status. Unassigned is shown muted."
      csv={empty ? null : { filename: 'workload.csv', rows: all, columns: CSV_COLUMNS }}
      height={chartHeight + (hidden > 0 ? 24 : 0)}
    >
      {empty ? (
        <div className="pm-an-empty">
          <i className="fas fa-users" aria-hidden="true" />
          <p>No tasks in this range are assigned to anyone.</p>
        </div>
      ) : (
        <div
          className="pm-an-workload"
          style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}
        >
          <div style={{ flex: '1 1 auto', minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={rows}
                margin={{ top: 4, right: 12, bottom: 0, left: 4 }}
                barCategoryGap="22%"
              >
                <CartesianGrid {...gridProps({ vertical: true, horizontal: false })} />
                <XAxis type="number" allowDecimals={false} {...axisProps()} />
                <YAxis
                  type="category"
                  dataKey="member"
                  width={104}
                  interval={0}
                  tickFormatter={truncate}
                  {...axisProps()}
                />
                <Tooltip {...tooltipProps()} />
                <Legend {...legendProps()} />

                {SERIES.map(s => (
                  <Bar key={s.key} dataKey={s.key} name={s.label} stackId="workload" maxBarSize={22}>
                    {rows.map(row => (
                      <Cell
                        key={row.memberId || row.member}
                        fill={STATUS_COLORS[s.key] || c.textSecondary}
                        fillOpacity={row.memberId === '__unassigned__' ? 0.42 : 1}
                      />
                    ))}
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {hidden > 0 ? (
            <p
              className="pm-an-more"
              style={{ margin: 0, paddingTop: 4, fontSize: 11, color: c.textSecondary }}
            >
              {`+${hidden} more ${hidden === 1 ? 'member' : 'members'} with less open work`}
            </p>
          ) : null}
        </div>
      )}
    </AnalyticsCard>
  );
}
