import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import Breadcrumb from '../../components/Breadcrumb';
import SEOHead from '../../components/SEOHead';

const AstroArchitecture = () => {
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
        { '@type': 'ListItem', 'position': 3, 'name': 'Architecture Design' },
      ],
    });
    document.head.appendChild(script);
    return () => { if (document.head.contains(script)) document.head.removeChild(script); };
  }, []);

  return (
    <div>
      <SEOHead
        title="ASTRO-USA Architecture Design"
        description="Design evolution of the ASTRO-USA habitat — from shipping container concepts to circular modular architecture, driven by mission constraints and crew ergonomics."
        canonical="/astrousa/architecture"
      />
      <Navbar />
      <Breadcrumb />
      <div id="main-content" className="jumbotron-post jumbotron-single d-flex align-items-center" style={{ backgroundImage: 'url(/software/2023_24/SUITS/bg.webp)' }}>
        <div className="container text-center" style={{ top: 30 }}>
          <h1 className="display-2 mb-4">Architecture Designs</h1>
        </div>
      </div>

      <section style={{ top: 25 }}>
        <div className="shadow container" style={{ maxWidth: '83%', marginLeft: '8%', marginRight: '8%', paddingRight: 8, paddingTop: 8, marginBottom: '8%', paddingBottom: 8 }}>
          <div className="section-content blog-content">
            <div className="row" style={{ maxWidth: '100%' }}>
              <div className="col-md-25 offset-md-1 mt-1" style={{ maxWidth: '100%' }}>
                <h4>The Design Phase</h4>
                <p>During the Fall of 2023, our ASTRO-USA team (Ilina Adhikari, Brasen Garcia, Ryan DeAngelis) worked on multiple designs for the analog space habitat and conducted
                  a Business design review with construction companies and have reached out to companies such as The Hayes Group, Keene Homes and Citation Homes.
                  The designs have undergone multiple iterations of incremental changes.
                </p>
                <h4>Requirements</h4>
                <p>The primary requirements for an analog habitat are as follows</p>
                <ul>
                  <li>Design shall be modular with standardized modules for ease of expansion</li>
                  <li>Shall be a multi-story habitat to reduce footprint</li>
                  <li>Habitat shall be airtight</li>
                  <li>There shall be defined sterile and non-sterile spaces</li>
                  <li>Shall house and support a crew of 6 for at least 2 weeks</li>
                  <li>Shall support realistic analog missions and research</li>
                  <li>Atmosphere shall be isolated and regulated</li>
                  <li>Shall incorporate large and adaptable workspaces</li>
                </ul>
                <h4>Layouts</h4>
                The initial designs were inspired by Biosphere 2 and had circular layouts. The habitat was to have a modular structure with 3 agriculture/hydroponics modules and 3 research modules.
                <figure style={{ display: 'block', marginLeft: 'auto', marginRight: 'auto' }}>
                  <img loading="lazy"style={{ display: 'inline-block', padding: '1%', borderRadius: 20 }} width="45%" src="/astrousa/2023_24/circular_rvt_1.webp" alt="Circular Design 1" />
                  <img loading="lazy"style={{ display: 'inline-block', padding: '1%', borderRadius: 20 }} width="45%" src="/astrousa/2023_24/circular_rvt_2.webp" alt="Circular Design 2" />
                </figure>
                <figure style={{ display: 'block', marginLeft: 'auto', marginRight: 'auto' }}>
                  <img loading="lazy"style={{ display: 'inline-block', padding: '1%', borderRadius: 20 }} width="45%" src="/astrousa/2023_24/circular_interior_l1_1.webp" alt="Interior Level 1 View 1" />
                  <img loading="lazy"style={{ display: 'inline-block', padding: '1%', borderRadius: 20 }} width="45%" src="/astrousa/2023_24/circular_interior_l1_2.webp" alt="Interior Level 1 View 2" />
                </figure>
                <figure style={{ display: 'block', marginLeft: 'auto', marginRight: 'auto' }}>
                  <img loading="lazy"style={{ display: 'inline-block', padding: '1%', borderRadius: 20 }} width="45%" src="/astrousa/2023_24/circular_interior_l2_1.webp" alt="Interior Level 2 View 1" />
                  <img loading="lazy"style={{ display: 'inline-block', padding: '1%', borderRadius: 20 }} width="45%" src="/astrousa/2023_24/circular_interior_l2_2.webp" alt="Interior Level 2 View 2" />
                </figure>
                <br /><br />
                <h5>Iterations</h5>
                After internal discussions, The following changes were made
                <ul>
                  <li>Medbay changed to BioAstronautics Lab
                    <ul>
                      <li>More emphasis on surveying the effects on the crew's mental and physical health</li>
                      <li>Still space for a medbay if needed in simulations</li>
                    </ul>
                  </li>
                  <li>Waste Management changed to Agriculture Lab
                    <ul>
                      <li>Will be a long time before we can actually do fertilizer cultivation from human waste. In the meantime,
                        we can use this space to still do fertilizer cultivation and research without human waste (space will not be wasted)</li>
                    </ul>
                  </li>
                  <li>Use 6m diameter for upper level - more space for beds and in general</li>
                  <li>Bedroom walls are able to be retractable for more communal living if desired</li>
                  <li>Permanent dining area</li>
                  <li>Fire escape on second level
                    <ul>
                      <li>also helpful to transport equipment in and out of the habitat between analog missions</li>
                    </ul>
                  </li>
                  <li>Estimated living area: 113 sqm * 2 + farming + airlock</li>
                  <li><b>Concerns</b>
                    <ul>
                      <li>
                        Solar panel field for simulation, or on roof for feasibility? - depends on land area.
                        Is this more focused on science or simulation?
                      </li>
                    </ul>
                  </li>
                </ul>
                <figure style={{ display: 'block', marginLeft: 'auto', marginRight: 'auto' }}>
                  <img loading="lazy"style={{ display: 'inline-block', padding: '1%', borderRadius: 20 }} width="45%" src="/astrousa/2023_24/iteration_3_1.webp" alt="Iteration 3 View 1" />
                  <img loading="lazy"style={{ display: 'inline-block', padding: '1%', borderRadius: 20 }} width="45%" src="/astrousa/2023_24/iteration_3_2.webp" alt="Iteration 3 View 2" />
                </figure>
                <h5>Shipping Container/Grain Silo Layouts</h5>
                The team explored cost-effective options such as using Shipping containers or Grain Silos. However, these designs
                would have to be rectangular.
                Each core module floor would be made up of 4 40ft shipping containers which results in a total square footage of 2480.
                Insulation could be easily added on the walls to make sure that this habitat is livable.
                <figure style={{ display: 'block', marginLeft: 'auto', marginRight: 'auto' }}>
                  <img loading="lazy"style={{ display: 'inline-block', padding: '1%', borderRadius: 20 }} width="45%" src="/astrousa/2023_24/shipping_container_1.webp" alt="Shipping Container Design 1" />
                  <img loading="lazy"style={{ display: 'inline-block', padding: '1%', borderRadius: 20 }} width="45%" src="/astrousa/2023_24/shipping_container_2.webp" alt="Shipping Container Design 2" />
                </figure>
                <p>After a few rounds of talks with Industry experts,
                  the team decided to pursue a rectangular habitat design instead of the circular one due to building costs and complications.
                  These new designs are focused on reducing the size of the habitat and increasing human environment relations within the habitat.
                </p>
                <ul>
                  <li>Square Footage: 1728 sqft / 864 sqft per floor</li>
                  <li>Still much smaller than the original designs. Might be able to shave a couple sqft off from it</li>
                  <li>The habitat has windows looking into the farming modules from the rooms to increase mental health/happiness and decrease feelings of claustrophobia</li>
                  <li>Windows are placed in the bedrooms as well to look into the green spaces</li>
                  <li>We can build a "deck" that astronauts will have access to from the kitchen on the second floor to provide a third-space for them within the habitat to do their work or be alone</li>
                  <li>The wall between the workshop/lab and bioastronautics lab can be changed to optimize the space division between them</li>
                  <li>Closed Loop Machinery is not labeled/placed
                    <ul>
                      <li>Option 1: Closed loop machinery is placed in the current Soil/Ag lab and the Soil/Ag lab will be moved to a room connected to a farming module so that it has access to the outside</li>
                      <li>Option 2: Closed loop machinery will be placed in a room connected to a farming module so that it has access to the outside</li>
                    </ul>
                  </li>
                </ul>
                <figure style={{ display: 'block', marginLeft: 'auto', marginRight: 'auto' }}>
                  <img loading="lazy"style={{ display: 'inline-block', padding: '1%', borderRadius: 20 }} width="45%" src="/astrousa/2023_24/version_2_1_drawing_1.webp" alt="Version 2.1 Drawing 1" />
                  <img loading="lazy"style={{ display: 'inline-block', padding: '1%', borderRadius: 20 }} width="45%" src="/astrousa/2023_24/version_2_1_drawing_2.webp" alt="Version 2.1 Drawing 2" />
                </figure>
                <figure style={{ display: 'block', marginLeft: 'auto', marginRight: 'auto' }}>
                  <img loading="lazy"style={{ display: 'inline-block', padding: '1%', borderRadius: 20 }} width="45%" src="/astrousa/2023_24/version_2_3_rvt_1.webp" alt="Version 2.3 RVT 1" />
                  <img loading="lazy"style={{ display: 'inline-block', padding: '1%', borderRadius: 20 }} width="45%" src="/astrousa/2023_24/version_2_3_rvt_2.webp" alt="Version 2.3 RVT 2" />
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

export default AstroArchitecture;
