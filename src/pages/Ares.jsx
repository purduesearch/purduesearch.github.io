import { useEffect } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import SEOHead from '../components/SEOHead';
import SectionProgressRail from '../components/SectionProgressRail';

const ARES_RAIL_SECTIONS = [
  { id: 'ares-problem',  label: 'The Problem' },
  { id: 'ares-gravity',  label: 'Gravity' },
  { id: 'ares-bubble',   label: 'The Bubble' },
  { id: 'ares-why',      label: 'Why It Matters' },
  { id: 'ares-headset',  label: 'The Headset' },
  { id: 'ares-trust',    label: 'Trusting a Number' },
  { id: 'ares-next',     label: 'What’s Next' },
  { id: 'ares-join',     label: 'Join' },
];

const Ares = () => {
  useEffect(() => {
    if (window.AOS) window.AOS.init({ once: true });
  }, []);

  return (
    <div className="ares-page">
      <SEOHead
        title="ARES — Atmospheric Research and Experiment System"
        description="A wearable CO₂ and biophysical sensing headset built to detect the localized zone of rebreathed air that forms in front of the face when buoyancy-driven convection collapses."
        canonical="/ares"
      />
      <Navbar />
      <SectionProgressRail sections={ARES_RAIL_SECTIONS} />

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

        {ARES_RAIL_SECTIONS.map(({ id, label }) => (
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

export default Ares;
