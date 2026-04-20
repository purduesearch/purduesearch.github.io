const PRIORITY_DOT = {
  CRITICAL: 'var(--color-accent-red)',
  HIGH: 'var(--color-accent-orange)',
  MEDIUM: 'var(--color-accent-orange)',
  LOW: 'var(--color-accent-green)',
};

const STATUS_ICON = {
  TODO: '📋',
  IN_PROGRESS: '🔧',
  BLOCKED: '🚫',
  DONE: '✅',
};

export default function TaskList({ tasks, showProject = false }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {tasks.map((task) => {
        const dueStr = task.dueDate
          ? new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          : null;

        const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'DONE';

        return (
          <div
            key={task.id}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
              padding: '0.75rem', borderRadius: '0.5rem',
              transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-surface-200)'}
            onMouseLeave={(e) => e.currentTarget.style.background = ''}
          >
            <span style={{ fontSize: '0.875rem', marginTop: '0.125rem', flexShrink: 0 }}>
              {STATUS_ICON[task.status]}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{
                fontSize: '0.875rem', fontWeight: 500, lineHeight: 1.375,
                color: task.status === 'DONE' ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
                textDecoration: task.status === 'DONE' ? 'line-through' : 'none',
              }}>
                {task.title}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                {showProject && task.project && (
                  <span className="cpm-tag">{task.project.name}</span>
                )}
                {dueStr && (
                  <span style={{ fontSize: '10px', color: isOverdue ? 'var(--color-accent-red)' : 'var(--color-text-muted)' }}>
                    {isOverdue ? '⚠ ' : '📅 '}{dueStr}
                  </span>
                )}
              </div>
            </div>
            <div
              style={{ width: '0.5rem', height: '0.5rem', borderRadius: '50%', flexShrink: 0, marginTop: '0.375rem', backgroundColor: PRIORITY_DOT[task.priority] }}
              title={task.priority}
            />
          </div>
        );
      })}
    </div>
  );
}
