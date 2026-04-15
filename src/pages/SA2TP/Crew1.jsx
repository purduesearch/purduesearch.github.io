import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import Breadcrumb from '../../components/Breadcrumb';
import SEOHead from '../../components/SEOHead';

const Crew1 = () => {
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
        { '@type': 'ListItem', 'position': 2, 'name': 'SA²TP', 'item': 'https://purduesearch.github.io/sa2tp' },
        { '@type': 'ListItem', 'position': 3, 'name': 'Crew 1 — Summer 2023' },
      ],
    });
    document.head.appendChild(script);
    return () => { if (document.head.contains(script)) document.head.removeChild(script); };
  }, []);

  return (
    <div>
      <SEOHead
        title="SA²TP Crew 1 — Summer 2023"
        description="Summer 2023 recap of Purdue SEARCH's first Student Analog Astronaut Training Program — flight training, scuba, fitness, and a visit to NASA's Space Academy."
        canonical="/sa2tp/crew1"
      />
      <Navbar />
      <Breadcrumb />
      <div id="main-content" className="jumbotron-post jumbotron-single d-flex align-items-center" style={{ backgroundImage: 'url(/software/2023_24/SUITS/bg.webp)' }}>
        <div className="container text-center" style={{ top: 30 }}>
          <h1 className="display-2 mb-4">Crew 1 Mission 2023</h1>
        </div>
      </div>

      <section style={{ top: 25 }}>
        <div className="shadow container" style={{ maxWidth: '83%', marginLeft: '8%', marginRight: '8%', paddingRight: 8, paddingTop: 8, marginBottom: '8%', paddingBottom: 8 }}>
          <div className="section-content blog-content">
            <div className="row" style={{ maxWidth: '100%' }}>
              <div className="col-md-25 offset-md-1 mt-1" style={{ maxWidth: '100%' }}>
                <div style={{ marginLeft: '1%', marginRight: '10%', textAlign: 'justify' }}>
                  <h4>About the Mission</h4>
                  <img loading="lazy"className="float-left" width="220px" src="/sa2tp/2023/logo.webp" alt="SA2TP Logo" />
                  <i>In Purdue's Space and Earth Analogs Research Chapter (SEARCH), we not only dream of the impossible, but work
                    to make it a reality. Since 2022, we have coordinated analog astronaut training programs at Purdue alongside
                    partner organizations including The Mars Society. In our newest collaborative initiative with Purdue Space
                    Program (PSP) and Purdue Lunabotics, the Student-Analog Astronaut Training Program (SA2TP), we are reaching
                    higher than ever before, truly bound by nothing but our lofty aspirations of making space exploration
                    accessible for all. We're going places, and we can't wait to meet you there.</i>
                  <br /><br />
                  <img loading="lazy"src="/sa2tp/2023/PXL_20230808_201504997.webp" alt="SA2TP members at the station" style={{ borderRadius: 10 }} />
                  <br /><br />
                  <h4>About SA2TP</h4>
                  A program unlike any other, the SA2 TP aims to build a community of space-minded individuals
                  that train, network, and learn together in an environment that supports their career
                  aspirations. For the program's inaugural run, the top 6 applicants (both graduate and
                  undergraduate students) will be selected to explore the themes of Science and
                  Technology, Health and Fitness, and Astronautics and Spaceflight over 3 weeks
                  of intensive training, taking place from July 24 to August 13, 2023.
                  We are collaborating with industry experts and organizing a number of skill-building
                  activities, including 3D printing challenges, hackathons, flight tests, fitness/nutrition workshops, and more. The SA2TP will
                  culminate in the once-in-a-lifetime experience of attending NASA's Adult
                  Space Academy (Aug. 11-13) in Huntsville, AL, where our participants will put their
                  new skills to use and experience a simulation of life as an astronaut candidate.
                  <br /><br />
                  <img loading="lazy"className="float-right" src="/sa2tp/2023/IMG_20230813_115931.webp" alt="Space Academy" style={{ borderRadius: 20, maxWidth: '35%', padding: '1%' }} />
                  <br />
                  <br />
                  <h4>Goals</h4>
                  <h5>Science and Technology</h5>
                  Astronauts must have a comprehensive
                  knowledge of science, technology, engineering,
                  and math (STEM) to solve space exploration's
                  biggest challenges in real time. The SA2TP is
                  leading coding hackathons, space agriculture
                  workshops, 3D printing challenges, and more for
                  participants to learn to think like an astronaut.
                  <br /><br />
                  <h5>Health and Fitness</h5>
                  A healthy astronaut corps in mind, body, and
                  soul is essential to ensure a successful mission.
                  Space psychology, nutrition, and fitness
                  workshops during the SA2TP will highlight the
                  challenges the human body experiences in
                  space and educate on mitigation strategies.
                  <br /><br />
                  <h5>Astronautics and Spaceflight</h5>
                  Co-led by PSP and Lunabotics, SA2TP
                  participants will gain a firsthand understanding
                  of the mechanical systems keeping space
                  missions alive, including rocket propulsion and
                  human-rover interfacing.
                  <br /><br />
                  <br />
                  <img loading="lazy"className="center" src="/sa2tp/2023/IMG_20230811_194834.webp" alt="Activities" style={{ borderRadius: 10 }} />
                  <br /><br />
                  <h4>Activities</h4>
                  <h5>Astrodynamics</h5>
                  <ul>
                    <li>Intro to Orbital Mechanics Lecture</li>
                    <li>Astrodynamics Simulation Workshop</li>
                    <li>Kerbal Space Program Team Bonding Challenge</li>
                  </ul>
                  <h5>Health</h5>
                  <ul>
                    <li>Space Nutrition Seminar with former CSA space nutrition specialist Katherine Dulong</li>
                    <li>Space Psychology Seminar</li>
                    <li>Fitness Sessions</li>
                  </ul>
                  <h5>Mechanical</h5>
                  <ul>
                    <li>Intro to Rocketry Lecture</li>
                    <li>Cubesat Lecture and Workshop</li>
                    <li>Rover Autonomy and Sensors Lecture</li>
                    <li>Rover Mechanical Design Lecture (CAD, FEA Workshop)</li>
                    <li>Rover Demonstration and Operation</li>
                  </ul>
                  <h5>Technical Skills</h5>
                  <ul>
                    <li>Simulations Lectures and Workshops</li>
                    <li>3D Printing Challenge</li>
                    <li>SA2TP Hackathon</li>
                    <li>Test Flights</li>
                  </ul>
                  <h5>Survival Skills</h5>
                  <ul>
                    <li>Orienteering and Celestial Navigation Crash Course</li>
                    <li>First Aid Seminar</li>
                    <li>Essential Survival Skills</li>
                  </ul>
                  <h5>Soft Skills</h5>
                  <ul>
                    <li>Outreach Workshop</li>
                    <li>Space Program Selection and Planning</li>
                    <li>All About the Astronaut Experience with Sirisha Bhandla</li>
                    <li>Space Policy Seminar with Prof. Dan Dumbacher</li>
                  </ul>
                  <br /><br />
                  <img loading="lazy"className="center" src="/sa2tp/2023/IMG_0983.webp" alt="SA2TP group at NASA Space Academy" style={{ borderRadius: 10 }} />
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

export default Crew1;
