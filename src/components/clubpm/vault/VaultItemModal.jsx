import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import {
  getVaultItem,
  patchVaultItem,
  deleteVaultItem,
  checkoutVaultItem,
  releaseVaultCheckout,
  promoteVaultItem,
  getVaultItemHistory,
  vaultDownloadUrl,
  uploadVaultFile,
} from "../../../api/clubPmClient";
import VaultUploadModal from "./VaultUploadModal";
import ChangeRequestModal from "./ChangeRequestModal";

// three.js is ~150+ kB gzip — VaultModelViewer must only ever be reached via
// React.lazy so it lands in its own chunk instead of the main bundle.
const VaultModelViewer = lazy(() => import("./VaultModelViewer"));

// VaultCompareView imports VaultModelViewer eagerly, which is fine only
// because this import itself stays lazy — three.js still never reaches the
// main chunk.
const VaultCompareView = lazy(() => import("./VaultCompareView"));

// Kept intentionally separate from VaultModelViewer's internal copy of this
// logic: a static import of that module here would pull three.js into this
// chunk, defeating the lazy-load split above.
const PREVIEWABLE_EXTENSIONS = new Set(["stl", "obj", "gltf", "glb"]);
function extensionOf(fileName) {
  if (!fileName) return "";
  const idx = fileName.lastIndexOf(".");
  return idx === -1 ? "" : fileName.slice(idx + 1).toLowerCase();
}
function isPreviewable(fileName) {
  return PREVIEWABLE_EXTENSIONS.has(extensionOf(fileName));
}

const TABS = [
  { id: "versions", label: "Versions" },
  { id: "3d", label: "3D" },
  { id: "compare", label: "Compare" },
  { id: "changes", label: "Changes" },
  { id: "history", label: "History" },
];

const CR_STATUS_LABEL = { OPEN: "Open", APPROVED: "Approved", REJECTED: "Rejected", CANCELLED: "Cancelled" };

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

function timeAgo(iso) {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

// `actor` on history rows may come back as a plain label or a member-shaped
// object depending on whether the audit event has a linked member — handle
// both without assuming the exact backend shape.
function actorLabel(actor) {
  if (!actor) return "Someone";
  if (typeof actor === "string") return actor;
  return actor.displayName ?? actor.name ?? "Someone";
}

export default function VaultItemModal({ itemId, project, member, isAdmin, onClose, onChanged }) {
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [activeTab, setActiveTab] = useState("versions");
  const [nameDraft, setNameDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [crPreset, setCrPreset] = useState(null);
  const [history, setHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selected3dVersionId, setSelected3dVersionId] = useState(null);
  const checkoutNoteRef = useRef("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getVaultItem(itemId);
      setItem(data);
      setNameDraft(data?.name ?? "");
    } catch (err) {
      setLoadError(err.message || "Failed to load item");
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (activeTab !== "history" || !itemId) return;
    let cancelled = false;
    setHistoryLoading(true);
    getVaultItemHistory(itemId)
      .then((rows) => { if (!cancelled) setHistory(rows); })
      .catch((err) => {
        console.error("Failed to load vault item history", err);
        if (!cancelled) setHistory([]);
      })
      .finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [activeTab, itemId]);

  const previewableVersions = useMemo(
    () => (item?.versions ?? []).filter((v) => isPreviewable(v.fileName)),
    [item]
  );

  // Default the 3D-tab version picker to the latest previewable version
  // whenever the item (re)loads, and keep the selection valid if versions
  // are added/removed underneath it.
  useEffect(() => {
    if (previewableVersions.length === 0) {
      setSelected3dVersionId(null);
      return;
    }
    setSelected3dVersionId((current) =>
      previewableVersions.some((v) => v.id === current) ? current : previewableVersions[0].id
    );
  }, [previewableVersions]);

  const selected3dVersion = previewableVersions.find((v) => v.id === selected3dVersionId) ?? null;

  async function handleThumbnailCaptured(versionId, blob) {
    try {
      await uploadVaultFile(`/api/vault/versions/${versionId}/thumbnail`, blob);
      setItem((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          versions: (prev.versions ?? []).map((v) =>
            v.id === versionId ? { ...v, thumbnailFileId: v.thumbnailFileId || "pending" } : v
          ),
        };
      });
      notifyChanged();
    } catch (err) {
      console.error("[VaultItemModal] thumbnail capture upload failed", err);
    }
  }

  function notifyChanged() { onChanged?.(); }

  async function handleNameBlur() {
    const trimmed = nameDraft.trim();
    if (!item || !trimmed || trimmed === item.name) {
      setNameDraft(item?.name ?? "");
      return;
    }
    try {
      await patchVaultItem(item.id, { name: trimmed });
      await load();
      notifyChanged();
    } catch (err) {
      toast.error(err.message || "Failed to rename item");
      setNameDraft(item.name);
    }
  }

  async function handleCheckout(force = false) {
    if (!item || busy) return;
    setBusy(true);
    try {
      await checkoutVaultItem(item.id, { note: checkoutNoteRef.current || undefined, force });
      await load();
      notifyChanged();
      toast.success("Checked out");
    } catch (err) {
      if (err.status === 409 && !force) {
        const proceed = window.confirm(
          `${err.message || "Someone else already has this checked out."} Force checkout anyway?`
        );
        if (proceed) {
          setBusy(false);
          await handleCheckout(true);
          return;
        }
      } else {
        toast.error(err.message || "Checkout failed");
      }
    } finally {
      setBusy(false);
    }
  }

  function onClickCheckout() {
    checkoutNoteRef.current = window.prompt("Optional check-out note (visible to teammates):") ?? "";
    handleCheckout(false);
  }

  async function handleRelease() {
    if (!item || busy) return;
    setBusy(true);
    try {
      await releaseVaultCheckout(item.id);
      await load();
      notifyChanged();
      toast.success("Checkout released");
    } catch (err) {
      toast.error(err.message || "Failed to release checkout");
    } finally {
      setBusy(false);
    }
  }

  async function handlePromote() {
    if (!item || busy) return;
    setBusy(true);
    try {
      await promoteVaultItem(item.id);
      await load();
      notifyChanged();
      toast.success("Promoted to a part");
    } catch (err) {
      toast.error(err.message || "Failed to promote item");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!item || busy) return;
    if (!window.confirm(`Delete "${item.name}"? This can't be undone.`)) return;
    setBusy(true);
    try {
      await deleteVaultItem(item.id);
      toast.success("Item deleted");
      notifyChanged();
      onClose();
    } catch (err) {
      toast.error(err.message || "Failed to delete item");
      setBusy(false);
    }
  }

  function handleUploadDone() {
    setShowUpload(false);
    load();
    notifyChanged();
  }

  const isHolder = !!item?.checkedOutBy && item.checkedOutBy.id === member?.id;
  const canRelease = isHolder || isAdmin;
  const canDelete = (!!item?.createdBy && item.createdBy.id === member?.id) || isAdmin;

  return createPortal(
    <>
      <div className="cpm-vault-item-panel-overlay" onClick={onClose} />
      <div className="cpm-vault-item-panel">
        <button type="button" className="cpm-vault-modal-close" onClick={onClose} aria-label="Close">
          <i className="fas fa-times" aria-hidden="true" />
        </button>

        {loading ? (
          <div className="cpm-vault-loading"><div className="cpm-spinner" /></div>
        ) : loadError ? (
          <div className="cpm-vault-placeholder">{loadError}</div>
        ) : item ? (
          <>
            <div className="cpm-vault-item-header">
              <input
                type="text"
                className="cpm-vault-item-name-input"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={handleNameBlur}
                disabled={busy}
              />

              <div className="cpm-vault-card-chips">
                {item.partNumber && <span className="cpm-vault-chip-part">{item.partNumber}</span>}
                {item.currentRevision ? (
                  <span className="cpm-vault-chip-rev">Rev {item.currentRevision}</span>
                ) : (
                  <span className="cpm-vault-chip-unreleased">Unreleased</span>
                )}
              </div>

              {item.checkedOutBy && (
                <div className="cpm-vault-checkout-note">
                  <i className="fas fa-pen" aria-hidden="true" /> Checked out by {item.checkedOutBy.displayName}
                  {item.checkoutNote ? ` — "${item.checkoutNote}"` : ""}
                </div>
              )}

              <div className="cpm-vault-item-actions">
                {!item.checkedOutById && (
                  <button type="button" className="cpm-vault-btn-ghost" onClick={onClickCheckout} disabled={busy}>
                    <i className="fas fa-pen" aria-hidden="true" /> Check out
                  </button>
                )}
                {item.checkedOutById && canRelease && (
                  <button type="button" className="cpm-vault-btn-ghost" onClick={handleRelease} disabled={busy}>
                    <i className="fas fa-lock-open" aria-hidden="true" /> Release
                  </button>
                )}
                {!item.partNumber && (
                  <button type="button" className="cpm-vault-btn-ghost" onClick={handlePromote} disabled={busy}>
                    <i className="fas fa-arrow-up" aria-hidden="true" /> Promote to Part
                  </button>
                )}
                <button
                  type="button"
                  className="clubpm-btn-primary"
                  onClick={() => setShowUpload(true)}
                  disabled={busy}
                >
                  <i className="fas fa-file-arrow-up" aria-hidden="true" /> New check-in
                </button>
                {canDelete && (
                  <button type="button" className="cpm-vault-btn-danger" onClick={handleDelete} disabled={busy}>
                    <i className="fas fa-trash-alt" aria-hidden="true" /> Delete
                  </button>
                )}
              </div>
            </div>

            <div className="cpm-vault-subnav" role="tablist" aria-label="Item detail">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === t.id}
                  className={`cpm-vault-pill${activeTab === t.id ? " active" : ""}`}
                  onClick={() => setActiveTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {activeTab === "versions" && (
              <div className="cpm-vault-version-list">
                {(item.versions ?? []).map((v) => (
                  <div key={v.id} className="cpm-vault-version-row">
                    <div className="cpm-vault-version-main">
                      <span className="cpm-vault-version-number">v{v.versionNumber}</span>
                      <span className="cpm-vault-version-filename" title={v.fileName}>{v.fileName}</span>
                      {v.sizeBytes != null && <span className="cpm-vault-version-size">{formatBytes(v.sizeBytes)}</span>}
                      {v.revision && <span className="cpm-vault-chip-rev">Rev {v.revision}</span>}
                    </div>
                    <div className="cpm-vault-version-meta">
                      <span>by {v.uploadedBy?.displayName ?? "Unknown"}</span>
                      {v.note && <span className="cpm-vault-version-note">"{v.note}"</span>}
                    </div>
                    <div className="cpm-vault-version-actions">
                      <a className="cpm-vault-btn-ghost" href={vaultDownloadUrl(v.id)}>
                        <i className="fas fa-download" aria-hidden="true" /> Download
                      </a>
                      <button
                        type="button"
                        className="cpm-vault-btn-ghost"
                        onClick={() => setCrPreset({ itemId: item.id, versionId: v.id })}
                      >
                        Request release
                      </button>
                    </div>
                  </div>
                ))}
                {(item.versions ?? []).length === 0 && (
                  <div className="cpm-vault-placeholder">No versions yet.</div>
                )}
              </div>
            )}

            {activeTab === "3d" && (
              <div className="cpm-vault-3d-tab">
                {previewableVersions.length === 0 ? (
                  <div className="cpm-vault-placeholder">
                    No preview — check in an STL/OBJ/GLB export alongside the native file.
                  </div>
                ) : (
                  <>
                    <label className="cpm-vault-field cpm-vault-3d-version-select">
                      <span>Version</span>
                      <select
                        value={selected3dVersionId ?? ""}
                        onChange={(e) => setSelected3dVersionId(e.target.value)}
                      >
                        {previewableVersions.map((v) => (
                          <option key={v.id} value={v.id}>
                            v{v.versionNumber} · {v.fileName}
                          </option>
                        ))}
                      </select>
                    </label>

                    {selected3dVersion && (
                      <Suspense
                        fallback={
                          <div className="cpm-vault-model-viewer">
                            <div className="cpm-vault-model-viewer-overlay">
                              <div className="cpm-spinner" />
                              <span>Loading viewer…</span>
                            </div>
                          </div>
                        }
                      >
                        <VaultModelViewer
                          key={selected3dVersion.id}
                          versionId={selected3dVersion.id}
                          fileName={selected3dVersion.fileName}
                          onCaptureThumbnail={
                            selected3dVersion.thumbnailFileId
                              ? undefined
                              : (blob) => handleThumbnailCaptured(selected3dVersion.id, blob)
                          }
                        />
                      </Suspense>
                    )}
                  </>
                )}
              </div>
            )}

            {activeTab === "compare" && (
              <div className="cpm-vault-3d-tab">
                {previewableVersions.length < 2 ? (
                  <div className="cpm-vault-placeholder">
                    Need at least two previewable versions (STL/OBJ/GLB) to compare.
                  </div>
                ) : (
                  <Suspense
                    fallback={
                      <div className="cpm-vault-model-viewer">
                        <div className="cpm-vault-model-viewer-overlay">
                          <div className="cpm-spinner" />
                          <span>Loading viewer…</span>
                        </div>
                      </div>
                    }
                  >
                    <VaultCompareView versions={previewableVersions} />
                  </Suspense>
                )}
              </div>
            )}

            {activeTab === "changes" && (
              <div className="cpm-vault-version-list">
                {(item.crItems ?? []).length === 0 ? (
                  <div className="cpm-vault-placeholder">No linked change requests yet.</div>
                ) : (
                  (item.crItems ?? []).map((ci) => (
                    <div key={ci.id} className="cpm-vault-version-row">
                      <div className="cpm-vault-version-main">
                        <span className="cpm-vault-version-number">CR-{ci.changeRequest.number}</span>
                        <span className="cpm-vault-version-filename" title={ci.changeRequest.title}>
                          {ci.changeRequest.title}
                        </span>
                        <span className={`cpm-vault-cr-status cpm-vault-cr-status-${ci.changeRequest.status.toLowerCase()}`}>
                          {CR_STATUS_LABEL[ci.changeRequest.status] ?? ci.changeRequest.status}
                        </span>
                        <span className="cpm-vault-chip-rev">→ Rev {ci.targetRevision}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === "history" && (
              historyLoading ? (
                <div className="cpm-vault-loading"><div className="cpm-spinner" /></div>
              ) : (
                <div className="cpm-vault-history-list">
                  {(history ?? []).length === 0 ? (
                    <div className="cpm-vault-placeholder">No history yet.</div>
                  ) : (
                    history.map((h) => (
                      <div key={h.id} className="cpm-vault-history-row">
                        <div className="cpm-vault-history-line">
                          <strong>{actorLabel(h.actor)}</strong> {h.action}{" "}
                          <span className="cpm-vault-history-time">{timeAgo(h.at)}</span>
                        </div>
                        {Array.isArray(h.metadata?.changes) && h.metadata.changes.length > 0 && (
                          <ul className="cpm-vault-history-changes">
                            {h.metadata.changes.map((c, i) => (
                              <li key={i}>{c.field}: {String(c.from)} → {String(c.to)}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )
            )}
          </>
        ) : null}
      </div>

      {showUpload && (
        <VaultUploadModal
          project={project}
          item={item}
          onClose={() => setShowUpload(false)}
          onDone={handleUploadDone}
        />
      )}

      {crPreset && (
        <ChangeRequestModal
          project={project}
          member={member}
          isAdmin={isAdmin}
          preset={crPreset}
          onClose={() => setCrPreset(null)}
          onChanged={() => { setCrPreset(null); notifyChanged(); }}
        />
      )}
    </>,
    document.body
  );
}
