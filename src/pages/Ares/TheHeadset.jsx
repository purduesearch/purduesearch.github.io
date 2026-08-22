import { useEffect } from 'react';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import SEOHead from '../../components/SEOHead';
import SectionProgressRail from '../../components/SectionProgressRail';

const HEADSET_RAIL_SECTIONS = [
  { id: 'hs-system',      label: 'The System' },
  { id: 'hs-sensing',     label: 'Sensing CO₂' },
  { id: 'hs-sampling',    label: 'Getting the Air There' },
  { id: 'hs-calibration', label: 'Calibration' },
  { id: 'hs-gallery',     label: 'Hardware' },
];

const TheHeadset = () => {
  useEffect(() => {
    if (window.AOS) window.AOS.init({ once: true });
  }, []);

  return (
    <div className="ares-page">
      <SEOHead
        title="ARES — The Headset"
        description="Three sensor pods, an infrared absorption measurement, and the difference between how long air takes to reach a sensor and how long the sensor takes to respond."
        canonical="/ares/the-headset"
      />
      <Navbar />
      <SectionProgressRail sections={HEADSET_RAIL_SECTIONS} />

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

        {HEADSET_RAIL_SECTIONS.map(({ id, label }) => (
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

export default TheHeadset;
