import { Schema } from '@tiptap/pm/model';
import { findMarkRanges } from './suggestionMarks';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block', toDOM: () => ['p', 0] },
    text: { group: 'inline' },
  },
  marks: {
    suggestDelete: { attrs: { threadId: {} } },
    suggestInsert: { attrs: { threadId: {} } },
    commentMark: { attrs: { threadId: {} } },
  },
});

// Builds a one-paragraph doc from [text, markName|null, threadId|null] triples.
function docFrom(...pieces) {
  const inline = pieces.map(([text, markName, threadId]) =>
    schema.text(text, markName ? [schema.marks[markName].create({ threadId })] : []));
  return schema.node('doc', null, [schema.node('paragraph', null, inline)]);
}

test('finds a single marked range', () => {
  const doc = docFrom(['keep ', null, null], ['struck', 'suggestDelete', 't1'], [' keep', null, null]);
  // Paragraph content starts at position 1, so "struck" spans 6..12.
  expect(findMarkRanges(doc, 'suggestDelete', 't1')).toEqual([{ from: 6, to: 12 }]);
});

test('ignores the same mark belonging to a different thread', () => {
  const doc = docFrom(['a', 'suggestDelete', 't1'], ['b', 'suggestDelete', 't2']);
  expect(findMarkRanges(doc, 'suggestDelete', 't1')).toEqual([{ from: 1, to: 2 }]);
  expect(findMarkRanges(doc, 'suggestDelete', 't2')).toEqual([{ from: 2, to: 3 }]);
});

test('ignores a different mark type on the same thread', () => {
  const doc = docFrom(['x', 'suggestInsert', 't1']);
  expect(findMarkRanges(doc, 'suggestDelete', 't1')).toEqual([]);
});

test('merges adjacent text nodes carrying the same mark', () => {
  // Two separate text nodes, same mark+thread — must come back as ONE range,
  // otherwise accept/reject would delete in pieces and corrupt positions.
  const doc = schema.node('doc', null, [schema.node('paragraph', null, [
    schema.text('ab', [schema.marks.suggestDelete.create({ threadId: 't1' })]),
    schema.text('cd', [schema.marks.suggestDelete.create({ threadId: 't1' })]),
  ])]);
  expect(findMarkRanges(doc, 'suggestDelete', 't1')).toEqual([{ from: 1, to: 5 }]);
});

test('finds ranges across separate paragraphs', () => {
  const mark = [schema.marks.commentMark.create({ threadId: 't1' })];
  const doc = schema.node('doc', null, [
    schema.node('paragraph', null, [schema.text('aa', mark)]),
    schema.node('paragraph', null, [schema.text('bb', mark)]),
  ]);
  expect(findMarkRanges(doc, 'commentMark', 't1')).toEqual([{ from: 1, to: 3 }, { from: 5, to: 7 }]);
});

test('returns empty for an unknown thread', () => {
  expect(findMarkRanges(docFrom(['a', null, null]), 'commentMark', 'nope')).toEqual([]);
});
