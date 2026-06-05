// Admin-only modal to link / change / clear the GitHub repo for a project.
// Mirrors EditDriveFolderModal. Validates by hitting GET /api/github/repo
// before committing the PATCH so we surface "repo not found / no access" inline.

import React, { useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { get, patch } from "../../../api/clubPmClient";
import { parseRepoInput } from "../../../utils/githubUtils";

export default function LinkRepoModal({ projectId, currentRepo, currentBlockOnCiFail, onClose, onSaved }) {
  const [input, setInput] = useState(currentRepo ?? "");
  const [blockOnCiFail, setBlockOnCiFail] = useState(currentBlockOnCiFail ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [validating, setValidating] = useState(false);
  const [validatedStats, setValidatedStats] = useState(null);

  const trimmed = input.trim();
  const parsed = parseRepoInput(trimmed);
  const isEmpty = trimmed.length === 0;
  const isUnchanged = (currentRepo ?? "") === (parsed?.slug ?? trimmed);
  const isInvalid = !isEmpty && !parsed;

  async function validate() {
    if (!parsed) return;
    setValidating(true);
    setError(null);
    try {
      const stats = await get(`/api/github/repo?url=${encodeURIComponent(parsed.slug)}`);
      setValidatedStats(stats);
    } catch (err) {
      if (err?.status === 400 && err?.message?.includes("Connect")) {
        setError("Connect your GitHub account before linking a repo.");
      } else if (err?.status === 404) {
        setError("Repo not found or your GitHub account doesn't have access.");
      } else {
        setError(err?.message ?? "Could not validate repo");
      }
      setValidatedStats(null);
    } finally {
      setValidating(false);
    }
  }

  async function save(nextValue) {
    setSaving(true);
    setError(null);
    try {
      const body = { githubRepo: nextValue };
      if (blockOnCiFail !== currentBlockOnCiFail) body.githubBlockDoneOnCiFail = blockOnCiFail;
      const updated = await patch(`/api/projects/${projectId}`, body);
      toast.success(nextValue ? "GitHub repo linked" : "GitHub repo cleared");
      onSaved?.(updated);
      onClose();
    } catch (err) {
      if (err?.status === 403) {
        setError("Only admins can change the project's GitHub repo.");
      } else {
        setError(err?.message ?? "Failed to update repo");
      }
    } finally {
      setSaving(false);
    }
  }

  async function toggleGating() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await patch(`/api/projects/${projectId}`, { githubBlockDoneOnCiFail: !blockOnCiFail });
      setBlockOnCiFail(!blockOnCiFail);
      toast.success(!blockOnCiFail ? "CI gating enabled" : "CI gating disabled");
      onSaved?.(updated);
    } catch (err) {
      setError(err?.message ?? "Failed to update CI gating");
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (isEmpty || isInvalid || isUnchanged || saving) return;
    if (!validatedStats) {
      await validate();
      return;
    }
    save(parsed.slug);
  }

  function handleClear() {
    if (saving) return;
    save(null);
  }

  return createPortal(
    <div className="cpm-gh-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="cpm-gh-modal" role="dialog" aria-label="Link GitHub repo">
        <div className="cpm-gh-modal-header">
          <span>
            <i className="fab fa-github" style={{ marginRight: 10 }} aria-hidden="true" />
            {currentRepo ? "Change GitHub repo" : "Link GitHub repo"}
          </span>
          <button onClick={onClose} aria-label="Close" className="cpm-gh-modal-close">
            <i className="fas fa-times" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="cpm-gh-modal-body">
          <label className="cpm-gh-label" htmlFor="cpm-gh-repo-input">Repository</label>
          <input
            id="cpm-gh-repo-input"
            type="text"
            autoFocus
            value={input}
            onChange={e => { setInput(e.target.value); setValidatedStats(null); }}
            placeholder="owner/repo or https://github.com/owner/repo"
            className="cpm-gh-input"
          />

          {isInvalid && (
            <p className="cpm-gh-error">Doesn't look like a GitHub repo identifier.</p>
          )}
          {error && <p className="cpm-gh-error">{error}</p>}

          {validatedStats && (
            <div className="cpm-gh-validate-card">
              <strong>{validatedStats.fullName}</strong>
              {validatedStats.description && (
                <p className="cpm-gh-validate-desc">{validatedStats.description}</p>
              )}
              <div className="cpm-gh-validate-stats">
                <span><i className="fas fa-star" aria-hidden="true" /> {validatedStats.stars}</span>
                <span><i className="fas fa-code-fork" aria-hidden="true" /> {validatedStats.forks}</span>
                <span><i className="fas fa-circle-dot" aria-hidden="true" /> {validatedStats.openIssues} open</span>
                <span className="cpm-gh-visibility">{validatedStats.visibility}</span>
              </div>
            </div>
          )}

          <p className="cpm-gh-hint">
            The repo must be visible to your connected GitHub account. Private repos require
            <code> repo </code> scope (granted automatically during OAuth).
          </p>

          {currentRepo && (
            <div className="cpm-gh-toggle-row">
              <label className="cpm-gh-toggle">
                <input
                  type="checkbox"
                  checked={blockOnCiFail}
                  onChange={toggleGating}
                  disabled={saving}
                />
                <span>Block "Done" when linked PR has failing CI</span>
              </label>
              <p className="cpm-gh-hint" style={{ margin: "4px 0 0" }}>
                When on, moving a task to Done is rejected with a 409 if its linked PR's
                most recent check-suite conclusion is <code>failure</code>.
              </p>
            </div>
          )}

          <div className="cpm-gh-modal-footer">
            {currentRepo && (
              <button type="button" className="cpm-gh-modal-clear" onClick={handleClear} disabled={saving}>
                Unlink
              </button>
            )}
            <div style={{ flex: 1 }} />
            <button type="button" className="cpm-gh-modal-cancel" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            {!validatedStats ? (
              <button
                type="submit"
                className="clubpm-btn-primary"
                disabled={isEmpty || isInvalid || isUnchanged || validating || saving}
              >
                {validating ? "Checking…" : "Check repo"}
              </button>
            ) : (
              <button type="submit" className="clubpm-btn-primary" disabled={saving}>
                {saving ? "Saving…" : "Link repo"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
