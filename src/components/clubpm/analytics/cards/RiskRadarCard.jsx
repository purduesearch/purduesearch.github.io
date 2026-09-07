import React, { useState } from 'react';
import AnalyticsCard from '../AnalyticsCard';
import { getThemeColors, BAND_COLORS } from '../analyticsTheme';

const BANDS = [
  { key: 'healthy', label: 'Healthy', from: 0, to: 24 },
  { key: 'watch', label: 'Watch', from: 25, to: 49 },
  { key: 'at-risk', label: 'At risk', from: 50, to: 74 },
  { key: 'critical', label: 'Critical', from: 75, to: 100 },
];

const FACTOR_ICONS = {
  blocked: 'fa-ban',
  overdue: 'fa-clock',
  aging: 'fa-hourglass-half',
  stale: 'fa-snowflake',
  unassigned: 'fa-user-slash',
  dependencies: 'fa-link',
  velocityTrend: 'fa-arrow-trend-down',
};

const CSV_COLUMNS = [
  { key: 'label', label: 'Factor' },
  { key: 'weight', label: 'Weight' },
  { key: 'contribution', label: 'Contribution (0-1)' },
  { key: 'severity', label: 'Severity' },
  { key: 'taskCount', label: 'Tasks' },
];

const MAX_LISTED_TASKS = 10;

/** Severity maps onto the same four band colors, so one legend reads the whole card. */
function severityColor(severity, c) {
  if (severity === 'critical') return BAND_COLORS.critical;
  if (severity === 'high') return BAND_COLORS['at-risk'];
  if (severity === 'medium') return BAND_COLORS.watch;
  if (severity === 'low') return BAND_COLORS.healthy;
  return c.textSecondary;
}

function FactorRow({ factor, expanded, onToggle, onOpenTask, c }) {
  const tasks = Array.isArray(factor.tasks) ? factor.tasks : [];
  const zero = !factor.contribution;
  const expandable = tasks.length > 0;
  const color = severityColor(factor.severity, c);
  const listed = tasks.slice(0, MAX_LISTED_TASKS);
  const hidden = tasks.length - listed.length;

  const body = (
    <>
      <i
        className={`fas ${FACTOR_ICONS[factor.id] || 'fa-circle-exclamation'}`}
        aria-hidden="true"
        style={{ width: 16, textAlign: 'center', color, opacity: zero ? 0.5 : 1 }}
      />
      <span style={{ flex: '0 0 148px', fontSize: 12, textAlign: 'left' }}>{factor.label}</span>

      <span
        style={{
          flex: '1 1 auto',
          height: 6,
          borderRadius: 999,
          background: c.border,
          overflow: 'hidden',
        }}
      >
        <span
          style={{
            display: 'block',
            height: '100%',
            width: `${Math.round(factor.contribution * 100)}%`,
            background: color,
            borderRadius: 999,
          }}
        />
      </span>

      <span style={{ flex: '0 0 62px', fontSize: 11, textAlign: 'right', color: c.textSecondary }}>
        {tasks.length
          ? `${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}`
          : `${Math.round(factor.contribution * 100)}%`}
      </span>

      <i
        className={`fas ${expanded ? 'fa-chevron-up' : 'fa-chevron-down'}`}
        aria-hidden="true"
        style={{ width: 12, fontSize: 10, color: c.textSecondary, opacity: expandable ? 1 : 0 }}
      />
    </>
  );

  const rowStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    padding: '6px 2px',
    background: 'none',
    border: 'none',
    // A factor at zero is greyed rather than hidden: the card's height stays put
    // between refreshes, and the reader can see what *was* checked and came back clean.
    color: zero ? c.textSecondary : c.textPrimary,
    opacity: zero ? 0.6 : 1,
    cursor: expandable ? 'pointer' : 'default',
    textAlign: 'left',
  };

  return (
    <li className={`pm-an-risk-factor${zero ? ' is-zero' : ''}`}>
      {expandable ? (
        <button
          type="button"
          className="pm-an-risk-factor-row"
          style={rowStyle}
          aria-expanded={expanded}
          onClick={onToggle}
        >
          {body}
        </button>
      ) : (
        <div className="pm-an-risk-factor-row" style={rowStyle}>
          {body}
        </div>
      )}

      {expanded && expandable ? (
        <ul
          className="pm-an-risk-tasks"
          style={{ listStyle: 'none', margin: '0 0 6px', padding: '0 0 0 26px' }}
        >
          {listed.map(task => (
            <li key={task.id}>
              {typeof onOpenTask === 'function' ? (
                <button
                  type="button"
                  className="pm-an-risk-task"
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '3px 0',
                    fontSize: 12,
                    color: c.textSecondary,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                  onClick={() => onOpenTask(task)}
                >
                  {task.title || 'Untitled task'}
                </button>
              ) : (
                <span
                  className="pm-an-risk-task"
                  style={{ display: 'block', padding: '3px 0', fontSize: 12, color: c.textSecondary }}
                >
                  {task.title || 'Untitled task'}
                </span>
              )}
            </li>
          ))}
          {hidden > 0 ? (
            <li style={{ padding: '3px 0', fontSize: 11, color: c.textSecondary }}>
              {`+${hidden} more`}
            </li>
          ) : null}
        </ul>
      ) : null}
    </li>
  );
}

/**
 * The weighted risk score and the seven factors behind it.
 *
 * This replaces a card that hardcoded three `if`s and showed the first three offending
 * tasks. The scoring now lives entirely in `computeRisk`; this file only renders it —
 * which is why every factor is drawn even at zero contribution, and why the score is
 * shown against the band ranges rather than as a bare number: a 46 means nothing until
 * you can see it sitting near the top of "watch".
 */
export default function RiskRadarCard({ data, onOpenTask }) {
  const [expanded, setExpanded] = useState(null);
  const c = getThemeColors();

  const risk = data || {};
  const factors = Array.isArray(risk.factors) ? risk.factors : [];
  const score = Number.isFinite(risk.score) ? risk.score : 0;
  const band = BANDS.find(b => b.key === risk.band) || BANDS[0];
  const bandColor = BAND_COLORS[band.key];

  const csvRows = factors.map(f => ({
    label: f.label,
    weight: f.weight,
    contribution: f.contribution,
    severity: f.severity,
    taskCount: Array.isArray(f.tasks) ? f.tasks.length : 0,
  }));

  const scoreHeader = (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
      <span style={{ fontSize: 28, fontWeight: 700, lineHeight: 1, color: bandColor }}>{score}</span>
      <span
        className="pm-an-risk-band"
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          padding: '3px 9px',
          borderRadius: 999,
          color: bandColor,
          border: `1px solid ${bandColor}`,
          background: 'rgba(255,255,255,0.04)',
        }}
      >
        {band.label}
      </span>
    </div>
  );

  return (
    <AnalyticsCard
      title="Risk radar"
      subtitle="Seven weighted signals, scored 0 (clean) to 100 (maximally at risk)."
      headerAside={scoreHeader}
      csv={factors.length ? { filename: 'risk-radar.csv', rows: csvRows, columns: CSV_COLUMNS } : null}
      height={352}
    >
      {!factors.length ? (
        <div className="pm-an-empty">
          <i className="fas fa-shield-halved" aria-hidden="true" />
          <p>There is no open work in this range to assess.</p>
        </div>
      ) : (
        <div
          className="pm-an-risk"
          style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 10 }}
        >
          {/* Meter: the four band ranges drawn to scale, with the score marked on them. */}
          <div className="pm-an-risk-meter" style={{ position: 'relative', paddingTop: 4 }}>
            <div style={{ display: 'flex', height: 8, borderRadius: 999, overflow: 'hidden' }}>
              {BANDS.map(b => (
                <div
                  key={b.key}
                  style={{
                    flex: 1,
                    background: BAND_COLORS[b.key],
                    opacity: b.key === band.key ? 0.85 : 0.2,
                  }}
                />
              ))}
            </div>
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: 0,
                left: `${Math.min(100, Math.max(0, score))}%`,
                width: 2,
                height: 16,
                marginLeft: -1,
                borderRadius: 1,
                background: c.textPrimary,
              }}
            />
            <div style={{ display: 'flex', marginTop: 4 }}>
              {BANDS.map(b => (
                <span
                  key={b.key}
                  style={{
                    flex: 1,
                    fontSize: 10,
                    color: b.key === band.key ? c.textPrimary : c.textSecondary,
                    textAlign: 'center',
                  }}
                >
                  {`${b.label} ${b.from}–${b.to}`}
                </span>
              ))}
            </div>
          </div>

          <ul
            className="pm-an-risk-factors"
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              flex: '1 1 auto',
              minHeight: 0,
              overflowY: 'auto',
            }}
          >
            {factors.map(factor => (
              <FactorRow
                key={factor.id}
                factor={factor}
                c={c}
                expanded={expanded === factor.id}
                onToggle={() => setExpanded(prev => (prev === factor.id ? null : factor.id))}
                onOpenTask={onOpenTask}
              />
            ))}
          </ul>
        </div>
      )}
    </AnalyticsCard>
  );
}
