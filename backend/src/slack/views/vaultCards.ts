import type { ActionsBlock, Button, KnownBlock, ModalView } from "@slack/types";
import { vaultLink } from "../../services/vaultSearchCore.js";
import { renderMessage, type VaultEventRow } from "../../services/vaultNotifyCore.js";
import { escapeMrkdwn, memberRef, trunc, assertBlockBudget, LIMITS } from "./common.js";

export interface VaultCardItem {
  id: string; projectId: string; name: string; partNumber?: string | null;
  currentRevision?: string | null; checkedOutById?: string | null;
  checkedOutBy?: { displayName: string; slackId?: string | null } | null;
  checkedOutAt?: Date | string | null;
}
export interface VaultCardViewer { memberId: string; isAdmin: boolean; watching?: boolean }
export interface VaultCardCr {
  id: string; projectId: string; title: string; status: string;
  items: { item: { name: string; partNumber?: string | null } }[];
}
export interface VaultCardReview {
  state: string; reasons: string[]; signoffs: { memberId: string }[];
}
export interface VaultNoticeContext {
  viewer: VaultCardViewer;
  item?: VaultCardItem | null;
  cr?: VaultCardCr | null;
  review?: VaultCardReview;
}
/** Snapshot wording plus current entity state; actions always recheck permissions. */
export function buildVaultNoticeBlocks(event: VaultEventRow, context: VaultNoticeContext): KnownBlock[] {
  const blocks: KnownBlock[] = [{ type: "section", text: { type: "mrkdwn", text: escaped(renderMessage(event, context.viewer.memberId), LIMITS.sectionText) } }];
  if (event.kind === "CR_SUBMITTED" || event.kind === "CR_DECIDED") {
    if (context.cr) blocks.push(...buildVaultCrCard(context.cr, context.viewer, context.review ?? { state: "Unavailable", reasons: [], signoffs: [] }));
  } else if (context.item) blocks.push(...buildVaultItemCard(context.item, context.viewer));
  assertBlockBudget(blocks, LIMITS.messageBlocks);
  return blocks;
}
const text = (s: string) => ({ type: "plain_text" as const, text: s });
// Escape can expand each character fivefold; bound the final Slack text.
const escaped = (s: string, n: number) => escapeMrkdwn(trunc(s, Math.floor(n / 5)));
function button(label: string, action: string, value: object): Button {
  return { type: "button", text: text(label), action_id: action, value: JSON.stringify(value) };
}
export function vaultCardUrl(target: { projectId: string; itemId?: string; crId?: string }): string {
  return `${(process.env.FRONTEND_URL ?? "http://localhost:3000").replace(/\/+$/, "")}${vaultLink(target)}`;
}
function openButton(url: string): Button { return { type: "button", text: text("Open"), action_id: "vc_open", url }; }
function checkoutLine(item: VaultCardItem): string {
  if (!item.checkedOutById) return "Available for checkout";
  const date = item.checkedOutAt ? new Date(item.checkedOutAt).toISOString().slice(0, 10) : "unknown date";
  return `Checked out by ${item.checkedOutBy ? memberRef({ ...item.checkedOutBy, displayName: trunc(item.checkedOutBy.displayName, 100) }) : "a member"} since ${date}`;
}
export function buildVaultItemCard(item: VaultCardItem, viewer: VaultCardViewer): KnownBlock[] {
  const elements: ActionsBlock["elements"] = [openButton(vaultCardUrl({ projectId: item.projectId, itemId: item.id }))];
  if (item.checkedOutById === viewer.memberId || (viewer.isAdmin && item.checkedOutById)) elements.push(button("Undo checkout", "vc_undo", { i: item.id }));
  else elements.push(button("Check out", "vc_checkout", { i: item.id }));
  elements.push(button(viewer.watching ? "Unwatch" : "Watch", "vc_watch", { i: item.id }));
  const blocks: KnownBlock[] = [
    { type: "header", text: text(trunc(item.name, LIMITS.headerText)) },
    { type: "section", text: { type: "mrkdwn", text: `${escaped(item.partNumber ?? "No part number", 200)} · :label: Rev ${escaped(item.currentRevision ?? "unreleased", 80)}\n${checkoutLine(item)}` } },
    { type: "actions", elements },
  ];
  assertBlockBudget(blocks, LIMITS.messageBlocks); return blocks;
}
export function buildVaultCrCard(cr: VaultCardCr, viewer: VaultCardViewer, review: VaultCardReview): KnownBlock[] {
  const elements: ActionsBlock["elements"] = [openButton(vaultCardUrl({ projectId: cr.projectId, crId: cr.id }))];
  if (cr.status === "OPEN") {
    if (viewer.isAdmin) elements.push(button("Approve", "cr_approve", { c: cr.id }), button("Reject", "cr_reject", { c: cr.id }));
    elements.push(button(review.signoffs.some(s => s.memberId === viewer.memberId) ? "Revoke sign-off" : "Sign off", "cr_signoff", { c: cr.id }));
  }
  const icon = cr.status === "APPROVED" ? ":large_green_circle:" : cr.status === "REJECTED" ? ":red_circle:" : ":white_circle:";
  const blocks: KnownBlock[] = [
    { type: "header", text: text(trunc(cr.title, LIMITS.headerText)) },
    { type: "section", text: { type: "mrkdwn", text: `${icon} ${escaped(cr.status, 80)}\n*Affected items:* ${escaped(cr.items.map(i => `${i.item.partNumber ?? ""} ${i.item.name}`.trim()).join(", ") || "None", 1800)}` } },
    { type: "context", elements: [{ type: "mrkdwn", text: `Review gate: ${escaped(review.state, 80)} · ${escaped(review.reasons.join("; ") || "No outstanding review requirements", 1000)}` }] },
    { type: "actions", elements },
  ];
  assertBlockBudget(blocks, LIMITS.messageBlocks); return blocks;
}
export function buildVaultCheckoutConflict(item: VaultCardItem): KnownBlock[] {
  const takeover = button("Take over", "vc_checkout", { i: item.id, force: true });
  takeover.confirm = { title: text("Take over checkout?"), text: { type: "mrkdwn", text: "This replaces the current checkout and notifies its holder." }, confirm: text("Take over"), deny: text("Cancel") };
  const blocks: KnownBlock[] = [{ type: "section", text: { type: "mrkdwn", text: checkoutLine(item) } }, { type: "actions", elements: [takeover] }];
  assertBlockBudget(blocks, LIMITS.messageBlocks); return blocks;
}
export function buildCrNoteModal(crId: string, decision: "approve" | "reject", channelId?: string): ModalView {
  const blocks: KnownBlock[] = [{ type: "input", block_id: "cr_note", optional: true, label: text("Review note"), element: { type: "plain_text_input", action_id: "note", multiline: true, max_length: 3000 } }];
  assertBlockBudget(blocks, LIMITS.viewBlocks);
  return { type: "modal", callback_id: "cr_note_submit", private_metadata: JSON.stringify({ c: crId, decision, channelId }), title: text(decision === "approve" ? "Approve change request" : "Reject change request"), submit: text(decision === "approve" ? "Approve" : "Reject"), close: text("Cancel"), blocks };
}
