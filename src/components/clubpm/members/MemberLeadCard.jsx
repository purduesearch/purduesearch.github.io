import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { setProjectLead } from "../../../api/clubPmClient";
import AvatarPortrait from "../avatar/AvatarPortrait";

// Double-click card for an assignee chip. Admins can make/remove a sublead and
// set its optional title here; everyone else gets a read-only view.
export default function MemberLeadCard({ pm, lead, anchor, canEdit, projectId, onClose, onSaved }) {
  // Admin outranks sublead: admins only get a role title, never the sublead toggle.
  const targetIsAdmin = !!(pm.member?.isAdmin || pm.isAdmin);
  const isLead = !targetIsAdmin && !!lead?.isLead;
  const [title, setTitle] = useState(lead?.leadTitle ?? "");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const cardRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    const onDown = (e) => { if (cardRef.current && !cardRef.current.contains(e.target)) onClose(); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  const save = async (nextIsLead) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      let saved;
      if (targetIsAdmin) {
        saved = await setProjectLead(projectId, pm.memberId, false, nextIsLead ? title : "");
        toast.success(nextIsLead ? "Admin role updated" : "Admin role cleared");
      } else {
        saved = await setProjectLead(projectId, pm.memberId, nextIsLead, nextIsLead ? title : null);
        toast.success(nextIsLead
          ? (isLead ? "Sublead title updated" : `${pm.member.displayName} is now a sublead`)
          : `${pm.member.displayName} is no longer a sublead`);
      }
      onSaved?.(saved);
      onClose();
    } catch (err) {
      toast.error(err?.message || "Failed to update sublead");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const left = Math.max(8, Math.min(anchor.left - 200, window.innerWidth - 268));
  const top = Math.min(anchor.bottom + 6, window.innerHeight - 260);
  const m = pm.member;

  return createPortal(
    <div
      ref={cardRef}
      className="cpm-lead-card"
      role="dialog"
      aria-label={`${m.displayName} member card`}
      style={{ position: "fixed", zIndex: 1200, width: 260, left, top, padding: 12, display: "flex", flexDirection: "column", gap: 8, background: "var(--clubpm-surface-200, #1a1a1a)", border: "1px solid var(--clubpm-border)", borderRadius: 12, boxShadow: "0 12px 32px rgba(0,0,0,0.45)" }}
    >
      <div className="cpm-lead-card-head">
        <AvatarPortrait member={m} size={44} className={targetIsAdmin ? "cpm-admin-ring" : isLead ? "cpm-lead-ring-violet" : undefined} />
        <div style={{ minWidth: 0 }}>
          <div className="cpm-lead-card-name">{m.displayName}</div>
          <div className="cpm-lead-card-sub">
            {targetIsAdmin
              ? <span className="cpm-sublead-tag cpm-admin-tag"><i className="fas fa-crown" aria-hidden="true" /> {lead?.leadTitle || "Admin"}</span>
              : isLead
              ? <span className="cpm-sublead-tag"><i className="fas fa-user-shield" aria-hidden="true" /> {lead.leadTitle || "Sublead"}</span>
              : (m.rank ? String(m.rank).charAt(0) + String(m.rank).slice(1).toLowerCase() : "Member")}
          </div>
        </div>
      </div>
      {canEdit ? (
        <>
          <label className="cpm-lead-card-label" htmlFor="cpm-sublead-title">{targetIsAdmin ? "Admin role title (optional)" : "Sublead role (optional)"}</label>
          <input
            id="cpm-sublead-title"
            className="cpm-assignee-search"
            type="text"
            maxLength={60}
            placeholder="e.g. Microgreens lead"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") save(true); }}
          />
          <div className="cpm-lead-card-actions">
            <button type="button" className={`cpm-lead-card-btn cpm-lead-card-btn--primary${targetIsAdmin ? " cpm-lead-card-btn--admin" : ""}`} disabled={busy} onClick={() => save(true)}>
              {targetIsAdmin ? "Save title" : isLead ? "Save role" : "Make sublead"}
            </button>
            {targetIsAdmin && lead?.leadTitle && (
              <button type="button" className="cpm-lead-card-btn" disabled={busy} onClick={() => save(false)}>
                Clear title
              </button>
            )}
            {isLead && (
              <button type="button" className="cpm-lead-card-btn" disabled={busy} onClick={() => save(false)}>
                Remove sublead
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="cpm-lead-card-sub">{targetIsAdmin ? "Admin" : isLead ? "Project sublead" : "Only admins can set subleads."}</div>
      )}
    </div>,
    document.body
  );
}
