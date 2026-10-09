import type { App } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import { randomUUID } from "node:crypto";
import { prisma } from "../../db/prisma.js";
import { getProjectsForChannel } from "../../services/projectService.js";
import { getBotUserId } from "../../services/memberService.js";
import { resolveReadClient } from "../../services/slackMembershipService.js";
import { getConversationAccess } from "../../middleware/conversationAccess.js";
import { fastIntent, stripMention, type MentionIntent } from "../../services/slackMentionCore.js";
import { gatherCandidates, recommend, type Candidate, type Recommendation } from "../../services/slackMentionService.js";
import { linkItems, unlinkItem } from "../../services/slackItemLinkService.js";
import { registerCardRenderer, refreshCardsSoon, type CardMessage } from "../../services/slackCardService.js";
import { updateTaskAsMember } from "../../services/taskMutationService.js";
import { checkoutItem } from "../../services/vaultCheckoutService.js";
import { buildAttachPicker, buildAttachSearchModal, ATTACH_GROUPS } from "../views/attachPicker.js";
import { buildLinkCard, type LinkCardItem } from "../views/linkCard.js";
import { loadingView, trunc } from "../views/common.js";

export interface MentionIntentContext {
  intent: MentionIntent; intentArg: string | null; memberId: string; slackUserId: string;
  channelId: string; sourceTs: string; threadTs: string; projectIds: string[];
  text: string; threadText?: string; client: WebClient;
}
type Picker = { context: MentionIntentContext; recommendation: Recommendation; candidates: Map<string, Candidate>; expiresAt: number; searchCandidates?: Candidate[]; dismiss?: () => Promise<unknown> };
const pickers = new Map<string, Picker>();
const ttl = 30 * 60_000;
const expired = "This picker expired — tag @Constellation again.";
const signIn = () => `Sign in to Constellation first: ${(process.env.FRONTEND_URL ?? "http://localhost:3000").replace(/\/$/, "")}/clubpm/login`;
function picker(id: string, slackUserId: string): Picker | undefined {
  const entry = pickers.get(id);
  if (entry && entry.expiresAt <= Date.now()) pickers.delete(id);
  return entry && entry.expiresAt > Date.now() && entry.context.slackUserId === slackUserId ? entry : undefined;
}

export async function readMentionThread(channelId: string, threadTs: string, memberId: string): Promise<string> {
  const resolved = await resolveReadClient(channelId, memberId);
  if (!resolved) return "";
  const result = await resolved.client.conversations.replies({ channel: channelId, ts: threadTs, limit: 21 });
  return (result.messages ?? []).map(message => message.text ?? "").join("\n").slice(0, 30_000);
}

export async function showAttachPicker(context: MentionIntentContext, recommendation?: Recommendation, fallback?: (message: any) => Promise<unknown>): Promise<void> {
  const rec = recommendation ?? await recommend({ memberId: context.memberId, projectIds: context.projectIds, text: context.text, threadText: context.threadText });
  for (const [id, entry] of pickers) if (entry.expiresAt <= Date.now()) pickers.delete(id);
  const id = randomUUID();
  pickers.set(id, { context, recommendation: rec, candidates: new Map(rec.picks.map(pick => [pick.candidate.key, pick.candidate])), expiresAt: Date.now() + ttl });
  const message = { text: "Pick what to attach to this message", blocks: buildAttachPicker(rec, { pickerId: id, aiUsed: rec.aiUsed }) };
  try {
    await context.client.chat.postEphemeral({ channel: context.channelId, user: context.slackUserId, thread_ts: context.threadTs, ...message });
  } catch (error) {
    if (!fallback) { pickers.delete(id); throw error; }
    try { await fallback({ response_type: "ephemeral", replace_original: false, thread_ts: context.threadTs, ...message }); }
    catch (fallbackError) { pickers.delete(id); throw fallbackError; }
  }
}

async function route(context: MentionIntentContext): Promise<boolean> {
  const module = await import("./mentionIntents.js");
  await module.routeIntent(context);
  return true;
}

async function renderLinks(channelId: string, sourceTs: string) {
  const links = await prisma.slackItemLink.findMany({ where: { slackChannelId: channelId, messageTs: sourceTs }, include: { linkedBy: { select: { slackId: true } } }, orderBy: { createdAt: "asc" } });
  const items: LinkCardItem[] = await Promise.all(links.filter(link => ATTACH_GROUPS.some(group => group.kind === link.entityType)).map(async link => {
    const item: LinkCardItem = { linkId: link.id, kind: link.entityType as Candidate["kind"], title: link.label, url: link.url, linkedBySlackId: link.linkedBy?.slackId };
    if (link.entityType === "TASK") {
      const task = await prisma.task.findUnique({ where: { id: link.entityId }, select: { title: true, status: true, priority: true, archivedAt: true } });
      if (task) { item.title = task.title; item.status = task.status; item.meta = task.archivedAt ? "Archived" : task.priority; }
      else item.meta = "Deleted task";
    } else if (link.entityType === "VAULT_ITEM") {
      const vault = await prisma.vaultItem.findUnique({ where: { id: link.entityId }, include: { checkedOutBy: { select: { displayName: true } }, versions: { orderBy: { versionNumber: "desc" }, take: 1, select: { revision: true } } } });
      if (vault) { item.title = vault.name; item.checkedOutById = vault.checkedOutById; item.status = vault.checkedOutById ? "CHECKED_OUT" : "AVAILABLE"; item.meta = `${vault.partNumber} · ${vault.versions[0]?.revision ?? "Unreleased"}${vault.checkedOutBy ? ` · ${vault.checkedOutBy.displayName}` : ""}`; }
      else item.meta = "Deleted CAD item";
    } else if (link.entityType === "MILESTONE") {
      const milestone = await prisma.milestone.findUnique({ where: { id: link.entityId }, select: { title: true, completedAt: true } });
      if (milestone) { item.title = milestone.title; item.status = milestone.completedAt ? "DONE" : "TODO"; }
    } else if (link.entityType === "GITHUB") {
      const github = await prisma.gitHubLink.findUnique({ where: { id: link.entityId }, select: { title: true, url: true } });
      if (github) { item.title = github.title ?? item.title; item.url = github.url; }
    }
    return item;
  }));
  return { links, rendered: { text: items.length ? `${items.length} linked Constellation items` : "All items unlinked", blocks: buildLinkCard(items) } };
}

const posting = new Map<string, Promise<void>>();
export async function postLinkCard(opts: { channelId: string; sourceTs: string; threadTs: string; linkerId: string }): Promise<void> {
  const key = `${opts.channelId}:${opts.sourceTs}`;
  const previous = posting.get(key) ?? Promise.resolve();
  const work = previous.catch(() => {}).then(async () => {
    const { boltApp } = await import("../bolt.js");
    const { links, rendered } = await renderLinks(opts.channelId, opts.sourceTs);
    const existing = await prisma.slackCardMessage.findFirst({ where: { kind: "LINK_CARD", slackChannelId: opts.channelId, sourceTs: opts.sourceTs } });
    let message = existing;
    if (existing) await boltApp.client.chat.update({ channel: opts.channelId, ts: existing.ts, ...rendered });
    else {
      const result = await boltApp.client.chat.postMessage({ channel: opts.channelId, thread_ts: opts.threadTs, ...rendered });
      if (!result.ok || !result.ts) throw new Error(result.error ?? "SLACK_POST_FAILED");
      message = await prisma.slackCardMessage.create({ data: { kind: "LINK_CARD", slackChannelId: opts.channelId, ts: result.ts, sourceTs: opts.sourceTs, threadTs: opts.threadTs } });
    }
    await prisma.$transaction(async tx => {
      await tx.slackCardRef.deleteMany({ where: { messageId: message!.id } });
      const refs = links.filter(link => link.entityType === "TASK" || link.entityType === "VAULT_ITEM");
      if (refs.length) await tx.slackCardRef.createMany({ data: refs.map((link, position) => ({ messageId: message!.id, entityType: link.entityType, entityId: link.entityId, position })) });
      await tx.slackCardMessage.update({ where: { id: message!.id }, data: { renderedAt: new Date() } });
    });
  });
  posting.set(key, work);
  try { await work; } finally { if (posting.get(key) === work) posting.delete(key); }
}

async function accessibleCandidates(entry: Picker, memberId: string): Promise<Candidate[]> {
  const member = await prisma.member.findUnique({ where: { id: memberId } });
  if (!member) throw new Error(signIn());
  const projects = await prisma.project.findMany({ where: { id: { in: entry.context.projectIds }, ...(member.isAdmin ? {} : { members: { some: { memberId } } }) }, select: { id: true } });
  return gatherCandidates(memberId, projects.map(project => project.id));
}

async function attach(entry: Picker, memberId: string, keys: string[]) {
  if (!(await getConversationAccess(memberId, entry.context.channelId)).canRead) throw new Error("You cannot read this conversation.");
  if (!keys.length) throw new Error("Select at least one item to attach.");
  // Recheck project membership and vault visibility rather than trusting cached AI/search picks.
  const fresh = await accessibleCandidates(entry, memberId);
  const allowed = new Set(fresh.map(item => `${item.kind}:${item.id}`));
  const items = keys.map(key => entry.candidates.get(key)).filter((item): item is Candidate => !!item && allowed.has(`${item.kind}:${item.id}`));
  if (items.length !== new Set(keys).size) throw new Error("Some selected items are no longer available. Search again.");
  await linkItems({ channelId: entry.context.channelId, messageTs: entry.context.sourceTs, threadTs: entry.context.threadTs, linkerId: memberId, items });
  await postLinkCard({ channelId: entry.context.channelId, sourceTs: entry.context.sourceTs, threadTs: entry.context.threadTs, linkerId: memberId });
}

function selected(values: Record<string, Record<string, { selected_options?: { value: string }[] }>>): string[] {
  return Object.values(values).flatMap(block => Object.values(block).flatMap(action => action.selected_options?.map(option => option.value) ?? []));
}

export function registerMentions(app: App): void {
  registerCardRenderer("LINK_CARD", async (message: CardMessage) => (await renderLinks(message.slackChannelId, message.sourceTs ?? "")).rendered);
  app.event("app_mention", async ({ event, client }) => {
    try {
      if ((event as { bot_id?: string }).bot_id || event.user === await getBotUserId(client)) return;
      if (!event.user) return;
      const member = await prisma.member.findUnique({ where: { slackId: event.user } });
      if (!member) { await client.chat.postEphemeral({ channel: event.channel, user: event.user, text: signIn() }); return; }
      if (member.isBot || !(await getConversationAccess(member.id, event.channel)).canRead) return;
      const channelProjects = await getProjectsForChannel(event.channel);
      const accessible = await prisma.project.findMany({ where: member.isAdmin ? {} : { members: { some: { memberId: member.id } } }, select: { id: true } });
      const allowed = new Set(accessible.map(project => project.id));
      const projectIds = channelProjects.length ? channelProjects.map(project => project.id).filter(id => allowed.has(id)) : [...allowed];
      const text = stripMention(event.text, await getBotUserId(client) ?? "");
      const intent = fastIntent(text);
      const context: MentionIntentContext = { intent: intent?.intent ?? "ATTACH", intentArg: intent?.arg ?? null, memberId: member.id, slackUserId: event.user,
        channelId: event.channel, sourceTs: event.ts, threadTs: event.thread_ts ?? event.ts, projectIds, text, client,
        ...(event.thread_ts ? { threadText: await readMentionThread(event.channel, event.thread_ts, member.id) } : {}) };
      if (context.intent !== "ATTACH" && await route(context)) return;
      const rec = await recommend({ memberId: member.id, projectIds, text, threadText: context.threadText });
      if (rec.intent !== "ATTACH" && await route({ ...context, intent: rec.intent, intentArg: rec.intentArg })) return;
      await showAttachPicker(context, rec);
    } catch (error) { console.error("[mentions] app_mention failed", error); }
  });

  app.action("ap_attach", async ({ ack, body, action, respond }) => {
    await ack();
    try {
      const entry = picker((action as { value: string }).value, body.user.id);
      if (!entry) { await respond({ text: expired, replace_original: false }); return; }
      const member = await prisma.member.findUnique({ where: { slackId: body.user.id } });
      if (!member) { await respond({ text: signIn(), replace_original: false }); return; }
      await attach(entry, member.id, selected((body as any).state?.values ?? {}));
      await respond({ delete_original: true });
    } catch (error) { await respond({ text: (error as Error).message, replace_original: false }); }
  });
  app.action("ap_dismiss", async ({ ack, respond, action, body }) => {
    await ack();
    const id = (action as { value: string }).value;
    if (picker(id, body.user.id)) pickers.delete(id);
    await respond({ delete_original: true });
  });
  app.action("ap_search", async ({ ack, body, action, client, respond }) => {
    await ack();
    const id = (action as { value: string }).value;
    const entry = picker(id, body.user.id);
    if (!entry) { await respond({ text: expired, replace_original: false }); return; }
    const opened = await client.views.open({ trigger_id: (body as any).trigger_id, view: loadingView("Attach items") });
    entry.dismiss = () => respond({ delete_original: true });
    try {
      const member = await prisma.member.findUnique({ where: { slackId: body.user.id } });
      if (!member) throw new Error(signIn());
      if (!(await getConversationAccess(member.id, entry.context.channelId)).canRead) throw new Error("You cannot read this conversation.");
      // Load before exposing typeaheads: their options handlers must ack within 3 seconds.
      entry.searchCandidates = await accessibleCandidates(entry, member.id);
      if (opened.view?.id) await client.views.update({ view_id: opened.view.id, hash: opened.view.hash, view: buildAttachSearchModal(entry.recommendation, { pickerId: id }) });
    } catch (error) {
      if (opened.view?.id) await client.views.update({ view_id: opened.view.id, hash: opened.view.hash, view: { type: "modal", title: { type: "plain_text", text: "Attach items" }, close: { type: "plain_text", text: "Close" }, blocks: [{ type: "section", text: { type: "plain_text", text: trunc((error as Error).message, 3000) } }] } });
    }
  });
  for (const group of ATTACH_GROUPS) app.options(group.action, async ({ ack, body }) => {
    try {
      const entry = picker((body as any).view?.private_metadata ?? "", body.user.id);
      if (!entry) { await ack({ options: [] }); return; }
      const query = ((body as any).value ?? "").toLowerCase();
      const candidates = entry.searchCandidates ?? [];
      const matches = candidates.filter(item => item.kind === group.kind && `${item.title} ${item.meta}`.toLowerCase().includes(query)).slice(0, 100);
      // Keys from gatherCandidates are positional; allocate stable picker-local keys for searches.
      const options = matches.map(candidate => {
        let key = [...entry.candidates].find(([, item]) => item.kind === candidate.kind && item.id === candidate.id)?.[0];
        if (!key) { key = randomUUID(); entry.candidates.set(key, { ...candidate, key }); }
        return { text: { type: "plain_text" as const, text: trunc(candidate.title, 75) || "Untitled" }, value: key };
      });
      await ack({ options });
    } catch (error) { console.error("[mentions] search failed", error); await ack({ options: [] }); }
  });
  app.view("as_submit", async ({ ack, body, view, client }) => {
    const entry = picker(view.private_metadata, body.user.id);
    if (!entry) { await ack({ response_action: "errors", errors: { as_tasks: expired } }); return; }
    await ack();
    try {
      const member = await prisma.member.findUnique({ where: { slackId: body.user.id } });
      if (!member) throw new Error(signIn());
      await attach(entry, member.id, selected(view.state.values as any));
      await entry.dismiss?.();
    } catch (error) { await client.chat.postEphemeral({ channel: entry.context.channelId, user: body.user.id, thread_ts: entry.context.threadTs, text: (error as Error).message }); }
  });
  app.action("lc_item", async ({ ack, body, action, client }) => {
    await ack();
    try {
      const value = JSON.parse((action as any).selected_option.value) as { l: string; a: string };
      if (value.a === "open") return;
      const member = await prisma.member.findUnique({ where: { slackId: body.user.id } });
      if (!member) throw new Error(signIn());
      const link = await prisma.slackItemLink.findUnique({ where: { id: value.l } });
      if (!link) throw new Error("This link no longer exists.");
      if (!(await getConversationAccess(member.id, link.slackChannelId)).canRead) throw new Error("You cannot read this conversation.");
      if (value.a === "done" && link.entityType === "TASK") await updateTaskAsMember(member.id, link.entityId, { status: "DONE" }, "SLACK");
      else if (value.a === "checkout" && link.entityType === "VAULT_ITEM") { await checkoutItem(member.id, link.entityId, { source: "SLACK" }); refreshCardsSoon("VAULT_ITEM", link.entityId); }
      else if (value.a === "unlink") await unlinkItem(link.id, member.id);
      else throw new Error("Unsupported item action.");
      await postLinkCard({ channelId: link.slackChannelId, sourceTs: link.messageTs, threadTs: link.threadTs ?? link.messageTs, linkerId: member.id });
    } catch (error) {
      const channel = (body as any).channel?.id;
      if (channel) await client.chat.postEphemeral({ channel, user: body.user.id, text: (error as Error).message });
    }
  });
}
