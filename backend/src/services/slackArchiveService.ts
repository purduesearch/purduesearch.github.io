import type { WebClient } from "@slack/web-api";
import { prisma } from "../db/prisma.js";
import { activityBus } from "./activityService.js";
import { shouldArchive, type RawSlackMessage } from "./slackArchivePolicy.js";
import { getBotUserId } from "./memberService.js";

// ── Caches ───────────────────────────────────────────────────
// Ingest runs on every message in every channel the bot is in, so both of these
// hot paths are cached rather than hitting Postgres/Slack per message.

const LINK_TTL_MS = 5 * 60_000;
const AUTHOR_TTL_MS = 30 * 60_000;

const linkCache = new Map<string, { linked: boolean; at: number }>();
type Author = { authorName: string; authorAvatarUrl: string | null; memberId: string | null };
const authorCache = new Map<string, Author & { at: number }>();

/** Test seam + a way for the channel picker to invalidate after a link change. */
export function clearSlackArchiveCaches(): void {
  linkCache.clear();
  authorCache.clear();
}

/**
 * Is this channel linked to a project? Scope is "project-linked channels only",
 * and a channel is linked either through a notification target (primary) or the
 * legacy Project.slackChannelId / slackChannel fields.
 */
export async function isArchivedChannel(channelId: string): Promise<boolean> {
  const hit = linkCache.get(channelId);
  if (hit && Date.now() - hit.at < LINK_TTL_MS) return hit.linked;

  const [target, legacy] = await Promise.all([
    prisma.projectNotificationTarget.findFirst({
      where: { slackChannelId: channelId },
      select: { id: true },
    }),
    prisma.project.findFirst({
      where: { OR: [{ slackChannelId: channelId }, { slackChannel: channelId }] },
      select: { id: true },
    }),
  ]);

  const linked = !!(target || legacy);
  linkCache.set(channelId, { linked, at: Date.now() });
  return linked;
}

/**
 * Resolve a Slack user to a display name + avatar, WITHOUT creating a Member.
 *
 * memberService.resolveSlackMember() creates a Member row when one is missing.
 * That is correct for member_joined_channel and wrong here: archiving a message
 * from a guest or a non-member would silently add them to the club roster,
 * where they would then show up in assignee pickers.
 */
export async function resolveAuthor(slackId: string, client: WebClient): Promise<Author> {
  const hit = authorCache.get(slackId);
  if (hit && Date.now() - hit.at < AUTHOR_TTL_MS) {
    return { authorName: hit.authorName, authorAvatarUrl: hit.authorAvatarUrl, memberId: hit.memberId };
  }

  const member = await prisma.member.findUnique({
    where: { slackId },
    select: { id: true, displayName: true, avatarUrl: true },
  });

  let author: Author;
  if (member) {
    author = { authorName: member.displayName, authorAvatarUrl: member.avatarUrl, memberId: member.id };
  } else {
    author = { authorName: slackId, authorAvatarUrl: null, memberId: null };
    try {
      const info = await client.users.info({ user: slackId });
      const u = info.user as { real_name?: string; name?: string; profile?: { image_72?: string } } | undefined;
      if (u) {
        author.authorName = u.real_name || u.name || slackId;
        author.authorAvatarUrl = u.profile?.image_72 ?? null;
      }
    } catch {
      // Deactivated or invisible user — the slackId fallback is fine.
    }
  }

  authorCache.set(slackId, { ...author, at: Date.now() });
  return author;
}

/** Find or create the per-channel archive row, refreshing its cached name. */
export async function ensureChannelArchive(
  channelId: string,
  client: WebClient
): Promise<{ id: string; slackChannelName: string | null }> {
  const existing = await prisma.slackChannelArchive.findUnique({
    where: { slackChannelId: channelId },
    select: { id: true, slackChannelName: true },
  });
  if (existing) return existing;

  let name: string | null = null;
  let isPrivate = false;
  try {
    const info = await client.conversations.info({ channel: channelId });
    name = (info.channel as { name?: string } | undefined)?.name ?? null;
    isPrivate = !!(info.channel as { is_private?: boolean } | undefined)?.is_private;
  } catch {
    // Missing scope or archived channel — the row is still worth creating.
  }

  return prisma.slackChannelArchive.create({
    data: { slackChannelId: channelId, slackChannelName: name, isPrivate },
    select: { id: true, slackChannelName: true },
  });
}

/** Slack ts ("1725900000.001200") → Date. */
function tsToDate(ts: string): Date {
  return new Date(Math.round(parseFloat(ts) * 1000));
}

type SlackFilePayload = {
  id?: string;
  name?: string;
  title?: string;
  mimetype?: string;
  size?: number;
  original_w?: number;
  original_h?: number;
};

async function upsertFiles(messageId: string, postedAt: Date, files: unknown[]): Promise<void> {
  for (const raw of files) {
    const f = raw as SlackFilePayload;
    if (!f.id) continue;
    const isImage = !!f.mimetype?.startsWith("image/");
    await prisma.slackMessageFile.upsert({
      where: { slackFileId: f.id },
      create: {
        messageId,
        slackFileId: f.id,
        name: f.name || f.title || f.id,
        mimeType: f.mimetype ?? null,
        sizeBytes: f.size ?? null,
        isImage,
        width: f.original_w ?? null,
        height: f.original_h ?? null,
        postedAt,
      },
      // Metadata only. Never reset `storage` — a re-delivered event must not
      // undo a completed Drive mirror.
      update: { name: f.name || f.title || f.id, mimeType: f.mimetype ?? null },
    });
  }
}

/**
 * Recompute (never increment) the parent's reply count. Live ingest and backfill
 * can both touch the same parent, so this has to be idempotent under replay.
 */
async function refreshReplyCount(slackChannelId: string, threadTs: string): Promise<void> {
  const count = await prisma.slackMessage.count({
    where: { slackChannelId, threadTs, deletedAt: null, NOT: { ts: threadTs } },
  });
  await prisma.slackMessage.updateMany({
    where: { slackChannelId, ts: threadTs },
    data: { replyCount: count },
  });
}

/**
 * Persist one Slack message event. Safe to call for every message in every
 * channel — it returns early for unlinked channels and filtered messages.
 */
export async function ingestSlackMessage(
  msg: RawSlackMessage & { channel?: string },
  client: WebClient
): Promise<void> {
  const channelId = msg.channel;
  if (!channelId) return;
  if (!(await isArchivedChannel(channelId))) return;

  const botUserId = (await getBotUserId(client)) ?? undefined;
  const decision = shouldArchive(msg, botUserId);
  if (!decision.archive) return;

  if (decision.kind === "delete") {
    const ts = msg.deleted_ts || msg.previous_message?.ts;
    if (!ts) return;
    await prisma.slackMessage.updateMany({
      where: { slackChannelId: channelId, ts },
      data: { deletedAt: new Date() },
    });
    activityBus.emit(`slack-chat:${channelId}`, { channelId, ts, kind: "delete" });
    return;
  }

  if (decision.kind === "edit") {
    const inner = msg.message!;
    if (!inner.ts) return;
    await prisma.slackMessage.updateMany({
      where: { slackChannelId: channelId, ts: inner.ts },
      data: { text: inner.text ?? "", editedAt: new Date() },
    });
    activityBus.emit(`slack-chat:${channelId}`, { channelId, ts: inner.ts, kind: "edit" });
    return;
  }

  const ts = msg.ts;
  if (!ts) return;

  await ensureChannelArchive(channelId, client);
  const author = msg.user
    ? await resolveAuthor(msg.user, client)
    : { authorName: "Unknown", authorAvatarUrl: null, memberId: null };
  const postedAt = tsToDate(ts);
  const threadTs = msg.thread_ts && msg.thread_ts !== ts ? msg.thread_ts : null;

  const row = await prisma.slackMessage.upsert({
    where: { slackChannelId_ts: { slackChannelId: channelId, ts } },
    create: {
      slackChannelId: channelId,
      ts,
      threadTs,
      authorSlackId: msg.user ?? null,
      memberId: author.memberId,
      authorName: author.authorName,
      authorAvatarUrl: author.authorAvatarUrl,
      text: msg.text ?? "",
      postedAt,
    },
    update: { text: msg.text ?? "" },
    select: { id: true },
  });

  if (Array.isArray(msg.files) && msg.files.length > 0) {
    await upsertFiles(row.id, postedAt, msg.files);
  }
  if (threadTs) await refreshReplyCount(channelId, threadTs);

  await prisma.slackChannelArchive.update({
    where: { slackChannelId: channelId },
    data: {
      lastMessageAt: postedAt,
      messageCount: await prisma.slackMessage.count({ where: { slackChannelId: channelId } }),
    },
  });

  activityBus.emit(`slack-chat:${channelId}`, { channelId, ts, threadTs, kind: "new" });
}

/**
 * Toggle one reaction on an archived message.
 * Shape: { ":emoji:": { count, slackIds: [] } }
 */
export async function applyReaction(
  channelId: string,
  ts: string,
  emoji: string,
  slackId: string,
  added: boolean
): Promise<void> {
  if (!(await isArchivedChannel(channelId))) return;

  const row = await prisma.slackMessage.findUnique({
    where: { slackChannelId_ts: { slackChannelId: channelId, ts } },
    select: { id: true, reactions: true },
  });
  if (!row) return; // never archived (e.g. a bot message) — nothing to react to

  const reactions = (row.reactions as Record<string, { count: number; slackIds: string[] }> | null) ?? {};
  const entry = reactions[emoji] ?? { count: 0, slackIds: [] };
  const has = entry.slackIds.includes(slackId);

  if (added && !has) entry.slackIds.push(slackId);
  else if (!added && has) entry.slackIds = entry.slackIds.filter((id) => id !== slackId);
  else return; // already in the requested state

  entry.count = entry.slackIds.length;
  if (entry.count === 0) delete reactions[emoji];
  else reactions[emoji] = entry;

  await prisma.slackMessage.update({ where: { id: row.id }, data: { reactions } });
  activityBus.emit(`slack-chat:${channelId}`, { channelId, ts, kind: "reaction" });
}
