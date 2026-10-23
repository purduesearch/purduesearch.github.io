import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getStoredToken } from '../../api/clubPmClient';

/** Per-card presence for task rows: { lock, selection, viewing, label } or null. */
export const BoardPresenceContext = createContext(null);
export function useCardPresence(taskId) {
  const ctx = useContext(BoardPresenceContext);
  return ctx ? ctx.cardInfo(taskId) : null;
}

/**
 * Live board presence for one project board. Connects after first paint (the
 * client and pure core arrive in one dynamic import), only while `enabled`.
 * Cursor samples live in refs so 60 fps drawing never re-renders React.
 */
export default function useBoardPresence({ projectId, rootId, rootRef, enabled, compact, onPatch }) {
  const [state, setState] = useState(null);       // null until the module has loaded
  const [status, setStatus] = useState('off');
  const coreRef = useRef(null);
  const clientRef = useRef(null);
  const buffersRef = useRef(new Map());           // sid → sample buffer
  const carriedRef = useRef(new Set());           // task ids this tab is dragging (skipped by the anchor encoder)
  const onPatchRef = useRef(onPatch);
  onPatchRef.current = onPatch;

  useEffect(() => {
    if (!enabled || !projectId || !rootId) return undefined;
    let cancelled = false;
    const buffers = buffersRef.current;
    const start = () => import('./boardPresenceClient').then(mod => {
      if (cancelled) return;
      coreRef.current = mod;
      setState(mod.emptyPresence());
      clientRef.current = mod.createBoardPresence({
        projectId, rootId, getToken: getStoredToken, onStatus: setStatus,
        onMessage(msg) {
          if (msg[0] === 'f') {
            const t = performance.now();
            for (const [sid, anchor, fx, fy] of msg[1]) {
              let buf = buffersRef.current.get(sid);
              if (!buf) { buf = mod.createSampleBuffer(); buffersRef.current.set(sid, buf); }
              mod.pushSample(buf, { t, anchor, fx, fy });
            }
            return;
          }
          if (msg[0] === 'p') onPatchRef.current?.(msg[1], mod);
          if (msg[0] === 'bye' || msg[0] === 'room') buffersRef.current.delete(msg[1]);
          if (msg[0] === 'hi') {
            buffersRef.current.clear();
            const t = performance.now();
            for (const [sid, anchor, fx, fy] of msg[1].cursors) {
              const buf = mod.createSampleBuffer();
              mod.pushSample(buf, { t, anchor, fx, fy });
              buffersRef.current.set(sid, buf);
            }
          }
          setState(s => mod.reducePresence(s ?? mod.emptyPresence(), msg));
        },
      });
    });
    const idle = window.requestIdleCallback
      ? window.requestIdleCallback(start, { timeout: 1500 })
      : window.setTimeout(start, 300);
    return () => {
      cancelled = true;
      if (window.cancelIdleCallback) window.cancelIdleCallback(idle); else window.clearTimeout(idle);
      clientRef.current?.dispose();
      clientRef.current = null;
      buffers.clear();
      setState(null);
      setStatus('off');
    };
  }, [enabled, projectId, rootId]);

  // Send this tab's cursor (desktop only), at most one encode per animation frame.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || compact || status !== 'open') return undefined;
    let frame = 0, last = null;
    const onMove = e => {
      last = e;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const core = coreRef.current;
        if (core && last) clientRef.current?.cursor(core.encodeAnchor(root, last.clientX, last.clientY, carriedRef.current));
      });
    };
    root.addEventListener('pointermove', onMove, { passive: true });
    return () => { root.removeEventListener('pointermove', onMove); cancelAnimationFrame(frame); };
  }, [rootRef, compact, status]);

  // Per-card lookups for row flags, locks and drag guards. Null until the core has loaded.
  const cardContext = useMemo(() => {
    const core = coreRef.current;
    if (!state || !core) return null;
    return {
      cardInfo(taskId) {
        const info = { lock: core.lockInfo(state, taskId), selection: core.selectionInfo(state, taskId), viewing: core.viewingInfo(state, taskId) };
        return info.lock || info.selection || info.viewing ? info : null;
      },
    };
  }, [state]);

  return { state, status, core: coreRef.current, client: clientRef.current, buffersRef, carriedRef, cardContext };
}
