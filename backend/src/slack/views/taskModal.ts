import type { Priority, TaskStatus } from "@prisma/client";
import type { InputBlock, InputBlockElement, KnownBlock, ModalView, PlainTextOption } from "@slack/types";
import { assertBlockBudget, escapeMrkdwn, LIMITS, trunc } from "./common.js";

export type Opt = PlainTextOption & { value: string };
export interface TaskFormValue {
  type: string; value?: string | null; selected_option?: { value: string } | null;
  selected_options?: { value: string }[] | null; selected_users?: string[] | null; selected_date?: string | null;
}
export type ViewStateValues = Record<string, Record<string, TaskFormValue>>;
export type TaskSection = "subtasks" | "deps" | "links" | "meta" | "estimate";
export interface TaskModalState {
  mode: "create" | "edit"; taskId?: string; projectLocked: boolean; sections: TaskSection[]; subtaskRows: number;
  initial: {
    title?: string; description?: string; projectId?: string; assigneeSlackIds?: string[]; dueDate?: string;
    priority?: Priority; status?: TaskStatus; tagIds?: string[]; milestoneId?: string; parentTaskId?: string;
    estimatedHours?: number; storyPoints?: number; recurrence?: string; recurrenceEnd?: string;
    blockerIds?: string[]; dependencyTaskIds?: string[]; links?: string; subtasks?: string[];
  };
  options: { projects: Opt[]; tags: Opt[]; milestones: Opt[]; blockers: Opt[] };
}
export interface TaskModalMetadata {
  mode: "create" | "edit"; taskId?: string; projectLocked: boolean; sections: TaskSection[]; subtaskRows: number; projectId?: string;
}
export type ParsedTaskForm = TaskModalState["initial"] & {
  title: string; projectId: string; assigneeSlackIds: string[]; newBlocker?: string;
  attachments: { url: string; label?: string }[]; subtasks: string[];
};

const text = (value: string) => ({ type: "plain_text" as const, text: value });
const option = (value: string, label = value): Opt => ({ text: text(trunc(label, 75) || "Untitled"), value });
const sections: { value: TaskSection; label: string }[] = [
  { value: "subtasks", label: "+ Subtasks" }, { value: "deps", label: "+ Blockers & dependencies" },
  { value: "links", label: "+ Links & files" }, { value: "meta", label: "+ Milestone & tags" },
  { value: "estimate", label: "+ Estimate & repeat" },
];
const priorities = [option("LOW", "Low"), option("MEDIUM", "Medium"), option("HIGH", "High"), option("CRITICAL", "Critical")];
const statuses = [option("TODO", "To do"), option("IN_PROGRESS", "In progress"), option("BLOCKED", "Blocked"), option("DONE", "Done")];
const repeats = [option("NONE", "Does not repeat"), option("DAILY", "Daily"), option("WEEKLY", "Weekly"), option("BIWEEKLY", "Biweekly"), option("MONTHLY", "Monthly")];
const rowCount = (n: number) => Math.min(10, Math.max(1, Math.floor(Number.isFinite(n) ? n : 1)));
const optionsFor = (opts: Opt[]) => opts.slice(0, 100).map(o => ({ ...o, text: text(trunc(o.text.text ?? "", 75) || "Untitled") }));

export function buildTaskModal(state: TaskModalState): ModalView {
  const blocks: KnownBlock[] = [];
  const initial = state.initial;
  const input = (id: string, label: string, element: InputBlockElement, optional = true, dispatch = false) => {
    const block: InputBlock = { type: "input", block_id: id, label: text(label), optional, element };
    if (dispatch) block.dispatch_action = true;
    blocks.push(block);
  };
  const plain = (id: string, action: string, label: string, value?: string, multiline = false, required = false, max?: number) =>
    input(id, label, { type: "plain_text_input", action_id: action, multiline,
      ...(value ? { initial_value: value.slice(0, max ?? 3000) } : {}), ...(max ? { max_length: max } : {}) }, !required);
  const select = (id: string, action: string, label: string, opts: Opt[], selected?: string, required = false, dispatch = false) => {
    const options = optionsFor(opts);
    const chosen = options.find(o => o.value === selected);
    input(id, label, { type: "static_select", action_id: action, options: options.length ? options : [option("none", "None available")],
      ...(chosen ? { initial_option: chosen } : {}) }, !required, dispatch);
  };
  const multi = (id: string, action: string, label: string, opts: Opt[], selected: string[] = []) => {
    const options = optionsFor(opts);
    const chosen = options.filter(o => selected.includes(o.value));
    input(id, label, { type: "multi_static_select", action_id: action, options: options.length ? options : [option("none", "None available")],
      ...(chosen.length ? { initial_options: chosen } : {}) });
  };
  const date = (id: string, action: string, label: string, value?: string) =>
    input(id, label, { type: "datepicker", action_id: action, ...(value ? { initial_date: value.slice(0, 10) } : {}) });
  plain("title_block", "title", "Title", initial.title, false, true, 200);
  plain("description_block", "description", "Description", initial.description, true);
  blocks.push({ type: "actions", block_id: "tm_ai_actions", elements: [{ type: "button", action_id: "tm_ai_draft", text: text("Draft details with AI"), value: "draft" }] });
  if (state.projectLocked) {
    const project = state.options.projects.find(o => o.value === initial.projectId);
    blocks.push({ type: "section", block_id: "project_block", text: { type: "mrkdwn", text: `*Project:* ${escapeMrkdwn(project?.text.text ?? initial.projectId ?? "No project selected")}` } });
  } else select("project_block", "project", "Project", state.options.projects, initial.projectId, true, true);
  input("assignee_block", "Assignees", { type: "multi_users_select", action_id: "assignees",
    ...(initial.assigneeSlackIds?.length ? { initial_users: initial.assigneeSlackIds } : {}) });
  date("due_date_block", "due_date", "Due date", initial.dueDate);
  select("priority_block", "priority", "Priority", priorities, initial.priority ?? "MEDIUM", true);
  if (state.mode === "edit") select("status_block", "status", "Status", statuses, initial.status ?? "TODO", true);
  if (state.sections.includes("subtasks")) {
    const count = rowCount(state.subtaskRows);
    for (let n = 0; n < count; n++) plain(`tm_sub_${n}`, "tm_subtask", `Subtask ${n + 1}`, initial.subtasks?.[n], false, false, 200);
    if (count < 10) blocks.push({ type: "actions", block_id: "tm_sub_actions", elements: [{ type: "button", action_id: "tm_add_sub", text: text("+ Add another subtask"), value: "add" }] });
  }
  if (state.sections.includes("deps")) {
    multi("blockers_block", "blockers", "Existing blockers", state.options.blockers, initial.blockerIds);
    plain("new_blocker_block", "new_blocker", "New blocker label");
    input("dependency_tasks_block", "Dependency tasks", { type: "multi_external_select", action_id: "tm_dep_tasks", min_query_length: 0,
      ...(initial.dependencyTaskIds?.length ? { initial_options: initial.dependencyTaskIds.slice(0, 100).map(id => option(id)) } : {}) });
    input("parent_task_block", "Parent task", { type: "external_select", action_id: "tm_parent", min_query_length: 0,
      ...(initial.parentTaskId ? { initial_option: option(initial.parentTaskId) } : {}) });
  }
  if (state.sections.includes("links")) plain("links_block", "links", "Links & files (URL or label | URL, one per line)", initial.links, true);
  if (state.sections.includes("meta")) {
    select("milestone_block", "milestone", "Milestone", state.options.milestones, initial.milestoneId);
    multi("tags_block", "tags", "Tags", state.options.tags, initial.tagIds);
  }
  if (state.sections.includes("estimate")) {
    plain("estimated_hours_block", "estimated_hours", "Estimated hours", initial.estimatedHours?.toString());
    plain("story_points_block", "story_points", "Story points", initial.storyPoints?.toString());
    select("recurrence_block", "recurrence", "Recurring", repeats, initial.recurrence ?? "NONE");
    date("recurrence_end_block", "recurrence_end", "Repeat until", initial.recurrenceEnd);
  }
  blocks.push({ type: "context", block_id: "tm_sections_context", elements: [{ type: "mrkdwn", text: "Add more to this task" }] });
  const hidden = sections.filter(s => !state.sections.includes(s.value));
  // Each button has its own stable block because Slack action IDs must be unique within a block.
  for (const section of hidden) blocks.push({ type: "actions", block_id: `tm_reveal_${section.value}`, elements: [
    { type: "button", action_id: "tm_section", text: text(section.label), value: section.value },
  ] });
  assertBlockBudget(blocks, LIMITS.viewBlocks);
  const meta: TaskModalMetadata = { mode: state.mode, taskId: state.taskId, projectLocked: state.projectLocked,
    sections: state.sections, subtaskRows: rowCount(state.subtaskRows), projectId: initial.projectId };
  return { type: "modal", title: text(state.mode === "create" ? "Create task" : "Edit task"), close: text("Cancel"),
    submit: text(state.mode === "create" ? "Create" : "Save"), callback_id: "task_modal_submit", private_metadata: JSON.stringify(meta), blocks };
}

export function parseTaskModal(values: ViewStateValues, meta: TaskModalMetadata): { input: ParsedTaskForm; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const field = (block: string, action: string) => values[block]?.[action];
  const value = (block: string, action: string) => field(block, action)?.value?.trim() || undefined;
  const clean = (v?: string) => v && v !== "none" && v !== "NONE" ? v : undefined;
  const selected = (block: string, action: string) => clean(field(block, action)?.selected_option?.value);
  const multiple = (block: string, action: string) => (field(block, action)?.selected_options ?? []).map(o => o.value).filter(v => clean(v));
  const numeric = (block: string, action: string) => {
    const raw = value(block, action);
    const n = raw === undefined ? NaN : Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };
  const title = value("title_block", "title") ?? "";
  if (!title) errors.title_block = "Enter a title.";
  else if (title.length > 200) errors.title_block = "Keep the title within 200 characters.";
  const projectId = (meta.projectLocked ? clean(meta.projectId) : selected("project_block", "project")) ?? "";
  if (!projectId) errors.project_block = "Select a project.";
  const links = value("links_block", "links");
  const attachments = (links ?? "").split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
    const split = line.indexOf("|");
    return split < 0 ? { url: line } : { label: line.slice(0, split).trim() || undefined, url: line.slice(split + 1).trim() };
  });
  if (attachments.some(a => { try { return !["https:", "http:"].includes(new URL(a.url).protocol); } catch { return true; } }))
    errors.links_block = "Enter an http or https URL on each line.";
  const subtasks: string[] = [];
  if (meta.sections.includes("subtasks")) for (let n = 0; n < rowCount(meta.subtaskRows); n++) {
    const sub = value(`tm_sub_${n}`, "tm_subtask");
    if (sub) subtasks.push(sub);
  }
  const input: ParsedTaskForm = {
    title, projectId, description: value("description_block", "description"),
    assigneeSlackIds: field("assignee_block", "assignees")?.selected_users ?? [],
    dueDate: field("due_date_block", "due_date")?.selected_date ?? undefined,
    priority: (selected("priority_block", "priority") ?? "MEDIUM") as Priority,
    ...(meta.mode === "edit" ? { status: (selected("status_block", "status") ?? "TODO") as TaskStatus } : {}),
    tagIds: multiple("tags_block", "tags").slice(0, 5), milestoneId: selected("milestone_block", "milestone"),
    parentTaskId: selected("parent_task_block", "tm_parent"), blockerIds: multiple("blockers_block", "blockers"),
    newBlocker: value("new_blocker_block", "new_blocker"), dependencyTaskIds: multiple("dependency_tasks_block", "tm_dep_tasks"),
    estimatedHours: numeric("estimated_hours_block", "estimated_hours"), storyPoints: numeric("story_points_block", "story_points"),
    recurrence: selected("recurrence_block", "recurrence"), recurrenceEnd: field("recurrence_end_block", "recurrence_end")?.selected_date ?? undefined,
    links, attachments, subtasks,
  };
  return { input, errors };
}
