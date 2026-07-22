import React from 'react';
import { SECTION_PRESETS } from './sectionNodes';

export default function BlogSectionLibrary({ editor, onClose }) {
  if (!editor) return null;
  const insert = (preset) => {
    editor.chain().focus().insertContent(preset.build()).run();
    onClose();
  };
  return (
    <div className="cpm-blog-seclib" role="dialog" aria-label="Add section">
      <div className="cpm-blog-seclib-head">
        <span>Add a section</span>
        <button type="button" className="cpm-blog-tb-btn" onClick={onClose} aria-label="Close"><i className="fas fa-xmark" /></button>
      </div>
      <div className="cpm-blog-seclib-grid">
        {SECTION_PRESETS.map((p) => (
          <button key={p.id} type="button" className="cpm-blog-seclib-item" onClick={() => insert(p)}>
            <i className={`fas ${p.icon}`} aria-hidden="true" />
            <span>{p.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
