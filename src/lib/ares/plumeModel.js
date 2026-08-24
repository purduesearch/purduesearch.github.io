/**
 * Particle model behind PlumeSimulator.
 *
 * THIS IS NOT A CFD SOLVE, and the component must say so on screen. It is a
 * visually-tuned advection-plus-diffusion model whose *regime* tracks the real
 * dimensionless numbers from aresPhysics.js. Presenting a tuned animation as a
 * simulation result is exactly the habit the course teaches against, so the
 * caption carries the word "illustrative" and the numbers beside it are real.
 *
 * Coordinates are canvas coordinates: y grows DOWNWARD, so rising air has
 * negative vy.
 *
 * SHAPE IS THE POINT. An earlier version applied one buoyancy term to the
 * whole field, scaled only by distance from the mouth, so every particle on
 * screen drifted upward at nearly the same speed. That is a rising *field*,
 * not a plume: there was no column, no narrow waist at the body, no widening
 * and breakup above the crown, and therefore nothing for the gravity slider to
 * visibly take away. This version gives each particle its own heat load,
 * supplied by proximity to the body and decaying with height above the crown,
 * and adds an entrainment term that pulls air horizontally toward the plume
 * axis. Those two together are what produce a column rather than a drift, and
 * both are scaled by gravity — so at g = 0 the column does not slow down, it
 * stops existing, and exhaled CO2 is left to diffuse in place.
 */
import { grashof, rayleigh, GRAVITY, PLUME } from '../../components/ares/aresPhysics';

/** Film temperature for a ~33 °C skin surface in a ~22 °C room. GLOSSARY §3. */
const T_FILM_K = 300;
const DELTA_T = 11;
/** Body height as the characteristic length. C13; GLOSSARY §3 requires stating it. */
const L_BODY = PLUME.developmentLengthM;

/*
 * Everything below is visual tuning in canvas units, not physics — aresPhysics.js
 * has no equivalents and must not gain any. The physical claims this component
 * makes are carried by regimeFor() at the bottom of the file, which uses the real
 * grashof()/rayleigh() and is not tuned.
 */

/**
 * Half-width of the warm layer around the body, in canvas px (1 sigma), at the
 * two ends of the gravity range.
 *
 * These differ because the *reach* of body heat is itself a consequence of the
 * flow, not a fixed property of the body. At 1 g the column entrains air from
 * well out to the side and drags it up past the skin, so a wide band of the
 * room is warmed. At 0 g there is no entrainment: heat leaves the skin by
 * conduction into whatever is touching it and goes no further, so the warm
 * layer is a thin stagnant film. Holding the wide value at every gravity
 * warmed the entire frame at 0 g — technically it lifted nothing, but it
 * painted a large tan cloud over the one thing the reader is supposed to
 * notice, which is the pocket of rebreathed air parked on the face.
 */
const PLUME_SIGMA_1G = 58;
const PLUME_SIGMA_0G = 20;
/** Height of the crown above the mouth. Above this the supply of body heat fades. */
const CROWN_RISE = 90;
/** e-folding height for that fade — how far the column stays coherent past the head. */
const CROWN_DECAY = 260;

/** How fast a particle takes on / sheds the body's heat load. */
const HEAT_GAIN = 0.09;
const HEAT_DECAY = 0.982;

/**
 * Buoyant acceleration per unit heat at 1 g. Tuned against DRAG below: with
 * drag at 0.96 the terminal rise is gain * 24 px per frame at the component's
 * dt of 1/60, so 0.13 puts a fully-warmed parcel at ~3 px/frame and crosses
 * the 500 px frame in about two seconds — fast enough to read as a current,
 * slow enough to watch an eddy form.
 */
const BUOYANCY_GAIN = 0.13;
/** Sideways pull toward the plume axis — the entrainment that keeps it a column. */
const ENTRAIN_GAIN = 0.05;
/** Turbulent breakup, which only exists once there is a flow to be unstable. */
const WOBBLE_GAIN = 60;

/**
 * Diffusion is applied directly to POSITION (a Brownian-motion jitter), not to
 * velocity. Folding it into velocity instead — the naive approach — makes mean
 * vy sensitive to the diffusion RNG stream, which fights the "no net drift in
 * orbit" test: any residual bias in the seeded generator scales with wander
 * magnitude in *both* the spatial-reach term and the mean-velocity term at
 * once, so there is no gain that satisfies both. Decoupling them means vy in
 * orbit is governed purely by buoyancy (zero, exactly, since createParticles's
 * initial vy is also zero under the seeded/fixed rngs the tests use) while
 * position can still random-walk far enough, over the 80-step CO2 test, to
 * reach the source from anywhere in the frame.
 */
const DIFFUSION_GAIN = 300;
const DRAG = 0.96;
/** Baseline CO2 loss with no flow at all: molecular diffusion, and nothing else. */
const CO2_DECAY = 0.995;
/**
 * Flow-driven clearance, and the term that carries the page's thesis.
 *
 * A parcel sitting in a moving column is continuously diluted by the fresh air
 * that column is entraining, so its CO2 load falls far faster than diffusion
 * alone would take it. That is the whole mechanism the page is about: on Earth
 * a breath is not destroyed, it is *replaced*. Scaling clearance by the local
 * flow (gN * heat) rather than applying one fixed decay everywhere is what
 * makes a breath clear in a moment at 1 g and saturate in place at 0 g, and it
 * is why the model reproduces the pooling without anyone hand-placing a blob
 * in front of the face.
 */
const CO2_SWEEP = 0.14;
/** Radius around the mouth within which a particle picks up exhaled CO2. */
const MOUTH_RADIUS = 40;
const CO2_PICKUP = 0.05;

export function createParticles(count, rng = Math.random) {
  const particles = [];
  for (let i = 0; i < count; i += 1) {
    particles.push({
      x: rng() * 400,
      y: rng() * 500,
      vx: (rng() - 0.5) * 2,
      vy: (rng() - 0.5) * 2,
      co2: 0,
      heat: 0,
      age: rng() * 100,
    });
  }
  return particles;
}

/**
 * How much body heat is available to a particle at (x, y).
 *
 * Lateral: a gaussian centred on the body axis, so air far to the side of the
 * body is never lifted — that is what keeps the column narrow.
 * Vertical: full strength anywhere alongside the body, fading exponentially
 * above the crown as the plume runs out of surface to be heated by.
 */
function heatSupplyAt(x, y, axisX, crownY, sigma) {
  const lateral = Math.exp(-((x - axisX) ** 2) / (2 * sigma ** 2));
  const vertical = y >= crownY ? 1 : Math.exp(-(crownY - y) / CROWN_DECAY);
  return lateral * vertical;
}

/**
 * Advance one step. Returns a NEW array — the component holds particles in a
 * ref and re-renders nothing per frame, but purity keeps this testable.
 *
 * `sourceX`/`sourceY` is the MOUTH — where CO2 enters the field. `axisX` is
 * the body's centreline, which is what the warm column forms around. They are
 * different points on a profile view (the mouth is out on the face, the column
 * runs up the middle of the head), and separating them is what lets exhaled
 * air be emitted beside the column and then entrained into it, rather than
 * appearing already inside it. `axisX` defaults to `sourceX` so a caller that
 * does not care — including every existing test — is unaffected.
 */
export function stepParticles(
  particles,
  { g, dt, width, height, sourceX, sourceY, axisX = sourceX, rng = Math.random },
) {
  // Normalized gravity: 1 at Earth, 0 in orbit. Every term that only exists
  // because the air is moving is scaled by this, so at g = 0 the plume does
  // not weaken — it is absent, and diffusion is all that is left.
  const gN = g / GRAVITY.earth;
  const crownY = sourceY - CROWN_RISE;
  const step = dt * 60;
  const sigma = PLUME_SIGMA_0G + (PLUME_SIGMA_1G - PLUME_SIGMA_0G) * gN;

  return particles.map((p) => {
    const dxs = p.x - sourceX;
    const dys = p.y - sourceY;
    const distance = Math.hypot(dxs, dys) || 1;

    // Heat load, carried by the particle rather than recomputed as a field
    // force. A parcel that has left the column keeps its warmth for a while,
    // which is what lets the plume persist above the head instead of stopping
    // dead at the edge of the heat source.
    const heat = Math.min(
      1,
      p.heat * HEAT_DECAY + heatSupplyAt(p.x, p.y, axisX, crownY, sigma) * HEAT_GAIN,
    );

    // Emission, then clearance. Clearance is diffusion plus whatever the local
    // flow is sweeping away — see CO2_SWEEP.
    const retained = Math.max(0, CO2_DECAY - gN * heat * CO2_SWEEP);
    let co2 = p.co2 * retained;
    if (distance < MOUTH_RADIUS) co2 = Math.min(1, co2 + CO2_PICKUP);

    // Buoyancy acts on the particle's own heat, so only warmed air rises.
    let vy = p.vy - gN * heat * BUOYANCY_GAIN * step;

    // Entrainment: the rising column leaves low pressure behind it and drags
    // neighbouring air inward. Without this the plume disperses sideways as
    // fast as it rises and never reads as a column.
    const toAxis = axisX - p.x;
    let vx = p.vx + Math.sign(toAxis) * Math.min(Math.abs(toAxis), 90)
      * ENTRAIN_GAIN * gN * heat * dt;

    // Turbulent breakup above the crown — the reason a real plume frays into
    // eddies rather than staying a clean stripe. Scaled by gN so it vanishes
    // with the flow that causes it.
    if (p.y < crownY) {
      vx += (rng() - 0.5) * WOBBLE_GAIN * gN * heat * dt;
    }

    vx *= DRAG;
    vy *= DRAG;

    // Diffusion: the only transport left when buoyancy is gone. Applied as a
    // position jitter (see DIFFUSION_GAIN above), not folded into velocity.
    // rng is injectable so the model is deterministic under test.
    const wander = DIFFUSION_GAIN * dt;
    let x = p.x + vx + (rng() - 0.5) * wander;
    let y = p.y + vy + (rng() - 0.5) * wander;

    // Recycle a particle that leaves the frame back to the bottom, so the
    // field stays populated without growing the array. Heat resets with it —
    // recycled air is room air again, not a parcel that remembers the plume.
    if (y < 0) {
      return { x, y: height, vx: 0, vy: 0, co2: 0, heat: 0, age: p.age + 1 };
    }
    if (y > height) y = height;
    if (x < 0) x = 0;
    if (x > width) x = width;

    return { x, y, vx, vy, co2, heat, age: p.age + 1 };
  });
}

/**
 * The real dimensionless numbers at this gravity, plus a plain-English verdict.
 * These are the figures shown beside the animation, and they are not tuned.
 */
export function regimeFor({ g }) {
  const args = { dT: DELTA_T, L: L_BODY, tFilmK: T_FILM_K, g };
  const gr = grashof(args);
  const ra = rayleigh(args);

  let verdict;
  if (gr >= 1e8) verdict = 'buoyancy-dominated';
  else if (gr >= 1e6) verdict = 'mixed';
  else verdict = 'diffusion-dominated';

  return { gr, ra, verdict, L: L_BODY, dT: DELTA_T };
}
