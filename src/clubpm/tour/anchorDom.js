/**
 * The one place that turns an anchor id into a DOM node.
 *
 * Both the overlay (which measures the element) and the provider (which watches
 * for clicks on it) need this lookup, and they must agree: if they disagreed the
 * spotlight would ring one element while a click on a different one advanced the
 * step. Keeping the selector in a single function is what makes that impossible.
 */

/** Anchor ids are `surface.element[.variant]`, so a bare template literal would
 *  already be safe — but a typo'd id containing a quote must not silently build
 *  a selector that matches something else. */
export function anchorSelector(anchorId) {
  const escape = window.CSS?.escape ?? ((s) => s.replace(/["\\]/g, "\\$&"));
  return `[data-tour-id="${escape(String(anchorId))}"]`;
}

export function findAnchor(anchorId) {
  if (!anchorId) return null;
  try {
    return document.querySelector(anchorSelector(anchorId));
  } catch {
    return null;
  }
}

/** True when the rect is at least mostly inside the viewport already. Used to
 *  avoid a scroll animation on an element the learner can already see — the
 *  jump reads as the app losing its place. */
export function isRectComfortablyVisible(rect, margin = 24) {
  return (
    rect.top >= margin &&
    rect.left >= 0 &&
    rect.bottom <= window.innerHeight - margin &&
    rect.right <= window.innerWidth
  );
}
