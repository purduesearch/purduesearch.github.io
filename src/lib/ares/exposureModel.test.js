import { describeExposure } from './exposureModel';

describe('describeExposure', () => {
  test('reports the same reading in all three units', () => {
    const r = describeExposure({ ppm: 5000, hours: 1 });
    expect(r.ppm).toBe(5000);
    expect(r.mmHg).toBeCloseTo(3.8, 1);
    expect(r.percent).toBeCloseTo(0.5, 3);
  });

  test('identifies the NASA 2010 operational limit band', () => {
    expect(describeExposure({ ppm: 5350, hours: 1 }).tier.label).toMatch(/NASA/);
  });

  test('outdoor ambient is the bottom band', () => {
    expect(describeExposure({ ppm: 420, hours: 1 }).tier.label).toMatch(/Outdoor ambient/);
  });

  test('equal doses from different exposures are equal', () => {
    // GLOSSARY §2 — the same dose is not the same exposure, which is why the
    // summary must carry the averaging interval.
    expect(describeExposure({ ppm: 5000, hours: 1 }).dose)
      .toBe(describeExposure({ ppm: 1000, hours: 5 }).dose);
  });

  test('the summary states the interval, not just the dose', () => {
    const r = describeExposure({ ppm: 1000, hours: 5 });
    expect(r.summary).toMatch(/5,000 ppm·hours/);
    expect(r.summary).toMatch(/5 hours/);
  });

  test('the summary uses thousands commas', () => {
    expect(describeExposure({ ppm: 1850, hours: 1 }).summary).toMatch(/1,850 ppm/);
  });

  test('pressure changes the partial pressure but not the ppm', () => {
    const sea = describeExposure({ ppm: 5000, hours: 1 });
    const altitude = describeExposure({ ppm: 5000, hours: 1, pressureHpa: 950 });
    expect(altitude.ppm).toBe(sea.ppm);
    expect(altitude.mmHg).toBeLessThan(sea.mmHg);
  });
});
