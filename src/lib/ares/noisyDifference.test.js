import { propagateDifference, differenceBudget } from './noisyDifference';

describe('propagateDifference', () => {
  test('adds independent errors in quadrature', () => {
    expect(propagateDifference({ sigmaA: 3, sigmaB: 4 })).toBeCloseTo(5, 6);
  });

  test('the difference is noisier than EITHER input', () => {
    // C13 and M10: this is why per-pod calibration is not optional.
    const sigma = propagateDifference({ sigmaA: 30, sigmaB: 30 });
    expect(sigma).toBeGreaterThan(30);
  });

  test('equal inputs give a factor of root two', () => {
    expect(propagateDifference({ sigmaA: 30, sigmaB: 30 })).toBeCloseTo(30 * Math.SQRT2, 6);
  });
});

describe('differenceBudget', () => {
  test('reports the difference and its propagated error', () => {
    const b = differenceBudget({ chin: 1850, top: 420, sigmaChin: 30, sigmaTop: 30 });
    expect(b.difference).toBe(1430);
    expect(b.sigmaDifference).toBeCloseTo(30 * Math.SQRT2, 4);
  });

  test('relative error explodes as the two readings converge', () => {
    const wide = differenceBudget({ chin: 1850, top: 420, sigmaChin: 30, sigmaTop: 30 });
    const narrow = differenceBudget({ chin: 480, top: 420, sigmaChin: 30, sigmaTop: 30 });
    expect(narrow.relativeError).toBeGreaterThan(wide.relativeError);
  });

  test('a vanishing difference does not produce Infinity', () => {
    const b = differenceBudget({ chin: 420, top: 420, sigmaChin: 30, sigmaTop: 30 });
    expect(Number.isFinite(b.relativeError) || b.relativeError === null).toBe(true);
  });
});
