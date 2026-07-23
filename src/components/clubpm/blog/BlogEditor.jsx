import React, { useEffect, useMemo } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import CharacterCount from '@tiptap/extension-character-count';
import Placeholder from '@tiptap/extension-placeholder';
import { TableKit } from '@tiptap/extension-table';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import { SearchAndReplace } from '@sereneinserenade/tiptap-search-and-replace';
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import BlogImage, { uploadImageFiles } from './BlogImage';
import BlogEmbed, { buildEmbed } from './BlogEmbed';
import BlogGallery from './BlogGallery';
import BlogToc from './BlogToc';
import BlogCallout from './BlogCallout';
import BlogSection from './BlogSection';
import BlogColumn from './BlogColumn';
import BlogHero from './BlogHero';
import BlogStatBand from './BlogStatBand';
import BlogCta from './BlogCta';
import BlogSnippetManager from './BlogSnippetManager';
import BlogSectionLibrary from './BlogSectionLibrary';
import BlogSectionSettings from './BlogSectionSettings';
import BlogThemeBar from './BlogThemeBar';
import { docToMarkdown, markdownToDoc } from './blogMarkdown';
import { getBlogCollabWsUrl, getStoredToken } from '../../../api/clubPmClient';
import useKeyboardShortcuts from '../../../hooks/useKeyboardShortcuts';
import { useShortcutsRegistry } from '../../../clubpm/ShortcutsRegistry';

// Adds Mod-K for the link prompt (the extension-link package ships no default
// keymap of its own) so the toolbar tooltip's "(Ctrl+K)" hint is accurate.
const LinkShortcut = Extension.create({
  name: 'linkShortcut',
  addKeyboardShortcuts() {
    return { 'Mod-k': () => { setLink(this.editor); return true; } };
  },
});

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
    BlogSection,
    BlogColumn,
    BlogHero,
    BlogStatBand,
    BlogCta,
    CharacterCount,
    Placeholder.configure({ placeholder: 'Start writing your post…' }),
    TableKit.configure({ table: { resizable: true } }),
    SearchAndReplace.configure({ disableRegex: true }),
    LinkShortcut,
    ...(collab ? [
      Collaboration.configure({ document: collab.document }),
      CollaborationCaret.configure({ provider: collab.provider, user: collab.user }),
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

function Btn({ active, disabled, onClick, title, icon, label, pinned }) {
  return (
    <button
      type="button"
      className={`cpm-blog-tb-btn${active ? ' is-active' : ''}${pinned ? ' cpm-blog-tb-btn--pinned' : ''}`}
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

// A dropdown that groups related toolbar actions. `items` are
// { title, icon, active?, disabled?, onClick }. Format-style menus pass
// closeOnSelect={false} so several toggles can be applied without reopening.
function ToolbarMenu({ label, icon, title, items, closeOnSelect = true }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);
  const anyActive = items.some((it) => it.active);
  return (
    <span className="cpm-blog-tb-menu" ref={ref}>
      <button
        type="button"
        className={`cpm-blog-tb-menu-trigger${anyActive ? ' is-active' : ''}${open ? ' is-open' : ''}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
        title={title || label}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {icon && <i className={`fas ${icon}`} aria-hidden="true" />}
        <span className="cpm-blog-tb-menu-label">{label}</span>
        <i className="fas fa-chevron-down cpm-blog-tb-menu-caret" aria-hidden="true" />
      </button>
      {open && (
        <div className="cpm-blog-tb-menu-pop" role="menu">
          {items.map((it) => (
            <button
              key={it.title}
              type="button"
              role="menuitem"
              className={`cpm-blog-tb-menu-item${it.active ? ' is-active' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              disabled={it.disabled}
              onClick={() => { it.onClick(); if (closeOnSelect) setOpen(false); }}
            >
              {it.icon && <i className={`fas ${it.icon}`} aria-hidden="true" />}
              <span>{it.title}</span>
              {it.active && <i className="fas fa-check cpm-blog-tb-menu-tick" aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

function Toolbar({ editor, onToggleFind, onToggleSnippets, onAddSection, onToggleMarkdown, markdownMode, onShowShortcuts, toolbarOpen, onToggleToolbarOpen }) {
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

  // Grouped menu items — condense the many single-purpose buttons into three menus.
  const formatItems = [
    { title: 'Bold', icon: 'fa-bold', active: editor.isActive('bold'), onClick: () => editor.chain().focus().toggleBold().run() },
    { title: 'Italic', icon: 'fa-italic', active: editor.isActive('italic'), onClick: () => editor.chain().focus().toggleItalic().run() },
    { title: 'Underline', icon: 'fa-underline', active: editor.isActive('underline'), onClick: () => editor.chain().focus().toggleUnderline().run() },
    { title: 'Strikethrough', icon: 'fa-strikethrough', active: editor.isActive('strike'), onClick: () => editor.chain().focus().toggleStrike().run() },
    { title: 'Inline code', icon: 'fa-code', active: editor.isActive('code'), onClick: () => editor.chain().focus().toggleCode().run() },
    { title: 'Link', icon: 'fa-link', active: editor.isActive('link'), onClick: () => setLink(editor) },
  ];
  const listItems = [
    { title: 'Bullet list', icon: 'fa-list-ul', active: editor.isActive('bulletList'), onClick: () => editor.chain().focus().toggleBulletList().run() },
    { title: 'Numbered list', icon: 'fa-list-ol', active: editor.isActive('orderedList'), onClick: () => editor.chain().focus().toggleOrderedList().run() },
    { title: 'Checklist', icon: 'fa-square-check', active: editor.isActive('taskList'), onClick: () => editor.chain().focus().toggleTaskList().run() },
  ];
  const insertItems = [
    { title: 'Image', icon: 'fa-image', onClick: () => fileRef.current?.click() },
    { title: 'Embed (video / social)', icon: 'fa-photo-film', onClick: insertEmbed },
    { title: 'Image gallery', icon: 'fa-images', onClick: insertGallery },
    { title: 'Table', icon: 'fa-table', active: inTable, onClick: () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
    { title: 'Table of contents', icon: 'fa-bars-staggered', onClick: insertToc },
    { title: 'Callout', icon: 'fa-square-full', active: editor.isActive('callout'), onClick: insertCallout },
    { title: 'Quote', icon: 'fa-quote-right', active: editor.isActive('blockquote'), onClick: () => editor.chain().focus().toggleBlockquote().run() },
    { title: 'Code block', icon: 'fa-file-code', active: editor.isActive('codeBlock'), onClick: () => editor.chain().focus().toggleCodeBlock().run() },
    { title: 'Divider', icon: 'fa-minus', onClick: () => editor.chain().focus().setHorizontalRule().run() },
    { title: 'Snippets', icon: 'fa-clone', onClick: onToggleSnippets },
  ];

  return (
    <div
      className={`cpm-blog-toolbar${toolbarOpen ? '' : ' is-collapsed'}${markdownMode ? ' is-markdown-mode' : ''}`}
      role="toolbar"
      aria-label="Formatting"
    >
      <span className="cpm-blog-tb-toggle-wrap">
        <Btn
          title={toolbarOpen ? 'Collapse toolbar' : 'Expand toolbar'}
          icon={toolbarOpen ? 'fa-chevron-up' : 'fa-chevron-down'}
          onClick={onToggleToolbarOpen}
          pinned
        />
        <span className="cpm-blog-tb-sep" />
      </span>

      <ToolbarMenu label="Format" icon="fa-font" title="Text formatting" items={formatItems} closeOnSelect={false} />
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
      <ToolbarMenu label="Lists" icon="fa-list" title="Lists" items={listItems} />

      <span className="cpm-blog-tb-sep" />
      <button
        type="button"
        className="cpm-blog-add-section-btn cpm-blog-tb-btn--pinned"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onAddSection}
        title="Add a section"
      >
        <i className="fas fa-plus" aria-hidden="true" />
        <span>Add Section</span>
      </button>
      <ToolbarMenu label="Insert" icon="fa-square-plus" title="Insert content" items={insertItems} />
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={pickImage} />

      {inTable && (
        <>
          <span className="cpm-blog-tb-sep" />
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
      <span className="cpm-blog-tb-sep" />
      <Btn title={markdownMode ? 'Switch back to rich text' : 'Edit as Markdown'} icon="fa-file-code" active={markdownMode} onClick={onToggleMarkdown} pinned />
      <Btn title="Keyboard shortcuts" icon="fa-keyboard" onClick={onShowShortcuts} pinned />
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
export default function BlogEditor({ content, onChange, editable = true, onEditorReady, postId, collabUser, collabWsUrl, theme, onThemeChange }) {
  const [showFind, setShowFind] = React.useState(false);
  const [showSnippets, setShowSnippets] = React.useState(false);
  const [showSecLib, setShowSecLib] = React.useState(false);
  const [settingsPos, setSettingsPos] = React.useState(null);

  React.useEffect(() => {
    const handler = (e) => setSettingsPos(e.detail?.pos ?? null);
    window.addEventListener('blog-section-settings', handler);
    return () => window.removeEventListener('blog-section-settings', handler);
  }, []);
  const [connected, setConnected] = React.useState(false);
  const [peers, setPeers] = React.useState([]);
  const [markdownMode, setMarkdownMode] = React.useState(false);
  const [markdownText, setMarkdownText] = React.useState('');
  // Collapsed by default on narrow viewports so the toolbar doesn't push the
  // title/body below the fold; users can still expand it with the chevron.
  const [toolbarOpen, setToolbarOpen] = React.useState(() => (typeof window === 'undefined' || window.innerWidth > 640));
  const shortcutsRegistry = useShortcutsRegistry();
  // Latest values read by the fallback-seed effect without re-arming it.
  const connectedRef = React.useRef(false);
  const contentRef = React.useRef(content);
  contentRef.current = content;

  // One Y.Doc + Hocuspocus connection per post. Recreated only if `postId`
  // changes — callers should `key` the editor by post id so a full remount
  // (not just this memo) happens on navigation between posts.
  const collab = useMemo(() => {
    if (!postId) return null;
    const document = new Y.Doc();
    const provider = new HocuspocusProvider({
      url: collabWsUrl || getBlogCollabWsUrl(),
      name: postId,
      document,
      token: () => getStoredToken() ?? '',
      // 0 = reconnect forever (built-in exponential backoff 1s→30s, jittered) so
      // the editor auto-recovers when the collab WS returns. A finite cap made a
      // single transient drop permanently kill collaboration in the tab until a
      // full page reload — the backoff already prevents tight-loop console spam.
      maxAttempts: 0,
    });
    return { document, provider };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, collabWsUrl]);

  useEffect(() => () => {
    collab?.provider.destroy();
    collab?.document.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collab]);

  useEffect(() => {
    if (!collab) return undefined;
    const { provider } = collab;
    const onStatus = ({ status }) => {
      const isConnected = status === 'connected';
      connectedRef.current = isConnected;
      setConnected(isConnected);
    };
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

  // ── Fallback content seeding ──────────────────────────────────
  // In collab mode the editor starts from the shared Yjs doc, which the
  // Hocuspocus server seeds from contentJson on connect. If that server is
  // unreachable (WS blocked / reverse proxy missing the Upgrade headers), the
  // doc never arrives and the editor stays blank — so generated/initial text
  // never appears and there's nothing to persist. When the doc is still empty
  // and we either synced against an empty server doc OR never connected at all,
  // seed it from the `content` prop so editing works regardless of the collab
  // link. Non-collab editors already load `content` directly, so this is inert
  // there. emitUpdate:false so seeding never spuriously marks the doc dirty.
  useEffect(() => {
    if (!editor || !collab) return undefined;
    let seeded = false;
    const seedIfEmpty = () => {
      if (seeded || editor.isDestroyed) return;
      const doc = contentRef.current;
      if (doc && editor.isEmpty) {
        seeded = true;
        editor.commands.setContent(doc, { emitUpdate: false });
      }
    };
    const onSynced = () => seedIfEmpty();            // server had no content
    collab.provider.on('synced', onSynced);
    const timer = setTimeout(() => {                 // server never reachable
      if (!connectedRef.current) seedIfEmpty();
    }, 3000);
    return () => { clearTimeout(timer); collab.provider.off('synced', onSynced); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, collab]);

  useEffect(() => {
    if (editor && onEditorReady) onEditorReady(editor);
  }, [editor, onEditorReady]);

  // Registered purely so these appear in the shared "?" Keyboard Shortcuts
  // modal — the key combos themselves are handled natively by TipTap's own
  // keymaps (bold/italic/underline/undo/redo) or LinkShortcut above; the
  // global registry ignores modifier-key events (see ShortcutsRegistry.jsx),
  // so registering them here is documentation-only and never double-fires.
  useKeyboardShortcuts([
    { id: 'blog.bold', keys: 'Ctrl/⌘+B', scope: 'page', pageId: 'Blog Editor', description: 'Bold', action: () => editor?.chain().focus().toggleBold().run() },
    { id: 'blog.italic', keys: 'Ctrl/⌘+I', scope: 'page', pageId: 'Blog Editor', description: 'Italic', action: () => editor?.chain().focus().toggleItalic().run() },
    { id: 'blog.underline', keys: 'Ctrl/⌘+U', scope: 'page', pageId: 'Blog Editor', description: 'Underline', action: () => editor?.chain().focus().toggleUnderline().run() },
    { id: 'blog.link', keys: 'Ctrl/⌘+K', scope: 'page', pageId: 'Blog Editor', description: 'Add/edit link', action: () => setLink(editor) },
    { id: 'blog.undo', keys: 'Ctrl/⌘+Z', scope: 'page', pageId: 'Blog Editor', description: 'Undo', action: () => editor?.chain().focus().undo().run() },
    { id: 'blog.redo', keys: 'Ctrl/⌘+Shift+Z', scope: 'page', pageId: 'Blog Editor', description: 'Redo', action: () => editor?.chain().focus().redo().run() },
    { id: 'blog.save', keys: 'Ctrl/⌘+S', scope: 'page', pageId: 'Blog Editor', description: 'Save draft', action: () => {} },
  ]);

  const toggleMarkdown = () => {
    if (!editor) return;
    if (markdownMode) {
      editor.commands.setContent(markdownToDoc(markdownText), { emitUpdate: true });
      setMarkdownMode(false);
    } else {
      setMarkdownText(docToMarkdown(editor.getJSON()));
      setMarkdownMode(true);
    }
  };

  const words = editor?.storage.characterCount.words() ?? 0;
  const chars = editor?.storage.characterCount.characters() ?? 0;

  return (
    <div className="cpm-blog-editor">
      <div className="cpm-blog-toolbar-row">
        <Toolbar
          editor={editor}
          onToggleFind={() => setShowFind((s) => !s)}
          onToggleSnippets={() => setShowSnippets(true)}
          onAddSection={() => setShowSecLib(true)}
          onToggleMarkdown={toggleMarkdown}
          markdownMode={markdownMode}
          onShowShortcuts={() => shortcutsRegistry?.setShowHelp(true)}
          toolbarOpen={toolbarOpen}
          onToggleToolbarOpen={() => setToolbarOpen((v) => !v)}
        />
        {onThemeChange && <BlogThemeBar theme={theme} onChange={onThemeChange} />}
        {collab && <PresenceBar connected={connected} peers={peers} />}
      </div>
      {showFind && !markdownMode && <FindBar editor={editor} onClose={() => setShowFind(false)} />}
      {showSnippets && !markdownMode && <BlogSnippetManager editor={editor} onClose={() => setShowSnippets(false)} />}
      {showSecLib && !markdownMode && <BlogSectionLibrary editor={editor} onClose={() => setShowSecLib(false)} />}
      {settingsPos != null && (
        <BlogSectionSettings editor={editor} pos={settingsPos} onClose={() => setSettingsPos(null)} />
      )}
      {markdownMode ? (
        <textarea
          className="cpm-blog-markdown-textarea"
          value={markdownText}
          onChange={(e) => setMarkdownText(e.target.value)}
          spellCheck={false}
          placeholder="# Markdown source"
        />
      ) : (
        <div
          className="cpm-blog-editor-surface"
          data-fontpair={theme?.fontPair || 'syne-dmsans'}
          data-width={theme?.width || 'wide'}
          style={{ '--post-accent': theme?.accent || 'var(--pm-accent-teal)' }}
        >
          <EditorContent editor={editor} />
        </div>
      )}
      <div className="cpm-blog-editor-footer">
        <span>{words} words</span>
        <span>{chars} characters</span>
        {markdownMode && <span className="cpm-blog-markdown-hint">Editing raw Markdown — switch back to rich text to continue formatting.</span>}
      </div>
    </div>
  );
}
