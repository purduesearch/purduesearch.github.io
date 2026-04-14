import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const Analogs = () => {
  useEffect(() => {
    if (window.AOS) window.AOS.init({ once: true });
  }, []);

  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = '/analogs_bg.jpg';
    document.head.appendChild(link);
    return () => { if (document.head.contains(link)) document.head.removeChild(link); };
  }, []);

  return (
    <div>
      <title>Analog Programs | Purdue SEARCH</title>
      <meta name="description" content="Purdue SEARCH's business team organizes research trips to analog facilities including Biosphere 2 and Kennedy Space Center." />
      <Navbar />
      <div id="main-content" className="jumbotron jumbotron-single d-flex align-items-center" style={{ backgroundImage: 'url(/analogs_bg.jpg)' }}>
        <div className="container text-center">
          <h1 className="display-2 mb-4">Analog Programs</h1>
          <p className="header-sub-title" style={{ fontWeight: 'bold', fontSize: '120%' }}>
            SEARCH places students inside real analog environments — closed habitats,
            remote desert stations, and space agency facilities — to test hardware,
            build mission skills, and connect classroom theory to spaceflight operations.
          </p>
        </div>
      </div>
      {/* ===== WHAT IS AN ANALOG MISSION? ===== */}
      <section id="analogs-intro">
        <div className="container">
          <div className="title-wrap mb-5" data-aos="fade-up">
            <h2 className="section-title">What is an <b>Analog Mission?</b></h2>
            <p className="section-sub-title">
              Analog environments simulate the conditions of spaceflight — allowing researchers
              and engineers to test hardware, procedures, and human performance without leaving Earth.
            </p>
          </div>
          <div className="mg-media-row" data-aos="fade-up">
            <div className="mg-media-text">
              <span className="about-section-label">Why Analogs Matter</span>
              <h3 style={{ fontFamily: 'var(--font-heading)', marginBottom: '1rem' }}>
                Testing on Earth for Space
              </h3>
              <p style={{ color: 'var(--color-muted)', lineHeight: '1.8' }}>
                Analog missions allow teams to identify failure modes, refine operational protocols,
                and validate equipment in high-fidelity simulated environments before committing
                to actual spaceflight hardware. From pressurized desert habitats to closed ecological
                systems, each site offers a different slice of the space mission experience.
              </p>
              <p style={{ color: 'var(--color-muted)', lineHeight: '1.8' }}>
                SEARCH uses analog field experiences to bridge the gap between academic research and
                operational readiness — giving students direct exposure to the constraints, logistics,
                and teamwork demands of long-duration missions. These trips also generate data that
                feeds back into our habitat design and hydroponics research.
              </p>
              <p style={{ color: 'var(--color-muted)', lineHeight: '1.8' }}>
                Analog experience is also an outreach multiplier: students who have lived in a habitat,
                performed simulated EVAs, or observed life support systems first-hand are far more
                effective at communicating the realities of space exploration to the public.
              </p>
            </div>
            <div className="mg-media-img" data-aos="fade-left">
              <img loading="lazy" src="/analogs/2022/habitat.webp" alt="MDRS Habitat analog environment" />
            </div>
          </div>
        </div>
      </section>

      {/* ===== RESEARCH TRIPS GRID ===== */}
      <section id="analogs-trips">
        <div className="container">
          <div className="title-wrap mb-5" data-aos="fade-up">
            <h2 className="section-title">Field <b>Trips &amp; Site Visits</b></h2>
            <p className="section-sub-title">
              Hands-on visits to world-class analog and research facilities expand our understanding
              of closed-loop habitats and space exploration logistics.
            </p>
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
                  microgreen chamber design approaches.
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
                  spaceflight hardware.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="blog" className="bg-grey">
        <div className="container">
          <div className="section-content">
            <div className="title-wrap mb-5" data-aos="fade-up">
              <h2 className="section-title">Latest <b>news</b></h2>
              <p className="section-sub-title">Analogs team has collaborated with MDRS and Hi-SEAS. Here are some of our past projects</p>
            </div>
            <div className="row">
              <div className="col-md-12 blog-holder">
                <div className="row">
                  <div className="col-md-4 blog-item-wrapper" data-aos="fade-up">
                    <div className="blog-item">
                      <div className="blog-img">
                        <Link to="/analogs/mdrs-utah"><img loading="lazy" src="/analogs/2022/mdrs_bg.webp" alt="SEARCH Goes to Mars!" /></Link>
                      </div>
                      <div className="blog-text">
                        <div className="blog-tag"><a href="#top"><h6><small>MDRS</small></h6></a></div>
                        <div className="blog-title"><Link to="/analogs/mdrs-utah"><h4>SEARCH Goes to Mars!</h4></Link></div>
                        <div className="blog-meta"><p className="blog-date">18 Feb 2024</p></div>
                        <div className="blog-desc"><p>Read about our trip to MDRS in Utah to experience what it's like to live in an analog Mars habitat.</p></div>
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

      {/* ===== CTA ===== */}
      <section style={{ background: 'var(--color-bg-secondary)', padding: '3rem 0', textAlign: 'center' }}>
        <div className="container">
          <h2 className="section-title" style={{ marginBottom: '1rem' }}>
            Want to be part of <b>SEARCH</b>?
          </h2>
          <p style={{ color: 'var(--color-muted)', marginBottom: '1.5rem' }}>
            SEARCH is open to all Purdue students. Join a team that goes beyond the classroom.
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

export default Analogs;
