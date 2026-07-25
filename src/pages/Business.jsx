import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import SEOHead from '../components/SEOHead';
import SectionHeading from '../components/SectionHeading';
import { countUpOnView, canHover } from '../anim/motion';
import { marquee } from '../anim/scrollFx';

const PARTNER_LOGOS = [
  { key: 'bo', src: '/outreach/companies/blueorigin.webp', alt: 'Blue Origin' },
  { key: 'hs', src: '/outreach/companies/hiseas.webp', alt: 'Hi-SEAS' },
  { key: 'na', src: '/outreach/companies/nasa.webp', alt: 'NASA' },
  { key: 'pa', src: '/outreach/companies/PAC.webp', alt: 'Purdue Aerospace Council' },
  { key: 'ps', src: '/outreach/companies/psp.webp', alt: 'Purdue Space Program' },
  { key: 'se', src: '/outreach/companies/seti.webp', alt: 'SETI Institute' },
  { key: 'sx', src: '/outreach/companies/spacex.webp', alt: 'SpaceX' },
  { key: 'vg', src: '/outreach/companies/virgingalactic.svg', alt: 'Virgin Galactic' },
];

const Business = () => {
  const statsRef = useRef(null);
  const marqueeTrackRef = useRef(null);
  const functionsGridRef = useRef(null);

  useEffect(() => {
    if (window.AOS) window.AOS.init({ once: true });
  }, []);

  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = '/business/buisness.webp';
    document.head.appendChild(link);
    return () => { if (document.head.contains(link)) document.head.removeChild(link); };
  }, []);

  // Count-up on stats section (anime.js, scroll-triggered)
  useEffect(() => {
    const container = statsRef.current;
    if (!container) return;

    const targets = container.querySelectorAll('[data-count]');
    const cleanups = Array.from(targets).map(el =>
      countUpOnView(el, parseFloat(el.dataset.count))
    );
    return () => cleanups.forEach(fn => fn());
  }, []);

  // JS-driven partner logo marquee (pauses on hover/focus; no-ops under
  // reduced motion — see marquee() in src/anim/scrollFx.js)
  useEffect(() => {
    const cleanup = marquee(marqueeTrackRef.current);
    return cleanup;
  }, []);

  // Pointer-tracking glow on the "What We Do" function cards
  useEffect(() => {
    const grid = functionsGridRef.current;
    if (!grid || !canHover()) return;
    const handleMove = (e) => {
      const card = e.target.closest('.glow-track');
      if (!card || !grid.contains(card)) return;
      const { left, top } = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - left}px`);
      card.style.setProperty('--my', `${e.clientY - top}px`);
    };
    grid.addEventListener('pointermove', handleMove);
    return () => grid.removeEventListener('pointermove', handleMove);
  }, []);

  return (
    <div>
      <SEOHead
        title="Business & Operations"
        description="Purdue SEARCH's Business & Operations team manages trip logistics, industry partnerships, sponsorships, and funding to power every mission we run."
        canonical="/business"
      />
      <Navbar />

      {/* ===== 1 — HERO ===== */}
      <main
        id="main-content"
        className="jumbotron jumbotron-single d-flex align-items-center"
        style={{ backgroundImage: 'url(/business/buisness.webp), url(/analogs_bg.webp)' }}
      >
        <div className="container text-center">
          <h1 className="display-2 mb-4">Business &amp; Operations</h1>
          <p className="header-sub-title" style={{ fontWeight: 'bold', fontSize: '120%' }}>
            Behind every mission is a team that makes it possible — handling logistics,
            forging partnerships, and securing the resources SEARCH needs to reach further.
          </p>
        </div>
      </main>

      {/* ===== 2 — MISSION STATEMENT ===== */}
      <section id="biz-mission">
        <div className="container">
          <div data-aos="fade-up">
            <SectionHeading
              label="Our Role"
              title="How the Business Team"
              bold="Operates"
              subtitle="The Business & Operations team is the organizational backbone of SEARCH — translating ambitious ideas into funded, scheduled, and fully-supported programs."
            />
          </div>
          <div className="mg-media-row" data-aos="fade-up">
            <div className="mg-media-text">
              <span className="about-section-label">Behind the Mission</span>
              <h3 style={{ fontFamily: 'var(--font-heading)', marginBottom: '1rem' }}>
                Powering Every Program We Run
              </h3>
              <p style={{ color: 'var(--color-muted)', lineHeight: '1.8' }}>
                SEARCH programs don't run on enthusiasm alone. The Business &amp; Operations
                team coordinates the logistics that turn student ideas into real experiences —
                booking travel, negotiating access to analog sites, and managing budgets so
                every crew member can focus on the science.
              </p>
              <p style={{ color: 'var(--color-muted)', lineHeight: '1.8' }}>
                From Biosphere 2 to Kennedy Space Center, the Business team has organized
                multi-day research trips that give SEARCH members direct exposure to
                closed-loop habitats, launch infrastructure, and industry professionals.
                These trips generate data that feeds directly into our habitat design and
                life support research.
              </p>
              <p style={{ color: 'var(--color-muted)', lineHeight: '1.8' }}>
                Beyond logistics, the team actively develops relationships with aerospace
                companies, research institutes, and funding bodies — ensuring SEARCH has the
                sponsorships and partnerships needed to sustain and grow its programs year over year.
              </p>
            </div>
            <div className="mg-media-img" data-aos="fade-left">
              <img loading="lazy" src="/analogs/2022/habitat.webp" alt="SEARCH analog habitat environment" />
            </div>
          </div>
        </div>
      </section>

      {/* ===== 3 — WHAT WE DO (glow cards) ===== */}
      <section id="biz-functions" style={{ background: 'var(--color-bg-secondary)' }}>
        <div className="container">
          <div data-aos="fade-up">
            <SectionHeading
              label="Responsibilities"
              title="What We"
              bold="Do"
              subtitle="Three core functions that keep SEARCH moving — from the first planning meeting to wheels-up."
            />
          </div>
          <div className="biz-functions-grid" ref={functionsGridRef}>
            <div className="biz-function-card glow-track" data-aos="fade-up" data-aos-delay="0">
              <i className="fas fa-map-marked-alt biz-fn-icon" aria-hidden="true"></i>
              <h4 className="biz-fn-title">Trip &amp; Event Logistics</h4>
              <p className="biz-fn-desc">
                From transportation and accommodation to site access and crew manifests,
                the Business team owns every detail that gets SEARCH members where they need to be.
              </p>
            </div>
            <div className="biz-function-card glow-track" data-aos="fade-up" data-aos-delay="100">
              <i className="fas fa-handshake biz-fn-icon" aria-hidden="true"></i>
              <h4 className="biz-fn-title">Industry Partnerships</h4>
              <p className="biz-fn-desc">
                We build lasting relationships with aerospace companies and research institutions,
                opening doors to mentorship, co-branded events, and real-world project exposure
                for SEARCH members.
              </p>
            </div>
            <div className="biz-function-card glow-track" data-aos="fade-up" data-aos-delay="200">
              <i className="fas fa-dollar-sign biz-fn-icon" aria-hidden="true"></i>
              <h4 className="biz-fn-title">Sponsorships &amp; Funding</h4>
              <p className="biz-fn-desc">
                Identifying grant opportunities, managing sponsor relationships, and securing
                the funding that makes analog trips, hardware purchases, and program expansion
                financially possible.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== 4 — TEAM LEAD SPOTLIGHT ===== */}
      <section id="biz-lead">
        <div className="container">
          <div data-aos="fade-up">
            <SectionHeading
              label="Meet the Lead"
              title="Business &amp; Operations"
              bold="Leadership"
            />
          </div>
          <div className="biz-lead-card">
            <div className="biz-lead-photo-wrap" data-aos="fade-right">
              <img
                loading="lazy"
                src="/business/heer_mehta.webp"
                onError={e => { e.currentTarget.src = '/officers/generic.webp'; }}
                alt="Heer Mehta — Business & Operations Lead"
                className="biz-lead-photo"
              />
            </div>
            <div className="biz-lead-content" data-aos="fade-left">
              <span className="about-section-label">Team Lead</span>
              <h3 className="biz-lead-name">Heer Mehta</h3>
              <p className="biz-lead-title">Business &amp; Operations Lead</p>
              <p className="biz-lead-bio">
                Heer leads SEARCH's Business &amp; Operations team, overseeing trip logistics,
                partner relations, and the sponsorship pipeline that funds SEARCH's most
                ambitious programs. Her work ensures that every project — from analog site
                visits to crew training events — has the organizational and financial
                foundation it needs to succeed.
              </p>
              <Link to="/contact" className="btn-slide" style={{ marginTop: '1rem' }}>
                <span>Get In Touch</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ===== 5 — IMPACT STATS (count-up) ===== */}
      <section id="biz-stats" className="biz-stats-section">
        <div className="container">
          <div className="biz-stats-row" ref={statsRef}>
            <div className="biz-stat-item" data-aos="fade-up" data-aos-delay="0">
              <div className="biz-stat-number">
                <strong data-count="2">2</strong>
              </div>
              <span className="biz-stat-label">Analog Sites Visited</span>
            </div>
            <div className="biz-stat-item" data-aos="fade-up" data-aos-delay="100">
              <div className="biz-stat-number">
                <strong data-count="10">10</strong><span className="biz-stat-plus">+</span>
              </div>
              <span className="biz-stat-label">Industry Partners</span>
            </div>
            <div className="biz-stat-item" data-aos="fade-up" data-aos-delay="200">
              <div className="biz-stat-number">
                <strong data-count="3">3</strong>
              </div>
              <span className="biz-stat-label">Crews Deployed</span>
            </div>
            <div className="biz-stat-item" data-aos="fade-up" data-aos-delay="300">
              <div className="biz-stat-number">
                <strong data-count="5">5</strong><span className="biz-stat-plus">+</span>
              </div>
              <span className="biz-stat-label">Trips Organized</span>
            </div>
          </div>
        </div>
      </section>

      {/* ===== 6 — ANALOG PROGRAMS WE'VE ORGANIZED ===== */}
      <section id="biz-trips">
        <div className="container">
          <div data-aos="fade-up">
            <SectionHeading
              label="Trip Portfolio"
              title="Analog Programs"
              bold="We've Organized"
              subtitle="The Business team coordinates every aspect of SEARCH's field research experiences — from site selection and logistics to crew preparation and post-trip reporting."
            />
          </div>
          <div className="trips-grid" data-aos="fade-up">
            <div className="trip-card">
              <img loading="lazy" src="/analogs/BIosphere.webp" alt="Biosphere 2" />
              <div className="trip-card-body">
                <span className="about-section-label">Oracle, Arizona</span>
                <h4>Biosphere 2</h4>
                <p>
                  One of the world's largest closed ecological systems, Biosphere 2 provided
                  first-hand insight into nutrient cycling, plant growth management, and
                  atmospheric regulation at scale — directly informing our habitat and
                  microgreen chamber design. The Business team handled all travel coordination,
                  site access negotiations, and crew logistics for this trip.
                </p>
              </div>
            </div>
            <div className="trip-card">
              <img loading="lazy" src="/analogs/KSC.webp" alt="Kennedy Space Center" />
              <div className="trip-card-body">
                <span className="about-section-label">Merritt Island, Florida</span>
                <h4>Kennedy Space Center</h4>
                <p>
                  A visit to NASA's primary launch facility gave SEARCH members an up-close
                  look at launch infrastructure, mission planning operations, and the
                  vehicle assembly process — grounding our theoretical work in real
                  spaceflight hardware. Our Business team secured access and organized
                  every element of the visit from start to finish.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== 7 — INDUSTRY PARTNERS (scrolling marquee) ===== */}
      <section id="biz-partners" style={{ background: 'var(--color-bg-secondary)', paddingBottom: '3rem' }}>
        <div className="container">
          <div data-aos="fade-up">
            <SectionHeading
              label="Our Partners"
              title="Organizations We"
              bold="Work With"
              subtitle="SEARCH collaborates with leading aerospace companies, research institutions, and industry groups."
              center
            />
          </div>
        </div>
        <div className="biz-partners-strip">
          <div className="biz-marquee-track" ref={marqueeTrackRef}>
            {PARTNER_LOGOS.map(({ key, src, alt }) => (
              <div key={key} className="client-item"><img loading="lazy" src={src} alt={alt} /></div>
            ))}
            {/* Duplicate sequence required for the JS marquee's seamless
                loop (marquee() in src/anim/scrollFx.js tweens by half the
                track's scrollWidth). Hidden from assistive tech; the
                reduced-motion fallback hides it visually too (see
                .marquee-dup in search-theme.css). */}
            <div className="marquee-dup" aria-hidden="true">
              {PARTNER_LOGOS.map(({ key, src, alt }) => (
                <div key={`dup-${key}`} className="client-item"><img loading="lazy" src={src} alt={alt} /></div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== 8 — CTA / PARTNER WITH US ===== */}
      <section id="biz-cta" style={{ background: 'var(--color-bg-dark, #12121c)', padding: '4rem 0', textAlign: 'center' }}>
        <div className="container">
          <h2 className="section-title" style={{ color: '#fff', marginBottom: '1rem' }}>
            Partner With <b>SEARCH</b>
          </h2>
          <p style={{ color: 'rgba(245,239,230,0.7)', marginBottom: '2rem', maxWidth: '560px', margin: '0 auto 2rem' }}>
            Whether you're an aerospace company looking to engage top engineering students,
            or an organization interested in sponsoring our mission-driven programs,
            we'd love to connect.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/contact" className="btn-slide">
              <span>Get Involved</span>
            </Link>
            <Link to="/contact" className="btn-slide-outline">
              <span>Learn About Sponsorship</span>
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Business;
