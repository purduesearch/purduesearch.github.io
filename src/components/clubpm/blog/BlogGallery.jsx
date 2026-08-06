import React from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import { uploadBlogImage } from '../../../api/clubPmClient';
import useImageUpload from './useImageUpload';
import { galleryImagesWithReplacement } from '../../../lib/blogImageDrop';
import { initBlogCarousels } from '../../../lib/blogCarousel';
import { useIsEditable } from './useIsEditable';

function GalleryView({ node, updateAttributes, editor }) {
  const images = Array.isArray(node.attrs.images) ? node.attrs.images : [];
  const [busy, setBusy] = React.useState(false);
  const fileRef = React.useRef(null);
  const rootRef = React.useRef(null);
  const editable = useIsEditable(editor);

  // Re-run the enhancer whenever the slide count changes so arrows and dots
  // stay wired to the current DOM.
  React.useEffect(() => {
    if (rootRef.current) {
      rootRef.current.querySelectorAll('[data-carousel]').forEach((el) => { delete el.dataset.carouselReady; });
      initBlogCarousels(rootRef.current);
    }
  }, [images.length]);

  const addFiles = async (list) => {
    const files = Array.from(list || []).filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    setBusy(true);
    try {
      const uploaded = [];
      for (const file of files) {
        try {
          const { url } = await uploadBlogImage(file);
          uploaded.push({ src: url, alt: '', caption: '' });
        } catch (err) {
          console.error('[BlogGallery] upload failed:', err);
        }
      }
      if (uploaded.length) updateAttributes({ images: [...images, ...uploaded] });
    } finally {
      setBusy(false);
    }
  };

  const removeAt = (i) => updateAttributes({ images: images.filter((_, idx) => idx !== i) });
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= images.length) return;
    const next = images.slice();
    [next[i], next[j]] = [next[j], next[i]];
    updateAttributes({ images: next });
  };
  const setField = (i, field, value) => {
    const next = images.slice();
    next[i] = { ...next[i], [field]: value };
    updateAttributes({ images: next });
  };

  // `addFiles` keeps using uploadBlogImage directly — it handles a whole
  // multi-file selection, which the single-file hook doesn't cover.
  const { busy: uploading, pickImage } = useImageUpload();
  const replaceAt = async (i) => {
    const upload = await pickImage();
    if (upload) updateAttributes({ images: galleryImagesWithReplacement(images, i, upload.url) });
  };

  return (
    <NodeViewWrapper className="cpm-blog-gallery-node" as="div" ref={rootRef}>
      {editable && (
        <div className="cpm-blog-gallery-bar" contentEditable={false}>
          <i className="fas fa-images" aria-hidden="true" />
          <span>Carousel · {images.length} image{images.length === 1 ? '' : 's'}</span>
          <button type="button" className="clubpm-btn-secondary" onClick={() => fileRef.current?.click()} disabled={busy}>
            {busy ? 'Uploading…' : 'Add images'}
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
        </div>
      )}

      <div className="cpm-blog-carousel" data-carousel>
        <div className="cpm-blog-carousel-track">
          {images.map((im, i) => (
            <figure key={`${im.src}-${i}`} className="cpm-blog-carousel-slide" data-index={i}>
              {im.src ? <img src={im.src} alt={im.alt || ''} /> : <div className="cpm-blog-carousel-empty-slide" />}
              {im.caption ? <figcaption className="cpm-blog-carousel-cap">{im.caption}</figcaption> : null}
            </figure>
          ))}
        </div>
        {images.length > 1 && (
          <>
            <button type="button" className="cpm-blog-carousel-nav cpm-blog-carousel-prev" aria-label="Previous image">&#8249;</button>
            <button type="button" className="cpm-blog-carousel-nav cpm-blog-carousel-next" aria-label="Next image">&#8250;</button>
          </>
        )}
        <div className="cpm-blog-carousel-dots">
          {images.map((im, i) => (
            <button key={`dot-${im.src}-${i}`} type="button" className="cpm-blog-carousel-dot" data-index={i} aria-label={`Go to image ${i + 1}`} />
          ))}
        </div>
      </div>

      {editable && (
        <div className="cpm-blog-carousel-edit" contentEditable={false}>
          {images.map((im, i) => (
            <div key={`edit-${im.src}-${i}`} className="cpm-blog-carousel-edit-row" data-index={i}>
              {im.src ? <img src={im.src} alt="" className="cpm-blog-carousel-edit-thumb" /> : <div className="cpm-blog-carousel-edit-thumb" />}
              <input
                className="cpm-blog-carousel-edit-input"
                placeholder="Caption (shown to readers)"
                value={im.caption || ''}
                onChange={(e) => setField(i, 'caption', e.target.value)}
              />
              <input
                className="cpm-blog-carousel-edit-input"
                placeholder="Alt text (screen readers)"
                value={im.alt || ''}
                onChange={(e) => setField(i, 'alt', e.target.value)}
              />
              <button type="button" className="cpm-blog-tb-btn" title="Replace image" onClick={() => replaceAt(i)} disabled={uploading || busy}><i className="fas fa-arrows-rotate" aria-hidden="true" /></button>
              <button type="button" className="cpm-blog-tb-btn" title="Move earlier" onClick={() => move(i, -1)}><i className="fas fa-chevron-up" aria-hidden="true" /></button>
              <button type="button" className="cpm-blog-tb-btn" title="Move later" onClick={() => move(i, 1)}><i className="fas fa-chevron-down" aria-hidden="true" /></button>
              <button type="button" className="cpm-blog-tb-btn" title="Remove" onClick={() => removeAt(i)}><i className="fas fa-trash" aria-hidden="true" /></button>
            </div>
          ))}
          {!images.length && <div className="cpm-blog-gallery-empty">No images yet — use “Add images”.</div>}
        </div>
      )}
    </NodeViewWrapper>
  );
}

export const BlogGallery = Node.create({
  name: 'gallery',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    // images: { src, alt, caption }[]
    return { images: { default: [] } };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="blog-gallery"]' }];
  },

  // Mirrors the `gallery` branch of backend/src/services/blogRender.ts.
  renderHTML({ node, HTMLAttributes }) {
    const images = (Array.isArray(node.attrs.images) ? node.attrs.images : [])
      .filter((im) => String(im.src || im.url || '').trim());
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'blog-gallery', class: 'cpm-blog-carousel', 'data-carousel': '' }),
      ['div', { class: 'cpm-blog-carousel-track' },
        ...images.map((im) => [
          'figure', { class: 'cpm-blog-carousel-slide' },
          ['img', { src: im.src || im.url || '', alt: im.alt || '', loading: 'lazy' }],
          ...(im.caption ? [['figcaption', { class: 'cpm-blog-carousel-cap' }, im.caption]] : []),
        ]),
      ],
      ['div', { class: 'cpm-blog-carousel-dots' },
        ...images.map((_, i) => ['button', { type: 'button', class: 'cpm-blog-carousel-dot', 'data-index': String(i), 'aria-label': `Go to image ${i + 1}` }]),
      ],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(GalleryView);
  },
});

export default BlogGallery;
