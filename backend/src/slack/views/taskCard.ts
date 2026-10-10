import type { KnownBlock, ActionsBlock, PlainTextOption } from "@slack/types";
import type { Priority, TaskStatus } from "@prisma/client";
import { LIMITS, assertBlockBudget, escapeMrkdwn, memberRef, priorityDot, progressBar, relativeDue, statusPill, taskUrl, trunc } from "./common.js";

export type CardTask = {
  id: string; title: string; status: TaskStatus; priority: Priority; dueDate: Date | null;
  projectId: string; project: { name: string };
  assignees: { id: string; slackId: string | null; displayName: string }[];
  milestone: { title: string; dueDate: Date | null } | null;
  subtaskCounts: { done: number; total: number }; blockedByOpen: number;
  categoryBlockers: string[]; loggedMinutes: number;
};
export type CardViewer = { memberId: string; isAssignee: boolean; canEdit: boolean };
const plain = (text: string) => ({ type: "plain_text" as const, text });
const mrkdwn = (text: string) => ({ type: "mrkdwn" as const, text: trunc(text, LIMITS.sectionText) });
const dateLabel = (date: Date) => date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

export function buildTaskCardBlocks(task: CardTask, viewer: CardViewer, now: Date = new Date()): KnownBlock[] {
  const fields = [mrkdwn(`*Status*\n${statusPill(task.status)}`),
    mrkdwn(`*Assignees*\n${task.assignees.map(memberRef).join(" ") || "Unassigned"}`),
    mrkdwn(`*Due*\n${task.dueDate ? `${dateLabel(task.dueDate)} · ${relativeDue(task.dueDate, now)}` : "No due date"}`),
    mrkdwn(`*Priority*\n${priorityDot(task.priority)} ${task.priority[0]}${task.priority.slice(1).toLowerCase()}`)];
  if (task.milestone) fields.push(mrkdwn(`*Milestone*\n${escapeMrkdwn(task.milestone.title)}${task.milestone.dueDate ? ` · ${dateLabel(task.milestone.dueDate)}` : ""}`));
  if (task.subtaskCounts.total) fields.push(mrkdwn(`*Subtasks*\n${progressBar(task.subtaskCounts.done, task.subtaskCounts.total)}`));
  const blockers = [task.blockedByOpen > 0 ? `Blocked by ${task.blockedByOpen} task${task.blockedByOpen === 1 ? "" : "s"}` : "",
    task.categoryBlockers.length ? `Blocked: ${task.categoryBlockers.map(escapeMrkdwn).join(", ")}` : ""].filter(Boolean).join(" · ") || "Not blocked";
  const hours = Math.floor(task.loggedMinutes / 60), minutes = task.loggedMinutes % 60;
  const logged = `${hours ? `${hours}h ` : ""}${minutes || !hours ? `${minutes}m ` : ""}logged`;
  const blocks: KnownBlock[] = [
    { type: "header", text: plain(trunc(task.title, 100)) },
    { type: "section", fields },
    { type: "context", elements: [mrkdwn(trunc(`${blockers} · ${logged}`, 1500)), mrkdwn(`<${taskUrl(task.projectId, task.id)}|Open in Constellation>`)] },
  ];
  const value = JSON.stringify({ t: task.id });
  const elements: ActionsBlock["elements"] = [];
  if (viewer.canEdit) {
    const statuses: TaskStatus[] = ["TODO", "IN_PROGRESS", "BLOCKED", "DONE"];
    const options: PlainTextOption[] = statuses.map(s => ({ text: plain(statusPill(s)), value: JSON.stringify({ t: task.id, s }) }));
    elements.push({ type: "static_select", action_id: "tc_status", placeholder: plain("Status"), options, initial_option: options[statuses.indexOf(task.status)] });
    if (task.status !== "DONE") elements.push({ type: "button", action_id: "tc_done", text: plain("Mark done"), style: "primary", value });
    if (!viewer.isAssignee) elements.push({ type: "button", action_id: "tc_assign_me", text: plain("Assign me"), value });
    elements.push({ type: "button", action_id: "tc_log_time", text: plain("Log time"), value });
    elements.push({ type: "static_select", action_id: "tc_more", placeholder: plain("More"), options:
      [["edit", "Edit"], ["subtask", "Add subtask"], ["blocker", "Add blocker"], ["dependency", "Add dependency"], ["comment", "Comment"], ["enrich", "AI enrich"], ["deadline", "Suggest deadline"], ["archive", "Archive"]]
        .map(([a, label]) => ({ text: plain(label), value: JSON.stringify({ t: task.id, a }) })) });
  }
  if (elements.length) blocks.push({ type: "actions", elements });
  assertBlockBudget(blocks, LIMITS.messageBlocks);
  return blocks;
}

export function buildCompactTaskLine(task: CardTask): string {
  return `• ${escapeMrkdwn(trunc(task.title, 100))}${task.dueDate ? ` · due ${dateLabel(task.dueDate)}` : ""} · <${taskUrl(task.projectId, task.id)}|Open>`;
}

export function buildTaskBundle(recipientName: string, actorNames: string[], tasks: CardTask[], viewerFor: (task: CardTask) => CardViewer, now: Date = new Date()): { text: string; blocks: KnownBlock[] } {
  const actors = [...new Set(actorNames)];
  const count = tasks.length;
  const heading = actors.length === 1 ? `${escapeMrkdwn(actors[0])} assigned you ${count} task${count === 1 ? "" : "s"}` : `You have ${count} new tasks`;
  const blocks: KnownBlock[] = [{ type: "section", text: mrkdwn(`*${heading}*`) }, { type: "divider" }];
  tasks.slice(0, 5).forEach((task, index) => {
    if (index) blocks.push({ type: "divider" });
    blocks.push(...buildTaskCardBlocks(task, viewerFor(task), now));
  });
  if (count > 5) {
    const lines: string[] = [];
    let remaining = count - 5;
    for (const task of tasks.slice(5)) {
      const line = buildCompactTaskLine(task);
      if ([...lines, line].join("\n").length > LIMITS.sectionText - 100) break;
      lines.push(line); remaining--;
    }
    if (remaining) lines.push(`+${remaining} more tasks — open My work`);
    blocks.push({ type: "section", text: mrkdwn(lines.join("\n")) }, { type: "actions", elements: [{ type: "button", action_id: "tc_my_work", text: plain("Open my work"), url: `${(process.env.FRONTEND_URL ?? "http://localhost:3000").replace(/\/+$/, "")}/clubpm`, accessibility_label: trunc(`Open ${recipientName}'s work`, 75) }] });
  }
  assertBlockBudget(blocks, LIMITS.messageBlocks);
  return { text: `${count} new tasks assigned to you`, blocks };
}
