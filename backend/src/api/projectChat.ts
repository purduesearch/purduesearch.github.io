import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth, verifyBearerToken } from "./auth.js";
import { requireProjectChatRead } from "../middleware/projectChatAccess.js";
import { prisma } from "../db/prisma.js";
import {
  getStorageHealth,
  requeueFailedMirrors,
  sweepExpiringFiles,
} from "../services/slackFileService.js";
import { startBackfill, getBackfillStatus, backfillAllPublicChannels } from "../services/slackBackfillService.js";
import { joinAllPublicChannels } from "../services/slackMembershipService.js";
import { boltApp } from "../slack/bolt.js";

export const projectChatRouter = Router();

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

// ── fileProxyAuth — used by chat.ts's GET /api/chat/files/:slackFileId ──
// The project-scoped file route that used to live here was superseded by the
// conversation-scoped proxy in chat.ts; only its auth middleware remains.
//
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
export async function fileProxyAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
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

// ── POST /api/slack-archive/backfill-public ──────────────────
// Join every public channel, then import each one's history with the bot
// token. Both run in the background; each channel's backfill status shows
// progress. Operator step 3 in the portal plan.
slackArchiveAdminRouter.post("/backfill-public", requireAuth, requireArchiveAdmin, async (_req: Request, res: Response) => {
  try {
    void joinAllPublicChannels(boltApp.client)
      .then(() => backfillAllPublicChannels())
      .then((r) => console.log(`📚 [slackPortal] queued ${r.queued} public channel backfill(s)`))
      .catch((err) => console.error("[slackPortal] public backfill failed:", err));
    res.json({ started: true });
  } catch (error) {
    console.error("slack-archive/backfill-public error:", error);
    res.status(500).json({ error: "Failed to start public backfill" });
  }
});
