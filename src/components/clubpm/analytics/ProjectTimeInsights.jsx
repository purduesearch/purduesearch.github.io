import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import AnalyticsCard from './AnalyticsCard';
import { axisProps, gridProps, tooltipProps, legendProps, getThemeColors } from './analyticsTheme';
import { getProjectTimeInsights } from '../../../api/clubPmClient';

const RANGES = [4, 12, 26];
const DAY_MS = 86400000;
const STATUS_LABEL = { TODO: 'To do', IN_PROGRESS: 'In progress', BLOCKED: 'Blocked', DONE: 'Done' };

const hours = (min) => Math.round((min / 60) * 10) / 10;
function fmtHours(min) {
  if (!min) return '0h';
  if (min < 60) return `${min}m`;
  return `${hours(min)}h`;
}
function weekLabel(ymd) {
  const d = new Date(`${ymd}T12:00:00Z`);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/**
 * Insights → Time. Where logged time went: manual logs vs lab check-in time, by
 * week and by member, and the tasks that have taken the longest. Lab time is any
 * TimeLog written by a lab visit (plan decision 5); "untracked lab" is check-in
 * time nobody has assigned to a task yet.
 */
export default function ProjectTimeInsights({ project, onOpenTask }) {
  const projectId = project?.id;
  const [weeks, setWeeks] = useState(12);
  const [openOnly, setOpenOnly] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    setError('');
    const to = new Date();
    const from = new Date(to.getTime() - weeks * 7 * DAY_MS);
    getProjectTimeInsights(projectId, { from: from.toISOString(), to: to.toISOString() })
      .then(r => { if (alive) setData(r); })
      .catch(err => { if (alive) setError(err?.message ?? 'Could not load time insights.'); });
    return () => { alive = false; };
  }, [projectId, weeks]);

  const c = getThemeColors();
  const weekRows = useMemo(() => (data?.byWeek ?? []).map(w => ({
    ...w, label: weekLabel(w.weekStart), manual: hours(w.manualMinutes), lab: hours(w.labMinutes),
  })), [data]);
  const memberRows = useMemo(() => (data?.byMember ?? []).map(m => ({
    ...m, name: m.displayName, manual: hours(m.minutes - m.labMinutes), lab: hours(m.labMinutes),
  })), [data]);
  const taskRows = useMemo(
    () => (data?.tasks ?? []).filter(t => !openOnly || t.status !== 'DONE'),
    [data, openOnly],
  );

  if (error) {
    return (
      <div className="pm-an-root">
        <div className="pm-an-empty"><i className="fas fa-triangle-exclamation" aria-hidden="true" /><p>{error}</p></div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="pm-an-root">
        <div className="pm-an-empty"><i className="fas fa-spinner fa-spin" aria-hidden="true" /><p>Loading time insights…</p></div>
      </div>
    );
  }

  const { totals } = data;
  const empty = totals.minutes === 0 && totals.unallocatedLabMinutes === 0;
  const tiles = [
    { label: 'Total logged', value: fmtHours(totals.minutes) },
    { label: 'Lab check-ins', value: fmtHours(totals.labMinutes) },
    { label: 'Manual logs', value: fmtHours(totals.manualMinutes) },
    { label: 'Untracked lab', value: fmtHours(totals.unallocatedLabMinutes), title: 'Checked-in lab time not yet logged to a task' },
  ];

  return (
    <div className="pm-an-root pm-time-root">
      <div className="pm-an-toolbar">
        <div className="pm-an-toolbar-group">
          <span className="pm-an-toolbar-label">Range</span>
          <div className="pm-an-seg" role="group" aria-label="Range">
            {RANGES.map(w => (
              <button key={w} type="button" className={`pm-an-seg-btn${weeks === w ? ' is-active' : ''}`}
                aria-pressed={weeks === w} onClick={() => setWeeks(w)}>
                {w} weeks
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="pm-an-kpis">
        {tiles.map(t => (
          <div className="pm-an-kpi" key={t.label} title={t.title}>
            <span className="pm-an-kpi-label">{t.label}</span>
            <span className="pm-an-kpi-value">{t.value}</span>
          </div>
        ))}
      </div>

      {empty ? (
        <div className="pm-an-empty">
          <i className="fas fa-stopwatch" aria-hidden="true" />
          <p>No time was logged on this project in the last {weeks} weeks.</p>
        </div>
      ) : (
        <>
          <div className="pm-an-grid">
            <AnalyticsCard
              title="Time per week"
              subtitle="Hours logged by hand vs from lab check-ins."
              csv={{ filename: 'time-per-week.csv', rows: weekRows, columns: [
                { key: 'weekStart', label: 'Week of' }, { key: 'manual', label: 'Manual hours' }, { key: 'lab', label: 'Lab hours' },
              ] }}
              height={260}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekRows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                  <CartesianGrid {...gridProps()} />
                  <XAxis dataKey="label" {...axisProps({ minTickGap: 12 })} />
                  <YAxis {...axisProps()} />
                  <Tooltip {...tooltipProps()} />
                  <Legend {...legendProps()} />
                  <Bar dataKey="manual" name="Manual" stackId="t" fill={c.violet} maxBarSize={28} />
                  <Bar dataKey="lab" name="Lab" stackId="t" fill={c.teal} radius={[3, 3, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </AnalyticsCard>

            <AnalyticsCard
              title="Time by member"
              subtitle="Everyone's hours in this range."
              csv={{ filename: 'time-by-member.csv', rows: memberRows, columns: [
                { key: 'name', label: 'Member' }, { key: 'manual', label: 'Manual hours' }, { key: 'lab', label: 'Lab hours' },
              ] }}
              height={Math.max(180, memberRows.length * 30 + 60)}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={memberRows} layout="vertical" margin={{ top: 8, right: 12, bottom: 0, left: 8 }}>
                  <CartesianGrid {...gridProps({ vertical: true, horizontal: false })} />
                  <XAxis type="number" {...axisProps()} />
                  <YAxis type="category" dataKey="name" width={110} {...axisProps()} />
                  <Tooltip {...tooltipProps()} />
                  <Legend {...legendProps()} />
                  <Bar dataKey="manual" name="Manual" stackId="m" fill={c.violet} maxBarSize={18} />
                  <Bar dataKey="lab" name="Lab" stackId="m" fill={c.teal} radius={[0, 3, 3, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </AnalyticsCard>
          </div>

          <section className="pm-an-card pm-time-tasks">
            <header className="pm-an-card-head">
              <div>
                <h3 className="pm-an-card-title">Slowest tasks</h3>
                <p className="pm-an-card-sub">Most time logged in this range. Active days run from the first log to completion.</p>
              </div>
              <label className="pm-an-toggle">
                <input type="checkbox" checked={openOnly} onChange={e => setOpenOnly(e.target.checked)} /> Open tasks only
              </label>
            </header>
            {taskRows.length === 0 ? (
              <p className="pm-time-none">No matching tasks.</p>
            ) : (
              <div className="pm-time-table-wrap">
                <table className="pm-time-table">
                  <thead>
                    <tr><th scope="col">Task</th><th scope="col">Status</th><th scope="col">Logged</th><th scope="col">Lab</th><th scope="col">Active days</th></tr>
                  </thead>
                  <tbody>
                    {taskRows.map(t => (
                      <tr key={t.id}>
                        <td>
                          <button type="button" className="pm-time-task" onClick={() => onOpenTask?.(t.id)}>{t.title}</button>
                        </td>
                        <td><span className={`pm-time-status is-${t.status.toLowerCase()}`}>{STATUS_LABEL[t.status] ?? t.status}</span></td>
                        <td>{fmtHours(t.minutes)}</td>
                        <td>{t.labMinutes ? fmtHours(t.labMinutes) : '—'}</td>
                        <td>{t.activeDays ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
