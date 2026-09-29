import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useTransform } from 'framer-motion';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import SEOHead from '../components/SEOHead';
import JsonLd from '../components/JsonLd';
import PublicEventsCalendar from '../components/events/PublicEventsCalendar';
import { websiteSchema } from '../seo/schema';
import { SITE_URL } from '../seo/siteUrl';
import { SLACK_JOIN_URL } from '../lib/siteLinks';
import { pressFeedback } from '../anim/motion';
import { parallaxLayer, staggerGroup, heroIntro } from '../anim/scrollFx';

const StarfieldCanvas = lazy(() => import('../components/StarfieldCanvas'));

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

// Find-your-team rows. Every line is restated from copy that already
// shipped on this page or in public/llms.txt — no new claims.
const TEAMS = [
  {
    to: '/research',
    name: 'Microgreens',
    what: "Designing, building, and qualifying a microgreen growth chamber for NASA's LEAF initiative.",
    work: 'Grow microgreens and build the chamber that feeds astronauts.',
  },
  {
    to: '/sa2tp',
    name: <>SA<sup>2</sup>TP</>,
    what: 'The Student Analog Astronaut Training Program: three weeks of fitness, flight, scuba, and NASA facility visits.',
    work: 'Train as an analog astronaut.',
  },
  {
    to: '/astrousa',
    name: 'ASTRO-USA',
    what: "An analog research station on Purdue's campus: a self-sustaining, closed-loop habitat for long-duration mission simulation.",
    work: 'Design habitat systems, from architecture to hydroponics and life support.',
  },
  {
    to: '/ares',
    name: 'ARES',
    what: 'A wearable CO\u2082 and biophysical sensing headset that detects the pocket of rebreathed air that forms in front of the face.',
    work: 'Build wearable sensors and study how breath moves.',
  },
  {
    to: '/software',
    name: 'Software',
    what: 'VR space suit interfaces, lunar navigation, and space logistics design with AI, built for NASA SUITS.',
    work: 'Write software for spacesuits and missions.',
  },
  {
    to: '/business',
    name: 'Business & Operations',
    what: 'The team behind every trip, partnership, and sponsorship, including research trips to Biosphere 2 and Kennedy Space Center.',
    work: 'Plan trips, find sponsors, and keep missions funded.',
  },
  {
    to: '/outreach',
    name: 'Outreach',
    what: '3+ events per semester with speakers from NASA, SpaceX, SETI, and Blue Origin.',
    work: 'Host speakers and run campus events.',
  },
];

const Home = () => {
  const videoRef   = useRef(null);
  const heroRef    = useRef(null);
  const statsRef   = useRef(null);
  const heroCtaPrimaryRef   = useRef(null);
  const heroCtaSecondaryRef = useRef(null);
  const heroContentRef = useRef(null);
  const clientBgRef = useRef(null);
  const teamListRef = useRef(null);
  const igGridRef = useRef(null);
  const teamSectionRef = useRef(null);
  const aboutSearchSectionRef = useRef(null);
  const [showStars, setShowStars] = useState(false);
  const [showDroneVideo, setShowDroneVideo] = useState(false);

  // Tactile press feedback on the hero CTAs
  useEffect(() => {
    const cleanups = [
      pressFeedback(heroCtaPrimaryRef.current),
      pressFeedback(heroCtaSecondaryRef.current),
    ];
    return () => cleanups.forEach(fn => fn());
  }, []);

  // Framer Motion scroll-driven wordmark fade
  const { scrollY } = useScroll();
  const wordmarkOpacity = useTransform(scrollY, [0, 300], [1, 0]);
  const wordmarkScale   = useTransform(scrollY, [0, 300], [1, 0.85]);

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
          // Without this, fromTo() applies the 0 start-state at mount, so the
          // real numbers only ever appear if someone scrolls the section into
          // view. Crawlers and LLM renderers don't scroll, and were reading the
          // stat row as "0 / 0 / 0". Defer the from-state to the trigger.
          immediateRender: false,
          scrollTrigger: { trigger: el, start: 'top 88%', once: true },
          onUpdate() { el.innerText = isDecimal ? parseFloat(el.innerText).toFixed(1) : Math.round(el.innerText); },
        }
      );
    });
  }, []);

  // GSAP scroll-effect utilities: hero intro, bg-fixed → parallax replacement,
  // mission pillar / instagram grid stagger reveal
  useEffect(() => {
    const cleanups = [
      // Exclude .hero-wordmark: it already has its own Framer Motion
      // scrollY-driven opacity/scale (useTransform above) — animating it
      // with GSAP too would fight over the same inline `style.opacity`.
      heroIntro(heroContentRef.current, ':scope > *:not(.hero-wordmark)'),
      parallaxLayer(clientBgRef.current),
      staggerGroup(teamListRef.current, '.team-row-item'),
      staggerGroup(igGridRef.current, '.ig-card'),
    ];
    return () => cleanups.forEach(fn => fn());
  }, []);

  // Mount the lazy WebGL starfield only once mission-pillars nears the
  // viewport, so three.js is fetched just-in-time and never blocks the
  // initial bundle. Fires once, then disconnects.
  useEffect(() => {
    const section = teamSectionRef.current;
    if (!section) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setShowStars(true);
          io.disconnect();
        }
      },
      { rootMargin: '400px' }
    );
    io.observe(section);

    return () => io.disconnect();
  }, []);

  // Mount the below-fold drone-tour video only once the About Search
  // section approaches the viewport, so the 13 MB file isn't fetched
  // on initial page load. Fires once, then disconnects.
  useEffect(() => {
    const section = aboutSearchSectionRef.current;
    if (!section) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setShowDroneVideo(true);
          io.disconnect();
        }
      },
      { rootMargin: '300px' }
    );
    io.observe(section);

    return () => io.disconnect();
  }, []);


  // AOS init
  useEffect(() => {
    if (window.AOS) window.AOS.init({ once: true });
  }, []);

  // Site Navigation structured data (ItemList — kept alongside websiteSchema())
  const siteNavigationSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    'name': 'Site Navigation',
    'itemListElement': [
      { '@type': 'SiteLinksSearchBox', 'url': `${SITE_URL}/` },
      { '@type': 'ListItem', 'position': 1, 'name': 'About', 'url': `${SITE_URL}/about` },
      { '@type': 'ListItem', 'position': 2, 'name': 'Research', 'url': `${SITE_URL}/research` },
      { '@type': 'ListItem', 'position': 3, 'name': 'SA²TP', 'url': `${SITE_URL}/sa2tp` },
      { '@type': 'ListItem', 'position': 4, 'name': 'ASTRO-USA', 'url': `${SITE_URL}/astrousa` },
      { '@type': 'ListItem', 'position': 5, 'name': 'Software', 'url': `${SITE_URL}/software` },
      { '@type': 'ListItem', 'position': 6, 'name': 'Business & Operations', 'url': `${SITE_URL}/business` },
      { '@type': 'ListItem', 'position': 7, 'name': 'Outreach', 'url': `${SITE_URL}/outreach` },
      { '@type': 'ListItem', 'position': 8, 'name': 'Blog', 'url': `${SITE_URL}/blog` },
      { '@type': 'ListItem', 'position': 9, 'name': 'Contact', 'url': `${SITE_URL}/contact` },
    ],
  };

  return (
    <div>
      <SEOHead
        title="Purdue SEARCH | Space Analog Astronaut Research Chapter"
        description="SEARCH is a student-led space research organization at Purdue University. We run astronaut training, bioastronautics research, and space habitat programs."
        canonical="/"
        fullTitle
      />
      <JsonLd data={websiteSchema()} />
      <JsonLd data={siteNavigationSchema} />
      <Navbar />

      {/* ===== HERO ===== */}
      <main id="main-content" className="hero-scroll-extender" ref={heroRef}>
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
        <div className="container text-center" ref={heroContentRef}>
          <motion.div className="hero-wordmark" style={{ opacity: wordmarkOpacity, scale: wordmarkScale }}>SEARCH</motion.div>
          <h1 className="display-3 mb-3" style={{ color: '#fff' }}>
            Space and Earth Analogs Research<br />Chapter of Purdue
          </h1>
          <p style={{ fontSize: '1.1rem', color: 'rgba(255,255,255,0.8)', fontWeight: 300, maxWidth: '560px', margin: '0 auto 2rem' }}>
            Student-led human spaceflight research, training, and outreach — right here on Earth.
          </p>
          <div className="d-flex justify-content-center" style={{ gap: '1rem', flexWrap: 'wrap' }}>
            <a
              ref={heroCtaPrimaryRef}
              href={SLACK_JOIN_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Join our Slack (opens in a new tab)"
              className="btn-slide-fill"
              style={{ padding: '0.65rem 2rem', fontFamily: 'var(--font-body)', fontWeight: 500 }}
            >
              <span><i className="fab fa-slack mr-2" aria-hidden="true" />Join our Slack</span>
            </a>
            <Link ref={heroCtaSecondaryRef} to="/about" className="btn-slide-white" style={{ padding: '0.65rem 2rem', fontFamily: 'var(--font-body)', fontWeight: 500 }}>
              <span>Meet the Team</span>
            </Link>
          </div>
          <div style={{ marginTop: '3rem' }}>
            <img loading="lazy" src="/icons/PU-H-Full-Rev-RGB.png" style={{ width: '12em', opacity: 0.85 }} alt="Purdue University" />
          </div>
        </div>
      </div>
      </main>{/* /hero-scroll-extender */}

      {/* ===== UPCOMING EVENTS — public Constellation events (isPublic, non-deadline) ===== */}
      <PublicEventsCalendar />

      <section id="client" className="overlay parallax-host" aria-label="Outreach partners">
        <div className="parallax-bg" ref={clientBgRef} style={{ backgroundImage: 'url(/bg.webp)' }} aria-hidden="true" />
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

      {/* ===== FIND YOUR TEAM — one list replaces mission pillars, subteam
          cards and the rotating programs quote, which all said the same thing ===== */}
      <section id="find-your-team" className="stars-host" ref={teamSectionRef} aria-labelledby="find-your-team-heading">
        {showStars && (
          <Suspense fallback={null}>
            <StarfieldCanvas />
          </Suspense>
        )}
        <div className="container stars-content">
          <div className="team-intro" data-aos="fade-up">
            <h2 id="find-your-team-heading" className="section-title">Find your <b>team</b></h2>
            <p>
              Every team is student-led. We've competed in national challenges such as NASA RASC-AL
              and NASA SUITS, qualifying for the on-site round at Johnson Space Center in 2024.
            </p>
          </div>
          <div className="team-list-head" aria-hidden="true">
            <span>Team</span>
            <span>What it is</span>
            <span>What you'd do</span>
          </div>
          <ul className="team-list" ref={teamListRef}>
            {TEAMS.map(({ to, name, what, work }) => (
              <li key={to} className="team-row-item">
                <Link to={to} className="team-row">
                  <h3 className="team-row-name">{name}</h3>
                  <p className="team-row-what">{what}</p>
                  <p className="team-row-work">
                    <span className="team-row-label">What you'd do: </span>{work}
                  </p>
                  <i className="fas fa-arrow-right team-row-arrow" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ===== JOIN BAND — the club's real join step, mid-page ===== */}
      <section id="join-band" className="join-band" aria-labelledby="join-band-heading">
        <div className="container join-band-inner">
          <div className="join-band-copy">
            <h2 id="join-band-heading">Find your crew on Slack</h2>
            <p>
              SEARCH runs on Slack. Join to meet members, follow subteam channels,
              and hear about the next meeting. Every major is welcome.
            </p>
          </div>
          <a
            href={SLACK_JOIN_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Join our Slack (opens in a new tab)"
            className="btn-slide-white join-band-btn"
          >
            <span><i className="fab fa-slack mr-2" aria-hidden="true" />Join our Slack</span>
          </a>
        </div>
      </section>

      {/* ===== ABOUT SEARCH — 2-column brand story ===== */}
      <section id="about-search" className="about-video-section" ref={aboutSearchSectionRef}>
        {showDroneVideo && (
          <video className="about-video-bg" src="/videos/drone_tour_purdue.webm" autoPlay loop muted playsInline preload="metadata" />
        )}
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
              <img loading="lazy" src="/bg-2.webp" alt="SEARCH members at the station" />
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
          <div className="ig-grid" ref={igGridRef}>
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

      <Footer />
    </div>
  );
};

export default Home;
