// Pure helpers behind "replace this image with a new one" in the blog editor.
// Kept free of React/TipTap imports so they stay unit-testable (see
// blogImageDrop.test.js), in the same spirit as columnSpans.js.

const GALLERY_TILE = '.cpm-blog-carousel-slide, .cpm-blog-carousel-edit-row';
const GALLERY_ROOT = '.cpm-blog-gallery-node';
const IMAGE_FIGURE = 'figure.cpm-blog-figure';
const HERO = '.cpm-blog-hero';

// Given the DOM element a file was dropped on, work out which existing image it
// should replace. Returns null when the drop should fall through to the normal
// "insert a new image here" behaviour.
export function resolveDropTarget(target) {
  if (!target || typeof target.closest !== 'function') return null;

  const tile = target.closest(GALLERY_TILE);
  if (tile) {
    const root = tile.closest(GALLERY_ROOT);
    const index = Number(tile.dataset?.index);
    if (!root || !Number.isInteger(index) || index < 0) return null;
    return { kind: 'gallery', el: root, index };
  }

  const figure = target.closest(IMAGE_FIGURE);
  if (figure) return { kind: 'image', el: figure };

  const hero = target.closest(HERO);
  if (hero) return { kind: 'hero', el: hero };

  return null;
}

// Attrs for an `image` node whose picture was swapped. Layout and caption
// survive so the page doesn't reflow; alt is cleared because alt describing the
// previous picture is an accessibility bug, and clearing it re-triggers the
// editor's "Add alt text" warning.
export function replacedImageAttrs(prev, upload) {
  return {
    ...prev,
    src: upload.url,
    alt: '',
    naturalWidth: upload.width ?? null,
    naturalHeight: upload.height ?? null,
  };
}

// Same rule for one tile of a gallery's `images` array.
export function galleryImagesWithReplacement(images, index, url) {
  if (!Array.isArray(images)) return [];
  if (!images[index]) return images;
  const next = images.slice();
  next[index] = { ...next[index], src: url, alt: '' };
  return next;
}
