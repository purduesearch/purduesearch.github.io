/**
 * Pure geometry for the walkthrough overlay: no React, no DOM.
 *
 * Split out from TourOverlay because this is the part that is worth pinning
 * down with tests — an off-screen coach card is the failure a learner cannot
 * work around, and it only shows up at viewport sizes nobody thinks to open.
 */

export const PAD = 8;      // breathing room around the spotlit element
export const RADIUS = 10;  // matches the product's card radius
export const GAP = 16;     // between the spotlight and the coach card
export const EDGE = 12;    // minimum distance from the viewport edge
export const CARD_W = 340;

/** A rounded-rect subpath. Combined with the outer rect under fill-rule=evenodd,
 *  it cuts a genuine hole — which is what lets clicks reach the real element. */
export function holePath(r) {
  const x = r.left - PAD, y = r.top - PAD;
  const w = r.width + PAD * 2, h = r.height + PAD * 2;
  const rad = Math.min(RADIUS, w / 2, h / 2);
  return `M${x + rad},${y} H${x + w - rad} A${rad},${rad} 0 0 1 ${x + w},${y + rad} ` +
         `V${y + h - rad} A${rad},${rad} 0 0 1 ${x + w - rad},${y + h} ` +
         `H${x + rad} A${rad},${rad} 0 0 1 ${x},${y + h - rad} ` +
         `V${y + rad} A${rad},${rad} 0 0 1 ${x + rad},${y} Z`;
}

/**
 * Whether the scrim should absorb clicks landing outside the spotlight.
 *
 * Blocking is right for a step whose entire ask is "click this one thing": a
 * click anywhere else is a wrong turn, and swallowing it keeps the learner on
 * the rails. It is wrong for every other kind of step. An `api` step asks them
 * to do the thing for real — fill in a form, pick a date, press Save — and the
 * fields and the Save button are almost never the anchor, which is usually the
 * button that opened the form in the first place. Blocking there does not guide
 * anyone; it makes the step impossible to finish, because the one click that
 * would fire the request never reaches the button.
 *
 * The dim stays either way. Greying out where not to go is the useful half; the
 * scrim only has to stop being a wall.
 */
export function scrimBlocksClicks(step) {
  return step?.advance?.on === "click";
}

// Preference first, then the opposite side, then the perpendicular pair — the
// opposite side is the one most likely to have the room the preference lacked.
const FALLBACK_ORDER = {
  bottom: ["bottom", "top", "right", "left"],
  top:    ["top", "bottom", "right", "left"],
  right:  ["right", "left", "bottom", "top"],
  left:   ["left", "right", "bottom", "top"],
};

/**
 * Where the coach card goes.
 *
 * The step's declared placement is a preference, not an instruction: an anchor
 * near a viewport edge cannot honour it without pushing the card off screen, and
 * a card the learner cannot read is worse than one on the wrong side. So each
 * placement gets a fallback order, and whatever survives is clamped.
 *
 * Returns `placed` alongside the coordinates so the caller can style the side
 * it actually landed on rather than the side that was asked for.
 */
export function computeCardPosition({ rect, placement, card, vp }) {
  const w = card?.width || CARD_W;
  const h = card?.height || 200;

  const clamp = (top, left, placed) => ({
    top: Math.min(Math.max(EDGE, top), Math.max(EDGE, vp.h - h - EDGE)),
    left: Math.min(Math.max(EDGE, left), Math.max(EDGE, vp.w - w - EDGE)),
    placed,
  });

  if (!rect || placement === "center") {
    return clamp((vp.h - h) / 2, (vp.w - w) / 2, "center");
  }

  const fits = {
    bottom: rect.top + rect.height + GAP + h <= vp.h - EDGE,
    top:    rect.top - GAP - h >= EDGE,
    right:  rect.left + rect.width + GAP + w <= vp.w - EDGE,
    left:   rect.left - GAP - w >= EDGE,
  };

  const order = FALLBACK_ORDER[placement] ?? FALLBACK_ORDER.bottom;
  const chosen = order.find((side) => fits[side]);

  switch (chosen) {
    case "top":    return clamp(rect.top - GAP - h, rect.left, "top");
    case "right":  return clamp(rect.top, rect.left + rect.width + GAP, "right");
    case "left":   return clamp(rect.top, rect.left - GAP - w, "left");
    case "bottom": return clamp(rect.top + rect.height + GAP, rect.left, "bottom");
    default:
      // Nothing fits beside it — a tall anchor on a short viewport. Sit the card
      // in whichever half the anchor is not, so it never covers the spotlight.
      return clamp(
        rect.top > vp.h / 2 ? EDGE : vp.h - h - EDGE,
        (vp.w - w) / 2,
        "overlay"
      );
  }
}
