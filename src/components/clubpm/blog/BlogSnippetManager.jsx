import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { listBlogSnippets, createBlogSnippet, updateBlogSnippet, deleteBlogSnippet } from '../../../api/clubPmClient';

// Modal for managing reusable content snippets. Opened from the editor
// toolbar; "Save selection as snippet" captures the current TipTap selection
// (or the whole doc if nothing is selected), "Insert" injects a snippet's
// contentJson at the cursor.
export default function BlogSnippetManager({ editor, onClose }) {
  const [snippets, setSnippets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listBlogSnippets();
      setSnippets(Array.isArray(list) ? list : []);
    } catch (err) {
      setError(err?.message ?? 'Failed to load snippets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const currentSelectionJson = () => {
    if (!editor) return null;
    const { from, to } = editor.state.selection;
    if (from === to) return editor.getJSON();
    const slice = editor.state.doc.slice(from, to);
    return slice.toJSON();
  };

  const handleSaveNew = async () => {
    const name = newName.trim();
    if (!name || !editor) return;
    setSaving(true);
    try {
      const json = currentSelectionJson();
      const created = await createBlogSnippet(name, json);
      setSnippets((prev) => [created, ...prev]);
      setNewName('');
      toast.success('Snippet saved');
    } catch (err) {
      toast.error(err?.message ?? 'Failed to save snippet');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (snippet) => {
    if (!editor) return;
    try {
      const json = currentSelectionJson();
      const updated = await updateBlogSnippet(snippet.id, { contentJson: json });
      setSnippets((prev) => prev.map((s) => (s.id === snippet.id ? updated : s)));
      toast.success('Snippet updated');
    } catch (err) {
      toast.error(err?.message ?? 'Failed to update snippet');
    }
  };

  const handleRename = async (snippet) => {
    const name = renameValue.trim();
    if (!name || name === snippet.name) { setRenamingId(null); return; }
    try {
      const updated = await updateBlogSnippet(snippet.id, { name });
      setSnippets((prev) => prev.map((s) => (s.id === snippet.id ? updated : s)));
    } catch (err) {
      toast.error(err?.message ?? 'Failed to rename snippet');
    } finally {
      setRenamingId(null);
    }
  };

  const handleDelete = async (snippet) => {
    if (!window.confirm(`Delete snippet "${snippet.name}"?`)) return;
    try {
      await deleteBlogSnippet(snippet.id);
      setSnippets((prev) => prev.filter((s) => s.id !== snippet.id));
    } catch (err) {
      toast.error(err?.message ?? 'Failed to delete snippet');
    }
  };

  const handleInsert = (snippet) => {
    if (!editor || !snippet.contentJson) return;
    editor.chain().focus().insertContent(snippet.contentJson).run();
    onClose();
  };

  return createPortal(
    <div className="cpm-blog-snippet-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cpm-blog-snippet-modal" role="dialog" aria-label="Snippet manager">
        <div className="cpm-blog-snippet-header">
          <span><i className="fas fa-clone" aria-hidden="true" style={{ marginRight: 8 }} />Snippets</span>
          <button type="button" onClick={onClose} aria-label="Close" className="cpm-blog-snippet-close">
            <i className="fas fa-times" aria-hidden="true" />
          </button>
        </div>

        <div className="cpm-blog-snippet-new">
          <input
            type="text"
            className="cpm-blog-embed-input"
            placeholder="Save current selection as…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveNew(); }}
          />
          <button type="button" className="clubpm-btn-primary" onClick={handleSaveNew} disabled={saving || !newName.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
        <p className="cpm-blog-snippet-hint">
          Select text in the editor first to save just that selection; with nothing selected, the whole document is saved.
        </p>

        {error && <p className="cpm-gh-error">{error}</p>}
        {loading ? (
          <div className="cpm-blog-snippet-empty">Loading…</div>
        ) : snippets.length === 0 ? (
          <div className="cpm-blog-snippet-empty">No snippets yet.</div>
        ) : (
          <ul className="cpm-blog-snippet-list">
            {snippets.map((s) => (
              <li key={s.id} className="cpm-blog-snippet-item">
                {renamingId === s.id ? (
                  <input
                    autoFocus
                    className="cpm-blog-embed-input"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleRename(s); if (e.key === 'Escape') setRenamingId(null); }}
                    onBlur={() => handleRename(s)}
                  />
                ) : (
                  <span className="cpm-blog-snippet-name">{s.name}</span>
                )}
                <div className="cpm-blog-snippet-actions">
                  <button type="button" className="cpm-blog-tb-btn" title="Insert" onClick={() => handleInsert(s)}>
                    <i className="fas fa-arrow-turn-down" aria-hidden="true" />
                  </button>
                  <button type="button" className="cpm-blog-tb-btn" title="Overwrite with current selection" onClick={() => handleUpdate(s)}>
                    <i className="fas fa-rotate" aria-hidden="true" />
                  </button>
                  <button type="button" className="cpm-blog-tb-btn" title="Rename" onClick={() => { setRenamingId(s.id); setRenameValue(s.name); }}>
                    <i className="fas fa-pen" aria-hidden="true" />
                  </button>
                  <button type="button" className="cpm-blog-tb-btn" title="Delete" onClick={() => handleDelete(s)}>
                    <i className="fas fa-trash" aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>,
    document.body
  );
}
