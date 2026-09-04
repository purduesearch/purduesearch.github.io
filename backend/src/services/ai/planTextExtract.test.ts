// Pure-logic unit tests for the pasted-plan extractor. No DB, no network.
// Run: cd backend && npx tsx src/services/ai/planTextExtract.test.ts

import { extractJsonBlock, parsePastedPlan } from "./planTextExtract.js";

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++; else { failed++; console.error(`  ✗ ${name}`); }
}

console.log("extractJsonBlock — a chat reply is prose wrapped around a payload");
{
  const chatty = [
    "Here's the plan I'd suggest:",
    "",
    "```json",
    '{ "actions": [{ "type": "CREATE_TASK", "params": { "title": "Draft agenda" } }] }',
    "```",
    "",
    "Let me know if you'd like me to adjust the due dates.",
  ].join("\n");
  const got = extractJsonBlock(chatty);
  check("fenced block is found amid prose", got !== null && got.includes("CREATE_TASK"));
  check("prose is not included", got !== null && !got.includes("Let me know"));
}

{
  const bare = '{ "actions": [] }';
  check("a bare object is returned as-is", extractJsonBlock(bare) === bare);
}

{
  const unlabelled = "Sure:\n```\n{ \"actions\": [] }\n```";
  check("fence without a json tag still parses", extractJsonBlock(unlabelled) !== null);
}

{
  // A description containing braces must not truncate the span — the widest
  // first-{ to last-} window is the whole object.
  const nested = '{ "actions": [{ "params": { "description": "use {placeholder} syntax" } }] }';
  const got = extractJsonBlock(nested);
  check("nested braces survive", got !== null && JSON.parse(got!).actions.length === 1);
}

{
  check("prose with no JSON is null", extractJsonBlock("I can't help with that.") === null);
  check("empty string is null", extractJsonBlock("") === null);
  check("whitespace is null", extractJsonBlock("   \n  ") === null);
}

console.log("parsePastedPlan — accept every shape a chat model actually returns");
{
  const wrapped = '{ "actions": [{ "type": "SET_STATUS" }] }';
  const got = parsePastedPlan(wrapped);
  check("{actions:[...]} unwraps", Array.isArray(got) && got.length === 1);
}

{
  // The prompt asks for {actions:[...]}, but chat models drop the wrapper often
  // enough that rejecting a bare array would be a bad paste experience.
  const bareArray = '[{ "type": "SET_STATUS" }]';
  const got = parsePastedPlan(bareArray);
  check("a bare array is accepted", Array.isArray(got) && got.length === 1);
}

{
  check("empty actions is an empty array, not null", (parsePastedPlan('{"actions":[]}') ?? null)?.length === 0);
  check("valid JSON that is not a plan is null", parsePastedPlan('{"hello":"world"}') === null);
  check("unparseable is null", parsePastedPlan("nope") === null);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
