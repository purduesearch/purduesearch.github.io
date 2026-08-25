// Pure-logic unit tests for trainingService. No DB required.
// Run: cd backend && npx tsx src/services/trainingService.test.ts
//
// Excluded from the production build (tsconfig `exclude` covers *.test.ts).
// Same inline assertion harness as assignmentService.test.ts.

import { computeExpiry, deriveStatus, sanitizeTrainingInput } from "./trainingService.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}

const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

console.log("computeExpiry — renewal arithmetic");
{
  check("null renewal never expires", computeExpiry(utc("2026-08-25"), null) === null);
  check("zero renewal never expires", computeExpiry(utc("2026-08-25"), 0) === null);
  check("12 months lands the same day next year",
    iso(computeExpiry(utc("2026-08-25"), 12)) === "2027-08-25");
  check("crosses a year boundary",
    iso(computeExpiry(utc("2026-11-15"), 3)) === "2027-02-15");

  // Month arithmetic must CLAMP, not overflow. 31 Jan + 1 month is 28 Feb, and
  // naive Date math would silently produce 3 March.
  check("31 Jan + 1 month clamps to 28 Feb",
    iso(computeExpiry(utc("2027-01-31"), 1)) === "2027-02-28");
  check("29 Feb + 12 months clamps to 28 Feb",
    iso(computeExpiry(utc("2028-02-29"), 12)) === "2029-02-28");
  check("31 Aug + 1 month clamps to 30 Sep",
    iso(computeExpiry(utc("2026-08-31"), 1)) === "2026-09-30");

  // End of day, so a certificate is valid through the whole of its expiry date.
  const e = computeExpiry(utc("2026-08-25"), 12)!;
  check("expiry is end of day", e.getUTCHours() === 23 && e.getUTCMinutes() === 59);
}

console.log("deriveStatus — the four-test cascade, in order");
{
  const now = utc("2026-08-25");
  const cert = (
    status: "PENDING" | "APPROVED" | "REJECTED",
    expiresOn: Date | null,
    createdAt = utc("2026-01-01")
  ) => ({ status, expiresOn, createdAt });

  check("no certificates at all", deriveStatus([], now) === "NOT_COMPLETED");
  check("only rejected reads as not completed",
    deriveStatus([cert("REJECTED", null)], now) === "NOT_COMPLETED");
  check("pending only", deriveStatus([cert("PENDING", null)], now) === "PENDING_REVIEW");
  check("approved, never expires",
    deriveStatus([cert("APPROVED", null)], now) === "UP_TO_DATE");
  check("approved, not yet expired",
    deriveStatus([cert("APPROVED", utc("2026-12-01"))], now) === "UP_TO_DATE");
  check("approved, past expiry",
    deriveStatus([cert("APPROVED", utc("2026-08-01"))], now) === "EXPIRED");

  // The two cases the ORDER of the tests exists for.
  check("early renewal: unexpired approval plus newer pending stays UP_TO_DATE",
    deriveStatus(
      [cert("APPROVED", utc("2026-12-01")), cert("PENDING", null, utc("2026-08-20"))],
      now
    ) === "UP_TO_DATE");
  check("lapsed and resubmitted reads PENDING_REVIEW, not EXPIRED",
    deriveStatus(
      [cert("APPROVED", utc("2026-08-01")), cert("PENDING", null, utc("2026-08-20"))],
      now
    ) === "PENDING_REVIEW");

  // Boundary: expiry is end of day, so the expiry date itself is still valid.
  const endOfDay = new Date("2026-08-25T23:59:59.999Z");
  check("valid through the whole expiry day",
    deriveStatus([cert("APPROVED", endOfDay)], new Date("2026-08-25T12:00:00.000Z")) === "UP_TO_DATE");
}

console.log("sanitizeTrainingInput — validation");
{
  const ok = sanitizeTrainingInput({
    name: "  Bloodborne Pathogens  ",
    providerName: "Purdue EHS — HSI Platform",
    courseUrl: "https://www.purdue.edu/ehps/rem/training/index.html",
    renewalMonths: 12,
  });
  check("valid input is accepted", ok.ok === true);
  check("name is trimmed", ok.ok === true && ok.value.name === "Bloodborne Pathogens");
  check("slug is derived", ok.ok === true && ok.value.slug === "bloodborne-pathogens");
  check("renewalMonths survives", ok.ok === true && ok.value.renewalMonths === 12);

  check("missing name rejected",
    sanitizeTrainingInput({ providerName: "CITI Program" }).ok === false);
  check("missing provider rejected",
    sanitizeTrainingInput({ name: "Laser Safety" }).ok === false);

  // A javascript: URL in a field the learner clicks is the whole reason this
  // check exists.
  check("javascript: url rejected",
    sanitizeTrainingInput({
      name: "X", providerName: "Y", courseUrl: "javascript:alert(1)",
    }).ok === false);
  check("ftp url rejected",
    sanitizeTrainingInput({
      name: "X", providerName: "Y", courseUrl: "ftp://example.com/a",
    }).ok === false);

  const blank = sanitizeTrainingInput({ name: "X", providerName: "Y", courseUrl: "" });
  check("empty url becomes null", blank.ok === true && blank.value.courseUrl === null);

  const clamped = sanitizeTrainingInput({ name: "X", providerName: "Y", renewalMonths: 999 });
  check("absurd renewal rejected", clamped.ok === false);
  const zero = sanitizeTrainingInput({ name: "X", providerName: "Y", renewalMonths: 0 });
  check("zero renewal becomes null", zero.ok === true && zero.value.renewalMonths === null);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
