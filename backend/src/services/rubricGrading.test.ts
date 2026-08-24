// Pure-logic unit tests for rubricGrading. No DB, no network.
// Run: cd backend && npx tsx src/services/rubricGrading.test.ts
//
// Excluded from the production build (tsconfig `exclude` covers *.test.ts).
// Same inline assertion harness as courseProgressService.test.ts.

import { parseGradingResponse, normalizeRubric, countWords } from "./rubricGrading.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}

const rubric = [
  { id: "a", point: "Names the claim", weight: 2 },
  { id: "b", point: "Names the method", weight: 1 },
];

console.log("parseGradingResponse — scoring");
{
  const all = parseGradingResponse(
    { points: [{ id: "a", verdict: "caught", comment: "" }, { id: "b", verdict: "caught", comment: "" }], overall: "" },
    rubric
  );
  check("all caught is 100", all?.scorePct === 100);

  const half = parseGradingResponse(
    { points: [{ id: "a", verdict: "partial", comment: "" }, { id: "b", verdict: "missed", comment: "" }], overall: "" },
    rubric
  );
  // partial on weight 2 = 1 of 3 total.
  check("partial is half weight", Math.abs((half?.scorePct ?? 0) - 33.33) < 0.01);

  // An id the model invented has no author-written point behind it.
  const invented = parseGradingResponse(
    { points: [{ id: "zzz", verdict: "caught", comment: "" }], overall: "" },
    rubric
  );
  check("invented ids dropped", invented?.points.length === 2);
  check("invented ids score nothing", invented?.scorePct === 0);

  // A point the model skipped must not read as free credit.
  const skipped = parseGradingResponse(
    { points: [{ id: "a", verdict: "caught", comment: "" }], overall: "" },
    rubric
  );
  check("skipped point is missed", skipped?.points.find((p) => p.id === "b")?.verdict === "missed");

  check("garbage returns null", parseGradingResponse("nope", rubric) === null);
}

console.log("normalizeRubric — weights floored at 1");
{
  check("zero weight floored", normalizeRubric([{ id: "a", point: "x", weight: 0 }])[0]?.weight === 1);
  check("malformed dropped", normalizeRubric([{ point: "no id" }]).length === 0);
  check("non-array is empty", normalizeRubric(null).length === 0);
}

console.log("countWords");
{
  check("empty is zero", countWords("   ") === 0);
  check("counts tokens", countWords("one two  three\nfour") === 4);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
