import type { App } from "@slack/bolt";
import { openTaskModal } from "./taskModal.js";
import type { TaskStatus } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { getTask, createSubtask } from "../../services/taskService.js";
import { getTaskPermissions } from "../../middleware/taskAccess.js";
import { updateTaskAsMember, archiveTaskAsMember, logTimeAsMember, addCommentAsMember, notifyAddedAssignees, TaskMutationError, type TaskPatch } from "../../services/taskMutationService.js";
import { createBlockerAsMember, attachBlockerAsMember } from "../../services/blockerMutationService.js";
import { runJson } from "../../services/ai/aiRouter.js";
import { enrichTaskPrompt, deadlineSuggestionPrompt } from "../../utils/aiPrompts.js";
import { loadingView, trunc, escapeMrkdwn } from "../views/common.js";
import { buildLogTimeModal, buildCommentModal, buildSubtaskModal, buildBlockerModal, buildDependencyModal, buildArchiveModal, parseLogTime } from "../views/taskSmallModals.js";

const drafts = new Map<string, { actorId: string; taskId: string; patch: TaskPatch; expires: number }>();
async function reply(ctx: any, text: string, blocks?: any[]) {
  if (ctx.respond) { await ctx.respond({ response_type: "ephemeral", text, blocks }); return; }
  const channel = ctx.body.channel?.id ?? (await ctx.client.conversations.open({ users: ctx.body.user.id })).channel?.id;
  if (channel) await ctx.client.chat.postEphemeral({ channel, user: ctx.body.user.id, text, blocks });
}
async function member(ctx: any) {
  const actor = await prisma.member.findUnique({ where: { slackId: ctx.body.user.id } });
  if (!actor) await reply(ctx, `Sign in to Constellation first: ${(process.env.FRONTEND_URL ?? "http://localhost:3000").replace(/\/+$/, "")}/clubpm/login`);
  return actor;
}
async function editable(actorId: string, taskId: string) {
  const task = await getTask(taskId);
  if (!task) throw new TaskMutationError(404, "Task not found");
  if (!(await getTaskPermissions(actorId, taskId)).canEdit) throw new TaskMutationError(403, "You cannot edit this task");
  return task;
}
async function fail(ctx: any, error: unknown) { await reply(ctx, `❌ ${error instanceof Error ? error.message : "Unable to update task"}`); }
function payload(action: any) { return JSON.parse(action.selected_option?.value ?? action.value ?? "{}"); }

export function registerTaskCardActions(app: App): void {
  for (const id of ["tc_status", "tc_done", "tc_assign_me", "tc_log_time", "tc_more"]) {
    app.action(id, async (ctx) => {
      await ctx.ack();
      let opened: Awaited<ReturnType<typeof ctx.client.views.open>> | null = null;
      try {
        const p = payload(ctx.action);
        if (!p.t) return;
        // Modal trigger IDs expire before database/AI work; open a loading view first.
        const operation = id === "tc_log_time" ? "log_time" : p.a;
        const needsModal = id === "tc_log_time" || id === "tc_more" && !["enrich", "deadline"].includes(operation);
        opened = needsModal ? await ctx.client.views.open({ trigger_id: (ctx.body as any).trigger_id, view: loadingView("Task") }) : null;
        const actor = await member(ctx);
        if (!actor) { if (opened?.view?.id) await ctx.client.views.update({ view_id: opened.view.id, hash: opened.view.hash, view: { ...loadingView("Sign in"), blocks: [{ type: "section", text: { type: "mrkdwn", text: `Sign in to Constellation first: ${process.env.FRONTEND_URL ?? "http://localhost:3000"}/clubpm/login` } }] } }); return; }
        const task = operation === "archive" ? await getTask(p.t) : await editable(actor.id, p.t);
        if (!task) throw new TaskMutationError(404, "Task not found");
        if (operation === "archive" && !(await getTaskPermissions(actor.id, p.t)).canArchive) throw new TaskMutationError(403, "You cannot archive this task");
        if (id === "tc_status") {
          if (!["TODO", "IN_PROGRESS", "BLOCKED", "DONE"].includes(p.s)) throw new TaskMutationError(400, "Invalid task status");
          await updateTaskAsMember(actor.id, p.t, { status: p.s as TaskStatus }, "SLACK");
        } else if (id === "tc_done") await updateTaskAsMember(actor.id, p.t, { status: "DONE" }, "SLACK");
        else if (id === "tc_assign_me") await updateTaskAsMember(actor.id, p.t, { assigneeIds: [...new Set([...task.assignees.map(a => a.id), actor.id])] }, "SLACK");
        else if (operation === "edit") {
          await openTaskModal(ctx.client, (ctx.body as any).trigger_id, {
            memberId: actor.id, isAdmin: actor.isAdmin, taskId: p.t, openedView: opened?.view,
          });
        } else if (operation === "enrich" || operation === "deadline") {
          const today = new Date().toISOString().split("T")[0];
          const project = await prisma.project.findUnique({ where: { id: task.projectId }, select: { type: true, targetDate: true } });
          const prompt = operation === "enrich" ? enrichTaskPrompt(task.title, task.description ?? "", project?.type ?? "engineering") : deadlineSuggestionPrompt(task.title, task.description ?? "", task.storyPoints ?? null, 10, project?.targetDate?.toISOString().split("T")[0] ?? null, today);
          const result = await runJson<any>({ memberId: actor.id }, "medium", { prompt, json: true, maxOutputTokens: 2048 });
          if (!result) throw new Error("AI suggestion failed");
          const patch: TaskPatch = operation === "enrich" ? { description: result.description } : { dueDate: result.suggestedDueDate };
          if (operation === "enrich" ? typeof patch.description !== "string" || !patch.description.trim() : !/^\d{4}-\d{2}-\d{2}$/.test(patch.dueDate ?? "") || !Number.isFinite(new Date(patch.dueDate!).getTime())) throw new Error("AI returned an invalid suggestion");
          for (const [key, draft] of drafts) if (draft.expires < Date.now()) drafts.delete(key);
          const key = crypto.randomUUID();
          drafts.set(key, { actorId: actor.id, taskId: p.t, patch, expires: Date.now() + 30 * 60_000 });
          const text = trunc(escapeMrkdwn(operation === "enrich" ? result.description : `${result.suggestedDueDate}\n${result.reasoning ?? ""}`), 2900);
          await reply(ctx, text, [{ type: "section", text: { type: "mrkdwn", text } }, { type: "actions", elements: [{ type: "button", action_id: "tc_apply_ai", text: { type: "plain_text", text: "Apply" }, style: "primary", value: key }] }]);
        } else {
          const view = operation === "log_time" ? buildLogTimeModal(p.t) : operation === "comment" ? buildCommentModal(p.t) : operation === "subtask" ? buildSubtaskModal(p.t) : operation === "dependency" ? buildDependencyModal(p.t) : operation === "archive" ? buildArchiveModal(p.t) : operation === "blocker" ? buildBlockerModal(p.t, await prisma.blocker.findMany({ where: { projectId: task.projectId, resolvedAt: null }, select: { id: true, label: true }, take: 100 })) : null;
          if (!view) throw new Error("Unknown task action");
          if (opened?.view?.id) await ctx.client.views.update({ view_id: opened.view.id, hash: opened.view.hash, view });
        }
      } catch (error) {
        if (opened?.view?.id) await ctx.client.views.update({ view_id: opened.view.id, hash: opened.view.hash, view: { ...loadingView("Task"), blocks: [{ type: "section", text: { type: "mrkdwn", text: trunc(`❌ ${escapeMrkdwn(error instanceof Error ? error.message : "Unable to update task")}`, 3000) } }] } });
        await fail(ctx, error);
      }
    });
  }
  app.action("tc_apply_ai", async ctx => {
    await ctx.ack();
    try {
      const actor = await member(ctx); if (!actor) return;
      const key = (ctx.action as any).value; const draft = drafts.get(key);
      if (!draft || draft.expires < Date.now() || draft.actorId !== actor.id) throw new Error("This suggestion expired; request it again");
      await updateTaskAsMember(actor.id, draft.taskId, draft.patch, "SLACK"); drafts.delete(key);
      await reply(ctx, "✅ Applied suggestion");
    } catch (error) { await fail(ctx, error); }
  });
  for (const kind of ["log_time", "comment", "subtask", "blocker", "dependency", "archive"]) app.view(`ts_${kind}`, async ctx => {
    const values = ctx.view.state.values;
    const text = (id: string) => values[id]?.value?.value?.trim() ?? "";
    const hours = text("ts_hours"), minutes = text("ts_minutes");
    const duration = hours ? `${hours}h ${minutes ? `${minutes}m` : ""}` : minutes;
    const errors: Record<string, string> = {};
    if (kind === "log_time") { try { parseLogTime(duration); } catch { errors.ts_minutes = "Enter positive hours and/or minutes"; } }
    if (kind === "comment" && !text("ts_comment")) errors.ts_comment = "Comment is required";
    if (kind === "subtask" && !text("ts_title")) errors.ts_title = "Title is required";
    if (kind === "blocker" && !values.ts_blocker?.value?.selected_option?.value && !text("ts_label")) errors.ts_label = "Select a blocker or enter a new label";
    if (kind === "dependency" && !values.ts_dependency?.ts_dep_task?.selected_option?.value) errors.ts_dependency = "Select a task";
    if (Object.keys(errors).length) { await ctx.ack({ response_action: "errors", errors }); return; }
    let acknowledged = false;
    try {
      const slackId = kind === "subtask" ? values.ts_assignee?.value?.selected_user : null;
      const assignee = slackId ? await prisma.member.findUnique({ where: { slackId } }) : null;
      if (slackId && !assignee) { await ctx.ack({ response_action: "errors", errors: { ts_assignee: "The selected assignee must sign in to Constellation first" } }); return; }
      await ctx.ack(); acknowledged = true;
      const actor = await member(ctx); if (!actor) return;
      const { t } = JSON.parse(ctx.view.private_metadata); const task = kind === "archive" ? await getTask(t) : await editable(actor.id, t);
      if (!task) throw new TaskMutationError(404, "Task not found");
      if (kind === "log_time") {
        await logTimeAsMember(actor.id, t, parseLogTime(duration), text("ts_note") || undefined, "SLACK");
      } else if (kind === "comment") await addCommentAsMember(actor.id, t, text("ts_comment"), { source: "SLACK" });
      else if (kind === "subtask") {
        const ids = assignee ? [assignee.id] : [];
        const subtask = await createSubtask(t, { title: text("ts_title"), assigneeIds: ids });
        await notifyAddedAssignees({ taskId: subtask.id, actorId: actor.id, addedAssigneeIds: ids });
      } else if (kind === "blocker") {
        let blockerId = values.ts_blocker?.value?.selected_option?.value;
        if (!blockerId && text("ts_label")) blockerId = (await createBlockerAsMember(actor.id, task.projectId, { label: text("ts_label") }, "SLACK")).id;
        if (!blockerId) throw new Error("Select an existing blocker or enter a new label");
        await attachBlockerAsMember(actor.id, t, { blockerId, reason: text("ts_reason") || null }, "SLACK");
      } else if (kind === "dependency") {
        const id = values.ts_dependency?.ts_dep_task?.selected_option?.value;
        if (!id || id === t) throw new Error("Select another task");
        const other = await prisma.task.findFirst({ where: { id, projectId: task.projectId, archivedAt: null }, select: { id: true } });
        if (!other) throw new Error("Choose a task in the same project");
        const current = await prisma.taskDependency.findMany({ where: { blockedTaskId: t }, select: { blockingTaskId: true, reason: true } });
        await updateTaskAsMember(actor.id, t, { blockingTaskIds: [...new Set([...current.map(d => d.blockingTaskId), id])], blockingTaskReasons: { ...Object.fromEntries(current.map(d => [d.blockingTaskId, d.reason])), [id]: text("ts_reason") || null } }, "SLACK");
      } else {
        const result = await archiveTaskAsMember(actor.id, t, "SLACK");
        if (result.dependencyWarnings.length) await reply(ctx, `Archived. ${result.dependencyWarnings.length} active tasks still depend on it.`);
      }
    } catch (error) { if (!acknowledged) await ctx.ack(); await fail(ctx, error); }
  });
  app.options("ts_dep_task", async ctx => {
    try {
      const actor = await prisma.member.findUnique({ where: { slackId: ctx.body.user.id } });
      if (!actor) { await ctx.ack({ options: [] }); await reply(ctx, `Sign in to Constellation first: ${process.env.FRONTEND_URL ?? "http://localhost:3000"}/clubpm/login`); return; }
      const { t } = JSON.parse(ctx.body.view?.private_metadata ?? "{}");
      const task = await editable(actor.id, t);
      const tasks = await prisma.task.findMany({ where: { projectId: task.projectId, id: { not: t }, archivedAt: null, title: { contains: ctx.options.value ?? "", mode: "insensitive" } }, select: { id: true, title: true }, orderBy: { title: "asc" }, take: 100 });
      await ctx.ack({ options: tasks.map(row => ({ text: { type: "plain_text", text: trunc(row.title, 75) }, value: row.id })) });
    } catch { await ctx.ack({ options: [] }); }
  });
}
