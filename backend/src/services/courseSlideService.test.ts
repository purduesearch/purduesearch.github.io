// Pure-logic tests for courseSlideService. No DB required.
// Run: cd backend && npx tsx src/services/courseSlideService.test.ts
import { clampSlideIndex, clampQuestionSlideIndex, isDeckComplete } from "./courseSlideService.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}
function eq(name: string, a: unknown, b: unknown) {
  if (JSON.stringify(a) === JSON.stringify(b)) passed++;
  else { failed++; console.error(`  ✗ ${name}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); }
}

console.log("clampSlideIndex");
{
  eq("accepts a forward step", clampSlideIndex({ prevMaxIndex: 2, index: 3, slideCount: 10 }), 3);
  eq("accepts a jump forward — reading fast is not cheating",
    clampSlideIndex({ prevMaxIndex: 0, index: 7, slideCount: 10 }), 7);
  eq("never rolls back on a rewind", clampSlideIndex({ prevMaxIndex: 5, index: 1, slideCount: 10 }), 5);
  eq("clamps past the end of the deck",
    clampSlideIndex({ prevMaxIndex: 2, index: 99, slideCount: 10 }), 9);
  eq("a negative index is ignored", clampSlideIndex({ prevMaxIndex: 4, index: -3, slideCount: 10 }), 4);
  eq("an empty deck stays at 0", clampSlideIndex({ prevMaxIndex: 0, index: 5, slideCount: 0 }), 0);
}

console.log("clampQuestionSlideIndex");
{
  eq("in-range index is untouched", clampQuestionSlideIndex(3, 10), 3);
  eq("out-of-range clamps to the last slide — never dropped", clampQuestionSlideIndex(42, 10), 9);
  eq("null stays null", clampQuestionSlideIndex(null, 10), null);
}

console.log("isDeckComplete");
{
  const qs = [{ id: "q1", slideIndex: 2 }, { id: "q2", slideIndex: 5 }];
  check("false before the last slide", !isDeckComplete({
    maxSlideIndex: 4, slideCount: 8, questions: qs, answeredIds: ["q1", "q2"],
  }));
  check("false at the last slide with an unanswered question", !isDeckComplete({
    maxSlideIndex: 7, slideCount: 8, questions: qs, answeredIds: ["q1"],
  }));
  check("true at the last slide with everything answered", isDeckComplete({
    maxSlideIndex: 7, slideCount: 8, questions: qs, answeredIds: ["q1", "q2"],
  }));
  check("a deck with no questions completes on the last slide", isDeckComplete({
    maxSlideIndex: 3, slideCount: 4, questions: [], answeredIds: [],
  }));
  check("an empty deck never completes", !isDeckComplete({
    maxSlideIndex: 0, slideCount: 0, questions: [], answeredIds: [],
  }));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
