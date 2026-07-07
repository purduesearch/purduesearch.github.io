// Bulk-import GitHub issues from the linked repo as ClubPM tasks.
// User selects the issues and ClubPM creates a Task + GitHubLink for each.

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { get, post, listProjectRepos } from "../../../api/clubPmClient";
import { formatRelativeTime, labelContrast } from "../../../utils/githubUtils";

export default function ImportIssuesModal({ projectId, onClose, onImported }) {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [importing, setImporting] = useState(false);
  const [query, setQuery] = useState("");

  // Multi-repo (Workstream B): resolve the project's linked repos and let
  // the user choose which one to browse/import from when there's more than
  // one; silently use the sole repo otherwise.
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

  // Selecting a different repo invalidates any in-progress selection so we
  // never import an issue number picked from another repo's list.
  useEffect(() => { setSelected(new Set()); }, [repoId]);

  useEffect(() => {
    if (!repoId) { setIssues([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    get(`/api/github/repos/${repoId}/issues?state=open`)
      .then(d => { if (!cancelled) setIssues(d.issues ?? []); })
      .catch(err => { if (!cancelled) setError(err?.message ?? "Failed to load"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [repoId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return issues;
    return issues.filter(i =>
      i.title.toLowerCase().includes(q) || String(i.number).includes(q)
    );
  }, [issues, query]);

  function toggle(num) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(num)) next.delete(num); else next.add(num);
      return next;
    });
  }

  function selectAll() { setSelected(new Set(filtered.map(i => i.number))); }
  function clearAll()  { setSelected(new Set()); }

  async function doImport() {
    if (selected.size === 0 || !repoId) return;
    setImporting(true);
    try {
      const result = await post(`/api/github/projects/${projectId}/import-issues`, {
        issueNumbers: [...selected],
        repoId,
      });
      if (result.created) toast.success(`Imported ${result.created} task${result.created === 1 ? "" : "s"}`);
      if (result.skipped) toast(`Skipped (already linked): ${result.skipped}`);
      if (result.errors?.length) toast.error(`${result.errors.length} failed`);
      onImported?.(result);
      onClose();
    } catch (err) {
      toast.error(err?.message ?? "Import failed");
    } finally {
      setImporting(false);
    }
  }

  return createPortal(
    <div className="cpm-gh-modal-overlay clubpm-portal" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="cpm-gh-modal cpm-gh-picker-modal" role="dialog" aria-label="Import GitHub issues">
        <div className="cpm-gh-modal-header">
          <span>
            <i className="fas fa-download" style={{ marginRight: 10 }} aria-hidden="true" />
            Import issues as tasks
          </span>
          <button onClick={onClose} aria-label="Close" className="cpm-gh-modal-close">
            <i className="fas fa-times" aria-hidden="true" />
          </button>
        </div>

        <div className="cpm-gh-modal-body cpm-gh-picker-body">
          <div className="cpm-gh-picker-controls">
            {repos.length > 1 && (
              <select
                className="cpm-gh-input"
                value={repoId ?? ""}
                onChange={e => setRepoId(e.target.value)}
                aria-label="Repository"
              >
                {repos.map(r => (
                  <option key={r.id} value={r.id}>{r.slug}</option>
                ))}
              </select>
            )}
            <input
              type="search"
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Filter open issues…"
              className="cpm-gh-input"
            />
            <div className="cpm-gh-filter-row">
              <button className="cpm-gh-filter-chip" onClick={selectAll}>Select all</button>
              <button className="cpm-gh-filter-chip" onClick={clearAll}>Clear</button>
            </div>
          </div>

          {(reposLoading || loading) && <p className="cpm-gh-loading">Loading issues…</p>}
          {error && <p className="cpm-gh-error">{error}</p>}
          {!reposLoading && repos.length === 0 && (
            <p className="cpm-gh-empty">No repositories linked to this project.</p>
          )}
          {!reposLoading && repos.length > 0 && !loading && filtered.length === 0 && (
            <p className="cpm-gh-empty">No open issues to import.</p>
          )}

          <ul className="cpm-gh-list">
            {filtered.map(i => {
              const isSel = selected.has(i.number);
              return (
                <li
                  key={i.number}
                  className={`cpm-gh-list-row ${isSel ? "is-selected" : ""}`}
                  onClick={() => toggle(i.number)}
                >
                  <input
                    type="checkbox"
                    checked={isSel}
                    onChange={() => toggle(i.number)}
                    onClick={e => e.stopPropagation()}
                  />
                  <i className="fas fa-circle-dot" style={{ color: "var(--cpm-gh-open)" }} aria-hidden="true" />
                  <div className="cpm-gh-list-main">
                    <div className="cpm-gh-list-title">
                      <span>{i.title}</span>
                      <span className="cpm-gh-list-num">#{i.number}</span>
                      {i.labels.slice(0, 3).map(l => (
                        <span
                          key={l.name}
                          className="cpm-gh-label-chip cpm-gh-label-chip-sm"
                          style={{ background: `#${l.color}`, color: labelContrast(l.color) }}
                        >
                          {l.name}
                        </span>
                      ))}
                    </div>
                    <div className="cpm-gh-list-sub">
                      {i.author && <>@{i.author} · </>}
                      updated {formatRelativeTime(i.updatedAt)}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="cpm-gh-modal-footer" style={{ padding: "14px 18px", margin: 0 }}>
          <span className="cpm-gh-picker-count">{selected.size} selected</span>
          <div style={{ flex: 1 }} />
          <button type="button" className="cpm-gh-modal-cancel" onClick={onClose} disabled={importing}>
            Cancel
          </button>
          <button
            type="button"
            className="clubpm-btn-primary"
            onClick={doImport}
            disabled={selected.size === 0 || importing || !repoId}
          >
            {importing ? "Importing…" : `Import ${selected.size || ""}`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
