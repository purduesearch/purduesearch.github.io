// Pure-logic unit tests for aiRouter. No DB, no network.
// Run: cd backend && npx tsx src/services/ai/aiRouter.test.ts

import { truncateForAdapter, parseJsonLoose } from "./aiRouter.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}

console.log("truncateForAdapter — the provider ceiling is enforced before the call");
{
  const long = "x".repeat(500);
  check("under the limit is untouched", truncateForAdapter(long, 1000) === long);

  const cut = truncateForAdapter(long, 100);
  check("over the limit is cut", cut.length < long.length);
  check("truncation is announced to the model", /truncated/i.test(cut));
}

console.log("parseJsonLoose — a provider that returns nothing must not throw");
{
  check("valid json parses", (parseJsonLoose<{ a: number }>('{"a":1}'))?.a === 1);
  check("empty string is null", parseJsonLoose("") === null);
  check("garbage is null", parseJsonLoose("I cannot help with that") === null);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
