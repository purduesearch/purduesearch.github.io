import React from 'react';
import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import { defaultSpans, resizePair, spansAfterAdd, spansAfterRemove } from '../../../lib/columnSpans';
import { useIsEditable } from './useIsEditable';

function SectionView({ node, editor, getPos, selected }) {
  const { layout, background, padding, width, theme } = node.attrs;
  const editable = useIsEditable(editor);
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

  // Column children of this section, with their current or default spans.
  const columnCount = (() => {
    let n = 0;
    node.forEach((child) => { if (child.type.name === 'column') n += 1; });
    return n;
  })();

  const currentSpans = (() => {
    if (!columnCount) return [];
    const explicit = [];
    node.forEach((child) => { if (child.type.name === 'column') explicit.push(child.attrs.span); });
    return explicit.every((s) => Number.isInteger(s)) ? explicit : defaultSpans(columnCount);
  })();

  // Write a full set of spans onto the section's column children in one
  // transaction, so collaborators see a single atomic change.
  const applySpans = (spans) => {
    if (typeof getPos !== 'function') return;
    const base = getPos();
    editor.chain().focus().command(({ tr }) => {
      let offset = base + 1;
      let i = 0;
      node.forEach((child) => {
        if (child.type.name === 'column') {
          tr.setNodeMarkup(tr.mapping.map(offset), undefined, { ...child.attrs, span: spans[i] ?? null });
          i += 1;
        }
        offset += child.nodeSize;
      });
      return true;
    }).run();
  };

  const nudge = (index, delta) => applySpans(resizePair(currentSpans, index, delta));

  const addColumn = () => {
    if (typeof getPos !== 'function' || columnCount >= 4) return;
    const pos = getPos();
    const spans = spansAfterAdd(currentSpans.length ? currentSpans : defaultSpans(1));
    editor.chain().focus()
      .insertContentAt(pos + node.nodeSize - 1, { type: 'column', content: [{ type: 'paragraph' }] })
      .run();
    // Re-read after insertion so the new child is included.
    setTimeout(() => applySpans(spans), 0);
  };

  const removeColumn = () => {
    if (columnCount <= 1) return;
    const spans = spansAfterRemove(currentSpans, currentSpans.length - 1);
    if (typeof getPos !== 'function') return;
    const base = getPos();
    let offset = base + 1;
    let lastColumnStart = null;
    let lastColumnSize = 0;
    node.forEach((child) => {
      if (child.type.name === 'column') { lastColumnStart = offset; lastColumnSize = child.nodeSize; }
      offset += child.nodeSize;
    });
    if (lastColumnStart == null) return;
    editor.chain().focus().deleteRange({ from: lastColumnStart, to: lastColumnStart + lastColumnSize }).run();
    setTimeout(() => applySpans(spans), 0);
  };

  return (
    <NodeViewWrapper as="section" className={cls} style={bgStyle}>
      {editable && (
        <>
          <div className="cpm-blog-section-grip" contentEditable={false} data-drag-handle title="Drag to reorder this section">
            <i className="fas fa-grip-vertical" aria-hidden="true" />
          </div>
          <div className="cpm-blog-section-toolbar" contentEditable={false}>
            <button type="button" title="Move up" onClick={() => move(-1)}><i className="fas fa-arrow-up" /></button>
            <button type="button" title="Move down" onClick={() => move(1)}><i className="fas fa-arrow-down" /></button>
            {columnCount > 0 && (
              <>
                <button type="button" title="Add column" onClick={addColumn} disabled={columnCount >= 4}><i className="fas fa-table-columns" /></button>
                <button type="button" title="Remove last column" onClick={removeColumn} disabled={columnCount <= 1}><i className="fas fa-minus" /></button>
              </>
            )}
            <button type="button" title="Duplicate" onClick={duplicate}><i className="fas fa-clone" /></button>
            <button type="button" title="Style" onClick={openSettings}><i className="fas fa-palette" /></button>
            <button type="button" title="Delete" onClick={remove}><i className="fas fa-trash" /></button>
          </div>
          {columnCount > 1 && (
            <div className="cpm-blog-section-gutters" contentEditable={false}>
              {currentSpans.slice(0, -1).map((_, i) => (
                <span key={`gutter-${i}`} className="cpm-blog-section-gutter">
                  <button type="button" title="Narrow the left column" onClick={() => nudge(i, -1)}>‹</button>
                  <span className="cpm-blog-section-gutter-read">{currentSpans[i]} / {currentSpans[i + 1]}</span>
                  <button type="button" title="Widen the left column" onClick={() => nudge(i, 1)}>›</button>
                </span>
              ))}
            </div>
          )}
        </>
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
  draggable: true,
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
