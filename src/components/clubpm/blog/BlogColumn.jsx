import { Node, mergeAttributes } from '@tiptap/core';

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
  // Deliberately NO addNodeView(): a React node view would wrap this div in
  // TipTap's own `.node-column` host element, which then — not `.cpm-blog-col` —
  // becomes the grid item inside `.cpm-blog-section-inner`. The span written by
  // the section's gutter controls would land on a non-grid-item and do nothing.
  // Rendering straight from renderHTML keeps `.cpm-blog-col` as the real DOM
  // node, carrying its `grid-column:span N` as an actual grid child.
  // A content hole (0) is required so HTML serialization (preview / copy) has a
  // toDOM; without renderHTML the ProseMirror serializer throws on `column`.
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'blog-column', class: 'cpm-blog-col' }), 0];
  },
});

export default BlogColumn;
