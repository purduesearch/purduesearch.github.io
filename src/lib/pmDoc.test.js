import { isEmptyDoc, hasReadableContent } from './pmDoc';

describe('isEmptyDoc', () => {
  it('treats null and undefined as empty', () => {
    expect(isEmptyDoc(null)).toBe(true);
    expect(isEmptyDoc(undefined)).toBe(true);
  });

  // The one that matters: seedCourses.ts writes `contentJson: {}` for every
  // section, and `{}` is truthy. This is what put a 320px blank band above
  // every TRAINING section.
  it('treats the seeded empty object as empty', () => {
    expect(isEmptyDoc({})).toBe(true);
  });

  it('treats a doc with no content array as empty', () => {
    expect(isEmptyDoc({ type: 'doc' })).toBe(true);
    expect(isEmptyDoc({ type: 'doc', content: [] })).toBe(true);
  });

  // What a freshly-mounted editor reports before anyone types.
  it('treats a lone empty paragraph as empty', () => {
    expect(isEmptyDoc({ type: 'doc', content: [{ type: 'paragraph' }] })).toBe(true);
  });

  it('treats an array as empty rather than reading its length', () => {
    expect(isEmptyDoc([{ type: 'paragraph' }])).toBe(true);
  });

  it('treats a doc with real text as non-empty', () => {
    expect(
      isEmptyDoc({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Before you start' }] }],
      })
    ).toBe(false);
  });

  it('finds text nested below the top level', () => {
    expect(
      isEmptyDoc({
        type: 'doc',
        content: [
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [
                  { type: 'paragraph', content: [{ type: 'text', text: 'Wear gloves' }] },
                ],
              },
            ],
          },
        ],
      })
    ).toBe(false);
  });

  it('hasReadableContent is the inverse', () => {
    expect(hasReadableContent({})).toBe(false);
    expect(
      hasReadableContent({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }],
      })
    ).toBe(true);
  });
});
