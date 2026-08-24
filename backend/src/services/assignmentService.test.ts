// Pure-logic unit tests for assignmentService. No DB required.
// Run: cd backend && npx tsx src/services/assignmentService.test.ts
//
// Excluded from the production build (tsconfig `exclude` covers *.test.ts).
// Same inline assertion harness as courseProgressService.test.ts.

import { sanitizeAssignmentConfig, decideCompletion } from "./assignmentService.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}

console.log("sanitizeAssignmentConfig — author material never reaches a learner");
{
  const full = {
    promptText: "Write the plan",
    handoutDriveFileId: "abc123",
    handoutName: "rubric.pdf",
    handoutMimeType: "application/pdf",
    minWords: 250,
    referenceAnswer: "THE ANSWER",
    rubric: [{ id: "a", point: "SECRET CRITERION", weight: 2 }],
    // A key nobody has invented yet. Built by construction, so it must not
    // survive — this is the whole reason the function does not spread-and-delete.
    gradingNotes: "FUTURE SECRET",
  };
  const safe = sanitizeAssignmentConfig(full)!;
  const json = JSON.stringify(safe);

  check("prompt survives", safe.promptText === "Write the plan");
  check("handout survives", safe.handoutDriveFileId === "abc123");
  check("minWords survives", safe.minWords === 250);
  check("referenceAnswer withheld", !json.includes("THE ANSWER"));
  check("rubric withheld", !json.includes("SECRET CRITERION"));
  check("unknown author key withheld", !json.includes("FUTURE SECRET"));
  check("no extra keys at all", Object.keys(safe).length === 5);
}

console.log("sanitizeAssignmentConfig — defaults");
{
  check("null in, null out", sanitizeAssignmentConfig(null) === null);
  const bare = sanitizeAssignmentConfig({})!;
  check("minWords defaults", bare.minWords === 150);
  check("missing strings are empty", bare.promptText === "" && bare.handoutDriveFileId === "");
  check("zero minWords defaults", sanitizeAssignmentConfig({ minWords: 0 })!.minWords === 150);
}

console.log("decideCompletion — no gate means today's behaviour, always");
{
  const g = (o: object) => decideCompletion({ passThreshold: null, hasFeedback: true, scorePct: 0, ...o });
  check("ungated + low score completes", g({ scorePct: 3 }) === "COMPLETE");
  check("ungated + no feedback completes", g({ hasFeedback: false, scorePct: null }) === "COMPLETE");
}

console.log("decideCompletion — a gate that is met, missed, or unscorable");
{
  const g = (scorePct: number | null, hasFeedback = true) =>
    decideCompletion({ passThreshold: 70, hasFeedback, scorePct });

  check("above threshold completes", g(85) === "COMPLETE");
  check("exactly at threshold completes", g(70) === "COMPLETE");
  check("just below is blocked", g(69.99) === "BLOCKED");
  check("zero is blocked", g(0) === "BLOCKED");

  // Fail-open. A Gemini outage must never strand a cohort — see design doc §5.
  check("grading failure completes ungraded", g(null, false) === "COMPLETE_UNGRADED");
  check("feedback with no number completes ungraded", g(null, true) === "COMPLETE_UNGRADED");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
