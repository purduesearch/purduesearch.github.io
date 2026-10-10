import type { App } from "@slack/bolt";
import type { Priority } from "@prisma/client";
import type { CmdCtx } from "../router.js";
import { prisma } from "../../db/prisma.js";
import { parseTaskFromMessage } from "../../services/aiService.js";
import { runJson } from "../../services/ai/aiRouter.js";
import { duplicateDetectionPrompt } from "../../utils/aiPrompts.js";
import { storeAiTask, retrieveAiTask } from "../../utils/aiTaskCache.js";
import { createTaskAsMember } from "../../services/taskMutationService.js";
import { loadCardTask } from "../../services/slackCardService.js";
import { getTaskPermissions } from "../../middleware/taskAccess.js";
import { openTaskModal } from "./taskModal.js";
import { buildTaskDraft, extractSuggestedAssignees } from "../views/taskDraft.js";
import { buildTaskCardBlocks } from "../views/taskCard.js";
import { escapeMrkdwn, taskUrl, trunc } from "../views/common.js";

const drafts = new Map<string, { memberId: string; slackId: string; projectId: string; duplicateId?: string; expires: number; busy: boolean }>();
const login = () => `Sign in to Constellation first: ${(process.env.FRONTEND_URL ?? "http://localhost:3000").replace(/\/+$/, "")}/clubpm/login`;
const access = (member: { id: string; isAdmin: boolean }) => member.isAdmin ? {} : { members: { some: { memberId: member.id } } };

export async function handleTaskCommand(ctx: CmdCtx): Promise<void> {
  const text = ctx.text.replace(/^\S+\s*/, "").trim();
  if (!text) {
    await openTaskModal(ctx.client, ctx.command.trigger_id, { memberId: ctx.command.user_id, isAdmin: false, channelId: ctx.command.channel_id });
    return;
  }
  await draftTask({ text, slackId: ctx.command.user_id, channelId: ctx.command.channel_id, respond: ctx.respond });
}

export async function draftTask(ctx: { text: string; slackId: string; channelId: string; respond: (payload: any) => Promise<unknown> }): Promise<void> {
  const member = await prisma.member.findUnique({ where: { slackId: ctx.slackId } });
  if (!member) { await ctx.respond({ response_type: "ephemeral", text: login() }); return; }
  await ctx.respond({ response_type: "ephemeral", text: "Drafting…", replace_original: true });
  try {
    const project = await prisma.project.findFirst({ where: { slackChannelId: ctx.channelId, ...access(member) }, include: { members: { include: { member: true } } } });
    if (!project) throw new Error("Use /c task in a linked project channel, or /c task to choose a project.");
    const existingTasks = await prisma.task.findMany({ where: { projectId: project.id, archivedAt: null, status: { not: "DONE" } }, select: { id: true, title: true, description: true }, take: 300 });
    const parsed = await parseTaskFromMessage(ctx.text, new Date().toISOString().slice(0, 10), {
      projectName: project.name, projectDescription: project.description ?? undefined, projectType: project.type, existingTasks,
    });
    if (!parsed) throw new Error("Could not draft this task. Use /c task to enter the details yourself.");
    const duplicateResult = await runJson({ memberId: member.id }, "medium", { prompt: duplicateDetectionPrompt(parsed.title, parsed.description ?? "", existingTasks), json: true }) as any;
    const duplicate = duplicateResult?.isDuplicate ? existingTasks.find(t => t.id === duplicateResult.duplicateTaskId) : undefined;
    const suggestedAssigneeSlackIds = extractSuggestedAssignees(ctx.text, project.members.flatMap(p => p.member.slackId ? [{ slackId: p.member.slackId, displayName: p.member.displayName }] : []));
    // Never accept a model-invented parent outside the scoped task snapshot.
    if (parsed.parentTaskId && !existingTasks.some(t => t.id === parsed.parentTaskId)) delete parsed.parentTaskId;
    const key = storeAiTask({ ...parsed, channelId: ctx.channelId, suggestedAssigneeSlackIds });
    for (const [id, old] of drafts) if (old.expires < Date.now()) drafts.delete(id);
    drafts.set(key, { memberId: member.id, slackId: ctx.slackId, projectId: project.id, duplicateId: duplicate?.id, expires: Date.now() + 15 * 60_000, busy: false });
    await ctx.respond({ response_type: "ephemeral", replace_original: true, text: `Task draft: ${parsed.title}`, blocks: buildTaskDraft({ ...parsed, key, projectName: project.name, assigneeSlackIds: suggestedAssigneeSlackIds,
      duplicate: duplicate ? { title: duplicate.title, reason: typeof duplicateResult.similarityReason === "string" ? duplicateResult.similarityReason : undefined } : undefined }) });
  } catch (error) { await ctx.respond({ response_type: "ephemeral", replace_original: true, text: error instanceof Error ? error.message : "Unable to draft task." }); }
}

export async function handleFindCommand(ctx: CmdCtx): Promise<void> {
  const member = await prisma.member.findUnique({ where: { slackId: ctx.command.user_id } });
  if (!member) { await ctx.respond({ response_type: "ephemeral", text: login() }); return; }
  const query = ctx.text.replace(/^\S+\s*/, "").trim();
  if (!query) { await ctx.respond({ response_type: "ephemeral", text: "Type /c find followed by a task title." }); return; }
  const tasks = await prisma.task.findMany({ where: { archivedAt: null, project: access(member), title: { contains: query, mode: "insensitive" } }, include: { project: { select: { name: true } } }, take: 8, orderBy: { updatedAt: "desc" } });
  await ctx.respond({ response_type: "ephemeral", text: tasks.length ? `${tasks.length} matching tasks` : "No matching tasks.", blocks: tasks.map(t => ({ type: "section", text: { type: "mrkdwn", text: `<${taskUrl(t.projectId, t.id)}|${escapeMrkdwn(trunc(t.title, 160))}> · ${escapeMrkdwn(trunc(t.project.name, 120))}` }, accessory: { type: "button", action_id: "qa_show", text: { type: "plain_text", text: "Show card" }, value: t.id } })) });
}

async function showCard(ctx: any, taskId: string, member: { id: string; isAdmin: boolean }) {
  const task = await loadCardTask(taskId);
  if (!task || !await prisma.project.findFirst({ where: { id: task.projectId, ...access(member) }, select: { id: true } })) throw new Error("You cannot access this task.");
  const permissions = await getTaskPermissions(member.id, taskId);
  await ctx.respond({ response_type: "ephemeral", replace_original: false, text: task.title, blocks: buildTaskCardBlocks(task, { memberId: member.id, isAssignee: task.assignees.some(a => a.id === member.id), canEdit: permissions.canEdit }) });
}

export function registerQuickAdd(app: App): void {
  for (const id of ["qa_create", "qa_edit", "qa_existing", "qa_cancel", "qa_show"]) app.action(id, async (ctx: any) => {
    await ctx.ack();
    try {
      const key = ctx.action.value;
      // Open the loading modal inside openTaskModal before member/database work.
      if (id === "qa_edit") {
        const draft = drafts.get(key), cached = retrieveAiTask(key);
        if (!draft || !cached || draft.expires < Date.now() || draft.slackId !== ctx.body.user.id || draft.busy) throw new Error("This draft expired. Run /c task again.");
        await openTaskModal(ctx.client, ctx.body.trigger_id, { memberId: ctx.body.user.id, isAdmin: false, channelId: cached.channelId, projectId: draft.projectId,
          prefill: { ...cached, priority: cached.priority as Priority | undefined, assigneeSlackIds: cached.suggestedAssigneeSlackIds } });
        drafts.delete(key);
        await ctx.respond({ response_type: "ephemeral", replace_original: true, text: "Continue editing in the task form.", blocks: [] });
        return;
      }
      const member = await prisma.member.findUnique({ where: { slackId: ctx.body.user.id } });
      if (!member) { await ctx.respond({ response_type: "ephemeral", text: login() }); return; }
      if (id === "qa_show") { await showCard(ctx, key, member); return; }
      const draft = drafts.get(key), cached = retrieveAiTask(key);
      if (!draft || !cached || draft.expires < Date.now() || draft.memberId !== member.id || draft.busy) throw new Error("This draft expired. Run /c task again.");
      if (id === "qa_cancel") { drafts.delete(key); await ctx.respond({ replace_original: true, text: "Draft cancelled.", blocks: [] }); return; }
      if (id === "qa_existing") { if (!draft.duplicateId) throw new Error("No existing task found."); await showCard(ctx, draft.duplicateId, member); return; }
      draft.busy = true;
      try {
        if (!await prisma.project.findFirst({ where: { id: draft.projectId, ...access(member) }, select: { id: true } })) throw new Error("You cannot access this project.");
        const assignees = await prisma.member.findMany({ where: { slackId: { in: cached.suggestedAssigneeSlackIds }, projects: { some: { projectId: draft.projectId } } }, select: { id: true } });
        const task = await createTaskAsMember(member.id, { projectId: draft.projectId, title: cached.title, description: cached.description, priority: cached.priority as Priority | undefined,
          dueDate: cached.dueDate ? new Date(cached.dueDate) : undefined, parentTaskId: cached.parentTaskId, assigneeIds: assignees.map(a => a.id) }, "SLACK");
        drafts.delete(key);
        await ctx.respond({ response_type: "ephemeral", replace_original: true, text: `✓ Created <${taskUrl(task.projectId, task.id)}|${escapeMrkdwn(task.title)}>`, blocks: [] });
      } finally { draft.busy = false; }
    } catch (error) { await ctx.respond({ response_type: "ephemeral", replace_original: false, text: error instanceof Error ? error.message : "Unable to update draft." }); }
  });
}
