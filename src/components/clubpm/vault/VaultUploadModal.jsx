import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import MobileSheet from "../MobileSheet";
import { useCompactLayout } from "../../../clubpm/layout/compactLayout";
import toast from "react-hot-toast";
import { uploadVaultFile, checkVaultDuplicates, getVaultUploadJob, retryVaultUploadJob, getVaultRepositoryHealth } from "../../../api/clubPmClient";
import { formatBytes } from "./vaultUtils";

function defaultNameFromFile(fileName) {
  if (!fileName) return "";
  const idx = fileName.lastIndexOf(".");
  return idx === -1 ? fileName : fileName.slice(0, idx);
}

const JOB_ERRORS = {
  AUTH: "GitHub App access expired. Ask an admin to reconnect the installation.",
  PERMISSION: "The App cannot write to this branch. Ask an admin to review repository permissions or branch protection.",
  BRANCH_DRIFT: "The branch changed during upload. Retry against its current head after reviewing repository health.",
  LFS_MISSING: "Git LFS could not return the stored object.",
  LFS_QUOTA: "The repository owner's Git LFS budget stopped this upload.",
  GIT_ERROR: "GitHub could not complete this commit.",
  VERIFY_FAILED: "The uploaded bytes could not be verified after commit.",
};

// Check-in dialog. Mode is derived from whether `item` is passed:
//  - no item  → creating a brand-new vault item (v1), posted to the project's
//    vault/items endpoint.
//  - item     → checking in a new version of that item, posted to the item's
//    versions endpoint.
export default function VaultUploadModal({ project, item, repository, onClose, onDone }) {
  const compact = useCompactLayout();
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [description, setDescription] = useState("");
  const [job, setJob] = useState(null);
  const [stage, setStage] = useState("idle");
  const keyRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  // Set when the backend reports the Vault's Drive account is broken (revoked
  // or expired). The vault does NOT use the project's linked Drive folder — it
  // uses a bot-owned folder — so the fix is always "an admin reconnects Drive",
  // never "share a folder with this address".
  const [driveAccountEmail, setDriveAccountEmail] = useState(null);
  // AI duplicate detection (Pack B): in new-item mode a file select triggers a
  // metadata-only duplicate check; picking a candidate flips this modal into
  // new-version mode for that item instead.
  const [dupCandidates, setDupCandidates] = useState([]);
  const [asVersionOf, setAsVersionOf] = useState(null);

  const targetItem = item ?? asVersionOf;
  const isNewVersion = !!targetItem;

  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) { setPreviewUrl(null); return undefined; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

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

  async function waitForJob(id) {
    for (;;) {
      const { job: current } = await getVaultUploadJob(id);
      setJob(current);
      if (current.state === "INDEXED") {
        toast.success("Check-in stored in repository");
        onDone?.(current);
        onClose();
        return;
      }
      if (current.state === "RETRY" || current.state === "FAILED") {
        setError(`${JOB_ERRORS[current.errorCode] || "Check-in failed."} Your uploaded file is retained for retry.`);
        setStage("retry");
        setUploading(false);
        return;
      }
      setStage(current.state === "COMMITTED" ? "indexing" : "committing");
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  async function handleRetry() {
    if (!job || uploading) return;
    setUploading(true);
    setError(null);
    try {
      const body = job.errorCode === "BRANCH_DRIFT" ? { expectedHeadSha: (await getVaultRepositoryHealth(project.id)).actualHeadSha } : {};
      await retryVaultUploadJob(job.id, body);
      await waitForJob(job.id);
    } catch (err) { setError(err.message || "Retry failed"); setUploading(false); }
  }

  async function handleUpload() {
    if (!file || !note.trim() || uploading) return;
    setUploading(true);
    setError(null);
    setProgress(0);
    try {
      const github = !!repository?.writeEnabled;
      const path = isNewVersion
        ? `/api/vault/items/${targetItem.id}/${github ? "github-versions" : "versions"}`
        : `/api/projects/${project.id}/vault/${github ? "github-items" : "items"}`;
      const fields = isNewVersion
        ? { note: note.trim(), expectedHeadSha: github ? repository.lastHeadSha : undefined }
        : { name: name.trim() || undefined, note: note.trim(), description: description.trim() || undefined, expectedHeadSha: github ? repository.lastHeadSha : undefined };
      if (github && !keyRef.current) keyRef.current = window.crypto.randomUUID();
      setStage("transferring");
      const result = await uploadVaultFile(path, file, fields, setProgress, github ? { "Idempotency-Key": keyRef.current } : {});
      if (github) { setJob(result.job); setStage("committing"); await waitForJob(result.job.id); return; }

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
      setDriveAccountEmail(
        health?.status === "unauthorized" || health?.status === "not-shared"
          ? health.serviceAccountEmail ?? null
          : null
      );
      setStage("retry");
      setUploading(false);
    }
  }

  function handleCopySaEmail() {
    if (!driveAccountEmail) return;
    navigator.clipboard?.writeText(driveAccountEmail)
      .then(() => toast.success("Copied to clipboard"))
      .catch(() => toast.error("Could not copy — copy it manually"));
  }

  const modal = (
    <div
      className={`cpm-modal-overlay${compact ? " pm-shell--compact pm-m-files-layer" : ""}`}
      onClick={(e) => { if (!uploading && e.target === e.currentTarget) onClose(); }}
    >
      <div className="cpm-vault-upload-modal" data-tour-id="vault.upload.form">
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
              {previewUrl && <img className="cpm-vault-upload-preview" src={previewUrl} alt="Selected file preview" />}
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

        {!isNewVersion && <label className="cpm-vault-field"><span>Item description</span><textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} disabled={uploading} placeholder="What is this item for?" /></label>}

        <label className="cpm-vault-field">
          <span>Change description (required)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What changed?"
            rows={3}
            disabled={uploading}
            required
          />
        </label>

        {uploading && (
          <div className="cpm-vault-progress">
            <div className="cpm-vault-progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        )}

        {uploading && <div role="status">{stage === "transferring" ? `Transferring ${Math.round(progress * 100)}%` : stage === "indexing" ? "Commit stored; indexing version…" : "Committing and processing…"}</div>}

        {error && <div className="cpm-vault-upload-error">{error}</div>}
        {job && stage === "retry" && <button type="button" className="clubpm-btn-primary" onClick={handleRetry}>Retry check-in</button>}
        {job?.commitSha && <a href={`https://github.com/${repository?.slug}/commit/${job.commitSha}`} target="_blank" rel="noreferrer">View commit {job.commitSha.slice(0, 8)}</a>}

        {driveAccountEmail && (
          <div className="cpm-vault-sa-row">
            <code className="cpm-vault-sa-email">{driveAccountEmail}</code>
            <button
              type="button"
              className="cpm-vault-copy-btn"
              onClick={handleCopySaEmail}
              title="Copy to clipboard"
              aria-label="Copy connected Drive account email"
            >
              <i className="fas fa-copy" aria-hidden="true" />
            </button>
            <span className="cpm-vault-setup-hint">
              An admin needs to reconnect this Google account for the Vault, then retry.
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
            disabled={!file || !note.trim() || uploading || !!job}
          >
            {uploading ? "Uploading…" : isNewVersion ? "Check in" : "Create item"}
          </button>
        </div>
      </div>
    </div>
  );

  // Phones get the shared full-screen dialog (focus trap, Escape, inert
  // background); the desktop modal is unchanged.
  if (compact) {
    return (
      <MobileSheet
        title={isNewVersion ? `New check-in — ${targetItem.name}` : "Check in file"}
        onClose={() => { if (!uploading) onClose(); }}
        variant="fullscreen"
        className="pm-m-files-layer"
      >
        {modal.props.children}
      </MobileSheet>
    );
  }
  return createPortal(modal, document.body);
}
