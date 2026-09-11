import type { WebClient } from "@slack/web-api";
import { prisma } from "../db/prisma.js";
import { activityBus } from "./activityService.js";
import { userClientFor } from "./slackUserTokenService.js";
import { hasCapability } from "./slackScopes.js";
import { getBotUserId } from "./memberService.js";
import { ensureChannelArchive } from "./slackArchiveService.js";
import type { ConversationKind } from "./slackConversationAccess.js";

/**
 * Mirror of Slack conversation membership — the table the access layer reads
 * to decide who may see a private channel, DM or group DM (D2, D3).
 *
 * Every change is announced on `slack-membership:<slackUserId>` so an open SSE
 * stream can start (or stop) delivering that conversation's live events
 * without a reconnect.
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Lazy: importing bolt.ts boots the Socket Mode app and every handler. */
async function botClient(): Promise<WebClient> {
  const { boltApp } = await import("../slack/bolt.js");
  return boltApp.client;
}

function emitMembership(slackUserId: string, channelId: string, joined: boolean): void {
  activityBus.emit(`slack-membership:${slackUserId}`, { channelId, joined });
}

/** Conversations whose member list this process has loaded at least once. */
const known = new Set<string>();

/** Replace a conversation's member set, announcing only the differences. */
export async function setConversationMembers(channelId: string, slackUserIds: string[]): Promise<void> {
  const before = await prisma.slackConversationMember.findMany({
    where: { slackChannelId: channelId },
    select: { slackUserId: true },
  });
  const prev = new Set(before.map((b) => b.slackUserId));
  const next = new Set(slackUserIds);
  const added = [...next].filter((id) => !prev.has(id));
  const removed = [...prev].filter((id) => !next.has(id));

  await prisma.$transaction([
    prisma.slackConversationMember.deleteMany({
      where: { slackChannelId: channelId, slackUserId: { in: removed } },
    }),
    prisma.slackConversationMember.createMany({
      data: added.map((slackUserId) => ({ slackChannelId: channelId, slackUserId })),
      skipDuplicates: true,
    }),
  ]);
  known.add(channelId);
  for (const id of added) emitMembership(id, channelId, true);
  for (const id of removed) emitMembership(id, channelId, false);
}

/** Load Slack's current member list (paginated) and mirror it. */
export async function syncConversationMembers(channelId: string, client: WebClient): Promise<number> {
  const ids: string[] = [];
  let cursor: string | undefined;
  do {
    const res = await client.conversations.members({ channel: channelId, limit: 1000, ...(cursor ? { cursor } : {}) });
    ids.push(...((res.members ?? []) as string[]));
    cursor = res.response_metadata?.next_cursor || undefined;
  } while (cursor);
  await setConversationMembers(channelId, ids);
  return ids.length;
}

export async function addConversationMember(channelId: string, slackUserId: string): Promise<void> {
  const existing = await prisma.slackConversationMember.findUnique({
    where: { slackChannelId_slackUserId: { slackChannelId: channelId, slackUserId } },
    select: { slackUserId: true },
  });
  if (existing) return;
  // createMany + skipDuplicates is race-safe against a concurrent sync.
  await prisma.slackConversationMember.createMany({
    data: [{ slackChannelId: channelId, slackUserId }],
    skipDuplicates: true,
  });
  emitMembership(slackUserId, channelId, true);
}

export async function removeConversationMember(channelId: string, slackUserId: string): Promise<void> {
  const { count } = await prisma.slackConversationMember.deleteMany({
    where: { slackChannelId: channelId, slackUserId },
  });
  if (count > 0) emitMembership(slackUserId, channelId, false);
}

async function backfillChannelName(channelId: string, client: WebClient): Promise<void> {
  const row = await prisma.slackChannelArchive.findUnique({
    where: { slackChannelId: channelId },
    select: { slackChannelName: true },
  });
  if (row?.slackChannelName) return;
  const info = await client.conversations.info({ channel: channelId });
  const name = (info.channel as { name?: string } | undefined)?.name;
  if (name) {
    await prisma.slackChannelArchive.update({ where: { slackChannelId: channelId }, data: { slackChannelName: name } });
  }
}

/**
 * Make sure we know who is in a conversation. Until this has run, a private
 * conversation has no member rows and is readable by NOBODY — the access layer
 * fails closed, so the gap is empty, never leaky.
 *
 * `authorizedSlackUserId` is the member whose authorization delivered the
 * event: for a DM or a private channel the bot is not in, theirs is the only
 * token that can list the members.
 */
export async function ensureMembersKnown(
  channelId: string,
  kind: ConversationKind,
  authorizedSlackUserId?: string
): Promise<void> {
  if (known.has(channelId)) return;
  const count = await prisma.slackConversationMember.count({ where: { slackChannelId: channelId } });
  if (count > 0) { known.add(channelId); return; }

  try {
    if (kind === "CHANNEL") {
      await syncConversationMembers(channelId, await botClient());
      return;
    }
    if (!authorizedSlackUserId) return;
    const member = await prisma.member.findUnique({ where: { slackId: authorizedSlackUserId }, select: { id: true } });
    const uc = member ? await userClientFor(member.id) : null;
    if (!uc) return;

    if (kind === "IM") {
      // A 1:1 DM's other party is on conversations.info; members of an IM never change.
      const info = await uc.client.conversations.info({ channel: channelId });
      const other = (info.channel as { user?: string } | undefined)?.user;
      await setConversationMembers(channelId, other ? [uc.slackId, other] : [uc.slackId]);
    } else {
      await syncConversationMembers(channelId, uc.client);
      if (kind === "PRIVATE_CHANNEL") await backfillChannelName(channelId, uc.client);
    }
  } catch (err) {
    console.warn(`[slackPortal] could not load members of ${channelId}:`, (err as Error).message);
  }
}

/**
 * A client that can READ this conversation, and its token (url_private file
 * downloads need the raw token). The bot works wherever it is a member; for
 * DMs and private channels it is not in, only a participant's own token can.
 * Prefers the requester, so a request is served with their own authority.
 */
export async function resolveReadClient(
  channelId: string,
  preferMemberId?: string
): Promise<{ client: WebClient; token: string } | null> {
  const bot = await botClient();
  const botUserId = await getBotUserId(bot);

  let rows = await prisma.slackConversationMember.findMany({
    where: { slackChannelId: channelId },
    select: { slackUserId: true },
  });
  if (rows.length === 0) {
    // Self-heal conversations that predate the mirror (e.g. project channels
    // archived before the portal pass). Works whenever the bot is in them.
    try {
      await syncConversationMembers(channelId, bot);
      rows = await prisma.slackConversationMember.findMany({
        where: { slackChannelId: channelId },
        select: { slackUserId: true },
      });
    } catch {
      // Bot is not in this conversation.
    }
  }
  const ids = new Set(rows.map((r) => r.slackUserId));
  if (botUserId && ids.has(botUserId)) return { client: bot, token: process.env.SLACK_BOT_TOKEN ?? "" };

  const tryMember = async (memberId: string) => {
    const uc = await userClientFor(memberId);
    return uc && ids.has(uc.slackId) && hasCapability(uc.scopes, "read") ? { client: uc.client, token: uc.token } : null;
  };
  if (preferMemberId) {
    const mine = await tryMember(preferMemberId);
    if (mine) return mine;
  }
  const candidates = await prisma.member.findMany({
    where: { slackId: { in: [...ids] }, slackUserToken: { not: null } },
    select: { id: true },
    take: 10,
  });
  for (const c of candidates) {
    const r = await tryMember(c.id);
    if (r) return r;
  }
  return null;
}

/** The bot joins one public channel and mirrors its members. */
export async function joinAndSyncPublicChannel(channelId: string, client: WebClient, name?: string | null): Promise<void> {
  await client.conversations.join({ channel: channelId });
  await ensureChannelArchive(channelId, client, { kind: "CHANNEL", name: name ?? null });
  await syncConversationMembers(channelId, client);
}

/**
 * Join every public channel the bot is not in yet. Idempotent. The bot has to
 * be IN a public channel to read its history (bot channels:history), and the
 * portal's promise is that every public channel is readable.
 */
export async function joinAllPublicChannels(client: WebClient): Promise<{ joined: number; seen: number }> {
  let cursor: string | undefined;
  let joined = 0;
  let seen = 0;
  do {
    const res = await client.conversations.list({
      types: "public_channel",
      exclude_archived: true,
      limit: 200,
      ...(cursor ? { cursor } : {}),
    });
    for (const c of (res.channels ?? []) as { id?: string; name?: string; is_member?: boolean }[]) {
      if (!c.id) continue;
      seen++;
      if (c.is_member) {
        await ensureChannelArchive(c.id, client, { kind: "CHANNEL", name: c.name ?? null });
        continue;
      }
      try {
        await joinAndSyncPublicChannel(c.id, client, c.name);
        joined++;
      } catch (err) {
        console.warn(`[slackPortal] could not join #${c.name ?? c.id}:`, (err as Error).message);
      }
      await sleep(1_200); // conversations.join is Tier 3
    }
    cursor = res.response_metadata?.next_cursor || undefined;
  } while (cursor);
  return { joined, seen };
}

/**
 * Nightly drift repair. Events keep membership current most of the time; this
 * catches what they miss (a private channel nobody signed-in remained in, a
 * missed event during a redeploy). 1:1 DMs are skipped — their membership
 * never changes.
 */
export async function reconcileMemberships(limit = 300): Promise<number> {
  const rows = await prisma.slackChannelArchive.findMany({
    where: { kind: { not: "IM" } },
    select: { slackChannelId: true },
    orderBy: { lastMessageAt: { sort: "desc", nulls: "last" } },
    take: limit,
  });
  let synced = 0;
  for (const r of rows) {
    try {
      const reader = await resolveReadClient(r.slackChannelId);
      if (!reader) continue;
      await syncConversationMembers(r.slackChannelId, reader.client);
      synced++;
    } catch (err) {
      console.warn(`[slackPortal] reconcile failed for ${r.slackChannelId}:`, (err as Error).message);
    }
    await sleep(700); // conversations.members is Tier 4
  }
  return synced;
}
