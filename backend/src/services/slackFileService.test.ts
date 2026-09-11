// Pure-logic unit tests for the slackFileService state machine. No DB, no I/O.
// Run: cd backend && npx tsx src/services/slackFileService.test.ts

import { nextStorageState, streamSourceFor, mirrorTargetFor, MAX_MIRROR_ATTEMPTS, MIRROR_RETRY_RESET } from "./slackFileService.js";

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

console.log("\nMIRROR_RETRY_RESET");
{
  // The admin "retry" un-sticks MIRROR_FAILED rows. The sweep only selects
  // SLACK_ONLY, so the storage must go back there — and the attempt counter
  // must reset too, or the very next failure (attempts 4 ≥ 3) sends the row
  // straight back to MIRROR_FAILED and the retry bought a single try.
  check("a requeued row is picked up by the sweep again",
    MIRROR_RETRY_RESET.storage === "SLACK_ONLY");
  check("a requeued row's first failure retries again instead of re-failing",
    nextStorageState({ outcome: "error", attempts: MIRROR_RETRY_RESET.mirrorAttempts + 1 }) === "SLACK_ONLY");
  let attempts = MIRROR_RETRY_RESET.mirrorAttempts;
  let state = "SLACK_ONLY";
  let tries = 0;
  while (state === "SLACK_ONLY" && tries < 10) {
    attempts++; tries++;
    state = nextStorageState({ outcome: "error", attempts });
  }
  check(`a requeued row gets a full ${MAX_MIRROR_ATTEMPTS} fresh attempts`, tries === MAX_MIRROR_ATTEMPTS);
}

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

console.log("\nmirrorTargetFor");
{
  // D5: only PUBLIC channel files may land in the human-browsed club Drive.
  check("public channel → drive", mirrorTargetFor("CHANNEL") === "drive");
  check("private channel → disk", mirrorTargetFor("PRIVATE_CHANNEL") === "disk");
  check("DM → disk", mirrorTargetFor("IM") === "disk");
  check("group DM → disk", mirrorTargetFor("MPIM") === "disk");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
