import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import Breadcrumb from '../../components/Breadcrumb';

const AstroHydroponics = () => {
  useEffect(() => {
    if (window.AOS) window.AOS.init({ once: true });
  }, []);

  useEffect(() => {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      'itemListElement': [
        { '@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': 'https://purduesearch.github.io/' },
        { '@type': 'ListItem', 'position': 2, 'name': 'ASTRO-USA', 'item': 'https://purduesearch.github.io/astrousa' },
        { '@type': 'ListItem', 'position': 3, 'name': 'Hydroponics System' },
      ],
    });
    document.head.appendChild(script);
    return () => { if (document.head.contains(script)) document.head.removeChild(script); };
  }, []);

  return (
    <div>
      <title>ASTRO-USA Hydroponics System | Purdue SEARCH</title>
      <meta name="description" content="Purdue SEARCH develops an autonomous hydroponics system at Purdue's greenhouse for integration into the ASTRO-USA habitat." />
      <Navbar />
      <Breadcrumb />
      <div id="main-content" className="jumbotron-post jumbotron-single d-flex align-items-center" style={{ backgroundImage: 'url(/software/2023_24/SUITS/bg.webp)' }}>
        <div className="container text-center" style={{ top: 30 }}>
          <h1 className="display-2 mb-4">Habitat Systems: Hydroponics</h1>
        </div>
      </div>

      {/* ===== ABOUT ===== */}
      <section id="hydro-about">
        <div className="container">
          <div className="title-wrap mb-5" data-aos="fade-up">
            <h2 className="section-title">About the <b>Project</b></h2>
          </div>
          <div className="mg-media-row" data-aos="fade-up">
            <div className="mg-media-text">
              <span className="about-section-label">Automated Cultivation</span>
              <h3 style={{ fontFamily: 'var(--font-heading)', marginBottom: '1rem' }}>
                Growing Food for the Habitat
              </h3>
              <p style={{ color: 'var(--color-muted)', lineHeight: '1.8' }}>
                The hydroponics team is working under Dr. Marshall Porterfield of the Agricultural
                and Biological Engineering Department at Purdue to develop a system capable of growing
                and harvesting nutrient-rich plants. A central goal is to automate nearly all aspects
                of cultivation and harvest, producing a universal system able to support analog
                astronauts in the ASTRO-USA habitat.
              </p>
              <p style={{ color: 'var(--color-muted)', lineHeight: '1.8' }}>
                Sensors monitor pH, upper and lower water levels, dissolved oxygen, electrical
                conductivity, and water temperature. An Arduino Nano controls all attached sensors
                and integrated grow lights, enabling fully autonomous operation with minimal
                human intervention.
              </p>
            </div>
            <div className="mg-media-img" data-aos="fade-left">
              <img loading="lazy" src="/astrousa/hydroponicsElectronics.webp" alt="Hydroponics Electronics" />
            </div>
          </div>
        </div>
      </section>

      {/* ===== METRICS ===== */}
      <section id="hydro-metrics" style={{ background: 'var(--color-bg-dark)', padding: 'var(--section-pad) 0' }}>
        <div className="container">
          <div className="title-wrap mb-5 text-center" data-aos="fade-up">
            <h2 className="section-title" style={{ color: 'var(--color-text-light)' }}>
              System <b>Metrics</b>
            </h2>
            <p className="section-sub-title" style={{ color: 'rgba(245,239,230,0.6)' }}>
              Target performance benchmarks for the ASTRO-USA hydroponics system.
            </p>
          </div>
          <div className="row text-center" data-aos="fade-up">
            <div className="col-md-4 mb-4">
              <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '10px', padding: '2rem' }}>
                <div style={{ fontSize: '2.5rem', fontFamily: 'var(--font-heading)', color: 'var(--color-accent)', marginBottom: '0.5rem' }}>
                  &gt;90%
                </div>
                <div style={{ color: 'var(--color-text-light)', fontWeight: 600, marginBottom: '0.25rem' }}>Germination Rate</div>
                <div style={{ color: 'rgba(245,239,230,0.55)', fontSize: '0.85rem' }}>Target across all tested cultivars</div>
              </div>
            </div>
            <div className="col-md-4 mb-4">
              <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '10px', padding: '2rem' }}>
                <div style={{ fontSize: '2.5rem', fontFamily: 'var(--font-heading)', color: 'var(--color-accent)', marginBottom: '0.5rem' }}>
                  7–14
                </div>
                <div style={{ color: 'var(--color-text-light)', fontWeight: 600, marginBottom: '0.25rem' }}>Days to Harvest</div>
                <div style={{ color: 'rgba(245,239,230,0.55)', fontSize: '0.85rem' }}>For microgreen and fast-cycle crops</div>
              </div>
            </div>
            <div className="col-md-4 mb-4">
              <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '10px', padding: '2rem' }}>
                <div style={{ fontSize: '2.5rem', fontFamily: 'var(--font-heading)', color: 'var(--color-accent)', marginBottom: '0.5rem' }}>
                  6+
                </div>
                <div style={{ color: 'var(--color-text-light)', fontWeight: 600, marginBottom: '0.25rem' }}>Sensors per Tray</div>
                <div style={{ color: 'rgba(245,239,230,0.55)', fontSize: '0.85rem' }}>pH, DO, EC, temp, and water level</div>
              </div>
            </div>
          </div>
          <div className="text-center mt-3" data-aos="fade-up">
            <img loading="lazy" src="/astrousa/babyPlants.webp" alt="Hydroponics seedlings" style={{ borderRadius: '10px', maxWidth: '480px', width: '100%' }} />
          </div>
        </div>
      </section>

      {/* ===== LEAF INITIATIVE ===== */}
      <section id="hydro-leaf">
        <div className="container">
          <div className="title-wrap mb-5" data-aos="fade-up">
            <h2 className="section-title">Connection to <b>NASA LEAF</b></h2>
            <p className="section-sub-title">
              Our work aligns with NASA's broader initiative to develop reliable food production
              systems for long-duration spaceflight.
            </p>
          </div>
          <div className="mg-media-row reverse" data-aos="fade-up">
            <div className="mg-media-text">
              <span className="about-section-label">Long-Duration Missions</span>
              <h3 style={{ fontFamily: 'var(--font-heading)', marginBottom: '1rem' }}>
                Food Production Beyond Low Earth Orbit
              </h3>
              <p style={{ color: 'var(--color-muted)', lineHeight: '1.8' }}>
                NASA's LEAF (Long-duration EVA And Food) initiative investigates plant growth in
                microgravity and closed-loop habitat environments. SEARCH's hydroponics system
                is designed with LEAF-compatible principles — compact trays, automated nutrient
                delivery, and minimal crew intervention — so findings from our ground-based
                prototype can inform flight hardware development.
              </p>
              <p style={{ color: 'var(--color-muted)', lineHeight: '1.8' }}>
                The ASTRO-USA habitat serves as a terrestrial testbed: by validating our system
                under analog mission conditions at Purdue's greenhouse, we build a dataset that
                is directly relevant to future ISS experiments and deep-space mission planning.
              </p>
            </div>
            <div className="mg-media-img" data-aos="fade-right">
              <img loading="lazy" src="/astrousa/Hydroponics_Work_ASTRO.webp" alt="ASTRO-USA hydroponics work" />
            </div>
          </div>
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section style={{ background: 'var(--color-bg-secondary)', padding: '3rem 0', textAlign: 'center' }}>
        <div className="container">
          <h2 className="section-title" style={{ marginBottom: '1rem' }}>
            Want to be part of <b>SEARCH</b>?
          </h2>
          <p style={{ color: 'var(--color-muted)', marginBottom: '1.5rem' }}>
            SEARCH is open to all Purdue students. Join a team working on real space research and competitions.
          </p>
          <Link to="/contact" className="btn-slide">
            <span>Get Involved</span>
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default AstroHydroponics;
