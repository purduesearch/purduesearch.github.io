import { lazy, Suspense, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import SEOHead from '../../components/SEOHead';
import SectionProgressRail from '../../components/SectionProgressRail';
import AresStat from '../../components/ares/AresStat';
import AresTerm from '../../components/ares/AresTerm';
import { PLUME } from '../../components/ares/aresPhysics';
import { EXHALED_PPM, POD_POSITIONS } from '../../lib/ares/breathModel';

const RegimePlayground = lazy(() => import('../../components/ares/RegimePlayground'));

const SCIENCE_RAIL_SECTIONS = [
  { id: 'sci-regimes',    label: 'Regimes' },
  { id: 'sci-numbers',    label: 'The Numbers' },
  { id: 'sci-reading',    label: 'Reading a Result' },
  { id: 'sci-rebreath',   label: 'Rebreathed Fraction' },
  { id: 'sci-validation', label: 'Validation' },
];

const READING_STEPS = [
  {
    title: 'Separate what the model claims from what it shows.',
    body: (
      <>
        A simulation is a solver&rsquo;s own accounting of what a set of equations produces under the
        assumptions it was handed. That is worth having, and it is not automatically a description of
        the room. Read a modelling result one sentence at a time and ask which of two very different
        claims it is actually making — &ldquo;the model predicts&hellip;&rdquo; or &ldquo;we
        found&hellip;&rdquo; Only a comparison against something measured earns the second one.
      </>
    ),
  },
  {
    title: 'Find the passive-scalar assumption.',
    body: (
      <>
        A common shortcut for modelling a trace substance carried by a fluid is to treat it as a{' '}
        <strong>passive scalar</strong>: something the flow pushes around that pushes back on nothing.
        It is cheap, and it is usually defensible when the substance is dilute enough that it does not
        change the fluid&rsquo;s own density or momentum. It is still an assumption a modeller made,
        not a fact the simulation discovered — so ask what it leaves out. A real exhaled breath carries
        its own temperature and its own composition; a passive-scalar model only lets the temperature
        push back.
      </>
    ),
  },
  {
    title: 'State the Boussinesq approximation in words before symbols.',
    body: (
      <>
        In words: treat density as constant everywhere in the flow <em>except</em> in the one term
        where gravity multiplies it, because that is the only place a small density difference has an
        outsized effect. In symbols, later, that collapses to holding density fixed everywhere but the
        buoyancy term. The words are the part worth keeping, because they say where the approximation
        can fail: it holds only while the temperature differences involved stay small enough that
        density itself shifts by a modest fraction rather than a large one.
      </>
    ),
  },
  {
    title: 'Ask what it was validated against, and how far that validation reaches.',
    body: (
      <>
        A model that has never been compared against a physical measurement is an internally
        consistent picture — correct arithmetic performed on the assumptions it was given. That is a
        real achievement and a limited one. It tells you the solver did its job, not that the room
        behaves that way. The point worth marking on any result is exactly where extrapolation past a
        validated regime begins, because everything past that point is prediction, not evidence,
        however smooth the plot looks.
      </>
    ),
  },
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

        {/* ===== sci-regimes ===== */}
        <section id="sci-regimes">
          <div className="container">
            <div className="title-wrap mb-4" data-aos="fade-up">
              <h2 className="section-title">Regimes</h2>
            </div>

            <p className="ares-section-lead" data-aos="fade-up">
              A molecule of CO₂ has exactly two ways to get from a mouth to somewhere else:{' '}
              <AresTerm term="BTC">biothermal convection</AresTerm> carrying it along with the bulk
              motion of warmed air, or diffusion carrying it alone, one random step at a time, down its
              own concentration gradient. On Earth the first one so completely dominates the second
              that most people never notice the second exists.
            </p>

            <p data-aos="fade-up">
              Metabolic heat keeps the air touching your skin slightly warmer, and therefore slightly
              less dense, than the air around it. A less dense parcel in a gravity field feels a net
              upward push, and that push is continuous — every square inch of a warm body drives it,
              for as long as the body is warm and gravity is present. The rising column it produces is
              the <AresTerm term="HTBP">human thermal body plume</AresTerm>, and it is why the air in
              front of your face right now is not the air you exhaled thirty seconds ago. Take gravity
              away and there is nothing left to push against — the warmth is unchanged, the metabolism
              is unchanged, but the air has no reason to go anywhere in particular.
            </p>

            <p data-aos="fade-up">
              A candle flame makes the same point visible. Lit on Earth it is a teardrop, because hot
              combustion gas rises and pulls cool air in beneath it to replace it — the same buoyant
              loop that shapes the plume around a body. Lit in microgravity it burns as a small, dim,
              nearly spherical ball, because the only thing left to bring oxygen in and carry exhaust
              out is diffusion, and diffusion has no preferred direction. Nothing about the chemistry
              changed. What changed is which transport mechanism was doing the work.
            </p>

            <div className="row ares-compare-grid" data-aos="fade-up">
              <div className="col-md-6">
                <div className="ares-compare-col">
                  <h3><i className="fas fa-wind" aria-hidden="true" /> What stops</h3>
                  <ul>
                    <li>Whether there is a bulk flow at all — the plume itself disappears.</li>
                    <li>The rate air renews at your face. Convection is fast; without it, replacement
                      crawls.</li>
                    <li>The plume&rsquo;s shape. A directional column collapses toward something with
                      no preferred direction.</li>
                  </ul>
                </div>
              </div>
              <div className="col-md-6">
                <div className="ares-compare-col">
                  <h3><i className="fas fa-arrows-left-right" aria-hidden="true" /> What doesn&rsquo;t</h3>
                  <ul>
                    <li>The concentration gradient at your face — you are still exhaling CO₂ there.</li>
                    <li>Diffusion&rsquo;s own mechanism, governed by the same molecular diffusivity it
                      always was.</li>
                    <li>Transport itself. It is not absent — <AresTerm term="IBD">indirect biophysical
                      diffusion</AresTerm> is what is left once convection has collapsed, and it is
                      real, it is just very slow.</li>
                  </ul>
                </div>
              </div>
            </div>

            <p data-aos="fade-up">
              &ldquo;Microgravity stops CO₂ from moving&rdquo; is the wrong sentence. The right one is
              that microgravity stops the <em>air</em> from moving, and diffusion — the slowest
              transport mechanism available — is what is left to do a job convection used to do almost
              instantly.
            </p>

            <div className="ares-stat-row" data-aos="fade-up">
              <AresStat
                value={PLUME.crownVelocityMin}
                decimals={1}
                unit="m/s"
                label="Plume crown velocity — low end"
                source="Dutta et al."
              />
              <AresStat
                value={PLUME.crownVelocityMax}
                decimals={1}
                unit="m/s"
                label="Plume crown velocity — high end"
                source="Dutta et al."
              />
              <AresStat
                value={PLUME.developmentLengthM}
                decimals={1}
                unit="m"
                label="Plume development length"
                source="Dutta et al."
              />
            </div>

            <p className="ares-caption" data-aos="fade-up">
              None of this is obvious from staring at a room. It is a question you answer by comparing
              the size of two forces, or two transport rates, against each other — which is what the
              numbers in the next section are for.
            </p>
          </div>
        </section>

        {/* ===== sci-numbers ===== */}
        <section id="sci-numbers" style={{ background: 'var(--color-bg-sand)' }}>
          <div className="container">
            <div className="title-wrap mb-4" data-aos="fade-up">
              <h2 className="section-title">The Numbers</h2>
            </div>

            <p className="ares-section-lead" data-aos="fade-up">
              Four dimensionless numbers turn &ldquo;does buoyancy matter here&rdquo; from an opinion
              into an arithmetic question. Each one is a ratio of two competing effects — change the
              sliders and watch which side of each ratio grows.
            </p>

            <Suspense fallback={
              <div className="ares-lazy-shell" aria-busy="true">
                <div className="ares-spinner" aria-hidden="true" />
                <span>Loading the regime playground…</span>
              </div>
            }>
              <RegimePlayground />
            </Suspense>

            <ul className="ares-ratio-list" data-aos="fade-up">
              <li>
                <strong>Grashof (Gr)</strong> — the ratio of the buoyant force trying to push a warm
                parcel of air upward to the viscous force resisting it.
              </li>
              <li>
                <strong>Rayleigh (Ra)</strong> — Grashof multiplied by the Prandtl number; the ratio of
                buoyant driving to diffusive damping, folding in how quickly heat itself diffuses away
                before buoyancy can act on it.
              </li>
              <li>
                <strong>Péclet (Pe), mass-transport form</strong> — the ratio of how fast bulk motion
                carries a molecule of CO₂ away to how fast diffusion alone would do the same job.
              </li>
              <li>
                <strong>Reynolds (Re)</strong> — the ratio of inertial force to viscous force; whether a
                flow is smooth and layered or tumbling and turbulent.
              </li>
            </ul>

            <p className="ares-caption" data-aos="fade-up">
              A large Grashof or Rayleigh number says buoyancy dominates viscosity outright, not by a
              little. Around a standing human body on Earth, both numbers come out large by any
              measure — buoyancy is not competing with anything, it is winning without a contest. That
              is the arithmetic version of the candle-flame picture above.
            </p>
          </div>
        </section>

        {/* ===== sci-reading ===== */}
        <section id="sci-reading">
          <div className="container">
            <div className="title-wrap mb-4" data-aos="fade-up">
              <h2 className="section-title">Reading a Result</h2>
            </div>

            <p className="ares-section-lead" data-aos="fade-up">
              ARES leans on computational fluid dynamics results the team did not run. That is normal —
              nobody re-derives every simulation they cite — but it means the team&rsquo;s job is
              reading a modelling result critically rather than taking its headline number at face
              value. The habit below is general. It applies to any simulation handed to you, not one
              particular paper.
            </p>

            <ol className="ares-method-steps" data-aos="fade-up">
              {READING_STEPS.map((step, i) => (
                <li className="ares-method-step" key={step.title}>
                  <span className="ares-method-step-num" aria-hidden="true">{i + 1}</span>
                  <div className="ares-method-step-body">
                    <h3>{step.title}</h3>
                    <p>{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>

            <p className="ares-caption" data-aos="fade-up">
              None of this makes a modelling result untrustworthy. It makes it a specific, checkable
              kind of claim rather than a photograph of the truth — and the next section is what
              checking one actually looks like.
            </p>
          </div>
        </section>

        {/* ===== sci-rebreath ===== */}
        <section id="sci-rebreath" style={{ background: 'var(--color-bg-sand)' }}>
          <div className="container">
            <div className="title-wrap mb-4" data-aos="fade-up">
              <h2 className="section-title">Rebreathed Fraction</h2>
            </div>

            <p className="ares-section-lead" data-aos="fade-up">
              Three pod readings and one assumption are all the rebreathed fraction takes to compute,
              and each pod is doing a different job.
            </p>

            <ul className="ares-pod-role-list" data-aos="fade-up">
              {POD_POSITIONS.map((pod) => (
                <li key={pod.id} className="ares-pod-role">
                  <span className={`ares-pod-role-tag ares-pod-role-tag--${pod.id}`}>{pod.label}</span>
                  <span className="ares-pod-role-where">{pod.where}</span>
                  <p>{pod.purpose}</p>
                </li>
              ))}
            </ul>

            <div className="ares-formula-block" data-aos="fade-up" aria-label="f sub r b equals, open parenthesis C sub chin minus C sub top close parenthesis, divided by, open parenthesis C sub exhaled minus C sub top close parenthesis">
              <span className="ares-formula-lhs" aria-hidden="true">f<sub>rb</sub> =</span>
              <span className="ares-formula-frac" aria-hidden="true">
                <span className="ares-formula-num">C<sub>chin</sub> − C<sub>top</sub></span>
                <span className="ares-formula-den">C<sub>exhaled</sub> − C<sub>top</sub></span>
              </span>
            </div>

            <p data-aos="fade-up">
              The numerator is how far the chin reading sits above the untouched reference. The
              denominator is the largest that gap could ever be — a full exhale, diluted by nothing at
              all. The model behind the readout above assumes a full exhale sits around{' '}
              {EXHALED_PPM.toLocaleString('en-US')} ppm — an illustrative magnitude, not a measured
              figure — for C<sub>exhaled</sub>. The ratio is what fraction of the air at the chin is
              air that has already been breathed.
            </p>

            <p data-aos="fade-up">Three caveats travel with this formula everywhere it is used:</p>

            <ol className="ares-caveat-list" data-aos="fade-up">
              <li>
                <strong>It is a two-compartment model.</strong> It assumes the air at the chin is
                exactly reference air plus exhaled breath, and nothing else mixed in.
              </li>
              <li>
                <strong>The top pod is a reference, not a datum.</strong> If it is standing in the
                rising plume rather than above it, its reading runs high, the numerator shrinks, and the
                computed fraction comes out biased <em>low</em> — not noisier, lower. That is the
                current state of the top pod, and the planned fix is mechanical: move it behind the
                crown and lower its height, out of the column of warm air entirely.
              </li>
              <li>
                <strong>It is a difference, so it inherits both sensors&rsquo; errors.</strong>{' '}
                Subtracting two independent readings does not cancel their noise — it adds to it. The{' '}
                <Link to="/ares/the-headset">headset page&rsquo;s calibration section</Link> shows what
                that costs in practice.
              </li>
            </ol>
          </div>
        </section>

        {/* ===== sci-validation ===== */}
        <section id="sci-validation">
          <div className="container">
            <div className="title-wrap mb-4" data-aos="fade-up">
              <h2 className="section-title">Validation</h2>
            </div>

            <p className="ares-section-lead" data-aos="fade-up">
              <AresTerm term="Schlieren">Schlieren imaging</AresTerm> is an optical technique that makes
              density gradients in transparent media visible — point a Schlieren rig at a person and the
              warm, buoyant plume rising off their body becomes a photograph rather than a model output.
              It is the closest thing this project has to ground truth.
            </p>

            <p data-aos="fade-up">
              The Earth-gravity half of the picture has real experimental backing. Published Schlieren
              photography of real people shows the same plume shape and the same redistribution pattern
              the underlying simulations predict — a genuine, if qualitative, agreement in structure
              between a model and a photograph of a real body.
            </p>

            <div className="ares-open-question" data-aos="fade-up">
              <i className="fas fa-triangle-exclamation" aria-hidden="true" />
              <div>
                <p className="ares-open-question-label">Open question</p>
                <p>
                  The microgravity half has no experimental validation at all. Nobody has flown a
                  Schlieren rig and a volunteer together, so everything the simulations say about the
                  collapsed, weightless case is extrapolation past the point where any validation
                  exists — a consistent, well-posed picture, not yet a confirmed one. Whether the plume
                  really collapses the way the equations say it should, and how closely, is not
                  something anybody has measured directly. Closing that specific gap — putting a real
                  sensor where the model only has a virtual one — is a large part of what ARES exists to
                  do.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default TheScience;
