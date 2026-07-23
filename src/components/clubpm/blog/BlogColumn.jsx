import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from '@tiptap/react';

function ColumnView() {
  return (
    <NodeViewWrapper as="div" className="cpm-blog-col">
      <NodeViewContent className="cpm-blog-col-content" />
    </NodeViewWrapper>
  );
}

export const BlogColumn = Node.create({
  name: 'column',
  group: 'block',
  content: 'block+',
  parseHTML() { return [{ tag: 'div[data-type="blog-column"]' }]; },
  // A content hole (0) is required so HTML serialization (preview / copy) has a
  // toDOM; without renderHTML the ProseMirror serializer throws on `column`.
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'blog-column', class: 'cpm-blog-col' }), 0];
  },
  addNodeView() { return ReactNodeViewRenderer(ColumnView); },
});

export default BlogColumn;
