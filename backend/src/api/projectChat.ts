import { Router, type Request, type Response } from "express";
import { requireAuth } from "./auth.js";
import { requireProjectChatRead } from "../middleware/projectChatAccess.js";
import { prisma } from "../db/prisma.js";
import { formatSlackText, type FormatContext } from "../services/slackMessageFormat.js";

export const projectChatRouter = Router();

const PAGE_SIZE = 50;

/** Reject a channelId that isn't one of the project's own. */
function requestedChannel(req: Request): string | null {
  const wanted = typeof req.query.channelId === "string" ? req.query.channelId : null;
  const allowed = req.chatChannelIds ?? [];
  if (wanted) return allowed.includes(wanted) ? wanted : null;
  return allowed[0] ?? null;
}

/**
 * Build the mention/emoji lookup for a page of messages. One query per page
 * rather than one per message — the reason this project parses on read.
 */
async function buildFormatContext(): Promise<FormatContext> {
  // Member.slackId is non-nullable in this schema, so every row carries one.
  const members = await prisma.member.findMany({
    select: { slackId: true, displayName: true },
  });
  const memberNames: Record<string, string> = {};
  for (const m of members) if (m.slackId) memberNames[m.slackId] = m.displayName;

  // Custom emoji urls arrive in Task 5 (slackFileService.getCustomEmoji()).
  return { memberNames, emojiUrls: {} };
}

type MessageRow = Awaited<ReturnType<typeof loadMessages>>[number];

async function loadMessages(where: Record<string, unknown>, take: number, asc = false) {
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

function toDto(row: MessageRow, ctx: FormatContext) {
  const reactions = (row.reactions as Record<string, { count: number }> | null) ?? {};
  return {
    id: row.id,
    ts: row.ts,
    threadTs: row.threadTs,
    replyCount: row.replyCount,
    authorName: row.authorName,
    authorAvatarUrl: row.authorAvatarUrl,
    memberId: row.memberId,
    tokens: row.deletedAt ? [] : formatSlackText(row.text, ctx),
    editedAt: row.editedAt,
    deletedAt: row.deletedAt,
    postedAt: row.postedAt,
    reactions: Object.entries(reactions).map(([emoji, v]) => ({ emoji, count: v.count })),
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

// ── GET /api/projects/:projectId/chat/channels ───────────────
projectChatRouter.get(
  "/:projectId/chat/channels",
  requireAuth,
  requireProjectChatRead,
  async (req: Request, res: Response) => {
    try {
      const ids = req.chatChannelIds ?? [];
      const archives = await prisma.slackChannelArchive.findMany({
        where: { slackChannelId: { in: ids } },
      });
      const byId = new Map(archives.map((a) => [a.slackChannelId, a]));

      res.json({
        channels: ids.map((id) => {
          const a = byId.get(id);
          return {
            slackChannelId: id,
            name: a?.slackChannelName ?? id,
            isPrivate: a?.isPrivate ?? false,
            messageCount: a?.messageCount ?? 0,
            lastMessageAt: a?.lastMessageAt ?? null,
            backfillStatus: a?.backfillStatus ?? "NOT_STARTED",
            archived: !!a,
          };
        }),
        isAdmin: !!req.chatIsAdmin,
      });
    } catch (error) {
      console.error("chat/channels error:", error);
      res.status(500).json({ error: "Failed to list chat channels" });
    }
  }
);

// ── GET /api/projects/:projectId/chat/messages ───────────────
// Reverse-chronological page of TOP-LEVEL messages. `before` is a Slack ts.
projectChatRouter.get(
  "/:projectId/chat/messages",
  requireAuth,
  requireProjectChatRead,
  async (req: Request, res: Response) => {
    try {
      const channelId = requestedChannel(req);
      if (!channelId) { res.json({ messages: [], hasMore: false, channelId: null }); return; }

      const before = typeof req.query.before === "string" ? req.query.before : null;
      const where: Record<string, unknown> = { slackChannelId: channelId, threadTs: null };
      if (before) where.postedAt = { lt: new Date(Math.round(parseFloat(before) * 1000)) };

      const rows = await loadMessages(where, PAGE_SIZE + 1);
      const hasMore = rows.length > PAGE_SIZE;
      const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
      const ctx = await buildFormatContext();

      // Oldest-first for rendering; the client prepends older pages.
      res.json({
        channelId,
        hasMore,
        messages: page.map((r) => toDto(r, ctx)).reverse(),
      });
    } catch (error) {
      console.error("chat/messages error:", error);
      res.status(500).json({ error: "Failed to load messages" });
    }
  }
);

// ── GET /api/projects/:projectId/chat/thread/:ts ─────────────
projectChatRouter.get(
  "/:projectId/chat/thread/:ts",
  requireAuth,
  requireProjectChatRead,
  async (req: Request, res: Response) => {
    try {
      const channelId = requestedChannel(req);
      if (!channelId) { res.status(404).json({ error: "No channel" }); return; }

      const ts = req.params.ts as string;
      const rows = await loadMessages(
        { slackChannelId: channelId, OR: [{ ts }, { threadTs: ts }] },
        200,
        true
      );
      const ctx = await buildFormatContext();
      res.json({ messages: rows.map((r) => toDto(r, ctx)) });
    } catch (error) {
      console.error("chat/thread error:", error);
      res.status(500).json({ error: "Failed to load thread" });
    }
  }
);

// ── GET /api/projects/:projectId/chat/search ─────────────────
projectChatRouter.get(
  "/:projectId/chat/search",
  requireAuth,
  requireProjectChatRead,
  async (req: Request, res: Response) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
      if (q.length < 2) { res.json({ messages: [] }); return; }

      const channelId = requestedChannel(req);
      const ids = channelId ? [channelId] : (req.chatChannelIds ?? []);
      if (ids.length === 0) { res.json({ messages: [] }); return; }

      const rows = await loadMessages(
        {
          slackChannelId: { in: ids },
          deletedAt: null,
          text: { contains: q, mode: "insensitive" },
        },
        50
      );
      const ctx = await buildFormatContext();
      res.json({ messages: rows.map((r) => toDto(r, ctx)) });
    } catch (error) {
      console.error("chat/search error:", error);
      res.status(500).json({ error: "Search failed" });
    }
  }
);
