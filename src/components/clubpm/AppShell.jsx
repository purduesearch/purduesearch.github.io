import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import OrbitLoader from '../OrbitLoader';
import { useLocation, Link, Navigate, useNavigate } from 'react-router-dom';
import { useClubPmAuth } from '../../clubpm/ClubPmAuth';
import { get, post, getCrPendingCount, listPendingCertificates } from '../../api/clubPmClient';
import { CR_COUNT_EVENT } from './vault/vaultUtils';
import { useShortcutsRegistry } from '../../clubpm/ShortcutsRegistry';
import NotificationBell from './NotificationBell';
import AICommandPalette from './AICommandPalette';
import ErrorBoundary from './ErrorBoundary';
import { useProjectNav } from '../../clubpm/ProjectNavContext';
import AvatarPortrait from './avatar/AvatarPortrait';
import RankIcon from './RankIcon';
import CosmeticUnlockModal from './CosmeticUnlockModal';
import QuestCompleteToast from './QuestCompleteToast';
import RewardQueuedToast from './RewardQueuedToast';
import AchievementUnlockListener from './AchievementUnlockListener';
import StreakBadge from './StreakBadge';
import RankUpModal from './celebrate/RankUpModal';
import StreakMilestoneModal from './celebrate/StreakMilestoneModal';
import RewardFlux from './RewardFlux';
import useRankWatcher from '../../hooks/useRankWatcher';
import useCelebrationCheck from '../../hooks/useCelebrationCheck';
import { tweenNumber, tweenWidthPercent } from '../../clubpm/anim/motion';
import { progressToNextRank } from '../../clubpm/engagement/rankProgress';
import CosmeticStylesProvider from '../../clubpm/cosmetics/CosmeticStylesContext';
import { useCompactLayout, COMPACT_CLASS } from '../../clubpm/layout/compactLayout';
import { useVisualViewportKeyboard } from '../../clubpm/layout/visualViewportKeyboard';
import { useShellOverlay, getShellReveal, SHELL_REVEAL_EVENT, SHELL_OPEN_EVENT } from '../../clubpm/layout/shellOverlay';
import useNotificationFeed from './useNotificationFeed';
import MobileHeader, { MobileProjectSections } from './MobileHeader';
import MobileBottomNav from './MobileBottomNav';
import MobileSheet from './MobileSheet';
import MobileProjectPicker from './MobileProjectPicker';
import MobileMoreMenu from './MobileMoreMenu';

function getBreadcrumb(pathname) {
  if (pathname === '/clubpm') return [{ label: 'Dashboard' }];
  if (pathname.match(/\/clubpm\/projects\/[^/]+\/gantt/)) return [{ label: 'Projects', href: '/clubpm' }, { label: 'Gantt' }];
  if (pathname.match(/\/clubpm\/projects\/[^/]+/)) return [{ label: 'Projects', href: '/clubpm' }, { label: 'Project Detail' }];
  if (pathname === '/clubpm/members') return [{ label: 'Social' }, { label: 'Members' }];
  if (pathname === '/clubpm/courses') return [{ label: 'Other' }, { label: 'Courses' }];
  if (pathname.match(/\/clubpm\/courses\/[^/]+\/edit/)) return [{ label: 'Other' }, { label: 'Courses', href: '/clubpm/courses' }, { label: 'Editor' }];
  if (pathname.match(/\/clubpm\/courses\/[^/]+\/learn/)) return [{ label: 'Other' }, { label: 'Courses', href: '/clubpm/courses' }, { label: 'Player' }];
  if (pathname === '/clubpm/notifications') return [{ label: 'Notifications' }];
  if (pathname === '/clubpm/notifications/preferences') return [{ label: 'Notifications', href: '/clubpm/notifications' }, { label: 'Preferences' }];
  if (pathname === '/clubpm/activity') return [{ label: 'Activity' }];
  if (pathname === '/clubpm/calendar') return [{ label: 'Social' }, { label: 'Calendar' }];
  if (pathname === '/clubpm/admin') return [{ label: 'Other' }, { label: 'Admin' }];
  if (pathname === '/clubpm/meeting-notes') return [{ label: 'Other' }, { label: 'Admin', href: '/clubpm/admin' }, { label: 'Meeting Notes' }];
  if (pathname === '/clubpm/outreach') return [{ label: 'Other' }, { label: 'Outreach Hub' }];
  if (pathname === '/clubpm/profile') return [{ label: 'Profile' }];
  if (pathname.startsWith('/clubpm/profile/')) return [{ label: 'Members', href: '/clubpm/members' }, { label: 'Profile' }];
  if (pathname === '/clubpm/shop') return [{ label: 'Shop' }];
  if (pathname === '/clubpm/challenges') return [{ label: 'Challenges' }];
  if (pathname.startsWith('/clubpm/chat')) return [{ label: 'Social' }, { label: 'Chat' }];
  return [{ label: 'Constellation' }];
}

const NAV_ITEMS = [
  {
    label: 'Dashboard',
    href: '/clubpm',
    tourId: 'nav.dashboard',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
      </svg>
    ),
  },
  {
    label: 'Social',
    id: 'social',
    tourId: 'nav.social',
    icon: <i className="fas fa-comments" aria-hidden="true" style={{ fontSize: 15, width: 18, textAlign: 'center' }} />,
    children: [
      { label: 'Chat',    href: '/clubpm/chat', tourId: 'nav.chat' },
      { label: 'Members', href: '/clubpm/members', tourId: 'nav.members' },
      { label: 'Calendar', href: '/clubpm/calendar', tourId: 'nav.calendar' },
    ],
  },
  {
    label: 'Other',
    id: 'other',
    tourId: 'nav.other',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
      </svg>
    ),
    children: [
      { label: 'Outreach Hub', href: '/clubpm/outreach' },
      { label: 'Blog',         href: '/clubpm/outreach?tab=blog', activePrefixes: ['/clubpm/outreach/blog/'] },
      { label: 'Courses',      href: '/clubpm/courses', tourId: 'nav.courses', activePrefixes: ['/clubpm/courses/'] },
      { label: 'Admin',        href: '/clubpm/admin', tourId: 'nav.admin', adminOnly: true, activePrefixes: ['/clubpm/meeting-notes'] },
    ],
  },
];

// A child is "current" on an exact pathname match, and additionally on its own
// `?tab=` when it carries one — /clubpm/outreach and /clubpm/outreach?tab=blog
// are the same route but must not both light up.
function isChildActive(child, location) {
  if (child.activePrefixes?.some(prefix => location.pathname.startsWith(prefix))) return true;
  const [path, query] = child.href.split('?');
  if (location.pathname !== path) return false;
  const wantTab = query ? new URLSearchParams(query).get('tab') : null;
  const haveTab = new URLSearchParams(location.search).get('tab');
  return wantTab ? haveTab === wantTab : !haveTab;
}

function NavGroup({ item, location, isAdmin, adminCounts }) {
  const children = item.children.filter(child => !child.adminOnly || isAdmin);
  const hasActiveChild = children.some(c => isChildActive(c, location));
  // Groups start collapsed on every mount, then reveal the current destination.
  const [open, setOpen] = useState(false);
  useEffect(() => { if (hasActiveChild) setOpen(true); }, [hasActiveChild]);

  const toggle = () => setOpen(prev => !prev);

  return (
    <div className="pm-nav-group">
      <button
        type="button"
        className={`pm-nav-item pm-nav-group-header${hasActiveChild && !open ? ' active' : ''}`}
        onClick={toggle}
        aria-expanded={open}
        data-tour-id={item.tourId}
      >
        <span className="pm-nav-item-icon">{item.icon}</span>
        <span className="pm-nav-item-label">{item.label}</span>
        <i className={`fas fa-chevron-${open ? 'down' : 'right'} pm-nav-group-chevron`} aria-hidden="true" />
      </button>
      {open && (
        <div className="pm-nav-group-children">
          {children.map(child => (
            <Link
              key={child.href}
              to={child.href}
              className={`pm-nav-item pm-nav-child${isChildActive(child, location) ? ' active' : ''}`}
              data-tour-id={child.tourId}
            >
              <span className="pm-nav-item-label" style={child.adminOnly ? { display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' } : undefined}>
                <span>{child.label}</span>
                {child.adminOnly && (adminCounts.rewards > 0 || adminCounts.crs > 0 || adminCounts.certificates > 0) && (
                  <span className="pm-admin-badge-group">
                    {adminCounts.rewards > 0 && <span className="pm-admin-badge" title="Pending rewards">{adminCounts.rewards}</span>}
                    {adminCounts.crs > 0 && <span className="pm-admin-badge" title="Open change requests">{adminCounts.crs}</span>}
                    {adminCounts.certificates > 0 && <span className="pm-admin-badge" title="Certificates awaiting review">{adminCounts.certificates}</span>}
                  </span>
                )}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function statusDotColor(status) {
  if (status === 'ACTIVE')    return 'var(--pm-accent-teal)';
  if (status === 'PAUSED')    return 'var(--pm-accent-amber)';
  if (status === 'COMPLETED') return 'var(--pm-accent-violet)';
  return 'var(--pm-text-muted)';
}

function CreateProjectModal({ onClose, onCreate }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('ENGINEERING');
  const [targetDate, setTargetDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true); setError(null);
    try {
      const project = await post('/api/projects', { name: name.trim(), type, targetDate: targetDate || undefined });
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

function SidebarXpDoubloons({ member }) {
  const navigate = useNavigate();
  const xp = member.xp ?? 0;
  const doubloons = member.doubloons ?? 0;
  const { pct, next } = progressToNextRank(xp);

  const barFillRef = useRef(null);
  const xpNumRef = useRef(null);
  const dbNumRef = useRef(null);
  const prevRef = useRef({ xp, doubloons, pct });

  useEffect(() => {
    const prev = prevRef.current;
    tweenWidthPercent(barFillRef.current, prev.pct, pct, { duration: 800 });
    tweenNumber(xpNumRef.current, prev.xp, xp, { duration: 800 });
    tweenNumber(dbNumRef.current, prev.doubloons, doubloons, { duration: 800 });
    prevRef.current = { xp, doubloons, pct };
  }, [xp, doubloons, pct]);

  return (
    <div className="pm-sidebar-xp" data-reward-anchor="sidebar-xp" data-tour-id="nav.xp">
      <div className="pm-sidebar-xp-bar">
        <div ref={barFillRef} className="pm-sidebar-xp-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="pm-sidebar-xp-meta">
        <span className="pm-sidebar-xp-text">
          <span ref={xpNumRef}>{xp.toLocaleString()}</span>
          {next ? ` / ${next.minXp.toLocaleString()} XP` : ' XP · max'}
        </span>
        <button
          type="button"
          className="pm-sidebar-doubloons pm-sidebar-doubloons--link"
          data-reward-anchor="sidebar-doubloons"
          data-tour-id="nav.shop"
          title="Open Shop"
          onClick={() => navigate('/clubpm/shop')}
        >
          <i className="fas fa-coins" aria-hidden="true" />
          <span ref={dbNumRef}>{doubloons.toLocaleString()}</span>
        </button>
      </div>
    </div>
  );
}

export default function AppShell({ children }) {
  const { member, loading, logout } = useClubPmAuth();
  const { setShowHelp } = useShortcutsRegistry() ?? {};
  const {
    projectNav,
    projects: sidebarProjects,
    setProjects: setSidebarProjects,
    projectsLoad,
    setProjectsLoad,
  } = useProjectNav() ?? {};
  const location = useLocation();
  const compact = useCompactLayout();
  const keyboard = useVisualViewportKeyboard(compact);
  const { overlay, openOverlay, closeOverlay, navigateFromOverlay } = useShellOverlay();
  // One feed for the whole shell, whichever presentation is mounted.
  const notificationFeed = useNotificationFeed({ enabled: !loading && !!member });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [starredIds, setStarredIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pm-starred-projects') || '[]'); } catch { return []; }
  });

  useEffect(() => {
    document.documentElement.classList.remove('pm-theme-light');
    try { localStorage.removeItem('pm-theme'); } catch {}
  }, []);

  // Legacy dialogs portal straight to <body>, outside the shell, so the
  // `.pm-shell--compact` class on the shell root cannot reach them. This marker
  // lets the compact stylesheet size those portals for a phone without every
  // one of them having to thread the layout hook through its own render.
  // Removed with the shell, so the desktop tree never carries it.
  useEffect(() => {
    if (!compact) return undefined;
    document.body.classList.add('pm-m-compact');
    return () => document.body.classList.remove('pm-m-compact');
  }, [compact]);

  const { pendingRank, dismissRank } = useRankWatcher();
  const { celebration, clearCelebration } = useCelebrationCheck();

  const [pendingRewardsCount, setPendingRewardsCount] = useState(0);
  const [pendingCrCount, setPendingCrCount] = useState(0);
  const [pendingCertCount, setPendingCertCount] = useState(0);

  const fetchPendingCount = useCallback(() => {
    if (!member?.isAdmin) return;
    get('/api/rewards/pending/count')
      .then(res => setPendingRewardsCount(res.count ?? 0))
      .catch(() => setPendingRewardsCount(0));
  }, [member]);

  const fetchPendingCrCount = useCallback(() => {
    if (!member?.isAdmin) return;
    getCrPendingCount()
      .then(res => setPendingCrCount(res.count ?? 0))
      .catch(() => setPendingCrCount(0));
  }, [member]);

  const fetchPendingCertCount = useCallback(() => {
    if (!member?.isAdmin) return;
    listPendingCertificates()
      .then(res => setPendingCertCount(res?.count ?? 0))
      .catch(() => setPendingCertCount(0));
  }, [member]);

  useEffect(() => {
    if (!member) return;
    fetchPendingCount();
    fetchPendingCrCount();
    fetchPendingCertCount();
    window.addEventListener('clubpm:pending-rewards-updated', fetchPendingCount);
    window.addEventListener(CR_COUNT_EVENT, fetchPendingCrCount);
    return () => {
      window.removeEventListener('clubpm:pending-rewards-updated', fetchPendingCount);
      window.removeEventListener(CR_COUNT_EVENT, fetchPendingCrCount);
    };
  }, [member, fetchPendingCount, fetchPendingCrCount, fetchPendingCertCount]);

  const loadProjects = useCallback(() => {
    setProjectsLoad({ status: 'loading', message: '' });
    return get('/api/projects')
      .then(list => {
        setSidebarProjects(list);
        setProjectsLoad({ status: 'ready', message: '' });
      })
      .catch(err => setProjectsLoad({ status: 'error', message: err?.message ?? '' }));
  }, [setProjectsLoad, setSidebarProjects]);

  useEffect(() => {
    if (!member) return;
    loadProjects();
  }, [member, loadProjects]);

  useEffect(() => {
    const refresh = () => loadProjects();
    window.addEventListener('pm-projects-refresh', refresh);
    return () => window.removeEventListener('pm-projects-refresh', refresh);
  }, [loadProjects]);

  // EditProjectModal broadcasts saves so a rename shows up in the sidebar immediately.
  useEffect(() => {
    const handler = (e) => {
      const updated = e.detail;
      if (!updated?.id) return;
      setSidebarProjects(prev => prev.map(p => (p.id === updated.id ? { ...p, ...updated } : p)));
    };
    window.addEventListener('pm-project-updated', handler);
    return () => window.removeEventListener('pm-project-updated', handler);
  }, [setSidebarProjects]);

  // Apply equipped dashboard theme (cosmetic) as `theme-<slug>` on documentElement.
  // Re-applies when the avatar-updated event fires.
  useEffect(() => {
    if (!member) return;
    const applyTheme = async () => {
      try {
        const profile = await get(`/api/members/${member.id}/profile`);
        const slug = profile?.equippedCosmetics?.theme?.cssSlug;
        const root = document.documentElement;
        Array.from(root.classList).forEach(c => {
          if (c.startsWith('theme-')) root.classList.remove(c);
        });
        if (slug) root.classList.add(`theme-${slug}`);
      } catch {}
    };
    applyTheme();
    const handler = () => applyTheme();
    window.addEventListener('avatar-updated', handler);
    return () => window.removeEventListener('avatar-updated', handler);
  }, [member?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = () => {
      try { setStarredIds(JSON.parse(localStorage.getItem('pm-starred-projects') || '[]')); } catch {}
    };
    window.addEventListener('pm-stars-changed', handler);
    return () => window.removeEventListener('pm-stars-changed', handler);
  }, []);

  // The phone presentation keeps its open sheet in history (useShellOverlay);
  // the listeners below are registered once, so they read it through a ref.
  const overlayApiRef = useRef({ compact, overlay, openOverlay, closeOverlay });
  overlayApiRef.current = { compact, overlay, openOverlay, closeOverlay };

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        const api = overlayApiRef.current;
        if (!api.compact) { setPaletteOpen(p => !p); return; }
        if (api.overlay === 'search') api.closeOverlay();
        else api.openOverlay('search');
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Walkthrough reveal (contracts.md §7): a compact tour step can ask for the
  // More or Projects sheet to be open before its anchor is measured. The
  // request is sticky (read on mount) because this shell remounts per route.
  // Only a sheet the tour opened is closed by the tour.
  const tourOpenedRef = useRef(null);
  useEffect(() => {
    const apply = (target) => {
      const api = overlayApiRef.current;
      if (!api.compact) return;
      if (target === 'expand') return; // page-owned <details> listens itself
      if (target) {
        tourOpenedRef.current = target;
        if (api.overlay !== target) api.openOverlay(target);
      } else if (tourOpenedRef.current) {
        const opened = tourOpenedRef.current;
        tourOpenedRef.current = null;
        if (api.overlay === opened) api.closeOverlay();
      }
    };
    const onReveal = (e) => apply(e.detail?.target ?? null);
    const pending = getShellReveal(window.location.pathname);
    if (pending) apply(pending);
    window.addEventListener(SHELL_REVEAL_EVENT, onReveal);
    return () => window.removeEventListener(SHELL_REVEAL_EVENT, onReveal);
  // Re-run when the layout flips so a reveal requested on desktop applies
  // after a resize into the compact shell.
  }, [compact]);

  useEffect(() => {
    const onOpen = e => {
      const api = overlayApiRef.current;
      if (api.compact && e.detail?.id) api.openOverlay(e.detail.id);
    };
    window.addEventListener(SHELL_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(SHELL_OPEN_EVENT, onOpen);
  }, []);

  if (loading) {
    return (
      <div className="clubpm-app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--pm-bg-base)' }}>
        <OrbitLoader size={120} />
      </div>
    );
  }

  if (!member) {
    return <Navigate to="/clubpm/login" replace />;
  }

  const crumbs = getBreadcrumb(location.pathname);
  // Rank-up + milestone celebrations are mounted at the shell level so they
  // survive route transitions and are not duplicated per route.

  return (
    <CosmeticStylesProvider>
    <div
      className={`clubpm-app pm-shell${compact ? ` ${COMPACT_CLASS}${keyboard.open ? ' pm-m-keyboard-open' : ''}` : ''}`}
      style={compact && keyboard.height ? {
        '--pm-m-visual-height': `${keyboard.height}px`,
        '--pm-m-visual-top': `${keyboard.top}px`,
      } : undefined}
    >
      {/* Sidebar — desktop only. Every slot below stays at a fixed position in
          the tree whichever branch is mounted (null placeholders), so crossing
          the compact breakpoint never remounts the page: drafts, filters and
          open dialogs in `children` survive a rotation. */}
      {compact ? null : (
      <nav className="pm-sidebar" data-tour-id="nav.sidebar">
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
            if (item.children) return (
              <NavGroup
                key={item.id}
                item={item}
                location={location}
                isAdmin={!!member?.isAdmin}
                adminCounts={{ rewards: pendingRewardsCount, crs: pendingCrCount, certificates: pendingCertCount }}
              />
            );
            const isActive = location.pathname === item.href ||
              (item.href === '/clubpm' && location.pathname.startsWith('/clubpm/projects')) ||
              (item.href === '/clubpm/courses' && location.pathname.startsWith('/clubpm/courses')) ||
              (item.href === '/clubpm/chat' && location.pathname.startsWith('/clubpm/chat'));
            return (
              <Link
                key={item.href}
                to={item.href}
                className={`pm-nav-item${isActive ? ' active' : ''}`}
                data-tour-id={item.tourId}
              >
                <span className="pm-nav-item-icon">{item.icon}</span>
                <span className="pm-nav-item-label">{item.label}</span>
              </Link>
            );
          })}
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
                data-tour-id={tab.tourId}
              >
                <span className="pm-nav-item-icon">{tab.icon}</span>
                <span className="pm-nav-item-label">{tab.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Projects section */}
        <div className="pm-sidebar-projects" data-tour-id="nav.projects">
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
          <Link to="/clubpm/profile" className="pm-sidebar-user pm-sidebar-user--link" title="Your profile" data-tour-id="nav.profile">
            <AvatarPortrait member={member} size={32} className="pm-user-avatar" />
            <div className="pm-user-info">
              <div className="pm-user-name">{member.displayName}</div>
              <div className="pm-user-handle">@{member.slackHandle}</div>
            </div>
            <span className="pm-sidebar-rank" data-tour-id="nav.rank">
              <RankIcon member={member} size={26} />
            </span>
          </Link>
          {member && <SidebarXpDoubloons member={member} />}
          <Link to="/" className="pm-backhome-btn" title="Back to the SEARCH site">
            <i className="fas fa-house" aria-hidden="true" />
            <span className="pm-backhome-label">Main site</span>
          </Link>
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
      )}

      {/* Right: topbar + content */}
      <div className="pm-shell-main">
        {compact ? (
          <MobileHeader
            projectName={projectNav?.projectName}
            unreadCount={notificationFeed.unreadCount}
            overlay={overlay}
            onOpenSearch={() => openOverlay('search')}
            onOpenProjects={() => openOverlay('projects')}
          />
        ) : (
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
            {/* Keyboard shortcuts */}
            <button className="pm-topbar-btn" title="Keyboard shortcuts (?)" aria-label="Show keyboard shortcuts" onClick={() => setShowHelp?.(true)}>
              <i className="fas fa-keyboard" aria-hidden="true" style={{ fontSize: 14 }} />
            </button>

            {/* Cmd+K trigger */}
            <button className="pm-cmd-k-btn" title="Search (⌘K)" onClick={() => setPaletteOpen(true)} data-tour-id="topbar.search">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <span style={{ fontSize: '0.7rem' }}>⌘K</span>
            </button>

            {/* Quests */}
            <Link
              to="/clubpm/challenges"
              className={`pm-topbar-btn${location.pathname === '/clubpm/challenges' ? ' active' : ''}`}
              title="Quests & achievements"
              aria-label="Quests and achievements"
              data-tour-id="topbar.challenges"
            >
              <i className="fas fa-trophy" aria-hidden="true" style={{ fontSize: 14 }} />
            </Link>

            {/* Streak badge */}
            {member ? <div data-tour-id="topbar.streak"><StreakBadge /></div> : null}

            {/* Notification bell */}
            <div data-tour-id="topbar.notifications"><NotificationBell feed={notificationFeed} /></div>
          </div>
        </header>
        )}

        {compact && projectNav ? <MobileProjectSections projectNav={projectNav} /> : null}

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

      {compact ? (
        <MobileBottomNav
          pathname={location.pathname}
          overlay={overlay}
          onOpenProjects={() => openOverlay('projects')}
          onOpenMore={() => openOverlay('more')}
        />
      ) : null}

      {compact && overlay === 'projects' ? (
        <MobileSheet
          title="Projects"
          onClose={closeOverlay}
          returnFocusSelector={projectNav ? '[data-m-opener="project-title"]' : '[data-m-opener="projects"]'}
        >
          <MobileProjectPicker
            projects={sidebarProjects}
            starredIds={starredIds}
            loadState={projectsLoad}
            onRetry={loadProjects}
            currentProjectId={projectNav?.projectId ?? null}
            currentProjectName={projectNav?.projectName ?? null}
            projectActions={projectNav?.actions ?? []}
            canCreate={!!member?.isAdmin}
            onSelectProject={p => {
              if (p.id === projectNav?.projectId) closeOverlay();
              else navigateFromOverlay(`/clubpm/projects/${p.id}`);
            }}
            onSelectAction={action => {
              if (action.to) { navigateFromOverlay(action.to); return; }
              closeOverlay();
              action.onSelect?.();
            }}
            onNewProject={() => { closeOverlay(); setShowCreateProject(true); }}
          />
        </MobileSheet>
      ) : null}

      {compact && overlay === 'more' ? (
        <MobileSheet title="More" onClose={closeOverlay} returnFocusSelector='[data-m-opener="more"]'>
          <MobileMoreMenu
            member={member}
            location={location}
            adminCounts={{ rewards: pendingRewardsCount, crs: pendingCrCount, certificates: pendingCertCount }}
            onNavigate={navigateFromOverlay}
            onShowHelp={() => { closeOverlay(); setShowHelp?.(true); }}
            onLogout={logout}
          />
        </MobileSheet>
      ) : null}

      <AICommandPalette
        isOpen={compact ? overlay === 'search' : paletteOpen}
        onClose={compact ? closeOverlay : () => setPaletteOpen(false)}
        onNavigate={compact ? navigateFromOverlay : undefined}
        compact={compact}
        projects={sidebarProjects}
      />
      {showCreateProject && (
        <CreateProjectModal
          onClose={() => setShowCreateProject(false)}
          onCreate={project => setSidebarProjects(prev => [project, ...prev])}
        />
      )}
      {pendingRank ? <RankUpModal rank={pendingRank} onDismiss={dismissRank} /> : null}
      {celebration ? (
        <StreakMilestoneModal
          milestone={celebration.milestone}
          longestStreak={celebration.longestStreak}
          freezeAwarded={celebration.freezeAwarded}
          onDismiss={clearCelebration}
        />
      ) : null}
      <RewardFlux />
      <CosmeticUnlockModal />
      <QuestCompleteToast />
      <RewardQueuedToast />
      <AchievementUnlockListener />
    </div>
    </CosmeticStylesProvider>
  );
}
