import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from '@tiptap/react';

function ColumnView({ node }) {
  const span = node.attrs.span;
  const style = Number.isInteger(span) && span >= 1 && span <= 12
    ? { gridColumn: `span ${span}` }
    : undefined;
  return (
    <NodeViewWrapper as="div" className="cpm-blog-col" style={style}>
      <NodeViewContent className="cpm-blog-col-content" />
    </NodeViewWrapper>
  );
}

export const BlogColumn = Node.create({
  name: 'column',
  group: 'block',
  content: 'block+',

  addAttributes() {
    // 12-column grid span; null = equal share of the section's tracks.
    // Mirrored in backend/src/collab/blogSchema.ts and rendered by
    // the `column` branch of backend/src/services/blogRender.ts.
    return {
      span: {
        default: null,
        parseHTML: (el) => {
          const n = Number(el.getAttribute('data-span'));
          return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null;
        },
        renderHTML: (attrs) => {
          const n = attrs.span;
          if (!Number.isInteger(n) || n < 1 || n > 12) return {};
          return { 'data-span': String(n), style: `grid-column:span ${n}` };
        },
      },
    };
  },

  parseHTML() { return [{ tag: 'div[data-type="blog-column"]' }]; },
  // A content hole (0) is required so HTML serialization (preview / copy) has a
  // toDOM; without renderHTML the ProseMirror serializer throws on `column`.
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'blog-column', class: 'cpm-blog-col' }), 0];
  },
  addNodeView() { return ReactNodeViewRenderer(ColumnView); },
});

export default BlogColumn;
