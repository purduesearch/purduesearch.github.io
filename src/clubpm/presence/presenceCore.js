// Pure helpers for live board presence: names, colours, anchor codec,
// snapshot interpolation and the presence state reducer. Loaded lazily by
// useBoardPresence; never import this statically from ProjectDetail.

const PALETTE = ['#00e5cc', '#f5a623', '#b69cff', '#ff7a6b', '#6cb6ff', '#9be15d', '#ff8fd0', '#ffd166'];

export function memberColor(memberId) {
  let h = 0;
  for (const ch of String(memberId ?? '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** "Maya Rodriguez" → "Maya R.", "Maya" → "Maya". */
export function shortName(displayName) {
  const parts = String(displayName ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Someone';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

// ── Anchors ──────────────────────────────────────────────────────────────
// A cursor is sent as "this element, this spot inside it" so every viewer can
// resolve it against their own layout. Most specific source first.
export const ANCHOR_SOURCES = [
  { prefix: 'k', attr: 'data-completion-id' },
  { prefix: 'm', attr: 'data-presence-member' },
  { prefix: 'c', attr: 'data-bin-id' },
];
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const q = v => Math.round(Math.min(1, Math.max(0, v)) * 1000);

/** Viewport point → [anchor, fx, fy]. `skip` is a Set of task ids being carried (their rows move). */
export function encodeAnchor(root, x, y, skip) {
  for (const { prefix, attr } of ANCHOR_SOURCES) {
    for (const el of root.querySelectorAll(`[${attr}]`)) {
      const id = el.getAttribute(attr);
      if (!ID_RE.test(id) || (prefix === 'k' && skip && skip.has(id))) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        return [`${prefix}:${id}`, q((x - r.left) / r.width), q((y - r.top) / r.height)];
      }
    }
  }
  const r = root.getBoundingClientRect();
  return ['b', q((x - r.left) / (r.width || 1)), q((y - r.top) / (r.height || 1))];
}

export function findAnchor(root, anchor) {
  if (anchor === 'b') return root;
  const [prefix, id] = [anchor.slice(0, 1), anchor.slice(2)];
  const src = ANCHOR_SOURCES.find(s => s.prefix === prefix);
  if (!src || !ID_RE.test(id)) return null;
  return root.querySelector(`[${src.attr}="${id}"]`);
}

/** [anchor, fx, fy] → viewport point, or null when that element is not on this screen. */
export function decodeAnchor(root, anchor, fx, fy) {
  const el = findAnchor(root, anchor);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) return null;
  return { x: r.left + (fx / 1000) * r.width, y: r.top + (fy / 1000) * r.height };
}

// ── Snapshot interpolation ───────────────────────────────────────────────
export function createSampleBuffer(max = 12) { return { samples: [], max, lastAt: 0 }; }

/** sample: { t, anchor, fx, fy } with t = local receive time (performance.now()). */
export function pushSample(buf, sample) {
  buf.samples.push(sample);
  if (buf.samples.length > buf.max) buf.samples.shift();
  buf.lastAt = sample.t;
}

/** Draw `delay` ms in the past, blending the two real samples around that moment. */
export function sampleAt(buf, t, delay, decode) {
  const s = buf.samples;
  if (!s.length) return null;
  const last = s[s.length - 1];
  const rt = t - delay;
  if (delay <= 0 || s.length === 1 || rt >= last.t) return decode(last);
  if (rt <= s[0].t) return decode(s[0]);
  for (let i = s.length - 1; i > 0; i--) {
    const a = s[i - 1], b = s[i];
    if (rt >= a.t) {
      const pa = decode(a), pb = decode(b);
      if (!pa || !pb) return pb || pa;
      const k = (rt - a.t) / (b.t - a.t || 1);
      return { x: pa.x + (pb.x - pa.x) * k, y: pa.y + (pb.y - pa.y) * k };
    }
  }
  return decode(last);
}

export const SEND_HZ = 15;
export const INTERP_DELAY_MS = Math.max(1000 / SEND_HZ, 50) * 1.5;

// ── Presence state ───────────────────────────────────────────────────────
// conns: sid → { sid, memberId, name, avatarUrl, room }
// locks: taskId → { sid, memberId }        drags: sid → { ids, grabbed, dropped }
// sel: sid → ids   carry: sid → memberId   viewing: sid → taskId   projects: id → name
export function emptyPresence() {
  return { self: null, room: null, projects: new Map(), conns: new Map(), locks: new Map(),
    drags: new Map(), sel: new Map(), carry: new Map(), viewing: new Map() };
}

function without(map, key) { const next = new Map(map); next.delete(key); return next; }

function dropSid(state, sid, keepLocks) {
  return {
    ...state,
    sel: without(state.sel, sid), carry: without(state.carry, sid), viewing: without(state.viewing, sid),
    drags: keepLocks ? state.drags : without(state.drags, sid),
    locks: keepLocks ? state.locks : new Map([...state.locks].filter(([, l]) => l.sid !== sid)),
  };
}

function reduceEvent(state, [, sid, type, a, b]) {
  switch (type) {
    case 'sel': { const sel = new Map(state.sel); if (a.length) sel.set(sid, a); else sel.delete(sid); return { ...state, sel }; }
    case 'ds': {
      const locks = new Map(state.locks);
      const memberId = state.conns.get(sid)?.memberId ?? null;
      a.forEach(id => locks.set(id, { sid, memberId }));
      return { ...state, locks, drags: new Map(state.drags).set(sid, { ids: a, grabbed: b, dropped: false }) };
    }
    case 'de': {
      const d = state.drags.get(sid);
      return d ? { ...state, drags: new Map(state.drags).set(sid, { ...d, dropped: true }) } : state;
    }
    case 'dc': {
      const locks = new Map(state.locks);
      a.forEach(id => { if (locks.get(id)?.sid === sid) locks.delete(id); });
      return { ...state, locks, drags: sid ? without(state.drags, sid) : state.drags };
    }
    case 'as': return { ...state, carry: new Map(state.carry).set(sid, a) };
    case 'ae': case 'ac': return { ...state, carry: without(state.carry, sid) };
    case 'o': return { ...state, viewing: new Map(state.viewing).set(sid, a) };
    case 'oc': return { ...state, viewing: without(state.viewing, sid) };
    default: return state;
  }
}

/** Every server frame except "f" (cursors) and "ok"/"no" (lock answers) goes through here. */
export function reducePresence(state, msg) {
  switch (msg[0]) {
    case 'hi': {
      const s = msg[1];
      return {
        self: s.self, room: s.room,
        projects: new Map(s.projects),
        conns: new Map(s.conns.map(([sid, memberId, name, avatarUrl, room]) => [sid, { sid, memberId, name, avatarUrl, room }])),
        locks: new Map(s.locks.map(([id, sid, memberId]) => [id, { sid, memberId }])),
        drags: new Map(s.drags.map(([sid, ids, grabbed]) => [sid, { ids, grabbed, dropped: false }])),
        sel: new Map(s.sel), carry: new Map(s.carry), viewing: new Map(s.viewing),
      };
    }
    case 'join': {
      const [, sid, memberId, name, avatarUrl, room] = msg;
      return { ...state, conns: new Map(state.conns).set(sid, { sid, memberId, name, avatarUrl, room }) };
    }
    case 'bye': return dropSid({ ...state, conns: without(state.conns, msg[1]) }, msg[1], false);
    case 'room': {
      const [, sid, room] = msg;
      const c = state.conns.get(sid);
      const conns = c ? new Map(state.conns).set(sid, { ...c, room }) : state.conns;
      return dropSid({ ...state, conns }, sid, true);
    }
    case 'e': return reduceEvent(state, msg);
    case 'p': {
      const ids = new Set(msg[1].map(e => e.id));
      if (![...ids].some(id => state.locks.has(id))) return state;
      const locks = new Map([...state.locks].filter(([id]) => !ids.has(id)));
      const drags = new Map([...state.drags].filter(([, d]) => !d.ids.some(id => ids.has(id))));
      return { ...state, locks, drags };
    }
    default: return state;
  }
}

/** Who else is holding this card, with display info; null when free or held by this tab. */
export function lockInfo(state, taskId) {
  const l = state.locks.get(taskId);
  if (!l || (l.sid && l.sid === state.self)) return null;
  const c = l.sid ? state.conns.get(l.sid) : null;
  const memberId = l.memberId ?? c?.memberId ?? null;
  const board = c && c.room !== state.room ? state.projects.get(c.room) || null : null;
  return { sid: l.sid, memberId, name: shortName(c?.name), color: memberColor(memberId), board };
}

/** First other person whose selection includes this card. */
export function selectionInfo(state, taskId) {
  for (const [sid, ids] of state.sel) {
    if (sid === state.self || !ids.includes(taskId)) continue;
    const c = state.conns.get(sid);
    return { sid, name: shortName(c?.name), color: memberColor(c?.memberId), count: ids.length, first: ids[0] === taskId };
  }
  return null;
}

export function viewingInfo(state, taskId) {
  for (const [sid, id] of state.viewing) {
    if (sid === state.self || id !== taskId) continue;
    const c = state.conns.get(sid);
    return { sid, name: shortName(c?.name), color: memberColor(c?.memberId) };
  }
  return null;
}
