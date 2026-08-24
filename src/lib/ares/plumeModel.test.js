import { createParticles, stepParticles, regimeFor } from './plumeModel';
import { GRAVITY } from '../../components/ares/aresPhysics';

/**
 * A seeded rng, so the diffusion term is deterministic under test. Without
 * this the "no net drift in orbit" assertion is a coin flip at about three
 * sigma — it passes most runs and fails occasionally in CI, which is worse
 * than failing outright.
 */
function seededRng(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const bounds = {
  dt: 0.05, width: 400, height: 500, sourceX: 200, sourceY: 380,
  rng: seededRng(),
};

describe('createParticles', () => {
  test('creates the requested count with the expected shape', () => {
    const ps = createParticles(50);
    expect(ps).toHaveLength(50);
    for (const p of ps) {
      expect(typeof p.x).toBe('number');
      expect(typeof p.y).toBe('number');
      expect(typeof p.co2).toBe('number');
    }
  });

  test('is deterministic when given a seeded rng', () => {
    const seeded = () => 0.5;
    expect(createParticles(5, seeded)).toEqual(createParticles(5, seeded));
  });
});

describe('stepParticles', () => {
  test('at 1 g the field acquires net upward motion', () => {
    let ps = createParticles(200, () => 0.5);
    for (let i = 0; i < 40; i += 1) ps = stepParticles(ps, { ...bounds, g: GRAVITY.earth });
    const meanVy = ps.reduce((s, p) => s + p.vy, 0) / ps.length;
    // Canvas y grows downward, so rising is negative vy.
    expect(meanVy).toBeLessThan(0);
  });

  test('in orbit there is no net vertical drift', () => {
    let ps = createParticles(200, () => 0.5);
    for (let i = 0; i < 40; i += 1) ps = stepParticles(ps, { ...bounds, g: GRAVITY.orbit });
    const meanVy = ps.reduce((s, p) => s + p.vy, 0) / ps.length;
    expect(Math.abs(meanVy)).toBeLessThan(0.05);
  });

  test('Mars sits between Earth and orbit', () => {
    const drift = (g) => {
      let ps = createParticles(200, () => 0.5);
      for (let i = 0; i < 40; i += 1) ps = stepParticles(ps, { ...bounds, g });
      return Math.abs(ps.reduce((s, p) => s + p.vy, 0) / ps.length);
    };
    const earth = drift(GRAVITY.earth);
    const mars = drift(GRAVITY.mars);
    const orbit = drift(GRAVITY.orbit);
    expect(mars).toBeLessThan(earth);
    expect(mars).toBeGreaterThan(orbit);
  });

  /**
   * CONCENTRATION, NOT TOTAL MASS.
   *
   * This assertion used to sum p.co2 over the particles inside the disc. That
   * proxy only worked while buoyancy was a uniform field force that left the
   * particle *distribution* roughly alone. Now that the model produces a real
   * column with entrainment, 1 g actively concentrates particles onto the
   * plume axis — the source sits on that axis, so the 1 g disc holds ~99
   * particles against orbit's ~7, and a sum over them inverts even though each
   * individual parcel is six times cleaner. A summed count is a measure of how
   * many particles are in the disc as much as of how loaded they are, which is
   * not what "CO2 accumulates" means for a gas.
   *
   * Mean load per parcel is the concentration, and that is the quantity the
   * page's whole argument is about: at 1 g a breath is swept out and diluted
   * before the next one arrives; at 0 g the same parcels sit in front of the
   * face and saturate.
   */
  test('CO2 reaches a far higher concentration near the source in orbit than at 1 g', () => {
    const nearSource = (g) => {
      let ps = createParticles(300, () => 0.5);
      for (let i = 0; i < 80; i += 1) ps = stepParticles(ps, { ...bounds, g });
      const near = ps.filter(
        p => Math.hypot(p.x - bounds.sourceX, p.y - bounds.sourceY) < 60,
      );
      return {
        count: near.length,
        mean: near.length ? near.reduce((s, p) => s + p.co2, 0) / near.length : 0,
        peak: ps.reduce((m, p) => Math.max(m, p.co2), 0),
      };
    };
    const orbit = nearSource(GRAVITY.orbit);
    const earth = nearSource(GRAVITY.earth);

    // Guard the mean against being read off an empty or near-empty disc.
    expect(orbit.count).toBeGreaterThan(3);
    expect(earth.count).toBeGreaterThan(3);

    // Measured ~0.28 vs ~0.044; assert a 2x margin so the test fails on a real
    // regression rather than on tuning noise.
    expect(orbit.mean).toBeGreaterThan(earth.mean * 2);
    // And the worst pocket anywhere in the frame is far worse in orbit.
    expect(orbit.peak).toBeGreaterThan(earth.peak);
  });

  test('particles stay inside the bounds', () => {
    let ps = createParticles(100, () => 0.5);
    for (let i = 0; i < 100; i += 1) ps = stepParticles(ps, { ...bounds, g: GRAVITY.earth });
    for (const p of ps) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(bounds.width);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(bounds.height);
    }
  });

  test('does not mutate its input', () => {
    const ps = createParticles(10, () => 0.5);
    const snapshot = JSON.parse(JSON.stringify(ps));
    stepParticles(ps, { ...bounds, g: GRAVITY.earth });
    expect(ps).toEqual(snapshot);
  });
});

describe('regimeFor', () => {
  test('1 g is buoyancy-dominated', () => {
    expect(regimeFor({ g: GRAVITY.earth }).verdict).toBe('buoyancy-dominated');
  });

  test('orbit is diffusion-dominated with Gr of zero', () => {
    const r = regimeFor({ g: GRAVITY.orbit });
    expect(r.gr).toBe(0);
    expect(r.verdict).toBe('diffusion-dominated');
  });

  test('Grashof falls monotonically as gravity falls', () => {
    expect(regimeFor({ g: GRAVITY.earth }).gr)
      .toBeGreaterThan(regimeFor({ g: GRAVITY.mars }).gr);
  });
});
