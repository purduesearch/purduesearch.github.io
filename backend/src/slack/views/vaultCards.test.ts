import assert from "node:assert/strict";
import { buildVaultItemCard, buildVaultCrCard, buildVaultCheckoutConflict, buildCrNoteModal, vaultCardUrl, type VaultCardItem } from "./vaultCards.js";
import { assertBlockBudget, LIMITS } from "./common.js";
let passed = 0;
function check(name: string, fn: () => void) { fn(); passed++; console.log(`✓ ${name}`); }
function buttons(blocks: ReturnType<typeof buildVaultItemCard>) { return blocks.flatMap(b => b.type === "actions" ? b.elements.filter(e => e.type === "button") : []); }
const item: VaultCardItem = { id: "i1", projectId: "p1", name: "Bracket <&>", partNumber: "PRT-001", currentRevision: "B" };
const viewer = { memberId: "m1", isAdmin: false, watching: false };
const held = { ...item, checkedOutById: "m2", checkedOutBy: { displayName: "Ada", slackId: "U2" }, checkedOutAt: new Date("2026-10-08T12:00:00Z") };
const cr = { id: "cr1", projectId: "p1", title: "Release bracket", status: "OPEN", items: [{ item: { name: "Bracket", partNumber: "PRT-001" } }] };
const review = { state: "pending", reasons: ["Ada must sign off"], signoffs: [] as { memberId: string }[] };
check("item facts, deep link and Watch action", () => {
  const blocks = buildVaultItemCard(item, viewer); assertBlockBudget(blocks, LIMITS.messageBlocks);
  assert.deepEqual(buttons(blocks).map(b => b.action_id), ["vc_open", "vc_checkout", "vc_watch"]);
  assert.equal(buttons(blocks)[0].url, vaultCardUrl({ projectId: "p1", itemId: "i1" }));
  assert(JSON.stringify(blocks).includes("PRT-001")); assert(JSON.stringify(blocks).includes("Rev B"));
  assert.equal(buttons(blocks)[2].text.text, "Watch");
});
check("holder gets Undo; other member gets checkout and holder facts", () => {
  for (const v of [viewer, { ...viewer, memberId: "m2" }, { ...viewer, isAdmin: true }]) {
    const blocks = buildVaultItemCard(held, v); assertBlockBudget(blocks, LIMITS.messageBlocks);
    assert.equal(buttons(blocks)[1].action_id, v.memberId === "m2" || v.isAdmin ? "vc_undo" : "vc_checkout");
    assert(JSON.stringify(blocks).includes("<@U2> since 2026-10-08"));
  }
});
check("watching member gets Unwatch", () => {
  const blocks = buildVaultItemCard(item, { ...viewer, watching: true }); assertBlockBudget(blocks, LIMITS.messageBlocks);
  assert.equal(buttons(blocks)[2].text.text, "Unwatch");
});
check("CR non-admin cannot see approval; admin sees both decisions", () => {
  const ordinary = buildVaultCrCard(cr, viewer, review); assertBlockBudget(ordinary, LIMITS.messageBlocks);
  assert.deepEqual(buttons(ordinary).map(b => b.action_id), ["vc_open", "cr_signoff"]);
  const privileged = buildVaultCrCard(cr, { ...viewer, isAdmin: true }, review); assertBlockBudget(privileged, LIMITS.messageBlocks);
  assert.deepEqual(buttons(privileged).map(b => b.action_id), ["vc_open", "cr_approve", "cr_reject", "cr_signoff"]);
  assert(JSON.stringify(ordinary).includes("Ada must sign off")); assert(JSON.stringify(ordinary).includes("PRT-001 Bracket"));
});
check("existing signoff is revocable; closed CR has only Open", () => {
  const signed = buildVaultCrCard(cr, viewer, { ...review, signoffs: [{ memberId: viewer.memberId }] }); assertBlockBudget(signed, LIMITS.messageBlocks);
  assert.equal(buttons(signed).at(-1)!.text.text, "Revoke sign-off");
  for (const status of ["APPROVED", "REJECTED", "CANCELLED"]) {
    const blocks = buildVaultCrCard({ ...cr, status }, { ...viewer, isAdmin: true }, review); assertBlockBudget(blocks, LIMITS.messageBlocks);
    assert.deepEqual(buttons(blocks).map(b => b.action_id), ["vc_open"]);
  }
});
check("checkout conflict has explicit confirmed forced takeover", () => {
  const blocks = buildVaultCheckoutConflict(held); assertBlockBudget(blocks, LIMITS.messageBlocks);
  const takeover = buttons(blocks)[0]; assert.deepEqual(JSON.parse(takeover.value!), { i: "i1", force: true });
  assert.equal(takeover.confirm?.confirm.text, "Take over"); assert.equal(takeover.confirm?.deny.text, "Cancel");
  assert(JSON.stringify(blocks).includes("Checked out by <@U2> since 2026-10-08"));
});
check("note modal carries decision and a bounded note input", () => {
  for (const decision of ["approve", "reject"] as const) {
    const view = buildCrNoteModal(cr.id, decision, "C1"); assertBlockBudget(view.blocks, LIMITS.viewBlocks);
    assert(view.title.text.length <= LIMITS.modalTitle); assert(view.submit!.text.length <= LIMITS.modalSubmit);
    assert.deepEqual(JSON.parse(view.private_metadata!), { c: "cr1", decision, channelId: "C1" });
    assert.equal(view.callback_id, "cr_note_submit");
  }
});
check("long facts truncate below Slack budgets and escape markdown", () => {
  const blocks = buildVaultCrCard({ ...cr, title: "x".repeat(400), items: Array.from({ length: 200 }, () => ({ item: { name: "<&>".repeat(100) } })) }, viewer, { ...review, reasons: ["<&>".repeat(1000)] });
  assertBlockBudget(blocks, LIMITS.messageBlocks);
  for (const b of blocks) {
    if (b.type === "header") assert(b.text.text.length <= LIMITS.headerText);
    if (b.type === "section" && b.text) assert(b.text.text.length <= LIMITS.sectionText);
    if (b.type === "context") for (const e of b.elements) if (e.type === "mrkdwn") assert(e.text.length <= LIMITS.sectionText);
  }
  assert(JSON.stringify(blocks).includes("&lt;&amp;&gt;"));
});
console.log(`${passed} checks passed`);
