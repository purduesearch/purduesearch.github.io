import { Link } from 'react-router-dom';
import MemberBadge from './MemberBadge';

const TYPE_BADGE = {
  ENGINEERING: 'cpm-badge-engineering',
  RESEARCH: 'cpm-badge-research',
  HYBRID: 'cpm-badge-hybrid',
};

const STATUS_BADGE = {
  ACTIVE: 'cpm-badge-active',
  PAUSED: 'cpm-badge-paused',
  COMPLETED: 'cpm-badge-completed',
  ARCHIVED: 'cpm-badge-archived',
};

export default function ProjectCard({ project }) {
  const total = project.totalTasks ?? project.tasks?.length ?? 0;
  const done = project.doneTasks ?? project.tasks?.filter((t) => t.status === 'DONE').length ?? 0;
  const pct = project.completionPercent ?? (total > 0 ? Math.round((done / total) * 100) : 0);

  const daysUntilTarget = project.targetDate
    ? Math.ceil((new Date(project.targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <Link to={`/clubpm/projects/${project.id}`} className="cpm-glass-card cpm-project-card" style={{ padding: '1.25rem', display: 'block', textDecoration: 'none' }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.75rem' }}>
        <h3 className="cpm-project-card-title" style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--color-text-primary)', lineHeight: 1.375, transition: 'color 0.2s' }}>
          {project.name}
        </h3>
        <span className={`cpm-badge ${TYPE_BADGE[project.type] ?? ''}`} style={{ flexShrink: 0 }}>
          {project.type}
        </span>
      </div>

      {/* Description */}
      {project.description && (
        <p className="cpm-line-clamp-2" style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem', lineHeight: 1.625 }}>
          {project.description}
        </p>
      )}

      {/* Progress bar */}
      <div style={{ marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
          <span style={{ color: 'var(--color-text-secondary)' }}>{done} / {total} tasks done</span>
          <span style={{ color: 'var(--color-text-muted)' }}>{pct}%</span>
        </div>
        <div className="cpm-progress-bar">
          <div className="cpm-progress-bar-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <span className={`cpm-badge ${STATUS_BADGE[project.status] ?? ''}`}>
            {project.status}
          </span>
          {daysUntilTarget !== null && (
            <span style={{
              fontSize: '0.75rem', marginLeft: '0.5rem',
              color: daysUntilTarget < 0
                ? 'var(--color-accent-red)'
                : daysUntilTarget < 7
                  ? 'var(--color-accent-orange)'
                  : 'var(--color-text-muted)',
            }}>
              {daysUntilTarget < 0
                ? `${Math.abs(daysUntilTarget)}d overdue`
                : `${daysUntilTarget}d left`}
            </span>
          )}
        </div>

        {/* Member avatars */}
        <div className="cpm-avatar-stack">
          {project.members?.slice(0, 4).map((pm) => (
            <MemberBadge key={pm.memberId} member={pm.member} size="sm" />
          ))}
          {(project.members?.length ?? 0) > 4 && (
            <div style={{
              width: '1.5rem', height: '1.5rem', borderRadius: '50%',
              background: 'var(--color-surface-400)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '10px', color: 'var(--color-text-muted)',
              outline: '2px solid var(--color-surface-100)',
            }}>
              +{(project.members?.length ?? 0) - 4}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
