import type { App } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import { randomUUID } from "node:crypto";
import { prisma } from "../../db/prisma.js";
import { getConversationAccess } from "../../middleware/conversationAccess.js";
import { getTaskPermissions } from "../../middleware/taskAccess.js";
import { resolveReadClient } from "../../services/slackMembershipService.js";
import { getProjectsForChannel } from "../../services/projectService.js";
import { parseTaskFromMessage } from "../../services/aiService.js";
import { addCommentAsMember, updateTaskAsMember } from "../../services/taskMutationService.js";
import { linkItems } from "../../services/slackItemLinkService.js";
import { openTaskModal } from "./taskModal.js";
import { openPlanModal } from "./plan.js";
import { showAttachPicker, readMentionThread } from "./mentions.js";
import { buildAddToTask } from "../views/addToTask.js";
import { loadingView, taskUrl, trunc } from "../views/common.js";

type Source = { memberId: string; channelId: string; messageTs: string; threadTs: string; text: string; files: { url: string; label?: string }[]; expires: number; busy: boolean };
const sessions = new Map<string, Source>();
const login = () => `Sign in to Constellation first: ${(process.env.FRONTEND_URL ?? "http://localhost:3000").replace(/\/+$/, "")}/clubpm/login`;
const access = (member: { id: string; isAdmin: boolean }) => member.isAdmin ? {} : { members: { some: { memberId: member.id } } };
const errorText = (error: unknown) => error instanceof Error ? error.message : "Unable to add this Slack message.";
function session(id: string, memberId: string): Source {
  const source = sessions.get(id);
  if (!source || source.memberId !== memberId || source.expires < Date.now()) throw new Error("This form expired. Run Add to task again.");
  return source;
}
async function readable(source: { memberId: string; channelId: string }) {
  if (!(await getConversationAccess(source.memberId, source.channelId)).canRead) throw new Error("You cannot read this conversation.");
  const resolved = await resolveReadClient(source.channelId, source.memberId);
  if (!resolved) throw new Error("Reconnect Slack in Constellation to read this conversation.");
  return resolved.client;
}
async function notice(ctx: any, text: string) {
  if (ctx.respond) await ctx.respond({ response_type: "ephemeral", replace_original: false, text });
  else {
    const channel = (await ctx.client.conversations.open({ users: ctx.body.user.id })).channel?.id;
    if (channel) await ctx.client.chat.postEphemeral({ channel, user: ctx.body.user.id, text });
  }
}
async function failView(client: WebClient, opened: { id?: string; hash?: string } | undefined, text: string) {
  if (opened?.id) await client.views.update({ view_id: opened.id, hash: opened.hash, view: { ...loadingView("Constellation"), blocks: [{ type: "section", text: { type: "plain_text", text: trunc(text, 3000) } }] } });
}

export function registerShortcuts(app: App): void {
  for (const callback_id of ["sc_create_task", "sc_attach_items", "sc_plan_thread", "sc_add_to_task"]) {
    app.shortcut({ callback_id, type: "message_action" }, async (ctx: any) => {
      await ctx.ack();
      let opened: { id?: string; hash?: string } | undefined;
      try {
        if (callback_id !== "sc_attach_items") opened = (await ctx.client.views.open({ trigger_id: ctx.shortcut.trigger_id, view: loadingView(callback_id === "sc_plan_thread" ? "Action plan" : callback_id === "sc_add_to_task" ? "Add to task" : "Create task") })).view;
        const member = await prisma.member.findUnique({ where: { slackId: ctx.shortcut.user.id } });
        if (!member) { await notice(ctx, login()); await failView(ctx.client, opened, login()); return; }
        const message = ctx.shortcut.message;
        const source: Source = { memberId: member.id, channelId: ctx.shortcut.channel.id, messageTs: message.ts, threadTs: message.thread_ts ?? message.ts,
          text: message.text ?? "", files: (message.files ?? []).filter((file: any) => typeof file.permalink === "string").map((file: any) => ({ url: file.permalink, label: file.title ?? file.name })), expires: Date.now() + 30 * 60_000, busy: false };
        await readable(source);
        if (callback_id === "sc_create_task") {
          const parsed = await parseTaskFromMessage(source.text);
          await openTaskModal(ctx.client, ctx.shortcut.trigger_id, { memberId: member.id, isAdmin: member.isAdmin, channelId: source.channelId, openedView: opened,
            prefill: { title: parsed?.title ?? (trunc(source.text, 200) || "Slack task"), description: parsed?.description ?? source.text, priority: parsed?.priority, dueDate: parsed?.dueDate } });
        } else if (callback_id === "sc_attach_items") {
          const projects = (await getProjectsForChannel(source.channelId)).filter(project => member.isAdmin || project.members.some(row => row.memberId === member.id));
          await showAttachPicker({ intent: "ATTACH", intentArg: null, memberId: member.id, slackUserId: ctx.shortcut.user.id, channelId: source.channelId, sourceTs: source.messageTs,
            threadTs: source.threadTs, projectIds: projects.map(project => project.id), text: source.text, client: ctx.client }, undefined, ctx.respond);
        } else if (callback_id === "sc_plan_thread") {
          const threadText = await readMentionThread(source.channelId, source.threadTs, member.id);
          await openPlanModal(ctx.client, ctx.shortcut.trigger_id, { memberId: member.id, channelId: source.channelId, threadText, source: { channelId: source.channelId, ts: source.messageTs }, openedView: opened });
        } else if (opened?.id) {
          for (const [id, old] of sessions) if (old.expires < Date.now()) sessions.delete(id);
          const id = randomUUID(); sessions.set(id, source);
          await ctx.client.views.update({ view_id: opened.id, hash: opened.hash, view: buildAddToTask(id, source.text) });
        }
      } catch (error) { await failView(ctx.client, opened, errorText(error)); await notice(ctx, errorText(error)); }
    });
  }
  app.options("att_task", async (ctx: any) => {
    try {
      const member = await prisma.member.findUnique({ where: { slackId: ctx.body.user.id } });
      if (!member) { await ctx.ack({ options: [] }); await notice(ctx, login()); return; }
      const source = session(ctx.body.view.private_metadata, member.id);
      await readable(source);
      const tasks = await prisma.task.findMany({ where: { archivedAt: null, project: access(member), title: { contains: ctx.options.value ?? "", mode: "insensitive" } }, select: { id: true, title: true }, orderBy: { updatedAt: "desc" }, take: 100 });
      await ctx.ack({ options: tasks.map(task => ({ text: { type: "plain_text", text: trunc(task.title, 75) || "Untitled" }, value: task.id })) });
    } catch { await ctx.ack({ options: [] }); }
  });
  app.view("att_submit", async (ctx: any) => {
    const values = ctx.view.state.values;
    const taskId = values.att_task_block?.att_task?.selected_option?.value;
    if (!taskId) { await ctx.ack({ response_action: "errors", errors: { att_task_block: "Choose a task." } }); return; }
    await ctx.ack();
    let source: Source | undefined;
    let claimed = false;
    try {
      const member = await prisma.member.findUnique({ where: { slackId: ctx.body.user.id } });
      if (!member) { await notice(ctx, login()); return; }
      source = session(ctx.view.private_metadata, member.id);
      if (source.busy) throw new Error("This message is already being added.");
      source.busy = true;
      claimed = true;
      const reader = await readable(source);
      const task = await prisma.task.findFirst({ where: { id: taskId, archivedAt: null, project: access(member) }, select: { id: true, title: true, projectId: true, attachments: true } });
      if (!task) throw new Error("You cannot access this task.");
      const mode = values.att_mode_block?.att_mode?.selected_option?.value;
      if (mode !== "comment" && mode !== "link") throw new Error("Choose Comment or Link only.");
      const includeFiles = values.att_files_block?.att_files?.selected_options?.some((option: any) => option.value === "include");
      if ((mode === "link" || includeFiles && source.files.length) && !(await getTaskPermissions(member.id, task.id)).canEdit) throw new Error("You cannot edit this task's attachments.");
      const permalink = (await reader.chat.getPermalink({ channel: source.channelId, message_ts: source.messageTs })).permalink;
      if (!permalink) throw new Error("Unable to get the Slack message link.");
      const additions = [...(mode === "link" ? [{ url: permalink, label: `Slack: ${source.text.slice(0, 40)}` }] : []), ...(includeFiles ? source.files : [])];
      if (additions.length) {
        const existing = Array.isArray(task.attachments) ? task.attachments.filter((entry): entry is { url: string; label?: string } => !!entry && typeof entry === "object" && !Array.isArray(entry) && typeof entry.url === "string") : [];
        const merged = new Map([...existing, ...additions].map(entry => [entry.url, entry]));
        await updateTaskAsMember(member.id, task.id, { attachments: [...merged.values()] }, "SLACK");
      }
      if (mode === "comment") await addCommentAsMember(member.id, task.id, `${source.text}\n\n— from Slack: ${permalink}`, { source: "SLACK" });
      await linkItems({ channelId: source.channelId, messageTs: source.messageTs, threadTs: source.threadTs, linkerId: member.id, items: [{ key: "c1", kind: "TASK", id: task.id, title: task.title, meta: "", projectId: task.projectId, url: taskUrl(task.projectId, task.id) }] });
      sessions.delete(ctx.view.private_metadata);
      await notice(ctx, `Added this Slack message to ${task.title}.`);
    } catch (error) { await notice(ctx, errorText(error)); }
    finally { if (source && claimed) source.busy = false; }
  });
}
