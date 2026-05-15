import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { get } from '../../api/clubPmClient';

const QUICK_COMMANDS = [
  { id: 'new-project', label: '/new-project', description: 'Create a new project', route: '/clubpm' },
  { id: 'my-tasks',   label: '/my-tasks',    description: 'Go to your task dashboard', route: '/clubpm' },
];

export default function AICommandPalette({ isOpen, onClose, projects = [] }) {
  const navigate  = useNavigate();
  const inputRef  = useRef(null);
  const listRef   = useRef(null);
  const debounceRef = useRef(null);

  const [query, setQuery]         = useState('');
  const [debouncedQ, setDQ]       = useState('');
  const [selectedIdx, setIdx]     = useState(0);
  const [taskResults, setTaskResults] = useState([]);
  const [taskLoading, setTaskLoading] = useState(false);

  // Auto-focus when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setDQ('');
      setIdx(0);
      setTaskResults([]);
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // Debounce input
  const handleChange = useCallback((e) => {
    const val = e.target.value;
    setQuery(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDQ(val), 200);
  }, []);

  // Escape closes palette
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Live task search via API
  useEffect(() => {
    const q = debouncedQ.trim();
    if (!q || q.startsWith('/')) {
      setTaskResults([]);
      return;
    }
    setTaskLoading(true);
    get(`/api/tasks/search?q=${encodeURIComponent(q)}`)
      .then(data => setTaskResults(
        (data || []).slice(0, 8).map(t => ({
          type: 'task',
          id: t.id,
          title: t.title,
          projectName: t.project?.name ?? '',
          projectId: t.projectId,
        }))
      ))
      .catch(() => setTaskResults([]))
      .finally(() => setTaskLoading(false));
  }, [debouncedQ]);

  // Build flat results list
  const results = useMemo(() => {
    const q = debouncedQ.trim().toLowerCase();

    if (q.startsWith('/')) {
      return QUICK_COMMANDS
        .filter(c => c.label.startsWith(q) || c.description.toLowerCase().includes(q.slice(1)))
        .map(c => ({ type: 'command', ...c }));
    }

    if (!q) return [];

    const matchedProjects = projects
      .filter(p => (p.name || p.title || '').toLowerCase().includes(q))
      .slice(0, 5)
      .map(p => ({ type: 'project', id: p.id, name: p.name || p.title, status: p.status }));

    return [...matchedProjects, ...taskResults];
  }, [debouncedQ, projects, taskResults]);

  // Reset selection when results change
  useEffect(() => { setIdx(0); }, [results]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIdx(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results.length > 0) {
      e.preventDefault();
      activateItem(results[selectedIdx]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, selectedIdx]);

  const activateItem = useCallback((item) => {
    if (!item) return;
    onClose();
    if (item.type === 'command') {
      navigate(item.route);
    } else if (item.type === 'project') {
      navigate(`/clubpm/projects/${item.id}`);
    } else if (item.type === 'task') {
      navigate(`/clubpm/projects/${item.projectId}`);
    }
  }, [navigate, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector('.pm-palette-item.selected');
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIdx]);

  if (!isOpen) return null;

  const q = debouncedQ.trim();
  const isCommandMode = q.startsWith('/');
  const projectResults = results.filter(r => r.type === 'project');
  const commandResults = results.filter(r => r.type === 'command');
  const filteredTaskResults = results.filter(r => r.type === 'task');

  let flatIdx = 0;
  const renderItem = (item) => {
    const myIdx = flatIdx++;
    const isSelected = myIdx === selectedIdx;
    return (
      <div
        key={item.id}
        className={`pm-palette-item${isSelected ? ' selected' : ''}`}
        onMouseEnter={() => setIdx(myIdx)}
        onClick={() => activateItem(item)}
      >
        <span className="pm-palette-item-icon">
          {item.type === 'project' && '📁'}
          {item.type === 'task'    && '✓'}
          {item.type === 'command' && '⌘'}
        </span>
        <span className="pm-palette-item-text">
          {item.type === 'project' && item.name}
          {item.type === 'task'    && item.title}
          {item.type === 'command' && item.label}
        </span>
        <span className="pm-palette-item-meta">
          {item.type === 'project' && item.status && (
            <span className="pm-palette-status-chip">{item.status}</span>
          )}
          {item.type === 'task' && item.projectName}
          {item.type === 'command' && item.description}
        </span>
      </div>
    );
  };

  const content = (
    <div className="pm-palette-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pm-palette-box">
        <div className="pm-palette-input-wrap">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: 'var(--pm-text-muted)' }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            ref={inputRef}
            className="pm-palette-input"
            type="text"
            placeholder="Search tasks and projects…"
            value={query}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--pm-text-muted)', padding: '0 4px', lineHeight: 1 }}
              onClick={() => { setQuery(''); setDQ(''); setTaskResults([]); inputRef.current?.focus(); }}
              tabIndex={-1}
            >
              ×
            </button>
          )}
        </div>

        <div className="pm-palette-results" ref={listRef}>
          {!q && (
            <div className="pm-palette-empty">
              Type to search across your workspace
            </div>
          )}

          {isCommandMode && commandResults.length > 0 && (
            <>
              <div className="pm-palette-group-label">Commands</div>
              {commandResults.map(item => renderItem(item))}
            </>
          )}

          {isCommandMode && q && commandResults.length === 0 && (
            <div className="pm-palette-empty">No commands match "{q}"</div>
          )}

          {!isCommandMode && q && results.length === 0 && !taskLoading && (
            <div className="pm-palette-empty">No results for "{q}"</div>
          )}

          {!isCommandMode && taskLoading && results.length === 0 && (
            <div className="pm-palette-empty" style={{ color: 'var(--pm-text-muted)' }}>Searching…</div>
          )}

          {!isCommandMode && projectResults.length > 0 && (
            <>
              <div className="pm-palette-group-label">Projects</div>
              {projectResults.map(item => renderItem(item))}
            </>
          )}

          {!isCommandMode && filteredTaskResults.length > 0 && (
            <>
              <div className="pm-palette-group-label">Tasks</div>
              {filteredTaskResults.map(item => renderItem(item))}
            </>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
