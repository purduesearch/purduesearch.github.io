import { lazy, Suspense, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import SEOHead from '../../components/SEOHead';
import SectionProgressRail from '../../components/SectionProgressRail';
import AresStat from '../../components/ares/AresStat';
import AresTerm from '../../components/ares/AresTerm';
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
 * Figure slot that degrades gracefully to an intentional placeholder when no
 * image exists yet. public/ares/ is empty and no ARES image exists anywhere
 * in the repo — the onError fallback (and the failed-by-default state when
 * src is omitted) is what keeps that from rendering a broken-image icon.
 * Every third-party figure must carry a credit string, and no photograph may
 * be committed until a human has done the copyright check (spec §7) — these
 * slots ship empty on purpose; the files land later.
 */
function AresFigure({ src, alt, caption, credit }) {
  const [failed, setFailed] = useState(!src);

  if (failed) {
    return (
      <figure className="ares-figure">
        <div className="ares-figure-placeholder" role="img" aria-label={alt}>
          <i className="fas fa-camera" aria-hidden="true" />
          <span>{alt}</span>
        </div>
        {caption && <figcaption>{caption}</figcaption>}
      </figure>
    );
  }

  return (
    <figure className="ares-figure">
      <img loading="lazy" src={src} alt={alt} onError={() => setFailed(true)} />
      {caption && (
        <figcaption>
          {caption}
          {credit && <span className="ares-figure-credit">{credit}</span>}
        </figcaption>
      )}
    </figure>
  );
}

const GALLERY_SLOTS = [
  {
    alt: 'The ARES headset, front view',
    caption: 'The headset as currently assembled — three pods on a wearable frame.',
  },
  {
    alt: 'A single sensor pod, detail view',
    caption: 'One of the three pods. Each houses its own CO₂ sensing element.',
  },
  {
    alt: 'The headset worn during a bench test',
    caption: 'A bench test of the full system, pods and companion app together.',
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
              <i className="fas fa-images" aria-hidden="true" /> Photographs land here once each one has
              cleared copyright review. The layout is already built for them.
            </p>

            <div className="ares-gallery-grid" data-aos="fade-up">
              {GALLERY_SLOTS.map((slot) => (
                <AresFigure key={slot.alt} alt={slot.alt} caption={slot.caption} />
              ))}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default TheHeadset;
