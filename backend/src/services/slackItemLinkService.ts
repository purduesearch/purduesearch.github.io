import type { SlackEntityType } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { filterReadableChannels } from "../middleware/conversationAccess.js";
import { resolveReadClient } from "./slackMembershipService.js";
import type { Candidate } from "./slackMentionService.js";

export interface BacklinkDto {
  id: string; channelId: string; channelName: string; messageTs: string;
  permalink: string | null; snippet: string; authorName: string | null;
  linkedByName: string | null; createdAt: Date;
}
const permalinks = new Map<string, { url: string; expires: number }>();

export async function linkItems(opts: { channelId: string; messageTs: string; threadTs: string | null; linkerId: string; items: Candidate[] }): Promise<number> {
  const unique = new Map(opts.items.map(item => [`${item.kind}:${item.id}`, item]));
  for (const item of unique.values()) {
    const snapshot = { threadTs: opts.threadTs, label: item.title, url: item.url ?? null, projectId: item.projectId, linkedById: opts.linkerId };
    await prisma.slackItemLink.upsert({
      where: { slackChannelId_messageTs_entityType_entityId: { slackChannelId: opts.channelId, messageTs: opts.messageTs, entityType: item.kind, entityId: item.id } },
      create: { slackChannelId: opts.channelId, messageTs: opts.messageTs, entityType: item.kind, entityId: item.id, ...snapshot },
      update: snapshot,
    });
  }
  return unique.size;
}

export async function unlinkItem(linkId: string, actorId: string): Promise<void> {
  const [link, actor] = await Promise.all([
    prisma.slackItemLink.findUnique({ where: { id: linkId } }),
    prisma.member.findUnique({ where: { id: actorId }, select: { isAdmin: true, role: true } }),
  ]);
  if (!link) throw new Error("Link not found");
  if (!actor || (link.linkedById !== actorId && !actor.isAdmin && actor.role !== "ADMIN")) throw new Error("Only the linker or an admin can unlink this item");
  await prisma.slackItemLink.delete({ where: { id: linkId } });
}

async function permalink(channelId: string, ts: string, viewerId: string): Promise<string | null> {
  const key = `${viewerId}:${channelId}:${ts}`;
  const cached = permalinks.get(key);
  if (cached && cached.expires > Date.now()) return cached.url;
  permalinks.delete(key);
  try {
    const client = await resolveReadClient(channelId, viewerId);
    if (!client) return null;
    const result = await client.client.chat.getPermalink({ channel: channelId, message_ts: ts });
    if (!result.permalink) return null;
    permalinks.set(key, { url: result.permalink, expires: Date.now() + 120_000 });
    return result.permalink;
  } catch { return null; }
}

export async function listBacklinks(viewerId: string, entityType: SlackEntityType, entityId: string): Promise<BacklinkDto[]> {
  const links = await prisma.slackItemLink.findMany({ where: { entityType, entityId }, include: { linkedBy: { select: { displayName: true } } }, orderBy: { createdAt: "desc" } });
  const readable = new Set(await filterReadableChannels(viewerId, [...new Set(links.map(l => l.slackChannelId))]));
  const visible = links.filter(l => readable.has(l.slackChannelId));
  return Promise.all(visible.map(async link => {
    const [channel, message, url] = await Promise.all([
      prisma.slackChannelArchive.findUnique({ where: { slackChannelId: link.slackChannelId }, select: { slackChannelName: true } }),
      prisma.slackMessage.findFirst({ where: { slackChannelId: link.slackChannelId, ts: link.messageTs } }),
      permalink(link.slackChannelId, link.messageTs, viewerId),
    ]);
    return { id: link.id, channelId: link.slackChannelId, channelName: channel?.slackChannelName ?? link.slackChannelId, messageTs: link.messageTs, permalink: url, snippet: Array.from(message?.deletedAt ? "" : message?.text ?? "").slice(0, 140).join(""), authorName: message?.authorName ?? null, linkedByName: link.linkedBy?.displayName ?? null, createdAt: link.createdAt };
  }));
}
