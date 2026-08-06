const GAP = 12;

/**
 * Google-Docs rail placement. Cards want to sit level with their anchor; where
 * that would overlap, later cards slide down. The focused card is pinned to its
 * true anchor and everything above it is pushed up instead, so clicking a
 * comment always lines it up with the text it refers to.
 *
 * @param {{id: string, idealTop: number, height: number}[]} cards
 * @param {string|null} focusedId
 * @returns {Map<string, number>} id -> resolved top
 */
export function layoutCards(cards, focusedId) {
  const sorted = [...cards].sort((a, b) => a.idealTop - b.idealTop);
  const tops = new Map();

  let cursor = -Infinity;
  for (const card of sorted) {
    const top = Math.max(card.idealTop, cursor);
    tops.set(card.id, top);
    cursor = top + card.height + GAP;
  }

  const focusIndex = sorted.findIndex((c) => c.id === focusedId);
  if (focusIndex === -1) return tops;

  // Pin the focused card, then walk backwards pushing predecessors up so the
  // pinned card is never displaced by the cards above it.
  tops.set(focusedId, sorted[focusIndex].idealTop);
  for (let i = focusIndex - 1; i >= 0; i -= 1) {
    const below = sorted[i + 1];
    const limit = tops.get(below.id) - GAP - sorted[i].height;
    tops.set(sorted[i].id, Math.min(tops.get(sorted[i].id), limit));
  }
  return tops;
}

export default layoutCards;
