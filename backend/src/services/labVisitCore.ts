/**
 * Lab check-in/out — pure logic. No Prisma, no clock reads.
 *
 * A visit is a real span of instants (checkedInAt → checkedOutAt). Only the
 * "which local day is it" and "what does 4:30pm mean" questions need the
 * space's timezone; those reuse labScheduleCore's helpers.
 */
import { localDateMinutes, type Ymd } from "./labScheduleCore.js";

export const MIN_VISIT_MINUTES = 5;
/** An open visit is considered overdue this long after check-in. */
export const MAX_OPEN_MINUTES = 300;
export const REMINDER_GRACE_MINUTES = 15;
/** PENDING_CONFIRM visits older than this are discarded. */
export const PENDING_TTL_DAYS = 7;

const MINUTE_MS = 60_000;

export interface VisitTiming {
  status?: string;
  checkedInAt: Date;
  expectedEndAt: Date | null;
  reminderSentAt?: Date | null;
}

/**
 * Equal integer split across tasks in ascending id order; the remainder goes one
 * minute each to the first tasks. Tasks that would get zero minutes are left out.
 */
export function splitMinutes(total: number, taskIds: string[]): { taskId: string; minutes: number }[] {
  const ids = [...new Set(taskIds)].sort();
  if (ids.length === 0 || total <= 0) return [];
  const base = Math.floor(total / ids.length);
  const rem = total % ids.length;
  return ids
    .map((taskId, i) => ({ taskId, minutes: base + (i < rem ? 1 : 0) }))
    .filter(s => s.minutes > 0);
}

export function visitMinutes(inAt: Date, outAt: Date): number {
  return Math.max(0, Math.floor((outAt.getTime() - inAt.getTime()) / MINUTE_MS));
}

/** The earlier of (scheduled end + grace) and (check-in + 5 h). */
export function reminderAt(v: { checkedInAt: Date; expectedEndAt: Date | null }): Date {
  const cap = v.checkedInAt.getTime() + MAX_OPEN_MINUTES * MINUTE_MS;
  if (!v.expectedEndAt) return new Date(cap);
  return new Date(Math.min(cap, v.expectedEndAt.getTime() + REMINDER_GRACE_MINUTES * MINUTE_MS));
}

export function isReminderDue(v: VisitTiming, now: Date): boolean {
  if (v.status !== undefined && v.status !== "OPEN") return false;
  if (v.reminderSentAt) return false;
  return now.getTime() >= reminderAt(v).getTime();
}

/** True once the space's local date has moved past the check-in's local date. */
export function isAutoCloseDue(v: VisitTiming, now: Date, tz: string): boolean {
  if (v.status !== undefined && v.status !== "OPEN") return false;
  return localDateMinutes(now, tz).date > localDateMinutes(v.checkedInAt, tz).date;
}

/** The instant of a local wall-clock time on a local date. DST-safe (two-pass offset fix). */
export function localToInstant(day: Ymd, minutes: number, tz: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  const want = Date.UTC(y, m - 1, d, 0, minutes);
  let guess = want;
  for (let i = 0; i < 2; i++) {
    const local = localDateMinutes(new Date(guess), tz);
    const [ly, lm, ld] = local.date.split("-").map(Number);
    const seen = Date.UTC(ly, lm - 1, ld, 0, local.minutes);
    guess += want - seen;
  }
  return new Date(guess);
}

const TIME_RE = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/i;

/** "4:30pm", "4pm", "4:30 PM", "16:30" on a local date → instant; null when unparseable. */
export function parseLocalTime(input: string, day: Ymd, tz: string): Date | null {
  const m = TIME_RE.exec(input.trim().replace(/\./g, ""));
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const ap = m[3]?.toLowerCase()[0];
  if (min > 59) return null;
  if (ap) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (ap === "p" ? 12 : 0);
  } else if (h > 23) {
    return null;
  }
  return localToInstant(day, h * 60 + min, tz);
}

/**
 * Decision 6: prefer tasks in the space's linked projects; fall back to all of
 * them when the space links none or none qualify. Returns ids in ascending order.
 */
export function pickSplitTasks(tasks: { id: string; projectId: string }[], spaceProjectIds: string[]): string[] {
  const linked = new Set(spaceProjectIds);
  const preferred = tasks.filter(t => linked.has(t.projectId));
  return (preferred.length ? preferred : tasks).map(t => t.id).sort();
}
