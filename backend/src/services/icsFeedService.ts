import ICAL from "ical.js";

export interface IcsEvent {
  uid: string;
  title: string;
  location: string | null;
  start: Date;
  end: Date;
  allDay: boolean;
  transparent: boolean;
}

export interface Interval {
  start: Date;
  end: Date;
}

export interface Window {
  from: Date;
  to: Date;
}

/**
 * Parse an iCalendar document into concrete event instances inside [from, to).
 *
 * RRULE is expanded rather than ignored: a student's calendar is mostly
 * weekly-recurring classes, and treating a recurrence as a single instance
 * would report them free every week but the first.
 */
export function parseIcs(text: string, { from, to }: Window): IcsEvent[] {
  const comp = new ICAL.Component(ICAL.parse(text));
  const out: IcsEvent[] = [];

  for (const vevent of comp.getAllSubcomponents("vevent")) {
    const event = new ICAL.Event(vevent);

    if ((vevent.getFirstPropertyValue("status") as string | null)?.toUpperCase() === "CANCELLED") continue;

    const transparent =
      (vevent.getFirstPropertyValue("transp") as string | null)?.toUpperCase() === "TRANSPARENT";
    const allDay = Boolean(event.startDate?.isDate);
    const uid = event.uid ?? "";
    const title = event.summary ?? "(untitled)";
    const location = event.location ?? null;

    const durationMs = event.endDate && event.startDate
      ? event.endDate.toJSDate().getTime() - event.startDate.toJSDate().getTime()
      : 0;

    const push = (start: Date) => {
      const end = new Date(start.getTime() + durationMs);
      if (end <= from || start >= to) return;
      out.push({ uid, title, location, start, end, allDay, transparent });
    };

    if (event.isRecurring()) {
      const iterator = event.iterator();
      let next: ICAL.Time | null;
      // Hard cap: a malformed or unbounded RRULE must not spin forever.
      let guard = 0;
      while ((next = iterator.next()) && guard++ < 2000) {
        const start = next.toJSDate();
        if (start >= to) break;
        push(start);
      }
    } else if (event.startDate) {
      push(event.startDate.toJSDate());
    }
  }

  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/**
 * Collapse events into a sorted, disjoint set of busy ranges.
 *
 * All-day events are excluded unless asked for: "Fall break" or a birthday
 * would otherwise black out entire days of a poll for no real reason.
 */
export function busyIntervals(
  events: IcsEvent[],
  { includeAllDay }: { includeAllDay: boolean }
): Interval[] {
  const usable = events
    .filter(e => !e.transparent)
    .filter(e => includeAllDay || !e.allDay)
    .filter(e => e.end > e.start)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const merged: Interval[] = [];
  for (const e of usable) {
    const last = merged[merged.length - 1];
    if (last && e.start.getTime() <= last.end.getTime()) {
      if (e.end > last.end) last.end = e.end;
    } else {
      merged.push({ start: new Date(e.start), end: new Date(e.end) });
    }
  }
  return merged;
}
