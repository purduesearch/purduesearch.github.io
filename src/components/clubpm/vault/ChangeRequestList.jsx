import React, { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { listCrs, approveCr, rejectCr } from "../../../api/clubPmClient";
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

  async function handleApprove(cr, e) {
    e.stopPropagation();
    if (busyId) return;
    setBusyId(cr.id);
    try {
      await approveCr(cr.id);
      toast.success(`CR-${cr.number} approved`);
      notifyCrCountChanged();
      load();
    } catch (err) {
      toast.error(err.message || "Failed to approve");
    } finally {
      setBusyId(null);
    }
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
          <button type="button" className="clubpm-btn-primary" onClick={() => setShowCreate(true)}>
            <i className="fas fa-plus" aria-hidden="true" /> New change request
          </button>
        </div>
      )}

      {crs.length === 0 ? (
        <div className="cpm-vault-empty">
          {mode === "review" ? "No change requests waiting for review." : "No change requests yet."}
        </div>
      ) : (
        <div className="cpm-vault-cr-grid">
          {crs.map((cr) => {
            const itemCount = cr.items?.length ?? 0;
            return (
              <div
                key={cr.id}
                className="cpm-vault-cr-card"
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
                    <button
                      type="button"
                      className="clubpm-btn-primary"
                      disabled={busyId === cr.id}
                      onClick={(e) => handleApprove(cr, e)}
                    >
                      Approve
                    </button>
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
