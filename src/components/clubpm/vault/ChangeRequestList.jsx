import React, { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { listCrs, rejectCr, getVaultReviewerRules, saveVaultReviewerRules, getVault, getVaultDrawingRequirements, saveVaultDrawingRequirements } from "../../../api/clubPmClient";
import { formatRelativeTime } from "../../../utils/driveUtils";
import { CR_STATUS_LABEL, notifyCrCountChanged } from "./vaultUtils";
import ChangeRequestModal from "./ChangeRequestModal";

// `mode: "all"` lists every CR for the project and offers a "New change
// request" button. `mode: "review"` scopes to OPEN CRs and adds inline
// Approve/Reject actions (mirrors PendingRewardsPanel's approve/reject row
// idiom) for admins working the review queue.
export default function ChangeRequestList({ project, member, isAdmin, mode = "all" }) {
  const [crs, setCrs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [selectedCrId, setSelectedCrId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [showRules, setShowRules] = useState(false);
  const [rules, setRules] = useState([]);
  const [checks, setChecks] = useState("");
  const [vaultItems, setVaultItems] = useState([]);
  const [showDrawingRules, setShowDrawingRules] = useState(false);
  const [drawingRules, setDrawingRules] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await listCrs(project.id, mode === "review" ? "OPEN" : undefined);
      setCrs(data || []);
    } catch (err) {
      setLoadError(err.message || "Failed to load change requests");
    } finally {
      setLoading(false);
    }
  }, [project.id, mode]);

  useEffect(() => { load(); }, [load]);

  async function openRules() {
    try {
      const [settings, vault] = await Promise.all([getVaultReviewerRules(project.id), getVault(project.id)]);
      setRules(settings.rules.map(({ scope, value, reviewerId }) => ({ scope, value, reviewerId })));
      setChecks((settings.requiredChecks || []).join(", "));
      setVaultItems(vault.items || []);
      setShowRules(true);
    } catch (err) { toast.error(err.message || "Failed to load review rules"); }
  }

  async function saveRules() {
    try {
      await saveVaultReviewerRules(project.id, { rules, requiredChecks: checks.split(",").map(s => s.trim()).filter(Boolean) });
      setShowRules(false);
      toast.success("Review rules saved");
      load();
    } catch (err) { toast.error(err.message || "Failed to save review rules"); }
  }

  async function openDrawingRules() {
    try {
      const rows = await getVaultDrawingRequirements(project.id);
      setDrawingRules(rows.map(({ scope, value, severity }) => ({ scope, value, severity })));
      setShowDrawingRules(true);
    } catch (err) { toast.error(err.message || "Failed to load drawing requirements"); }
  }

  async function saveDrawingRules() {
    try {
      await saveVaultDrawingRequirements(project.id, drawingRules);
      setShowDrawingRules(false);
      toast.success("Drawing requirements saved");
    } catch (err) { toast.error(err.message || "Failed to save drawing requirements"); }
  }

  async function handleReject(cr, e) {
    e.stopPropagation();
    if (busyId) return;
    const reviewNote = window.prompt("Reason for rejecting this change request:");
    if (reviewNote === null) return;
    setBusyId(cr.id);
    try {
      await rejectCr(cr.id, { reviewNote: reviewNote || undefined });
      toast.success(`CR-${cr.number} rejected`);
      notifyCrCountChanged();
      load();
    } catch (err) {
      toast.error(err.message || "Failed to reject");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return <div className="cpm-vault-loading"><div className="cpm-spinner" /></div>;
  }

  if (loadError) {
    return <div className="cpm-vault-placeholder">{loadError}</div>;
  }

  return (
    <div className="cpm-vault-cr-list">
      {mode === "all" && (
        <div className="cpm-vault-toolbar">
          <button type="button" className="clubpm-btn-primary" data-tour-id="cr.new" onClick={() => setShowCreate(true)}>
            <i className="fas fa-plus" aria-hidden="true" /> New change request
          </button>
          {isAdmin && <button type="button" className="cpm-vault-btn-ghost" onClick={openRules}>Review rules</button>}
          {isAdmin && <button type="button" className="cpm-vault-btn-ghost" onClick={openDrawingRules}>Drawing requirements</button>}
        </div>
      )}
      {showRules && <div className="cpm-vault-review-panel" data-tour-id="cr.rules">
        <h3>Required release reviewers</h3>
        <p>Each matching rule needs that member's sign-off. Subsystem matches a part number prefix; BOM parent matches direct children.</p>
        {rules.map((rule, index) => <div className="cpm-vault-rule-row" key={index}>
          <select aria-label="Rule scope" value={rule.scope} onChange={e => setRules(prev => prev.map((r, i) => i === index ? { ...r, scope: e.target.value, value: "" } : r))}><option value="SUBSYSTEM">Subsystem prefix</option><option value="BOM_PARENT">BOM parent</option></select>
          {rule.scope === "BOM_PARENT" ? <select aria-label="BOM parent" value={rule.value} onChange={e => setRules(prev => prev.map((r, i) => i === index ? { ...r, value: e.target.value } : r))}><option value="">Select parent</option>{vaultItems.map(item => <option key={item.id} value={item.id}>{item.partNumber || item.name}</option>)}</select> : <input aria-label="Subsystem prefix" value={rule.value} onChange={e => setRules(prev => prev.map((r, i) => i === index ? { ...r, value: e.target.value } : r))} placeholder="e.g. PROP" />}
          <select aria-label="Required reviewer" value={rule.reviewerId} onChange={e => setRules(prev => prev.map((r, i) => i === index ? { ...r, reviewerId: e.target.value } : r))}><option value="">Select reviewer</option>{(project.members || []).map(pm => { const m = pm.member || pm; return <option key={m.id} value={m.id}>{m.displayName}</option>; })}</select>
          <button type="button" className="cpm-vault-btn-ghost" onClick={() => setRules(prev => prev.filter((_, i) => i !== index))}>Remove</button>
        </div>)}
        <button type="button" className="cpm-vault-btn-ghost" onClick={() => setRules(prev => [...prev, { scope: "SUBSYSTEM", value: "", reviewerId: "" }])}>Add rule</button>
        <label className="cpm-vault-field"><span>Required GitHub checks (comma separated; blank requires all reported checks)</span><input value={checks} onChange={e => setChecks(e.target.value)} /></label>
        <button type="button" className="clubpm-btn-primary" onClick={saveRules}>Save rules</button><button type="button" className="cpm-vault-btn-ghost" onClick={() => setShowRules(false)}>Cancel</button>
      </div>}

      {showDrawingRules && <div className="cpm-vault-review-panel" data-tour-id="cr.drawingRules">
        <h3>Required drawings</h3>
        <div>Checked for every file a release pins: the released items and their whole BOM. A <strong>blocker</strong> stops approval until a drawing item is linked and released; a <strong>warning</strong> only shows in build readiness.</div>
        {drawingRules.map((rule, index) => <div className="cpm-vault-rule-row" key={index}>
          <select aria-label="Requirement scope" value={rule.scope} onChange={e => setDrawingRules(prev => prev.map((r, i) => i === index ? { ...r, scope: e.target.value, value: "" } : r))}><option value="ALL">Every item</option><option value="SUBSYSTEM">Part number prefix</option><option value="EXTENSION">File type</option></select>
          {rule.scope !== "ALL" && <input aria-label={rule.scope === "EXTENSION" ? "File extensions" : "Part number prefix"} value={rule.value} onChange={e => setDrawingRules(prev => prev.map((r, i) => i === index ? { ...r, value: e.target.value } : r))} placeholder={rule.scope === "EXTENSION" ? "e.g. sldprt, step" : "e.g. PROP"} />}
          <select aria-label="Severity" value={rule.severity} onChange={e => setDrawingRules(prev => prev.map((r, i) => i === index ? { ...r, severity: e.target.value } : r))}><option value="WARNING">Warning</option><option value="BLOCKER">Blocks approval</option></select>
          <button type="button" className="cpm-vault-btn-ghost" onClick={() => setDrawingRules(prev => prev.filter((_, i) => i !== index))}>Remove</button>
        </div>)}
        <button type="button" className="cpm-vault-btn-ghost" onClick={() => setDrawingRules(prev => [...prev, { scope: "SUBSYSTEM", value: "", severity: "WARNING" }])}>Add requirement</button>
        <button type="button" className="clubpm-btn-primary" onClick={saveDrawingRules}>Save requirements</button><button type="button" className="cpm-vault-btn-ghost" onClick={() => setShowDrawingRules(false)}>Cancel</button>
      </div>}

      {crs.length === 0 ? (
        <div className="cpm-vault-empty">
          {mode === "review" ? "No change requests waiting for review." : "No change requests yet."}
        </div>
      ) : (
        <div className="cpm-vault-cr-grid" data-tour-id="cr.list">
          {crs.map((cr, index) => {
            const itemCount = cr.items?.length ?? 0;
            return (
              <div
                key={cr.id}
                className="cpm-vault-cr-card"
                data-tour-id={index === 0 ? "cr.card" : undefined}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedCrId(cr.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedCrId(cr.id); }
                }}
              >
                <div className="cpm-vault-cr-card-top">
                  <span className="cpm-vault-cr-number">CR-{cr.number}</span>
                  <span className={`cpm-vault-cr-status cpm-vault-cr-status-${cr.status.toLowerCase()}`}>
                    {CR_STATUS_LABEL[cr.status] ?? cr.status}
                  </span>
                </div>

                <div className="cpm-vault-cr-title">{cr.title}</div>

                <div className="cpm-vault-cr-meta">
                  <span>{itemCount} item{itemCount === 1 ? "" : "s"}</span>
                  <span aria-hidden="true">·</span>
                  <span className="cpm-vault-cr-author">
                    {cr.author?.avatarUrl
                      ? <img src={cr.author.avatarUrl} alt="" />
                      : <span className="cpm-vault-cr-author-fallback">{(cr.author?.displayName || "?").charAt(0)}</span>}
                    {cr.author?.displayName ?? "Unknown"}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{formatRelativeTime(cr.createdAt)}</span>
                </div>

                {mode === "review" && cr.status === "OPEN" && (
                  <div className="cpm-vault-cr-review-actions">
                    <button type="button" className="clubpm-btn-primary" onClick={(e) => { e.stopPropagation(); setSelectedCrId(cr.id); }}>Review</button>
                    <button
                      type="button"
                      className="cpm-vault-btn-danger"
                      disabled={busyId === cr.id}
                      onClick={(e) => handleReject(cr, e)}
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <ChangeRequestModal
          project={project}
          member={member}
          isAdmin={isAdmin}
          onClose={() => setShowCreate(false)}
          onChanged={() => { setShowCreate(false); load(); }}
        />
      )}

      {selectedCrId && (
        <ChangeRequestModal
          project={project}
          member={member}
          isAdmin={isAdmin}
          crId={selectedCrId}
          onClose={() => setSelectedCrId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
