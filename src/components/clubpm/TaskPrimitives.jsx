import React, { useEffect, useRef, useState } from "react";
import LottieCheck from "./anim/LottieCheck";
import AvatarPortrait from './avatar/AvatarPortrait';
import { useTaskAssignmentActions } from './celebrate/useTaskAssignment';

// ── Progress Indicator ────────────────────────────────────────

export const PROGRESS_CYCLE = { NO_PROGRESS: "IN_PROGRESS", IN_PROGRESS: "COMPLETED", COMPLETED: "NO_PROGRESS" };

export function ProgressIndicator({ progress, taskId, onUpdate, size = 24 }) {
  const prevProgressRef = useRef(progress);
  const [playingCheck, setPlayingCheck] = useState(false);

  useEffect(() => {
    if (prevProgressRef.current === "IN_PROGRESS" && progress === "COMPLETED") {
      setPlayingCheck(true);
    }
    prevProgressRef.current = progress;
  }, [progress]);

  return (
    <button
      className={`cpm-progress-btn cpm-progress-${progress}`}
      onClick={e => { e.stopPropagation(); onUpdate(taskId, PROGRESS_CYCLE[progress]); }}
      title={progress.replace(/_/g, " ").toLowerCase().replace(/^\w/, c => c.toUpperCase())}
      style={{ position: "relative" }}
    >
      {progress === "COMPLETED" && !playingCheck && <i className="fas fa-check" />}
      {progress === "IN_PROGRESS" && <span className="cpm-progress-half" />}
      {playingCheck && (
        <span
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <LottieCheck size={size} onComplete={() => setPlayingCheck(false)} />
        </span>
      )}
    </button>
  );
}

// ── Status Ring (read-only, matches ProgressIndicator look) ───

export function StatusRing({ status, onComplete, title }) {
  const mod = status === "DONE" ? "done" : status === "BLOCKED" ? "blocked" : status === "IN_PROGRESS" ? "in" : "none";
  const Tag = onComplete ? 'button' : 'span';
  return (
    <Tag className={`cpm-kanban-progress cpm-kanban-progress--${mod} pm-task-check`}
      type={onComplete ? 'button' : undefined}
      aria-hidden={onComplete ? undefined : true}
      aria-label={onComplete ? `${status === 'DONE' ? 'Reopen' : 'Complete'} task: ${title}` : undefined}
      aria-pressed={onComplete ? status === 'DONE' : undefined}
      onPointerDown={onComplete ? e => e.stopPropagation() : undefined}
      onKeyDown={onComplete ? e => e.stopPropagation() : undefined}
      onClick={onComplete ? e => { e.stopPropagation(); onComplete(); } : undefined}>
      <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.4l2.4 2.4 4.6-5" /></svg>
      {status === "BLOCKED" && <i className="fas fa-xmark" />}
      {status === "IN_PROGRESS" && <span className="cpm-progress-half" />}
    </Tag>
  );
}

// ── Priority Bars ─────────────────────────────────────────────

export const PRIORITY_CFG = {
  CRITICAL: { color: "#e17055", fills: [1, 1, 1] },
  HIGH:     { color: "#e17055", fills: [1, 1, 0.35] },
  MEDIUM:   { color: "#fdcb6e", fills: [1, 0.55, 0.2] },
  LOW:      { color: "#00b894", fills: [0.65, 0.25, 0.1] },
};

export function PriorityBars({ priority }) {
  const { color, fills } = PRIORITY_CFG[priority] ?? PRIORITY_CFG.MEDIUM;
  return (
    <div className="cpm-priority-bars" title={priority ? priority.charAt(0) + priority.slice(1).toLowerCase() : "Medium"}>
      {[7, 10, 13].map((h, i) => (
        <div key={i} className="cpm-priority-bar" style={{ height: h, background: color, opacity: fills[i] }} />
      ))}
    </div>
  );
}

// ── Star Progress (completion percentage as filled stars) ─────

const StarPath = ({ filled, accent }) => (
  <svg width="12" height="12" viewBox="0 0 24 24">
    <polygon
      points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"
      fill={filled ? (accent ? 'var(--pm-accent-teal)' : 'rgba(255,255,255,0.7)') : 'none'}
      stroke={filled ? (accent ? 'var(--pm-accent-teal)' : 'rgba(255,255,255,0.5)') : 'rgba(255,255,255,0.2)'}
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  </svg>
);

export function StarProgress({ percent = 0 }) {
  const filled = Math.round((percent / 100) * 5);
  return (
    <div className="cpm-star-progress" title={`${percent}% complete`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className="cpm-star-progress-item">
          <StarPath filled={i < filled} accent={i < filled && i === filled - 1} />
        </span>
      ))}
    </div>
  );
}

// ── Avatar Stack ──────────────────────────────────────────────
//
// When a new assignee shows up that wasn't in the previous render, animate
// their slot in: scale 0 -> 1 with a small overshoot. Existing avatars get
// a brief leftward shift to make visual room. Diff-based so the animation
// only fires on actual additions.

function animateAvatar(el, frames, options) {
  try { return el?.animate?.(frames, options); } catch { return null; }
}

export function AvatarStack({ assignees, taskId }) {
  const assignment = useTaskAssignmentActions();
  const presentation = taskId != null && assignment?.presentation?.id === taskId ? assignment.presentation : null;
  const order = assignment?.frontOrder?.[taskId] ?? [];
  const sorted = [...(assignees ?? [])].sort((a, b) => {
    const rank = id => order.includes(id) ? order.indexOf(id) : order.length;
    return rank(a.id) - rank(b.id);
  });
  const displayed = presentation?.assignees ?? sorted;
  const preview = presentation?.incoming || (taskId != null && assignment?.hover?.id === taskId &&
    assignment.hover.memberIds.some(id => id && !(assignees ?? []).some(a => a.id === id)));
  const hasPreview = !!preview;
  const prevIdsRef = useRef([]);
  const slotRefs = useRef(new Map());
  const previousPreview = useRef(false);

  useEffect(() => {
    if (previousPreview.current === hasPreview) return;
    previousPreview.current = hasPreview;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;
    const animations = Array.from(slotRefs.current.values(), el => animateAvatar(el, [
      { transform: `translateX(${hasPreview ? -17 : 21}px)` },
      { transform: `translateX(${hasPreview ? 4 : 0}px)` },
    ], { duration: 340, easing: 'cubic-bezier(.3,1.3,.4,1)' })).filter(Boolean);
    return () => animations.forEach(a => a.cancel());
  }, [hasPreview]);

  useEffect(() => {
    const currentIds = (assignees ?? []).map(m => m.id);
    const added = currentIds.filter(id => !prevIdsRef.current.includes(id));
    const isFirstRender = prevIdsRef.current.length === 0 && currentIds.length > 0;
    prevIdsRef.current = currentIds;
    if (presentation || (taskId != null && assignment?.hover?.id === taskId)) return;
    if (isFirstRender || added.length === 0) return;
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduce) return;
    // Fire-and-forget — keep this module free of the animejs dep so the
    // primitive stays cheap. Pop the new avatar elements via inline JS.
    const animations = [];
    const frame = requestAnimationFrame(() => {
      added.forEach(id => {
        const el = slotRefs.current.get(id);
        if (!el) return;
        if (!el.animate) return;
        animations.push(animateAvatar(el,
          [
            { transform: "scale(0)", opacity: 0 },
            { transform: "scale(1.18)", opacity: 1, offset: 0.65 },
            { transform: "scale(1)", opacity: 1 },
          ],
          { duration: 220, easing: "cubic-bezier(.4,1.6,.5,1)" },
        ));
      });
      // Subtle leftward shift on existing avatars so they yield room.
      currentIds.forEach(id => {
        if (added.includes(id)) return;
        const el = slotRefs.current.get(id);
        if (!el) return;
        if (!el.animate) return;
        animations.push(animateAvatar(el,
          [{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(0)" }],
          { duration: 180, easing: "ease-out" },
        ));
      });
    });
    return () => { cancelAnimationFrame(frame); animations.forEach(a => a?.cancel()); };
  }, [assignees, presentation, assignment?.hover?.id, taskId]);

  if (!displayed?.length && !preview) return <span className="cpm-avatar-placeholder" />;
  const shown = (displayed ?? []).slice(0, 5);
  const extra = (displayed?.length ?? 0) - 5;
  return (
    <div className="cpm-avatar-stack">
      {preview && <><span className="pm-assignment-drop-tag">Drop to assign</span><span className="pm-assignment-placeholder" /></>}
      {shown.map((m, i) => (
        <div
          key={m.id}
          data-assignment-member={m.id}
          ref={el => { if (el) slotRefs.current.set(m.id, el); else slotRefs.current.delete(m.id); }}
          className="cpm-avatar-slot"
          style={{ zIndex: shown.length - i }}
        >
          <AvatarPortrait member={m} size={22} className="cpm-avatar-img" />
        </div>
      ))}
      {extra > 0 && <div className="cpm-avatar-slot cpm-avatar-extra" title={`+${extra} more`}>+{extra}</div>}
    </div>
  );
}
