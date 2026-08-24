import {
  AIR_PROPERTIES, DIFFUSIVITY_CO2, GRAVITY, CO2_TIERS, GLOSSARY_TERMS,
  ppmToMmHg, mmHgToPpm, airPropertiesAt, grashof, rayleigh, peclet,
  reynolds, rebreathedFraction, tierFor, dosePpmHours,
} from './aresPhysics';

describe('unit conversions (GLOSSARY §5)', () => {
  test('1 ppm is 7.60e-4 mmHg at one standard atmosphere', () => {
    expect(ppmToMmHg(1)).toBeCloseTo(7.6e-4, 6);
  });

  test('1 mmHg is about 1,316 ppm', () => {
    expect(mmHgToPpm(1)).toBeCloseTo(1315.8, 1);
  });

  test('the glossary conversion table round-trips', () => {
    // GLOSSARY §5 table: ppm -> mmHg at 1 atm
    expect(ppmToMmHg(400)).toBeCloseTo(0.30, 2);
    expect(ppmToMmHg(5000)).toBeCloseTo(3.8, 1);
    expect(ppmToMmHg(5300)).toBeCloseTo(4.0, 1);
    expect(ppmToMmHg(6600)).toBeCloseTo(5.0, 1);
  });

  test('conversion is pressure-dependent — 950 hPa converts against 713 mmHg', () => {
    // GLOSSARY §5: "A reading taken at 950 hPa converts against 713 mmHg, not 760."
    const atAltitude = ppmToMmHg(1_000_000, 950);
    expect(atAltitude).toBeCloseTo(712.6, 0);
  });

  test('non-physical pressure returns null rather than Infinity/NaN', () => {
    expect(ppmToMmHg(400, 0)).toBeNull();
    expect(mmHgToPpm(4, 0)).toBeNull();
    expect(mmHgToPpm(4, -10)).toBeNull();
  });
});

describe('property table (GLOSSARY §4)', () => {
  test('carries the three tabulated temperatures', () => {
    expect(AIR_PROPERTIES.map(r => r.tempK)).toEqual([295, 300, 305]);
  });

  test('295 K row matches the glossary exactly', () => {
    const row = AIR_PROPERTIES.find(r => r.tempK === 295);
    expect(row.nu).toBeCloseTo(1.53e-5, 9);
    expect(row.alpha).toBeCloseTo(2.15e-5, 9);
    expect(row.Pr).toBeCloseTo(0.712, 4);
    expect(row.beta).toBeCloseTo(3.39e-3, 6);
  });

  test('300 K row matches the glossary exactly', () => {
    // GLOSSARY §4: 300 K | 1.59e-5 | 2.25e-5 | 0.707 | 3.33e-3
    const row = AIR_PROPERTIES.find(r => r.tempK === 300);
    expect(row.nu).toBeCloseTo(1.59e-5, 9);
    expect(row.alpha).toBeCloseTo(2.25e-5, 9);
    expect(row.Pr).toBeCloseTo(0.707, 4);
    expect(row.beta).toBeCloseTo(3.33e-3, 6);
  });

  test('305 K row matches the glossary exactly', () => {
    // GLOSSARY §4: 305 K | 1.64e-5 | 2.32e-5 | 0.707 | 3.28e-3
    const row = AIR_PROPERTIES.find(r => r.tempK === 305);
    expect(row.nu).toBeCloseTo(1.64e-5, 9);
    expect(row.alpha).toBeCloseTo(2.32e-5, 9);
    expect(row.Pr).toBeCloseTo(0.707, 4);
    expect(row.beta).toBeCloseTo(3.28e-3, 6);
  });

  test('binary diffusivity of CO2 in air', () => {
    expect(DIFFUSIVITY_CO2).toBeCloseTo(1.6e-5, 9);
  });

  test('airPropertiesAt interpolates between tabulated rows', () => {
    const mid = airPropertiesAt(297.5);
    expect(mid.nu).toBeGreaterThan(1.53e-5);
    expect(mid.nu).toBeLessThan(1.59e-5);
  });

  test('airPropertiesAt clamps outside the tabulated range', () => {
    // The course only covers 295-305 K; do not extrapolate silently.
    expect(airPropertiesAt(250).nu).toBeCloseTo(1.53e-5, 9);
    expect(airPropertiesAt(400).nu).toBeCloseTo(1.64e-5, 9);
  });

  test('airPropertiesAt returns null for a non-finite temperature', () => {
    expect(airPropertiesAt(NaN)).toBeNull();
  });

  test('Mars gravity is 3.71 and orbit is 0', () => {
    expect(GRAVITY.earth).toBeCloseTo(9.81, 2);
    expect(GRAVITY.mars).toBeCloseTo(3.71, 2);
    expect(GRAVITY.orbit).toBe(0);
  });
});

describe('dimensionless numbers (GLOSSARY §3)', () => {
  const base = { dT: 10, L: 1.7, tFilmK: 300, g: GRAVITY.earth };

  test('Grashof uses beta = 1/T_film', () => {
    // Gr = g*beta*dT*L^3 / nu^2
    const { nu } = airPropertiesAt(300);
    const expected = (9.81 * (1 / 300) * 10 * Math.pow(1.7, 3)) / (nu * nu);
    expect(grashof(base)).toBeCloseTo(expected, -6);
  });

  test('Grashof scales as L cubed — the reason L must be stated', () => {
    const big = grashof({ ...base, L: 1.7 });
    const small = grashof({ ...base, L: 1 / 6 });
    expect(big / small).toBeCloseTo(Math.pow(1.7 / (1 / 6), 3), 0);
  });

  test('Grashof is zero in orbit', () => {
    expect(grashof({ ...base, g: GRAVITY.orbit })).toBe(0);
  });

  test('Rayleigh is Grashof times Prandtl', () => {
    const { Pr } = airPropertiesAt(300);
    expect(rayleigh(base)).toBeCloseTo(grashof(base) * Pr, -6);
  });

  test('Peclet is the mass-transport form, using D not alpha', () => {
    expect(peclet({ V: 0.3, L: 1.7 })).toBeCloseTo((0.3 * 1.7) / DIFFUSIVITY_CO2, 0);
  });

  test('Reynolds reproduces the CFD paper with Lc = 1/6 m', () => {
    // GLOSSARY §6: Vc = 0.2816 m/s, Lc = 1/6 m, nu = 1.52e-5 -> Re = 3087.71
    const re = reynolds({ V: 0.2816, L: 1 / 6, nu: 1.52e-5 });
    expect(re).toBeCloseTo(3087.7, 0);
  });

  test('Grashof, Rayleigh and Reynolds return null rather than throw on a non-finite tFilmK', () => {
    expect(grashof({ dT: 10, L: 1.7, tFilmK: NaN })).toBeNull();
    expect(rayleigh({ dT: 10, L: 1.7, tFilmK: NaN })).toBeNull();
    expect(reynolds({ V: 0.3, L: 1.7, tFilmK: NaN })).toBeNull();
  });

  test('an explicit nu override keeps Reynolds working even with a garbage tFilmK', () => {
    // Proves the override path never consults airPropertiesAt.
    const re = reynolds({ V: 0.2816, L: 1 / 6, nu: 1.52e-5, tFilmK: NaN });
    expect(re).toBeCloseTo(3087.7, 0);
  });
});

describe('rebreathed fraction (GLOSSARY §2)', () => {
  test('computes the two-compartment mixing fraction', () => {
    expect(rebreathedFraction({ chin: 1850, top: 400, exhaled: 40000 }))
      .toBeCloseTo((1850 - 400) / (40000 - 400), 6);
  });

  test('a contaminated top reference biases the result low', () => {
    // C13: a top pod standing in the plume shrinks the numerator.
    const honest = rebreathedFraction({ chin: 1850, top: 400, exhaled: 40000 });
    const contaminated = rebreathedFraction({ chin: 1850, top: 900, exhaled: 40000 });
    expect(contaminated).toBeLessThan(honest);
  });

  test('returns null rather than Infinity when the denominator vanishes', () => {
    expect(rebreathedFraction({ chin: 1850, top: 400, exhaled: 400 })).toBeNull();
  });
});

describe('tiers and dose (GLOSSARY §5, §2)', () => {
  test('tier boundaries match the glossary', () => {
    expect(CO2_TIERS.map(t => t.ppm)).toEqual([400, 1000, 2500, 5000, 5300, 6600]);
  });

  test('the NASA 2010 operational limit is labelled and is 5,300 ppm', () => {
    const nasa = CO2_TIERS.find(t => t.ppm === 5300);
    expect(nasa.label).toMatch(/NASA/);
    expect(nasa.label).toMatch(/2010/);
  });

  test('tierFor picks the band a reading falls in', () => {
    expect(tierFor(450).ppm).toBe(400);
    expect(tierFor(3000).ppm).toBe(2500);
    expect(tierFor(5400).ppm).toBe(5300);
  });

  test('dose is concentration times hours', () => {
    // GLOSSARY §2: 5,000 ppm for 1 h and 1,000 ppm for 5 h are the same dose.
    expect(dosePpmHours(5000, 1)).toBe(5000);
    expect(dosePpmHours(1000, 5)).toBe(5000);
  });
});

describe('glossary map', () => {
  test('defines the terms the pages mark up', () => {
    for (const term of ['HTBP', 'BTC', 'IBD', 'NDIR', 'CTA', 'T90', 'PaCO₂']) {
      expect(typeof GLOSSARY_TERMS[term]).toBe('string');
      expect(GLOSSARY_TERMS[term].length).toBeGreaterThan(20);
    }
  });

  test('carries no excluded part designations', () => {
    const all = Object.values(GLOSSARY_TERMS).join(' ');
    expect(all).not.toMatch(/SprintIR/i);
  });
});
