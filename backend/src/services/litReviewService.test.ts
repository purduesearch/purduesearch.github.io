// Pure-logic unit tests for litReviewService. No DB, no network.
// Run: cd backend && npx tsx src/services/litReviewService.test.ts
//
// Excluded from the production build (tsconfig `exclude` covers *.test.ts).
// Same inline assertion harness as courseProgressService.test.ts.

import {
  sanitizeLitConfig,
  countWords,
  buildGradingPrompt,
  parseGradingResponse,
  DEFAULT_MIN_WORDS,
  type LitRubricPoint,
} from "./litReviewService.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}
function eq(name: string, a: unknown, b: unknown) {
  if (JSON.stringify(a) === JSON.stringify(b)) passed++;
  else { failed++; console.error(`  ✗ ${name}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); }
}

// ── sanitizeLitConfig — the leak guard ───────────────────────

const fullConfig = {
  pdfDriveFileId: "1RHGKt4",
  pdfTitle: "Gravity and Human Respiration",
  citation: "Dutta, S., et al. (2025).",
  promptText: "Summarise the paper's central claim.",
  minWords: 200,
  referenceSummary: "THE SECRET REFERENCE SUMMARY",
  rubric: [{ id: "r1", point: "THE SECRET RUBRIC", weight: 2 }],
};

const safe = sanitizeLitConfig(fullConfig);
eq("sanitize keeps the five learner-safe keys", Object.keys(safe ?? {}).sort(), [
  "citation", "minWords", "pdfDriveFileId", "pdfTitle", "promptText",
]);
check("sanitize drops referenceSummary", !JSON.stringify(safe).includes("SECRET REFERENCE"));
check("sanitize drops rubric", !JSON.stringify(safe).includes("SECRET RUBRIC"));
eq("sanitize keeps minWords", safe?.minWords, 200);
eq("sanitize defaults minWords when absent", sanitizeLitConfig({})?.minWords, DEFAULT_MIN_WORDS);
eq("sanitize defaults minWords when zero", sanitizeLitConfig({ minWords: 0 })?.minWords, DEFAULT_MIN_WORDS);
eq("sanitize returns null for null", sanitizeLitConfig(null), null);
eq("sanitize returns null for a string", sanitizeLitConfig("nope"), null);

// A key the author side adds later must NOT ship to learners by default. This
// is the whole reason sanitize builds by construction instead of deleting.
const withFutureSecret = { ...fullConfig, gradingNotes: "FUTURE SECRET" };
check(
  "sanitize ignores unknown keys",
  !JSON.stringify(sanitizeLitConfig(withFutureSecret)).includes("FUTURE SECRET")
);

// ── countWords ───────────────────────────────────────────────

eq("countWords empty", countWords(""), 0);
eq("countWords whitespace only", countWords("   \n\t "), 0);
eq("countWords single", countWords("plume"), 1);
eq("countWords collapses runs", countWords("the  human\n\nthermal   body plume"), 5);
eq("countWords trims", countWords("  two words  "), 2);

// ── parseGradingResponse ─────────────────────────────────────

const rubric: LitRubricPoint[] = [
  { id: "claim",  point: "States the central claim", weight: 2 },
  { id: "method", point: "Names the method",         weight: 1 },
  { id: "limit",  point: "Notes a limitation",       weight: 1 },
];

const good = parseGradingResponse({
  points: [
    { id: "claim",  verdict: "caught",  comment: "You got it." },
    { id: "method", verdict: "partial", comment: "Half there." },
    { id: "limit",  verdict: "missed",  comment: "Reread §4." },
  ],
  overall: "Solid first pass.",
}, rubric);

eq("parse keeps rubric order", good?.points.map((p) => p.id), ["claim", "method", "limit"]);
eq("parse carries overall", good?.overall, "Solid first pass.");
// caught 2/2 + partial 0.5/1 + missed 0/1 = 2.5 of 4 = 62.5
eq("parse scores caught full, partial half, missed zero", good?.scorePct, 62.5);

const missingPoint = parseGradingResponse({
  points: [{ id: "claim", verdict: "caught", comment: "Yes." }],
  overall: "",
}, rubric);
eq("parse fills a skipped rubric id as missed", missingPoint?.points.length, 3);
eq("parse marks the skipped ones missed", missingPoint?.points[2]?.verdict, "missed");

const invented = parseGradingResponse({
  points: [
    { id: "claim",    verdict: "caught", comment: "Yes." },
    { id: "invented", verdict: "caught", comment: "Not a real rubric point." },
  ],
  overall: "",
}, rubric);
eq("parse drops rubric ids the model invented", invented?.points.map((p) => p.id),
  ["claim", "method", "limit"]);

const badVerdict = parseGradingResponse({
  points: [{ id: "claim", verdict: "excellent", comment: "" }],
  overall: "",
}, rubric);
eq("parse coerces an unknown verdict to missed", badVerdict?.points[0]?.verdict, "missed");

eq("parse returns null for a non-object", parseGradingResponse("nope", rubric), null);
eq("parse returns null for null", parseGradingResponse(null, rubric), null);
eq("parse scores an empty rubric as 0, not NaN",
  parseGradingResponse({ points: [], overall: "" }, [])?.scorePct, 0);

// ── buildGradingPrompt ───────────────────────────────────────

const prompt = buildGradingPrompt({
  citation: "Dutta, S., et al. (2025).",
  referenceSummary: "The HTBP collapses in microgravity.",
  rubric,
  submission: "A learner wrote this.",
});
check("prompt carries the reference summary", prompt.includes("The HTBP collapses in microgravity."));
check("prompt carries every rubric id", rubric.every((r) => prompt.includes(`"${r.id}"`)));
check("prompt carries the submission", prompt.includes("A learner wrote this."));
check("prompt forbids invented ids", prompt.includes("Never invent a rubric id"));

// ── Report ───────────────────────────────────────────────────

console.log(`litReviewService: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
