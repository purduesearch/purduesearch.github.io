// Unit tests for icsFeedService. No DB. Mostly pure logic; the SSRF-gate
// cases below deliberately hit real DNS (a mocked resolver would not prove
// the gate works).
// Run: cd backend && npx tsx src/services/icsFeedService.test.ts
//
// Excluded from the production build (tsconfig `exclude` covers *.test.ts).
// Same inline assertion harness as assignmentService.test.ts.

import { parseIcs, busyIntervals, assertSafeFeedUrl, isBlockedAddress, IcsFeedError } from "./icsFeedService.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}

function ics(...bodies: string[]): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//test//EN",
    ...bodies,
    "END:VCALENDAR",
  ].join("\r\n");
}

const WINDOW = {
  from: new Date("2026-09-07T00:00:00Z"),
  to:   new Date("2026-09-28T00:00:00Z"),
};

console.log("parseIcs — recurring events");
{
  // A weekly Monday class. Without RRULE expansion only the first instance
  // exists and the member looks free every following Monday.
  const text = ics(
    "BEGIN:VEVENT",
    "UID:class-1",
    "DTSTART:20260907T140000Z",
    "DTEND:20260907T150000Z",
    "RRULE:FREQ=WEEKLY;BYDAY=MO",
    "SUMMARY:ME 200 Lecture",
    "END:VEVENT",
  );
  const events = parseIcs(text, WINDOW);
  check("expands weekly recurrence across the window", events.length === 3);
  check("keeps the summary", events[0].title === "ME 200 Lecture");
  check("carries the uid", events[0].uid === "class-1");
  check("instances are one week apart",
    events[1].start.getTime() - events[0].start.getTime() === 7 * 86400000);
}

console.log("parseIcs — exclusions and cancellations");
{
  const text = ics(
    "BEGIN:VEVENT",
    "UID:class-2",
    "DTSTART:20260907T140000Z",
    "DTEND:20260907T150000Z",
    "RRULE:FREQ=WEEKLY;BYDAY=MO",
    "EXDATE:20260914T140000Z",
    "SUMMARY:With a skipped week",
    "END:VEVENT",
  );
  check("EXDATE removes an instance", parseIcs(text, WINDOW).length === 2);

  const cancelled = ics(
    "BEGIN:VEVENT",
    "UID:gone",
    "DTSTART:20260908T140000Z",
    "DTEND:20260908T150000Z",
    "STATUS:CANCELLED",
    "SUMMARY:Cancelled",
    "END:VEVENT",
  );
  check("STATUS:CANCELLED is dropped", parseIcs(cancelled, WINDOW).length === 0);
}

console.log("parseIcs — window clipping");
{
  const text = ics(
    "BEGIN:VEVENT",
    "UID:old",
    "DTSTART:20260101T140000Z",
    "DTEND:20260101T150000Z",
    "SUMMARY:Long past",
    "END:VEVENT",
  );
  check("events outside the window are excluded", parseIcs(text, WINDOW).length === 0);
}

console.log("parseIcs — all-day");
{
  const text = ics(
    "BEGIN:VEVENT",
    "UID:break",
    "DTSTART;VALUE=DATE:20260910",
    "DTEND;VALUE=DATE:20260913",
    "SUMMARY:Fall break",
    "END:VEVENT",
  );
  const events = parseIcs(text, WINDOW);
  check("all-day event is parsed", events.length === 1);
  check("all-day event is flagged", events[0].allDay === true);
}

console.log("busyIntervals");
{
  const at = (h: number) => new Date(`2026-09-07T${String(h).padStart(2, "0")}:00:00Z`);
  const ev = (h: number, endH: number, extra: Record<string, unknown> = {}) =>
    ({ uid: `u${h}`, title: "x", location: null, start: at(h), end: at(endH), allDay: false, transparent: false, ...extra });

  const merged = busyIntervals([ev(9, 11), ev(10, 12)], { includeAllDay: false });
  check("overlapping intervals merge into one", merged.length === 1);
  check("merged interval spans both", merged[0].end.getTime() === at(12).getTime());

  const apart = busyIntervals([ev(9, 10), ev(13, 14)], { includeAllDay: false });
  check("disjoint intervals stay separate", apart.length === 2);

  const touching = busyIntervals([ev(9, 10), ev(10, 11)], { includeAllDay: false });
  check("back-to-back intervals merge", touching.length === 1);

  // Google marks "free" events TRANSP:TRANSPARENT. They must not block a slot.
  const transparent = busyIntervals([ev(9, 10, { transparent: true })], { includeAllDay: false });
  check("TRANSP:TRANSPARENT is not busy", transparent.length === 0);

  // "Spring Break" or a birthday would otherwise black out whole poll days.
  const allDay = busyIntervals([ev(0, 23, { allDay: true })], { includeAllDay: false });
  check("all-day is not busy by default", allDay.length === 0);
  check("all-day is busy when asked",
    busyIntervals([ev(0, 23, { allDay: true })], { includeAllDay: true }).length === 1);

  check("empty input yields no intervals", busyIntervals([], { includeAllDay: false }).length === 0);
}

console.log("assertSafeFeedUrl — SSRF gate");
{
  const rejects = async (url: string, why: string) => {
    try { await assertSafeFeedUrl(url); check(why, false); }
    catch (err) { check(why, err instanceof IcsFeedError && err.code === "UNSAFE_URL"); }
  };

  await rejects("http://example.com/cal.ics", "plain http rejected");
  await rejects("file:///etc/passwd", "file:// rejected");
  await rejects("https://127.0.0.1/cal.ics", "loopback rejected");
  await rejects("https://localhost/cal.ics", "localhost rejected");
  await rejects("https://10.0.0.5/cal.ics", "private 10/8 rejected");
  await rejects("https://192.168.1.20/cal.ics", "private 192.168/16 rejected");
  await rejects("https://172.16.4.4/cal.ics", "private 172.16/12 rejected");
  await rejects("https://169.254.169.254/latest/meta-data", "link-local (cloud metadata) rejected");
  await rejects("https://100.64.0.1/cal.ics", "CGNAT rejected");
  await rejects("https://[::1]/cal.ics", "IPv6 loopback rejected");

  // webcal:// is what Google's "secret address" copy button often yields.
  const normalized = await assertSafeFeedUrl("webcal://calendar.google.com/calendar/ical/x/basic.ics");
  check("webcal:// normalizes to https", normalized.protocol === "https:");
}

console.log("isBlockedAddress");
{
  check("public address allowed", isBlockedAddress("142.250.72.14") === false);
  check("public IPv6 allowed", isBlockedAddress("2607:f8b0::1") === false);
  check("0.0.0.0 blocked", isBlockedAddress("0.0.0.0") === true);
  check("IPv4-mapped IPv6 loopback blocked", isBlockedAddress("::ffff:127.0.0.1") === true);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
