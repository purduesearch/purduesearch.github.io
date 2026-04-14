import React, { lazy, Suspense, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Player } from '@lottiefiles/react-lottie-player';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const AstroFlowDiagram = lazy(() => import('../components/AstroFlowDiagram'));

const AstroUSA = () => {
  const fidelityRef = useRef(null);
  const hudRef      = useRef(null);
  const powerRef    = useRef(null);
  const loopRef     = useRef(null);
  const growthRef   = useRef(null);
  const impactRef   = useRef(null);
  const timelineRef = useRef(null);

  // AOS init
  useEffect(() => {
    if (window.AOS) window.AOS.init({ once: true });
  }, []);

  // Hero image preload
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = '/astrousa/Group_Photo_ASTRO.webp';
    document.head.appendChild(link);
    return () => { if (document.head.contains(link)) document.head.removeChild(link); };
  }, []);

  // Fidelity split-panel slide-in
  useEffect(() => {
    const el = fidelityRef.current;
    if (!el) return;
    const panels = el.querySelectorAll('.fidelity-panel-before, .fidelity-panel-after, .fidelity-divider');
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        panels.forEach(p => p.classList.add('fidelity-in'));
        obs.disconnect();
      }
    }, { threshold: 0.25 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // HUD line stagger
  useEffect(() => {
    const el = hudRef.current;
    if (!el) return;
    const lines = el.querySelectorAll('.astro-hud-line');
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        lines.forEach((line, i) => setTimeout(() => line.classList.add('hud-visible'), i * 100));
        obs.disconnect();
      }
    }, { threshold: 0.3 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Power chain circuit fill
  useEffect(() => {
    const el = powerRef.current;
    if (!el) return;
    const circles = el.querySelectorAll('.power-node-circle');
    const labels  = el.querySelectorAll('.power-node-label');
    const links   = el.querySelectorAll('.power-link');
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        circles.forEach((c, i) => setTimeout(() => c.classList.add('lit'), i * 300));
        labels.forEach((l, i)  => setTimeout(() => l.classList.add('lit'), i * 300));
        links.forEach((lk, i)  => setTimeout(() => lk.classList.add('lit'), i * 300 + 150));
        obs.disconnect();
      }
    }, { threshold: 0.3 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Closed-loop ring node sequence
  useEffect(() => {
    const el = loopRef.current;
    if (!el) return;
    const nodes = el.querySelectorAll('.loop-node');
    const arcs  = el.querySelectorAll('.loop-arc');
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        nodes.forEach((n, i) => setTimeout(() => n.classList.add('loop-active'), i * 400));
        arcs.forEach((a, i)  => setTimeout(() => a.classList.add('loop-active'), i * 400 + 200));
        obs.disconnect();
      }
    }, { threshold: 0.2 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Growth-reveal clip-path
  useEffect(() => {
    const el = growthRef.current;
    if (!el) return;
    const imgs = el.querySelectorAll('.growth-img');
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        imgs.forEach(img => img.classList.add('growth-revealed'));
        obs.disconnect();
      }
    }, { threshold: 0.2 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Impact card glow
  useEffect(() => {
    const el = impactRef.current;
    if (!el) return;
    const cards = el.querySelectorAll('.impact-card');
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        cards.forEach((c, i) => setTimeout(() => c.classList.add('impact-glow'), i * 150));
        obs.disconnect();
      }
    }, { threshold: 0.2 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Timeline track + node stagger
  useEffect(() => {
    const el = timelineRef.current;
    if (!el) return;
    const track = el.querySelector('.timeline-track');
    const nodes = el.querySelectorAll('.timeline-node');
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        if (track) track.classList.add('animated');
        nodes.forEach((n, i) => setTimeout(() => n.classList.add('tl-visible'), i * 300));
        obs.disconnect();
      }
    }, { threshold: 0.15 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Loop ring geometry — 6 nodes, radius 170px, center (240,240), node box 88×88
  const nodePositions = [
    { top: 26,  left: 196 }, // top
    { top: 111, left: 343 }, // upper-right
    { top: 281, left: 343 }, // lower-right
    { top: 366, left: 196 }, // bottom
    { top: 281, left: 49  }, // lower-left
    { top: 111, left: 49  }, // upper-left
  ];
  const nodeCenters = nodePositions.map(p => ({ cx: p.left + 44, cy: p.top + 44 }));
  const arcPairs = [[0,1],[1,2],[2,3],[3,4],[4,5],[5,0]];

  const loopNodes = [
    { icon: 'fa-users',    label: 'Crew' },
    { icon: 'fa-recycle',  label: 'Waste' },
    { icon: 'fa-flask',    label: 'Bioreactors' },
    { icon: 'fa-tint',     label: 'RO / Water' },
    { icon: 'fa-seedling', label: 'Hydroponics' },
    { icon: 'fa-bolt',     label: 'Energy' },
  ];

  return (
    <div>
      <title>ASTRO-USA Habitat Project | Purdue SEARCH</title>
      <meta name="description" content="ASTRO-USA is Purdue SEARCH's flagship project — designing and building a fully closed-loop, self-sustaining space habitat analog on Purdue's campus." />
      <Navbar />

      {/* ===== HERO ===== */}
      <div
        id="main-content"
        className="jumbotron jumbotron-single d-flex align-items-center"
        style={{ backgroundImage: 'url(/astrousa/Group_Photo_ASTRO.webp)' }}
      >
        <div className="container text-center">
          <h1 className="display-2 mb-4">ASTRO-USA</h1>
          <p className="header-sub-title" style={{ fontWeight: 'bold', fontSize: '120%' }}>
            Analog Simulation Training &amp; Research Outpost Utilizing Self-Sustaining Architecture —
            a fully closed-loop habitat analog being built on Purdue's campus.
          </p>
        </div>
      </div>

      {/* ===== SECTION 0: MISSION INTRO ===== */}
      <section id="astro-mission">
        <div className="container">
          <div className="title-wrap mb-4" data-aos="fade-up">
            <h2 className="section-title">The <b>Mission</b></h2>
            <p className="section-sub-title">
              ASTRO-USA is a student-led project developed in collaboration with NASA Kennedy Space Center
              and the University of Arizona to design, build, and operate a fully closed-loop space habitat
              analog — the first of its kind at any university.
            </p>
          </div>
          <div data-aos="fade-up">
            <p style={{ color: 'var(--color-muted)', lineHeight: '1.8', maxWidth: '760px', margin: '0 auto 2rem', textAlign: 'center' }}>
              Existing analog facilities address only portions of the fidelity needed to simulate long-duration
              spaceflight. ASTRO-USA is designed to achieve high-fidelity across all three pillars simultaneously:
              Habitat Design, Human Factors, and Enabling Systems. Crews of six conduct 14-day simulated missions
              targeting Technology Readiness Level 6. The phased build progresses from a Food Production
              Mini-Hab in Year 1 to a full primary habitat in Years 4–5.
            </p>
          </div>
          <div className="astro-stat-row" data-aos="fade-up">
            {[
              { value: '3',        label: 'Crew Members' },
              { value: '14-Day',   label: 'Missions' },
              { value: 'TRL 6',    label: 'Target' },
              { value: 'NASA KSC', label: 'Partner' },
            ].map((s, i) => (
              <div className="astro-stat-tile" key={i}>
                <div className="stat-value">{s.value}</div>
                <div className="stat-label">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== SECTION 0b: FIDELITY COMPARISON ===== */}
      <section id="astro-fidelity" style={{ background: 'var(--color-bg-sand)' }}>
        <div className="container">
          <div className="title-wrap mb-5" data-aos="fade-up">
            <h2 className="section-title">The <b>Fidelity Gap</b></h2>
            <p className="section-sub-title">
              No existing analog habitat achieves high-fidelity across all three dimensions simultaneously.
              CHAPEA lacks modularity. HI-SEAS lacks food production. HERA lacks closed-loop waste.
              Biosphere 2 broke its closed loop. ASTRO-USA is built to close all three gaps at once.
            </p>
          </div>
          {/* Prior analog comparison */}
          <div className="astro-analog-table" data-aos="fade-up">
            <table>
              <thead>
                <tr>
                  <th>Analog</th>
                  <th>Hab. Design</th>
                  <th>Human Factors</th>
                  <th>Enabling Systems</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { name: 'CHAPEA',      hd: 'Low — non-modular 3D-printed rect.', hf: 'Medium', es: 'Low — no closed-loop food/waste' },
                  { name: 'HERA',        hd: 'Medium — modular but fixed',          hf: 'Medium', es: 'Low — no integrated food/waste loop' },
                  { name: 'HI-SEAS',     hd: 'Medium',                              hf: 'Medium', es: 'Low — no food production system' },
                  { name: 'ILMAH',       hd: 'Medium — inflatable',                 hf: 'Low',    es: 'Low — partial pressurization only' },
                  { name: 'Biosphere 2', hd: 'Medium',                              hf: 'Medium', es: 'Medium — broke closed loop (O₂ injection)' },
                  { name: 'SAM',         hd: 'Medium',                              hf: 'High',   es: 'Medium — no strict power/air limits' },
                  { name: 'ASTRO-USA',   hd: 'High — modular cylindrical/ISS-like', hf: 'High — full env. control, windowless', es: 'High — full closed loop, TRL 6 target', highlight: true },
                ].map((row, i) => (
                  <tr key={i} className={row.highlight ? 'analog-table-highlight' : ''}>
                    <td><strong>{row.name}</strong></td>
                    <td>{row.hd}</td>
                    <td>{row.hf}</td>
                    <td>{row.es}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ fontSize: '0.72rem', color: 'var(--color-muted)', marginTop: '0.5rem', textAlign: 'center' }}>
              Fidelity framework: High = TRL 6, Medium = TRL 5, Low = TRL 4 or below. Source: ICES-2026-251.
            </p>
          </div>

          <div className="fidelity-split" ref={fidelityRef} data-aos="fade-up">
            <div className="fidelity-panel-before">
              <div className="fidelity-panel-head" >Prior Analogs</div>
              {[
                { label: 'Habitat Design',    gap: 'Non-modular geometry; fixed, non-reconfigurable layouts' },
                { label: 'Human Factors',     gap: 'Limited control of lighting, atmosphere, or noise levels' },
                { label: 'Enabling Systems',  gap: 'No closed-loop waste processing or integrated food production' },
              ].map((row, i) => (
                <div className="fidelity-row" key={i} >
                  <span className="fidelity-icon">✗</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.8rem', color: 'rgba(255,255,255,0.55)', marginBottom: '0.2rem' }}>{row.label}</div>
                    <div className="fidelity-row-label">{row.gap}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="fidelity-divider" />
            <div className="fidelity-panel-after">
              <div className="fidelity-panel-head">ASTRO-USA</div>
              {[
                { label: 'Habitat Design',    solution: 'ISS-style modular sections; cylindrical geometry for optimal pressure distribution' },
                { label: 'Human Factors',     solution: 'Full control of lighting, atmosphere, temperature, and noise — no external windows' },
                { label: 'Enabling Systems',  solution: 'Bioreactor waste train + autonomous hydroponics + solar power + Mycoponics™' },
              ].map((row, i) => (
                <div className="fidelity-row" key={i}>
                  <span className="fidelity-icon">✓</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--color-accent)', marginBottom: '0.2rem' }}>{row.label}</div>
                    <div className="fidelity-row-label">{row.solution}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== SECTION 1: CREW OPERATIONS ===== */}
      <section id="astro-crew">
        <div className="container">
          <div className="title-wrap mb-5" data-aos="fade-up">
            <h2 className="section-title">Crew <b>Operations</b></h2>
            <p className="section-sub-title">
              Analog missions replicate the isolation and task demands of long-duration spaceflight,
              preparing crews for the realities of living and working off-planet.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '3rem', alignItems: 'flex-start', flexWrap: 'wrap' }} data-aos="fade-up">
            <div style={{ flex: '1 1 300px' }}>
              <span className="about-section-label">Human Factors</span>
              <h3 style={{ fontFamily: 'var(--font-heading)', marginBottom: '1rem' }}>Designed for Isolation</h3>
              <p style={{ color: 'var(--color-muted)', lineHeight: '1.8', marginBottom: '1rem' }}>
                ASTRO-USA has no external windows, giving researchers full control over lighting, atmospheric
                composition, temperature, and noise levels. Circadian rhythm studies run in parallel across
                both crew members and crops — a novel research dimension no other analog currently captures.
              </p>
              <p style={{ color: 'var(--color-muted)', lineHeight: '1.8', marginBottom: '1rem' }}>
                Each mission hosts six analog astronauts for 14 days in facilities that include a bioastronautics
                lab, medical bay, crew quarters, and workout area. EVA simulations use airlock procedures —
                vacuum pump, air pump, and pressure sensors — to replicate suit operations and external task
                timelines with high operational fidelity.
              </p>
            </div>
            <div className="astro-hud" ref={hudRef}>
              {[
                { key: 'Crew',     val: '6 Analog Astronauts' },
                { key: 'Duration', val: '14-Day Mission' },
                { key: 'Windows',  val: 'None — Full Env. Control' },
                { key: 'EVA Sys',  val: 'Airlock + Pressure Sensors' },
                { key: 'Research', val: 'Bioastronautics Lab' },
                { key: 'Status',   val: 'Active Build' },
              ].map((line, i) => (
                <div className="astro-hud-line" key={i}>
                  <span className="hud-key">{line.key}</span>
                  <span className="hud-val">{line.val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== SECTION 2: LIFE SUPPORT ===== */}
      <section id="astro-lifesupport" style={{ background: 'var(--color-bg-sand)' }}>
        <div className="container">
          <div className="title-wrap mb-5" data-aos="fade-up">
            <h2 className="section-title">Life <b>Support</b></h2>
            <p className="section-sub-title">
              Five integrated subsystems maintain crew health and safety throughout every mission.
            </p>
          </div>
          <div className="astro-systems-grid" data-aos="fade-up">
            {[
              { icon: 'fa-wind',        name: 'HVAC',            desc: 'Controls atmospheric composition, temperature, and humidity throughout the habitat.' },
              { icon: 'fa-tint',        name: 'Water Recovery',  desc: 'Reverse osmosis purifies bioreactor output to potable water quality.' },
              { icon: 'fa-door-closed', name: 'Airlock',         desc: 'Vacuum pump + air pump + pressure sensors manage EVA transitions safely.' },
              { icon: 'fa-heartbeat',   name: 'Medical Bay',     desc: 'Dedicated O₂ supply and monitoring for crew health across all mission phases.' },
              { icon: 'fa-sliders-h',   name: 'Control Systems', desc: 'SIMOC Live monitoring and Opto 22 automation handle real-time fault detection.' },
            ].map((card, i) => (
              <div className="astro-sys-card" key={i}>
                <div className="sys-icon"><i className={`fas ${card.icon}`} /></div>
                <div className="sys-name">{card.name}</div>
                <div className="sys-desc">{card.desc}</div>
              </div>
            ))}
          </div>
          <Suspense fallback={
            <div className="astro-diagram-lazy-shell" aria-busy="true">
              <div className="diagram-spinner" aria-hidden="true" />
              <span>Loading diagram…</span>
            </div>
          }>
            <AstroFlowDiagram />
          </Suspense>
        </div>
      </section>

      {/* ===== SECTION 3: STRUCTURES ===== */}
      <section id="astro-structures">
        <div className="container">
          <div className="title-wrap mb-5" data-aos="fade-up">
            <h2 className="section-title">Habitat <b>Structures</b></h2>
            <p className="section-sub-title">
              Modular ISS-style sections built from aluminum and titanium alloys —
              phased over three years from food production through full crew quarters.
            </p>
          </div>
          <div className="mg-media-row" data-aos="fade-up">
            <div className="mg-media-text">
              <span className="about-section-label">Modular Design</span>
              <h3 style={{ fontFamily: 'var(--font-heading)', marginBottom: '1rem' }}>Built to Simulate Space</h3>
              <p style={{ color: 'var(--color-muted)', lineHeight: '1.8', marginBottom: '1rem' }}>
                Cylindrical and spherical geometries are preferred for superior internal pressure distribution.
                The Food Production Module spans 464 × 92 inches and integrates NFT towers, Mycoponics™,
                Dutch bucket planters, a propagation station, workspace, battery cabinet, and an HVAC attic.
              </p>
              <p style={{ color: 'var(--color-muted)', lineHeight: '1.8' }}>
                Construction follows a three-year phased plan: the Food Production module in Year 1, a full
                laboratory in Year 2, and crew quarters in Year 3 — culminating in the first full analog mission.
              </p>
            </div>
            <div className="mg-media-img" data-aos="fade-left">
              <figure className="blueprint-img">
                <img loading="lazy" src="/astrousa/fig3_floor_layout.webp" alt="Food Production Module floor layout (top-down)" />
              </figure>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '1.5rem', marginTop: '2.5rem', flexWrap: 'wrap' }} data-aos="fade-up">
            <figure className="blueprint-img" style={{ flex: '1 1 300px' }}>
              <img loading="lazy" src="/astrousa/fig2_floor_plan.webp" alt="Food Production Module floor plan" style={{ width: '100%' }} />
              <figcaption style={{ textAlign: 'center', fontSize: '0.78rem', color: 'var(--color-muted)', marginTop: '0.6rem', padding: '0 0.5rem' }}>
                Fig. 2 — Food Production Module floor plan
              </figcaption>
            </figure>
            <figure className="blueprint-img" style={{ flex: '1 1 300px' }}>
              <img loading="lazy" src="/astrousa/fig10_minihab_layout.webp" alt="2D layout of Mini-Hab" style={{ width: '100%' }} />
              <figcaption style={{ textAlign: 'center', fontSize: '0.78rem', color: 'var(--color-muted)', marginTop: '0.6rem', padding: '0 0.5rem' }}>
                Fig. 10 — Mini-Hab 2D layout
              </figcaption>
            </figure>
          </div>
          {/* Mini-Hab callout */}
          <div className="mini-hab-callout" data-aos="fade-up">
            <div className="mini-hab-callout-icon"><i className="fas fa-cubes" /></div>
            <div>
              <div className="mini-hab-callout-title">Mini-Hab — 3-Year Development Plan</div>
              <div className="mini-hab-callout-body">
                <strong>Year 1 (2025):</strong> Food Production Module (464 × 92 in) — 27 × 11 NFT hydroponic towers, Kratky DWC, propagation station, 4.4 kW solar, Mycoponics™ integration.<br />
                <strong>Year 2 (2026):</strong> BSL-2 Laboratory Module — anaerobic &amp; phototrophic bioreactor research, NASA BioWaTERR trailer integration, EVA simulation protocols.<br />
                <strong>Year 3 (2027):</strong> Crew Quarters Module — first full 14-day analog mission, mass-balance monitoring (waste input → permeate output → plant biomass).
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1.5rem', marginTop: '1.5rem', flexWrap: 'wrap' }} data-aos="fade-up">
            <figure style={{ flex: '1 1 300px', margin: 0 }}>
              <img loading="lazy" src="/astrousa/Sparks_ASTRO.webp" alt="Welding and fabrication on the ASTRO-USA habitat" style={{ width: '100%', borderRadius: '10px', display: 'block' }} />
              <figcaption style={{ textAlign: 'center', fontSize: '0.78rem', color: 'var(--color-muted)', marginTop: '0.6rem' }}>
                Welding and fabrication work on the habitat frame
              </figcaption>
            </figure>
            <figure style={{ flex: '1 1 300px', margin: 0 }}>
              <img loading="lazy" src="/astrousa/Drill_Work_ASTRO.webp" alt="Structural drilling and assembly on the ASTRO-USA habitat" style={{ width: '100%', borderRadius: '10px', display: 'block' }} />
              <figcaption style={{ textAlign: 'center', fontSize: '0.78rem', color: 'var(--color-muted)', marginTop: '0.6rem' }}>
                Structural drilling and panel assembly
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      {/* ===== SECTION 4: POWER ===== */}
      <section id="astro-power" style={{ background: 'var(--color-bg-sand)' }}>
        <div className="container">
          <div className="title-wrap mb-5" data-aos="fade-up">
            <h2 className="section-title">Power <b>Systems</b></h2>
            <p className="section-sub-title">
              4.4 kW of solar capacity with biogas supplementation supplies the habitat's 8 kWh daily demand
              across four NEC-compliant circuits.
            </p>
          </div>
          <div data-aos="fade-up">
            <p style={{ color: 'var(--color-muted)', lineHeight: '1.8', maxWidth: '700px', marginBottom: '2rem' }}>
              The system sustains 350 W average draw with a 450 W steady-state maximum and manages a 2.6 kW
              startup surge through staggered activation. Energy flows from solar panels through a combiner box
              and charge controllers into the battery bank, then through inverters to eight receptacles across
              all AC and DC loads. A biogas generator supplements solar during reduced irradiance.
            </p>
          </div>
          <div className="power-chain-wrap" ref={powerRef} data-aos="fade-up">
            <div className="power-chain">
              {[
                { icon: 'fa-solar-panel',  label: 'Solar' },
                { icon: 'fa-plug',         label: 'Combiner' },
                { icon: 'fa-sliders-h',    label: 'Controllers' },
                { icon: 'fa-battery-full', label: 'Batteries' },
                { icon: 'fa-exchange-alt', label: 'Inverters' },
                { icon: 'fa-bolt',         label: 'Loads' },
              ].map((node, i) => (
                <React.Fragment key={i}>
                  <div className="power-node">
                    <div className="power-node-circle">
                      <i className={`fas ${node.icon}`} />
                    </div>
                    <div className="power-node-label">{node.label}</div>
                  </div>
                  {i < 5 && <div className="power-link" />}
                </React.Fragment>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '1.5rem', marginTop: '2.5rem', flexWrap: 'wrap' }} data-aos="fade-up">
            <figure style={{ flex: '1 1 300px', margin: 0 }}>
              <img loading="lazy" src="/astrousa/fig6_solar_diagram.webp" alt="Solar farm electrical diagram" style={{ width: '100%', borderRadius: '10px' }} />
              <figcaption style={{ textAlign: 'center', fontSize: '0.78rem', color: 'var(--color-muted)', marginTop: '0.6rem' }}>
                Fig. 6 — Solar farm electrical diagram
              </figcaption>
            </figure>
            <figure style={{ flex: '1 1 300px', margin: 0 }}>
              <img loading="lazy" src="/astrousa/fig7_one_line.webp" alt="Single-line power distribution diagram" style={{ width: '100%', borderRadius: '10px' }} />
              <figcaption style={{ textAlign: 'center', fontSize: '0.78rem', color: 'var(--color-muted)', marginTop: '0.6rem' }}>
                Fig. 7 — Single-line power distribution
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      {/* ===== SECTION 5: CLOSED-LOOP SYSTEMS ===== */}
      <section id="astro-loop">
        <div className="container">
          <div className="title-wrap mb-5" data-aos="fade-up">
            <h2 className="section-title">Closed-Loop <b>Systems</b></h2>
            <p className="section-sub-title">
              Human waste enters a bioreactor train and exits as potable water, fertilizer, energy,
              and 3D-printable filament — completing the loop back to crew sustenance.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '3rem', alignItems: 'center', flexWrap: 'wrap' }} data-aos="fade-up">
            <div style={{ flex: '1 1 280px' }}>
              <span className="about-section-label">Bioreactor Train</span>
              <h3 style={{ fontFamily: 'var(--font-heading)', marginBottom: '1rem' }}>From Waste to Resource</h3>
              <p style={{ color: 'var(--color-muted)', lineHeight: '1.8', marginBottom: '1rem' }}>
                Waste passes through four bioreactor stages:{' '}
                <span className="abbr-tip" data-tip="Anaerobic-Phototrophic Membrane Bio Reactor">APMBR</span> →{' '}
                <span className="abbr-tip" data-tip="Membrane Aerated Biofilm Reactor">MABR</span> →{' '}
                <span className="abbr-tip" data-tip="Suspended Aerobic Membrane Bio Reactor">SAMBR</span> →{' '}
                <span className="abbr-tip" data-tip="Fermentation Membrane Bio Reactor">FMBR</span>.{' '}
                Reverse osmosis (<span className="abbr-tip" data-tip="Reverse Osmosis">RO</span>) converts
                permeate into potable water.
              </p>
              <p style={{ color: 'var(--color-muted)', lineHeight: '1.8', marginBottom: '1rem' }}>
                The FMBR stage generates pharmaceuticals, vitamins, and PLA filament. PLA produced
                by the FMBR can be combined with lunar regolith or regolith simulant to 3D-print
                structures, tools, and equipment directly on the Moon or Mars — reducing reliance
                on resupply missions. Mycoponics™ breaks down PLA and reactor byproducts into plant
                nutrients, and biogas captured from the anaerobic stage fuels the supplemental generator.
              </p>
              <p style={{ color: 'var(--color-muted)', lineHeight: '1.8' }}>
                The result: a fully closed waste loop where every output from human metabolism
                re-enters the habitat as food, water, or energy.
              </p>
            </div>
            {/* Loop ring — desktop */}
            <div className="loop-ring-wrap" ref={loopRef}>
              <svg className="loop-ring-svg" viewBox="0 0 480 480">
                {arcPairs.map(([a, b], i) => (
                  <line
                    key={i}
                    className="loop-arc"
                    x1={nodeCenters[a].cx} y1={nodeCenters[a].cy}
                    x2={nodeCenters[b].cx} y2={nodeCenters[b].cy}
                  />
                ))}
              </svg>
              {loopNodes.map((node, i) => (
                <div
                  key={i}
                  className="loop-node"
                  style={{ top: nodePositions[i].top, left: nodePositions[i].left }}
                >
                  <span className="loop-node-icon"><i className={`fas ${node.icon}`} /></span>
                  <span className="loop-node-label">{node.label}</span>
                </div>
              ))}
            </div>
            {/* Loop ring fallback — 480px and below */}
            <div className="loop-ring-fallback" style={{ display: 'none', flexDirection: 'column', gap: '0.25rem', flex: '1 1 200px' }}>
              {loopNodes.map((node, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0', borderBottom: '1px solid var(--color-border)' }}>
                  <span style={{ color: 'var(--color-accent)', fontWeight: 700, minWidth: '1.5rem' }}>{i + 1}.</span>
                  <i className={`fas ${node.icon}`} style={{ color: 'var(--color-muted)', width: '1.2rem' }} />
                  <span style={{ color: 'var(--color-text-light)', fontSize: '0.85rem' }}>{node.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== SECTION 6: BIO-SYSTEMS ===== */}
      <section id="astro-bio" style={{ background: 'var(--color-bg-sand)' }}>
        <div className="container">
          <div className="title-wrap mb-5" data-aos="fade-up">
            <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
              <span className="lottie-section-icon">
                <Player autoplay loop src="/animations/plant-grow.json" style={{ height: 48, width: 48 }} />
              </span>
              Bio <b>Systems</b>
            </h2>
            <p className="section-sub-title">
              27 rows of 11 stacked NFT hydroponic towers, Mycoponics™ integration, and autonomous
              sensor control — designed to sustain six crew members for 14 days.
            </p>
          </div>
          <div className="row" ref={growthRef} data-aos="fade-up">
            <div className="col-md-6 mb-4">
              <div className="growth-img">
                <img loading="lazy" src="/astrousa/fig4_nft_towers.webp" alt="27×11 NFT tower assemblies" style={{ width: '100%', borderRadius: '12px', objectFit: 'cover', aspectRatio: '4/3' }} />
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--color-muted)', marginTop: '0.6rem', textAlign: 'center' }}>
                Fig. 4 — 27×11 NFT tower assemblies
              </p>
            </div>
            <div className="col-md-6 mb-4">
              <div className="growth-img">
                <img loading="lazy" src="/astrousa/fig5_propagation.webp" alt="Propagation station and DWC buckets" style={{ width: '100%', borderRadius: '12px', objectFit: 'cover', aspectRatio: '4/3' }} />
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--color-muted)', marginTop: '0.6rem', textAlign: 'center' }}>
                Fig. 5 — Propagation station + DWC buckets
              </p>
            </div>
          </div>
          <div className="mg-media-row mt-4" data-aos="fade-up">
            <div className="mg-media-text">
              <span className="about-section-label">Mycoponics™</span>
              <h3 style={{ fontFamily: 'var(--font-heading)', marginBottom: '1rem' }}>Fungal Nutrient Recovery</h3>
              <p style={{ color: 'var(--color-muted)', lineHeight: '1.8', marginBottom: '1rem' }}>
                Mycoponics™ uses fungal networks to break down PLA filament and bioreactor byproducts into
                bioavailable nutrients for the hydroponic system — closing the loop between the waste train
                and the food supply in a way no prior analog has achieved.
              </p>
              <p style={{ color: 'var(--color-muted)', lineHeight: '1.8' }}>
                A distributed sensor network tracks nutrient concentration, water availability, and pH across
                all growing units, enabling autonomous adjustment and crew alarm notifications. The propagation
                station spans 10 levels of seedling development; two floor-mounted Dutch buckets and one large
                Kratky DWC unit supplement tower output.
              </p>
            </div>
            <div className="mg-media-img" data-aos="fade-left">
              <img loading="lazy" src="/astrousa/Mycoponics.webp" alt="Mycoponics fungal system" style={{ borderRadius: '10px', width: '100%' }} />
            </div>
          </div>
          <div style={{ marginTop: '2rem' }} data-aos="fade-up">
            <img loading="lazy" src="/astrousa/Hydroponics_Work_ASTRO.webp" alt="Hydroponics system work at Purdue Greenhouse" style={{ width: '100%', borderRadius: '10px', objectFit: 'cover', maxHeight: '420px' }} />
          </div>
        </div>
      </section>

      {/* ===== SECTION 7: RESEARCH IMPACT ===== */}
      <section id="astro-impact">
        <div className="container">
          <div className="title-wrap mb-5" data-aos="fade-up">
            <h2 className="section-title">Research <b>Impact</b></h2>
            <p className="section-sub-title">
              ASTRO-USA directly addresses the gap identified across every prior analog: no facility
              achieves high-fidelity in habitat design, human factors, and enabling systems simultaneously.
            </p>
          </div>
          <div className="row" ref={impactRef} data-aos="fade-up">
            {[
              {
                icon: 'fa-bullseye',
                title: 'Gap Addressed',
                body: 'No existing analog is both fully closed-loop and modular. CHAPEA lacks modularity; HI-SEAS lacks food production; HERA lacks closed-loop waste; Biosphere 2 broke its closed loop. ASTRO-USA is built to achieve high-fidelity across all three dimensions.',
              },
              {
                icon: 'fa-layer-group',
                title: 'Three-Pillar Framework',
                body: 'Habitat Design — ISS-style modular geometry with optimal pressure distribution. Human Factors — full environmental control enabling circadian and bioastronautics research. Enabling Systems — bioreactor train, hydroponics, solar power, and Mycoponics™.',
              },
              {
                icon: 'fa-rocket',
                title: 'NASA Artemis Relevance',
                body: 'ASTRO-USA targets TRL 6, providing validated analog data that feeds directly into NASA Artemis mission planning. Partnership with NASA KSC and integration of the NASA BioWaTERR system in Year 2 deepens this connection.',
              },
              {
                icon: 'fa-calendar-alt',
                title: 'Phased Timeline',
                body: 'Year 1: Food Production Module. Year 2: Lab + bioreactors + BioWaTERR integration. Year 3: Crew Quarters + first full 14-day analog mission. Years 4–5: Primary ASTRO-USA habitat construction and first primary mission.',
              },
            ].map((card, i) => (
              <div className="col-md-6 mb-4" key={i}>
                <div className="impact-card">
                  <div className="impact-card-icon"><i className={`fas ${card.icon}`} /></div>
                  <div className="impact-card-title">{card.title}</div>
                  <div className="impact-card-body">{card.body}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="coming-soon-cta" data-aos="fade-up">
            <span style={{ color: 'var(--color-muted)', fontSize: '0.9rem' }}>
              Peer-reviewed conference paper — ICES-2026-251:
            </span>
            <button
              className="btn-slide-outline"
              style={{ opacity: 0.6, cursor: 'not-allowed', pointerEvents: 'none', padding: '0.55rem 1.75rem' }}
              disabled
              aria-label="Research paper pending publication"
            >
              <span>ICES-2026-251</span>
            </button>
            <span className="coming-soon-badge">July 2026 · Rio Grande, PR</span>
          </div>
        </div>
      </section>

      {/* ===== SECTION 8: DEVELOPMENT TIMELINE ===== */}
      <section id="astro-timeline" style={{ background: 'var(--color-bg-sand)' }}>
        <div className="container">
          <div className="title-wrap mb-5" data-aos="fade-up">
            <h2 className="section-title">Development <b>Timeline</b></h2>
            <p className="section-sub-title">
              A five-year phased build from a single food production module to a complete, crewed analog habitat.
            </p>
          </div>
          <div style={{ position: 'relative' }} ref={timelineRef} data-aos="fade-up">
            <div className="timeline-track-bg" />
            <div className="timeline-track" />
            <div className="dev-timeline">
              {[
                {
                  year: '2023',
                  phase: 'Origins',
                  bullets: ['Idea to create ASTRO-USA is formed'],
                  active: true,
                },
                {
                  year: '2024',
                  phase: 'Planning',
                  bullets: ['Research', 'ICES student poster on ASTRO-USA', 'Land Acquisition', 'KSC visit for SEARCH and NASA collaboration'],
                  active: true,
                },
                {
                  year: '2025',
                  phase: 'Food Production Module',
                  bullets: ['NFT hydroponic towers & sensor network', 'Solar power system installation', 'Mycoponics™ integration', 'Framing & wiring'],
                  active: true,
                },
                {
                  year: '2026',
                  phase: 'Laboratory Module',
                  bullets: ['Bioreactor train build-out', 'NASA BioWaTERR integration', 'EVA simulation protocols', 'Insulation, HVAC, & solar panels', 'Organized into 6 subteams'],
                },
                {
                  year: '2027',
                  phase: 'Crew Quarters + Mission 1',
                  bullets: ['Full habitat integration', 'First 14-day analog mission', 'Circadian rhythm research launch', 'Flooring & bio-systems integration'],
                },
                {
                  year: '2028–29',
                  phase: 'Primary ASTRO-USA Habitat',
                  bullets: ['Full-scale primary habitat build', 'System integration & validation', 'First primary habitat mission'],
                },
              ].map((node, i) => (
                <div className={`timeline-node${node.active ? ' active' : ''}`} key={i}>
                  <div className="timeline-dot" />
                  <div className="timeline-content">
                    <div className="timeline-year">{node.year}</div>
                    <div className="timeline-phase">{node.phase}</div>
                    <ul className="timeline-bullets">
                      {node.bullets.map((b, j) => <li key={j}>{b}</li>)}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== CULTURE VIDEO ===== */}
      <section id="astro-culture" className="video-bg-section" style={{ minHeight: '420px' }}>
        <video
          className="section-video"
          src="/astrousa/AstroUsa_Dance.webm"
          autoPlay
          loop
          muted
          playsInline
        />
        <div className="section-video-overlay" style={{ background: 'linear-gradient(to right, rgba(18,18,28,0.78), rgba(18,18,28,0.45))' }} />
        <div className="section-video-content container" style={{ padding: '6rem 0' }}>
          <div className="row">
            <div className="col-lg-7 col-md-9" data-aos="fade-right">
              <span className="about-section-label" style={{ color: 'rgba(255,255,255,0.7)' }}>Team Culture</span>
              <h2 className="section-title" style={{ color: '#fff' }}>
                More Than <b>a Project</b>
              </h2>
              <p style={{ color: 'rgba(255,255,255,0.8)', lineHeight: '1.8' }}>
                ASTRO-USA is a community as much as it is a project. Members bring disciplines
                from architecture to biology to electrical engineering — and find common ground
                in the shared goal of building something no other student group has attempted.
                The culture reflects the spirit of exploration: curious, collaborative, and
                always pushing further.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== BLOG CARDS ===== */}
      <section id="blog" className="bg-grey">
        <div className="container">
          <div className="section-content">
            <div className="title-wrap mb-5" data-aos="fade-up">
              <h2 className="section-title">Latest ASTRO-USA <b>Updates</b></h2>
              <p className="section-sub-title">
                ASTRO-USA is a collaborative project to build a fully self-sustaining habitat on Purdue University's
                Campus focused on bioastronautics research.
              </p>
            </div>
            <div className="row">
              <div className="col-md-12 blog-holder">
                <div className="row">
                  <div className="col-md-4 blog-item-wrapper" data-aos="fade-up" data-aos-delay={200}>
                    <div className="blog-item">
                      <div className="blog-img">
                        <Link to="/astrousa/overview"><img loading="lazy" src="/astrousa/astro-overview.webp" alt="Habitat Overview" /></Link>
                      </div>
                      <div className="blog-text">
                        <div className="blog-tag"><a href="#top"><h6><small>General</small></h6></a></div>
                        <div className="blog-title"><Link to="/astrousa/overview"><h4>Habitat Overview</h4></Link></div>
                        <div className="blog-meta"><p className="blog-date">3 March 2024</p></div>
                        <div className="blog-desc"><p>Learn more about the background, goals, and designs of the ASTRO-USA habitat!</p></div>
                        <div className="blog-author"><p>by Ilina Adhikari, Brasen Garcia, Ryan DeAngelis, Nathanael Herman</p></div>
                        <div className="blog-share-wrapper">
                          <a className="blog-share" href="https://www.instagram.com/purdue_search/" target="_blank" rel="noopener noreferrer"><i className="fab fa-instagram" /></a>
                          <a className="blog-share" href="https://twitter.com/purduesearch" target="_blank" rel="noopener noreferrer"><i className="fab fa-twitter-square" /></a>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="col-md-4 blog-item-wrapper" data-aos="fade-up" data-aos-delay={200}>
                    <div className="blog-item">
                      <div className="blog-img">
                        <Link to="/astrousa/architecture"><img loading="lazy" src="/astrousa/architecture_design.webp" alt="Architecture Design" /></Link>
                      </div>
                      <div className="blog-text">
                        <div className="blog-tag"><a href="#top"><h6><small>Architecture</small></h6></a></div>
                        <div className="blog-title"><Link to="/astrousa/architecture"><h4>Architecture Design</h4></Link></div>
                        <div className="blog-meta"><p className="blog-date">23 Feb 2024</p></div>
                        <div className="blog-desc"><p>An in depth look on the design process for the ASTRO-USA habitat</p></div>
                        <div className="blog-author"><p>by Ilina Adhikari, Brasen Garcia, Ryan DeAngelis</p></div>
                        <div className="blog-share-wrapper">
                          <a className="blog-share" href="https://www.instagram.com/purdue_search/" target="_blank" rel="noopener noreferrer"><i className="fab fa-instagram" /></a>
                          <a className="blog-share" href="https://twitter.com/purduesearch" target="_blank" rel="noopener noreferrer"><i className="fab fa-twitter-square" /></a>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="col-md-4 blog-item-wrapper" data-aos="fade-up" data-aos-delay={200}>
                    <div className="blog-item">
                      <div className="blog-img">
                        <Link to="/astrousa/hydroponics"><img loading="lazy" src="/research/2023_24/hydroponics/hydro.jpg" alt="Hydroponics" /></Link>
                      </div>
                      <div className="blog-text">
                        <div className="blog-tag"><a href="#top"><h6><small>Bio-Astronautics</small></h6></a></div>
                        <div className="blog-title"><Link to="/astrousa/hydroponics"><h4>Hydroponics</h4></Link></div>
                        <div className="blog-meta"><p className="blog-date">9 Feb 2024</p></div>
                        <div className="blog-desc"><p>A team of students developing an autonomous hydroponic system at Purdue's Greenhouse for implementation in ASTRO-USA!</p></div>
                        <div className="blog-author"><p>by Ilina Adhikari</p></div>
                        <div className="blog-share-wrapper">
                          <a className="blog-share" href="https://www.instagram.com/purdue_search/" target="_blank" rel="noopener noreferrer"><i className="fab fa-instagram" /></a>
                          <a className="blog-share" href="https://twitter.com/purduesearch" target="_blank" rel="noopener noreferrer"><i className="fab fa-twitter-square" /></a>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default AstroUSA;
