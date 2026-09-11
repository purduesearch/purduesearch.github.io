import type { WebClient } from "@slack/web-api";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { activityBus } from "./activityService.js";
import { shouldArchive, type RawSlackMessage } from "./slackArchivePolicy.js";
import { getBotUserId } from "./memberService.js";
import {
  kindFromChannelType, kindFromConversation, kindFromChannelId, type ConversationKind,
} from "./slackConversationAccess.js";

// ── Caches ───────────────────────────────────────────────────
// Ingest runs on every message in every conversation, so both hot paths are
// cached rather than hitting Postgres/Slack per message.

const ENABLED_TTL_MS = 5 * 60_000;
const AUTHOR_TTL_MS = 30 * 60_000;

const enabledCache = new Map<string, { enabled: boolean; at: number }>();
export type Author = { authorName: string; authorAvatarUrl: string | null; memberId: string | null };
const authorCache = new Map<string, Author & { at: number }>();

/** Test seam + a way for an admin toggle to take effect before the TTL. */
export function clearSlackArchiveCaches(): void {
  enabledCache.clear();
  authorCache.clear();
}

/**
 * Since the portal pass the scope is EVERY conversation. An admin can still
 * switch one off by setting archiveEnabled = false on its row. No row yet
 * means enabled.
 */
export async function isIngestEnabled(channelId: string): Promise<boolean> {
  const hit = enabledCache.get(channelId);
  if (hit && Date.now() - hit.at < ENABLED_TTL_MS) return hit.enabled;
  const row = await prisma.slackChannelArchive.findUnique({
    where: { slackChannelId: channelId },
    select: { archiveEnabled: true },
  });
  const enabled = row?.archiveEnabled ?? true;
  enabledCache.set(channelId, { enabled, at: Date.now() });
  return enabled;
}

/**
 * Resolve a Slack user to a display name + avatar, WITHOUT creating a Member.
 * (memberService.resolveSlackMember() creates one — wrong here: a guest's
 * message would silently add them to the roster and the assignee pickers.)
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

/** Display identity for a bot/app message — from the payload, never a Member lookup. */
export function botAuthor(msg: RawSlackMessage): Author {
  return {
    authorName: msg.bot_profile?.name || msg.username || "App",
    authorAvatarUrl: msg.bot_profile?.icons?.image_48 ?? null,
    memberId: null,
  };
}

const UNKNOWN_AUTHOR: Author = { authorName: "Unknown", authorAvatarUrl: null, memberId: null };

type ConversationInfo = {
  name?: string; is_im?: boolean; is_mpim?: boolean; is_private?: boolean; is_group?: boolean; is_channel?: boolean;
};

/**
 * Find or create the conversation's archive row.
 *
 * `hint.kind` (from the event's channel_type) is preferred: the bot cannot call
 * conversations.info on a member's DM. With nothing known, kind falls back to
 * kindFromChannelId, which fails CLOSED (private). upsert rather than create,
 * because two events for a brand-new channel can race here.
 */
export async function ensureChannelArchive(
  channelId: string,
  client: WebClient,
  hint: { kind?: ConversationKind; name?: string | null } = {}
): Promise<{ id: string; slackChannelName: string | null; kind: ConversationKind }> {
  const existing = await prisma.slackChannelArchive.findUnique({
    where: { slackChannelId: channelId },
    select: { id: true, slackChannelName: true, kind: true },
  });
  if (existing) return existing;

  let kind: ConversationKind | null = hint.kind ?? null;
  let name: string | null = hint.name ?? null;
  const isDm = kind === "IM" || kind === "MPIM";
  if (!isDm && (!kind || !name)) {
    try {
      const info = await client.conversations.info({ channel: channelId });
      const c = (info.channel ?? {}) as ConversationInfo;
      kind = kind ?? kindFromConversation(c);
      name = name ?? c.name ?? null;
    } catch {
      // Bot not in it, or a DM — keep whatever we have.
    }
  }
  const finalKind = kind ?? kindFromChannelId(channelId);

  return prisma.slackChannelArchive.upsert({
    where: { slackChannelId: channelId },
    create: { slackChannelId: channelId, slackChannelName: name, isPrivate: finalKind !== "CHANNEL", kind: finalKind },
    update: {},
    select: { id: true, slackChannelName: true, kind: true },
  });
}

/** Slack ts ("1725900000.001200") → Date. */
function tsToDate(ts: string): Date {
  return new Date(Math.round(parseFloat(ts) * 1000));
}

type SlackFilePayload = {
  id?: string; name?: string; title?: string; mimetype?: string; size?: number; original_w?: number; original_h?: number;
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
      // undo a completed mirror.
      update: { name: f.name || f.title || f.id, mimeType: f.mimetype ?? null },
    });
  }
}

/** Recompute (never increment) a parent's reply count — replay-safe. */
async function refreshReplyCount(slackChannelId: string, threadTs: string): Promise<void> {
  const count = await prisma.slackMessage.count({
    where: { slackChannelId, threadTs, deletedAt: null, NOT: { ts: threadTs } },
  });
  await prisma.slackMessage.updateMany({
    where: { slackChannelId, ts: threadTs },
    data: { replyCount: count },
  });
}

function botPayloadOf(m: { blocks?: unknown[]; attachments?: unknown[] }): Prisma.InputJsonValue | null {
  const blocks = Array.isArray(m.blocks) ? m.blocks : [];
  const attachments = Array.isArray(m.attachments) ? m.attachments : [];
  if (blocks.length === 0 && attachments.length === 0) return null;
  return { blocks, attachments } as Prisma.InputJsonValue;
}

/**
 * Upsert one message row plus its files. Shared by live ingest, backfill, and
 * the send path so all three write identical rows.
 *
 * overwrite  — live ingest and the send path refresh text/payload; backfill
 *              never clobbers a live-ingested row.
 * forceHuman — the send path KNOWS a human wrote this (D7), whatever flags
 *              Slack's echo carries, so it pins isBot = false.
 * The archive row must already exist (ensureChannelArchive).
 */
export async function storeArchivedMessage(
  channelId: string,
  msg: RawSlackMessage,
  isBot: boolean,
  client: WebClient,
  opts: { overwrite: boolean; forceHuman?: boolean }
): Promise<{ id: string; ts: string; threadTs: string | null; postedAt: Date } | null> {
  const ts = msg.ts;
  if (!ts) return null;

  const author = isBot ? botAuthor(msg) : msg.user ? await resolveAuthor(msg.user, client) : UNKNOWN_AUTHOR;
  const postedAt = tsToDate(ts);
  const threadTs = msg.thread_ts && msg.thread_ts !== ts ? msg.thread_ts : null;
  const botPayload = isBot ? botPayloadOf(msg) : null;

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
      isBot,
      ...(botPayload ? { botPayload } : {}),
    },
    // isBot is set on CREATE only (plus forceHuman), so a late echo can never
    // flip a human row to bot.
    update: opts.overwrite
      ? {
          text: msg.text ?? "",
          ...(opts.forceHuman ? { isBot: false } : {}),
          ...(botPayload ? { botPayload } : {}),
        }
      : {},
    select: { id: true },
  });

  if (Array.isArray(msg.files) && msg.files.length > 0) {
    await upsertFiles(row.id, postedAt, msg.files);
  }
  if (threadTs) await refreshReplyCount(channelId, threadTs);

  // Forward-only: backfill walks BACKWARDS through history and must not drag
  // lastMessageAt into the past.
  await prisma.slackChannelArchive.updateMany({
    where: { slackChannelId: channelId, OR: [{ lastMessageAt: null }, { lastMessageAt: { lt: postedAt } }] },
    data: { lastMessageAt: postedAt },
  });
  if (opts.overwrite) {
    await prisma.slackChannelArchive.update({
      where: { slackChannelId: channelId },
      data: { messageCount: await prisma.slackMessage.count({ where: { slackChannelId: channelId } }) },
    });
  }

  return { id: row.id, ts, threadTs, postedAt };
}

// ── Live events ──────────────────────────────────────────────

export type ChatEventKind = "new" | "edit" | "delete" | "reaction";
export interface ChatEvent {
  channelId: string;
  convKind: ConversationKind;
  ts: string;
  threadTs?: string | null;
  kind: ChatEventKind;
}

/**
 * The ONE place the archive announces a change. Ids only, never text: sse.ts
 * filters each event per connection, and the client re-fetches through the
 * access-checked API.
 */
export function emitChat(e: ChatEvent): void {
  activityBus.emit("slack-chat", e);
}

export interface IngestResult {
  channelId: string;
  convKind: ConversationKind;
  event: "new" | "edit" | "delete";
  ts: string;
  threadTs: string | null;
  isBot: boolean;
  authorSlackId: string | null;
  /** The message's bot_id, if any — lets ping delivery recognise our OWN bot (D9). */
  botId: string | null;
  text: string;
}

/**
 * Persist one Slack message event. Safe to call for every message in every
 * conversation. Returns what happened so the caller (slack/events.ts) can run
 * membership and ping delivery after it — ingest itself never notifies (D10).
 */
export async function ingestSlackMessage(
  msg: RawSlackMessage & { channel?: string },
  client: WebClient
): Promise<IngestResult | null> {
  const channelId = msg.channel;
  if (!channelId) return null;
  if (!(await isIngestEnabled(channelId))) return null;

  const botUserId = (await getBotUserId(client)) ?? undefined;
  const decision = shouldArchive(msg, botUserId);
  if (!decision.archive) return null;

  const archive = await ensureChannelArchive(channelId, client, {
    kind: msg.channel_type ? kindFromChannelType(msg.channel_type) : undefined,
  });
  const convKind = archive.kind;

  if (decision.kind === "delete") {
    const ts = msg.deleted_ts || msg.previous_message?.ts;
    if (!ts) return null;
    await prisma.slackMessage.updateMany({
      where: { slackChannelId: channelId, ts },
      data: { deletedAt: new Date() },
    });
    const gone = await prisma.slackMessage.findUnique({
      where: { slackChannelId_ts: { slackChannelId: channelId, ts } },
      select: { threadTs: true },
    });
    if (gone?.threadTs) await refreshReplyCount(channelId, gone.threadTs);
    emitChat({ channelId, convKind, ts, kind: "delete" });
    return { channelId, convKind, event: "delete", ts, threadTs: gone?.threadTs ?? null, isBot: false, authorSlackId: null, botId: null, text: "" };
  }

  if (decision.kind === "edit") {
    const inner = msg.message!;
    const ts = inner.ts!;
    const botPayload = decision.isBot ? botPayloadOf(inner) : null;
    await prisma.slackMessage.updateMany({
      where: { slackChannelId: channelId, ts },
      data: {
        text: inner.text ?? "",
        // message_changed also fires for link unfurls; only a real edit carries `edited`.
        ...(inner.edited ? { editedAt: new Date() } : {}),
        ...(botPayload ? { botPayload } : {}),
      },
    });
    const threadTs = inner.thread_ts && inner.thread_ts !== ts ? inner.thread_ts : null;
    emitChat({ channelId, convKind, ts, threadTs, kind: "edit" });
    return {
      channelId, convKind, event: "edit", ts, threadTs, isBot: decision.isBot,
      authorSlackId: inner.user ?? null, botId: inner.bot_id ?? null, text: inner.text ?? "",
    };
  }

  const stored = await storeArchivedMessage(channelId, msg, decision.isBot, client, { overwrite: true });
  if (!stored) return null;
  emitChat({ channelId, convKind, ts: stored.ts, threadTs: stored.threadTs, kind: "new" });
  return {
    channelId, convKind, event: "new", ts: stored.ts, threadTs: stored.threadTs,
    isBot: decision.isBot, authorSlackId: msg.user ?? null, botId: msg.bot_id ?? null, text: msg.text ?? "",
  };
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
  if (!(await isIngestEnabled(channelId))) return;

  const row = await prisma.slackMessage.findUnique({
    where: { slackChannelId_ts: { slackChannelId: channelId, ts } },
    select: { id: true, reactions: true },
  });
  if (!row) return; // never archived — nothing to react to

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
  const archive = await prisma.slackChannelArchive.findUnique({
    where: { slackChannelId: channelId },
    select: { kind: true },
  });
  emitChat({ channelId, convKind: archive?.kind ?? "PRIVATE_CHANNEL", ts, kind: "reaction" });
}
