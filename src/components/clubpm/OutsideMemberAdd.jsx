import React, { useRef, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { post } from "../../api/clubPmClient";

/** Club members matching `query` who are not on the project. Bots are never offered. */
export function outsideMatches(everyone, rosterIds, query, limit = 8) {
  const q = (query ?? "").trim().toLowerCase();
  if (!q) return [];
  return (everyone ?? [])
    .map(m => m.member ?? m)
    .filter(m => m?.id && !m.isBot && !rosterIds.has(m.id))
    .filter(m => (m.displayName ?? "").toLowerCase().includes(q) || (m.slackHandle ?? "").toLowerCase().includes(q))
    .slice(0, limit);
}

export function OutsideTag() {
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4,
      color: "var(--pm-accent-amber, #f5a623)", border: "1px solid var(--pm-accent-amber, #f5a623)",
      borderRadius: 4, padding: "1px 5px", flexShrink: 0,
    }}>Outside project</span>
  );
}

/** Confirmation step before adding a club member who is not on the project. */
export function ConfirmAddMemberDialog({ projectId, member, onClose, onAdded }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const inFlight = useRef(false);

  async function confirm() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await post(`/api/projects/${projectId}/members`, { memberId: member.id });
      toast.success(`${member.displayName} added to project`);
      await onAdded?.(member);
      onClose();
    } catch (err) {
      setError(err?.message ?? "Could not add member");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add member to project"
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 1200,
        display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)",
      }}
    >
      <div style={{
        background: "var(--clubpm-surface-100)", border: "1px solid var(--clubpm-border)", borderRadius: 12,
        width: "90vw", maxWidth: 400, padding: 20, boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
        display: "flex", flexDirection: "column", gap: 12,
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--clubpm-text-primary)" }}>
          Add {member.displayName} to this project?
        </div>
        <p style={{ fontSize: 12, lineHeight: 1.5, color: "var(--clubpm-text-muted)", margin: 0 }}>
          {member.displayName} is not on this project. Adding them lets them be assigned tasks here
          and gives them project access. You can remove them later from project settings.
        </p>
        {error && (
          <p style={{ fontSize: 12, color: "#e17055", background: "rgba(225,112,85,0.1)", borderRadius: 6, padding: "6px 10px", margin: 0 }}>
            {error}
          </p>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="clubpm-btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="clubpm-btn-primary" onClick={confirm} disabled={busy}>
            {busy ? "Adding…" : "Add to project"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
