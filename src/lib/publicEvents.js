// Pure helpers for the public homepage events calendar. Everything is
// rendered in Purdue time so a student reading the site from anywhere sees
// when the meeting actually happens in West Lafayette.

export const PURDUE_TZ = 'America/Indiana/Indianapolis';

// Full literal FA class strings — the icon-subset scanner must see them.
export const PUBLIC_EVENT_TYPES = {
  MEETING:  { label: 'Meeting',  plural: 'Meetings',  icon: 'fas fa-users',              color: '#b83225' },
  WORKSHOP: { label: 'Workshop', plural: 'Workshops', icon: 'fas fa-chalkboard-teacher', color: '#9a5b00' },
  SOCIAL:   { label: 'Social',   plural: 'Socials',   icon: 'fas fa-star',               color: '#5b4bc4' },
  OTHER:    { label: 'Event',    plural: 'Other',     icon: 'fas fa-calendar-day',       color: '#6b5f58' },
};

export function typeConfig(type) {
  return PUBLIC_EVENT_TYPES[type] ?? PUBLIC_EVENT_TYPES.OTHER;
}

const dayPartsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: PURDUE_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
});
const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: PURDUE_TZ, hour: 'numeric', minute: '2-digit' });
const shortDateFmt = new Intl.DateTimeFormat('en-US', { timeZone: PURDUE_TZ, month: 'short', day: 'numeric' });
const tileFmt = new Intl.DateTimeFormat('en-US', { timeZone: PURDUE_TZ, month: 'short', day: 'numeric', weekday: 'short' });
// Day keys are calendar dates, so they're formatted as UTC noon to stay put.
const longDayFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' });
const monthFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' });

function parts(fmt, date) {
  return Object.fromEntries(fmt.formatToParts(new Date(date)).map(p => [p.type, p.value]));
}

/** 'YYYY-MM-DD' of the given instant in Purdue time. */
export function purdueDayKey(date) {
  const p = parts(dayPartsFmt, date);
  return `${p.year}-${p.month}-${p.day}`;
}

// ICU 72+ (Node 20, current Chrome) puts U+202F NARROW NO-BREAK SPACE before
// AM/PM; normalize so output is identical across engines and tests.
export function formatPurdueTime(date) {
  return timeFmt.format(new Date(date)).replace(/[\u202f\u00a0]/g, ' ');
}

export function formatTimeRange(start, end) {
  const s = formatPurdueTime(start);
  if (!end) return `${s} ET`;
  if (purdueDayKey(start) === purdueDayKey(end)) return `${s} – ${formatPurdueTime(end)} ET`;
  return `${s} – ${shortDateFmt.format(new Date(end))}, ${formatPurdueTime(end)} ET`;
}

export function dateTile(date) {
  const p = parts(tileFmt, date);
  return { month: p.month, day: p.day, weekday: p.weekday };
}

function keyToUtcNoon(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

export function formatDayKey(key) {
  return longDayFmt.format(keyToUtcNoon(key));
}

/** Whole-week grid for a month (month is 0-based). Pure calendar math in UTC. */
export function buildMonthGrid(year, month) {
  const lead = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const total = Math.ceil((lead + daysInMonth) / 7) * 7;
  return Array.from({ length: total }, (_, i) => {
    const d = new Date(Date.UTC(year, month, 1 - lead + i));
    return { key: d.toISOString().slice(0, 10), day: d.getUTCDate(), inMonth: d.getUTCMonth() === month };
  });
}

const byStart = (a, b) => new Date(a.startTime) - new Date(b.startTime);

export function groupByDay(events) {
  const map = new Map();
  for (const ev of [...events].sort(byStart)) {
    const key = purdueDayKey(ev.startTime);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(ev);
  }
  return map;
}

/** Events that haven't ended yet (in-progress ones included), soonest first. */
export function upcomingEvents(events, now = new Date()) {
  return events.filter(ev => new Date(ev.endTime ?? ev.startTime) >= now).sort(byStart);
}

export function filterByType(events, type) {
  if (type === 'ALL') return events;
  return events.filter(ev => (PUBLIC_EVENT_TYPES[ev.type] ? ev.type : 'OTHER') === type);
}

export function purdueMonthOf(date) {
  const [y, m] = purdueDayKey(date).split('-').map(Number);
  return { year: y, month: m - 1 };
}

export function shiftMonth({ year, month }, delta) {
  const idx = year * 12 + month + delta;
  return { year: Math.floor(idx / 12), month: ((idx % 12) + 12) % 12 };
}

export function compareMonth(a, b) {
  return (a.year * 12 + a.month) - (b.year * 12 + b.month);
}

export function monthLabel({ year, month }) {
  return monthFmt.format(new Date(Date.UTC(year, month, 1, 12)));
}
