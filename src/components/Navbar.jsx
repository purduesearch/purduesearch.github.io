import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import SearchBar from './SearchBar';

const NAV_LINKS = [
  { label: 'Home',     to: '/' },
  { label: 'About',    to: '/about' },
  { label: 'Business', to: '/business' },
];

const TEAMS_PATHS = ['/research', '/sa2tp', '/software', '/astrousa'];

const Navbar = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [teamsOpen, setTeamsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();

  const isTeamsActive = TEAMS_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'));

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 120);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Sync menuOpen with Bootstrap collapse events
  useEffect(() => {
    if (!window.$) return;
    const $el = window.$('#navbar-nav-header');
    $el.on('show.bs.collapse', () => setMenuOpen(true));
    $el.on('hide.bs.collapse', () => setMenuOpen(false));
    return () => { $el.off('show.bs.collapse hide.bs.collapse'); };
  }, []);

  useEffect(() => {
    if (window.$ && window.$.fn.collapse) {
      window.$('#navbar-nav-header').collapse('hide');
    }
    setTeamsOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (!e.target.closest('#teams-dropdown')) setTeamsOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const handleTeamsLinkClick = () => setTeamsOpen(false);

  return (
    <nav id="header-navbar" className={`navbar navbar-expand-lg${(isScrolled || menuOpen) ? '' : ' nav-transparent'}`}>
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
          data-toggle="collapse"
          data-target="#navbar-nav-header"
          aria-controls="navbar-nav-header"
          aria-expanded={menuOpen}
          aria-label="Toggle navigation"
        >
          {menuOpen
            ? <i className="fas fa-times" style={{ fontSize: '1.25rem' }} />
            : <span className="lnr lnr-menu" />
          }
        </button>

        <div className="collapse navbar-collapse" id="navbar-nav-header">

          {/* ── Left: logo + primary nav ── */}
          <div className="nav-section-left d-flex align-items-center">
            <img
              src="/icons/purdue_search_logo.png"
              style={{ width: '3rem', marginRight: '0.5rem' }}
              alt="SEARCH Logo"
            />
            <ul className="navbar-nav">
              {NAV_LINKS.map(({ label, to }) => {
                const isActive = to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(to + '/');
                return (
                  <li key={to} className="nav-item" style={{ position: 'relative' }}>
                    <Link className="nav-link" to={to}>{label}</Link>
                    {isActive && (
                      <motion.span layoutId="nav-underline" className="nav-active-indicator" />
                    )}
                  </li>
                );
              })}

              {/* Teams dropdown */}
              <li className="nav-item" id="teams-dropdown" style={{ position: 'relative' }}>
                <button
                  className={`nav-link teams-dropdown-toggle${teamsOpen ? ' open' : ''}`}
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
                  </div>
                )}
              </li>
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
              <li className="nav-item" style={{ position: 'relative' }}>
                <Link className="nav-link" to="/outreach">Outreach</Link>
                {pathname === '/outreach' && (
                  <motion.span layoutId="nav-underline" className="nav-active-indicator" />
                )}
              </li>
              <li className="nav-item ml-2">
                <Link to="/contact" className="navbar-cta-btn">Contact Us</Link>
              </li>
              <li className="nav-item ml-2">
                <a
                  href="https://giving.purdue.edu/west-lafayette/?q=search"
                  className="navbar-donate-btn"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Donate
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
