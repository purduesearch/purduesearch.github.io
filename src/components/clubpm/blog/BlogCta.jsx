import React from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';

function CtaView({ node, updateAttributes, editor }) {
  const { label, href, style, align } = node.attrs;
  const editable = editor.isEditable;
  return (
    <NodeViewWrapper as="div" className={`cpm-blog-cta cpm-blog-cta--${align || 'center'}`} contentEditable={false}>
      {editable ? (
        <div className="cpm-blog-cta-edit">
          <input placeholder="Button label" value={label || ''} onChange={(e) => updateAttributes({ label: e.target.value })} />
          <input placeholder="https://…" value={href || ''} onChange={(e) => updateAttributes({ href: e.target.value })} />
          <select value={style || 'solid'} onChange={(e) => updateAttributes({ style: e.target.value })}>
            <option value="solid">Solid</option><option value="outline">Outline</option>
          </select>
          <select value={align || 'center'} onChange={(e) => updateAttributes({ align: e.target.value })}>
            <option value="center">Center</option><option value="left">Left</option><option value="right">Right</option>
          </select>
        </div>
      ) : (
        <a className={`cpm-blog-cta-btn cpm-blog-cta-btn--${style || 'solid'}`} href={href || '#'}>{label || 'Learn more'}</a>
      )}
    </NodeViewWrapper>
  );
}

export const BlogCta = Node.create({
  name: 'ctaButton', group: 'block', atom: true, selectable: true, draggable: true,
  addAttributes() { return { label: { default: 'Learn more' }, href: { default: '' }, style: { default: 'solid' }, align: { default: 'center' } }; },
  parseHTML() { return [{ tag: 'div[data-type="blog-cta"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'blog-cta' })]; },
  addNodeView() { return ReactNodeViewRenderer(CtaView); },
});

export default BlogCta;
