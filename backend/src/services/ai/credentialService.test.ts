// Pure-logic unit tests for credentialService. No DB required.
// Run: cd backend && npx tsx src/services/ai/credentialService.test.ts
//
// Excluded from the production build (tsconfig `exclude` covers *.test.ts).

import { keyHintOf, assertKeyedProvider, toSafeCredential, shouldNotify } from "./credentialService.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}

console.log("keyHintOf — only the last 4 characters ever leave the backend");
{
  check("takes last 4", keyHintOf("sk-ant-api03-ABCDWXYZ") === "WXYZ");
  check("short key is not padded or leaked whole", keyHintOf("abc") === "abc");
  check("empty is empty", keyHintOf("") === "");
}

console.log("assertKeyedProvider — GEMINI is the built-in and must never be stored");
{
  let threw = false;
  try { assertKeyedProvider("GEMINI" as any); } catch { threw = true; }
  check("GEMINI rejected", threw);

  let ok = true;
  try { assertKeyedProvider("ANTHROPIC" as any); assertKeyedProvider("OPENAI" as any); }
  catch { ok = false; }
  check("ANTHROPIC and OPENAI accepted", ok);
}

console.log("toSafeCredential — the encrypted key must never reach a response body");
{
  const row = {
    id: "c1", memberId: "m1", provider: "ANTHROPIC",
    apiKey: "iv:tag:CIPHERTEXT", keyHint: "WXYZ", status: "ACTIVE",
    lastError: null, lastVerifiedAt: null, lastNotifiedAt: null,
    createdAt: new Date(), updatedAt: new Date(),
  };
  const safe = toSafeCredential(row as any);
  check("no apiKey key present", !("apiKey" in safe));
  check("ciphertext absent from serialized form", !JSON.stringify(safe).includes("CIPHERTEXT"));
  check("hint preserved", safe.keyHint === "WXYZ");
  check("provider preserved", safe.provider === "ANTHROPIC");
}

console.log("shouldNotify — auth failures always notify, transient ones at most daily");
{
  const now = new Date("2026-09-02T12:00:00Z");
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000);

  check("never notified before → notify", shouldNotify(null, now));
  check("notified 25h ago → notify", shouldNotify(hoursAgo(25), now));
  check("notified 2h ago → stay quiet", !shouldNotify(hoursAgo(2), now));
  check("notified exactly now → stay quiet", !shouldNotify(now, now));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
