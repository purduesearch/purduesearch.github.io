import React, { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { uploadVaultFile } from "../../../api/clubPmClient";

function formatBytes(bytes) {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIdx = 0;
  while (value >= 1024 && unitIdx < units.length - 1) {
    value /= 1024;
    unitIdx += 1;
  }
  return `${value.toFixed(1)} ${units[unitIdx]}`;
}

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
  const isNewVersion = !!item;
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  const handleFile = useCallback((selected) => {
    if (!selected) return;
    setFile(selected);
    setError(null);
    if (!isNewVersion) {
      setName((prev) => prev || defaultNameFromFile(selected.name));
    }
  }, [isNewVersion]);

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
        ? `/api/vault/items/${item.id}/versions`
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
      setUploading(false);
    }
  }

  return createPortal(
    <div
      className="cpm-modal-overlay"
      onClick={(e) => { if (!uploading && e.target === e.currentTarget) onClose(); }}
    >
      <div className="cpm-vault-upload-modal">
        <div className="cpm-vault-upload-header">
          <span className="cpm-vault-upload-title">
            {isNewVersion ? `New check-in — ${item.name}` : "Check in file"}
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
