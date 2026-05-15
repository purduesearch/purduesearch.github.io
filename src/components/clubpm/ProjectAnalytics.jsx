import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart, Area,
  BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from 'recharts';
import {
  format, subDays, startOfDay, parseISO, isValid,
  getISOWeek, getISOWeekYear, isAfter,
} from 'date-fns';

// ── helpers ──────────────────────────────────────────────────────────────────

function safeDate(val) {
  if (!val) return null;
  const d = typeof val === 'string' ? parseISO(val) : new Date(val);
  return isValid(d) ? d : null;
}

// ── Tooltip style shared across charts ───────────────────────────────────────
const TOOLTIP_STYLE = {
  contentStyle: {
    background: 'var(--pm-bg-elevated)',
    border: '1px solid var(--pm-border)',
    borderRadius: 8,
    color: 'var(--pm-text-primary)',
    fontSize: 12,
  },
  labelStyle: { color: 'var(--pm-text-muted)', marginBottom: 4 },
  itemStyle: { color: 'var(--pm-text-primary)' },
};

// ── 1. Burndown Chart ─────────────────────────────────────────────────────────

function useBurndownData(tasks, milestones) {
  return useMemo(() => {
    const today = startOfDay(new Date());
    const days = Array.from({ length: 30 }, (_, i) => subDays(today, 29 - i));

    const total = tasks.length;

    // Find project end date from latest milestone due date
    const milestoneDates = (milestones || [])
      .map(m => safeDate(m.dueDate))
      .filter(Boolean)
      .sort((a, b) => b - a);
    const projectEnd = milestoneDates[0] || today;

    return days.map((day, i) => {
      // actual: count tasks not-done as of end of this day
      const remaining = tasks.filter(t => {
        const created = safeDate(t.createdAt);
        const completed = safeDate(t.completedAt);
        // task existed on this day
        if (created && isAfter(created, day)) return false;
        // task was completed before end of this day
        if (completed && !isAfter(completed, day)) return false;
        return true;
      }).length;

      // ideal: linear from total → 0 over 30 days
      const ideal = Math.max(0, Math.round(total - (total / 29) * i));

      return {
        date: format(day, 'MMM d'),
        Actual: remaining,
        Ideal: ideal,
      };
    });
  }, [tasks, milestones]);
}

function BurndownChart({ tasks, milestones }) {
  const data = useBurndownData(tasks, milestones);

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={TOOLTIP_STYLE.contentStyle}>
        <div style={TOOLTIP_STYLE.labelStyle}>{label}</div>
        {payload.map(p => (
          <div key={p.name} style={{ color: p.color, fontSize: 12 }}>
            {p.name}: <strong>{p.value}</strong>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="pm-analytics-card pm-analytics-card--burndown">
      <div className="pm-analytics-card-title">Burndown</div>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <defs>
            <linearGradient id="burnActualGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="var(--pm-accent-coral)" stopOpacity={0.35} />
              <stop offset="95%" stopColor="var(--pm-accent-coral)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis
            dataKey="date"
            tick={{ fill: 'var(--pm-text-muted)', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            interval={6}
          />
          <YAxis
            tick={{ fill: 'var(--pm-text-muted)', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 11, color: 'var(--pm-text-muted)', paddingTop: 4 }}
          />
          {/* Ideal: dashed line, no fill */}
          <Area
            type="monotone"
            dataKey="Ideal"
            stroke="var(--pm-text-muted)"
            strokeDasharray="5 3"
            strokeWidth={1.5}
            fill="transparent"
            dot={false}
            activeDot={false}
          />
          {/* Actual: coral area */}
          <Area
            type="monotone"
            dataKey="Actual"
            stroke="var(--pm-accent-coral)"
            strokeWidth={2}
            fill="url(#burnActualGrad)"
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── 2. Status Donut ───────────────────────────────────────────────────────────

const STATUS_CONFIG = [
  { key: 'TODO',        label: 'To Do',       color: '#8892a4' },
  { key: 'IN_PROGRESS', label: 'In Progress', color: '#f9ca24' },
  { key: 'BLOCKED',     label: 'Blocked',     color: '#ff6b6b' },
  { key: 'DONE',        label: 'Done',        color: '#00c896' },
];

function useStatusData(tasks) {
  return useMemo(() => {
    const counts = { TODO: 0, IN_PROGRESS: 0, BLOCKED: 0, DONE: 0 };
    tasks.forEach(t => {
      if (counts[t.status] !== undefined) counts[t.status]++;
      else counts.TODO++;
    });
    return STATUS_CONFIG.map(s => ({ ...s, value: counts[s.key] }));
  }, [tasks]);
}

function CenterLabel({ cx, cy, pct }) {
  return (
    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
      <tspan
        x={cx}
        dy="-0.2em"
        style={{ fill: 'var(--pm-text-primary)', fontSize: 22, fontWeight: 700, fontFamily: 'var(--pm-font-display)' }}
      >
        {pct}%
      </tspan>
      <tspan
        x={cx}
        dy="1.4em"
        style={{ fill: 'var(--pm-text-muted)', fontSize: 10, fontFamily: 'var(--pm-font-body)' }}
      >
        complete
      </tspan>
    </text>
  );
}

function StatusDonut({ tasks }) {
  const data = useStatusData(tasks);
  const total = tasks.length || 1;
  const doneCount = data.find(d => d.key === 'DONE')?.value ?? 0;
  const pct = Math.round((doneCount / total) * 100);
  const cx = '50%';
  const cy = '45%';

  return (
    <div className="pm-analytics-card">
      <div className="pm-analytics-card-title">Status Breakdown</div>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            cx={cx}
            cy={cy}
            innerRadius={55}
            outerRadius={80}
            paddingAngle={3}
            dataKey="value"
            nameKey="label"
            strokeWidth={0}
          >
            {data.map(entry => (
              <Cell key={entry.key} fill={entry.color} />
            ))}
          </Pie>
          {/* center label rendered via custom label */}
          <text x="50%" y="45%" textAnchor="middle" dominantBaseline="middle">
            <tspan
              style={{
                fill: 'var(--pm-text-primary)',
                fontSize: 20,
                fontWeight: 700,
                fontFamily: 'var(--pm-font-display)',
              }}
            >
              {pct}%
            </tspan>
          </text>
          <Tooltip
            {...TOOLTIP_STYLE}
            formatter={(value, name) => [`${value} task${value !== 1 ? 's' : ''}`, name]}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 11, color: 'var(--pm-text-muted)', paddingTop: 4 }}
            formatter={(value, entry) => (
              <span style={{ color: entry.color }}>{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── 3. Velocity Bar Chart ─────────────────────────────────────────────────────

function useVelocityData(tasks) {
  return useMemo(() => {
    const today = new Date();
    // Build 8 ISO-week buckets ending this week
    const buckets = Array.from({ length: 8 }, (_, i) => {
      const weekOffset = 7 - i; // 7 weeks ago → this week
      const refDay = subDays(today, (7 - i) * 7);
      const wk = getISOWeek(refDay);
      const yr = getISOWeekYear(refDay);
      return { label: `Wk ${i + 1}`, wk, yr, count: 0 };
    });

    tasks
      .filter(t => t.completedAt)
      .forEach(t => {
        const d = safeDate(t.completedAt);
        if (!d) return;
        const wk = getISOWeek(d);
        const yr = getISOWeekYear(d);
        const bucket = buckets.find(b => b.wk === wk && b.yr === yr);
        if (bucket) bucket.count++;
      });

    return buckets.map(({ label, count }) => ({ label, Tasks: count }));
  }, [tasks]);
}

function VelocityChart({ tasks }) {
  const data = useVelocityData(tasks);

  return (
    <div className="pm-analytics-card">
      <div className="pm-analytics-card-title">Weekly Velocity</div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: 'var(--pm-text-muted)', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: 'var(--pm-text-muted)', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip {...TOOLTIP_STYLE} />
          <Bar dataKey="Tasks" fill="var(--pm-accent-teal)" radius={[3, 3, 0, 0]} maxBarSize={32} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── 4. Risk Radar Panel ───────────────────────────────────────────────────────

function useRisks(tasks) {
  return useMemo(() => {
    const risks = [];
    const now = new Date();

    const blocked = tasks.filter(t => t.status === 'BLOCKED');
    if (blocked.length > 0) {
      risks.push({
        id: 'blocked',
        icon: '✕',
        text: `${blocked.length} task${blocked.length > 1 ? 's' : ''} blocked — review needed`,
        severity: 'coral',
      });
    }

    const done = tasks.filter(t => t.status === 'DONE').length;
    const total = tasks.length;
    if (total > 10 && total > 0 && done / total < 0.3) {
      risks.push({
        id: 'lowcompletion',
        icon: '⚠',
        text: 'Low completion rate — pace at risk',
        severity: 'amber',
      });
    }

    const overdue = tasks.filter(t => {
      if (t.status === 'DONE') return false;
      const due = safeDate(t.dueDate);
      return due && isAfter(now, due);
    });
    if (overdue.length > 0) {
      risks.push({
        id: 'overdue',
        icon: '⚠',
        text: `${overdue.length} overdue task${overdue.length > 1 ? 's' : ''}`,
        severity: 'amber',
      });
    }

    return risks.slice(0, 3);
  }, [tasks]);
}

const SEVERITY_COLOR = {
  coral: 'var(--pm-accent-coral)',
  amber: 'var(--pm-accent-amber)',
  green: 'var(--pm-accent-teal)',
};

function RiskRadar({ tasks }) {
  const risks = useRisks(tasks);
  const hasRisks = risks.length > 0;

  return (
    <div className="pm-analytics-card">
      <div className="pm-analytics-card-title pm-analytics-card-title--risk">
        <span className={`pm-risk-dot pm-risk-dot--${hasRisks ? 'amber' : 'green'}`} />
        Risk Radar
      </div>

      <div className="pm-risk-list">
        {!hasRisks ? (
          <div className="pm-risk-item pm-risk-item--clear">
            <span style={{ color: 'var(--pm-accent-teal)', fontSize: 16 }}>✓</span>
            <span style={{ color: 'var(--pm-text-muted)', fontSize: 13 }}>
              No active risks detected
            </span>
          </div>
        ) : (
          risks.map(r => (
            <div key={r.id} className="pm-risk-item" style={{ color: SEVERITY_COLOR[r.severity] }}>
              <span className="pm-risk-icon">{r.icon}</span>
              <span className="pm-risk-text">{r.text}</span>
            </div>
          ))
        )}
      </div>

      {/* mini summary footer */}
      <div className="pm-risk-footer">
        <span style={{ color: 'var(--pm-text-muted)', fontSize: 11 }}>
          {tasks.length} task{tasks.length !== 1 ? 's' : ''} total
          &nbsp;·&nbsp;
          {tasks.filter(t => t.status === 'DONE').length} done
        </span>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function ProjectAnalytics({ project }) {
  const tasks = project?.tasks ?? [];
  const milestones = project?.milestones ?? [];

  return (
    <div className="pm-analytics-grid">
      {/* Row 1 */}
      <BurndownChart tasks={tasks} milestones={milestones} />
      <StatusDonut tasks={tasks} />

      {/* Row 2 */}
      <VelocityChart tasks={tasks} />
      <RiskRadar tasks={tasks} />
    </div>
  );
}
