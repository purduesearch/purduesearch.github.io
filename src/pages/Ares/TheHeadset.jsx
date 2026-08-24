import { lazy, Suspense, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import SEOHead from '../../components/SEOHead';
import SectionProgressRail from '../../components/SectionProgressRail';
import AresStat from '../../components/ares/AresStat';
import AresTerm from '../../components/ares/AresTerm';
import AresFigure from '../../components/ares/AresFigure';
import { NDIR_BAND_UM } from '../../components/ares/aresPhysics';

const SystemDiagram = lazy(() => import('../../components/ares/SystemDiagram'));
const NdirBeam = lazy(() => import('../../components/ares/NdirBeam'));
const DelayVsT90 = lazy(() => import('../../components/ares/DelayVsT90'));
const PodDisagreement = lazy(() => import('../../components/ares/PodDisagreement'));

const HEADSET_RAIL_SECTIONS = [
  { id: 'hs-system',      label: 'The System' },
  { id: 'hs-sensing',     label: 'Sensing CO₂' },
  { id: 'hs-sampling',    label: 'Getting the Air There' },
  { id: 'hs-calibration', label: 'Calibration' },
  { id: 'hs-gallery',     label: 'Hardware' },
];

const SYSTEM_STEPS = [
  {
    title: 'Three pods',
    body: 'Top, forehead, and chin each measure CO₂ where they sit — independently, at the same time, with no shared reading.',
  },
  {
    title: 'Aggregation',
    body: 'The three separate measurements are combined into one on-body record. Nothing before this step has been compared to anything else.',
  },
  {
    title: 'On-body logging',
    body: 'The combined record is stored on the headset itself, so a session survives even if nothing else is listening.',
  },
  {
    title: 'Sync',
    body: 'The stored record moves from the headset to a companion application when the two are in contact.',
  },
  {
    title: 'Application',
    body: 'The record is presented to the person wearing the headset, or to a researcher reviewing a session.',
  },
  {
    title: 'Analysis',
    body: 'The step every earlier block exists to feed — turning a stored record into a claim, the way the previous page describes.',
  },
];

/**
 * Companion-app screens, in the order the SYSTEM_STEPS walk reaches them:
 * live capture, the recorded traces, the derived readings, and the session
 * map. These are screenshots of the app as it stands, not mockups.
 */
const APP_SCREENS = [
  {
    src: '/ares/app-live.webp',
    alt: 'App home screen, recording live. A biometrics card reads 70 bpm, and pod cards below it read 446 ppm at the top pod and 500 ppm at the forehead pod.',
    caption: 'Live capture. Each pod reports separately — no combined number.',
  },
  {
    src: '/ares/app-graphs.webp',
    alt: 'App graphs screen with three stacked time series labelled TOP, FORE and CHIN, each trending over a five-minute window.',
    caption: 'The three traces, kept apart. A difference is only meaningful if you can still see both terms.',
  },
  {
    src: '/ares/app-insights.webp',
    alt: 'App insights screen listing thermal comfort at −0.71 PMV, rebreathing at 0.00 percent, infection risk low, hydration −1.4 percent, and CO₂ dose 4 ppm-hours today.',
    caption: 'Derived readings, each labelled with what it was derived from.',
  },
  {
    src: '/ares/app-map.webp',
    alt: 'App map screen showing a cluster of coloured sample points along a street, with a timeline scrubber at the bottom.',
    caption: 'Session playback against location, for walked outdoor runs.',
  },
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

        {/* ===== hs-system ===== */}
        <section id="hs-system">
          <div className="container">
            <div className="title-wrap mb-4" data-aos="fade-up">
              <h2 className="section-title">The System</h2>
            </div>

            <p className="ares-section-lead" data-aos="fade-up">
              The headset is one end of a chain: three pods feed a combined record, and everything
              after that record exists only to get it in front of someone who can interpret it.
            </p>

            <Suspense fallback={
              <div className="ares-lazy-shell" aria-busy="true">
                <div className="ares-spinner" aria-hidden="true" />
                <span>Loading diagram…</span>
              </div>
            }>
              <SystemDiagram />
            </Suspense>

            <ol className="ares-block-walk" data-aos="fade-up">
              {SYSTEM_STEPS.map((step) => (
                <li key={step.title}>
                  <strong>{step.title}.</strong> {step.body}
                </li>
              ))}
            </ol>

            <p data-aos="fade-up">
              The last two blocks in that chain are a phone. The companion app is where a stored
              session stops being a file and starts being something a person can read, and its layout
              follows the same rule the hardware does: the three pods stay separate all the way
              through. Nothing in the app shows you a single &ldquo;CO₂ number&rdquo; for the
              headset, because there isn&rsquo;t one — the measurement that matters is a difference,
              and a difference needs both of its terms visible.
            </p>

            <div className="ares-app-strip" data-aos="fade-up">
              {APP_SCREENS.map((screen) => (
                <figure className="ares-app-screen" key={screen.src}>
                  <img loading="lazy" src={screen.src} alt={screen.alt} />
                  <figcaption>{screen.caption}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        {/* ===== hs-sensing ===== */}
        <section id="hs-sensing" style={{ background: 'var(--color-bg-sand)' }}>
          <div className="container">
            <div className="title-wrap mb-4" data-aos="fade-up">
              <h2 className="section-title">Sensing CO₂</h2>
            </div>

            <p className="ares-section-lead" data-aos="fade-up">
              Each pod senses CO₂ by <AresTerm term="NDIR">NDIR</AresTerm> — shine infrared light
              through the air, measure how much of it comes out the other side, and the light that went
              missing tells you how much CO₂ was in the way.
            </p>

            <Suspense fallback={
              <div className="ares-lazy-shell" aria-busy="true">
                <div className="ares-spinner" aria-hidden="true" />
                <span>Loading beam diagram…</span>
              </div>
            }>
              <NdirBeam />
            </Suspense>

            <p data-aos="fade-up">
              &ldquo;Non-dispersive&rdquo; describes what the instrument does <em>not</em> have. A
              dispersive spectrometer spreads light into a spectrum with a grating and reads a
              wavelength off a position. An NDIR sensor skips all of that: a broadband source floods the
              whole optical path, and a single fixed bandpass filter selects the one band the detector
              is allowed to see.
            </p>

            <p data-aos="fade-up">
              CO₂ absorbs strongly at one particular wavelength because of how the molecule itself
              vibrates — its two oxygen atoms swinging the same direction while the carbon swings the
              other way, lengthening one bond as the other shortens. That mode is the strongest CO₂
              absorption feature in the accessible infrared, which is the whole reason the filter is
              tuned there. Nitrogen and oxygen, by contrast, are symmetric two-atom molecules with
              nothing in their charge distribution for that light to push on — they are essentially
              transparent at this wavelength, so the sensor is looking at a nearly empty background with
              CO₂ as almost the only thing in the way.
            </p>

            <div data-aos="fade-up">
              <AresFigure
                standalone
                wide
                src="/ares/pod-interior.webp"
                alt="A 3D-printed white pod shell held open, showing a black cylindrical gas sensor with two ported inlets on its face, seated next to a small circuit board wired with blue, yellow, black and red leads."
                caption="Inside one pod. The black cylinder is the sensing element; the two ports on its face are where air enters and leaves the optical path described above. Everything else in the shell exists to hold it still and get its readings out."
              />
            </div>

            <div className="ares-stat-row" data-aos="fade-up">
              <AresStat
                value={NDIR_BAND_UM}
                decimals={2}
                unit="µm"
                label="CO₂ absorption band the filter selects"
                source="CO₂ vibrational spectroscopy"
              />
            </div>

            <p className="ares-caption" data-aos="fade-up">
              One optical design cannot be excellent at reading both a nearly-empty room and a lungful
              of breath at once — a longer optical path buys resolution near ambient concentrations and
              loses it at high ones, and the reverse is true of a shorter path. Range, resolution, and
              the physical size of the sensor are one trade with three names.
            </p>
          </div>
        </section>

        {/* ===== hs-sampling ===== */}
        <section id="hs-sampling">
          <div className="container">
            <div className="title-wrap mb-4" data-aos="fade-up">
              <h2 className="section-title">Getting the Air There</h2>
            </div>

            <p className="ares-section-lead" data-aos="fade-up">
              A sensor at the end of a sample line does not measure the air at the inlet. It measures
              the air that <em>used to be</em> at the inlet, a short time later, after being carried
              down a tube and blurred on the way. Two different quantities hide inside that lag, and
              they are constantly confused with each other.
            </p>

            <Suspense fallback={
              <div className="ares-lazy-shell" aria-busy="true">
                <div className="ares-spinner" aria-hidden="true" />
                <span>Loading plot…</span>
              </div>
            }>
              <DelayVsT90 />
            </Suspense>

            <p data-aos="fade-up">
              <strong>Transport delay</strong> is a property of the plumbing — the time gas takes to
              travel from the sampling point to the sensor&rsquo;s inlet. <AresTerm term="T90">T90</AresTerm>{' '}
              is a property of the sensor — measured from the moment the gas actually arrives, the
              further time the sensor takes to settle on 90&nbsp;% of its new reading. What you observe
              is their sum, and the data alone does not tell you how much of it is which.
            </p>

            <p data-aos="fade-up">
              They are corrected differently, which is why keeping them apart matters. A transport
              delay is a pure shift — the signal is correct, only late, so it is subtracted and the
              signal is right again. A T90 is a distortion — the signal has been smeared through
              something that behaves like a low-pass filter, and undoing that means deconvolving it or
              living with it. Subtracting a delay that should have been deconvolved leaves the
              distortion in place; deconvolving a delay that should have been subtracted invents
              structure that was never there. And because dispersion smears a sharp step on its way down
              a tube, the delay itself is measured at the point where the reading crosses halfway to its
              new value, not at the first sign of movement — first movement runs early, systematically,
              every time.
            </p>

            <p className="ares-caption" data-aos="fade-up">
              The plot above uses adjustable, illustrative tube and sensor values chosen to show the
              shape of the distinction clearly — not ARES&rsquo;s own sampling geometry.
            </p>
          </div>
        </section>

        {/* ===== hs-calibration ===== */}
        <section id="hs-calibration" style={{ background: 'var(--color-bg-sand)' }}>
          <div className="container">
            <div className="title-wrap mb-4" data-aos="fade-up">
              <h2 className="section-title">Calibration</h2>
            </div>

            <p className="ares-section-lead" data-aos="fade-up">
              Three nominally identical sensors do not read identically. Real manufacturing variation
              means each part has its own small zero offset, and a correction fitted to one part does
              not reliably transfer to its neighbour — which is why calibration on ARES happens per
              sensor, never once for the batch.
            </p>

            <Suspense fallback={
              <div className="ares-lazy-shell" aria-busy="true">
                <div className="ares-spinner" aria-hidden="true" />
                <span>Loading chart…</span>
              </div>
            }>
              <PodDisagreement />
            </Suspense>

            <p data-aos="fade-up">
              That matters more here than it would for a single sensor reading alone, because{' '}
              <Link to="/ares/the-science">the rebreathed fraction</Link> is a difference of two pod
              readings, and a difference inherits both sensors&rsquo; errors rather than cancelling
              them. A per-pod offset that would be a rounding error on its own can be a large fraction
              of a small difference.
            </p>

            <p data-aos="fade-up">
              The chart above also shows why letting a sensor correct itself automatically is risky on a
              wearable. Many CO₂ sensors periodically re-zero to the lowest concentration they have seen
              over some window, on the assumption that the sensor meets genuinely fresh outdoor air at
              some point in that window — a reasonable assumption for a sensor bolted to a wall. A
              headset pod spends its working life within arm&rsquo;s reach of a CO₂ source: the
              wearer&rsquo;s own breath. It can go a long time without ever seeing outdoor air, so the
              lowest concentration it has seen is not a fresh-air baseline at all — it is whichever
              moment happened to be least crowded. Re-zeroing to that point does not remove the sensor&rsquo;s
              drift. It quietly redefines zero to a value that was never actually ambient air.
            </p>
          </div>
        </section>

        {/* ===== hs-gallery ===== */}
        <section id="hs-gallery">
          <div className="container">
            <div className="title-wrap mb-4" data-aos="fade-up">
              <h2 className="section-title">Hardware</h2>
            </div>

            <p className="ares-section-lead" data-aos="fade-up">
              What the system above actually looks like on a bench. This is a working prototype, not
              a product photo: the cable loom is hand-terminated, the pod shells are printed, and the
              reference pod is still sitting where the rest of this site argues it should not.
            </p>

            <div data-aos="fade-up">
              <AresFigure
                standalone
                src="/ares/headset-assembly.webp"
                alt="The ARES headset held up in one hand. A black printed frame carries three sensor pods, joined by a loom of red, yellow, blue and black wires with connectors at several points."
                caption="The full assembly. Three pods on a printed frame, wired to a shared loom, with connectors at each pod so a unit can be swapped out without recutting the harness."
              />
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default TheHeadset;
