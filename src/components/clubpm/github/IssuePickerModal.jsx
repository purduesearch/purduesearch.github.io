// Pick one or more issues from the linked GitHub repo and link them to the
// given task. Server posts a back-link comment on each issue.

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { get, post, listProjectRepos } from "../../../api/clubPmClient";
import { formatRelativeTime, labelContrast } from "../../../utils/githubUtils";

export default function IssuePickerModal({ projectId, taskId, onClose, onLinked }) {
  const [stateFilter, setStateFilter] = useState("open");
  const [query, setQuery] = useState("");
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [linking, setLinking] = useState(false);

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

  // Selecting a different repo invalidates any in-progress selection so we
  // never link an issue number picked from another repo's list.
  useEffect(() => { setSelected(new Set()); }, [repoId]);

  useEffect(() => {
    if (!repoId) { setIssues([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    get(`/api/github/repos/${repoId}/issues?state=${stateFilter}`)
      .then(d => { if (!cancelled) setIssues(d.issues ?? []); })
      .catch(err => { if (!cancelled) setError(err?.message ?? "Failed to load"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [repoId, stateFilter]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return issues;
    return issues.filter(i =>
      i.title.toLowerCase().includes(q) ||
      String(i.number).includes(q) ||
      i.labels.some(l => l.name.toLowerCase().includes(q))
    );
  }, [issues, query]);

  function toggle(num) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(num)) next.delete(num); else next.add(num);
      return next;
    });
  }

  async function linkAll() {
    if (selected.size === 0 || !repoId) return;
    setLinking(true);
    let ok = 0, skipped = 0, failed = 0;
    for (const num of selected) {
      try {
        const r = await post(`/api/github/tasks/${taskId}/link`, { kind: "ISSUE", number: num, repoId });
        if (r?.alreadyLinked) skipped++; else ok++;
      } catch {
        failed++;
      }
    }
    setLinking(false);
    if (ok) toast.success(`Linked ${ok} issue${ok === 1 ? "" : "s"}`);
    if (skipped) toast(`Already linked: ${skipped}`);
    if (failed) toast.error(`Failed: ${failed}`);
    onLinked?.();
    onClose();
  }

  return createPortal(
    <div className="cpm-gh-modal-overlay clubpm-portal" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="cpm-gh-modal cpm-gh-picker-modal" role="dialog" aria-label="Link GitHub issue">
        <div className="cpm-gh-modal-header">
          <span>
            <i className="fab fa-github" style={{ marginRight: 10 }} aria-hidden="true" />
            Link a GitHub issue
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
              placeholder="Filter by title, #number, or label…"
              className="cpm-gh-input"
            />
            <div className="cpm-gh-filter-row">
              {["open", "closed", "all"].map(s => (
                <button
                  key={s}
                  className={`cpm-gh-filter-chip ${stateFilter === s ? "is-active" : ""}`}
                  onClick={() => setStateFilter(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {(reposLoading || loading) && <p className="cpm-gh-loading">Loading issues…</p>}
          {error && <p className="cpm-gh-error">{error}</p>}
          {!reposLoading && repos.length === 0 && (
            <p className="cpm-gh-empty">No repositories linked to this project.</p>
          )}
          {!reposLoading && repos.length > 0 && !loading && filtered.length === 0 && (
            <p className="cpm-gh-empty">No matching issues.</p>
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
                  <i
                    className={`fas ${i.state === "closed" ? "fa-circle-check" : "fa-circle-dot"}`}
                    style={{ color: i.state === "closed" ? "var(--cpm-gh-closed)" : "var(--cpm-gh-open)" }}
                    aria-hidden="true"
                  />
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
          <span className="cpm-gh-picker-count">
            {selected.size} selected
          </span>
          <div style={{ flex: 1 }} />
          <button type="button" className="cpm-gh-modal-cancel" onClick={onClose} disabled={linking}>
            Cancel
          </button>
          <button
            type="button"
            className="clubpm-btn-primary"
            onClick={linkAll}
            disabled={selected.size === 0 || linking || !repoId}
          >
            {linking ? "Linking…" : `Link ${selected.size || ""}`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
