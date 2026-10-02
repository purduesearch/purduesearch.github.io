import React from 'react';
import { Link } from 'react-router-dom';
import { SLACK_JOIN_URL, DONATE_URL } from '../lib/siteLinks';
import { TEAMS } from '../lib/teams';
import ExternalLink from './ExternalLink';

const Footer = () => (
  <footer id="search-footer">
    <div className="container">
      <div className="row">

        {/* Brand + description */}
        <div className="col-lg-4 col-md-6 mb-4 footer-brand-col">
          <div className="d-flex align-items-center mb-3">
            <img
              src="/icons/purdue_search_logo.png"
              style={{ width: '2rem', marginRight: '0.75rem', filter: 'brightness(0) invert(1)' }}
              alt="SEARCH Logo"
            />
            <h3 className="mb-0">SEARCH</h3>
          </div>
          <p>
            Space and Earth Analogs Research Chapter of Purdue University.
            Advancing human spaceflight through interdisciplinary research and training.
          </p>
        </div>

        {/* Team links — first four are programs, the rest support teams */}
        <div className="col-lg-2 col-md-6 mb-4 footer-nav-col">
          <h4>Programs</h4>
          <ul>
            {TEAMS.slice(0, 4).map(({ to, name }) => (
              <li key={to}><Link to={to}>{name}</Link></li>
            ))}
          </ul>
        </div>

        <div className="col-lg-2 col-md-6 mb-4 footer-nav-col">
          <h4>Team</h4>
          <ul>
            {TEAMS.slice(4).map(({ to, name }) => (
              <li key={to}><Link to={to}>{name}</Link></li>
            ))}
            <li><Link to="/about">About Us</Link></li>
          </ul>
        </div>

        {/* Connect links */}
        <div className="col-lg-2 col-md-6 mb-4 footer-nav-col">
          <h4>Connect</h4>
          <ul>
            <li>
              <Link to="/contact">Contact Us</Link>
            </li>
            <li>
              <ExternalLink href="https://www.instagram.com/purdue_search/">
                Instagram
              </ExternalLink>
            </li>
            <li>
              <ExternalLink href="https://twitter.com/purduesearch">
                X (Twitter)
              </ExternalLink>
            </li>
            <li>
              <ExternalLink href={DONATE_URL}>
                Donate Now
              </ExternalLink>
            </li>
            <li>
              <ExternalLink href="https://boilerlink.purdue.edu/organization/search">
                BoilerLink
              </ExternalLink>
            </li>
            <li>
              <ExternalLink href="https://www.linkedin.com/company/purdue-search/">
                LinkedIn
              </ExternalLink>
            </li>
            <li>
              <ExternalLink href="https://www.facebook.com/share/14YKGkqYqNh/">
                Facebook
              </ExternalLink>
            </li>
          </ul>
        </div>

      </div>

      {/* Slack CTA */}
      <div className="footer-slack-cta">
        <div className="footer-slack-icon">
          <i className="fab fa-slack" aria-hidden="true" />
        </div>
        <div className="footer-discord-text">
          <p className="footer-discord-heading">Join the conversation</p>
          <p className="footer-discord-sub">Connect with SEARCH members on Slack</p>
        </div>
        <ExternalLink href={SLACK_JOIN_URL} className="btn-slide-outline footer-slack-btn">
          <span>Join Slack</span>
        </ExternalLink>
      </div>

      {/* Donate CTA row */}
      <div className="footer-donate-cta">
        <p>Support the next generation of analog astronauts</p>
        <ExternalLink href={DONATE_URL} className="btn-slide-fill footer-donate-btn">
          <span>Donate Now</span>
        </ExternalLink>
      </div>
    </div>

    {/* Bottom bar: copyright + social icon circles */}
    <div className="container">
      <div className="footer-bottom-bar">
        <p>&copy; {new Date().getFullYear()} SEARCH of Purdue University. All rights reserved.</p>
        {/* Plain <a>, not <Link>: these are standalone static files in public/legal/,
            not SPA routes. A <Link> would client-side navigate and hit the "*"
            NotFound route instead of fetching the real page — and these URLs are
            what Google's OAuth consent screen points at, so they must load. */}
        <ul className="footer-legal-links">
          {/* SPA route, but kept as a plain <a> alongside its siblings: it is the
              URL on Google's OAuth consent screen, so a full page load is what
              guarantees the application home page content actually renders. */}
          <li><a href="/clubpm/login">About Constellation</a></li>
          <li><a href="/legal/privacy.html">Privacy Policy</a></li>
          <li><a href="/legal/terms.html">Terms of Service</a></li>
        </ul>
        <div className="social-circles">
          <ExternalLink className="social-circle" href="https://twitter.com/purduesearch" aria-label="X (Twitter)">
            <i className="fab fa-x-twitter" aria-hidden="true" />
          </ExternalLink>
          <ExternalLink className="social-circle" href="https://instagram.com/purdue_search" aria-label="Instagram">
            <i className="fab fa-instagram" aria-hidden="true" />
          </ExternalLink>
          <ExternalLink className="social-circle" href="https://www.linkedin.com/company/purdue-search/" aria-label="LinkedIn">
            <i className="fab fa-linkedin-in" aria-hidden="true" />
          </ExternalLink>
          <ExternalLink className="social-circle" href="https://www.youtube.com/@PurdueSEARCH" aria-label="YouTube">
            <i className="fab fa-youtube" aria-hidden="true" />
          </ExternalLink>
          <ExternalLink className="social-circle" href="https://www.facebook.com/share/14YKGkqYqNh/" aria-label="Facebook">
            <i className="fab fa-facebook-f" aria-hidden="true" />
          </ExternalLink>
        </div>
      </div>
    </div>
  </footer>
);

export default Footer;
