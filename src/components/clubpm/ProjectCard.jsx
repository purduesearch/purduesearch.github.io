import React from "react";
import { Link } from "react-router-dom";
import { StarProgress } from "./TaskPrimitives";

const HEALTH_COLOR = {
  ACTIVE:    'var(--pm-accent-teal)',
  PAUSED:    'var(--pm-accent-amber)',
  COMPLETED: 'var(--pm-accent-violet)',
  ARCHIVED:  'var(--pm-text-muted)',
};

const TYPE_LABEL = { ENGINEERING: 'ENG', RESEARCH: 'RES', HYBRID: 'HYB' };
const STATUS_LABEL = { ACTIVE: 'Active', PAUSED: 'Paused', COMPLETED: 'Done', ARCHIVED: 'Archived' };

function CircleProgress({ pct, color, size = 48 }) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="5"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(0.4,0,0.2,1)' }} />
    </svg>
  );
}

export default function ProjectCard({ project }) {
  const total = project.totalTasks ?? project.tasks?.length ?? 0;
  const done  = project.doneTasks  ?? project.tasks?.filter(t => t.progress === 'COMPLETED' || t.status === 'DONE').length ?? 0;
  const pct   = project.completionPercent ?? (total > 0 ? Math.round((done / total) * 100) : 0);
  const accentColor = HEALTH_COLOR[project.status] ?? 'var(--pm-text-muted)';
  const members = project.members ?? [];
  const visible = members.slice(0, 4);
  const overflow = members.length - 4;

  const daysLeft = project.targetDate
    ? Math.ceil((new Date(project.targetDate) - Date.now()) / 86400000)
    : null;

  return (
    <Link to={`/clubpm/projects/${project.id}`} className="pm-project-card" style={{ textDecoration: 'none' }}>
      <div className="pm-project-card-accent" style={{ background: accentColor }} />
      <div className="pm-project-card-body">
        <div className="pm-project-card-top">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="pm-project-card-name">{project.name}</div>
            {project.description && (
              <div className="pm-project-card-desc">{project.description}</div>
            )}
            <StarProgress percent={pct} />
          </div>
          <CircleProgress pct={pct} color={accentColor} />
        </div>

        <div className="pm-project-card-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="pm-project-status-badge" style={{ color: accentColor, borderColor: accentColor, background: `${accentColor}18` }}>
              {STATUS_LABEL[project.status] ?? project.status}
            </span>
            <span className="pm-project-type-badge">
              {TYPE_LABEL[project.type] ?? project.type}
            </span>
            {daysLeft !== null && (
              <span style={{ fontSize: '0.7rem', color: daysLeft < 0 ? 'var(--pm-accent-coral)' : daysLeft < 7 ? 'var(--pm-accent-amber)' : 'var(--pm-text-muted)' }}>
                {daysLeft < 0 ? `${Math.abs(daysLeft)}d over` : `${daysLeft}d left`}
              </span>
            )}
          </div>
          <div className="pm-avatar-stack">
            {visible.map((pm, i) => (
              pm.member?.avatarUrl
                ? <img key={pm.memberId} src={pm.member.avatarUrl} alt="" className="pm-avatar-sm" style={{ zIndex: visible.length - i }} />
                : <div key={pm.memberId} className="pm-avatar-sm pm-avatar-initials" style={{ zIndex: visible.length - i }}>
                    {(pm.member?.displayName ?? '?').slice(0,2).toUpperCase()}
                  </div>
            ))}
            {overflow > 0 && (
              <div className="pm-avatar-sm pm-avatar-overflow">+{overflow}</div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
