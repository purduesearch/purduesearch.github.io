# Blog Image Replace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an author replace any already-placed image in the blog editor — inline image, hero background, section background, gallery tile — by upload or by dropping a file onto it.

**Architecture:** Pure decision logic (which DOM element is a drop target, what attrs survive a replace) goes in `src/lib/blogImageDrop.js` with Jest tests, matching the existing `src/lib/columnSpans.js` pattern. A `useImageUpload()` hook wraps the file-picker + `uploadBlogImage()` round trip so the four TipTap node views don't each re-implement it. Drop routing stays inside the single existing ProseMirror `handleDrop` plugin in `BlogImage.jsx`, because React's `onDrop` cannot preempt it.

**Tech Stack:** React 19, TipTap v2 (`@tiptap/core`, `@tiptap/react`, `@tiptap/pm`), Jest via `react-scripts test`, plain CSS in `public/clubpm-theme.css`.

**Spec:** `docs/superpowers/specs/2026-07-27-blog-image-replace-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/blogImageDrop.js` (new) | Pure helpers: resolve a drop target from a DOM element; compute post-replace attrs for an image node and for a gallery image list. No React, no TipTap imports. |
| `src/lib/blogImageDrop.test.js` (new) | Jest tests for the above. |
| `src/components/clubpm/blog/useImageUpload.js` (new) | `useImageUpload()` → `{ busy, pickImage }`. Owns the throwaway `<input type="file">`, the `uploadBlogImage()` call, and failure reporting. |
| `src/components/clubpm/blog/BlogImage.jsx` | Replace button in the image toolbar; placeholder upload refactored onto the hook; drop routing in the ProseMirror plugin. |
| `src/components/clubpm/blog/BlogHero.jsx` | Upload / Replace / Remove for `bgImage`. |
| `src/components/clubpm/blog/BlogSectionSettings.jsx` | Upload / Replace / Remove for `background` of kind `image`. |
| `src/components/clubpm/blog/BlogGallery.jsx` | `data-index` on slides and edit rows; per-row Replace button. |
| `public/clubpm-theme.css` | Layout for the new control rows. |

No backend, Prisma, or `blogRender.ts` changes. Nothing here appears in any `renderHTML`, so published `/blog/:slug` output is untouched.

---

### Task 1: Pure drop-target + attribute helpers

**Files:**
- Create: `src/lib/blogImageDrop.js`
- Test: `src/lib/blogImageDrop.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/lib/blogImageDrop.test.js`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx react-scripts test --watchAll=false src/lib/blogImageDrop.test.js`
Expected: FAIL — `Cannot find module './blogImageDrop'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/blogImageDrop.js`:

```js
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx react-scripts test --watchAll=false src/lib/blogImageDrop.test.js`
Expected: PASS, 15 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/blogImageDrop.js src/lib/blogImageDrop.test.js
git commit -m "feat(blog): pure helpers for replacing editor images"
```

---

### Task 2: `useImageUpload` hook

**Files:**
- Create: `src/components/clubpm/blog/useImageUpload.js`

No test: the hook is a thin wrapper over a browser file dialog and `uploadBlogImage()`, neither of which jsdom can exercise meaningfully. Its behaviour is verified through the manual checks at the end of this plan.

- [ ] **Step 1: Write the hook**

Create `src/components/clubpm/blog/useImageUpload.js`:

```js
import React from 'react';
import { uploadBlogImage } from '../../../api/clubPmClient';

// Shared "pick a file, upload it, hand back the URL" flow for every blog image
// slot. Creating the input on demand keeps call sites free of hidden <input>
// JSX, refs, and the e.target.value='' reset dance.
//
// pickImage() resolves { url, width, height } on success, or null if the user
// cancelled or the upload failed (failures are reported here, once).
export default function useImageUpload() {
  const [busy, setBusy] = React.useState(false);
  const mounted = React.useRef(true);
  React.useEffect(() => () => { mounted.current = false; }, []);

  const pickImage = React.useCallback(() => new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    document.body.appendChild(input);

    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(value);
    };

    input.addEventListener('cancel', () => finish(null));
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) { finish(null); return; }
      setBusy(true);
      try {
        finish(await uploadBlogImage(file));
      } catch (err) {
        console.error('[blog] image upload failed:', err);
        window.alert('Image upload failed. Please try again.');
        finish(null);
      } finally {
        if (mounted.current) setBusy(false);
      }
    });

    input.click();
  }), []);

  return { busy, pickImage };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: build succeeds (the hook is unreferenced so far; CRA does not fail on unused modules).

- [ ] **Step 3: Commit**

```bash
git add src/components/clubpm/blog/useImageUpload.js
git commit -m "feat(blog): shared useImageUpload hook"
```

---

### Task 3: Replace button on the inline image node

**Files:**
- Modify: `src/components/clubpm/blog/BlogImage.jsx`

- [ ] **Step 1: Import the new modules**

At the top of `BlogImage.jsx`, alongside the existing imports:

```js
import { uploadBlogImage, suggestBlogAltText, proxyImageSrc } from '../../../api/clubPmClient';
import useImageUpload from './useImageUpload';
import { resolveDropTarget, replacedImageAttrs, galleryImagesWithReplacement } from '../../../lib/blogImageDrop';
```

(`resolveDropTarget` and `galleryImagesWithReplacement` are used in Task 7; importing them now keeps the import block edited once. If lint complains about unused imports during this task, finish Task 7 before running the build.)

- [ ] **Step 2: Swap the local file-picker for the hook**

In `ImageView`, delete `const fileRef = React.useRef(null);` and the whole `onPickFile` function, and put this in their place:

```js
  const { busy: uploading, pickImage } = useImageUpload();

  // Used both to fill an empty placeholder and to swap an existing picture.
  // replacedImageAttrs keeps align/width/caption and clears alt.
  const replaceImage = async () => {
    const upload = await pickImage();
    if (!upload) return;
    updateAttributes(replacedImageAttrs(node.attrs, upload));
  };
```

- [ ] **Step 3: Add the toolbar button**

In the `editable && src` toolbar block, after the "Reset size" button, append:

```jsx
          <span className="cpm-blog-tb-sep" />
          <button type="button" className="cpm-blog-tb-btn" title="Replace image" onClick={replaceImage} disabled={uploading}><i className="fas fa-arrows-rotate" aria-hidden="true" /></button>
```

- [ ] **Step 4: Point the placeholder at the same handler**

Replace the placeholder's button and hidden input with:

```jsx
          <button
            type="button"
            className="clubpm-btn-primary cpm-blog-img-placeholder-btn"
            onClick={replaceImage}
            disabled={uploading}
          >
            <i className="fas fa-arrow-up-from-bracket" aria-hidden="true" style={{ marginRight: 6 }} />
            {uploading ? 'Uploading…' : 'Upload image'}
          </button>
```

The `<input ref={fileRef} …>` line is deleted.

- [ ] **Step 5: Verify the build**

Run: `npm run build`
Expected: compiles. If it fails on the two imports reserved for Task 7, proceed to Task 7 and re-run.

- [ ] **Step 6: Commit**

```bash
git add src/components/clubpm/blog/BlogImage.jsx
git commit -m "feat(blog): replace an inline image in place"
```

---

### Task 4: Hero background upload / replace / remove

**Files:**
- Modify: `src/components/clubpm/blog/BlogHero.jsx`

- [ ] **Step 1: Import the hook**

```js
import useImageUpload from './useImageUpload';
```

- [ ] **Step 2: Wire it into `HeroView`**

Directly after `const style = bgImage ? … : undefined;`:

```js
  const { busy: uploading, pickImage } = useImageUpload();
  const pickBackground = async () => {
    const upload = await pickImage();
    if (upload) updateAttributes({ bgImage: upload.url });
  };
```

- [ ] **Step 3: Add the controls**

Replace the existing background URL input line inside `cpm-blog-hero-controls` with:

```jsx
              <span className="cpm-blog-img-src-row">
                <input placeholder="Background image URL" value={bgImage || ''} onChange={(e) => updateAttributes({ bgImage: e.target.value })} />
                <button type="button" className="clubpm-btn-secondary cpm-blog-img-src-btn" onClick={pickBackground} disabled={uploading}>
                  {uploading ? 'Uploading…' : (bgImage ? 'Replace' : 'Upload')}
                </button>
                {bgImage ? (
                  <button type="button" className="cpm-blog-tb-btn" title="Remove background image" onClick={() => updateAttributes({ bgImage: '' })}>
                    <i className="fas fa-xmark" aria-hidden="true" />
                  </button>
                ) : null}
              </span>
```

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: compiles.

- [ ] **Step 5: Commit**

```bash
git add src/components/clubpm/blog/BlogHero.jsx
git commit -m "feat(blog): upload or replace a hero background image"
```

---

### Task 5: Section background upload / replace / remove

**Files:**
- Modify: `src/components/clubpm/blog/BlogSectionSettings.jsx`

- [ ] **Step 1: Import the hook**

```js
import useImageUpload from './useImageUpload';
```

- [ ] **Step 2: Wire it in**

Immediately after `const [attrs, setAttrs] = React.useState(null);`:

```js
  const { busy: uploading, pickImage } = useImageUpload();
```

Hooks must run before the `if (!attrs) return null;` early return, so this line has to stay above it.

Then, after the `const bg = attrs.background || …;` line:

```js
  const pickBackground = async () => {
    const upload = await pickImage();
    if (upload) update({ background: { kind: 'image', value: upload.url } });
  };
```

- [ ] **Step 3: Add the controls**

Replace the `bg.kind === 'image'` block with:

```jsx
      {bg.kind === 'image' && (
        <div className="cpm-blog-secset-imgrow">
          <input
            className="cpm-blog-secset-input"
            placeholder="Image URL"
            value={bg.value || ''}
            onChange={(e) => update({ background: { kind: 'image', value: e.target.value } })}
          />
          <button type="button" className="clubpm-btn-secondary cpm-blog-img-src-btn" onClick={pickBackground} disabled={uploading}>
            {uploading ? 'Uploading…' : (bg.value ? 'Replace' : 'Upload')}
          </button>
          {bg.value ? (
            <button type="button" className="cpm-blog-tb-btn" title="Remove background image" onClick={() => update({ background: { kind: 'image', value: '' } })}>
              <i className="fas fa-xmark" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      )}
```

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: compiles.

- [ ] **Step 5: Commit**

```bash
git add src/components/clubpm/blog/BlogSectionSettings.jsx
git commit -m "feat(blog): upload or replace a section background image"
```

---

### Task 6: Gallery tile replace + `data-index`

**Files:**
- Modify: `src/components/clubpm/blog/BlogGallery.jsx`

- [ ] **Step 1: Import the hook and helper**

```js
import useImageUpload from './useImageUpload';
import { galleryImagesWithReplacement } from '../../../lib/blogImageDrop';
```

- [ ] **Step 2: Add the replace handler**

In `GalleryView`, after the existing `setField` definition:

```js
  const { busy: uploading, pickImage } = useImageUpload();
  const replaceAt = async (i) => {
    const upload = await pickImage();
    if (upload) updateAttributes({ images: galleryImagesWithReplacement(images, i, upload.url) });
  };
```

`addFiles` keeps using `uploadBlogImage` directly — it uploads a whole multi-file selection, which the single-file hook doesn't cover.

- [ ] **Step 3: Tag the slides and rows with their index**

The carousel slide becomes:

```jsx
            <figure key={`${im.src}-${i}`} className="cpm-blog-carousel-slide" data-index={i}>
```

The edit row becomes:

```jsx
            <div key={`edit-${im.src}-${i}`} className="cpm-blog-carousel-edit-row" data-index={i}>
```

Note: `data-index` on the slide is emitted by the React node view only. `renderHTML` (the published output) is deliberately left alone — drop targeting only matters in the editor.

- [ ] **Step 4: Add the per-row Replace button**

In the edit row, immediately before the "Move earlier" button:

```jsx
              <button type="button" className="cpm-blog-tb-btn" title="Replace image" onClick={() => replaceAt(i)} disabled={uploading || busy}><i className="fas fa-arrows-rotate" aria-hidden="true" /></button>
```

- [ ] **Step 5: Verify the build**

Run: `npm run build`
Expected: compiles.

- [ ] **Step 6: Commit**

```bash
git add src/components/clubpm/blog/BlogGallery.jsx
git commit -m "feat(blog): replace a gallery tile's image"
```

---

### Task 7: Drop-to-replace routing

**Files:**
- Modify: `src/components/clubpm/blog/BlogImage.jsx`

- [ ] **Step 1: Add the position lookup and replace routine**

In `BlogImage.jsx`, at module scope below the existing `uploadAndInsert` / `imageFilesFrom` helpers:

```js
// Map a node view's DOM element back to its document position. For the atom
// nodes we target (image / hero / gallery), posAtDOM(el, 0) lands just before
// the node, so nodeAfter is normally the hit; the ancestor and nodeBefore
// checks cover node views whose wrapper reports an inside position.
function findNodePos(view, el, typeName) {
  let pos;
  try { pos = view.posAtDOM(el, 0); } catch (err) { return null; }
  if (pos == null || pos < 0) return null;
  const $pos = view.state.doc.resolve(pos);
  if ($pos.nodeAfter?.type.name === typeName) return pos;
  for (let d = $pos.depth; d > 0; d -= 1) {
    if ($pos.node(d).type.name === typeName) return $pos.before(d);
  }
  if ($pos.nodeBefore?.type.name === typeName) return pos - $pos.nodeBefore.nodeSize;
  return null;
}

// Upload one file and point an existing image/hero/gallery node at it. The
// position is resolved *after* the upload so a concurrent edit can't leave us
// writing to a stale offset.
async function uploadAndReplace(editor, view, target, file) {
  let upload;
  try {
    upload = await uploadBlogImage(file);
  } catch (err) {
    console.error('[BlogImage] upload failed:', err);
    window.alert('Image upload failed. Please try again.');
    return;
  }
  const pos = findNodePos(view, target.el, target.kind);
  if (pos == null) return;
  const node = view.state.doc.nodeAt(pos);
  if (!node || node.type.name !== target.kind) return;

  let attrs;
  if (target.kind === 'image') attrs = replacedImageAttrs(node.attrs, upload);
  else if (target.kind === 'hero') attrs = { ...node.attrs, bgImage: upload.url };
  else attrs = { ...node.attrs, images: galleryImagesWithReplacement(node.attrs.images, target.index, upload.url) };

  editor.chain().command(({ tr }) => { tr.setNodeMarkup(pos, undefined, attrs); return true; }).run();
}
```

`target.kind` is `'image' | 'hero' | 'gallery'`, which are exactly the TipTap node names, so it doubles as the type name passed to `findNodePos`.

- [ ] **Step 2: Route drops through it**

Replace the plugin's `handleDrop` with:

```js
          handleDrop(view, event) {
            const files = imageFilesFrom(event.dataTransfer?.files);
            if (!files.length) return false;
            event.preventDefault();
            // Dropped onto an existing picture? Swap that one, using the first
            // file only. Anything else keeps the old insert-here behaviour.
            const target = resolveDropTarget(event.target);
            if (target) {
              uploadAndReplace(editor, view, target, files[0]);
              return true;
            }
            const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
            const pos = coords?.pos ?? view.state.selection.from;
            files.forEach((file) => uploadAndInsert(editor, file, pos));
            return true;
          },
```

`handlePaste` is unchanged — pasting has no cursor position over a specific picture, so it keeps inserting.

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: compiles with no unused-import warnings for `resolveDropTarget` / `galleryImagesWithReplacement`.

- [ ] **Step 4: Run the full test suite**

Run: `npx react-scripts test --watchAll=false`
Expected: PASS — `blogImageDrop`, `columnSpans`, `blogCarousel`, `collabFallback`.

- [ ] **Step 5: Commit**

```bash
git add src/components/clubpm/blog/BlogImage.jsx
git commit -m "feat(blog): drop a file on an image to replace it"
```

---

### Task 8: Styles for the new controls

**Files:**
- Modify: `public/clubpm-theme.css`

- [ ] **Step 1: Find the end of the blog editor section**

Run: `rg -n "cpm-blog-secset-input|cpm-blog-hero-controls" public/clubpm-theme.css`
Expected: line numbers for the existing blog editor rules — append the new block just after them so related rules stay together.

- [ ] **Step 2: Append the rules**

```css
/* --- Blog editor: replace-image controls --- */
.cpm-blog-secset-imgrow,
.cpm-blog-img-src-row {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
}
.cpm-blog-secset-imgrow .cpm-blog-secset-input,
.cpm-blog-img-src-row input { flex: 1 1 auto; min-width: 0; }
.cpm-blog-img-src-btn {
  flex: 0 0 auto;
  padding: 4px 10px;
  font-size: 0.78rem;
  white-space: nowrap;
}
.cpm-blog-img-src-btn[disabled] { opacity: 0.6; cursor: default; }
```

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: succeeds, including the `postbuild` CSS minify step.

- [ ] **Step 4: Commit**

```bash
git add public/clubpm-theme.css
git commit -m "style(blog): layout for image replace controls"
```

---

## Final verification

- [ ] `npx react-scripts test --watchAll=false` — all suites pass.
- [ ] `npm run build` — succeeds. `prebuild` re-runs `scripts/build-fa-subset.mjs`, which scans source for icon classes; confirm the new `fa-arrows-rotate` survives with `npm run check:icons`.
- [ ] Manual, in the editor (`npm start` → `/clubpm` → a blog post):
  1. Insert an image, set width/align/caption/alt, click **Replace** → the new picture renders at the same size and alignment, caption intact, alt empty with the warning showing.
  2. Drag a file onto that image → same result as (1).
  3. Drag a file onto a paragraph → a new image node is inserted at the drop point (regression check).
  4. Hero: upload a background with no URL typed; then Replace; then Remove.
  5. Section settings → Background → Image: upload, replace, remove.
  6. Gallery: replace the middle tile — ordering and the other tiles' captions are unaffected.
  7. Cancel the file dialog at each entry point → nothing changes.
