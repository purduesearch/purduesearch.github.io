import type { ModalView } from "@slack/types";
import type { ActionPlanAction, ActionExecutionResult, ActionType } from "../../services/aiActionService.js";
import { assertBlockBudget, trunc } from "./common.js";

const LABELS: Record<ActionType, string> = {
  CREATE_TASK: "Create task", UPDATE_TASK: "Update task", DELETE_TASK: "Delete task",
  SET_STATUS: "Set status", SET_PRIORITY: "Set priority", SET_DUE: "Set due", ASSIGN: "Assign",
  CREATE_SUBTASK: "Create subtask", ADD_DEPENDENCY: "Add dependency", ATTACH_BLOCKER: "Attach blocker",
  RESOLVE_BLOCKER: "Resolve blocker", ADD_COMMENT: "Add comment", CREATE_MILESTONE: "Create milestone",
  LINK_MILESTONE: "Link milestone",
};
export function actionLabel(type: ActionType): string { return LABELS[type]; }
const escaped = (value: unknown): string => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const plain = (text: string) => ({ type: "plain_text" as const, text });
const context = (text: string) => ({ type: "context" as const, elements: [{ type: "mrkdwn" as const, text: trunc(text, 3000) }] });

export function summarizeAction(action: ActionPlanAction, taskTitles: Map<string, string>): string {
  const p = action.params;
  const task = taskTitles.get(action.targetTaskId ?? "") ?? action.targetTaskId ?? "Task";
  const titleFor = (id: unknown) => taskTitles.get(String(id)) ?? String(id ?? "");
  switch (action.type) {
    case "CREATE_TASK": case "CREATE_MILESTONE": return String(p.title ?? "Untitled");
    case "CREATE_SUBTASK": return `${task} → ${p.title ?? "Untitled"}`;
    case "SET_DUE": {
      const date = p.dueDate ? new Date(p.dueDate) : null;
      return `${task} → ${date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "No due date"}`;
    }
    case "SET_STATUS": return `${task} → ${String(p.status ?? "").replace(/_/g, " ").toLowerCase()}`;
    case "SET_PRIORITY": return `${task} → ${String(p.priority ?? "").toLowerCase()}`;
    case "ASSIGN": return `${task} → ${(p.assigneeIds ?? []).join(", ") || "Unassigned"}`;
    case "ADD_DEPENDENCY": return `${task} ← ${titleFor(p.blockingTaskId)}`;
    case "ATTACH_BLOCKER": return `${task} → ${p.blockerId ?? "Blocker"}`;
    case "RESOLVE_BLOCKER": return String(p.blockerId ?? "Blocker");
    case "ADD_COMMENT": return `${task}: ${p.content ?? ""}`;
    case "LINK_MILESTONE": return `${p.milestoneId ?? "Milestone"} → ${(p.taskIds ?? (action.targetTaskId ? [action.targetTaskId] : [])).map(titleFor).join(", ")}`;
    case "UPDATE_TASK": return `${task}${p.title ? ` → ${p.title}` : ""}`;
    case "DELETE_TASK": return task;
  }
}

export interface PlanModalInput {
  sessionId: string;
  goal: string;
  actions: ActionPlanAction[];
  decisions: Record<string, "ACCEPTED" | "SKIPPED" | "EDITED">;
  results?: ActionExecutionResult[] | null;
  taskTitles: Map<string, string>;
}

export function buildPlanModal(input: PlanModalInput): ModalView {
  const { sessionId, actions, decisions, results, taskTitles } = input;
  const accepted = actions.filter((_, i) => decisions[i] === "ACCEPTED" || decisions[i] === "EDITED").length;
  const finished = results != null;
  const blocks: any[] = [context(`Goal: ${escaped(input.goal)}`), { type: "divider" }];
  actions.slice(0, 30).forEach((action, i) => {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: trunc(`*${i + 1} · ${actionLabel(action.type)}* ${escaped(trunc(summarizeAction(action, taskTitles), 1800))}\n_${escaped(trunc(action.rationale, 300))}_`, 3000) } });
    if (finished) {
      const result = results.find(result => result.index === i);
      blocks.push(context(result ? (result.ok ? "✓ Done" : `✕ ${escaped(result.error ?? "Action failed")}`) : "Skipped"));
      return;
    }
    const decision = decisions[i];
    blocks.push(context(decision === "ACCEPTED" ? "✓ Accepted" : decision === "SKIPPED" ? "Skipped" : decision === "EDITED" ? "✓ Edited" : "Awaiting decision"));
    blocks.push({ type: "actions", block_id: `plan_row_${i}`, elements: [
      ["Accept", "plan_accept", "ACCEPTED"], ["Skip", "plan_skip", "SKIPPED"], ["Edit", "plan_edit", "EDITED"],
    ].map(([label, action_id, state]) => ({ type: "button", text: plain(label), action_id,
      value: JSON.stringify({ s: sessionId, i }), ...(decision === state ? { style: "primary" } : {}) })) });
  });
  if (actions.length > 30) blocks.push(context(`+${actions.length - 30} more — open in Constellation`));
  if (!finished) blocks.push({ type: "actions", elements: [
    { type: "button", text: plain("Accept all"), action_id: "plan_accept_all", value: sessionId },
    { type: "button", text: plain("Discard"), action_id: "plan_discard", value: sessionId, style: "danger",
      confirm: { title: plain("Discard plan?"), text: { type: "mrkdwn", text: "Discard this plan without running any actions?" }, confirm: plain("Discard"), deny: plain("Keep reviewing") } },
  ] });
  assertBlockBudget(blocks, 100);
  return { type: "modal", callback_id: "plan_run", title: plain("Action plan"), close: plain("Close"),
    private_metadata: sessionId, blocks, ...(!finished && accepted > 0 ? { submit: plain(trunc(`Run ${accepted} accepted`, 24)) } : {}) };
}

type Field = { key: string; label: string; kind?: "list" | "date" | "long" | "priority" | "status"; required?: boolean };
const title: Field = { key: "title", label: "Title", required: true };
const description: Field = { key: "description", label: "Description", kind: "long" };
const priority: Field = { key: "priority", label: "Priority", kind: "priority" };
const due: Field = { key: "dueDate", label: "Due date", kind: "date" };
const assignees: Field = { key: "assigneeIds", label: "Assignee member IDs (one per line)", kind: "list" };
const milestone: Field = { key: "milestoneId", label: "Milestone ID" };
const reason: Field = { key: "reason", label: "Reason", kind: "long" };
const FIELDS: Record<ActionType, Field[]> = {
  CREATE_TASK: [title, description, priority, due, assignees, milestone, { key: "subtasks", label: "Subtask titles (one per line)", kind: "list" }],
  UPDATE_TASK: [{ ...title, required: false }, description, priority, due, assignees, milestone],
  DELETE_TASK: [], SET_STATUS: [{ key: "status", label: "Status", kind: "status", required: true }],
  SET_PRIORITY: [{ ...priority, required: true }], SET_DUE: [due], ASSIGN: [assignees],
  CREATE_SUBTASK: [title, assignees],
  ADD_DEPENDENCY: [{ key: "blockingTaskId", label: "Blocking task ID", required: true }, reason],
  ATTACH_BLOCKER: [{ key: "blockerId", label: "Blocker ID", required: true }, reason],
  RESOLVE_BLOCKER: [{ key: "blockerId", label: "Blocker ID", required: true }, reason],
  ADD_COMMENT: [{ key: "content", label: "Comment", kind: "long", required: true }],
  CREATE_MILESTONE: [title, due, description, { key: "ownerId", label: "Owner member ID" }],
  LINK_MILESTONE: [{ ...milestone, required: true }, { key: "taskIds", label: "Task IDs (one per line)", kind: "list" }],
};

export interface PlanEditContext { sessionId: string; taskTitles?: Map<string, string> }
export function buildPlanEditModal(index: number, action: ActionPlanAction, ctx: PlanEditContext): ModalView {
  const blocks: any[] = [context(escaped(summarizeAction(action, ctx.taskTitles ?? new Map())))];
  for (const field of FIELDS[action.type]) {
    const value = action.params[field.key];
    let element: any;
    if (field.kind === "priority" || field.kind === "status") {
      const choices = field.kind === "priority" ? ["LOW", "MEDIUM", "HIGH", "CRITICAL"] : ["TODO", "IN_PROGRESS", "BLOCKED", "DONE"];
      const options = choices.map(value => ({ text: plain(value.replace(/_/g, " ")), value }));
      element = { type: "static_select", action_id: field.key, options,
        ...(choices.includes(value) ? { initial_option: options.find(option => option.value === value) } : {}) };
    } else {
      const initial = Array.isArray(value) ? value.join("\n") : value === null ? "clear" : value === undefined ? "" : String(value);
      element = { type: "plain_text_input", action_id: field.key,
        ...(initial ? { initial_value: initial } : {}),
        ...(field.kind === "list" || field.kind === "long" ? { multiline: true } : {}),
        ...(field.kind === "date" ? { placeholder: plain("YYYY-MM-DD, or clear") } : {}) };
    }
    blocks.push({ type: "input", block_id: `pe_${field.key}`, label: plain(field.label), optional: !field.required, element });
  }
  assertBlockBudget(blocks, 100);
  return { type: "modal", callback_id: "plan_edit_submit", title: plain(trunc(`Edit ${actionLabel(action.type).toLowerCase()}`, 24)),
    submit: plain("Save"), close: plain("Cancel"), private_metadata: JSON.stringify({ s: ctx.sessionId, i: index }), blocks };
}

export interface PlanEditValue { value?: string | null; selected_option?: { value: string } | null }
export type PlanEditValues = Record<string, Record<string, PlanEditValue>>;
export function parsePlanEdit(type: ActionType, values: PlanEditValues): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  for (const field of FIELDS[type]) {
    const state = values[`pe_${field.key}`]?.[field.key];
    if (!state) continue;
    const raw = state.selected_option?.value ?? state.value ?? "";
    if (field.kind === "list") {
      const entries = raw.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
      if (entries.length || type === "ASSIGN") params[field.key] = entries;
    } else if (field.kind === "date") {
      if (raw.trim().toLowerCase() === "clear" || (!raw.trim() && type === "SET_DUE")) params[field.key] = null;
      else if (raw.trim()) {
        if (Number.isNaN(new Date(raw.trim()).getTime())) throw new Error("Enter a valid due date or clear");
        params[field.key] = raw.trim();
      }
    } else if (raw || field.required) {
      if (field.required && !raw.trim()) throw new Error(`${field.label} is required`);
      if (field.kind === "status" && !["TODO", "IN_PROGRESS", "BLOCKED", "DONE"].includes(raw)) throw new Error("Invalid status");
      if (field.kind === "priority" && !["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(raw)) throw new Error("Invalid priority");
      params[field.key] = raw;
    }
  }
  return params;
}
