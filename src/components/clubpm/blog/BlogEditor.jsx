import React, { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import CharacterCount from '@tiptap/extension-character-count';
import Placeholder from '@tiptap/extension-placeholder';
import { TableKit } from '@tiptap/extension-table';
import { SearchAndReplace } from '@sereneinserenade/tiptap-search-and-replace';
import BlogImage, { uploadImageFiles } from './BlogImage';
import BlogEmbed, { buildEmbed } from './BlogEmbed';
import BlogGallery from './BlogGallery';

// Shared editor extension set. Keep in sync with the backend renderer
// (backend/src/services/blogRender.ts) whenever a node type is added.
export function blogExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      link: { openOnClick: false, autolink: true, linkOnPaste: true },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    BlogImage,
    BlogEmbed,
    BlogGallery,
    CharacterCount,
    Placeholder.configure({ placeholder: 'Start writing your post…' }),
    TableKit.configure({ table: { resizable: true } }),
    SearchAndReplace.configure({ disableRegex: true }),
  ];
}

function Btn({ active, disabled, onClick, title, icon, label }) {
  return (
    <button
      type="button"
      className={`cpm-blog-tb-btn${active ? ' is-active' : ''}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={!!active}
    >
      {icon ? <i className={`fas ${icon}`} aria-hidden="true" /> : label}
    </button>
  );
}

function setLink(editor) {
  const prev = editor.getAttributes('link').href ?? '';
  const url = window.prompt('Link URL (leave empty to remove):', prev);
  if (url === null) return;
  if (url === '') {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    return;
  }
  editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
}

function Toolbar({ editor, onToggleFind }) {
  const fileRef = React.useRef(null);
  if (!editor) return null;
  const heading = [1, 2, 3, 4, 5, 6].find((l) => editor.isActive('heading', { level: l })) ?? '';
  const inTable = editor.isActive('table');
  const pickImage = (e) => {
    if (e.target.files?.length) uploadImageFiles(editor, e.target.files);
    e.target.value = '';
  };
  const insertEmbed = () => {
    const url = window.prompt('Paste a YouTube, Vimeo, X, Instagram, or CodePen URL:');
    if (url === null) return;
    const { provider, html } = buildEmbed(url);
    editor.chain().focus().insertContent({ type: 'embed', attrs: { url: url.trim(), provider, html } }).run();
  };
  const insertGallery = () => {
    editor.chain().focus().insertContent({ type: 'gallery', attrs: { images: [] } }).run();
  };
  return (
    <div className="cpm-blog-toolbar" role="toolbar" aria-label="Formatting">
      <Btn title="Bold (Ctrl+B)" icon="fa-bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} />
      <Btn title="Italic (Ctrl+I)" icon="fa-italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} />
      <Btn title="Underline (Ctrl+U)" icon="fa-underline" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} />
      <Btn title="Strikethrough" icon="fa-strikethrough" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} />
      <span className="cpm-blog-tb-sep" />
      <select
        className="cpm-blog-tb-select"
        value={heading}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) editor.chain().focus().setParagraph().run();
          else editor.chain().focus().toggleHeading({ level: Number(v) }).run();
        }}
        title="Paragraph style"
      >
        <option value="">Paragraph</option>
        <option value="1">Heading 1</option>
        <option value="2">Heading 2</option>
        <option value="3">Heading 3</option>
        <option value="4">Heading 4</option>
        <option value="5">Heading 5</option>
        <option value="6">Heading 6</option>
      </select>
      <span className="cpm-blog-tb-sep" />
      <Btn title="Bullet list" icon="fa-list-ul" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} />
      <Btn title="Numbered list" icon="fa-list-ol" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
      <Btn title="Checklist" icon="fa-square-check" active={editor.isActive('taskList')} onClick={() => editor.chain().focus().toggleTaskList().run()} />
      <span className="cpm-blog-tb-sep" />
      <Btn title="Quote" icon="fa-quote-right" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
      <Btn title="Code block" icon="fa-code" active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()} />
      <Btn title="Divider" icon="fa-minus" onClick={() => editor.chain().focus().setHorizontalRule().run()} />
      <span className="cpm-blog-tb-sep" />
      <Btn title="Link (Ctrl+K)" icon="fa-link" active={editor.isActive('link')} onClick={() => setLink(editor)} />
      <Btn title="Insert image" icon="fa-image" onClick={() => fileRef.current?.click()} />
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={pickImage} />
      <Btn title="Embed (video / social)" icon="fa-photo-film" onClick={insertEmbed} />
      <Btn title="Image gallery" icon="fa-images" onClick={insertGallery} />
      <Btn title="Insert table" icon="fa-table" active={inTable} onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} />
      {inTable && (
        <>
          <Btn title="Add column" icon="fa-table-columns" onClick={() => editor.chain().focus().addColumnAfter().run()} />
          <Btn title="Delete column" label="−col" onClick={() => editor.chain().focus().deleteColumn().run()} />
          <Btn title="Add row" label="+row" onClick={() => editor.chain().focus().addRowAfter().run()} />
          <Btn title="Delete row" label="−row" onClick={() => editor.chain().focus().deleteRow().run()} />
          <Btn title="Delete table" icon="fa-trash" onClick={() => editor.chain().focus().deleteTable().run()} />
        </>
      )}
      <span className="cpm-blog-tb-sep" />
      <Btn title="Find & replace" icon="fa-magnifying-glass" onClick={onToggleFind} />
      <span className="cpm-blog-tb-sep" />
      <Btn title="Undo (Ctrl+Z)" icon="fa-rotate-left" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()} />
      <Btn title="Redo (Ctrl+Y)" icon="fa-rotate-right" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()} />
    </div>
  );
}

function FindBar({ editor, onClose }) {
  const [term, setTerm] = React.useState('');
  const [replaceWith, setReplaceWith] = React.useState('');

  React.useEffect(() => {
    if (!editor) return;
    editor.commands.setSearchTerm(term);
    editor.commands.setReplaceTerm(replaceWith);
  }, [editor, term, replaceWith]);

  React.useEffect(() => () => { editor?.commands.setSearchTerm(''); }, [editor]);

  const results = editor?.storage.searchAndReplace?.results?.length ?? 0;
  return (
    <div className="cpm-blog-findbar">
      <input autoFocus className="cpm-blog-find-input" placeholder="Find" value={term} onChange={(e) => setTerm(e.target.value)} />
      <input className="cpm-blog-find-input" placeholder="Replace" value={replaceWith} onChange={(e) => setReplaceWith(e.target.value)} />
      <span className="cpm-blog-find-count">{results} found</span>
      <button type="button" className="cpm-blog-tb-btn" title="Previous" onClick={() => editor.commands.previousSearchResult()}><i className="fas fa-chevron-up" /></button>
      <button type="button" className="cpm-blog-tb-btn" title="Next" onClick={() => editor.commands.nextSearchResult()}><i className="fas fa-chevron-down" /></button>
      <button type="button" className="clubpm-btn-secondary" onClick={() => editor.commands.replace()}>Replace</button>
      <button type="button" className="clubpm-btn-secondary" onClick={() => editor.commands.replaceAll()}>All</button>
      <button type="button" className="cpm-blog-tb-btn" title="Close" onClick={onClose}><i className="fas fa-xmark" /></button>
    </div>
  );
}

/**
 * Rich-text blog editor.
 * @param {object}   content   TipTap JSON doc (or null for empty)
 * @param {function} onChange  called with the doc JSON on every change
 * @param {boolean}  editable
 * @param {function} onEditorReady  receives the editor instance
 */
export default function BlogEditor({ content, onChange, editable = true, onEditorReady }) {
  const [showFind, setShowFind] = React.useState(false);
  const editor = useEditor({
    extensions: blogExtensions(),
    content: content ?? { type: 'doc', content: [{ type: 'paragraph' }] },
    editable,
    onUpdate: ({ editor: ed }) => { onChange?.(ed.getJSON()); },
  });

  useEffect(() => {
    if (editor && onEditorReady) onEditorReady(editor);
  }, [editor, onEditorReady]);

  const words = editor?.storage.characterCount.words() ?? 0;
  const chars = editor?.storage.characterCount.characters() ?? 0;

  return (
    <div className="cpm-blog-editor">
      <Toolbar editor={editor} onToggleFind={() => setShowFind((s) => !s)} />
      {showFind && <FindBar editor={editor} onClose={() => setShowFind(false)} />}
      <EditorContent editor={editor} className="cpm-blog-editor-surface" />
      <div className="cpm-blog-editor-footer">
        <span>{words} words</span>
        <span>{chars} characters</span>
      </div>
    </div>
  );
}
