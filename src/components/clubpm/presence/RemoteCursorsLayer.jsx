import { useEffect, useRef, useState } from 'react';

const IDLE_MS = 5000;
const CARRY_OFFSET = { x: 10, y: 26 };

function initials(name) {
  return String(name ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
}

function TagAvatar({ name, avatarUrl }) {
  const [failed, setFailed] = useState(false);
  if (!avatarUrl || failed) return <span className="cpm-presence-tag-avatar">{initials(name)}</span>;
  return <img className="cpm-presence-tag-avatar" src={avatarUrl} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}

function CarryAvatar({ name, avatarUrl, color, refCb }) {
  const [failed, setFailed] = useState(false);
  const props = { ref: refCb, className: 'cpm-presence-carry', style: { '--presence-color': color } };
  if (!avatarUrl || failed) return <span {...props}>{initials(name)}</span>;
  return <img {...props} src={avatarUrl} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}

function statusText(presence, sid) {
  const drag = presence.drags.get(sid);
  if (drag) return drag.ids.length > 1 ? `moving ${drag.ids.length} cards` : 'moving';
  if (presence.carry.has(sid)) return 'assigning';
  const sel = presence.sel.get(sid);
  if (sel?.length) return `selecting ${sel.length}`;
  if (presence.viewing.has(sid)) return 'viewing';
  return '';
}

/** Visible part of the board: its box intersected with the viewport. */
function visibleBox(root) {
  const r = root.getBoundingClientRect();
  return {
    left: Math.max(r.left, 0), top: Math.max(r.top, 0),
    right: Math.min(r.right, window.innerWidth), bottom: Math.min(r.bottom, window.innerHeight),
  };
}

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

/** Clone of a task row with the ids, presence classes and flag removed, so it reads as a plain row. */
function stripForGhost(el) {
  for (const node of [el, ...el.querySelectorAll('[data-completion-id],[data-tour-id],[id]')]) {
    node.removeAttribute('data-completion-id');
    node.removeAttribute('data-tour-id');
    node.removeAttribute('id');
  }
  el.querySelectorAll('.cpm-presence-flag').forEach(n => n.remove());
  el.classList.remove('cpm-presence-row', 'is-locked', 'is-selected', 'is-viewing');
  el.style.opacity = '';
  el.style.transform = '';
  el.style.transition = '';
  return el;
}

/**
 * One ghost per remote drag: a clone of the grabbed row that follows the dragger's cursor.
 * A ghost that is gone from the drag map is removed, and its last rect is kept for the snap rule.
 */
function syncGhosts({ layer, root, origin, now, state, sample, core, ghosts, lastRects }) {
  for (const [sid, ghost] of ghosts) {
    if (state.drags.has(sid)) continue;
    const rect = ghost.el.getBoundingClientRect();
    for (const id of ghost.ids) lastRects.set(id, { rect, at: now });
    ghost.el.remove();
    ghosts.delete(sid);
  }
  for (const [sid, drag] of state.drags) {
    if (sid === state.self || state.conns.get(sid)?.room !== state.room) continue;
    const p = sample(sid);
    let ghost = ghosts.get(sid);
    if (!ghost) {
      const row = p && root.querySelector(`[data-completion-id="${drag.grabbed}"]`);
      if (!row) continue;
      const rect = row.getBoundingClientRect();
      const el = stripForGhost(row.cloneNode(true));
      el.classList.add('cpm-presence-ghost');
      el.style.width = `${rect.width}px`;
      if (drag.ids.length > 1) {
        el.classList.add('cpm-presence-ghost--stacked');
        const count = document.createElement('span');
        count.className = 'cpm-presence-ghost-count';
        count.textContent = String(drag.ids.length);
        el.append(count);
      }
      ghost = {
        el, ids: drag.ids,
        offset: { x: clamp(p.x - rect.left, 0, rect.width), y: clamp(p.y - rect.top, 0, rect.height) },
      };
      layer.append(el);
      ghosts.set(sid, ghost);
    }
    if (p && !drag.dropped) {
      ghost.el.style.transform = `translate(${p.x - ghost.offset.x - origin.left}px, ${p.y - ghost.offset.y - origin.top}px) rotate(2.5deg)`;
    }
  }
}

/**
 * Remote cursors, drag ghosts and carried member avatars for one board. Positions are written
 * straight to the DOM from a requestAnimationFrame loop, so movement never re-renders React.
 */
export default function RemoteCursorsLayer({ rootRef, presence, buffersRef, core, lastGhostRectsRef }) {
  const layerRef = useRef(null);
  const elsRef = useRef(new Map());               // sid → cursor element
  const carryElsRef = useRef(new Map());          // sid → carried avatar element
  const ghostsRef = useRef(new Map());            // sid → { el, ids, offset }
  const listRef = useRef([]);
  const stateRef = useRef(presence);
  const cursors = [...presence.conns.values()]
    .filter(c => c.room === presence.room && c.sid !== presence.self);
  listRef.current = cursors;
  stateRef.current = presence;

  useEffect(() => {
    const ghosts = ghostsRef.current;
    const carryEls = carryElsRef.current;
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const layer = layerRef.current;
      const root = rootRef.current;
      if (!layer || !root) return;
      const origin = layer.getBoundingClientRect();
      const box = visibleBox(root);
      const now = performance.now();
      const state = stateRef.current;
      const sample = sid => {
        const buf = buffersRef.current.get(sid);
        return buf ? core.sampleAt(buf, now, core.INTERP_DELAY_MS, s => core.decodeAnchor(root, s.anchor, s.fx, s.fy)) : null;
      };
      for (const conn of listRef.current) {
        const el = elsRef.current.get(conn.sid);
        if (!el) continue;
        const buf = buffersRef.current.get(conn.sid);
        const p = buf ? core.sampleAt(buf, now, core.INTERP_DELAY_MS, s => core.decodeAnchor(root, s.anchor, s.fx, s.fy)) : null;
        const hidden = !p || p.x < box.left || p.x > box.right || p.y < box.top || p.y > box.bottom;
        el.classList.toggle('is-hidden', hidden);
        if (!hidden) el.style.transform = `translate(${p.x - origin.left}px, ${p.y - origin.top}px)`;
        el.classList.toggle('is-idle', !!buf && now - buf.lastAt > IDLE_MS);
      }
      for (const [sid] of state.carry) {
        const el = carryEls.get(sid);
        const p = el && sample(sid);
        if (p) el.style.transform = `translate(${p.x - origin.left + CARRY_OFFSET.x}px, ${p.y - origin.top + CARRY_OFFSET.y}px)`;
      }
      syncGhosts({ layer, root, origin, now, state, sample, core, ghosts, lastRects: lastGhostRectsRef.current });
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      for (const ghost of ghosts.values()) ghost.el.remove();
      ghosts.clear();
    };
  }, [rootRef, buffersRef, core, lastGhostRectsRef]);

  return (
    <div ref={layerRef} className="cpm-presence-layer" aria-hidden="true">
      {cursors.map(conn => {
        const status = statusText(presence, conn.sid);
        return (
          <div
            key={conn.sid}
            ref={el => { if (el) elsRef.current.set(conn.sid, el); else elsRef.current.delete(conn.sid); }}
            className="cpm-presence-cursor"
            style={{ '--presence-color': core.memberColor(conn.memberId) }}
          >
            <svg width="18" height="20" viewBox="0 0 18 20">
              <path d="M1 1l15 8.5-6.6 1.6L6 18z" fill="var(--presence-color)" stroke="#0a0e13" strokeWidth="1.4" strokeLinejoin="round" />
            </svg>
            <span className="cpm-presence-tag">
              <TagAvatar name={conn.name} avatarUrl={conn.avatarUrl} />
              {core.shortName(conn.name)}
              {status ? <small>{status}</small> : null}
            </span>
          </div>
        );
      })}
      {[...presence.carry].map(([sid, memberId]) => {
        const conn = presence.conns.get(sid);
        return (
          <CarryAvatar
            key={sid}
            name={conn?.name}
            avatarUrl={conn?.avatarUrl}
            color={core.memberColor(memberId)}
            refCb={el => { if (el) carryElsRef.current.set(sid, el); else carryElsRef.current.delete(sid); }}
          />
        );
      })}
    </div>
  );
}
