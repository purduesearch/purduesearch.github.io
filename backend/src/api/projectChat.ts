import { pipeline } from "node:stream/promises";
import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth, verifyBearerToken } from "./auth.js";
import { requireProjectChatRead, getProjectChatAccess } from "../middleware/projectChatAccess.js";
import { prisma } from "../db/prisma.js";
import { buildFormatContext, loadMessages, toDto } from "../services/chatDto.js";
import {
  resolveFileStream,
  getStorageHealth,
  requeueFailedMirrors,
  sweepExpiringFiles,
} from "../services/slackFileService.js";
import { startBackfill, getBackfillStatus } from "../services/slackBackfillService.js";

export const projectChatRouter = Router();

const PAGE_SIZE = 50;

/** Reject a channelId that isn't one of the project's own. */
function requestedChannel(req: Request): string | null {
  const wanted = typeof req.query.channelId === "string" ? req.query.channelId : null;
  const allowed = req.chatChannelIds ?? [];
  if (wanted) return allowed.includes(wanted) ? wanted : null;
  return allowed[0] ?? null;
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

// ── GET /api/projects/:projectId/chat/files/:slackFileId ─────
// An <img> tag cannot set an Authorization header, so Bearer-token users
// (Brave, Safari — the exact browsers the Bearer fallback exists for) would
// find EVERY image in the archive broken while it worked fine in Chrome.
// The signed `?token=` query param is the same escape hatch sse.ts uses.
//
// Deliberately NOT behind a bare requireAuth: that would 401 a valid ?token=
// request carrying no cookie and no header before this route ever ran. And
// req.memberId is only ever set by auth middleware, so the route cannot simply
// "check req.memberId first" without one — it would always be undefined here.
// Same shape as sse.ts's streamAuth: a valid query token wins, otherwise
// requireAuth resolves the Authorization header or session cookie as usual.
async function fileProxyAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const queryToken = typeof req.query.token === "string" ? req.query.token : undefined;
  if (queryToken) {
    const memberId = await verifyBearerToken(queryToken);
    if (memberId) {
      req.memberId = memberId;
      return next();
    }
  }
  return requireAuth(req, res, next);
}

projectChatRouter.get(
  "/:projectId/chat/files/:slackFileId",
  fileProxyAuth,
  async (req: Request, res: Response) => {
    try {
      const memberId = req.memberId;
      if (!memberId) return void res.status(401).json({ error: "Not authenticated" });

      const projectId = req.params.projectId as string;
      const { canRead, channelIds } = await getProjectChatAccess(memberId, projectId);
      if (!canRead) return void res.status(403).json({ error: "No access" });

      const slackFileId = req.params.slackFileId as string;
      const file = await prisma.slackMessageFile.findUnique({
        where: { slackFileId },
        select: { message: { select: { slackChannelId: true } } },
      });
      // Scope the proxy to the project's own channels — this route serves the
      // actual private content, so it gets the same check as the read routes.
      if (!file || !channelIds.includes(file.message.slackChannelId)) {
        return void res.status(404).json({ error: "Not found" });
      }

      const resolved = await resolveFileStream(slackFileId, memberId);
      if (!resolved.ok) {
        return void res.status(resolved.status).json({ error: resolved.detail });
      }

      res.setHeader("Content-Type", resolved.mimeType);
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(resolved.fileName)}"`);
      // Anyone in a linked channel can upload an .html/.svg/.js file, and this
      // serves it inline from the API origin where the session cookie lives.
      // Helmet's default CSP still allows script-src 'self', so without this a
      // pair of uploads is stored XSS. `sandbox` gives the document an opaque
      // origin; <img> embedding is unaffected.
      res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
      res.setHeader("X-Content-Type-Options", "nosniff");
      // pipeline, not pipe: a Drive/Slack stream erroring mid-body would
      // otherwise be an unhandled 'error' event and take the process down.
      await pipeline(resolved.stream, res);
    } catch (error) {
      console.error("chat/files error:", error);
      if (!res.headersSent) res.status(500).json({ error: "Failed to load file" });
      else res.destroy();
    }
  }
);

// ── GET /api/projects/:projectId/chat/storage-health ─────────
projectChatRouter.get(
  "/:projectId/chat/storage-health",
  requireAuth,
  requireProjectChatRead,
  async (req: Request, res: Response) => {
    if (!req.chatIsAdmin) return void res.status(403).json({ error: "Admin only" });
    try {
      res.json(await getStorageHealth());
    } catch (error) {
      console.error("chat/storage-health error:", error);
      res.status(500).json({ error: "Failed to read storage health" });
    }
  }
);

// ── POST /api/projects/:projectId/chat/backfill ──────────────
projectChatRouter.post(
  "/:projectId/chat/backfill",
  requireAuth,
  requireProjectChatRead,
  async (req: Request, res: Response) => {
    if (!req.chatIsAdmin) return void res.status(403).json({ error: "Admin only" });
    try {
      const channelId = typeof req.body?.channelId === "string" ? req.body.channelId : null;
      if (!channelId || !(req.chatChannelIds ?? []).includes(channelId)) {
        return void res.status(400).json({ error: "channelId is not linked to this project" });
      }
      res.json(await startBackfill(channelId, { requesterMemberId: req.memberId }));
    } catch (error) {
      console.error("chat/backfill error:", error);
      res.status(500).json({ error: "Failed to start backfill" });
    }
  }
);

// ── GET /api/projects/:projectId/chat/backfill/:channelId ────
projectChatRouter.get(
  "/:projectId/chat/backfill/:channelId",
  requireAuth,
  requireProjectChatRead,
  async (req: Request, res: Response) => {
    try {
      const channelId = req.params.channelId as string;
      if (!(req.chatChannelIds ?? []).includes(channelId)) {
        return void res.status(404).json({ error: "Not found" });
      }
      res.json(await getBackfillStatus(channelId));
    } catch (error) {
      console.error("chat/backfill status error:", error);
      res.status(500).json({ error: "Failed to read backfill status" });
    }
  }
);

// ── GET /api/slack-archive/health ────────────────────────────
// Global counts for the admin page. Exported separately from the
// project-scoped route because the numbers are workspace-wide, and the admin
// page should not have to name an arbitrary project to see them.
export const slackArchiveAdminRouter = Router();

async function requireArchiveAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const member = await prisma.member.findUnique({
      where: { id: req.memberId! },
      select: { isAdmin: true },
    });
    if (!member?.isAdmin) return void res.status(403).json({ error: "Admin only" });
    next();
  } catch (error) {
    console.error("slack-archive admin check error:", error);
    res.status(500).json({ error: "Failed to verify admin" });
  }
}

slackArchiveAdminRouter.get("/health", requireAuth, requireArchiveAdmin, async (_req: Request, res: Response) => {
  try {
    res.json(await getStorageHealth());
  } catch (error) {
    console.error("slack-archive/health error:", error);
    res.status(500).json({ error: "Failed to read storage health" });
  }
});

// ── POST /api/slack-archive/retry-failed ─────────────────────
// Requeue every MIRROR_FAILED row and start a sweep now rather than at 03:40,
// so an admin who just fixed the cause (reconnected Drive, freed quota) sees
// the result on refresh. The sweep runs in the background — a 200-file batch
// would outlive the proxy's request timeout — and is single-flight, so this
// cannot race the nightly cron into double-uploading.
slackArchiveAdminRouter.post("/retry-failed", requireAuth, requireArchiveAdmin, async (_req: Request, res: Response) => {
  try {
    const requeued = await requeueFailedMirrors();
    if (requeued > 0) {
      sweepExpiringFiles()
        .then((t) => console.log(
          `📦 [slackArchive] retry sweep: ${t.swept} file(s) — ${t.drive} to Drive, ` +
          `${t.local} to disk, ${t.unavailable} already gone, ${t.failed} failed`
        ))
        .catch((err) => console.error("[slackArchive] retry sweep failed:", err));
    }
    res.json({ requeued });
  } catch (error) {
    console.error("slack-archive/retry-failed error:", error);
    res.status(500).json({ error: "Failed to requeue mirrors" });
  }
});
