import { useEffect, useId, useRef, useState } from 'react';
import { createParticles, stepParticles, regimeFor } from '../../lib/ares/plumeModel';
import { GRAVITY } from './aresPhysics';
import { prefersReducedMotion } from '../../hooks/usePrefersReducedMotion';

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
 *
 * RENDERING NOTE — why this does not draw flat dots any more. The previous
 * version ramped every particle between #f5efe6 and #e6d0ac and painted it on
 * a #fff9f4 canvas. Those three values are within about ten levels per channel
 * of each other, so the plume was measurably invisible: a browser probe of the
 * live canvas found only 0.8% of pixels differing perceptibly from the
 * background or the silhouette, and the largest non-background colour block on
 * screen was the silhouette itself. The page's central animation was, in
 * practice, a blank cream rectangle. Legibility here is not decoration — it is
 * the entire function of the component.
 */

const WIDTH = 400;
const HEIGHT = 500;
/** The mouth: where exhaled CO2 enters the field. On the face, not the axis. */
const SOURCE = { x: 237, y: 373 };
/** The body's vertical centreline, which is what the warm column forms around. */
const BODY_AXIS_X = 196;
const COUNT = 340;

/*
 * Palette. A canvas 2D context cannot read CSS custom properties, so these
 * mirror public/ares-theme.css by hand and must be kept in sync with it.
 *
 *   AIR_RGB   near --ares-panel-sunk — unheated room air, barely a tint
 *   WARM_RGB  --ares-trace-fore  #c98a2b — air the body has warmed
 *   CO2_RGB   --ares-trace-chin  #b83225 — air that has been through lungs
 *
 * Particles are composited with `multiply` onto the cream panel, so overlapping
 * parcels darken rather than flatly overwriting each other. That is what gives
 * the field depth and makes a dense plume core read as denser than its edges —
 * the same reason a Schlieren plate, which is what this figure is standing in
 * for, shows structure at all.
 */
const AIR_RGB = [205, 191, 178];
const WARM_RGB = [201, 138, 43];
const CO2_RGB = [184, 50, 37];

const BG_FILL = '#fff9f4';          // --ares-panel
const GRID_LINE = 'rgba(122, 111, 104, 0.10)';
const SILHOUETTE_FILL = '#e6dbcd';  // between --ares-panel-sunk and --ares-conc-1
const SILHOUETTE_STROKE = 'rgba(122, 111, 104, 0.45)';
const STREAK_STROKE = 'rgba(184, 138, 74, 0.30)';

/** Soft-blob sprite geometry, in logical px. Visual tuning, not physics. */
const SPRITE_R = 13;
const SPRITE_SIZE = SPRITE_R * 2;
/** Tint lookup resolution: HEAT_STEPS x CO2_STEPS pre-tinted sprites. */
const HEAT_STEPS = 6;
const CO2_STEPS = 6;
/** A parcel moving faster than this leaves a motion streak. */
const STREAK_MIN_SPEED = 1.2;
const STREAK_LENGTH = 3.2;

const lerp = (a, b, t) => a + (b - a) * t;
const mixRgb = (a, b, t) => [
  Math.round(lerp(a[0], b[0], t)),
  Math.round(lerp(a[1], b[1], t)),
  Math.round(lerp(a[2], b[2], t)),
];

/**
 * Tint for a parcel: room air warms toward ochre as it picks up body heat,
 * then swings toward Mars red as it picks up exhaled CO2. Two channels, so the
 * viewer can tell "warm air the body is moving" from "air you have breathed" —
 * a distinction the whole page rests on.
 */
function tintFor(heat, co2) {
  return mixRgb(mixRgb(AIR_RGB, WARM_RGB, heat), CO2_RGB, co2);
}

/**
 * Opacity for a parcel. CO2 is weighted far above heat so a small pocket of
 * rebreathed air stays readable against a large body of merely-warm air.
 */
function alphaFor(heat, co2) {
  return Math.min(0.9, 0.04 + heat * 0.2 + co2 * 0.78);
}

/**
 * Pre-render one soft radial sprite per (heat, co2) bucket. Built once per
 * canvas, then blitted with drawImage — a per-particle createRadialGradient
 * would be a new gradient object 340 times a frame at 60 fps.
 */
function buildSprites() {
  const sprites = [];
  for (let h = 0; h < HEAT_STEPS; h += 1) {
    for (let c = 0; c < CO2_STEPS; c += 1) {
      const heat = h / (HEAT_STEPS - 1);
      const co2 = c / (CO2_STEPS - 1);
      const [r, g, b] = tintFor(heat, co2);
      const off = document.createElement('canvas');
      off.width = SPRITE_SIZE;
      off.height = SPRITE_SIZE;
      const octx = off.getContext('2d');
      const grad = octx.createRadialGradient(
        SPRITE_R, SPRITE_R, 0, SPRITE_R, SPRITE_R, SPRITE_R,
      );
      grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 1)`);
      grad.addColorStop(0.45, `rgba(${r}, ${g}, ${b}, 0.55)`);
      grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      octx.fillStyle = grad;
      octx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
      sprites[h * CO2_STEPS + c] = off;
    }
  }
  return sprites;
}

/**
 * Head-and-shoulders in profile, facing right.
 *
 * Profile rather than the previous front-on ellipse for two reasons that are
 * both about legibility: it is the view every published Schlieren photograph
 * and CFD figure of a body plume uses, so the drawing matches the figures
 * further down the page, and it is the only view in which "the plume leaves
 * the face up and outward at about 45 degrees" is a visible statement rather
 * than a sentence the reader has to take on trust. Coordinates are canvas
 * layout values in the fixed WIDTH x HEIGHT frame, not physical constants.
 */
/**
 * Head and neck as one continuous outline, from the crown forward over the
 * face, down the throat, and back up the nape and around the skull.
 *
 * One path rather than a head plus a separate neck box: stroking two
 * overlapping subpaths draws the boundary between them, which read as a jar
 * lid across the throat. Landmarks in order: forehead, brow ridge, nasion (the
 * dip above the nose), nose ridge, tip, subnasale, philtrum, upper lip, mouth,
 * lower lip, mentolabial crease, chin, submental line, throat, base of the
 * neck, nape, jaw angle, mastoid, occiput, crown.
 *
 * The base of the neck runs below where the shoulders are drawn, so that edge
 * is covered rather than visible.
 */
function traceHeadAndNeck(ctx) {
  ctx.beginPath();
  ctx.moveTo(193, 262);
  ctx.bezierCurveTo(216, 262, 233, 275, 236, 296);
  ctx.bezierCurveTo(238, 306, 238, 314, 237, 319);
  ctx.bezierCurveTo(233, 324, 229, 327, 230, 332);
  ctx.bezierCurveTo(236, 337, 249, 344, 250, 351);
  ctx.bezierCurveTo(250, 356, 243, 357, 235, 358);
  ctx.bezierCurveTo(234, 362, 234, 364, 233, 366);
  ctx.bezierCurveTo(238, 368, 239, 370, 234, 372);
  ctx.bezierCurveTo(239, 375, 238, 379, 233, 381);
  ctx.bezierCurveTo(230, 384, 231, 388, 233, 392);
  ctx.bezierCurveTo(229, 399, 223, 403, 217, 406);
  ctx.bezierCurveTo(220, 428, 223, 450, 224, 472);
  ctx.lineTo(168, 472);
  ctx.bezierCurveTo(170, 448, 173, 422, 175, 398);
  ctx.bezierCurveTo(167, 387, 160, 372, 155, 356);
  ctx.bezierCurveTo(148, 336, 148, 306, 162, 288);
  ctx.bezierCurveTo(171, 272, 181, 262, 193, 262);
  ctx.closePath();
}

/** Shoulders and upper chest, drawn over the base of the neck. */
function traceShoulders(ctx) {
  ctx.beginPath();
  ctx.moveTo(112, HEIGHT + 4);
  ctx.bezierCurveTo(118, 480, 138, 462, 172, 456);
  ctx.bezierCurveTo(208, 450, 246, 456, 268, 469);
  ctx.bezierCurveTo(284, 479, 290, 490, 296, HEIGHT + 4);
  ctx.closePath();
}

/**
 * The static backdrop — panel, instrument grid, silhouette — rendered once
 * into an offscreen canvas and blitted per frame. Nothing here changes with
 * gravity, so redrawing it 60 times a second is pure waste.
 */
function buildBackdrop() {
  const off = document.createElement('canvas');
  off.width = WIDTH;
  off.height = HEIGHT;
  const ctx = off.getContext('2d');

  ctx.fillStyle = BG_FILL;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.strokeStyle = GRID_LINE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 50; x < WIDTH; x += 50) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, HEIGHT);
  }
  for (let y = 50; y < HEIGHT; y += 50) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(WIDTH, y + 0.5);
  }
  ctx.stroke();

  ctx.fillStyle = SILHOUETTE_FILL;
  ctx.strokeStyle = SILHOUETTE_STROKE;
  ctx.lineWidth = 1.5;
  // Head first, shoulders over it — see traceHeadAndNeck.
  traceHeadAndNeck(ctx);
  ctx.fill();
  ctx.stroke();
  traceShoulders(ctx);
  ctx.fill();
  ctx.stroke();

  // Ear and brow, so the profile reads as a head rather than a shape.
  ctx.beginPath();
  ctx.ellipse(184, 349, 7, 10, -0.2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(213, 322);
  ctx.quadraticCurveTo(224, 318, 232, 322);
  ctx.stroke();

  return off;
}

/**
 * Paint one frame: backdrop, then every parcel as a soft tinted blob, then a
 * single batched stroke for the motion streaks. Module-level and pure; called
 * once for the reduced-motion still frame and once per animation tick, and it
 * never touches React state.
 */
function drawFrame(ctx, particles, backdrop, sprites) {
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.drawImage(backdrop, 0, 0);

  ctx.globalCompositeOperation = 'multiply';
  for (let i = 0; i < particles.length; i += 1) {
    const p = particles[i];
    const heat = p.heat > 1 ? 1 : p.heat < 0 ? 0 : p.heat;
    const co2 = p.co2 > 1 ? 1 : p.co2 < 0 ? 0 : p.co2;
    const h = Math.round(heat * (HEAT_STEPS - 1));
    const c = Math.round(co2 * (CO2_STEPS - 1));
    ctx.globalAlpha = alphaFor(heat, co2);
    ctx.drawImage(sprites[h * CO2_STEPS + c], p.x - SPRITE_R, p.y - SPRITE_R);
  }

  // Motion streaks. One path for the whole field: this is what makes a still
  // screenshot of the canvas still say "this air is moving", and what makes
  // the difference between 1 g and 0 g legible at a glance rather than only
  // to someone who watches for a few seconds.
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.strokeStyle = STREAK_STROKE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  let any = false;
  for (let i = 0; i < particles.length; i += 1) {
    const p = particles[i];
    const speed = Math.hypot(p.vx, p.vy);
    if (speed < STREAK_MIN_SPEED) continue;
    any = true;
    ctx.moveTo(p.x - p.vx * STREAK_LENGTH, p.y - p.vy * STREAK_LENGTH);
    ctx.lineTo(p.x, p.y);
  }
  if (any) ctx.stroke();
}

// Aliased: this component only needs the preference's value at the moment
// each effect runs, not a re-render when it changes mid-session — see
// usePrefersReducedMotion.js's doc comment on why that's a separate export.
const reduceMotion = prefersReducedMotion;

// Simulated steps to run, unrendered, before drawing the reduced-motion still
// frame. Every particle starts at co2: 0 and heat: 0 (createParticles), so a
// single drawn frame is a uniform faint speckle with no structure at all — a
// silhouette in noise, not a meaningful static rendering. 240 steps at the
// model's dt = 1/60 is 4 simulated seconds, long enough for the column to form
// (or, at low gravity, visibly fail to) before the frame is ever painted.
const SETTLE_STEPS = 240;

function stepArgs(g) {
  return {
    g,
    dt: 1 / 60,
    width: WIDTH,
    height: HEIGHT,
    sourceX: SOURCE.x,
    sourceY: SOURCE.y,
    axisX: BODY_AXIS_X,
  };
}

function settledParticles(g) {
  let particles = createParticles(COUNT);
  for (let i = 0; i < SETTLE_STEPS; i += 1) {
    particles = stepParticles(particles, stepArgs(g));
  }
  return particles;
}

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
  const settledOnceRef = useRef(false);
  const gravityInputId = useId();
  const gravityReadoutId = useId();

  const regime = regimeFor({ g });

  // Canvas setup + the animated path. Deps intentionally [] — this effect,
  // including the rAF loop and its IntersectionObserver gating, is the
  // reviewed animated path and is not restructured here. Under reduced
  // motion it only performs the one-time DPR setup and leaves drawing to the
  // settle effect below, which re-runs on every gravity change.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    // DPR handling: back the canvas at device-pixel resolution so the blobs
    // and silhouette stay crisp, then draw entirely in the fixed logical
    // WIDTH x HEIGHT frame that stepParticles also uses. Set once, outside
    // the loop — calling ctx.scale per frame would compound.
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    canvas.width = WIDTH * dpr;
    canvas.height = HEIGHT * dpr;
    ctx.scale(dpr, dpr);

    const backdrop = buildBackdrop();
    const sprites = buildSprites();

    if (reduceMotion()) {
      // No loop at all; the settle effect below owns drawing so it can also
      // redraw when the gravity slider changes. It reads these two off the
      // refs rather than rebuilding them.
      canvas.__aresBackdrop = backdrop;
      canvas.__aresSprites = sprites;
      return undefined;
    }

    let raf = null;
    let running = false;

    const loop = () => {
      // No rng passed — the live component wants real randomness. Only the
      // tests seed it.
      particlesRef.current = stepParticles(particlesRef.current, stepArgs(gRef.current));
      drawFrame(ctx, particlesRef.current, backdrop, sprites);
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

  // Reduced-motion still frame. No-ops (and does no work) when motion is
  // allowed — the animated effect above owns drawing in that case. Depends
  // on `g` so dragging the gravity slider still teaches something: each
  // change re-settles a fresh particle field at the new gravity and redraws.
  //
  // settledParticles is SETTLE_STEPS (240) * COUNT (340) particle updates,
  // run synchronously, and the range input fires an onChange per pixel of
  // drag or per auto-repeated arrow keypress — so this is guarded two ways:
  //   1. Below 480px, public/ares-theme.css swaps this canvas out entirely
  //      for .ares-plume-fallback (aria-hidden anyway; see below). Settling
  //      a field nobody can see is pure waste, so skip the work whenever the
  //      canvas is actually display:none.
  //   2. Beyond the very first paint, the recompute is debounced rather than
  //      run once per input event — a held arrow key or a fast drag settles
  //      once after the user pauses, not dozens of times mid-gesture. The
  //      first paint (mount, or motion preference flipping on mid-session)
  //      still happens immediately so there is no blank delay before the
  //      first reduced-motion frame.
  useEffect(() => {
    if (!reduceMotion()) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const paint = () => {
      const canvasEl = canvasRef.current;
      if (!canvasEl) return;
      if (getComputedStyle(canvasEl).display === 'none') return;
      const ctx = canvasEl.getContext('2d');
      if (!ctx) return;
      const backdrop = canvasEl.__aresBackdrop || buildBackdrop();
      const sprites = canvasEl.__aresSprites || buildSprites();
      const settled = settledParticles(g);
      particlesRef.current = settled;
      drawFrame(ctx, settled, backdrop, sprites);
    };

    if (!settledOnceRef.current) {
      settledOnceRef.current = true;
      paint();
      return undefined;
    }

    const timer = setTimeout(paint, 120);
    return () => clearTimeout(timer);
  }, [g]);

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

        {/* Reading key for the canvas. Two channels are encoded in the
            drawing — warmth and rebreathed load — and neither is guessable
            from the picture alone. */}
        <ul className="ares-plume-key" aria-hidden="true">
          <li className="ares-plume-key-item ares-plume-key-item--warm">
            <span className="ares-plume-key-swatch" />
            Air the body has warmed
          </li>
          <li className="ares-plume-key-item ares-plume-key-item--co2">
            <span className="ares-plume-key-swatch" />
            Air that has been breathed
          </li>
        </ul>

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

      <label className="ares-slider-label" htmlFor={gravityInputId}>
        Gravity
      </label>
      <input
        id={gravityInputId}
        type="range"
        min={GRAVITY.orbit}
        max={GRAVITY.earth}
        step="0.01"
        value={g}
        onChange={(e) => setG(Number(e.target.value))}
        aria-describedby={gravityReadoutId}
      />
      <div className="ares-slider-ticks" aria-hidden="true">
        <span>Orbit</span>
        <span>Mars</span>
        <span>Earth</span>
      </div>

      <div id={gravityReadoutId} className="ares-readout" aria-live="polite">
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
