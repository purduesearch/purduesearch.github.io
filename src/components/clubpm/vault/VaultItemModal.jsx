import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import MobileSheet from "../MobileSheet";
import { useCompactLayout } from "../../../clubpm/layout/compactLayout";
import {
  getVaultItem,
  patchVaultItem,
  deleteVaultItem,
  checkoutVaultItem,
  releaseVaultCheckout,
  promoteVaultItem,
  getVaultItemHistory,
  getVaultVersionDownloadUrl,
  uploadVaultFile,
  getVault,
  addVaultBomLink,
  updateVaultBomLink,
  removeVaultBomLink,
  setVaultDrawingFor,
  apiBaseUrl,
} from "../../../api/clubPmClient";
import { formatRelativeTime } from "../../../utils/driveUtils";
import { formatBytes, isPreviewable, CR_STATUS_LABEL } from "./vaultUtils";
import VaultUploadModal from "./VaultUploadModal";
import ChangeRequestModal from "./ChangeRequestModal";
import VaultChangesView from "./VaultChangesView";
import VaultVersionThumbnail from "./VaultVersionThumbnail";
import VaultWatchButton from "./VaultWatchButton";

// three.js is ~150+ kB gzip — VaultModelViewer must only ever be reached via
// React.lazy so it lands in its own chunk instead of the main bundle.
// (vaultUtils is a dependency-free leaf module, safe to import eagerly.)
const VaultModelViewer = lazy(() => import("./VaultModelViewer"));

// VaultCompareView imports VaultModelViewer eagerly, which is fine only
// because this import itself stays lazy — three.js still never reaches the
// main chunk.
const VaultCompareView = lazy(() => import("./VaultCompareView"));

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "versions", label: "Versions" },
  { id: "changes", label: "Changes" },
  { id: "3d", label: "3D" },
  { id: "bom", label: "BOM" },
  { id: "requests", label: "Release requests" },
  { id: "history", label: "History" },
];

// `actor` on history rows may come back as a plain label or a member-shaped
// object depending on whether the audit event has a linked member — handle
// both without assuming the exact backend shape.
function actorLabel(actor) {
  if (!actor) return "Someone";
  if (typeof actor === "string") return actor;
  return actor.displayName ?? actor.name ?? "Someone";
}

export default function VaultItemModal({ itemId, project, member, isAdmin, repository, onClose, onChanged, initialVersionId = null }) {
  const compact = useCompactLayout();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  // A deep link to one version (notification, search result) opens Versions on it.
  const [activeTab, setActiveTab] = useState(initialVersionId ? "versions" : "overview");
  const highlightRef = useRef(null);
  const [nameDraft, setNameDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [crPreset, setCrPreset] = useState(null);
  const [history, setHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [bomPickerItems, setBomPickerItems] = useState(null);
  const [addChildId, setAddChildId] = useState("");
  const [bomBusy, setBomBusy] = useState(false);
  const [selected3dVersionId, setSelected3dVersionId] = useState(null);
  const checkoutNoteRef = useRef("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getVaultItem(itemId);
      setItem(data);
      setNameDraft(data?.name ?? "");
      setDescriptionDraft(data?.description ?? "");
    } catch (err) {
      setLoadError(err.message || "Failed to load item");
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!loading && activeTab === "versions" && initialVersionId) highlightRef.current?.scrollIntoView?.({ block: "center" });
  }, [loading, activeTab, initialVersionId]);

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
      const updated = await uploadVaultFile(`/api/vault/versions/${versionId}/thumbnail`, blob);
      setItem((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          versions: (prev.versions ?? []).map((v) =>
            v.id === versionId ? { ...v, thumbnailFileId: updated.thumbnailFileId, thumbnailPath: updated.thumbnailPath } : v
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

  async function handleDescriptionBlur() {
    if (!item || descriptionDraft.trim() === (item.description || "")) return;
    try { await patchVaultItem(item.id, { description: descriptionDraft.trim() }); await load(); notifyChanged(); }
    catch (err) { toast.error(err.message || "Could not save description"); setDescriptionDraft(item.description || ""); }
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

  // Lazy-load the project's vault item list the first time the BOM tab opens
  // (feeds the add-component picker).
  useEffect(() => {
    if (activeTab !== "bom" || bomPickerItems !== null) return;
    getVault(project.id)
      .then((data) => setBomPickerItems(data.items || []))
      .catch(() => setBomPickerItems([]));
  }, [activeTab, bomPickerItems, project.id]);

  async function handleAddChild() {
    if (!addChildId || bomBusy) return;
    setBomBusy(true);
    try {
      await addVaultBomLink(itemId, { childItemId: addChildId });
      setAddChildId("");
      await load();
      notifyChanged();
    } catch (err) {
      toast.error(err.message || "Failed to add component");
    } finally {
      setBomBusy(false);
    }
  }

  async function handleSetChildQty(childItemId, quantity) {
    if (quantity < 1 || bomBusy) return;
    setBomBusy(true);
    try {
      // Explicit PATCH (not re-POST): the add endpoint is create-only so a
      // stale client can't silently clobber someone else's quantity. Patch
      // the edge into local state instead of reloading the whole item.
      const edge = await updateVaultBomLink(itemId, childItemId, { quantity });
      setItem((prev) => prev && ({
        ...prev,
        childLinks: (prev.childLinks ?? []).map((e) =>
          e.childId === childItemId ? { ...e, quantity: edge.quantity, note: edge.note } : e
        ),
      }));
    } catch (err) {
      toast.error(err.message || "Failed to update quantity");
    } finally {
      setBomBusy(false);
    }
  }

  async function handleDownload(versionId) {
    try {
      // <a href> can't carry the Bearer header, so fetch a short-lived
      // signed URL and navigate to it.
      const { url } = await getVaultVersionDownloadUrl(versionId);
      window.location.assign(`${apiBaseUrl}${url}`);
    } catch (err) {
      toast.error(err.message || "Failed to start download");
    }
  }

  async function handleDrawingFor(drawingForId) {
    if (bomBusy) return;
    setBomBusy(true);
    try {
      await setVaultDrawingFor(itemId, drawingForId || null);
      await load();
      notifyChanged();
    } catch (err) {
      toast.error(err.message || "Failed to link drawing");
    } finally {
      setBomBusy(false);
    }
  }

  async function handleRemoveChild(childItemId) {
    if (bomBusy) return;
    setBomBusy(true);
    try {
      await removeVaultBomLink(itemId, childItemId);
      await load();
      notifyChanged();
    } catch (err) {
      toast.error(err.message || "Failed to remove component");
    } finally {
      setBomBusy(false);
    }
  }

  const isHolder = !!item?.checkedOutBy && item.checkedOutBy.id === member?.id;
  const canRelease = isHolder || isAdmin;
  const canDelete = (!!item?.createdBy && item.createdBy.id === member?.id) || isAdmin;

  const modal = (
    <>
      {!compact && <div className="cpm-vault-item-panel-overlay" onClick={onClose} />}
      <div className="cpm-vault-item-panel" data-tour-id="vault.item.modal">
        {!compact && (
          <button type="button" className="cpm-vault-modal-close" onClick={onClose} aria-label="Close">
            <i className="fas fa-times" aria-hidden="true" />
          </button>
        )}

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
                  <button type="button" className="cpm-vault-btn-ghost" data-tour-id="vault.checkout" onClick={onClickCheckout} disabled={busy}>
                    <i className="fas fa-pen" aria-hidden="true" /> Check out
                  </button>
                )}
                {item.checkedOutById && canRelease && (
                  <button type="button" className="cpm-vault-btn-ghost" data-tour-id="vault.release" onClick={handleRelease} disabled={busy}>
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
                  data-tour-id="vault.item.upload"
                  onClick={() => setShowUpload(true)}
                  disabled={busy}
                >
                  <i className="fas fa-file-arrow-up" aria-hidden="true" /> New check-in
                </button>
                <VaultWatchButton itemId={item.id} />
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
                  data-tour-id={{ versions: "vault.versions", bom: "vault.bom" }[t.id]}
                  className={`cpm-vault-pill${activeTab === t.id ? " active" : ""}`}
                  onClick={() => setActiveTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {activeTab === "overview" && <div className="cpm-vault-overview"><label className="cpm-vault-field"><span>Item description</span><textarea value={descriptionDraft} onChange={e => setDescriptionDraft(e.target.value)} onBlur={handleDescriptionBlur} rows={3} placeholder="Describe this part or assembly" /></label><p>Latest check-in: {item.versions?.[0]?.note || "None"}</p><p>Storage: {item.versions?.[0]?.storageProvider === "GITHUB" ? "Stored in GitHub" : "Stored in Drive"}. Release: {item.currentRevision ? `Rev ${item.currentRevision} approved in ClubPM` : "Not released"}.</p><p>Open change requests: {(item.crItems || []).filter(ci => ci.changeRequest.status === "OPEN").length}</p></div>}

            {activeTab === "versions" && (
              <div className="cpm-vault-version-list">
                {(item.versions ?? []).map((v) => (
                  <div
                    key={v.id}
                    ref={v.id === initialVersionId ? highlightRef : undefined}
                    className={`cpm-vault-version-row${v.id === initialVersionId ? " cpm-vault-version-row--linked" : ""}`}
                    aria-current={v.id === initialVersionId ? "true" : undefined}
                  >
                    <div className="cpm-vault-version-main">
                      <VaultVersionThumbnail version={v} />
                      <span className="cpm-vault-version-number">v{v.versionNumber}</span>
                      <span className="cpm-vault-version-filename" title={v.fileName}>{v.fileName}</span>
                      {v.sizeBytes != null && <span className="cpm-vault-version-size">{formatBytes(v.sizeBytes)}</span>}
                      {v.revision && <span className="cpm-vault-chip-rev">Rev {v.revision}</span>}
                      <span className="cpm-vault-chip-version">{v.storageProvider === "GITHUB" ? "GitHub stored" : "Drive stored"}</span>
                    </div>
                    <div className="cpm-vault-version-meta">
                      <span>by {v.uploadedBy?.displayName ?? "Unknown"}</span>
                      {v.note && <span className="cpm-vault-version-note">"{v.note}"</span>}
                      <span>{v.createdAt ? new Date(v.createdAt).toLocaleString() : ""}</span>
                    </div>
                    {v.sha256 && <div className="cpm-vault-version-meta">SHA-256 <code>{v.sha256}</code>{v.lfsOid && <span> · LFS {v.lfsOid.slice(0, 12)}</span>}</div>}
                    {v.commitSha && <div className="cpm-vault-version-meta">Commit <code>{v.commitSha}</code> <button type="button" className="cpm-vault-btn-ghost" onClick={() => navigator.clipboard.writeText(v.commitSha).then(() => toast.success("SHA copied"))}>Copy SHA</button> <a href={`https://github.com/${repository?.slug}/commit/${v.commitSha}`} target="_blank" rel="noreferrer">Commit</a> {v.filePath && <a href={`https://github.com/${repository?.slug}/blob/${v.commitSha}/${v.filePath.split("/").map(encodeURIComponent).join("/")}`} target="_blank" rel="noreferrer">File</a>} <span>{v.filePath}</span></div>}
                    <div className="cpm-vault-version-actions">
                      <button type="button" className="cpm-vault-btn-ghost" onClick={() => handleDownload(v.id)}>
                        <i className="fas fa-download" aria-hidden="true" /> Download
                      </button>
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
                            selected3dVersion.thumbnailFileId || selected3dVersion.thumbnailPath
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

            {activeTab === "changes" && <VaultChangesView versions={item.versions || []} repository={repository} />}

            {activeTab === "compare" && (
              <div className="cpm-vault-3d-tab">
                {previewableVersions.length < 2 ? (
                  <div className="cpm-vault-placeholder">
                    Need at least two previewable versions (STL/OBJ/GLB) to compare here. For measured differences — including STEP files — use the Changes tab.
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

            {activeTab === "bom" && (
              <div className="cpm-vault-bom-tab">
                <div className="cpm-vault-field">
                  <span>Components</span>
                  {(item.childLinks ?? []).length === 0 ? (
                    <div className="cpm-vault-placeholder">No components linked yet.</div>
                  ) : (
                    (item.childLinks ?? []).map((edge) => (
                      <div key={edge.childId} className="cpm-vault-bom-row">
                        <span className="cpm-vault-bom-name">
                          {edge.child?.name}
                          {edge.child?.partNumber && <span className="cpm-vault-chip-part">{edge.child.partNumber}</span>}
                        </span>
                        <span className="cpm-vault-bom-qty">
                          <button
                            type="button"
                            className="cpm-vault-btn-ghost"
                            aria-label="Decrease quantity"
                            disabled={bomBusy || edge.quantity <= 1}
                            onClick={() => handleSetChildQty(edge.childId, edge.quantity - 1)}
                          >
                            <i className="fas fa-minus" aria-hidden="true" />
                          </button>
                          <span className="cpm-vault-bom-qty-value">×{edge.quantity}</span>
                          <button
                            type="button"
                            className="cpm-vault-btn-ghost"
                            aria-label="Increase quantity"
                            disabled={bomBusy}
                            onClick={() => handleSetChildQty(edge.childId, edge.quantity + 1)}
                          >
                            <i className="fas fa-plus" aria-hidden="true" />
                          </button>
                        </span>
                        <button
                          type="button"
                          className="cpm-vault-btn-ghost"
                          aria-label={`Remove ${edge.child?.name}`}
                          disabled={bomBusy}
                          onClick={() => handleRemoveChild(edge.childId)}
                        >
                          <i className="fas fa-times" aria-hidden="true" />
                        </button>
                      </div>
                    ))
                  )}

                  <div className="cpm-vault-bom-add">
                    <select
                      value={addChildId}
                      onChange={(e) => setAddChildId(e.target.value)}
                      disabled={bomBusy || bomPickerItems === null}
                    >
                      <option value="">
                        {bomPickerItems === null ? "Loading items…" : "+ Add a component…"}
                      </option>
                      {(bomPickerItems ?? [])
                        .filter((vi) => vi.id !== itemId && !(item.childLinks ?? []).some((e) => e.childId === vi.id))
                        .map((vi) => (
                          <option key={vi.id} value={vi.id}>
                            {vi.name}{vi.partNumber ? ` (${vi.partNumber})` : ""}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      className="clubpm-btn-primary"
                      onClick={handleAddChild}
                      disabled={bomBusy || !addChildId}
                    >
                      Add
                    </button>
                  </div>
                </div>

                <div className="cpm-vault-field" data-tour-id="vault.drawingFor">
                  <span>Drawing</span>
                  {(item.drawings ?? []).length > 0 ? (
                    <div className="cpm-vault-placeholder">
                      Documented by {item.drawings.map((d) => `${d.partNumber ? `${d.partNumber} ` : ""}${d.name}${d.currentRevision ? ` Rev ${d.currentRevision}` : " (unreleased)"}`).join(", ")}.
                    </div>
                  ) : (
                    <select
                      aria-label="This item is the drawing of"
                      value={item.drawingForId || ""}
                      onChange={(e) => handleDrawingFor(e.target.value)}
                      disabled={bomBusy || bomPickerItems === null}
                    >
                      <option value="">Not a drawing</option>
                      {(bomPickerItems ?? [])
                        .filter((i) => i.id !== itemId && !i.drawingForId)
                        .map((i) => (
                          <option key={i.id} value={i.id}>Drawing of {i.partNumber ? `${i.partNumber} ` : ""}{i.name}</option>
                        ))}
                    </select>
                  )}
                </div>

                <div className="cpm-vault-field">
                  <span>Where used</span>
                  {(item.parentLinks ?? []).length === 0 ? (
                    <div className="cpm-vault-placeholder">Not used in any assembly.</div>
                  ) : (
                    (item.parentLinks ?? []).map((edge) => (
                      <div key={edge.parentId} className="cpm-vault-bom-row">
                        <span className="cpm-vault-bom-name">
                          {edge.parent?.name}
                          {edge.parent?.partNumber && <span className="cpm-vault-chip-part">{edge.parent.partNumber}</span>}
                        </span>
                        <span className="cpm-vault-bom-qty-value">×{edge.quantity}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {activeTab === "requests" && (
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
                        {ci.changeRequest.prRepoSlug && <a href={`https://github.com/${ci.changeRequest.prRepoSlug}/pull/${ci.changeRequest.prNumber}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>PR #{ci.changeRequest.prNumber} · {ci.changeRequest.prSnapshot?.state || "pending"} · {ci.changeRequest.prSnapshot?.checks?.some(check => ["failure", "cancelled", "timed_out"].includes(check.conclusion)) ? "checks failing" : "GitHub checks in CR"}</a>}
                        {ci.changeRequest.prRepoSlug && <div className="cpm-vault-pr-item-detail">Head {ci.changeRequest.prSnapshot?.headSha?.slice(0, 12) || "unknown"} · Reviews: {(ci.changeRequest.prSnapshot?.reviews || []).map(review => `${review.login} ${review.state}`).join(", ") || "pending"} · Checks: {(ci.changeRequest.prSnapshot?.checks || []).map(check => `${check.name} ${check.conclusion || check.status}`).join(", ") || "pending"}<details><summary>PR timeline</summary>{(ci.changeRequest.prSnapshot?.timeline || []).map((event, index) => <div key={index}>{event.at?.slice(0, 10)} · {event.actor || "GitHub"} · {event.label}</div>)}</details></div>}
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
                  {(history ?? []).length === 0 && !(item.versions ?? []).some(v => v.commitSha) ? (
                    <div className="cpm-vault-placeholder">No history yet.</div>
                  ) : (
                    [...(history ?? []), ...(item.versions ?? []).filter(v => v.commitSha).map(v => ({ id: `commit-${v.id}`, actor: v.uploadedBy, action: `stored v${v.versionNumber} in GitHub`, at: v.createdAt, commitSha: v.commitSha, note: v.note }))].sort((a, b) => new Date(b.at) - new Date(a.at)).map((h) => (
                      <div key={h.id} className="cpm-vault-history-row">
                        <div className="cpm-vault-history-line">
                          <strong>{actorLabel(h.actor)}</strong> {h.action}{" "}
                          <span className="cpm-vault-history-time">{formatRelativeTime(h.at)}</span>
                        </div>
                        {h.commitSha && <div><a href={`https://github.com/${repository?.slug}/commit/${h.commitSha}`} target="_blank" rel="noreferrer">Commit {h.commitSha.slice(0, 12)}</a> · {h.note}. Stored file; release requires ClubPM approval.</div>}
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
          repository={repository}
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
    </>
  );

  // Phone: the docked side panel becomes a full-screen dialog. Metadata,
  // versions/history, BOM, check-out/release, download, and the change-request
  // actions are the same controls — nothing is dropped.
  if (compact) {
    return (
      <MobileSheet
        title={item?.name ?? "Vault item"}
        onClose={onClose}
        variant="fullscreen"
        className="pm-m-files-layer pm-m-vault-item-layer"
      >
        {modal.props.children}
      </MobileSheet>
    );
  }
  return createPortal(modal, document.body);
}
