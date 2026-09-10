import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth, verifyBearerToken } from "./auth.js";
import { activityBus } from "../services/activityService.js";
import { prisma } from "../db/prisma.js";
import { unionChannelIds } from "../middleware/projectChatAccess.js";

export const sseRouter = Router();

// EventSource cannot set an Authorization header, so Bearer-token users
// (cookie-blocked browsers, e.g. Brave) authenticate the stream via a signed
// `?token=` query param instead. Check that first — ahead of requireAuth — so
// a valid query token can satisfy auth even when there's no session cookie or
// Authorization header for requireAuth to fall back on. requireAuth still
// handles the normal cookie/header case for everyone else.
//
// Scoped to the /stream route (not a pathless router.use) so non-stream
// /api/notifications/* requests fall straight through this router to
// notificationsRouter without a second auth pass. NOTE: sseRouter MUST be
// mounted in app.ts BEFORE notificationsRouter AND before every bare
// app.use("/api", …) router — each of those attaches a pathless requireAuth
// that would 401 a valid ?token= EventSource (no cookie, no header) before it
// ever reached this handler. src/appMountOrder.test.ts enforces both.
async function streamAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
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

// ── GET /api/notifications/stream ───────────────────────────
// SSE stream: sends new notification events in real time to the authenticated member.
sseRouter.get("/stream", streamAuth, (req: Request, res: Response) => {
  const memberId = req.memberId;
  if (!memberId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable Nginx buffering
  res.flushHeaders();

  // Send an initial ping so the client knows the connection is live
  res.write("event: connected\ndata: {}\n\n");

  // Push new notifications as they are created
  const onNotification = (notif: unknown) => {
    try {
      res.write(`event: notification\ndata: ${JSON.stringify(notif)}\n\n`);
    } catch {
      // client disconnected mid-write — handled by the close handler below
    }
  };

  activityBus.on(`notification:${memberId}`, onNotification);

  // Slack chat: subscribe to every channel linked to a project this member is
  // on. Reuses this one stream rather than opening a second EventSource, so the
  // ?token= auth path, heartbeat, and cleanup all keep working unchanged.
  //
  // Resolved ONCE at connect time: a member added to a project mid-stream sees
  // its messages only after a reconnect. Accepted — the alternative is
  // re-resolving permissions on every emit.
  let closed = false;
  const chatTopics: string[] = [];
  const onChatMessage = (payload: unknown) => {
    try {
      res.write(`event: slack-message\ndata: ${JSON.stringify(payload)}\n\n`);
    } catch {
      // client disconnected mid-write — handled by the close handler below
    }
  };

  void (async () => {
    try {
      const member = await prisma.member.findUnique({
        where: { id: memberId },
        select: { isAdmin: true },
      });
      const memberships = await prisma.projectMember.findMany({
        where: { memberId },
        select: { projectId: true },
      });
      const projectScope = member?.isAdmin
        ? {}
        : { id: { in: memberships.map((m) => m.projectId) } };

      // Same channel union as the read API (projectChatAccess), so a channel
      // that is readable is also live.
      const projects = await prisma.project.findMany({
        where: projectScope,
        select: {
          slackChannelId: true,
          slackChannel: true,
          notificationTargets: { select: { slackChannelId: true } },
        },
      });

      const ids = new Set<string>();
      for (const p of projects) {
        for (const id of unionChannelIds(p.notificationTargets, p)) ids.add(id);
      }

      // The client may have disconnected while we were querying; the close
      // handler has already run, so subscribing now would leak the listeners.
      if (closed) return;
      for (const id of ids) {
        const topic = `slack-chat:${id}`;
        chatTopics.push(topic);
        activityBus.on(topic, onChatMessage);
      }
    } catch (err) {
      console.error("[sse] failed to subscribe chat topics:", err);
    }
  })();

  // Heartbeat every 30s to keep the connection alive through proxies
  const heartbeat = setInterval(() => {
    try {
      res.write(": heartbeat\n\n");
    } catch {
      clearInterval(heartbeat);
    }
  }, 30_000);

  // Clean up when the client disconnects
  req.on("close", () => {
    clearInterval(heartbeat);
    activityBus.off(`notification:${memberId}`, onNotification);
    closed = true;
    for (const topic of chatTopics) activityBus.off(topic, onChatMessage);
    res.end();
  });
});
