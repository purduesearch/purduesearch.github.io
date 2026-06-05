// Renders a GitHub pull request: body + review status + CI status + diff totals.

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { get } from "../../../api/clubPmClient";
import { formatRelativeTime } from "../../../utils/githubUtils";

const REVIEW_LABEL = {
  APPROVED:          { text: "Approved",          icon: "fa-check-circle",  color: "var(--cpm-gh-ok, #1f883d)" },
  CHANGES_REQUESTED: { text: "Changes requested", icon: "fa-times-circle",  color: "var(--cpm-gh-bad, #cf222e)" },
  PENDING:           { text: "Review pending",    icon: "fa-hourglass-half",color: "var(--cpm-gh-mid, #9a6700)" },
  COMMENTED:         { text: "Commented",         icon: "fa-comment",       color: "var(--cpm-gh-mid, #9a6700)" },
  NONE:              { text: "No reviews",        icon: "fa-eye",           color: "var(--clubpm-text-secondary, #888)" },
};

const CHECKS_LABEL = {
  success: { text: "Checks passing", icon: "fa-check-circle", color: "var(--cpm-gh-ok, #1f883d)" },
  failure: { text: "Checks failing", icon: "fa-times-circle", color: "var(--cpm-gh-bad, #cf222e)" },
  pending: { text: "Checks running", icon: "fa-clock",        color: "var(--cpm-gh-mid, #9a6700)" },
  none:    { text: "No checks",      icon: "fa-circle",       color: "var(--clubpm-text-secondary, #888)" },
};

function stateMeta(pr) {
  if (pr.merged) return { text: "Merged", icon: "fa-code-merge", color: "var(--cpm-gh-merged, #8957e5)" };
  if (pr.state === "closed") return { text: "Closed", icon: "fa-circle-xmark", color: "var(--cpm-gh-bad, #cf222e)" };
  if (pr.draft) return { text: "Draft", icon: "fa-pen-ruler", color: "var(--clubpm-text-secondary, #888)" };
  return { text: "Open", icon: "fa-code-pull-request", color: "var(--cpm-gh-ok, #1f883d)" };
}

export default function PrPreviewModal({ projectId, number, onClose }) {
  const [pr, setPr] = useState(null);
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
    get(`/api/github/projects/${projectId}/pulls/${number}`)
      .then(data => { if (!cancelled) setPr(data); })
      .catch(err => { if (!cancelled) setError(err?.message ?? "Failed to load PR"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId, number]);

  const sMeta = pr ? stateMeta(pr) : null;
  const rMeta = pr ? REVIEW_LABEL[pr.reviewState] ?? REVIEW_LABEL.NONE : null;
  const cMeta = pr ? CHECKS_LABEL[pr.checksStatus] ?? CHECKS_LABEL.none : null;

  return createPortal(
    <div className="cpm-gh-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="cpm-gh-preview-modal" role="dialog" aria-label={`Pull request #${number}`}>
        <div className="cpm-gh-preview-header">
          <div className="cpm-gh-preview-title-row">
            {sMeta && <i className={`fas ${sMeta.icon}`} style={{ color: sMeta.color, fontSize: 18 }} aria-hidden="true" />}
            <span className="cpm-gh-preview-title">
              {pr?.title ?? `Pull request #${number}`}
              <span className="cpm-gh-preview-number">#{number}</span>
            </span>
          </div>
          <div className="cpm-gh-preview-actions">
            {pr && (
              <a href={pr.url} target="_blank" rel="noopener noreferrer" className="cpm-gh-preview-external">
                Open on GitHub <i className="fas fa-external-link-alt" aria-hidden="true" />
              </a>
            )}
            <button onClick={onClose} aria-label="Close" className="cpm-gh-modal-close">
              <i className="fas fa-times" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="cpm-gh-preview-body">
          {loading && <p className="cpm-gh-loading">Loading pull request…</p>}
          {error && <p className="cpm-gh-error">{error}</p>}
          {pr && (
            <>
              <div className="cpm-gh-pr-badges">
                <span className="cpm-gh-pr-badge" style={{ color: sMeta.color }}>
                  <i className={`fas ${sMeta.icon}`} aria-hidden="true" /> {sMeta.text}
                </span>
                <span className="cpm-gh-pr-badge" style={{ color: rMeta.color }}>
                  <i className={`fas ${rMeta.icon}`} aria-hidden="true" /> {rMeta.text}
                </span>
                <span className="cpm-gh-pr-badge" style={{ color: cMeta.color }}>
                  <i className={`fas ${cMeta.icon}`} aria-hidden="true" /> {cMeta.text}
                </span>
              </div>

              <div className="cpm-gh-preview-meta">
                {pr.author && (
                  <span className="cpm-gh-author">
                    {pr.authorAvatar && <img src={pr.authorAvatar} alt="" className="cpm-gh-avatar" />}
                    <span>@{pr.author}</span>
                  </span>
                )}
                <span className="cpm-gh-meta-dot">·</span>
                <span>
                  <code>{pr.headRef}</code> → <code>{pr.baseRef}</code>
                </span>
                <span className="cpm-gh-meta-dot">·</span>
                <span>updated {formatRelativeTime(pr.updatedAt)}</span>
              </div>

              <div className="cpm-gh-diff-summary">
                <span className="cpm-gh-diff-files">{pr.changedFiles} {pr.changedFiles === 1 ? "file" : "files"}</span>
                <span className="cpm-gh-diff-add">+{pr.additions}</span>
                <span className="cpm-gh-diff-del">−{pr.deletions}</span>
              </div>

              <div className="cpm-gh-markdown">
                {pr.body ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{pr.body}</ReactMarkdown>
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
