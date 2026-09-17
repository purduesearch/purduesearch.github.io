import React, { useMemo, useState } from 'react';

function statusDotColor(status) {
  if (status === 'ACTIVE')    return 'var(--pm-accent-teal)';
  if (status === 'PAUSED')    return 'var(--pm-accent-amber)';
  if (status === 'COMPLETED') return 'var(--pm-accent-violet)';
  return 'var(--pm-text-muted)';
}

/**
 * Body of the phone Projects sheet (contracts.md §3).
 *
 * Reads the shell's existing /api/projects result and the same starred list
 * the desktop sidebar sorts by — no second project store. Search is client-side
 * over names and is never auto-focused (that would raise the keyboard over the
 * list). New project stays admin-only, as on desktop.
 *
 * When the user is inside a project, that project's own actions (from
 * ProjectNavContext `actions`) are listed first, so Edit / Pin / Timeline are two
 * taps from anywhere in the project.
 */
export default function MobileProjectPicker({
  projects,
  starredIds,
  loadState,
  onRetry,
  currentProjectId,
  currentProjectName,
  projectActions = [],
  canCreate,
  onSelectProject,
  onSelectAction,
  onNewProject,
}) {
  const [query, setQuery] = useState('');

  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...projects]
      .filter(p => !q || (p.name || '').toLowerCase().includes(q))
      .sort((a, b) => (starredIds.includes(a.id) ? 0 : 1) - (starredIds.includes(b.id) ? 0 : 1));
  }, [projects, starredIds, query]);

  const visibleActions = projectActions.filter(a => !a.hidden);

  return (
    <div className="pm-m-picker">
      {currentProjectId && visibleActions.length > 0 && (
        <section aria-labelledby="pm-m-picker-this">
          <div className="pm-m-group-label" id="pm-m-picker-this">
            This project{currentProjectName ? ` · ${currentProjectName}` : ''}
          </div>
          <div className="pm-m-card">
            {visibleActions.map(action => (
              <button
                key={action.id}
                type="button"
                className="pm-m-row"
                onClick={() => onSelectAction(action)}
              >
                <i className={`fas ${action.icon} pm-m-row-icon`} aria-hidden="true" />
                <div className="pm-m-row-main">{action.label}</div>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="pm-m-group-label" id="pm-m-picker-all">All projects</div>
      <label className="pm-m-search">
        <i className="fas fa-magnifying-glass" aria-hidden="true" />
        <input
          type="search"
          className="pm-m-input"
          placeholder="Find a project"
          aria-label="Find a project"
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoComplete="off"
        />
      </label>

      <div className="pm-m-card" data-tour-id="projects.sheet" aria-labelledby="pm-m-picker-all" role="group">
        {loadState.status === 'loading' && (
          <div className="pm-m-empty" role="status">Loading projects…</div>
        )}
        {loadState.status === 'error' && (
          <div className="pm-m-error" role="alert">
            <div>Projects didn&apos;t load. {loadState.message || 'Check your connection.'}</div>
            <button type="button" className="pm-m-btn" onClick={onRetry}>
              <i className="fas fa-rotate-right" aria-hidden="true" /> Retry
            </button>
          </div>
        )}
        {loadState.status === 'ready' && sorted.length === 0 && (
          <div className="pm-m-empty">
            {query.trim() ? `No project matches “${query.trim()}”.` : 'You have no projects yet.'}
          </div>
        )}
        {loadState.status === 'ready' && sorted.map(p => {
          const current = p.id === currentProjectId;
          const starred = starredIds.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              className="pm-m-row"
              aria-current={current ? 'page' : undefined}
              onClick={() => onSelectProject(p)}
            >
              {starred
                ? <i className="fas fa-star pm-m-row-star" aria-label="Pinned" />
                : <i className="pm-m-dot" style={{ background: statusDotColor(p.status) }} aria-hidden="true" />}
              <div className="pm-m-row-main">
                <div className="pm-m-row-title">{p.name}</div>
                {p.status && <div className="pm-m-row-meta">{p.status.toLowerCase()}</div>}
              </div>
              {current && <div className="pm-m-row-end">Open</div>}
            </button>
          );
        })}
      </div>

      {canCreate && (
        <button type="button" className="pm-m-btn pm-m-btn--block" onClick={onNewProject}>
          <i className="fas fa-plus" aria-hidden="true" /> New project
        </button>
      )}
    </div>
  );
}
