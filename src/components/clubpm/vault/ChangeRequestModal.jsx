import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import {
  get,
  getCr,
  createCr,
  patchCr,
  cancelCr,
  approveCr,
  rejectCr,
  getVault,
  getVaultItem,
  aiCrReleaseNotes,
  aiCrImpact,
} from "../../../api/clubPmClient";

const STATUS_LABEL = { OPEN: "Open", APPROVED: "Approved", REJECTED: "Rejected", CANCELLED: "Cancelled" };

// Mirrors vaultService.ts's `nextRevisionLetter` (bijective base-26: A, B, …,
// Z, AA, AB, …) so the client-side "→ Rev X" preview always matches what
// approveCr's transaction will actually stamp. The server always recomputes
// this at approval time — this is a preview only.
function nextRevisionLetter(current) {
  let num = 0;
  if (current) {
    for (const ch of current) num = num * 26 + (ch.charCodeAt(0) - 64);
  }
  num += 1;
  let result = "";
  while (num > 0) {
    const rem = (num - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    num = Math.floor((num - 1) / 26);
  }
  return result;
}

// Create mode (no `crId`): title/reason/task-link/item-picker form, posts a
// new OPEN change request. `preset` (from VaultItemModal's "Request release")
// preseeds the item picker with a single { itemId, versionId } pair.
// View mode (`crId` set): read-only items table + description, an
// author-or-admin-editable releaseNotes textarea while OPEN, reviewNote
// display, and admin Approve/Reject + author-or-admin Cancel actions.
export default function ChangeRequestModal({ project, member, isAdmin, crId, preset, onClose, onChanged }) {
  const isCreate = !crId;
  const [cr, setCr] = useState(null);
  const [loading, setLoading] = useState(!isCreate);
  const [loadError, setLoadError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Create-mode form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [taskId, setTaskId] = useState("");
  const [tasks, setTasks] = useState([]);
  const [vaultItems, setVaultItems] = useState([]);
  const [pickedItems, setPickedItems] = useState([]);
  const [addItemId, setAddItemId] = useState("");
  const presetAppliedRef = useRef(false);

  // View-mode state
  const [releaseNotesDraft, setReleaseNotesDraft] = useState("");
  const [approveNote, setApproveNote] = useState("");
  const [aiDraftBusy, setAiDraftBusy] = useState(false);
  const [impactBusy, setImpactBusy] = useState(false);
  const [impactSummary, setImpactSummary] = useState(null);

  useEffect(() => {
    if (isCreate) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    getCr(crId)
      .then((data) => {
        if (cancelled) return;
        setCr(data);
        setReleaseNotesDraft(data.releaseNotes ?? "");
      })
      .catch((err) => { if (!cancelled) setLoadError(err.message || "Failed to load change request"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isCreate, crId]);

  // Create-mode only: task-link options + vault items for the item picker.
  useEffect(() => {
    if (!isCreate) return;
    get(`/api/projects/${project.id}/tasks`).then(setTasks).catch(() => setTasks([]));
    getVault(project.id).then((data) => setVaultItems(data.items || [])).catch(() => setVaultItems([]));
  }, [isCreate, project.id]);

  const addItem = useCallback(async (itemId) => {
    if (!itemId) return;
    const vi = vaultItems.find((i) => i.id === itemId);
    if (!vi) return;
    setPickedItems((prev) => {
      if (prev.some((p) => p.itemId === itemId)) return prev;
      return [...prev, {
        itemId,
        name: vi.name,
        partNumber: vi.partNumber,
        targetRevision: nextRevisionLetter(vi.currentRevision),
        versionId: vi.latestVersion?.id ?? "",
        versions: vi.latestVersion ? [vi.latestVersion] : [],
        versionsLoading: true,
      }];
    });
    try {
      const full = await getVaultItem(itemId);
      setPickedItems((prev) => prev.map((p) => (p.itemId === itemId
        ? {
            ...p,
            versions: full.versions ?? [],
            versionsLoading: false,
            usedIn: (full.parentLinks ?? []).map((l) => l.parent).filter(Boolean),
          }
        : p)));
    } catch {
      setPickedItems((prev) => prev.map((p) => (p.itemId === itemId ? { ...p, versionsLoading: false } : p)));
    }
  }, [vaultItems]);

  // Apply the "Request release" preset exactly once, once the vault item
  // list has loaded (need item.currentRevision + latestVersion off it).
  useEffect(() => {
    if (!isCreate || !preset?.itemId || presetAppliedRef.current || vaultItems.length === 0) return;
    presetAppliedRef.current = true;
    addItem(preset.itemId).then(() => {
      if (preset.versionId) {
        setPickedItems((prev) => prev.map((p) => (p.itemId === preset.itemId ? { ...p, versionId: preset.versionId } : p)));
      }
    });
  }, [isCreate, preset, vaultItems, addItem]);

  function removeItem(itemId) {
    setPickedItems((prev) => prev.filter((p) => p.itemId !== itemId));
  }

  function setItemVersion(itemId, versionId) {
    setPickedItems((prev) => prev.map((p) => (p.itemId === itemId ? { ...p, versionId } : p)));
  }

  async function handleCreate() {
    if (busy) return;
    const trimmed = title.trim();
    if (!trimmed) { toast.error("Title is required"); return; }
    if (pickedItems.length === 0) { toast.error("Add at least one item"); return; }
    if (pickedItems.some((p) => !p.versionId)) { toast.error("Choose a version for every item"); return; }

    setBusy(true);
    try {
      const created = await createCr(project.id, {
        title: trimmed,
        description: description.trim() || null,
        taskId: taskId || null,
        items: pickedItems.map((p) => ({ itemId: p.itemId, versionId: p.versionId })),
      });
      if ((created?.warnings ?? []).length > 0) {
        toast(`Heads up: ${created.warnings.length} item${created.warnings.length === 1 ? " is" : "s are"} used in other assemblies — review impact`, { icon: "⚠️" });
      }
      toast.success("Change request submitted");
      onChanged?.();
      onClose();
    } catch (err) {
      toast.error(err.message || "Failed to create change request");
    } finally {
      setBusy(false);
    }
  }

  const isAuthor = !!cr?.author && cr.author.id === member?.id;
  const canEditReleaseNotes = !!cr && cr.status === "OPEN" && (isAuthor || isAdmin);
  const canCancel = !!cr && cr.status === "OPEN" && (isAuthor || isAdmin);

  async function handleReleaseNotesBlur() {
    if (!cr || !canEditReleaseNotes) return;
    if (releaseNotesDraft === (cr.releaseNotes ?? "")) return;
    try {
      const updated = await patchCr(cr.id, { releaseNotes: releaseNotesDraft || null });
      setCr(updated);
      onChanged?.();
    } catch (err) {
      toast.error(err.message || "Failed to update release notes");
      setReleaseNotesDraft(cr.releaseNotes ?? "");
    }
  }

  async function handleAiDraft() {
    if (!cr || aiDraftBusy) return;
    setAiDraftBusy(true);
    try {
      const res = await aiCrReleaseNotes(cr.id);
      setReleaseNotesDraft(res.draft || "");
      toast.success("Draft ready — review, edit, then click away to save");
    } catch (err) {
      toast.error(err.message || "Failed to draft release notes");
    } finally {
      setAiDraftBusy(false);
    }
  }

  async function handleImpact() {
    if (!cr || impactBusy) return;
    setImpactBusy(true);
    setImpactSummary(null);
    try {
      const res = await aiCrImpact(cr.id);
      setImpactSummary(res.summary || "No impact information available.");
    } catch (err) {
      toast.error(err.message || "Failed to summarize impact");
    } finally {
      setImpactBusy(false);
    }
  }

  async function handleApprove() {
    if (!cr || busy) return;
    setBusy(true);
    try {
      const updated = await approveCr(cr.id, { reviewNote: approveNote.trim() || undefined });
      setCr(updated);
      toast.success("Change request approved");
      onChanged?.();
    } catch (err) {
      toast.error(err.message || "Failed to approve");
    } finally {
      setBusy(false);
    }
  }

  async function handleRejectConfirmed(reviewNote) {
    if (!cr || busy) return;
    setBusy(true);
    try {
      const updated = await rejectCr(cr.id, { reviewNote: reviewNote || undefined });
      setCr(updated);
      toast.success("Change request rejected");
      onChanged?.();
    } catch (err) {
      toast.error(err.message || "Failed to reject");
    } finally {
      setBusy(false);
    }
  }

  function handleRejectClick() {
    const reviewNote = window.prompt("Reason for rejecting this change request:");
    if (reviewNote === null) return;
    handleRejectConfirmed(reviewNote);
  }

  async function handleCancel() {
    if (!cr || busy) return;
    if (!window.confirm("Cancel this change request?")) return;
    setBusy(true);
    try {
      const updated = await cancelCr(cr.id);
      setCr(updated);
      toast.success("Change request cancelled");
      onChanged?.();
    } catch (err) {
      toast.error(err.message || "Failed to cancel");
    } finally {
      setBusy(false);
    }
  }

  const availableVaultItems = vaultItems.filter((vi) => !pickedItems.some((p) => p.itemId === vi.id));

  return createPortal(
    <div className="cpm-modal-overlay" onClick={(e) => { if (!busy && e.target === e.currentTarget) onClose(); }}>
      <div className="cpm-vault-cr-modal">
        <div className="cpm-vault-upload-header">
          <span className="cpm-vault-upload-title">
            {isCreate ? "New change request" : cr ? `CR-${cr.number} · ${cr.title}` : "Change request"}
          </span>
          <button type="button" className="cpm-vault-modal-close" onClick={onClose} disabled={busy} aria-label="Close">
            <i className="fas fa-times" aria-hidden="true" />
          </button>
        </div>

        {!isCreate && loading && (
          <div className="cpm-vault-loading"><div className="cpm-spinner" /></div>
        )}

        {!isCreate && !loading && loadError && (
          <div className="cpm-vault-placeholder">{loadError}</div>
        )}

        {isCreate && (
          <>
            <label className="cpm-vault-field">
              <span>Title</span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Bracket redesign for v2 mount"
                disabled={busy}
              />
            </label>

            <label className="cpm-vault-field">
              <span>Reason</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What's changing and why?"
                rows={3}
                disabled={busy}
              />
            </label>

            <label className="cpm-vault-field">
              <span>Linked task (optional)</span>
              <select value={taskId} onChange={(e) => setTaskId(e.target.value)} disabled={busy}>
                <option value="">No linked task</option>
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            </label>

            <div className="cpm-vault-field">
              <span>Items to release</span>
              <div className="cpm-vault-item-picker">
                {pickedItems.map((p) => (
                  <div key={p.itemId} className="cpm-vault-item-picker-row">
                    <div className="cpm-vault-item-picker-main">
                      <span className="cpm-vault-item-picker-name">{p.name}</span>
                      {p.partNumber && <span className="cpm-vault-chip-part">{p.partNumber}</span>}
                      <span className="cpm-vault-cr-target-rev">→ Rev {p.targetRevision}</span>
                    </div>
                    {(p.usedIn ?? []).length > 0 && (
                      <div className="cpm-vault-warning-banner">
                        <i className="fas fa-triangle-exclamation" aria-hidden="true" />
                        <span>
                          Used in {p.usedIn.map((u) => `${u.partNumber ? `${u.partNumber} ` : ""}${u.name}`).join(", ")} — review impact
                        </span>
                      </div>
                    )}
                    <select
                      value={p.versionId}
                      onChange={(e) => setItemVersion(p.itemId, e.target.value)}
                      disabled={busy || p.versionsLoading}
                    >
                      {p.versions.map((v) => (
                        <option key={v.id} value={v.id}>v{v.versionNumber} — {v.fileName}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="cpm-vault-btn-ghost"
                      onClick={() => removeItem(p.itemId)}
                      disabled={busy}
                      aria-label={`Remove ${p.name}`}
                    >
                      <i className="fas fa-times" aria-hidden="true" />
                    </button>
                  </div>
                ))}

                <div className="cpm-vault-item-picker-add">
                  <select
                    value={addItemId}
                    onChange={(e) => { const id = e.target.value; setAddItemId(""); addItem(id); }}
                    disabled={busy || availableVaultItems.length === 0}
                  >
                    <option value="">{availableVaultItems.length === 0 ? "No more items to add" : "+ Add an item…"}</option>
                    {availableVaultItems.map((vi) => (
                      <option key={vi.id} value={vi.id}>{vi.name}{vi.partNumber ? ` (${vi.partNumber})` : ""}</option>
                    ))}
                  </select>
                </div>
              </div>
              <span className="cpm-vault-cr-hint">Final letter confirmed at approval.</span>
            </div>
          </>
        )}

        {!isCreate && !loading && !loadError && cr && (
          <>
            <div className={`cpm-vault-cr-status cpm-vault-cr-status-${cr.status.toLowerCase()}`}>
              {STATUS_LABEL[cr.status] ?? cr.status}
            </div>

            <div className="cpm-vault-item-picker read-only">
              {(cr.items ?? []).map((ci) => (
                <div key={ci.id} className="cpm-vault-item-picker-row">
                  <div className="cpm-vault-item-picker-main">
                    <span className="cpm-vault-item-picker-name">{ci.item?.name}</span>
                    {ci.item?.partNumber && <span className="cpm-vault-chip-part">{ci.item.partNumber}</span>}
                    <span className="cpm-vault-chip-version">v{ci.version?.versionNumber}</span>
                    <span className="cpm-vault-cr-target-rev">→ Rev {ci.targetRevision}</span>
                  </div>
                </div>
              ))}
              {(cr.items ?? []).length === 0 && (
                <div className="cpm-vault-placeholder">No items on this change request.</div>
              )}
            </div>

            {cr.description && (
              <div className="cpm-vault-field">
                <span>Reason</span>
                <p className="cpm-vault-cr-description">{cr.description}</p>
              </div>
            )}

            <label className="cpm-vault-field">
              <span>Release notes</span>
              <textarea
                value={releaseNotesDraft}
                onChange={(e) => setReleaseNotesDraft(e.target.value)}
                onBlur={handleReleaseNotesBlur}
                placeholder={canEditReleaseNotes ? "What should reviewers know?" : "No release notes yet."}
                rows={3}
                disabled={busy || !canEditReleaseNotes}
              />
            </label>

            <div className="cpm-vault-cr-ai-actions">
              {canEditReleaseNotes && (
                <button type="button" className="cpm-vault-btn-ghost" onClick={handleAiDraft} disabled={aiDraftBusy || busy}>
                  <i className="fas fa-wand-magic-sparkles" aria-hidden="true" />{" "}
                  {aiDraftBusy ? "Drafting…" : "AI draft"}
                </button>
              )}
              <button type="button" className="cpm-vault-btn-ghost" onClick={handleImpact} disabled={impactBusy || busy}>
                <i className="fas fa-diagram-project" aria-hidden="true" />{" "}
                {impactBusy ? "Analyzing…" : "Impact summary"}
              </button>
            </div>

            {impactSummary && !impactBusy && (
              <div className="cpm-vault-field">
                <span>Impact summary</span>
                <p className="cpm-vault-cr-description">{impactSummary}</p>
              </div>
            )}

            {cr.reviewNote && (
              <div className="cpm-vault-field">
                <span>Review note</span>
                <p className="cpm-vault-cr-description">{cr.reviewNote}</p>
              </div>
            )}

            {isAdmin && cr.status === "OPEN" && (
              <label className="cpm-vault-field">
                <span>Approval note (optional)</span>
                <input type="text" value={approveNote} onChange={(e) => setApproveNote(e.target.value)} disabled={busy} />
              </label>
            )}
          </>
        )}

        <div className="cpm-vault-upload-actions">
          {isCreate ? (
            <>
              <button type="button" className="cpm-vault-btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
              <button type="button" className="clubpm-btn-primary" onClick={handleCreate} disabled={busy}>
                {busy ? "Submitting…" : "Submit change request"}
              </button>
            </>
          ) : cr && (
            <>
              {canCancel && (
                <button type="button" className="cpm-vault-btn-danger" onClick={handleCancel} disabled={busy}>
                  Cancel request
                </button>
              )}
              {isAdmin && cr.status === "OPEN" && (
                <>
                  <button type="button" className="cpm-vault-btn-danger" onClick={handleRejectClick} disabled={busy}>
                    Reject
                  </button>
                  <button type="button" className="clubpm-btn-primary" onClick={handleApprove} disabled={busy}>
                    Approve
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
