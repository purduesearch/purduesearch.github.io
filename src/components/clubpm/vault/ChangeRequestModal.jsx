import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import MobileSheet from "../MobileSheet";
import { useCompactLayout } from "../../../clubpm/layout/compactLayout";
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
  getCrReviewStatus,
  linkCrPr,
  syncCrPr,
  signoffCr,
  revokeCrSignoff,
  getCrReadiness,
} from "../../../api/clubPmClient";
import { CR_STATUS_LABEL, nextRevisionLetter, notifyCrCountChanged } from "./vaultUtils";
import { ReadinessPanel, ReleasePanel } from "./VaultReleasePanels";

// Create mode (no `crId`): title/reason/task-link/item-picker form, posts a
// new OPEN change request. `preset` (from VaultItemModal's "Request release")
// preseeds the item picker with a single { itemId, versionId } pair.
// View mode (`crId` set): read-only items table + description, an
// author-or-admin-editable releaseNotes textarea while OPEN, reviewNote
// display, and admin Approve/Reject + author-or-admin Cancel actions.
export default function ChangeRequestModal({ project, member, isAdmin, crId, preset, onClose, onChanged }) {
  const compact = useCompactLayout();
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
  const [review, setReview] = useState(null);
  const [prInput, setPrInput] = useState("");
  const [readiness, setReadiness] = useState(null);
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [readinessError, setReadinessError] = useState(null);

  const loadReadiness = useCallback(async () => {
    if (!crId) return;
    setReadinessLoading(true);
    setReadinessError(null);
    try { setReadiness(await getCrReadiness(crId)); }
    catch (err) { setReadinessError(err.message || "Failed to check build readiness"); }
    finally { setReadinessLoading(false); }
  }, [crId]);

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
        getCrReviewStatus(crId).then((status) => { if (!cancelled) setReview(status); }).catch(() => {});
        loadReadiness();
      })
      .catch((err) => { if (!cancelled) setLoadError(err.message || "Failed to load change request"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isCreate, crId, loadReadiness]);

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
      notifyCrCountChanged();
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

  // All three decisions share the same lifecycle: busy-guard, call the API,
  // swap in the updated CR, refresh the admin badge count, toast, notify.
  async function runCrAction(action, successMsg, failMsg) {
    if (!cr || busy) return;
    setBusy(true);
    try {
      const updated = await action();
      setCr(updated);
      loadReadiness();
      toast.success(successMsg);
      notifyCrCountChanged();
      onChanged?.();
    } catch (err) {
      toast.error(err.message || failMsg);
    } finally {
      setBusy(false);
    }
  }

  function handleApprove() {
    runCrAction(
      () => approveCr(cr.id, { reviewNote: approveNote.trim() || undefined }),
      "Change request approved",
      "Failed to approve"
    );
  }

  async function reviewAction(action) {
    if (!cr || busy) return;
    setBusy(true);
    try {
      const status = await action();
      setReview(status);
      const updated = await getCr(cr.id);
      setCr(updated);
      loadReadiness();
      onChanged?.();
    } catch (err) { toast.error(err.message || "Review action failed"); }
    finally { setBusy(false); }
  }

  function handleLinkPr() {
    const match = prInput.trim().match(/^(?:https:\/\/github\.com\/)?([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/pull\/(\d+)\/?$/);
    if (!match) { toast.error("Enter a GitHub PR URL or owner/repo/pull/number"); return; }
    reviewAction(() => linkCrPr(cr.id, { repoSlug: match[1], number: Number(match[2]) }));
  }

  function handleRejectClick() {
    const reviewNote = window.prompt("Reason for rejecting this change request:");
    if (reviewNote === null) return;
    runCrAction(
      () => rejectCr(cr.id, { reviewNote: reviewNote || undefined }),
      "Change request rejected",
      "Failed to reject"
    );
  }

  function handleCancel() {
    if (!window.confirm("Cancel this change request?")) return;
    runCrAction(() => cancelCr(cr.id), "Change request cancelled", "Failed to cancel");
  }

  const availableVaultItems = vaultItems.filter((vi) => !pickedItems.some((p) => p.itemId === vi.id));

  const modal = (
    <div className={`cpm-modal-overlay${compact ? " pm-shell--compact pm-m-files-layer" : ""}`} onClick={(e) => { if (!busy && e.target === e.currentTarget) onClose(); }}>
      <div className="cpm-vault-cr-modal" data-tour-id={isCreate ? "cr.form" : "cr.modal"}>
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
              {CR_STATUS_LABEL[cr.status] ?? cr.status}
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

            <section className="cpm-vault-review-panel" data-tour-id="cr.prReview">
              <h3>Release review</h3>
              <strong className={`cpm-vault-review-state cpm-vault-review-state-${review?.state || "pending"}`}>{review?.state || "pending"}</strong>
              {(review?.reasons || []).map((reason) => <div key={reason}>{reason}</div>)}
              {cr.status === "OPEN" && (cr.authorId === member?.id || isAdmin) && <div className="cpm-vault-pr-link-form"><input aria-label="GitHub PR URL" placeholder="owner/repo/pull/123" value={prInput} onChange={(e) => setPrInput(e.target.value)} /><button type="button" className="cpm-vault-btn-ghost" disabled={busy} onClick={handleLinkPr}>Link PR</button></div>}
              {cr.prRepoSlug && <>
                <div><a href={`https://github.com/${cr.prRepoSlug}/pull/${cr.prNumber}`} target="_blank" rel="noopener noreferrer">{review?.pr?.title || `PR #${cr.prNumber}`}</a> · {review?.pr?.state || "unknown"} · head {review?.pr?.headSha?.slice(0, 12) || "unknown"}</div>
                <button type="button" className="cpm-vault-btn-ghost" disabled={busy} onClick={() => reviewAction(() => syncCrPr(cr.id))}>Refresh PR</button>
                <div>GitHub reviews: {(review?.pr?.reviews || []).map(r => `${r.login}: ${r.state}`).join(", ") || "none"}</div>
                <div>Checks: {(review?.pr?.checks || []).map(c => `${c.name}: ${c.conclusion || c.status}`).join(", ") || "none"}</div>
              </>}
              <h4>Required sign-off</h4>
              {(review?.required || []).length ? review.required.map(r => {
                const rule = review.rules.find(rule => rule.id === r.ruleId);
                return <div key={r.ruleId}>{rule?.reviewer?.displayName || "Reviewer"} · {rule?.scope === "BOM_PARENT" ? "BOM parent" : "Subsystem"} {rule?.value} · {r.state === "unauthorized" ? "lost project access — admin must update rules" : r.state}</div>;
              }) : <div>No reviewer rules match these items.</div>}
              {cr.status === "OPEN" && review?.required?.some(r => r.reviewerId === member?.id) && <div><button type="button" className="cpm-vault-btn-ghost" disabled={busy} onClick={() => reviewAction(() => signoffCr(cr.id))}>Sign off on this version and PR head</button><button type="button" className="cpm-vault-btn-ghost" disabled={busy} onClick={() => reviewAction(() => revokeCrSignoff(cr.id))}>Revoke sign-off</button></div>}
              <h4>Timeline</h4>
              {(review?.pr?.timeline || []).map((event, i) => <div key={`${event.at}-${i}`}>{event.at?.slice(0, 10)} · {event.actor || "GitHub"} · {event.label}</div>)}
              <div>ClubPM: {cr.createdAt?.slice(0, 10)} · request opened{cr.reviewedAt ? `; ${cr.reviewedAt.slice(0, 10)} · ${cr.status.toLowerCase()}` : ""}</div>
            </section>

            {cr.status === "APPROVED"
              ? <ReleasePanel crId={cr.id} />
              : cr.status === "OPEN" && <ReadinessPanel readiness={readiness} loading={readinessLoading} error={readinessError} onRefresh={loadReadiness} />}

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
                  <button type="button" className="cpm-vault-btn-danger" data-tour-id="cr.reject" onClick={handleRejectClick} disabled={busy}>
                    Reject
                  </button>
                  <button type="button" className="clubpm-btn-primary" data-tour-id="cr.review" onClick={handleApprove} disabled={busy || review?.state !== "approved" || readiness?.state === "blocked"} title={readiness?.state === "blocked" ? "Resolve the build-readiness blockers first" : undefined}>
                    Approve
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );

  // Review and create both stay available on phones; only the container changes.
  if (compact) {
    return (
      <MobileSheet
        title={isCreate ? "New change request" : cr ? `CR-${cr.number}` : "Change request"}
        onClose={() => { if (!busy) onClose(); }}
        variant="fullscreen"
        className="pm-m-files-layer"
      >
        {modal.props.children}
      </MobileSheet>
    );
  }
  return createPortal(modal, document.body);
}
