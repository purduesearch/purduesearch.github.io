import React, { useEffect, useMemo } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import CharacterCount from '@tiptap/extension-character-count';
import Placeholder from '@tiptap/extension-placeholder';
import { TableKit } from '@tiptap/extension-table';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import { SearchAndReplace } from '@sereneinserenade/tiptap-search-and-replace';
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import BlogImage, { uploadImageFiles } from './BlogImage';
import BlogEmbed, { buildEmbed } from './BlogEmbed';
import BlogGallery from './BlogGallery';
import BlogToc from './BlogToc';
import BlogCallout from './BlogCallout';
import BlogSnippetManager from './BlogSnippetManager';
import { getBlogCollabWsUrl, getStoredToken } from '../../../api/clubPmClient';

// Shared editor extension set. Keep in sync with the backend renderer
// (backend/src/services/blogRender.ts) whenever a node type is added.
// Pass `collab: { document, provider, user }` to swap in Yjs-backed
// collaborative editing (see backend/src/collab/blogCollab.ts) — this
// disables StarterKit's own undo/redo since Collaboration provides its
// own Yjs-based history instead.
export function blogExtensions(collab) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      link: { openOnClick: false, autolink: true, linkOnPaste: true },
      ...(collab ? { undoRedo: false } : {}),
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    BlogImage,
    BlogEmbed,
    BlogGallery,
    BlogToc,
    BlogCallout,
    CharacterCount,
    Placeholder.configure({ placeholder: 'Start writing your post…' }),
    TableKit.configure({ table: { resizable: true } }),
    SearchAndReplace.configure({ disableRegex: true }),
    ...(collab ? [
      Collaboration.configure({ document: collab.document }),
      CollaborationCursor.configure({ provider: collab.provider, user: collab.user }),
    ] : []),
  ];
}

// Deterministic per-member cursor color so the same person always renders
// the same color across sessions/tabs.
const CURSOR_COLORS = ['#00e5cc', '#f5a623', '#ff6b6b', '#a78bfa', '#4dabf7', '#69db7c', '#ff922b'];
function colorForMember(memberId) {
  if (!memberId) return CURSOR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < memberId.length; i += 1) hash = (hash * 31 + memberId.charCodeAt(i)) | 0;
  return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length];
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

function Toolbar({ editor, onToggleFind, onToggleSnippets }) {
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
  const insertToc = () => {
    editor.chain().focus().insertContent({ type: 'tableOfContents' }).run();
  };
  const insertCallout = () => {
    editor.chain().focus().insertContent({
      type: 'callout',
      attrs: { variant: 'info' },
      content: [{ type: 'paragraph' }],
    }).run();
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
      <Btn title="Insert table of contents" icon="fa-bars-staggered" onClick={insertToc} />
      <Btn title="Insert callout" icon="fa-square-full" active={editor.isActive('callout')} onClick={insertCallout} />
      <Btn title="Snippets" icon="fa-clone" onClick={onToggleSnippets} />
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

function PresenceBar({ connected, peers }) {
  return (
    <div className="cpm-blog-presence" title={connected ? 'Live — changes sync in real time' : 'Reconnecting…'}>
      <span className={`cpm-blog-presence-dot${connected ? ' is-live' : ''}`} aria-hidden="true" />
      {peers.map((p) => (
        <span
          key={p.clientId}
          className="cpm-blog-presence-avatar"
          style={{ background: p.user?.color }}
          title={`${p.user?.name || 'Someone'} is editing`}
        >
          {(p.user?.name || '?').charAt(0).toUpperCase()}
        </span>
      ))}
    </div>
  );
}

/**
 * Rich-text blog editor.
 * @param {object}   content     TipTap JSON doc (or null for empty); ignored when `postId` is set —
 *                                 collaborative documents load their content from the Yjs doc instead.
 * @param {function} onChange    called with the doc JSON on every change
 * @param {boolean}  editable
 * @param {function} onEditorReady  receives the editor instance
 * @param {string}   postId      when set, enables realtime co-editing via the Hocuspocus collab
 *                                 server for this post (see backend/src/collab/blogCollab.ts)
 * @param {object}   collabUser  { id, name } of the current member, used for cursor presence
 */
export default function BlogEditor({ content, onChange, editable = true, onEditorReady, postId, collabUser }) {
  const [showFind, setShowFind] = React.useState(false);
  const [showSnippets, setShowSnippets] = React.useState(false);
  const [connected, setConnected] = React.useState(false);
  const [peers, setPeers] = React.useState([]);

  // One Y.Doc + Hocuspocus connection per post. Recreated only if `postId`
  // changes — callers should `key` the editor by post id so a full remount
  // (not just this memo) happens on navigation between posts.
  const collab = useMemo(() => {
    if (!postId) return null;
    const document = new Y.Doc();
    const provider = new HocuspocusProvider({
      url: getBlogCollabWsUrl(),
      name: postId,
      document,
      token: () => getStoredToken() ?? '',
    });
    return { document, provider };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  useEffect(() => () => {
    collab?.provider.destroy();
    collab?.document.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collab]);

  useEffect(() => {
    if (!collab) return undefined;
    const { provider } = collab;
    const onStatus = ({ status }) => setConnected(status === 'connected');
    const onAwareness = ({ states }) => {
      const selfId = provider.awareness?.clientID;
      setPeers(states.filter((s) => s.clientId !== selfId && s.user));
    };
    provider.on('status', onStatus);
    provider.on('awarenessUpdate', onAwareness);
    return () => {
      provider.off('status', onStatus);
      provider.off('awarenessUpdate', onAwareness);
    };
  }, [collab]);

  const editor = useEditor({
    extensions: blogExtensions(collab ? {
      document: collab.document,
      provider: collab.provider,
      user: { name: collabUser?.name || 'Anonymous', color: colorForMember(collabUser?.id) },
    } : null),
    content: collab ? undefined : (content ?? { type: 'doc', content: [{ type: 'paragraph' }] }),
    editable,
    onUpdate: ({ editor: ed }) => { onChange?.(ed.getJSON()); },
  }, [collab]);

  useEffect(() => {
    if (editor && onEditorReady) onEditorReady(editor);
  }, [editor, onEditorReady]);

  const words = editor?.storage.characterCount.words() ?? 0;
  const chars = editor?.storage.characterCount.characters() ?? 0;

  return (
    <div className="cpm-blog-editor">
      <div className="cpm-blog-toolbar-row">
        <Toolbar editor={editor} onToggleFind={() => setShowFind((s) => !s)} onToggleSnippets={() => setShowSnippets(true)} />
        {collab && <PresenceBar connected={connected} peers={peers} />}
      </div>
      {showFind && <FindBar editor={editor} onClose={() => setShowFind(false)} />}
      {showSnippets && <BlogSnippetManager editor={editor} onClose={() => setShowSnippets(false)} />}
      <EditorContent editor={editor} className="cpm-blog-editor-surface" />
      <div className="cpm-blog-editor-footer">
        <span>{words} words</span>
        <span>{chars} characters</span>
      </div>
    </div>
  );
}
