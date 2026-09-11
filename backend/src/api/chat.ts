import { pipeline } from "node:stream/promises";
import { Router, type Request, type Response } from "express";
import { requireAuth } from "./auth.js";
import { fileProxyAuth } from "./projectChat.js";
import { prisma } from "../db/prisma.js";
import { requireConversationRead, getConversationAccess } from "../middleware/conversationAccess.js";
import { canReadConversation, type ConversationKind } from "../services/slackConversationAccess.js";
import { buildFormatContext, loadMessages, toDto, previewText } from "../services/chatDto.js";
import { unreadCounts, markConversationRead } from "../services/slackReadService.js";
import { resolveFileStream } from "../services/slackFileService.js";

/**
 * /api/chat — the conversation-scoped Slack portal API.
 *
 * No pathless requireAuth on this router: the file proxy authenticates with a
 * `?token=` query param (an <img> cannot send headers), and app.ts mounts this
 * router above every bare /api router for the same reason. Every other route
 * names requireAuth explicitly. Every handler reads req.memberId, never
 * req.session.
 */
export const chatRouter = Router();

const PAGE_SIZE = 50;
const TS_RE = /^\d+\.\d+$/;
const isDmKind = (k: ConversationKind) => k === "IM" || k === "MPIM";

type Person = { memberId: string | null; slackId: string; displayName: string; avatarUrl: string | null };

/** Display identity for Slack user ids — Members first, else the last name they posted under. */
async function peopleFor(slackIds: string[]): Promise<Map<string, Person>> {
  const out = new Map<string, Person>();
  if (slackIds.length === 0) return out;
  const members = await prisma.member.findMany({
    where: { slackId: { in: slackIds } },
    select: { id: true, slackId: true, displayName: true, avatarUrl: true },
  });
  for (const m of members) out.set(m.slackId, { memberId: m.id, slackId: m.slackId, displayName: m.displayName, avatarUrl: m.avatarUrl });
  for (const id of slackIds) {
    if (out.has(id)) continue;
    const last = await prisma.slackMessage.findFirst({
      where: { authorSlackId: id },
      orderBy: { postedAt: "desc" },
      select: { authorName: true, authorAvatarUrl: true },
    });
    out.set(id, { memberId: null, slackId: id, displayName: last?.authorName ?? id, avatarUrl: last?.authorAvatarUrl ?? null });
  }
  return out;
}

/** Newest top-level message per conversation, one query. */
async function latestPreviews(channelIds: string[]): Promise<Map<string, { text: string; authorName: string; postedAt: Date }>> {
  if (channelIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<{ slackChannelId: string; text: string; authorName: string; postedAt: Date }[]>`
    SELECT DISTINCT ON ("slackChannelId") "slackChannelId", "text", "authorName", "postedAt"
    FROM "SlackMessage"
    WHERE "slackChannelId" = ANY(${channelIds}) AND "deletedAt" IS NULL AND "threadTs" IS NULL
    ORDER BY "slackChannelId", "postedAt" DESC`;
  const ctx = await buildFormatContext();
  return new Map(rows.map((r) => [r.slackChannelId, { text: previewText(r.text, ctx, 90), authorName: r.authorName, postedAt: r.postedAt }]));
}

// ── GET /api/chat/conversations ──────────────────────────────
// Every conversation the member may read: all public channels (joined or not),
// plus private channels, DMs and group DMs they are in.
chatRouter.get("/conversations", requireAuth, async (req: Request, res: Response) => {
  try {
    const me = await prisma.member.findUnique({
      where: { id: req.memberId! },
      select: { id: true, slackId: true, slackUserTokenAt: true, mutedSlackChannelIds: true },
    });
    if (!me) return void res.status(401).json({ error: "Not authenticated" });

    const myRows = await prisma.slackConversationMember.findMany({
      where: { slackUserId: me.slackId },
      select: { slackChannelId: true },
    });
    const mine = new Set(myRows.map((r) => r.slackChannelId));

    const archives = await prisma.slackChannelArchive.findMany({
      where: { archiveEnabled: true, OR: [{ kind: "CHANNEL" }, { slackChannelId: { in: [...mine] } }] },
      select: { slackChannelId: true, slackChannelName: true, kind: true, lastMessageAt: true },
      orderBy: { lastMessageAt: { sort: "desc", nulls: "last" } },
    });
    // Defense in depth: the query scopes, the pure rule decides.
    const readable = archives.filter((a) => canReadConversation({ kind: a.kind, isParticipant: mine.has(a.slackChannelId) }));
    const unread = await unreadCounts(me, readable.filter((a) => mine.has(a.slackChannelId)).map((a) => a.slackChannelId));
    const muted = new Set(me.mutedSlackChannelIds);

    const dmArchives = readable.filter((a) => isDmKind(a.kind));
    const dmIds = dmArchives.map((a) => a.slackChannelId);
    const parts = dmIds.length
      ? await prisma.slackConversationMember.findMany({
          where: { slackChannelId: { in: dmIds } },
          select: { slackChannelId: true, slackUserId: true },
        })
      : [];
    const people = await peopleFor([...new Set(parts.map((p) => p.slackUserId))]);
    const latest = await latestPreviews(dmIds);

    res.json({
      channels: readable
        .filter((a) => !isDmKind(a.kind))
        .map((a) => ({
          slackChannelId: a.slackChannelId,
          name: a.slackChannelName ?? a.slackChannelId,
          kind: a.kind,
          isMember: mine.has(a.slackChannelId),
          unread: unread[a.slackChannelId] ?? 0,
          lastMessageAt: a.lastMessageAt,
          muted: muted.has(a.slackChannelId),
        })),
      dms: dmArchives.map((a) => ({
        slackChannelId: a.slackChannelId,
        kind: a.kind,
        participants: parts
          .filter((p) => p.slackChannelId === a.slackChannelId && p.slackUserId !== me.slackId)
          .map((p) => people.get(p.slackUserId)!)
          .filter(Boolean),
        unread: unread[a.slackChannelId] ?? 0,
        lastMessageAt: a.lastMessageAt,
        preview: latest.get(a.slackChannelId) ?? null,
        muted: muted.has(a.slackChannelId),
      })),
    });
  } catch (error) {
    console.error("chat/conversations error:", error);
    res.status(500).json({ error: "Failed to list conversations" });
  }
});

// ── GET /api/chat/conversations/:channelId ───────────────────
chatRouter.get("/conversations/:channelId", requireAuth, requireConversationRead, async (req: Request, res: Response) => {
  try {
    const c = req.conversation!;
    const [archive, me] = await Promise.all([
      prisma.slackChannelArchive.findUnique({
        where: { slackChannelId: c.channelId },
        select: { slackChannelName: true, backfillStatus: true },
      }),
      prisma.member.findUnique({ where: { id: req.memberId! }, select: { mutedSlackChannelIds: true } }),
    ]);
    let participants: Person[] = [];
    if (c.kind && isDmKind(c.kind)) {
      const parts = await prisma.slackConversationMember.findMany({
        where: { slackChannelId: c.channelId },
        select: { slackUserId: true },
      });
      const people = await peopleFor(parts.map((p) => p.slackUserId).filter((id) => id !== c.slackId));
      participants = [...people.values()];
    }
    res.json({
      slackChannelId: c.channelId,
      name: archive?.slackChannelName ?? null,
      kind: c.kind,
      isParticipant: c.isParticipant,
      canPost: c.canPost,
      muted: (me?.mutedSlackChannelIds ?? []).includes(c.channelId),
      backfillStatus: archive?.backfillStatus ?? "NOT_STARTED",
      participants,
    });
  } catch (error) {
    console.error("chat/conversation error:", error);
    res.status(500).json({ error: "Failed to load conversation" });
  }
});

// ── GET /api/chat/conversations/:channelId/messages ──────────
// Reverse-chronological page of TOP-LEVEL messages, returned oldest-first.
chatRouter.get("/conversations/:channelId/messages", requireAuth, requireConversationRead, async (req: Request, res: Response) => {
  try {
    const c = req.conversation!;
    const before = typeof req.query.before === "string" && TS_RE.test(req.query.before) ? req.query.before : null;
    const where: Record<string, unknown> = { slackChannelId: c.channelId, threadTs: null };
    if (before) where.postedAt = { lt: new Date(Math.round(parseFloat(before) * 1000)) };

    const rows = await loadMessages(where, PAGE_SIZE + 1);
    const hasMore = rows.length > PAGE_SIZE;
    const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
    const ctx = await buildFormatContext();
    res.json({ channelId: c.channelId, hasMore, messages: page.map((r) => toDto(r, ctx, c.slackId)).reverse() });
  } catch (error) {
    console.error("chat/messages error:", error);
    res.status(500).json({ error: "Failed to load messages" });
  }
});

// ── GET /api/chat/conversations/:channelId/thread/:ts ────────
chatRouter.get("/conversations/:channelId/thread/:ts", requireAuth, requireConversationRead, async (req: Request, res: Response) => {
  try {
    const c = req.conversation!;
    const ts = req.params.ts as string;
    if (!TS_RE.test(ts)) return void res.status(400).json({ error: "Bad ts" });
    const rows = await loadMessages({ slackChannelId: c.channelId, OR: [{ ts }, { threadTs: ts }] }, 500, true);
    const ctx = await buildFormatContext();
    res.json({ messages: rows.map((r) => toDto(r, ctx, c.slackId)) });
  } catch (error) {
    console.error("chat/thread error:", error);
    res.status(500).json({ error: "Failed to load thread" });
  }
});

// ── GET /api/chat/conversations/:channelId/search ────────────
chatRouter.get("/conversations/:channelId/search", requireAuth, requireConversationRead, async (req: Request, res: Response) => {
  try {
    const c = req.conversation!;
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (q.length < 2) return void res.json({ messages: [] });
    const rows = await loadMessages(
      { slackChannelId: c.channelId, deletedAt: null, text: { contains: q, mode: "insensitive" } },
      50
    );
    const ctx = await buildFormatContext();
    res.json({ messages: rows.map((r) => toDto(r, ctx, c.slackId)) });
  } catch (error) {
    console.error("chat/search error:", error);
    res.status(500).json({ error: "Search failed" });
  }
});

// ── POST /api/chat/conversations/:channelId/read ─────────────
// The member has seen the conversation up to `ts`. Moves our cursor and
// Slack's (D11). Reading a public channel you are not in has no cursor.
chatRouter.post("/conversations/:channelId/read", requireAuth, requireConversationRead, async (req: Request, res: Response) => {
  try {
    const c = req.conversation!;
    const ts = typeof req.body?.ts === "string" ? req.body.ts : "";
    if (!TS_RE.test(ts)) return void res.status(400).json({ error: "Bad ts" });
    if (!c.isParticipant) return void res.json({ advanced: false });
    res.json(await markConversationRead(req.memberId!, c.channelId, ts, { pushToSlack: true }));
  } catch (error) {
    console.error("chat/read error:", error);
    res.status(500).json({ error: "Failed to mark read" });
  }
});

// ── GET /api/chat/files/:slackFileId ─────────────────────────
// Streams an attachment after checking the viewer may read its conversation.
// `?token=` for <img> tags (Brave/Safari Bearer users) — see fileProxyAuth.
chatRouter.get("/files/:slackFileId", fileProxyAuth, async (req: Request, res: Response) => {
  try {
    const memberId = req.memberId;
    if (!memberId) return void res.status(401).json({ error: "Not authenticated" });
    const slackFileId = req.params.slackFileId as string;
    const file = await prisma.slackMessageFile.findUnique({
      where: { slackFileId },
      select: { message: { select: { slackChannelId: true } } },
    });
    if (!file) return void res.status(404).json({ error: "Not found" });
    const access = await getConversationAccess(memberId, file.message.slackChannelId);
    if (!access.canRead) return void res.status(404).json({ error: "Not found" });

    const resolved = await resolveFileStream(slackFileId, memberId);
    if (!resolved.ok) return void res.status(resolved.status).json({ error: resolved.detail });

    res.setHeader("Content-Type", resolved.mimeType);
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(resolved.fileName)}"`);
    // Uploaded .html/.svg would otherwise be stored XSS on the API origin.
    res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
    res.setHeader("X-Content-Type-Options", "nosniff");
    await pipeline(resolved.stream, res);
  } catch (error) {
    console.error("chat/files error:", error);
    if (!res.headersSent) res.status(500).json({ error: "Failed to load file" });
    else res.destroy();
  }
});
