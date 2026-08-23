import { useEffect, useRef, useState } from 'react';
import { createParticles, stepParticles, regimeFor } from '../../lib/ares/plumeModel';
import { GRAVITY } from './aresPhysics';

/**
 * PlumeSimulator — the hero interactive on /ares, and the component that
 * carries the page's thesis. Dragging the slider from Earth through Mars to
 * zero does not make CO2 "appear" — it kills the buoyant plume that was
 * carrying it away, and the exhaled gas pools in front of the face because
 * nothing is left to sweep it aside. See C13 ("the CO2 bubble is not CO2
 * appearing, it is a ventilation structure disappearing") and plumeModel.js,
 * which is the physics interface this component consumes verbatim.
 *
 * THIS IS A TUNED ANIMATION, NOT A CFD RESULT — the caption says so on
 * screen, because presenting one as the other is exactly the habit the
 * source course teaches against. The Grashof/Rayleigh numbers next to it are
 * real (regimeFor() calls the same grashof()/rayleigh() used everywhere else
 * on the site); only the particle motion is illustrative.
 */

const WIDTH = 400;
const HEIGHT = 500;
const SOURCE = { x: 200, y: 380 };
const COUNT = 320;

// Concentration ramp — mirrors --ares-conc-0 -> --ares-conc-2 in
// public/ares-theme.css. A canvas 2D context cannot read CSS custom
// properties, so the ramp is hardcoded here as literals and must be kept in
// sync with the tokens by hand if the palette ever moves.
const CONC_0_RGB = [245, 239, 230]; // --ares-conc-0 #f5efe6
const CONC_2_RGB = [230, 208, 172]; // --ares-conc-2 #e6d0ac

// Backdrop + silhouette colours. Also canvas literals for the same reason,
// chosen from the --ares-panel / --ares-panel-sunk / --ares-grid-line family
// so the drawing reads as part of the same warm instrument, not a separate
// visual language.
const BG_FILL = '#fff9f4'; // mirrors --ares-panel
const SILHOUETTE_FILL = '#d9c8ac'; // warm sand, between --ares-panel-sunk and --ares-conc-2
const SILHOUETTE_STROKE = 'rgba(122, 111, 104, 0.4)'; // mirrors --ares-grid-line

// Visual tuning only — not physical constants, so aresPhysics.js has no
// equivalents for these. Dot radius and the alpha floor/ceiling control how
// strongly co2 reads as visible pooling versus background air.
const DOT_RADIUS = 2.1;
const MIN_ALPHA = 0.07;
const MAX_ALPHA = 0.88;

const lerp = (a, b, t) => a + (b - a) * t;

function concentrationColor(co2) {
  const t = Math.min(1, Math.max(0, co2));
  return [
    Math.round(lerp(CONC_0_RGB[0], CONC_2_RGB[0], t)),
    Math.round(lerp(CONC_0_RGB[1], CONC_2_RGB[1], t)),
    Math.round(lerp(CONC_0_RGB[2], CONC_2_RGB[2], t)),
  ];
}

/**
 * A readable head-and-shoulders reference shape, not portraiture — just
 * enough geometry that "plume rises past the chin and off the crown" reads
 * at a glance. Coordinates are canvas layout values in the fixed WIDTH x
 * HEIGHT frame, not physical constants.
 */
function drawSilhouette(ctx) {
  ctx.fillStyle = SILHOUETTE_FILL;
  ctx.strokeStyle = SILHOUETTE_STROKE;
  ctx.lineWidth = 1.5;

  // Shoulders
  ctx.beginPath();
  ctx.moveTo(84, HEIGHT + 4);
  ctx.lineTo(118, 428);
  ctx.quadraticCurveTo(200, 400, 282, 428);
  ctx.lineTo(316, HEIGHT + 4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Neck
  ctx.beginPath();
  ctx.rect(181, 386, 38, 48);
  ctx.fill();

  // Head — SOURCE sits just under the chin, roughly where this ellipse's
  // base meets the neck, since that is where the model emits CO2.
  ctx.beginPath();
  ctx.ellipse(200, 332, 54, 64, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

/**
 * Module-level and pure: clear, paint the backdrop, draw the silhouette,
 * draw every particle as a dot whose alpha comes from p.co2 and whose colour
 * ramps toward the CO2 tokens. Called once for the reduced-motion still
 * frame and once per animation tick; never touches React state.
 */
function drawFrame(ctx, particles) {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = BG_FILL;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  drawSilhouette(ctx);

  for (let i = 0; i < particles.length; i += 1) {
    const p = particles[i];
    const t = Math.min(1, Math.max(0, p.co2));
    const alpha = MIN_ALPHA + (MAX_ALPHA - MIN_ALPHA) * t;
    const [r, g, b] = concentrationColor(p.co2);
    ctx.beginPath();
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
    ctx.arc(p.x, p.y, DOT_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }
}

const reduceMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const verdictLabel = (v) => v.charAt(0).toUpperCase() + v.slice(1);

// Precomputed once at module load — used only by the static fallback below,
// so it does not need to live in component state. GRAVITY.earth/mars/orbit,
// never a typed-in 9.81 / 3.71 / 0.
const FALLBACK_STATES = [
  { key: 'earth', label: 'Earth', g: GRAVITY.earth },
  { key: 'mars', label: 'Mars', g: GRAVITY.mars },
  { key: 'orbit', label: 'Orbit (microgravity)', g: GRAVITY.orbit },
].map((state) => ({ ...state, regime: regimeFor({ g: state.g }) }));

const fmtExp = (v) => (typeof v === 'number' && Number.isFinite(v) ? v.toExponential(1) : '—');

export default function PlumeSimulator() {
  const [g, setG] = useState(GRAVITY.earth);
  const canvasRef = useRef(null);
  const particlesRef = useRef(createParticles(COUNT));
  const gRef = useRef(g);
  gRef.current = g;

  const regime = regimeFor({ g });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    // DPR handling: back the canvas at device-pixel resolution so the dots
    // and silhouette stay crisp, then draw entirely in the fixed logical
    // WIDTH x HEIGHT frame that stepParticles also uses. Set once, outside
    // the loop — calling ctx.scale per frame would compound.
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    canvas.width = WIDTH * dpr;
    canvas.height = HEIGHT * dpr;
    ctx.scale(dpr, dpr);

    if (reduceMotion()) {
      // Draw one settled frame and stop. No loop at all.
      drawFrame(ctx, particlesRef.current);
      return undefined;
    }

    let raf = null;
    let running = false;

    const loop = () => {
      // No rng passed — the live component wants real randomness. Only the
      // tests seed it.
      particlesRef.current = stepParticles(particlesRef.current, {
        g: gRef.current,
        dt: 1 / 60,
        width: WIDTH,
        height: HEIGHT,
        sourceX: SOURCE.x,
        sourceY: SOURCE.y,
      });
      drawFrame(ctx, particlesRef.current);
      raf = requestAnimationFrame(loop);
    };

    // Offscreen pause: a particle sim in a background tab is a battery bug.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !running) {
          running = true;
          raf = requestAnimationFrame(loop);
        } else if (!entry.isIntersecting && running) {
          running = false;
          if (raf) cancelAnimationFrame(raf);
          raf = null;
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(canvas);

    return () => {
      observer.disconnect();
      running = false;
      // Cancel a frame already in flight — Framer Motion unmounts this page
      // on navigation, and `raf` here closes over the same binding `loop`
      // keeps reassigning, so this always cancels the most recently
      // scheduled frame rather than a stale one.
      if (raf) cancelAnimationFrame(raf);
      raf = null;
    };
  }, []);

  return (
    <div className="ares-plume-sim">
      <div className="ares-plume-visual">
        <canvas
          ref={canvasRef}
          className="ares-plume-canvas"
          width={WIDTH}
          height={HEIGHT}
          aria-hidden="true"
        />

        {/* Narrow-viewport / non-canvas fallback: the same regime figures the
            live readout below shows, computed for three fixed gravities and
            presented as text rather than as motion. */}
        <div className="ares-plume-fallback">
          <p className="ares-plume-fallback-intro">
            Regime at three gravities, from the same model as the readout below:
          </p>
          <dl className="ares-plume-fallback-list">
            {FALLBACK_STATES.map((state) => (
              <div key={state.key} className="ares-plume-fallback-row">
                <dt>
                  {state.label}{' '}
                  <span className="ares-plume-fallback-g">({state.g.toFixed(2)} m/s²)</span>
                </dt>
                <dd>
                  Grashof {fmtExp(state.regime.gr)} — {verdictLabel(state.regime.verdict)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <label className="ares-slider-label" htmlFor="ares-gravity">
        Gravity
      </label>
      <input
        id="ares-gravity"
        type="range"
        min={GRAVITY.orbit}
        max={GRAVITY.earth}
        step="0.01"
        value={g}
        onChange={(e) => setG(Number(e.target.value))}
        aria-describedby="ares-gravity-readout"
      />
      <div className="ares-slider-ticks" aria-hidden="true">
        <span>Orbit</span>
        <span>Mars</span>
        <span>Earth</span>
      </div>

      <div id="ares-gravity-readout" className="ares-readout" aria-live="polite">
        <p>
          {g.toFixed(2)} m/s². Grashof {fmtExp(regime.gr)}, Rayleigh {fmtExp(regime.ra)} —{' '}
          {regime.verdict}.
        </p>
      </div>

      <p className="ares-caption">
        Illustrative particle model, not a CFD result. The Grashof and Rayleigh
        numbers beside it are computed for a {regime.L} m characteristic length
        and an {regime.dT} K surface-to-air difference.
      </p>
    </div>
  );
}
