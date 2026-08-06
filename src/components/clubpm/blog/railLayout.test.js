import { layoutCards } from './railLayout';

// Pure geometry: ideal tops in, non-overlapping tops out. The focused card is
// the one that keeps its true anchor position; others yield around it.
test('non-overlapping cards keep their ideal tops', () => {
  const out = layoutCards([
    { id: 'a', idealTop: 0,   height: 80 },
    { id: 'b', idealTop: 200, height: 80 },
  ], null);
  expect(out.get('a')).toBe(0);
  expect(out.get('b')).toBe(200);
});

test('overlapping cards are pushed down by height plus gap', () => {
  const out = layoutCards([
    { id: 'a', idealTop: 0,  height: 80 },
    { id: 'b', idealTop: 10, height: 80 },
  ], null);
  expect(out.get('a')).toBe(0);
  expect(out.get('b')).toBe(92);   // 0 + 80 + 12
});

test('the focused card keeps its ideal top and pushes earlier cards up', () => {
  const out = layoutCards([
    { id: 'a', idealTop: 0,  height: 80 },
    { id: 'b', idealTop: 10, height: 80 },
  ], 'b');
  expect(out.get('b')).toBe(10);
  expect(out.get('a')).toBe(-82);  // 10 - 12 - 80
});

test('cards are ordered by ideal top regardless of input order', () => {
  const out = layoutCards([
    { id: 'b', idealTop: 200, height: 50 },
    { id: 'a', idealTop: 0,   height: 50 },
  ], null);
  expect(out.get('a')).toBe(0);
  expect(out.get('b')).toBe(200);
});
