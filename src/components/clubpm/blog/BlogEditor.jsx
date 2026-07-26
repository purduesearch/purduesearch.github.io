import React, { useEffect, useMemo } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import CharacterCount from '@tiptap/extension-character-count';
import Placeholder from '@tiptap/extension-placeholder';
import { TableKit } from '@tiptap/extension-table';
import { TextStyle, FontFamily, FontSize, Color } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
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
import BlogSelectionBubble from './BlogSelectionBubble';
import { suggestionExtensions } from './suggestionMarks';
import { docToMarkdown, markdownToDoc } from './blogMarkdown';
import { getBlogCollabWsUrl, getStoredToken } from '../../../api/clubPmClient';
import { shouldFallbackSeed } from '../../../lib/collabFallback';
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
    TextStyle,
    FontFamily.configure({ types: ['textStyle'] }),
    FontSize.configure({ types: ['textStyle'] }),
    Color.configure({ types: ['textStyle'] }),
    Highlight.configure({ multicolor: true }),
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
    ...suggestionExtensions(),
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

// Restricted to the faces the site actually loads (public/index.html) and that
// the server renderer allowlists (blogRender.ts ALLOWED_FONTS). Keep the three
// lists in sync — a font missing from any of them silently drops on publish.
const POST_FONTS = ['Syne', 'DM Sans', 'Oswald', 'Lato', 'Montserrat', 'Work Sans'];
const POST_SIZES = [12, 14, 16, 18, 20, 24, 30, 36, 48];

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

// Post-level design controls (accent, font pair, width). These apply to the
// whole post — per-selection typography lives in the Text group instead.
function DesignMenu({ theme, onChange }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  return (
    <span className="cpm-blog-tb-menu" ref={ref}>
      <button
        type="button"
        className={`cpm-blog-tb-menu-trigger${open ? ' is-open' : ''}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
        title="Post design"
      >
        <i className="fas fa-palette" aria-hidden="true" />
        <span className="cpm-blog-tb-menu-label">Design</span>
        <i className="fas fa-chevron-down cpm-blog-tb-menu-caret" aria-hidden="true" />
      </button>
      {open && (
        <div className="cpm-blog-tb-menu-pop cpm-blog-design-pop">
          <BlogThemeBar theme={theme} onChange={onChange} />
          <p className="cpm-blog-design-hint">Applies to the whole post.</p>
        </div>
      )}
    </span>
  );
}

function Toolbar({ editor, onToggleFind, onToggleSnippets, onAddSection, onToggleMarkdown, markdownMode, onShowShortcuts, toolbarOpen, onToggleToolbarOpen, theme, onThemeChange }) {
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

  const activeFont = editor.getAttributes('textStyle').fontFamily ?? '';
  const activeSize = String(editor.getAttributes('textStyle').fontSize ?? '').replace('px', '');

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
      </span>

      {/* Text */}
      <span className="cpm-blog-tb-band">
        <ToolbarMenu label="Format" icon="fa-font" title="Text formatting" items={formatItems} closeOnSelect={false} />
        <select
          className="cpm-blog-tb-select"
          value={activeFont}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) editor.chain().focus().unsetFontFamily().run();
            else editor.chain().focus().setFontFamily(v).run();
          }}
          title="Font for the selected text"
        >
          <option value="">Post font</option>
          {POST_FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <select
          className="cpm-blog-tb-select"
          value={activeSize}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) editor.chain().focus().unsetFontSize().run();
            else editor.chain().focus().setFontSize(`${v}px`).run();
          }}
          title="Size of the selected text"
        >
          <option value="">Size</option>
          {POST_SIZES.map((s) => <option key={s} value={s}>{s}px</option>)}
        </select>
        <label className="cpm-blog-tb-color" title="Text colour">
          <i className="fas fa-a" aria-hidden="true" />
          <input
            type="color"
            value={editor.getAttributes('textStyle').color ?? '#ffffff'}
            onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
          />
        </label>
        <label className="cpm-blog-tb-color" title="Highlight">
          <i className="fas fa-highlighter" aria-hidden="true" />
          <input
            type="color"
            value={editor.getAttributes('highlight').color ?? '#f5a623'}
            onChange={(e) => editor.chain().focus().toggleHighlight({ color: e.target.value }).run()}
          />
        </label>
      </span>

      {/* Paragraph */}
      <span className="cpm-blog-tb-band">
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
      </span>

      {/* Insert + Section */}
      <span className="cpm-blog-tb-band">
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
      </span>

      {inTable && (
        <span className="cpm-blog-tb-band">
          <Btn title="Add column" icon="fa-table-columns" onClick={() => editor.chain().focus().addColumnAfter().run()} />
          <Btn title="Delete column" label="−col" onClick={() => editor.chain().focus().deleteColumn().run()} />
          <Btn title="Add row" label="+row" onClick={() => editor.chain().focus().addRowAfter().run()} />
          <Btn title="Delete row" label="−row" onClick={() => editor.chain().focus().deleteRow().run()} />
          <Btn title="Delete table" icon="fa-trash" onClick={() => editor.chain().focus().deleteTable().run()} />
        </span>
      )}

      {/* Design */}
      {onThemeChange && (
        <span className="cpm-blog-tb-band">
          <DesignMenu theme={theme} onChange={onThemeChange} />
        </span>
      )}

      {/* Tools */}
      <span className="cpm-blog-tb-band cpm-blog-tb-band--end">
        <Btn title="Find & replace" icon="fa-magnifying-glass" onClick={onToggleFind} />
        <Btn title="Undo (Ctrl+Z)" icon="fa-rotate-left" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()} />
        <Btn title="Redo (Ctrl+Y)" icon="fa-rotate-right" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()} />
        <Btn title={markdownMode ? 'Switch back to rich text' : 'Edit as Markdown'} icon="fa-file-code" active={markdownMode} onClick={onToggleMarkdown} pinned />
        <Btn title="Keyboard shortcuts" icon="fa-keyboard" onClick={onShowShortcuts} pinned />
      </span>
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

// The dot is green only when the Yjs document has actually SYNCED — a socket
// that is merely "connected" but never syncs (auth silently failed) is not a
// live session, and claiming it is hides the fact that co-editing isn't working.
function PresenceBar({ synced, connected, peers }) {
  const title = synced
    ? 'Live — changes sync in real time'
    : connected
      ? 'Connecting to the live session…'
      : 'Offline — your edits are saved to the draft';
  return (
    <div className="cpm-blog-presence" title={title}>
      <span className={`cpm-blog-presence-dot${synced ? ' is-live' : ''}`} aria-hidden="true" />
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
 * @param {string}  docType   'BLOG_POST' | 'PRESS_KIT' — which review-thread namespace this editor uses
 * @param {string}  docId     id within that namespace; falls back to postId for blog posts
 * @param {boolean} canEditDoc  false for reviewers — hides Accept/Reject and the AI entry points
 */
export default function BlogEditor({
  content, onChange, editable = true, onEditorReady, postId, collabUser, collabWsUrl,
  theme, onThemeChange, docType = 'BLOG_POST', docId, canEditDoc = true,
  onAskAi, onThreadsChanged,
}) {
  // Set by the bubble's "Ask AI"; consumed by BlogEditorPage via onAskAi.
  const [aiSelection, setAiSelection] = React.useState(null);
  const [showFind, setShowFind] = React.useState(false);
  const [showSnippets, setShowSnippets] = React.useState(false);
  const [showSecLib, setShowSecLib] = React.useState(false);
  const [settingsPos, setSettingsPos] = React.useState(null);
  // Section position the user explicitly closed the panel on. Suppresses the
  // auto-open below until the caret moves to a different section, so dismissing
  // the panel actually sticks while you keep typing in that section.
  const dismissedSectionPos = React.useRef(null);

  React.useEffect(() => {
    const handler = (e) => {
      dismissedSectionPos.current = null;
      setSettingsPos(e.detail?.pos ?? null);
    };
    window.addEventListener('blog-section-settings', handler);
    return () => window.removeEventListener('blog-section-settings', handler);
  }, []);

  const closeSettings = React.useCallback(() => {
    dismissedSectionPos.current = settingsPos;
    setSettingsPos(null);
  }, [settingsPos]);
  const [connected, setConnected] = React.useState(false);
  const [synced, setSynced] = React.useState(false);
  const [peers, setPeers] = React.useState([]);
  const [markdownMode, setMarkdownMode] = React.useState(false);
  const [markdownText, setMarkdownText] = React.useState('');
  // Review-thread doc id: callers that only pass `postId` keep working.
  const reviewDocId = docId ?? postId;
  // Collapsed by default on narrow viewports so the toolbar doesn't push the
  // title/body below the fold; users can still expand it with the chevron.
  const [toolbarOpen, setToolbarOpen] = React.useState(() => (typeof window === 'undefined' || window.innerWidth > 640));
  const shortcutsRegistry = useShortcutsRegistry();
  // Latest values read by the fallback-seed effect without re-arming it.
  // syncedRef tracks whether the Yjs doc has actually synced from the server
  // (NOT merely whether the socket connected) — the fallback seed is gated on
  // this so a connected-but-never-synced session still shows the draft.
  const syncedRef = React.useRef(false);
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
      setConnected(isConnected);
      // A dropped socket is no longer synced. The provider only emits 'synced'
      // on the true transition, so reset here to keep the flag honest.
      if (!isConnected) { syncedRef.current = false; setSynced(false); }
    };
    const onSynced = () => { syncedRef.current = true; setSynced(true); };
    const onAwareness = ({ states }) => {
      const selfId = provider.awareness?.clientID;
      setPeers(states.filter((s) => s.clientId !== selfId && s.user));
    };
    provider.on('status', onStatus);
    provider.on('synced', onSynced);
    provider.on('awarenessUpdate', onAwareness);
    return () => {
      provider.off('status', onStatus);
      provider.off('synced', onSynced);
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
  // Hocuspocus server seeds from contentJson on connect. If that doc never
  // SYNCS the editor stays blank — so generated/initial text never appears and
  // there's nothing to persist. This happens in three ways, all handled here:
  //   1. The WS is blocked (some browsers/ad-blockers) — never connects.
  //   2. The reverse proxy drops the Upgrade headers — never connects.
  //   3. The socket connects but auth silently fails (a missing/expired Bearer
  //      token) — the server never delivers a document, so it's connected yet
  //      never synced. The earlier gate keyed on "never connected" and so left
  //      THIS case blank forever; the fix gates on !synced instead.
  // When the server had a document, `synced` fires with the editor already
  // populated and seedIfEmpty is a no-op. When the server had none, we seed the
  // current draft so co-editors start from it. Non-collab editors load
  // `content` directly, so this is inert there. emitUpdate:false so seeding
  // never spuriously marks the doc dirty.
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
    const timer = setTimeout(() => {                 // doc never arrived
      if (shouldFallbackSeed({
        synced: syncedRef.current,
        editorEmpty: editor.isEmpty,
        hasContent: !!contentRef.current,
      })) seedIfEmpty();
    }, 4000);
    return () => { clearTimeout(timer); collab.provider.off('synced', onSynced); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, collab]);

  useEffect(() => {
    if (editor && onEditorReady) onEditorReady(editor);
  }, [editor, onEditorReady]);

  // Clicking into a section opens that section's settings, so layout /
  // background / padding are reachable where you're working instead of only
  // behind the palette button on the hover toolbar. Tracking the position on
  // every selection change also keeps the panel pointed at the right node when
  // edits above it shift positions.
  useEffect(() => {
    if (!editor || !editable) return undefined;
    const sync = () => {
      if (editor.isDestroyed) return;
      const { $from } = editor.state.selection;
      let pos = null;
      for (let depth = $from.depth; depth > 0; depth -= 1) {
        if ($from.node(depth).type.name === 'section') { pos = $from.before(depth); break; }
      }
      if (pos == null) {
        dismissedSectionPos.current = null;
        setSettingsPos(null);
        return;
      }
      if (dismissedSectionPos.current === pos) return;
      dismissedSectionPos.current = null;
      setSettingsPos((prev) => (prev === pos ? prev : pos));
    };
    editor.on('selectionUpdate', sync);
    return () => { editor.off('selectionUpdate', sync); };
  }, [editor, editable]);

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
          theme={theme}
          onThemeChange={onThemeChange}
        />
        {collab && <PresenceBar synced={synced} connected={connected} peers={peers} />}
      </div>
      {showFind && !markdownMode && <FindBar editor={editor} onClose={() => setShowFind(false)} />}
      {showSnippets && !markdownMode && <BlogSnippetManager editor={editor} onClose={() => setShowSnippets(false)} />}
      {showSecLib && !markdownMode && <BlogSectionLibrary editor={editor} onClose={() => setShowSecLib(false)} />}
      {settingsPos != null && !markdownMode && (
        <BlogSectionSettings editor={editor} pos={settingsPos} onClose={closeSettings} />
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
          {editable && reviewDocId && (
            <BlogSelectionBubble
              editor={editor}
              docType={docType}
              docId={reviewDocId}
              canEdit={canEditDoc}
              onThreadCreated={() => onThreadsChanged?.()}
              onAskAi={(text) => { setAiSelection(text); onAskAi?.(text); }}
            />
          )}
        </div>
      )}
      <div className="cpm-blog-editor-footer">
        <span>{words} words</span>
        <span>{chars} characters</span>
        {markdownMode && <span className="cpm-blog-markdown-hint">Editing raw Markdown — switch back to rich text to continue formatting. Fonts, sizes, colours and highlights are not represented in Markdown and will be lost on switching back.</span>}
        {aiSelection && <span className="cpm-blog-markdown-hint" hidden>{aiSelection.length} chars selected for AI</span>}
      </div>
    </div>
  );
}
