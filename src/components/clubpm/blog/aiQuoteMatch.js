// Locating an AI-supplied quote in the live document is the one place where the
// AI panel can go wrong in a way that damages the post. So this never guesses:
// it tries four increasingly forgiving tiers and returns null rather than
// anchoring to something the model did not mean.

const SMART_PUNCT = [
  [/[‘’‛]/g, "'"],
  [/[“”‟]/g, '"'],
  [/[–—]/g, '-'],
  [/…/g, '...'],
  [/ /g, ' '],
];

/** Lowercase, straighten punctuation, collapse whitespace. */
export function normalizeQuote(text) {
  let out = String(text ?? '');
  SMART_PUNCT.forEach(([re, to]) => { out = out.replace(re, to); });
  return out.replace(/\s+/g, ' ').trim();
}

// Every block that can hold inline text, as one searchable unit. Quotes must
// stay inside a single block — a range spanning two paragraphs cannot be marked
// as one suggestion.
// A block's searchable text is built by walking its inline children and
// recording the REAL document position of every character. A non-text inline
// leaf (hardBreak, inline image) contributes 0 characters but 1 to the position
// space, so plain `textContent` indices would slide every later range left.
function buildBlock(node, pos) {
  let text = '';
  const positions = [];
  node.forEach((child, offset) => {
    const start = pos + 1 + offset;
    if (child.isText) {
      const value = child.text ?? '';
      for (let i = 0; i < value.length; i += 1) {
        text += value[i];
        positions.push(start + i);
      }
    }
    // else: an inline leaf — it advances the position space via `offset` alone.
  });
  return { text, positions };
}

// Every block that can hold inline text, as one searchable unit. Quotes must
// stay inside a single block — a range spanning two paragraphs cannot be marked
// as one suggestion.
function textBlocks(doc) {
  const blocks = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    blocks.push(buildBlock(node, pos));
    return false; // don't descend into a textblock's inline children
  });
  return blocks;
}

// Turns a [start, length) span of a block's searchable text into a real
// document range. Returns null if the span runs off the end of the block.
function spanToRange(block, start, length, tier) {
  const from = block.positions[start];
  const last = block.positions[start + length - 1];
  if (from === undefined || last === undefined) return null;
  return { from, to: last + 1, tier };
}

function exactIn(blocks, quote) {
  for (const block of blocks) {
    const idx = block.text.indexOf(quote);
    if (idx !== -1) return spanToRange(block, idx, quote.length, 'exact');
  }
  return null;
}

// Maps each character of the normalized form back to its offset in the raw
// block text, so a normalized hit can be reported as a real document range.
// One raw character can expand to several normalized ones (`…` -> `...`), so
// every EMITTED character pushes its own offset — otherwise `norm` and
// `offsets` desync and later ranges shift left (or fall off the end entirely).
function normalizedIndex(text) {
  let norm = '';
  const offsets = [];
  let prevWasSpace = true;
  for (let i = 0; i < text.length; i += 1) {
    let ch = text[i];
    SMART_PUNCT.forEach(([re, to]) => { if (re.test(ch)) ch = to; re.lastIndex = 0; });
    if (/\s/.test(ch)) {
      if (prevWasSpace) continue;
      // A whitespace run emits exactly one space, mapped to its first raw index.
      norm += ' '; offsets.push(i); prevWasSpace = true;
      continue;
    }
    for (const c of ch) { norm += c; offsets.push(i); }
    prevWasSpace = false;
  }
  // Trim leading/trailing space the same way normalizeQuote does.
  let start = 0, end = norm.length;
  while (start < end && norm[start] === ' ') start += 1;
  while (end > start && norm[end - 1] === ' ') end -= 1;
  return { norm: norm.slice(start, end), offsets: offsets.slice(start, end) };
}

// Turns a [start, length) span of the NORMALIZED form into a document range by
// hopping through `offsets` back into the block's searchable text first.
function normSpanToRange(block, offsets, start, length, tier) {
  const first = offsets[start];
  const last = offsets[start + length - 1];
  if (first === undefined || last === undefined) return null;
  return spanToRange(block, first, last - first + 1, tier);
}

function normalizedIn(blocks, quote) {
  const target = normalizeQuote(quote);
  if (!target) return null;
  for (const block of blocks) {
    const { norm, offsets } = normalizedIndex(block.text);
    const idx = norm.indexOf(target);
    if (idx === -1) continue;
    return normSpanToRange(block, offsets, idx, target.length, 'normalized');
  }
  return null;
}

const ANCHOR_WORDS = 6;
const MIN_ANCHORED_WORDS = 12;

/**
 * Last resort for a long quote whose middle the model garbled: match on its
 * first and last few words within one block, and take everything between.
 * Requires a substantial quote so short phrases can't produce a wild range.
 */
function anchoredIn(blocks, quote) {
  const words = normalizeQuote(quote).split(' ').filter(Boolean);
  if (words.length < MIN_ANCHORED_WORDS) return null;
  const head = words.slice(0, ANCHOR_WORDS).join(' ');
  const tail = words.slice(-ANCHOR_WORDS).join(' ');

  for (const block of blocks) {
    const { norm, offsets } = normalizedIndex(block.text);
    const h = norm.indexOf(head);
    if (h === -1) continue;
    const t = norm.indexOf(tail, h + head.length);
    if (t === -1) continue;
    const endNorm = t + tail.length - 1;
    return normSpanToRange(block, offsets, h, endNorm - h + 1, 'anchored');
  }
  return null;
}

/**
 * Find `quote` in `doc`.
 * @returns {{from: number, to: number, tier: 'exact'|'normalized'|'anchored'}|null}
 *          null when the quote cannot be located — the caller must surface this
 *          as an unlocatable edit rather than anchoring anywhere.
 */
export function findQuoteRange(doc, quote) {
  const raw = String(quote ?? '');
  if (!raw.trim()) return null;
  const blocks = textBlocks(doc);
  return exactIn(blocks, raw)
      ?? normalizedIn(blocks, raw)
      ?? anchoredIn(blocks, raw)
      ?? null;
}
