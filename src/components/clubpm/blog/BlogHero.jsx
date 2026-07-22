import React from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';

function HeroView({ node, updateAttributes, editor }) {
  const { heading, subheading, bgImage, align, overlay } = node.attrs;
  const editable = editor.isEditable;
  const style = bgImage ? { backgroundImage: `url(${bgImage})` } : undefined;
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
              <input placeholder="Background image URL" value={bgImage || ''} onChange={(e) => updateAttributes({ bgImage: e.target.value })} />
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
  renderHTML({ HTMLAttributes }) { return ['header', mergeAttributes(HTMLAttributes, { 'data-type': 'blog-hero' })]; },
  addNodeView() { return ReactNodeViewRenderer(HeroView); },
});

export default BlogHero;
