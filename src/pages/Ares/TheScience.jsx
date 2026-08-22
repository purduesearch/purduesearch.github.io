import { useEffect } from 'react';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import SEOHead from '../../components/SEOHead';
import SectionProgressRail from '../../components/SectionProgressRail';

const SCIENCE_RAIL_SECTIONS = [
  { id: 'sci-regimes',    label: 'Regimes' },
  { id: 'sci-numbers',    label: 'The Numbers' },
  { id: 'sci-reading',    label: 'Reading a Result' },
  { id: 'sci-rebreath',   label: 'Rebreathed Fraction' },
  { id: 'sci-validation', label: 'Validation' },
];

const TheScience = () => {
  useEffect(() => {
    if (window.AOS) window.AOS.init({ once: true });
  }, []);

  return (
    <div className="ares-page">
      <SEOHead
        title="ARES — The Science"
        description="Buoyancy, diffusion, and the dimensionless numbers that decide which one moves a gas. How to read a simulation result, and what the rebreathed fraction actually assumes."
        canonical="/ares/the-science"
      />
      <Navbar />
      <SectionProgressRail sections={SCIENCE_RAIL_SECTIONS} />

      <main id="main-content">
        <div className="ares-hero">
          <div className="container text-center">
            <h1 className="display-2 mb-4">ARES</h1>
            <p className="header-sub-title">
              Atmospheric Research and Experiment System — a wearable sensing headset
              measuring the air a person is actually breathing.
            </p>
          </div>
        </div>

        {SCIENCE_RAIL_SECTIONS.map(({ id, label }) => (
          <section id={id} key={id}>
            <div className="container">
              <div className="title-wrap mb-4" data-aos="fade-up">
                <h2 className="section-title">{label}</h2>
              </div>
            </div>
          </section>
        ))}
      </main>

      <Footer />
    </div>
  );
};

export default TheScience;
