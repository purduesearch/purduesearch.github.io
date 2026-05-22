import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation, Link, Navigate, useNavigate } from 'react-router-dom';
import { useClubPmAuth } from '../../clubpm/ClubPmAuth';
import { get, post } from '../../api/clubPmClient';
import NotificationBell from './NotificationBell';
import AICommandPalette from './AICommandPalette';
import ErrorBoundary from './ErrorBoundary';
import { useProjectNav } from '../../clubpm/ProjectNavContext';

function getBreadcrumb(pathname) {
  if (pathname === '/clubpm') return [{ label: 'Dashboard' }];
  if (pathname.match(/\/clubpm\/projects\/[^/]+\/gantt/)) return [{ label: 'Projects', href: '/clubpm' }, { label: 'Gantt' }];
  if (pathname.match(/\/clubpm\/projects\/[^/]+/)) return [{ label: 'Projects', href: '/clubpm' }, { label: 'Project Detail' }];
  if (pathname === '/clubpm/members') return [{ label: 'Members' }];
  if (pathname === '/clubpm/notifications') return [{ label: 'Notifications' }];
  if (pathname === '/clubpm/notifications/preferences') return [{ label: 'Notifications', href: '/clubpm/notifications' }, { label: 'Preferences' }];
  if (pathname === '/clubpm/activity') return [{ label: 'Activity' }];
  if (pathname === '/clubpm/calendar') return [{ label: 'Calendar' }];
  if (pathname === '/clubpm/meeting-notes') return [{ label: 'Meeting Notes' }];
  if (pathname === '/clubpm/outreach') return [{ label: 'Outreach' }];
  return [{ label: 'Constellation' }];
}

const NAV_ITEMS = [
  {
    label: 'Dashboard',
    href: '/clubpm',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
      </svg>
    ),
  },
  {
    label: 'Calendar',
    href: '/clubpm/calendar',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
  },
  {
    label: 'Members',
    href: '/clubpm/members',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
  },
  {
    label: 'Outreach',
    href: '/clubpm/outreach',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.18h3a2 2 0 0 1 2 1.72c.127.96.36 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.74a16 16 0 0 0 6.29 6.29l.96-.96a2 2 0 0 1 2.11-.45c.907.34 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
      </svg>
    ),
  },
  {
    label: 'Notifications',
    href: '/clubpm/notifications',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
    ),
  },
];

function statusDotColor(status) {
  if (status === 'ACTIVE')    return 'var(--pm-accent-teal)';
  if (status === 'PAUSED')    return 'var(--pm-accent-amber)';
  if (status === 'COMPLETED') return 'var(--pm-accent-violet)';
  return 'var(--pm-text-muted)';
}

function CreateProjectModal({ onClose, onCreate }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('ENGINEERING');
  const [driveLink, setDriveLink] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true); setError(null);
    try {
      const project = await post('/api/projects', { name: name.trim(), type, driveLink: driveLink.trim() || undefined, targetDate: targetDate || undefined });
      onCreate(project);
      onClose();
    } catch (err) {
      setError(err.message ?? 'Failed to create project');
    } finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 900 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--pm-bg-elevated)', border: '1px solid var(--pm-border)', borderRadius: 12, width: '100%', maxWidth: 420, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--pm-border)' }}>
          <span style={{ fontFamily: 'var(--pm-font-display)', fontSize: '1rem', fontWeight: 700, color: 'var(--pm-text-primary)' }}>New Project</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--pm-text-muted)', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 20 }}>
            {[
              { label: 'Project Name *', el: <input type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Lunar Rover" /> },
              { label: 'Google Drive Link', el: <input type="url" value={driveLink} onChange={e => setDriveLink(e.target.value)} placeholder="https://drive.google.com/…" /> },
              { label: 'Target Date', el: <input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} /> },
            ].map(({ label, el }) => (
              <div key={label}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--pm-text-secondary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                {React.cloneElement(el, { style: { width: '100%', padding: '8px 10px', borderRadius: 6, background: 'var(--pm-bg-overlay)', border: '1px solid var(--pm-border)', color: 'var(--pm-text-primary)', fontSize: 13, boxSizing: 'border-box', ...(el.props.style ?? {}) } })}
              </div>
            ))}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--pm-text-secondary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Type</div>
              <select value={type} onChange={e => setType(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: 'var(--pm-bg-overlay)', border: '1px solid var(--pm-border)', color: 'var(--pm-text-primary)', fontSize: 13 }}>
                <option value="ENGINEERING">Engineering</option>
                <option value="RESEARCH">Research</option>
                <option value="HYBRID">Hybrid</option>
              </select>
            </div>
            {error && <p style={{ fontSize: 12, color: 'var(--pm-accent-coral)', margin: 0 }}>{error}</p>}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px', borderTop: '1px solid var(--pm-border)' }}>
            <button type="button" onClick={onClose} style={{ padding: '7px 16px', borderRadius: 6, background: 'none', border: '1px solid var(--pm-border)', color: 'var(--pm-text-secondary)', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ padding: '7px 16px', borderRadius: 6, background: 'var(--pm-accent-teal)', border: 'none', color: '#0d0f14', fontWeight: 700, cursor: 'pointer', fontSize: 13, opacity: saving ? 0.7 : 1 }}>{saving ? 'Creating…' : 'Create'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AppShell({ children }) {
  const { member, loading, logout } = useClubPmAuth();
  const { projectNav } = useProjectNav() ?? {};
  const location = useLocation();
  const navigate = useNavigate();
  const [theme, setTheme] = useState(() => localStorage.getItem('pm-theme') || 'dark');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sidebarProjects, setSidebarProjects] = useState([]);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [starredIds, setStarredIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pm-starred-projects') || '[]'); } catch { return []; }
  });

  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('pm-theme-light');
    } else {
      document.documentElement.classList.remove('pm-theme-light');
    }
    localStorage.setItem('pm-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (!member) return;
    get('/api/projects').then(setSidebarProjects).catch(() => {});
  }, [member]);

  useEffect(() => {
    const handler = () => {
      try { setStarredIds(JSON.parse(localStorage.getItem('pm-starred-projects') || '[]')); } catch {}
    };
    window.addEventListener('pm-stars-changed', handler);
    return () => window.removeEventListener('pm-stars-changed', handler);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen(p => !p);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(t => t === 'dark' ? 'light' : 'dark');
  }, []);

  if (loading) {
    return (
      <div className="clubpm-app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--pm-bg-base)' }}>
        <div className="cpm-spinner" />
      </div>
    );
  }

  if (!member) {
    return <Navigate to="/clubpm/login" replace />;
  }

  const crumbs = getBreadcrumb(location.pathname);
  const initials = (member.displayName || '?').slice(0, 2).toUpperCase();

  return (
    <div className="clubpm-app pm-shell">
      {/* Sidebar */}
      <nav className="pm-sidebar">
        {/* Logo */}
        <div className="pm-sidebar-logo">
          <motion.div
            className="pm-sidebar-logo-mark"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 320, damping: 20, delay: 0.1 }}
          >
            {/* two-star constellation icon */}
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <circle cx="5" cy="13" r="2" fill="#0d0f14"/>
              <circle cx="13" cy="5" r="2" fill="#0d0f14"/>
              <line x1="5" y1="13" x2="13" y2="5" stroke="#0d0f14" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="5" cy="13" r="1" fill="rgba(13,15,20,0.5)"/>
              <circle cx="13" cy="5" r="1" fill="rgba(13,15,20,0.5)"/>
            </svg>
          </motion.div>
          <span className="pm-sidebar-logo-text">Constellation</span>
        </div>

        {/* Nav items */}
        <div className="pm-sidebar-nav">
          {NAV_ITEMS.map(item => {
            const isActive = location.pathname === item.href ||
              (item.href === '/clubpm' && location.pathname.startsWith('/clubpm/projects'));
            return (
              <Link
                key={item.href}
                to={item.href}
                className={`pm-nav-item${isActive ? ' active' : ''}`}
              >
                <span className="pm-nav-item-icon">{item.icon}</span>
                <span className="pm-nav-item-label">{item.label}</span>
              </Link>
            );
          })}
          {member?.isAdmin && (
            <Link
              to="/clubpm/meeting-notes"
              className={`pm-nav-item${location.pathname === '/clubpm/meeting-notes' ? ' active' : ''}`}
            >
              <span className="pm-nav-item-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                  <polyline points="10 9 9 9 8 9"/>
                </svg>
              </span>
              <span className="pm-nav-item-label">Meeting Notes</span>
            </Link>
          )}
        </div>

        {/* Project-specific tabs — visible when inside a project */}
        {projectNav && (
          <div className="pm-sidebar-project-tabs">
            <div className="pm-sidebar-section-header">
              <span className="pm-sidebar-section-label">{projectNav.projectName}</span>
            </div>
            {projectNav.tabs.map(tab => (
              <button
                key={tab.id}
                className={`pm-nav-item${projectNav.activeTab === tab.id ? ' active' : ''}`}
                onClick={() => projectNav.onTabChange(tab.id)}
              >
                <span className="pm-nav-item-icon pm-nav-item-icon--emoji">{tab.icon}</span>
                <span className="pm-nav-item-label">{tab.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Projects section */}
        <div className="pm-sidebar-projects">
          <div className="pm-sidebar-section-header">
            <span className="pm-sidebar-section-label">Projects</span>
            {member?.isAdmin && (
              <button
                className="pm-sidebar-project-add"
                title="New project"
                onClick={() => setShowCreateProject(true)}
              >+</button>
            )}
          </div>
          <div className="pm-sidebar-project-list">
            {[...sidebarProjects]
              .sort((a, b) => {
                const aS = starredIds.includes(a.id) ? 0 : 1;
                const bS = starredIds.includes(b.id) ? 0 : 1;
                return aS - bS;
              })
              .map(p => (
              <Link
                key={p.id}
                to={`/clubpm/projects/${p.id}`}
                className={`pm-sidebar-project-item${location.pathname === `/clubpm/projects/${p.id}` ? ' active' : ''}`}
              >
                {starredIds.includes(p.id)
                  ? <span style={{ color: '#f9ca24', fontSize: 13, flexShrink: 0, lineHeight: 1 }}>★</span>
                  : <span className="pm-sidebar-project-dot" style={{ background: statusDotColor(p.status) }} />
                }
                <span className="pm-sidebar-project-name">{p.name}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="pm-sidebar-footer">
          <div className="pm-sidebar-user">
            {member.avatarUrl
              ? <img src={member.avatarUrl} alt="" className="pm-user-avatar" />
              : <div className="pm-user-avatar">{initials}</div>
            }
            <div className="pm-user-info">
              <div className="pm-user-name">{member.displayName}</div>
              <div className="pm-user-handle">@{member.slackHandle}</div>
            </div>
          </div>
          <button className="pm-signout-btn" onClick={logout}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            <span className="pm-signout-label">Sign out</span>
          </button>
        </div>
      </nav>

      {/* Right: topbar + content */}
      <div className="pm-shell-main">
        <header className="pm-topbar">
          {/* Breadcrumb */}
          <div className="pm-breadcrumb">
            {crumbs.map((crumb, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span className="pm-breadcrumb-sep">›</span>}
                {crumb.href
                  ? <Link to={crumb.href} style={{ color: 'var(--pm-text-secondary)', textDecoration: 'none' }}>{crumb.label}</Link>
                  : <span className="pm-breadcrumb-current">{crumb.label}</span>
                }
              </React.Fragment>
            ))}
          </div>

          {/* Actions */}
          <div className="pm-topbar-actions">
            {/* Cmd+K trigger */}
            <button className="pm-cmd-k-btn" title="Search (⌘K)" onClick={() => setPaletteOpen(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <span style={{ fontSize: '0.7rem' }}>⌘K</span>
            </button>

            {/* Notification bell */}
            <NotificationBell />

            {/* Theme toggle */}
            <button className="pm-topbar-btn" onClick={toggleTheme} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
              {theme === 'dark' ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5"/>
                  <line x1="12" y1="1" x2="12" y2="3"/>
                  <line x1="12" y1="21" x2="12" y2="23"/>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                  <line x1="1" y1="12" x2="3" y2="12"/>
                  <line x1="21" y1="12" x2="23" y2="12"/>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              )}
            </button>
          </div>
        </header>

        <AnimatePresence mode="wait">
          <motion.main
            key={location.pathname}
            className="pm-shell-content"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ type: 'spring', stiffness: 280, damping: 24, mass: 0.8 }}
          >
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
          </motion.main>
        </AnimatePresence>
      </div>

      <AICommandPalette
        isOpen={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        projects={sidebarProjects}
      />
      {showCreateProject && (
        <CreateProjectModal
          onClose={() => setShowCreateProject(false)}
          onCreate={project => setSidebarProjects(prev => [project, ...prev])}
        />
      )}
    </div>
  );
}
