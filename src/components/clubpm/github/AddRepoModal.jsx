// Admin-only modal to add a linked GitHub repo to a project (multi-repo,
// Workstream B — see docs/superpowers/specs/2026-07-06-clubpm-drive-multirepo-design.md §4).
// Always APPENDS a new ProjectRepo via POST /api/github/projects/:id/repos —
// it never edits or unlinks an existing repo (see GitHubPanel's per-repo CI
// gating toggle + remove button for that). Validates by hitting
// GET /api/github/repo before committing the POST so we surface
// "repo not found / no access" inline.

import React, { useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { get, addProjectRepo } from "../../../api/clubPmClient";
import { parseRepoInput } from "../../../utils/githubUtils";

export default function AddRepoModal({ projectId, onClose, onSaved }) {
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [validating, setValidating] = useState(false);
  const [validatedStats, setValidatedStats] = useState(null);

  const trimmed = input.trim();
  const parsed = parseRepoInput(trimmed);
  const isEmpty = trimmed.length === 0;
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
        setError("Connect your GitHub account before adding a repo.");
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

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const created = await addProjectRepo(projectId, parsed.slug);
      toast.success("GitHub repo added");
      onSaved?.(created);
      onClose();
    } catch (err) {
      if (err?.status === 403) {
        setError("Only admins can add a repo to this project.");
      } else if (err?.status === 409) {
        setError("This repo is already linked to the project.");
      } else if (err?.status === 404) {
        setError("Repo not found or your GitHub account doesn't have access.");
      } else {
        setError(err?.message ?? "Failed to add repo");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (isEmpty || isInvalid || saving) return;
    if (!validatedStats) {
      await validate();
      return;
    }
    save();
  }

  return createPortal(
    <div className="cpm-gh-modal-overlay clubpm-portal" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="cpm-gh-modal" role="dialog" aria-label="Add GitHub repo">
        <div className="cpm-gh-modal-header">
          <span>
            <i className="fab fa-github" style={{ marginRight: 10 }} aria-hidden="true" />
            Add GitHub repo
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

          <div className="cpm-gh-modal-footer">
            <div style={{ flex: 1 }} />
            <button type="button" className="cpm-gh-modal-cancel" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            {!validatedStats ? (
              <button
                type="submit"
                className="clubpm-btn-primary"
                disabled={isEmpty || isInvalid || validating || saving}
              >
                {validating ? "Checking…" : "Check repo"}
              </button>
            ) : (
              <button type="submit" className="clubpm-btn-primary" disabled={saving}>
                {saving ? "Adding…" : "Add repo"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
