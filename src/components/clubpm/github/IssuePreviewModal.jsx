// Renders a GitHub issue inside a portal modal. Body uses react-markdown
// (already in package.json) with remark-gfm for tables/strikethrough/task-lists.

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { get } from "../../../api/clubPmClient";
import { formatRelativeTime, labelContrast } from "../../../utils/githubUtils";

export default function IssuePreviewModal({ repoId, number, onClose }) {
  const [issue, setIssue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    get(`/api/github/repos/${repoId}/issues/${number}`)
      .then(data => { if (!cancelled) setIssue(data); })
      .catch(err => { if (!cancelled) setError(err?.message ?? "Failed to load issue"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [repoId, number]);

  const stateIcon = issue?.state === "closed" ? "fa-circle-check" : "fa-circle-dot";
  const stateColor = issue?.state === "closed" ? "var(--cpm-gh-closed, #8957e5)" : "var(--cpm-gh-open, #1f883d)";

  return createPortal(
    <div className="cpm-gh-modal-overlay clubpm-portal" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="cpm-gh-preview-modal" role="dialog" aria-label={`Issue #${number}`}>
        <div className="cpm-gh-preview-header">
          <div className="cpm-gh-preview-title-row">
            <i className={`fas ${stateIcon}`} style={{ color: stateColor, fontSize: 18 }} aria-hidden="true" />
            <span className="cpm-gh-preview-title">
              {issue?.title ?? `Issue #${number}`}
              <span className="cpm-gh-preview-number">#{number}</span>
            </span>
          </div>
          <div className="cpm-gh-preview-actions">
            {issue && (
              <a href={issue.url} target="_blank" rel="noopener noreferrer" className="cpm-gh-preview-external">
                Open on GitHub <i className="fas fa-external-link-alt" aria-hidden="true" />
              </a>
            )}
            <button onClick={onClose} aria-label="Close" className="cpm-gh-modal-close">
              <i className="fas fa-times" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="cpm-gh-preview-body">
          {loading && <p className="cpm-gh-loading">Loading issue…</p>}
          {error && <p className="cpm-gh-error">{error}</p>}
          {issue && (
            <>
              <div className="cpm-gh-preview-meta">
                {issue.author && (
                  <span className="cpm-gh-author">
                    {issue.authorAvatar && <img src={issue.authorAvatar} alt="" className="cpm-gh-avatar" />}
                    <span>@{issue.author}</span>
                  </span>
                )}
                <span className="cpm-gh-meta-dot">·</span>
                <span>opened {formatRelativeTime(issue.createdAt)}</span>
                {issue.closedAt && (
                  <>
                    <span className="cpm-gh-meta-dot">·</span>
                    <span>closed {formatRelativeTime(issue.closedAt)}</span>
                  </>
                )}
              </div>

              {issue.labels?.length > 0 && (
                <div className="cpm-gh-labels">
                  {issue.labels.map(l => (
                    <span
                      key={l.name}
                      className="cpm-gh-label-chip"
                      style={{ background: `#${l.color}`, color: labelContrast(l.color) }}
                    >
                      {l.name}
                    </span>
                  ))}
                </div>
              )}

              {issue.assignees?.length > 0 && (
                <div className="cpm-gh-assignees">
                  <span className="cpm-gh-meta-label">Assignees:</span>
                  {issue.assignees.map(a => (
                    <span key={a.login} className="cpm-gh-assignee">
                      <img src={a.avatarUrl} alt="" className="cpm-gh-avatar" />
                      @{a.login}
                    </span>
                  ))}
                </div>
              )}

              <div className="cpm-gh-markdown">
                {issue.body ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{issue.body}</ReactMarkdown>
                ) : (
                  <p className="cpm-gh-empty">No description provided.</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
