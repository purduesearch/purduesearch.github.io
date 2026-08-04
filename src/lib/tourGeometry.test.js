import { computeCardPosition, EDGE, CARD_W } from '../clubpm/tour/tourGeometry';

const VP = { w: 1280, h: 800 };
const CARD = { width: CARD_W, height: 220 };

/** The card must always be fully inside the viewport — this is the invariant
 *  every other assertion here is a specific case of. */
function assertOnScreen(pos, vp = VP, card = CARD) {
  expect(pos.top).toBeGreaterThanOrEqual(EDGE);
  expect(pos.left).toBeGreaterThanOrEqual(EDGE);
  expect(pos.top + card.height).toBeLessThanOrEqual(vp.h);
  expect(pos.left + card.width).toBeLessThanOrEqual(vp.w);
}

test('honours the declared placement when there is room', () => {
  const rect = { top: 300, left: 500, width: 200, height: 40 };
  const pos = computeCardPosition({ rect, placement: 'bottom', card: CARD, vp: VP });
  expect(pos.placed).toBe('bottom');
  expect(pos.top).toBe(300 + 40 + 16);
  assertOnScreen(pos);
});

test('flips to the opposite side when the preferred one would overflow', () => {
  // An anchor near the bottom edge: "bottom" cannot fit 220px of card below it.
  const rect = { top: 720, left: 400, width: 200, height: 40 };
  const pos = computeCardPosition({ rect, placement: 'bottom', card: CARD, vp: VP });
  expect(pos.placed).toBe('top');
  assertOnScreen(pos);
});

test('a right-edge anchor does not push the card off the right of the screen', () => {
  const rect = { top: 200, left: 1180, width: 90, height: 40 };
  const pos = computeCardPosition({ rect, placement: 'right', card: CARD, vp: VP });
  expect(pos.placed).toBe('left');
  assertOnScreen(pos);
});

test('a left-edge anchor does not push the card off the left of the screen', () => {
  const rect = { top: 200, left: 8, width: 180, height: 40 };
  const pos = computeCardPosition({ rect, placement: 'left', card: CARD, vp: VP });
  expect(pos.placed).toBe('right');
  assertOnScreen(pos);
});

test('centres when there is no rect to anchor to', () => {
  const pos = computeCardPosition({ rect: null, placement: 'bottom', card: CARD, vp: VP });
  expect(pos.placed).toBe('center');
  assertOnScreen(pos);
});

test('an anchor taller than the viewport still leaves the card readable', () => {
  const shortVp = { w: 900, h: 420 };
  const rect = { top: 10, left: 40, width: 820, height: 400 };
  const pos = computeCardPosition({ rect, placement: 'right', card: CARD, vp: shortVp });
  expect(pos.placed).toBe('overlay');
  assertOnScreen(pos, shortVp);
});

test('a card taller than the viewport is pinned to the top edge, never negative', () => {
  const tinyVp = { w: 400, h: 180 };
  const tall = { width: 340, height: 300 };
  const rect = { top: 60, left: 20, width: 100, height: 30 };
  const pos = computeCardPosition({ rect, placement: 'bottom', card: tall, vp: tinyVp });
  // Nothing fits, so it falls to the overlay branch: horizontally centred, and
  // clamped to the top edge rather than to a negative offset that would put the
  // card's own controls out of reach.
  expect(pos.placed).toBe('overlay');
  expect(pos.top).toBe(EDGE);
  expect(pos.left).toBe((tinyVp.w - tall.width) / 2);
});
