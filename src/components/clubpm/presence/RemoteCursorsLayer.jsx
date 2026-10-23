import { useEffect, useRef, useState } from 'react';

const IDLE_MS = 5000;

function initials(name) {
  return String(name ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
}

function TagAvatar({ name, avatarUrl }) {
  const [failed, setFailed] = useState(false);
  if (!avatarUrl || failed) return <span className="cpm-presence-tag-avatar">{initials(name)}</span>;
  return <img className="cpm-presence-tag-avatar" src={avatarUrl} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
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

/**
 * Remote cursors for one board. Positions are written straight to the DOM from a
 * requestAnimationFrame loop, so cursor movement never re-renders React.
 */
export default function RemoteCursorsLayer({ rootRef, presence, buffersRef, core }) {
  const layerRef = useRef(null);
  const elsRef = useRef(new Map());               // sid → cursor element
  const listRef = useRef([]);
  const cursors = [...presence.conns.values()]
    .filter(c => c.room === presence.room && c.sid !== presence.self);
  listRef.current = cursors;

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const layer = layerRef.current;
      const root = rootRef.current;
      if (!layer || !root) return;
      const origin = layer.getBoundingClientRect();
      const box = visibleBox(root);
      const now = performance.now();
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
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [rootRef, buffersRef, core]);

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
    </div>
  );
}
