// Pure helpers behind the unauthenticated /api/public/events* routes.
// No DB access here — public.ts queries with PUBLIC_EVENT_WHERE/SELECT and
// hands rows to these functions, which keeps every rule unit-testable.
import type { EventType, Prisma } from "@prisma/client";

const DAY_MS = 86_400_000;
const DEFAULT_DURATION_MS = 60 * 60 * 1000;
const MAX_RANGE_DAYS = 366;

// Only opted-in, non-deadline events ever leave the building.
export const PUBLIC_EVENT_WHERE: Prisma.EventWhereInput = {
  isPublic: true,
  type: { not: "DEADLINE" },
};

// Selected by construction: adding a column to Event can never leak it.
export const PUBLIC_EVENT_SELECT = {
  id: true, title: true, description: true, type: true,
  startTime: true, endTime: true, location: true, isVirtual: true,
  updatedAt: true,
} as const;

export interface PublicEventRow {
  id: string;
  title: string;
  description: string | null;
  type: EventType;
  startTime: Date;
  endTime: Date | null;
  location: string | null;
  isVirtual: boolean;
  updatedAt: Date;
}

export interface PublicEvent {
  id: string;
  title: string;
  description: string | null;
  type: EventType;
  startTime: string;
  endTime: string | null;
  location: string | null;
  isVirtual: boolean;
}

export function serializePublicEvent(e: PublicEventRow): PublicEvent {
  return {
    id:          e.id,
    title:       e.title,
    description: e.description?.trim() || null,
    type:        e.type,
    startTime:   e.startTime.toISOString(),
    endTime:     e.endTime ? e.endTime.toISOString() : null,
    location:    e.isVirtual ? null : (e.location?.trim() || null),
    isVirtual:   e.isVirtual,
  };
}

export type PublicRange = { from: Date; to: Date } | { error: string };

function parseDateParam(v: unknown): Date | null | "invalid" {
  if (v === undefined || v === "") return null;
  if (typeof v !== "string") return "invalid";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "invalid" : d;
}

export function parsePublicRange(q: { from?: unknown; to?: unknown }, now: Date): PublicRange {
  const from = parseDateParam(q.from);
  const to   = parseDateParam(q.to);
  if (from === "invalid" || to === "invalid") return { error: "from/to must be ISO dates" };
  const f = from ?? new Date(now.getTime() - DAY_MS);
  let t   = to   ?? new Date(now.getTime() + 120 * DAY_MS);
  if (t < f) return { error: "to must be after from" };
  const maxTo = new Date(f.getTime() + MAX_RANGE_DAYS * DAY_MS);
  if (t > maxTo) t = maxTo;
  return { from: f, to: t };
}

export function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function icsStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

// RFC 5545 §3.1: lines longer than 75 octets are folded with CRLF + one space.
// Iterates by code point so a multi-byte character is never split.
export function foldIcsLine(line: string): string {
  if (Buffer.byteLength(line, "utf8") <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = Buffer.byteLength(ch, "utf8");
    if (bytes + b > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
      limit = 74; // continuation lines spend one octet on the leading space
    }
    current += ch;
    bytes += b;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export interface IcsBuildOptions {
  now: Date;
  siteUrl: string;
  /** "feed" adds subscription metadata (name, refresh interval); "single" is a one-off download. */
  mode: "feed" | "single";
}

export function buildPublicIcsFeed(events: PublicEventRow[], opts: IcsBuildOptions): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Purdue SEARCH//Public Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  if (opts.mode === "feed") {
    lines.push(
      "X-WR-CALNAME:Purdue SEARCH Events",
      `X-WR-CALDESC:${icsEscape("Public meetings, workshops, and socials from Purdue SEARCH")}`,
      "X-WR-TIMEZONE:America/Indiana/Indianapolis",
      "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
      "X-PUBLISHED-TTL:PT6H",
    );
  }
  const stamp = icsStamp(opts.now);
  for (const e of events) {
    const end = e.endTime && e.endTime > e.startTime
      ? e.endTime
      : new Date(e.startTime.getTime() + DEFAULT_DURATION_MS);
    const description = e.description?.trim();
    const location = e.isVirtual ? "Online" : e.location?.trim();
    lines.push(
      "BEGIN:VEVENT",
      `UID:evt-${e.id}@purduesearch.org`,
      `DTSTAMP:${stamp}`,
      `LAST-MODIFIED:${icsStamp(e.updatedAt)}`,
      `DTSTART:${icsStamp(e.startTime)}`,
      `DTEND:${icsStamp(end)}`,
      `SUMMARY:${icsEscape(e.title)}`,
      ...(description ? [`DESCRIPTION:${icsEscape(description)}`] : []),
      ...(location ? [`LOCATION:${icsEscape(location)}`] : []),
      `CATEGORIES:${e.type}`,
      `URL:${opts.siteUrl}/#events`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}

export function icsFileName(title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `${slug || "event"}.ics`;
}
