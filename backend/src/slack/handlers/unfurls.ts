import type { App } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import { prisma } from "../../db/prisma.js";
import { getBotUserId } from "../../services/memberService.js";
import { getProjectsForChannel } from "../../services/projectService.js";
import { resolveReadClient } from "../../services/slackMembershipService.js";
import { parseConstellationUrl, type EntityRef } from "../../services/slackUnfurlCore.js";
import { setMemberRsvp } from "../../services/eventRsvpService.js";
import { loadHomeProjects } from "../../services/slackHomeData.js";
import { buildUnfurlBlocks, type UnfurlPreview } from "../views/unfurl.js";
import { priorityDot, relativeDue, statusPill } from "../views/common.js";
import { eventTime } from "../views/eventCards.js";

async function isProjectChannel(channelId: string): Promise<boolean> {
  if (channelId.startsWith("D")) return false;
  const archived = await prisma.slackChannelArchive.findUnique({ where: { slackChannelId: channelId }, select: { kind: true } });
  if (archived) return archived.kind === "CHANNEL" || archived.kind === "PRIVATE_CHANNEL";
  // Unknown G-prefixed conversations can be private channels or group DMs. Fail closed.
  const reader = await resolveReadClient(channelId);
  if (!reader) return false;
  const { channel } = await reader.client.conversations.info({ channel: channelId });
  return !!channel && !channel.is_im && !channel.is_mpim && (channel.is_channel === true || channel.is_group === true);
}

async function previewFor(ref: EntityRef, projectIds: Set<string>): Promise<UnfurlPreview | null> {
  if (ref.type === "TASK") {
    const task = await prisma.task.findUnique({ where: { id: ref.id }, select: { id: true, projectId: true, title: true, status: true, priority: true, dueDate: true, archivedAt: true, assignees: { select: { displayName: true } } } });
    if (!task || task.archivedAt || !projectIds.has(task.projectId)) return null;
    return { title: task.title, pill: statusPill(task.status), facts: [
      `${priorityDot(task.priority)} ${task.priority}`, task.dueDate ? `Due ${relativeDue(task.dueDate)}` : "No due date",
      `Assignees: ${task.assignees.map(a => a.displayName).join(", ") || "Unassigned"}`,
    ], action: { label: "Assign me", actionId: "tc_assign_me", value: { t: task.id } } };
  }
  if (ref.type === "VAULT_ITEM") {
    const item = await prisma.vaultItem.findUnique({ where: { id: ref.id }, select: { id: true, projectId: true, name: true, partNumber: true, currentRevision: true, checkedOutById: true, deletedAt: true } });
    if (!item || item.deletedAt || !projectIds.has(item.projectId)) return null;
    return { title: item.name, pill: item.checkedOutById ? ":red_circle: Checked out" : ":large_green_circle: Available",
      facts: [`Part: ${item.partNumber ?? "Unnumbered"}`, `Revision: ${item.currentRevision ?? "Unreleased"}`],
      action: { label: "Check out", actionId: "vc_checkout", value: { i: item.id } } };
  }
  if (ref.type === "CHANGE_REQUEST") {
    const cr = await prisma.changeRequest.findUnique({ where: { id: ref.id }, select: { projectId: true, title: true, status: true, _count: { select: { items: true } } } });
    if (!cr || !projectIds.has(cr.projectId)) return null;
    return { title: cr.title, pill: cr.status === "APPROVED" ? ":large_green_circle: Approved" : cr.status === "REJECTED" ? ":red_circle: Rejected" : cr.status === "CANCELLED" ? ":white_circle: Cancelled" : ":white_circle: Open", facts: [`${cr._count.items} affected items`, "CAD change request"] };
  }
  if (ref.type === "EVENT") {
    const event = await prisma.event.findUnique({ where: { id: ref.id }, select: { id: true, projectId: true, title: true, startTime: true, location: true, _count: { select: { rsvps: true } } } });
    if (!event?.projectId || !projectIds.has(event.projectId)) return null;
    return { title: event.title, pill: ":calendar: Event", facts: [eventTime(event.startTime), event.location ?? "Location TBD", `${event._count.rsvps} going`],
      action: { label: "RSVP", actionId: "uf_rsvp", value: { e: event.id } } };
  }
  if (ref.type === "PROJECT") {
    if (!projectIds.has(ref.id)) return null;
    const project = await prisma.project.findUnique({ where: { id: ref.id }, select: { name: true, status: true, type: true, targetDate: true } });
    return project ? { title: project.name, pill: `:dart: ${project.status}`, facts: [project.type, project.targetDate ? `Target ${project.targetDate.toISOString().slice(0, 10)}` : "No target date"] } : null;
  }
  return null;
}

export function registerUnfurls(app: App): void {
  app.action("uf_open", async ({ ack }) => { await ack(); });
  app.action("uf_rsvp", async ({ ack, body, action, client }) => {
    await ack();
    const channel = "channel" in body ? body.channel?.id : undefined;
    if (!channel || action.type !== "button" || !action.value) return;
    const reply = (text: string) => client.chat.postEphemeral({ channel, user: body.user.id, text });
    try {
      const member = await prisma.member.findUnique({ where: { slackId: body.user.id } });
      if (!member) { await reply(`Sign in to Constellation first: ${(process.env.FRONTEND_URL ?? "http://localhost:3000").replace(/\/+$/, "")}/clubpm/login`); return; }
      const value = JSON.parse(action.value) as { e?: unknown };
      if (typeof value.e !== "string") throw new Error("Invalid event.");
      const event = await prisma.event.findUnique({ where: { id: value.e }, select: { projectId: true } });
      if (!event) throw new Error("Event not found.");
      if (event.projectId && !(await loadHomeProjects(member)).some(p => p.id === event.projectId)) throw new Error("You cannot access this event's project.");
      await setMemberRsvp(value.e, member.id, true);
      await reply("You're going! Manage your RSVP from Calendar in Constellation.");
    } catch (error) { await reply(error instanceof Error ? error.message : "Unable to RSVP."); }
  });
  app.event("link_shared", async ({ event, client, logger }) => {
    try {
      if (event.user === await getBotUserId(client as WebClient) || !await isProjectChannel(event.channel)) return;
      const refs = event.links.map(link => ({ ...link, ref: parseConstellationUrl(link.url, [process.env.FRONTEND_URL ?? ""]) })).filter(link => link.ref !== null);
      if (!refs.length) return;
      const ids = new Set((await getProjectsForChannel(event.channel)).map(project => project.id));
      const unfurls: Record<string, { blocks: ReturnType<typeof buildUnfurlBlocks> }> = {};
      for (const link of refs) {
        try { unfurls[link.url] = { blocks: buildUnfurlBlocks(link.ref!, link.url, await previewFor(link.ref!, ids)) }; }
        catch (error) { logger.warn("Unable to load Constellation link preview", error); }
      }
      if (Object.keys(unfurls).length) await client.chat.unfurl({ channel: event.channel, ts: event.message_ts, unfurls });
    } catch (error) { logger.error("Constellation link unfurl failed", error); }
  });
}
