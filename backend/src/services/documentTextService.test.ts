// Pure-logic unit tests for documentTextService. No DB required.
// Run: cd backend && npx tsx src/services/documentTextService.test.ts
//
// Excluded from the production build (tsconfig `exclude` covers *.test.ts).
// Uses the same tiny inline assertion harness as courseProgressService.test.ts.

import { extractText, MAX_EXTRACTED_CHARS } from "./documentTextService.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}

console.log("extractText — plain text and markdown");
{
  const txt = await extractText(Buffer.from("hello world", "utf8"), "text/plain", "a.txt");
  check("txt extracts", txt.ok && txt.text === "hello world");

  const md = await extractText(Buffer.from("# Title\n\nbody", "utf8"), "text/markdown", "a.md");
  check("md extracts", md.ok && md.text.includes("body"));

  // Browsers frequently send .md as application/octet-stream — the extension
  // must be enough on its own, or a real submission is rejected as unsupported.
  const byExt = await extractText(Buffer.from("body", "utf8"), "application/octet-stream", "a.md");
  check("md by extension", byExt.ok === true);
}

console.log("extractText — unsupported formats name the fix");
{
  const doc = await extractText(Buffer.from("x"), "application/msword", "old.doc");
  check("legacy .doc rejected", !doc.ok && doc.reason === "UNSUPPORTED");
  check("message names the fix", !doc.ok && /\.docx|PDF/i.test(doc.message));

  const png = await extractText(Buffer.from("x"), "image/png", "shot.png");
  check("image rejected", !png.ok && png.reason === "UNSUPPORTED");
}

console.log("extractText — a file with no readable text is EMPTY, not ok-with-nothing");
{
  const blank = await extractText(Buffer.from("   \n\t  ", "utf8"), "text/plain", "blank.txt");
  check("whitespace-only is EMPTY", !blank.ok && blank.reason === "EMPTY");
  // This is the scanned-PDF path: it must never return ok with an empty string,
  // or the submission grades as a zero and a gated learner is stuck.
  check("EMPTY message mentions scans", !blank.ok && /scan/i.test(blank.message));
}

console.log("extractText — long input is clamped");
{
  const huge = "word ".repeat(MAX_EXTRACTED_CHARS);
  const res = await extractText(Buffer.from(huge, "utf8"), "text/plain", "big.txt");
  check("clamped to the cap", res.ok && res.text.length <= MAX_EXTRACTED_CHARS);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
