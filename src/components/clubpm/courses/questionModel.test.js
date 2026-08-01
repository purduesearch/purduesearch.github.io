import {
  blankQuestion,
  blankAnswer,
  hydrate,
  serializeQuestion,
  validateQuestion,
  applyKindChange,
} from './questionModel';

// A valid SINGLE question, as a base for the negative cases below.
function validQuestion(overrides = {}) {
  return {
    ...blankQuestion('SINGLE'),
    prompt: 'What is the torque spec?',
    answers: [blankAnswer('25 Nm', true), blankAnswer('40 Nm', false)],
    ...overrides,
  };
}

describe('blankQuestion', () => {
  it('gives a non-TRUE_FALSE question two empty answers and no correct one', () => {
    const q = blankQuestion('SINGLE');
    expect(q.answers).toHaveLength(2);
    expect(q.answers.every((a) => a.text === '')).toBe(true);
    expect(q.answers.some((a) => a.isCorrect)).toBe(false);
    expect(q.id).toBeNull();
  });

  it('gives TRUE_FALSE exactly the True/False pair with True correct', () => {
    const q = blankQuestion('TRUE_FALSE');
    expect(q.answers.map((a) => a.text)).toEqual(['True', 'False']);
    expect(q.answers.map((a) => a.isCorrect)).toEqual([true, false]);
  });

  it('applies extras, which is how a video pop-up gets its timestamp', () => {
    expect(blankQuestion('SINGLE', { videoTimestampSec: 15 }).videoTimestampSec).toBe(15);
  });

  it('issues a distinct _key per call so list identity never collides', () => {
    expect(blankQuestion()._key).not.toBe(blankQuestion()._key);
  });
});

describe('hydrate', () => {
  it('replaces null text columns with empty strings the inputs can bind to', () => {
    const row = { id: 'q1', prompt: null, explanation: null, points: null, answers: [] };
    const q = hydrate(row);
    expect(q.prompt).toBe('');
    expect(q.explanation).toBe('');
    expect(q.points).toBe(1);
  });

  it('adopts server ids as local keys so a save does not remount the card', () => {
    const q = hydrate({ id: 'q1', answers: [{ id: 'a1', text: 'x', isCorrect: true }] });
    expect(q._key).toBe('q1');
    expect(q.answers[0]._key).toBe('a1');
  });
});

describe('serializeQuestion', () => {
  it('assigns order from array position, not from the row', () => {
    expect(serializeQuestion(validQuestion({ order: 99 }), 3).order).toBe(3);
    expect(serializeQuestion(validQuestion(), 0).answers.map((a) => a.order)).toEqual([0, 1]);
  });

  it('forwards a saved id so the server updates in place', () => {
    expect(serializeQuestion(validQuestion({ id: 'q1' }), 0).id).toBe('q1');
  });

  it('omits the id for a new row rather than sending null', () => {
    const payload = serializeQuestion(validQuestion(), 0);
    expect(payload.id).toBeUndefined();
  });

  it('trims text and collapses a blank explanation to null', () => {
    const q = validQuestion({ prompt: '  spaced  ', explanation: '   ' });
    const payload = serializeQuestion(q, 0);
    expect(payload.prompt).toBe('spaced');
    expect(payload.explanation).toBeNull();
  });

  it('drops the local _key bookkeeping', () => {
    const payload = serializeQuestion(validQuestion(), 0);
    expect(payload._key).toBeUndefined();
    expect(payload.answers.every((a) => a._key === undefined)).toBe(true);
  });

  it('floors a non-numeric points value to 1 rather than sending NaN', () => {
    expect(serializeQuestion(validQuestion({ points: '' }), 0).points).toBe(1);
  });
});

describe('validateQuestion', () => {
  it('accepts a well-formed question', () => {
    expect(validateQuestion(validQuestion())).toBeNull();
  });

  it('rejects a missing prompt', () => {
    expect(validateQuestion(validQuestion({ prompt: '   ' }))).toMatch(/prompt/i);
  });

  it('rejects fewer than two answers', () => {
    const q = validQuestion({ answers: [blankAnswer('only', true)] });
    expect(validateQuestion(q)).toMatch(/two answers/i);
  });

  it('rejects blank answer text', () => {
    const q = validQuestion({ answers: [blankAnswer('ok', true), blankAnswer('  ', false)] });
    expect(validateQuestion(q)).toMatch(/blank/i);
  });

  it('rejects a question with no correct answer', () => {
    const q = validQuestion({ answers: [blankAnswer('a', false), blankAnswer('b', false)] });
    expect(validateQuestion(q)).toMatch(/correct/i);
  });

  it('rejects SINGLE with two correct answers', () => {
    const q = validQuestion({ answers: [blankAnswer('a', true), blankAnswer('b', true)] });
    expect(validateQuestion(q)).toMatch(/single-choice/i);
  });

  it('allows MULTI with two correct answers', () => {
    const q = validQuestion({
      kind: 'MULTI',
      answers: [blankAnswer('a', true), blankAnswer('b', true)],
    });
    expect(validateQuestion(q)).toBeNull();
  });

  it('accepts a well-formed TRUE_FALSE pair', () => {
    expect(validateQuestion(blankQuestion('TRUE_FALSE', { prompt: 'Lockout is required' }))).toBeNull();
  });
});

describe('applyKindChange', () => {
  it('collapses MULTI to SINGLE by keeping only the first correct answer', () => {
    const q = validQuestion({
      kind: 'MULTI',
      answers: [blankAnswer('a', true), blankAnswer('b', true), blankAnswer('c', false)],
    });
    const next = applyKindChange(q, 'SINGLE');
    expect(next.answers.map((a) => a.isCorrect)).toEqual([true, false, false]);
    // The result must be gradeable, which is the whole point of the reshape.
    expect(validateQuestion(next)).toBeNull();
  });

  it('replaces the answer set with a True/False pair', () => {
    const next = applyKindChange(validQuestion(), 'TRUE_FALSE');
    expect(next.answers.map((a) => a.text)).toEqual(['True', 'False']);
  });

  it('preserves which of True/False was correct when re-entering TRUE_FALSE', () => {
    const q = validQuestion({
      kind: 'TRUE_FALSE',
      answers: [blankAnswer('True', false), blankAnswer('False', true)],
    });
    const next = applyKindChange(q, 'TRUE_FALSE');
    expect(next.answers.map((a) => a.isCorrect)).toEqual([false, true]);
  });

  it('leaves the answer set alone when widening SINGLE to MULTI', () => {
    const q = validQuestion();
    const next = applyKindChange(q, 'MULTI');
    expect(next.answers.map((a) => a.text)).toEqual(['25 Nm', '40 Nm']);
    expect(next.kind).toBe('MULTI');
  });
});
