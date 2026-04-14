import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import Breadcrumb from '../../components/Breadcrumb';
import SEOHead from '../../components/SEOHead';

const AstroOverview = () => {
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
        { '@type': 'ListItem', 'position': 2, 'name': 'ASTRO-USA', 'item': 'https://purduesearch.github.io/astrousa' },
        { '@type': 'ListItem', 'position': 3, 'name': 'Habitat Overview' },
      ],
    });
    document.head.appendChild(script);
    return () => { if (document.head.contains(script)) document.head.removeChild(script); };
  }, []);

  return (
    <div>
      <SEOHead
        title="ASTRO-USA Habitat Overview"
        description="An overview of the ASTRO-USA habitat project — goals, background, and design approach for Purdue's on-campus space habitat analog."
        canonical="/astrousa/overview"
      />
      <Navbar />
      <Breadcrumb />
      <div id="main-content" className="jumbotron-post jumbotron-single d-flex align-items-center" style={{ backgroundImage: 'url(/software/2023_24/SUITS/bg.webp)' }}>
        <div className="container text-center" style={{ top: 30 }}>
          <h1 className="display-2 mb-4">ASTRO-USA Overview</h1>
        </div>
      </div>

      <section style={{ top: 25 }}>
        <div className="shadow container" style={{ maxWidth: '83%', marginLeft: '8%', marginRight: '8%', paddingRight: 8, paddingTop: 8, marginBottom: '8%', paddingBottom: 8 }}>
          <div className="section-content blog-content">
            <div className="row" style={{ maxWidth: '100%' }}>
              <div className="col-md-25 offset-md-1 mt-1" style={{ maxWidth: '100%' }}>
                <h4>Background</h4>
                <p>For decades, Purdue University researchers have been pioneers in space technology advancement and exploration. Heralded "The Cradle of Astronauts" and boasting a world leading program in Aeronautics and
                  Astronautics, Purdue remains as the top research institution for many space-related disciplines. It is time to take the next step and build the world's first research facility dedicated to bioastronautics,
                  closed loop habitation, and advancement in spaceflight operations. The Space and Earth Analogs Research Chapter (SEARCH) of Purdue plans to build a self-sustaining, innovative, and inclusive lunar habitat
                  to foster interdisciplinary research and development. The organization hopes to leverage the collective expertise of its members and partners to design an analog biosphere prepared to support human life
                  under extreme extraterrestrial conditions through research, design, and prototyping of a self-contained structure. SEARCH of Purdue will bring unique opportunities that are beneficial to all students across the institute.
                </p>
                <h5>Goals</h5>
                <p>The ASTRO-USA team has identified 3 main goals to measure the success of the project:</p>
                <ul>
                  <li>World's first fully closed loop analog astronaut facility dedicated to Bioregenerative Life Support Systems Research and Bioastronautics</li>
                  <li>Increase analog mission and research opportunities for Purdue students and globally</li>
                  <li>Create a facility for SEARCH operations and various collaborations</li>
                </ul>
                <h4>Bioregenerative Life Support Systems</h4>
                <p>The ASTRO-USA habitat proposes the usage of a Bioregenerative Life-Support System (BLSS) inside of the closed loop habitat to provide life support to analog astronaut researchers. BLSS consists of different
                  systems capable of recycling oxygen, food, and water used by humans in order to reduce waste and extend the life of missions without the use of resupplies from Earth to continue operations. The system depends
                  heavily on the plants in the habitat and their lifecycle – as plants mature, they are able to use the CO2 exhaled by humans to grow and supply oxygen in the process. Plants are not only important to the BLSS,
                  they are also used as sustenance for humans for the duration of the mission. In the habitat, all food and nutrients that are needed for analog astronomers to survive, thrive, and maintain positive mental and
                  physical health will be provided by the farming modules in which the plants will be contained. Within these farming modules, the plants will be entirely artificially grown using an automated hydroponic farm
                  equipped with all necessary instruments, including grow lights and nutrient solutions.
                  <br />
                  <br />
                  The first step to developing the BLS Systems is to research, design, and create the hydroponic system. More information on that work can be found on the <Link to="/astrousa/hydroponics">Hydroponics Team Page</Link>.
                </p>
                <h4>Habitat Design</h4>
                <p>The ASTRO-USA habitat features 3 different modules: the main module in the middle, and two farming modules on the side. Within this habitat, analog astronauts will be able to live, work, and sustain themselves
                  over the course of the mission.</p>
                <h5>Main Module</h5>
                <p>The main module consists of two floors: the first floor for working and the top floor for living. The first floor contains a workshop capable of conducting many different experiments. Analog participants
                  will be able to bring in their own equipment as well as use the provided basic equipment that will be located in the workshop. The soil and agricultural provides a dedicated area for conducting research related
                  to plant growth and cultivation in different environments, especially if they will not be suitable for the open farming modules. This area will also be important in the early stages of the habitat when the farming
                  modules are not built yet. The bioastronautics lab will be a center to conduct sterilized lab research pertaining to the health of astronauts. It also acts as a medbay for emergencies or simulations if needed. Lastly,
                  the machinery room will contain equipment and control panels essential to the health of the habitat, including the closed loop system and atmospheric controls.
                  <br />
                  <br />
                  The top floor is the residential area for the analog astronauts. It contains a living and kitchen area large enough to prepare meals and store essential equipment for food preservation. The large pantry provides an
                  area to store all preserves and cultivated grains from the farming modules. The 6 sleeping quarters are in the center of the habitat, where each one will be furnished with a desk, bunk bed, and personal storage. This
                  provides a quiet area for analog astronaut participants to take private phone calls, get work done, or sleep. The second floor also contains a hygiene area with a toilet, shower, and sinks, which are right next to the
                  workout area as well.
                  <br />
                  <br />
                  Throughout the first and second floors of the habitat, there will be internal windows placed so that the astronauts can see into the farming modules. This is important to increase mental health/happiness and decrease
                  feelings of isolation, claustrophobia, and lonliness during the course of the mission. It will also allow for unique experiments, such as monitoring the change in human health and plant growth with various circadian cycles.
                </p>
                <h5>Farming Modules</h5>
                <p>The farming modules contain more than enough grow space to properly sustain at least 6 astronauts for 2 weeks off of the cultivated produce. The goal is to also provide enough space to run experiments
                  to grow many types of plants in various conditions for research. The left farming module has been created with exactly this in mind since it has many ways to section off certain rows of hydroponic towers.
                  The right farming module is much more open to provide various areas of immersement inside the module, including a garden area, working area, and meeting area. This is to conduct research pertaining to bioastronautics
                  and the mental health of the participating analog astronauts.
                </p>
                <figure style={{ display: 'block', marginLeft: 'auto', marginRight: 'auto' }}>
                  <img loading="lazy"style={{ display: 'inline-block', padding: '1%', borderRadius: 20 }} width="45%" src="/astrousa/2023_24/version_2_3_rvt_1.webp" alt="Habitat Design 1" />
                  <img loading="lazy"style={{ display: 'inline-block', padding: '1%', borderRadius: 20 }} width="45%" src="/astrousa/2023_24/version_2_3_rvt_2.webp" alt="Habitat Design 2" />
                </figure>
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

export default AstroOverview;
