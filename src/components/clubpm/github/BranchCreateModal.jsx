// Create a new branch on the linked repo from a task. The server suggests
// a kebab-cased default name; the user can override before submitting.

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { get, post, listProjectRepos } from "../../../api/clubPmClient";

export default function BranchCreateModal({ projectId, taskId, onClose, onCreated }) {
  const [name, setName] = useState("");
  const [base, setBase] = useState("");
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Multi-repo (Workstream B): resolve the project's linked repos and let
  // the user choose a target when there's more than one; silently use the
  // sole repo otherwise.
  const [repos, setRepos] = useState([]);
  const [reposLoading, setReposLoading] = useState(true);
  const [repoId, setRepoId] = useState(null);

  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setReposLoading(true);
    listProjectRepos(projectId)
      .then(d => {
        if (cancelled) return;
        const list = d?.repos ?? [];
        setRepos(list);
        setRepoId(prev => (prev && list.some(r => r.id === prev)) ? prev : (list[0]?.id ?? null));
      })
      .catch(() => { if (!cancelled) setRepos([]); })
      .finally(() => { if (!cancelled) setReposLoading(false); });
    return () => { cancelled = true; };
  }, [projectId]);

  // Branch-name suggestion is task-scoped, not repo-scoped; fetch once.
  useEffect(() => {
    let cancelled = false;
    get(`/api/github/tasks/${taskId}/branch-suggestion`)
      .then(sug => { if (!cancelled) setName(sug?.name ?? ""); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [taskId]);

  // Base-branch options depend on the selected repo.
  useEffect(() => {
    if (!repoId) { setBranches([]); setBase(""); return; }
    let cancelled = false;
    setBase("");
    get(`/api/github/repos/${repoId}/branches`)
      .then(br => { if (!cancelled) setBranches(br?.branches ?? []); })
      .catch(() => { if (!cancelled) setBranches([]); });
    return () => { cancelled = true; };
  }, [repoId]);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim() || loading || !repoId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await post(`/api/github/tasks/${taskId}/branch`, {
        name: name.trim(),
        baseRef: base || undefined,
        repoId,
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
    <div className="cpm-gh-modal-overlay clubpm-portal" onClick={e => e.target === e.currentTarget && onClose()}>
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
          {repos.length > 1 && (
            <>
              <label className="cpm-gh-label" htmlFor="cpm-gh-branch-repo">Repository</label>
              <select
                id="cpm-gh-branch-repo"
                value={repoId ?? ""}
                onChange={e => setRepoId(e.target.value)}
                className="cpm-gh-input"
                style={{ marginBottom: 14 }}
              >
                {repos.map(r => (
                  <option key={r.id} value={r.id}>{r.slug}</option>
                ))}
              </select>
            </>
          )}
          {!reposLoading && repos.length === 0 && (
            <p className="cpm-gh-empty">No repositories linked to this project.</p>
          )}

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
            <button type="submit" className="clubpm-btn-primary" disabled={!name.trim() || loading || !repoId}>
              {loading ? "Creating…" : "Create branch"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
