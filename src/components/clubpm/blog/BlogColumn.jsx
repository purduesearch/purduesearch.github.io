import { Node } from '@tiptap/core';
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
  addNodeView() { return ReactNodeViewRenderer(ColumnView); },
});

export default BlogColumn;
