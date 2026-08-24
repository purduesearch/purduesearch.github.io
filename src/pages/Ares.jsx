import { lazy, Suspense, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import SEOHead from '../components/SEOHead';
import SectionProgressRail from '../components/SectionProgressRail';
import AresStat from '../components/ares/AresStat';
import AresTerm from '../components/ares/AresTerm';
import AresFigure from '../components/ares/AresFigure';
import CandleComparison from '../components/ares/CandleComparison';
import PlumeAnatomy from '../components/ares/PlumeAnatomy';
import { PLUME, CO2_TIERS } from '../components/ares/aresPhysics';
import { POD_POSITIONS } from '../lib/ares/breathModel';
import useAresScrollEffects from '../hooks/useAresScrollEffects';

const PlumeSimulator  = lazy(() => import('../components/ares/PlumeSimulator'));
const ExposureDial    = lazy(() => import('../components/ares/ExposureDial'));
const PodReadout      = lazy(() => import('../components/ares/PodReadout'));
const PodDisagreement = lazy(() => import('../components/ares/PodDisagreement'));

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

// GLOSSARY §5's conversion table carries NASA's operational limit; found by
// label rather than typed as a ppm literal, so the number on screen always
// traces back to aresPhysics.js's CO2_TIERS export.
const NASA_2010_TIER = CO2_TIERS.find((tier) => tier.label.startsWith("NASA's 2010"));

const LOADING_FALLBACK = (
  <div className="ares-lazy-shell" aria-busy="true">
    <div className="ares-spinner" aria-hidden="true" />
    <span>Loading…</span>
  </div>
);

const Ares = () => {
  const heroRef = useRef(null);
  const tintRef = useRef(null);

  useEffect(() => {
    if (window.AOS) window.AOS.init({ once: true });
  }, []);

  // The two signature scroll effects: hero drift dying as gravity "drains"
  // out of the page, and the bubble section's background walking toward
  // warm ochre as concentration accumulates. Disabled entirely under
  // prefers-reduced-motion — see useAresScrollEffects.js.
  useAresScrollEffects(heroRef, tintRef);

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
        <div className="ares-hero" ref={heroRef}>
          <div className="container text-center">
            <h1 className="display-2 mb-4">ARES</h1>
            <p className="header-sub-title">
              Atmospheric Research and Experiment System — a wearable sensing headset
              measuring the air a person is actually breathing.
            </p>
          </div>
        </div>

        {/* ===== SECTION 1: THE PROBLEM ===== */}
        <section id="ares-problem">
          <div className="container">
            <div className="title-wrap mb-4" data-aos="fade-up">
              <h2 className="section-title">The <b>Problem</b></h2>
              <p className="section-sub-title">
                Right now, something is clearing the air in front of your face. You have
                never had to think about it, because it has never once failed.
              </p>
            </div>
            <div data-aos="fade-up">
              <p style={{ color: 'var(--color-muted)', lineHeight: '1.8', maxWidth: '760px', margin: '0 auto 1.5rem', textAlign: 'center' }}>
                Every few seconds you breathe out a small cloud of warm, CO₂-rich air, and
                every few seconds it disappears from in front of your nose and mouth
                without you doing anything. That isn't ventilation equipment. It's a side
                effect of being warmer than the room around you: warm skin lightens the air
                touching it, gravity pulls the surrounding cool air in to replace it, and
                the whole body ends up wrapped in a slow, rising column of its own making.
                That column carries your last breath away and replaces it with fresh air
                before your next one arrives.
              </p>
              <p style={{ color: 'var(--color-muted)', lineHeight: '1.8', maxWidth: '760px', margin: '0 auto', textAlign: 'center' }}>
                Take gravity out of the picture and that column stops forming. Nothing
                about your metabolism changes — you're just as warm, you're breathing just
                as hard — but there is no longer any "up" for warm air to rise toward,
                so nothing sweeps the exhaled air away. It just stays where it was produced,
                in the tens of centimeters right in front of your face. That is the
                problem ARES was built to measure.
              </p>
            </div>
            <div className="ares-stat-row" data-aos="fade-up">
              <AresStat
                value={`${PLUME.crownVelocityMin}–${PLUME.crownVelocityMax}`}
                unit="m/s"
                label="Peak plume speed, top of the head"
                source="Dutta et al. (2026), Gravity and Human Respiration"
              />
              <AresStat
                value={NASA_2010_TIER.ppm}
                unit="ppm"
                label={`NASA's 2010 CO₂ operational limit (${NASA_2010_TIER.note})`}
                source="GLOSSARY.md §5 — conversion table"
              />
              <AresStat
                value={POD_POSITIONS.length}
                label="Sensor pods on the headset"
                source="ARES headset design — chin, top, forehead"
              />
              <AresStat
                value={PLUME.developmentLengthM}
                unit="m"
                decimals={1}
                label="Buoyant path length, floor to crown"
                source="Dutta et al. (2026), HTBP simulation (body-height scale)"
              />
            </div>
          </div>
        </section>

        {/* ===== SECTION 2: GRAVITY ===== */}
        <section id="ares-gravity" style={{ background: 'var(--color-bg-sand)' }}>
          <div className="container">
            <div className="title-wrap mb-4" data-aos="fade-up">
              <h2 className="section-title">How Gravity <b>Moves Air</b></h2>
              <p className="section-sub-title">
                Drag the slider from Earth to zero and watch the plume, not the air,
                disappear.
              </p>
            </div>
            <div data-aos="fade-up">
              <p style={{ color: 'var(--color-muted)', lineHeight: '1.8', maxWidth: '760px', margin: '0 auto 2rem', textAlign: 'center' }}>
                <AresTerm term="BTC">Biothermal convection</AresTerm> is the name for the
                mechanism above: metabolic heat warms a thin layer of air against the skin,
                that layer becomes lighter than the room and floats upward, and cooler air
                is drawn in behind it to keep the cycle going. It's the same physics that
                shapes a candle flame — a self-sustaining column driven entirely by its own
                heat source. Reduce gravity and the column doesn't just weaken evenly along
                its length; the driving force behind it is proportional to gravity itself,
                so the whole plume fades in step with the slider.
              </p>
              <p style={{ color: 'var(--color-muted)', lineHeight: '1.8', maxWidth: '760px', margin: '0 auto', textAlign: 'center' }}>
                Once that airflow is gone, CO₂ doesn't stop moving — it just stops having a
                ride. What's left is <AresTerm term="IBD">indirect biophysical
                diffusion</AresTerm>: individual molecules wandering outward on their own,
                with no bulk current to carry them. Diffusion is real and it never turns
                off, but it is dramatically slower than a plume, which is the entire reason
                a breath that clears itself in under a second on Earth can sit in front of
                your face for the better part of an hour once convection stops.
              </p>
            </div>
            {/* The candle is already the analogy the paragraph above reaches
                for; this is that sentence drawn. It also breaks up two heavy
                interactives back to back. */}
            <div data-aos="fade-up">
              <CandleComparison />
            </div>

            <div className="ares-interactive-frame" data-aos="fade-up">
              <Suspense fallback={LOADING_FALLBACK}>
                <PlumeSimulator />
              </Suspense>
            </div>
          </div>
        </section>

        {/* ===== SECTION 3: THE BUBBLE ===== */}
        <section id="ares-bubble" ref={tintRef}>
          <div className="container">
            <div className="title-wrap mb-4" data-aos="fade-up">
              <h2 className="section-title">The Plume <b>and the Bubble</b></h2>
            </div>
            <p className="ares-thesis" data-aos="fade-up">
              The CO₂ bubble is not CO₂ appearing. It is a ventilation structure
              disappearing.
            </p>
            <div data-aos="fade-up">
              <p style={{ color: 'var(--color-muted)', lineHeight: '1.8', maxWidth: '760px', margin: '0 auto 1.5rem', textAlign: 'center' }}>
                On Earth, the rising column above doesn't simply drift past your face — it
                does something specific there. Air gathered from the whole body converges
                at the underside of the jaw, sweeps upward across the mouth, delivers fresh
                air to the nostrils, and then leaves the face entirely, exiting up and
                outward at roughly a 45° angle that never brings it back. That band is a
                real ventilation system, built out of nothing but body heat and gravity,
                and nobody designed it.
              </p>
              <p style={{ color: 'var(--color-muted)', lineHeight: '1.8', maxWidth: '760px', margin: '0 auto 1.5rem', textAlign: 'center' }}>
                Kill the plume and that band collapses with it. There is no longer a
                current sweeping exhaled air away from the nose and mouth, so it simply
                accumulates in the same narrow space you are about to inhale from again.
                That accumulation — not any new source of CO₂ — is the bubble.
              </p>
              <p style={{ color: 'var(--color-muted)', lineHeight: '1.8', maxWidth: '760px', margin: '0 auto', textAlign: 'center' }}>
                It's worth being honest about how solid this picture is. The 1g half has
                real experimental backing: <AresTerm term="Schlieren">Schlieren
                imaging</AresTerm>, an optical technique that turns the density
                differences in warm rising air into a visible photograph, has shown this
                same plume shape on real people for decades. The microgravity half is less
                settled — it's a simulation extrapolated past the range where that
                photographic validation exists, and that gap is what ARES was built to
                close.
              </p>
            </div>
            <div data-aos="fade-up">
              <PlumeAnatomy />
            </div>

            <div data-aos="fade-up">
              <AresFigure
                standalone
                src="/ares/plume-1g-vs-0g.webp"
                alt="Side-by-side simulation frames of a standing person. At 1 g a red CO₂ plume rises from the face in a teardrop and leaves upward. In microgravity a blue CO₂ cloud stays as a rounded bubble directly in front of the face."
                caption="The same person, the same breath, the same 22 °C. Only gravity differs. On the left CO₂ rises away from the face as a teardrop plume; on the right it is trapped in front of the face as a bubble. The inset compares a candle flame under the same two conditions."
                credit="Figure: Dutta et al. (2026), Gravity and Human Respiration."
                icon="fa-chart-area"
              />
            </div>
          </div>
        </section>

        {/* ===== SECTION 4: WHY IT MATTERS ===== */}
        <section id="ares-why" style={{ background: 'var(--color-bg-sand)' }}>
          <div className="container">
            <div className="title-wrap mb-4" data-aos="fade-up">
              <h2 className="section-title">Cabin Air <b>Is Not Face Air</b></h2>
              <p className="section-sub-title">
                A system can be fully compliant and still be measuring the wrong twenty
                centimeters.
              </p>
            </div>
            <div data-aos="fade-up">
              <p style={{ color: 'var(--color-muted)', lineHeight: '1.8', maxWidth: '760px', margin: '0 auto 1.5rem', textAlign: 'center' }}>
                Every environmental control system on a crewed spacecraft measures the
                same thing: the bulk atmosphere of the cabin. That's genuinely useful, and
                a system holding the whole cabin below a limit is, correctly, considered
                compliant.
              </p>
              <p style={{ color: 'var(--color-muted)', lineHeight: '1.8', maxWidth: '760px', margin: '0 auto', textAlign: 'center' }}>
                None of those systems measures the air at a crew member's face — and on
                Earth nobody has needed them to, because the plume from the previous
                section keeps guaranteeing the two readings are the same. Remove the plume
                and that guarantee is gone: a cabin sensor can read comfortably within
                limits while the air someone is about to inhale reads considerably higher,
                unmeasured because nothing on board is looking there. Below is the same
                conversion table the whole project runs on — the raw concentration, the
                partial-pressure unit clinicians use, and NASA's own published limit —
                with a dose readout showing how concentration and exposure time combine.
              </p>
            </div>
            <div className="ares-interactive-frame" data-aos="fade-up">
              <Suspense fallback={LOADING_FALLBACK}>
                <ExposureDial />
              </Suspense>
            </div>
          </div>
        </section>

        {/* ===== SECTION 5: THE HEADSET ===== */}
        <section id="ares-headset">
          <div className="container">
            <div className="title-wrap mb-4" data-aos="fade-up">
              <h2 className="section-title">Three Pods, <b>Three Jobs</b></h2>
              <p className="section-sub-title">
                Select a pod below to see where it sits and what it measures.
              </p>
            </div>
            <div data-aos="fade-up">
              <p style={{ color: 'var(--color-muted)', lineHeight: '1.8', maxWidth: '760px', margin: '0 auto 1.5rem', textAlign: 'center' }}>
                The chin pod sits below the jaw, directly in the breathing zone — if a
                rebreathing bubble exists, this is where it shows up. The top pod, above
                the crown, is the reference: what the air would read if none of it had
                already passed through someone's lungs. Chin minus top is the actual
                rebreathing measurement; neither number means much on its own. The
                forehead pod tracks humidity and thermal load instead, because the same
                collapse that traps CO₂ also traps heat and sweat.
              </p>
              <p style={{ color: 'var(--color-muted)', lineHeight: '1.8', maxWidth: '760px', margin: '0 auto', textAlign: 'center' }}>
                There's a known problem with the current placement worth being upfront
                about: the top pod sits at the crown, exactly where the previous sections
                showed the plume runs fastest and most loaded — so the "reference" sensor
                is standing in the exhaust it's supposed to be compared against. That
                doesn't add random noise. It produces a clean, confident, and specifically
                wrong number, biased low, which under-reports the exact thing the project
                exists to detect. Toggle the switch below to see it happen.
              </p>
            </div>
            <div data-aos="fade-up">
              <AresFigure
                standalone
                src="/ares/headset-assembly.webp"
                alt="The ARES headset held in one hand: a black 3D-printed frame carrying three sensor pods, wired together with a loom of red, yellow, blue and black cable."
                caption="The headset as currently assembled — three pods on a printed frame, wired to a shared loom. The pod above the crown is the reference sensor the section above is about."
              />
            </div>

            <div className="ares-interactive-frame" data-aos="fade-up">
              <Suspense fallback={LOADING_FALLBACK}>
                <PodReadout />
              </Suspense>
            </div>
          </div>
        </section>

        {/* ===== SECTION 6: TRUSTING A NUMBER ===== */}
        <section id="ares-trust" style={{ background: 'var(--color-bg-sand)' }}>
          <div className="container">
            <div className="title-wrap mb-4" data-aos="fade-up">
              <h2 className="section-title">Trusting <b>a Number</b></h2>
              <p className="section-sub-title">
                Three independent sensors disagreeing is not a fault. It's what
                independent instruments do.
              </p>
            </div>
            <div data-aos="fade-up">
              <p style={{ color: 'var(--color-muted)', lineHeight: '1.8', maxWidth: '760px', margin: '0 auto', textAlign: 'center' }}>
                What matters is knowing how much of that disagreement is real signal and
                how much is instrument noise — especially for a measurement like
                rebreathed fraction, which is built by subtracting two readings and
                therefore carries both of their errors at once. Slide the noise control
                below to see how a chin-minus-top calculation responds as each pod gets
                noisier, and why calibrating every pod individually isn't optional.
              </p>
            </div>
            <div className="ares-interactive-frame" data-aos="fade-up">
              <Suspense fallback={LOADING_FALLBACK}>
                <PodDisagreement />
              </Suspense>
            </div>
          </div>
        </section>

        {/* ===== SECTION 7: WHAT'S NEXT ===== */}
        <section id="ares-next">
          <div className="container">
            <div className="title-wrap mb-4" data-aos="fade-up">
              <h2 className="section-title">What’s <b>Next</b></h2>
              <p className="section-sub-title">
                Two changes, both aimed at making the reference sensor honest.
              </p>
            </div>
            <div className="row justify-content-center" data-aos="fade-up">
              <div className="col-md-6 mb-4">
                <div className="ares-next-card">
                  <div className="ares-next-card-icon"><i className="fas fa-arrows-alt" aria-hidden="true" /></div>
                  <h3 className="ares-next-card-title">Move the top pod</h3>
                  <p className="ares-next-card-body">
                    Relocate it off the crown and behind it, out of the rising column, so
                    the reference samples air the body hasn't already processed.
                  </p>
                </div>
              </div>
              <div className="col-md-6 mb-4">
                <div className="ares-next-card">
                  <div className="ares-next-card-icon"><i className="fas fa-compress-alt" aria-hidden="true" /></div>
                  <h3 className="ares-next-card-title">Lower its profile</h3>
                  <p className="ares-next-card-body">
                    Cut the physical height of the pod itself, so it stops standing tall
                    enough to shadow the very airflow it's trying to sample.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===== SECTION 8: JOIN ===== */}
        <section id="ares-join" style={{ background: 'var(--color-bg-sand)' }}>
          <div className="container text-center">
            <h2 className="section-title" style={{ marginBottom: '1rem' }}>
              Work on <b>ARES</b>
            </h2>
            <p style={{ color: 'var(--color-muted)', lineHeight: '1.8', maxWidth: '600px', margin: '0 auto 2rem' }}>
              ARES is a Purdue SEARCH project built in partnership with a Purdue lab under
              Dr. D. Marshall Porterfield. If the physics above raised more questions than
              it answered, that's the idea — the two deep-dives below cover the numbers
              and the hardware in full.
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '2rem' }}>
              <Link to="/ares/the-science" className="btn-slide-outline">
                <span>The Science</span>
              </Link>
              <Link to="/ares/the-headset" className="btn-slide-outline">
                <span>The Headset</span>
              </Link>
            </div>
            <Link to="/contact" className="btn-slide-fill" style={{ padding: '0.65rem 2rem', display: 'inline-block' }}>
              <span>Get in touch</span>
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Ares;
