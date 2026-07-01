import React from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from '@tiptap/react';

const VARIANTS = [
  { value: 'info', label: 'Info', icon: 'fa-circle-info' },
  { value: 'warning', label: 'Warning', icon: 'fa-triangle-exclamation' },
  { value: 'success', label: 'Success', icon: 'fa-circle-check' },
  { value: 'tip', label: 'Tip', icon: 'fa-lightbulb' },
];

function CalloutView({ node, updateAttributes, editor }) {
  const variant = node.attrs.variant || 'info';
  const editable = editor.isEditable;
  const active = VARIANTS.find((v) => v.value === variant) || VARIANTS[0];

  return (
    <NodeViewWrapper className={`cpm-blog-callout-node cpm-blog-callout--${variant}`} as="div">
      {editable && (
        <div className="cpm-blog-callout-bar" contentEditable={false}>
          <i className={`fas ${active.icon}`} aria-hidden="true" />
          <div className="cpm-blog-callout-variants">
            {VARIANTS.map((v) => (
              <button
                key={v.value}
                type="button"
                className={`cpm-blog-callout-variant-btn${v.value === variant ? ' is-active' : ''}`}
                title={v.label}
                onClick={() => updateAttributes({ variant: v.value })}
              >
                <i className={`fas ${v.icon}`} aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
      )}
      {!editable && <i className={`fas ${active.icon} cpm-blog-callout-icon`} aria-hidden="true" />}
      <NodeViewContent className="cpm-blog-callout-content" />
    </NodeViewWrapper>
  );
}

export const BlogCallout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,
  draggable: true,

  addAttributes() {
    return {
      variant: {
        default: 'info',
        parseHTML: (el) => el.getAttribute('data-variant') || 'info',
        renderHTML: (attrs) => ({ 'data-variant': attrs.variant }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="blog-callout"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'blog-callout', class: 'cpm-blog-callout' }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutView);
  },
});

export default BlogCallout;
