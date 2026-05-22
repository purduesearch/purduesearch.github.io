import { prisma } from "../db/prisma.js";
import type { Member } from "@prisma/client";
import type { WebClient } from "@slack/web-api";
import type { App } from "@slack/bolt";

// Re-export WebClient type alias used by helpers below
type SlackClient = WebClient;

export async function resolveSlackMember(
  slackUserId: string,
  client?: WebClient
): Promise<Member> {
  let member = await prisma.member.findUnique({
    where: { slackId: slackUserId },
  });

  if (member) {
    return member;
  }

  let displayName = slackUserId;
  let slackHandle = slackUserId;
  let avatarUrl: string | undefined;

  if (client) {
    try {
      const userInfo = await client.users.info({ user: slackUserId });
      if (userInfo.user) {
        displayName = userInfo.user.real_name || slackUserId;
        slackHandle = userInfo.user.name || slackUserId;
        avatarUrl = userInfo.user.profile?.image_72;
      }
    } catch {
      // Silently fall back to defaults if Slack API call fails
    }
  }

  member = await prisma.member.create({
    data: {
      slackId: slackUserId,
      slackHandle,
      displayName,
      avatarUrl,
    },
  });

  return member;
}

// Resolve a channel name like "leadership" or "#leadership" to a Slack channel ID.
// Accepts a WebClient directly so callers don't need the full App object.
// Slack channel IDs start with C (public) or G (private/group).
async function resolveChannelId(client: SlackClient, nameOrId: string): Promise<string | null> {
  if (/^[CG]/i.test(nameOrId)) return nameOrId;

  const target = nameOrId.replace(/^#/, "").toLowerCase();
  let cursor: string | undefined;
  do {
    const res = await client.conversations.list({
      types: "public_channel,private_channel",
      exclude_archived: true,
      limit: 200,
      ...(cursor ? { cursor } : {}),
    });
    const match = res.channels?.find(c => c.name?.toLowerCase() === target);
    if (match?.id) return match.id;
    cursor = res.response_metadata?.next_cursor || undefined;
  } while (cursor);
  return null;
}

// Cached after first resolution so member_joined/left events don't call conversations.list repeatedly.
let _leadershipChannelId: string | null | undefined = undefined;

export async function getLeadershipChannelId(client: SlackClient): Promise<string | null> {
  if (_leadershipChannelId !== undefined) return _leadershipChannelId;
  const raw = process.env.LEADERSHIP_CHANNEL_ID;
  if (!raw) return (_leadershipChannelId = null);
  _leadershipChannelId = await resolveChannelId(client, raw);
  return _leadershipChannelId;
}

export async function syncAdminStatus(app: App): Promise<void> {
  const raw = process.env.LEADERSHIP_CHANNEL_ID;
  if (!raw) return;

  const channelId = await getLeadershipChannelId(app.client);
  if (!channelId) {
    console.error(`⚠️  syncAdminStatus: could not find Slack channel "${raw}"`);
    return;
  }

  const slackIds: string[] = [];
  let cursor: string | undefined;
  do {
    const res = await app.client.conversations.members({ channel: channelId, limit: 200, ...(cursor ? { cursor } : {}) });
    slackIds.push(...(res.members ?? []));
    cursor = res.response_metadata?.next_cursor || undefined;
  } while (cursor);

  // Ensure every leadership-channel member exists in the DB before granting admin.
  // After a workspace migration the Member table may be empty (slackIds are new), and
  // without this loop updateMany would match zero rows and grant no admin.
  for (const id of slackIds) {
    await resolveSlackMember(id, app.client);
  }

  // Snapshot current state so we can log what actually changed
  const existing = await prisma.member.findMany({
    select: { slackId: true, displayName: true, isAdmin: true },
  });
  const existingMap = new Map(existing.map(m => [m.slackId, m]));

  const gained = slackIds.filter(id => existingMap.has(id) && !existingMap.get(id)!.isAdmin);
  const lost   = existing.filter(m => m.isAdmin && !slackIds.includes(m.slackId));

  await prisma.member.updateMany({ where: { slackId: { in: slackIds } }, data: { isAdmin: true } });
  await prisma.member.updateMany({ where: { slackId: { notIn: slackIds }, isAdmin: true }, data: { isAdmin: false } });

  for (const id of gained) {
    const name = existingMap.get(id)?.displayName ?? id;
    console.log(`🔑 [admin] GRANTED: ${name} (${id})`);
  }
  for (const m of lost) {
    console.log(`🔒 [admin] REVOKED: ${m.displayName} (${m.slackId})`);
  }
  if (gained.length === 0 && lost.length === 0) {
    console.log(`🔑 [admin] No admin status changes (${slackIds.length} members in leadership channel)`);
  }
}

export async function isAdminBySlackId(slackId: string): Promise<boolean> {
  const m = await prisma.member.findUnique({ where: { slackId }, select: { isAdmin: true } });
  return m?.isAdmin ?? false;
}

// Cached after first call — the bot's own Slack user ID, used to check channel
// membership and to invite the bot into a private channel via the user token.
let _botUserId: string | null | undefined = undefined;

export async function getBotUserId(client: SlackClient): Promise<string | null> {
  if (_botUserId !== undefined) return _botUserId;
  try {
    const res = await client.auth.test();
    _botUserId = (res.user_id as string | undefined) ?? null;
  } catch (err) {
    console.error("getBotUserId: auth.test failed:", err);
    _botUserId = null;
  }
  return _botUserId;
}
