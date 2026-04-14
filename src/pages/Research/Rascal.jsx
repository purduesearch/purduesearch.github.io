import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import Breadcrumb from '../../components/Breadcrumb';
import SEOHead from '../../components/SEOHead';

const Rascal = () => {
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
        { '@type': 'ListItem', 'position': 2, 'name': 'Research', 'item': 'https://purduesearch.github.io/research' },
        { '@type': 'ListItem', 'position': 3, 'name': 'NASA RASC-AL' },
      ],
    });
    document.head.appendChild(script);
    return () => { if (document.head.contains(script)) document.head.removeChild(script); };
  }, []);

  return (
    <div>
      <SEOHead
        title="NASA RASC-AL Competition"
        description="Purdue SEARCH has competed in NASA's RASC-AL design challenge multiple times, developing concepts for deep-space human missions."
        canonical="/research/rascal"
      />
      <Navbar />
      <Breadcrumb />
      <div id="main-content" className="jumbotron-post jumbotron-single d-flex align-items-center" style={{ backgroundImage: 'url(/research/2022_23/mars_mission.webp)' }}>
        <div className="container text-center" style={{ top: 30 }}>
          <h1 className="display-2 mb-4">NASA RASC-AL 2023 Competition</h1>
        </div>
      </div>

      <section style={{ top: 25 }}>
        <div className="shadow container" style={{ maxWidth: '83%', marginLeft: '8%', marginRight: '8%', paddingRight: 8, paddingTop: 8, marginBottom: '8%', paddingBottom: 8 }}>
          <div className="section-content blog-content">
            <div className="row" style={{ maxWidth: '100%' }}>
              <div className="col-md-25 offset-md-1 mt-1" style={{ maxWidth: '100%' }}>
                <div style={{ marginLeft: '1%', marginRight: '10%', textAlign: 'justify' }}>
                  <h4>About the Challenge</h4>
                  <img loading="lazy"className="float-left" style={{ maxWidth: '45%', borderRadius: 20 }} src="/research/2022_23/mars_mission.webp" alt="Mars Mission" />
                  <i>"NASA is pioneering the future of space exploration as we extend humanity's presence further into the solar system.
                    The 2023 RASC-AL Competition is seeking undergraduate and graduate teams to develop new concepts that
                    leverage innovation to improve our ability to operate on the Moon, Mars and beyond."</i>
                  <br /><br />
                  <h4>The Team</h4>
                  <i>As part of SEARCH, Purdue University participated in the 2023 RASC-AL Challenge. The team chose Homesteading Mars
                    as the topic to research. The team comprised a group of graduate students, undergraduate students and PhD mentors.
                  </i><br /><br />
                  <h4>P.U.R.E. S.P.A.C.E. — Purdue University Research Expedition: Sustainable Planetary Access, Colonization and Exploration</h4>
                  <p>
                    Proposed in our model is a system that relies on sustainable research, production and growth, through In-Situ
                    Resource Utilization, aquaponics, and other forms of reuse and recycling. Our proposal is best organized into six categories:
                    <img loading="lazy"className="float-right" style={{ maxWidth: '45%', padding: '2%', borderRadius: 30 }} src="/research/2022_23/mission_architecture.webp" alt="Mission Architecture" />
                    &nbsp;&nbsp;&nbsp;&nbsp;MISSION,<br />
                    &nbsp;&nbsp;&nbsp;&nbsp;HOME,<br />
                    &nbsp;&nbsp;&nbsp;&nbsp;LIFE,<br />
                    &nbsp;&nbsp;&nbsp;&nbsp;SITE,<br />
                    &nbsp;&nbsp;&nbsp;&nbsp;GARAGES and<br />
                    &nbsp;&nbsp;&nbsp;&nbsp;FARM.<br /><br />
                    The Mars Interplanetary Spacecraft for Scientific Inquiry and Optimal Navigation (MISSION) consists of the architecture of our flights to Mars and back.
                    The Habitat for Occupancy and Mars Exploration (HOME) presents a design and layout as well as plans to use a combination of 3D-printing and inflatable domes to create the habitat.<br /><br />
                    A Life-support Infrastructure with Filtration and Environment-Control (LIFE) is integrated in HOME, where the utilization of resources present on Mars allows astronauts to generate oxygen and fuel through the Sabatier process.<br /><br />
                    Surface In-situ Transformation and Exploitation (SITE) proposes a Rodwell to mine water from the martian ice and a combination of nuclear and solar power to power the habitat.<br /><br />
                    Geared Autonomous Rover And Ground Exploration Systems (GARAGES) presents an autonomous rover system to help prepare for the construction of the habitat before the crew arrives.<br /><br />
                    <iframe
                      width="55%"
                      height={380}
                      style={{ display: 'block', alignSelf: 'center', marginLeft: '20%' }}
                      src="https://www.youtube.com/embed/HXg2vXIEi5g?si=cHaQh1sYPlI1_dBW"
                      title="YouTube video player"
                      frameBorder={0}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                    />
                    Finally, the Food and Aquaponics Research Module (FARM) is dedicated to overcoming the health challenges of human space flight through aquaponics and vertical farming systems.<br /><br />
                    Here is a link to the <a href="https://drive.google.com/file/d/1CXIf-BjmNxkB1M1Act1oBQ13DG8Pcota/view?usp=sharing" target="_blank" rel="noopener noreferrer">Technical Report</a> the team submitted to NASA<br /><br /><br />
                    <img loading="lazy"src="/research/2022_23/Team_Photo.webp" style={{ borderRadius: 10 }} alt="RASC-AL Team 2023" />
                  </p>
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

export default Rascal;
