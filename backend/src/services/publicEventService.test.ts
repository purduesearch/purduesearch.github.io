// Unit tests for publicEventService. Pure — no DB.
// Run: cd backend && npx tsx src/services/publicEventService.test.ts
// Excluded from the production build (tsconfig `exclude` covers *.test.ts).

import {
  serializePublicEvent, parsePublicRange, buildPublicIcsFeed, foldIcsLine,
  icsEscape, icsFileName, PUBLIC_EVENT_WHERE, type PublicEventRow,
} from "./publicEventService.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}

const START = new Date("2026-09-16T22:30:00Z");
const END   = new Date("2026-09-16T23:30:00Z");
const NOW   = new Date("2026-09-11T12:00:00Z");

function row(over: Partial<PublicEventRow> = {}): PublicEventRow {
  return {
    id: "ev1", title: "General Meeting", description: "Pizza, provided",
    type: "MEETING", startTime: START, endTime: END,
    location: "ARMS 1010", isVirtual: false, updatedAt: NOW,
    ...over,
  };
}

console.log("PUBLIC_EVENT_WHERE");
{
  check("requires isPublic", (PUBLIC_EVENT_WHERE as any).isPublic === true);
  check("excludes DEADLINE", (PUBLIC_EVENT_WHERE as any).type?.not === "DEADLINE");
}

console.log("serializePublicEvent");
{
  const full = { ...row(), notes: "secret zoom link", attendees: [{ id: "m1" }], organizerId: "m1", projectId: "p1" };
  const out = serializePublicEvent(full);
  check("exact key set", JSON.stringify(Object.keys(out).sort()) ===
    JSON.stringify(["description", "endTime", "id", "isVirtual", "location", "startTime", "title", "type"]));
  check("no notes leak", !("notes" in out));
  check("dates are ISO strings", out.startTime === START.toISOString() && out.endTime === END.toISOString());
  check("virtual → location null", serializePublicEvent(row({ isVirtual: true })).location === null);
  check("blank description → null", serializePublicEvent(row({ description: "   " })).description === null);
  check("null endTime stays null", serializePublicEvent(row({ endTime: null })).endTime === null);
}

console.log("parsePublicRange");
{
  const d = parsePublicRange({}, NOW);
  check("defaults ok", !("error" in d));
  if (!("error" in d)) {
    check("default from = now - 1d", d.from.getTime() === NOW.getTime() - 86_400_000);
    check("default to = now + 120d", d.to.getTime() === NOW.getTime() + 120 * 86_400_000);
  }
  check("bad from → error", "error" in parsePublicRange({ from: "nope" }, NOW));
  check("to before from → error", "error" in parsePublicRange({ from: "2026-10-01", to: "2026-09-01" }, NOW));
  const wide = parsePublicRange({ from: "2026-01-01T00:00:00Z", to: "2030-01-01T00:00:00Z" }, NOW);
  check("clamped to 366 days", !("error" in wide) &&
    wide.to.getTime() - wide.from.getTime() === 366 * 86_400_000);
  check("array query value → error", "error" in parsePublicRange({ from: ["a", "b"] }, NOW));
}

console.log("icsEscape / foldIcsLine");
{
  check("escapes , ; \\ and newline", icsEscape("a,b;c\\d\ne") === "a\\,b\\;c\\\\d\\ne");
  const long = "DESCRIPTION:" + "x".repeat(200);
  const folded = foldIcsLine(long);
  const parts = folded.split("\r\n");
  check("folds long lines", parts.length > 1);
  check("first line ≤ 75 octets", Buffer.byteLength(parts[0], "utf8") <= 75);
  check("continuations start with a space and are ≤ 75 octets",
    parts.slice(1).every(p => p.startsWith(" ") && Buffer.byteLength(p, "utf8") <= 75));
  check("unfolds back to original", parts.map((p, i) => (i === 0 ? p : p.slice(1))).join("") === long);
  const emoji = "SUMMARY:" + "🚀".repeat(40);
  check("never splits a multi-byte char",
    foldIcsLine(emoji).split("\r\n").every(p => !p.includes("\uFFFD") && Buffer.byteLength(p, "utf8") <= 75));
  check("short line untouched", foldIcsLine("SUMMARY:hi") === "SUMMARY:hi");
}

console.log("buildPublicIcsFeed (feed mode)");
{
  const ics = buildPublicIcsFeed([row(), row({ id: "ev2", endTime: null, isVirtual: true, description: null })],
    { now: NOW, siteUrl: "https://purduesearch.org", mode: "feed" });
  check("CRLF line endings", ics.includes("\r\n") && !/[^\r]\n/.test(ics));
  check("starts with VCALENDAR", ics.startsWith("BEGIN:VCALENDAR\r\n"));
  check("ends with END:VCALENDAR + CRLF", ics.endsWith("END:VCALENDAR\r\n"));
  check("calendar name", ics.includes("X-WR-CALNAME:Purdue SEARCH Events"));
  check("refresh interval", ics.includes("REFRESH-INTERVAL;VALUE=DURATION:PT6H"));
  check("two VEVENTs", (ics.match(/BEGIN:VEVENT/g) ?? []).length === 2);
  check("uid domain", ics.includes("UID:evt-ev1@purduesearch.org"));
  check("utc start", ics.includes("DTSTART:20260916T223000Z"));
  check("missing end → +1h", ics.includes("DTEND:20260916T233000Z"));
  check("escaped description", ics.includes("DESCRIPTION:Pizza\\, provided"));
  check("virtual location → Online", ics.includes("LOCATION:Online"));
  check("category", ics.includes("CATEGORIES:MEETING"));
  check("url", ics.includes("URL:https://purduesearch.org/#events"));
  check("last-modified", ics.includes("LAST-MODIFIED:20260911T120000Z"));
}

console.log("buildPublicIcsFeed (single mode)");
{
  const ics = buildPublicIcsFeed([row()], { now: NOW, siteUrl: "https://purduesearch.org", mode: "single" });
  check("no calendar name in single mode", !ics.includes("X-WR-CALNAME"));
  check("no refresh interval in single mode", !ics.includes("REFRESH-INTERVAL"));
  check("one VEVENT", (ics.match(/BEGIN:VEVENT/g) ?? []).length === 1);
}

console.log("icsFileName");
{
  check("slugifies", icsFileName("Fall Kickoff: Pizza & Rockets!") === "fall-kickoff-pizza-rockets.ics");
  check("empty → event.ics", icsFileName("!!!") === "event.ics");
  check("caps length", icsFileName("a".repeat(200)).length <= 64);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
