// Unit tests for eventRecurrence. No DB.
// Run: cd backend && npx tsx src/services/eventRecurrence.test.ts
//
// Excluded from the production build (tsconfig `exclude` covers *.test.ts).
// Same inline assertion harness as icsFeedService.test.ts.

import { recurrenceStarts, MAX_OCCURRENCES } from "./eventRecurrence.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}

const TZ = "America/Indiana/Indianapolis";
const wall = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(d).replace(",", "");

// Thu 2026-09-17 19:00 EDT (UTC-4)
const START = new Date("2026-09-17T23:00:00Z");

console.log("recurrenceStarts — defaults without an end date");
{
  const weekly = recurrenceStarts(START, "weekly");
  check("weekly makes 8 copies", weekly.length === 8);
  check("weekly first copy is a week later", wall(weekly[0]) === "2026-09-24 19:00");
  check("biweekly makes 4 copies", recurrenceStarts(START, "biweekly").length === 4);
  check("monthly makes 2 copies", recurrenceStarts(START, "monthly").length === 2);
  check("unknown pattern makes none", recurrenceStarts(START, "daily").length === 0);
}

console.log("recurrenceStarts — wall-clock time survives DST");
{
  // DST ends 2026-11-01; every copy must still be 19:00 local.
  const weekly = recurrenceStarts(START, "weekly");
  check("all weekly copies at 19:00 local", weekly.every(d => wall(d).endsWith(" 19:00")));
  check("post-DST copy is UTC-5", weekly[6].toISOString() === "2026-11-06T00:00:00.000Z");
}

console.log("recurrenceStarts — end date");
{
  const until = new Date("2026-10-15T03:59:00Z"); // 2026-10-14 23:59 local
  const weekly = recurrenceStarts(START, "weekly", until);
  check("stops at the end date", weekly.length === 3);
  check("last copy is Oct 8", wall(weekly[weekly.length - 1]) === "2026-10-08 19:00");

  const inclusive = recurrenceStarts(START, "weekly", new Date("2026-10-09T03:59:00Z"));
  check("occurrence on the end date is included", inclusive.length === 3);

  const far = recurrenceStarts(START, "weekly", new Date("2030-01-01T00:00:00Z"));
  check("far end date is capped", far.length === MAX_OCCURRENCES);

  const monthly = recurrenceStarts(START, "monthly", new Date("2027-03-01T00:00:00Z"));
  check("end date extends monthly past the default", monthly.length === 5);

  check("end date before the start makes none",
    recurrenceStarts(START, "weekly", new Date("2026-09-01T00:00:00Z")).length === 0);
}

console.log("recurrenceStarts — calendar months");
{
  const jan31 = new Date("2027-01-31T15:00:00Z");
  const m = recurrenceStarts(jan31, "monthly", new Date("2027-05-01T00:00:00Z"));
  check("Jan 31 → Feb 28", wall(m[0]).startsWith("2027-02-28"));
  check("→ Mar 31 (no drift)", wall(m[1]).startsWith("2027-03-31"));
  check("→ Apr 30", wall(m[2]).startsWith("2027-04-30"));

  const dec = recurrenceStarts(new Date("2026-12-10T15:00:00Z"), "monthly");
  check("monthly rolls over the year", wall(dec[0]).startsWith("2027-01-10"));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
