// Phase 4E: Previous / Next must never offer a section the course's sequencing
// rules have locked — a locked section arrives without its content, so stepping
// onto one would show an empty lesson.
import { stepNeighbours } from './courseSteps';

const sections = [
  { id: 'a', locked: false },
  { id: 'b', locked: false },
  { id: 'c', locked: true },
  { id: 'd', locked: true },
  { id: 'e', locked: false },
];

describe('stepNeighbours', () => {
  it('walks to the adjacent sections', () => {
    expect(stepNeighbours(sections, 'b')).toMatchObject({
      index: 1,
      previous: { id: 'a' },
    });
  });

  it('skips locked sections in both directions', () => {
    // b → e, jumping the two locked ones rather than offering them.
    expect(stepNeighbours(sections, 'b').next).toMatchObject({ id: 'e' });
    expect(stepNeighbours(sections, 'e').previous).toMatchObject({ id: 'b' });
  });

  it('has no previous at the start and no next at the end', () => {
    expect(stepNeighbours(sections, 'a').previous).toBeNull();
    expect(stepNeighbours(sections, 'e').next).toBeNull();
  });

  it('offers nothing when every other section is locked', () => {
    const gated = [{ id: 'a', locked: false }, { id: 'b', locked: true }];
    expect(stepNeighbours(gated, 'a')).toEqual({ index: 0, previous: null, next: null });
  });

  it('survives an unknown selection and a missing list', () => {
    expect(stepNeighbours(sections, 'zz')).toEqual({ index: -1, previous: null, next: null });
    expect(stepNeighbours(undefined, 'a')).toEqual({ index: -1, previous: null, next: null });
  });
});
