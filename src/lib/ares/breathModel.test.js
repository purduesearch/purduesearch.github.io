import { POD_POSITIONS, breathTrace, sampleAt } from './breathModel';

describe('POD_POSITIONS', () => {
  test('names the three pods by position, never by index', () => {
    expect(POD_POSITIONS.map(p => p.id)).toEqual(['top', 'forehead', 'chin']);
    for (const pod of POD_POSITIONS) {
      expect(pod.label).not.toMatch(/\d/);
      expect(typeof pod.purpose).toBe('string');
    }
  });

  test('the top pod is described as a reference and the chin as the signal', () => {
    expect(POD_POSITIONS.find(p => p.id === 'top').role).toBe('reference');
    expect(POD_POSITIONS.find(p => p.id === 'chin').role).toBe('signal');
  });
});

describe('breathTrace', () => {
  test('returns one value per sample on every channel', () => {
    const trace = breathTrace({ samples: 120, contaminatedTop: false });
    expect(trace.t).toHaveLength(120);
    expect(trace.chin).toHaveLength(120);
    expect(trace.top).toHaveLength(120);
    expect(trace.forehead).toHaveLength(120);
  });

  test('the chin swings far more than the top reference', () => {
    const { chin, top } = breathTrace({ samples: 240, contaminatedTop: false });
    const swing = (a) => Math.max(...a) - Math.min(...a);
    expect(swing(chin)).toBeGreaterThan(swing(top) * 3);
  });

  test('an honest top reference sits near outdoor ambient', () => {
    const { top } = breathTrace({ samples: 240, contaminatedTop: false });
    const mean = top.reduce((s, v) => s + v, 0) / top.length;
    expect(mean).toBeGreaterThan(380);
    expect(mean).toBeLessThan(650);
  });

  test('a top pod standing in the plume reads higher', () => {
    const honest = breathTrace({ samples: 240, contaminatedTop: false });
    const inPlume = breathTrace({ samples: 240, contaminatedTop: true });
    const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
    expect(mean(inPlume.top)).toBeGreaterThan(mean(honest.top));
  });
});

describe('sampleAt', () => {
  test('computes the rebreathed fraction at an index', () => {
    const trace = breathTrace({ samples: 240, contaminatedTop: false });
    const s = sampleAt(trace, 100);
    expect(s.fRb).toBeCloseTo((s.chin - s.top) / (40000 - s.top), 6);
  });

  test('a contaminated reference biases the fraction LOW, not merely noisy', () => {
    // C13: "a clean, stable, confidently wrong number", biased low. This is the
    // single most important assertion in the ARES front end.
    const honest = breathTrace({ samples: 240, contaminatedTop: false });
    const inPlume = breathTrace({ samples: 240, contaminatedTop: true });
    const meanF = (trace) => {
      let total = 0;
      for (let i = 0; i < trace.t.length; i += 1) total += sampleAt(trace, i).fRb;
      return total / trace.t.length;
    };
    expect(meanF(inPlume)).toBeLessThan(meanF(honest));
  });

  test('clamps an out-of-range index rather than returning undefined', () => {
    const trace = breathTrace({ samples: 60, contaminatedTop: false });
    expect(sampleAt(trace, 999).chin).toBe(trace.chin[59]);
    expect(sampleAt(trace, -5).chin).toBe(trace.chin[0]);
  });
});
