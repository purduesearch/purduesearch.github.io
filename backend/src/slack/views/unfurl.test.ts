import assert from "node:assert/strict";
import { buildUnfurlBlocks } from "./unfurl.js";
import { assertBlockBudget } from "./common.js";

const url = "https://example.com/clubpm/projects/p?task=t";
for (const type of ["TASK", "VAULT_ITEM", "CHANGE_REQUEST", "EVENT", "PROJECT"] as const) {
  const generic = buildUnfurlBlocks({ type, id: "secret", projectId: "secret-project" }, url);
  assertBlockBudget(generic, 50);
  assert.equal(generic.length, 2);
  assert.doesNotMatch(JSON.stringify(generic), /secret/);
  assert.equal(generic[0].type, "section");
  assert.equal(generic[1].type, "actions");
  if (generic[1].type === "actions") assert.equal(generic[1].elements.length, 1);
}
for (const [type, actionId, value] of [["TASK", "tc_assign_me", { t: "task" }], ["VAULT_ITEM", "vc_checkout", { i: "item" }], ["EVENT", "uf_rsvp", { e: "event" }]] as const) {
  const blocks = buildUnfurlBlocks({ type, id: "id" }, url, { title: "Title".repeat(100), pill: "<status>&", facts: ["<one>", "&two", "three", "not shown"], action: { label: "Act", actionId, value } });
  assertBlockBudget(blocks, 50);
  assert.equal(blocks.length, 3);
  if (blocks[0].type === "header") assert.ok(blocks[0].text.text.length <= 150);
  if (blocks[1].type !== "section" || blocks[1].text?.type !== "mrkdwn") throw new Error("Expected facts");
  assert.match(blocks[1].text.text, /&lt;status&gt;&amp;/);
  assert.doesNotMatch(blocks[1].text.text, /not shown/);
  if (blocks[2].type !== "actions") throw new Error("Expected actions");
  assert.equal(blocks[2].elements.length, 2);
  assert.equal(blocks[2].elements[0].type, "button");
  assert.equal(blocks[2].elements[1].type, "button");
  const action = blocks[2].elements[1];
  if (action.type === "button") { assert.equal(action.action_id, actionId); assert.deepEqual(JSON.parse(action.value!), value); }
}
const bounded = buildUnfurlBlocks({ type: "PROJECT", id: "p" }, url, { title: "P", pill: "<".repeat(10000), facts: Array(10).fill("&".repeat(10000)) });
if (bounded[1].type === "section") assert.ok(bounded[1].text!.text.length <= 3000);
assertBlockBudget(bounded, 50);
console.log("✓ unfurl privacy fallbacks, actions, escaping and budgets (9 cases)");
