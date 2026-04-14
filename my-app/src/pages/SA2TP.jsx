import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Player } from '@lottiefiles/react-lottie-player';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

gsap.registerPlugin(ScrollTrigger);

const SA2TP = () => {
  const videoRef = useRef(null);
  const heroRef  = useRef(null);
  const planeRef = useRef(null);

  useEffect(() => {
    if (window.AOS) window.AOS.init({ once: true });
  }, []);

  // GSAP ScrollTrigger — scrub video through hero extender
  useEffect(() => {
    const video = videoRef.current;
    const hero  = heroRef.current;
    if (!video || !hero) return;

    video.pause();

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const initScrub = () => {
      if (video.duration <= 0) return;
      const st = ScrollTrigger.create({
        trigger: hero,
        start: 'top top',
        end: 'bottom top',
        scrub: true,
        onUpdate: (self) => {
          video.currentTime = 1.5 + self.progress * (video.duration - 1.5);
        },
      });
      return st;
    };

    let st;
    if (video.readyState >= 1) {
      st = initScrub();
    } else {
      video.addEventListener('loadedmetadata', () => { st = initScrub(); }, { once: true });
    }

    return () => {
      if (st) st.kill();
    };
  }, []);

  // Plane sweep animation on scroll into flight section
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const plane = planeRef.current;
    if (!plane) return;

    const trigger = document.getElementById('sa2tp-flight');
    if (!trigger) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          plane.classList.add('fly');
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(trigger);
    return () => observer.disconnect();
  }, []);

  return (
    <div>
      <title>SA²TP Analog Astronaut Training | Purdue SEARCH</title>
      <meta name="description" content="The Student Analog Astronaut Training Program at Purdue prepares students with flight training, skydiving, scuba certification, NASA facility visits, and more." />
      <Navbar />

      {/* ===== SCROLL-SCRUBBED VIDEO HERO ===== */}
      <div id="main-content" className="hero-scroll-extender" ref={heroRef}>
      <div className="video-scrub-hero" style={{ height: '100vh', overflow: 'hidden', background: '#12121c' }}>
        <video
          ref={videoRef}
          src="/sa2tp/Plane_Panorama.webm"
          muted
          playsInline
          preload="auto"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0 }}
        />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(18,18,28,0.35) 0%, rgba(18,18,28,0.6) 100%)', zIndex: 1 }} />
        <div className="container text-center" style={{ position: 'relative', zIndex: 2, top: '50%', transform: 'translateY(-50%)' }}>
          <h1 className="display-2 mb-4" style={{ color: '#fff', fontFamily: 'var(--font-heading)', fontWeight: 700 }}>
            Student Analog Astronaut<br />Training Program
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '1.1rem', maxWidth: '560px', margin: '0 auto 1.5rem' }}>
            SA<sup>2</sup>TP — preparing the next generation of astronauts through flight, skydiving, scuba training, and NASA facility visits.
          </p>
          <div className="cta-lottie-wrap">
            <Player
              autoplay
              loop
              src="/animations/rocket-launch.json"
              style={{ height: 56, width: 56 }}
            />
            <a
              href="https://forms.gle/chCitrDyU1jkYjET9"
              className="btn-slide-fill"
              target="_blank"
              rel="noopener noreferrer"
              style={{ padding: '0.65rem 2rem', display: 'inline-block' }}
            >
              <span>Apply — Crew 4</span>
            </a>
          </div>
        </div>
      </div>
      </div>{/* /hero-scroll-extender */}

      {/* ===== PROGRAM OVERVIEW ===== */}
      <section id="sa2tp-overview" className="bg-grey">
        <div className="container">
          <div className="row align-items-center">
            <div className="col-lg-7" data-aos="fade-right">
              <span className="about-section-label">Established Summer 2023</span>
              <h2 className="section-title" style={{ marginBottom: '1rem' }}>What is <b>SA²TP?</b></h2>
              <p style={{ color: 'var(--color-muted)', lineHeight: '1.8', marginBottom: '1rem' }}>
                The Student Analog Astronaut Training Program (SA²TP) is a year-long immersive program
                within SEARCH that gives students hands-on experience with the physical, cognitive, and
                technical demands of analog astronaut life. Through a structured curriculum of capstone
                activities, workshops, lectures, and collaborative projects, trainees develop the
                multidisciplinary skills required to operate in isolated and extreme environments.
              </p>
              <p style={{ color: 'var(--color-muted)', lineHeight: '1.8', marginBottom: '1rem' }}>
                Each crew is guided by a <strong>Logistics Commander</strong> — who manages scheduling,
                logistics, and crew coordination — and a <strong>Crew Commander</strong> who leads the
                trainees through the program's capstones and evaluations. Training spans physical
                conditioning (Co-Rec workouts, sports, and outdoor challenges), cognitive exercises,
                mission design workshops, and real-world field experiences.
              </p>
              <p style={{ color: 'var(--color-muted)', lineHeight: '1.8' }}>
                SA²TP collaborates closely with the{' '}
                <strong>Purdue Space Program (PSP)</strong>,{' '}
                <strong>Lunabotics</strong>, and the{' '}
                <strong>Purdue Outing Club (POC)</strong> to deliver a breadth of training that
                no single student organization could offer alone. Three crews have completed the
                program since its founding in Summer 2023.
              </p>
            </div>
            <div className="col-lg-5 text-center" data-aos="fade-left" style={{ padding: '2rem' }}>
              <img
                loading="lazy"
                src="/sa2tp/SA2TP_Logo.webp"
                alt="SA2TP Logo"
                style={{ maxWidth: '280px', width: '100%', filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.15))' }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ===== FLIGHT TRAINING ===== */}
      <section id="sa2tp-flight">
        <div className="container">
          <div className="title-wrap mb-5" data-aos="fade-up">
            <h2 className="section-title">Flight <b>Training</b></h2>
            <p className="section-sub-title">
              SA²TP trainees earn hands-on time in light aircraft, developing the situational awareness and instrument familiarity expected of analog astronauts.
            </p>
          </div>
          <div className="mg-media-row" data-aos="fade-up">
            <div className="mg-media-text">
              <span className="about-section-label">Cessna & Cirrus — Purdue Aviation LLC</span>
              <h3 style={{ fontFamily: 'var(--font-heading)', marginBottom: '1rem' }}>
                In the Cockpit
              </h3>
              <p style={{ color: 'var(--color-muted)', lineHeight: '1.8' }}>
                Flight training is a cornerstone of the SA²TP curriculum. Working alongside certified
                flight instructors at Purdue Aviation LLC, trainees learn the fundamentals of aircraft
                operation — from pre-flight checks and radio communications to instrument interpretation
                and emergency procedures.
              </p>
              <p style={{ color: 'var(--color-muted)', lineHeight: '1.8' }}>
                The experience connects directly to spaceflight readiness: managing complex systems
                under pressure, interpreting real-time data, and maintaining crew coordination are
                skills that transfer from the cockpit to the capsule.
              </p>
            </div>
            <div className="mg-media-img" data-aos="fade-left">
              <img loading="lazy" src="/sa2tp/Plane.webp" alt="SA2TP Flight Training" />
            </div>
          </div>
        </div>

        {/* Plane sweep divider */}
        <div className="plane-sweep-divider" style={{ position: 'relative', height: '64px', overflow: 'hidden', margin: '2rem 0' }}>
          <div className="plane-icon" ref={planeRef} aria-hidden="true" style={{ fontSize: '2rem' }}>
            ✈
          </div>
          <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '1px', background: 'var(--color-border)', zIndex: 0 }} />
        </div>
      </section>

      {/* ===== SKYDIVING ===== */}
      <section id="sa2tp-skydiving" className="video-bg-section" style={{ minHeight: '480px' }}>
        <video
          className="section-video"
          src="/sa2tp/Skydiving.webm"
          autoPlay
          loop
          muted
          playsInline
        />
        <div className="section-video-overlay" />
        <div className="section-video-content container" style={{ padding: '6rem 0' }}>
          <div className="row">
            <div className="col-lg-6 col-md-8" data-aos="fade-right">
              <span className="about-section-label" style={{ color: 'rgba(255,255,255,0.7)' }}>Altitude Training</span>
              <h2 className="section-title" style={{ color: '#fff' }}>Skydiving <b>Certification</b></h2>
              <p style={{ color: 'rgba(255,255,255,0.8)', lineHeight: '1.8', marginBottom: '1.5rem' }}>
                SA²TP trainees complete tandem and supervised solo skydiving jumps to build
                comfort with high-altitude environments, freefall dynamics, and parachute systems.
                The training cultivates composure and decisive action — qualities essential for
                extravehicular activities and emergency egress scenarios.
              </p>
              <p style={{ color: 'rgba(255,255,255,0.7)', lineHeight: '1.8' }}>
                Each jump is debriefed against spaceflight analogies: altitude awareness maps to
                orbital mechanics; parachute deployment timing parallels re-entry sequencing;
                body position control mirrors EVA attitude control.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Bubble divider */}
      <div className="bubble-divider" aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            className="bubble"
            style={{
              left: `${10 + i * 11}%`,
              width: `${14 + (i % 3) * 8}px`,
              height: `${14 + (i % 3) * 8}px`,
              animationDelay: `${i * 0.35}s`,
            }}
          />
        ))}
      </div>

      {/* ===== SCUBA ===== */}
      <section id="sa2tp-scuba">
        <div className="container">
          <div className="title-wrap mb-5" data-aos="fade-up">
            <h2 className="section-title">Scuba <b>Certification</b></h2>
            <p className="section-sub-title">
              Neutral buoyancy is the closest Earth-bound analog to microgravity — SEARCH trainees
              complete open-water SCUBA certification (DRIS) to experience it firsthand.
            </p>
          </div>
          <div className="scuba-grid" data-aos="fade-up">
            <div>
              <img loading="lazy" src="/sa2tp/Scuba.webp" alt="Scuba Training" style={{ width: '100%', borderRadius: '10px', objectFit: 'cover', aspectRatio: '4/3' }} />
            </div>
            <div>
              <img loading="lazy" src="/sa2tp/Scuba2.webp" alt="Scuba Training 2" style={{ width: '100%', borderRadius: '10px', objectFit: 'cover', aspectRatio: '4/3' }} />
            </div>
          </div>
          <div className="row mt-5">
            <div className="col-lg-8 offset-lg-2 text-center" data-aos="fade-up">
              <p style={{ color: 'var(--color-muted)', lineHeight: '1.8' }}>
                Trainees earn Open Water SCUBA certification through a combined pool and open-water
                curriculum. Underwater work develops equipment familiarity, emergency response, and
                the patience to work methodically in a foreign environment — directly paralleling
                suited operations inside a spacecraft or habitat.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== ADDITIONAL CAPSTONES ===== */}
      <section id="sa2tp-capstones" className="bg-grey">
        <div className="container">
          <div className="title-wrap mb-5" data-aos="fade-up">
            <h2 className="section-title">More <b>Capstone Experiences</b></h2>
            <p className="section-sub-title">
              Beyond flight, skydiving, and scuba, SA²TP crews undertake a full slate of
              capstone activities designed to build situational awareness, team cohesion, and
              astronaut-relevant skills.
            </p>
          </div>
          <div className="row">

            {/* NASA Adult Space Flight Academy */}
            <div className="col-lg-3 col-md-6 mb-4" data-aos="fade-up" data-aos-delay="0">
              <div className="feature-item" style={{ textAlign: 'center', height: '100%' }}>
                <div className="feature-icon" style={{ marginBottom: '1rem' }}>
                  <i className="fas fa-rocket" style={{ fontSize: '2.2rem', color: 'var(--color-accent)' }} />
                </div>
                <h5 style={{ fontFamily: 'var(--font-heading)', marginBottom: '0.6rem' }}>NASA Space Academy</h5>
                <p style={{ color: 'var(--color-muted)', fontSize: '0.92rem', lineHeight: '1.7' }}>
                  Trainees travel to NASA Marshall Space Flight Center in Huntsville, AL for the
                  Adult Space Flight Academy — experiencing mission simulations, hardware walkthroughs,
                  and tours of active NASA facilities.
                </p>
              </div>
            </div>

            {/* iFly Indoor Skydiving */}
            <div className="col-lg-3 col-md-6 mb-4" data-aos="fade-up" data-aos-delay="80">
              <div className="feature-item" style={{ textAlign: 'center', height: '100%' }}>
                <div className="feature-icon" style={{ marginBottom: '1rem' }}>
                  <i className="fas fa-wind" style={{ fontSize: '2.2rem', color: 'var(--color-accent)' }} />
                </div>
                <h5 style={{ fontFamily: 'var(--font-heading)', marginBottom: '0.6rem' }}>Indoor Skydiving (iFly)</h5>
                <p style={{ color: 'var(--color-muted)', fontSize: '0.92rem', lineHeight: '1.7' }}>
                  Before or after their real jump, trainees train in a vertical wind tunnel at iFly.
                  Controlled body-flight practice improves spatial awareness, core stability, and
                  the muscle memory needed for safe freefall.
                </p>
              </div>
            </div>

            {/* Orienteering */}
            <div className="col-lg-3 col-md-6 mb-4" data-aos="fade-up" data-aos-delay="160">
              <div className="feature-item" style={{ textAlign: 'center', height: '100%' }}>
                <div className="feature-icon" style={{ marginBottom: '1rem' }}>
                  <i className="fas fa-map-marked-alt" style={{ fontSize: '2.2rem', color: 'var(--color-accent)' }} />
                </div>
                <h5 style={{ fontFamily: 'var(--font-heading)', marginBottom: '0.6rem' }}>Orienteering</h5>
                <p style={{ color: 'var(--color-muted)', fontSize: '0.92rem', lineHeight: '1.7' }}>
                  In partnership with the Purdue Outing Club, crews complete a wilderness orienteering
                  challenge — navigating terrain using map and compass, mirroring the wayfinding
                  and situational-awareness demands of planetary surface operations.
                </p>
              </div>
            </div>

            {/* ASTRO-USA Habitat */}
            <div className="col-lg-3 col-md-6 mb-4" data-aos="fade-up" data-aos-delay="240">
              <div className="feature-item" style={{ textAlign: 'center', height: '100%' }}>
                <div className="feature-icon" style={{ marginBottom: '1rem' }}>
                  <i className="fas fa-home" style={{ fontSize: '2.2rem', color: 'var(--color-accent)' }} />
                </div>
                <h5 style={{ fontFamily: 'var(--font-heading)', marginBottom: '0.6rem' }}>ASTRO-USA Habitat</h5>
                <p style={{ color: 'var(--color-muted)', fontSize: '0.92rem', lineHeight: '1.7' }}>
                  Crews interact with SEARCH's own analog habitat — participating in mission-control
                  scenarios and closed-loop habitat simulations that connect the training program
                  directly to SEARCH's long-term analog mission objectives.
                </p>
              </div>
            </div>

          </div>

          {/* Workshops & Training row */}
          <div className="row mt-4" data-aos="fade-up">
            <div className="col-lg-10 offset-lg-1">
              <div style={{ background: 'var(--color-bg)', borderRadius: 12, padding: '1.8rem 2rem', border: '1px solid var(--color-border)' }}>
                <h5 style={{ fontFamily: 'var(--font-heading)', marginBottom: '1rem' }}>
                  <i className="fas fa-chalkboard-teacher" style={{ color: 'var(--color-accent)', marginRight: '0.5rem' }} />
                  Workshops &amp; Supplemental Training
                </h5>
                <div className="row">
                  <div className="col-md-4">
                    <p style={{ color: 'var(--color-muted)', fontSize: '0.92rem', lineHeight: '1.7', marginBottom: 0 }}>
                      <strong style={{ color: 'var(--color-text)' }}>Cognitive &amp; Technical</strong><br />
                      Mission Design Workshop · Kerbal Space Program · BIDC Design Sprint · Envision Center VR · Knowledge Lab challenges
                    </p>
                  </div>
                  <div className="col-md-4">
                    <p style={{ color: 'var(--color-muted)', fontSize: '0.92rem', lineHeight: '1.7', marginBottom: 0 }}>
                      <strong style={{ color: 'var(--color-text)' }}>Physical Training</strong><br />
                      Co-Rec strength &amp; conditioning · Basketball (a crew tradition since Crew 1) · Outdoor fitness challenges
                    </p>
                  </div>
                  <div className="col-md-4">
                    <p style={{ color: 'var(--color-muted)', fontSize: '0.92rem', lineHeight: '1.7', marginBottom: 0 }}>
                      <strong style={{ color: 'var(--color-text)' }}>Lectures &amp; Outreach</strong><br />
                      Expert guest lectures · PSP &amp; Lunabotics collaboration sessions · Public speaking events &amp; outreach
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== CREW LEGACY ===== */}
      <section id="sa2tp-crews">
        <div className="container">
          <div className="title-wrap mb-5" data-aos="fade-up">
            <h2 className="section-title">Crew <b>Legacy</b></h2>
            <p className="section-sub-title">
              Three crews have completed the SA²TP program since its founding in Summer 2023,
              each earning a mission patch that represents their cohort's identity and journey.
            </p>
          </div>
          <div className="row justify-content-center">

            {/* Crew 1 */}
            <div className="col-lg-4 col-md-6 mb-5 text-center" data-aos="fade-up" data-aos-delay="0">
              <img
                loading="lazy"
                src="/sa2tp/Crew1_Patch.webp"
                alt="SA2TP Crew 1 Mission Patch"
                style={{ width: '180px', height: '180px', objectFit: 'contain', marginBottom: '1.2rem', filter: 'drop-shadow(0 6px 18px rgba(0,0,0,0.18))' }}
              />
              <h5 style={{ fontFamily: 'var(--font-heading)', marginBottom: '0.3rem' }}>Crew 1 — Summer 2023</h5>
              <p style={{ color: 'var(--color-muted)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                <em>SA²TP Lead: Émilie Laflèche</em>
              </p>
              <p style={{ color: 'var(--color-muted)', fontSize: '0.92rem', lineHeight: '1.6' }}>
                Radon · Becker · Jackson · McGeary · Kung · Laflèche
              </p>
            </div>

            {/* Crew 2 */}
            <div className="col-lg-4 col-md-6 mb-5 text-center" data-aos="fade-up" data-aos-delay="100">
              <img
                loading="lazy"
                src="/sa2tp/Crew2_Patch.webp"
                alt="SA2TP Crew 2 Mission Patch"
                style={{ width: '180px', height: '180px', objectFit: 'contain', marginBottom: '1.2rem', filter: 'drop-shadow(0 6px 18px rgba(0,0,0,0.18))' }}
              />
              <h5 style={{ fontFamily: 'var(--font-heading)', marginBottom: '0.3rem' }}>Crew 2 — 2024</h5>
              <p style={{ color: 'var(--color-muted)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                <em>SA²TP Lead: John Peters</em>
              </p>
              <p style={{ color: 'var(--color-muted)', fontSize: '0.92rem', lineHeight: '1.6' }}>
                Montilla-Celis · Sanchez · Sanders · Verma · Shalabi · Garcia · Tyagi
              </p>
            </div>

            {/* Crew 3 */}
            <div className="col-lg-4 col-md-6 mb-5 text-center" data-aos="fade-up" data-aos-delay="200">
              <img
                loading="lazy"
                src="/sa2tp/Crew3_Patch.webp"
                alt="SA2TP Crew 3 Mission Patch"
                style={{ width: '180px', height: '180px', objectFit: 'contain', marginBottom: '1.2rem', filter: 'drop-shadow(0 6px 18px rgba(0,0,0,0.18))' }}
              />
              <h5 style={{ fontFamily: 'var(--font-heading)', marginBottom: '0.3rem' }}>Crew 3 — Summer 2025</h5>
              <p style={{ color: 'var(--color-muted)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                <em>SA²TP Lead: Sam Waymire</em>
              </p>
              <p style={{ color: 'var(--color-muted)', fontSize: '0.92rem', lineHeight: '1.6' }}>
                Majchrowski · Williamson · Atri · Garcia · Grambart
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* ===== PAST PROJECTS ===== */}
      <section id="blog" className="bg-grey">
        <div className="container">
          <div className="section-content">
            <div className="title-wrap mb-5" data-aos="fade-up">
              <h2 className="section-title">Past Projects</h2>
            </div>
            <div className="row">
              <div className="col-md-12 blog-holder">

                <h3><b>2024–25</b></h3><br />
                <div className="row">
                  <div className="col-md-4 blog-item-wrapper" data-aos="fade-up">
                    <div className="blog-item">
                      <div className="blog-img">
                        <img loading="lazy" src="/sa2tp/Crew3_Patch.webp" alt="Crew 3 Summer 2025" style={{ objectFit: 'contain', background: '#f4f4f4' }} />
                      </div>
                      <div className="blog-text">
                        <div className="blog-tag"><a href="#top"><h6><small>SA²TP</small></h6></a></div>
                        <div className="blog-title"><h4>Crew 3 — Summer 2025</h4></div>
                        <div className="blog-meta"><p className="blog-date">Summer 2025</p></div>
                        <div className="blog-desc">
                          <p>Crew 3 completed the SA²TP program under SA²TP Lead Sam Waymire, tackling the full capstone slate including NASA Space Academy, skydiving, scuba, and an ASTRO-USA habitat mission scenario.</p>
                        </div>
                        <div className="blog-author"><p>by Purdue SEARCH</p></div>
                        <div className="blog-share-wrapper">
                          <a className="blog-share" href="https://www.instagram.com/purdue_search/" target="_blank" rel="noopener noreferrer"><i className="fab fa-instagram" /></a>
                          <a className="blog-share" href="https://twitter.com/purduesearch" target="_blank" rel="noopener noreferrer"><i className="fab fa-twitter-square" /></a>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <br />
                <h3><b>2023–24</b></h3><br />
                <div className="row">
                  <div className="col-md-4 blog-item-wrapper" data-aos="fade-up">
                    <div className="blog-item">
                      <div className="blog-img">
                        <Link to="/sa2tp/rod-interview"><img loading="lazy" src="/sa2tp/2023/interview_bg.webp" alt="Leadership on SA2TP" /></Link>
                      </div>
                      <div className="blog-text">
                        <div className="blog-tag"><a href="#top"><h6><small>SA²TP</small></h6></a></div>
                        <div className="blog-title"><Link to="/sa2tp/rod-interview"><h4>Leadership on SA²TP</h4></Link></div>
                        <div className="blog-meta"><p className="blog-date">2 Nov 2023</p></div>
                        <div className="blog-desc"><p>This is an interview by Purdue Exponent, with the members of SEARCH regarding our summer analog astronaut training program</p></div>
                        <div className="blog-author"><p>by James Kling</p></div>
                        <div className="blog-share-wrapper">
                          <a className="blog-share" href="https://www.instagram.com/purdue_search/" target="_blank" rel="noopener noreferrer"><i className="fab fa-instagram" /></a>
                          <a className="blog-share" href="https://twitter.com/purduesearch" target="_blank" rel="noopener noreferrer"><i className="fab fa-twitter-square" /></a>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="col-md-4 blog-item-wrapper" data-aos="fade-up">
                    <div className="blog-item">
                      <div className="blog-img">
                        <Link to="/sa2tp/crew1"><img loading="lazy" src="/sa2tp/2023/PXL_20230808_201504997.webp" alt="Summer 23 Astronaut Training" /></Link>
                      </div>
                      <div className="blog-text">
                        <div className="blog-tag"><a href="#top"><h6><small>SA²TP</small></h6></a></div>
                        <div className="blog-title"><Link to="/sa2tp/crew1"><h4>Summer 23 Astronaut Training</h4></Link></div>
                        <div className="blog-meta"><p className="blog-date">30 Jun 2023</p></div>
                        <div className="blog-desc"><p>Our first ever student run astronaut training program happened in the summer of 2023. The program involved fitness training, flight training, scuba certification and a trip to NASA in Huntsville, Alabama</p></div>
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

export default SA2TP;
