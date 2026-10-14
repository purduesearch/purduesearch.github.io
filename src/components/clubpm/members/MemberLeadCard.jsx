import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { setProjectLead, openDm } from "../../../api/clubPmClient";
import { useClubPmAuth } from "../../../clubpm/ClubPmAuth";
import { MemberName } from "../../../clubpm/cosmetics/CosmeticStylesContext";
import AvatarPortrait from "../avatar/AvatarPortrait";
import RankIcon from "../RankIcon";
import { MemberFacts, MemberSkillStrip, MemberActions, useMemberDetail } from "./MemberCardParts";

const CARD_WIDTH = 300;

// Double-click card for an assignee chip. Same facts, skills and actions as the
// Members-page card; admins can also make/remove a sublead and set its optional
// title here, and everyone else gets that part read-only.
export default function MemberLeadCard({ pm, lead, anchor, canEdit, projectId, onClose, onSaved, onMessage }) {
  const { member: me } = useClubPmAuth();
  const navigate = useNavigate();
  const m = useMemberDetail(pm.member);
  // Admin outranks sublead: admins only get a role title, never the sublead toggle.
  const targetIsAdmin = !!(m?.isAdmin || pm.isAdmin);
  const isLead = !targetIsAdmin && !!lead?.isLead;
  const [title, setTitle] = useState(lead?.leadTitle ?? "");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const cardRef = useRef(null);
  const [pos, setPos] = useState(null);

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

  // The card grows as email, counts and skills arrive, so place it from its real
  // height: below the chip when it fits, otherwise clamped into the viewport.
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return undefined;
    const place = () => {
      const h = el.offsetHeight;
      const left = Math.max(8, Math.min(anchor.left - 200, window.innerWidth - CARD_WIDTH - 8));
      const below = anchor.bottom + 6;
      const top = below + h <= window.innerHeight - 8 ? below : Math.max(8, Math.min(anchor.top - h - 6, window.innerHeight - h - 8));
      setPos((p) => (p && p.left === left && p.top === top ? p : { left, top }));
    };
    place();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(place);
    ro.observe(el);
    return () => ro.disconnect();
  }, [anchor]);

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
          ? (isLead ? "Sublead title updated" : `${m.displayName} is now a sublead`)
          : `${m.displayName} is no longer a sublead`);
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

  const message = onMessage ?? (async (target) => {
    try {
      const { channelId } = await openDm([target.id]);
      onClose();
      navigate(`/clubpm/members?dm=${encodeURIComponent(channelId)}`);
    } catch (err) {
      toast.error(err?.status === 409 ? "Reconnect Slack on the Members page to send messages." : (err?.message || "Could not open that conversation."));
    }
  });

  const roleLabel = targetIsAdmin ? "Admin" : (m.role === "LEAD" ? "Lead" : "Member");
  const rankLabel = m.rank ? String(m.rank).charAt(0) + String(m.rank).slice(1).toLowerCase() : null;
  const accent = targetIsAdmin ? " cpm-lead-card--admin" : isLead ? " cpm-lead-card--sublead" : "";

  return createPortal(
    <div
      ref={cardRef}
      className={`cpm-lead-card${accent}`}
      role="dialog"
      aria-label={`${m.displayName} member card`}
      style={{ width: CARD_WIDTH, left: pos?.left ?? -9999, top: pos?.top ?? 0, visibility: pos ? "visible" : "hidden" }}
    >
      <div className="cpm-lead-card-head">
        <span className="pm-member-avatar-wrap">
          <AvatarPortrait member={m} size={52} className={targetIsAdmin ? "cpm-admin-ring" : isLead ? "cpm-lead-ring-violet" : undefined} />
          {m.rank ? <span className="cpm-member-badge-rank-overlay" aria-hidden="true"><RankIcon member={m} size={22} /></span> : null}
        </span>
        <div className="cpm-lead-card-who">
          <div className="cpm-lead-card-name"><MemberName memberId={m.id}>{m.displayName}</MemberName></div>
          {m.slackHandle && <div className="pm-member-handle">@{m.slackHandle}</div>}
          {m.title && <div className="pm-member-title">{m.title}</div>}
          <div className="pm-member-badges">
            <span className={`pm-member-role-badge ${targetIsAdmin ? "admin" : m.role?.toLowerCase() || "member"}`}>{roleLabel}</span>
            {(isLead || (targetIsAdmin && lead?.leadTitle)) && (
              <span className={`cpm-sublead-tag${targetIsAdmin ? " cpm-admin-tag" : ""}`}>
                <i className={targetIsAdmin ? "fas fa-crown" : "fas fa-user-shield"} aria-hidden="true" /> {lead?.leadTitle || (targetIsAdmin ? "Admin" : "Sublead")}
              </span>
            )}
            {rankLabel && <span className="cpm-lead-card-rank">{rankLabel}</span>}
          </div>
        </div>
      </div>

      <MemberFacts member={m} />
      <MemberSkillStrip memberId={m.id} />
      <MemberActions member={m} onMessage={m.id === me?.id ? undefined : message} />

      <div className="cpm-lead-card-role">
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
                <button type="button" className="cpm-lead-card-btn" disabled={busy} onClick={() => save(false)}>Clear title</button>
              )}
              {isLead && (
                <button type="button" className="cpm-lead-card-btn" disabled={busy} onClick={() => save(false)}>Remove sublead</button>
              )}
            </div>
          </>
        ) : (
          <div className="cpm-lead-card-sub">{targetIsAdmin ? "Admin" : isLead ? "Project sublead" : "Only admins can set subleads."}</div>
        )}
      </div>
    </div>,
    document.body
  );
}
