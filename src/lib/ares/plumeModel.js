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
 */
import { grashof, rayleigh, GRAVITY, PLUME } from '../../components/ares/aresPhysics';

/** Film temperature for a ~33 °C skin surface in a ~22 °C room. GLOSSARY §3. */
const T_FILM_K = 300;
const DELTA_T = 11;
/** Body height as the characteristic length. C13; GLOSSARY §3 requires stating it. */
const L_BODY = PLUME.developmentLengthM;

const BUOYANCY_GAIN = 0.9;
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
const CO2_DECAY = 0.995;

export function createParticles(count, rng = Math.random) {
  const particles = [];
  for (let i = 0; i < count; i += 1) {
    particles.push({
      x: rng() * 400,
      y: rng() * 500,
      vx: (rng() - 0.5) * 2,
      vy: (rng() - 0.5) * 2,
      co2: 0,
      age: rng() * 100,
    });
  }
  return particles;
}

/**
 * Advance one step. Returns a NEW array — the component holds particles in a
 * ref and re-renders nothing per frame, but purity keeps this testable.
 */
export function stepParticles(
  particles,
  { g, dt, width, height, sourceX, sourceY, rng = Math.random },
) {
  // Normalized buoyancy: 1 at Earth, 0 in orbit.
  const buoyancy = (g / GRAVITY.earth) * BUOYANCY_GAIN;

  return particles.map((p) => {
    const dxs = p.x - sourceX;
    const dys = p.y - sourceY;
    const distance = Math.hypot(dxs, dys) || 1;

    // Emission: particles close to the mouth pick up CO2.
    let co2 = p.co2 * CO2_DECAY;
    if (distance < 40) co2 = Math.min(1, co2 + 0.05);

    // Buoyant acceleration, strongest where the air is warm (near the body).
    const warmth = Math.exp(-distance / 220);
    let vy = p.vy - buoyancy * warmth * dt * 60;
    let vx = p.vx;

    vx *= DRAG;
    vy *= DRAG;

    // Diffusion: the only transport left when buoyancy is gone. Applied as a
    // position jitter (see DIFFUSION_GAIN above), not folded into velocity.
    // rng is injectable so the model is deterministic under test.
    const wander = DIFFUSION_GAIN * dt;
    let x = p.x + vx + (rng() - 0.5) * wander;
    let y = p.y + vy + (rng() - 0.5) * wander;

    // Recycle a particle that leaves the frame back to the bottom, so the
    // field stays populated without growing the array.
    if (y < 0) { y = height; co2 = 0; }
    if (y > height) y = height;
    if (x < 0) x = 0;
    if (x > width) x = width;

    return { x, y, vx, vy, co2, age: p.age + 1 };
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
