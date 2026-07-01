import React from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';

// Mirrors backend/src/services/blogRender.ts slugify() + collectHeadings()
// so preview anchor ids match the server-rendered page exactly.
function slugify(input) {
  return (
    String(input || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'post'
  );
}

function extractText(node) {
  let out = '';
  if (node.text) out += node.text;
  if (node.content) {
    for (const child of node.content) out += ' ' + extractText(child);
  }
  return out;
}

function collectHeadings(docJson) {
  const headings = [];
  const seen = new Map();
  const walk = (node) => {
    if (node.type === 'heading') {
      const text = extractText(node).trim();
      let id = slugify(text);
      const n = seen.get(id) ?? 0;
      seen.set(id, n + 1);
      if (n > 0) id = `${id}-${n}`;
      headings.push({ level: Number(node.attrs?.level ?? 1), text, id });
    }
    (node.content || []).forEach(walk);
  };
  (docJson.content || []).forEach(walk);
  return headings;
}

function TocView({ editor }) {
  const [headings, setHeadings] = React.useState(() => collectHeadings(editor.getJSON()));

  React.useEffect(() => {
    const recompute = () => setHeadings(collectHeadings(editor.getJSON()));
    recompute();
    editor.on('update', recompute);
    return () => editor.off('update', recompute);
  }, [editor]);

  return (
    <NodeViewWrapper className="cpm-blog-toc-node" as="div" contentEditable={false}>
      <div className="cpm-blog-toc-header">
        <i className="fas fa-bars-staggered" aria-hidden="true" />
        <span>Table of Contents</span>
      </div>
      {headings.length ? (
        <nav className="cpm-blog-toc-nav">
          <ul className="cpm-blog-toc-list">
            {headings.map((h, i) => (
              <li key={`${h.id}-${i}`} className={`cpm-blog-toc-item cpm-blog-toc-level-${h.level}`}>
                <a href={`#${h.id}`} onClick={(e) => e.preventDefault()}>{h.text || 'Untitled heading'}</a>
              </li>
            ))}
          </ul>
        </nav>
      ) : (
        <div className="cpm-blog-toc-empty">Add headings to populate the table of contents.</div>
      )}
    </NodeViewWrapper>
  );
}

export const BlogToc = Node.create({
  name: 'tableOfContents',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  parseHTML() {
    return [{ tag: 'div[data-type="blog-toc"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'blog-toc' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TocView);
  },
});

export default BlogToc;
