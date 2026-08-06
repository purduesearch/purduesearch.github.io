import React from 'react';
import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import useImageUpload from './useImageUpload';
import { useIsEditable } from './useIsEditable';

function HeroView({ node, updateAttributes, editor }) {
  const { heading, subheading, bgImage, align, overlay } = node.attrs;
  const editable = useIsEditable(editor);
  const style = bgImage ? { backgroundImage: `url(${bgImage})` } : undefined;
  const { busy: uploading, pickImage } = useImageUpload();
  const pickBackground = async () => {
    const upload = await pickImage();
    if (upload) updateAttributes({ bgImage: upload.url });
  };
  return (
    <NodeViewWrapper as="header" className={`cpm-blog-hero cpm-blog-hero--${align || 'center'}${overlay ? ' cpm-blog-hero--overlay' : ''}`} style={style}>
      <div className="cpm-blog-hero-inner" contentEditable={false}>
        {editable ? (
          <>
            <input className="cpm-blog-hero-h" value={heading || ''} placeholder="Hero heading"
              onChange={(e) => updateAttributes({ heading: e.target.value })} />
            <input className="cpm-blog-hero-s" value={subheading || ''} placeholder="Subheading"
              onChange={(e) => updateAttributes({ subheading: e.target.value })} />
            <div className="cpm-blog-hero-controls">
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
              <select value={align || 'center'} onChange={(e) => updateAttributes({ align: e.target.value })}>
                <option value="center">Center</option><option value="left">Left</option>
              </select>
              <label><input type="checkbox" checked={!!overlay} onChange={(e) => updateAttributes({ overlay: e.target.checked })} /> Overlay</label>
            </div>
          </>
        ) : (
          <>{heading && <h1>{heading}</h1>}{subheading && <p>{subheading}</p>}</>
        )}
      </div>
    </NodeViewWrapper>
  );
}

export const BlogHero = Node.create({
  name: 'hero', group: 'block', atom: true, selectable: true, draggable: true,
  addAttributes() {
    return { heading: { default: '' }, subheading: { default: '' }, bgImage: { default: '' }, align: { default: 'center' }, overlay: { default: false } };
  },
  parseHTML() { return [{ tag: 'header[data-type="blog-hero"]' }]; },
  renderHTML({ node }) {
    const { heading, subheading, align, overlay, bgImage } = node.attrs;
    const cls = `cpm-blog-hero cpm-blog-hero--${align || 'center'}${overlay ? ' cpm-blog-hero--overlay' : ''}`;
    const attrs = { 'data-type': 'blog-hero', class: cls };
    if (bgImage) attrs.style = `background-image:url(${bgImage})`;
    const inner = [];
    if (heading) inner.push(['h1', {}, heading]);
    if (subheading) inner.push(['p', {}, subheading]);
    return ['header', attrs, ['div', { class: 'cpm-blog-hero-inner' }, ...inner]];
  },
  addNodeView() { return ReactNodeViewRenderer(HeroView); },
});

export default BlogHero;
