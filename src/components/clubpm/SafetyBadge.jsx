import React, { useState } from 'react';
import { post } from '../../api/clubPmClient';
import toast from 'react-hot-toast';

const CATEGORY_LABELS = {
  BRAND_TONE:       'Brand tone',
  SENSITIVE_INFO:   'Sensitive info',
  UNVERIFIED_CLAIM: 'Unverified claim',
  LINK_SAFETY:      'Link safety',
  TYPO_OR_GRAMMAR:  'Grammar / typo',
};

const SEVERITY_COLORS = {
  INFO:  { bg: 'rgba(108,92,231,0.13)',  text: '#a29bfe' },
  WARN:  { bg: 'rgba(253,203,110,0.15)', text: '#fdcb6e' },
  BLOCK: { bg: 'rgba(255,118,117,0.15)', text: '#ff7675' },
};

/**
 * SafetyBadge — green ✓ / yellow ⚠ / red ⛔ status pill with expandable issue list.
 *
 * Props:
 *   submissionId — for triggering re-check
 *   report       — { safe, issues } | null
 *   checkedAt    — ISO string | null
 *   onUpdate     — called with { report, checkedAt } after a re-check
 *   compact      — boolean: render as small chip only (default false)
 */
export default function SafetyBadge({ submissionId, report, checkedAt, onUpdate, compact = false }) {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);

  async function runCheck() {
    if (!submissionId) {
      toast.error('Save the submission before running a safety check');
      return;
    }
    setRunning(true);
    try {
      const updated = await post(`/api/outreach/submissions/${submissionId}/ai/safety-check`);
      onUpdate?.({ report: updated.safetyReport, checkedAt: updated.safetyCheckedAt });
      toast.success('Safety check complete');
      setOpen(true);
    } catch (err) {
      toast.error(err.message ?? 'Safety check failed');
    } finally {
      setRunning(false);
    }
  }

  // Not yet checked
  if (!report || !checkedAt) {
    return (
      <button
        type="button"
        className={`pm-safety-badge pm-safety-badge--unchecked${compact ? ' pm-safety-badge--compact' : ''}`}
        onClick={runCheck}
        disabled={running}
        title="Run AI safety / brand compliance check"
      >
        {running
          ? <><i className="fas fa-spinner fa-spin" aria-hidden="true" /> Checking…</>
          : <><i className="fas fa-shield-alt" aria-hidden="true" /> Run safety check</>}
      </button>
    );
  }

  const issues = report.issues ?? [];
  const hasBlock = issues.some(i => i.severity === 'BLOCK');
  const hasWarn  = issues.some(i => i.severity === 'WARN');
  const status = hasBlock ? 'block' : hasWarn ? 'warn' : 'safe';
  const labelMap = { safe: 'Safe to publish', warn: `${issues.length} issue${issues.length !== 1 ? 's' : ''}`, block: 'Blocked' };
  const iconMap  = { safe: 'fa-check-circle', warn: 'fa-exclamation-triangle', block: 'fa-ban' };

  return (
    <div className={`pm-safety-wrap${compact ? ' pm-safety-wrap--compact' : ''}`}>
      <button
        type="button"
        className={`pm-safety-badge pm-safety-badge--${status}${compact ? ' pm-safety-badge--compact' : ''}`}
        onClick={() => setOpen(o => !o)}
        title={`Last checked ${new Date(checkedAt).toLocaleString()}`}
      >
        <i className={`fas ${iconMap[status]}`} aria-hidden="true" />
        {labelMap[status]}
        {issues.length > 0 && (
          <i className={`fas fa-caret-${open ? 'up' : 'down'}`} aria-hidden="true" style={{ marginLeft: 4 }} />
        )}
      </button>
      {open && (
        <div className="pm-safety-panel">
          <div className="pm-safety-panel-header">
            <span>Last checked {new Date(checkedAt).toLocaleString()}</span>
            <button className="pm-safety-rerun-btn" onClick={runCheck} disabled={running}>
              {running ? <i className="fas fa-spinner fa-spin" aria-hidden="true" /> : <><i className="fas fa-sync-alt" aria-hidden="true" /> Re-run</>}
            </button>
          </div>
          {issues.length === 0 ? (
            <div className="pm-safety-empty">No issues found.</div>
          ) : (
            <ul className="pm-safety-issue-list">
              {issues.map((issue, i) => {
                const colors = SEVERITY_COLORS[issue.severity] ?? SEVERITY_COLORS.INFO;
                return (
                  <li key={i} className="pm-safety-issue">
                    <div className="pm-safety-issue-header">
                      <span className="pm-safety-issue-cat">{CATEGORY_LABELS[issue.category] ?? issue.category}</span>
                      <span
                        className="pm-safety-issue-sev"
                        style={{ background: colors.bg, color: colors.text }}
                      >
                        {issue.severity}
                      </span>
                    </div>
                    <div className="pm-safety-issue-msg">{issue.message}</div>
                    {issue.suggestedFix && (
                      <div className="pm-safety-issue-fix">
                        <i className="fas fa-lightbulb" aria-hidden="true" /> {issue.suggestedFix}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
