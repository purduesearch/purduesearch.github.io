// Pure-logic unit tests for anthropicAdapter's request shaping. No network, no SDK.
// Run: cd backend && npx tsx src/services/ai/anthropicAdapter.test.ts

import { buildRequest, stripFences, effortForTier } from "./anthropicAdapter.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}

console.log("effortForTier — tiers map onto Anthropic effort levels");
{
  check("high",   effortForTier("high") === "high");
  check("medium", effortForTier("medium") === "medium");
  check("low",    effortForTier("low") === "low");
}

console.log("buildRequest — sampling params are rejected by Opus 5 / Sonnet 5 with a 400");
{
  const req = buildRequest({ prompt: "hi", json: false }, "medium", "claude-opus-5") as any;
  check("no temperature", !("temperature" in req));
  check("no top_p",       !("top_p" in req));
  check("no top_k",       !("top_k" in req));
}

console.log("buildRequest — thinking is adaptive, never disabled");
{
  const req = buildRequest({ prompt: "hi", json: false }, "low", "claude-opus-5") as any;
  check("adaptive thinking", req.thinking?.type === "adaptive");
  check("effort carried in output_config", req.output_config?.effort === "low");
}

console.log("buildRequest — JSON mode is coaxed by instruction, not by schema");
{
  const plain = buildRequest({ prompt: "list them", json: false }, "high", "claude-opus-5") as any;
  const json  = buildRequest({ prompt: "list them", json: true },  "high", "claude-opus-5") as any;

  check("plain call has no system prompt", !plain.system);
  check("json call adds a system prompt", typeof json.system === "string" && json.system.length > 0);
  check("json system mentions JSON", /json/i.test(json.system));
  // No JSON Schema is available — every generateJson caller in this codebase passes
  // a bare prompt — so output_config.format is not usable here.
  check("no structured-output format", !json.output_config?.format);
  check("user prompt is unchanged", json.messages[0].content === "list them");
}

console.log("buildRequest — max_tokens honours the caller, else a safe default");
{
  const dflt = buildRequest({ prompt: "x", json: false }, "high", "claude-opus-5") as any;
  const big  = buildRequest({ prompt: "x", json: false, maxOutputTokens: 32000 }, "high", "claude-opus-5") as any;
  check("default is 16000", dflt.max_tokens === 16000);
  check("caller override wins", big.max_tokens === 32000);
}

console.log("stripFences — models wrap JSON in code fences even when told not to");
{
  check("plain passthrough", stripFences('{"a":1}') === '{"a":1}');
  check("```json fence",     stripFences('```json\n{"a":1}\n```') === '{"a":1}');
  check("bare ``` fence",    stripFences('```\n{"a":1}\n```') === '{"a":1}');
  check("surrounding space", stripFences('  \n{"a":1}\n  ') === '{"a":1}');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
