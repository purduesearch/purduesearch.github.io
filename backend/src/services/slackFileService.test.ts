// Pure-logic unit tests for the slackFileService state machine. No DB, no I/O.
// Run: cd backend && npx tsx src/services/slackFileService.test.ts

import { nextStorageState, streamSourceFor, MAX_MIRROR_ATTEMPTS } from "./slackFileService.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}

console.log("nextStorageState");
check("drive success → DRIVE",
  nextStorageState({ outcome: "drive", attempts: 0 }) === "DRIVE");
check("local fallback → LOCAL",
  nextStorageState({ outcome: "local", attempts: 0 }) === "LOCAL");
check("slack lost the file → UNAVAILABLE",
  nextStorageState({ outcome: "gone", attempts: 0 }) === "UNAVAILABLE");
check("first failure stays SLACK_ONLY so the next sweep retries",
  nextStorageState({ outcome: "error", attempts: 1 }) === "SLACK_ONLY");
check("second failure still retries",
  nextStorageState({ outcome: "error", attempts: 2 }) === "SLACK_ONLY");
check(`failure number ${MAX_MIRROR_ATTEMPTS} gives up`,
  nextStorageState({ outcome: "error", attempts: MAX_MIRROR_ATTEMPTS }) === "MIRROR_FAILED");
check("a fourth failure stays MIRROR_FAILED",
  nextStorageState({ outcome: "error", attempts: MAX_MIRROR_ATTEMPTS + 1 }) === "MIRROR_FAILED");

console.log("\nstreamSourceFor");
{
  // MIRROR_FAILED is an OUTCOME, not a location — the file is still in Slack
  // until Slack expires it, so the proxy must keep serving it from there.
  check("SLACK_ONLY streams from slack", streamSourceFor("SLACK_ONLY") === "slack");
  check("MIRROR_FAILED also streams from slack", streamSourceFor("MIRROR_FAILED") === "slack");
  check("DRIVE streams from drive", streamSourceFor("DRIVE") === "drive");
  check("LOCAL streams from disk", streamSourceFor("LOCAL") === "disk");
  check("UNAVAILABLE streams from nowhere", streamSourceFor("UNAVAILABLE") === "none");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
