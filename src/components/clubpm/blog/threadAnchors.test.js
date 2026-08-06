import * as Y from 'yjs';
import { encodeAnchor, decodeAnchor } from './threadAnchors';

// Round-tripping is the contract the rail depends on: an anchor written by one
// client must decode to the same position in another client's document.
test('encodeAnchor -> decodeAnchor round-trips to the same index', () => {
  const doc = new Y.Doc();
  const text = doc.getText('t');
  text.insert(0, 'hello world');

  const rel = Y.createRelativePositionFromTypeIndex(text, 6);
  const decoded = decodeAnchor(encodeAnchor(rel));
  const abs = Y.createAbsolutePositionFromRelativePosition(decoded, doc);

  expect(abs.index).toBe(6);
});

test('an anchor survives an edit before it, tracking the same character', () => {
  const doc = new Y.Doc();
  const text = doc.getText('t');
  text.insert(0, 'hello world');

  const rel = Y.createRelativePositionFromTypeIndex(text, 6);
  const encoded = encodeAnchor(rel);
  text.insert(0, 'XXX');           // shifts everything right by 3

  const abs = Y.createAbsolutePositionFromRelativePosition(decodeAnchor(encoded), doc);
  expect(abs.index).toBe(9);
});

test('decodeAnchor returns null on malformed input instead of throwing', () => {
  expect(decodeAnchor('not-base64!!')).toBeNull();
  expect(decodeAnchor('')).toBeNull();
});
