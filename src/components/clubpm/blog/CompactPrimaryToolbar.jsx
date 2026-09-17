import React from 'react';

/**
 * The phone's always-visible formatting row.
 *
 * Deliberately short: bold / italic / link are what people reach for mid
 * sentence, Add Section is the structural action this editor is built around,
 * and undo/redo are the recovery path. Everything else is one tap away behind
 * "More formatting", which opens the full toolbar rather than a reduced copy.
 */
export default function CompactPrimaryToolbar({ editor, onAddSection, onOpenMore, inert }) {
  if (!editor) return null;
  const run = (fn) => (e) => { e.preventDefault(); fn(); };

  return (
    <div
      className="cpm-blog-toolbar pm-m-blog-toolbar"
      data-tour-id="blog.editor.toolbar"
      role="toolbar"
      aria-label="Formatting"
      inert={inert || undefined}
    >
      <button
        type="button"
        className={`cpm-blog-tb-btn${editor.isActive('bold') ? ' is-active' : ''}`}
        aria-pressed={editor.isActive('bold')}
        aria-label="Bold"
        onMouseDown={(e) => e.preventDefault()}
        onClick={run(() => editor.chain().focus().toggleBold().run())}
      >
        <i className="fas fa-bold" aria-hidden="true" />
      </button>
      <button
        type="button"
        className={`cpm-blog-tb-btn${editor.isActive('italic') ? ' is-active' : ''}`}
        aria-pressed={editor.isActive('italic')}
        aria-label="Italic"
        onMouseDown={(e) => e.preventDefault()}
        onClick={run(() => editor.chain().focus().toggleItalic().run())}
      >
        <i className="fas fa-italic" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="cpm-blog-tb-btn"
        aria-label="Undo"
        disabled={!editor.can().undo()}
        onMouseDown={(e) => e.preventDefault()}
        onClick={run(() => editor.chain().focus().undo().run())}
      >
        <i className="fas fa-rotate-left" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="cpm-blog-tb-btn"
        aria-label="Redo"
        disabled={!editor.can().redo()}
        onMouseDown={(e) => e.preventDefault()}
        onClick={run(() => editor.chain().focus().redo().run())}
      >
        <i className="fas fa-rotate-right" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="cpm-blog-add-section-btn cpm-blog-tb-btn--pinned"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onAddSection}
      >
        <i className="fas fa-plus" aria-hidden="true" />
        <span>Section</span>
      </button>
      <button
        type="button"
        className="pm-m-btn"
        data-m-opener="blog-toolbar"
        aria-haspopup="dialog"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onOpenMore}
      >
        <i className="fas fa-ellipsis" aria-hidden="true" /> More formatting
      </button>
    </div>
  );
}
