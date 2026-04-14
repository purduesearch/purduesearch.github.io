import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const Software = () => {
  useEffect(() => {
    if (window.AOS) window.AOS.init({ once: true });
  }, []);

  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = '/software/Meeting_SUITS.webp';
    document.head.appendChild(link);
    return () => { if (document.head.contains(link)) document.head.removeChild(link); };
  }, []);

  return (
    <div>
      <title>SUITS Software | Purdue SEARCH</title>
      <meta name="description" content="Purdue SEARCH's software team builds augmented-reality interfaces for NASA's SUITS challenge, tested at Johnson Space Center." />
      <Navbar />

      {/* ===== HERO ===== */}
      <div
        id="main-content"
        className="jumbotron jumbotron-single d-flex align-items-center"
        style={{ backgroundImage: 'url(/software/Meeting_SUITS.webp)' }}
      >
        <div className="container text-center">
          <h1 className="display-2 mb-4">SUITS Software</h1>
          <p className="header-sub-title" style={{ fontWeight: 'bold', fontSize: '120%' }}>
            Building augmented-reality interfaces for NASA's Spacesuit User Interface Technologies
            for Students (SUITS) challenge — and testing them at Johnson Space Center.
          </p>
        </div>
      </div>

      {/* ===== THE CHALLENGE ===== */}
      <section id="suits-challenge">
        <div className="container">
          <div className="title-wrap mb-5" data-aos="fade-up">
            <h2 className="section-title">The <b>NASA SUITS Challenge</b></h2>
            <p className="section-sub-title">
              SUITS tasks student teams with designing and prototyping AR interfaces for use inside
              a spacesuit — then testing them at Johnson Space Center.
            </p>
          </div>
          <div className="mg-media-row" data-aos="fade-up">
            <div className="mg-media-text">
              <span className="about-section-label">AR + HoloLens</span>
              <h3 style={{ fontFamily: 'var(--font-heading)', marginBottom: '1rem' }}>
                Designing for the Suit
              </h3>
              <p style={{ color: 'var(--color-muted)', lineHeight: '1.8' }}>
                NASA SUITS challenges teams to create augmented-reality display interfaces for
                astronauts performing extravehicular activities. SEARCH's software team built an
                AR HUD providing real-time telemetry — suit pressure, O₂ levels, navigation waypoints,
                and task checklists — displayed inside a Microsoft HoloLens headset.
              </p>
              <p style={{ color: 'var(--color-muted)', lineHeight: '1.8' }}>
                The interface was designed around human factors principles: minimizing cognitive
                load during EVA tasks while keeping critical data immediately accessible. Iterative
                user testing with SEARCH members informed layout, color coding, and alert thresholds.
              </p>
            </div>
            <div className="mg-media-img" data-aos="fade-left">
              <img loading="lazy" src="/software/Swastik_SUITS.webp" alt="NASA SUITS AR Interface" />
            </div>
          </div>
        </div>
      </section>

      {/* ===== WINS & RESULTS ===== */}
      <section id="suits-wins" style={{ background: 'var(--color-bg-dark)', padding: 'var(--section-pad) 0' }}>
        <div className="container">
          <div className="title-wrap mb-5 text-center" data-aos="fade-up">
            <h2 className="section-title" style={{ color: 'var(--color-text-light)' }}>
              Results &amp; <b>Recognition</b>
            </h2>
            <p className="section-sub-title" style={{ color: 'rgba(245,239,230,0.6)' }}>
              Competing against top universities at Johnson Space Center.
            </p>
          </div>
          <div className="suits-wins-grid" data-aos="fade-up">
            <div style={{ borderRadius: '10px', overflow: 'hidden' }}>
              <img loading="lazy" src="/software/Data_Monitors_Suits.webp" alt="SUITS Data Monitors" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <div style={{ borderRadius: '10px', overflow: 'hidden' }}>
              <img loading="lazy" src="/software/Win_Photo_Suits.webp" alt="SUITS Competition Win" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          </div>
          <div className="row mt-5">
            <div className="col-lg-8 offset-lg-2 text-center" data-aos="fade-up">
              <p style={{ color: 'rgba(245,239,230,0.75)', lineHeight: '1.8' }}>
                SEARCH competed in the NASA SUITS challenge at Johnson Space Center, presenting
                our AR interface to NASA evaluators and space industry professionals. The team's
                work was recognized for its user-centered design approach and technical execution.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== CONFERENCE PRESENTATION ===== */}
      <section id="suits-conference">
        <div className="container">
          <div className="title-wrap mb-5" data-aos="fade-up">
            <h2 className="section-title">Presenting <b>Our Work</b></h2>
            <p className="section-sub-title">
              SEARCH members share their findings at conferences and internal review sessions,
              building communication skills alongside technical expertise.
            </p>
          </div>
          <div className="mg-media-row reverse" data-aos="fade-up">
            <div className="mg-media-text">
              <span className="about-section-label">Johnson Space Center</span>
              <h3 style={{ fontFamily: 'var(--font-heading)', marginBottom: '1rem' }}>
                Presenting to NASA Evaluators
              </h3>
              <p style={{ color: 'var(--color-muted)', lineHeight: '1.8' }}>
                Final presentations at JSC placed SEARCH members in front of NASA engineers,
                astronauts, and industry partners. Each team delivered a technical walkthrough
                of their interface design, implementation choices, and lessons learned from
                field testing.
              </p>
              <p style={{ color: 'var(--color-muted)', lineHeight: '1.8' }}>
                The experience of defending design decisions under technical scrutiny — and
                receiving feedback from active space program professionals — is one of the most
                valuable outcomes of the SUITS competition.
              </p>
            </div>
            <div className="mg-media-img" data-aos="fade-right">
              <img loading="lazy" src="/software/Presentation_SUITS.webp" alt="SUITS Conference Presentation" />
            </div>
          </div>
        </div>
      </section>

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

      {/* ===== 2025-26 CHALLENGE OVERVIEW ===== */}
      <section id="suits-overview-2526">
        <div className="container">
          <div className="title-wrap mb-5" data-aos="fade-up">
            <h2 className="section-title">2025–26 <b>Challenge</b></h2>
          </div>
          <div data-aos="fade-up" style={{ color: 'var(--color-muted)', lineHeight: '1.8' }}>
            <img loading="lazy" className="float-left" src="/software/2023_24/SUITS/teams.webp" alt="SUITS Teams" style={{ maxWidth: 320, borderRadius: 10, marginRight: '1.5rem', marginBottom: '1rem' }} />
            <p>
              <i>"NASA Spacesuit User Interface Technologies for Students (NASA SUITS) is a design challenge in which college students from across the country help
              design user interface solutions for future spaceflight needs."</i>
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

      {/* ===== 2025-26 JARVIS ARCHITECTURE ===== */}
      <section id="suits-arch-2526">
        <div className="container">
          <div className="title-wrap mb-2" data-aos="fade-up">
            <h2 className="section-title">2025–26 JARVIS <b>System</b></h2>
            <p className="section-sub-title">A full-stack mission interface: AI reasoning, real-time telemetry, and multi-device hardware.</p>
          </div>
        </div>

        {/* AI Architecture */}
        <div className="container" style={{ paddingTop: '2rem' }}>
          <div className="mg-media-row" data-aos="fade-up">
            <div className="mg-media-text">
              <span className="about-section-label">Artificial Intelligence</span>
              <h3 style={{ fontFamily: 'var(--font-heading)', marginBottom: '1rem' }}>On-Device AI for Mission-Critical Decisions</h3>
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
                <li><strong>Gemma3n LLM</strong> — conversational mission assistant with on-device inference</li>
                <li><strong>MedGemma</strong> — biomedical query answering for crew health monitoring</li>
                <li><strong>RAG Pipeline</strong> — retrieves exact NASA procedure documents for cited answers</li>
                <li><strong>RLHF Fine-tuning</strong> — mission-specialist alignment shaped by expert feedback</li>
                <li><strong>openWakeWord</strong> — passive "Hey JARVIS" activation; hands-free in EVA gloves</li>
              </ul>
            </div>
            <div className="mg-media-img" data-aos="fade-left">
              <img loading="lazy" src="/software/Meeting_SUITS.webp" alt="JARVIS team developing AI systems" />
            </div>
          </div>
        </div>

        {/* Hardware Platform */}
        <div style={{ background: 'var(--color-bg-secondary)', padding: '3rem 0', marginTop: '2rem' }}>
          <div className="container">
            <div className="title-wrap mb-4 text-center" data-aos="fade-up">
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.6rem' }}>Hardware <b>Platform</b></h3>
              <p style={{ color: 'var(--color-muted)' }}>Three interfaces — one for every mission role.</p>
            </div>
            <div className="row text-center" data-aos="fade-up">
              {[
                { icon: 'fas fa-hand-paper', title: 'WMD', sub: 'Wrist Mounted Display', desc: 'Primary spacesuit interface worn on the forearm. One-handed navigation through EVA checklists, map waypoints, and crew status — operable with pressurized gloves.' },
                { icon: 'fas fa-vr-cardboard', title: 'HMD', sub: 'Head Mounted Display', desc: 'Visor overlay projecting navigational map, procedural steps, and biomed alerts directly into the astronaut\'s field of view.' },
                { icon: 'fas fa-gamepad', title: 'Rover Console', sub: 'Pressurized Rover Interface', desc: 'Ferrari racing wheel + Xbox controller + Apple Vision Pro for immersive pressurized-rover operations with full dashboard UI.' },
              ].map(hw => (
                <div key={hw.title} className="col-md-4 mb-4">
                  <div className="shadow rounded feature-item p-4">
                    <div style={{ fontSize: '2rem', color: 'var(--color-accent)', marginBottom: '0.75rem' }}><i className={hw.icon} aria-hidden="true" /></div>
                    <h4>{hw.title}</h4>
                    <h6 style={{ color: 'var(--color-muted)', marginBottom: '.75rem' }}>{hw.sub}</h6>
                    <p style={{ color: 'var(--color-muted)', fontSize: '.9rem' }}>{hw.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* LunarLink */}
        <div className="container" style={{ paddingTop: '2.5rem' }}>
          <div data-aos="fade-up" style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
            <span className="about-section-label">Communications</span>
            <h3 style={{ fontFamily: 'var(--font-heading)', marginBottom: '1rem' }}>LunarLink</h3>
            <p style={{ color: 'var(--color-muted)', lineHeight: '1.8' }}>
              LunarLink is JARVIS's HTTP GET/POST middleware that translates the NASA Telemetry Sharing System (TSS) API stream into structured JSON,
              keeping mission-critical data synchronized across all connected devices in real time.
            </p>
          </div>
        </div>
      </section>

      {/* ===== COMMON FEATURES ===== */}
      <section id="suits-common-2526" style={{ background: 'var(--color-bg-secondary)' }}>
        <div className="container">
          <div className="title-wrap mb-5 text-center" data-aos="fade-up">
            <h2 className="section-title">Common <b>Features</b></h2>
            <p className="section-sub-title">Capabilities shared across all JARVIS interfaces — WMD, HMD, and rover console.</p>
          </div>
          <div className="row" data-aos="fade-up">
            {[
              { icon: 'fas fa-map-marker-alt', title: 'GeoPin System', desc: 'Drop persistent geolocation markers on the EVA map to tag rock samples, equipment caches, hazard zones, and points of interest.' },
              { icon: 'fas fa-ruler-combined', title: 'Maximum Range Predictor', desc: 'Ellipse-model algorithm with terrain-factor correction computes the safe turnaround distance from base, accounting for slope, suit power, and O₂ budget.' },
              { icon: 'fas fa-route', title: 'A* Navigation', desc: 'Elevation-cost A* pathfinding automatically routes EVAs around craters, steep slopes, and LiDAR-flagged obstacles.' },
            ].map(f => (
              <div key={f.title} className="col-md-4 mb-4">
                <div className="shadow rounded feature-item p-4 h-100" data-aos="fade-up">
                  <div style={{ fontSize: '1.75rem', color: 'var(--color-accent)', marginBottom: '.75rem' }}><i className={f.icon} aria-hidden="true" /></div>
                  <h5 style={{ fontFamily: 'var(--font-heading)' }}>{f.title}</h5>
                  <p style={{ color: 'var(--color-muted)', fontSize: '.9rem', lineHeight: '1.7' }}>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="row justify-content-center" data-aos="fade-up">
            {[
              { icon: 'fas fa-exclamation-triangle', title: 'Caution & Warning AI', desc: 'Real-time anomaly detection across biomed and suit telemetry streams. MedGemma classifies severity and recommends immediate crew action.' },
              { icon: 'fas fa-robot', title: 'JARVIS Assistant', desc: 'Voice and text conversational interface backed by Gemma3n + RAG. Ask mission questions, get procedure steps, or request a status summary — hands-free.' },
            ].map(f => (
              <div key={f.title} className="col-md-4 mb-4">
                <div className="shadow rounded feature-item p-4 h-100" data-aos="fade-up">
                  <div style={{ fontSize: '1.75rem', color: 'var(--color-accent)', marginBottom: '.75rem' }}><i className={f.icon} aria-hidden="true" /></div>
                  <h5 style={{ fontFamily: 'var(--font-heading)' }}>{f.title}</h5>
                  <p style={{ color: 'var(--color-muted)', fontSize: '.9rem', lineHeight: '1.7' }}>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== PRESSURIZED ROVER INTERFACE ===== */}
      <section id="suits-rover-2526">
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
                  { name: 'UI Display', desc: 'Dark-themed dashboard aggregating system states, alert feeds, LLM chat panel, and live minimap.' },
                  { name: 'Minimap + LTV Triangulation', desc: 'Perpendicular-bisector geometry locates a lost LTV from two EVA crew bearing readings.' },
                  { name: 'DUST Pathfinding', desc: 'Discrete simulation of lunar terrain traversal generates the optimal rover route before committing.' },
                  { name: 'Obstacle Detection', desc: 'LiDAR point-cloud scanning flags boulders and regolith hazards along the planned path.' },
                  { name: 'Resource Consumption Predictive Analysis', desc: 'LSTM decoder forecasts O₂ and power depletion curves over the remaining mission timeline.' },
                  { name: 'ML Task Queue', desc: 'Priority-ordered task scheduler adapts dynamically to crew actions and incoming telemetry anomalies.' },
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
      <section id="suits-spacesuit-2526" style={{ background: 'var(--color-bg-secondary)' }}>
        <div className="container">
          <div className="title-wrap mb-5" data-aos="fade-up">
            <h2 className="section-title">Spacesuit <b>Display</b></h2>
            <p className="section-sub-title">Distributed WMD + HMD interface keeping EVA crew informed without breaking situational awareness.</p>
          </div>
          <div className="mg-media-row reverse" data-aos="fade-up">
            <div className="mg-media-text">
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {[
                  { name: 'WMD + HMD Combination', desc: 'Input on the wrist display; context-rich overlays projected into the helmet visor — the two devices complement each other without redundancy.' },
                  { name: '2D / 3D Navigation Map', desc: 'Toggleable flat map and terrain-aware 3D view with full GeoPin overlay, route guidance, and crew location tracking.' },
                  { name: 'Procedure List', desc: 'Step-through NASA EVA checklist with AI-assisted completion confirmation — JARVIS flags missed or out-of-order steps.' },
                  { name: 'Biomed Data Display', desc: 'Heart rate, O₂ saturation, and suit pressure displayed at a glance; MedGemma flags readings outside nominal range.' },
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
      <section id="suits-conops-2526">
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
      <section id="suits-testing-2526" style={{ background: 'var(--color-bg-dark)', padding: 'var(--section-pad) 0' }}>
        <div className="container">
          <div className="title-wrap mb-5 text-center" data-aos="fade-up">
            <h2 className="section-title" style={{ color: 'var(--color-text-light)' }}>HITL <b>Testing</b></h2>
            <p className="section-sub-title" style={{ color: 'rgba(245,239,230,0.6)' }}>
              Human-in-the-Loop testing across five phases, following Scrum/Agile sprints from January through May.
            </p>
          </div>
          <div className="row justify-content-center" data-aos="fade-up">
            <div className="col-md-8">
              <ul className="suits-hitl-list">
                {[
                  { n: 1, label: 'Unit Testing', desc: 'Individual subsystem validation using sensor mocks and API stubs; each module verified in isolation before integration.' },
                  { n: 2, label: 'Integration Testing', desc: 'LunarLink ↔ AI pipeline ↔ UI round-trip verification; data flows confirmed end-to-end across all three hardware interfaces.' },
                  { n: 3, label: 'Scrum Sprint User Testing', desc: 'Purdue student volunteers role-play as EVA crew; sprint retrospectives drive interface iteration between sessions.' },
                  { n: 4, label: 'JSC Environment Simulation', desc: 'Full hardware harness testing in a simulated lunar surface environment with mission-realistic task loads.' },
                  { n: 5, label: 'Final JSC Validation', desc: 'Live demonstration at NASA Johnson Space Center, Houston TX, evaluated by NASA engineers against the 2025 SUITS rubric.' },
                ].map(p => (
                  <li key={p.n}>
                    <div className="suits-hitl-num">{p.n}</div>
                    <div className="suits-hitl-text"><strong>{p.label}</strong> — {p.desc}</div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ===== OUTREACH ===== */}
      <section id="suits-outreach-2526">
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
                  <div style={{ fontSize: '1.6rem', color: 'var(--color-accent)', marginBottom: '.6rem' }}><i className={ev.icon} aria-hidden="true" /></div>
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
      <section id="suits-team-2526-main" style={{ background: 'var(--color-bg-secondary)' }}>
        <div className="container">
          <div className="title-wrap mb-5 text-center" data-aos="fade-up">
            <h2 className="section-title">2025–26 <b>Team</b></h2>
            <p className="section-sub-title">26 members across engineering, computer science, and design disciplines.</p>
          </div>
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
          <div className="text-center mt-4" data-aos="fade-up">
            <Link to="/software/suits" className="btn-slide">
              <span>Full 2025–26 Technical Details</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ===== JARVIS 2024 — JSC FINALS ===== */}
      <section id="suits-2024-main">
        <div className="container">
          <div className="title-wrap mb-4" data-aos="fade-up">
            <h2 className="section-title">JARVIS 2024 — <b>JSC Finals</b></h2>
            <p className="section-sub-title">
              Purdue JARVIS was named one of 11 national finalists and competed at NASA's Johnson Space Center in Houston, TX.
            </p>
          </div>
          <div data-aos="fade-up" style={{ textAlign: 'center' }}>
            <iframe
              width="75%"
              height={460}
              style={{ display: 'inline-block', borderRadius: 10 }}
              src="https://www.youtube.com/embed/nD3Otpz2MaY?si=522m0iHku5-9g_Nh"
              title="JARVIS NASA SUITS 2024"
              frameBorder={0}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
          <p style={{ color: 'var(--color-muted)', marginTop: '1.5rem', lineHeight: '1.8' }} data-aos="fade-up">
            "The ability to contribute to work related to the Artemis missions is a dream come true for me and anyone who imagined humans living elsewhere besides Earth,"
            said Gurmehar Singh, the 2024 team lead. Associate Professor Aniket Bera served as faculty advisor: "I am incredibly proud of our students for advancing to
            the finals in NASA SUITS."
          </p>
        </div>
      </section>

      {/* ===== JARVIS 2024 — COMPETITION TEAM ===== */}
      <section id="suits-team-2024" style={{ background: 'var(--color-bg-secondary)' }}>
        <div className="container">
          <div className="title-wrap mb-5 text-center" data-aos="fade-up">
            <h2 className="section-title">JARVIS 2024 — <b>Competition Team</b></h2>
          </div>
          <div className="row" style={{ top: 25 }}>
            <div className="col-md-10 offset-md-1 features-holder" style={{ top: 25 }}>
              <div className="row" style={{ top: 25 }}>
                <div className="col-md-4 col-sm-12 text-center mt-4">
                  <div className="shadow rounded feature-item p-4 mb-4" data-aos="fade-up">
                    <div className="my-4"><img loading="lazy" src="/officers/singh.webp" width="150px" className="officer-photo" alt="Gurmehar Singh" /></div>
                    <h4>Gurmehar Singh</h4><h5>SUITS Lead</h5><p>Computer Science</p>
                  </div>
                  <div className="shadow rounded feature-item p-4 mb-4" data-aos="fade-up">
                    <div className="my-4"><img loading="lazy" src="/software/2023_24/SUITS/patil.webp" width="150px" className="officer-photo" alt="Mihir Patil" /></div>
                    <h4>Mihir Patil</h4><h5>Hardware Interfaces</h5><p>Computer Science</p>
                  </div>
                </div>
                <div className="col-md-4 col-sm-12 text-center">
                  <div className="shadow rounded feature-item p-4 mb-4" data-aos="fade-up">
                    <div className="my-4"><img loading="lazy" src="/software/2023_24/SUITS/marupeddi.webp" width="150px" className="officer-photo" alt="Vinitha Marupeddi" /></div>
                    <h4>Vinitha Marupeddi</h4><h5>Communications</h5><p>Computer Science</p>
                  </div>
                  <div className="shadow rounded feature-item p-4 mb-4" data-aos="fade-up">
                    <div className="my-4"><img loading="lazy" src="/software/2023_24/SUITS/patel.jpeg" width="150px" className="officer-photo" alt="Dipam Patel" /></div>
                    <h4>Dipam Patel</h4><h5>Unity UI</h5><p>Computer Science</p>
                  </div>
                </div>
                <div className="col-md-4 col-sm-12 text-center mt-4">
                  <div className="shadow rounded feature-item p-4 mb-4" data-aos="fade-up">
                    <div className="my-4"><img loading="lazy" src="/officers/viswanath.webp" width="150px" className="officer-photo" alt="Hrishikesh Viswanath" /></div>
                    <h4>Hrishikesh Viswanath</h4><h5>UI and Design</h5><p>Computer Science</p>
                  </div>
                  <div className="shadow rounded feature-item p-4 mb-4" data-aos="fade-up">
                    <div className="my-4"><img loading="lazy" src="/software/2023_24/SUITS/puepi.webp" width="150px" className="officer-photo" alt="Jason Fotso-Puepi" /></div>
                    <h4>Jason Fotso-Puepi</h4><h5>Mentor</h5><p>Computer Science</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div style={{ marginTop: '1.5rem', color: 'var(--color-muted)', lineHeight: '1.9' }} data-aos="fade-up">
            <strong>Full 2024 JARVIS Team Members</strong><br />
            Gurmehar Singh (Computer Science &amp; Mathematics) — Team Lead<br />
            Sharvari Deshpande (First-year Engineering)<br />
            Benjamin Emini (Computer Science)<br />
            Paul Greenberg (Math &amp; Physics)<br />
            Michel Ladekan (Aeronautical Engineering Technology)<br />
            Michael Li (Computer Science, Marketing)<br />
            Chawin Mingsuwan (Game Development &amp; Visual Effects)<br />
            Swastik Patel (Computer Information &amp; Technology)<br />
            Mihir Patil (Computer Science)<br />
            Rodrigo Schmitt (PhD, Aeronautics and Astronautics)<br />
            Hrishikesh Viswanath (PhD, Computer Science)<br />
            Madeline Willey (Electrical and Computer Engineering)<br />
            Peter Zakariya (Computer Science &amp; Data Science)<br />
            Jason Alexander Fotso-Puepi (PhD, Computer Science)<br />
            Dipam Patel (PhD, Computer Science)<br />
            Vinitha Marupeddi (MS, Computer Science)<br />
            Ilina Adhikari (Mechanical Engineering)<br />
            Nathanael Herman (Computer Science and Creative Writing)<br />
            Faculty Advisor: Aniket Bera, Associate Professor of Computer Science
          </div>
          <div className="text-center mt-5" data-aos="fade-up">
            <Link to="/software/suits" className="btn-slide">
              <span>See the 2025–26 JARVIS System</span>
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Software;
