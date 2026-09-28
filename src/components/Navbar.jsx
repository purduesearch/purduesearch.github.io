import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import SearchBar from './SearchBar';
import { SLACK_JOIN_URL } from '../lib/siteLinks';
import { useClubPmAuth } from '../clubpm/ClubPmAuth';

// Primary nav reads About · Teams ▾ · Blog; Home is the centre wordmark.
const NAV_BEFORE_TEAMS = [{ label: 'About', to: '/about' }];
const NAV_AFTER_TEAMS  = [{ label: 'Blog',  to: '/blog' }];

const TEAMS_PATHS = ['/research', '/sa2tp', '/software', '/astrousa', '/ares', '/business', '/outreach'];

// `solid` keeps the opaque bar at scrollY 0 — for pages with no dark hero
// behind the navbar, where the transparent state's white links vanish.
const Navbar = ({ solid = false }) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [teamsOpen, setTeamsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { member, logout } = useClubPmAuth();

  const isTeamsActive = TEAMS_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'));

  const renderNavLink = ({ label, to }) => (
    <li key={to} className="nav-item" style={{ position: 'relative' }}>
      <Link className="nav-link nav-underline-target" to={to} onClick={closeMenu}>{label}</Link>
      {(pathname === to || pathname.startsWith(to + '/')) && (
        <motion.span layoutId="nav-underline" className="nav-active-indicator" />
      )}
    </li>
  );

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 120);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setTeamsOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  // Escape closes the mobile menu
  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  // Crossing Bootstrap's lg breakpoint while open drops back to the desktop bar,
  // where the collapse is always visible — reset the state so it stays in sync.
  useEffect(() => {
    if (!menuOpen) return;
    const mq = window.matchMedia('(min-width: 992px)');
    const onChange = (e) => { if (e.matches) setMenuOpen(false); };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [menuOpen]);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (!e.target.closest('#teams-dropdown')) setTeamsOpen(false);
      if (!e.target.closest('#profile-dropdown')) setProfileOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const closeMenu = () => setMenuOpen(false);
  const handleTeamsLinkClick = () => { setTeamsOpen(false); setMenuOpen(false); };
  const handleProfileLinkClick = () => { setProfileOpen(false); setMenuOpen(false); };
  const handleLogout = () => {
    logout();
    setProfileOpen(false);
    setMenuOpen(false);
  };

  return (
    <nav id="header-navbar" className={`navbar navbar-expand-lg${(solid || isScrolled || menuOpen) ? '' : ' nav-transparent'}`}>
      <div className="container">

        {/* ── Mobile: brand + toggler come FIRST so they stay in the top row
            when the collapse expands (flex-basis:100% pushes collapse to row 2) ── */}
        <Link className="navbar-brand d-lg-none d-flex align-items-center" to="/">
          <img
            src="/icons/purdue_search_logo.png"
            style={{ width: '1.75rem', marginRight: '0.5rem' }}
            alt="SEARCH Logo"
          />
          <span style={{ fontFamily: 'Oswald, sans-serif', fontWeight: 600, letterSpacing: '0.06em' }}>
            SEARCH
          </span>
        </Link>

        <button
          className="navbar-toggler ml-auto"
          type="button"
          onClick={() => setMenuOpen(o => !o)}
          aria-controls="navbar-nav-header"
          aria-expanded={menuOpen}
          aria-label="Toggle navigation"
        >
          {menuOpen
            ? <i className="fas fa-times" style={{ fontSize: '1.25rem' }} />
            : <i className="fas fa-bars" aria-hidden="true" />
          }
        </button>

        <div className={`collapse navbar-collapse${menuOpen ? ' show' : ''}`} id="navbar-nav-header">

          {/* ── Left: logo + primary nav ── */}
          <div className="nav-section-left d-flex align-items-center">
            <Link to="/" onClick={closeMenu} className="d-flex align-items-center">
              <img
                src="/icons/purdue_search_logo.png"
                style={{ width: '3rem', marginRight: '0.5rem' }}
                alt="SEARCH home"
              />
            </Link>
            <ul className="navbar-nav">
              {NAV_BEFORE_TEAMS.map(renderNavLink)}

              {/* Teams dropdown */}
              <li className="nav-item" id="teams-dropdown" style={{ position: 'relative' }}>
                <button
                  className={`nav-link nav-underline-target teams-dropdown-toggle${teamsOpen ? ' open' : ''}`}
                  onClick={() => setTeamsOpen(v => !v)}
                  aria-haspopup="true"
                  aria-expanded={teamsOpen}
                >
                  Teams <span className="teams-caret" aria-hidden="true">▾</span>
                </button>
                {isTeamsActive && (
                  <motion.span layoutId="nav-underline" className="nav-active-indicator" />
                )}
                {teamsOpen && (
                  <div className="teams-dropdown-menu" role="menu">
                    <Link className="teams-dropdown-item" to="/research"  onClick={handleTeamsLinkClick}>Microgreen Microwaves</Link>
                    <Link className="teams-dropdown-item" to="/sa2tp"     onClick={handleTeamsLinkClick}>Astronaut Training</Link>
                    <Link className="teams-dropdown-item" to="/software"  onClick={handleTeamsLinkClick}>SUITS</Link>
                    <Link className="teams-dropdown-item" to="/astrousa"  onClick={handleTeamsLinkClick}>ASTRO-USA</Link>
                    <Link className="teams-dropdown-item" to="/ares"      onClick={handleTeamsLinkClick}>ARES</Link>
                    <Link className="teams-dropdown-item" to="/business"  onClick={handleTeamsLinkClick}>Business &amp; Operations</Link>
                    <Link className="teams-dropdown-item" to="/outreach"  onClick={handleTeamsLinkClick}>Outreach</Link>
                  </div>
                )}
              </li>
              {NAV_AFTER_TEAMS.map(renderNavLink)}
            </ul>
          </div>

          {/* ── Centre: SEARCH wordmark ── */}
          <Link className="navbar-brand d-flex align-items-center" to="/">
            <span
              className="navbar-brand-text"
              style={{ fontFamily: 'Oswald, sans-serif', fontSize: '1.5rem', letterSpacing: '0.08em', fontWeight: 600 }}
            >
              SEARCH
            </span>
          </Link>

          {/* ── Right: utility links + CTAs ── */}
          <div className="nav-section-right d-flex align-items-center">
            <ul className="navbar-nav align-items-center">
              <li className="nav-item mr-1">
                <SearchBar />
              </li>
              {member ? (
                <li className="nav-item" id="profile-dropdown" style={{ position: 'relative', display: 'flex', alignItems: 'center', marginLeft: '1rem' }}>
                  <button
                    className="nav-link teams-dropdown-toggle d-flex align-items-center"
                    onClick={() => setProfileOpen(v => !v)}
                    style={{ background: 'transparent', border: 'none', padding: 0 }}
                  >
                    {member.avatarUrl ? (
                      <img src={member.avatarUrl} alt={member.displayName} style={{ width: '2rem', height: '2rem', borderRadius: '50%', border: '2px solid var(--clubpm-accent-primary)' }} />
                    ) : (
                      <div style={{ width: '2rem', height: '2rem', borderRadius: '50%', backgroundColor: 'var(--clubpm-accent-primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                        {member.displayName?.charAt(0)}
                      </div>
                    )}
                  </button>
                  {profileOpen && (
                    <div className="teams-dropdown-menu" style={{ right: 0, left: 'auto', minWidth: '200px' }}>
                      <div className="px-3 py-2 border-bottom border-secondary mb-2">
                        <strong>{member.displayName}</strong>
                        <div className="text-muted small">{member.slackHandle}</div>
                      </div>
                      <Link className="teams-dropdown-item" to="/clubpm" onClick={handleProfileLinkClick}>Dashboard</Link>
                      <button className="teams-dropdown-item text-danger" onClick={handleLogout} style={{ border: 'none', background: 'transparent', width: '100%', textAlign: 'left' }}>Logout</button>
                    </div>
                  )}
                </li>
              ) : (
                <li className="nav-item" style={{ position: 'relative' }}>
                  <Link className="nav-link nav-underline-target" to="/clubpm" onClick={closeMenu}>Constellation</Link>
                  {pathname.startsWith('/clubpm') && (
                    <motion.span layoutId="nav-underline" className="nav-active-indicator" />
                  )}
                </li>
              )}
              {renderNavLink({ label: 'Contact', to: '/contact' })}
              <li className="nav-item ml-2">
                <a
                  href={SLACK_JOIN_URL}
                  className="navbar-cta-btn"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={closeMenu}
                >
                  Join our Slack<span className="sr-only"> (opens in a new tab)</span>
                </a>
              </li>
            </ul>
          </div>

        </div>

      </div>
    </nav>
  );
};

export default Navbar;
