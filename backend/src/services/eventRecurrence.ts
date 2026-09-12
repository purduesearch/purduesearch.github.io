// Pure occurrence math for recurring calendar events. No DB, so it is unit
// tested directly (eventRecurrence.test.ts).
//
// Occurrences keep the series' *wall-clock* time in the club's time zone, not
// its UTC time: a 7 pm weekly meeting stays at 7 pm after the November DST
// change instead of drifting to 6 pm. Same zone the public ICS feed declares
// (publicEventService.ts X-WR-TIMEZONE).

export const CLUB_TIME_ZONE = "America/Indiana/Indianapolis";

// How many copies to create (beyond the original) when the series has no end
// date. With an end date, every occurrence up to it is created, capped at
// MAX_OCCURRENCES so a far-off "until" can't flood the calendar.
const DEFAULT_COPIES: Record<string, number> = { weekly: 8, biweekly: 4, monthly: 2 };
export const MAX_OCCURRENCES = 52;

interface WallClock { y: number; mo: number; d: number; h: number; mi: number; s: number; ms: number }

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone, hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

function wallClock(t: number, timeZone: string): WallClock {
  const p = Object.fromEntries(formatter(timeZone).formatToParts(new Date(t)).map(x => [x.type, x.value]));
  return {
    y: Number(p.year), mo: Number(p.month) - 1, d: Number(p.day),
    h: Number(p.hour), mi: Number(p.minute), s: Number(p.second),
    ms: new Date(t).getUTCMilliseconds(),
  };
}

// Zone offset (ms) at instant t: wall-clock-read-as-UTC minus the instant.
function zoneOffset(t: number, timeZone: string): number {
  const w = wallClock(t, timeZone);
  return Date.UTC(w.y, w.mo, w.d, w.h, w.mi, w.s, w.ms) - t;
}

// Instant at which the zone's wall clock reads `w`. Two passes settle the
// offset on either side of a DST transition.
function fromWallClock(w: WallClock, timeZone: string): Date {
  const naive = Date.UTC(w.y, w.mo, w.d, w.h, w.mi, w.s, w.ms);
  const first = naive - zoneOffset(naive, timeZone);
  return new Date(naive - zoneOffset(first, timeZone));
}

// Wall-clock time at `t`, read as if it were UTC. Differences between two of
// these are wall-clock differences, immune to the zone's DST offset.
function naiveWallClock(t: number, timeZone: string): number {
  const w = wallClock(t, timeZone);
  return Date.UTC(w.y, w.mo, w.d, w.h, w.mi, w.s, w.ms);
}

/**
 * Applies to `t` the same local-time change that took `from` to `to`, e.g.
 * "an hour later" or "a day later at 19:30". Used when editing a whole series:
 * every occurrence moves the way the edited one did, and an occurrence on the
 * other side of a DST change still reads the same new local time.
 */
export function shiftWallClock(t: Date, from: Date, to: Date, timeZone: string = CLUB_TIME_ZONE): Date {
  const delta = naiveWallClock(to.getTime(), timeZone) - naiveWallClock(from.getTime(), timeZone);
  if (delta === 0) return new Date(t);
  const d = new Date(naiveWallClock(t.getTime(), timeZone) + delta);
  return fromWallClock({
    y: d.getUTCFullYear(), mo: d.getUTCMonth(), d: d.getUTCDate(),
    h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds(), ms: d.getUTCMilliseconds(),
  }, timeZone);
}

function daysInMonth(y: number, mo: number): number {
  return new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
}

// The n-th occurrence after `base` (n >= 1), in base's wall-clock time.
function nthOccurrence(base: WallClock, pattern: string, n: number): WallClock | null {
  switch (pattern) {
    case "weekly":
    case "biweekly": {
      const step = pattern === "weekly" ? 7 : 14;
      // Date.UTC normalises day overflow into the following month/year.
      const day = new Date(Date.UTC(base.y, base.mo, base.d + step * n));
      return { ...base, y: day.getUTCFullYear(), mo: day.getUTCMonth(), d: day.getUTCDate() };
    }
    case "monthly": {
      // Always counted from the original date, so Jan 31 → Feb 28 → Mar 31
      // rather than drifting to the 28th forever.
      const total = base.mo + n;
      const y = base.y + Math.floor(total / 12);
      const mo = ((total % 12) + 12) % 12;
      return { ...base, y, mo, d: Math.min(base.d, daysInMonth(y, mo)) };
    }
    default:
      return null;
  }
}

/**
 * Start times of the copies to create for a recurring event — the original
 * event itself is NOT included. Unknown patterns yield no copies.
 */
export function recurrenceStarts(
  start: Date,
  pattern: string,
  until?: Date | null,
  timeZone: string = CLUB_TIME_ZONE,
): Date[] {
  if (!(pattern in DEFAULT_COPIES)) return [];
  const base = wallClock(start.getTime(), timeZone);
  const limit = until ? MAX_OCCURRENCES : DEFAULT_COPIES[pattern];
  const out: Date[] = [];
  for (let n = 1; n <= limit; n++) {
    const w = nthOccurrence(base, pattern, n);
    if (!w) break;
    const next = fromWallClock(w, timeZone);
    if (until && next.getTime() > until.getTime()) break;
    out.push(next);
  }
  return out;
}
