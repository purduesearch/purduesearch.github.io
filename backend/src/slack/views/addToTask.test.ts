import assert from "node:assert/strict";
import { buildAddToTask } from "./addToTask.js";
import { assertBlockBudget } from "./common.js";

const view = buildAddToTask("session", "x".repeat(4000));
assertBlockBudget(view.blocks, 100);
assert.equal(view.private_metadata, "session");
assert.equal(view.callback_id, "att_submit");
const blocks = view.blocks as any[];
assert.equal(blocks[0].text.text.length, 3000);
assert.equal(blocks[1].element.type, "external_select");
assert.equal(blocks[1].element.min_query_length, 0);
assert.equal(blocks[1].element.action_id, "att_task");
assert.deepEqual(blocks[2].element.options.map((option: any) => option.value), ["comment", "link"]);
assert.equal(blocks[2].element.initial_option.value, "comment");
assert.equal(blocks[3].optional, true);
assert.equal(blocks[3].element.options[0].text.text, "Include files");
assert.equal((buildAddToTask("session", "").blocks[0] as any).text.text, "Slack message with files");
console.log("addToTask: 12 assertions passed");
