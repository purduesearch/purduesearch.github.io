import { Schema } from '@tiptap/pm/model';
import { findQuoteRange, normalizeQuote } from './aiQuoteMatch';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block', toDOM: () => ['p', 0] },
    text: { group: 'inline' },
  },
  marks: { bold: {} },
});

function docOf(...paragraphs) {
  return schema.node('doc', null, paragraphs.map((p) =>
    schema.node('paragraph', null, Array.isArray(p)
      ? p.map(([t, m]) => schema.text(t, m ? [schema.marks.bold.create()] : []))
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
  expect(hit.tier).toBe('normalized');
  expect(doc.textBetween(hit.from, hit.to)).toContain('ship');
});

test('tier 3: anchored match on a long quote with a garbled middle', () => {
  const doc = docOf('The Crew One team completed a full thermal vacuum test campaign at Purdue in April of this year.');
  const hit = findQuoteRange(doc,
    'The Crew One team completed a full SOMETHING ENTIRELY WRONG HERE at Purdue in April of this year.');
  expect(hit.tier).toBe('anchored');
  expect(doc.textBetween(hit.from, hit.to)).toContain('Crew One');
  expect(doc.textBetween(hit.from, hit.to)).toContain('April');
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
