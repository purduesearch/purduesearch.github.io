import { prisma } from "../db/prisma.js";
import { formatSlackText, type FormatContext, type SlackToken } from "./slackMessageFormat.js";
import { getCustomEmoji } from "./slackFileService.js";

/**
 * Mention names, channel names and custom emoji for one page of messages, in
 * one pass rather than per message — the reason the archive parses on read.
 * Only PUBLIC channel names are offered for <#C…> fallback labels, so a message
 * can never reveal a private channel's name to someone outside it.
 */
export async function buildFormatContext(): Promise<FormatContext> {
  const [members, channels] = await Promise.all([
    prisma.member.findMany({ select: { slackId: true, displayName: true } }),
    prisma.slackChannelArchive.findMany({
      where: { kind: "CHANNEL", slackChannelName: { not: null } },
      select: { slackChannelId: true, slackChannelName: true },
    }),
  ]);
  const memberNames: Record<string, string> = {};
  for (const m of members) if (m.slackId) memberNames[m.slackId] = m.displayName;
  const channelNames: Record<string, string> = {};
  for (const c of channels) if (c.slackChannelName) channelNames[c.slackChannelId] = c.slackChannelName;
  return { memberNames, channelNames, emojiUrls: await getCustomEmoji() };
}

export async function loadMessages(where: Record<string, unknown>, take: number, asc = false) {
  return prisma.slackMessage.findMany({
    where,
    orderBy: { postedAt: asc ? "asc" : "desc" },
    take,
    include: {
      files: {
        select: {
          id: true, slackFileId: true, name: true, mimeType: true, sizeBytes: true,
          isImage: true, width: true, height: true, storage: true,
        },
      },
    },
  });
}

export type MessageRow = Awaited<ReturnType<typeof loadMessages>>[number];

/** `viewerSlackId` lets each reaction say whether the viewer is on it (for toggling). */
export function toDto(row: MessageRow, ctx: FormatContext, viewerSlackId?: string | null) {
  const reactions = (row.reactions as Record<string, { count: number; slackIds?: string[] }> | null) ?? {};
  return {
    id: row.id,
    ts: row.ts,
    threadTs: row.threadTs,
    replyCount: row.replyCount,
    authorName: row.authorName,
    authorAvatarUrl: row.authorAvatarUrl,
    authorSlackId: row.authorSlackId,
    memberId: row.memberId,
    isBot: row.isBot,
    tokens: row.deletedAt ? [] : formatSlackText(row.text, ctx),
    editedAt: row.editedAt,
    deletedAt: row.deletedAt,
    postedAt: row.postedAt,
    reactions: Object.entries(reactions).map(([emoji, v]) => {
      const name = emoji.replace(/^:+|:+$/g, "");
      return {
        emoji,
        name,
        count: v.count,
        mine: !!viewerSlackId && (v.slackIds ?? []).includes(viewerSlackId),
        url: ctx.emojiUrls?.[name.split("::")[0]] ?? null,
      };
    }),
    files: row.deletedAt ? [] : row.files.map((f) => ({
      id: f.slackFileId,
      name: f.name,
      mimeType: f.mimeType,
      sizeBytes: f.sizeBytes,
      isImage: f.isImage,
      width: f.width,
      height: f.height,
      storage: f.storage,
    })),
  };
}

export type MessageDto = ReturnType<typeof toDto>;

export function tokensToPlain(tokens: SlackToken[]): string {
  return tokens
    .map((t) => {
      switch (t.type) {
        case "text":
        case "code":
        case "codeblock":
          return t.value;
        case "mention": return `@${t.label}`;
        case "channel": return `#${t.label}`;
        case "link": return t.label;
        case "emoji": return `:${t.name}:`;
        case "bold":
        case "italic":
        case "strike":
          return tokensToPlain(t.children);
      }
    })
    .join("");
}

/** One-line plain-text preview (inbox rows, notification text). */
export function previewText(raw: string, ctx: FormatContext, max = 140): string {
  const plain = tokensToPlain(formatSlackText(raw, ctx)).replace(/\s+/g, " ").trim();
  return plain.length > max ? `${plain.slice(0, max - 1)}…` : plain;
}
