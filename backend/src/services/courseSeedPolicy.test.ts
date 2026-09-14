// Pure-logic tests for the course seed write guard. No DB required.
// Run: cd backend && npx tsx src/services/courseSeedPolicy.test.ts
import { shouldSeedCourse } from "./courseSeedPolicy.js";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean) {
  if (condition) passed++;
  else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

check("installs a new Constellation 101 course", shouldSeedCourse("constellation-101", false));
check("re-seeds an existing Constellation 101 course", shouldSeedCourse("constellation-101", true));
check("installs a new non-101 course", shouldSeedCourse("ares-101", false));
check("skips an existing non-101 course", !shouldSeedCourse("ares-101", true));
check(
  "skips an existing Constellation elective",
  !shouldSeedCourse("constellation-vault-and-crs", true),
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
