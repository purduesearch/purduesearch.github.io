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
import { suggestionExtensions, findMarkRanges } from './suggestionMarks';
import {
  SuggestingMode, modesFor, defaultMode, MODE_LABELS, MODE_ICONS,
} from './SuggestingMode';
import { ThreadDecorations, threadDecorationsKey } from './ThreadDecorations';
import { anchorFromSelection } from './threadAnchors';
import BlogAutocomplete from './blogAutocomplete';
import { docToMarkdown, markdownToDoc } from './blogMarkdown';
import {
  getBlogCollabWsUrl, getStoredToken, listBlogThreads, setBlogThreadAnchor,
} from '../../../api/clubPmClient';
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
export function blogExtensions(collab, autocomplete, threadDecorations) {
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
    // Always present, inert until the header's mode control turns it on — the
    // toggle is a command, not a re-configure, so switching modes never
    // rebuilds the editor and drops the collab connection.
    SuggestingMode.configure({ enabled: false, authorId: collab?.user?.id ?? null }),
    BlogAutocomplete.configure({
      docType: autocomplete?.docType ?? 'BLOG_POST',
      docId: autocomplete?.docId ?? null,
      enabled: !!autocomplete?.enabled,
    }),
    // Comment anchors are decorations, not marks: they resolve Yjs relative
    // positions at render time and never enter the document. Only meaningful
    // alongside collab, which is what supplies the Yjs binding they resolve
    // against.
    ...(collab && threadDecorations ? [
      ThreadDecorations.configure({
        threads: threadDecorations.threads ?? [],
        onPositions: threadDecorations.onPositions ?? null,
        focusedThreadId: threadDecorations.focusedThreadId ?? null,
      }),
    ] : []),
    ...(collab ? [
      Collaboration.configure({ document: collab.document }),
      CollaborationCaret.configure({
        provider: collab.provider,
        user: collab.user,
        render: renderCaret,
      }),
    ] : []),
  ];
}

// How long a remote collaborator's name label stays visible after their caret
// moves. Permanent labels are unreadable once three people share a paragraph.
const CARET_LABEL_MS = 2500;

/**
 * Caret DOM for one remote collaborator.
 *
 * The extension calls this every time that peer's cursor is redrawn, i.e. on
 * every movement — so arming the fade here is exactly the "show on move, fade
 * after 2.5s" behaviour, and a new movement replaces the element (and its
 * timer) outright.
 *
 * `data-user-id` is what follow mode scrolls to; awareness has no other handle
 * on the rendered caret.
 */
function renderCaret(user) {
  const caret = document.createElement('span');
  caret.className = 'collaboration-carets__caret is-active';
  caret.style.setProperty('--caret-color', user?.color || '#00e5cc');
  if (user?.id) caret.setAttribute('data-user-id', user.id);

  const label = document.createElement('div');
  label.className = 'collaboration-carets__label';
  label.textContent = user?.name || 'Anonymous';
  caret.appendChild(label);

  // Fires once against this element only; if the peer moves again the element is
  // replaced, so there is nothing to reset and nothing left holding a reference.
  setTimeout(() => caret.classList.remove('is-active'), CARET_LABEL_MS);
  return caret;
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
      data-tour-id="blog.editor.toolbar"
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
const MAX_VISIBLE_PEERS = 5;

function PresenceBar({ synced, connected, peers, followedClientId, onToggleFollow }) {
  const title = synced
    ? 'Live — changes sync in real time'
    : connected
      ? 'Connecting to the live session…'
      : 'Offline — your edits are saved to the draft';
  const visible = peers.slice(0, MAX_VISIBLE_PEERS);
  const overflow = peers.length - visible.length;
  return (
    <div className="cpm-blog-presence" data-tour-id="blog.editor.presence" title={title}>
      <span className={`cpm-blog-presence-dot${synced ? ' is-live' : ''}`} aria-hidden="true" />
      {visible.map((p) => {
        const name = p.user?.name || 'Someone';
        const following = p.clientId === followedClientId;
        return (
          <button
            key={p.clientId}
            type="button"
            className={`cpm-blog-presence-avatar${following ? ' is-following' : ''}`}
            style={{ background: p.user?.color, '--caret-color': p.user?.color }}
            title={following ? `Following ${name} — click to stop` : `${name} is editing — click to follow`}
            onClick={() => onToggleFollow?.(p.clientId)}
          >
            {p.user?.avatarUrl ? (
              <img src={p.user.avatarUrl} alt="" className="cpm-blog-presence-img" />
            ) : (
              name.charAt(0).toUpperCase()
            )}
          </button>
        );
      })}
      {overflow > 0 && (
        <span className="cpm-blog-presence-more" title={`${overflow} more editing`}>{`+${overflow}`}</span>
      )}
    </div>
  );
}

/**
 * Three-position Editing / Suggesting / Viewing control.
 *
 * Which positions exist comes from the resolved access level (see
 * SuggestingMode.js) — a level with only one mode renders nothing, since a
 * one-position switch is just noise.
 */
function ModeControl({ modes, mode, onChange }) {
  if (modes.length < 2) return null;
  return (
    <div className="cpm-blog-mode" role="group" aria-label="Document mode">
      {modes.map((m) => (
        <button
          key={m}
          type="button"
          className={`cpm-blog-mode-btn${m === mode ? ' is-active' : ''}`}
          aria-pressed={m === mode}
          title={MODE_LABELS[m]}
          onClick={() => onChange(m)}
        >
          <i className={`fas ${MODE_ICONS[m]}`} aria-hidden="true" />
          <span className="cpm-blog-mode-label">{MODE_LABELS[m]}</span>
        </button>
      ))}
    </div>
  );
}

const REVIEW_MARKS = ['commentMark', 'suggestInsert', 'suggestDelete'];

/**
 * Thread id of the review mark at `pos`, or null.
 *
 * Both sides of the position are checked: `$pos.marks()` reports the marks the
 * caret would inherit (the node *before* it), which misses a click landing on
 * the very first character of a marked range.
 */
function threadIdAt(state, pos) {
  const $pos = state.doc.resolve(pos);
  const candidates = [...$pos.marks(), ...($pos.nodeAfter?.marks ?? [])];
  const hit = candidates.find(
    (m) => REVIEW_MARKS.includes(m.type.name) && m.attrs?.threadId
  );
  return hit?.attrs.threadId ?? null;
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
 * @param {string}  accessLevel  resolved DocAccessLevel for the current member; decides which
 *                               modes the header offers. Defaults to 'EDIT' so hosts that do not
 *                               resolve access keep today's behaviour.
 * @param {number}  threadsRefreshKey  bump to re-fetch threads (and their anchors) for the decorations
 * @param {function} onThreadPositions  receives Map<threadId, { from, to }> for the comment rail;
 *                                      threads absent from the map are orphaned
 * @param {string}  focusedThreadId  thread whose anchored text is highlighted in the canvas
 * @param {function} onThreadFocus  called with a threadId when the caret lands on
 *                                  commented or suggested text, so the host can
 *                                  reveal that thread in the review panel
 */
export default function BlogEditor({
  content, onChange, editable = true, onEditorReady, postId, collabUser, collabWsUrl,
  theme, onThemeChange, docType = 'BLOG_POST', docId, canEditDoc = true, accessLevel = 'EDIT',
  onAskAi, onThreadsChanged, onThreadFocus, threadsRefreshKey = 0, onThreadPositions,
  focusedThreadId = null,
}) {
  const [showFind, setShowFind] = React.useState(false);
  const [showSnippets, setShowSnippets] = React.useState(false);
  const [showSecLib, setShowSecLib] = React.useState(false);
  const onThreadFocusRef = React.useRef(onThreadFocus);
  onThreadFocusRef.current = onThreadFocus;
  const onThreadsChangedRef = React.useRef(onThreadsChanged);
  onThreadsChangedRef.current = onThreadsChanged;

  // Section settings open only on request — via the palette button on the
  // section's hover toolbar, which fires this event. It used to also open on
  // every selectionUpdate inside a section, which meant the panel reappeared as
  // soon as you clicked back into your text.
  const [settingsPos, setSettingsPos] = React.useState(null);

  React.useEffect(() => {
    const handler = (e) => setSettingsPos(e.detail?.pos ?? null);
    window.addEventListener('blog-section-settings', handler);
    return () => window.removeEventListener('blog-section-settings', handler);
  }, []);

  const closeSettings = React.useCallback(() => setSettingsPos(null), []);
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

  // ── Follow mode ───────────────────────────────────────────────
  // Click a presence avatar to keep that peer's caret centred. Read through a
  // ref inside the awareness handler so following never re-arms that effect
  // (re-arming it would tear down the collab listeners).
  const [followedClientId, setFollowedClientId] = React.useState(null);
  const followedRef = React.useRef(null);
  followedRef.current = followedClientId;
  const editorRef = React.useRef(null);

  const stopFollowing = React.useCallback(() => {
    followedRef.current = null;
    setFollowedClientId(null);
  }, []);

  // Awareness gives no handle on the rendered caret, so follow targets the
  // `data-user-id` renderCaret() stamps on it. rAF lets the decoration for this
  // awareness update land before we measure.
  const scrollToPeerCaret = React.useCallback((userId) => {
    if (!userId) return;
    requestAnimationFrame(() => {
      const dom = editorRef.current?.view?.dom;
      const caret = dom?.querySelector(`.collaboration-carets__caret[data-user-id="${CSS.escape(userId)}"]`);
      caret?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, []);

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
      const visible = states.filter((s) => s.clientId !== selfId && s.user);
      setPeers(visible);

      const followed = followedRef.current;
      if (followed == null) return;
      const peer = visible.find((s) => s.clientId === followed);
      // A followed peer who leaves must release the viewport, not freeze it.
      if (!peer) { stopFollowing(); return; }
      scrollToPeerCaret(peer.user?.id);
    };
    provider.on('status', onStatus);
    provider.on('synced', onSynced);
    provider.on('awarenessUpdate', onAwareness);
    return () => {
      provider.off('status', onStatus);
      provider.off('synced', onSynced);
      provider.off('awarenessUpdate', onAwareness);
    };
  }, [collab, stopFollowing, scrollToPeerCaret]);

  // ── Comment threads (anchors only) ────────────────────────────
  // Threads are fetched here purely so their anchors can be turned into
  // decorations; the review panel keeps its own copy for display.
  const [threads, setThreads] = React.useState([]);
  const onThreadPositionsRef = React.useRef(onThreadPositions);
  onThreadPositionsRef.current = onThreadPositions;

  // Stable across renders so it never re-arms useEditor — a rebuilt editor
  // would drop the collab connection.
  const threadDecoOptions = React.useRef({
    threads: [],
    focusedThreadId: null,
    onPositions: (positions) => onThreadPositionsRef.current?.(positions),
  }).current;

  React.useEffect(() => {
    if (!collab || !reviewDocId) return undefined;
    let cancelled = false;
    listBlogThreads(docType, reviewDocId)
      .then((rows) => { if (!cancelled) setThreads(rows ?? []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [collab, docType, reviewDocId, threadsRefreshKey]);

  const editor = useEditor({
    extensions: blogExtensions(collab ? {
      document: collab.document,
      provider: collab.provider,
      user: {
        id: collabUser?.id ?? null,
        name: collabUser?.name || 'Anonymous',
        color: colorForMember(collabUser?.id),
        avatarUrl: collabUser?.avatarUrl ?? null,
      },
    } : null, {
      docType,
      docId: reviewDocId,
      enabled: canEditDoc && editable,
    }, threadDecoOptions),
    content: collab ? undefined : (content ?? { type: 'doc', content: [{ type: 'paragraph' }] }),
    editable,
    onUpdate: ({ editor: ed }) => { onChange?.(ed.getJSON()); },
    editorProps: {
      // Clicking commented/suggested text reveals its thread. Read through a ref
      // so a new callback identity never rebuilds the editor — that would drop
      // the collab connection on every parent render.
      handleClick: (view, pos, event) => {
        // Comment anchors are decorations, so the mark scan below cannot see
        // them — read the decoration's data attribute off the DOM first.
        const el = event?.target?.closest?.('[data-thread-id]');
        const threadId = el?.getAttribute('data-thread-id') ?? threadIdAt(view.state, pos);
        if (threadId) onThreadFocusRef.current?.(threadId);
        return false; // never swallow the click; the caret still moves
      },
    },
  }, [collab, reviewDocId, docType, canEditDoc, editable]);

  // Anchors resolve against the Yjs binding, so the decoration set is only
  // valid once the doc has synced — and must be rebuilt whenever the thread set
  // changes. Between those, ProseMirror maps the existing set through each
  // transaction, which is what keeps typing cheap with many threads open.
  // Focus is in this dependency list because the focused thread's decoration
  // carries an extra class — highlighting the anchored text is what tells the
  // reader which sentence the card they just clicked is actually about.
  React.useEffect(() => {
    if (!editor || editor.isDestroyed || !collab) return;
    const ext = editor.extensionManager.extensions.find((e) => e.name === 'threadDecorations');
    if (!ext) return;
    ext.options.threads = threads;
    ext.options.focusedThreadId = focusedThreadId ?? null;
    editor.view.dispatch(editor.state.tr.setMeta(threadDecorationsKey, { recompute: true }));
  }, [editor, collab, synced, threads, focusedThreadId]);

  // ── One-shot migration off commentMark ────────────────────────
  // Legacy comments anchored via commentMark predate relative positions.
  // Convert them on first open by an editor, then strip the marks. Documents
  // only ever opened by commenters keep their marks, which is why the
  // commentMark render path stays as a fallback — do not delete it.
  const migratedRef = React.useRef(false);
  React.useEffect(() => {
    if (!editor || editor.isDestroyed || !collab || !synced || !canEditDoc) return;
    if (migratedRef.current) return;
    const pending = threads.filter((t) => t.kind === 'COMMENT' && !t.anchorStart);
    if (!pending.length) return;

    const tr = editor.state.tr;
    let touched = false;
    for (const thread of pending) {
      const ranges = findMarkRanges(editor.state.doc, 'commentMark', thread.id);
      if (!ranges.length) continue;
      const { from, to } = ranges[0];
      const anchor = anchorFromSelection(editor, from, to);
      if (!anchor) continue;
      setBlogThreadAnchor(thread.id, anchor.anchorStart, anchor.anchorEnd).catch(() => {});
      tr.removeMark(from, to, editor.schema.marks.commentMark);
      touched = true;
    }
    if (touched) {
      migratedRef.current = true;
      editor.view.dispatch(tr);
      onThreadsChangedRef.current?.();
    }
  }, [editor, collab, synced, canEditDoc, threads]);

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

  editorRef.current = editor ?? null;

  // Following ends on Esc or on any manual scroll gesture — being dragged
  // around the document with no way out is worse than no follow at all.
  React.useEffect(() => {
    if (followedClientId == null) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') stopFollowing(); };
    const surface = editorRef.current?.view?.dom;
    window.addEventListener('keydown', onKey);
    surface?.addEventListener('wheel', stopFollowing, { passive: true });
    surface?.addEventListener('touchmove', stopFollowing, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      surface?.removeEventListener('wheel', stopFollowing);
      surface?.removeEventListener('touchmove', stopFollowing);
    };
  }, [followedClientId, stopFollowing]);

  const followedPeer = peers.find((p) => p.clientId === followedClientId) ?? null;

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
    { id: 'blog.autocomplete', keys: 'Ctrl/⌘+\\', scope: 'page', pageId: 'Blog Editor', description: 'AI autocomplete (Tab to accept)', action: () => {} },
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

  // ── Document mode ─────────────────────────────────────────────
  // 'viewing' calls setEditable(false). That is a UI affordance only: the real
  // enforcement is the server-side readOnly Hocuspocus connection, which drops
  // writes regardless of what this flag says.
  const modes = useMemo(() => modesFor(accessLevel), [accessLevel]);
  const [mode, setMode] = React.useState(() => defaultMode(accessLevel));
  useEffect(() => { setMode(defaultMode(accessLevel)); }, [accessLevel]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.setEditable(editable && mode !== 'viewing');
    editor.commands.setSuggesting(mode === 'suggesting');
  }, [editor, editable, mode]);

  const words = editor?.storage.characterCount.words() ?? 0;
  const chars = editor?.storage.characterCount.characters() ?? 0;

  return (
    <div className={`cpm-blog-editor${editable ? '' : ' is-readonly'}`}>
      {/* Read-only hosts (the course player renders section prose this way, so a
          second renderer never has to track blogRender.ts) get the document
          only. The formatting bands are inert without an editable editor, and
          the Markdown toggle is not — a reader must not be offered either. */}
      {editable && (
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
          <ModeControl modes={modes} mode={mode} onChange={setMode} />
          {collab && (
            <PresenceBar
              synced={synced}
              connected={connected}
              peers={peers}
              followedClientId={followedClientId}
              onToggleFollow={(clientId) => {
                if (clientId === followedRef.current) { stopFollowing(); return; }
                followedRef.current = clientId;
                setFollowedClientId(clientId);
                scrollToPeerCaret(peers.find((p) => p.clientId === clientId)?.user?.id);
              }}
            />
          )}
        </div>
      )}
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
          data-tour-id="blog.editor.body"
          data-fontpair={theme?.fontPair || 'syne-dmsans'}
          data-width={theme?.width || 'wide'}
          style={{ '--post-accent': theme?.accent || 'var(--pm-accent-teal)' }}
        >
          {followedPeer && (
            <div className="cpm-blog-follow-chip" style={{ '--caret-color': followedPeer.user?.color }}>
              <i className="fas fa-eye" aria-hidden="true" />
              {`Following ${followedPeer.user?.name || 'Someone'} — Esc to stop`}
              <button type="button" className="cpm-blog-follow-stop" onClick={stopFollowing} aria-label="Stop following">
                <i className="fas fa-xmark" aria-hidden="true" />
              </button>
            </div>
          )}
          <EditorContent editor={editor} />
          {editable && reviewDocId && (
            <BlogSelectionBubble
              editor={editor}
              docType={docType}
              docId={reviewDocId}
              canEdit={canEditDoc}
              onThreadCreated={() => onThreadsChanged?.()}
              onAskAi={(text) => onAskAi?.(text)}
            />
          )}
        </div>
      )}
      {editable && (
        <div className="cpm-blog-editor-footer">
          <span>{words} words</span>
          <span>{chars} characters</span>
          {markdownMode && <span className="cpm-blog-markdown-hint">Editing raw Markdown — switch back to rich text to continue formatting. Fonts, sizes, colours and highlights are not represented in Markdown and will be lost on switching back.</span>}
        </div>
      )}
    </div>
  );
}
