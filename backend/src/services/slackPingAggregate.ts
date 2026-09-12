import { compareTs } from "./slackReadService.js";

/**
 * Pure. One aggregated Slack DM notification is a list of the messages it
 * still covers — never just a count and a latest ts — so retracting one
 * message (delete in Slack) can shrink the aggregate instead of wiping it.
 */
export interface PingEntry {
  ts: string;
  /** The single-message rendering of this ping, used when it's the only one left. */
  message: string;
  /** The author of this message, used to re-render the aggregate form after a retraction. */
  authorName: string;
}

/** Add one message. Returns null if `entry.ts` is already present (dedupe / Slack retry). */
export function addPing(pings: PingEntry[], entry: PingEntry): PingEntry[] | null {
  if (pings.some((p) => p.ts === entry.ts)) return null;
  return [...pings, entry];
}

/** Remove one message, by ts. A no-op ts (not present) returns the list unchanged. */
export function removePing(pings: PingEntry[], ts: string): PingEntry[] {
  return pings.filter((p) => p.ts !== ts);
}

/** The most recently posted message in the aggregate, ordered by Slack ts (compareTs), or null if empty. */
export function newestPing(pings: PingEntry[]): PingEntry | null {
  if (pings.length === 0) return null;
  return pings.reduce((a, b) => (compareTs(a.ts, b.ts) >= 0 ? a : b));
}

export function pingCount(pings: PingEntry[]): number {
  return pings.length;
}
