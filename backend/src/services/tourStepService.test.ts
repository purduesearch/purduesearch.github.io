// Pure-logic tests for tourStepService. No DB required.
// Run: cd backend && npx tsx src/services/tourStepService.test.ts
import { clampStepIndex, isTourComplete } from "./tourStepService.js";

let passed = 0, failed = 0;
function eq(name: string, a: unknown, b: unknown) {
  if (JSON.stringify(a) === JSON.stringify(b)) passed++;
  else { failed++; console.error(`  ✗ ${name}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); }
}

console.log("clampStepIndex");
{
  eq("accepts a forward step", clampStepIndex({ prevMaxIndex: 2, stepIndex: 3, stepCount: 8 }), 3);
  eq("accepts a jump forward — a skipped step still counts",
    clampStepIndex({ prevMaxIndex: 1, stepIndex: 5, stepCount: 8 }), 5);
  eq("never rolls back", clampStepIndex({ prevMaxIndex: 5, stepIndex: 2, stepCount: 8 }), 5);
  eq("clamps past the end", clampStepIndex({ prevMaxIndex: 2, stepIndex: 99, stepCount: 8 }), 7);
  eq("a negative index is ignored", clampStepIndex({ prevMaxIndex: 3, stepIndex: -2, stepCount: 8 }), 3);
  eq("an empty tour stays at 0", clampStepIndex({ prevMaxIndex: 0, stepIndex: 4, stepCount: 0 }), 0);
}

console.log("isTourComplete");
{
  eq("false below the last step", isTourComplete({ maxStepIndex: 6, stepCount: 8 }), false);
  eq("true at the last step", isTourComplete({ maxStepIndex: 7, stepCount: 8 }), true);
  eq("a zero-step tour is never complete", isTourComplete({ maxStepIndex: 0, stepCount: 0 }), false);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
