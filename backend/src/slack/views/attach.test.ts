// Run: cd backend && npx tsx src/slack/views/attach.test.ts
import assert from "node:assert/strict";
import type { Recommendation } from "../../services/slackMentionService.js";
import { ATTACH_GROUPS, buildAttachPicker, buildAttachSearchModal } from "./attachPicker.js";
import { buildLinkCard, type LinkCardItem } from "./linkCard.js";
import { assertBlockBudget, LIMITS } from "./common.js";

let passed = 0;
function check(name: string, fn: () => void) { fn(); passed++; console.log(`✓ ${name}`); }
const rec: Recommendation = { intent: "ATTACH", intentArg: null, aiUsed: true, picks: ATTACH_GROUPS.flatMap(group =>
  Array.from({ length: 6 }, (_, index) => ({ candidate: { key: `${group.kind}${index}`, id: `${index}`, kind: group.kind,
    projectId: "p", title: "Title".repeat(30), meta: "TODO", url: "https://example.com/item" },
    confidence: index === 0 ? 0.49 : 0.5, reason: "Reason ".repeat(30) }))) };

check("picker respects block, option and preselection limits", () => {
  const blocks = buildAttachPicker(rec, { pickerId: "picker", aiUsed: true });
  assertBlockBudget(blocks, LIMITS.messageBlocks);
  const groups = blocks.filter(block => block.type === "actions" && block.block_id?.startsWith("ap_"));
  assert.equal(groups.length, 5);
  for (const group of groups) {
    assert.equal(group.type, "actions");
    if (group.type !== "actions") continue;
    const element = group.elements[0];
    assert.equal(element.type, "checkboxes");
    if (element.type !== "checkboxes") continue;
    assert.equal(element.options.length, 5);
    assert.equal(element.initial_options?.length, 4);
    for (const option of element.options) {
      assert.ok(option.text.text.length <= 75);
      assert.equal(option.description?.text.length, 75);
      assert.ok(!option.value?.endsWith("5"));
    }
  }
});
check("fallback explains AI availability and carries picker identity", () => {
  const blocks = buildAttachPicker(rec, { pickerId: "identity", aiUsed: false });
  assert.match(JSON.stringify(blocks), /AI was unavailable/);
  const actions = blocks.at(-1);
  assert.ok(actions?.type === "actions");
  for (const element of actions.elements) {
    assert.ok(element.type === "button");
    assert.equal(element.value, "identity");
  }
});
check("search modal exposes all five typeaheads with matching prefills", () => {
  const view = buildAttachSearchModal(rec, { pickerId: "identity" });
  assertBlockBudget(view.blocks, LIMITS.viewBlocks);
  assert.equal(view.private_metadata, "identity");
  assert.equal(view.blocks.length, 5);
  view.blocks.forEach((block, index) => {
    assert.ok(block.type === "input");
    assert.ok(block.element.type === "multi_external_select");
    assert.equal(block.element.action_id, ATTACH_GROUPS[index].action);
    assert.equal(block.element.min_query_length, 0);
    assert.equal(block.element.initial_options?.length, 5);
  });
});
const item = (kind: LinkCardItem["kind"], status?: string): LinkCardItem => ({ linkId: "link", kind, status,
  title: "<unsafe> & title", url: "https://example.com/item", meta: "Fact", linkedBySlackId: "U123" });
const actions = (value: LinkCardItem) => {
  const blocks = buildLinkCard([value]);
  assertBlockBudget(blocks, LIMITS.messageBlocks);
  const row = blocks[0];
  assert.ok(row.type === "section" && row.accessory?.type === "overflow");
  assert.ok(row.accessory.options.length >= 2 && row.accessory.options.length <= 5);
  assert.equal(row.accessory.action_id, "lc_item");
  assert.equal(row.accessory.options[0].url, value.url);
  return row.accessory.options.map(option => JSON.parse(option.value!).a);
};
check("link actions reflect kind and current status", () => {
  assert.deepEqual(actions(item("TASK", "TODO")), ["open", "done", "unlink"]);
  assert.deepEqual(actions(item("TASK", "DONE")), ["open", "unlink"]);
  assert.deepEqual(actions(item("VAULT_ITEM", "AVAILABLE")), ["open", "checkout", "unlink"]);
  assert.deepEqual(actions({ ...item("VAULT_ITEM"), checkedOutById: "member" }), ["open", "unlink"]);
  for (const kind of ["GITHUB", "DRIVE_FILE", "MILESTONE"] as const) assert.deepEqual(actions(item(kind)), ["open", "unlink"]);
});
check("unknown kinds are skipped by both builders", () => {
  const unknown = { ...rec.picks[0], candidate: { ...rec.picks[0].candidate, kind: "UNKNOWN" } };
  const picker = buildAttachPicker({ ...rec, picks: [unknown] } as unknown as Recommendation, { pickerId: "p", aiUsed: true });
  assert.equal(picker.length, 2);
  assert.equal(buildLinkCard([{ ...item("TASK"), kind: "UNKNOWN" } as unknown as LinkCardItem]).length, 1);
});
check("link text escapes labels and renders live credit with safe GitHub fallback", () => {
  const json = JSON.stringify(buildLinkCard([item("GITHUB")]));
  assert.match(json, /&lt;unsafe&gt; &amp; title/);
  assert.match(json, /Linked by <@U123>/);
  assert.match(json, /statuses update live/);
  assert.match(json, /:link:/);
  assert.match(JSON.stringify(buildLinkCard([item("GITHUB")], { githubEmojiAvailable: true })), /:octocat:/);
});
check("large context cards remain within the message budget", () => {
  assertBlockBudget(buildLinkCard(Array.from({ length: 75 }, () => item("TASK"))), LIMITS.messageBlocks);
});
console.log(`attach: ${passed} passed, 0 failed`);
