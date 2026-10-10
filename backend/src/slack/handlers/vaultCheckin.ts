import type { App } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import type { KnownBlock, ModalView } from "@slack/types";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { prisma } from "../../db/prisma.js";
import { canAccessVaultProject, enqueueVaultUpload, processVaultJob } from "../../services/vaultGithubJobs.js";
import { accessibleVaultProjectIds } from "../../services/vaultSearchService.js";
import { resolveReadClient } from "../../services/slackMembershipService.js";
import { getBotUserId } from "../../services/memberService.js";
import { escapeMrkdwn, loadingView, projectUrl, trunc } from "../views/common.js";

const cad = /\.(step|stp|sldprt|sldasm|slddrw|ipt|iam|f3d|stl|obj|gltf|glb|dxf|dwg|pdf)$/i;
type Item = { id: string; name: string; partNumber: string | null; projectId: string };
type Pending = { id: string; memberId: string; slackId: string; channelId: string; fileId: string; fileName: string; ts: string; item: Item | null; expiresAt: number; running: boolean };
const pending = new Map<string, Pending>();
const activeFiles = new Map<string, number>();
const login = () => `Sign in to Constellation first: ${(process.env.FRONTEND_URL ?? "http://localhost:3000").replace(/\/+$/, "")}/clubpm/login`;
const errorText = (err: unknown) => err instanceof Error && err.message === "VAULT_NOT_ENABLED"
  ? "This project's vault isn't on GitHub yet; check in on the web."
  : err instanceof Error ? err.message : "Unable to check in this file.";
const option = (item: Item) => ({ text: { type: "plain_text" as const, text: trunc(`${item.partNumber ? `${item.partNumber} · ` : ""}${item.name}`, 75) }, value: item.id });
function owned(id: string, slackId: string): Pending {
  const entry = pending.get(id);
  if (!entry || entry.expiresAt < Date.now()) throw new Error("This check-in expired. Share the file again.");
  if (entry.slackId !== slackId) throw new Error("This check-in belongs to another member.");
  return entry;
}
async function memberFor(slackId: string) {
  const member = await prisma.member.findUnique({ where: { slackId } });
  if (!member) throw new Error(login());
  return member;
}
async function itemFor(memberId: string, id: string): Promise<Item> {
  const item = await prisma.vaultItem.findUnique({ where: { id }, select: { id: true, name: true, partNumber: true, projectId: true, deletedAt: true } });
  if (!item || item.deletedAt) throw new Error("Vault item not found.");
  if (!await canAccessVaultProject(memberId, item.projectId)) throw new Error("You cannot access this Vault project.");
  return item;
}
function modal(entry: Pending, different: boolean): ModalView {
  return { type: "modal", callback_id: "vci_submit", private_metadata: entry.id,
    title: { type: "plain_text", text: "Check in CAD" }, submit: { type: "plain_text", text: "Check in" }, close: { type: "plain_text", text: "Cancel" },
    blocks: [
      { type: "context", elements: [{ type: "plain_text", text: trunc(`File: ${entry.fileName}`, 3000) }] },
      { type: "input", block_id: "vci_item", label: { type: "plain_text", text: "CAD part" }, element: { type: "external_select", action_id: "vci_item_search", min_query_length: 0, placeholder: { type: "plain_text", text: "Find a CAD part" }, ...(!different && entry.item ? { initial_option: option(entry.item) } : {}) } },
      { type: "input", block_id: "vci_note", label: { type: "plain_text", text: "What changed?" }, element: { type: "plain_text_input", action_id: "value", multiline: true, max_length: 3000 } },
    ] };
}
function prompt(entry: Pending): KnownBlock[] {
  const target = entry.item ? escapeMrkdwn(`${entry.item.partNumber ?? ""} ${entry.item.name}`.trim()) : "a CAD part";
  return [
    { type: "section", text: { type: "mrkdwn", text: trunc(`Check in *${escapeMrkdwn(entry.fileName)}* as a new version of *${target}*?`, 3000) } },
    { type: "actions", elements: [
      { type: "button", action_id: "vci_open", value: entry.id, text: { type: "plain_text", text: "Check in…" }, style: "primary" },
      { type: "button", action_id: "vci_different", value: entry.id, text: { type: "plain_text", text: "Different part…" } },
      { type: "button", action_id: "vci_cancel", value: entry.id, text: { type: "plain_text", text: "Cancel" } },
    ] },
  ];
}
async function guess(memberId: string, fileName: string, message: string): Promise<Item | null> {
  const projectIds = await accessibleVaultProjectIds(memberId);
  if (!projectIds.length) return null;
  const words = `${fileName} ${message}`.match(/[a-z0-9]+(?:[-_.][a-z0-9]+)*/gi) ?? [];
  // Include adjacent part-number text, including underscores used as separators.
  const candidates = [...new Set(words.flatMap(word => [word, ...word.split(/[_\.]/)]))];
  const exact = candidates.length ? await prisma.vaultItem.findMany({ where: { projectId: { in: projectIds }, deletedAt: null, partNumber: { in: candidates, mode: "insensitive" } }, select: { id: true, name: true, partNumber: true, projectId: true }, take: 2 }) : [];
  if (exact.length === 1) return exact[0];
  const checkedOut = await prisma.vaultItem.findMany({ where: { projectId: { in: projectIds }, deletedAt: null, checkedOutById: memberId }, select: { id: true, name: true, partNumber: true, projectId: true }, take: 100 });
  const tokens = (s: string) => new Set(s.toLowerCase().replace(/\.[^.]+$/, "").split(/[^a-z0-9]+/).filter(Boolean));
  const source = tokens(fileName);
  const score = (item: Item) => [...tokens(`${item.name} ${item.partNumber ?? ""}`)].filter(t => source.has(t)).length;
  return checkedOut.sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name))[0] ?? null;
}

/** Returns true only for CAD shares in the member's DM with this bot. */
export async function handleVaultFileShared(event: any, file: any, client: WebClient): Promise<boolean> {
  const fileName = file.name ?? file.title ?? "";
  const slackId = event.user_id ?? file.user;
  if (!cad.test(fileName) || !slackId || slackId === await getBotUserId(client) || file.bot_id) return false;
  const channels: string[] = [...new Set<string>([event.channel_id, ...(file.ims ?? []), ...Object.keys(file.shares?.private ?? {})].filter(Boolean))];
  for (const channelId of channels) {
    if (!channelId.startsWith("D")) continue;
    const reader = await resolveReadClient(channelId);
    // The bot reader is present only in its own IM, never another member's DM.
    if (!reader || reader.token !== process.env.SLACK_BOT_TOKEN) continue;
    const info = await reader.client.conversations.info({ channel: channelId });
    if (!info.channel?.is_im || (info.channel as { user?: string }).user !== slackId) continue;
    const key = `${channelId}:${file.id}`;
    for (const [oldKey, expiresAt] of activeFiles) if (expiresAt < Date.now()) activeFiles.delete(oldKey);
    if (activeFiles.has(key)) return true;
    activeFiles.set(key, Date.now() + 30 * 60_000);
    try {
      const member = await memberFor(slackId);
      const shares = file.shares?.private?.[channelId] ?? [];
      const sourceTs = shares[0]?.ts;
      let message = "";
      if (sourceTs) {
        const history = await reader.client.conversations.history({ channel: channelId, latest: sourceTs, inclusive: true, limit: 1 });
        const source = history.messages?.[0];
        if (source && source.ts === sourceTs) message = source.text ?? "";
      }
      for (const [id, old] of pending) if (old.expiresAt < Date.now() && !old.running) pending.delete(id);
      const entry: Pending = { id: randomUUID(), memberId: member.id, slackId, channelId, fileId: file.id, fileName, ts: "", item: await guess(member.id, fileName, message), expiresAt: Date.now() + 30 * 60_000, running: false };
      const posted = await client.chat.postMessage({ channel: channelId, text: `Check in ${fileName}?`, blocks: prompt(entry) });
      if (!posted.ts) throw new Error("Unable to create check-in card.");
      entry.ts = posted.ts; pending.set(entry.id, entry);
    } catch (err) {
      activeFiles.delete(key);
      await client.chat.postEphemeral({ channel: channelId, user: slackId, text: errorText(err) });
    }
    return true;
  }
  return false;
}

async function updateProgress(client: WebClient, entry: Pending, item: Item, state: string, code?: string | null) {
  const url = `${projectUrl(item.projectId)}?tab=vault&item=${encodeURIComponent(item.id)}`;
  const stages = ["UPLOADED", "LFS_STORED", "COMMITTED", "INDEXED"];
  const index = stages.indexOf(state);
  const progress = index >= 0 ? ["Uploaded", "Stored", "Committed", "Indexed"].map((label, i) => `${i <= index ? "✓" : "○"} ${label}`).join(" → ") : state === "FAILED" ? `Check-in failed${code ? ` (${escapeMrkdwn(code)})` : ""}. <${url}|Retry on the web>` : `Waiting to retry${code ? ` (${escapeMrkdwn(code)})` : ""}. <${url}|Open on the web>`;
  await client.chat.update({ channel: entry.channelId, ts: entry.ts, text: `${entry.fileName}: ${state}`, blocks: [
    { type: "section", text: { type: "mrkdwn", text: trunc(`*${escapeMrkdwn(entry.fileName)}* → *${escapeMrkdwn(item.name)}*\n${progress}`, 3000) } },
  ] });
}
async function upload(entry: Pending, item: Item, note: string, client: WebClient) {
  let dir: string | undefined;
  try {
    const reader = await resolveReadClient(entry.channelId, entry.memberId);
    if (!reader) throw new Error("This Slack file is no longer accessible.");
    const info = await reader.client.files.info({ file: entry.fileId });
    const file = info.file;
    if (!file?.url_private || file.user !== entry.slackId) throw new Error("This Slack file is no longer accessible.");
    // Never forward a Slack token to an arbitrary file URL or redirect destination.
    const url = new URL(file.url_private);
    if (url.protocol !== "https:" || !(url.hostname === "slack.com" || url.hostname.endsWith(".slack.com"))) throw new Error("Unsupported Slack file URL.");
    const response = await fetch(url, { headers: { Authorization: `Bearer ${reader.token}` }, redirect: "error", signal: AbortSignal.timeout(120_000) });
    if (!response.ok || !response.body) throw new Error("Unable to download this Slack file.");
    dir = await mkdtemp(path.join(tmpdir(), "constellation-checkin-"));
    const temporaryPath = path.join(dir, "upload");
    await pipeline(Readable.fromWeb(response.body as never), createWriteStream(temporaryPath));
    const job = await enqueueVaultUpload({ projectId: item.projectId, itemId: item.id, uploaderId: entry.memberId, idempotencyKey: `slack:${entry.fileId}:${item.id}`, temporaryPath, fileName: entry.fileName, mimeType: file.mimetype, note, expectedHeadSha: null });
    await prisma.slackCardMessage.upsert({ where: { slackChannelId_ts: { slackChannelId: entry.channelId, ts: entry.ts } }, create: { kind: "CHECKIN", slackChannelId: entry.channelId, ts: entry.ts, recipientId: entry.memberId, refs: { create: { entityType: "VAULT_ITEM", entityId: item.id, position: 0 } } }, update: { renderedAt: new Date() } });
    // Observe processing concurrently so intermediate states can render too.
    void processVaultJob(job.id).catch(err => console.error("Slack Vault job processing failed:", err));
    let last = "";
    const deadline = Date.now() + 10 * 60_000;
    while (Date.now() < deadline) {
      const current = await prisma.vaultUploadJob.findUnique({ where: { id: job.id } });
      if (!current) throw new Error("Upload job not found.");
      const signature = `${current.state}:${current.errorCode ?? ""}`;
      if (signature !== last) { await updateProgress(client, entry, item, current.state, current.errorCode); last = signature; }
      if (current.state === "INDEXED" || current.state === "FAILED") return;
      await new Promise<void>(resolve => { const timer = setTimeout(resolve, 5000); timer.unref(); });
    }
    await updateProgress(client, entry, item, "RETRY", "Still processing; follow progress on the web");
  } catch (err) {
    const url = `${projectUrl(item.projectId)}?tab=vault&item=${encodeURIComponent(item.id)}`;
    await client.chat.update({ channel: entry.channelId, ts: entry.ts, text: errorText(err), blocks: [{ type: "section", text: { type: "mrkdwn", text: trunc(`${escapeMrkdwn(errorText(err))}\n<${url}|Retry on the web>`, 3000) } }] });
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true });
    pending.delete(entry.id);
  }
}
export function registerVaultCheckin(app: App): void {
  for (const actionId of ["vci_open", "vci_different"]) app.action(actionId, async (ctx: any) => {
    await ctx.ack();
    const opened = await ctx.client.views.open({ trigger_id: ctx.body.trigger_id, view: loadingView("Check in CAD") });
    try {
      const member = await memberFor(ctx.body.user.id);
      const entry = owned(ctx.action.value, ctx.body.user.id);
      if (entry.memberId !== member.id || entry.running) throw new Error("This check-in is already processing.");
      if (entry.item) entry.item = await itemFor(member.id, entry.item.id);
      await ctx.client.views.update({ view_id: opened.view.id, hash: opened.view.hash, view: modal(entry, actionId === "vci_different") });
    } catch (err) {
      const view = loadingView("Check-in unavailable"); view.blocks = [{ type: "section", text: { type: "plain_text", text: trunc(errorText(err), 3000) } }];
      await ctx.client.views.update({ view_id: opened.view.id, hash: opened.view.hash, view });
    }
  });
  app.action("vci_cancel", async (ctx: any) => {
    await ctx.ack();
    try {
      await memberFor(ctx.body.user.id);
      const entry = owned(ctx.action.value, ctx.body.user.id);
      if (entry.running) throw new Error("This check-in is already processing.");
      pending.delete(entry.id);
      await ctx.client.chat.update({ channel: entry.channelId, ts: entry.ts, text: "Check-in cancelled.", blocks: [] });
    } catch (err) { await ctx.respond({ response_type: "ephemeral", text: errorText(err) }); }
  });
  app.options("vci_item_search", async (ctx: any) => {
    try {
      const member = await memberFor(ctx.body.user.id);
      owned(ctx.body.view.private_metadata, ctx.body.user.id);
      const projectIds = await accessibleVaultProjectIds(member.id);
      const q = String(ctx.options.value ?? "").trim().slice(0, 200);
      const items = await prisma.vaultItem.findMany({ where: { projectId: { in: projectIds }, deletedAt: null, ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { partNumber: { contains: q, mode: "insensitive" } }] } : {}) }, orderBy: { name: "asc" }, select: { id: true, name: true, partNumber: true, projectId: true }, take: 100 });
      await ctx.ack({ options: items.map(option) });
    } catch { await ctx.ack({ options: [] }); }
  });
  app.view("vci_submit", async (ctx: any) => {
    // Validate local inputs and ack immediately; recheck service permissions after closing.
    const values = ctx.view.state.values;
    const id = values.vci_item?.vci_item_search?.selected_option?.value;
    const note = String(values.vci_note?.value?.value ?? "").trim();
    if (!id || !note) { await ctx.ack({ response_action: "errors", errors: { ...(!id ? { vci_item: "Choose a CAD part." } : {}), ...(!note ? { vci_note: "Describe what changed." } : {}) } }); return; }
    await ctx.ack();
    let entry: Pending | undefined;
    try {
      entry = owned(ctx.view.private_metadata, ctx.body.user.id);
      if (entry.running) return;
      entry.running = true;
      const member = await memberFor(ctx.body.user.id);
      if (member.id !== entry.memberId) throw new Error("This check-in belongs to another member.");
      const item = await itemFor(member.id, id);
      await upload(entry, item, note, ctx.client);
    } catch (err) {
      if (entry) { entry.running = false; await ctx.client.chat.postEphemeral({ channel: entry.channelId, user: ctx.body.user.id, text: errorText(err) }); }
    }
  });
}
