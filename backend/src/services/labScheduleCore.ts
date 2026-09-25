/**
 * Lab schedule — pure logic. No Prisma, no clock reads.
 *
 * Shifts are stored as weekly rules in the workspace's LOCAL wall-clock time:
 * a weekday, start/end minutes past local midnight, and a local date range.
 * Because nothing here is a UTC instant, expansion needs no timezone and a
 * 2 PM shift stays 2 PM across DST. Only calendar events (real instants) are
 * converted, in eventToBand().
 *
 * Dates are "YYYY-MM-DD" strings throughout. They compare correctly as strings.
 */

export type Ymd = string;
export const SLOT_MINUTES = 30;
export const DAY_MINUTES = 1440;
/** Weekly shifts end this many weeks out when the space has no term end. */
export const DEFAULT_WEEKS = 16;

export interface ShiftDraft {
  weekday: number;
  startMin: number;
  endMin: number;
  startsOn: Ymd;
  endsOn: Ymd;
  buddyWanted: boolean;
}
export interface ShiftRow extends ShiftDraft { id: string; memberId: string; }
export interface SkipRow { shiftId: string; date: Ymd; }
export interface Occurrence {
  shiftId: string; memberId: string; date: Ymd;
  startMin: number; endMin: number; buddyWanted: boolean;
}
export interface EventBand {
  eventId: string; title: string; date: Ymd;
  startMin: number; endMin: number; attendeeIds: string[];
}
export interface PresenceBlock {
  date: Ymd; startMin: number; endMin: number;
  memberIds: string[]; headcount: number; solo: boolean;
  buddyMemberIds: string[]; eventIds: string[];
}
export interface Interval { date: Ymd; startMin: number; endMin: number; }

// ── Dates ────────────────────────────────────────────────────

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const noon = (ymd: Ymd) => new Date(`${ymd}T12:00:00Z`);

export function isYmd(v: unknown): v is Ymd {
  if (typeof v !== "string" || !YMD_RE.test(v)) return false;
  const d = noon(v);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
export function addDays(ymd: Ymd, n: number): Ymd {
  const d = noon(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function weekdayOf(ymd: Ymd): number { return noon(ymd).getUTCDay(); }
export function mondayOf(ymd: Ymd): Ymd { return addDays(ymd, -((weekdayOf(ymd) + 6) % 7)); }
export function weekDates(monday: Ymd): Ymd[] { return Array.from({ length: 7 }, (_, i) => addDays(monday, i)); }
/** Prisma @db.Date columns round-trip as UTC midnight. */
export function toDbDate(ymd: Ymd): Date { return new Date(`${ymd}T00:00:00Z`); }
export function fromDbDate(d: Date): Ymd { return d.toISOString().slice(0, 10); }

export function localDateMinutes(instant: Date, timeZone: string): { date: Ymd; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}
export function todayIn(timeZone: string, now: Date = new Date()): Ymd {
  return localDateMinutes(now, timeZone).date;
}

// ── Expansion + presence ─────────────────────────────────────

export function expandShifts(shifts: ShiftRow[], skips: SkipRow[], dates: Ymd[]): Occurrence[] {
  const skipped = new Set(skips.map(s => `${s.shiftId}|${s.date}`));
  const out: Occurrence[] = [];
  for (const date of dates) {
    const wd = weekdayOf(date);
    for (const s of shifts) {
      if (s.weekday !== wd || s.startsOn > date || s.endsOn < date) continue;
      if (skipped.has(`${s.id}|${date}`)) continue;
      out.push({ shiftId: s.id, memberId: s.memberId, date, startMin: s.startMin, endMin: s.endMin, buddyWanted: s.buddyWanted });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin);
}

export function eventToBand(
  ev: { id: string; title: string; startTime: Date; endTime: Date | null; attendeeIds: string[] },
  timeZone: string,
): EventBand {
  const start = localDateMinutes(ev.startTime, timeZone);
  let endMin: number;
  if (!ev.endTime) endMin = Math.min(DAY_MINUTES, start.minutes + 60);
  else {
    const end = localDateMinutes(ev.endTime, timeZone);
    endMin = end.date === start.date ? end.minutes : DAY_MINUTES;
  }
  if (endMin <= start.minutes) endMin = Math.min(DAY_MINUTES, start.minutes + SLOT_MINUTES);
  return { eventId: ev.id, title: ev.title, date: start.date, startMin: start.minutes, endMin, attendeeIds: ev.attendeeIds };
}

const blockKey = (b: PresenceBlock) => `${b.memberIds.join(",")}|${b.buddyMemberIds.join(",")}|${b.eventIds.join(",")}`;

/** Maximal intervals on one date during which the set of people present is constant. */
export function mergePresence(date: Ymd, occurrences: Occurrence[], bands: EventBand[]): PresenceBlock[] {
  const occ = occurrences.filter(o => o.date === date);
  const evs = bands.filter(b => b.date === date);
  const cuts = new Set<number>();
  for (const x of [...occ, ...evs]) { cuts.add(x.startMin); cuts.add(x.endMin); }
  const points = [...cuts].sort((a, b) => a - b);

  const out: PresenceBlock[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const members = new Set<string>(), buddies = new Set<string>(), events = new Set<string>();
    for (const o of occ) {
      if (o.startMin <= a && o.endMin >= b) { members.add(o.memberId); if (o.buddyWanted) buddies.add(o.memberId); }
    }
    for (const e of evs) {
      if (e.startMin <= a && e.endMin >= b) { events.add(e.eventId); for (const id of e.attendeeIds) members.add(id); }
    }
    if (members.size === 0 && events.size === 0) continue;
    const block: PresenceBlock = {
      date, startMin: a, endMin: b,
      memberIds: [...members].sort(), headcount: members.size, solo: members.size === 1,
      buddyMemberIds: [...buddies].sort(), eventIds: [...events].sort(),
    };
    const prev = out[out.length - 1];
    if (prev && prev.endMin === a && blockKey(prev) === blockKey(block)) prev.endMin = b;
    else out.push(block);
  }
  return out;
}

// ── Apply (add / erase a rectangle) ──────────────────────────

export type ApplyOp = "add" | "erase";
export type ApplyScope = "weekly" | "dates";
export interface ApplyInput {
  op: ApplyOp; scope: ApplyScope; dates: Ymd[];
  startMin: number; endMin: number;
  /** Only for weekly adds; null otherwise. */
  endsOn: Ymd | null;
  buddyWanted: boolean;
}
export interface OpenHours { openStartMin: number; openEndMin: number; defaultEndsOn: Ymd | null; }

export function validateApply(body: unknown, ws: OpenHours, today: Ymd):
  { ok: true; value: ApplyInput } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const fail = (error: string) => ({ ok: false as const, error });

  if (b.op !== "add" && b.op !== "erase") return fail('op must be "add" or "erase".');
  if (b.scope !== "weekly" && b.scope !== "dates") return fail('scope must be "weekly" or "dates".');
  if (!Array.isArray(b.dates) || b.dates.length === 0) return fail("Select at least one day.");
  if (!b.dates.every(isYmd)) return fail("Dates must be YYYY-MM-DD.");
  const dates = [...new Set(b.dates as Ymd[])].sort();
  if (dates.length > 7) return fail("Select at most one week of days.");
  if (new Set(dates.map(mondayOf)).size !== 1) return fail("Select days from a single week.");

  const startMin = b.startMin, endMin = b.endMin;
  if (!Number.isInteger(startMin) || !Number.isInteger(endMin)) return fail("Times must be whole minutes.");
  const s = startMin as number, e = endMin as number;
  if (s % SLOT_MINUTES !== 0 || e % SLOT_MINUTES !== 0) return fail("Times must be on the half hour.");
  if (s >= e) return fail("End time must be after start time.");
  if (s < ws.openStartMin || e > ws.openEndMin) return fail(`This space is open ${formatRange(ws.openStartMin, ws.openEndMin)}.`);

  let endsOn: Ymd | null = null;
  if (b.op === "add" && b.scope === "weekly") {
    if (b.endsOn != null && b.endsOn !== "") {
      if (!isYmd(b.endsOn)) return fail("Until date must be YYYY-MM-DD.");
      endsOn = b.endsOn;
    } else {
      endsOn = ws.defaultEndsOn && ws.defaultEndsOn >= dates[0] ? ws.defaultEndsOn : addDays(dates[0], DEFAULT_WEEKS * 7);
    }
    if (endsOn < dates[0]) return fail("Until date must be on or after the first selected day.");
    if (endsOn > addDays(today, 366)) return fail("Until date can be at most a year away.");
  }

  return { ok: true, value: { op: b.op, scope: b.scope, dates, startMin: s, endMin: e, endsOn, buddyWanted: b.buddyWanted === true } };
}

export function rectToShifts(v: ApplyInput): ShiftDraft[] {
  return v.dates
    .map(d => ({
      weekday: weekdayOf(d), startMin: v.startMin, endMin: v.endMin,
      startsOn: d, endsOn: v.scope === "weekly" && v.endsOn ? v.endsOn : d,
      buddyWanted: v.buddyWanted,
    }))
    .filter(d => d.endsOn >= d.startsOn);
}

export interface ErasePlan {
  deletes: string[];
  updates: { id: string; data: Partial<ShiftDraft> }[];
  creates: ShiftDraft[];
  skips: SkipRow[];
}

/** [s0,e0) minus [s1,e1): zero, one or two pieces. */
function subtract(s0: number, e0: number, s1: number, e1: number): [number, number][] {
  const out: [number, number][] = [];
  if (s1 > s0) out.push([s0, Math.min(e0, s1)]);
  if (e1 < e0) out.push([Math.max(s0, e1), e0]);
  return out.filter(([a, b]) => b > a);
}

/**
 * How to remove the rectangle from one member's own shifts.
 * weekly: from each selected date onward (earlier weeks keep their history).
 * dates:  only those dates — recurring rules get a skip plus one-off remainders.
 */
export function planErase(
  own: ShiftRow[], skips: SkipRow[],
  rect: { dates: Ymd[]; startMin: number; endMin: number; scope: ApplyScope },
): ErasePlan {
  const plan: ErasePlan = { deletes: [], updates: [], creates: [], skips: [] };
  const skipped = new Set(skips.map(s => `${s.shiftId}|${s.date}`));

  for (const d of [...rect.dates].sort()) {
    const wd = weekdayOf(d);
    for (const s of own) {
      if (s.weekday !== wd || s.endsOn < d) continue;
      if (rect.scope === "dates" && s.startsOn > d) continue;
      if (s.startMin >= rect.endMin || s.endMin <= rect.startMin) continue;

      const rest = subtract(s.startMin, s.endMin, rect.startMin, rect.endMin);
      const piece = ([a, b]: [number, number], startsOn: Ymd, endsOn: Ymd): ShiftDraft =>
        ({ weekday: s.weekday, startMin: a, endMin: b, startsOn, endsOn, buddyWanted: s.buddyWanted });
      const oneOff = s.startsOn === s.endsOn;

      if (rect.scope === "dates" && !oneOff) {
        if (skipped.has(`${s.id}|${d}`)) continue;
        plan.skips.push({ shiftId: s.id, date: d });
        for (const p of rest) plan.creates.push(piece(p, d, d));
        continue;
      }
      if (s.startsOn < d) {
        plan.updates.push({ id: s.id, data: { endsOn: addDays(d, -1) } });
        for (const p of rest) plan.creates.push(piece(p, d, s.endsOn));
      } else if (rest.length === 0) {
        plan.deletes.push(s.id);
      } else {
        plan.updates.push({ id: s.id, data: { startMin: rest[0][0], endMin: rest[0][1] } });
        if (rest[1]) plan.creates.push(piece(rest[1], s.startsOn, s.endsOn));
      }
    }
  }
  return plan;
}

/** Per other member: the intervals where their occurrences overlap mine. */
export function overlapsFor(mine: Occurrence[], others: Occurrence[]): Map<string, Interval[]> {
  const out = new Map<string, Interval[]>();
  for (const o of others) {
    for (const m of mine) {
      if (o.memberId === m.memberId || o.date !== m.date) continue;
      const lo = Math.max(o.startMin, m.startMin), hi = Math.min(o.endMin, m.endMin);
      if (lo >= hi) continue;
      const list = out.get(o.memberId) ?? [];
      list.push({ date: o.date, startMin: lo, endMin: hi });
      out.set(o.memberId, list);
    }
  }
  return out;
}

// ── Formatting (notification text) ───────────────────────────

const WEEKDAY_PLURAL = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatMinutes(min: number): string {
  const m = ((min % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  const h24 = Math.floor(m / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m % 60).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
}
export function formatRange(startMin: number, endMin: number): string {
  const [at, am] = formatMinutes(startMin).split(" ");
  const [bt, bm] = formatMinutes(endMin).split(" ");
  return am === bm ? `${at}–${bt} ${bm}` : `${at} ${am}–${bt} ${bm}`;
}
export function formatDate(ymd: Ymd): string {
  const d = noon(ymd);
  return `${WEEKDAY_SHORT[d.getUTCDay()]} ${MONTH_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
export function describeDrafts(drafts: ShiftDraft[]): string {
  if (drafts.length === 0) return "";
  const first = [...drafts].sort((a, b) => a.startsOn.localeCompare(b.startsOn) || a.startMin - b.startMin)[0];
  const range = formatRange(first.startMin, first.endMin);
  const head = first.startsOn === first.endsOn ? `${formatDate(first.startsOn)}, ${range}` : `${WEEKDAY_PLURAL[first.weekday]} ${range}`;
  return drafts.length > 1 ? `${head} (+${drafts.length - 1} more)` : head;
}
export function describeOverlaps(list: Interval[]): string {
  if (list.length === 0) return "";
  const first = [...list].sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin)[0];
  const head = `${formatDate(first.date)}, ${formatRange(first.startMin, first.endMin)}`;
  return list.length > 1 ? `${head} (+${list.length - 1} more)` : head;
}
