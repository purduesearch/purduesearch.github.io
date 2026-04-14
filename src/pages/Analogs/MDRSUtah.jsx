import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import Breadcrumb from '../../components/Breadcrumb';

const MDRSUtah = () => {
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
        { '@type': 'ListItem', 'position': 2, 'name': 'Business', 'item': 'https://purduesearch.github.io/analogs' },
        { '@type': 'ListItem', 'position': 3, 'name': 'MDRS Utah' },
      ],
    });
    document.head.appendChild(script);
    return () => { if (document.head.contains(script)) document.head.removeChild(script); };
  }, []);

  return (
    <div>
      <title>MDRS Utah Mars Analog | Purdue SEARCH</title>
      <meta name="description" content="Purdue SEARCH traveled to the Mars Desert Research Station in Hanksville, Utah to experience two weeks of analog Mars habitat living." />
      <Navbar />
      <Breadcrumb />
      <div id="main-content" className="jumbotron-post jumbotron-single d-flex align-items-center" style={{ backgroundImage: 'url(/software/2023_24/SUITS/bg.webp)' }}>
        <div className="container text-center" style={{ top: 30 }}>
          <h1 className="display-2 mb-4">Purdue goes to Mars</h1>
        </div>
      </div>

      <section style={{ top: 25 }}>
        <div className="shadow container" style={{ maxWidth: '83%', marginLeft: '8%', marginRight: '8%', paddingRight: 8, paddingTop: 8, marginBottom: '8%', paddingBottom: 8 }}>
          <div className="section-content blog-content">
            <div className="row" style={{ maxWidth: '100%' }}>
              <div className="col-md-25 offset-md-1 mt-1" style={{ maxWidth: '100%' }}>
                <div style={{ marginLeft: '1%', marginRight: '10%', textAlign: 'justify' }}>
                  <h4>About the Mission</h4>
                  <img loading="lazy"className="float-left" width="220px" src="/outreach/companies/MDRS.webp" alt="MDRS Logo" />
                  For two weeks in Hanksville, Utah, a team of Purdue students visited the Mars Desert Research Station
                  to simulate analog Mars missions in the desert terrain of Utah wilderness. The Space and Earth Analogs
                  Research Chapter chose 6 members for the crew to visit MDRS.
                  <br /><br />
                  <img loading="lazy"src="/analogs/2022/mdrs.webp" alt="MDRS" style={{ borderRadius: 10 }} />
                  <br /><br />
                  The program was open to anyone in Purdue who was interested to spend two weeks in Utah, according to president
                  and co-founder Rodrigo Schmitt, a PhD candidate in Aerospace Engineering. Among those joining the crew were, Dr. Kshitij Mall, the
                  executive officer for the mission in 2018. Dr. Mall is currently a Post-Doc at Purdue University. Apart from him, the crew included
                  a geologist, an astronomer and a health and safety officer. Dr. Cesare Guariniello, an alumni of Purdue University has been on this mission
                  four times as an astronomer, commander and Geologist.
                  <br /><br />
                  <img loading="lazy"className="float-right" src="/analogs/2022/terrain.webp" alt="Mars Terrain" style={{ borderRadius: 20, maxWidth: '55%', padding: '1%' }} />
                  <br />
                  <br />
                  The mission was between January 1 to January 14 of 2023 and the team was involved in many STEM research projects focusing on
                  human aspect of space exploration. According to Schmitt, "This environment of isolation of people together in the crew for a very long time
                  , with this pressure of work, in an environment that's literally trying to kill you, that can be explored by the humanity sciences, psychology and
                  health and safety."
                  <br /><br />
                  Back in 2018, when Dr. Mall was part of the crew, his research was to test the effects of Yoga and meditation on crew members and whether
                  it would be a viable stress release strategy for astronauts in isolation. However, according to him, two weeks was far too short of a time duration
                  to get reliable data. 15 days is quite short to simulate the effects of stress that would set in on a much longer trip.
                  <br /><br />
                  MDRS takes various measures to make the simulation as realistic as possible, including, according to Dr. Guariniello, having the
                  crew members wait at the door for 5 minutes to simulate the airlock systems.
                  According to Dr. Mall, during the EVA or extravehicular activities, three-to-four people leave the base to do research. During such excursions,
                  the crew members wear suits and communicate with each other through radios. "The experiments and simulations that we do are very close
                  to what we do in space because everything we have to do wearing gloves, which makes it 10 times harder to do simple things", says Mall.
                  Guariniello adds that their visibility, food and water are also limited. The visors affect their visibility and the crew members have to
                  carry food with them ahead of time and take turns cooking. Only shelf-stable foods such as dehydrated and canned goods are allowed.
                  <br /><br />
                  The Hab or the habitat is a two storey cylindrical building with a dome on top, about eight meters in diameter. The greenhouse is dubbed the Green hab
                  and is where the Green Hab officer works. The station has two observatories, the Musk Observatory and a robotic telescope observatory.
                  The total mission fee included about $2000 per participant.
                  <br /><br />
                  <img loading="lazy"className="center" src="/analogs/2022/habitat.webp" alt="MDRS Habitat" style={{ borderRadius: 10, marginLeft: '5%' }} />
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

export default MDRSUtah;
