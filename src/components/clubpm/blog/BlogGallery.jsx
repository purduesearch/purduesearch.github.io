import React from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import { uploadBlogImage } from '../../../api/clubPmClient';

function GalleryView({ node, updateAttributes, editor }) {
  const images = Array.isArray(node.attrs.images) ? node.attrs.images : [];
  const [busy, setBusy] = React.useState(false);
  const fileRef = React.useRef(null);
  const editable = editor.isEditable;

  const addFiles = async (list) => {
    const files = Array.from(list || []).filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    setBusy(true);
    try {
      const uploaded = [];
      for (const file of files) {
        try {
          const { url } = await uploadBlogImage(file);
          uploaded.push({ src: url, alt: '' });
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
  const setAlt = (i, alt) => {
    const next = images.slice();
    next[i] = { ...next[i], alt };
    updateAttributes({ images: next });
  };

  return (
    <NodeViewWrapper className="cpm-blog-gallery-node" as="div">
      {editable && (
        <div className="cpm-blog-gallery-bar" contentEditable={false}>
          <i className="fas fa-images" aria-hidden="true" />
          <span>Gallery · {images.length} image{images.length === 1 ? '' : 's'}</span>
          <button type="button" className="clubpm-btn-secondary" onClick={() => fileRef.current?.click()} disabled={busy}>
            {busy ? 'Uploading…' : 'Add images'}
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
        </div>
      )}
      <div className="cpm-blog-gallery">
        {images.map((im, i) => (
          <figure key={`${im.src}-${i}`} className="cpm-blog-gallery-item">
            <img src={im.src} alt={im.alt || ''} />
            {editable && (
              <div className="cpm-blog-gallery-item-ctl" contentEditable={false}>
                <button type="button" className="cpm-blog-tb-btn" title="Move left" onClick={() => move(i, -1)}><i className="fas fa-chevron-left" aria-hidden="true" /></button>
                <button type="button" className="cpm-blog-tb-btn" title="Move right" onClick={() => move(i, 1)}><i className="fas fa-chevron-right" aria-hidden="true" /></button>
                <button type="button" className="cpm-blog-tb-btn" title="Remove" onClick={() => removeAt(i)}><i className="fas fa-trash" aria-hidden="true" /></button>
                <input className="cpm-blog-gallery-alt" placeholder="Alt" value={im.alt || ''} onChange={(e) => setAlt(i, e.target.value)} />
              </div>
            )}
          </figure>
        ))}
        {editable && !images.length && <div className="cpm-blog-gallery-empty">No images yet — use “Add images”.</div>}
      </div>
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
    return { images: { default: [] } };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="blog-gallery"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const images = Array.isArray(node.attrs.images) ? node.attrs.images : [];
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'blog-gallery', class: 'cpm-blog-gallery' }),
      ...images.map((im) => ['img', { src: im.src || im.url || '', alt: im.alt || '' }]),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(GalleryView);
  },
});

export default BlogGallery;
