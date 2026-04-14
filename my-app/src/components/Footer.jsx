import React from 'react';
import { Link } from 'react-router-dom';

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

        {/* Programs links */}
        <div className="col-lg-2 col-md-6 mb-4 footer-nav-col">
          <h6>Programs</h6>
          <ul>
            <li><Link to="/research">Research</Link></li>
            <li><Link to="/analogs">Analog Programs</Link></li>
            <li><Link to="/sa2tp">SA²TP</Link></li>
            <li><Link to="/astrousa">ASTRO-USA</Link></li>
          </ul>
        </div>

        {/* Team links */}
        <div className="col-lg-2 col-md-6 mb-4 footer-nav-col">
          <h6>Team</h6>
          <ul>
            <li><Link to="/software">Software</Link></li>
            <li><Link to="/outreach">Outreach</Link></li>
            <li><Link to="/about">About Us</Link></li>
            <li><Link to="/contact">Contact</Link></li>
          </ul>
        </div>

        {/* Connect links */}
        <div className="col-lg-2 col-md-6 mb-4 footer-nav-col">
          <h6>Connect</h6>
          <ul>
            <li>
              <Link to="/contact">Contact Us</Link>
            </li>
            <li>
              <a href="https://www.instagram.com/purdue_search/" target="_blank" rel="noopener noreferrer">
                Instagram
              </a>
            </li>
            <li>
              <a href="https://twitter.com/purduesearch" target="_blank" rel="noopener noreferrer">
                Twitter / X
              </a>
            </li>
            <li>
              <a href="https://giving.purdue.edu/west-lafayette/?q=search" target="_blank" rel="noopener noreferrer">
                Donate Now
              </a>
            </li>
            <li>
              <a href="https://boilerlink.purdue.edu/organization/search" target="_blank" rel="noopener noreferrer">
                BoilerLink
              </a>
            </li>
            <li>
              <a href="https://www.linkedin.com/company/purdue-search/" target="_blank" rel="noopener noreferrer">
                LinkedIn
              </a>
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
        <a
          href="https://linktr.ee/purduesearch#281987267"
          className="btn-slide-outline footer-slack-btn"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span>Join Slack</span>
        </a>
      </div>

      {/* Donate CTA row */}
      <div className="footer-donate-cta">
        <p>Support the next generation of analog astronauts</p>
        <a
          href="https://giving.purdue.edu/west-lafayette/?q=search"
          className="btn-slide-fill footer-donate-btn"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span>Donate Now</span>
        </a>
      </div>
    </div>

    {/* Bottom bar: copyright + social icon circles */}
    <div className="container">
      <div className="footer-bottom-bar">
        <p>&copy; {new Date().getFullYear()} SEARCH of Purdue University. All rights reserved.</p>
        <div className="social-circles">
          <a className="social-circle" href="https://twitter.com/purduesearch" target="_blank" rel="noopener noreferrer" aria-label="Twitter">
            <i className="fab fa-twitter" />
          </a>
          <a className="social-circle" href="https://instagram.com/purdue_search" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
            <i className="fab fa-instagram" />
          </a>
          <a className="social-circle" href="https://www.linkedin.com/company/purdue-search/" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">
            <i className="fab fa-linkedin-in" />
          </a>
          <a className="social-circle" href="https://www.youtube.com/@PurdueSEARCH" target="_blank" rel="noopener noreferrer" aria-label="YouTube">
            <i className="fab fa-youtube" />
          </a>
        </div>
      </div>
    </div>
  </footer>
);

export default Footer;
