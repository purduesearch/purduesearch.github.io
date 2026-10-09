import type { ModalView } from "@slack/types";
import { assertBlockBudget, trunc } from "./common.js";

const plain = (text: string) => ({ type: "plain_text" as const, text });
export function buildAddToTask(sessionId: string, messageText: string): ModalView {
  const view: ModalView = {
    type: "modal", callback_id: "att_submit", private_metadata: sessionId,
    title: plain("Add to task"), submit: plain("Add"), close: plain("Cancel"),
    blocks: [
      { type: "section", text: plain(trunc(messageText, 3000) || "Slack message with files") },
      { type: "input", block_id: "att_task_block", label: plain("Task"), element: { type: "external_select", action_id: "att_task", min_query_length: 0, placeholder: plain("Find a task") } },
      { type: "input", block_id: "att_mode_block", label: plain("Add as"), element: { type: "radio_buttons", action_id: "att_mode", options: [
        { text: plain("Comment"), value: "comment" }, { text: plain("Link only"), value: "link" },
      ], initial_option: { text: plain("Comment"), value: "comment" } } },
      { type: "input", optional: true, block_id: "att_files_block", label: plain("Files"), element: { type: "checkboxes", action_id: "att_files", options: [{ text: plain("Include files"), value: "include" }] } },
    ],
  };
  assertBlockBudget(view.blocks, 100);
  return view;
}
