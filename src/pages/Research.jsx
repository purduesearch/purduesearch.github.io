import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import STLViewer from '../components/STLViewer';

gsap.registerPlugin(ScrollTrigger);

const PROFESSIONALS = [
  {
    name: 'Dr. Marshall Porterfield',
    title: 'Professor, Biological Engineering & Space Biophysics',
    photo: '/research/Porterfield_Mugshot.webp',
    linkedin: 'https://www.linkedin.com/in/d-marshall-porterfield-b19a1929/',
  },
  {
    name: 'Dr. Richard Barker',
    title: 'Research Scientist, Plant Space Biology',
    photo: '/research/Barker_Mugshot.webp',
    hoverPhoto: '/research/Barker_Breakdown.gif',
    linkedin: 'https://www.linkedin.com/in/richard-barker-40b90530/',
  },
  {
    name: 'Manisha Dagar',
    title: 'Research Collaborator, Controlled-Environment Agriculture',
    photo: '/research/Manisha_Mugshot.webp',
    linkedin: 'https://www.linkedin.com/in/manishadagar/',
  },
];

const SUBGROUPS = [
  {
    icon: 'fas fa-microchip',
    name: 'Interfacing',
    share: '40%',
    color: 'var(--color-accent)',
    description: 'Designs and implements the sensor network, automated control systems, and data pipelines that keep the chamber running autonomously.',
    skills: ['Arduino C++', 'MATLAB', 'AI / ML', 'Sensor Integration', 'Control Systems'],
  },
  {
    icon: 'fas fa-seedling',
    name: 'ABE',
    share: '40%',
    color: '#4a7c3f',
    description: 'Conducts biological experiments, substrate trials, and growth analysis — translating plant science into actionable chamber parameters.',
    skills: ['Plant Biology', 'Lab Protocols', 'MATLAB', 'Excel / Data', 'Statistical Analysis'],
  },
  {
    icon: 'fas fa-drafting-compass',
    name: 'Rapid Prototyping',
    share: '20%',
    color: '#7c5d4a',
    description: 'Designs, fabricates, and iterates on all physical hardware — from the chamber shell to mounting brackets and fluid routing.',
    skills: ['CAD (SolidWorks)', '3D Printing', 'Laser Cutting', 'Materials Selection', 'Tolerancing'],
  },
];

const PHASES = [
  {
    num: '01',
    title: 'Requirements & Design',
    deliverables: [
      '1.1 — System requirements document',
      '1.2 — Conceptual design drawings (PDR / CDR)',
      '1.3 — Risk register and mitigation plan',
    ],
  },
  {
    num: '02',
    title: 'Prototype Development',
    deliverables: [
      '2.1 — Chamber structural prototype',
      '2.2 — Sensor integration (pH, DO, temp, humidity, CO₂)',
      '2.3 — LED lighting subsystem',
      '2.4 — Control software v1',
    ],
  },
  {
    num: '03',
    title: 'Testing & Optimization',
    deliverables: [
      '3.1 — Growth trials (yield, germination rate)',
      '3.2 — Closed-loop PID controller validation',
      '3.3 — Computer vision pipeline integration',
    ],
  },
  {
    num: '04',
    title: 'Flight Qualification',
    deliverables: [
      '4.1 — Materials compatibility (NASA-STD-6001)',
      '4.2 — Vibration and thermal-vacuum testing',
      '4.3 — Power consumption and mass report',
    ],
  },
  {
    num: '05',
    title: 'Documentation & Outreach',
    deliverables: [
      '5.1 — ICES 2025 conference paper',
      '5.2 — Final technical report',
      '5.3 — STEM outreach events',
      '5.4 — Open-source GitHub release',
    ],
  },
];

const TECH_FEATURES = [
  {
    icon: 'fas fa-thermometer-half',
    title: 'Environmental Sensors',
    body: 'pH, dissolved oxygen (DO), relative humidity, temperature, and CO₂ sensors provide continuous telemetry. All data streams into a unified MATLAB dashboard with alert thresholds.',
  },
  {
    icon: 'fas fa-lightbulb',
    title: 'LED Lighting System',
    body: 'Tunable-spectrum LEDs (red 660 nm, blue 450 nm) target photosynthetic absorption peaks. Photoperiod and intensity are adjusted per growth phase to maximize biomass and nutrient density.',
  },
  {
    icon: 'fas fa-eye',
    title: 'Computer Vision',
    body: 'Overhead cameras feed a real-time CV pipeline. Algorithms track leaf area index (LAI), detect germination events, and flag anomalies (yellowing, mold, stunted growth) automatically.',
  },
  {
    icon: 'fas fa-sync-alt',
    title: 'Closed-Loop Control',
    body: 'PID controllers regulate temperature, humidity, CO₂ concentration, and nutrient delivery rate. Machine-learning refinements reduce steady-state error across extended growth campaigns.',
  },
  {
    icon: 'fas fa-chart-line',
    title: 'Predictive Analytics',
    body: 'A dashboard forecasts harvest yield, water consumption, and power usage over the remaining mission timeline. Early-warning alerts flag resource shortfalls before they impact crew nutrition.',
  },
];

const REFERENCES = [
  {
    authors: 'Amitrano, C. et al.',
    year: '2023',
    title: 'Plant Growth in Microgravity: Physiological Challenges and Adaptive Strategies',
    journal: 'Frontiers in Plant Science',
  },
  {
    authors: 'Wright, G. et al.',
    year: '2023',
    title: 'LED Spectral Optimization for Microgreen Photosynthetic Efficiency',
    journal: 'HortScience',
  },
  {
    authors: 'Pannico, A. et al.',
    year: '2022',
    title: 'Substrate Selection and Root-Zone Management for Space Hydroponics',
    journal: 'Life Sciences in Space Research',
  },
  {
    authors: 'Kernbach, S. et al.',
    year: '2024',
    title: 'IoT Automation Frameworks for Autonomous Biological Growth Chambers',
    journal: 'Acta Astronautica',
  },
  {
    authors: 'Ragany, A. et al.',
    year: '2023',
    title: 'Nutritional Profile of Microgreens Cultivated in Low-Earth Orbit Analog Conditions',
    journal: 'NPJ Microgravity',
  },
  {
    authors: 'Moura, D. et al.',
    year: '2024',
    title: 'Computer Vision for Real-Time Plant Health Monitoring in Closed-Loop Systems',
    journal: 'Computers and Electronics in Agriculture',
  },
  {
    authors: 'Taşcı Durgut, R. et al.',
    year: '2025',
    title: 'Microgreen Production Systems for Long-Duration Spaceflight',
    journal: 'Advances in Space Research',
  },
  {
    authors: 'Rocamora-Osorio, A. et al.',
    year: '2025',
    title: 'Closed-Loop Nutrient Management for Bioregenerative Life Support',
    journal: 'Life Sciences in Space Research',
  },
  {
    authors: 'Liu, Y. et al.',
    year: '2025',
    title: 'Machine Learning for Predictive Crop Yield Analysis in Controlled Environments',
    journal: 'Computers and Electronics in Agriculture',
  },
  {
    authors: 'Śniadek, P. et al.',
    year: '2025',
    title: 'Biomedical Applications of Microgreens for Long-Duration Mission Crew Health',
    journal: 'Aerospace Medicine and Human Performance',
  },
];

const Research = () => {
  const rootRailRef = useRef(null);

  useEffect(() => {
    if (window.AOS) window.AOS.init({ once: true });
  }, []);

  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = '/research/Research_Hero.webp';
    document.head.appendChild(link);
    return () => { if (document.head.contains(link)) document.head.removeChild(link); };
  }, []);

  // GSAP ScrollTrigger — plant root path draws as user scrolls through section
  useEffect(() => {
    const rail = rootRailRef.current;
    if (!rail) return;
    const path = rail.querySelector('.root-path');
    if (!path) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      path.style.strokeDashoffset = '0';
      return;
    }

    const wrapper = rail.closest('.plant-root-wrapper');
    if (!wrapper) return;

    path.style.strokeDashoffset = '2000';

    const st = gsap.to(path, {
      strokeDashoffset: 0,
      ease: 'none',
      scrollTrigger: {
        trigger: wrapper,
        start: 'top 80%',
        end: 'bottom 20%',
        scrub: true,
      },
    });

    return () => {
      if (st.scrollTrigger) st.scrollTrigger.kill();
    };
  }, []);

  return (
    <div>
      <title>Microgreen Research | Purdue SEARCH</title>
      <meta name="description" content="Purdue SEARCH is designing and testing a microgreen growth chamber for NASA's LEAF initiative, providing astronauts with a compact, nutrient-dense food source for long-duration missions." />
      <Navbar />

      {/* ===== HERO ===== */}
      <div
        id="main-content"
        className="jumbotron jumbotron-single d-flex align-items-center"
        style={{ backgroundImage: 'url(/research/Research_Hero.webp)' }}
      >
        <div className="container text-center">
          <h1 className="display-2 mb-4">Microgreen Microwaves</h1>
          <p className="header-sub-title" style={{ fontWeight: 'bold', fontSize: '120%' }}>
            Designing, building, and qualifying a microgreen growth chamber for NASA's LEAF initiative —
            providing astronauts on long-duration missions with a rapid, nutrient-dense food source that
            uses minimal resources.
          </p>
        </div>
      </div>

      {/* ===== MISSION BACKGROUND ===== */}
      <section id="mg-background" style={{ background: 'var(--color-bg-dark)', padding: '5rem 0' }}>
        <div className="container">
          <div className="title-wrap mb-5 text-center" data-aos="fade-up">
            <h2 className="section-title" style={{ color: '#fff' }}>
              A Century of <b>Space Agriculture</b>
            </h2>
            <p className="section-sub-title" style={{ color: 'rgba(245,239,230,0.65)' }}>
              From early Soviet experiments to Artemis III — growing food in space has always been
              essential to humanity's long-duration exploration ambitions.
            </p>
          </div>

          <div className="mg-history-timeline" data-aos="fade-up">
            <div className="mg-history-item">
              <div className="mg-history-year">1920s</div>
              <div className="mg-history-content">
                <strong>Tsiolkovsky's Vision</strong>
                <p>Konstantin Tsiolkovsky first theorized space greenhouses as critical infrastructure for multi-generational spaceflight — plants recycling CO₂ and providing food across interplanetary distances.</p>
              </div>
            </div>
            <div className="mg-history-item">
              <div className="mg-history-year">1972</div>
              <div className="mg-history-content">
                <strong>Soviet BIOS-3</strong>
                <p>The USSR's BIOS-3 closed ecological system housed human crews for months, with wheat and vegetable crops regenerating up to 80% of the atmosphere and a substantial fraction of food — the most complete closed loop ever demonstrated.</p>
              </div>
            </div>
            <div className="mg-history-item">
              <div className="mg-history-year">1978</div>
              <div className="mg-history-content">
                <strong>NASA CELSS Program</strong>
                <p>NASA launched the Controlled Ecological Life Support System (CELSS) program, funding ground-based research into bioregenerative food production for long-duration human missions beyond low-Earth orbit.</p>
              </div>
            </div>
            <div className="mg-history-item">
              <div className="mg-history-year">1984</div>
              <div className="mg-history-content">
                <strong>Charles Walker — Purdue's Payload Specialist</strong>
                <p>Purdue alumnus Charles Walker became the first non-government payload specialist to fly on the Space Shuttle, conducting drug-crystallization and biological processing experiments that set the precedent for university-led space research.</p>
              </div>
            </div>
            <div className="mg-history-item">
              <div className="mg-history-year">2018</div>
              <div className="mg-history-content">
                <strong>China Lunar Palace 1</strong>
                <p>A crew of volunteers spent 370 consecutive days inside China's Lunar Palace 1 habitat, with the internal garden supplying over 80% of their food — validating closed-loop bioregenerative systems at unprecedented timescales.</p>
              </div>
            </div>
            <div className="mg-history-item">
              <div className="mg-history-year">2026</div>
              <div className="mg-history-content">
                <strong>NASA Artemis III LEAF Initiative</strong>
                <p>NASA's Lunar Food &amp; Agriculture (LEAF) initiative targets the first demonstration of plant growth on the lunar surface during Artemis III. SEARCH is designing a microgreen growth chamber that meets the mass, power, and volume constraints demanded by this landmark mission.</p>
              </div>
            </div>
          </div>

          <div className="text-center mt-5" data-aos="fade-up">
            <p style={{ color: 'rgba(245,239,230,0.7)', maxWidth: '750px', margin: '0 auto', lineHeight: '1.8' }}>
              Purdue has been at the forefront of space plant biology for decades. Drs. Porterfield and Barker
              have maintained NASA-funded research programs in plant space biology here on campus — and SEARCH
              carries that legacy forward with student-driven hardware and experiments aimed directly at LEAF.
            </p>
          </div>
        </div>
      </section>

      {/* ===== PROJECT OVERVIEW STATS ===== */}
      <section id="mg-overview" style={{ background: 'var(--color-bg-secondary, #f7f3ee)', padding: '4rem 0' }}>
        <div className="container text-center">
          <div className="title-wrap mb-4" data-aos="fade-up">
            <h2 className="section-title">Our <b>Mission</b></h2>
            <p className="section-sub-title" style={{ maxWidth: '680px', margin: '0 auto' }}>
              SEARCH's Microgreen Microwaves team is engineering a compact, autonomous growth chamber
              that can sustain microgreen crops in microgravity — delivering fresh food and psychological
              benefit to astronauts during multi-year missions.
            </p>
          </div>
          <div className="mg-stat-row" data-aos="fade-up" data-aos-delay="100">
            <div className="mg-stat-card">
              <div className="mg-stat-num">3</div>
              <div className="mg-stat-label">Sub-Groups</div>
            </div>
            <div className="mg-stat-card">
              <div className="mg-stat-num">17</div>
              <div className="mg-stat-label">Deliverables</div>
            </div>
            <div className="mg-stat-card">
              <div className="mg-stat-num">5</div>
              <div className="mg-stat-label">Project Phases</div>
            </div>
            <div className="mg-stat-card">
              <div className="mg-stat-num">3+</div>
              <div className="mg-stat-label">Cross-Team Milestones</div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== SUB-GROUPS ===== */}
      <section id="mg-subgroups" style={{ padding: '5rem 0' }}>
        <div className="container">
          <div className="title-wrap mb-5 text-center" data-aos="fade-up">
            <h2 className="section-title">Team <b>Sub-Groups</b></h2>
            <p className="section-sub-title">
              Three specialized sub-teams collaborate across every phase of the project,
              each contributing domain expertise toward the integrated chamber system.
            </p>
          </div>
          <div className="mg-subgroup-strip" data-aos="fade-up">
            {SUBGROUPS.map(sg => (
              <div key={sg.name} className="mg-subgroup-card">
                <div className="mg-subgroup-header">
                  <i className={sg.icon} style={{ color: sg.color, fontSize: '2rem', marginBottom: '0.75rem' }} aria-hidden="true" />
                  <div className="mg-subgroup-share" style={{ background: sg.color }}>{sg.share}</div>
                </div>
                <h3 className="mg-subgroup-name">{sg.name}</h3>
                <p className="mg-subgroup-desc">{sg.description}</p>
                <div className="mg-subgroup-skills">
                  {sg.skills.map(s => (
                    <span key={s} className="mg-skill-chip">{s}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* All three sub-groups in action */}
          <div className="mg-group-photo-wrap" data-aos="fade-up" data-aos-delay="120">
            <img
              loading="lazy"
              src="/research/group_work.webp"
              alt="Microgreen Microwaves team working across all three sub-groups in the Purdue ABE lab"
            />
            <p className="mg-group-photo-caption">
              All three sub-groups working simultaneously — electronics on the left, biology at the bench, hardware on the right, with an active LED growth chamber in the background.
            </p>
          </div>
        </div>
      </section>

      {/* ===== 5-PHASE DELIVERABLES ROADMAP ===== */}
      <section id="mg-phases" style={{ background: 'var(--color-bg-dark)', padding: '5rem 0' }}>
        <div className="container">
          <div className="title-wrap mb-5 text-center" data-aos="fade-up">
            <h2 className="section-title" style={{ color: '#fff' }}>Project <b>Roadmap</b></h2>
            <p className="section-sub-title" style={{ color: 'rgba(245,239,230,0.65)' }}>
              Five sequential phases carry the chamber from initial requirements through flight qualification
              and community outreach, with 17 numbered deliverables across 3 cross-team milestones.
            </p>
          </div>
          <div className="mg-phase-grid">
            {PHASES.map((ph, i) => (
              <div key={ph.num} className="mg-phase-card" data-aos="fade-up" data-aos-delay={i * 80}>
                <div className="mg-phase-num">{ph.num}</div>
                <h4 className="mg-phase-title">{ph.title}</h4>
                <ul className="mg-phase-list">
                  {ph.deliverables.map(d => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="text-center mt-4" data-aos="fade-up">
            <p style={{ color: 'rgba(245,239,230,0.55)', fontSize: '0.85rem' }}>
              Cross-team milestones C.1–C.3 span all phases: weekly all-hands, integrated system test, and final demonstration.
            </p>
          </div>
        </div>
      </section>

      {/* ===== TECHNICAL SYSTEMS ===== */}
      <section id="mg-technical" style={{ padding: '5rem 0' }}>
        <div className="container">
          <div className="title-wrap mb-5" data-aos="fade-up">
            <h2 className="section-title">Technical <b>Systems</b></h2>
            <p className="section-sub-title">
              Every subsystem is designed to operate autonomously — from sensing and actuation through
              computer vision and predictive analytics — freeing the crew from active monitoring duties.
            </p>
          </div>

          {/* Lab image + intro */}
          <div className="mg-media-row" data-aos="fade-up" style={{ marginBottom: '3rem' }}>
            <div className="mg-media-text">
              <span className="about-section-label">Inside the Lab</span>
              <h3 style={{ fontFamily: 'var(--font-heading)', marginBottom: '1rem' }}>
                Hardware in Development
              </h3>
              <p style={{ color: 'var(--color-muted)', lineHeight: '1.8' }}>
                The Microgreen Microwaves team works out of Purdue's ABE facilities, iterating rapidly
                on chamber designs using 3D-printed structural components, custom PCBs, and
                off-the-shelf sensors that can be qualified for spaceflight.
              </p>
              <p style={{ color: 'var(--color-muted)', lineHeight: '1.8' }}>
                Each prototype growth trial generates quantitative data on germination rate, leaf area
                index, biomass yield, and resource consumption — feeding directly into the next design
                revision cycle and our ICES 2025 submission.
              </p>
            </div>
            <div className="mg-media-img" data-aos="fade-left">
              <img loading="lazy" src="/research/Labspace.webp" alt="Microgreen lab workspace at Purdue" />
            </div>
          </div>

          {/* Tech feature cards */}
          <div className="row" data-aos="fade-up">
            {TECH_FEATURES.map((f, i) => (
              <div key={f.title} className="col-md-4 col-sm-6 col-12 mb-4" data-aos="fade-up" data-aos-delay={i * 60}>
                <div className="mg-tech-card shadow rounded p-4 h-100">
                  <i className={`${f.icon} mg-tech-icon`} aria-hidden="true" />
                  <h5 className="mg-tech-title">{f.title}</h5>
                  <p className="mg-tech-body">{f.body}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Experimental methodology — Mia recording data */}
          <div className="mg-media-row reverse" data-aos="fade-up" style={{ marginTop: '3rem' }}>
            <div className="mg-media-text">
              <span className="about-section-label">Experimental Methodology</span>
              <h3 style={{ fontFamily: 'var(--font-heading)', marginBottom: '1rem' }}>
                Rigorous Data Collection
              </h3>
              <p style={{ color: 'var(--color-muted)', lineHeight: '1.8' }}>
                Every growth trial is documented in detail — seed counts, germination timelines, substrate moisture levels, and sensor readings are all recorded by hand before being entered into our shared MATLAB dataset. This redundant logging catches sensor drift early and gives us a ground-truth record independent of the automated system.
              </p>
              <p style={{ color: 'var(--color-muted)', lineHeight: '1.8' }}>
                Lab notebooks also serve as the primary record for ICES paper preparation, ensuring our experimental conditions are fully reproducible by the wider space-agriculture research community.
              </p>
            </div>
            <div className="mg-media-img" data-aos="fade-right">
              <img loading="lazy" src="/research/Mia_work.webp" alt="SEARCH member recording experimental data in lab notebook" />
            </div>
          </div>
        </div>
      </section>

      {/* ===== 3D CHAMBER MODEL ===== */}
      <section id="mg-3d-model" style={{ background: 'var(--color-bg-dark)', padding: '5rem 0' }}>
        <div className="container">
          <div className="title-wrap mb-4 text-center" data-aos="fade-up">
            <h2 className="section-title" style={{ color: '#fff' }}>
              Chamber <b>Assembly</b>
            </h2>
            <p className="section-sub-title" style={{ color: 'rgba(245,239,230,0.65)', maxWidth: '620px', margin: '0 auto' }}>
              Explore the full 3D assembly of our microgreen growth chamber. Drag to rotate,
              scroll to zoom.
            </p>
          </div>

          <div className="stl-viewer-container" data-aos="fade-up" data-aos-delay="80">
            <STLViewer url="/models/chamberAssembly.stl" height={520} color="#c8d4dc" />
          </div>

          <div className="stl-hint-row" data-aos="fade-up" data-aos-delay="160">
            <span className="stl-hint"><i className="fas fa-mouse-pointer" aria-hidden="true" /> Drag to rotate</span>
            <span className="stl-hint"><i className="fas fa-search-plus" aria-hidden="true" /> Scroll to zoom</span>
            <span className="stl-hint"><i className="fas fa-sync-alt" aria-hidden="true" /> Auto-rotates when idle</span>
          </div>
        </div>
      </section>

      {/* ===== PLANT ROOT ANIMATION WRAPPER ===== */}
      <div className="plant-root-wrapper">

        {/* Plant root SVG rail — desktop only */}
        <div className="plant-root-rail d-none d-lg-block" ref={rootRailRef} aria-hidden="true">
          <svg
            width="48"
            height="900"
            viewBox="0 0 48 900"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              className="root-path"
              d="M24 0
                 C24 60 24 180 24 300
                 C24 360 10 390 8 430
                 M24 300
                 C24 360 38 390 40 430
                 M24 430
                 C24 520 24 610 24 680
                 C24 720 10 745 7 775
                 M24 680
                 C24 720 38 745 41 775
                 M24 775
                 C24 830 24 900 24 900"
              stroke="#4a7c3f"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="24" cy="300" r="4" fill="#4a7c3f" opacity="0.7" />
            <circle cx="24" cy="550" r="4" fill="#4a7c3f" opacity="0.7" />
            <circle cx="24" cy="775" r="4" fill="#4a7c3f" opacity="0.7" />
          </svg>
        </div>

        {/* ===== CONFERENCES (ICES) ===== */}
        <section id="mg-conferences">
          <div className="container">
            <div className="title-wrap mb-5" data-aos="fade-up">
              <h2 className="section-title">Presenting at <b>International Conferences</b></h2>
              <p className="section-sub-title">
                SEARCH members present validated research findings to the global space science community.
              </p>
            </div>
            <div className="mg-media-row" data-aos="fade-up">
              <div className="mg-media-text">
                <span className="about-section-label">ICES 2025</span>
                <h3 style={{ fontFamily: 'var(--font-heading)', marginBottom: '1rem' }}>
                  International Conference on Environmental Systems
                </h3>
                <p style={{ color: 'var(--color-muted)', lineHeight: '1.8' }}>
                  SEARCH is preparing a submission to ICES — one of the premier venues for space
                  life sciences and environmental systems engineering. Presenting here connects our
                  microgreen chamber work to the broader international community working on closed-loop
                  life support for long-duration missions.
                </p>
                <p style={{ color: 'var(--color-muted)', lineHeight: '1.8' }}>
                  Research outputs from our substrate optimization and LED lighting experiments are
                  candidates for submission. Members gain experience writing technical papers, preparing
                  oral presentations, and engaging with NASA and ESA scientists directly.
                </p>
              </div>
              <div className="mg-media-img" data-aos="fade-left">
                <img loading="lazy" src="/research/ICES2025_Research.webp" alt="ICES 2025 Conference" />
              </div>
            </div>
          </div>
        </section>

        {/* ===== RESEARCH TRIPS ===== */}
        <section id="mg-trips">
          <div className="container">
            <div className="title-wrap mb-5" data-aos="fade-up">
              <h2 className="section-title">Field Research <b>&amp; Site Visits</b></h2>
              <p className="section-sub-title">
                Hands-on experience at world-class research facilities deepens our understanding of
                closed-loop life support systems.
              </p>
            </div>
            <div className="mg-media-row reverse" data-aos="fade-up">
              <div className="mg-media-text">
                <span className="about-section-label">Arizona Biosphere 2</span>
                <h3 style={{ fontFamily: 'var(--font-heading)', marginBottom: '1rem' }}>
                  Biosphere 2 Research Trip
                </h3>
                <p style={{ color: 'var(--color-muted)', lineHeight: '1.8' }}>
                  The Biosphere 2 facility in Oracle, Arizona is one of the world's most significant
                  closed ecological systems. SEARCH members traveled to the site to study how
                  large-scale contained biospheres manage nutrient cycling, plant growth, and
                  atmospheric regulation — directly informing our own chamber design approach.
                </p>
                <p style={{ color: 'var(--color-muted)', lineHeight: '1.8' }}>
                  Observations from Biosphere 2's controlled growth bays have influenced our substrate
                  layering strategy, particularly the use of porous growing media to balance moisture
                  retention with root aeration. The trip also provided context for scaling our chamber
                  from laboratory prototype to mission-ready hardware.
                </p>
              </div>
              <div className="mg-media-img" data-aos="fade-right">
                <img loading="lazy" src="/research/Biosphere_Chamber.webp" alt="Biosphere 2 Research Chamber" />
              </div>
            </div>
          </div>
        </section>

        {/* ===== ACADEMIC PROFESSIONALS ===== */}
        <section id="mg-professionals">
          <div className="container">
            <div className="title-wrap mb-5 text-center" data-aos="fade-up">
              <h2 className="section-title">Working with <b>Academic Professionals</b></h2>
              <p className="section-sub-title">
                Our research is guided by faculty and scientists at the forefront of space biology
                and controlled-environment agriculture.
              </p>
            </div>
            <div className="row" data-aos="fade-up">
              {PROFESSIONALS.map((prof) => (
                <div key={prof.name} className="col-md-4 col-sm-12 mb-4">
                  <div className="prof-card">
                    {prof.hoverPhoto ? (
                      <div className="prof-img-container">
                        <img loading="lazy" className="prof-img-default" src={prof.photo} alt={prof.name} />
                        <img loading="lazy" className="prof-img-hover" src={prof.hoverPhoto} alt={`${prof.name} research`} />
                      </div>
                    ) : (
                      <img loading="lazy" src={prof.photo} alt={prof.name} />
                    )}
                    <h4>{prof.name}</h4>
                    <p className="prof-title">{prof.title}</p>
                    <a
                      href={prof.linkedin}
                      className="btn-linkedin"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <i className="fab fa-linkedin" />
                      LinkedIn
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

      </div>{/* end plant-root-wrapper */}

      {/* ===== ACADEMIC REFERENCES ===== */}
      <section id="mg-references" style={{ background: 'var(--color-bg-dark)', padding: '5rem 0' }}>
        <div className="container">
          <div className="title-wrap mb-5 text-center" data-aos="fade-up">
            <h2 className="section-title" style={{ color: '#fff' }}>Academic <b>Literature</b></h2>
            <p className="section-sub-title" style={{ color: 'rgba(245,239,230,0.65)' }}>
              Our chamber design and experimental protocols are grounded in peer-reviewed research
              spanning space plant biology, growth-chamber engineering, and AI-assisted cultivation.
            </p>
          </div>
          <div className="mg-ref-grid" data-aos="fade-up">
            {REFERENCES.map((ref, i) => (
              <div key={i} className="mg-ref-card">
                <div className="mg-ref-year">{ref.year}</div>
                <p className="mg-ref-authors">{ref.authors}</p>
                <p className="mg-ref-title">"{ref.title}"</p>
                <p className="mg-ref-journal"><em>{ref.journal}</em></p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== RESEARCH PROJECTS ===== */}
      <section id="blog" className="bg-grey">
        <div className="container">
          <div className="section-content">
            <div className="title-wrap mb-5" data-aos="fade-up">
              <h2 className="section-title">Research <b>Projects</b></h2>
              <p className="section-sub-title">
                An overview of SEARCH's research projects and NASA design competitions
              </p>
            </div>
            <h3><b>2023–24</b></h3><br />
            <div className="row">
              <div className="col-md-12 blog-holder">
                <div className="row">
                  <div className="col-md-4 blog-item-wrapper" data-aos="fade-up">
                    <div className="blog-item">
                      <div className="blog-img">
                        <Link to="/research/rascal">
                          <img loading="lazy" src="/research/2023_24/rascal/astros-pup-pr-hab-horizontal4.webp" alt="NASA RASC-AL 2024" />
                        </Link>
                      </div>
                      <div className="blog-text">
                        <div className="blog-tag"><a href="#top"><h6><small>NASA</small></h6></a></div>
                        <div className="blog-title"><Link to="/research/rascal"><h4>NASA RASC-AL 2024</h4></Link></div>
                        <div className="blog-meta"><p className="blog-date">3 Mar 2024</p></div>
                        <div className="blog-desc"><p>RASC-AL is NASA's design challenge for university students. SEARCH has competed multiple times in this prestigious national competition.</p></div>
                        <div className="blog-author"><p>by Hrishikesh Viswanath</p></div>
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
            <h3><b>2022–23</b></h3><br />
            <div className="row">
              <div className="col-md-12 blog-holder">
                <div className="row">
                  <div className="col-md-4 blog-item-wrapper" data-aos="fade-up">
                    <div className="blog-item">
                      <div className="blog-img">
                        <Link to="/research/rascal">
                          <img loading="lazy" src="/research/2022_23/mars_mission.webp" alt="NASA RASC-AL 2023" />
                        </Link>
                      </div>
                      <div className="blog-text">
                        <div className="blog-tag"><a href="#top"><h6><small>NASA</small></h6></a></div>
                        <div className="blog-title"><Link to="/research/rascal"><h4>NASA RASC-AL 2023</h4></Link></div>
                        <div className="blog-meta"><p className="blog-date">3 Mar 2023</p></div>
                        <div className="blog-desc"><p>RASC-AL is NASA's design challenge for university students. SEARCH has competed multiple times in this prestigious national competition.</p></div>
                        <div className="blog-author"><p>by Hrishikesh Viswanath</p></div>
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

export default Research;
