// Pure-logic unit tests for aiModelPrefs handling. No DB required.
// Run: cd backend && npx tsx src/services/ai/preferences.test.ts

import { readTierPref, sanitizePrefs, mergePrefs, DEFAULT_PREF } from "./preferences.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}

console.log("readTierPref — every unset shape resolves to the built-in Gemini lane");
{
  check("null column",     readTierPref(null, "high").provider === "GEMINI");
  check("empty object",    readTierPref({}, "high").provider === "GEMINI");
  check("missing tier",    readTierPref({ low: { provider: "OPENAI", model: "gpt-x" } }, "high").provider === "GEMINI");
  check("garbage value",   readTierPref({ high: "nonsense" } as any, "high").provider === "GEMINI");
  check("unknown provider", readTierPref({ high: { provider: "COHERE", model: "x" } } as any, "high").provider === "GEMINI");
  // A non-Gemini provider with no model is unusable — the adapters require an id.
  check("provider without model", readTierPref({ high: { provider: "ANTHROPIC" } } as any, "high").provider === "GEMINI");

  const set = readTierPref({ high: { provider: "ANTHROPIC", model: "claude-opus-5" } }, "high");
  check("valid pref read back", set.provider === "ANTHROPIC" && set.model === "claude-opus-5");
}

console.log("sanitizePrefs — only linked providers and known models survive");
{
  const linked = new Set(["ANTHROPIC"]);
  const models = new Map([["ANTHROPIC", new Set(["claude-opus-5"])]]);

  const ok = sanitizePrefs(
    { high: { provider: "ANTHROPIC", model: "claude-opus-5" } }, linked, models
  );
  check("valid pref accepted", ok.ok && ok.value!.high.provider === "ANTHROPIC");

  const unlinked = sanitizePrefs(
    { high: { provider: "OPENAI", model: "gpt-x" } }, linked, models
  );
  check("unlinked provider rejected", !unlinked.ok);
  check("rejection names the provider", /OPENAI/.test(unlinked.error ?? ""));

  const badModel = sanitizePrefs(
    { high: { provider: "ANTHROPIC", model: "claude-does-not-exist" } }, linked, models
  );
  check("unknown model rejected", !badModel.ok);

  const gemini = sanitizePrefs({ high: { provider: "GEMINI", model: null } }, new Set(), new Map());
  check("GEMINI needs no link and no model", gemini.ok);

  // All three tiers must come back, so the column is written whole.
  check("all tiers present", gemini.ok && Object.keys(gemini.value!).sort().join() === "high,low,medium");
}

console.log("mergePrefs — the column is written whole, spreading the previous value");
{
  const prev = {
    high:   { provider: "ANTHROPIC" as const, model: "claude-opus-5" },
    medium: { provider: "GEMINI" as const,    model: null },
    low:    { provider: "GEMINI" as const,    model: null },
  };
  const merged = mergePrefs(prev, { low: { provider: "OPENAI", model: "gpt-x" } });
  check("changed tier updated",   merged.low.provider === "OPENAI");
  check("untouched tier kept",    merged.high.model === "claude-opus-5");
  check("still exactly 3 tiers",  Object.keys(merged).length === 3);

  const fromNull = mergePrefs(null, { high: { provider: "OPENAI", model: "gpt-x" } });
  check("null previous fills defaults", fromNull.medium.provider === DEFAULT_PREF.provider);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
