import assert from "node:assert/strict";
import { buildTaskDraft, extractSuggestedAssignees } from "./taskDraft.js";
import { assertBlockBudget } from "./common.js";

const members = [{ slackId: "U1", displayName: "Henry Smith" }, { slackId: "U2", displayName: "Sarah Jones" }, { slackId: "U3", displayName: "Jo Wu" }];
assert.deepEqual(extractSuggestedAssignees("Assign <@U2> and @henry", members), ["U2", "U1"]);
assert.deepEqual(extractSuggestedAssignees("Have Henry fix this and Sarah review", members), ["U1", "U2"]);
assert.deepEqual(extractSuggestedAssignees("@hen and <@U1|Henry> and Henry", members), ["U1"]);
assert.deepEqual(extractSuggestedAssignees("Have jo fix this, or <@UNKNOWN>", members), []);
assert.deepEqual(extractSuggestedAssignees("Henry", []), []);

const base = { key: "draftkey", title: "Test task", projectName: "SEARCH", assigneeSlackIds: ["U1"] };
const simple = buildTaskDraft(base);
assertBlockBudget(simple, 50);
const simpleActions = simple.find(b => b.type === "actions") as any;
assert.deepEqual(simpleActions.elements.map((e: any) => e.action_id), ["qa_create", "qa_edit", "qa_cancel"]);
assert.equal(simpleActions.elements[0].value, "draftkey");
assert.equal(simpleActions.elements[0].style, "primary");
assert.equal((simple[1] as any).fields.length, 4);
assert.match((simple[1] as any).fields[2].text, /<@U1>/);

const duplicate = buildTaskDraft({ ...base, title: "x".repeat(500), projectName: "<danger>&", duplicate: { title: "<existing>", reason: "overlap" } });
assertBlockBudget(duplicate, 50);
assert.equal((duplicate[0] as any).text.text.length, 150);
assert.match((duplicate[1] as any).fields[0].text, /&lt;danger&gt;&amp;/);
assert.match((duplicate[2] as any).elements[0].text, /&lt;existing&gt;/);
assert.equal((duplicate[3] as any).elements[2].action_id, "qa_existing");
const huge = buildTaskDraft({ ...base, projectName: "p".repeat(5000), duplicate: { title: "d".repeat(5000), reason: "r".repeat(5000) } });
assertBlockBudget(huge, 50);
assert.ok((huge[1] as any).fields.every((f: any) => f.text.length <= 3000));
assert.ok((huge[2] as any).elements[0].text.length <= 3000);
assert.match((buildTaskDraft({ ...base, assigneeSlackIds: [] })[1] as any).fields[2].text, /Unassigned/);
console.log("taskDraft: 20 assertions passed");
