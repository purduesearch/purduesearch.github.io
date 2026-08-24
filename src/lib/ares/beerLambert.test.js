import { absorbedFraction, detectorSignal } from './beerLambert';

const path = { pathLengthM: 0.05, absorptivity: 1.2e-4 };

describe('absorbedFraction', () => {
  test('nothing is absorbed at zero concentration', () => {
    expect(absorbedFraction({ ppm: 0, ...path })).toBeCloseTo(0, 9);
  });

  test('absorption rises with concentration', () => {
    const low = absorbedFraction({ ppm: 400, ...path });
    const high = absorbedFraction({ ppm: 5000, ...path });
    expect(high).toBeGreaterThan(low);
  });

  test('absorption rises with path length', () => {
    const short = absorbedFraction({ ppm: 5000, ...path });
    const long = absorbedFraction({ ppm: 5000, ...path, pathLengthM: 0.2 });
    expect(long).toBeGreaterThan(short);
  });

  test('is bounded to the unit interval', () => {
    expect(absorbedFraction({ ppm: 1e9, ...path })).toBeLessThanOrEqual(1);
    expect(absorbedFraction({ ppm: 0, ...path })).toBeGreaterThanOrEqual(0);
  });

  test('is exponential, not linear — doubling the path is not double the absorption', () => {
    // 2,000 ppm deliberately: at 20,000 both values saturate near 1 and the
    // assertion passes without demonstrating anything.
    const single = absorbedFraction({ ppm: 2000, ...path });
    const doubled = absorbedFraction({ ppm: 2000, ...path, pathLengthM: 0.1 });
    expect(single).toBeGreaterThan(0.1);
    expect(single).toBeLessThan(0.9);
    expect(doubled).toBeLessThan(single * 2);
  });
});

describe('detectorSignal', () => {
  test('is the complement of the absorbed fraction', () => {
    const args = { ppm: 5000, ...path };
    expect(detectorSignal(args)).toBeCloseTo(1 - absorbedFraction(args), 9);
  });

  test('a full detector signal means no gas in the path', () => {
    expect(detectorSignal({ ppm: 0, ...path })).toBeCloseTo(1, 9);
  });
});
