// Pure-logic unit tests for aiRouter's decision-making. No DB, no network.
// Run: cd backend && npx tsx src/services/ai/aiRouter.test.ts

import { cacheKeyFor, classifyFailure, truncateForAdapter, parseJsonLoose } from "./aiRouter.js";
import { AiAuthError } from "./types.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}

console.log("cacheKeyFor — a Claude member must never be served a Gemini-cached answer");
{
  const g = cacheKeyFor("GEMINI",    null,             "project:1:ask");
  const a = cacheKeyFor("ANTHROPIC", "claude-opus-5",  "project:1:ask");
  const s = cacheKeyFor("ANTHROPIC", "claude-sonnet-5","project:1:ask");
  check("provider namespaced",  g !== a);
  check("model namespaced",     a !== s);
  check("same inputs are stable", a === cacheKeyFor("ANTHROPIC", "claude-opus-5", "project:1:ask"));
  check("caller key preserved", a.endsWith("project:1:ask"));
}

console.log("classifyFailure — auth failures are permanent, everything else is transient");
{
  check("AiAuthError is auth",  classifyFailure(new AiAuthError("bad key")) === "auth");
  check("429 is transient",     classifyFailure({ status: 429 }) === "transient");
  check("500 is transient",     classifyFailure({ status: 500 }) === "transient");
  check("network is transient", classifyFailure(new Error("ECONNRESET")) === "transient");
  // A bare 401 that did not pass through an adapter must still park the credential.
  check("raw 401 is auth",      classifyFailure({ status: 401 }) === "auth");
  check("raw 403 is auth",      classifyFailure({ status: 403 }) === "auth");
}

console.log("truncateForAdapter — each provider has its own ceiling");
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
