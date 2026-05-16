import React from "react";

// ── Progress Indicator ────────────────────────────────────────

export const PROGRESS_CYCLE = { NO_PROGRESS: "IN_PROGRESS", IN_PROGRESS: "COMPLETED", COMPLETED: "NO_PROGRESS" };

export function ProgressIndicator({ progress, taskId, onUpdate }) {
  return (
    <button
      className={`cpm-progress-btn cpm-progress-${progress}`}
      onClick={e => { e.stopPropagation(); onUpdate(taskId, PROGRESS_CYCLE[progress]); }}
      title={progress.replace(/_/g, " ").toLowerCase().replace(/^\w/, c => c.toUpperCase())}
    >
      {progress === "COMPLETED" && <i className="fas fa-check" />}
      {progress === "IN_PROGRESS" && <span className="cpm-progress-half" />}
    </button>
  );
}

// ── Priority Bars ─────────────────────────────────────────────

export const PRIORITY_CFG = {
  CRITICAL: { color: "#e17055", fills: [1, 1, 1] },
  HIGH:     { color: "#e17055", fills: [1, 1, 0.35] },
  MEDIUM:   { color: "#fdcb6e", fills: [1, 0.55, 0.2] },
  LOW:      { color: "#00b894", fills: [0.65, 0.25, 0.1] },
};

export function PriorityBars({ priority }) {
  const { color, fills } = PRIORITY_CFG[priority] ?? PRIORITY_CFG.MEDIUM;
  return (
    <div className="cpm-priority-bars" title={priority ? priority.charAt(0) + priority.slice(1).toLowerCase() : "Medium"}>
      {[7, 10, 13].map((h, i) => (
        <div key={i} className="cpm-priority-bar" style={{ height: h, background: color, opacity: fills[i] }} />
      ))}
    </div>
  );
}

// ── Star Progress (completion percentage as filled stars) ─────

const StarPath = ({ filled, accent }) => (
  <svg width="12" height="12" viewBox="0 0 24 24">
    <polygon
      points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"
      fill={filled ? (accent ? 'var(--pm-accent-teal)' : 'rgba(255,255,255,0.7)') : 'none'}
      stroke={filled ? (accent ? 'var(--pm-accent-teal)' : 'rgba(255,255,255,0.5)') : 'rgba(255,255,255,0.2)'}
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  </svg>
);

export function StarProgress({ percent = 0 }) {
  const filled = Math.round((percent / 100) * 5);
  return (
    <div className="cpm-star-progress" title={`${percent}% complete`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className="cpm-star-progress-item">
          <StarPath filled={i < filled} accent={i < filled && i === filled - 1} />
        </span>
      ))}
    </div>
  );
}

// ── Avatar Stack ──────────────────────────────────────────────

export function AvatarStack({ assignees }) {
  if (!assignees?.length) return <span className="cpm-avatar-placeholder" />;
  const shown = assignees.slice(0, 3);
  const extra = assignees.length - 3;
  return (
    <div className="cpm-avatar-stack">
      {shown.map((m, i) => (
        <div key={m.id} className="cpm-avatar-slot" style={{ zIndex: shown.length - i }}>
          {m.avatarUrl
            ? <img src={m.avatarUrl} alt={m.displayName} className="cpm-avatar-img" title={m.displayName} />
            : <div className="cpm-avatar-initials" title={m.displayName}>{(m.displayName || "?").charAt(0).toUpperCase()}</div>
          }
        </div>
      ))}
      {extra > 0 && <div className="cpm-avatar-slot cpm-avatar-extra" title={`+${extra} more`}>+{extra}</div>}
    </div>
  );
}
