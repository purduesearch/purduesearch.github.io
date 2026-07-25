import React from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import { Plugin } from '@tiptap/pm/state';
import { uploadBlogImage, suggestBlogAltText, proxyImageSrc } from '../../../api/clubPmClient';

// Upload the given File and insert an image node at `pos` (or the current
// selection when pos is null). Shows a lightweight console error on failure.
async function uploadAndInsert(editor, file, pos) {
  try {
    const { url, width, height } = await uploadBlogImage(file);
    const at = typeof pos === 'number' ? pos : editor.state.selection.from;
    editor
      .chain()
      .focus()
      .insertContentAt(at, {
        type: 'image',
        attrs: { src: url, naturalWidth: width, naturalHeight: height },
      })
      .run();
  } catch (err) {
    console.error('[BlogImage] upload failed:', err);
    window.alert('Image upload failed. Please try again.');
  }
}

function imageFilesFrom(list) {
  return Array.from(list || []).filter((f) => f.type.startsWith('image/'));
}

// Toolbar/file-picker entry point: upload each image file and insert at the
// current selection.
export function uploadImageFiles(editor, list) {
  imageFilesFrom(list).forEach((file) => uploadAndInsert(editor, file, null));
}

// React NodeView: image + alignment/width controls, caption + alt fields.
function ImageView({ node, updateAttributes, selected, editor }) {
  const { src, alt, align, width, caption, widthUnit } = node.attrs;
  const [suggesting, setSuggesting] = React.useState(false);
  const editable = editor.isEditable;
  const fileRef = React.useRef(null);

  // Fill an empty placeholder in place: upload the picked file and set src on
  // this node (rather than inserting a new one).
  const onPickFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const { url, width: w, height: h } = await uploadBlogImage(file);
      updateAttributes({ src: url, naturalWidth: w, naturalHeight: h });
    } catch (err) {
      console.error('[BlogImage] upload failed:', err);
      window.alert('Image upload failed. Please try again.');
    }
  };

  const setAlign = (a) => updateAttributes({ align: a });
  const unit = widthUnit || 'px';
  const resize = (dir) => {
    if (unit === '%') {
      const base = width || 50;
      updateAttributes({ width: Math.max(10, Math.min(100, Math.round(base + dir * 5))) });
    } else {
      const base = width || node.attrs.naturalWidth || 640;
      updateAttributes({ width: Math.max(120, Math.min(1600, Math.round(base + dir * 80))) });
    }
  };
  const toggleUnit = () => {
    // Switch unit and pick a sensible default so the image doesn't jump absurdly.
    if (unit === 'px') updateAttributes({ widthUnit: '%', width: 45 });
    else updateAttributes({ widthUnit: 'px', width: node.attrs.naturalWidth || 640 });
  };

  const suggestAlt = async () => {
    if (!src) return;
    setSuggesting(true);
    try {
      const { altText } = await suggestBlogAltText(src);
      if (altText) updateAttributes({ alt: altText });
    } catch (err) {
      console.error('[BlogImage] alt-text suggestion failed:', err);
    } finally {
      setSuggesting(false);
    }
  };

  return (
    <NodeViewWrapper
      className={`cpm-blog-figure cpm-blog-img--${align || 'center'}${selected ? ' is-selected' : ''}`}
      as="figure"
    >
      {editable && src && (
        <div className="cpm-blog-img-toolbar" contentEditable={false}>
          <button type="button" className={`cpm-blog-tb-btn${align === 'left' ? ' is-active' : ''}`} title="Align left" onClick={() => setAlign('left')}><i className="fas fa-align-left" aria-hidden="true" /></button>
          <button type="button" className={`cpm-blog-tb-btn${(align === 'center' || !align) ? ' is-active' : ''}`} title="Align center" onClick={() => setAlign('center')}><i className="fas fa-align-center" aria-hidden="true" /></button>
          <button type="button" className={`cpm-blog-tb-btn${align === 'right' ? ' is-active' : ''}`} title="Align right" onClick={() => setAlign('right')}><i className="fas fa-align-right" aria-hidden="true" /></button>
          <button type="button" className={`cpm-blog-tb-btn${align === 'full' ? ' is-active' : ''}`} title="Full width" onClick={() => setAlign('full')}><i className="fas fa-arrows-left-right" aria-hidden="true" /></button>
          <button type="button" className={`cpm-blog-tb-btn${align === 'wrap-left' ? ' is-active' : ''}`} title="Wrap text right (float left)" onClick={() => setAlign('wrap-left')}><i className="fas fa-indent" aria-hidden="true" /></button>
          <button type="button" className={`cpm-blog-tb-btn${align === 'wrap-right' ? ' is-active' : ''}`} title="Wrap text left (float right)" onClick={() => setAlign('wrap-right')}><i className="fas fa-outdent" aria-hidden="true" /></button>
          <span className="cpm-blog-tb-sep" />
          <button type="button" className="cpm-blog-tb-btn" title="Smaller" onClick={() => resize(-1)}><i className="fas fa-minus" aria-hidden="true" /></button>
          <button type="button" className="cpm-blog-tb-btn" title="Larger" onClick={() => resize(1)}><i className="fas fa-plus" aria-hidden="true" /></button>
          <button type="button" className="cpm-blog-tb-btn cpm-blog-tb-btn--unit" title="Toggle px / %" onClick={toggleUnit}>{unit}</button>
          <button type="button" className="cpm-blog-tb-btn" title="Reset size" onClick={() => updateAttributes({ width: null, widthUnit: 'px' })}><i className="fas fa-rotate-left" aria-hidden="true" /></button>
        </div>
      )}

      {src ? (
        <img
          src={proxyImageSrc(src)}
          alt={alt || ''}
          draggable={false}
          style={width ? { width: `${width}${widthUnit || 'px'}` } : undefined}
        />
      ) : editable ? (
        <div className="cpm-blog-img-placeholder" contentEditable={false}>
          <i className="fas fa-image cpm-blog-img-placeholder-icon" aria-hidden="true" />
          <span className="cpm-blog-img-placeholder-hint">{caption || alt || 'Image placeholder'}</span>
          <button
            type="button"
            className="clubpm-btn-primary cpm-blog-img-placeholder-btn"
            onClick={() => fileRef.current?.click()}
          >
            <i className="fas fa-arrow-up-from-bracket" aria-hidden="true" style={{ marginRight: 6 }} />
            Upload image
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickFile} />
        </div>
      ) : null}

      {editable ? (
        <div className="cpm-blog-img-meta" contentEditable={false}>
          <input
            className="cpm-blog-img-caption"
            placeholder="Add a caption…"
            value={caption || ''}
            onChange={(e) => updateAttributes({ caption: e.target.value })}
          />
          <div className="cpm-blog-img-alt-row">
            <input
              className={`cpm-blog-img-alt${!alt ? ' is-empty' : ''}`}
              placeholder="Alt text (describe the image)"
              value={alt || ''}
              onChange={(e) => updateAttributes({ alt: e.target.value })}
            />
            <button type="button" className="clubpm-btn-secondary cpm-blog-img-alt-suggest" onClick={suggestAlt} disabled={suggesting || !src}>
              {suggesting ? 'Suggesting…' : 'Suggest'}
            </button>
          </div>
          {!alt && (
            <span className="cpm-blog-img-alt-warn">
              <i className="fas fa-triangle-exclamation" aria-hidden="true" /> Add alt text for accessibility.
            </span>
          )}
        </div>
      ) : (
        caption ? <figcaption>{caption}</figcaption> : null
      )}
    </NodeViewWrapper>
  );
}

export const BlogImage = Node.create({
  name: 'image',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: '' },
      align: { default: 'center' },
      width: { default: null },
      widthUnit: { default: 'px' },
      caption: { default: '' },
      naturalWidth: { default: null, rendered: false },
      naturalHeight: { default: null, rendered: false },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'figure[data-type="blog-image"]',
        getAttrs: (el) => {
          const img = el.querySelector('img');
          const cap = el.querySelector('figcaption');
          return {
            src: img?.getAttribute('src') || null,
            alt: img?.getAttribute('alt') || '',
            caption: cap?.textContent || '',
          };
        },
      },
      { tag: 'img[src]', getAttrs: (img) => ({ src: img.getAttribute('src'), alt: img.getAttribute('alt') || '' }) },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { src, alt, align, width, caption, widthUnit } = node.attrs;
    const style = width ? `width:${width}${widthUnit || 'px'}` : undefined;
    return [
      'figure',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'blog-image',
        class: `cpm-blog-figure cpm-blog-img--${align || 'center'}`,
      }),
      ['img', { src, alt: alt || '', ...(style ? { style } : {}) }],
      ...(caption ? [['figcaption', {}, caption]] : []),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageView);
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        props: {
          handleDrop(view, event) {
            const files = imageFilesFrom(event.dataTransfer?.files);
            if (!files.length) return false;
            event.preventDefault();
            const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
            const pos = coords?.pos ?? view.state.selection.from;
            files.forEach((file) => uploadAndInsert(editor, file, pos));
            return true;
          },
          handlePaste(view, event) {
            const files = imageFilesFrom(event.clipboardData?.files);
            if (!files.length) return false;
            event.preventDefault();
            files.forEach((file) => uploadAndInsert(editor, file, null));
            return true;
          },
        },
      }),
    ];
  },
});

export default BlogImage;
