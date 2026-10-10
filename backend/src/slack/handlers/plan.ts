import type { App } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import type { ModalView } from "@slack/types";
import type { SlackPlanSession } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { startSession, setDecision, acceptAll, editAction, runAccepted, discard } from "../../services/slackPlanSessionService.js";
import type { ActionPlanAction, ActionExecutionResult } from "../../services/aiActionService.js";
import { buildPlanModal, buildPlanEditModal, parsePlanEdit } from "../views/planModal.js";
import { loadingView, trunc } from "../views/common.js";
import type { CmdCtx } from "../router.js";

export interface OpenPlanOptions {
  memberId: string; projectId?: string; goal?: string; threadText?: string;
  source?: { channelId: string; ts: string }; channelId?: string;
  openedView?: { id?: string; hash?: string };
}
type Pending = { memberId: string; threadText?: string; source?: OpenPlanOptions["source"]; expires: number };
const pending = new Map<string, Pending>();
const hashes = new Map<string, string>();
const login = () => `Sign in to Constellation first: ${process.env.FRONTEND_URL ?? "http://localhost:3000"}/clubpm/login`;
const plain = (text: string) => ({ type: "plain_text" as const, text });
const access = (member: { id: string; isAdmin: boolean }) => member.isAdmin ? {} : { members: { some: { memberId: member.id } } };
const message = (error: unknown) => error instanceof Error ? error.message : "Unable to review this plan.";
function notice(text: string): ModalView {
  return { ...loadingView("Action plan"), blocks: [{ type: "section", text: plain(trunc(text, 3000)) }] };
}
async function update(client: WebClient, viewId: string, view: ModalView, hash?: string): Promise<void> {
  const result = await client.views.update({ view_id: viewId, hash: hash ?? hashes.get(viewId), view });
  if (result.view?.hash) hashes.set(viewId, result.view.hash);
}
async function render(session: SlackPlanSession): Promise<ModalView> {
  const tasks = await prisma.task.findMany({ where: { projectId: session.projectId }, select: { id: true, title: true } });
  return buildPlanModal({ sessionId: session.id, goal: session.goal,
    actions: JSON.parse(session.actionsJson) as ActionPlanAction[],
    decisions: session.decisions as Record<string, "ACCEPTED" | "SKIPPED" | "EDITED">,
    results: session.resultsJson as ActionExecutionResult[] | null,
    taskTitles: new Map(tasks.map(task => [task.id, task.title])) });
}
async function requireProject(member: { id: string; isAdmin: boolean }, projectId: string): Promise<void> {
  if (!await prisma.project.findFirst({ where: { id: projectId, ...access(member) }, select: { id: true } })) {
    throw new Error("You cannot access this project.");
  }
}
async function generate(client: WebClient, viewId: string, opts: OpenPlanOptions, hash?: string): Promise<void> {
  const member = await prisma.member.findUnique({ where: { id: opts.memberId } });
  if (!member) throw new Error(login());
  await requireProject(member, opts.projectId!);
  const session = await startSession({ ...opts, projectId: opts.projectId!, goal: opts.goal!.trim() });
  await prisma.slackPlanSession.update({ where: { id: session.id }, data: { viewId } });
  await update(client, viewId, await render(session), hash);
}
export async function openPlanModal(client: WebClient, triggerId: string, opts: OpenPlanOptions): Promise<void> {
  const opened = opts.openedView ?? (await client.views.open({ trigger_id: triggerId, view: loadingView("Action plan") })).view;
  if (!opened?.id) return;
  if (opened.hash) hashes.set(opened.id, opened.hash);
  try {
    // Slash commands pass a Slack ID; all session writes use the resolved member ID.
    const member = await prisma.member.findFirst({ where: { OR: [{ id: opts.memberId }, { slackId: opts.memberId }] } });
    if (!member) {
      const channel = opts.channelId ?? opts.source?.channelId ?? (await client.conversations.open({ users: opts.memberId })).channel?.id;
      if (channel) await client.chat.postEphemeral({ channel, user: opts.memberId, text: login() });
      await update(client, opened.id, notice(login()), opened.hash);
      return;
    }
    const projects = await prisma.project.findMany({ where: access(member), orderBy: { name: "asc" }, take: 100, select: { id: true, name: true, slackChannelId: true } });
    const projectId = opts.projectId ?? projects.find(project => project.slackChannelId === (opts.channelId ?? opts.source?.channelId))?.id;
    if (projectId && opts.goal?.trim()) {
      await generate(client, opened.id, { ...opts, memberId: member.id, projectId }, opened.hash);
      return;
    }
    if (!projects.length) throw new Error("Join a project in Constellation before creating a plan.");
    for (const [key, value] of pending) if (value.expires <= Date.now()) pending.delete(key);
    pending.set(opened.id, { memberId: member.id, threadText: opts.threadText, source: opts.source, expires: Date.now() + 30 * 60_000 });
    const options = projects.map(project => ({ text: plain(trunc(project.name, 75)), value: project.id }));
    await update(client, opened.id, { type: "modal", callback_id: "plan_start", title: plain("Action plan"), submit: plain("Draft plan"), close: plain("Cancel"), private_metadata: opened.id,
      blocks: [
        { type: "input", block_id: "plan_project", label: plain("Project"), element: { type: "static_select", action_id: "project", options, ...(projectId ? { initial_option: options.find(option => option.value === projectId) } : {}) } },
        { type: "input", block_id: "plan_goal", label: plain("Goal"), element: { type: "plain_text_input", action_id: "goal", multiline: true, ...(opts.goal ? { initial_value: trunc(opts.goal, 3000) } : {}) } },
      ] }, opened.hash);
  } catch (error) { await update(client, opened.id, notice(message(error))); }
}
export async function handlePlanCommand(ctx: CmdCtx): Promise<void> {
  await openPlanModal(ctx.client, ctx.command.trigger_id, { memberId: ctx.command.user_id, channelId: ctx.command.channel_id, goal: ctx.args.slice(1).join(" ") });
}
async function actor(ctx: any) {
  const member = await prisma.member.findUnique({ where: { slackId: ctx.body.user.id } });
  if (!member) {
    const channel = ctx.body.channel?.id ?? (await ctx.client.conversations.open({ users: ctx.body.user.id })).channel?.id;
    if (channel) await ctx.client.chat.postEphemeral({ channel, user: ctx.body.user.id, text: login() });
    throw new Error(login());
  }
  return member;
}
async function sessionFor(id: string, memberId: string): Promise<SlackPlanSession> {
  const session = await prisma.slackPlanSession.findUnique({ where: { id } });
  if (!session || session.memberId !== memberId) throw new Error("This plan belongs to another member or no longer exists.");
  if (session.expiresAt.getTime() <= Date.now()) throw new Error("This plan expired — start a new one.");
  if (session.status !== "OPEN") throw new Error("This plan is no longer open for review.");
  return session;
}
async function errorView(ctx: any, error: unknown, rootId?: string): Promise<void> {
  const viewId = rootId ?? ctx.body.view?.id;
  if (!viewId) return;
  const session = await prisma.slackPlanSession.findFirst({ where: { viewId, member: { slackId: ctx.body.user.id }, status: "OPEN", expiresAt: { gt: new Date() } } });
  if (session) {
    const member = await prisma.member.findUnique({ where: { id: session.memberId } });
    if (member && await prisma.project.findFirst({ where: { id: session.projectId, ...access(member) }, select: { id: true } })) {
      const view = await render(session);
      view.blocks.unshift({ type: "section", text: plain(trunc(message(error), 3000)) });
      await update(ctx.client, viewId, view);
      return;
    }
  }
  await update(ctx.client, viewId, notice(message(error)));
}
export function registerPlan(app: App): void {
  app.view("plan_start", async (ctx) => {
    const values = ctx.view.state.values;
    const projectId = values.plan_project?.project?.selected_option?.value;
    const goal = values.plan_goal?.goal?.value?.trim();
    if (!projectId || !goal) {
      await ctx.ack({ response_action: "errors", errors: { ...(!projectId ? { plan_project: "Choose a project." } : {}), ...(!goal ? { plan_goal: "Enter a goal." } : {}) } });
      return;
    }
    await ctx.ack({ response_action: "update", view: loadingView("Action plan") });
    hashes.delete(ctx.view.id); // The ack replacement receives a new Slack hash, unavailable in the ack response.
    try {
      const member = await actor(ctx);
      const cached = pending.get(ctx.view.private_metadata);
      if (!cached || cached.memberId !== member.id || cached.expires <= Date.now()) throw new Error("This plan form expired — open a new one.");
      pending.delete(ctx.view.private_metadata);
      await generate(ctx.client, ctx.view.id, { ...cached, memberId: member.id, projectId, goal });
    } catch (error) { await errorView(ctx, error); }
  });
  for (const id of ["plan_accept", "plan_skip", "plan_accept_all", "plan_edit", "plan_discard"]) app.action(id, async (ctx: any) => {
    await ctx.ack();
    let rootId: string | undefined;
    let pushed: { id?: string; hash?: string } | undefined;
    try {
      const value = ctx.action.value;
      const parsed = id === "plan_accept_all" || id === "plan_discard" ? { s: value } : JSON.parse(value);
      // Push immediately while the trigger is valid, before resolving identity or loading the session.
      pushed = id === "plan_edit" ? (await ctx.client.views.push({ trigger_id: ctx.body.trigger_id, view: loadingView("Edit action") })).view : undefined;
      const member = await actor(ctx);
      const session = await sessionFor(parsed.s, member.id);
      rootId = session.viewId ?? ctx.body.view.id;
      if (ctx.body.view.hash) hashes.set(rootId!, ctx.body.view.hash);
      await requireProject(member, session.projectId);
      if (id === "plan_edit") {
        const actions = JSON.parse(session.actionsJson) as ActionPlanAction[];
        if (!Number.isInteger(parsed.i) || !actions[parsed.i]) throw new Error("That action is not in this plan.");
        if (pushed?.id) await update(ctx.client, pushed.id, buildPlanEditModal(parsed.i, actions[parsed.i], { sessionId: session.id }), pushed.hash);
      } else if (id === "plan_discard") {
        await discard(session.id, member.id);
        await update(ctx.client, rootId!, notice("Plan discarded"));
      } else {
        const changed = id === "plan_accept_all" ? await acceptAll(session.id, member.id) : await setDecision(session.id, member.id, parsed.i, id === "plan_accept" ? "ACCEPTED" : "SKIPPED");
        await update(ctx.client, rootId!, await render(changed));
      }
    } catch (error) {
      if (pushed?.id) await update(ctx.client, pushed.id, notice(message(error)), pushed.hash);
      else await errorView(ctx, error, rootId);
    }
  });
  app.view("plan_edit_submit", async (ctx) => {
    await ctx.ack(); // Pop the pushed form within Slack's three-second deadline.
    let rootId: string | undefined;
    try {
      const member = await actor(ctx);
      const { s, i } = JSON.parse(ctx.view.private_metadata);
      const session = await sessionFor(s, member.id);
      rootId = session.viewId ?? undefined;
      await requireProject(member, session.projectId);
      const action = (JSON.parse(session.actionsJson) as ActionPlanAction[])[i];
      if (!Number.isInteger(i) || !action) throw new Error("That action is not in this plan.");
      const params = parsePlanEdit(action.type, ctx.view.state.values);
      const changed = await editAction(s, member.id, i, params);
      if (rootId) await update(ctx.client, rootId, await render(changed));
    } catch (error) { await errorView(ctx, error, rootId); }
  });
  app.view("plan_run", async (ctx) => {
    await ctx.ack({ response_action: "update", view: loadingView("Action plan") });
    hashes.delete(ctx.view.id);
    try {
      const member = await actor(ctx);
      const session = await sessionFor(ctx.view.private_metadata, member.id);
      await requireProject(member, session.projectId);
      const result = await runAccepted(session.id, member.id);
      await update(ctx.client, ctx.view.id, await render(result.session));
    } catch (error) { await errorView(ctx, error); }
  });
}
