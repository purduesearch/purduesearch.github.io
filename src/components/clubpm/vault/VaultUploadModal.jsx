import React, { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { uploadVaultFile, checkVaultDuplicates } from "../../../api/clubPmClient";
import { formatBytes } from "./vaultUtils";

function defaultNameFromFile(fileName) {
  if (!fileName) return "";
  const idx = fileName.lastIndexOf(".");
  return idx === -1 ? fileName : fileName.slice(0, idx);
}

// Check-in dialog. Mode is derived from whether `item` is passed:
//  - no item  → creating a brand-new vault item (v1), posted to the project's
//    vault/items endpoint.
//  - item     → checking in a new version of that item, posted to the item's
//    versions endpoint.
export default function VaultUploadModal({ project, item, onClose, onDone }) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  // Set when the backend reports the linked Drive folder isn't shared with
  // the service account — the email the user must share with lives in the
  // 400 body, and this is the only place that failure actually surfaces
  // (the vault health probe is read-only and can't detect it).
  const [notSharedEmail, setNotSharedEmail] = useState(null);
  // AI duplicate detection (Pack B): in new-item mode a file select triggers a
  // metadata-only duplicate check; picking a candidate flips this modal into
  // new-version mode for that item instead.
  const [dupCandidates, setDupCandidates] = useState([]);
  const [asVersionOf, setAsVersionOf] = useState(null);

  const targetItem = item ?? asVersionOf;
  const isNewVersion = !!targetItem;

  const handleFile = useCallback((selected) => {
    if (!selected) return;
    setFile(selected);
    setError(null);
    setDupCandidates([]);
    if (!item && !asVersionOf) {
      setName((prev) => prev || defaultNameFromFile(selected.name));
      checkVaultDuplicates(project.id, { fileName: selected.name })
        .then((res) => setDupCandidates(res.candidates || []))
        .catch(() => setDupCandidates([]));
    }
  }, [item, asVersionOf, project.id]);

  function handleDragEnter(e) { e.preventDefault(); if (!uploading) setDragActive(true); }
  function handleDragOver(e) { e.preventDefault(); if (!uploading) setDragActive(true); }
  function handleDragLeave(e) { e.preventDefault(); setDragActive(false); }
  function handleDrop(e) {
    e.preventDefault();
    setDragActive(false);
    if (uploading) return;
    handleFile(e.dataTransfer.files?.[0]);
  }

  async function handleUpload() {
    if (!file || uploading) return;
    setUploading(true);
    setError(null);
    setProgress(0);
    try {
      const path = isNewVersion
        ? `/api/vault/items/${targetItem.id}/versions`
        : `/api/projects/${project.id}/vault/items`;
      const fields = isNewVersion
        ? { note: note.trim() || undefined }
        : { name: name.trim() || undefined, note: note.trim() || undefined };
      const result = await uploadVaultFile(path, file, fields, setProgress);

      const holder = result?.warning?.checkedOutBy;
      if (holder) {
        toast(`Heads up: ${holder.displayName ?? "someone"} has this checked out — they've been notified`, { icon: "⚠️" });
      } else {
        toast.success(isNewVersion ? "New version checked in" : "Item checked in");
      }

      onDone?.(result);
      onClose();
    } catch (err) {
      setError(err.message || "Upload failed");
      const health = err.body?.health;
      setNotSharedEmail(
        health?.status === "not-shared" ? health.serviceAccountEmail ?? null : null
      );
      setUploading(false);
    }
  }

  function handleCopySaEmail() {
    if (!notSharedEmail) return;
    navigator.clipboard?.writeText(notSharedEmail)
      .then(() => toast.success("Copied to clipboard"))
      .catch(() => toast.error("Could not copy — copy it manually"));
  }

  return createPortal(
    <div
      className="cpm-modal-overlay"
      onClick={(e) => { if (!uploading && e.target === e.currentTarget) onClose(); }}
    >
      <div className="cpm-vault-upload-modal">
        <div className="cpm-vault-upload-header">
          <span className="cpm-vault-upload-title">
            {isNewVersion ? `New check-in — ${targetItem.name}` : "Check in file"}
          </span>
          <button
            type="button"
            className="cpm-vault-modal-close"
            onClick={onClose}
            disabled={uploading}
            aria-label="Close"
          >
            <i className="fas fa-times" aria-hidden="true" />
          </button>
        </div>

        <div
          className={`cpm-vault-dropzone${dragActive ? " active" : ""}${file ? " has-file" : ""}`}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !uploading && inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && !uploading) {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
        >
          <input
            ref={inputRef}
            type="file"
            hidden
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          {file ? (
            <>
              <i className="fas fa-file-circle-check" aria-hidden="true" />
              <div className="cpm-vault-dropzone-filename">{file.name}</div>
              <div className="cpm-vault-dropzone-filesize">{formatBytes(file.size)}</div>
            </>
          ) : (
            <>
              <i className="fas fa-cloud-arrow-up" aria-hidden="true" />
              <div>Drag a file here, or click to browse</div>
            </>
          )}
        </div>

        {!item && asVersionOf && (
          <div className="cpm-vault-dup-flip-note">
            <i className="fas fa-code-branch" aria-hidden="true" />
            <span>Checking in as a new version of <strong>{asVersionOf.name}</strong></span>
            <button
              type="button"
              className="cpm-vault-btn-ghost"
              onClick={() => setAsVersionOf(null)}
              disabled={uploading}
            >
              Keep as new item
            </button>
          </div>
        )}

        {!isNewVersion && dupCandidates.length > 0 && (
          <div className="cpm-vault-dup-warning">
            <div className="cpm-vault-dup-warning-title">
              <i className="fas fa-triangle-exclamation" aria-hidden="true" />
              This might already be in the vault (based on names only):
            </div>
            {dupCandidates.map((c) => (
              <div key={c.itemId} className="cpm-vault-dup-warning-row">
                <span className="cpm-vault-dup-warning-name">
                  {c.name}
                  {c.partNumber && <span className="cpm-vault-chip-part">{c.partNumber}</span>}
                  {c.reason ? ` — ${c.reason}` : ""}
                </span>
                <button
                  type="button"
                  className="cpm-vault-btn-ghost"
                  onClick={() => { setAsVersionOf({ id: c.itemId, name: c.name }); setDupCandidates([]); }}
                  disabled={uploading}
                >
                  Check in as new version instead
                </button>
              </div>
            ))}
          </div>
        )}

        {!isNewVersion && (
          <label className="cpm-vault-field">
            <span>Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Item name"
              disabled={uploading}
            />
          </label>
        )}

        <label className="cpm-vault-field">
          <span>Check-in note</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What changed?"
            rows={3}
            disabled={uploading}
          />
        </label>

        {uploading && (
          <div className="cpm-vault-progress">
            <div className="cpm-vault-progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        )}

        {error && <div className="cpm-vault-upload-error">{error}</div>}

        {notSharedEmail && (
          <div className="cpm-vault-sa-row">
            <code className="cpm-vault-sa-email">{notSharedEmail}</code>
            <button
              type="button"
              className="cpm-vault-copy-btn"
              onClick={handleCopySaEmail}
              title="Copy to clipboard"
              aria-label="Copy service account email"
            >
              <i className="fas fa-copy" aria-hidden="true" />
            </button>
            <span className="cpm-vault-setup-hint">
              Share the project's linked Drive folder with this address as Editor, then retry.
            </span>
          </div>
        )}

        <div className="cpm-vault-upload-actions">
          <button type="button" className="cpm-vault-btn-ghost" onClick={onClose} disabled={uploading}>
            Cancel
          </button>
          <button
            type="button"
            className="clubpm-btn-primary"
            onClick={handleUpload}
            disabled={!file || uploading}
          >
            {uploading ? "Uploading…" : isNewVersion ? "Check in" : "Create item"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
