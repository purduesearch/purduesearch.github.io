// Create a new branch on the linked repo from a task. The server suggests
// a kebab-cased default name; the user can override before submitting.

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { get, post } from "../../../api/clubPmClient";

export default function BranchCreateModal({ projectId, taskId, onClose, onCreated }) {
  const [name, setName] = useState("");
  const [base, setBase] = useState("");
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      get(`/api/github/tasks/${taskId}/branch-suggestion`),
      get(`/api/github/projects/${projectId}/branches`),
    ])
      .then(([sug, br]) => {
        if (cancelled) return;
        setName(sug?.name ?? "");
        setBranches(br?.branches ?? []);
      })
      .catch(() => {});
  }, [projectId, taskId]);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const r = await post(`/api/github/tasks/${taskId}/branch`, {
        name: name.trim(),
        baseRef: base || undefined,
      });
      toast.success(`Branch created: ${r.name}`);
      onCreated?.(r);
      onClose();
    } catch (err) {
      setError(err?.message ?? "Failed to create branch");
    } finally {
      setLoading(false);
    }
  }

  return createPortal(
    <div className="cpm-gh-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="cpm-gh-modal" role="dialog" aria-label="Create branch from task">
        <div className="cpm-gh-modal-header">
          <span>
            <i className="fas fa-code-branch" style={{ marginRight: 10 }} aria-hidden="true" />
            Create branch from task
          </span>
          <button onClick={onClose} aria-label="Close" className="cpm-gh-modal-close">
            <i className="fas fa-times" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={submit} className="cpm-gh-modal-body">
          <label className="cpm-gh-label" htmlFor="cpm-gh-branch-name">Branch name</label>
          <input
            id="cpm-gh-branch-name"
            type="text"
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="feature/project-abc123-fix-login"
            className="cpm-gh-input"
            style={{ fontFamily: "var(--clubpm-font-mono, monospace)" }}
          />
          <p className="cpm-gh-hint">
            Server-suggested; tweak before creating. Spaces and uppercase are converted
            to <code>-</code>.
          </p>

          <label className="cpm-gh-label" htmlFor="cpm-gh-branch-base" style={{ marginTop: 14 }}>
            Base branch
          </label>
          <select
            id="cpm-gh-branch-base"
            value={base}
            onChange={e => setBase(e.target.value)}
            className="cpm-gh-input"
          >
            <option value="">(default branch)</option>
            {branches.map(b => (
              <option key={b.name} value={b.name}>{b.name}</option>
            ))}
          </select>

          {error && <p className="cpm-gh-error">{error}</p>}

          <div className="cpm-gh-modal-footer">
            <div style={{ flex: 1 }} />
            <button type="button" className="cpm-gh-modal-cancel" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="clubpm-btn-primary" disabled={!name.trim() || loading}>
              {loading ? "Creating…" : "Create branch"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
