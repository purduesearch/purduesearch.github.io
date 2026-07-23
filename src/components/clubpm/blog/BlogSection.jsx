import React from 'react';
import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from '@tiptap/react';

function SectionView({ node, editor, getPos, selected }) {
  const { layout, background, padding, width, theme } = node.attrs;
  const editable = editor.isEditable;
  const bgStyle = background?.kind === 'color' && background.value ? { backgroundColor: background.value }
    : background?.kind === 'image' && background.value ? { backgroundImage: `url(${background.value})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : undefined;
  const cls = [
    'cpm-blog-section', `cpm-blog-section--${layout || 'single'}`, `cpm-blog-section--pad-${padding || 'm'}`,
    `cpm-blog-section--${width === 'fullBleed' ? 'full' : 'contained'}`,
    theme && theme !== 'inherit' ? `cpm-blog-section--${theme}` : '', selected ? 'is-selected' : '',
  ].filter(Boolean).join(' ');

  const move = (dir) => {
    if (typeof getPos !== 'function') return;
    const pos = getPos();
    editor.chain().focus().command(({ tr, state }) => {
      const $pos = state.doc.resolve(pos);
      const index = $pos.index();
      const parent = $pos.parent;
      const target = index + dir;
      if (target < 0 || target >= parent.childCount) return false;
      const cur = parent.child(index);
      const other = parent.child(target);
      const from = dir < 0 ? pos - other.nodeSize : pos;
      tr.delete(pos, pos + cur.nodeSize);
      tr.insert(dir < 0 ? from : from + other.nodeSize, cur);
      return true;
    }).run();
  };
  const duplicate = () => {
    if (typeof getPos !== 'function') return;
    const pos = getPos();
    editor.chain().focus().insertContentAt(pos + node.nodeSize, node.toJSON()).run();
  };
  const remove = () => {
    if (typeof getPos !== 'function') return;
    const pos = getPos();
    editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run();
  };
  const openSettings = () => {
    window.dispatchEvent(new CustomEvent('blog-section-settings', { detail: { pos: getPos?.() } }));
  };

  return (
    <NodeViewWrapper as="section" className={cls} style={bgStyle}>
      {editable && (
        <div className="cpm-blog-section-toolbar" contentEditable={false}>
          <button type="button" title="Move up" onClick={() => move(-1)}><i className="fas fa-arrow-up" /></button>
          <button type="button" title="Move down" onClick={() => move(1)}><i className="fas fa-arrow-down" /></button>
          <button type="button" title="Duplicate" onClick={duplicate}><i className="fas fa-clone" /></button>
          <button type="button" title="Style" onClick={openSettings}><i className="fas fa-palette" /></button>
          <button type="button" title="Delete" onClick={remove}><i className="fas fa-trash" /></button>
        </div>
      )}
      <NodeViewContent className="cpm-blog-section-inner" />
    </NodeViewWrapper>
  );
}

export const BlogSection = Node.create({
  name: 'section',
  group: 'block',
  content: '(column | block)+',
  defining: true,
  addAttributes() {
    return {
      layout: { default: 'single' },
      background: { default: { kind: 'none', value: '' } },
      padding: { default: 'm' },
      width: { default: 'contained' },
      theme: { default: 'inherit' },
    };
  },
  parseHTML() { return [{ tag: 'section[data-type="blog-section"]' }]; },
  // Mirror the server renderer (blogRender.ts) so the editor's Preview (getHTML)
  // matches the published page: layout/padding/width/theme classes + the
  // .cpm-blog-section-inner wrapper that the grid/padding CSS targets.
  renderHTML({ node }) {
    const layout = node.attrs.layout || 'single';
    const pad = node.attrs.padding || 'm';
    const width = node.attrs.width === 'fullBleed' ? 'full' : 'contained';
    const theme = node.attrs.theme || 'inherit';
    const bg = node.attrs.background || { kind: 'none', value: '' };
    const cls = [
      'cpm-blog-section',
      `cpm-blog-section--${layout}`,
      `cpm-blog-section--pad-${pad}`,
      `cpm-blog-section--${width}`,
      theme !== 'inherit' ? `cpm-blog-section--${theme}` : '',
    ].filter(Boolean).join(' ');
    const attrs = { 'data-type': 'blog-section', class: cls };
    if (bg.kind === 'color' && bg.value) attrs.style = `background-color:${bg.value}`;
    else if (bg.kind === 'image' && bg.value) attrs.style = `background-image:url(${bg.value});background-size:cover;background-position:center`;
    return ['section', attrs, ['div', { class: 'cpm-blog-section-inner' }, 0]];
  },
  addNodeView() { return ReactNodeViewRenderer(SectionView); },
});

export default BlogSection;
