// Admin-only modal to set / change / clear the Drive folder linked to a project.
// The server enforces the admin check on PATCH /api/projects/:id; this component
// also hides itself behind member.isAdmin in the caller for cosmetic gating.

import React, { useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { patch } from "../../api/clubPmClient";
import { parseDriveUrl } from "../../utils/driveUtils";

export default function EditDriveFolderModal({ projectId, currentLink, onClose, onSaved }) {
  const [url, setUrl] = useState(currentLink ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const trimmed = url.trim();
  const parsed = parseDriveUrl(trimmed);
  const isFolder = parsed.kind === "folder";
  const isEmpty = trimmed.length === 0;
  const isUnchanged = (currentLink ?? "") === trimmed;
  const isInvalid = !isEmpty && parsed.kind === "unknown";

  async function save(nextValue) {
    setSaving(true);
    setError(null);
    try {
      const updated = await patch(`/api/projects/${projectId}`, { driveLink: nextValue });
      toast.success(nextValue ? "Drive folder updated" : "Drive folder cleared");
      onSaved?.(updated);
      onClose();
    } catch (err) {
      if (err?.status === 403) {
        setError("Only admins can change the channel's Drive folder.");
      } else {
        setError(err?.message ?? "Failed to update Drive folder");
      }
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (isEmpty || isInvalid || isUnchanged || saving) return;
    save(trimmed);
  }

  function handleClear() {
    if (saving) return;
    save(null);
  }

  return createPortal(
    <div className="cpm-drive-edit-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="cpm-drive-edit-modal" role="dialog" aria-label="Edit Drive folder">
        <div className="cpm-drive-edit-header">
          <span>
            <i className="fab fa-google-drive" style={{ color: "#4285F4", marginRight: 10 }} aria-hidden="true" />
            {currentLink ? "Change Drive folder" : "Link Drive folder"}
          </span>
          <button onClick={onClose} aria-label="Close" className="cpm-drive-edit-close">
            <i className="fas fa-times" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="cpm-drive-edit-body">
          <label className="cpm-drive-edit-label" htmlFor="cpm-drive-folder-url">
            Folder URL
          </label>
          <input
            id="cpm-drive-folder-url"
            type="url"
            autoFocus
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://drive.google.com/drive/folders/..."
            className="cpm-drive-edit-input"
          />

          {!isEmpty && !isInvalid && !isFolder && (
            <p className="cpm-drive-edit-warn">
              That link points to a {parsed.kind === "unknown" ? "non-Drive resource" : parsed.kind}, not a folder.
              The Files tab and folder browser only work with folder links.
            </p>
          )}
          {isInvalid && (
            <p className="cpm-drive-edit-error">Doesn't look like a Google Drive URL.</p>
          )}
          {error && <p className="cpm-drive-edit-error">{error}</p>}

          <p className="cpm-drive-edit-hint">
            The folder must be shared with the project's Drive service account, otherwise file listing will be empty.
          </p>

          <div className="cpm-drive-edit-footer">
            {currentLink && (
              <button
                type="button"
                className="cpm-drive-edit-clear"
                onClick={handleClear}
                disabled={saving}
              >
                Clear folder
              </button>
            )}
            <div style={{ flex: 1 }} />
            <button type="button" className="cpm-drive-edit-cancel" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button
              type="submit"
              className="clubpm-btn-primary"
              disabled={isEmpty || isInvalid || isUnchanged || saving}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
