import React from 'react';
import { Link } from 'react-router-dom';

/**
 * Which bottom-bar item is current for a pathname (contracts.md §2).
 * Exactly one item is current on every route; Projects and More are buttons
 * that open sheets, so they are "current" only in the route sense.
 */
export function currentBottomItem(pathname) {
  if (pathname === '/clubpm' || pathname === '/clubpm/') return 'home';
  if (pathname.startsWith('/clubpm/projects/')) return 'projects';
  if (pathname === '/clubpm/chat' || pathname.startsWith('/clubpm/chat/')) return 'chat';
  if (pathname === '/clubpm/members') return 'chat';
  if (pathname === '/clubpm/calendar') return 'calendar';
  return 'more';
}

/**
 * Global phone navigation: Home / Projects / Chat / Calendar / More, each with
 * an icon and a persistent label. Stays on every compact screen, including
 * inside projects, so the way out of a project is always visible.
 *
 * `overlay` is the open sheet id; its button reports aria-expanded separately
 * from the route's aria-current.
 */
export default function MobileBottomNav({ pathname, overlay, onOpenProjects, onOpenMore }) {
  const current = currentBottomItem(pathname);
  const cur = (id) => (current === id ? 'page' : undefined);

  return (
    <nav className="pm-m-nav" aria-label="Primary" data-tour-id="nav.bar">
      <Link to="/clubpm" className="pm-m-nav-item" aria-current={cur('home')} data-tour-id="nav.dashboard">
        <i className="fas fa-house" aria-hidden="true" />
        <span>Home</span>
      </Link>
      <button
        type="button"
        className="pm-m-nav-item"
        aria-current={cur('projects')}
        aria-haspopup="dialog"
        aria-expanded={overlay === 'projects'}
        data-m-opener="projects"
        data-tour-id="nav.projects"
        onClick={onOpenProjects}
      >
        <i className="fas fa-folder-open" aria-hidden="true" />
        <span>Projects</span>
      </button>
      <Link to="/clubpm/chat" className="pm-m-nav-item" aria-current={cur('chat')} data-tour-id="nav.chat">
        <i className="fas fa-comments" aria-hidden="true" />
        <span>Chat</span>
      </Link>
      <Link to="/clubpm/calendar" className="pm-m-nav-item" aria-current={cur('calendar')} data-tour-id="nav.calendar">
        <i className="fas fa-calendar-days" aria-hidden="true" />
        <span>Calendar</span>
      </Link>
      <button
        type="button"
        className="pm-m-nav-item"
        aria-current={cur('more')}
        aria-haspopup="dialog"
        aria-expanded={overlay === 'more'}
        data-m-opener="more"
        data-tour-id="nav.more"
        onClick={onOpenMore}
      >
        {/* Reward particles fly here on phones — the sidebar XP bar they
            target on desktop is not mounted in the compact shell. */}
        <i className="fas fa-bars" aria-hidden="true" data-reward-anchor="sidebar-xp" />
        <span data-reward-anchor="sidebar-doubloons">More</span>
      </button>
    </nav>
  );
}
