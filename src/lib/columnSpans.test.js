import { defaultSpans, resizePair, spansAfterAdd, spansAfterRemove } from './columnSpans';

test('defaultSpans splits 12 as evenly as possible', () => {
  expect(defaultSpans(1)).toEqual([12]);
  expect(defaultSpans(2)).toEqual([6, 6]);
  expect(defaultSpans(3)).toEqual([4, 4, 4]);
  expect(defaultSpans(4)).toEqual([3, 3, 3, 3]);
  expect(defaultSpans(5)).toEqual([3, 3, 2, 2, 2]);
});

test('resizePair moves one column from right to left and preserves the total', () => {
  expect(resizePair([6, 6], 0, 1)).toEqual([7, 5]);
  expect(resizePair([6, 6], 0, -1)).toEqual([5, 7]);
  expect(resizePair([4, 4, 4], 1, 1)).toEqual([4, 5, 3]);
});

test('resizePair refuses to shrink a column below 1', () => {
  expect(resizePair([11, 1], 0, 1)).toEqual([11, 1]);
  expect(resizePair([1, 11], 0, -1)).toEqual([1, 11]);
});

test('spansAfterAdd appends a column and rebalances', () => {
  expect(spansAfterAdd([6, 6])).toEqual([4, 4, 4]);
  expect(spansAfterAdd([12])).toEqual([6, 6]);
});

test('spansAfterRemove drops the column and rebalances', () => {
  expect(spansAfterRemove([4, 4, 4], 1)).toEqual([6, 6]);
  expect(spansAfterRemove([6, 6], 0)).toEqual([12]);
  expect(spansAfterRemove([12], 0)).toEqual([12]);
});
