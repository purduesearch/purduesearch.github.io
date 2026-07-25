// Shared helpers for the when2meet-style meeting scheduler UI.
//
// Candidate slots and availability are stored as UTC ISO instants. Everyone
// renders them in the poll's `timezone` (the organizer's zone at creation) so
// the grid reads identically for all participants regardless of their browser.

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const WEEKDAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

/** The calendar day (YYYY-MM-DD) and 24h HH:MM of an instant, in a timezone. */
export function partsInTz(iso, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date(iso)).map(x => [x.type, x.value]));
  return { dayKey: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}` };
}

/**
 * Group candidate slot instants into a day × time grid.
 * Returns { days: [dayKey], times: [hm], slotAt: Map("dayKey hm" → iso) }.
 */
export function buildGrid(slotStarts, timeZone) {
  const days = new Set();
  const times = new Set();
  const slotAt = new Map();
  for (const iso of slotStarts) {
    const { dayKey, hm } = partsInTz(iso, timeZone);
    days.add(dayKey);
    times.add(hm);
    slotAt.set(`${dayKey} ${hm}`, iso);
  }
  return {
    days: [...days].sort(),
    times: [...times].sort(),
    slotAt,
  };
}

/** "Tue Jul 21" for a YYYY-MM-DD day key (weekday computed from the date). */
export function fmtDayLabel(dayKey) {
  const [y, m, d] = dayKey.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAYS[wd]} ${MONTHS[m - 1]} ${d}`;
}

/** "9:00 AM" for a 24h HH:MM. */
export function fmtTimeLabel(hm) {
  const [h, m] = hm.split(':').map(Number);
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

/** Render an instant as a full local-to-poll-tz label, e.g. "Tue, Jul 21, 9:00 AM". */
export function fmtInstant(iso, timeZone) {
  const { dayKey, hm } = partsInTz(iso, timeZone);
  return `${fmtDayLabel(dayKey)}, ${fmtTimeLabel(hm)}`;
}

/**
 * Build candidate slot instants from a set of local dates + a daily time window.
 * `dates` are YYYY-MM-DD strings interpreted in the organizer's local timezone;
 * the returned ISO strings are UTC. `startMin`/`endMin` are minutes-past-midnight
 * (end exclusive), `slotMinutes` the step.
 */
export function buildSlotStarts(dates, startMin, endMin, slotMinutes) {
  const out = [];
  for (const date of dates) {
    const [y, m, d] = date.split('-').map(Number);
    for (let min = startMin; min < endMin; min += slotMinutes) {
      const hh = Math.floor(min / 60);
      const mm = min % 60;
      out.push(new Date(y, m - 1, d, hh, mm, 0, 0).toISOString());
    }
  }
  return out.sort();
}

/** The organizer's IANA timezone (used to label the poll). */
export function localTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
  } catch {
    return 'America/New_York';
  }
}

/** Reconstruct { dates, startMin, endMin } from an existing poll's slotStarts. */
export function decomposeSlots(slotStarts, timeZone) {
  const dates = new Set();
  let minStart = 24 * 60;
  let maxEnd = 0;
  for (const iso of slotStarts) {
    const { dayKey, hm } = partsInTz(iso, timeZone);
    dates.add(dayKey);
    const [h, m] = hm.split(':').map(Number);
    const min = h * 60 + m;
    minStart = Math.min(minStart, min);
    maxEnd = Math.max(maxEnd, min);
  }
  return { dates: [...dates].sort(), startMin: minStart === 24 * 60 ? 540 : minStart, endMin: maxEnd + 30 };
}

export const SLOT_SIZES = [15, 30, 60];

export const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
export const WEEKDAYS_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Zero-padded YYYY-MM-DD for a Y / M(1-12) / D triple. */
export function toYmd(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Today as YYYY-MM-DD in local time. */
export function todayYmd() {
  const n = new Date();
  return toYmd(n.getFullYear(), n.getMonth() + 1, n.getDate());
}

/**
 * A month laid out as weeks of day-of-month numbers (null pads leading/trailing
 * cells). `month` is 0-indexed. Used by the when2meet-style date picker.
 */
export function monthGrid(year, month) {
  const startDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
