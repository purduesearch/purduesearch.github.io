import type { Interval } from "./icsFeedService.js";

/**
 * Which poll slots overlap a busy interval.
 *
 * A slot covers [start, start + slotMinutes). Boundary contact is not a
 * conflict: a class ending at 11:00 does not block an 11:00 meeting.
 *
 * Returns ISO strings so callers can compare against poll.slotStarts without
 * re-normalizing dates.
 */
export function conflictingSlots(
  slotStarts: string[],
  slotMinutes: number,
  busy: Interval[]
): Set<string> {
  const hit = new Set<string>();
  const lengthMs = slotMinutes * 60_000;

  for (const iso of slotStarts) {
    const start = new Date(iso).getTime();
    const end = start + lengthMs;
    for (const b of busy) {
      if (start < b.end.getTime() && end > b.start.getTime()) {
        hit.add(iso);
        break;
      }
    }
  }

  return hit;
}
