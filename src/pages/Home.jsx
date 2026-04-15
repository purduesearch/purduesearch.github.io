import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useTransform } from 'framer-motion';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import SEOHead from '../components/SEOHead';

gsap.registerPlugin(ScrollTrigger);

const IG_POSTS = [
  {
    image: '/ig/Meetings_ig.webp',
    caption: 'Curious about SEARCH?! Come to one of our meetings and discover how you can be a part of this amazing community of innovation and space exploration! 🔭🪐🚀🧑‍🚀💫',
    date: 'Aug 8, 2023',
    likes: 22,
  },
  {
    image: '/ig/SA2TP_ig.webp',
    caption: 'Do you dream of becoming an astronaut? Apply today to embark on our 3-week immersive program focusing on astronautics, health, and technology. We want YOU for CREW-4.',
    date: 'Jul 12, 2025',
    likes: 58,
  },
  {
    image: '/ig/Launch_Party_ig.webp',
    caption: 'Ready for lift-off??!! 🚀 Join us today, April 1st, for the Artemis II Watch Party. We’re hosting Dr. Marshall Porterfield and Dr. Richard Barker for some incredible research presentations leading up to the launch!',
    date: 'Mar 3, 2024',
    likes: 66,
  },
  {
    image: '/ig/Quincy_Spotlight_ig.webp',
    caption: 'Quincy is helping Purdue SEARCH with the Power components in the on-campus Mini Hab! He is looking forward to seeing how the Mini Hab does after its fully built as well as gathering and monitoring environmental and electrical-related data.',
    date: 'Feb 20, 2024',
    likes: 20,
  },
  {
    image: '/ig/Voss_ig.webp',
    caption: 'Space is big. We’re making it local. 🚀🪐 The VOSS Model Expansion is officially recruiting for 2026! We’re building a real-life, true-to-scale model of the solar system right here in West Lafayette--and maybe even beyond. 🌌',
    date: 'May 30, 2024',
    likes: 51,
  },
  {
    image: '/ig/Astrousa_Meeting_ig.webp',
    caption: 'Are you a Purdue Engineer looking for experience in space research or design? 🛰️👨‍🚀 Come check out SEARCHs flagship project ASTRO-USA, where we are currently working on Project Demeter - a fully closed-loop shipping container by the Purdue Airport focused on Biological System Production 🌿, Human Space Research 👨‍🚀, and much more! You can join and receive updates by attending our meetings and join the slack through the linktree in our bio! 📝👇 We would love to see you there! Boiler Up! 🚂🔨',
    date: 'Apr 15, 2024',
    likes: 27,
  },
];

const CAL_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const CAL_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const CAL_EVENTS = [
  { month: 4, day: 15, title: 'General Meeting', desc: 'Weekly meeting — all members welcome, 7PM ARMS 1010' },
  { month: 4, day: 22, title: 'SA²TP Info Session', desc: 'Learn about the Crew-4 application, 6PM LWSN B155' },
  { month: 5, day: 5,  title: 'ASTRO-USA Build Day', desc: 'Habitat construction session, Purdue campus' },
  { month: 5, day: 12, title: 'Speaker Event', desc: 'TBA — check Instagram @purdue_search for details' },
];

const TESTIMONIALS = [
  {
    name: 'Nathanael Herman',
    role: 'President',
    photo: '/officers/herman.webp',
    quote: 'SEARCH gave me a community of people as passionate about space exploration as I am — and the projects to match.',
  },
  {
    name: 'Ryan DeAngelis',
    role: 'Vice President',
    photo: '/officers/deangelis.webp',
    quote: 'Running SA²TP showed me what student-led leadership can accomplish when everyone is driven by the same mission.',
  },
  {
    name: 'Devyani Tyagi',
    role: 'Treasurer',
    photo: '/officers/tyagi.webp',
    quote: 'The interdisciplinary nature of SEARCH is what sets it apart — physicists, engineers, and writers all working toward the stars.',
  },
  {
    name: 'Gurmehar Singh',
    role: 'Software Lead',
    photo: '/officers/singh.webp',
    quote: 'Building AR interfaces for NASA SUITS was surreal. We shipped real software tested at Johnson Space Center.',
  },
  {
    name: 'Ilina Adhikari',
    role: 'ASTRO-USA Lead',
    photo: '/officers/adhikari.webp',
    quote: "Designing a functional space habitat on Purdue's campus is the kind of challenge that pushes you beyond the textbook.",
  },
  {
    name: 'John Peters',
    role: 'Astronaut Training Lead',
    photo: '/officers/peters.webp',
    quote: "Teaching scuba, fitness, and flight skills to future analog astronauts is the most rewarding thing I've done in college.",
  },
  {
    name: 'Spruha Vashi',
    role: 'Business & Operations Lead',
    photo: '/officers/vashi.webp',
    quote: 'Partnering with HI-SEAS opens doors most undergrads never get to walk through.',
  },
];

const PROGRAMS = [
  'Competed in national challenges such as NASA RASC-AL and NASA SUITS — qualifying for the on-site round at Johnson Space Center in 2024.',
  'Hosted outreach events with researchers from NASA, SpaceX, SETI, Blue Origin, and Virgin Galactic.',
  'Led a student-run Analog Astronaut Training Program including flight, scuba, and fitness certification.',
  'Organized research trips to world-class analog facilities including Biosphere 2 and Kennedy Space Center.',
  'Conducting bio-astronautics and hydroponics research toward NASA\'s LEAF initiative.',
  'Designing ASTRO-USA — a self-sustaining, closed-loop habitat on Purdue\'s campus for long-duration mission simulation.',
];

// 3D tilt card — used for mission pillars
const TiltCard = ({ children, className, style }) => {
  const cardRef = useRef(null);
  const prefersReduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  const handleMouseMove = (e) => {
    if (prefersReduced || isMobile) return;
    const card = cardRef.current;
    if (!card) return;
    const { left, top, width, height } = card.getBoundingClientRect();
    const x = (e.clientX - left) / width  - 0.5; // -0.5 to 0.5
    const y = (e.clientY - top)  / height - 0.5;
    card.style.transform = `perspective(700px) rotateX(${-y * 12}deg) rotateY(${x * 12}deg) scale(1.03)`;
  };

  const handleMouseLeave = () => {
    if (cardRef.current) cardRef.current.style.transform = '';
  };

  return (
    <div
      ref={cardRef}
      className={className}
      style={{ ...style, transition: 'transform 0.25s ease', willChange: 'transform' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {children}
    </div>
  );
};

const Home = () => {
  const videoRef   = useRef(null);
  const heroRef    = useRef(null);
  const statsRef   = useRef(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [progIdx, setProgIdx] = useState(0);

  // Framer Motion scroll-driven wordmark fade
  const { scrollY } = useScroll();
  const wordmarkOpacity = useTransform(scrollY, [0, 300], [1, 0]);
  const wordmarkScale   = useTransform(scrollY, [0, 300], [1, 0.85]);

  // Calendar: compute current month grid
  const today = new Date();
  const calYear = today.getFullYear();
  const calMonth = today.getMonth(); // 0-indexed
  const firstDOW = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const eventDays = new Set(
    CAL_EVENTS.filter(e => e.month === calMonth + 1).map(e => e.day)
  );
  const calCells = [
    ...Array(firstDOW).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (calCells.length % 7 !== 0) calCells.push(null);

  // GSAP ScrollTrigger — scrub video through hero extender
  useEffect(() => {
    const video = videoRef.current;
    const hero  = heroRef.current;
    if (!video || !hero) return;

    video.pause();
    video.currentTime = 0;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let targetTime = 0;
    let smoothedTime = 0;
    let rafId;

    const tick = () => {
      const diff = targetTime - smoothedTime;
      if (Math.abs(diff) > 0.033) {
        smoothedTime += diff * 0.12;
      } else {
        smoothedTime = targetTime;
      }
      // Only write currentTime when the decoder has finished its last seek —
      // stacking seeks causes the browser to queue them and flush all at once
      if (!video.seeking && Math.abs(smoothedTime - video.currentTime) > 0.016) {
        video.currentTime = smoothedTime;
      }
      rafId = requestAnimationFrame(tick);
    };

    const initScrub = () => {
      if (video.duration <= 0) return;
      const st = ScrollTrigger.create({
        trigger: hero,
        start: 'top top',
        end: 'bottom top',
        scrub: true,
        onUpdate: (self) => {
          targetTime = self.progress * video.duration;
        },
      });
      rafId = requestAnimationFrame(tick);
      return st;
    };

    let st;
    if (video.readyState >= 1) {
      st = initScrub();
    } else {
      const onMeta = () => { st = initScrub(); };
      video.addEventListener('loadedmetadata', onMeta, { once: true });
    }

    return () => {
      if (st) st.kill();
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  // GSAP count-up on #about-search stats
  useEffect(() => {
    const container = statsRef.current;
    if (!container) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const targets = container.querySelectorAll('[data-count]');
    targets.forEach(el => {
      const end = parseFloat(el.dataset.count);
      const isDecimal = String(end).includes('.');
      gsap.fromTo(
        el,
        { innerText: 0 },
        {
          innerText: end,
          duration: 1.6,
          ease: 'power2.out',
          snap: { innerText: isDecimal ? 0.1 : 1 },
          scrollTrigger: { trigger: el, start: 'top 88%', once: true },
          onUpdate() { el.innerText = isDecimal ? parseFloat(el.innerText).toFixed(1) : Math.round(el.innerText); },
        }
      );
    });
  }, []);

  // Testimonial auto-advance
  useEffect(() => {
    const id = setInterval(
      () => setActiveIdx(prev => (prev + 1) % TESTIMONIALS.length),
      5000
    );
    return () => clearInterval(id);
  }, []);

  // Programs quote auto-advance
  useEffect(() => {
    const id = setInterval(() => setProgIdx(prev => (prev + 1) % PROGRAMS.length), 4000);
    return () => clearInterval(id);
  }, []);

  // AOS init
  useEffect(() => {
    if (window.AOS) window.AOS.init({ once: true });
  }, []);

  // WebSite + SiteNavigationElement structured data
  useEffect(() => {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.text = JSON.stringify([
      {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        'url': 'https://purduesearch.github.io/',
        'name': 'Purdue SEARCH',
        'potentialAction': {
          '@type': 'SearchAction',
          'target': {
            '@type': 'EntryPoint',
            'urlTemplate': 'https://purduesearch.github.io/search?q={search_term_string}',
          },
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        'name': 'Site Navigation',
        'itemListElement': [
          { '@type': 'SiteLinksSearchBox', 'url': 'https://purduesearch.github.io/' },
          { '@type': 'ListItem', 'position': 1, 'name': 'About', 'url': 'https://purduesearch.github.io/about' },
          { '@type': 'ListItem', 'position': 2, 'name': 'Research', 'url': 'https://purduesearch.github.io/research' },
          { '@type': 'ListItem', 'position': 3, 'name': 'SA²TP', 'url': 'https://purduesearch.github.io/sa2tp' },
          { '@type': 'ListItem', 'position': 4, 'name': 'ASTRO-USA', 'url': 'https://purduesearch.github.io/astrousa' },
          { '@type': 'ListItem', 'position': 5, 'name': 'Software', 'url': 'https://purduesearch.github.io/software' },
          { '@type': 'ListItem', 'position': 6, 'name': 'Business & Operations', 'url': 'https://purduesearch.github.io/business' },
          { '@type': 'ListItem', 'position': 7, 'name': 'Outreach', 'url': 'https://purduesearch.github.io/outreach' },
          { '@type': 'ListItem', 'position': 8, 'name': 'Blog', 'url': 'https://purduesearch.github.io/blog' },
          { '@type': 'ListItem', 'position': 9, 'name': 'Contact', 'url': 'https://purduesearch.github.io/contact' },
        ],
      },
    ]);
    document.head.appendChild(script);
    return () => { document.head.removeChild(script); };
  }, []);

  return (
    <div>
      <SEOHead
        title="Purdue SEARCH | Space Analog Astronaut Research Chapter"
        description="SEARCH is a student-led space research organization at Purdue University. We run astronaut training, bioastronautics research, and space habitat programs."
        canonical="/"
        fullTitle
      />
      <Navbar />

      {/* ===== HERO ===== */}
      <div id="main-content" className="hero-scroll-extender" ref={heroRef}>
      <div className="jumbotron d-flex align-items-center" style={{ backgroundImage: 'none', height: '100vh', overflow: 'hidden' }}>
        <video
          ref={videoRef}
          className="hero-video-bg"
          src="/Mars%20Video.webm"
          muted
          playsInline
          preload="auto"
          poster="/home.webp"
        />
        <div className="container text-center">
          <motion.div className="hero-wordmark" style={{ opacity: wordmarkOpacity, scale: wordmarkScale }}>SEARCH</motion.div>
          <h1 className="display-3 mb-3" style={{ color: '#fff' }}>
            Space and Earth Analogs Research<br />Chapter of Purdue
          </h1>
          <p style={{ fontSize: '1.1rem', color: 'rgba(255,255,255,0.8)', fontWeight: 300, maxWidth: '560px', margin: '0 auto 2rem' }}>
            Student-led human spaceflight research, training, and outreach — right here on Earth.
          </p>
          <div className="d-flex justify-content-center" style={{ gap: '1rem', flexWrap: 'wrap' }}>
            <Link to="/about" className="btn-slide-white" style={{ padding: '0.65rem 2rem', fontFamily: 'var(--font-body)', fontWeight: 500 }}>
              <span>Meet the Team</span>
            </Link>
            <Link to="/contact" className="btn-slide-fill" style={{ padding: '0.65rem 2rem', fontFamily: 'var(--font-body)', fontWeight: 500 }}>
              <span>Contact Us</span>
            </Link>
          </div>
          <div style={{ marginTop: '3rem' }}>
            <img loading="lazy" src="/icons/PU-H-Full-Rev-RGB.png" style={{ width: '12em', opacity: 0.85 }} alt="Purdue University" />
          </div>
        </div>
      </div>
      </div>{/* /hero-scroll-extender */}

      <section id="client" className="overlay bg-fixed" style={{ backgroundImage: 'url(/bg.jpg)' }} aria-label="Outreach partners">
        <div className="container">
          <div className="title-wrap mb-5 text-center">
            <h2 style={{ color: '#fff' }}>Our Collaborations</h2>
          </div>
        </div>
        <div className="logo-marquee-wrap">
          <div className="logo-marquee" aria-hidden="true">
            {[...Array(2)].flatMap((_, copy) => [
              <div key={`bo-${copy}`} className="client-item"><img loading="lazy" src="/outreach/companies/blueorigin.webp" alt="Blue Origin" /></div>,
              <div key={`hs-${copy}`} className="client-item"><img loading="lazy" src="/outreach/companies/hiseas.webp" alt="Hi-SEAS" /></div>,
              <div key={`na-${copy}`} className="client-item"><img loading="lazy" src="/outreach/companies/nasa.webp" alt="NASA" /></div>,
              <div key={`pa-${copy}`} className="client-item"><img loading="lazy" src="/outreach/companies/PAC.webp" alt="Purdue Aerospace Council" /></div>,
              <div key={`ps-${copy}`} className="client-item"><img loading="lazy" src="/outreach/companies/psp.webp" alt="Purdue Space Program" /></div>,
              <div key={`se-${copy}`} className="client-item"><img loading="lazy" src="/outreach/companies/seti.webp" alt="SETI Institute" /></div>,
              <div key={`sx-${copy}`} className="client-item"><img loading="lazy" src="/outreach/companies/spacex.webp" alt="SpaceX" /></div>,
              <div key={`vg-${copy}`} className="client-item"><img loading="lazy" src="/outreach/companies/virgingalactic.svg" alt="Virgin Galactic" /></div>,
            ])}
          </div>
        </div>
      </section>

      {/* ===== TESTIMONIAL CAROUSEL ===== */}
      <section id="testimonial-carousel">
        <div className="container">
          <div className="title-wrap text-center mb-2" data-aos="fade-up">
            <h2 className="section-title">Voices from <b>Our Team</b></h2>
            <p className="tc-subtitle">Hear from the students who lead SEARCH.</p>
          </div>
          <div className="testimonial-stage" data-aos="fade-up">
            {TESTIMONIALS.map((t, i) => {
              let cls = 'tcard--hidden';
              if (i === activeIdx) cls = 'tcard--active';
              else if (i === (activeIdx - 1 + TESTIMONIALS.length) % TESTIMONIALS.length) cls = 'tcard--prev';
              else if (i === (activeIdx + 1) % TESTIMONIALS.length) cls = 'tcard--next';
              return (
                <div key={t.name} className={`tcard ${cls}`} onClick={() => setActiveIdx(i)}>
                  <img loading="lazy" src={t.photo} alt={t.name} />
                  <p className="tc-quote">"{t.quote}"</p>
                  <div className="tc-name">{t.name}</div>
                  <div className="tc-role">{t.role}</div>
                </div>
              );
            })}
          </div>
          <div className="tc-dots">
            {TESTIMONIALS.map((_, i) => (
              <button
                key={i}
                className={`tc-dot${i === activeIdx ? ' active' : ''}`}
                onClick={() => setActiveIdx(i)}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ===== MISSION PILLARS — dark background, 3-column icon cards ===== */}
      <section id="mission-pillars">
        <div className="container">
          <div className="title-wrap mb-5 text-center" data-aos="fade-up">
            <h2 className="section-title">Our <b>Mission</b></h2>
            <p style={{ color: 'rgba(245,239,230,0.65)', maxWidth: '560px', margin: '0 auto' }}>
              SEARCH advances human spaceflight readiness through three interconnected pillars.
            </p>
          </div>
          <div className="row justify-content-center">
            {[
              { icon: '/icons/rocket-solid.svg', title: 'Research', body: 'Student-led research in bio-astronautics and hydroponics. Competing in NASA challenges such as RASC-AL and SUITS.', delay: '0' },
              { icon: '/icons/user-astronaut-solid.svg', title: 'Training', body: 'Running the Student Analog Astronaut Training Program — three weeks of fitness, flight, scuba, and NASA facility visits.', delay: '100' },
              { icon: '/icons/shuttle-space-solid.svg', title: 'Outreach', body: '3+ events per semester with speakers from NASA, SpaceX, SETI, and Blue Origin.', delay: '200' },
            ].map(({ icon, title, body, delay }) => (
              <div key={title} className="col-md-4 col-sm-12" data-aos="fade-up" data-aos-delay={delay}>
                <TiltCard className="pillar-card">
                  <div className="pillar-icon-wrap">
                    <img loading="lazy" src={icon} alt={title} />
                  </div>
                  <h4>{title}</h4>
                  <p>{body}</p>
                </TiltCard>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="bg-white">
        <div className="container">
          <div className="section-content">
            <div className="title-wrap mb-5" data-aos="fade-up">
              <h2 className="section-title">Presenting our <b>Subteams</b></h2>
              <p className="section-sub-title">
                At SEARCH, we do multi-disciplinary projects in collaboration with various Purdue departments and companies across the country.
                Our organization is divided into multiple sub-teams, with some working on research, some on designing analog programs,
                organizing outreach events with scientists and engineers etc.
              </p>
            </div>
            <div className="row">
              <div className="col-md-10 offset-md-1 features-holder">
                <div className="row">
                  <div className="col-md-4 col-sm-12 text-center mt-4">
                    <div className="shadow rounded feature-item p-4 mb-4" data-aos="fade-right" data-aos-delay={100}>
                      <div className="my-4">
                        <img loading="lazy" src="/icons/rocket-solid.svg" width="50px" alt="Research" />
                      </div>
                      <h4><Link to="/research">Research</Link></h4>
                      <p>Learn about the various research projects and NASA competitions we've been doing</p>
                    </div>
                    <div className="shadow rounded feature-item p-4 mb-4" data-aos="fade-right" data-aos-delay={200}>
                      <div className="my-4">
                        <img loading="lazy" src="/icons/microscope-solid.svg" width="50px" alt="Business & Operations" />
                      </div>
                      <h4><Link to="/business">Business &amp; Operations</Link></h4>
                      <p>
                        The team behind every trip, partnership, and sponsorship that keeps
                        SEARCH's missions funded and running.
                      </p>
                    </div>
                  </div>
                  <div className="col-md-4 col-sm-12 text-center">
                    <div className="shadow rounded feature-item p-4 mb-4" data-aos="fade-up" data-aos-delay={150}>
                      <div className="my-4">
                        <img loading="lazy" src="/icons/user-astronaut-solid.svg" width="50px" alt="SA2TP" />
                      </div>
                      <h4><Link to="/sa2tp">SA<sup>2</sup>TP</Link></h4>
                      <p>You know what's cooler than astronaut training? Astronaut training AND Scuba certification!</p>
                    </div>
                    <div className="shadow rounded feature-item p-4 mb-4" data-aos="fade-up" data-aos-delay={250}>
                      <div className="my-4">
                        <img loading="lazy" src="/icons/galactic-senate.svg" width="50px" alt="ASTRO-USA" />
                      </div>
                      <h4><Link to="/astrousa">ASTRO-USA</Link></h4>
                      <p>Our Most ambitious undertaking ever! Building an analog research station on Purdue Campus</p>
                    </div>
                  </div>
                  <div className="col-md-4 col-sm-12 text-center mt-4">
                    <div className="shadow rounded feature-item p-4 mb-4" data-aos="fade-left" data-aos-delay={100}>
                      <div className="my-4">
                        <img loading="lazy" src="/icons/robot-solid.svg" width="50px" alt="Software" />
                      </div>
                      <h4><Link to="/software">Software</Link></h4>
                      <p>
                        Want to put your coding skills to use by building VR space suit interfaces, lunar navigation
                        or space logistics design with AI? Click here to find out more
                      </p>
                    </div>
                    <div className="shadow rounded feature-item p-4 mb-4" data-aos="fade-left" data-aos-delay={200}>
                      <div className="my-4">
                        <img loading="lazy" src="/icons/shuttle-space-solid.svg" width="50px" alt="Outreach" />
                      </div>
                      <h4><Link to="/outreach">Outreach</Link></h4>
                      <p>Learn about our outreach programs with industry collaborators at NASA, SpaceX, SETI and more</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== ABOUT SEARCH — 2-column brand story ===== */}
      <section id="about-search" className="about-video-section">
        <video className="about-video-bg" src="/videos/drone_tour_purdue.webm" autoPlay loop muted playsInline />
        <div className="container">
          <div className="row align-items-center">
            <div className="col-md-6 about-text-col" data-aos="fade-right">
              <span className="about-label">Who We Are</span>
              <h2>Purdue's Premier<br />Human Spaceflight Chapter</h2>
              <p>
                Founded in 2022, SEARCH brings together students from Aerospace Engineering,
                Computer Science, Biology, and beyond to simulate the challenges of living
                and working in space — right here on Earth.
              </p>
              <p>
                From the Student Analog Astronaut Training Program to the ASTRO-USA on-campus
                habitat project, every initiative is student-led and faculty-advised.
              </p>
              <div className="about-stat-row" ref={statsRef}>
                <div className="about-stat">
                  <span style={{ display: 'block', whiteSpace: 'nowrap' }}>
                    <strong data-count="3" style={{ display: 'inline' }}>3</strong><strong style={{ fontWeight: 700, display: 'inline' }}>+</strong>
                  </span>
                  <span>Events / semester</span>
                </div>
                <div className="about-stat">
                  <strong data-count="6">6</strong>
                  <span>Subteams</span>
                </div>
                <div className="about-stat">
                  <strong data-count="2022">2022</strong>
                  <span>Founded</span>
                </div>
              </div>
              <div className="mt-4">
                <Link to="/about" className="btn btn-primary" style={{ borderRadius: '24px', padding: '0.5rem 1.5rem' }}>
                  Meet the Team
                </Link>
              </div>
            </div>
            <div className="col-md-6 about-visual-col mt-4 mt-md-0" data-aos="fade-left">
              <img loading="lazy" src="/bg-2.jpg" alt="SEARCH members at the station" />
            </div>
          </div>
        </div>
      </section>

      <section id="programs-showcase" className="section-padding bg-fixed bg-white overlay" style={{ backgroundImage: 'url(/bg-white.jpg)' }}>
        <div className="container">
          <div className="section-content" data-aos="fade-up">
            <div className="heading-section text-center">
              <h2>Programs</h2>
            </div>
            <div className="program-quote-wrap">
              <i className="testi-icon fa fa-3x fa-quote-left" aria-hidden="true" />
              <p className="program-quote-text">{PROGRAMS[progIdx]}</p>
              <div className="tc-dots" style={{ marginTop: '1.5rem' }}>
                {PROGRAMS.map((_, i) => (
                  <button
                    key={i}
                    className={`tc-dot${i === progIdx ? ' active' : ''}`}
                    onClick={() => setProgIdx(i)}
                    aria-label={`Go to program ${i + 1}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== INSTAGRAM FEED ===== */}
      <section id="instagram-feed">
        <div className="container">
          <div className="ig-header" data-aos="fade-up">
            <a
              className="ig-handle"
              href="https://www.instagram.com/purdue_search/"
              target="_blank"
              rel="noopener noreferrer"
            >
              <i className="fab fa-instagram" />
              @purdue_search
            </a>
            <a
              className="ig-follow-btn"
              href="https://www.instagram.com/purdue_search/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Follow Us
            </a>
          </div>
          <div className="ig-grid" data-aos="fade-up">
            {IG_POSTS.map((post, i) => (
              <a
                key={i}
                className="ig-card"
                href="https://www.instagram.com/purdue_search/"
                target="_blank"
                rel="noopener noreferrer"
              >
                <img loading="lazy" className="ig-card-img" src={post.image} alt={post.caption} />
                <div className="ig-card-body">
                  <p className="ig-card-caption">{post.caption}</p>
                  <div className="ig-card-meta">
                    <span>{post.date}</span>
                    <span className="ig-card-likes">
                      <i className="fas fa-heart" />{post.likes}
                    </span>
                  </div>
                </div>
              </a>
            ))}
          </div>
          <div className="ig-see-more" data-aos="fade-up">
            <a
              className="btn-slide-outline"
              href="https://www.instagram.com/purdue_search/"
              target="_blank"
              rel="noopener noreferrer"
              style={{ padding: '0.6rem 2rem' }}
            >
              <span>See All Posts on Instagram</span>
            </a>
          </div>
        </div>
      </section>

      {/* ===== EVENTS CALENDAR ===== */}
      {/* <section id="events-calendar">
        <div className="container">
          <div className="title-wrap text-center mb-5" data-aos="fade-up">
            <h2 className="section-title">Upcoming <b>Events</b></h2>
            <p className="section-sub-title">
              What's happening at SEARCH this month. Follow us on Instagram for the latest updates.
            </p>
          </div>
          <div className="cal-wrap" data-aos="fade-up">
            <div className="cal-card">
              <div className="cal-month-header">
                <span className="cal-month-title">
                  {CAL_MONTHS[calMonth]} {calYear}
                </span>
                <a
                  href="https://www.instagram.com/purdue_search/"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#fff', fontSize: '0.8rem', textDecoration: 'none' }}
                >
                  <i className="fab fa-instagram" /> @purdue_search
                </a>
              </div>
              <div className="cal-dow">
                {CAL_DAYS.map(d => <span key={d}>{d}</span>)}
              </div>
              <div className="cal-grid">
                {calCells.map((day, idx) => (
                  <div
                    key={idx}
                    className={[
                      'cal-cell',
                      day === null ? 'other-month' : '',
                      day === today.getDate() && calMonth === today.getMonth() ? 'today' : '',
                      day && eventDays.has(day) ? 'has-event' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    {day !== null && <span className="cal-date">{day}</span>}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="cal-events-list">
                {CAL_EVENTS.map((ev, i) => (
                  <div key={i} className="cal-event-item">
                    <div className="cal-event-date">
                      {CAL_MONTHS[ev.month - 1]} {ev.day}
                    </div>
                    <div className="cal-event-title">{ev.title}</div>
                    <div className="cal-event-desc">{ev.desc}</div>
                  </div>
                ))}
              </div>
              <div className="cal-outlook-note">
                📅 Outlook calendar embed coming soon —
                subscribe via{' '}
                <a href="https://www.instagram.com/purdue_search/" target="_blank" rel="noopener noreferrer">
                  Instagram
                </a>{' '}
                for event notifications.
              </div>
            </div>
          </div>
        </div>
      </section> */}

      <Footer />
    </div>
  );
};

export default Home;
