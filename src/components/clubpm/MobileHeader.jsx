import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

const MORE_TITLES = [
  ['/clubpm/notifications/preferences', 'Notification preferences', '/clubpm/notifications'],
  ['/clubpm/notifications', 'Notifications', '/clubpm'],
  ['/clubpm/profile', 'Profile', '/clubpm'],
  ['/clubpm/shop', 'Shop', '/clubpm'],
  ['/clubpm/challenges', 'Quests & achievements', '/clubpm'],
  ['/clubpm/admin', 'Admin', '/clubpm'],
  ['/clubpm/courses', 'Courses', '/clubpm'],
  ['/clubpm/activity', 'Activity', '/clubpm'],
];

/**
 * Title and deterministic Back parent for a compact screen (contracts.md §2, §5).
 * `back` is null on the four top-level screens (Home, a project, the Chat list,
 * Calendar); everywhere else the header shows Back.
 */
export function getCompactHeader(pathname, search = '', projectName = null) {
  if (pathname === '/clubpm' || pathname === '/clubpm/') return { title: 'Home', back: null };

  const gantt = pathname.match(/^\/clubpm\/projects\/([^/]+)\/gantt/);
  if (gantt) return { title: 'Timeline', back: `/clubpm/projects/${gantt[1]}` };
  if (pathname.startsWith('/clubpm/projects/')) {
    return { title: projectName || 'Project', back: null, projectSwitch: true };
  }

  if (pathname === '/clubpm/chat') return { title: 'Chat', back: null };
  if (pathname.startsWith('/clubpm/chat/')) {
    const thread = new URLSearchParams(search).get('thread');
    return thread
      ? { title: 'Thread', back: pathname }
      : { title: 'Conversation', back: '/clubpm/chat' };
  }
  if (pathname === '/clubpm/members') {
    const params = new URLSearchParams(search);
    const dm = params.get('dm');
    const thread = params.get('thread');
    if (dm && thread) {
      params.delete('thread');
      return { title: 'Thread', back: `${pathname}?${params}` };
    }
    return dm
      ? { title: 'Direct message', back: '/clubpm/members?view=dms' }
      : { title: 'People & DMs', back: '/clubpm/chat' };
  }
  if (pathname === '/clubpm/calendar') return { title: 'Calendar', back: null };

  if (pathname === '/clubpm/outreach') {
    const tab = new URLSearchParams(search).get('tab');
    return { title: tab === 'blog' ? 'Blog' : 'Outreach Hub', back: '/clubpm' };
  }
  if (/^\/clubpm\/outreach\/blog\/[^/]+\/edit/.test(pathname)) {
    return { title: 'Blog editor', back: '/clubpm/outreach?tab=blog' };
  }
  if (/^\/clubpm\/courses\/[^/]+\/edit/.test(pathname)) return { title: 'Course editor', back: '/clubpm/courses' };
  if (/^\/clubpm\/courses\/[^/]+\/learn/.test(pathname)) return { title: 'Course', back: '/clubpm/courses' };
  if (pathname.startsWith('/clubpm/profile/')) return { title: 'Profile', back: '/clubpm/members' };

  for (const [path, title, back] of MORE_TITLES) {
    if (pathname === path) return { title, back };
  }
  return { title: 'Constellation', back: '/clubpm' };
}

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

/**
 * Compact header: title (or Back + title), Search, and a bell that links to
 * the full Notification Center. Everything the desktop topbar also carries
 * (keyboard help, quests, streak) lives in More on phones.
 */
export default function MobileHeader({ projectName, unreadCount = 0, overlay, onOpenSearch, onOpenProjects }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { title, back, projectSwitch } = getCompactHeader(location.pathname, location.search, projectName);

  // Back returns to the exact previous screen when there is one inside the app;
  // a direct or external link has no in-app history, so replace with the
  // deterministic parent rather than leaving the site.
  const goBack = () => {
    if (location.key !== 'default') navigate(-1);
    else navigate(back, { replace: true });
  };

  const bellLabel = `Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`;
  const badge = unreadCount > 9 ? '9+' : String(unreadCount);

  return (
    <header className={`pm-m-header${back ? ' pm-m-header--detail' : ''}`}>
      {back && (
        <button type="button" className="pm-m-icon-btn" aria-label="Back" onClick={goBack}>
          <i className="fas fa-arrow-left" aria-hidden="true" />
        </button>
      )}
      {projectSwitch ? (
        <button
          type="button"
          className="pm-m-project-switch"
          aria-haspopup="dialog"
          aria-expanded={overlay === 'projects'}
          aria-label={`${title} — switch project`}
          data-m-opener="project-title"
          onClick={onOpenProjects}
        >
          <span className="pm-m-title">{title}</span>
          <i className="fas fa-chevron-down" aria-hidden="true" />
        </button>
      ) : (
        // Not an h1: every page already renders its own heading.
        <div className="pm-m-title">{title}</div>
      )}
      <button
        type="button"
        className="pm-m-icon-btn"
        aria-label="Search"
        aria-haspopup="dialog"
        aria-expanded={overlay === 'search'}
        data-m-opener="search"
        data-tour-id="topbar.search"
        onClick={onOpenSearch}
      >
        <i className="fas fa-magnifying-glass" aria-hidden="true" />
      </button>
      <Link
        to="/clubpm/notifications"
        className="pm-m-icon-btn"
        aria-label={bellLabel}
        aria-current={location.pathname === '/clubpm/notifications' ? 'page' : undefined}
        data-tour-id="topbar.notifications"
      >
        <BellIcon />
        {unreadCount > 0 && <b className="pm-m-badge" aria-hidden="true">{badge}</b>}
      </Link>
    </header>
  );
}

/**
 * The four project sections, rendered from ProjectNavContext — the same
 * descriptors and callback the desktop sidebar uses, so there is one project
 * navigation model. Sections are peers and switch with `replace` (desktop
 * parity), which ProjectDetail's onTabChange already does.
 */
export function MobileProjectSections({ projectNav }) {
  return (
    <nav className="pm-m-sections" aria-label={`${projectNav.projectName} sections`}>
      {projectNav.tabs.map(tab => (
        <button
          key={tab.id}
          type="button"
          className="pm-m-section-btn"
          aria-current={projectNav.activeTab === tab.id ? 'page' : undefined}
          onClick={() => projectNav.onTabChange(tab.id)}
          data-tour-id={tab.tourId}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
