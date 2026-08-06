import { modesFor, defaultMode } from './SuggestingMode';

// COMMENT users ride a readOnly connection, so their suggestions — which are
// marks, and therefore document writes — would be dropped. Suggesting requires
// EDIT. Commenting is orthogonal to the mode, exactly as in Google Docs.
test('VIEW gets viewing only', () => {
  expect(modesFor('VIEW')).toEqual(['viewing']);
  expect(defaultMode('VIEW')).toBe('viewing');
});

test('COMMENT gets viewing only, not suggesting', () => {
  expect(modesFor('COMMENT')).toEqual(['viewing']);
  expect(defaultMode('COMMENT')).toBe('viewing');
});

test('EDIT gets all three modes and defaults to editing', () => {
  expect(modesFor('EDIT')).toEqual(['editing', 'suggesting', 'viewing']);
  expect(defaultMode('EDIT')).toBe('editing');
});

test('OWNER matches EDIT', () => {
  expect(modesFor('OWNER')).toEqual(['editing', 'suggesting', 'viewing']);
});
