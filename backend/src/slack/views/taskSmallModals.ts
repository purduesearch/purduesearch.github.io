import type { InputBlock, ModalView, KnownBlock } from "@slack/types";
import { assertBlockBudget, LIMITS, trunc } from "./common.js";

const plain = (text: string) => ({ type: "plain_text" as const, text });
function input(id: string, label: string, multiline = false, optional = false): InputBlock {
  return { type: "input", block_id: id, label: plain(label), optional,
    element: { type: "plain_text_input", action_id: "value", multiline } };
}
function modal(taskId: string, kind: string, title: string, blocks: KnownBlock[], submit = "Save"): ModalView {
  assertBlockBudget(blocks, LIMITS.viewBlocks);
  return { type: "modal", callback_id: `ts_${kind}`, private_metadata: JSON.stringify({ t: taskId }),
    title: plain(title), submit: plain(submit), close: plain("Cancel"), blocks };
}
export function buildLogTimeModal(t: string): ModalView {
  return modal(t, "log_time", "Log time", [input("ts_hours", "Hours", false, true), input("ts_minutes", "Minutes", false, true), input("ts_note", "Note", true, true)]);
}
export function parseLogTime(value: string): number {
  const text = value.trim().toLowerCase();
  const match = /^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+(?:\.\d+)?)\s*m)?$/.exec(text);
  const minutes = /^\d+(?:\.\d+)?$/.test(text) ? Number(text) : match && (match[1] || match[2]) ? Number(match[1] || 0) * 60 + Number(match[2] || 0) : NaN;
  if (!Number.isFinite(minutes) || minutes <= 0 || !Number.isSafeInteger(Math.round(minutes))) throw new Error("Enter a positive duration, such as 1h 30m or 90.");
  return Math.max(1, Math.round(minutes));
}
export function buildCommentModal(t: string): ModalView { return modal(t, "comment", "Comment", [input("ts_comment", "Comment", true)]); }
export function buildSubtaskModal(t: string): ModalView {
  return modal(t, "subtask", "Add subtask", [input("ts_title", "Title"), { type: "input", block_id: "ts_assignee", optional: true, label: plain("Assignee"), element: { type: "users_select", action_id: "value" } }]);
}
export function buildBlockerModal(t: string, blockers: { id: string; label: string }[]): ModalView {
  const blocks: KnownBlock[] = [];
  if (blockers.length) blocks.push({ type: "input", block_id: "ts_blocker", optional: true, label: plain("Existing blocker"), element: { type: "static_select", action_id: "value", options: blockers.slice(0, 100).map(b => ({ text: plain(trunc(b.label, 75)), value: b.id })) } });
  blocks.push(input("ts_label", "Or create a new blocker", false, true), input("ts_reason", "Reason", true, true));
  return modal(t, "blocker", "Add blocker", blocks);
}
export function buildDependencyModal(t: string): ModalView {
  return modal(t, "dependency", "Add dependency", [{ type: "input", block_id: "ts_dependency", label: plain("Blocked by task"), element: { type: "external_select", action_id: "ts_dep_task", min_query_length: 0, placeholder: plain("Search project tasks") } }, input("ts_reason", "Reason", true, true)]);
}
export function buildArchiveModal(t: string): ModalView {
  return modal(t, "archive", "Archive task", [{ type: "section", text: { type: "mrkdwn", text: "Archive this task? It will be hidden from active work. You can restore it in Constellation." } }], "Archive");
}
