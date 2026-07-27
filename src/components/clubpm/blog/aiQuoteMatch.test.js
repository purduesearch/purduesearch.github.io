import { Schema } from '@tiptap/pm/model';
import { findQuoteRange, normalizeQuote } from './aiQuoteMatch';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block', toDOM: () => ['p', 0] },
    text: { group: 'inline' },
    hardBreak: { group: 'inline', inline: true, selectable: false, toDOM: () => ['br'] },
  },
  marks: { bold: {} },
});

const BR = { br: true };

function docOf(...paragraphs) {
  return schema.node('doc', null, paragraphs.map((p) =>
    schema.node('paragraph', null, Array.isArray(p)
      ? p.map((entry) => (entry === BR
        ? schema.node('hardBreak')
        : schema.text(entry[0], entry[1] ? [schema.marks.bold.create()] : [])))
      : [schema.text(p)])));
}

test('normalizeQuote collapses whitespace and smart punctuation', () => {
  expect(normalizeQuote('  we  did\ntesting ')).toBe('we did testing');
  expect(normalizeQuote('don’t “stop”')).toBe(`don't "stop"`);
});

test('tier 1: exact match', () => {
  const doc = docOf('We did testing last week.');
  expect(findQuoteRange(doc, 'did testing')).toEqual({ from: 4, to: 15, tier: 'exact' });
});

test('tier 1: exact match survives marks splitting the text', () => {
  // "did testing" is split across two text nodes by a bold mark — the quote
  // must still match, because AI never sees the mark boundaries.
  const doc = docOf([['We ', false], ['did', true], [' testing here', false]]);
  const hit = findQuoteRange(doc, 'did testing');
  expect(hit.tier).toBe('exact');
  expect(doc.textBetween(hit.from, hit.to)).toBe('did testing');
});

test('tier 2: normalized match when the model re-punctuates', () => {
  const doc = docOf('We don’t ship  untested hardware.');
  const hit = findQuoteRange(doc, `don't ship untested`);
  expect(hit).toEqual({ from: 4, to: 24, tier: 'normalized' });
  expect(doc.textBetween(hit.from, hit.to)).toBe('don’t ship  untested');
});

test('tier 3: anchored match on a long quote with a garbled middle', () => {
  const doc = docOf('The Crew One team completed a full thermal vacuum test campaign at Purdue in April of this year.');
  const hit = findQuoteRange(doc,
    'The Crew One team completed a full SOMETHING ENTIRELY WRONG HERE at Purdue in April of this year.');
  expect(hit).toEqual({ from: 1, to: 97, tier: 'anchored' });
  expect(doc.textBetween(hit.from, hit.to)).toBe(
    'The Crew One team completed a full thermal vacuum test campaign at Purdue in April of this year.');
});

test('an ellipsis expanding to "..." does not shift the reported range', () => {
  // `…` is one raw character but three normalized ones. If the normalized index
  // pushed one offset per RAW char, every range after it would slide left by 2.
  const doc = docOf('We waited… then we shipped it.');
  const hit = findQuoteRange(doc, 'waited... then we');
  expect(hit).toEqual({ from: 4, to: 19, tier: 'normalized' });
  expect(doc.textBetween(hit.from, hit.to)).toBe('waited… then we');
});

test('a normalized match at the very end of a block after an ellipsis', () => {
  // The desync path that produced an undefined offset -> NaN `to`.
  const doc = docOf('We waited… then we shipped it.');
  const hit = findQuoteRange(doc, 'shipped  it.');
  expect(hit).toEqual({ from: 20, to: 31, tier: 'normalized' });
  expect(doc.textBetween(hit.from, hit.to)).toBe('shipped it.');
});

test('a hardBreak in the block does not shift the reported range', () => {
  // hardBreak adds 0 chars to textContent but 1 to the position space.
  const doc = docOf([['First line', false], BR, ['second line here', false]]);
  const hit = findQuoteRange(doc, 'second line');
  expect(hit).toEqual({ from: 12, to: 23, tier: 'exact' });
  expect(doc.textBetween(hit.from, hit.to)).toBe('second line');
});

test('gives up rather than guessing', () => {
  const doc = docOf('We did testing last week.');
  expect(findQuoteRange(doc, 'a completely unrelated sentence about budgets')).toBeNull();
});

test('gives up on an empty quote', () => {
  expect(findQuoteRange(docOf('anything'), '   ')).toBeNull();
});

test('does not match across a paragraph boundary', () => {
  const doc = docOf('First half', 'second half');
  expect(findQuoteRange(doc, 'First half second half')).toBeNull();
});
