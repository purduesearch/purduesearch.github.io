import { nextIndex } from './blogCarousel';

test('advances forward and stops at the end', () => {
  expect(nextIndex(0, 1, 4)).toBe(1);
  expect(nextIndex(3, 1, 4)).toBe(3);
});

test('advances backward and stops at the start', () => {
  expect(nextIndex(2, -1, 4)).toBe(1);
  expect(nextIndex(0, -1, 4)).toBe(0);
});

test('handles a single slide and an empty carousel', () => {
  expect(nextIndex(0, 1, 1)).toBe(0);
  expect(nextIndex(0, 1, 0)).toBe(0);
});

test('clamps an out-of-range current index', () => {
  expect(nextIndex(99, 1, 3)).toBe(2);
  expect(nextIndex(-5, -1, 3)).toBe(0);
});
