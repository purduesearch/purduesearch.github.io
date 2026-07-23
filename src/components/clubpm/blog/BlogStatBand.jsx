import React from 'react';
import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';

function StatBandView({ node, updateAttributes, editor }) {
  const stats = Array.isArray(node.attrs.stats) ? node.attrs.stats : [];
  const editable = editor.isEditable;
  const setStat = (i, patch) => updateAttributes({ stats: stats.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const add = () => updateAttributes({ stats: [...stats, { label: 'LABEL', value: '0' }] });
  const remove = (i) => updateAttributes({ stats: stats.filter((_, j) => j !== i) });
  return (
    <NodeViewWrapper as="div" className="cpm-blog-statband" contentEditable={false}>
      {stats.map((s, i) => (
        <div key={i} className="cpm-blog-stat">
          {editable ? (
            <>
              <input className="cpm-blog-stat-value" value={s.value || ''} onChange={(e) => setStat(i, { value: e.target.value })} />
              <input className="cpm-blog-stat-label" value={s.label || ''} onChange={(e) => setStat(i, { label: e.target.value })} />
              <button type="button" className="cpm-blog-stat-x" onClick={() => remove(i)} title="Remove"><i className="fas fa-xmark" /></button>
            </>
          ) : (
            <><div className="cpm-blog-stat-value">{s.value}</div><div className="cpm-blog-stat-label">{s.label}</div></>
          )}
        </div>
      ))}
      {editable && <button type="button" className="cpm-blog-stat-add" onClick={add} title="Add stat"><i className="fas fa-plus" /></button>}
    </NodeViewWrapper>
  );
}

export const BlogStatBand = Node.create({
  name: 'statBand', group: 'block', atom: true, selectable: true, draggable: true,
  addAttributes() { return { stats: { default: [] } }; },
  parseHTML() { return [{ tag: 'div[data-type="blog-statband"]' }]; },
  renderHTML({ node }) {
    const stats = Array.isArray(node.attrs.stats) ? node.attrs.stats : [];
    const tiles = stats.map((s) => ['div', { class: 'cpm-blog-stat' },
      ['div', { class: 'cpm-blog-stat-value' }, String(s?.value ?? '')],
      ['div', { class: 'cpm-blog-stat-label' }, String(s?.label ?? '')],
    ]);
    return ['div', { 'data-type': 'blog-statband', class: 'cpm-blog-statband' }, ...tiles];
  },
  addNodeView() { return ReactNodeViewRenderer(StatBandView); },
});

export default BlogStatBand;
