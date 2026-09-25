// Pure helpers for the lab schedule UI. Dates are local "YYYY-MM-DD" strings in
// the workspace's timezone and times are minutes past local midnight — the same
// model as backend/src/services/labScheduleCore.ts.

export const SLOT = 30;
export const ROW_PX = 22;

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const noon = (ymd) => new Date(`${ymd}T12:00:00Z`);

export function addDays(ymd, n) {
  const d = noon(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const weekdayOf = (ymd) => noon(ymd).getUTCDay();
export const mondayOf = (ymd) => addDays(ymd, -((weekdayOf(ymd) + 6) % 7));

export function todayInZone(timeZone, now = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const g = (t) => p.find(x => x.type === t)?.value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}

export function fmtMin(min) {
  const m = ((min % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m % 60).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
}
/** Gutter label: "2 PM" on the hour, "2:30" on the half hour. */
export function fmtMinShort(min) {
  const [t, ap] = fmtMin(min).split(' ');
  return t.endsWith(':00') ? `${t.slice(0, -3)} ${ap}` : t;
}
export function fmtRange(a, b) {
  const [at, am] = fmtMin(a).split(' ');
  const [bt, bm] = fmtMin(b).split(' ');
  return am === bm ? `${at}–${bt} ${bm}` : `${at} ${am}–${bt} ${bm}`;
}
export function dayHeader(ymd) {
  const d = noon(ymd);
  return { dow: DOW[d.getUTCDay()], dom: d.getUTCDate(), month: MON[d.getUTCMonth()] };
}
export function weekLabel(dates) {
  const a = dayHeader(dates[0]), b = dayHeader(dates[dates.length - 1]);
  return `${a.month} ${a.dom} – ${b.month} ${b.dom}`;
}

export function rowStarts(openStartMin, openEndMin) {
  const out = [];
  for (let m = openStartMin; m < openEndMin; m += SLOT) out.push(m);
  return out;
}
export function blockBox(startMin, endMin, openStartMin) {
  return { top: ((startMin - openStartMin) / SLOT) * ROW_PX, height: ((endMin - startMin) / SLOT) * ROW_PX };
}
export const heatLevel = (n) => (n <= 0 ? 0 : Math.min(n, 4));

export function rectFromIndices({ d0, d1, t0, t1 }, dates, rows) {
  return { dates: dates.slice(d0, d1 + 1), startMin: rows[t0], endMin: rows[t1] + SLOT };
}

export const cellKey = (date, min) => `${date}|${min}`;
function eachCell(o, fn) { for (let m = o.startMin; m < o.endMin; m += SLOT) fn(cellKey(o.date, m)); }

export function ownCells(occurrences, memberId) {
  const out = new Set();
  for (const o of occurrences) if (o.memberId === memberId) eachCell(o, k => out.add(k));
  return out;
}
export function othersHeat(occurrences, memberId) {
  const out = new Map();
  for (const o of occurrences) if (o.memberId !== memberId) eachCell(o, k => out.set(k, (out.get(k) ?? 0) + 1));
  return out;
}

export function overlapNames(rect, occurrences, memberId, membersById) {
  const hits = new Map();
  for (const o of occurrences) {
    if (o.memberId === memberId || !rect.dates.includes(o.date)) continue;
    if (o.startMin >= rect.endMin || o.endMin <= rect.startMin) continue;
    const days = hits.get(o.memberId) ?? [];
    const dow = dayHeader(o.date).dow;
    if (!days.includes(dow)) days.push(dow);
    hits.set(o.memberId, days);
  }
  return [...hits].map(([id, days]) => ({ id, name: membersById.get(id)?.displayName ?? 'Someone', days }));
}

export function describeRect(rect) {
  const a = dayHeader(rect.dates[0]).dow, b = dayHeader(rect.dates[rect.dates.length - 1]).dow;
  return `${a === b ? a : `${a}–${b}`} · ${fmtRange(rect.startMin, rect.endMin)}`;
}

/** Indices of Sat/Sun columns with nothing on them (Everyone view only). */
export function collapsedDays(dates, blocks, events) {
  const out = new Set();
  dates.forEach((d, i) => {
    if (weekdayOf(d) % 6 !== 0) return;
    if (blocks.some(b => b.date === d) || events.some(e => e.date === d)) return;
    out.add(i);
  });
  return out;
}

export function unmetRequirements(workspace, statusForMe) {
  return workspace.requirements
    .map(r => ({ ...r, state: statusForMe?.[r.id] ?? 'missing' }))
    .filter(r => r.state !== 'ok');
}

// ── Overlap finder ───────────────────────────────────────────

const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function scoreWindow(w) { return (w.endMin - w.startMin) * w.memberIds.length; }

/**
 * Windows where >= minCount of memberIds overlap, per date, merged across 30-min slots.
 * Consecutive qualifying slots merge only when the set of people present is identical.
 * `weekly` is true when every occurrence contributing to the window is a recurring rule.
 * Returns [{ date, startMin, endMin, memberIds, weekly }] sorted by score desc then date/start.
 */
export function overlapWindows(occurrences, memberIds, minCount, dates, slot = SLOT) {
  const chosen = new Set(memberIds);
  const need = Math.max(1, minCount);
  const out = [];
  for (const date of dates) {
    const occ = occurrences.filter(o => o.date === date && chosen.has(o.memberId));
    if (occ.length === 0) continue;
    const lo = Math.min(...occ.map(o => o.startMin));
    const hi = Math.max(...occ.map(o => o.endMin));
    let cur = null;
    for (let m = lo; m < hi; m += slot) {
      const here = occ.filter(o => o.startMin <= m && o.endMin >= m + slot);
      const ids = [...new Set(here.map(o => o.memberId))].sort();
      if (ids.length < need) { cur = null; continue; }
      const weekly = here.every(o => o.weekly);
      if (cur && cur.endMin === m && cur.memberIds.join(',') === ids.join(',')) {
        cur.endMin = m + slot;
        cur.weekly = cur.weekly && weekly;
      } else {
        cur = { date, startMin: m, endMin: m + slot, memberIds: ids, weekly };
        out.push(cur);
      }
    }
  }
  return out.sort((a, b) => scoreWindow(b) - scoreWindow(a) || a.date.localeCompare(b.date) || a.startMin - b.startMin);
}

function joinNames(names) {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

/** Names arrive pre-formatted ("@Display Name" or a plain name). */
export function draftLabMessage({ names, window, recurring, taskTitle }) {
  const day = DOW_LONG[weekdayOf(window.date)];
  const when = recurring
    ? `every ${day} ${fmtRange(window.startMin, window.endMin)}`
    : `${day} ${fmtRange(window.startMin, window.endMin)} this week`;
  const task = taskTitle ? ` to work on "${taskTitle}"` : '';
  return `Hey ${joinNames(names)}, would you like to meet in the lab ${when}${task}?`;
}
