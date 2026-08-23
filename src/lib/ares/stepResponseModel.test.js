import { transportDelay, stepResponse } from './stepResponseModel';

const generic = { tubeLengthM: 1.0, tubeIdMm: 4, flowLpm: 1.0 };

describe('transportDelay', () => {
  test('is tube volume over volumetric flow rate', () => {
    // V = pi * r^2 * L; r = 2 mm = 0.002 m, L = 1 m -> 1.2566e-5 m^3 = 12.566 mL
    // Q = 1 L/min = 16.667 mL/s -> t_d = 0.754 s
    expect(transportDelay(generic)).toBeCloseTo(0.754, 2);
  });

  test('doubling the tube length doubles the delay', () => {
    expect(transportDelay({ ...generic, tubeLengthM: 2 }))
      .toBeCloseTo(transportDelay(generic) * 2, 4);
  });

  test('doubling the flow rate halves the delay', () => {
    expect(transportDelay({ ...generic, flowLpm: 2 }))
      .toBeCloseTo(transportDelay(generic) / 2, 4);
  });

  test('bore enters as the square of the radius', () => {
    expect(transportDelay({ ...generic, tubeIdMm: 8 }))
      .toBeCloseTo(transportDelay(generic) * 4, 4);
  });

  test('zero flow is guarded rather than returning Infinity', () => {
    expect(transportDelay({ ...generic, flowLpm: 0 })).toBeNull();
  });
});

describe('stepResponse', () => {
  const opts = { ...generic, t90Seconds: 2, duration: 10, samples: 500 };

  test('the sensor sees nothing before the gas arrives', () => {
    const { t, value, tDelay } = stepResponse(opts);
    for (let i = 0; i < t.length; i += 1) {
      if (t[i] < tDelay * 0.9) expect(value[i]).toBeCloseTo(0, 6);
    }
  });

  test('reaches 90 % exactly T90 after the gas arrives, not after t = 0', () => {
    // The distinction the whole component exists to teach. Assert against the
    // SAMPLED CURVE, not against `tNinety - tDelay === t90Seconds`: that
    // algebraic form is true by construction (tNinety is literally
    // `tDelay + t90Seconds`) regardless of what tau the curve actually uses,
    // so it would still pass a model whose reading never really hits 90 % at
    // that time — e.g. a wrong tau of `t90Seconds` instead of
    // `t90Seconds / Math.log(10)`, which hits 90 % at about 2.3x T90 instead.
    const r = stepResponse(opts);
    let nearestIndex = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < r.t.length; i += 1) {
      const dist = Math.abs(r.t[i] - r.tNinety);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIndex = i;
      }
    }
    expect(r.value[nearestIndex]).toBeCloseTo(0.9, 2);
  });

  test('approaches but does not exceed the final value', () => {
    const { value } = stepResponse(opts);
    expect(Math.max(...value)).toBeLessThanOrEqual(1.0001);
    expect(value[value.length - 1]).toBeGreaterThan(0.98);
  });

  test('the 50 % crossing lies after the delay and before T90', () => {
    // GLOSSARY §2: measure t_d at the 50 % crossing, because dispersion
    // smears the step and "first movement" is not a repeatable landmark.
    const r = stepResponse(opts);
    expect(r.tFiftyCrossing).toBeGreaterThan(r.tDelay);
    expect(r.tFiftyCrossing).toBeLessThan(r.tNinety);
  });

  test('transport delay and T90 move independently', () => {
    const baseline = stepResponse(opts);
    const slowTube = stepResponse({ ...opts, tubeLengthM: 4 });
    const slowSensor = stepResponse({ ...opts, t90Seconds: 6 });

    // A longer tube moves the delay and leaves the sensor alone.
    expect(slowTube.tDelay).toBeGreaterThan(baseline.tDelay);
    // A slower sensor moves T90 and leaves the delay alone.
    expect(slowSensor.tDelay).toBeCloseTo(baseline.tDelay, 4);
    expect(slowSensor.tNinety).toBeGreaterThan(baseline.tNinety);
  });
});
