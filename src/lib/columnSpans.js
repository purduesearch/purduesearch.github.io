// Pure 12-column span maths for the Section Builder grid. Kept free of
// ProseMirror so the rules can be tested without an editor instance.

const TOTAL = 12;

/** Split 12 tracks across `count` columns, giving the remainder to the left. */
export function defaultSpans(count) {
  const n = Math.max(1, Math.min(TOTAL, Math.round(count)));
  const base = Math.floor(TOTAL / n);
  const extra = TOTAL - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0));
}

/**
 * Move `delta` tracks across the gutter between column `index` and the one
 * after it. Returns the spans unchanged when the move would leave either
 * column below one track.
 */
export function resizePair(spans, index, delta) {
  const next = spans.slice();
  const left = next[index];
  const right = next[index + 1];
  if (left == null || right == null) return spans;
  const newLeft = left + delta;
  const newRight = right - delta;
  if (newLeft < 1 || newRight < 1) return spans;
  next[index] = newLeft;
  next[index + 1] = newRight;
  return next;
}

/** Append a column, rebalancing every column evenly. */
export function spansAfterAdd(spans) {
  return defaultSpans(Math.min(TOTAL, spans.length + 1));
}

/** Remove a column, rebalancing the rest. Never removes the last column. */
export function spansAfterRemove(spans, index) {
  if (spans.length <= 1) return spans;
  const kept = spans.filter((_, i) => i !== index);
  return defaultSpans(kept.length);
}
