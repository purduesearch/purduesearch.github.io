// Pure-logic tests for the training fixture. No DB required.
// Run: cd backend && npx tsx src/services/trainingSandboxService.test.ts
import { TRAINING_FIXTURE, TRAINING_PROJECT_NAME } from "./trainingSandboxService.js";

let passed = 0, failed = 0;
function eq(name: string, a: unknown, b: unknown) {
  if (JSON.stringify(a) === JSON.stringify(b)) passed++;
  else { failed++; console.error(`  ✗ ${name}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); }
}
function ok(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}

console.log("TRAINING_FIXTURE");
{
  eq("seeds six tasks", TRAINING_FIXTURE.tasks.length, 6);
  const statuses = new Set(TRAINING_FIXTURE.tasks.map((t) => t.status));
  ok("covers all four statuses",
    ["TODO", "IN_PROGRESS", "BLOCKED", "DONE"].every((s) => statuses.has(s)));
  eq("seeds two milestones", TRAINING_FIXTURE.milestones.length, 2);
  ok("one milestone is deliberately at risk",
    TRAINING_FIXTURE.milestones.some((m) => m.dueInDays < 0));
  eq("seeds one blocker", TRAINING_FIXTURE.blockers.length, 1);
  ok("the name is recognisable to a human scanning a project list",
    TRAINING_PROJECT_NAME.includes("Training"));
  ok("every task has a title that says what done means",
    TRAINING_FIXTURE.tasks.every((t) => t.title.split(" ").length >= 3));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
