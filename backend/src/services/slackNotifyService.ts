import type { WebClient } from "@slack/web-api";
import type { NotificationType } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { getBotUserId } from "./memberService.js";
import { computePings, extractMentions, type PingType } from "./slackPings.js";
import { upsertSlackNotification, retractSlackNotifications } from "./notificationCrud.js";
import { markConversationRead } from "./slackReadService.js";
import { buildFormatContext, previewText } from "./chatDto.js";
import { getProjectsForChannel } from "./projectService.js";
import type { IngestResult } from "./slackArchiveService.js";

/**
 * Slack → Constellation notification mirror (D8–D10).
 *
 * Called ONLY from the live event path (slack/events.ts). Backfill never calls
 * this, so importing history can't fire notifications (D10).
 */

const GROUP_TTL_MS = 30 * 60_000;
const groupCache = new Map<string, { ids: string[]; at: number }>();
let ownBotId: string | null | undefined;

/** Our app's bot_id, from auth.test — the reliable way to spot our own posts. */
async function getOwnBotId(client: WebClient): Promise<string | null> {
  if (ownBotId !== undefined) return ownBotId;
  try {
    const res = await client.auth.test();
    ownBotId = (res.bot_id as string | undefined) ?? null;
  } catch {
    ownBotId = null;
  }
  return ownBotId;
}

async function userGroupMembers(groupIds: string[], client: WebClient): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  for (const g of groupIds) {
    const hit = groupCache.get(g);
    if (hit && Date.now() - hit.at < GROUP_TTL_MS) { out[g] = hit.ids; continue; }
    try {
      const res = await client.usergroups.users.list({ usergroup: g });
      const ids = (res.users ?? []) as string[];
      groupCache.set(g, { ids, at: Date.now() });
      out[g] = ids;
    } catch {
      out[g] = []; // usergroups:read missing until the app is reinstalled
    }
  }
  return out;
}

/** Slack's "following": the parent's author, prior repliers, and people mentioned in the thread. */
async function threadParticipants(channelId: string, threadTs: string, excludeTs: string): Promise<string[]> {
  const rows = await prisma.slackMessage.findMany({
    where: { slackChannelId: channelId, OR: [{ ts: threadTs }, { threadTs }], NOT: { ts: excludeTs }, isBot: false, deletedAt: null },
    select: { authorSlackId: true, text: true },
  });
  const ids = new Set<string>();
  for (const r of rows) {
    if (r.authorSlackId) ids.add(r.authorSlackId);
    for (const u of extractMentions(r.text).users) ids.add(u);
  }
  return [...ids];
}

function messageFor(type: PingType, author: string, where: string, preview: string, isGroup: boolean): string {
  const q = preview ? `: “${preview}”` : "";
  switch (type) {
    case "SLACK_DM": return isGroup ? `${author} in a group message${q}` : `${author} sent you a message${q}`;
    case "SLACK_MENTION": return `${author} mentioned you in ${where}${q}`;
    case "SLACK_THREAD_REPLY": return `${author} replied in a thread in ${where}${q}`;
    case "SLACK_BROADCAST": return `${author} posted to everyone in ${where}${q}`;
  }
}

/**
 * Where a click goes (D12): DMs → the Members page; a channel → the Chat tab of
 * a project the recipient is on, else /clubpm/chat.
 */
function linkFor(r: IngestResult, projectIdForRecipient: string | null): string {
  const c = encodeURIComponent(r.channelId);
  if (r.convKind === "IM" || r.convKind === "MPIM") return `/clubpm/members?dm=${c}`;
  const thread = r.threadTs ? encodeURIComponent(r.threadTs) : null;
  if (projectIdForRecipient) {
    return `/clubpm/projects/${projectIdForRecipient}?tab=chat&channel=${c}${thread ? `&thread=${thread}` : ""}`;
  }
  return `/clubpm/chat/${c}${thread ? `?thread=${thread}` : ""}`;
}

export async function deliverSlackPings(r: IngestResult, client: WebClient): Promise<number> {
  if (r.event === "delete") {
    await retractSlackNotifications(r.channelId, r.ts);
    return 0;
  }
  if (r.event !== "new") return 0; // edits never re-ping; Slack doesn't either

  // Posting in a conversation means you've read it — Slack behaves the same.
  const author = r.authorSlackId
    ? await prisma.member.findUnique({ where: { slackId: r.authorSlackId }, select: { id: true } })
    : null;
  if (author && !r.isBot) await markConversationRead(author.id, r.channelId, r.ts, { pushToSlack: false });

  const [botUserId, botId] = await Promise.all([getBotUserId(client), getOwnBotId(client)]);
  const isOwnBot = r.isBot && ((!!botUserId && r.authorSlackId === botUserId) || (!!botId && r.botId === botId));

  const mentions = extractMentions(r.text);
  const [memberRows, archive, row] = await Promise.all([
    prisma.slackConversationMember.findMany({ where: { slackChannelId: r.channelId }, select: { slackUserId: true } }),
    prisma.slackChannelArchive.findUnique({ where: { slackChannelId: r.channelId }, select: { slackChannelName: true } }),
    prisma.slackMessage.findUnique({
      where: { slackChannelId_ts: { slackChannelId: r.channelId, ts: r.ts } },
      select: { authorName: true },
    }),
  ]);

  const pings = computePings({
    convKind: r.convKind,
    authorSlackId: r.authorSlackId,
    isOwnBot,
    text: r.text,
    threadTs: r.threadTs,
    conversationMemberIds: memberRows.map((m) => m.slackUserId),
    threadParticipantIds: r.threadTs ? await threadParticipants(r.channelId, r.threadTs, r.ts) : [],
    userGroupMembers: mentions.groups.length ? await userGroupMembers(mentions.groups, client) : {},
  });
  if (pings.length === 0) return 0;

  const recipients = await prisma.member.findMany({
    where: { slackId: { in: pings.map((p) => p.slackUserId) }, isBot: false },
    select: { id: true, slackId: true, mutedSlackChannelIds: true, notificationChannels: true },
  });
  if (recipients.length === 0) return 0;

  // One project lookup for everyone, not one per recipient.
  const isChannel = r.convKind === "CHANNEL" || r.convKind === "PRIVATE_CHANNEL";
  const projectIds = isChannel ? (await getProjectsForChannel(r.channelId)).map((p: { id: string }) => p.id) : [];
  const memberships = projectIds.length
    ? await prisma.projectMember.findMany({
        where: { projectId: { in: projectIds }, memberId: { in: recipients.map((m) => m.id) } },
        select: { projectId: true, memberId: true },
      })
    : [];
  const projectFor = new Map(memberships.map((m) => [m.memberId, m.projectId]));

  const ctx = await buildFormatContext();
  const preview = previewText(r.text, ctx, 120);
  const authorName = row?.authorName ?? "Someone";
  const where = archive?.slackChannelName ? `#${archive.slackChannelName}` : "a channel";
  const isGroup = r.convKind === "MPIM";
  const typeOf = new Map(pings.map((p) => [p.slackUserId, p.type]));

  let delivered = 0;
  for (const m of recipients) {
    const type = typeOf.get(m.slackId);
    if (!type) continue;
    if (m.mutedSlackChannelIds.includes(r.channelId)) continue;
    const prefs = (m.notificationChannels ?? {}) as Record<string, unknown>;
    if (prefs[type] === "off") continue;

    const n = await upsertSlackNotification({
      type: type as NotificationType,
      recipientId: m.id,
      actorId: author?.id ?? null,
      slackChannelId: r.channelId,
      slackTs: r.ts,
      message: messageFor(type, authorName, where, preview, isGroup),
      aggregateMessage: (count) =>
        isGroup ? `${count} new messages in a group message — latest from ${authorName}` : `${authorName} sent you ${count} messages`,
      link: linkFor(r, projectFor.get(m.id) ?? null),
    });
    if (n) delivered++;
  }
  return delivered;
}
