import { resolveDropTarget, replacedImageAttrs, galleryImagesWithReplacement } from './blogImageDrop';

// Minimal DOM stand-in: only `closest` and `dataset` are used by the helper.
function el(selectorsMatched, { dataset = {}, ancestors = {} } = {}) {
  return {
    dataset,
    closest(sel) {
      const wanted = sel.split(',').map((s) => s.trim());
      for (const w of wanted) {
        if (selectorsMatched.includes(w)) return this;
        if (ancestors[w]) return ancestors[w];
      }
      return null;
    },
  };
}

describe('resolveDropTarget', () => {
  test('returns null for a non-image drop target', () => {
    expect(resolveDropTarget(el([]))).toBe(null);
  });

  test('returns null when given nothing', () => {
    expect(resolveDropTarget(null)).toBe(null);
  });

  test('identifies an inline image figure', () => {
    const fig = el(['figure.cpm-blog-figure']);
    expect(resolveDropTarget(fig)).toEqual({ kind: 'image', el: fig });
  });

  test('identifies a hero', () => {
    const hero = el(['.cpm-blog-hero']);
    expect(resolveDropTarget(hero)).toEqual({ kind: 'hero', el: hero });
  });

  test('identifies a gallery slide and its index', () => {
    const root = el(['.cpm-blog-gallery-node']);
    const slide = el(['.cpm-blog-carousel-slide'], { dataset: { index: '2' }, ancestors: { '.cpm-blog-gallery-node': root } });
    expect(resolveDropTarget(slide)).toEqual({ kind: 'gallery', el: root, index: 2 });
  });

  test('identifies a gallery edit row and its index', () => {
    const root = el(['.cpm-blog-gallery-node']);
    const row = el(['.cpm-blog-carousel-edit-row'], { dataset: { index: '0' }, ancestors: { '.cpm-blog-gallery-node': root } });
    expect(resolveDropTarget(row)).toEqual({ kind: 'gallery', el: root, index: 0 });
  });

  test('ignores a gallery slide with no usable index', () => {
    const root = el(['.cpm-blog-gallery-node']);
    const slide = el(['.cpm-blog-carousel-slide'], { dataset: {}, ancestors: { '.cpm-blog-gallery-node': root } });
    expect(resolveDropTarget(slide)).toBe(null);
  });
});

describe('replacedImageAttrs', () => {
  const prev = {
    src: '/old.png', alt: 'an old rocket', align: 'wrap-left', width: 320,
    widthUnit: 'px', caption: 'Fig 1', naturalWidth: 900, naturalHeight: 600,
  };

  test('keeps layout and caption', () => {
    const next = replacedImageAttrs(prev, { url: '/new.png', width: 1200, height: 800 });
    expect(next.align).toBe('wrap-left');
    expect(next.width).toBe(320);
    expect(next.widthUnit).toBe('px');
    expect(next.caption).toBe('Fig 1');
  });

  test('swaps src and updates natural dimensions', () => {
    const next = replacedImageAttrs(prev, { url: '/new.png', width: 1200, height: 800 });
    expect(next.src).toBe('/new.png');
    expect(next.naturalWidth).toBe(1200);
    expect(next.naturalHeight).toBe(800);
  });

  test('clears alt text so the accessibility warning returns', () => {
    const next = replacedImageAttrs(prev, { url: '/new.png', width: 1200, height: 800 });
    expect(next.alt).toBe('');
  });

  test('nulls natural dimensions when the upload did not report them', () => {
    const next = replacedImageAttrs(prev, { url: '/new.png' });
    expect(next.naturalWidth).toBe(null);
    expect(next.naturalHeight).toBe(null);
  });
});

describe('galleryImagesWithReplacement', () => {
  const images = [
    { src: '/a.png', alt: 'a', caption: 'first' },
    { src: '/b.png', alt: 'b', caption: 'second' },
  ];

  test('replaces src at the index and clears that alt', () => {
    const next = galleryImagesWithReplacement(images, 1, '/new.png');
    expect(next[1]).toEqual({ src: '/new.png', alt: '', caption: 'second' });
  });

  test('leaves other tiles untouched', () => {
    const next = galleryImagesWithReplacement(images, 1, '/new.png');
    expect(next[0]).toEqual(images[0]);
    expect(next).not.toBe(images);
  });

  test('returns the input unchanged for an out-of-range index', () => {
    expect(galleryImagesWithReplacement(images, 5, '/new.png')).toBe(images);
  });

  test('tolerates a missing image list', () => {
    expect(galleryImagesWithReplacement(undefined, 0, '/new.png')).toEqual([]);
  });
});
