import { SEND_HZ } from './presenceCore';

// One live-board socket. Reconnects with jittered backoff, reports tab
// visibility, throttles cursors to SEND_HZ and only sends when they move,
// and turns lock requests into promises. Exports the pure core too, so the
// hook gets everything from one dynamic import.
export * from './presenceCore';

const API = process.env.REACT_APP_API_URL || '';

export function boardPresenceUrl(projectId, rootId) {
  const origin = (API || window.location.origin).replace(/^http/, 'ws');
  return `${origin}/collab/board?${new URLSearchParams({ project: projectId, root: rootId })}`;
}

export function createBoardPresence({ projectId, rootId, getToken, onMessage, onStatus }) {
  let ws = null;
  let disposed = false;
  let ready = false;            // true after "hi"; nothing but "auth" is sent before it
  let attempt = 0;
  let retryTimer = null;
  let hbTimer = null;
  let holding = false;
  let root = rootId;
  let lastCursor = null;
  let lastCursorSent = 0;
  let cursorTimer = null;
  const pendingLocks = new Map();

  const raw = msg => {
    if (!ws || ws.readyState !== 1 || !ready) return false;
    ws.send(JSON.stringify(msg));
    return true;
  };

  function heartbeat() {
    clearInterval(hbTimer);
    hbTimer = setInterval(() => raw(['hb']), holding ? 3000 : 25000);
  }
  function settle(key, result) {
    const p = pendingLocks.get(key);
    if (!p) return;
    clearTimeout(p.timer);
    pendingLocks.delete(key);
    p.resolve(result);
  }
  function failPending() {
    for (const key of [...pendingLocks.keys()]) settle(key, { ok: true, offline: true });
  }
  const onVisibility = () => raw(['h', document.hidden ? 1 : 0]);

  function connect() {
    if (disposed) return;
    const token = getToken();
    if (!token) { onStatus?.('off'); return; }
    ws = new WebSocket(boardPresenceUrl(projectId, root));
    onStatus?.('connecting');
    ws.onopen = () => ws.send(JSON.stringify(['auth', token]));
    ws.onmessage = ev => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (!Array.isArray(msg)) return;
      if (msg[0] === 'hi' && !ready) {
        ready = true;
        attempt = 0;
        onStatus?.('open');
        heartbeat();
        if (document.hidden) raw(['h', 1]);
      }
      if (msg[0] === 'ok' || msg[0] === 'no') {
        settle(msg[1][0], msg[0] === 'ok'
          ? { ok: true }
          : { ok: false, forbidden: msg[2] == null, holderSid: msg[2], holderMemberId: msg[3] });
        return;
      }
      onMessage(msg);
    };
    ws.onclose = ev => {
      ready = false;
      clearInterval(hbTimer);
      failPending();
      onStatus?.('closed');
      if (disposed || ev.code === 4401 || ev.code === 4404) return;
      if (ev.code === 4409 && ev.reason) root = ev.reason;
      const base = Math.min(30000, 1000 * 2 ** attempt++);
      retryTimer = setTimeout(connect, base / 2 + Math.random() * (base / 2));
    };
    ws.onerror = () => {};
  }

  function flushCursor() {
    cursorTimer = null;
    if (!lastCursor) return;
    if (raw(['c', ...lastCursor])) lastCursorSent = performance.now();
    lastCursor = null;
  }

  document.addEventListener('visibilitychange', onVisibility);
  connect();

  return {
    /** tuple = [anchor, fx, fy]; sends at most SEND_HZ, trailing edge included. */
    cursor(tuple) {
      lastCursor = tuple;
      const wait = 1000 / SEND_HZ - (performance.now() - lastCursorSent);
      if (wait <= 0) flushCursor();
      else if (!cursorTimer) cursorTimer = setTimeout(flushCursor, wait);
    },
    selection: ids => raw(['sel', ids.slice(0, 200)]),
    /** Resolves { ok } / { ok: false, holderSid, holderMemberId } / { ok: false, forbidden } / { ok: true, offline }. */
    requestLock(ids, grabbed) {
      return new Promise(resolve => {
        const key = ids[0];
        if (!raw(['ds', ids.slice(0, 200), grabbed])) { resolve({ ok: true, offline: true }); return; }
        const timer = setTimeout(() => settle(key, { ok: true, offline: true }), 2000);
        pendingLocks.set(key, { resolve, timer });
      }).then(r => { if (r.ok && !r.offline) { holding = true; heartbeat(); } return r; });
    },
    drop(ids, status) { holding = false; heartbeat(); raw(['de', ids, status ?? null]); },
    cancel(ids) { holding = false; heartbeat(); raw(['dc', ids]); },
    carry: memberId => raw(['as', memberId]),
    carryDrop: taskId => raw(['ae', taskId]),
    carryCancel: () => raw(['ac']),
    open: taskId => raw(['o', taskId]),
    close: () => raw(['oc']),
    join: id => raw(['join', id]),
    dispose() {
      disposed = true;
      clearTimeout(retryTimer);
      clearTimeout(cursorTimer);
      clearInterval(hbTimer);
      failPending();
      document.removeEventListener('visibilitychange', onVisibility);
      ws?.close(1000);
    },
  };
}
