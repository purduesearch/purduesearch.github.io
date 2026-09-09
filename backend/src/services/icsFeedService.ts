import ICAL from "ical.js";
import { lookup } from "node:dns/promises";
import net from "node:net";

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

// ── SSRF gate + outbound fetch ────────────────────────────────────

export type IcsFeedErrorCode =
  | "UNSAFE_URL"
  | "UNREACHABLE"
  | "TIMEOUT"
  | "TOO_LARGE"
  | "INVALID";

export class IcsFeedError extends Error {
  constructor(public code: IcsFeedErrorCode, message?: string) {
    super(message ?? code);
    this.name = "IcsFeedError";
  }
}

/** Human-facing copy for each failure. Never leak the URL back to a client. */
export const ICS_ERROR_MESSAGE: Record<IcsFeedErrorCode, string> = {
  UNSAFE_URL:  "That address isn't a public https calendar link.",
  UNREACHABLE: "That address didn't respond.",
  TIMEOUT:     "That address took too long to respond.",
  TOO_LARGE:   "That calendar is too large to import.",
  INVALID:     "That doesn't look like a calendar feed.",
};

/**
 * True for any address a server-side fetch must never reach: loopback,
 * private, link-local (which includes the 169.254.169.254 cloud metadata
 * endpoint), CGNAT, and the unspecified address.
 */
export function isBlockedAddress(address: string): boolean {
  // ::ffff:127.0.0.1 and friends are IPv4 wearing an IPv6 hat.
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  const addr = mapped ? mapped[1]! : address;

  if (net.isIPv4(addr)) {
    const [a, b] = addr.split(".").map(Number) as [number, number, number, number];
    if (a === 0 || a === 127) return true;              // unspecified, loopback
    if (a === 10) return true;                          // private
    if (a === 172 && b >= 16 && b <= 31) return true;   // private
    if (a === 192 && b === 168) return true;            // private
    if (a === 169 && b === 254) return true;            // link-local / metadata
    if (a === 100 && b >= 64 && b <= 127) return true;  // CGNAT
    if (a >= 224) return true;                          // multicast + reserved
    return false;
  }

  if (net.isIPv6(addr)) {
    const lower = addr.toLowerCase();
    if (lower === "::" || lower === "::1") return true;
    if (lower.startsWith("fe80")) return true;          // link-local
    if (/^f[cd]/.test(lower)) return true;              // unique local
    return false;
  }

  return true; // not an IP literal we understand — refuse
}

/**
 * The SSRF gate. Every outbound fetch of a user-supplied URL goes through
 * here, including each redirect hop.
 */
export async function assertSafeFeedUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    // Google's "secret address" copy button often yields webcal://.
    url = new URL(raw.trim().replace(/^webcal:\/\//i, "https://"));
  } catch {
    throw new IcsFeedError("UNSAFE_URL", "Not a URL");
  }

  if (url.protocol !== "https:") throw new IcsFeedError("UNSAFE_URL", "https only");

  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (hostname.toLowerCase() === "localhost") throw new IcsFeedError("UNSAFE_URL", "localhost");

  // An IP literal never reaches the resolver, so check it directly.
  if (net.isIP(hostname)) {
    if (isBlockedAddress(hostname)) throw new IcsFeedError("UNSAFE_URL", "Blocked address");
    return url;
  }

  let addresses: { address: string }[];
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new IcsFeedError("UNSAFE_URL", "Host does not resolve");
  }

  if (addresses.length === 0) throw new IcsFeedError("UNSAFE_URL", "Host does not resolve");
  // Every resolved address must be safe — a host with one public and one
  // private A record is a DNS-rebinding attempt, not a calendar.
  for (const { address } of addresses) {
    if (isBlockedAddress(address)) throw new IcsFeedError("UNSAFE_URL", "Blocked address");
  }

  return url;
}

const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;

/** Fetch an ICS document. Every redirect hop is re-checked by the gate. */
export async function fetchIcs(raw: string): Promise<string> {
  let current = raw;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = await assertSafeFeedUrl(current);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "manual",
        signal: controller.signal,
        headers: { Accept: "text/calendar, text/plain;q=0.9, */*;q=0.5" },
      });
    } catch {
      clearTimeout(timer);
      throw new IcsFeedError(controller.signal.aborted ? "TIMEOUT" : "UNREACHABLE");
    }
    clearTimeout(timer);

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new IcsFeedError("UNREACHABLE");
      current = new URL(location, url).toString();
      continue;
    }

    if (!res.ok) throw new IcsFeedError("UNREACHABLE", `HTTP ${res.status}`);

    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > MAX_BYTES) throw new IcsFeedError("TOO_LARGE");

    const text = await res.text();
    if (text.length > MAX_BYTES) throw new IcsFeedError("TOO_LARGE");
    if (!text.includes("BEGIN:VCALENDAR")) throw new IcsFeedError("INVALID");
    return text;
  }

  throw new IcsFeedError("UNREACHABLE", "Too many redirects");
}

// ── Busy-interval cache + outbound limiter ────────────────────────
//
// In-memory on purpose: this is a convenience cache, a cold start just means
// one extra fetch. The limiter keeps a member from using us as a proxy.

const CACHE_TTL_MS = 5 * 60 * 1000;
const busyCache = new Map<string, { at: number; intervals: Interval[]; events: IcsEvent[] }>();

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;
const fetchLog = new Map<string, number[]>();

export function checkRateLimit(memberId: string): void {
  const now = Date.now();
  const recent = (fetchLog.get(memberId) ?? []).filter(t => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) throw new IcsFeedError("UNREACHABLE", "Too many calendar refreshes — try again in a minute.");
  recent.push(now);
  fetchLog.set(memberId, recent);
}

/** Fetch + parse for a member, memoized for five minutes. */
export async function loadMemberCalendar(
  memberId: string,
  feedUrl: string,
  window: Window
): Promise<{ events: IcsEvent[]; intervals: Interval[] }> {
  const key = `${memberId}:${window.from.toISOString()}:${window.to.toISOString()}`;
  const hit = busyCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return { events: hit.events, intervals: hit.intervals };
  }

  checkRateLimit(memberId);
  const text = await fetchIcs(feedUrl);
  const events = parseIcs(text, window);
  const intervals = busyIntervals(events, { includeAllDay: false });
  busyCache.set(key, { at: Date.now(), events, intervals });
  return { events, intervals };
}

/** Drop a member's cached calendar — call when their feed changes. */
export function invalidateMemberCalendar(memberId: string): void {
  for (const key of busyCache.keys()) {
    if (key.startsWith(`${memberId}:`)) busyCache.delete(key);
  }
}
