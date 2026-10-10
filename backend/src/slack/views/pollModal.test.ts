import assert from "node:assert/strict";
import { buildPollInvite, buildPollModal } from "./pollModal.js";
import { assertBlockBudget } from "./common.js";

const poll = { id: "poll1", title: "Find <time>", timezone: "America/Los_Angeles", publicToken: "token", slotStarts: ["2026-10-07T06:00:00Z", "2026-10-07T09:00:00Z"] };
const view = buildPollModal(poll, [poll.slotStarts[0]]);
assertBlockBudget(view.blocks, 100);
const inputs = view.blocks.filter(block => block.type === "input");
assert.equal(inputs.length, 2); // UTC date is the same, local dates differ.
assert.match(inputs[0].label.text, /Tue, Oct 6/);
assert.equal(inputs[0].element.type, "checkboxes");
if (inputs[0].element.type !== "checkboxes") throw new Error("Expected checkboxes");
assert.equal(inputs[0].element.initial_options?.[0].value, poll.slotStarts[0].replace("Z", ".000Z"));
assert.equal(inputs[0].element.options[0].text.text, "Tue 11:00 PM");
assert.match(JSON.stringify(view), /&lt;time&gt;/);
const starts = Array.from({ length: 24 }, (_, i) => new Date(Date.UTC(2026, 9, 7, 8, i * 30)));
const split = buildPollModal({ ...poll, slotStarts: starts }, []);
const groups = split.blocks.filter(block => block.type === "input");
assert.equal(groups.length, 3);
assert.match(groups[0].label.text, /\(1\/3\)/);
for (const group of groups) if (group.element.type === "checkboxes") {
  assert.ok(group.element.options.length <= 10);
  assert.equal(group.element.initial_options, undefined);
}
const revised = buildPollModal(poll, [], "new");
assert.notEqual(revised.blocks[1].block_id, view.blocks[1].block_id);
const huge = buildPollModal({ ...poll, slotStarts: Array.from({ length: 1200 }, (_, i) => new Date(Date.UTC(2026, 9, 7 + i, 10))) }, []);
assertBlockBudget(huge.blocks, 100);
assert.equal(huge.blocks.length, 100);
assert.match(JSON.stringify(huge), /Grid too large for Slack/);
const invite = buildPollInvite({ ...poll, organizer: { displayName: "Organizer", slackId: "U1" }, responseDeadline: "2026-10-09T20:00:00Z" });
assertBlockBudget(invite, 50);
assert.match(JSON.stringify(invite), /<@U1>/);
assert.match(JSON.stringify(invite), /poll_open/);
assert.match(JSON.stringify(invite), /Oct 9/);
assert.match(JSON.stringify(buildPollModal({ ...poll, slotStarts: [] }, [])), /poll_usual/);
console.log("pollModal: 17 checks passed");
