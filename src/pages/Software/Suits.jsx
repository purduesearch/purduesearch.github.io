import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import Breadcrumb from '../../components/Breadcrumb';
import SEOHead from '../../components/SEOHead';

const Suits = () => {
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
        { '@type': 'ListItem', 'position': 2, 'name': 'Software', 'item': 'https://purduesearch.github.io/software' },
        { '@type': 'ListItem', 'position': 3, 'name': 'NASA SUITS Challenge' },
      ],
    });
    document.head.appendChild(script);
    return () => { if (document.head.contains(script)) document.head.removeChild(script); };
  }, []);

  return (
    <div>
      <SEOHead
        title="JARVIS — NASA SUITS Challenge"
        description="Purdue SEARCH's JARVIS team competes in NASA SUITS, designing AI-powered spacesuit and rover interfaces for Artemis lunar surface missions."
        canonical="/software/suits"
      />
      <Navbar />
      <Breadcrumb />

      {/* ===== HERO ===== */}
      <div id="main-content" className="jumbotron-post jumbotron-single d-flex align-items-center" style={{ backgroundImage: 'url(/software/2023_24/SUITS/bg.webp)' }}>
        <div className="container text-center" style={{ top: 30 }}>
          <h1 className="display-2 mb-3">JARVIS — NASA SUITS</h1>
          <p style={{ fontSize: '1.1rem', color: 'rgba(245,239,230,0.85)', letterSpacing: '.06em', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
            Just A Rather Vital Interface System
          </p>
        </div>
      </div>

      {/* ===== AWARDS & RECOGNITION ===== */}
      <section style={{ background: 'var(--color-bg-dark)', padding: 'var(--section-pad) 0' }}>
        <div className="container">
          <div className="title-wrap mb-5 text-center" data-aos="fade-up">
            <h2 className="section-title" style={{ color: 'var(--color-text-light)' }}>
              Awards &amp; <b>Recognition</b>
            </h2>
            <p className="section-sub-title" style={{ color: 'rgba(245,239,230,0.6)' }}>
              JARVIS has earned NASA recognition two years running.
            </p>
          </div>
          <div className="suits-award-strip" data-aos="fade-up">
            <div className="suits-award-card">
              <div className="award-icon" style={{ color: '#f5c842' }}>
                <i className="fas fa-heart" aria-hidden="true" />
              </div>
              <span className="award-year">2023–24</span>
              <h3>Pay It Forward Award</h3>
              <p>Recognised for outstanding outreach and community engagement, sharing space technology inspiration with the next generation of engineers.</p>
            </div>
            <div className="suits-award-card">
              <div className="award-icon" style={{ color: 'var(--color-accent)' }}>
                <i className="fas fa-lightbulb" aria-hidden="true" />
              </div>
              <span className="award-year">2024–25</span>
              <h3>Innovation Award</h3>
              <p>Awarded for pioneering AI integration — combining large language models, retrieval-augmented generation, and on-device inference in a NASA surface mission context.</p>
            </div>
          </div>
          <div data-aos="fade-up">
            <img loading="lazy" src="/software/Win_Photo_Suits.webp" alt="JARVIS team at NASA SUITS competition" style={{ display: 'block', width: '100%', maxWidth: 720, margin: '0 auto', borderRadius: 10 }} />
          </div>
        </div>
      </section>

      {/* ===== CHALLENGE OVERVIEW ===== */}
      <section id="suits-overview">
        <div className="container">
          <div className="title-wrap mb-5" data-aos="fade-up">
            <h2 className="section-title">The <b>Challenge</b></h2>
          </div>
          <div data-aos="fade-up" style={{ color: 'var(--color-muted)', lineHeight: '1.8' }}>
            <img loading="lazy" className="float-left" src="/software/2023_24/SUITS/teams.webp" alt="SUITS Teams" style={{ maxWidth: 320, borderRadius: 10, marginRight: '1.5rem', marginBottom: '1rem' }} />
            <p>
              <i>"NASA Spacesuit User Interface Technologies for Students (NASA SUITS) is a design challenge in which college students from across the country help
              design user interface solutions for future spaceflight needs. NASA's Artemis missions seek to land the first woman and first person of color on the Moon
              and build a sustained human presence for exploration of Mars."</i>
            </p>
            <p>
              For 2025–26 the challenge targets the <strong>Lunar South Pole</strong> environment: teams must design interfaces supporting Artemis III surface operations,
              including navigation across permanently shadowed regions, coordination with a <strong>Lunar Terrain Vehicle (LTV)</strong>, and search-and-rescue contingency
              procedures. JARVIS addresses these demands with a unified AI-driven platform spanning spacesuit wrist displays, helmet overlays, and a pressurized-rover console.
            </p>
            <div style={{ clear: 'both' }} />
          </div>
        </div>
      </section>

      {/* ===== 2024 ACHIEVEMENT HIGHLIGHT ===== */}
      <section id="suits-2024" style={{ background: 'var(--color-bg-secondary)' }}>
        <div className="container">
          <div className="title-wrap mb-5 text-center" data-aos="fade-up">
            <h2 className="section-title">JARVIS 2024 — <b>NASA Johnson Space Center Finals</b></h2>
            <p className="section-sub-title">
              Purdue JARVIS was one of 11 national finalists selected to present and test at NASA JSC, competing against top university teams
              before NASA engineers and space industry professionals.
            </p>
          </div>
          <div data-aos="fade-up" style={{ textAlign: 'center' }}>
            <div style={{ position: 'relative', paddingBottom: '42%', maxWidth: 720, margin: '0 auto', borderRadius: 12, overflow: 'hidden' }}>
              <iframe
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
                src="https://www.youtube.com/embed/nD3Otpz2MaY"
                title="JARVIS SUITS 2024 at NASA Johnson Space Center"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      </section>

      {/* ===== 2025-26 JARVIS ARCHITECTURE ===== */}
      <section id="suits-architecture">
        <div className="container">
          <div className="title-wrap mb-2" data-aos="fade-up">
            <h2 className="section-title">2025–26 JARVIS <b>System</b></h2>
            <p className="section-sub-title">
              A full-stack mission interface: AI reasoning, real-time telemetry, and multi-device hardware.
            </p>
          </div>
        </div>

        {/* 5a — AI Architecture */}
        <div className="container" style={{ paddingTop: '2rem' }}>
          <div className="mg-media-row" data-aos="fade-up">
            <div className="mg-media-text">
              <span className="about-section-label">Artificial Intelligence</span>
              <h3 style={{ fontFamily: 'var(--font-heading)', marginBottom: '1rem' }}>
                On-Device AI for Mission-Critical Decisions
              </h3>
              <p style={{ color: 'var(--color-muted)', lineHeight: '1.8' }}>
                JARVIS deploys a multi-model AI stack running at the edge — no cloud dependency during EVA operations. The system combines conversational reasoning,
                biomedical expertise, and document retrieval to give crews real-time answers sourced directly from NASA procedure libraries.
              </p>
              <div style={{ marginTop: '1rem' }}>
                <span className="suits-tech-chip"><i className="fas fa-brain" aria-hidden="true" /> Gemma3n LLM</span>
                <span className="suits-tech-chip"><i className="fas fa-heartbeat" aria-hidden="true" /> MedGemma</span>
                <span className="suits-tech-chip"><i className="fas fa-database" aria-hidden="true" /> RAG Pipeline</span>
                <span className="suits-tech-chip"><i className="fas fa-graduation-cap" aria-hidden="true" /> RLHF Fine-tuning</span>
                <span className="suits-tech-chip"><i className="fas fa-microphone" aria-hidden="true" /> openWakeWord</span>
              </div>
              <ul style={{ color: 'var(--color-muted)', lineHeight: '2', marginTop: '1rem' }}>
                <li><strong>Gemma3n LLM</strong> — conversational mission assistant with on-device inference; no latency from server round-trips</li>
                <li><strong>MedGemma</strong> — biomedical query answering for crew health monitoring and anomaly explanation</li>
                <li><strong>RAG Pipeline</strong> — retrieves exact NASA procedure documents for in-context, cited answers</li>
                <li><strong>RLHF Fine-tuning</strong> — mission-specialist alignment shaped by expert astronaut feedback</li>
                <li><strong>openWakeWord</strong> — passive "Hey JARVIS" activation; hands-free in EVA gloves</li>
              </ul>
            </div>
            <div className="mg-media-img" data-aos="fade-left">
              <img loading="lazy" src="/software/Meeting_SUITS.webp" alt="JARVIS team developing AI systems" />
            </div>
          </div>
        </div>

        {/* 5b — Hardware Platform */}
        <div style={{ background: 'var(--color-bg-secondary)', padding: '3rem 0', marginTop: '2rem' }}>
          <div className="container">
            <div className="title-wrap mb-4 text-center" data-aos="fade-up">
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.6rem' }}>Hardware <b>Platform</b></h3>
              <p style={{ color: 'var(--color-muted)' }}>Three interfaces — one for every mission role.</p>
            </div>
            <div className="row text-center" data-aos="fade-up">
              <div className="col-md-4 mb-4">
                <div className="shadow rounded feature-item p-4">
                  <div style={{ fontSize: '2rem', color: 'var(--color-accent)', marginBottom: '0.75rem' }}>
                    <i className="fas fa-hand-paper" aria-hidden="true" />
                  </div>
                  <h4>WMD</h4>
                  <h6 style={{ color: 'var(--color-muted)', marginBottom: '.75rem' }}>Wrist Mounted Display</h6>
                  <p style={{ color: 'var(--color-muted)', fontSize: '.9rem' }}>
                    Primary spacesuit interface worn on the forearm. One-handed navigation through EVA checklists,
                    map waypoints, and crew status — operable with pressurized gloves.
                  </p>
                </div>
              </div>
              <div className="col-md-4 mb-4">
                <div className="shadow rounded feature-item p-4">
                  <div style={{ fontSize: '2rem', color: 'var(--color-accent)', marginBottom: '0.75rem' }}>
                    <i className="fas fa-vr-cardboard" aria-hidden="true" />
                  </div>
                  <h4>HMD</h4>
                  <h6 style={{ color: 'var(--color-muted)', marginBottom: '.75rem' }}>Head Mounted Display</h6>
                  <p style={{ color: 'var(--color-muted)', fontSize: '.9rem' }}>
                    Visor overlay projecting navigational map, procedural steps, and biomed alerts
                    directly into the astronaut's field of view — keeping eyes on terrain.
                  </p>
                </div>
              </div>
              <div className="col-md-4 mb-4">
                <div className="shadow rounded feature-item p-4">
                  <div style={{ fontSize: '2rem', color: 'var(--color-accent)', marginBottom: '0.75rem' }}>
                    <i className="fas fa-gamepad" aria-hidden="true" />
                  </div>
                  <h4>Rover Console</h4>
                  <h6 style={{ color: 'var(--color-muted)', marginBottom: '.75rem' }}>Pressurized Rover Interface</h6>
                  <p style={{ color: 'var(--color-muted)', fontSize: '.9rem' }}>
                    Ferrari racing wheel + Xbox controller + Apple Vision Pro for immersive pressurized-rover
                    operations. Full dashboard UI with LTV coordination and pathfinding tools.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 5c — LunarLink */}
        <div className="container" style={{ paddingTop: '2.5rem' }}>
          <div data-aos="fade-up" style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
            <span className="about-section-label">Communications</span>
            <h3 style={{ fontFamily: 'var(--font-heading)', marginBottom: '1rem' }}>LunarLink</h3>
            <p style={{ color: 'var(--color-muted)', lineHeight: '1.8' }}>
              LunarLink is JARVIS's communications bridge layer — an HTTP GET/POST middleware that translates the NASA Telemetry Sharing System (TSS) API
              stream into structured JSON, keeping mission-critical data synchronized across all connected devices in real time. Whether a crew member
              is suited up on the lunar surface or operating the pressurized rover, LunarLink ensures every subsystem sees a consistent mission state.
            </p>
          </div>
        </div>
      </section>

      {/* ===== COMMON FEATURES ===== */}
      <section id="suits-common" style={{ background: 'var(--color-bg-secondary)' }}>
        <div className="container">
          <div className="title-wrap mb-5 text-center" data-aos="fade-up">
            <h2 className="section-title">Common <b>Features</b></h2>
            <p className="section-sub-title">Capabilities shared across all JARVIS interfaces — WMD, HMD, and rover console.</p>
          </div>
          <div className="row" data-aos="fade-up">
            {[
              { icon: 'fas fa-map-marker-alt', title: 'GeoPin System', desc: 'Drop persistent geolocation markers on the EVA map to tag rock samples, equipment caches, hazard zones, and points of interest — shareable across the entire crew.' },
              { icon: 'fas fa-ruler-combined', title: 'Maximum Range Predictor', desc: 'Ellipse-model algorithm with terrain-factor correction computes the safe turnaround distance from base, accounting for slope, suit power, and O₂ budget.' },
              { icon: 'fas fa-route', title: 'A* Navigation', desc: 'Elevation-cost A* pathfinding automatically routes EVAs around craters, steep slopes, and LiDAR-flagged obstacles to minimise traverse risk.' },
            ].map(f => (
              <div key={f.title} className="col-md-4 mb-4">
                <div className="shadow rounded feature-item p-4 h-100" data-aos="fade-up">
                  <div style={{ fontSize: '1.75rem', color: 'var(--color-accent)', marginBottom: '.75rem' }}>
                    <i className={f.icon} aria-hidden="true" />
                  </div>
                  <h5 style={{ fontFamily: 'var(--font-heading)' }}>{f.title}</h5>
                  <p style={{ color: 'var(--color-muted)', fontSize: '.9rem', lineHeight: '1.7' }}>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="row justify-content-center" data-aos="fade-up">
            {[
              { icon: 'fas fa-exclamation-triangle', title: 'Caution & Warning AI', desc: 'Real-time anomaly detection across biomed and suit telemetry streams. MedGemma classifies severity and recommends immediate crew action.' },
              { icon: 'fas fa-robot', title: 'JARVIS Assistant', desc: 'Voice and text conversational interface backed by Gemma3n + RAG. Ask mission questions, get procedure steps, or request a status summary — hands-free via "Hey JARVIS".' },
            ].map(f => (
              <div key={f.title} className="col-md-4 mb-4">
                <div className="shadow rounded feature-item p-4 h-100" data-aos="fade-up">
                  <div style={{ fontSize: '1.75rem', color: 'var(--color-accent)', marginBottom: '.75rem' }}>
                    <i className={f.icon} aria-hidden="true" />
                  </div>
                  <h5 style={{ fontFamily: 'var(--font-heading)' }}>{f.title}</h5>
                  <p style={{ color: 'var(--color-muted)', fontSize: '.9rem', lineHeight: '1.7' }}>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== PRESSURIZED ROVER INTERFACE ===== */}
      <section id="suits-rover">
        <div className="container">
          <div className="title-wrap mb-5" data-aos="fade-up">
            <h2 className="section-title">Pressurized Rover <b>Interface</b></h2>
            <p className="section-sub-title">A mission-control-grade dashboard for lunar surface operations inside the LTV cabin.</p>
          </div>
          <div className="mg-media-row" data-aos="fade-up">
            <div className="mg-media-img" data-aos="fade-right">
              <img loading="lazy" src="/software/Data_Monitors_Suits.webp" alt="JARVIS Pressurized Rover UI on monitors" />
            </div>
            <div className="mg-media-text">
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {[
                  { name: 'UI Display', desc: 'Dark-themed dashboard aggregating system states, alert feeds, LLM chat panel, and live minimap in a single glanceable view.' },
                  { name: 'Minimap + LTV Triangulation', desc: 'Perpendicular-bisector geometry locates a lost LTV from two EVA crew bearing readings, highlighting the intersection zone on the map.' },
                  { name: 'DUST Pathfinding', desc: 'Discrete simulation of lunar terrain traversal generates the optimal rover route before committing to any drive.' },
                  { name: 'Obstacle Detection', desc: 'LiDAR point-cloud scanning flags boulders and regolith hazards along the planned path before the rover commits.' },
                  { name: 'Resource Consumption Predictive Analysis', desc: 'LSTM decoder forecasts O₂ and power depletion curves over the remaining mission timeline, prompting early return warnings.' },
                  { name: 'ML Task Queue', desc: 'Priority-ordered task scheduler adapts dynamically to crew actions and incoming telemetry anomalies throughout the EVA.' },
                ].map(f => (
                  <li key={f.name} style={{ paddingBottom: '1rem', marginBottom: '1rem', borderBottom: '1px solid var(--color-border)' }}>
                    <strong style={{ fontFamily: 'var(--font-heading)', fontSize: '1rem', display: 'block', marginBottom: '.2rem' }}>{f.name}</strong>
                    <span style={{ color: 'var(--color-muted)', fontSize: '.9rem', lineHeight: '1.6' }}>{f.desc}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ===== SPACESUIT DISPLAY ===== */}
      <section id="suits-spacesuit" style={{ background: 'var(--color-bg-secondary)' }}>
        <div className="container">
          <div className="title-wrap mb-5" data-aos="fade-up">
            <h2 className="section-title">Spacesuit <b>Display</b></h2>
            <p className="section-sub-title">Distributed WMD + HMD interface keeping EVA crew informed without breaking situational awareness.</p>
          </div>
          <div className="mg-media-row reverse" data-aos="fade-up">
            <div className="mg-media-text">
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {[
                  { name: 'WMD + HMD Combination', desc: 'Input handled on the wrist display; context-rich overlays projected into the helmet visor — the two devices complement each other without redundancy.' },
                  { name: '2D / 3D Navigation Map', desc: 'Toggleable flat map and terrain-aware 3D view with full GeoPin overlay, route guidance, and crew location tracking.' },
                  { name: 'Procedure List', desc: 'Step-through NASA EVA checklist with AI-assisted completion confirmation — JARVIS flags missed or out-of-order steps.' },
                  { name: 'Biomed Data Display', desc: 'Heart rate, O₂ saturation, and suit pressure displayed at a glance; MedGemma flags readings outside nominal range with plain-language explanation.' },
                ].map(f => (
                  <li key={f.name} style={{ paddingBottom: '1rem', marginBottom: '1rem', borderBottom: '1px solid var(--color-border)' }}>
                    <strong style={{ fontFamily: 'var(--font-heading)', fontSize: '1rem', display: 'block', marginBottom: '.2rem' }}>{f.name}</strong>
                    <span style={{ color: 'var(--color-muted)', fontSize: '.9rem', lineHeight: '1.6' }}>{f.desc}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mg-media-img" data-aos="fade-left">
              <img loading="lazy" src="/software/Presentation_SUITS.webp" alt="JARVIS spacesuit interface presentation" />
            </div>
          </div>
        </div>
      </section>

      {/* ===== CONOPS ===== */}
      <section id="suits-conops">
        <div className="container">
          <div className="title-wrap mb-5 text-center" data-aos="fade-up">
            <h2 className="section-title">Mission <b>CONOPS</b></h2>
            <p className="section-sub-title">Five-phase concept of operations for a nominal JARVIS-assisted EVA.</p>
          </div>
          <div className="suits-conops-flow" data-aos="fade-up">

            <div className="suits-conops-step">
              <div className="suits-conops-num">1</div>
              <div className="suits-conops-label">PR Search</div>
              <div className="suits-conops-desc">Rover locates EVA crew via LTV triangulation and confirms suit telemetry links.</div>
            </div>

            <div className="suits-conops-arrow" aria-hidden="true">&#8594;</div>

            <div className="suits-conops-step">
              <div className="suits-conops-num">2</div>
              <div className="suits-conops-label">Egress</div>
              <div className="suits-conops-desc">Crew exits rover; JARVIS activates WMD/HMD interfaces and loads EVA task queue.</div>
            </div>

            <div className="suits-conops-arrow" aria-hidden="true">&#8594;</div>

            <div className="suits-conops-step">
              <div className="suits-conops-num">3</div>
              <div className="suits-conops-label">EV Navigation</div>
              <div className="suits-conops-desc">A* pathfinding guides crew across terrain; GeoPin markers logged at sample sites.</div>
            </div>

            <div className="suits-conops-arrow" aria-hidden="true">&#8594;</div>

            <div className="suits-conops-step">
              <div className="suits-conops-num">4</div>
              <div className="suits-conops-label">LTV Operations</div>
              <div className="suits-conops-desc">Rover console manages repairs, resource budgets, and obstacle-avoidance routing.</div>
            </div>

            <div className="suits-conops-arrow" aria-hidden="true">&#8594;</div>

            <div className="suits-conops-step">
              <div className="suits-conops-num">5</div>
              <div className="suits-conops-label">Ingress</div>
              <div className="suits-conops-desc">Crew returns; JARVIS logs EVA data and syncs mission state to ground control.</div>
            </div>

          </div>
        </div>
      </section>

      {/* ===== TESTING METHODOLOGY ===== */}
      <section id="suits-testing" style={{ background: 'var(--color-bg-dark)', padding: 'var(--section-pad) 0' }}>
        <div className="container">
          <div className="title-wrap mb-5 text-center" data-aos="fade-up">
            <h2 className="section-title" style={{ color: 'var(--color-text-light)' }}>
              HITL <b>Testing</b>
            </h2>
            <p className="section-sub-title" style={{ color: 'rgba(245,239,230,0.6)' }}>
              Human-in-the-Loop testing across five phases, following Scrum/Agile sprints from January through May.
            </p>
          </div>
          <div className="row justify-content-center" data-aos="fade-up">
            <div className="col-md-8">
              <ul className="suits-hitl-list">
                {[
                  { num: 1, text: <><strong>Unit Testing</strong> — Individual subsystem validation using sensor mocks and API stubs; each module verified in isolation before integration.</> },
                  { num: 2, text: <><strong>Integration Testing</strong> — LunarLink ↔ AI pipeline ↔ UI round-trip verification; data flows confirmed end-to-end across all three hardware interfaces.</> },
                  { num: 3, text: <><strong>Scrum Sprint User Testing</strong> — Purdue student volunteers role-play as EVA crew; sprint retrospectives drive interface iteration between sessions.</> },
                  { num: 4, text: <><strong>JSC Environment Simulation</strong> — Full hardware harness testing in a simulated lunar surface environment with mission-realistic task loads and time pressure.</> },
                  { num: 5, text: <><strong>Final JSC Validation</strong> — Live demonstration at NASA Johnson Space Center, Houston TX, evaluated by NASA engineers against the 2025 SUITS rubric.</> },
                ].map(p => (
                  <li key={p.num}>
                    <div className="suits-hitl-num">{p.num}</div>
                    <div className="suits-hitl-text">{p.text}</div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ===== OUTREACH ===== */}
      <section id="suits-outreach">
        <div className="container">
          <div className="title-wrap mb-5 text-center" data-aos="fade-up">
            <h2 className="section-title">Community <b>Outreach</b></h2>
            <p className="section-sub-title">JARVIS brings space tech into classrooms — from elementary school to university research fairs.</p>
          </div>
          <div className="row" data-aos="fade-up">
            {[
              { icon: 'fas fa-child', audience: 'Elementary', title: 'Purdue Elementary STEM Day', desc: 'Interactive spacesuit demo for K–5 students exploring life as an astronaut.' },
              { icon: 'fas fa-moon', audience: 'Middle School', title: 'West Lafayette Space Night', desc: 'Evening of lunar-surface simulations and Q&A with the JARVIS team for middle schoolers.' },
              { icon: 'fas fa-university', audience: 'Public', title: 'Purdue Open House', desc: 'Campus-wide showcase of JARVIS interfaces drawing students, faculty, and alumni.' },
              { icon: 'fas fa-flask', audience: 'Undergraduate', title: 'Undergraduate Research Fair', desc: "Presentation of JARVIS technical architecture at Purdue's annual research showcase." },
              { icon: 'fas fa-rocket', audience: 'High School', title: 'Astronautics Workshop', desc: 'Hands-on spacesuit UI workshop for local high school students interested in aerospace careers.' },
              { icon: 'fas fa-satellite', audience: 'All Ages', title: 'SEARCH Showcase', desc: "JARVIS featured in SEARCH's annual public event alongside all club programs and competitions." },
            ].map(ev => (
              <div key={ev.title} className="col-md-4 mb-4" data-aos="fade-up">
                <div className="shadow rounded feature-item p-4 h-100">
                  <div style={{ fontSize: '1.6rem', color: 'var(--color-accent)', marginBottom: '.6rem' }}>
                    <i className={ev.icon} aria-hidden="true" />
                  </div>
                  <span style={{ fontSize: '.72rem', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--color-accent)' }}>{ev.audience}</span>
                  <h5 style={{ fontFamily: 'var(--font-heading)', margin: '.35rem 0 .5rem' }}>{ev.title}</h5>
                  <p style={{ color: 'var(--color-muted)', fontSize: '.9rem', lineHeight: '1.6', margin: 0 }}>{ev.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== 2025-26 TEAM ROSTER ===== */}
      <section id="suits-team-2526" style={{ background: 'var(--color-bg-secondary)' }}>
        <div className="container">
          <div className="title-wrap mb-5 text-center" data-aos="fade-up">
            <h2 className="section-title">2025–26 <b>Team</b></h2>
            <p className="section-sub-title">26 members across engineering, computer science, and design disciplines.</p>
          </div>

          {/* Lead spotlight */}
          <div className="text-center mb-5" data-aos="fade-up">
            <div className="shadow rounded feature-item p-4 d-inline-block" style={{ maxWidth: 260 }}>
              <img loading="lazy" src="/software/Swastik_SUITS.webp" width="150px" className="officer-photo" alt="Swastik Patel" style={{ marginBottom: '1rem' }} />
              <h4>Swastik Patel</h4>
              <h5>Team Lead</h5>
              <p style={{ color: 'var(--color-muted)', fontSize: '.9rem' }}>Computer Information &amp; Technology</p>
            </div>
            <p style={{ color: 'var(--color-muted)', marginTop: '1rem', fontSize: '.9rem' }}>
              <strong>Faculty Advisor:</strong> Aniket Bera, Associate Professor of Computer Science
            </p>
          </div>

          {/* Roster grid — known members; remaining names to be confirmed from proposal PDF */}
          <div className="suits-roster-grid" data-aos="fade-up">
            {[
              { name: 'Swastik Patel', major: 'Computer Information & Technology — Lead' },
              { name: 'Gurmehar Singh', major: 'Computer Science & Mathematics' },
              { name: 'Hrishikesh Viswanath', major: 'PhD, Computer Science' },
              { name: 'Rodrigo Schmitt', major: 'PhD, Aeronautics and Astronautics' },
              { name: 'Jason Fotso-Puepi', major: 'PhD, Computer Science' },
              { name: 'Dipam Patel', major: 'PhD, Computer Science' },
              /* TODO: add remaining ~20 members from the 2025-26 proposal PDF */
            ].map(m => (
              <div key={m.name} className="roster-entry">
                <strong>{m.name}</strong>
                {m.major}
              </div>
            ))}
          </div>
          <p style={{ color: 'var(--color-muted)', fontSize: '.8rem', marginTop: '1.5rem', fontStyle: 'italic' }} data-aos="fade-up">
            Full 26-member roster — confirm remaining names from the 2025-26 proposal document before deploying.
          </p>
        </div>
      </section>

      {/* ===== 2024 TEAM (HISTORICAL) ===== */}
      <section id="suits-team-2024">
        <div className="container">
          <div className="title-wrap mb-5 text-center" data-aos="fade-up">
            <h2 className="section-title">JARVIS 2024 — <b>Competition Team</b></h2>
            <p className="section-sub-title">The team that took JARVIS to NASA Johnson Space Center for the 2023–24 SUITS challenge.</p>
          </div>

          {/* Photo cards */}
          <div className="row justify-content-center" data-aos="fade-up">
            {[
              { name: 'Gurmehar Singh',       role: 'Team Lead',              major: 'Computer Science & Mathematics',       img: '/officers/singh.webp' },
              { name: 'Mihir Patil',          role: 'Software Engineer',      major: 'Computer Science',                     img: '/software/2023_24/SUITS/patil.jpeg' },
              { name: 'Vinitha Marupeddi',    role: 'UI/UX Designer',         major: 'Computer Science',                     img: '/software/2023_24/SUITS/marupeddi.jpeg' },
              { name: 'Dipam Patel',          role: 'AI Engineer',            major: 'PhD, Computer Science',                img: '/software/2023_24/SUITS/patel.jpeg' },
              { name: 'Hrishikesh Viswanath', role: 'Systems Engineer',       major: 'PhD, Computer Science',                img: '/officers/viswanath.webp' },
              { name: 'Jason Fotso-Puepi',    role: 'Backend Developer',      major: 'PhD, Computer Science',                img: '/software/2023_24/SUITS/puepi.jpeg' },
            ].map(m => (
              <div key={m.name} className="col-md-4 col-sm-6 mb-4 text-center" data-aos="fade-up">
                <div className="shadow rounded feature-item p-4">
                  <img
                    loading="lazy"
                    src={m.img}
                    alt={m.name}
                    className="officer-photo"
                    style={{ marginBottom: '1rem' }}
                  />
                  <h5 style={{ fontFamily: 'var(--font-heading)', marginBottom: '.2rem' }}>{m.name}</h5>
                  <p style={{ color: 'var(--color-accent)', fontWeight: 600, fontSize: '.85rem', margin: '0 0 .25rem' }}>{m.role}</p>
                  <p style={{ color: 'var(--color-muted)', fontSize: '.82rem', margin: 0 }}>{m.major}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Full member list */}
          <div data-aos="fade-up" style={{ marginTop: '2rem', padding: '1.5rem', background: 'var(--color-bg-secondary)', borderRadius: 10 }}>
            <h5 style={{ fontFamily: 'var(--font-heading)', marginBottom: '1rem' }}>Full 2023–24 Team</h5>
            <p style={{ color: 'var(--color-muted)', lineHeight: '2', fontSize: '.9rem' }}>
              Gurmehar Singh, Mihir Patil, Vinitha Marupeddi, Dipam Patel, Hrishikesh Viswanath, Jason Fotso-Puepi,
              as well as all contributing SEARCH members who supported development, testing, and outreach throughout the 2023–24 academic year.
            </p>
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

export default Suits;
